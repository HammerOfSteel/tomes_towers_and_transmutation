/**
 * DwarvenBuildingKit.ts — composes all eight canonical dwarven building
 * kinds (docs/superpowers/specs/2026-09-04-dwarven-buildings-design.md)
 * from the shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`) plus
 * the race-specific `DwarvenMaterials.ts`/`DwarvenOpenings.ts` presets.
 *
 * Every builder follows the doctrine (docs/superpowers/specs/
 * 2026-09-04-modular-building-kit-doctrine.md): a real depth ladder (no
 * coplanar surfaces), the five-piece opening minimum on every door/window,
 * and zero blob/box placeholder openings or back-geometry.
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from '../BuildingDNA';
import { getFootprint } from '../BuildingDNA';
import {
  rectanglePoints,
  rectangleFaces,
  facePointAt,
  type OctagonFace,
} from '../StoneTowerShape';
import { buildWallSurfaceBlocks, type WallBlockOptions } from '../StoneTowerWallSurface';
import { buildFloorCap } from '../StoneTowerFloorCap';
import { buildQuoins } from '../StoneTowerQuoins';
import { buildGableRoof, buildHipRoof, type RoofMassingOptions } from '../kit/RoofMassing';
import { buildRockPlinthSkirt } from '../kit/RockPlinthSkirt';
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import { buildChevronBelt, buildShieldPlaque, buildXLatticePanel, buildCorbelRow } from '../kit/AngularOrnament';
import { buildDwarvenPalette, type DwarvenPalette } from './DwarvenMaterials';
import { buildDwarvenWindow, buildDwarvenDoor, buildDwarvenVentSlit, type DwarvenOpeningPalette } from './DwarvenOpenings';

/** Turns a short ASCII tag (e.g. 'HOUS') into a seed-mixing constant, so
 * every private helper below gets its own independent, deterministic RNG
 * stream from the same building seed without magic hex literals scattered
 * throughout the file (matching ElvenChapelKit.ts's own `dna.seed ^ 0x...`
 * convention, just generalized to arbitrary tags). */
function tagSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}

/** Picks one of `options` using cumulative weights (need not sum to 1). */
function pickWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r <= 0) return value;
  }
  return options[options.length - 1]![0];
}

/**
 * Rotates + positions `obj` (a window/door/vent group built with its own
 * local Z baked at the exact perpendicular distance from the hall's own
 * center to `face`) onto `face` at fractional position `t` along the
 * face's own a->b segment -- the same technique as ElvenChapelKit.ts's
 * own `_placeOnFace()`, generalized for reuse across all eight kinds.
 */
function placeOnFace(obj: THREE.Object3D, face: OctagonFace, t: number): void {
  obj.rotation.y = face.normalAngle;
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  const [targetX, targetZ] = facePointAt(face, t);
  obj.position.x += targetX - midX;
  obj.position.z += targetZ - midZ;
}

/** Perpendicular distance from a rectangular hall's center to a given
 * `rectangleFaces()` face -- faces 0/2 (left/right) use `halfW`, faces
 * 1/3 (back/front) use `halfD` (see StoneTowerShape.ts's rectangleFaces()
 * doc comment for the exact winding/face-index convention). */
function wallZFor(faceIndex: number, halfW: number, halfD: number): number {
  return faceIndex === 0 || faceIndex === 2 ? halfW : halfD;
}

function toOpeningPalette(palette: DwarvenPalette): DwarvenOpeningPalette {
  return {
    stone: palette.granite,
    glazing: palette.darkGlass,
    wood: palette.wood,
    recess: palette.basalt,
    iron: palette.iron,
    forgeEmissive: palette.forgeEmissive,
  };
}

/** Builds a rectangular hall's walls (per-course blocks), quoins at its 4
 * real corners, and a flat floor cap -- the shared rectangular-mass
 * technique every kind below reuses (mirroring ElvenChapelKit.ts's own
 * `_buildNave()`, generalized to an arbitrary hall size/seed/material). */
function buildRectHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  material: THREE.Material,
  wallOpts: WallBlockOptions = {},
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // blocksPerFace is shared across every face in one call, so size it off
  // the LONGEST face (keeps that face's block length inside the design
  // spec's 0.55-0.85 WU target) -- also keeps each block's own half-width
  // comfortably inside `buildWallSurfaceBlocks()`'s known running-bond
  // corner-wraparound overhang (an alternating course's block can center
  // exactly on a rectangle corner, extending half its own width past it;
  // finer subdivision keeps that overhang small rather than "fixing" a
  // pre-existing, already-shared, already-tested kit behavior).
  const longestFace = 2 * Math.max(halfW, halfD);
  const walls = buildWallSurfaceBlocks(0, height, seed, material, {
    courseHeight: 0.38,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.7)),
    jitter: 0.04,
    ...wallOpts,
    facesOverride: wallOpts.facesOverride ?? faces,
  });
  g.add(walls);

  const quoins = buildQuoins(Math.max(halfW, halfD), height, undefined, material, points);
  quoins.name = 'dwarven-hall-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, material, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'dwarven-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Builds a low coped-parapet flat roof: a solid floor cap plus a proud
 * perimeter coping band (real boxed geometry standing +TRIM proud of the
 * wall plane, per the depth ladder) -- used by the 'parapet' roof-family
 * option shared by several kinds' variation tables. Never a bare flat
 * plane pretending to be a roof. */
function buildParapetRoof(
  points: [number, number][],
  palette: DwarvenPalette,
  copingHeight = 0.32,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'parapet-roof';

  const cap = buildFloorCap(0, palette.granite, undefined, points);
  g.add(cap);

  const copingThickness = 0.16;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, bz - az);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const angle = Math.atan2(bx - ax, bz - az);
    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(len + copingThickness, copingHeight, copingThickness),
      palette.basalt,
    );
    coping.position.set(midX, copingHeight / 2, midZ);
    coping.rotation.y = angle;
    coping.name = `coping-${i}`;
    coping.castShadow = coping.receiveShadow = true;
    g.add(coping);
  }
  return g;
}

/** Weighted roof-family pick shared by every kind's own variation table
 * (each kind supplies its own weights): 'gable' (steep stone-tile gable,
 * `buildGableRoof`), 'parapet' (coped flat terrace, `buildParapetRoof`),
 * or 'hip' (a 4-sided hip roof, used as this kit's pragmatic stand-in for
 * the design spec's "small octagonal/conical cottage cap" on near-square
 * footprints -- a true radial cone cap is out of scope for a rectangular
 * hall; a 4-sided hip silhouette reads as the same compact pavilion form). */
export type DwarvenRoofFamily = 'gable' | 'parapet' | 'hip';

function buildDwarvenRoof(
  family: DwarvenRoofFamily,
  halfW: number,
  halfD: number,
  points: [number, number][],
  ridgeHeight: number,
  seed: number,
  palette: DwarvenPalette,
): THREE.Group {
  if (family === 'parapet') return buildParapetRoof(points, palette);
  const opts: RoofMassingOptions = { shingle: { silhouette: 'rectangular' } };
  const roof = family === 'hip'
    ? buildHipRoof(halfW, halfD, ridgeHeight, seed, palette.roofTile, opts)
    : buildGableRoof(halfW, halfD, ridgeHeight, seed, palette.roofTile, opts);
  return roof;
}

/** Places a corbelled chimney stack at a rectangular hall's corner (or
 * side-wall), standing on the roof plane -- shared by every kind that
 * needs a rooftop chimney (house/inn/blacksmith/chapel-adjacent props). */
function placeChimney(
  halfW: number,
  halfD: number,
  baseY: number,
  placement: 'rear-left' | 'rear-right' | 'side-wall',
  palette: DwarvenPalette,
  seed: number,
  height = 1.3,
): THREE.Group {
  const chimney = buildCorbelledChimneyStack({
    width: 0.4,
    depth: 0.46,
    height,
    material: palette.basalt,
    collarMaterial: palette.iron,
    capMaterial: palette.basalt,
    flueMaterial: palette.soot,
    seed,
  });
  const inset = 0.55;
  switch (placement) {
    case 'rear-left':
      chimney.position.set(-halfW + inset, baseY, -halfD + inset);
      break;
    case 'rear-right':
      chimney.position.set(halfW - inset, baseY, -halfD + inset);
      break;
    case 'side-wall':
      chimney.position.set(halfW - inset * 0.3, baseY, 0);
      break;
  }
  return chimney;
}

// ─────────────────────────────────────────────────────────────────────────
// House
// ─────────────────────────────────────────────────────────────────────────

const HOUSE_STOREY_HEIGHT = 2.65;

/** Builds a compact rectangular dwarven house: a stone hall on a rock
 * plinth, a doctrine-compliant arched door + 1-2 windows + optional rear
 * vent, one of three roof families, an optional corbelled chimney, and one
 * front ornament band -- see design spec section 4 `house` for the full
 * blueprint this follows. */
export function buildDwarvenHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = HOUSE_STOREY_HEIGHT * Math.max(1, dna.floors);
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-house';

  const { group: hall, faces, points } = buildRectHall(halfW, halfD, wallHeight, tagSeed(dna.seed, 'HALL'), palette.granite);
  g.add(hall);

  // Ground system: rock plinth + rubble skirt + front steps facing the
  // entrance (face 3, +Z).
  const plinth = buildRockPlinthSkirt({
    points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: faces[3],
  });
  g.add(plinth);

  // Front door (face 3, +Z, centered).
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const door = buildDwarvenDoor({
    width: 0.95,
    height: 1.75,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5 + doorRand() * 0.15,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, faces[3]!, 0.5);
  g.add(door);

  // Side windows: one per visible side (faces 0 and 2), skipped on any
  // side flagged as a shared party wall via `dna.terrace`.
  const winRand = mulberry32(tagSeed(dna.seed, 'WIND'));
  const sideFaceIndices = [0, 2].filter((i) => {
    if (dna.terrace === 'both') return false;
    if (dna.terrace === 'left' && i === 2) return false;
    if (dna.terrace === 'right' && i === 0) return false;
    return true;
  });
  for (const fi of sideFaceIndices) {
    const win = buildDwarvenWindow({
      width: 0.45,
      height: 0.7,
      wallZ: wallZFor(fi, halfW, halfD),
      palette: openingPalette,
      archRatio: 0.5 + winRand() * 0.15,
    });
    win.name = 'dwarven-window';
    win.position.y = wallHeight * 0.42;
    placeOnFace(win, faces[fi]!, 0.5);
    g.add(win);
  }

  // Rear vent slit (0-1, per the spec's optional rear opening).
  const rearRand = mulberry32(tagSeed(dna.seed, 'REAR'));
  if (rearRand() < 0.7) {
    const vent = buildDwarvenVentSlit({
      width: 0.35,
      height: 0.5,
      wallZ: wallZFor(1, halfW, halfD),
      palette: openingPalette,
      shape: 'round',
    });
    vent.name = 'dwarven-vent';
    vent.position.y = wallHeight * 0.55;
    placeOnFace(vent, faces[1]!, 0.5);
    g.add(vent);
  }

  // Roof family: gabled 0.65 / parapet 0.20 / compact-conical(hip) 0.15.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<DwarvenRoofFamily>(roofRand, [
    ['gable', 0.65],
    ['parapet', 0.20],
    ['hip', 0.15],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.1;
  const roof = buildDwarvenRoof(roofFamily, halfW, halfD, points, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette);
  roof.position.y = wallHeight;
  g.add(roof);

  // Chimney placement: rear-left 0.35 / rear-right 0.35 / side-wall 0.20 / none 0.10.
  const chimneyRand = mulberry32(tagSeed(dna.seed, 'CHIM'));
  const chimneyChoice = pickWeighted<'rear-left' | 'rear-right' | 'side-wall' | 'none'>(chimneyRand, [
    ['rear-left', 0.35],
    ['rear-right', 0.35],
    ['side-wall', 0.20],
    ['none', 0.10],
  ]);
  if (chimneyChoice !== 'none') {
    const chimney = placeChimney(halfW, halfD, wallHeight, chimneyChoice, palette, tagSeed(dna.seed, 'CHIM'));
    g.add(chimney);
  }

  // Front ornament: chevron lintel 0.45 / shield plaque 0.25 / X-lattice
  // gable 0.20 / plain corbel row 0.10, mounted above the door.
  const ornRand = mulberry32(tagSeed(dna.seed, 'ORNM'));
  const ornChoice = pickWeighted<'chevron' | 'shield' | 'lattice' | 'corbel'>(ornRand, [
    ['chevron', 0.45],
    ['shield', 0.25],
    ['lattice', 0.20],
    ['corbel', 0.10],
  ]);
  let ornament: THREE.Group;
  if (ornChoice === 'chevron') {
    ornament = buildChevronBelt({ width: fp.w * 0.7, material: palette.iron });
  } else if (ornChoice === 'shield') {
    ornament = buildShieldPlaque({ width: 0.4, height: 0.5, material: palette.iron, motif: 'hammer' });
  } else if (ornChoice === 'lattice') {
    ornament = buildXLatticePanel({ width: 0.5, height: 0.4, material: palette.iron });
  } else {
    ornament = buildCorbelRow({ count: 3, spacing: 0.35, material: palette.basalt });
  }
  ornament.name = 'dwarven-front-ornament';
  ornament.position.set(0, wallHeight * 0.92, halfD + 0.04);
  g.add(ornament);

  return g;
}
