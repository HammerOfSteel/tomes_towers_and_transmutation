import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import type { OctagonFace } from '../StoneTowerShape';
import { facePointAt } from '../StoneTowerShape';
import { buildPlinthCourses, type CourseLoopPoint } from '../kit/StringCourse';
import { depthFor } from '../kit/DepthLadder';
import { mergeGroupMeshesByMaterial } from '../../../scene/MeshMergeUtils';

/**
 * VulperiaGrounding.ts — vulperia ground-contact kit module (doctrine
 * Rule 6, design spec `2026-09-04-vulperia-buildings-design.md`: "a
 * rigorous berm/skirt at every terrain contact"). Follows the same
 * pattern as dwarven's `RockPlinthSkirt.ts` (low coursed plinth + a
 * scattered skirt hugging the footprint + optional entry steps), but
 * replaces dwarven's angular bare-rock rubble skirt with a grass-topped
 * EARTH BERM: a stepped, sloped mound of earth-toned blocks banked
 * against the low stone plinth, capped by a thin grass-toned course at
 * its outer crest — reading as packed turf mounded against the wall,
 * matching the fox-folk warren's "buildings tucked into grassland/
 * savanna earth" language, distinct from dwarven's bare stone-scree look.
 *
 * Every mesh here is a stock `THREE.BoxGeometry` (always UV-complete),
 * specifically avoiding the hand-rolled-`BufferGeometry` merge-drop bug
 * class documented in `MeshMergeUtils.ts`.
 */
export interface VulperiaGroundingOptions {
  points: CourseLoopPoint[];
  stoneMaterial: THREE.Material;
  earthMaterial: THREE.Material;
  grassMaterial: THREE.Material;
  /** Number of stepped stone plinth courses. Default 1 (vulperia walls sit low). */
  plinthLevels?: number;
  /** World-unit height of each plinth course. Default 0.14. */
  plinthCourseHeight?: number;
  /** How far the earth berm mound spills out past the footprint edge. Default 0.32. */
  bermMargin?: number;
  seed?: number;
  stepsFace?: OctagonFace;
  stepCount?: number;
  stepWidth?: number;
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

/** Builds a stepped, sloped earth mound hugging the footprint: several
 * short overlapping blocks per edge segment that lower in height as they
 * spill outward, so the berm genuinely SLOPES down to grade rather than
 * reading as a flat-topped ring. */
function buildEarthBerm(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
  plinthHeight: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-earth-berm';
  const rand = mulberry32((seed ^ 0x5675_4c50) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const segmentCount = Math.max(10, Math.round(perimeter * 2.4));
  const tiers = 3;

  for (let i = 0; i < segmentCount; i++) {
    const t = i / segmentCount;
    const edgeIndex = Math.floor(t * pts.length);
    const edgeT = t * pts.length - edgeIndex;
    const [ax, az] = pts[edgeIndex]!;
    const [bx, bz] = pts[(edgeIndex + 1) % pts.length]!;
    const midX = ax + (bx - ax) * edgeT;
    const midZ = az + (bz - az) * edgeT;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;
    const segWidth = (perimeter / segmentCount) * 1.6;

    for (let tier = 0; tier < tiers; tier++) {
      const tierT = tier / (tiers - 1);
      const outset = margin * (0.15 + tierT * 0.85) + (rand() - 0.5) * margin * 0.15;
      const tierHeight = Math.max(0.03, plinthHeight * (1 - tierT * 0.75) * (0.85 + rand() * 0.25));
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(segWidth * (0.85 + rand() * 0.3), tierHeight, segWidth * (0.65 + rand() * 0.3)),
        material,
      );
      chunk.name = `berm-tier-${tier}-${i}`;
      chunk.position.set(
        midX + nx * outset,
        -tierHeight * 0.5 - tier * 0.015,
        midZ + nz * outset,
      );
      chunk.rotation.y = Math.atan2(nx, nz) + (rand() - 0.5) * 0.25;
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      group.add(chunk);
    }
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

/** A thin grass-toned cap course sitting on the berm's outer crest —
 * the "grass mounded against the wall" read, distinct from the earth
 * body beneath it. */
function buildGrassBermCap(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-grass-berm-cap';
  const rand = mulberry32((seed ^ 0x4752_4153) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const segmentCount = Math.max(8, Math.round(perimeter * 1.6));

  for (let i = 0; i < segmentCount; i++) {
    const t = i / segmentCount;
    const edgeIndex = Math.floor(t * pts.length);
    const edgeT = t * pts.length - edgeIndex;
    const [ax, az] = pts[edgeIndex]!;
    const [bx, bz] = pts[(edgeIndex + 1) % pts.length]!;
    const midX = ax + (bx - ax) * edgeT;
    const midZ = az + (bz - az) * edgeT;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;
    const segWidth = (perimeter / segmentCount) * 1.5;
    const outset = margin * (0.55 + rand() * 0.35);
    const capHeight = 0.035 + rand() * 0.02;

    const cap = new THREE.Mesh(new THREE.BoxGeometry(segWidth, capHeight, segWidth * 0.7), material);
    cap.name = `berm-cap-${i}`;
    cap.position.set(midX + nx * outset, -0.01, midZ + nz * outset);
    cap.rotation.y = Math.atan2(nx, nz) + (rand() - 0.5) * 0.3;
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
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
  group.name = 'vulperia-front-steps';
  const [cx, cz] = facePointAt(face, 0.5);
  const dx = face.b[0] - face.a[0];
  const dz = face.b[1] - face.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const outNx = dz / len;
  const outNz = -dx / len;
  const stepDepth = 0.3;
  const stepHeight = 0.13;

  for (let i = 0; i < stepCount; i++) {
    const treadWidth = stepWidth + i * 0.24;
    const outOffset = stepDepth * (i + 0.5);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(treadWidth, stepHeight, stepDepth), material);
    mesh.position.set(cx + outNx * outOffset, -stepHeight * (i + 0.5), cz + outNz * outOffset);
    mesh.name = `step-${i}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

export function buildVulperiaGrounding(options: VulperiaGroundingOptions): THREE.Group {
  const {
    points, stoneMaterial, earthMaterial, grassMaterial,
    plinthLevels = 1, plinthCourseHeight = 0.14, bermMargin = 0.32,
    seed = 0, stepsFace, stepCount = 3, stepWidth = 0.85,
  } = options;

  const group = new THREE.Group();
  group.name = 'vulperia-grounding';

  const plinth = buildPlinthCourses(points, stoneMaterial, plinthLevels, {
    height: plinthCourseHeight,
    proudDepth: depthFor('TRIM'),
  });
  plinth.name = 'vulperia-plinth-course';
  group.add(plinth);

  group.add(buildEarthBerm(points, earthMaterial, seed, bermMargin, plinthCourseHeight * 1.4));
  group.add(buildGrassBermCap(points, grassMaterial, seed, bermMargin));

  if (stepsFace) {
    group.add(buildFrontSteps(stepsFace, stoneMaterial, stepCount, stepWidth));
  }

  return group;
}
