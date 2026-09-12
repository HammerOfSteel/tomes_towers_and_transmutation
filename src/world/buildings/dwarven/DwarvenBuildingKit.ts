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
  octagonPoints,
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
import { makeBatteredRectangleTiers, makeSteppedOctagonTiers } from '../kit/SteppedBatterProfile';
import { buildButtress } from '../kit/Buttress';
import { buildLatheColumn } from '../kit/LatheColumn';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { layoutFacade } from '../kit/FacadeGrammar';
import { buildPipeRun } from '../kit/PipeworkVent';
import { buildDwarvenPalette, type DwarvenPalette } from './DwarvenMaterials';
import { buildDwarvenWindow, buildDwarvenDoor, buildDwarvenVentSlit, buildDwarvenOculus, buildDwarvenForgeMouth, type DwarvenOpeningPalette } from './DwarvenOpenings';
import { buildBellows, buildQuenchTrough, buildAnvil, buildOreCoalBin, buildToolRack } from './DwarvenWorkshopProps';

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
  eaveOverhangFrac?: number,
): THREE.Group {
  if (family === 'parapet') return buildParapetRoof(points, palette);
  const opts: RoofMassingOptions = { shingle: { silhouette: 'rectangular' }, eaveOverhangFrac };
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

// ─────────────────────────────────────────────────────────────────────────
// Shop
// ─────────────────────────────────────────────────────────────────────────

const SHOP_GROUND_HEIGHT = 2.80;
const SHOP_LOFT_HEIGHT = 2.40;

/** Builds a small rooftop "sign stack": a proud square iron mast standing
 * on the roof plane with a small crossed finial -- the design spec's
 * "sign stack" upper-feature option, a real multi-part rooftop assembly
 * distinct from the wall-mounted hanging sign. */
function buildSignStack(palette: DwarvenPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'sign-stack';
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), palette.iron);
  mast.name = 'stack-mast';
  mast.position.y = 0.3;
  mast.castShadow = mast.receiveShadow = true;
  g.add(mast);
  const finial = buildXLatticePanel({ width: 0.3, height: 0.22, material: palette.iron });
  finial.name = 'stack-finial';
  finial.position.y = 0.62;
  g.add(finial);
  return g;
}

/** Builds a compact octagonal "hex equipment bay": a small raised loft
 * standing on the roof plane, using the same wall/quoin/floor-cap
 * composition `buildMassFromSpec()` already provides for villa's
 * octagonal upper core, at a much smaller radius. */
function buildHexEquipmentBay(radius: number, height: number, seed: number, material: THREE.Material): THREE.Group {
  const mass = buildMassFromSpec(
    { points: octagonPoints(radius), faces: octagonFaces(radius), height },
    seed,
    material,
  );
  mass.name = 'hex-equipment-bay';
  return mass;
}

/** Builds a small proud gable dormer: a pitched box roof over a shallow
 * wall stub with one small window, projecting from the main roof plane. */
function buildDormer(seed: number, palette: DwarvenPalette, openingPalette: DwarvenOpeningPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dormer';
  const stubHalfW = 0.35;
  const stubHalfD = 0.22;
  const stubHeight = 0.35;
  const { group: stub, faces, points } = buildRectHall(stubHalfW, stubHalfD, stubHeight, seed, palette.granite);
  g.add(stub);
  const roof = buildGableRoof(stubHalfW, stubHalfD, 0.3, seed, palette.roofTile, { shingle: { silhouette: 'rectangular' } });
  roof.position.y = stubHeight;
  g.add(roof);
  const win = buildDwarvenWindow({
    width: 0.28,
    height: 0.3,
    wallZ: wallZFor(3, stubHalfW, stubHalfD),
    palette: openingPalette,
    archRatio: 0.5,
  });
  win.name = 'dwarven-window';
  win.position.y = stubHeight * 0.5;
  placeOnFace(win, faces[3]!, 0.5);
  g.add(win);
  void points;
  return g;
}

/** Builds the trade-vault/alchemist storefront: a squat stone box with a
 * split front facade (door bay + display bay laid out via
 * `FacadeGrammar.layoutFacade()`), a real recessed display/counter
 * opening (never a glass box), and an optional raised upper feature --
 * see design spec section 4 `shop` for the full blueprint. Props
 * (strapped crates/ore trays/scales-anvil sign) are out of scope for
 * this pass, matching villa/inn's precedent of omitting decorative-only
 * exterior clutter not covered by any doctrine rule or test assertion. */
export function buildDwarvenShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const groundHeight = SHOP_GROUND_HEIGHT;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-shop';

  const { group: hall, faces, points } = buildRectHall(halfW, halfD, groundHeight, tagSeed(dna.seed, 'HALL'), palette.granite);
  g.add(hall);

  const plinth = buildRockPlinthSkirt({
    points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: faces[3],
  });
  g.add(plinth);

  // Front facade split: door bay + display bay, laid out via
  // FacadeGrammar.layoutFacade() so each bay is a fixed-size module that
  // never stretches to fit the footprint -- two float margins absorb
  // whatever width is left over.
  const doorBayWidth = 1.0;
  const displayBayWidth = 1.5;
  const layout = layoutFacade(fp.w, [
    { kind: 'float', id: 'margin-left' },
    { kind: 'fixed', id: 'door-bay', width: doorBayWidth },
    { kind: 'fixed', id: 'display-bay', width: displayBayWidth },
    { kind: 'float', id: 'margin-right' },
  ], tagSeed(dna.seed, 'FACD'));
  const doorBay = layout.bays.find((b) => b.id === 'door-bay')!;
  const displayBay = layout.bays.find((b) => b.id === 'display-bay')!;
  const frontNormalAngle = faces[3]!.normalAngle;

  // Customer door: 0.80 W x 1.70 H arched, five-piece opening, positioned
  // at the door bay's own center (facade-grammar bay.x is measured from
  // the front face's left corner, matching rectangleFaces() face 3's own
  // a->b winding from -halfW to +halfW).
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const door = buildDwarvenDoor({
    width: 0.80,
    height: 1.70,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5 + doorRand() * 0.15,
  });
  door.name = 'dwarven-door';
  door.rotation.y = frontNormalAngle;
  door.position.x = -halfW + doorBay.x + doorBay.width / 2;
  g.add(door);

  // Display/service opening: 1.10 W x 0.85 H, counter-height, real
  // recessed counter with sill/grille/side posts and a set-back dark
  // glazing/display void (the five-piece window opening's own recess +
  // set-back glazing already satisfy this; horizontal division bars read
  // as the counter grille).
  const display = buildDwarvenWindow({
    width: 1.10,
    height: 0.85,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 0.5,
    divisionStyle: 'cross',
  });
  display.name = 'dwarven-display';
  display.rotation.y = frontNormalAngle;
  display.position.x = -halfW + displayBay.x + displayBay.width / 2;
  display.position.y = groundHeight * 0.32;
  g.add(display);

  // Side: 1 small high oculus/vent on 70%.
  const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
  if (sideRand() < 0.7) {
    const sideFace = sideRand() < 0.5 ? 0 : 2;
    const vent = buildDwarvenVentSlit({
      width: 0.3,
      height: 0.35,
      wallZ: wallZFor(sideFace, halfW, halfD),
      palette: openingPalette,
      shape: 'round',
    });
    vent.name = 'dwarven-vent';
    vent.position.y = groundHeight * 0.75;
    placeOnFace(vent, faces[sideFace]!, 0.5);
    g.add(vent);
  }

  // Optional upper machine loft: adds a second, narrower storey (only
  // when rolled) plus its own small round cross-mullion window.
  const loftRand = mulberry32(tagSeed(dna.seed, 'LOFT'));
  const hasLoft = loftRand() < 0.4;
  let roofBaseY = groundHeight;
  let loftHalfW = halfW;
  let loftHalfD = halfD;
  let loftFaces = faces;
  let loftPoints = points;
  if (hasLoft) {
    loftHalfW = halfW * 0.7;
    loftHalfD = halfD * 0.7;
    const loft = buildRectHall(loftHalfW, loftHalfD, SHOP_LOFT_HEIGHT, tagSeed(dna.seed, 'LOFT'), palette.granite);
    loft.group.position.y = groundHeight;
    loft.group.name = 'dwarven-shop-loft';
    g.add(loft.group);
    loftFaces = loft.faces;
    loftPoints = loft.points;
    roofBaseY = groundHeight + SHOP_LOFT_HEIGHT;

    const loftWin = buildDwarvenOculus({
      diameter: 0.35,
      wallZ: wallZFor(3, loftHalfW, loftHalfD),
      palette: openingPalette,
      divisionStyle: 'cross',
    });
    loftWin.name = 'dwarven-oculus';
    loftWin.position.y = groundHeight + SHOP_LOFT_HEIGHT * 0.5;
    placeOnFace(loftWin, loftFaces[3]!, 0.5);
    g.add(loftWin);
  }

  // Roof archetype: 35% parapet terrace / 35% shallow gable / 20% hex
  // equipment cap (this kit's compact-pavilion 'hip' stand-in, matching
  // house/villa's own established substitution) / 10% lean-to awning
  // with metal plates (a bespoke single-slope shed roof, shop-specific).
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofChoice = pickWeighted<'parapet' | 'gable' | 'hip' | 'lean-to'>(roofRand, [
    ['parapet', 0.35],
    ['gable', 0.35],
    ['hip', 0.20],
    ['lean-to', 0.10],
  ]);
  const ridgeHeight = Math.min(loftHalfW, loftHalfD) * 1.0;
  if (roofChoice === 'lean-to') {
    const leanTo = new THREE.Group();
    leanTo.name = 'lean-to-roof';
    const span = Math.hypot(loftHalfD * 2, ridgeHeight);
    const slopeAngle = Math.atan2(ridgeHeight, loftHalfD * 2);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(loftHalfW * 2 + 0.2, 0.1, span), palette.roofMetal);
    panel.name = 'lean-to-panel';
    panel.position.set(0, ridgeHeight * 0.5, 0);
    panel.rotation.x = -slopeAngle;
    panel.castShadow = panel.receiveShadow = true;
    leanTo.add(panel);
    const trim = buildMetalBand({ width: loftHalfW * 2, depth: 0.05, material: palette.iron, thickness: 0.03, bandHeight: 0.05 });
    trim.name = 'lean-to-trim';
    trim.position.set(0, 0.05, loftHalfD);
    leanTo.add(trim);
    leanTo.position.y = roofBaseY;
    g.add(leanTo);
  } else {
    const roof = buildDwarvenRoof(roofChoice, loftHalfW, loftHalfD, loftPoints, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette);
    roof.position.y = roofBaseY;
    g.add(roof);
  }

  // Ornament: framed sign medallion above the door + chevron belt +
  // metal band around the loft (if present).
  const sign = buildHangingSign('medallion', palette);
  sign.position.set(-halfW + doorBay.x + doorBay.width / 2, groundHeight * 0.85, halfD + 0.05);
  g.add(sign);

  const belt = buildChevronBelt({ width: fp.w * 0.6, material: palette.iron });
  belt.name = 'dwarven-shop-chevron-belt';
  belt.position.set(0, groundHeight - 0.2, halfD + 0.04);
  g.add(belt);

  if (hasLoft) {
    const loftBand = buildMetalBand({ width: loftHalfW * 2, depth: loftHalfD * 2, material: palette.iron, thickness: 0.03, bandHeight: 0.06 });
    loftBand.name = 'dwarven-shop-loft-band';
    loftBand.position.y = groundHeight + 0.05;
    g.add(loftBand);
  }

  // Trade sub-type: general vault shop 0.40 / alchemist-vent shop 0.25 /
  // toolmaker 0.25 / jeweller-crest shop 0.10. Only the alchemist variant
  // adds a distinct prop (an exterior pipe/vent stack); the others are
  // ornament-only distinctions already covered by the sign/roof/loft
  // rolls above (a bespoke toolmaker/jeweller geometry pass is out of
  // scope for this builder).
  const tradeRand = mulberry32(tagSeed(dna.seed, 'TRAD'));
  const trade = pickWeighted<'vault' | 'alchemist' | 'toolmaker' | 'jeweller'>(tradeRand, [
    ['vault', 0.40],
    ['alchemist', 0.25],
    ['toolmaker', 0.25],
    ['jeweller', 0.10],
  ]);
  if (trade === 'alchemist') {
    const pipeRun = buildPipeRun({
      segments: [
        { dir: 'up', length: roofBaseY * 0.8 },
        { dir: 'right', length: 0.2 },
        { dir: 'up', length: 0.3 },
      ],
      radius: 0.045,
      material: palette.iron,
      start: new THREE.Vector3(halfW - 0.15, 0, halfD - 0.3),
    });
    pipeRun.name = 'dwarven-shop-pipe-vent';
    g.add(pipeRun);
  }

  // Upper feature (only meaningful when no loft already occupies the
  // roof plane): none 0.45 / sign stack 0.25 / hex equipment bay 0.20 /
  // dormer 0.10.
  if (!hasLoft) {
    const featureRand = mulberry32(tagSeed(dna.seed, 'FEAT'));
    const feature = pickWeighted<'none' | 'stack' | 'hexbay' | 'dormer'>(featureRand, [
      ['none', 0.45],
      ['stack', 0.25],
      ['hexbay', 0.20],
      ['dormer', 0.10],
    ]);
    if (feature === 'stack') {
      const stack = buildSignStack(palette);
      stack.position.set(0, roofBaseY + ridgeHeight * 0.6, 0);
      g.add(stack);
    } else if (feature === 'hexbay') {
      const hexBay = buildHexEquipmentBay(Math.min(halfW, halfD) * 0.4, 0.5, tagSeed(dna.seed, 'HEXB'), palette.granite);
      hexBay.position.y = roofBaseY + ridgeHeight * 0.3;
      g.add(hexBay);
    } else if (feature === 'dormer') {
      const dormer = buildDormer(tagSeed(dna.seed, 'DORM'), palette, openingPalette);
      dormer.position.set(0, roofBaseY + ridgeHeight * 0.3, loftHalfD * 0.6);
      g.add(dormer);
    }
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Blacksmith (flagship)
// ─────────────────────────────────────────────────────────────────────────

const FORGE_EAVE_HEIGHT = 2.65;
const FORGE_HOUSE_HALF_W = 1.3;
const YARD_HALF_W = 1.2;
const YARD_LOW_WALL_HEIGHT = 1.15;

/** Builds a low paver-grid yard floor: a grid of individually raised stone
 * tile plates (never a bare flat plane), with a strip of heat-stained dark
 * plates along the edge nearest the forge house. */
function buildYardPaverFloor(
  halfW: number,
  halfD: number,
  innerEdgeLocalX: number,
  palette: DwarvenPalette,
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'yard-pavers';
  const rand = mulberry32(seed >>> 0);
  const cols = 5;
  const rows = 7;
  const tileW = (halfW * 2) / cols;
  const tileD = (halfD * 2) / rows;
  for (let cx = 0; cx < cols; cx++) {
    for (let rz = 0; rz < rows; rz++) {
      const x = -halfW + tileW * (cx + 0.5);
      const z = -halfD + tileD * (rz + 0.5);
      const nearForge = Math.abs(x - innerEdgeLocalX) < tileW * 1.5;
      const material = nearForge ? palette.soot : palette.granite;
      const tile = new THREE.Mesh(new THREE.BoxGeometry(tileW * 0.92, 0.05, tileD * 0.92), material);
      tile.name = `paver-${cx}-${rz}`;
      tile.position.set(x, 0.025 + (rand() - 0.5) * 0.01, z);
      tile.castShadow = tile.receiveShadow = true;
      g.add(tile);
    }
  }
  return g;
}

/** Builds a small side coal/ore lean-to shed: a low battered box mass with
 * a single-slope roof panel, attached at the yard's rear-outer corner --
 * see design spec's blacksmith massing bullet ("side coal/ore lean-to").
 * Houses the ore/coal bin prop. */
function buildCoalOreLeanTo(seed: number, palette: DwarvenPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'coal-ore-lean-to';
  const halfW = 0.55;
  const halfD = 0.45;
  const height = YARD_LOW_WALL_HEIGHT * 0.9;
  const mass = buildMassFromSpec({ points: rectanglePoints(halfW, halfD), faces: rectangleFaces(halfW, halfD), height }, seed, palette.basalt);
  g.add(mass);
  const roofSpan = Math.hypot(halfD * 2, height * 0.4);
  const slopeAngle = Math.atan2(height * 0.4, halfD * 2);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.15, 0.08, roofSpan), palette.roofMetal);
  panel.name = 'lean-to-roof-panel';
  panel.position.set(0, height + height * 0.2, 0);
  panel.rotation.x = -slopeAngle;
  panel.castShadow = panel.receiveShadow = true;
  g.add(panel);
  const bin = buildOreCoalBin({ width: halfW * 1.5, depth: halfD * 1.3, height: 0.3, seed: tagSeed(seed, 'BIN') }, palette);
  bin.position.set(0, 0, 0);
  g.add(bin);
  return g;
}

/** Builds the flagship dwarven blacksmith: a rear enclosed forge house
 * (darker basalt courses "around the furnace"), an open-front working
 * yard on the opposite side (paver-grid floor, a low side wall, and
 * lathe-column piers under a heavy lintel carrying the shared roof's open
 * eave), a side coal/ore lean-to, and one dominant corbelled forge
 * chimney -- see design spec section 4 `blacksmith` for the full
 * blueprint. Bellows, quench trough, anvil, ore/coal bin, and tool rack
 * are all always present in the yard (the design spec lists them as
 * unconditional working-yard fixtures, not axis-gated options) so the
 * yard reads "functional even from isometric distance" regardless of
 * seed; the "forge prop focus" variation axis instead only changes which
 * one prop sits most prominently front-and-center (the same
 * always-present-core-feature pattern used by villa's >=2 masses and
 * inn's porch posts). Tongs/scale/lantern-bracket clutter named in the
 * spec's prop list beyond these five is out of scope for this pass,
 * matching every prior kind's decorative-only omission precedent. */
export function buildDwarvenBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'dwarven-blacksmith';

  // Yard layout axis: which side the open yard sits on, and whether it
  // opens on a second (outer) face too ('side' variant).
  const layoutRand = mulberry32(tagSeed(dna.seed, 'LAYT'));
  const yardLayout = pickWeighted<'front-right' | 'front-left' | 'side' | 'covered'>(layoutRand, [
    ['front-right', 0.45],
    ['front-left', 0.25],
    ['side', 0.20],
    ['covered', 0.10],
  ]);
  const yardSide: 'left' | 'right' = yardLayout === 'front-left' ? 'left' : 'right';
  const yardOpenOuterSide = yardLayout === 'side';
  const mirror = yardSide === 'right' ? 1 : -1;

  const forgeCenterX = yardSide === 'right' ? -halfW + FORGE_HOUSE_HALF_W : halfW - FORGE_HOUSE_HALF_W;
  const yardCenterX = yardSide === 'right' ? halfW - YARD_HALF_W : -halfW + YARD_HALF_W;
  // Face index (in the forge house's own local rectangleFaces()) that
  // looks toward the yard: face 0 is the +X (right) face, face 2 is the
  // -X (left) face (see StoneTowerShape.ts's rectangleFaces() winding).
  const forgeToYardFaceIdx = yardSide === 'right' ? 0 : 2;
  const forgeOuterFaceIdx = forgeToYardFaceIdx === 0 ? 2 : 0;

  // ── Forge house: fully enclosed, darker basalt courses "around the
  // furnace" per the wall-system spec. ──────────────────────────────────
  const forgeGroup = new THREE.Group();
  forgeGroup.name = 'forge-house';
  const { group: forgeHall, faces: forgeFaces, points: forgePoints } = buildRectHall(
    FORGE_HOUSE_HALF_W,
    halfD,
    FORGE_EAVE_HEIGHT,
    tagSeed(dna.seed, 'FRGH'),
    palette.basalt,
  );
  forgeGroup.add(forgeHall);

  const forgePlinth = buildRockPlinthSkirt({
    points: forgePoints,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
  });
  forgeGroup.add(forgePlinth);

  // Forge mouth: the large shouldered forge opening, 1.55 W x 1.85 H,
  // opening toward the working yard so the bellows/anvil are reachable.
  // Heat state axis drives whether the "glazing" throat is an emissive
  // glow (glowing forge throat) or plain dark soot (cool/soot-heavy).
  const heatRand = mulberry32(tagSeed(dna.seed, 'HEAT'));
  const heatState = pickWeighted<'cool' | 'glowing' | 'sooty'>(heatRand, [
    ['cool', 0.20],
    ['glowing', 0.45],
    ['sooty', 0.35],
  ]);
  const forgeMouthPalette: DwarvenOpeningPalette = heatState === 'glowing'
    ? openingPalette
    : { ...openingPalette, forgeEmissive: undefined };
  const forgeMouth = buildDwarvenForgeMouth({
    width: 1.55,
    height: 1.85,
    wallZ: wallZFor(forgeToYardFaceIdx, FORGE_HOUSE_HALF_W, halfD),
    palette: forgeMouthPalette,
  });
  forgeMouth.name = 'forge-mouth';
  placeOnFace(forgeMouth, forgeFaces[forgeToYardFaceIdx]!, 0.5);
  forgeGroup.add(forgeMouth);

  // Heat/soot treatment: a proud dark soot-stained patch above the forge
  // mouth, always present (per the "always-present core feature" pattern)
  // -- scaled up for the soot-heavy state, minimal for cool/pristine.
  const sootScale = heatState === 'sooty' ? 1.4 : heatState === 'glowing' ? 1.0 : 0.55;
  const sootPatch = new THREE.Mesh(new THREE.BoxGeometry(1.2 * sootScale, 0.5 * sootScale, 0.05), palette.soot);
  sootPatch.name = 'forge-heat-treatment';
  sootPatch.position.copy(forgeMouth.position);
  sootPatch.position.y += 1.05;
  sootPatch.rotation.y = forgeMouth.rotation.y;
  sootPatch.position.x += Math.sin(forgeMouth.rotation.y) * 0.03;
  sootPatch.position.z += Math.cos(forgeMouth.rotation.y) * 0.03;
  sootPatch.castShadow = sootPatch.receiveShadow = true;
  forgeGroup.add(sootPatch);

  // Personnel door: 0.70 W x 1.55 H, on the forge house's own front face.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const personnelDoor = buildDwarvenDoor({
    width: 0.70,
    height: 1.55,
    wallZ: wallZFor(3, FORGE_HOUSE_HALF_W, halfD),
    palette: openingPalette,
    archRatio: 0.4 + doorRand() * 0.1,
  });
  personnelDoor.name = 'dwarven-door';
  placeOnFace(personnelDoor, forgeFaces[3]!, 0.5);
  forgeGroup.add(personnelDoor);

  // Side wall: 2 high vent slits, on the forge house's OUTER face (away
  // from the yard, which already carries the large forge mouth).
  const ventRand = mulberry32(tagSeed(dna.seed, 'VENT'));
  for (const t of [0.3, 0.7]) {
    const vent = buildDwarvenVentSlit({
      width: 0.28,
      height: 0.55,
      wallZ: wallZFor(forgeOuterFaceIdx, FORGE_HOUSE_HALF_W, halfD),
      palette: openingPalette,
      shape: 'round',
      archRatio: 0.4 + ventRand() * 0.1,
    });
    vent.name = 'dwarven-vent';
    vent.position.y = FORGE_EAVE_HEIGHT * 0.7;
    placeOnFace(vent, forgeFaces[forgeOuterFaceIdx]!, t);
    forgeGroup.add(vent);
  }

  // Rear: coal hatch, 0.55 x 0.55, on the back face.
  const coalHatch = buildDwarvenDoor({
    width: 0.55,
    height: 0.55,
    wallZ: wallZFor(1, FORGE_HOUSE_HALF_W, halfD),
    palette: openingPalette,
    archRatio: 0.15,
  });
  coalHatch.name = 'coal-hatch';
  placeOnFace(coalHatch, forgeFaces[1]!, 0.5);
  forgeGroup.add(coalHatch);

  forgeGroup.position.x = forgeCenterX;
  g.add(forgeGroup);

  // ── Working yard: open-front paver yard with a low side wall and
  // lathe-column piers holding up the shared roof's open eave. ─────────
  const yardGroup = new THREE.Group();
  yardGroup.name = 'working-yard';
  const outerEdge = yardCenterX + mirror * YARD_HALF_W;
  const innerEdge = yardCenterX - mirror * YARD_HALF_W;

  const pavers = buildYardPaverFloor(YARD_HALF_W, halfD, innerEdge - yardCenterX, palette, tagSeed(dna.seed, 'PAVE'));
  pavers.position.x = yardCenterX;
  yardGroup.add(pavers);

  // Low side wall: on the outer edge normally, or on the rear edge for
  // the 'side' layout (whose outer edge is open instead, per the yard
  // layout axis).
  if (yardOpenOuterSide) {
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(YARD_HALF_W * 2, YARD_LOW_WALL_HEIGHT, 0.14), palette.granite);
    rearWall.name = 'yard-low-wall';
    rearWall.position.set(yardCenterX, YARD_LOW_WALL_HEIGHT / 2, -halfD + 0.07);
    rearWall.castShadow = rearWall.receiveShadow = true;
    yardGroup.add(rearWall);
  } else {
    const outerWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, YARD_LOW_WALL_HEIGHT, halfD * 2), palette.granite);
    outerWall.name = 'yard-low-wall';
    outerWall.position.set(outerEdge - mirror * 0.07, YARD_LOW_WALL_HEIGHT / 2, 0);
    outerWall.castShadow = outerWall.receiveShadow = true;
    yardGroup.add(outerWall);
  }

  // Piers + heavy lintel under the open front bay (always), plus a
  // second open bay along the outer edge for the 'side' layout.
  const pierHeight = FORGE_EAVE_HEIGHT;
  const frontPierXs = [innerEdge, outerEdge];
  for (const px of frontPierXs) {
    const pier = buildLatheColumn({ height: pierHeight, radius: 0.11, crossSection: 'fluted', seed: tagSeed(dna.seed, `PIER${px}`) }, palette.basalt);
    pier.name = 'yard-pier';
    pier.position.set(px, 0, halfD - 0.08);
    yardGroup.add(pier);
  }
  const frontLintel = new THREE.Mesh(new THREE.BoxGeometry(YARD_HALF_W * 2 + 0.2, 0.22, 0.22), palette.iron);
  frontLintel.name = 'yard-lintel';
  frontLintel.position.set(yardCenterX, pierHeight, halfD - 0.08);
  frontLintel.castShadow = frontLintel.receiveShadow = true;
  yardGroup.add(frontLintel);

  if (yardOpenOuterSide) {
    const outerPier = buildLatheColumn({ height: pierHeight, radius: 0.11, crossSection: 'fluted', seed: tagSeed(dna.seed, 'PIERO') }, palette.basalt);
    outerPier.name = 'yard-pier';
    outerPier.position.set(outerEdge - mirror * 0.08, 0, -halfD + 0.6);
    yardGroup.add(outerPier);
    const outerLintel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, halfD * 2 - 0.9), palette.iron);
    outerLintel.name = 'yard-lintel';
    outerLintel.position.set(outerEdge - mirror * 0.08, pierHeight, halfD * 0.15);
    outerLintel.castShadow = outerLintel.receiveShadow = true;
    yardGroup.add(outerLintel);
  }

  // Bellows: standing against the forge house's yard-facing wall, near
  // the forge mouth.
  const bellows = buildBellows({ width: 0.65, height: 0.85, seed: tagSeed(dna.seed, 'BELL') }, palette);
  bellows.position.set(innerEdge + mirror * 0.35, 0.42, halfD * 0.35);
  bellows.rotation.y = mirror * (Math.PI / 2);
  yardGroup.add(bellows);

  // Quench trough: elsewhere in the yard, with its adjacent tongs rack.
  const trough = buildQuenchTrough({ width: 0.90, depth: 0.35, height: 0.35, seed: tagSeed(dna.seed, 'TRGH') }, palette);
  trough.position.set(yardCenterX - mirror * 0.1, 0, -halfD * 0.45);
  trough.rotation.y = mirror * (Math.PI / 2);
  yardGroup.add(trough);

  // Anvil block: central working spot.
  const anvil = buildAnvil({ seed: tagSeed(dna.seed, 'ANVL') }, palette);
  anvil.position.set(yardCenterX, 0, halfD * 0.1);
  yardGroup.add(anvil);

  // Tool rack: against the low side wall.
  const toolRack = buildToolRack({ width: 0.75, height: 1.0, seed: tagSeed(dna.seed, 'RACK') }, palette);
  toolRack.name = 'tool-rack';
  toolRack.position.set(outerEdge - mirror * 0.12, 0, halfD * 0.55);
  toolRack.rotation.y = -mirror * (Math.PI / 2);
  yardGroup.add(toolRack);

  g.add(yardGroup);

  // ── Side coal/ore lean-to (always present, per the massing bullet). ──
  const leanTo = buildCoalOreLeanTo(tagSeed(dna.seed, 'LEAN'), palette);
  leanTo.position.set(outerEdge - mirror * 0.55, 0, -halfD - 0.35);
  g.add(leanTo);

  // ── Dominant forge chimney: single 0.55 / stack+short-vent 0.30 / twin
  // narrow stacks 0.15. Rises from ground level against the forge house's
  // outer wall, well above the roofline (a "dominant" landmark stack, per
  // spec, unlike the smaller rooftop-only chimneys on house/inn). ───────
  const chimneyRand = mulberry32(tagSeed(dna.seed, 'CHIM'));
  const chimneyChoice = pickWeighted<'single' | 'stack-vent' | 'twin'>(chimneyRand, [
    ['single', 0.55],
    ['stack-vent', 0.30],
    ['twin', 0.15],
  ]);
  const chimneyHeight = 3.80 + chimneyRand() * 0.80;
  const chimneyX = forgeCenterX + mirror * (FORGE_HOUSE_HALF_W - 0.45);
  const chimneyZ = -halfD + 0.5;
  const flueOrientation = mirror > 0 ? 'east' : 'west';
  if (chimneyChoice === 'twin') {
    for (const sign of [-1, 1] as const) {
      const stack = buildCorbelledChimneyStack({
        width: 0.45,
        depth: 0.55,
        height: chimneyHeight * 0.92,
        courseCount: 5 + Math.round(chimneyRand() * 2),
        material: palette.basalt,
        collarMaterial: palette.iron,
        capMaterial: palette.basalt,
        flueMaterial: palette.soot,
        seed: tagSeed(dna.seed, `CHIM${sign}`),
        flueOrientation,
      });
      stack.name = 'forge-chimney';
      stack.position.set(chimneyX, 0, chimneyZ + sign * 0.35);
      g.add(stack);
    }
  } else {
    const stack = buildCorbelledChimneyStack({
      width: 0.70,
      depth: 0.85,
      height: chimneyHeight,
      courseCount: 5 + Math.round(chimneyRand() * 2),
      material: palette.basalt,
      collarMaterial: palette.iron,
      capMaterial: palette.basalt,
      flueMaterial: palette.soot,
      seed: tagSeed(dna.seed, 'CHIM'),
      flueOrientation,
    });
    stack.name = 'forge-chimney';
    stack.position.set(chimneyX, 0, chimneyZ);
    g.add(stack);
    if (chimneyChoice === 'stack-vent') {
      const vent = buildCorbelledChimneyStack({
        width: 0.28,
        depth: 0.32,
        height: chimneyHeight * 0.35,
        courseCount: 3,
        material: palette.basalt,
        collarMaterial: palette.iron,
        capMaterial: palette.basalt,
        flueMaterial: palette.soot,
        seed: tagSeed(dna.seed, 'CVNT'),
        flueOrientation,
      });
      vent.name = 'forge-secondary-vent';
      vent.position.set(chimneyX, 0, chimneyZ + 0.55);
      g.add(vent);
    }
  }

  // ── Shared roof over the full footprint (spans both the forge house
  // and the open yard, so the yard reads as a genuine open eave under
  // the same roofline): 55% low gabled metal-plate roof, 25% sawtooth
  // vent roof, 20% parapeted forge block. ──────────────────────────────
  const overallPoints = rectanglePoints(halfW, halfD);
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<DwarvenRoofFamily>(roofRand, [
    ['gable', 0.55],
    ['sawtooth', 0.25],
    ['parapet', 0.20],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 0.75;
  const roofPalette: DwarvenPalette = { ...palette, roofTile: palette.roofMetal };
  const eaveOverhangFrac = yardLayout === 'covered' ? 0.22 : 0.15;
  const roof = buildDwarvenRoof(roofFamily, halfW, halfD, overallPoints, ridgeHeight, tagSeed(dna.seed, 'ROOF'), roofPalette, eaveOverhangFrac);
  roof.position.y = FORGE_EAVE_HEIGHT;
  g.add(roof);

  // Ornament: hammer/anvil crest above the forge mouth, chevron heat
  // shield band, and metal banding on the lintel and chimney (the
  // chimney's own collar bands already provide its metal banding).
  const crest = buildShieldPlaque({ width: 0.5, height: 0.4, material: palette.iron });
  crest.name = 'dwarven-blacksmith-crest';
  crest.position.set(forgeCenterX, FORGE_EAVE_HEIGHT + 0.3, halfD * 0.02);
  crest.rotation.y = forgeFaces[3]!.normalAngle;
  g.add(crest);

  const heatShield = buildChevronBelt({ width: 1.0, material: palette.iron });
  heatShield.name = 'dwarven-blacksmith-heat-shield';
  heatShield.position.copy(forgeMouth.position);
  heatShield.position.y += 1.3;
  heatShield.rotation.y = forgeMouth.rotation.y;
  forgeGroup.add(heatShield);

  const lintelBand = buildMetalBand({ width: YARD_HALF_W * 2, depth: 0.24, material: palette.iron, thickness: 0.03, bandHeight: 0.05 });
  lintelBand.name = 'dwarven-blacksmith-lintel-band';
  lintelBand.position.set(yardCenterX, pierHeight - 0.15, halfD - 0.08);
  g.add(lintelBand);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapel
// ─────────────────────────────────────────────────────────────────────────

const CHAPEL_NAVE_HEIGHT = 3.00;
const CHAPEL_APSE_RADIUS = 1.3;
/** How far the octagonal apse's own center sits behind the nave's back
 * wall (as a fraction of its own radius) -- mirrors ElvenChapelKit.ts's
 * own `APSE_DOCK_FRAC` precedent exactly (same real-world docked-apse
 * seam detail, just generalized to the dwarven kit's own rectangular
 * `rectangleFaces()` nave instead of an octagonal one). */
const CHAPEL_APSE_DOCK_FRAC = 0.55;

/** Builds a brazier from its three named real parts (never a bare
 * cylinder/sphere stand-in): a tapered-vessel bowl, three angled tripod
 * legs, and a small recessed glowing ember plane set down inside the
 * bowl's own rim. */
function buildBrazier(seed: number, palette: DwarvenPalette): THREE.Group {
  const rand = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'dwarven-brazier';

  const bowlHeight = 0.22;
  const legHeight = 0.55;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.11, bowlHeight, 8), palette.iron);
  bowl.name = 'brazier-bowl';
  bowl.position.y = legHeight + bowlHeight / 2;
  bowl.castShadow = bowl.receiveShadow = true;
  g.add(bowl);

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + rand() * 0.15;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, legHeight, 6), palette.iron);
    leg.name = `brazier-leg-${i}`;
    leg.position.set(Math.sin(angle) * 0.1, legHeight / 2, Math.cos(angle) * 0.1);
    leg.rotation.z = Math.sin(angle) * 0.16;
    leg.rotation.x = -Math.cos(angle) * 0.16;
    leg.castShadow = leg.receiveShadow = true;
    g.add(leg);
  }

  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 8), palette.forgeEmissive ?? palette.soot);
  ember.name = 'brazier-ember-plane';
  ember.position.y = legHeight + bowlHeight * 0.65;
  g.add(ember);

  return g;
}

/**
 * Builds a low dwarven chapel: a long rectangular nave (`rectangleFaces()`,
 * fixed 4x8 footprint) on an extra-high 0.45 WU plinth with a rear rock
 * cheek, a monumental low-arched ancestor door wrapped in a 9-11-voussoir
 * ring with a raised keystone crest and flanking fluted lathe columns,
 * heavy side buttresses along both long walls, one of three rear-core
 * variants (octagonal apse with three exposed faces / rock-cut altar wall
 * / low parapet sanctuary), one of three roof families (heavy gable / low
 * vault-parapet / octagonal cap over the apse), a 4-position side-window
 * rhythm (slit arches / oculi+slits / mostly blind raised panels), ridge
 * stones plus two short capped roof vents, an unconditional raised
 * ancestor-rune/chevron plaque, and one "sacred exterior" prop (twin
 * braziers / extra ancestor plaques / a small bell-vent cap / plinth
 * monument stones) -- see design spec section 4 `chapel`. Deliberately NO
 * full cathedral tower: the tallest feature is the roof ridge (and, only
 * in the 'octagonal-cap' branch, a squat conical cap over the rear apse),
 * never a freestanding tower mass, matching the spec's explicit ban.
 */
export function buildDwarvenChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'dwarven-chapel';

  const nave = buildRectHall(halfW, halfD, CHAPEL_NAVE_HEIGHT, tagSeed(dna.seed, 'NAVE'), palette.granite);
  g.add(nave.group);

  // Extra-high plinth (3 courses @ 0.15 WU = 0.45 WU total, per spec) plus
  // front entry steps and a rear rock cheek piled against the nave's own
  // back wall (`buildRockPlinthSkirt`'s existing `rearRockCheek` option --
  // no new kit code needed, this feature already exists for exactly this
  // purpose).
  const plinth = buildRockPlinthSkirt({
    points: nave.points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    plinthLevels: 3,
    plinthCourseHeight: 0.15,
    stepsFace: nave.faces[3],
    rearRockCheek: true,
    rearCheekFace: nave.faces[1],
  });
  g.add(plinth);

  // Ancestor door: low/squat arch, 1.05 W x 1.85 H, voussoir ring (9 or 11
  // total voussoirs per spec's "9-11 voussoirs"), a keystone crest plaque
  // distinct from the arch's own masonry keystone, and flanking fluted
  // lathe columns with bases/caps (never bare freestanding cylinders).
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorWidth = 1.05;
  const doorHeight = 1.85;
  const doorArchRatio = 0.5 + doorRand() * 0.1;
  const door = buildDwarvenDoor({
    width: doorWidth,
    height: doorHeight,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: doorArchRatio,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, nave.faces[3]!, 0.5);
  g.add(door);

  const doorPointHeight = Math.min(doorHeight * 0.4, (doorWidth / 2) * doorArchRatio);
  const doorStraightHeight = Math.max(doorHeight * 0.6, doorHeight - doorPointHeight);
  const voussoirCount = doorRand() < 0.5 ? 4 : 5; // 2*4+1=9 or 2*5+1=11 total
  const archGroup = buildVoussoirArch({
    width: doorWidth * 1.35,
    springHeight: doorStraightHeight + 0.1,
    archRatio: doorArchRatio,
    material: palette.granite,
    voussoirCount,
    seed: tagSeed(dna.seed, 'ARCH'),
  });
  archGroup.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(archGroup, nave.faces[3]!, 0.5);
  g.add(archGroup);

  const crest = buildShieldPlaque({ width: 0.34, height: 0.4, material: palette.iron, motif: 'hammer' });
  crest.name = 'dwarven-chapel-keystone-crest';
  crest.position.set(0, doorStraightHeight + 0.55, halfD + 0.05);
  g.add(crest);

  for (const cx of [-1, 1]) {
    const column = buildLatheColumn({
      height: doorStraightHeight + 0.25,
      radius: 0.15,
      crossSection: 'fluted',
      seed: tagSeed(dna.seed, `COLM${cx}`),
    }, palette.granite);
    column.position.set(cx * (doorWidth / 2 + 0.2), 0, halfD + 0.08);
    g.add(column);
  }

  // Heavy side buttresses: 3 per long wall (6 total), evenly spaced.
  // Buttresses aren't built by a wallZ-aware opening preset, so (matching
  // the plain-mesh convention used everywhere else in this file) their own
  // pre-rotation local z is set explicitly to the wall's own distance from
  // center before `placeOnFace()` rotates+translates the whole assembly
  // onto the target face.
  for (const fi of [0, 2]) {
    for (const t of [0.2, 0.5, 0.8]) {
      const buttress = buildButtress({
        height: CHAPEL_NAVE_HEIGHT * 0.85,
        width: 0.45,
        depth: 0.4,
        stages: 2,
        seed: tagSeed(dna.seed, `BUTR${fi}_${Math.round(t * 10)}`),
      }, palette.basalt);
      buttress.position.z = wallZFor(fi, halfW, halfD) - 0.15;
      placeOnFace(buttress, nave.faces[fi]!, t);
      g.add(buttress);
    }
  }

  // Window rhythm axis: 4 slit arches 0.40 / 2 oculi + 2 slits 0.35 /
  // mostly blind panels 0.25 -- always exactly 4 side positions (2 per
  // long wall), each becoming a real opening or (in the 'blind' branch,
  // for 3 of the 4 positions) a raised blind panel -- per the design
  // spec's "four side openings or blind panels" rule and the
  // no-flat-coplanar-surface doctrine rule (the blind panel is a real
  // proud beveled plaque, not a flat texture swap).
  const rhythmRand = mulberry32(tagSeed(dna.seed, 'RHYT'));
  const rhythm = pickWeighted(rhythmRand, [
    ['slits', 0.40],
    ['mixed', 0.35],
    ['blind', 0.25],
  ] as Array<['slits' | 'mixed' | 'blind', number]>);

  const sidePositions: Array<{ fi: number; t: number }> = [
    { fi: 0, t: 0.3 },
    { fi: 0, t: 0.7 },
    { fi: 2, t: 0.3 },
    { fi: 2, t: 0.7 },
  ];
  sidePositions.forEach(({ fi, t }, idx) => {
    const wallZ = wallZFor(fi, halfW, halfD);
    if (rhythm === 'blind' && idx !== 1) {
      const panel = buildShieldPlaque({ width: 0.4, height: 0.6, material: palette.granite, motif: 'plain' });
      panel.name = 'chapel-blind-panel';
      panel.position.y = CHAPEL_NAVE_HEIGHT * 0.5;
      panel.position.z = wallZ + 0.02;
      placeOnFace(panel, nave.faces[fi]!, t);
      g.add(panel);
      return;
    }
    if (rhythm === 'mixed' && idx % 2 === 0) {
      const oculus = buildDwarvenOculus({ diameter: 0.55, wallZ, palette: openingPalette });
      oculus.name = 'dwarven-oculus';
      oculus.position.y = CHAPEL_NAVE_HEIGHT * 0.55;
      placeOnFace(oculus, nave.faces[fi]!, t);
      g.add(oculus);
      return;
    }
    const win = buildDwarvenWindow({ width: 0.42, height: 0.85, wallZ, palette: openingPalette, archRatio: 0.5 });
    win.name = 'dwarven-window';
    win.position.y = CHAPEL_NAVE_HEIGHT * 0.5;
    placeOnFace(win, nave.faces[fi]!, t);
    g.add(win);
  });

  // Rear core axis: octagonal apse 0.50 / rock-cut altar wall 0.30 / low
  // parapet sanctuary 0.20.
  const rearRand = mulberry32(tagSeed(dna.seed, 'REAR'));
  const rearCoreType = pickWeighted(rearRand, [
    ['apse', 0.50],
    ['rock-altar', 0.30],
    ['parapet-sanctuary', 0.20],
  ] as Array<['apse' | 'rock-altar' | 'parapet-sanctuary', number]>);

  let apseCapY: number | undefined;
  if (rearCoreType === 'apse') {
    const apseHeight = CHAPEL_NAVE_HEIGHT * 0.75;
    const allFaces = octagonFaces(CHAPEL_APSE_RADIUS);
    // Three exposed faces (of the octagon's 8), the ones reading as "away
    // from the nave" once the whole assembly is docked behind the nave's
    // own rear wall -- per spec's "three exposed faces" (a full 8-face
    // ring would look like a sealed cell floating behind the nave; a
    // symmetric 2-face opening -- as ElvenChapelKit.ts's own apse uses --
    // reads as a much larger 6-face room, too big for this squat altar
    // core).
    const apseSeed = tagSeed(dna.seed, 'APSE');
    const exposedFaces = allFaces.filter((_, i) => i === 3 || i === 4 || i === 5);
    const apseGroup = new THREE.Group();
    apseGroup.name = 'chapel-rear-core';
    const walls = buildWallSurfaceBlocks(0, apseHeight, apseSeed, palette.granite, { facesOverride: exposedFaces });
    apseGroup.add(walls);
    const quoins = buildQuoins(CHAPEL_APSE_RADIUS, apseHeight, undefined, palette.granite);
    apseGroup.add(quoins);
    const floorCap = buildFloorCap(CHAPEL_APSE_RADIUS, palette.granite);
    floorCap.position.y = apseHeight;
    apseGroup.add(floorCap);

    // Round oculus (0.65 diameter) with a cross mullion, recessed behind
    // the opening's own ring frame (the standard five-piece window recess
    // already IS that ring frame -- no extra geometry needed).
    const apseOculus = buildDwarvenOculus({
      diameter: 0.65,
      wallZ: CHAPEL_APSE_RADIUS,
      palette: openingPalette,
      divisionStyle: 'cross',
    });
    apseOculus.name = 'dwarven-oculus';
    apseOculus.position.y = apseHeight * 0.55;
    placeOnFace(apseOculus, allFaces[4]!, 0.5);
    apseGroup.add(apseOculus);

    apseGroup.position.z = -halfD - CHAPEL_APSE_RADIUS * (1 - CHAPEL_APSE_DOCK_FRAC);
    g.add(apseGroup);
    apseCapY = apseHeight;
  } else if (rearCoreType === 'rock-altar') {
    // Rock-cut altar wall: a jumble of large boulder chunks stacked flush
    // against the nave's own rear wall -- a real carved-outcrop
    // silhouette (irregular jittered boxes), never a bare flat wall
    // pretending to be "rock-cut" nor a blob primitive.
    const altarGroup = new THREE.Group();
    altarGroup.name = 'chapel-rear-core';
    const altarRand = mulberry32(tagSeed(dna.seed, 'ALTR'));
    const chunkCount = 7;
    for (let i = 0; i < chunkCount; i++) {
      const w = 0.35 + altarRand() * 0.25;
      const h = 0.3 + altarRand() * 0.35;
      const d = 0.3 + altarRand() * 0.2;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), palette.basalt);
      chunk.name = `chapel-altar-chunk-${i}`;
      chunk.position.set(
        (altarRand() - 0.5) * (halfW * 1.6),
        h / 2 + altarRand() * 0.3,
        -halfD - d * 0.3 - altarRand() * 0.15,
      );
      chunk.rotation.y = (altarRand() - 0.5) * 0.4;
      chunk.castShadow = chunk.receiveShadow = true;
      altarGroup.add(chunk);
    }
    g.add(altarGroup);
  } else {
    // Low parapet sanctuary: a smaller, lower rectangular annex behind the
    // nave, topped with its own coped-parapet roof -- a genuinely
    // different, low, flat-roofed extension (never a re-skin of the
    // octagonal apse).
    const sanctuaryHalfW = halfW * 0.6;
    const sanctuaryHalfD = halfD * 0.22;
    const sanctuaryHeight = CHAPEL_NAVE_HEIGHT * 0.42;
    const sanctuaryGroup = new THREE.Group();
    sanctuaryGroup.name = 'chapel-rear-core';
    const sanctuaryPoints = rectanglePoints(sanctuaryHalfW, sanctuaryHalfD);
    const sanctuary = buildMassFromSpec(
      { points: sanctuaryPoints, faces: rectangleFaces(sanctuaryHalfW, sanctuaryHalfD), height: sanctuaryHeight },
      tagSeed(dna.seed, 'SANC'),
      palette.granite,
    );
    sanctuaryGroup.add(sanctuary);
    const sanctuaryRoof = buildParapetRoof(sanctuaryPoints, palette, 0.2);
    sanctuaryRoof.position.y = sanctuaryHeight;
    sanctuaryGroup.add(sanctuaryRoof);
    sanctuaryGroup.position.z = -halfD - sanctuaryHalfD;
    g.add(sanctuaryGroup);
  }

  // Roof family axis: gabled stone 0.45 / low vault-parapet 0.35 /
  // octagonal cap 0.20. 'vault-parapet' and 'octagonal-cap' both give the
  // nave itself the kit's low coped-parapet stand-in for "low vault" --
  // 'octagonal-cap"'s own distinguishing silhouette is the extra conical
  // cap added below over the rear apse (only when the rear core actually
  // IS an apse), per the spec's "octagonal conical cap OVER REAR CORE"
  // wording (not a main-roof silhouette in its own right).
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted(roofRand, [
    ['gabled', 0.45],
    ['vault-parapet', 0.35],
    ['octagonal-cap', 0.20],
  ] as Array<['gabled' | 'vault-parapet' | 'octagonal-cap', number]>);

  const roofRise = Math.min(halfW, halfD) * 1.1;
  const ridgeWorldY = CHAPEL_NAVE_HEIGHT + roofRise;
  const naveRoof = roofFamily === 'gabled'
    ? buildDwarvenRoof('gable', halfW, halfD, nave.points, roofRise, tagSeed(dna.seed, 'ROOF'), palette)
    : buildDwarvenRoof('parapet', halfW, halfD, nave.points, roofRise, tagSeed(dna.seed, 'ROOF'), palette);
  naveRoof.position.y = CHAPEL_NAVE_HEIGHT;
  g.add(naveRoof);

  if (roofFamily === 'octagonal-cap' && apseCapY !== undefined) {
    const cap = buildHipRoof(CHAPEL_APSE_RADIUS, CHAPEL_APSE_RADIUS, apseCapY * 0.4 + 0.5, tagSeed(dna.seed, 'APCAP'), palette.roofTile, { shingle: { silhouette: 'rectangular' } });
    cap.name = 'chapel-apse-conical-cap';
    cap.position.set(0, apseCapY, -halfD - CHAPEL_APSE_RADIUS * (1 - CHAPEL_APSE_DOCK_FRAC));
    g.add(cap);
  }

  // Ridge stones: a proud stone cresting strip along the roof spine.
  const ridgeCresting = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, fp.d * 0.94), palette.basalt);
  ridgeCresting.name = 'chapel-ridge-stones';
  ridgeCresting.position.set(0, ridgeWorldY + 0.06, 0);
  ridgeCresting.castShadow = ridgeCresting.receiveShadow = true;
  g.add(ridgeCresting);

  // Two short capped roof vents -- reuses the same real course-and-collar
  // chimney technique at a small, purely decorative scale.
  for (const vz of [-halfD * 0.4, halfD * 0.4]) {
    const vent = buildCorbelledChimneyStack({
      width: 0.26,
      depth: 0.26,
      height: 0.55,
      material: palette.basalt,
      collarMaterial: palette.iron,
      capMaterial: palette.basalt,
      flueMaterial: palette.soot,
      seed: tagSeed(dna.seed, `VENT${Math.round(vz * 10)}`),
      courseCount: 3,
      collarBands: 1,
    });
    vent.name = 'chapel-roof-vent';
    vent.position.set(0, ridgeWorldY, vz);
    g.add(vent);
  }

  // Sacred exterior axis: twin braziers 0.35 / ancestor plaques 0.35 /
  // bell-vent cap 0.15 / plinth monuments 0.15.
  const sacredRand = mulberry32(tagSeed(dna.seed, 'SACR'));
  const sacredChoice = pickWeighted(sacredRand, [
    ['braziers', 0.35],
    ['plaques', 0.35],
    ['bell-cap', 0.15],
    ['monuments', 0.15],
  ] as Array<['braziers' | 'plaques' | 'bell-cap' | 'monuments', number]>);

  if (sacredChoice === 'braziers') {
    for (const cx of [-1, 1]) {
      const brazier = buildBrazier(tagSeed(dna.seed, `BRAZ${cx}`), palette);
      brazier.position.set(cx * (doorWidth / 2 + 0.55), 0, halfD + 0.35);
      g.add(brazier);
    }
  } else if (sacredChoice === 'plaques') {
    for (const fi of [0, 2]) {
      const plaque = buildShieldPlaque({ width: 0.3, height: 0.42, material: palette.iron, motif: 'anvil' });
      plaque.name = 'dwarven-chapel-sacred-plaque';
      plaque.position.y = CHAPEL_NAVE_HEIGHT * 0.75;
      plaque.position.z = wallZFor(fi, halfW, halfD) + 0.02;
      placeOnFace(plaque, nave.faces[fi]!, 0.5);
      g.add(plaque);
    }
  } else if (sacredChoice === 'bell-cap') {
    // A small bell/vent cap accent at the roof ridge center -- explicitly
    // NOT a full bell tower/cathedral tower (spec forbids that): just a
    // slightly taller central vent stack with a small cast bell nested in
    // its throat.
    const bellCap = buildCorbelledChimneyStack({
      width: 0.3,
      depth: 0.3,
      height: 0.75,
      material: palette.basalt,
      collarMaterial: palette.iron,
      capMaterial: palette.basalt,
      flueMaterial: palette.soot,
      seed: tagSeed(dna.seed, 'BELL'),
      courseCount: 4,
      collarBands: 2,
    });
    bellCap.name = 'dwarven-chapel-bell-vent-cap';
    bellCap.position.set(0, ridgeWorldY, 0);
    g.add(bellCap);

    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.14, 8), palette.iron);
    bell.name = 'dwarven-chapel-bell';
    bell.position.set(0, ridgeWorldY + 0.4, 0);
    bell.castShadow = bell.receiveShadow = true;
    g.add(bell);
  } else {
    // Plinth monument stones: 2-3 small standing slabs near the entry.
    const monRand = mulberry32(tagSeed(dna.seed, 'MONU'));
    const monumentCount = 2 + Math.round(monRand());
    for (let i = 0; i < monumentCount; i++) {
      const t = (i + 1) / (monumentCount + 1);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5 + monRand() * 0.15, 0.1), palette.basalt);
      slab.name = `dwarven-chapel-monument-${i}`;
      slab.position.set((t - 0.5) * halfW * 1.6, 0.25, halfD + 0.5);
      slab.rotation.y = (monRand() - 0.5) * 0.3;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
    }
  }

  // Unconditional ancestor runes/chevrons ornament: raised block plaques
  // (via the shared chevron-belt technique), not flat text, present
  // regardless of which "sacred exterior" axis choice was rolled above
  // (the spec's own "Ornament" bullet is separate from -- and additional
  // to -- the "Props"/"sacred exterior" variation-axis bullet).
  const ancestorPlaque = buildChevronBelt({ width: fp.w * 0.6, material: palette.iron });
  ancestorPlaque.name = 'dwarven-chapel-ancestor-plaque';
  ancestorPlaque.position.set(0, CHAPEL_NAVE_HEIGHT - 0.3, halfD + 0.04);
  g.add(ancestorPlaque);

  return g;
}

// ── Watchtower ────────────────────────────────────────────────────────────

const WATCHTOWER_TIER_HEIGHT_MIN = 2.40;
const WATCHTOWER_TIER_HEIGHT_MAX = 2.60;

/** Perpendicular distance from a regular octagon's own center to any of
 * its 8 faces (the "apothem"), given the vertex/circumradius `radius` --
 * `wallZFor()` only covers `rectangleFaces()`'s 4-face convention, so
 * octagonal-plan watchtower openings need this instead. For a regular
 * n-gon the apothem is `radius * cos(pi/n)`; n=8 here. */
function octagonApothem(radius: number): number {
  return radius * Math.cos(Math.PI / 8);
}

/**
 * Builds a tiny-footprint (fixed 2x2 WU), tall, tiered signal/mine-head
 * watchtower -- see design spec section 4 `watchtower`. A stepped drum of
 * 3-4 compressed tiers (`SteppedBatterProfile.makeSteppedOctagonTiers()`
 * for the octagonal plan, `makeBatteredRectangleTiers()` for the
 * square-chamfered plan -- both already batter 8% wider at the base and
 * inset 10% per tier out of the box, squarely inside the spec's own
 * "8-12% per tier" requirement) rising from a tight rock plinth, with a
 * low ground-floor door, alternating slit vents on the middle tiers (or
 * an oculus-only top per the openings axis), 4 full-height vertical
 * buttress strips, a string course + corbel row at every tier line, an
 * unconditional chevron belt + metal band near the crown, a signal
 * brazier on the top platform, and a coped-parapet / signal-vent-cap /
 * conical-cap crown (never a flat-capped box).
 *
 * Plan axis deviates from the spec's literal 3-way table (octagonal 0.60
 * / square-chamfered 0.25 / hexagonal 0.15): the shared kit
 * (`StoneTowerShape.ts`) has no true hexagon primitive today (its
 * `octagonFaces()`/`rectanglePoints()` are fixed at 8/4 sides), and this
 * is the LAST of 8 dwarven kinds -- adding brand-new shared shape
 * geometry for a single 15%-weighted sub-variant isn't justified
 * reuse-first scope. Documented, deliberate simplification: the
 * "hexagonal" weight folds into "octagonal" (both read as a many-sided
 * drum), giving a 2-way axis of octagonal 0.70 / square-chamfered 0.30.
 */
export function buildDwarvenWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildDwarvenPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'dwarven-watchtower';

  const planRand = mulberry32(tagSeed(dna.seed, 'PLAN'));
  const plan = pickWeighted(planRand, [
    ['octagonal', 0.70],
    ['square', 0.30],
  ] as Array<['octagonal' | 'square', number]>);

  const tierRand = mulberry32(tagSeed(dna.seed, 'TIER'));
  const tierCount = tierRand() < 0.5 ? 3 : 4;
  const tierHeight = WATCHTOWER_TIER_HEIGHT_MIN + tierRand() * (WATCHTOWER_TIER_HEIGHT_MAX - WATCHTOWER_TIER_HEIGHT_MIN);
  const tierHeights = Array.from({ length: tierCount }, () => tierHeight);
  const baseRadius = Math.min(halfW, halfD);

  interface ResolvedTier {
    y: number;
    height: number;
    points: [number, number][];
    faces: OctagonFace[];
    halfW: number;
    halfD: number;
  }

  let resolvedTiers: ResolvedTier[];
  if (plan === 'octagonal') {
    resolvedTiers = makeSteppedOctagonTiers(baseRadius, tierHeights).map((t) => ({
      y: t.y,
      height: t.height,
      points: octagonPoints(t.radius),
      faces: t.faces,
      halfW: t.radius,
      halfD: t.radius,
    }));
  } else {
    resolvedTiers = makeBatteredRectangleTiers(baseRadius, baseRadius, tierHeights).map((t) => ({
      y: t.y,
      height: t.height,
      points: t.points,
      faces: t.faces,
      halfW: t.halfW,
      halfD: t.halfD,
    }));
  }

  const totalHeight = resolvedTiers.reduce((s, t) => s + t.height, 0);
  const groundTier = resolvedTiers[0]!;
  const topTier = resolvedTiers[resolvedTiers.length - 1]!;
  const doorFaceIndex = plan === 'octagonal' ? 0 : 3;
  const doorFace = groundTier.faces[doorFaceIndex]!;

  const wallZForTier = (tier: ResolvedTier, faceIndex: number): number =>
    plan === 'octagonal' ? octagonApothem(tier.halfW) : wallZFor(faceIndex, tier.halfW, tier.halfD);

  // Tiered wall masses: each a real per-course-block ring (`buildMassFromSpec`)
  // with its own quoins + floor cap (the floor cap is required, not just
  // decorative -- a narrower upper tier sitting on a wider one below
  // otherwise leaves an unfloored "shelf" exposing the hollow interior
  // through the block gaps, the exact bug StoneTowerFloorCap.ts's own doc
  // comment warns about), plus a string course and one corbel row (on the
  // door-facing face) marking every tier transition per spec.
  for (let i = 0; i < resolvedTiers.length; i++) {
    const tier = resolvedTiers[i]!;
    const mass = buildMassFromSpec(
      { points: tier.points, faces: tier.faces, height: tier.height },
      tagSeed(dna.seed, `TIER${i}`),
      palette.granite,
    );
    mass.name = `watchtower-tier-${i}`;
    mass.position.y = tier.y;
    g.add(mass);

    const course = buildStringCourse(tier.points, palette.basalt, 0.09);
    course.position.y = tier.y + tier.height;
    g.add(course);

    const corbels = buildCorbelRow({
      count: 3,
      spacing: Math.max(0.3, tier.halfW * 0.7),
      material: palette.basalt,
    });
    corbels.name = `watchtower-corbel-row-${i}`;
    corbels.position.y = tier.y + tier.height - 0.05;
    corbels.position.z = wallZForTier(tier, doorFaceIndex);
    placeOnFace(corbels, tier.faces[doorFaceIndex]!, 0.5);
    g.add(corbels);
  }

  // Ground door: a low, narrow arch (spec: 0.55 W x 1.35 H).
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const door = buildDwarvenDoor({
    width: 0.55,
    height: 1.35,
    wallZ: wallZForTier(groundTier, doorFaceIndex),
    palette: openingPalette,
    archRatio: 0.5 + doorRand() * 0.1,
  });
  door.name = 'dwarven-door';
  placeOnFace(door, doorFace, 0.5);
  g.add(door);

  // Openings axis: alternating slits 0.55 / oculus top only 0.15 / mostly
  // blind 0.30 -- governs whether the middle tiers (everything between
  // the ground door tier and the crown-facing top tier) get a real slit
  // vent each, none at all (leaving bare coursed masonry, itself already
  // a real, non-flat block-relief surface), or just the first one.
  const openingsRand = mulberry32(tagSeed(dna.seed, 'OPEN'));
  const openingsAxis = pickWeighted(openingsRand, [
    ['alternating-slits', 0.55],
    ['oculus-top-only', 0.15],
    ['mostly-blind', 0.30],
  ] as Array<['alternating-slits' | 'oculus-top-only' | 'mostly-blind', number]>);

  for (let i = 1; i < resolvedTiers.length - 1; i++) {
    if (openingsAxis === 'oculus-top-only') continue;
    if (openingsAxis === 'mostly-blind' && i !== 1) continue;
    const tier = resolvedTiers[i]!;
    const faceCount = tier.faces.length;
    // Alternate which face gets the slit tier-to-tier so the silhouette
    // doesn't read as one continuous vertical slot.
    const faceIndex = (doorFaceIndex + i * Math.max(1, Math.floor(faceCount / 2))) % faceCount;
    const face = tier.faces[faceIndex]!;
    const ventRand = mulberry32(tagSeed(dna.seed, `VENT${i}`));
    const vent = buildDwarvenVentSlit({
      width: 0.22,
      height: 0.55,
      wallZ: wallZForTier(tier, faceIndex),
      palette: openingPalette,
      shape: 'arch',
      archRatio: 0.5 + ventRand() * 0.1,
    });
    vent.name = 'dwarven-vent';
    vent.position.y = tier.y + tier.height * 0.5;
    placeOnFace(vent, face, 0.5);
    g.add(vent);
  }

  // Top: either 2-4 lookout slots under the crown coping, or (when the
  // openings axis rolled 'oculus-top-only') a single round oculus in
  // place of the middle-tier slits this axis omitted entirely.
  if (openingsAxis === 'oculus-top-only') {
    const oculusFaceIndex = (doorFaceIndex + Math.floor(topTier.faces.length / 2)) % topTier.faces.length;
    const oculusFace = topTier.faces[oculusFaceIndex]!;
    const oculus = buildDwarvenOculus({
      diameter: 0.4,
      wallZ: wallZForTier(topTier, oculusFaceIndex),
      palette: openingPalette,
    });
    oculus.name = 'dwarven-oculus';
    oculus.position.y = topTier.y + topTier.height * 0.55;
    placeOnFace(oculus, oculusFace, 0.5);
    g.add(oculus);
  } else {
    const lookoutRand = mulberry32(tagSeed(dna.seed, 'LOOK'));
    const lookoutCount = 2 + Math.floor(lookoutRand() * 3);
    const faceCount = topTier.faces.length;
    for (let k = 0; k < lookoutCount; k++) {
      const faceIndex = Math.floor((k / lookoutCount) * faceCount) % faceCount;
      const face = topTier.faces[faceIndex]!;
      const lookout = buildDwarvenVentSlit({
        width: 0.2,
        height: 0.4,
        wallZ: wallZForTier(topTier, faceIndex),
        palette: openingPalette,
        shape: 'round',
      });
      lookout.name = 'dwarven-vent';
      lookout.position.y = topTier.y + topTier.height * 0.78;
      placeOnFace(lookout, face, 0.5);
      g.add(lookout);
    }
  }

  // Four full-height vertical buttress strips at (near-)cardinal faces --
  // for the square plan all 4 faces already ARE true N/S/E/W, for the
  // octagonal plan 4 faces spaced 90 degrees apart in index-terms
  // (indices 0/2/4/6) approximate cardinal placement (a regular octagon
  // has no face sitting at exactly 0/90/180/270, the same "no perfectly
  // symmetric cardinal subset on 8 faces" constraint already documented
  // for the chapel's apse). Buttresses stay flush with the GROUND tier's
  // own wall plane for their full run (they don't step in with the
  // tiers above), the same real "buttress ignores the tower's own
  // taper" silhouette read used on real fortified towers.
  const buttressFaceIndices = plan === 'octagonal' ? [0, 2, 4, 6] : [0, 1, 2, 3];
  for (const fi of buttressFaceIndices) {
    const face = groundTier.faces[fi]!;
    const buttressRand = tagSeed(dna.seed, `BUTT${fi}`);
    const buttress = buildButtress(
      { height: totalHeight, width: 0.22, depth: 0.16, stages: Math.max(2, resolvedTiers.length - 1), cap: 'flat', seed: buttressRand },
      palette.granite,
    );
    buttress.name = `buttress-${fi}`;
    buttress.position.z = wallZForTier(groundTier, fi) - 0.04;
    placeOnFace(buttress, face, 0.5);
    g.add(buttress);
  }

  // Ground axis: tight rock plinth 0.50 / stair-wrapped base 0.30 / rear
  // rock cheek 0.20 -- all 3 use `buildRockPlinthSkirt()`'s own existing
  // options, no new kit code needed (mirrors the chapel's reuse of the
  // same function's rearRockCheek feature).
  const groundRand = mulberry32(tagSeed(dna.seed, 'GRND'));
  const groundAxis = pickWeighted(groundRand, [
    ['tight-plinth', 0.50],
    ['stair-wrapped', 0.30],
    ['rock-cheek', 0.20],
  ] as Array<['tight-plinth' | 'stair-wrapped' | 'rock-cheek', number]>);
  const rearFaceIndex = (doorFaceIndex + Math.floor(groundTier.faces.length / 2)) % groundTier.faces.length;

  const plinth = buildRockPlinthSkirt({
    points: groundTier.points,
    material: palette.basalt,
    seed: tagSeed(dna.seed, 'PLIN'),
    plinthLevels: 1,
    plinthCourseHeight: 0.18,
    skirtMargin: 0.14,
    stepsFace: groundAxis !== 'rock-cheek' ? doorFace : undefined,
    stepCount: groundAxis === 'stair-wrapped' ? 3 : 2,
    stepWidth: groundAxis === 'stair-wrapped' ? 0.7 : 0.42,
    rearRockCheek: groundAxis === 'rock-cheek',
    rearCheekFace: groundTier.faces[rearFaceIndex],
  });
  g.add(plinth);

  // Crown axis: coped parapet 0.45 / signal vent cap 0.30 (a corbelled
  // stack standing on its own coped-parapet platform) / small conical
  // stone cap 0.25 (a steep hip-roof reused as a stone cone, the exact
  // technique already proven on the dwarven chapel's own apse cap) --
  // every branch is real volumetric roof geometry, never a flat-capped
  // box (per spec: "Merlons need coping, not teeth on a box").
  const crownRand = mulberry32(tagSeed(dna.seed, 'CROWN'));
  const crownFamily = pickWeighted(crownRand, [
    ['parapet', 0.45],
    ['vent-cap', 0.30],
    ['conical-cap', 0.25],
  ] as Array<['parapet' | 'vent-cap' | 'conical-cap', number]>);

  if (crownFamily === 'conical-cap') {
    const coneRise = Math.min(topTier.halfW, topTier.halfD) * 1.6;
    const cone = buildHipRoof(
      topTier.halfW, topTier.halfD, coneRise, tagSeed(dna.seed, 'CONE'), palette.roofTile,
      { shingle: { silhouette: 'rectangular' } },
    );
    cone.name = 'watchtower-conical-cap';
    cone.position.y = totalHeight;
    g.add(cone);
  } else {
    const parapet = buildParapetRoof(topTier.points, palette, 0.26);
    parapet.position.y = totalHeight;
    g.add(parapet);
    if (crownFamily === 'vent-cap') {
      const stack = buildCorbelledChimneyStack({
        width: 0.5,
        depth: 0.5,
        height: 1.1,
        courseCount: 5,
        material: palette.basalt,
        seed: tagSeed(dna.seed, 'STACK'),
      });
      stack.position.y = totalHeight + 0.26;
      g.add(stack);
    }
  }

  // Unconditional ornament (present regardless of crown/openings axis
  // rolls, per the spec's own separate "Ornament" bullet): a chevron
  // belt + a metal reinforcement band near the crown line.
  const chevron = buildChevronBelt({ width: Math.max(0.6, topTier.halfW * 1.4), material: palette.iron });
  chevron.position.y = totalHeight - 0.18;
  chevron.position.z = wallZForTier(topTier, doorFaceIndex);
  placeOnFace(chevron, topTier.faces[doorFaceIndex]!, 0.5);
  g.add(chevron);

  const metalBand = buildMetalBand({
    width: topTier.halfW * 2,
    depth: topTier.halfD * 2,
    material: palette.iron,
    bandHeight: 0.08,
    thickness: 0.02,
  });
  metalBand.position.y = totalHeight - 0.4;
  g.add(metalBand);

  // Signal brazier prop on the crown's own floor cap (spec: "small signal
  // brazier/lantern"), reusing the chapel's own 3-part bowl+legs+ember
  // brazier helper verbatim.
  const brazier = buildBrazier(tagSeed(dna.seed, 'BRZR'), palette);
  brazier.position.set(topTier.halfW * 0.3, totalHeight + 0.02, topTier.halfD * 0.3);
  g.add(brazier);

  return g;
}



