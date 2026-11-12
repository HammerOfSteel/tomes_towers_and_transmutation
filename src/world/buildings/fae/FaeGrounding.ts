import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import type { OctagonFace } from '../StoneTowerShape';
import { facePointAt } from '../StoneTowerShape';
import { buildPlinthCourses, type CourseLoopPoint } from '../kit/StringCourse';
import { depthFor } from '../kit/DepthLadder';
import { mergeGroupMeshesByMaterial } from '../../../scene/MeshMergeUtils';

/**
 * FaeGrounding.ts — fae ground-contact kit module (doctrine Rule 6;
 * design spec `2026-09-04-fae-buildings-design.md`: "root-flare
 * foundations" — the stump/trunk walls should look like they GREW out of
 * the ground, roots flaring outward and diving back into the earth,
 * rather than sitting on a flat masonry plinth). Mirrors the structural
 * shape of `VulperiaGrounding.ts` (low coursed plinth + footprint-hugging
 * skirt + optional entry steps) but replaces the earth-berm/grass-cap
 * duo with a genuinely ROOT-SHAPED skirt: tapered root-toe wedges
 * (thick where they meet the wall, tapering and diving as they run
 * outward) plus scattered moss pads and embedded stones for the
 * "damp fungal-forest floor" value contrast the design doc calls for
 * (a dark green/brown accent kept deliberately distinct from the
 * building's own pastel cap/trim hues, so the whole assembly doesn't
 * collapse into one candy-colored blob).
 *
 * Every mesh is a stock `THREE.CylinderGeometry`/`BoxGeometry`/
 * `DodecahedronGeometry` (all always UV-complete), specifically avoiding
 * the hand-rolled-`BufferGeometry` merge-drop bug class documented in
 * `MeshMergeUtils.ts`.
 */
export interface FaeGroundingOptions {
  points: CourseLoopPoint[];
  rootMaterial: THREE.Material;
  mossMaterial: THREE.Material;
  stoneMaterial: THREE.Material;
  /** Number of stepped root-toe plinth courses. Default 1 (fae stumps sit low). */
  plinthLevels?: number;
  /** World-unit height of each plinth course. Default 0.16. */
  plinthCourseHeight?: number;
  /** How far the root flare spills out past the footprint edge. Default 0.36. */
  rootMargin?: number;
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

/** Builds the root-toe flare: tapered cylinder wedges (thick radius where
 * they meet the wall base, tapering to a thin buried tip) running
 * outward and dipping down into grade, so the flare genuinely reads as
 * roots diving into earth rather than a flat masonry apron. */
function buildRootFlare(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
  plinthHeight: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-root-flare';
  const rand = mulberry32((seed ^ 0x524f_4f54) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const rootCount = Math.max(10, Math.round(perimeter * 2.2));

  for (let i = 0; i < rootCount; i++) {
    const t = i / rootCount;
    const edgeIndex = Math.floor(t * pts.length);
    const edgeT = t * pts.length - edgeIndex;
    const [ax, az] = pts[edgeIndex]!;
    const [bx, bz] = pts[(edgeIndex + 1) % pts.length]!;
    const baseX = ax + (bx - ax) * edgeT;
    const baseZ = az + (bz - az) * edgeT;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dz / len;
    const nz = -dx / len;

    const rootLength = margin * (0.75 + rand() * 0.55);
    const rootRadiusTop = plinthHeight * (0.42 + rand() * 0.22);
    const rootRadiusTip = rootRadiusTop * 0.28;
    const dive = plinthHeight * (0.55 + rand() * 0.35);

    // A tapered cylinder standing in for a root toe: local +Y axis runs
    // from the wide wall-end tip to the thin buried tip, then rotated to
    // lie mostly horizontal (radiating outward) with a downward tilt.
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(rootRadiusTip, rootRadiusTop, rootLength, 6, 1),
      material,
    );
    root.name = `root-toe-${i}`;

    const outAngle = Math.atan2(nx, nz);
    const jitterAngle = (rand() - 0.5) * 0.3;
    const tiltDown = Math.atan2(dive, rootLength);

    // Lay the cylinder on its side pointing outward (rotate local +Y to
    // world horizontal-outward), then tip the outer end downward.
    root.rotation.order = 'YXZ';
    root.rotation.y = outAngle + jitterAngle;
    root.rotation.z = Math.PI / 2 - tiltDown;

    const midOut = rootLength * 0.5 * Math.cos(tiltDown);
    root.position.set(
      baseX + nx * midOut,
      -dive * 0.5 - plinthHeight * 0.1,
      baseZ + nz * midOut,
    );
    root.castShadow = true;
    root.receiveShadow = true;
    group.add(root);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

/** Scattered flattened moss pads hugging the root flare's outer edge —
 * the damp forest-floor value-contrast accent (a deliberately dark
 * green, distinct from the building's own pastel cap/trim hues). */
function buildMossPads(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-moss-pads';
  const rand = mulberry32((seed ^ 0x4d4f_5353) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const padCount = Math.max(8, Math.round(perimeter * 1.4));

  for (let i = 0; i < padCount; i++) {
    const t = i / padCount;
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
    const outset = margin * (0.5 + rand() * 0.6);
    const radius = margin * (0.14 + rand() * 0.12);
    const padHeight = 0.02 + rand() * 0.015;

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, padHeight, 8), material);
    pad.name = `moss-pad-${i}`;
    pad.position.set(midX + nx * outset, -padHeight * 0.5, midZ + nz * outset);
    pad.scale.set(1, 1, 0.7 + rand() * 0.3);
    pad.rotation.y = rand() * Math.PI;
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}

/** Small embedded stones scattered through the root flare/moss pads —
 * another distinct value/texture note against the bark and moss. */
function buildEmbeddedStones(
  points: CourseLoopPoint[],
  material: THREE.Material,
  seed: number,
  margin: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-embedded-stones';
  const rand = mulberry32((seed ^ 0x53544f_4e) >>> 0);
  const pts = points.map(toXZ);
  const perimeter = perimeterOf(points);
  const stoneCount = Math.max(6, Math.round(perimeter * 1.1));

  for (let i = 0; i < stoneCount; i++) {
    const t = i / stoneCount;
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
    const outset = margin * (0.35 + rand() * 0.65);
    const size = margin * (0.09 + rand() * 0.07);

    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
    stone.name = `embedded-stone-${i}`;
    stone.position.set(midX + nx * outset, -size * 0.4, midZ + nz * outset);
    stone.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
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
  group.name = 'fae-front-steps';
  const [cx, cz] = facePointAt(face, 0.5);
  const dx = face.b[0] - face.a[0];
  const dz = face.b[1] - face.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const outNx = dz / len;
  const outNz = -dx / len;
  const stepDepth = 0.28;
  const stepHeight = 0.12;

  for (let i = 0; i < stepCount; i++) {
    const treadWidth = stepWidth + i * 0.22;
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

export function buildFaeGrounding(options: FaeGroundingOptions): THREE.Group {
  const {
    points, rootMaterial, mossMaterial, stoneMaterial,
    plinthLevels = 1, plinthCourseHeight = 0.16, rootMargin = 0.36,
    seed = 0, stepsFace, stepCount = 3, stepWidth = 0.85,
  } = options;

  const group = new THREE.Group();
  group.name = 'fae-grounding';

  const plinth = buildPlinthCourses(points, rootMaterial, plinthLevels, {
    height: plinthCourseHeight,
    proudDepth: depthFor('TRIM'),
  });
  plinth.name = 'fae-plinth-course';
  group.add(plinth);

  group.add(buildRootFlare(points, rootMaterial, seed, rootMargin, plinthCourseHeight * 1.5));
  group.add(buildMossPads(points, mossMaterial, seed, rootMargin));
  group.add(buildEmbeddedStones(points, stoneMaterial, seed, rootMargin));

  if (stepsFace) {
    group.add(buildFrontSteps(stepsFace, rootMaterial, stepCount, stepWidth));
  }

  return group;
}
