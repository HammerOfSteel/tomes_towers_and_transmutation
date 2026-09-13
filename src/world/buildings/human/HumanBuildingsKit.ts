import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from '../BuildingDNA';
import { getFootprint } from '../BuildingDNA';
import { rectanglePoints, rectangleFaces, type OctagonFace } from '../StoneTowerShape';
import { buildWallSurfaceBlocks } from '../StoneTowerWallSurface';
import { buildFloorCap } from '../StoneTowerFloorCap';
import { buildQuoins } from '../StoneTowerQuoins';
import { buildGableRoof, buildHipRoof, type RoofMassingOptions } from '../kit/RoofMassing';
import { buildThatchGableRoof } from '../kit/ThatchRoofSurface';
import { buildRockPlinthSkirt } from '../kit/RockPlinthSkirt';
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import {
  buildTimberFramePanel,
  buildTimberFrameFacade,
  type TimberFramePattern,
  type TimberFrameFacadeBay,
  type TimberFrameExclusion,
} from '../kit/TimberFrame';
import { buildHumanJetty } from './HumanJetty';
import { buildHumanWindow, buildHumanOculus, buildHumanDoor, type HumanOpeningPalette } from './HumanOpenings';
import { buildHumanPalette, type HumanPalette } from './HumanBuildingMaterials';
import { buildShutterPair } from '../kit/Shutter';
import { buildWallBracket, buildLanternCage } from '../kit/LanternKit';
import { buildStringCourse } from '../kit/StringCourse';
import { makeBatteredRectangleTiers } from '../kit/SteppedBatterProfile';
import { buildButtress } from '../kit/Buttress';
import { buildCorbelRow } from '../kit/AngularOrnament';
import { buildPlankCrate, buildStaveKeg, buildAnvil, buildCoalBin, buildSlagTrough, buildFirewoodBundle } from '../kit/SalvageSpoils';
import {
  buildFlowerBox,
  buildChoppingBlock,
  buildBench,
  buildHangingSign,
  buildToolRack,
  buildDrainSpout,
  buildWagonWheel,
  buildAwning,
  buildBannerPole,
  buildGraveMarker,
  buildCellarHatch,
  buildLaundryPole,
  type TradeIcon,
} from './HumanBuildingProps';
import { buildRailSection } from '../kit/Railing';
import { buildOrielBay } from '../kit/OrielBay';
import { buildPediment } from '../kit/Pediment';
import { buildFriezeBand } from '../kit/Frieze';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { composeMainAndWing, type WingSide } from '../kit/MassComposer';

/**
 * HumanBuildingsKit.ts — composes all eight canonical human building kinds
 * (docs/superpowers/specs/2026-09-04-human-buildings-design.md) from the
 * shared cross-race kit (`src/world/buildings/kit/`) plus the two flagship
 * human-authored shared modules (`kit/TimberFrame.ts`, `kit/
 * ThatchRoofSurface.ts`'s `buildThatchGableRoof`) and race-specific
 * `HumanJetty.ts`/`HumanOpenings.ts`/`HumanBuildingMaterials.ts`/
 * `HumanBuildingProps.ts`.
 *
 * Human is the BASELINE settlement kit (docs §2 "Baseline race, not bland
 * race"): every wall reads from a real proud/recessed depth ladder (the
 * timber frame sits forward, infill sits flush/recessed), every opening is
 * a genuine five-piece assembly, and every kind carries a mandatory
 * asymmetry source (off-centre door, one different shutter/chimney/bay,
 * a side lean-to, or a repaired panel) per doctrine Rule 7.
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared local helpers (mirrors DwarvenBuildingKit.ts's own conventions)
// ─────────────────────────────────────────────────────────────────────────

/** Turns a short ASCII tag into a seed-mixing constant -- gives every
 * sub-feature its own independent, deterministic RNG stream derived from
 * one building seed, matching every other race kit's own `tagSeed()`. */
function tagSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}

function pickWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, weight] of options) {
    r -= weight;
    if (r <= 0) return value;
  }
  return options[options.length - 1]![0];
}

/** Rotates + positions a CENTERED-origin object (windows/doors/oculi/jetty
 * assemblies -- everything built by `HumanOpenings.ts`/`HumanJetty.ts`,
 * whose own local x=0 is already the opening/jetty's own centerline) onto
 * a rectangle face at fractional position `t` along the face's own a->b
 * segment. Identical technique to every prior race kit's own
 * `placeOnFace()`. */
function placeOnFace(obj: THREE.Object3D, face: OctagonFace, t: number): void {
  obj.rotation.y = face.normalAngle;
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  const targetX = face.a[0] + (face.b[0] - face.a[0]) * t;
  const targetZ = face.a[1] + (face.b[1] - face.a[1]) * t;
  obj.position.x += targetX - midX;
  obj.position.z += targetZ - midZ;
}

/** Rotates + positions a LEFT-EDGE-origin object (a `buildTimberFrameFacade()`
 * whole-wall group, whose own local x=0 is its own LEFT edge, not its
 * center) directly onto a rectangle face: for an axis-aligned rectangle,
 * `face.a` already sits exactly on the wall plane at the correct depth, and
 * the local +X axis after `rotation.y = face.normalAngle` always points
 * from `face.a` toward `face.b` (verified by direct computation for all 4
 * rectangle faces), so no extra translation math is needed. */
function placeWallFacade(obj: THREE.Object3D, face: OctagonFace, baseY = 0): void {
  obj.position.set(face.a[0], baseY, face.a[1]);
  obj.rotation.y = face.normalAngle;
}

function faceLength(face: OctagonFace): number {
  return Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
}

/** Given a jetty projecting `projection` WU past the front (+Z) wall, this
 * returns the enlarged half-depth and forward Z-shift the ENTIRE upper
 * storey mass needs so its own front face lands exactly at the jetty's
 * new forward plane while its back face stays flush with the ground
 * floor's own back wall (no gap/notch at the rear) -- the side (party)
 * walls simply extend a little further forward too, which reads as the
 * jetty's corner return, a real Tudor-construction detail. */
function jettyUpperFootprint(halfD: number, projection: number): { halfDUpper: number; zOffset: number } {
  return { halfDUpper: halfD + projection / 2, zOffset: projection / 2 };
}

/** `buildHangingSign()`'s own local convention projects outward along its
 * local +X axis (a wall-bracket-arm design choice), unlike every other
 * wall-mounted prop in this file which already projects along local +Z
 * (matching `placeOnFace()`'s "local Z = outward normal" convention) --
 * this wraps it in a small mount group with a compensating -90 degree
 * pre-rotation so it always hangs straight out from the wall it's placed
 * on, never sideways along the facade. */
function mountHangingProp(obj: THREE.Object3D): THREE.Group {
  const mount = new THREE.Group();
  obj.rotation.y = -Math.PI / 2;
  mount.add(obj);
  return mount;
}

/** Perpendicular distance from a rectangular hall's center to a given
 * `rectangleFaces()` face -- faces 0/2 (right/left) use `halfD` (their
 * length runs along Z), faces 1/3 (back/front) use `halfW`. Wait: for a
 * CENTERED object's wallZ (the depth at which its local z=0 plane should
 * sit), the correct value is the face's OWN outward distance from origin,
 * which for face 0/2 is `halfW` and for face 1/3 is `halfD` (matching
 * every other race kit's own `wallZFor()`). */
function wallZFor(faceIndex: number, halfW: number, halfD: number): number {
  return faceIndex === 0 || faceIndex === 2 ? halfW : halfD;
}

/** BUGFIX (post-merge geometry audit): places a prop built with a
 * WALL-ATTACHMENT-PLANE-at-local-z=0 convention (`buildButtress()`,
 * `buildCorbelRow()`, `buildFriezeBand()`, `buildPediment()`,
 * `buildWallBracket()`, `buildOrielBay()`, `buildAwning()`,
 * `buildRailSection()`, `buildToolRack()`, `buildDrainSpout()`,
 * `buildHangingSign()`'s mount, `buildHumanJetty()`, and the parapet's
 * own merlons -- none of which accept a `wallZ` construction parameter
 * the way `buildHumanWindow`/`buildHumanDoor`/`buildHumanOculus`/
 * `buildShutterPair`/`buildArrowLoop` do) at the CORRECT depth from the
 * building's center axis, for ANY face (not just the rotation-0 front
 * face) -- including composed/absolute-coordinate faces (e.g. a wing's
 * own footprint from `composeMainAndWing()`), not just faces of a
 * rectangle centered at the origin.
 *
 * `placeOnFace()` alone only sets `obj.rotation.y` and an ALONG-FACE
 * (x/z) offset computed *relative to the face's own midpoint* -- for an
 * axis-aligned rectangle face that delta is ALWAYS zero in the
 * perpendicular (depth) direction, because both endpoints of any one
 * face share the same perpendicular coordinate. So a plain
 * `placeOnFace(obj, face, t)` leaves a depth-agnostic prop sitting
 * offset only relative to the face's own midpoint -- for a rectangle
 * centered at the world origin that means it lands ON the center axis
 * (`x=0` for a side face, `z=0` for a front/back face), and for an
 * off-center/composed face (a wing) it lands back at the WORLD origin,
 * nowhere near that face at all. Setting `obj.position.z =
 * wallZFor(...)` *before* calling `placeOnFace` (a pattern this file's
 * watchtower code briefly introduced, mirrored from the dwarven kit) is
 * ALSO wrong for any face whose `normalAngle` isn't 0:
 * `Object3D.position` is a translation in the PARENT's space and is
 * never itself re-rotated by that same object's own `rotation.y` --
 * only its children are.
 *
 * This was confirmed empirically (a standalone reproduction placed a
 * depth-only child at `(halfW, y, 0)`/`(0, y, -halfD)`/etc. instead of
 * the correct wall-plane position) and was found to affect real,
 * already-shipped geometry: the villa's `human-villa-cornice` was
 * landing at world Z=~0.01 (the building's OWN CENTERLINE) instead of
 * the front wall, and the chapel's nave buttresses were landing at
 * `|x|~0.15` (buried near the nave's centre) instead of flush against
 * the long walls at `|x|=halfW`.
 *
 * Fix: after `placeOnFace()` sets rotation, add back the face's own
 * absolute midpoint (which the along-face delta was computed relative
 * to, and which `placeOnFace` itself never adds) PLUS an optional small
 * `depth` delta along the face's own outward unit normal (`sin`/`cos`
 * of `face.normalAngle`) for props that sit slightly proud (positive)
 * or recessed (negative) of the wall's own flush surface -- both added
 * directly to `position` in WORLD/parent space, which is valid
 * regardless of the object's own rotation because it never goes
 * through a rotated local frame.
 *
 * IMPORTANT: `depth` here is a SMALL delta beyond the wall's own flush
 * position (typically -0.3..+0.3), NOT the full wall-distance value --
 * `midX`/`midZ` alone already reproduce the flush position (equal to
 * `wallZFor(faceIndex, halfW, halfD)` for a centered rectangle, or the
 * correct absolute wall position for an off-centre composed face like a
 * wing's), so passing `wallZFor(...)` itself as `depth` double-counts
 * the wall distance and places the object roughly TWICE as far from the
 * building as intended -- a mistake this file's own first draft of this
 * helper's call sites made and had to correct (verified numerically:
 * `depth=0` on a `halfD=2.0` front face correctly lands at world
 * `z=2.0`, matching `wallZFor`; passing `depth=halfD` there instead
 * wrongly lands at `z=4.0`). Use `depth=0` for a prop whose own local
 * z=0 already represents "at the wall" (confirmed true for every
 * builder listed above by inspecting its own geometry), and a small
 * nonzero `depth` only for props that need an explicit extra
 * proud/recessed push (e.g. a counter slab or awning meant to sit
 * further out than a flush wall bracket). */
function placeOnFaceAtDepth(obj: THREE.Object3D, face: OctagonFace, t: number, depth: number): void {
  placeOnFace(obj, face, t);
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  obj.position.x += midX + depth * Math.sin(face.normalAngle);
  obj.position.z += midZ + depth * Math.cos(face.normalAngle);
}

function toOpeningPalette(palette: HumanPalette): HumanOpeningPalette {
  return {
    timber: palette.oakTimber,
    stone: palette.weatheredStone,
    glazingMaterial: palette.glazing,
    litGlazing: palette.litGlazing,
    wood: palette.darkTimber,
    iron: palette.iron,
    recess: palette.plasterAlt,
  };
}

/** Builds a stone/rubble hall shell from an arbitrary set of footprint
 * points/faces (any `rectangleFaces()`/`composeMainAndWing()` output) --
 * coursed stone-block walls, corner quoins, and a floor cap. This is the
 * generalized form `buildStoneHall()` and villa wing masses both delegate
 * to. */
function buildStoneHallFromFaces(
  points: [number, number][],
  faces: OctagonFace[],
  height: number,
  seed: number,
  material: THREE.Material,
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  const longestFace = Math.max(...faces.map(faceLength));
  const walls = buildWallSurfaceBlocks(0, height, seed, material, {
    courseHeight: 0.34,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.65)),
    jitter: 0.05,
    facesOverride: faces,
  });
  g.add(walls);

  const halfExtent = longestFace / 2;
  const quoins = buildQuoins(halfExtent, height, undefined, material, points);
  quoins.name = 'human-hall-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, material, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'human-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Builds the stone/rubble ground-floor (or full masonry shell for
 * chapel/watchtower) hall: coursed stone-block walls, corner quoins, and a
 * floor cap -- direct human analogue of every other race kit's own
 * `buildRectHall()`. */
function buildStoneHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  material: THREE.Material,
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);
  return buildStoneHallFromFaces(points, faces, height, seed, material);
}

/** Builds one timber-framed wall face as a single-bay `TimberFrame` panel
 * (auto-split into real post-bounded sub-bays internally for any face
 * longer than the doctrine's 2.4 WU max post spacing), with an optional
 * punched aperture for a door/window, and places it directly onto the
 * given rectangle face. */
function buildTimberWallFace(
  face: OctagonFace,
  storeyHeight: number,
  seed: number,
  pattern: TimberFramePattern,
  palette: HumanPalette,
  exclude: TimberFrameExclusion | undefined,
  baseY: number,
  infillMaterial: THREE.Material = palette.plaster,
): THREE.Group {
  const width = faceLength(face);
  const panel = buildTimberFramePanel({
    width,
    height: storeyHeight,
    pattern,
    seed,
    timberMaterial: palette.oakTimber,
    infillMaterial,
    repairMaterial: palette.plasterRepair,
    exclude,
  });
  // buildTimberFramePanel is centered on its own local x=0; shift so its
  // LEFT edge is at local x=0, matching buildTimberFrameFacade's/
  // placeWallFacade's left-edge-origin convention.
  panel.position.x += width / 2;
  placeWallFacade(panel, face, baseY);
  return panel;
}

/** Builds a multi-bay timber-framed wall face (for facades needing more
 * than one opening/pattern change across their width, e.g. a villa or inn
 * front) and places it onto the given rectangle face. */
function buildTimberWallFacade(
  face: OctagonFace,
  storeyHeight: number,
  seed: number,
  bays: TimberFrameFacadeBay[],
  palette: HumanPalette,
  baseY: number,
  defaultPattern: TimberFramePattern = 'simpleBrace',
  infillMaterial: THREE.Material = palette.plaster,
): THREE.Group {
  const facade = buildTimberFrameFacade({
    bays,
    height: storeyHeight,
    seed,
    timberMaterial: palette.oakTimber,
    infillMaterial,
    repairMaterial: palette.plasterRepair,
    defaultPattern,
  });
  placeWallFacade(facade, face, baseY);
  return facade;
}

export type HumanRoofFamily = 'thatch-gable' | 'tile-gable' | 'slate-gable' | 'tile-hip' | 'slate-hip';

/** Weighted roof-family dispatcher: thatch uses the new self-contained
 * `buildThatchGableRoof()` composer; tile/slate use the shared
 * `RoofMassing.ts` gable/hip composers with the appropriate material. */
function buildHumanRoof(
  family: HumanRoofFamily,
  halfW: number,
  halfD: number,
  ridgeHeight: number,
  seed: number,
  palette: HumanPalette,
  eaveOverhangFrac?: number,
): THREE.Group {
  if (family === 'thatch-gable') {
    return buildThatchGableRoof(halfW, halfD, ridgeHeight, seed, palette.thatch, { eaveOverhangFrac: eaveOverhangFrac ?? 0.22 });
  }
  const opts: RoofMassingOptions = { shingle: { silhouette: 'rectangular' }, eaveOverhangFrac };
  const material = family.startsWith('slate') ? palette.slate : palette.clayTile;
  return family.endsWith('hip')
    ? buildHipRoof(halfW, halfD, ridgeHeight, seed, material, opts)
    : buildGableRoof(halfW, halfD, ridgeHeight, seed, material, opts);
}

/** Places a corbelled chimney stack at a rectangular hall's corner or
 * side-wall, standing on the roof plane. */
function placeChimney(
  halfW: number,
  halfD: number,
  baseY: number,
  placement: 'rear-left' | 'rear-right' | 'side-wall',
  palette: HumanPalette,
  seed: number,
  height = 1.25,
): THREE.Group {
  const chimney = buildCorbelledChimneyStack({
    width: 0.38,
    depth: 0.44,
    height,
    material: palette.weatheredStone,
    collarMaterial: palette.iron,
    capMaterial: palette.weatheredStone,
    flueMaterial: palette.darkTimber,
    seed,
  });
  chimney.name = 'human-chimney';
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

const STOREY_HEIGHT = 3.2;

// ─────────────────────────────────────────────────────────────────────────
// House
// ─────────────────────────────────────────────────────────────────────────

/** Builds a compact human house/cottage: rubble plinth, one storey (30%
 * chance of a second town floor), timber-frame or stone-base walls, an
 * off-centre plank door + windows, a thatch/tile/slate roof, optional
 * chimney, optional side lean-to, and doctrine-mandatory front asymmetry
 * (an off-centre door plus one shutter/panel variant). */
export function buildHumanHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', 'small');
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const extraFloors = mulberry32(tagSeed(dna.seed, 'FLR'))() < 0.3 ? 1 : 0;
  const floors = 1 + extraFloors;
  const wallHeight = STOREY_HEIGHT * floors;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-house';

  const wallSystemRand = mulberry32(tagSeed(dna.seed, 'WSYS'));
  const wallSystem = pickWeighted<'timber' | 'stone-base' | 'plank'>(wallSystemRand, [
    ['timber', 0.55],
    ['stone-base', 0.25],
    ['plank', 0.2],
  ]);

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  let baseY = 0;

  if (wallSystem === 'stone-base') {
    const groundHeight = Math.min(wallHeight * 0.4, 1.4);
    const { group: stoneGround } = buildStoneHall(halfW, halfD, groundHeight, tagSeed(dna.seed, 'GRND'), palette.weatheredStone);
    g.add(stoneGround);
    baseY = groundHeight;
  }

  // Timber-framed walls (or plank-cottage stand-in, same TimberFrame
  // structural grid with a plain plaster/plank infill material) from
  // baseY up to the roofline, one face at a time.
  const doorFaceIndex = 3; // +Z front
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorT = 0.35 + doorRand() * 0.12; // deliberately off-centre
  const doorWidth = 0.9;
  const doorHeight = 2.0;
  const doorFace = faces[doorFaceIndex]!;
  const doorFaceLen = faceLength(doorFace);
  const doorExclude: TimberFrameExclusion = {
    x: doorT * doorFaceLen - doorWidth / 2,
    y: 0,
    width: doorWidth,
    height: doorHeight,
  };

  const patternRand = mulberry32(tagSeed(dna.seed, 'PATT'));
  const frontPattern = pickWeighted<TimberFramePattern>(patternRand, [
    ['simpleBrace', 0.35],
    ['stAndrewsCross', 0.25],
    ['herringbone', 0.15],
    ['quatrefoil', 0.1],
    ['brickNogging', 0.1],
    ['repairPanel', 0.05],
  ]);
  const infillMaterial = wallSystem === 'plank' ? palette.darkTimber : palette.plaster;

  const front = buildTimberWallFace(doorFace, wallHeight - baseY, tagSeed(dna.seed, 'FRT'), frontPattern, palette, doorExclude, baseY, infillMaterial);
  g.add(front);

  const leanToRand = mulberry32(tagSeed(dna.seed, 'LEAN'));
  const hasLeanTo = leanToRand() < 0.35;
  const leanToSide = leanToRand() < 0.5 ? 0 : 2;

  for (const fi of [0, 1, 2] as const) {
    if (fi === leanToSide && hasLeanTo) continue; // lean-to occludes that face instead
    const patRand = mulberry32(tagSeed(dna.seed, `SIDE${fi}`));
    const pattern = pickWeighted<TimberFramePattern>(patRand, [
      ['simpleBrace', 0.5],
      ['brickNogging', 0.25],
      ['repairPanel', 0.15],
      ['stAndrewsCross', 0.1],
    ]);
    let exclude: TimberFrameExclusion | undefined;
    const winRand = mulberry32(tagSeed(dna.seed, `WIN${fi}`));
    const hasWindow = fi !== 1 ? winRand() < 0.85 : winRand() < 0.5;
    const winWidth = 0.72;
    const winHeight = 0.95;
    const face = faces[fi]!;
    const len = faceLength(face);
    if (hasWindow) {
      const t = 0.5 + (winRand() - 0.5) * 0.3;
      exclude = { x: t * len - winWidth / 2, y: (wallHeight - baseY) * 0.42, width: winWidth, height: winHeight };
    }
    const wall = buildTimberWallFace(face, wallHeight - baseY, tagSeed(dna.seed, `WALL${fi}`), pattern, palette, exclude, baseY, infillMaterial);
    g.add(wall);
    if (exclude) {
      const window = buildHumanWindow({
        width: winWidth,
        height: winHeight,
        wallZ: wallZFor(fi, halfW, halfD),
        palette: openingPalette,
        archRatio: 0,
      });
      window.name = 'human-window';
      window.position.y = baseY + exclude.y + winHeight / 2;
      placeOnFace(window, face, exclude.x / len + winWidth / 2 / len);
      g.add(window);
      if (winRand() < 0.6) {
        const shutters = buildShutterPair({ width: winWidth, height: winHeight, material: palette.darkTimber, hingeMaterial: palette.iron, wallZ: wallZFor(fi, halfW, halfD) + 0.02 });
        shutters.position.y = window.position.y - winHeight / 2;
        placeOnFace(shutters, face, exclude.x / len + winWidth / 2 / len);
        g.add(shutters);
      }
    }
  }

  // Front door.
  const door = buildHumanDoor({
    width: doorWidth,
    height: doorHeight,
    wallZ: wallZFor(doorFaceIndex, halfW, halfD),
    palette: openingPalette,
    stoneSurround: wallSystem === 'stone-base',
  });
  door.name = 'human-door';
  door.position.y = baseY;
  placeOnFace(door, doorFace, doorT);
  g.add(door);

  // Loft opening: round oculus (65%) or tiny dormer stand-in window (35%),
  // centered above the door on the front gable.
  const loftRand = mulberry32(tagSeed(dna.seed, 'LOFT'));
  if (loftRand() < 0.65) {
    const oculus = buildHumanOculus({ diameter: 0.5, wallZ: wallZFor(doorFaceIndex, halfW, halfD), palette: openingPalette });
    oculus.name = 'human-oculus';
    oculus.position.y = wallHeight - 0.5;
    placeOnFace(oculus, doorFace, 0.62);
    g.add(oculus);
  } else {
    const dormerWin = buildHumanWindow({ width: 0.5, height: 0.55, wallZ: wallZFor(doorFaceIndex, halfW, halfD), palette: openingPalette });
    dormerWin.name = 'human-dormer-window';
    dormerWin.position.y = wallHeight - 0.45;
    placeOnFace(dormerWin, doorFace, 0.62);
    g.add(dormerWin);
  }

  // Ground contact: rubble plinth + skirt + steps toward the door face.
  const plinth = buildRockPlinthSkirt({
    points,
    material: palette.weatheredStone,
    seed: tagSeed(dna.seed, 'PLIN'),
    stepsFace: doorFace,
  });
  g.add(plinth);

  // Roof: thatch steep gable 55% / tile gable 30% / slate half-hip 15%.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<HumanRoofFamily>(roofRand, [
    ['thatch-gable', 0.55],
    ['tile-gable', 0.3],
    ['slate-hip', 0.15],
  ]);
  const ridgeHeight = Math.max(halfD, halfW * 0.6) * 1.15;
  const roof = buildHumanRoof(roofFamily, halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette, roofFamily === 'thatch-gable' ? 0.22 : 0.18);
  roof.position.y = wallHeight;
  g.add(roof);

  // Chimney (85% chance -- "a settlement without chimneys reads
  // uninhabited").
  const chimneyRand = mulberry32(tagSeed(dna.seed, 'CHIM'));
  if (chimneyRand() < 0.85) {
    const placement = pickWeighted<'rear-left' | 'rear-right' | 'side-wall'>(chimneyRand, [
      ['rear-left', 0.4],
      ['rear-right', 0.4],
      ['side-wall', 0.2],
    ]);
    g.add(placeChimney(halfW, halfD, wallHeight, placement, palette, tagSeed(dna.seed, 'CHIM')));
  }

  // Lean-to shed on the chosen side (35% chance, computed above).
  if (hasLeanTo) {
    const leanWidth = 0.7;
    const leanHeight = wallHeight * 0.55;
    const leanFace = faces[leanToSide]!;
    const lean = new THREE.Group();
    lean.name = 'human-lean-to';
    const leanRoof = buildGableRoof(faceLength(leanFace) / 2, leanWidth / 2, leanHeight * 0.4, tagSeed(dna.seed, 'LEANR'), palette.clayTile, { eaveOverhangFrac: 0.15 });
    leanRoof.rotation.y = Math.PI / 2;
    leanRoof.position.y = leanHeight;
    const leanWall = buildTimberFramePanel({
      width: faceLength(leanFace),
      height: leanHeight,
      pattern: 'simpleBrace',
      seed: tagSeed(dna.seed, 'LEANW'),
      timberMaterial: palette.darkTimber,
      infillMaterial: palette.plasterRepair,
    });
    leanWall.position.x += faceLength(leanFace) / 2;
    lean.add(leanWall, leanRoof);
    lean.position.set(leanFace.a[0], 0, leanFace.a[1]);
    lean.rotation.y = leanFace.normalAngle;
    lean.position.x += Math.sin(leanFace.normalAngle) * leanWidth;
    lean.position.z += Math.cos(leanFace.normalAngle) * leanWidth;
    g.add(lean);

    const wood = buildFirewoodBundle({ material: palette.darkTimber, seed: tagSeed(dna.seed, 'WOOD') });
    wood.position.set(leanFace.a[0] * 0.6, 0, leanFace.a[1] * 0.6);
    g.add(wood);
  }

  // Ornament/props: flower box under a front window, chopping block +
  // barrel + bench near the door, lantern hook by the entrance.
  const propRand = mulberry32(tagSeed(dna.seed, 'PROP'));
  const flowerBox = buildFlowerBox({ boxMaterial: palette.darkTimber, seed: tagSeed(dna.seed, 'FLWR') });
  flowerBox.position.set(halfW * (propRand() < 0.5 ? -0.5 : 0.5), baseY + 0.6, halfD + 0.04);
  g.add(flowerBox);

  const chop = buildChoppingBlock({ woodMaterial: palette.darkTimber, bladeMaterial: palette.iron });
  chop.position.set(-halfW + 0.4, 0, halfD + 0.5);
  g.add(chop);

  const barrel = buildStaveKeg({ material: palette.darkTimber, hoopMaterial: palette.iron });
  barrel.position.set(halfW - 0.35, 0, halfD + 0.4);
  g.add(barrel);

  const lantern = buildWallBracket({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
  lantern.name = 'human-lantern';
  lantern.position.y = doorHeight + 0.2;
  placeOnFaceAtDepth(lantern, doorFace, doorT + (doorT < 0.5 ? 0.18 : -0.18), 0);
  g.add(lantern);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Terraced (row house)
// ─────────────────────────────────────────────────────────────────────────

/** Builds a narrow terraced row house: plain party-wall sides, a jettied
 * upper storey (70%) carried on a real bressummer/joist/corbel band, an
 * off-centre street door, one special upper bay (oriel or a
 * repaired/blocked panel), and a street-facing or shared-row roof. */
export function buildHumanTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const floors = pickWeighted<number>(mulberry32(tagSeed(dna.seed, 'FLR')), [[2, 0.75], [3, 0.25]]);
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-terraced';

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;

  // Off-centre street door + optional shop-like front window.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorT = pickWeighted<number>(doorRand, [[0.28, 0.5], [0.72, 0.5]]);
  const doorWidth = 0.8;
  const doorHeight = 2.0;
  const frontLen = faceLength(frontFace);
  const doorExclude: TimberFrameExclusion = { x: doorT * frontLen - doorWidth / 2, y: 0, width: doorWidth, height: doorHeight };
  const hasFrontWindow = mulberry32(tagSeed(dna.seed, 'FWIN'))() < 0.25;
  const frontWinT = doorT < 0.5 ? 0.78 : 0.22;
  const frontWinWidth = 0.7;

  // Ground floor: stone/brick 60%, timber/plaster 40%.
  const groundStone = mulberry32(tagSeed(dna.seed, 'GWS'))() < 0.6;
  if (groundStone) {
    const { group } = buildStoneHall(halfW, halfD, STOREY_HEIGHT, tagSeed(dna.seed, 'GRND'), palette.weatheredStone);
    g.add(group);
  } else {
    for (const fi of [0, 1, 2, 3] as const) {
      const face = faces[fi]!;
      const isParty = fi === 0 || fi === 2;
      const pattern: TimberFramePattern = isParty ? 'simpleBrace' : 'brickNogging';
      const exclude = fi === 3 ? doorExclude : undefined;
      const wall = buildTimberWallFace(face, STOREY_HEIGHT, tagSeed(dna.seed, `GW${fi}`), pattern, palette, exclude, 0, palette.brick);
      g.add(wall);
    }
  }
  if (hasFrontWindow) {
    if (groundStone) {
      // No exclude was punched (stone hall is solid); the window still
      // reads correctly sitting proud/recessed directly on the coursed
      // stone face, matching every other race kit's own stone-wall +
      // applied-opening convention.
    }
    const win = buildHumanWindow({ width: frontWinWidth, height: 1.15, wallZ: halfD, palette: openingPalette, stoneSurround: groundStone });
    win.name = 'human-window';
    win.position.y = 0.1 + 1.15 / 2;
    placeOnFace(win, frontFace, frontWinT);
    g.add(win);
  }

  const door = buildHumanDoor({ width: doorWidth, height: doorHeight, wallZ: halfD, palette: openingPalette, stoneSurround: groundStone });
  door.name = 'human-door';
  placeOnFace(door, frontFace, doorT);
  g.add(door);

  // Upper storey/storeys: jettied 70% (0.3-0.4 WU projection).
  const jettyRand = mulberry32(tagSeed(dna.seed, 'JETTY'));
  const hasJetty = jettyRand() < 0.7;
  const projection = 0.3 + jettyRand() * 0.1;
  let upperHalfD = halfD;
  let upperZOffset = 0;
  if (hasJetty) {
    const jettyFootprint = jettyUpperFootprint(halfD, projection);
    upperHalfD = jettyFootprint.halfDUpper;
    upperZOffset = jettyFootprint.zOffset;
    const { group: jettyGroup } = buildHumanJetty({
      width: frontLen,
      floorY: STOREY_HEIGHT,
      projection,
      seed: tagSeed(dna.seed, 'JETTYB'),
      timberMaterial: palette.oakTimber,
      shadowMaterial: palette.darkTimber,
    });
    placeOnFaceAtDepth(jettyGroup, frontFace, 0.5, 0);
    jettyGroup.position.y = 0;
    g.add(jettyGroup);
  }

  const upperFaces = rectangleFaces(halfW, upperHalfD);

  // Special upper bay: oriel (20%), repaired/blocked panel (10%), else a
  // plain 1-2 window schedule.
  const bayRand = mulberry32(tagSeed(dna.seed, 'BAY'));
  const specialBay = pickWeighted<'oriel' | 'repaired' | 'plain'>(bayRand, [['oriel', 0.2], ['repaired', 0.1], ['plain', 0.7]]);
  const upperWindowCount = 1 + (mulberry32(tagSeed(dna.seed, 'UWC'))() < 0.5 ? 1 : 0);

  for (let floorIdx = 0; floorIdx < floors - 1; floorIdx++) {
    const floorBaseY = STOREY_HEIGHT * (floorIdx + 1);
    const isTopFloor = floorIdx === floors - 2;
    const upperGroup = new THREE.Group();
    upperGroup.name = `human-terraced-upper-${floorIdx}`;
    upperGroup.position.y = 0;

    for (const fi of [0, 1, 2, 3] as const) {
      const face = upperFaces[fi]!;
      const isParty = fi === 0 || fi === 2;
      const len = faceLength(face);
      let exclude: TimberFrameExclusion | undefined;
      let pattern: TimberFramePattern = isParty ? 'simpleBrace' : 'stAndrewsCross';
      if (fi === 3 && isTopFloor && specialBay === 'repaired') {
        pattern = 'repairPanel';
      }
      if (fi === 3 && isTopFloor && specialBay === 'plain') {
        const t = upperWindowCount === 1 ? 0.5 : 0.32;
        exclude = { x: t * len - 0.6 / 2, y: 0.5, width: 0.6, height: 0.8 };
      } else if (fi === 3 && !isTopFloor) {
        exclude = { x: 0.5 * len - 0.6 / 2, y: 0.5, width: 0.6, height: 0.8 };
      }
      const wall = buildTimberWallFace(face, STOREY_HEIGHT, tagSeed(dna.seed, `UW${floorIdx}-${fi}`), pattern, palette, exclude, floorBaseY);
      upperGroup.add(wall);
      if (exclude) {
        const win = buildHumanWindow({ width: 0.6, height: 0.8, wallZ: wallZFor(fi, halfW, upperHalfD), palette: openingPalette });
        win.name = 'human-window';
        win.position.y = floorBaseY + exclude.y + 0.4;
        placeOnFace(win, face, (exclude.x + 0.3) / len);
        upperGroup.add(win);
        if (mulberry32(tagSeed(dna.seed, `USH${floorIdx}`))() < 0.5) {
          const shutters = buildShutterPair({ width: 0.6, height: 0.8, material: palette.darkTimber, hingeMaterial: palette.iron, wallZ: wallZFor(fi, halfW, upperHalfD) + 0.02 });
          shutters.position.y = win.position.y - 0.4;
          placeOnFace(shutters, face, (exclude.x + 0.3) / len);
          upperGroup.add(shutters);
        }
      }
      if (fi === 3 && isTopFloor && specialBay === 'oriel') {
        const oriel = buildOrielBay({
          width: 1.2,
          projection: 0.4,
          height: STOREY_HEIGHT * 0.75,
          wallMaterial: palette.oakTimber,
          roofMaterial: palette.clayTile,
          corbelMaterial: palette.weatheredStone,
          stoneMaterial: palette.weatheredStone,
          glazingMaterial: palette.glazing,
          seed: tagSeed(dna.seed, 'ORIEL'),
        });
        oriel.name = 'human-oriel';
        oriel.position.y = floorBaseY + STOREY_HEIGHT * 0.12;
        placeOnFaceAtDepth(oriel, face, 0.5, 0);
        upperGroup.add(oriel);
      }
    }
    upperGroup.position.z = upperZOffset;
    g.add(upperGroup);
  }

  // Roof: street gable 45% / side-gable shared row 35% / tile-gable +
  // dormer stand-in for "mansard/attic dormer" 20%.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofStyle = pickWeighted<'street-gable' | 'side-gable' | 'dormer'>(roofRand, [['street-gable', 0.45], ['side-gable', 0.35], ['dormer', 0.2]]);
  const roofMaterialFamily = pickWeighted<HumanRoofFamily>(mulberry32(tagSeed(dna.seed, 'ROOFM')), [['tile-gable', 0.65], ['slate-gable', 0.25], ['thatch-gable', 0.1]]);
  const roofBaseY = STOREY_HEIGHT * floors;
  const ridgeHeight = halfW * 1.35;
  let roof: THREE.Group;
  if (roofStyle === 'side-gable') {
    roof = buildHumanRoof(roofMaterialFamily, upperHalfD, halfW, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette, 0.18);
    roof.rotation.y = Math.PI / 2;
  } else {
    roof = buildHumanRoof(roofMaterialFamily, halfW, upperHalfD, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette, 0.18);
  }
  roof.position.set(0, roofBaseY, upperZOffset);
  g.add(roof);

  if (roofStyle === 'dormer') {
    const dormer = new THREE.Group();
    dormer.name = 'human-dormer';
    const dormerWall = buildTimberFramePanel({ width: 0.7, height: 0.7, pattern: 'simpleBrace', seed: tagSeed(dna.seed, 'DORM'), timberMaterial: palette.oakTimber, infillMaterial: palette.plaster });
    dormer.add(dormerWall);
    const dormerRoof = buildGableRoof(0.35, 0.3, 0.35, tagSeed(dna.seed, 'DORMR'), palette.clayTile, { eaveOverhangFrac: 0.15 });
    dormerRoof.position.y = 0.7;
    dormer.add(dormerRoof);
    dormer.position.set(0, roofBaseY + ridgeHeight * 0.35, upperZOffset + upperHalfD * 0.55);
    g.add(dormer);
    const dormerWin = buildHumanWindow({ width: 0.4, height: 0.4, wallZ: 0, palette: openingPalette });
    dormerWin.position.set(0, roofBaseY + ridgeHeight * 0.35 + 0.35, upperZOffset + upperHalfD * 0.55 + 0.36);
    g.add(dormerWin);
  }

  // Ground contact.
  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  // Shared party-wall chimney + stoop + street ornament.
  g.add(placeChimney(halfW, halfD, roofBaseY, mulberry32(tagSeed(dna.seed, 'CHS'))() < 0.5 ? 'rear-left' : 'rear-right', palette, tagSeed(dna.seed, 'CHIM')));

  const signMount = mountHangingProp(buildHangingSign({
    bracketMaterial: palette.iron,
    boardMaterial: palette.darkTimber,
    icon: pickWeighted<TradeIcon>(mulberry32(tagSeed(dna.seed, 'ICON')), [['boot', 0.25], ['loaf', 0.25], ['mug', 0.25], ['shears', 0.25]]),
  }));
  signMount.position.y = STOREY_HEIGHT + 0.4;
  placeOnFaceAtDepth(signMount, frontFace, doorT < 0.5 ? 0.75 : 0.25, 0);
  g.add(signMount);

  const shutters = buildShutterPair({ width: doorWidth, height: doorHeight * 0.5, material: palette.darkTimber, hingeMaterial: palette.iron, wallZ: halfD + 0.02 });
  shutters.position.y = STOREY_HEIGHT * 0.65;
  placeOnFace(shutters, frontFace, doorT < 0.5 ? 0.78 : 0.22);
  if (hasFrontWindow) g.add(shutters);

  const spout = buildDrainSpout({ material: palette.iron });
  spout.position.y = roofBaseY - 0.15;
  placeOnFaceAtDepth(spout, faces[0]!, 0.85, 0);
  g.add(spout);

  const laundry = buildLaundryPole({ poleMaterial: palette.darkTimber, clothMaterials: [palette.plasterAlt, palette.plaster], seed: tagSeed(dna.seed, 'LNDY') });
  laundry.position.set(halfW + 0.3, 0, -halfD + 0.5);
  g.add(laundry);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Villa (manor house)
// ─────────────────────────────────────────────────────────────────────────

/** Builds a human manor/villa: a stone-ground/timber-upper main hall with
 * an optional L-plan/T-plan/central wing (`composeMainAndWing`), a 4-5 bay
 * front with one deliberately altered bay, a door canopy, dormers, and a
 * compound tile/slate roof with 2+ chimneys. */
export function buildHumanVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const wallHeight = STOREY_HEIGHT * 2;

  const g = new THREE.Group();
  g.name = 'human-villa';

  const massingRand = mulberry32(tagSeed(dna.seed, 'MASS'));
  const massing = pickWeighted<'L' | 'T' | 'central' | 'compact'>(massingRand, [['L', 0.35], ['T', 0.25], ['central', 0.25], ['compact', 0.15]]);

  const groundStone = mulberry32(tagSeed(dna.seed, 'GWS'))() < 0.7;
  const upperTimber = mulberry32(tagSeed(dna.seed, 'UWS'))() < 0.65;

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;
  const frontLen = faceLength(frontFace);

  // Door: 1.1x2.2, off-centre, with a canopy/porch pediment.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorT = pickWeighted<number>(doorRand, [[0.38, 0.5], [0.62, 0.5]]);
  const doorWidth = 1.1;
  const doorHeight = 2.2;

  // Ground floor.
  if (groundStone) {
    const { group } = buildStoneHall(halfW, halfD, STOREY_HEIGHT, tagSeed(dna.seed, 'GRND'), palette.weatheredStone);
    g.add(group);
  } else {
    const bayCount = 4;
    const bays: TimberFrameFacadeBay[] = [];
    for (let i = 0; i < bayCount; i++) {
      const x = (i / bayCount) * frontLen;
      const width = frontLen / bayCount;
      const isDoorBay = doorT * frontLen >= x && doorT * frontLen < x + width;
      bays.push({ x, width, pattern: 'brickNogging', exclude: isDoorBay ? { x: doorT * frontLen - x - doorWidth / 2, y: 0, width: doorWidth, height: doorHeight } : { x: width * 0.3, y: 0.3, width: width * 0.4, height: 1.0 } });
    }
    const frontWall = buildTimberWallFacade(frontFace, STOREY_HEIGHT, tagSeed(dna.seed, 'GFRT'), bays, palette, 0);
    g.add(frontWall);
    for (const fi of [0, 1, 2] as const) {
      const wall = buildTimberWallFace(faces[fi]!, STOREY_HEIGHT, tagSeed(dna.seed, `GS${fi}`), 'brickNogging', palette, undefined, 0);
      g.add(wall);
    }
  }
  const door = buildHumanDoor({ width: doorWidth, height: doorHeight, wallZ: halfD, palette: openingPalette, stoneSurround: true });
  door.name = 'human-door';
  placeOnFace(door, frontFace, doorT);
  g.add(door);

  const canopy = buildPediment({ width: doorWidth + 0.5, variant: 'triangular', rise: 0.5, material: palette.weatheredStone, tympanumMaterial: palette.plaster });
  canopy.position.y = doorHeight + 0.15;
  placeOnFaceAtDepth(canopy, frontFace, doorT, 0);
  g.add(canopy);

  // Ground windows (2-4), spread across the non-door bays when stone.
  if (groundStone) {
    const winCount = 2 + Math.floor(mulberry32(tagSeed(dna.seed, 'GWC'))() * 3);
    for (let i = 0; i < winCount; i++) {
      const t = (i + 1) / (winCount + 1);
      if (Math.abs(t - doorT) < 0.12) continue;
      const win = buildHumanWindow({ width: 0.75, height: 1.1, wallZ: halfD, palette: openingPalette, stoneSurround: true, archRatio: mulberry32(tagSeed(dna.seed, `GWA${i}`))() < 0.35 ? 0.6 : 0 });
      win.name = 'human-window';
      win.position.y = 0.65;
      placeOnFace(win, frontFace, t);
      g.add(win);
    }
  }

  // Upper storey: 4-5 bay front, one altered bay.
  const upperBayCount = pickWeighted<number>(mulberry32(tagSeed(dna.seed, 'UBC')), [[4, 0.5], [5, 0.5]]);
  const alteredBay = Math.floor(mulberry32(tagSeed(dna.seed, 'ALT'))() * upperBayCount);
  const upperBays: TimberFrameFacadeBay[] = [];
  const upperWinWidth = 0.6;
  const upperWinHeight = 0.95;
  for (let i = 0; i < upperBayCount; i++) {
    const bayWidth = frontLen / upperBayCount;
    const x = i * bayWidth;
    if (i === alteredBay) {
      upperBays.push({ x, width: bayWidth, pattern: 'repairPanel' });
    } else {
      upperBays.push({
        x,
        width: bayWidth,
        pattern: 'stAndrewsCross',
        exclude: { x: bayWidth / 2 - upperWinWidth / 2, y: 0.5, width: upperWinWidth, height: upperWinHeight },
      });
    }
  }
  if (upperTimber) {
    const upperWall = buildTimberWallFacade(frontFace, STOREY_HEIGHT, tagSeed(dna.seed, 'UFRT'), upperBays, palette, STOREY_HEIGHT);
    g.add(upperWall);
    for (const fi of [0, 1, 2] as const) {
      const wall = buildTimberWallFace(faces[fi]!, STOREY_HEIGHT, tagSeed(dna.seed, `US${fi}`), 'simpleBrace', palette, undefined, STOREY_HEIGHT);
      g.add(wall);
    }
  } else {
    const { group } = buildStoneHall(halfW, halfD, STOREY_HEIGHT, tagSeed(dna.seed, 'UGRD'), palette.weatheredStone);
    group.position.y = STOREY_HEIGHT;
    g.add(group);
  }
  upperBays.forEach((bay, i) => {
    if (i === alteredBay || !bay.exclude) return;
    const t = (bay.x + bay.exclude.x + upperWinWidth / 2) / frontLen;
    const win = buildHumanWindow({ width: upperWinWidth, height: upperWinHeight, wallZ: halfD, palette: openingPalette, archRatio: mulberry32(tagSeed(dna.seed, `UWA${i}`))() < 0.35 ? 0.6 : 0 });
    win.name = 'human-window';
    win.position.y = STOREY_HEIGHT + 0.5 + upperWinHeight / 2;
    placeOnFace(win, frontFace, t);
    g.add(win);
  });

  // Optional wing (L/T/central -- 85% of the time).
  if (massing !== 'compact') {
    const wingWidth = halfW * (0.75 + mulberry32(tagSeed(dna.seed, 'WW'))() * 0.4);
    const wingDepth = halfD * (0.75 + mulberry32(tagSeed(dna.seed, 'WD'))() * 0.4);
    const wingHeight = wallHeight * 0.82;
    const side: WingSide = massing === 'L' ? (mulberry32(tagSeed(dna.seed, 'WS'))() < 0.5 ? 'left' : 'right') : 'back';
    const alongFraction = massing === 'T' ? 0.5 : massing === 'central' ? (mulberry32(tagSeed(dna.seed, 'WA'))() < 0.5 ? 0.28 : 0.72) : 0.2;
    const composed = composeMainAndWing({
      mainWidth: fp.w,
      mainDepth: fp.d,
      mainHeight: wallHeight,
      wing: { width: wingWidth, depth: wingDepth, height: wingHeight, side, alongFraction },
    });
    const wingMaterial = groundStone ? palette.weatheredStone : palette.brick;
    const { group: wingGroup } = buildStoneHallFromFaces(composed.wing.points, composed.wing.faces, wingHeight, tagSeed(dna.seed, 'WING'), wingMaterial);
    g.add(wingGroup);
    const wingRoof = buildHumanRoof('tile-gable' as HumanRoofFamily, wingWidth / 2, wingDepth / 2, wingWidth * 0.45, tagSeed(dna.seed, 'WROOF'), palette, 0.16);
    wingRoof.position.set(composed.wing.center[0], wingHeight, composed.wing.center[1]);
    if (side !== 'back') wingRoof.rotation.y = Math.PI / 2;
    g.add(wingRoof);
    // A wing window for real inhabited-mass reading.
    const wingWin = buildHumanWindow({ width: 0.6, height: 0.9, wallZ: 0, palette: openingPalette });
    wingWin.name = 'human-window';
    const wingFrontFace = composed.wing.faces[3]!;
    wingWin.position.y = wingHeight * 0.5;
    placeOnFaceAtDepth(wingWin, wingFrontFace, 0.5, 0);
    g.add(wingWin);
  }

  // Dormers (1-3) on the main roof slope.
  const dormerCount = 1 + Math.floor(mulberry32(tagSeed(dna.seed, 'DC'))() * 3);
  for (let i = 0; i < dormerCount; i++) {
    const t = (i + 1) / (dormerCount + 1);
    const dormer = new THREE.Group();
    dormer.name = `human-dormer-${i}`;
    const dormerWall = buildTimberFramePanel({ width: 0.6, height: 0.6, pattern: 'simpleBrace', seed: tagSeed(dna.seed, `DORM${i}`), timberMaterial: palette.oakTimber, infillMaterial: palette.plaster });
    dormer.add(dormerWall);
    const dormerRoof = buildGableRoof(0.3, 0.25, 0.3, tagSeed(dna.seed, `DORMR${i}`), palette.clayTile, { eaveOverhangFrac: 0.15 });
    dormerRoof.position.y = 0.6;
    dormer.add(dormerRoof);
    dormer.position.set(-halfW * 0.6 + t * halfW * 1.2, wallHeight + halfW * 0.35, halfD * 0.5);
    g.add(dormer);
  }

  // Roof: tile hip/gable compound 55%, slate steep gable 30%, mixed
  // tile+thatch service (wing already tiled; main gets thatch) 15%.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofChoice = pickWeighted<'tile-compound' | 'slate' | 'mixed'>(roofRand, [['tile-compound', 0.55], ['slate', 0.3], ['mixed', 0.15]]);
  const ridgeHeight = halfD * 1.1;
  const roofFamily: HumanRoofFamily = roofChoice === 'slate' ? 'slate-gable' : roofChoice === 'mixed' ? 'thatch-gable' : 'tile-hip';
  const roof = buildHumanRoof(roofFamily, halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOFM'), palette, 0.2);
  roof.position.y = wallHeight;
  g.add(roof);

  // A genteel dentil cornice frieze under the main eave line -- the
  // villa is the grandest human kind, so it earns the one ornament-band
  // flourish among the human roster.
  const cornice = buildFriezeBand({ length: faceLength(frontFace), variant: 'dentil', material: palette.weatheredStone, seed: tagSeed(dna.seed, 'CORNICE') });
  cornice.name = 'human-villa-cornice';
  cornice.position.y = wallHeight - 0.12;
  placeOnFaceAtDepth(cornice, frontFace, 0.5, 0);
  g.add(cornice);

  // Ground contact + plinth.
  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  // 2 chimneys minimum.
  g.add(placeChimney(halfW, halfD, wallHeight, 'rear-left', palette, tagSeed(dna.seed, 'CH1'), 1.5));
  g.add(placeChimney(halfW, halfD, wallHeight, 'rear-right', palette, tagSeed(dna.seed, 'CH2'), 1.35));

  // Props: lanterns flanking the door, garden pots, rain barrel.
  for (const side of [-1, 1] as const) {
    const lantern = buildWallBracket({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
    lantern.name = 'human-lantern';
    lantern.position.y = doorHeight * 0.55;
    placeOnFaceAtDepth(lantern, frontFace, doorT + side * 0.16, 0);
    g.add(lantern);
  }
  const pot = buildFlowerBox({ width: 0.4, boxMaterial: palette.weatheredStone, seed: tagSeed(dna.seed, 'POT') });
  pot.position.set(halfW * 0.7, 0, halfD + 0.3);
  g.add(pot);
  const barrel = buildStaveKeg({ material: palette.darkTimber, hoopMaterial: palette.iron });
  barrel.position.set(-halfW + 0.4, 0, -halfD - 0.4);
  g.add(barrel);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Inn
// ─────────────────────────────────────────────────────────────────────────

/** Builds a broad human inn/tavern: a stone or brick public-hall ground
 * floor, a wide double door + mullioned windows, an optional jettied
 * upper gallery with a real balcony rail, a rear kitchen bump-out, and a
 * multi-chimney tile/slate/thatch roof. */
export function buildHumanInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const groundHeight = 3.4;
  const floors = pickWeighted<number>(mulberry32(tagSeed(dna.seed, 'FLR')), [[2, 0.8], [3, 0.2]]);
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-inn';

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;
  const frontLen = faceLength(frontFace);

  const groundStone = mulberry32(tagSeed(dna.seed, 'GWS'))() < 0.65;
  const doorWidth = 1.4;
  const doorHeight = 2.2;
  const doorT = 0.5;

  if (groundStone) {
    const { group } = buildStoneHall(halfW, halfD, groundHeight, tagSeed(dna.seed, 'GRND'), palette.weatheredStone);
    g.add(group);
  } else {
    for (const fi of [0, 1, 2, 3] as const) {
      const face = faces[fi]!;
      const exclude = fi === 3 ? { x: doorT * frontLen - doorWidth / 2, y: 0, width: doorWidth, height: doorHeight } : undefined;
      const wall = buildTimberWallFace(face, groundHeight, tagSeed(dna.seed, `G${fi}`), 'brickNogging', palette, exclude, 0, palette.brick);
      g.add(wall);
    }
  }
  const door = buildHumanDoor({ width: doorWidth, height: doorHeight, wallZ: halfD, palette: openingPalette, stoneSurround: groundStone });
  door.name = 'human-door';
  placeOnFace(door, frontFace, doorT);
  g.add(door);

  // 2 large mullioned ground windows either side of the door.
  for (const t of [0.2, 0.8]) {
    const win = buildHumanWindow({ width: 0.95, height: 1.3, wallZ: halfD, palette: openingPalette, stoneSurround: groundStone, divisionStyle: 'cross' });
    win.name = 'human-window';
    win.position.y = 0.75;
    placeOnFace(win, frontFace, t);
    g.add(win);
  }
  // Side windows (1-2 per side).
  for (const fi of [0, 2] as const) {
    const sideWinCount = 1 + Math.floor(mulberry32(tagSeed(dna.seed, `SWC${fi}`))() * 2);
    for (let i = 0; i < sideWinCount; i++) {
      const t = (i + 1) / (sideWinCount + 1);
      const win = buildHumanWindow({ width: 0.7, height: 1.0, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette, stoneSurround: groundStone });
      win.name = 'human-window';
      win.position.y = 0.7;
      placeOnFace(win, faces[fi]!, t);
      g.add(win);
    }
  }

  // Upper storey/storeys: jettied gallery 45%, timber frame 80%.
  const galleryRand = mulberry32(tagSeed(dna.seed, 'GAL'));
  const hasGallery = galleryRand() < 0.45;
  const projection = 0.32 + galleryRand() * 0.08;
  let upperHalfD = halfD;
  let upperZOffset = 0;
  if (hasGallery) {
    const footprint = jettyUpperFootprint(halfD, projection);
    upperHalfD = footprint.halfDUpper;
    upperZOffset = footprint.zOffset;
    const { group: jettyGroup } = buildHumanJetty({ width: frontLen, floorY: groundHeight, projection, seed: tagSeed(dna.seed, 'JETTY'), timberMaterial: palette.oakTimber, shadowMaterial: palette.darkTimber });
    placeOnFaceAtDepth(jettyGroup, frontFace, 0.5, 0);
    g.add(jettyGroup);

    const rail = buildRailSection({ length: frontLen * 0.94, height: 0.75, material: palette.iron, seed: tagSeed(dna.seed, 'RAIL') });
    rail.name = 'human-balcony-rail';
    rail.position.y = groundHeight + 0.02;
    placeOnFaceAtDepth(rail, frontFace, 0.5, projection - 0.05);
    g.add(rail);
  }

  const upperFaces = rectangleFaces(halfW, upperHalfD);
  const upperFront = upperFaces[3]!;
  const upperFrontLen = faceLength(upperFront);
  const upperWinCount = 3 + Math.floor(mulberry32(tagSeed(dna.seed, 'UWC'))() * 3);

  for (let floorIdx = 0; floorIdx < floors - 1; floorIdx++) {
    const floorBaseY = groundHeight + STOREY_HEIGHT * floorIdx;
    const bays: TimberFrameFacadeBay[] = [];
    const winWidth = 0.65;
    const winHeight = 0.95;
    for (let i = 0; i < upperWinCount; i++) {
      const bayWidth = upperFrontLen / upperWinCount;
      bays.push({
        x: i * bayWidth,
        width: bayWidth,
        pattern: 'stAndrewsCross',
        exclude: { x: bayWidth / 2 - winWidth / 2, y: 0.55, width: winWidth, height: winHeight },
      });
    }
    const upperFront2 = buildTimberWallFacade(upperFront, STOREY_HEIGHT, tagSeed(dna.seed, `UF${floorIdx}`), bays, palette, 0);
    upperFront2.position.y = floorBaseY;
    upperFront2.position.z = upperZOffset;
    g.add(upperFront2);
    bays.forEach((bay, i) => {
      const t = (bay.x + bay.exclude!.x + winWidth / 2) / upperFrontLen;
      const win = buildHumanWindow({ width: winWidth, height: winHeight, wallZ: upperHalfD, palette: openingPalette, lit: i % 3 === 0 });
      win.name = 'human-window';
      win.position.y = floorBaseY + 0.55 + winHeight / 2;
      placeOnFace(win, upperFront, t);
      g.add(win);
    });
    for (const fi of [0, 2] as const) {
      const face = upperFaces[fi]!;
      const wall = buildTimberWallFace(face, STOREY_HEIGHT, tagSeed(dna.seed, `US${floorIdx}-${fi}`), 'simpleBrace', palette, undefined, floorBaseY);
      wall.position.z += upperZOffset;
      g.add(wall);
    }
  }
  const topBaseY = groundHeight + STOREY_HEIGHT * (floors - 1);

  // Rear kitchen bump-out (40%).
  if (mulberry32(tagSeed(dna.seed, 'KIT'))() < 0.4) {
    const kitchenW = 1.6;
    const kitchenD = 1.1;
    const kitchenHeight = groundHeight * 0.8;
    const rearFace = faces[1]!;
    const kitchen = new THREE.Group();
    kitchen.name = 'human-inn-kitchen';
    const kitchenWall = buildTimberFramePanel({ width: kitchenW, height: kitchenHeight, pattern: 'brickNogging', seed: tagSeed(dna.seed, 'KITW'), timberMaterial: palette.oakTimber, infillMaterial: palette.brick });
    kitchenWall.position.x += kitchenW / 2;
    kitchen.add(kitchenWall);
    const kitchenRoof = buildGableRoof(kitchenW / 2, kitchenD / 2, kitchenHeight * 0.3, tagSeed(dna.seed, 'KITR'), palette.clayTile, { eaveOverhangFrac: 0.15 });
    kitchenRoof.rotation.y = Math.PI / 2;
    kitchenRoof.position.y = kitchenHeight;
    kitchen.add(kitchenRoof);
    kitchen.position.set(rearFace.a[0], 0, rearFace.a[1]);
    kitchen.rotation.y = rearFace.normalAngle;
    kitchen.position.x += Math.sin(rearFace.normalAngle) * kitchenD;
    kitchen.position.z += Math.cos(rearFace.normalAngle) * kitchenD;
    g.add(kitchen);
    const serviceDoor = buildHumanDoor({ width: 0.75, height: 1.9, wallZ: 0, palette: openingPalette });
    serviceDoor.name = 'human-door';
    placeOnFaceAtDepth(serviceDoor, rearFace, 0.5, 0);
    g.add(serviceDoor);
  }

  // Roof: tile broad gable/hip 60%, slate 25%, thatch rural 15%.
  const roofFamily = pickWeighted<HumanRoofFamily>(mulberry32(tagSeed(dna.seed, 'ROOF')), [['tile-hip', 0.6], ['slate-gable', 0.25], ['thatch-gable', 0.15]]);
  const ridgeHeight = halfD * 1.05;
  const roof = buildHumanRoof(roofFamily, halfW, upperHalfD, ridgeHeight, tagSeed(dna.seed, 'ROOFM'), palette, 0.24);
  roof.position.set(0, topBaseY + STOREY_HEIGHT, upperZOffset);
  g.add(roof);

  // 1-2 dormers.
  const dormerCount = 1 + Math.floor(mulberry32(tagSeed(dna.seed, 'DC'))() * 2);
  for (let i = 0; i < dormerCount; i++) {
    const dormer = new THREE.Group();
    dormer.name = `human-dormer-${i}`;
    const dormerWall = buildTimberFramePanel({ width: 0.6, height: 0.6, pattern: 'simpleBrace', seed: tagSeed(dna.seed, `DORM${i}`), timberMaterial: palette.oakTimber, infillMaterial: palette.plaster });
    dormer.add(dormerWall);
    const dormerRoof = buildGableRoof(0.3, 0.25, 0.28, tagSeed(dna.seed, `DORMR${i}`), palette.clayTile, { eaveOverhangFrac: 0.15 });
    dormerRoof.position.y = 0.6;
    dormer.add(dormerRoof);
    dormer.position.set(-halfW * 0.5 + i * halfW * 0.5, topBaseY + STOREY_HEIGHT + ridgeHeight * 0.3, upperZOffset + upperHalfD * 0.5);
    g.add(dormer);
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  // 2-3 chimneys.
  g.add(placeChimney(halfW, halfD, topBaseY + STOREY_HEIGHT, 'rear-left', palette, tagSeed(dna.seed, 'CH1'), 1.4));
  g.add(placeChimney(halfW, halfD, topBaseY + STOREY_HEIGHT, 'rear-right', palette, tagSeed(dna.seed, 'CH2'), 1.3));
  if (mulberry32(tagSeed(dna.seed, 'CH3'))() < 0.5) {
    g.add(placeChimney(halfW, halfD, topBaseY + STOREY_HEIGHT, 'side-wall', palette, tagSeed(dna.seed, 'CH3'), 1.2));
  }

  // Props: hanging inn sign, barrels, benches, wagon wheel, lantern pair,
  // crates, cellar hatch.
  const signMount = mountHangingProp(buildHangingSign({ bracketMaterial: palette.iron, boardMaterial: palette.darkTimber, icon: 'mug' }));
  signMount.position.y = groundHeight + 0.4;
  placeOnFaceAtDepth(signMount, frontFace, 0.12, 0);
  g.add(signMount);

  for (const t of [0.06, 0.94]) {
    const lantern = buildWallBracket({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
    lantern.name = 'human-lantern';
    lantern.position.y = doorHeight * 0.5;
    placeOnFaceAtDepth(lantern, frontFace, t, 0);
    g.add(lantern);
  }
  for (let i = 0; i < 3; i++) {
    const barrel = buildStaveKeg({ material: palette.darkTimber, hoopMaterial: palette.iron });
    barrel.position.set(-halfW + 0.4 + i * 0.5, 0, halfD + 0.5);
    g.add(barrel);
  }
  const bench = buildBench({ width: 1.2, woodMaterial: palette.darkTimber });
  bench.position.set(halfW * 0.4, 0, halfD + 0.6);
  bench.rotation.y = Math.PI;
  g.add(bench);
  const wheel = buildWagonWheel({ material: palette.darkTimber });
  wheel.rotation.z = 0.15;
  wheel.position.set(-halfW - 0.1, 0.42, halfD * 0.3);
  g.add(wheel);
  const crate = buildPlankCrate({ material: palette.darkTimber });
  crate.position.set(halfW - 0.4, 0, halfD + 0.55);
  g.add(crate);
  const hatch = buildCellarHatch({ woodMaterial: palette.darkTimber, frameMaterial: palette.weatheredStone });
  hatch.position.set(-halfW * 0.3, 0.02, halfD + 0.9);
  g.add(hatch);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Shop
// ─────────────────────────────────────────────────────────────────────────

/** Builds a compact human shop/stall-front: a timber-framed facade with a
 * genuine wide counter/display opening (sill, mullions, a proud counter
 * slab, and a set-back dark interior plane), a fabric awning, a trade
 * sign, and an optional jettied upper living floor. */
export function buildHumanShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const hasUpperFloor = mulberry32(tagSeed(dna.seed, 'FLR'))() < 0.4;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-shop';

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;
  const frontLen = faceLength(frontFace);

  // Shop door (0.85x2.0) off to one side, counter/display opening
  // (1.3-1.7 wide x 1.0 tall) taking up most of the rest of the front.
  const doorLeft = mulberry32(tagSeed(dna.seed, 'SIDE'))() < 0.5;
  const doorWidth = 0.85;
  const doorHeight = 2.0;
  const counterWidth = 1.3 + mulberry32(tagSeed(dna.seed, 'CW'))() * 0.4;
  const counterHeight = 1.0;
  const gap = 0.25;
  const totalWidth = doorWidth + gap + counterWidth;
  const startT = 0.5 - totalWidth / 2 / frontLen;
  const doorT = doorLeft ? startT + doorWidth / (2 * frontLen) : startT + totalWidth / frontLen - doorWidth / (2 * frontLen);
  const counterT = doorLeft ? startT + doorWidth / frontLen + gap / frontLen + counterWidth / (2 * frontLen) : startT + counterWidth / (2 * frontLen);

  // Split the shopfront into two real TimberFrame bays sharing one
  // corner post between them, so the door AND the counter opening both
  // get a genuine punched-out aperture (rather than one being pasted
  // over solid infill).
  const splitX = doorLeft ? doorT * frontLen + doorWidth / 2 + gap / 2 : counterT * frontLen + counterWidth / 2 + gap / 2;
  const doorBayX = doorLeft ? 0 : splitX;
  const doorBayWidth = doorLeft ? splitX : frontLen - splitX;
  const counterBayX = doorLeft ? splitX : 0;
  const counterBayWidth = doorLeft ? frontLen - splitX : splitX;
  const doorLocalX = doorT * frontLen - doorBayX;
  const counterLocalX = counterT * frontLen - counterBayX;

  const groundHeight = STOREY_HEIGHT;
  const shopBaysUnsorted: TimberFrameFacadeBay[] = [
    {
      x: doorBayX,
      width: doorBayWidth,
      pattern: 'simpleBrace',
      exclude: { x: doorLocalX - doorWidth / 2, y: 0, width: doorWidth, height: doorHeight },
    },
    {
      x: counterBayX,
      width: counterBayWidth,
      pattern: 'simpleBrace',
      exclude: { x: counterLocalX - counterWidth / 2, y: 0.1, width: counterWidth, height: counterHeight },
    },
  ];
  const shopBays = shopBaysUnsorted.sort((a, b) => a.x - b.x);
  const frontPanel = buildTimberWallFacade(frontFace, groundHeight, tagSeed(dna.seed, 'FRT'), shopBays, palette, 0);
  g.add(frontPanel);

  for (const fi of [0, 1, 2] as const) {
    const hasWin = fi === 1 && mulberry32(tagSeed(dna.seed, `SW${fi}`))() < 0.4;
    let exclude: TimberFrameExclusion | undefined;
    const face = faces[fi]!;
    const len = faceLength(face);
    if (hasWin) exclude = { x: len / 2 - 0.35, y: 0.6, width: 0.7, height: 0.9 };
    const wall = buildTimberWallFace(face, groundHeight, tagSeed(dna.seed, `S${fi}`), 'simpleBrace', palette, exclude, 0);
    g.add(wall);
    if (exclude) {
      const win = buildHumanWindow({ width: 0.7, height: 0.9, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette });
      win.name = 'human-window';
      win.position.y = 0.6 + 0.45;
      placeOnFace(win, face, 0.5);
      g.add(win);
    }
  }

  const door = buildHumanDoor({ width: doorWidth, height: doorHeight, wallZ: halfD, palette: openingPalette });
  door.name = 'human-door';
  placeOnFace(door, frontFace, doorT);
  g.add(door);

  const counterWin = buildHumanWindow({ width: counterWidth, height: counterHeight, wallZ: halfD, palette: openingPalette, divisionStyle: 'cross' });
  counterWin.name = 'human-window';
  counterWin.position.y = 0.1 + counterHeight / 2;
  placeOnFace(counterWin, frontFace, counterT);
  g.add(counterWin);
  // Proud counter slab at +0.08, projecting past the sill.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(counterWidth * 0.96, 0.08, 0.3), palette.oakTimber);
  slab.name = 'counter-slab';
  slab.castShadow = slab.receiveShadow = true;
  slab.position.y = 0.1;
  placeOnFaceAtDepth(slab, frontFace, counterT, 0.15);
  g.add(slab);

  // Fabric awning over the counter, projecting 0.45-0.7 WU.
  const awningProjection = 0.45 + mulberry32(tagSeed(dna.seed, 'AWN'))() * 0.25;
  const awning = buildAwning({ width: totalWidth + 0.3, projection: awningProjection, fabricMaterial: palette.plasterAlt, ribMaterial: palette.darkTimber });
  awning.name = 'human-awning';
  awning.position.y = doorHeight + 0.1;
  placeOnFaceAtDepth(awning, frontFace, 0.5, 0);
  g.add(awning);

  // Upper storey (40% chance): jettied living floor (35% of those).
  let upperHalfD = halfD;
  let upperZOffset = 0;
  let roofBaseY = groundHeight;
  if (hasUpperFloor) {
    const jettyRand = mulberry32(tagSeed(dna.seed, 'JETTY'));
    const hasJetty = jettyRand() < 0.35;
    const projection = 0.3 + jettyRand() * 0.1;
    if (hasJetty) {
      const footprint = jettyUpperFootprint(halfD, projection);
      upperHalfD = footprint.halfDUpper;
      upperZOffset = footprint.zOffset;
      const { group: jettyGroup } = buildHumanJetty({ width: frontLen, floorY: groundHeight, projection, seed: tagSeed(dna.seed, 'JETTYB'), timberMaterial: palette.oakTimber, shadowMaterial: palette.darkTimber });
      placeOnFaceAtDepth(jettyGroup, frontFace, 0.5, 0);
      g.add(jettyGroup);
    }
    const upperFaces = rectangleFaces(halfW, upperHalfD);
    const upperWinCount = 1 + Math.floor(mulberry32(tagSeed(dna.seed, 'UWC'))() * 2);
    const upperGroup = new THREE.Group();
    upperGroup.name = 'human-shop-upper';
    for (const fi of [0, 1, 2, 3] as const) {
      const face = upperFaces[fi]!;
      const len = faceLength(face);
      let exclude: TimberFrameExclusion | undefined;
      if (fi === 3) {
        const t = upperWinCount === 1 ? 0.5 : 0.3;
        exclude = { x: t * len - 0.35, y: 0.55, width: 0.7, height: 0.9 };
      }
      const wall = buildTimberWallFace(face, STOREY_HEIGHT, tagSeed(dna.seed, `U${fi}`), 'simpleBrace', palette, exclude, groundHeight);
      upperGroup.add(wall);
      if (exclude) {
        const win = buildHumanWindow({ width: 0.7, height: 0.9, wallZ: wallZFor(fi, halfW, upperHalfD), palette: openingPalette });
        win.name = 'human-window';
        win.position.y = groundHeight + exclude.y + 0.45;
        placeOnFace(win, face, (exclude.x + 0.35) / len);
        upperGroup.add(win);
      }
    }
    upperGroup.position.z = upperZOffset;
    g.add(upperGroup);
    roofBaseY = groundHeight + STOREY_HEIGHT;
  }

  // Roof: tile gable 50%, slate gable 25%, thatch rural 15%, pent awning
  // layered 10% (implemented as a second small pent-style tile strip over
  // the shopfront awning zone in addition to a tile gable main roof).
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofChoice = pickWeighted<'tile' | 'slate' | 'thatch' | 'pent'>(roofRand, [['tile', 0.5], ['slate', 0.25], ['thatch', 0.15], ['pent', 0.1]]);
  const roofFamily: HumanRoofFamily = roofChoice === 'slate' ? 'slate-gable' : roofChoice === 'thatch' ? 'thatch-gable' : 'tile-gable';
  const ridgeHeight = halfD * 1.1;
  const roof = buildHumanRoof(roofFamily, halfW, upperHalfD, ridgeHeight, tagSeed(dna.seed, 'ROOFM'), palette, 0.2);
  roof.position.set(0, roofBaseY, upperZOffset);
  g.add(roof);
  if (roofChoice === 'pent') {
    const pent = new THREE.Mesh(new THREE.BoxGeometry(frontLen * 0.9, 0.08, 0.6), palette.clayTile);
    pent.name = 'pent-roof-strip';
    pent.castShadow = pent.receiveShadow = true;
    pent.rotation.x = -0.25;
    pent.position.y = doorHeight + 0.55;
    placeOnFaceAtDepth(pent, frontFace, 0.5, 0.3);
    g.add(pent);
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  if (mulberry32(tagSeed(dna.seed, 'CHIM'))() < 0.6) {
    g.add(placeChimney(halfW, halfD, roofBaseY + STOREY_HEIGHT * 0.3, 'rear-left', palette, tagSeed(dna.seed, 'CHIM'), 1.0));
  }

  // Props: trade sign, crates, shutters, baskets, lantern.
  const icon = pickWeighted<TradeIcon>(mulberry32(tagSeed(dna.seed, 'ICON')), [['boot', 0.25], ['loaf', 0.25], ['mug', 0.25], ['shears', 0.25]]);
  const signMount = mountHangingProp(buildHangingSign({ bracketMaterial: palette.iron, boardMaterial: palette.darkTimber, icon, iconMaterial: palette.iron }));
  signMount.position.y = doorHeight + 0.5;
  placeOnFaceAtDepth(signMount, frontFace, doorLeft ? 0.08 : 0.92, 0);
  g.add(signMount);

  const shutters = buildShutterPair({ width: counterWidth, height: counterHeight, material: palette.darkTimber, hingeMaterial: palette.iron, wallZ: halfD + 0.05 });
  shutters.position.y = 0.1 + counterHeight * 0.5;
  placeOnFace(shutters, frontFace, counterT);
  g.add(shutters);

  for (let i = 0; i < 2; i++) {
    const crate = buildPlankCrate({ material: palette.darkTimber });
    crate.position.set((doorLeft ? 1 : -1) * (halfW * 0.5 - i * 0.35), 0, halfD + 0.4);
    g.add(crate);
  }
  const lantern = buildWallBracket({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
  lantern.name = 'human-lantern';
  lantern.position.y = doorHeight + 0.15;
  placeOnFaceAtDepth(lantern, frontFace, doorT, 0);
  g.add(lantern);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Blacksmith
// ─────────────────────────────────────────────────────────────────────────

/** Builds a human blacksmith's forge: a wide open work bay (real posts +
 * lintel + diagonal braces framing a genuine open gap, not a missing
 * wall) with a masonry forge hearth visible inside, a personnel door and
 * barred high windows on the side walls, a massive corbelled chimney, an
 * optional lean-to coal shed, and forge-yard props. */
export function buildHumanBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = STOREY_HEIGHT;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-blacksmith';

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;
  const frontLen = faceLength(frontFace);

  // Wide open work bay (2.4-3.0 WU): two posts, a header lintel band, and
  // diagonal braces framing a genuine open gap -- not a missing wall.
  const bayWidth = 2.4 + mulberry32(tagSeed(dna.seed, 'BAY'))() * 0.6;
  const bayExclude: TimberFrameExclusion = { x: frontLen / 2 - bayWidth / 2, y: 0, width: bayWidth, height: wallHeight * 0.82 };
  const frontWall = buildTimberWallFace(frontFace, wallHeight, tagSeed(dna.seed, 'FRT'), 'simpleBrace', palette, bayExclude, 0);
  g.add(frontWall);

  // Masonry forge hearth, visible through the open bay: a stone hearth
  // block, an arched firebox mouth, and a glowing coal bed.
  const hearth = new THREE.Group();
  hearth.name = 'forge-hearth';
  const hearthBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.7), palette.weatheredStone);
  hearthBase.name = 'hearth-base';
  hearthBase.position.y = 0.45;
  hearthBase.castShadow = hearthBase.receiveShadow = true;
  hearth.add(hearthBase);
  const fireboxMaterial = new THREE.MeshStandardMaterial({ color: '#2a1005', emissive: '#ff6a1f', emissiveIntensity: 1.4, roughness: 0.6 });
  const firebox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.1), fireboxMaterial);
  firebox.name = 'hearth-firebox';
  firebox.position.set(0, 0.55, 0.36);
  hearth.add(firebox);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.5), palette.iron);
  hood.name = 'hearth-hood';
  hood.position.set(0, 1.1, 0.1);
  hood.rotation.x = -0.2;
  hearth.add(hood);
  hearth.position.set(0, 0, -halfD + 0.6);
  g.add(hearth);

  // Side walls: personnel door + 1-2 small barred high windows.
  const doorSide = mulberry32(tagSeed(dna.seed, 'DS'))() < 0.5 ? 0 : 2;
  for (const fi of [0, 2] as const) {
    const face = faces[fi]!;
    const len = faceLength(face);
    let exclude: TimberFrameExclusion | undefined;
    if (fi === doorSide) {
      exclude = { x: len * 0.25 - 0.425, y: 0, width: 0.85, height: 2.0 };
    } else {
      exclude = { x: len * 0.6 - 0.25, y: wallHeight * 0.55, width: 0.5, height: 0.5 };
    }
    const wall = buildTimberWallFace(face, wallHeight, tagSeed(dna.seed, `SD${fi}`), 'simpleBrace', palette, exclude, 0, palette.plasterAlt);
    g.add(wall);
    if (fi === doorSide) {
      const door = buildHumanDoor({ width: 0.85, height: 2.0, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette });
      door.name = 'human-door';
      door.position.y = 0;
      placeOnFace(door, face, 0.25);
      g.add(door);
    } else {
      const win = buildHumanWindow({ width: 0.5, height: 0.5, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette });
      win.name = 'human-window';
      win.position.y = wallHeight * 0.55 + 0.25;
      placeOnFace(win, face, 0.6);
      g.add(win);
      // Iron security bars: 3 thin vertical bars set proud of the glazing.
      // (Spaced by an along-face `t` delta, not a raw local x offset --
      // a raw offset only reads correctly on a rotation.y=0 face, which
      // this loop's side faces are not.)
      const barLen = faceLength(face);
      for (let b = 0; b < 3; b++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.5, 0.015), palette.iron);
        bar.name = `window-bar-${b}`;
        bar.castShadow = bar.receiveShadow = true;
        const barT = 0.6 + (-0.16 + b * 0.16) / barLen;
        placeOnFaceAtDepth(bar, face, barT, 0.02);
        bar.position.y = win.position.y;
        g.add(bar);
      }
    }
  }

  // Rear wall: plain, holds the chimney breast.
  const rearWall = buildTimberWallFace(faces[1]!, wallHeight, tagSeed(dna.seed, 'REAR'), 'simpleBrace', palette, undefined, 0, palette.plasterAlt);
  g.add(rearWall);

  // Massive corbelled chimney, +0.12 breast.
  const chimney = buildCorbelledChimneyStack({ width: 0.55, depth: 0.62, height: 1.7, material: palette.weatheredStone, collarMaterial: palette.iron, capMaterial: palette.weatheredStone, flueMaterial: palette.darkTimber, seed: tagSeed(dna.seed, 'CHIM') });
  chimney.name = 'human-chimney';
  chimney.position.set(halfW * 0.5, wallHeight, -halfD + 0.7);
  g.add(chimney);

  // Optional lean-to coal/wood shed (45%).
  const hasLeanTo = mulberry32(tagSeed(dna.seed, 'LEAN'))() < 0.45;
  const leanSide = doorSide === 0 ? 2 : 0;
  if (hasLeanTo) {
    const leanFace = faces[leanSide]!;
    const leanWidth = 0.9;
    const leanHeight = wallHeight * 0.55;
    const lean = new THREE.Group();
    lean.name = 'human-lean-to';
    const leanRoof = buildThatchGableRoof(faceLength(leanFace) / 2, leanWidth / 2, leanHeight * 0.35, tagSeed(dna.seed, 'LEANR'), palette.thatch, { eaveOverhangFrac: 0.2 });
    leanRoof.rotation.y = Math.PI / 2;
    leanRoof.position.y = leanHeight;
    const leanWall = buildTimberFramePanel({ width: faceLength(leanFace), height: leanHeight, pattern: 'simpleBrace', seed: tagSeed(dna.seed, 'LEANW'), timberMaterial: palette.darkTimber, infillMaterial: palette.plasterRepair });
    leanWall.position.x += faceLength(leanFace) / 2;
    lean.add(leanWall, leanRoof);
    lean.position.set(leanFace.a[0], 0, leanFace.a[1]);
    lean.rotation.y = leanFace.normalAngle;
    lean.position.x += Math.sin(leanFace.normalAngle) * leanWidth;
    lean.position.z += Math.cos(leanFace.normalAngle) * leanWidth;
    g.add(lean);
    const coal = buildCoalBin({ material: palette.iron, chunkMaterial: palette.darkTimber });
    coal.position.set(leanFace.a[0] * 0.6, 0, leanFace.a[1] * 0.6);
    g.add(coal);
  }

  // Roof: tile/slate low gable 55%, half-hip (lower ridge hip) 20%,
  // thatch shed accent already applied to the lean-to (25% bucket read
  // as "lean-to present" above).
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofChoice = pickWeighted<'gable' | 'half-hip'>(roofRand, [['gable', 0.75], ['half-hip', 0.25]]);
  const roofMaterialFamily = mulberry32(tagSeed(dna.seed, 'ROOFM'))() < 0.6 ? palette.clayTile : palette.slate;
  const ridgeHeight = halfD * 0.85;
  const roof = roofChoice === 'gable'
    ? buildGableRoof(halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOFG'), roofMaterialFamily, { eaveOverhangFrac: 0.2, shingle: { silhouette: 'rectangular' } })
    : buildHipRoof(halfW, halfD, ridgeHeight * 0.7, tagSeed(dna.seed, 'ROOFH'), roofMaterialFamily, { eaveOverhangFrac: 0.2, shingle: { silhouette: 'rectangular' } });
  roof.position.y = wallHeight;
  g.add(roof);

  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  // Props: anvil, quench trough, tool rack, coal pile, horseshoe-style
  // hanging sign (approximated with the 'shears' tool-icon silhouette --
  // TradeIcon has no dedicated horseshoe shape).
  const anvil = buildAnvil({ material: palette.iron });
  anvil.position.set(0.6, 0, -halfD + 1.1);
  g.add(anvil);
  const trough = buildSlagTrough({ material: palette.iron });
  trough.position.set(-0.6, 0, -halfD + 1.1);
  g.add(trough);
  const rack = buildToolRack({ woodMaterial: palette.darkTimber, toolMaterial: palette.iron, seed: tagSeed(dna.seed, 'RACK') });
  rack.name = 'human-tool-rack';
  rack.position.y = 0.3;
  placeOnFaceAtDepth(rack, faces[1]!, 0.75, 0);
  g.add(rack);
  const coalPile = buildCoalBin({ material: palette.weatheredStone, chunkMaterial: palette.iron });
  coalPile.position.set(halfW - 0.6, 0, halfD - 0.5);
  g.add(coalPile);
  const signMount = mountHangingProp(buildHangingSign({ bracketMaterial: palette.iron, boardMaterial: palette.darkTimber, icon: 'shears', iconMaterial: palette.iron }));
  signMount.position.y = wallHeight * 0.7;
  placeOnFaceAtDepth(signMount, faces[doorSide]!, 0.55, 0);
  g.add(signMount);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapel
// ─────────────────────────────────────────────────────────────────────────

/** Builds a humble parish chapel: a long weathered-stone nave with real
 * buttresses along both long walls, 2-3 arched windows per side, a west
 * door with a small gable oculus above, a simple timber bellcote (never a
 * grand tower), and a steep slate/tile/thatch roof over a chapel-yard of
 * grave markers and a stone path. */
export function buildHumanChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = 5.0 + mulberry32(tagSeed(dna.seed, 'HGT'))() * 0.8;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-chapel';

  const faces = rectangleFaces(halfW, halfD);
  const points = rectanglePoints(halfW, halfD);
  const frontFace = faces[3]!;
  const longFaces = [faces[0]!, faces[2]!];

  const { group: hall } = buildStoneHall(halfW, halfD, wallHeight, tagSeed(dna.seed, 'HALL'), palette.weatheredStone);
  g.add(hall);

  // Buttresses at long-wall intervals, +0.30 proud.
  for (const face of longFaces) {
    for (const t of [0.2, 0.5, 0.8]) {
      const buttress = buildButtress({ height: wallHeight * 0.7, width: 0.5, stages: 2, depth: 0.3, seed: tagSeed(dna.seed, `BUT${face.normalAngle}${t}`) }, palette.weatheredStone);
      buttress.name = 'human-buttress';
      placeOnFaceAtDepth(buttress, face, t, 0);
      g.add(buttress);
    }
  }

  // 2-3 arched windows per long side.
  const winPerSide = 2 + Math.floor(mulberry32(tagSeed(dna.seed, 'WPS'))() * 2);
  for (const face of longFaces) {
    const faceIdx = face === faces[0] ? 0 : 2;
    for (let i = 0; i < winPerSide; i++) {
      const t = (i + 1) / (winPerSide + 1);
      const arch = buildVoussoirArch({ width: 0.95, springHeight: wallHeight * 0.55, archRatio: 0.6, material: palette.weatheredStone, seed: tagSeed(dna.seed, `ARCH${i}`) });
      arch.name = 'human-chapel-arch';
      placeOnFaceAtDepth(arch, face, t, 0);
      g.add(arch);
      const win = buildHumanWindow({ width: 0.7, height: 1.8, wallZ: wallZFor(faceIdx, halfW, halfD), palette: openingPalette, stoneSurround: true, archRatio: 1.0 });
      win.name = 'human-window';
      win.position.y = wallHeight * 0.55 - 1.8 * 0.15;
      placeOnFace(win, face, t);
      g.add(win);
    }
  }

  // West door + gable oculus above.
  const door = buildHumanDoor({ width: 1.0, height: 2.2, wallZ: halfD, palette: openingPalette, stoneSurround: true });
  door.name = 'human-door';
  placeOnFace(door, frontFace, 0.5);
  g.add(door);
  const doorArch = buildVoussoirArch({ width: 1.3, springHeight: 2.2, archRatio: 0.65, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'DOORARCH') });
  doorArch.name = 'human-chapel-arch';
  placeOnFaceAtDepth(doorArch, frontFace, 0.5, 0);
  g.add(doorArch);
  const oculus = buildHumanOculus({ diameter: 0.9, wallZ: halfD, palette: openingPalette, divisionStyle: 'cross' });
  oculus.name = 'human-chapel-rose';
  oculus.position.y = wallHeight - 1.1;
  placeOnFace(oculus, frontFace, 0.5);
  g.add(oculus);

  // Roof: slate/tile steep gable 75%, thatch rural 15%, tile w/ cedar
  // shingle bellcote accent 10% (folded into the tile bucket -- the
  // bellcote's own tiny roof always reads distinctly regardless).
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<HumanRoofFamily>(roofRand, [['slate-gable', 0.45], ['tile-gable', 0.4], ['thatch-gable', 0.15]]);
  const ridgeHeight = halfW * 1.4;
  const roof = buildHumanRoof(roofFamily, halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOFM'), palette, 0.16);
  roof.position.y = wallHeight;
  g.add(roof);

  // Simple timber bellcote astride the entrance ridge -- a small
  // TimberFrame post frame carrying a tiny bell, not a grand tower.
  const bellcote = new THREE.Group();
  bellcote.name = 'human-bellcote';
  const bellFrame = buildTimberFramePanel({ width: 0.7, height: 0.55, pattern: 'simpleBrace', seed: tagSeed(dna.seed, 'BELLF'), timberMaterial: palette.oakTimber, infillMaterial: palette.plaster });
  bellcote.add(bellFrame);
  const bellRoof = buildGableRoof(0.4, 0.3, 0.3, tagSeed(dna.seed, 'BELLR'), palette.clayTile, { eaveOverhangFrac: 0.15 });
  bellRoof.position.y = 0.55;
  bellcote.add(bellRoof);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.16, 10), palette.iron);
  bell.name = 'bellcote-bell';
  bell.position.set(0, 0.28, 0);
  bellcote.add(bell);
  bellcote.position.set(0, wallHeight + ridgeHeight * 0.7, halfD * 0.55);
  g.add(bellcote);

  const plinth = buildRockPlinthSkirt({ points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: frontFace });
  g.add(plinth);

  // Chapel-yard props: grave markers, flower pot, small lantern, stone path.
  for (let i = 0; i < 4; i++) {
    const marker = buildGraveMarker({ material: palette.weatheredStone, height: 0.4 + mulberry32(tagSeed(dna.seed, `GRV${i}`))() * 0.2 });
    marker.name = 'human-grave-marker';
    const side = i % 2 === 0 ? -1 : 1;
    marker.position.set(side * (halfW + 0.6 + (i % 2) * 0.3), 0, -halfD + i * 1.5);
    marker.rotation.y = mulberry32(tagSeed(dna.seed, `GRVR${i}`))() * 0.3 - 0.15;
    g.add(marker);
  }
  const pot = buildFlowerBox({ width: 0.4, boxMaterial: palette.weatheredStone, seed: tagSeed(dna.seed, 'POT') });
  pot.position.set(halfW * 0.6, 0, halfD + 0.3);
  g.add(pot);
  const lantern = buildWallBracket({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
  lantern.name = 'human-lantern';
  lantern.position.y = 2.0;
  placeOnFaceAtDepth(lantern, frontFace, 0.85, 0);
  g.add(lantern);
  for (let i = 0; i < 3; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.4), palette.weatheredStone);
    slab.name = `stone-path-${i}`;
    slab.position.set(0, 0.02, halfD + 0.5 + i * 0.55);
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Watchtower
// ─────────────────────────────────────────────────────────────────────────

type WatchtowerCrown = 'crenellated-parapet' | 'slate-pyramidal' | 'tile-hipped-cap';

/** Builds one 5-piece stone arrow loop by reusing the shared window-opening
 * primitive (`buildHumanWindow`) at an extreme narrow-tall proportion --
 * this already guarantees a real recess + proud stone surround + sill +
 * mullion-less single dark pane per the doctrine, rather than hand-rolling
 * a parallel one-off opening assembly. */
function buildArrowLoop(wallZ: number, palette: HumanOpeningPalette): THREE.Group {
  const loop = buildHumanWindow({ width: 0.22, height: 0.85, wallZ, palette, stoneSurround: true, archRatio: 0 });
  loop.name = 'human-arrow-loop';
  return loop;
}

/** Builds a coped, corbelled-out crenellated parapet ring: an outward
 * string-course coping (+0.08 proud, slight outset) topped by evenly
 * spaced merlon blocks per face -- never a raw flat-topped box. */
function buildHumanCrenellatedParapet(
  points: [number, number][],
  faces: OctagonFace[],
  material: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'human-crenellated-parapet';

  const coping = buildStringCourse(points, material, { y: 0, proudDepth: 0.09, outset: 0.07, height: 0.12 });
  coping.name = 'parapet-coping';
  g.add(coping);

  const merlonW = 0.3;
  const merlonGap = 0.26;
  const merlonH = 0.42;
  const merlonDepth = 0.16;
  for (const face of faces) {
    const len = faceLength(face);
    const count = Math.max(2, Math.floor(len / (merlonW + merlonGap)));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(merlonW, merlonH, merlonDepth), material);
      merlon.name = 'parapet-merlon';
      merlon.castShadow = merlon.receiveShadow = true;
      merlon.position.y = merlonH / 2 + 0.12;
      placeOnFaceAtDepth(merlon, face, t, 0);
      g.add(merlon);
    }
  }
  return g;
}

/** Builds a battered-tier stone watchtower: see design spec §4.8. 4
 * stacked tiers (`makeBatteredRectangleTiers()` -- the same shared
 * batter/inset profile the dwarven kit's own watchtower uses) taper
 * 9-13% per floor, each with a PROMINENT string course + a full
 * corbel-table ring at the transition, corner buttresses stepping in
 * tier-by-tier, TWO arrow loops per exposed face per upper floor, a
 * ground door with a relieving arch, and a coped-parapet /
 * slate-pyramidal / tile-hipped-cap crown -- never a flat-capped box.
 *
 * Footprint: the shared `KIND_FOOTPRINT.watchtower` table (2x2 WU) is
 * deliberately NOT used verbatim here. At the spec's own literal
 * "minimum 4 floors (12.8 WU)" height, a 2 WU base gives a 1:6-1:8
 * height:width ratio -- structurally implausible for solid masonry
 * (real medieval stone towers, even the most extreme historical
 * examples, stay closer to 1:4-1:5) and, worse, it *reads* on screen as
 * a thin dark monotonous needle/smokestack rather than a building --
 * exactly the "basic/broken-looking geometry" the doctrine calls out as
 * a rejection reason. Fix: widen the human watchtower's OWN base to
 * 3x3 WU (still visibly narrower than any human house footprint, so it
 * keeps its "tower" identity) instead of touching the shared table and
 * affecting every other race's watchtower.
 *
 * SECOND ROUND FIX (post-merge live-QA follow-up): the first fix (base
 * widen + fixed 4-tier count) corrected the raw height:width RATIO but
 * left the tower reading as a flat, monotonous, almost-featureless
 * shaft, because (a) the 4-7%/tier taper was too subtle to perceive at
 * all once rendered, (b) each tier had only ONE tiny arrow loop per
 * face to break up ~3x3 WU of blank coursed stone, and (c) unlike the
 * dwarven precedent tower (which places a `buildCorbelRow()` at every
 * tier transition), the human tower had no per-tier corbelling and no
 * corner buttresses at all -- objectively less detailed than its own
 * sibling kind's precedent. This pass: (1) raises the taper to 9-13%,
 * matching/exceeding `SteppedBatterProfile`'s own dwarven-precedent
 * default (10%) so each tier visibly steps in; (2) adds a full
 * corbel-table ring (`buildCorbelRow()`, all 4 faces) at every tier
 * transition, directly mirroring the dwarven watchtower's own
 * technique; (3) adds tapering corner buttresses
 * (`buildButtress()`) at each of the 4 corners, one stage per tier so
 * they set back at every string course exactly like real stepped
 * masonry buttresses; (4) doubles the arrow-loop count per face per
 * upper floor (two loops flanking centre, not one dead-centre) so no
 * single wall plane reads as a blank rectangle. */
export function buildHumanWatchtower(dna: BuildingDNA): THREE.Group {
  const baseHalfW = 1.5;
  const baseHalfD = 1.5;
  const palette = buildHumanPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'human-watchtower';

  const tierRand = mulberry32(tagSeed(dna.seed, 'TIER'));
  // Fixed at the spec's literal "minimum 4 floors" -- the previous 30%
  // chance of a 5th tier only made the disproportion worse and is
  // dropped rather than compensated for.
  const tierCount = 4;
  // 9-13%: matches/exceeds SteppedBatterProfile's own dwarven-precedent
  // default (insetPerTierFrac 0.10) so the taper is actually visible per
  // tier, rather than the imperceptible 4-7% the first fix pass left in
  // place (see this function's own doc comment for the full history).
  const taper = 0.09 + tierRand() * 0.04;
  const tiers = makeBatteredRectangleTiers(
    baseHalfW,
    baseHalfD,
    Array.from({ length: tierCount }, () => STOREY_HEIGHT),
    { baseBatterFrac: 0.06, insetPerTierFrac: taper },
  );

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const { group: hall } = buildStoneHallFromFaces(tier.points, tier.faces, tier.height, tagSeed(dna.seed, `T${i}`), palette.weatheredStone);
    hall.position.y = tier.y;
    g.add(hall);

    if (i > 0) {
      // Prominent string course (nearly double the first-pass proudDepth/
      // outset) so every tier transition reads as a real shading break,
      // not a barely-there seam -- doctrine Rule 1, the depth ladder.
      const course = buildStringCourse(tier.points, palette.weatheredStone, { y: tier.y, proudDepth: 0.13, outset: 0.08 });
      course.name = `human-watchtower-string-${i}`;
      g.add(course);

      // Full corbel-table ring at the same transition, on all 4 faces --
      // directly mirrors the dwarven watchtower's own per-tier
      // `buildCorbelRow()` technique (previously entirely absent here).
      for (let f = 0; f < tier.faces.length; f++) {
        const face = tier.faces[f]!;
        const corbels = buildCorbelRow({ count: 3, spacing: Math.max(0.3, tier.halfW * 0.7), material: palette.weatheredStone });
        corbels.name = `human-watchtower-corbel-row-${i}-${f}`;
        corbels.position.y = tier.y - 0.05;
        placeOnFaceAtDepth(corbels, face, 0.5, 0);
        g.add(corbels);
      }
    }

    // Tapering corner buttresses: one stage per tier, so they physically
    // set back at every string-course line like real stepped masonry
    // buttresses -- adds vertical relief breaking up each face's blank
    // stone expanse and reinforces the corners of an otherwise slender
    // tower. Two per corner (one on each adjoining face, near its edge)
    // approximate a real clasping/angle buttress without new diagonal-
    // placement math.
    const buttressWidth = Math.max(0.22, tier.halfW * 0.26);
    for (let f = 0; f < tier.faces.length; f++) {
      const face = tier.faces[f]!;
      for (const t of [0.08, 0.92]) {
        const buttress = buildButtress(
          { height: tier.height, width: buttressWidth, stages: 1, depth: 0.26, cap: 'flat', seed: tagSeed(dna.seed, `BUT${i}${f}${t}`) },
          palette.weatheredStone,
        );
        buttress.name = `human-watchtower-buttress-${i}-${f}`;
        buttress.position.y = tier.y;
        placeOnFaceAtDepth(buttress, face, t, 0);
        g.add(buttress);
      }
    }
  }

  const groundTier = tiers[0]!;
  const doorFace = groundTier.faces[3]!;
  const door = buildHumanDoor({ width: 0.8, height: 2.0, wallZ: wallZFor(3, groundTier.halfW, groundTier.halfD), palette: openingPalette, stoneSurround: true });
  door.name = 'human-door';
  placeOnFace(door, doorFace, 0.5);
  g.add(door);
  const doorArch = buildVoussoirArch({ width: 1.05, springHeight: 2.0, archRatio: 0.55, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'TOWERARCH') });
  doorArch.name = 'human-chapel-arch';
  placeOnFaceAtDepth(doorArch, doorFace, 0.5, 0);
  g.add(doorArch);

  // Arrow loops: one per exposed face per upper floor.
  for (let i = 1; i < tiers.length; i++) {
    const tier = tiers[i]!;
    for (let f = 0; f < tier.faces.length; f++) {
      const face = tier.faces[f]!;
      const loop = buildArrowLoop(wallZFor(f, tier.halfW, tier.halfD), openingPalette);
      loop.position.y = tier.y + tier.height * 0.55;
      placeOnFace(loop, face, 0.5);
      g.add(loop);
    }
  }

  const topTier = tiers[tiers.length - 1]!;
  const topY = topTier.y + topTier.height;
  const crownRand = mulberry32(tagSeed(dna.seed, 'CROWN'));
  const crown = pickWeighted<WatchtowerCrown>(crownRand, [
    ['crenellated-parapet', 0.45],
    ['slate-pyramidal', 0.35],
    ['tile-hipped-cap', 0.2],
  ]);

  if (crown === 'crenellated-parapet') {
    const parapet = buildHumanCrenellatedParapet(topTier.points, topTier.faces, palette.weatheredStone);
    parapet.position.y = topY;
    g.add(parapet);
  } else {
    const roofFamily: HumanRoofFamily = crown === 'slate-pyramidal' ? 'slate-hip' : 'tile-hip';
    const ridgeHeight = crown === 'slate-pyramidal' ? topTier.halfW * 1.6 : topTier.halfW * 1.1;
    const roof = buildHumanRoof(roofFamily, topTier.halfW, topTier.halfD, ridgeHeight, tagSeed(dna.seed, 'CROWNROOF'), palette, 0.12);
    roof.position.y = topY;
    g.add(roof);
    const parapetLip = buildStringCourse(topTier.points, palette.weatheredStone, { y: topY - 0.06, proudDepth: 0.06, outset: 0.02 });
    g.add(parapetLip);
  }

  // A small timber lookout hoarding cantilevered on stone corbels over
  // one face -- the spec's "timber hoarding/lookout" detail axis, and
  // (unconditionally, unlike the 35%-weighted variant this replaced) the
  // watchtower's one guaranteed real TimberFrame member, since a pure
  // masonry tower otherwise never touches the shared kit's flagship
  // timber-frame technique at all. Built from a genuine (if tiny)
  // `buildTimberFramePanel` back-rail, not hand-rolled boxes.
  const hoarding = new THREE.Group();
  hoarding.name = 'human-hoarding';
  const platform = new THREE.Mesh(new THREE.BoxGeometry(topTier.halfW * 1.6, 0.08, 0.5), palette.oakTimber);
  platform.name = 'hoarding-platform';
  platform.castShadow = platform.receiveShadow = true;
  platform.position.set(0, 0.1, 0.25);
  hoarding.add(platform);
  for (const cx of [-topTier.halfW * 0.6, topTier.halfW * 0.6]) {
    const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.4), palette.weatheredStone);
    corbel.name = 'hoarding-corbel';
    corbel.castShadow = corbel.receiveShadow = true;
    corbel.position.set(cx, 0.03, 0.2);
    hoarding.add(corbel);
  }
  const railFrame = buildTimberFramePanel({
    width: topTier.halfW * 1.6,
    height: 0.55,
    pattern: 'simpleBrace',
    seed: tagSeed(dna.seed, 'HOARDRAIL'),
    timberMaterial: palette.oakTimber,
    infillMaterial: palette.plaster,
  });
  railFrame.name = 'hoarding-rail-frame';
  railFrame.position.set(-topTier.halfW * 0.8, 0.14, 0.45);
  hoarding.add(railFrame);
  hoarding.position.y = topY - 0.3;
  placeOnFaceAtDepth(hoarding, topTier.faces[1]!, 0.5, 0);
  g.add(hoarding);

  // Banner pole + lantern cage at the crown, hoisted on the parapet lip
  // (or roof eave line) facing the settlement.
  const banner = buildBannerPole({ poleMaterial: palette.oakTimber, bannerMaterial: palette.plasterAlt, height: 1.5 });
  banner.name = 'human-banner-pole';
  banner.position.set(0, topY + 0.1, topTier.halfD * 0.6);
  g.add(banner);
  const lantern = buildLanternCage({ material: palette.iron, paneMaterial: palette.litGlazing, lit: true });
  lantern.name = 'human-lantern-cage';
  lantern.position.set(topTier.halfW * 0.7, topY + 0.3, -topTier.halfD * 0.5);
  g.add(lantern);

  const plinth = buildRockPlinthSkirt({ points: groundTier.points, material: palette.weatheredStone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: doorFace });
  g.add(plinth);

  return g;
}
