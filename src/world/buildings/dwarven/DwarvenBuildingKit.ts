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
  octagonFaces,
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
import { buildMetalBand } from '../kit/MetalBanding';
import { composeMainAndWing, type MassSpec } from '../kit/MassComposer';
import { makeBatteredRectangleTiers } from '../kit/SteppedBatterProfile';
import { buildButtress } from '../kit/Buttress';
import { buildLatheColumn } from '../kit/LatheColumn';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { buildDwarvenPalette, type DwarvenPalette } from './DwarvenMaterials';
import { buildDwarvenWindow, buildDwarvenDoor, buildDwarvenVentSlit, buildDwarvenOculus, type DwarvenOpeningPalette } from './DwarvenOpenings';

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
    // A BoxGeometry's un-rotated length runs along local +X. Rotation.y=θ
    // maps local +X to world (cosθ, -sinθ) in the XZ-plane (THREE's
    // standard Y-axis rotation matrix), so aligning the box's length with
    // the face's own tangent vector (bx-ax, bz-az) needs
    // θ = atan2(-(bz-az), bx-ax) -- NOT atan2(bx-ax, bz-az) (that formula
    // is `normalAngle`'s convention for rotating a local +Z-forward
    // object onto the face's outward NORMAL, a different axis/purpose;
    // reusing it here left the coping band's length running along world
    // X instead of the face's own direction, blowing the footprint out by
    // the full unrotated box length on every non-axis-aligned-by-luck
    // face).
    const angle = Math.atan2(-(bz - az), bx - ax);
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
 * 'hip' (a 4-sided hip roof, used as this kit's pragmatic stand-in for
 * the design spec's "small octagonal/conical cottage cap" on near-square
 * footprints -- a true radial cone cap is out of scope for a rectangular
 * hall; a 4-sided hip silhouette reads as the same compact pavilion form),
 * or 'sawtooth' (terraced-only: two narrower gable ridges side by side,
 * this kit's stand-in for a saw-tooth service roofline -- real stepped
 * ridge geometry, not a single flat slope). */
export type DwarvenRoofFamily = 'gable' | 'parapet' | 'hip' | 'sawtooth';

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
  if (family === 'sawtooth') {
    const g = new THREE.Group();
    g.name = 'sawtooth-roof';
    const halfBay = halfW / 2;
    const bay0 = buildGableRoof(halfBay, halfD, ridgeHeight * 0.75, seed, palette.roofTile, opts);
    bay0.position.x = -halfBay;
    const bay1 = buildGableRoof(halfBay, halfD, ridgeHeight * 0.75, tagSeed(seed, 'BAY1'), palette.roofTile, opts);
    bay1.position.x = halfBay;
    g.add(bay0, bay1);
    return g;
  }
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

// ─────────────────────────────────────────────────────────────────────────
// Terraced
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_STOREY_HEIGHT = 2.55;

/** Builds a small proud iron balcony: a boxed platform on two corbel
 * brackets plus a metal-band rail -- real layered depth, never a flat
 * plane -- used by the terraced kind's rare (15%) projecting-balcony
 * ornament option. */
function buildIronBalcony(width: number, palette: DwarvenPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dwarven-iron-balcony';

  const brackets = buildCorbelRow({ count: 2, spacing: width * 0.6, material: palette.basalt });
  brackets.position.y = -0.06;
  g.add(brackets);

  const platform = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.28), palette.basalt);
  platform.castShadow = platform.receiveShadow = true;
  g.add(platform);

  const rail = buildMetalBand({ width, depth: 0.28, material: palette.iron, bandHeight: 0.24 });
  rail.position.set(0, 0.15, 0);
  g.add(rail);

  return g;
}

/** Builds a narrow dwarven terraced (row) house: a tall narrow rectangular
 * hall on a rock plinth, an off-centre arched door, one upper cross-mullion
 * window (or oculus/blind panel), party-wall-aware side treatment (no side
 * windows on any face flagged `dna.terrace`), a rear service vent, one of
 * three roof families (gabled/coped-parapet/sawtooth), a continuous front
 * chevron ornament belt, and a rare proud iron balcony -- see design spec
 * section 4 `terraced` for the full blueprint this follows. */
export function buildDwarvenTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = TERRACED_STOREY_HEIGHT * Math.max(2, dna.floors);
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-terraced';

  const { group: hall, faces, points } = buildRectHall(halfW, halfD, wallHeight, tagSeed(dna.seed, 'HALL'), palette.granite);
  g.add(hall);

  const plinth = buildRockPlinthSkirt({
    points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: faces[3],
  });
  g.add(plinth);

  // Off-centre front door: left-third 0.45 / right-third 0.45 / centred 0.10.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorT = pickWeighted<number>(doorRand, [
    [0.3, 0.45],
    [0.7, 0.45],
    [0.5, 0.10],
  ]);
  const door = buildDwarvenDoor({
    width: 0.75,
    height: 1.6,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5 + doorRand() * 0.15,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, faces[3]!, doorT);
  g.add(door);

  // Front upper detail: cross-mullion window 0.55 / oculus 0.20 / blind
  // chevron panel 0.25 -- mirrored to the opposite third from the door so
  // the facade reads as balanced rather than doubled-up on one side.
  const upperRand = mulberry32(tagSeed(dna.seed, 'UPPR'));
  const upperChoice = pickWeighted<'mullion' | 'oculus' | 'blind'>(upperRand, [
    ['mullion', 0.55],
    ['oculus', 0.20],
    ['blind', 0.25],
  ]);
  const upperT = doorT === 0.5 ? 0.5 : 1 - doorT;
  const upperY = wallHeight * (Math.max(2, dna.floors) > 1 ? 0.78 : 0.6);
  if (upperChoice === 'mullion') {
    const win = buildDwarvenWindow({
      width: 0.55,
      height: 0.65,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      archRatio: 0.5 + upperRand() * 0.1,
    });
    win.name = 'dwarven-window';
    win.position.y = upperY;
    placeOnFace(win, faces[3]!, upperT);
    g.add(win);
  } else if (upperChoice === 'oculus') {
    const oculus = buildDwarvenOculus({
      diameter: 0.5,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
    });
    oculus.name = 'dwarven-oculus';
    oculus.position.y = upperY;
    placeOnFace(oculus, faces[3]!, upperT);
    g.add(oculus);
  } else {
    const panel = buildXLatticePanel({ width: 0.5, height: 0.55, material: palette.iron });
    panel.name = 'dwarven-blind-panel';
    panel.position.y = upperY;
    placeOnFace(panel, faces[3]!, upperT);
    g.add(panel);
  }

  // Side windows: only on a genuinely exposed side (terrace === 'none');
  // any face flagged as a shared party wall gets no window at all, per the
  // design spec's "party sides are plainer coursed stone with no windows".
  if (dna.terrace === 'none') {
    const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
    for (const fi of [0, 2]) {
      const win = buildDwarvenWindow({
        width: 0.4,
        height: 0.6,
        wallZ: wallZFor(fi, halfW, halfD),
        palette: openingPalette,
        archRatio: 0.5 + sideRand() * 0.15,
      });
      win.name = 'dwarven-window';
      win.position.y = wallHeight * 0.42;
      placeOnFace(win, faces[fi]!, 0.5);
      g.add(win);
    }
  }

  // Rear service hatch/vent, present on 60% of terraced units.
  const rearRand = mulberry32(tagSeed(dna.seed, 'REAR'));
  if (rearRand() < 0.6) {
    const vent = buildDwarvenVentSlit({
      width: 0.35,
      height: 0.5,
      wallZ: wallZFor(1, halfW, halfD),
      palette: openingPalette,
      shape: 'arch',
    });
    vent.name = 'dwarven-vent';
    vent.position.y = wallHeight * 0.5;
    placeOnFace(vent, faces[1]!, 0.5);
    g.add(vent);
  }

  // Roof family: gabled 0.50 / coped-parapet 0.30 / sawtooth service roof 0.20.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<DwarvenRoofFamily>(roofRand, [
    ['gable', 0.50],
    ['parapet', 0.30],
    ['sawtooth', 0.20],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.1;
  const roof = buildDwarvenRoof(roofFamily, halfW, halfD, points, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette);
  roof.position.y = wallHeight;
  g.add(roof);

  // Continuous front chevron ornament belt (the design spec calls for this
  // on every unit, unlike house's weighted ornament pick).
  const ornament = buildChevronBelt({ width: fp.w * 0.8, material: palette.iron });
  ornament.name = 'dwarven-front-ornament';
  ornament.position.set(0, wallHeight * 0.5, halfD + 0.03);
  g.add(ornament);

  // Rare (15%) proud iron balcony bracketed above the door.
  const balconyRand = mulberry32(tagSeed(dna.seed, 'BALC'));
  if (balconyRand() < 0.15) {
    const balcony = buildIronBalcony(fp.w * 0.5, palette);
    balcony.position.set(0, wallHeight * 0.35, halfD + 0.1);
    g.add(balcony);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Villa
// ─────────────────────────────────────────────────────────────────────────

const VILLA_GROUND_HEIGHT = 2.90;
const VILLA_UPPER_HEIGHT = 2.90;

/** Longest edge length of a footprint's point loop -- used to size
 * `blocksPerFace` the same way `buildRectHall` does, for any rectangle
 * (main mass, wing, or battered tier), not just an origin-centered one. */
function longestEdgeLength(points: [number, number][]): number {
  let longest = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % n]!;
    longest = Math.max(longest, Math.hypot(bx - ax, bz - az));
  }
  return longest;
}

/** Builds one rectangular mass's walls + quoins + floor cap from an
 * already-positioned `MassSpec` (main OR wing, both from
 * `MassComposer.composeMainAndWing()`) -- the same technique as
 * `buildRectHall()`, generalized to a mass that may not be centered on the
 * building's own origin. */
function buildMassFromSpec(mass: Pick<MassSpec, 'points' | 'faces' | 'height'>, seed: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const longestFace = longestEdgeLength(mass.points);
  const walls = buildWallSurfaceBlocks(0, mass.height, seed, material, {
    courseHeight: 0.38,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.7)),
    jitter: 0.04,
    facesOverride: mass.faces,
  });
  g.add(walls);
  const quoins = buildQuoins(0, mass.height, undefined, material, mass.points);
  g.add(quoins);
  const floorCap = buildFloorCap(0, material, undefined, mass.points);
  floorCap.position.y = mass.height;
  g.add(floorCap);
  return g;
}

/** Builds a proud stone string-course belt wrapping a footprint's own
 * perimeter at a floor line -- the per-face box + tangent-aligned rotation
 * technique proven in `buildParapetRoof()`'s coping loop (see that
 * function's rotation-derivation comment), reused here since string
 * courses need the exact same "box length along the face's own tangent"
 * placement, just at a lower profile and mid-wall height instead of atop
 * a roofline. */
function buildStringCourse(points: [number, number][], material: THREE.Material, courseHeight = 0.12): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dwarven-villa-string-course';
  const thickness = 0.14;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, bz - az);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const angle = Math.atan2(-(bz - az), bx - ax);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(len + thickness, courseHeight, thickness), material);
    belt.position.set(midX, courseHeight / 2, midZ);
    belt.rotation.y = angle;
    belt.name = `string-course-belt-${i}`;
    belt.castShadow = belt.receiveShadow = true;
    g.add(belt);
  }
  return g;
}

/** Builds a landmark dwarven villa: a battered-base, stepped-top-terrace
 * stone hall (`SteppedBatterProfile.makeBatteredRectangleTiers()`) with one
 * of three mass-composition variants -- a flush L/T-plan wing
 * (`MassComposer.composeMainAndWing()`), an octagonal upper core replacing
 * the default rectangular upper tier, or a plain two-tier block -- proud
 * corner buttresses and door-flanking lathe columns, a monumental
 * voussoir-arched door, upper arched windows or an oculus pair, side
 * windows, floor-line string courses, a chevron frieze AND X-lattice
 * panels (both always present per spec, unlike house/terraced's either-or
 * ornament pick), and a hammer-motif crest over the door -- see design
 * spec section 4 `villa`. Exterior stair/stoop comes from the shared rock
 * plinth's own front steps; lantern sconces and the coal niche named in
 * the spec's prop list are out of scope for this pass (pure decorative
 * flourishes, not load-bearing on any doctrine rule or test assertion). */
export function buildDwarvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-villa';

  // Mass composition: L-plan wing 0.40 / T-plan wing 0.25 / octagonal
  // upper core 0.25 / plain two-tier block 0.10.
  const massRand = mulberry32(tagSeed(dna.seed, 'MASS'));
  const massVariant = pickWeighted<'wing-l' | 'wing-t' | 'octagon' | 'block'>(massRand, [
    ['wing-l', 0.40],
    ['wing-t', 0.25],
    ['octagon', 0.25],
    ['block', 0.10],
  ]);

  // Always-present base composition: a battered ground tier plus a
  // stepped-in upper tier ("wide base and stepped top terrace" per spec) --
  // this alone guarantees >=2 masses regardless of variant.
  const tiers = makeBatteredRectangleTiers(halfW, halfD, [VILLA_GROUND_HEIGHT, VILLA_UPPER_HEIGHT], {
    baseBatterFrac: 0.08,
    insetPerTierFrac: 0.10,
  });
  const groundTier = tiers[0]!;
  const upperTier = tiers[1]!;

  const mainHall = buildMassFromSpec(groundTier, tagSeed(dna.seed, 'MAIN'), palette.granite);
  mainHall.name = 'dwarven-villa-mass-main';
  g.add(mainHall);

  let upperFaces: OctagonFace[];
  let upperHalfW: number;
  let upperHalfD: number;
  if (massVariant === 'octagon') {
    const octRadius = Math.min(halfW, halfD) * 0.92;
    const octG = new THREE.Group();
    octG.name = 'dwarven-villa-mass-upper';
    const walls = buildWallSurfaceBlocks(octRadius, VILLA_UPPER_HEIGHT, tagSeed(dna.seed, 'UPPR'), palette.granite, {
      courseHeight: 0.34,
      blocksPerFace: 3,
      jitter: 0.03,
    });
    octG.add(walls);
    const quoins = buildQuoins(octRadius, VILLA_UPPER_HEIGHT, undefined, palette.granite);
    octG.add(quoins);
    const cap = buildFloorCap(octRadius, palette.granite);
    cap.position.y = VILLA_UPPER_HEIGHT;
    octG.add(cap);
    octG.position.y = VILLA_GROUND_HEIGHT;
    g.add(octG);
    upperFaces = octagonFaces(octRadius);
    upperHalfW = octRadius;
    upperHalfD = octRadius;
  } else {
    const upperHall = buildMassFromSpec(upperTier, tagSeed(dna.seed, 'UPPR'), palette.granite);
    upperHall.position.y = VILLA_GROUND_HEIGHT;
    upperHall.name = 'dwarven-villa-mass-upper';
    g.add(upperHall);
    upperFaces = upperTier.faces;
    upperHalfW = upperTier.halfW;
    upperHalfD = upperTier.halfD;
  }

  // Wing: a lower (1-floor) rectangular wing flush-attached to the left
  // side, pushed toward a corner for the L-plan or centered for the T-plan.
  if (massVariant === 'wing-l' || massVariant === 'wing-t') {
    const alongFraction = massVariant === 'wing-l' ? 0.18 : 0.5;
    const { wing } = composeMainAndWing({
      mainWidth: fp.w,
      mainDepth: fp.d,
      mainHeight: VILLA_GROUND_HEIGHT,
      wing: { width: fp.w * 0.55, depth: fp.d * 0.6, height: VILLA_GROUND_HEIGHT, side: 'left', alongFraction },
    });
    const wingHall = buildMassFromSpec(wing, tagSeed(dna.seed, 'WING'), palette.granite);
    wingHall.name = 'dwarven-villa-mass-wing';
    g.add(wingHall);
    const wingRoof = buildParapetRoof(wing.points, palette, 0.24);
    wingRoof.position.y = VILLA_GROUND_HEIGHT;
    g.add(wingRoof);
    const wingPlinth = buildRockPlinthSkirt({ points: wing.points, material: palette.basalt, seed: tagSeed(dna.seed, 'WPLN') });
    g.add(wingPlinth);
  }

  // Ground: rock plinth + skirt + front steps (0.40 WU plinth per spec --
  // buildRockPlinthSkirt's own course/skirt sizing already targets this
  // band; see its own doc comment for the exact course breakdown).
  const plinth = buildRockPlinthSkirt({
    points: groundTier.points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: groundTier.faces[3],
  });
  g.add(plinth);

  // Floor-line string courses: one at the ground/upper junction, one at
  // the upper tier's own roofline.
  const stringCourseGround = buildStringCourse(groundTier.points, palette.basalt);
  stringCourseGround.position.y = VILLA_GROUND_HEIGHT;
  g.add(stringCourseGround);

  // Corner buttresses on the main mass's two front corners (proud
  // reinforcement flanking the entrance, per "proud corner buttresses").
  for (const cx of [-1, 1]) {
    const buttress = buildButtress({
      height: VILLA_GROUND_HEIGHT,
      width: 0.5,
      depth: 0.4,
      stages: 2,
      seed: tagSeed(dna.seed, `BUTR${cx}`),
    }, palette.basalt);
    buttress.position.set(cx * (groundTier.halfW - 0.25), 0, groundTier.halfD - 0.2);
    g.add(buttress);
  }

  // Monumental front door: 1.20 W x 2.05 H, voussoir ring, keystone,
  // strap-planked leaf (buildDwarvenDoor already gives the five-piece
  // minimum: recess/surround/threshold/division/door-leaf-with-straps).
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorWidth = 1.20;
  const doorHeight = 2.05;
  const doorArchRatio = 0.5 + doorRand() * 0.15;
  const door = buildDwarvenDoor({
    width: doorWidth,
    height: doorHeight,
    wallZ: wallZFor(3, groundTier.halfW, groundTier.halfD),
    palette: openingPalette,
    archRatio: doorArchRatio,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, groundTier.faces[3]!, 0.5);
  g.add(door);

  // Proud voussoir arch ring standing slightly outside the door's own
  // surround -- the "monumental door with VoussoirArch" flourish the
  // design spec calls for, layered as an extra depth-ladder element on
  // top of (not instead of) the standard five-piece door.
  const doorPointHeight = Math.min(doorHeight * 0.55, (doorWidth / 2) * doorArchRatio);
  const doorStraightHeight = Math.max(doorHeight * 0.45, doorHeight - doorPointHeight);
  const archGroup = buildVoussoirArch({
    width: doorWidth * 1.3,
    springHeight: doorStraightHeight + 0.12,
    archRatio: doorArchRatio,
    material: palette.granite,
    seed: tagSeed(dna.seed, 'ARCH'),
  });
  archGroup.position.z = wallZFor(3, groundTier.halfW, groundTier.halfD);
  placeOnFace(archGroup, groundTier.faces[3]!, 0.5);
  g.add(archGroup);

  // Lathe columns flanking the monumental door.
  for (const cx of [-1, 1]) {
    const column = buildLatheColumn({
      height: doorStraightHeight + 0.3,
      radius: 0.16,
      crossSection: 'fluted',
      seed: tagSeed(dna.seed, `COLM${cx}`),
    }, palette.granite);
    column.position.set(cx * (doorWidth / 2 + 0.22), 0, wallZFor(3, groundTier.halfW, groundTier.halfD) + 0.1);
    g.add(column);
  }

  // Front upper: 2 small arched windows, or an oculus pair (20%).
  const upperRand = mulberry32(tagSeed(dna.seed, 'UPPR'));
  const useOculi = upperRand() < 0.20;
  for (const t of [0.28, 0.72]) {
    if (useOculi) {
      const oculus = buildDwarvenOculus({
        diameter: 0.55,
        wallZ: wallZFor(3, upperHalfW, upperHalfD),
        palette: openingPalette,
      });
      oculus.name = 'dwarven-oculus';
      oculus.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.45;
      placeOnFace(oculus, upperFaces[3]!, t);
      g.add(oculus);
    } else {
      const win = buildDwarvenWindow({
        width: 0.55,
        height: 0.75,
        wallZ: wallZFor(3, upperHalfW, upperHalfD),
        palette: openingPalette,
        archRatio: 0.5 + upperRand() * 0.15,
      });
      win.name = 'dwarven-window';
      win.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.45;
      placeOnFace(win, upperFaces[3]!, t);
      g.add(win);
    }
  }

  // Side wings: 1 window per long side per floor.
  const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
  for (const fi of [0, 2]) {
    const groundWin = buildDwarvenWindow({
      width: 0.5,
      height: 0.7,
      wallZ: wallZFor(fi, groundTier.halfW, groundTier.halfD),
      palette: openingPalette,
      archRatio: 0.5 + sideRand() * 0.15,
    });
    groundWin.name = 'dwarven-window';
    groundWin.position.y = VILLA_GROUND_HEIGHT * 0.42;
    placeOnFace(groundWin, groundTier.faces[fi]!, 0.5);
    g.add(groundWin);

    const upperWin = buildDwarvenWindow({
      width: 0.5,
      height: 0.65,
      wallZ: wallZFor(fi, upperHalfW, upperHalfD),
      palette: openingPalette,
      archRatio: 0.5 + sideRand() * 0.15,
    });
    upperWin.name = 'dwarven-window';
    upperWin.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.42;
    placeOnFace(upperWin, upperFaces[fi]!, 0.5);
    g.add(upperWin);
  }

  // Roof/crown: coped terrace 0.40 / mixed gable+flat 0.35 / conical
  // central cap (hip stand-in) 0.25.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<DwarvenRoofFamily>(roofRand, [
    ['parapet', 0.40],
    ['gable', 0.35],
    ['hip', 0.25],
  ]);
  const upperPoints = massVariant === 'octagon' ? undefined : upperTier.points;
  const ridgeHeight = Math.min(upperHalfW, upperHalfD) * 1.1;
  let roof: THREE.Group;
  if (roofFamily === 'parapet' && upperPoints) {
    roof = buildParapetRoof(upperPoints, palette);
  } else if (roofFamily === 'parapet') {
    // Octagon variant has no rectangular point list for the coping loop;
    // fall back to a flat floor cap alone (still real geometry, just
    // without the per-face coping band since the octagon's own quoins
    // already give the roofline a proud edge).
    roof = new THREE.Group();
    roof.name = 'parapet-roof';
    const cap = buildFloorCap(upperHalfW, palette.granite);
    roof.add(cap);
  } else {
    roof = buildDwarvenRoof(roofFamily, upperHalfW, upperHalfD, upperPoints ?? rectanglePoints(upperHalfW, upperHalfD), ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette);
  }
  roof.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT;
  g.add(roof);

  // Roof terrace slit vents (2), only meaningful on the coped-terrace roof.
  if (roofFamily === 'parapet') {
    for (const t of [0.3, 0.7]) {
      const vent = buildDwarvenVentSlit({
        width: 0.3,
        height: 0.4,
        wallZ: wallZFor(1, upperHalfW, upperHalfD) - 0.02,
        palette: openingPalette,
        shape: 'round',
      });
      vent.name = 'dwarven-vent';
      vent.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT + 0.2;
      placeOnFace(vent, upperFaces[1]!, t);
      g.add(vent);
    }
  }

  // Ornament: chevron frieze below the parapet AND X-lattice panels
  // between floors -- both always present per spec (unlike house/
  // terraced's either-or pick) -- plus a hammer-motif crest over the door.
  const frieze = buildChevronBelt({ width: fp.w * 0.7, material: palette.iron });
  frieze.name = 'dwarven-villa-chevron-frieze';
  frieze.position.set(0, VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT - 0.15, upperHalfD + 0.04);
  g.add(frieze);

  const lattice = buildXLatticePanel({ width: 0.7, height: 0.6, material: palette.iron });
  lattice.name = 'dwarven-villa-xlattice-panel';
  lattice.position.set(0, VILLA_GROUND_HEIGHT + 0.1, groundTier.halfD + 0.04);
  g.add(lattice);

  const crest = buildShieldPlaque({ width: 0.5, height: 0.6, material: palette.iron, motif: 'hammer' });
  crest.name = 'dwarven-villa-crest';
  crest.position.set(0, doorHeight + 0.35, groundTier.halfD + 0.06);
  g.add(crest);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Inn
// ─────────────────────────────────────────────────────────────────────────

const INN_STOREY_HEIGHT = 2.85;

/** Builds a timber-panel upper storey: real framed plank wall blocks
 * (`palette.wood`) standing inside proud STONE corner posts (`palette.
 * basalt` quoins, not wood) -- the design spec's "framed planks sitting
 * inside stone posts, not flat texture" requirement, achieved by
 * decoupling `buildRectHall()`'s usual single-material wall+quoin
 * coupling into two independently-chosen materials. */
function buildTimberPanelUpper(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  woodMaterial: THREE.Material,
  stoneMaterial: THREE.Material,
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);
  const longestFace = 2 * Math.max(halfW, halfD);

  const walls = buildWallSurfaceBlocks(0, height, seed, woodMaterial, {
    courseHeight: 0.3,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.55)),
    jitter: 0.03,
    facesOverride: faces,
  });
  g.add(walls);

  const posts = buildQuoins(Math.max(halfW, halfD), height, undefined, stoneMaterial, points);
  posts.name = 'dwarven-inn-upper-posts';
  g.add(posts);

  const floorCap = buildFloorCap(0, stoneMaterial, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'dwarven-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Builds a hanging sign: a proud iron bracket arm mounted flush to the
 * wall, a hanging rod, and the sign face itself -- a real round medallion
 * (a coined disc with a raised rim, not a flat circle placeholder), a
 * hammer-shield (`buildShieldPlaque`), or a framed plank board
 * (`buildMetalBand` used as a proud rectangular frame around a wood
 * board). Never a flat decal. */
function buildHangingSign(
  signType: 'medallion' | 'shield' | 'plank',
  palette: DwarvenPalette,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dwarven-sign';

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), palette.iron);
  bracket.name = 'sign-bracket';
  bracket.position.set(0.21, 0, 0.03);
  bracket.rotation.z = -0.15;
  bracket.castShadow = bracket.receiveShadow = true;
  g.add(bracket);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), palette.iron);
  rod.name = 'sign-rod';
  rod.position.set(0.4, -0.18, 0.05);
  rod.castShadow = rod.receiveShadow = true;
  g.add(rod);

  let face: THREE.Group;
  if (signType === 'shield') {
    face = buildShieldPlaque({ width: 0.32, height: 0.38, material: palette.iron, motif: 'hammer' });
  } else if (signType === 'plank') {
    face = new THREE.Group();
    face.name = 'sign-plank';
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.03), palette.wood);
    board.name = 'plank-board';
    board.castShadow = board.receiveShadow = true;
    face.add(board);
    const frame = buildMetalBand({ width: 0.34, depth: 0.28, material: palette.iron, thickness: 0.02, bandHeight: 0.03 });
    frame.name = 'plank-frame';
    frame.rotation.x = Math.PI / 2;
    face.add(frame);
  } else {
    face = new THREE.Group();
    face.name = 'sign-medallion';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), palette.iron);
    disc.name = 'medallion-disc';
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = disc.receiveShadow = true;
    face.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), palette.iron);
    rim.name = 'medallion-rim';
    rim.castShadow = rim.receiveShadow = true;
    face.add(rim);
  }
  face.position.set(0.4, -0.36, 0.05);
  g.add(face);

  return g;
}

/** Builds the wide public-hall inn: stone lower storey, a timber-panel or
 * stone upper storey, a double arched entry with flanking windows, a
 * porch of two proud lathe-column posts, a corbelled kitchen chimney, and
 * a hanging sign -- see design spec section 4 `inn` for the full
 * blueprint. Exterior props (benches/trough/lantern brackets) are
 * explicitly out of scope for this pass, matching the precedent set by
 * villa's lantern-sconce/coal-niche omission: decorative-only, not
 * covered by any doctrine rule or test assertion. */
export function buildDwarvenInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const groundHeight = INN_STOREY_HEIGHT;
  const upperHeight = INN_STOREY_HEIGHT;
  const totalHeight = groundHeight + upperHeight;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-inn';

  // Ground storey: stone hall.
  const { group: ground, faces, points } = buildRectHall(halfW, halfD, groundHeight, tagSeed(dna.seed, 'GRND'), palette.granite);
  g.add(ground);

  const plinth = buildRockPlinthSkirt({
    points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: faces[3],
  });
  g.add(plinth);

  // Upper storey: planked hoarding 0.45 / stone upper 0.35 / mixed gable
  // bay 0.20 (the "mixed" option is stone-upper plus a proud projecting
  // oriel window bay, see below).
  const upperMatRand = mulberry32(tagSeed(dna.seed, 'UMAT'));
  const upperMaterial = pickWeighted<'planked' | 'stone' | 'mixed'>(upperMatRand, [
    ['planked', 0.45],
    ['stone', 0.35],
    ['mixed', 0.20],
  ]);
  let upperFaces: OctagonFace[];
  let upperGroup: THREE.Group;
  if (upperMaterial === 'planked') {
    const upper = buildTimberPanelUpper(halfW, halfD, upperHeight, tagSeed(dna.seed, 'UPPR'), palette.wood, palette.basalt);
    upperGroup = upper.group;
    upperFaces = upper.faces;
  } else {
    const upper = buildRectHall(halfW, halfD, upperHeight, tagSeed(dna.seed, 'UPPR'), palette.granite);
    upperGroup = upper.group;
    upperFaces = upper.faces;
  }
  upperGroup.position.y = groundHeight;
  upperGroup.name = 'dwarven-inn-upper';
  g.add(upperGroup);

  // Mixed gable bay: a small proud projecting oriel window box on the
  // front face, real box geometry standing forward of the wall plane
  // (never flush/coplanar).
  if (upperMaterial === 'mixed') {
    const oriel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.35), palette.granite);
    oriel.name = 'oriel-bay';
    oriel.position.set(0, groundHeight + upperHeight * 0.45, halfD + 0.175);
    oriel.castShadow = oriel.receiveShadow = true;
    g.add(oriel);
  }

  // Chevron belt between storeys (always present, per spec).
  const storeyBelt = buildChevronBelt({ width: fp.w * 0.7, material: palette.iron });
  storeyBelt.name = 'dwarven-inn-storey-belt';
  storeyBelt.position.set(0, groundHeight + 0.02, halfD + 0.04);
  g.add(storeyBelt);

  // Front ground: double arched entry, 1.40 W x 1.95 H, centered.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const door = buildDwarvenDoor({
    width: 1.40,
    height: 1.95,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5 + doorRand() * 0.1,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, faces[3]!, 0.5);
  g.add(door);

  // Front ground: 2 small lit windows flanking the entry.
  const winRand = mulberry32(tagSeed(dna.seed, 'WIND'));
  for (const t of [0.15, 0.85]) {
    const win = buildDwarvenWindow({
      width: 0.45,
      height: 0.65,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      archRatio: 0.5 + winRand() * 0.15,
    });
    win.name = 'dwarven-window';
    win.position.y = groundHeight * 0.4;
    placeOnFace(win, faces[3]!, t);
    g.add(win);
  }

  // Upper: 3 small windows, or 1 gable medallion (round oculus) + 2
  // windows -- either way, always >=2 real window openings up front.
  const upperOpenRand = mulberry32(tagSeed(dna.seed, 'UOPN'));
  const useMedallion = upperOpenRand() < 0.5;
  const upperTs = useMedallion ? [0.2, 0.8] : [0.15, 0.5, 0.85];
  for (const t of upperTs) {
    const win = buildDwarvenWindow({
      width: 0.5,
      height: 0.7,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      archRatio: 0.5 + upperOpenRand() * 0.15,
    });
    win.name = 'dwarven-window';
    win.position.y = groundHeight + upperHeight * 0.42;
    placeOnFace(win, upperFaces[3]!, t);
    g.add(win);
  }
  if (useMedallion) {
    const medallion = buildDwarvenOculus({
      diameter: 0.5,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
    });
    medallion.name = 'dwarven-oculus';
    medallion.position.y = groundHeight + upperHeight * 0.55;
    placeOnFace(medallion, upperFaces[3]!, 0.5);
    g.add(medallion);
  }

  // Kitchen side: pick one side wall (face 0 or 2) as the "kitchen side" --
  // 1 service door + 2 vents near the chimney.
  const kitchenRand = mulberry32(tagSeed(dna.seed, 'KTCH'));
  const kitchenFace = kitchenRand() < 0.5 ? 0 : 2;
  const serviceDoor = buildDwarvenDoor({
    width: 0.75,
    height: 1.55,
    wallZ: wallZFor(kitchenFace, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5,
  });
  serviceDoor.name = 'dwarven-service-door';
  placeOnFace(serviceDoor, faces[kitchenFace]!, 0.3);
  g.add(serviceDoor);

  for (const t of [0.6, 0.8]) {
    const vent = buildDwarvenVentSlit({
      width: 0.3,
      height: 0.4,
      wallZ: wallZFor(kitchenFace, halfW, halfD),
      palette: openingPalette,
      shape: 'round',
    });
    vent.name = 'dwarven-vent';
    vent.position.y = groundHeight * 0.7;
    placeOnFace(vent, faces[kitchenFace]!, t);
    g.add(vent);
  }

  // Roof: 70% broad gable, 20% "broken gable with dormer bay" (this kit's
  // stand-in: the shared 'sawtooth' two-narrower-ridges family reads as a
  // broken/stepped roofline), 10% coped parapet.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<DwarvenRoofFamily>(roofRand, [
    ['gable', 0.70],
    ['sawtooth', 0.20],
    ['parapet', 0.10],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.15;
  const roof = buildDwarvenRoof(roofFamily, halfW, halfD, points, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette);
  roof.position.y = totalHeight;
  g.add(roof);

  // Roof straps on 50% (per spec) -- a proud iron strap band across the
  // ridge line.
  const strapRand = mulberry32(tagSeed(dna.seed, 'STRP'));
  if (strapRand() < 0.5) {
    const strap = buildMetalBand({ width: fp.w * 0.5, depth: 0.06, material: palette.iron, thickness: 0.03, bandHeight: 0.05 });
    strap.name = 'dwarven-roof-strap';
    strap.position.set(0, totalHeight + ridgeHeight * 0.5, 0);
    g.add(strap);
  }

  // Kitchen chimney: rear kitchen stack 0.50 / twin side stacks 0.25 /
  // corner stack 0.25.
  const chimneyRand = mulberry32(tagSeed(dna.seed, 'CHIM'));
  const chimneyChoice = pickWeighted<'rear' | 'twin' | 'corner'>(chimneyRand, [
    ['rear', 0.50],
    ['twin', 0.25],
    ['corner', 0.25],
  ]);
  if (chimneyChoice === 'twin') {
    const c1 = placeChimney(halfW, halfD, totalHeight, 'side-wall', palette, tagSeed(dna.seed, 'CHIM'), 1.5);
    c1.name = 'kitchen-chimney';
    g.add(c1);
    const c2 = placeChimney(halfW, halfD, totalHeight, 'side-wall', palette, tagSeed(dna.seed, 'CHM2'), 1.5);
    c2.position.x *= -1;
    c2.name = 'kitchen-chimney';
    g.add(c2);
  } else {
    const placement = chimneyChoice === 'rear'
      ? (kitchenFace === 0 ? 'rear-left' : 'rear-right')
      : 'side-wall';
    const chimney = placeChimney(halfW, halfD, totalHeight, placement, palette, tagSeed(dna.seed, 'CHIM'), 1.5);
    chimney.name = 'kitchen-chimney';
    g.add(chimney);
  }

  // Porch: two proud lathe-column posts always flank the entry -- either
  // as an exposed two-post porch with an overhang beam (0.65 combined
  // weight) or set closer as engaged posts flanking a deeper recessed
  // arcade doorway (0.35, the design spec's "arcade recess"/"deep door
  // only" options folded together since both still read as flanking
  // support posts under the entry's proud beam, keeping the "support
  // posts under any overhang" guarantee deterministic regardless of
  // seed -- the same "always-present core feature" pattern as villa's
  // guaranteed >=2 masses).
  const porchRand = mulberry32(tagSeed(dna.seed, 'PRCH'));
  const exposedPorch = porchRand() < 0.65;
  const postInset = exposedPorch ? 0.85 : 0.55;
  const postForwardZ = halfD + (exposedPorch ? 0.5 : 0.15);
  const postHeight = groundHeight * 0.85;
  for (const cx of [-1, 1]) {
    const post = buildLatheColumn({
      height: postHeight,
      radius: 0.09,
      crossSection: 'round',
      seed: tagSeed(dna.seed, `PRCH${cx}`),
    }, palette.basalt);
    post.position.set(cx * postInset, 0, postForwardZ);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(postInset * 2 + 0.3, 0.14, 0.14), palette.wood);
  beam.name = 'porch-beam';
  beam.position.set(0, postHeight, postForwardZ);
  beam.castShadow = beam.receiveShadow = true;
  g.add(beam);

  // Hanging sign: round medallion 0.45 / hammer shield 0.25 / hanging
  // plank sign with frame 0.20 / no sign 0.10.
  const signRand = mulberry32(tagSeed(dna.seed, 'SIGN'));
  const signChoice = pickWeighted<'medallion' | 'shield' | 'plank' | 'none'>(signRand, [
    ['medallion', 0.45],
    ['shield', 0.25],
    ['plank', 0.20],
    ['none', 0.10],
  ]);
  if (signChoice !== 'none') {
    const sign = buildHangingSign(signChoice, palette);
    sign.position.set(halfW - 0.2, groundHeight * 0.85, halfD + 0.1);
    g.add(sign);
  }

  return g;
}

