import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import type { OctagonFace } from '../StoneTowerShape';
import { facePointAt } from '../StoneTowerShape';
import { buildPlinthCourses, type CourseLoopPoint } from './StringCourse';
import { depthFor } from './DepthLadder';
import { mergeGroupMeshesByMaterial } from '../../../scene/MeshMergeUtils';

/**
 * RockPlinthSkirt.ts — dwarven ground-contact kit module (doctrine Rule 6).
 *
 * Wraps the shared `buildPlinthCourses()` stepped-course plinth with a
 * scattered rubble/soil skirt hugging the footprint, optional door-facing
 * steps, and an optional rear "rock cheek" mound (used where a building is
 * dug into a slope). Every mesh here uses stock `THREE.BoxGeometry`
 * (always UV-complete) specifically to avoid the hand-rolled-`BufferGeometry`
 * merge-drop bug class documented in `MeshMergeUtils.ts`.
 */
export interface RockPlinthSkirtOptions {
  points: CourseLoopPoint[];
  material: THREE.Material;
  /** Number of stepped plinth courses. Default 2. */
  plinthLevels?: number;
  /** World-unit height of each plinth course. Default 0.16. */
  plinthCourseHeight?: number;
  /** How far the rubble skirt is allowed to spill out past the footprint edge. Default 0.16. */
  skirtMargin?: number;
  /** Approximate rubble chunk count per running unit of perimeter. Default 2.2. */
  chunkDensity?: number;
  seed?: number;
  /** Facade face the entry steps should sit in front of. Required to emit steps. */
  stepsFace?: OctagonFace;
  stepCount?: number;
  stepWidth?: number;
  rearRockCheek?: boolean;
  rearCheekFace?: OctagonFace;
}

function toXZ(point: CourseLoopPoint): [number, number] {
  return point instanceof THREE.Vector2 ? [point.x, point.y] : point;
}

function perimeterOf(points: CourseLoopPoint[]): number {
  const pts = points.map(toXZ);
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % pts.length]!;
    total += Math.hypot(bx - ax, bz - az);
  }
  return total;
}

function buildRubbleChunk(rand: () => number, baseSize: number, material: THREE.Material): THREE.Mesh {
  const w = baseSize * (0.7 + rand() * 0.6);
  const h = baseSize * (0.45 + rand() * 0.5);
  const d = baseSize * (0.7 + rand() * 0.6);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.rotation.y = rand() * Math.PI * 2;
  mesh.rotation.x = (rand() - 0.5) * 0.3;
  mesh.rotation.z = (rand() - 0.5) * 0.3;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildRubbleSkirt(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
  chunkDensity: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rubble-skirt';
  const rand = mulberry32((seed ^ 0x524f_434b) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const chunkCount = Math.max(6, Math.round(perimeter * chunkDensity));
  const baseSize = Math.max(0.08, margin * 0.6);

  for (let i = 0; i < chunkCount; i++) {
    const t = i / chunkCount;
    const edgeIndex = Math.floor(t * pts.length);
    const edgeT = t * pts.length - edgeIndex;
    const [ax, az] = pts[edgeIndex]!;
    const [bx, bz] = pts[(edgeIndex + 1) % pts.length]!;
    const midX = ax + (bx - ax) * edgeT;
    const midZ = az + (bz - az) * edgeT;
    // Outward normal for a CCW loop: perpendicular to the edge direction.
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;
    const outset = margin * (0.25 + rand() * 0.7);
    const chunk = buildRubbleChunk(rand, baseSize, material);
    chunk.position.set(midX + nx * outset, -baseSize * 0.18 + rand() * baseSize * 0.15, midZ + nz * outset);
    group.add(chunk);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

function buildFrontSteps(
  face: OctagonFace,
  material: THREE.Material,
  stepCount: number,
  stepWidth: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'front-steps';
  const [cx, cz] = facePointAt(face, 0.5);
  const dx = face.b[0] - face.a[0];
  const dz = face.b[1] - face.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const outNx = dz / len;
  const outNz = -dx / len;
  const stepDepth = 0.28;
  const stepHeight = 0.14;

  for (let i = 0; i < stepCount; i++) {
    // Step 0 is the topmost/nearest tread (against the plinth), higher index
    // steps move outward and drop down toward grade.
    const treadWidth = stepWidth + i * 0.22;
    const outOffset = stepDepth * (i + 0.5);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(treadWidth, stepHeight, stepDepth), material);
    mesh.position.set(
      cx + outNx * outOffset,
      -stepHeight * (i + 0.5),
      cz + outNz * outOffset,
    );
    mesh.name = `step-${i}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

function buildRearRockCheek(face: OctagonFace, material: THREE.Material, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rear-rock-cheek';
  const rand = mulberry32((seed ^ 0x4348_454b) >>> 0);
  const [cx, cz] = facePointAt(face, 0.5);
  const dx = face.b[0] - face.a[0];
  const dz = face.b[1] - face.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const outNx = dz / len;
  const outNz = -dx / len;

  for (let i = 0; i < 5; i++) {
    const jitterAlong = (rand() - 0.5) * len * 0.7;
    const alongX = -dz / len;
    const alongZ = dx / len;
    const outset = 0.18 + rand() * 0.22;
    const chunk = buildRubbleChunk(rand, 0.3 + rand() * 0.2, material);
    chunk.position.set(
      cx + outNx * outset + alongX * jitterAlong,
      rand() * 0.15,
      cz + outNz * outset + alongZ * jitterAlong,
    );
    group.add(chunk);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

export function buildRockPlinthSkirt(options: RockPlinthSkirtOptions): THREE.Group {
  const {
    points,
    material,
    plinthLevels = 2,
    plinthCourseHeight = 0.16,
    skirtMargin = 0.16,
    chunkDensity = 2.2,
    seed = 0,
    stepsFace,
    stepCount = 3,
    stepWidth = 0.9,
    rearRockCheek = false,
    rearCheekFace,
  } = options;

  const group = new THREE.Group();
  group.name = 'rock-plinth-skirt';

  const plinth = buildPlinthCourses(points, material, plinthLevels, {
    height: plinthCourseHeight,
    proudDepth: depthFor('TRIM'),
  });
  plinth.name = 'plinth-course';
  group.add(plinth);

  group.add(buildRubbleSkirt(points, material, seed, skirtMargin, chunkDensity));

  if (stepsFace) {
    group.add(buildFrontSteps(stepsFace, material, stepCount, stepWidth));
  }

  if (rearRockCheek && rearCheekFace) {
    group.add(buildRearRockCheek(rearCheekFace, material, seed));
  }

  return group;
}
