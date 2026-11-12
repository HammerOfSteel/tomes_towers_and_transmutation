import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';

/**
 * ThatchRoofSurface.ts — human roofing kit module (docs/superpowers/specs/
 * 2026-09-04-human-buildings-design.md). A genuinely new module rather than
 * an extension of `ShingleSurface.ts`: that module's tile silhouettes
 * ('rectangular' | 'diamond' | 'fishscale') are all thin, flat, individually
 * discrete tile shapes, which doesn't extend naturally to thatch's real
 * character -- thick, heavily overlapping, rounded fibrous BUNDLES stacked
 * in courses, a bulky rolled eave, and a pegged ridge cap, all read primarily
 * from silhouette/relief rather than tile-edge pattern.
 *
 * Coordinate convention matches `ShingleSurface.ts`: local X spans the panel
 * width (centered), local Y climbs the slope from 0 (eave) to `slopeLength`
 * (ridge), local Z is the outward relief/protrusion direction. Every mesh
 * uses stock `THREE.CylinderGeometry`/`THREE.ConeGeometry` (both always
 * UV-complete) so this module can never trigger the uv-attribute merge-drop
 * bug class documented in `MeshMergeUtils.ts`.
 */
export interface ThatchRoofSurfaceOptions {
  /** World-unit rise per stacked course band. Default 0.3. */
  bandHeight?: number;
  /** 0-1 fraction of per-bundle size/position jitter. Default 0.18. */
  jitter?: number;
  /** Radius (world units) of the thick rolled eave course. Must stay
   * above the doctrine's readability floor; default 0.22 (> 0.15 min). */
  eaveRadius?: number;
  /** Approximate number of loose straw wisps per square WU of roof
   * surface. Default tuned so a typical roof panel emits >= 40. */
  wispDensity?: number;
  /** Optional distinct material for the ridge-cap pegs (default: same
   * material as the thatch itself, matching ShingleSurface's usual
   * single-material contract unless a caller wants contrast). */
  pegMaterial?: THREE.Material;
}

const DEFAULT_BAND_HEIGHT = 0.3;
const DEFAULT_JITTER = 0.18;
const DEFAULT_EAVE_RADIUS = 0.22;
const MIN_EAVE_RADIUS = 0.09; // -> > 0.15 WU eave thickness (2x radius)
const DEFAULT_WISP_DENSITY = 6; // wisps per square WU
const MIN_WISP_COUNT = 40;
const BAND_RADIUS_RATIO = 0.85; // bundle radius as a fraction of bandHeight -- bulges past the course above
const BUNDLE_SEGMENTS_PER_WU = 2.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** One straw bundle: a horizontal cylinder (axis along local X), rotated
 * so its round cross-section faces the viewer -- a real bulging solid,
 * never a flat plane standing in for the readable roof-course silhouette. */
function makeBundle(length: number, radius: number, material: THREE.Material, name: string): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.05), 8, 1, false);
  geo.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** One loose straw wisp: a thin tapered cone, angled and jittered so the
 * surface reads as fibrous rather than a smooth cylinder field. */
function makeWisp(length: number, radius: number, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 5), material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a full thatch roof-slope surface: stacked scalloped straw-bundle
 * courses, a thick rolled eave, a pegged ridge cap, gable-edge verge
 * bundles, and a scatter of loose straw wisps for fibrous surface texture.
 */
export function buildThatchRoofSurface(
  width: number,
  slopeLength: number,
  seed: number,
  material: THREE.Material,
  opts: ThatchRoofSurfaceOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'thatch-roof-surface';

  const bandHeight = Math.max(0.12, opts.bandHeight ?? DEFAULT_BAND_HEIGHT);
  const jitter = clamp(opts.jitter ?? DEFAULT_JITTER, 0, 1);
  const eaveRadius = Math.max(MIN_EAVE_RADIUS, opts.eaveRadius ?? DEFAULT_EAVE_RADIUS);
  const wispDensity = Math.max(0.5, opts.wispDensity ?? DEFAULT_WISP_DENSITY);
  const pegMaterial = opts.pegMaterial ?? material;
  const rand = mulberry32(seed >>> 0);

  const bandRadius = bandHeight * BAND_RADIUS_RATIO;
  const courseCount = Math.max(2, Math.round(slopeLength / bandHeight));
  const actualBandHeight = slopeLength / courseCount;

  // --- Stacked scalloped courses -----------------------------------
  const bandsGroup = new THREE.Group();
  bandsGroup.name = 'bands';
  const segmentsPerCourse = Math.max(3, Math.round(width * BUNDLE_SEGMENTS_PER_WU));
  const segmentSpan = width / segmentsPerCourse;
  for (let course = 0; course < courseCount; course++) {
    const courseGroup = new THREE.Group();
    courseGroup.name = `course-${course}`;
    const rowOffset = course % 2 === 1 ? segmentSpan * 0.5 : 0;
    const y = course * actualBandHeight;
    for (let i = -1; i <= segmentsPerCourse; i++) {
      const x = -width / 2 + segmentSpan * i + segmentSpan / 2 + rowOffset;
      if (x < -width / 2 - segmentSpan * 0.5 || x > width / 2 + segmentSpan * 0.5) continue;
      const lenJ = 1 + (rand() - 0.5) * jitter;
      const radJ = 1 + (rand() - 0.5) * jitter * 0.6;
      const yJ = (rand() - 0.5) * actualBandHeight * jitter * 0.3;
      const mesh = makeBundle(segmentSpan * 1.08 * lenJ, bandRadius * radJ, material, `bundle-${course}-${i}`);
      mesh.position.set(clamp(x, -width / 2, width / 2), y + yJ, bandRadius * 0.55);
      courseGroup.add(mesh);
    }
    bandsGroup.add(courseGroup);
    mergeGroupMeshesByMaterial(courseGroup);
  }
  group.add(bandsGroup);

  // --- Thick rolled eave, along the bottom (y = 0) edge -------------
  const eaveGroup = new THREE.Group();
  eaveGroup.name = 'eave-roll';
  const eaveSegments = Math.max(3, Math.round(width / (eaveRadius * 2.4)));
  const eaveSpan = width / eaveSegments;
  for (let i = 0; i < eaveSegments; i++) {
    const x = -width / 2 + eaveSpan * (i + 0.5);
    const jr = 1 + (rand() - 0.5) * jitter * 0.4;
    const mesh = makeBundle(eaveSpan * 1.12, eaveRadius * jr, material, `eave-${i}`);
    mesh.position.set(x, -actualBandHeight * 0.1, eaveRadius * 0.7);
    eaveGroup.add(mesh);
  }
  group.add(eaveGroup);
  mergeGroupMeshesByMaterial(eaveGroup);

  // --- Pegged ridge cap, straddling the top (y = slopeLength) edge --
  const ridgeGroup = new THREE.Group();
  ridgeGroup.name = 'ridge-cap';
  const ridgeRadius = bandRadius * 1.1;
  const ridgeSegments = Math.max(3, Math.round(width / (ridgeRadius * 2.4)));
  const ridgeSpan = width / ridgeSegments;
  const ridgeCapGroup = new THREE.Group();
  ridgeCapGroup.name = 'ridge-bundles';
  for (let i = 0; i < ridgeSegments; i++) {
    const x = -width / 2 + ridgeSpan * (i + 0.5);
    const mesh = makeBundle(ridgeSpan * 1.1, ridgeRadius, material, `ridge-bundle-${i}`);
    mesh.position.set(x, slopeLength, ridgeRadius * 0.9);
    ridgeCapGroup.add(mesh);
  }
  ridgeGroup.add(ridgeCapGroup);
  mergeGroupMeshesByMaterial(ridgeCapGroup);

  // Wooden pegs ("spars"/liggers) crossing the ridge bundle diagonally at
  // intervals, pinning it down -- real, distinct geometry, not implied by
  // the ridge bundle's own silhouette.
  const pegCount = Math.max(2, Math.round(width / 0.6));
  for (let i = 0; i < pegCount; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / pegCount;
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, ridgeRadius * 2.6, 5), pegMaterial);
    peg.name = `peg-${i}`;
    peg.position.set(x, slopeLength, ridgeRadius * 0.9);
    peg.rotation.z = Math.PI / 2 + (i % 2 === 0 ? 0.55 : -0.55);
    peg.castShadow = peg.receiveShadow = true;
    ridgeGroup.add(peg);
  }
  group.add(ridgeGroup);

  // --- Verge trim, along both gable (left/right) edges --------------
  const vergeGroup = new THREE.Group();
  vergeGroup.name = 'verge';
  const vergeRadius = bandRadius * 0.8;
  const vergeSegCount = Math.max(2, Math.round(slopeLength / (vergeRadius * 2.4)));
  const vergeSpan = slopeLength / vergeSegCount;
  for (const side of [-1, 1] as const) {
    const edgeGroup = new THREE.Group();
    edgeGroup.name = side < 0 ? 'verge-left' : 'verge-right';
    for (let i = 0; i < vergeSegCount; i++) {
      const y = vergeSpan * (i + 0.5);
      const mesh = makeBundle(vergeSpan * 1.1, vergeRadius, material, `verge-${side < 0 ? 'l' : 'r'}-${i}`);
      mesh.rotation.z = Math.PI / 2; // realign bundle length along Y (slope direction) instead of X
      mesh.position.set((side * width) / 2, y, vergeRadius * 0.6);
      edgeGroup.add(mesh);
    }
    vergeGroup.add(edgeGroup);
    mergeGroupMeshesByMaterial(edgeGroup);
  }
  group.add(vergeGroup);

  // --- Loose straw wisps: fibrous surface texture scattered across the
  // whole slope, always emitting at least the doctrine-driven minimum.
  const wispsGroup = new THREE.Group();
  wispsGroup.name = 'wisps';
  const area = Math.max(width * slopeLength, 1);
  const wispCount = Math.max(MIN_WISP_COUNT, Math.round(area * wispDensity));
  for (let i = 0; i < wispCount; i++) {
    const x = (rand() - 0.5) * width * 0.96;
    const y = rand() * slopeLength;
    const len = 0.08 + rand() * 0.1;
    const rad = 0.012 + rand() * 0.01;
    const wisp = makeWisp(len, rad, material, `wisp-${i}`);
    wisp.position.set(x, y, bandRadius * 1.05 + rand() * 0.04);
    wisp.rotation.x = (rand() - 0.5) * 1.1;
    wisp.rotation.z = (rand() - 0.5) * 1.1;
    wispsGroup.add(wisp);
  }
  group.add(wispsGroup);

  return group;
}

// ---------------------------------------------------------------------
// Whole-roof composer: a full steep thatch gable roof over a rectangular
// hall, reusing `buildThatchRoofSurface()` for both slopes. Mirrors
// `RoofMassing.ts`'s `buildGableRoofAssembly()` basis-placement math (two
// slopes hung off the ridge line + double-sided gable-end triangles) but
// swaps in thatch bundle courses instead of `ShingleSurface.ts` tile
// courses -- kept as its own self-contained composer (matching
// `kit/TurfRoof.ts`'s precedent of a fully self-sufficient roof system)
// rather than bolting a surface-builder callback onto `RoofMassing.ts`.
// ---------------------------------------------------------------------

export interface ThatchGableRoofOptions extends ThatchRoofSurfaceOptions {
  /** Extra fraction of halfWidth the eave projects past the wall face,
   * satisfying the doctrine's thick "eaves 0.35-0.5 WU" requirement.
   * Default 0.22. */
  eaveOverhangFrac?: number;
}

function setThatchBasis(group: THREE.Group, origin: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3): void {
  const x = xAxis.clone().normalize();
  const y = yAxis.clone().normalize();
  const z = x.clone().cross(y).normalize();
  const matrix = new THREE.Matrix4().makeBasis(x, y, z);
  group.position.copy(origin);
  group.setRotationFromMatrix(matrix);
}

/** Builds a complete steep-pitched thatch gable roof over a rectangular
 * hall: two full `buildThatchRoofSurface()` slopes (each already carrying
 * its own eave roll / pegged ridge cap / verge trim / wisps), plus solid
 * gable-end triangle closures on both ends. */
export function buildThatchGableRoof(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  opts: ThatchGableRoofOptions = {},
): THREE.Group {
  const roof = new THREE.Group();
  roof.name = 'thatch-gable-roof';

  const innerHalfWidth = Math.max(halfWidth, 0.3);
  const innerHalfDepth = Math.max(halfDepth, 0.3);
  const height = Math.max(ridgeHeight, innerHalfWidth * 0.6);
  const overhangFrac = Math.max(opts.eaveOverhangFrac ?? 0.22, 0);
  const outerHalfWidth = innerHalfWidth * (1 + overhangFrac);
  const depth = innerHalfDepth * 2;
  const slopeLength = Math.hypot(outerHalfWidth, height);

  const eastSlope = buildThatchRoofSurface(depth, slopeLength, (seed ^ 0x7841_4245) >>> 0, material, opts);
  eastSlope.name = 'thatch-slope-east';
  setThatchBasis(
    eastSlope,
    new THREE.Vector3(outerHalfWidth, 0, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-outerHalfWidth / slopeLength, height / slopeLength, 0),
  );
  roof.add(eastSlope);

  const westSlope = buildThatchRoofSurface(depth, slopeLength, (seed ^ 0x7841_4246) >>> 0, material, opts);
  westSlope.name = 'thatch-slope-west';
  setThatchBasis(
    westSlope,
    new THREE.Vector3(-outerHalfWidth, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(outerHalfWidth / slopeLength, height / slopeLength, 0),
  );
  roof.add(westSlope);

  const gableGeometry = (sign: 1 | -1): THREE.BufferGeometry => {
    const positions = new Float32Array([
      -outerHalfWidth, 0, sign * innerHalfDepth,
      outerHalfWidth, 0, sign * innerHalfDepth,
      0, height, sign * innerHalfDepth,
      -outerHalfWidth, 0, sign * innerHalfDepth,
      0, height, sign * innerHalfDepth,
      outerHalfWidth, 0, sign * innerHalfDepth,
    ]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  };

  for (const [name, sign] of [['gable-end-front', 1], ['gable-end-back', -1]] as const) {
    const mesh = new THREE.Mesh(gableGeometry(sign), material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    roof.add(mesh);
  }

  return roof;
}
