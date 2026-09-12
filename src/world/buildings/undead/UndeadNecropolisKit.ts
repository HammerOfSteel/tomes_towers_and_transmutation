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
import { buildPlinthCourses, buildStringCourse } from '../kit/StringCourse';
import { buildFriezeBand, type FriezeVariant } from '../kit/Frieze';
import { buildPediment } from '../kit/Pediment';
import { buildRailSection, buildRailGate } from '../kit/Railing';
import { buildGallowsBracket } from '../kit/LanternKit';
import { buildMonument, type MonumentVariant } from '../kit/MonumentKit';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { buildButtress } from '../kit/Buttress';
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import { composeMainAndWing } from '../kit/MassComposer';
import { makeBatteredRectangleTiers } from '../kit/SteppedBatterProfile';
import { buildUndeadPalette, pickUndeadWeighted, tagUndeadSeed, type UndeadPalette } from './UndeadNecropolisPalette';
import {
  buildUndeadWindow,
  buildUndeadDoor,
  buildUndeadOculus,
  type UndeadOpeningPalette,
} from './UndeadOpenings';
import {
  buildCryptDoor,
  buildBarredLanternWindow,
  buildPlaqueNiche,
  buildReliquaryNiche,
  buildShoredCrack,
  buildSpoliaPatch,
  buildColumbariumBand,
  type CryptDoorVariant,
} from './UndeadFacadeModules';
import { buildUndeadLotDressing } from './UndeadLotDressing';

/**
 * UndeadNecropolisKit.ts — composes all eight canonical undead building
 * kinds (docs/superpowers/specs/2026-09-04-undead-buildings-design.md)
 * from the shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`)
 * plus the race-specific `UndeadNecropolisPalette.ts`/`UndeadOpenings.ts`/
 * `UndeadFacadeModules.ts`/`UndeadLotDressing.ts` modules.
 *
 * Every builder follows the doctrine (docs/superpowers/specs/
 * 2026-09-04-modular-building-kit-doctrine.md): a real depth ladder (no
 * coplanar surfaces), the five-piece opening minimum on every door/window/
 * niche, and zero blob/box placeholder openings or back-geometry. Undead's
 * own identity axis (design spec §1/§9 addendum, distinguishing it from
 * vampire): COMMUNAL, FUNERARY, HORIZONTAL, and MAINTAINED-DECAYING --
 * mausolea, ossuaries, monuments, retained ruins, crypt rows, classical
 * friezes, spolia, and broken-but-braced remnants, in contrast to
 * vampire's private/vertical/pristine/aristocratic manor forms. Damage is
 * curated civic infrastructure (spolia patches, timber shoring, braced
 * pediments), never abandoned beauty (that is elven's territory) and never
 * horror-glow (skulls/bone are sparse accents, not load-bearing identity).
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers (mirrors DwarvenBuildingKit.ts's/VampireBuildingKit.ts's
// own tagSeed/pickWeighted/placeOnFace/wallZFor/buildRectHall conventions;
// undead's own tagUndeadSeed/pickUndeadWeighted already live in
// UndeadNecropolisPalette.ts and are reused here rather than redeclared).
// ─────────────────────────────────────────────────────────────────────────

/** Rotates + positions `obj` onto `face` at fractional position `t` along
 * the face's own a->b segment. */
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
 * 1/3 (back/front) use `halfD`. */
function wallZFor(faceIndex: number, halfW: number, halfD: number): number {
  return faceIndex === 0 || faceIndex === 2 ? halfW : halfD;
}

function toOpeningPalette(palette: UndeadPalette): UndeadOpeningPalette {
  return {
    stone: palette.stone,
    glazing: palette.sealedGlazing,
    wood: palette.timber,
    iron: palette.iron,
    recess: palette.darkStone,
  };
}

/** Builds a rectangular hall's walls (per-course blocks), quoins at its 4
 * real corners, and a flat floor cap -- the shared rectangular-mass
 * technique every kind below reuses. */
function buildUndeadHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  material: THREE.Material,
  wallOpts: WallBlockOptions = {},
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  g.name = 'undead-hall';
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  const longestFace = 2 * Math.max(halfW, halfD);
  const walls = buildWallSurfaceBlocks(0, height, seed, material, {
    courseHeight: 0.4,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.7)),
    jitter: 0.035,
    ...wallOpts,
    facesOverride: wallOpts.facesOverride ?? faces,
  });
  g.add(walls);

  const quoins = buildQuoins(Math.max(halfW, halfD), height, undefined, material, points);
  quoins.name = 'undead-hall-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, material, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'undead-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Weighted roof-family pick: 'gable' (steep gable, `buildGableRoof`) or
 * 'hip' (4-sided hip, `buildHipRoof`). */
type UndeadRoofFamily = 'gable' | 'hip';

function buildUndeadRoof(
  family: UndeadRoofFamily,
  halfW: number,
  halfD: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  opts: RoofMassingOptions = {},
): THREE.Group {
  if (family === 'hip') return buildHipRoof(halfW, halfD, ridgeHeight, seed, material, opts);
  return buildGableRoof(halfW, halfD, ridgeHeight, seed, material, opts);
}

/**
 * A "table-tomb lid" roof: a stepped two-course raised slab cap (base
 * course + inset cap course, real separate volumes at different heights),
 * evoking a sarcophagus lid rather than a pitched roof -- one of undead's
 * signature roof archetypes across nearly every kind's blueprint. Never a
 * single flat plane.
 */
function buildTableTombLidRoof(halfW: number, halfD: number, seed: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'table-tomb-lid-roof';
  const rand = mulberry32(seed);

  const baseHeight = 0.22;
  const base = new THREE.Mesh(new THREE.BoxGeometry((halfW + 0.14) * 2, baseHeight, (halfD + 0.14) * 2), material);
  base.name = 'lid-base-course';
  base.position.y = baseHeight / 2;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const capHeight = 0.18;
  const capW = Math.max(0.3, halfW * 2 - 0.24);
  const capD = Math.max(0.3, halfD * 2 - 0.24);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, capHeight, capD), material);
  cap.name = 'lid-cap-course';
  cap.position.y = baseHeight + capHeight / 2;
  cap.castShadow = cap.receiveShadow = true;
  g.add(cap);

  if (rand() > 0.4) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, capHeight * 0.7, capD * 0.9), material);
    seam.name = 'lid-weather-seam';
    seam.position.set((rand() - 0.5) * halfW * 0.8, baseHeight + capHeight * 0.3, 0);
    g.add(seam);
  }

  return g;
}

type FinialKind = 'urn' | 'cross' | 'obelisk' | 'none';

/** A small funerary-monument roof finial (urn/cross/obelisk) or `null`
 * for a deliberately missing/broken finial -- reuses `MonumentKit`'s
 * plinth+body+cap volumes at small scale rather than a single primitive
 * ball, matching real cemetery-architecture practice of monument-shaped
 * roof finials. */
function buildRoofFinial(kind: FinialKind, palette: UndeadPalette, seed: number): THREE.Group | null {
  if (kind === 'none') return null;
  const variant: MonumentVariant = kind === 'obelisk' ? 'obelisk' : kind === 'cross' ? 'cross' : 'urn';
  const finial = buildMonument({
    variant,
    material: palette.stone,
    plinthMaterial: palette.darkStone,
    seed,
    height: kind === 'obelisk' ? 0.55 : 0.4,
    width: 0.26,
  });
  finial.name = `roof-finial-${kind}`;
  return finial;
}

/** A small belfry housing atop a chapel roof: a stone base block with a
 * real recessed arch opening (five-piece, via `buildUndeadWindow`) and a
 * bronze bell hanging inside, capped by a pyramidal stone-slate roof --
 * undead's "bellcote/obelisk finial" roof accent. */
function buildBellcote(palette: UndeadPalette, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bellcote';

  const baseW = 0.9;
  const baseD = 0.4;
  const baseH = 0.55;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), palette.stone);
  base.name = 'bellcote-base';
  base.position.y = baseH / 2;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  const archOpening = buildUndeadWindow({
    width: baseW * 0.5,
    height: baseH * 0.75,
    wallZ: baseD / 2,
    palette: toOpeningPalette(palette),
    shape: 'round',
  });
  archOpening.name = 'bellcote-arch';
  archOpening.position.y = baseH * 0.52;
  g.add(archOpening);

  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.15, 10, 1, true), palette.bronze);
  bell.name = 'bell';
  bell.position.y = baseH * 0.4;
  bell.rotation.x = Math.PI;
  bell.castShadow = bell.receiveShadow = true;
  g.add(bell);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(baseW * 0.42, 0.3, 4), palette.roofSlate);
  cap.name = 'bellcote-cap';
  cap.position.y = baseH + 0.15;
  cap.rotation.y = Math.PI / 4;
  cap.castShadow = cap.receiveShadow = true;
  g.add(cap);

  void seed;
  return g;
}

/** Wraps a grand doorway with a proud wedge-block voussoir arch ring
 * (villa/chapel/blacksmith's "voussoirs and keystone boss" front-door
 * language), layered OVER the mandatory five-piece opening rather than
 * replacing any of its parts. */
function addVoussoirHood(parent: THREE.Group, width: number, springHeight: number, wallZ: number, material: THREE.Material, seed: number): void {
  const arch = buildVoussoirArch({
    width: width * 1.18,
    springHeight,
    archRatio: 1.0,
    material,
    seed,
    keystoneProud: 0.05,
  });
  arch.name = 'voussoir-hood';
  arch.position.z = wallZ + 0.02;
  parent.add(arch);
}

const CRYPT_DOOR_VARIANTS: Array<[CryptDoorVariant, number]> = [
  ['iron-grille', 0.45],
  ['sealed-slab', 0.35],
  ['planked-repair', 0.2],
];

// ─────────────────────────────────────────────────────────────────────────
// house — family crypt dwelling / grave-keeper tomb
// ─────────────────────────────────────────────────────────────────────────

const HOUSE_WALL_HEIGHT = 2.7;

export function buildUndeadHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-house';

  const hall = buildUndeadHall(halfW, halfD, HOUSE_WALL_HEIGHT, tagUndeadSeed(dna.seed, 'HALL'), palette.stone);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.darkStone, 2, { height: 0.16 });
  g.add(plinth);

  const doorRand = mulberry32(tagUndeadSeed(dna.seed, 'DOOR'));
  const doorVariant = pickUndeadWeighted<CryptDoorVariant>(doorRand, CRYPT_DOOR_VARIANTS);
  const door = buildCryptDoor({
    width: 0.85,
    height: 1.65,
    wallZ: wallZFor(3, halfW, halfD),
    palette,
    variant: doorVariant,
    seed: dna.seed,
  });
  door.name = 'undead-house-door';
  placeOnFace(door, hall.faces[3]!, 0.3);
  g.add(door);

  // Side feature: lantern window / blind plaque / shored crack, one side only.
  const sideRand = mulberry32(tagUndeadSeed(dna.seed, 'SIDE'));
  const sideFeature = pickUndeadWeighted<'lantern' | 'plaque' | 'shored'>(sideRand, [
    ['lantern', 0.45],
    ['plaque', 0.3],
    ['shored', 0.25],
  ]);
  const sideFace = hall.faces[0]!;
  let sideFeatureGroup: THREE.Group;
  if (sideFeature === 'lantern') {
    sideFeatureGroup = buildBarredLanternWindow({ width: 0.45, height: 0.85, wallZ: wallZFor(0, halfW, halfD), palette });
  } else if (sideFeature === 'plaque') {
    sideFeatureGroup = buildPlaqueNiche({ width: 0.5, height: 0.6, wallZ: wallZFor(0, halfW, halfD), palette });
  } else {
    sideFeatureGroup = buildShoredCrack({ width: 1.0, height: HOUSE_WALL_HEIGHT * 0.8, wallZ: wallZFor(0, halfW, halfD), palette, seed: dna.seed });
  }
  sideFeatureGroup.name = `undead-house-side-${sideFeature}`;
  sideFeatureGroup.position.y = HOUSE_WALL_HEIGHT * 0.5;
  placeOnFace(sideFeatureGroup, sideFace, 0.5);
  g.add(sideFeatureGroup);

  // Rear: 30% chance of a sealed slab niche.
  const rearRand = mulberry32(tagUndeadSeed(dna.seed, 'REAR'));
  if (rearRand() < 0.3) {
    const rearNiche = buildPlaqueNiche({ width: 0.5, height: 0.55, wallZ: wallZFor(1, halfW, halfD), palette });
    rearNiche.name = 'undead-house-rear-niche';
    rearNiche.position.y = HOUSE_WALL_HEIGHT * 0.5;
    placeOnFace(rearNiche, hall.faces[1]!, 0.5);
    g.add(rearNiche);
  }

  // Roof: mausoleum gable / table-tomb lid / broken-pediment front.
  const roofRand = mulberry32(tagUndeadSeed(dna.seed, 'ROOF'));
  const roofKind = pickUndeadWeighted<'gable' | 'table-tomb' | 'broken-pediment'>(roofRand, [
    ['gable', 0.55],
    ['table-tomb', 0.3],
    ['broken-pediment', 0.15],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.3;
  if (roofKind === 'table-tomb') {
    const roof = buildTableTombLidRoof(halfW, halfD, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = HOUSE_WALL_HEIGHT;
    g.add(roof);
  } else {
    const roof = buildUndeadRoof('gable', halfW, halfD, ridgeHeight, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = HOUSE_WALL_HEIGHT;
    g.add(roof);
    if (roofKind === 'broken-pediment') {
      const pediment = buildPediment({ width: halfW * 1.7, variant: 'broken', material: palette.stone, tympanumMaterial: palette.darkStone });
      pediment.name = 'undead-house-pediment';
      pediment.position.set(0, HOUSE_WALL_HEIGHT, wallZFor(3, halfW, halfD) + 0.02);
      g.add(pediment);
    }
  }

  // Roof finial.
  const finialRand = mulberry32(tagUndeadSeed(dna.seed, 'FIN'));
  const finialKind = pickUndeadWeighted<FinialKind>(finialRand, [
    ['urn', 0.4],
    ['cross', 0.3],
    ['obelisk', 0.2],
    ['none', 0.1],
  ]);
  const finial = buildRoofFinial(finialKind, palette, tagUndeadSeed(dna.seed, 'FIN'));
  if (finial) {
    finial.position.y = HOUSE_WALL_HEIGHT + ridgeHeight * 0.6;
    g.add(finial);
  }

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// terraced — row of crypts sharing party walls
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_WALL_HEIGHT = 2.6;

export function buildUndeadTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-terraced';

  const hall = buildUndeadHall(halfW, halfD, TERRACED_WALL_HEIGHT, tagUndeadSeed(dna.seed, 'HALL'), palette.stone);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.darkStone, 2, { height: 0.14 });
  g.add(plinth);

  const bayRand = mulberry32(tagUndeadSeed(dna.seed, 'BAY'));
  const bayCount = pickUndeadWeighted<number>(bayRand, [[2, 0.35], [3, 0.5], [4, 0.15]]);

  for (let i = 0; i < bayCount; i++) {
    const t = (i + 0.5) / bayCount;
    const doorRand = mulberry32(tagUndeadSeed(dna.seed, `BDOOR${i}`));
    const variant = pickUndeadWeighted<CryptDoorVariant>(doorRand, CRYPT_DOOR_VARIANTS);
    const door = buildCryptDoor({
      width: Math.min(0.7, (halfW * 2) / bayCount - 0.25),
      height: 1.45,
      wallZ: wallZFor(3, halfW, halfD),
      palette,
      variant,
      seed: dna.seed + i * 17,
    });
    door.name = `undead-terraced-door-${i}`;
    placeOnFace(door, hall.faces[3]!, t);
    g.add(door);

    // Above-bay feature: bay 0 is forced to an oculus to guarantee "at
    // least one bay differs from the others" (doctrine Rule 7) rather
    // than leaving that to chance.
    let above: THREE.Group;
    if (i === 0) {
      above = buildUndeadOculus({ diameter: 0.4, wallZ: wallZFor(3, halfW, halfD), palette: toOpeningPalette(palette) });
      above.name = `undead-terraced-oculus-${i}`;
    } else {
      above = buildPlaqueNiche({ width: 0.4, height: 0.35, wallZ: wallZFor(3, halfW, halfD), palette });
      above.name = `undead-terraced-plaque-${i}`;
    }
    above.position.y = 1.95;
    placeOnFace(above, hall.faces[3]!, t);
    g.add(above);
  }

  // Frieze band under the cornice ties the row together.
  const friezeRand = mulberry32(tagUndeadSeed(dna.seed, 'FRIEZE'));
  const friezeVariant = pickUndeadWeighted<FriezeVariant>(friezeRand, [
    ['greek-key', 0.45],
    ['dentil', 0.3],
    ['plain-double-string', 0.15],
    ['cracked', 0.1],
  ]);
  const frieze = buildFriezeBand({ length: halfW * 2, variant: friezeVariant, material: palette.stone, seed: dna.seed });
  frieze.name = 'undead-terraced-frieze';
  frieze.position.set(0, TERRACED_WALL_HEIGHT - 0.24, wallZFor(3, halfW, halfD) + 0.01);
  g.add(frieze);

  // Roof: continuous table-tomb lid or gable cap.
  const roofRand = mulberry32(tagUndeadSeed(dna.seed, 'ROOF'));
  const roofKind = pickUndeadWeighted<'table-tomb' | 'gable'>(roofRand, [['table-tomb', 0.5], ['gable', 0.5]]);
  if (roofKind === 'table-tomb') {
    const roof = buildTableTombLidRoof(halfW, halfD, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = TERRACED_WALL_HEIGHT;
    g.add(roof);
  } else {
    const roof = buildUndeadRoof('gable', halfW, halfD, Math.min(halfW, halfD) * 1.0, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = TERRACED_WALL_HEIGHT;
    g.add(roof);
  }

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// villa — patrician mausoleum / columbarium hall
// ─────────────────────────────────────────────────────────────────────────

export function buildUndeadVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const floors = Math.min(3, Math.max(2, dna.floors));
  const storeyHeight = 3.0;
  const height = floors * storeyHeight;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-villa';

  const hall = buildUndeadHall(halfW, halfD, height, tagUndeadSeed(dna.seed, 'HALL'), palette.stone);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.spolia, 3, { height: 0.2 });
  g.add(plinth);

  for (let f = 1; f < floors; f++) {
    const cornice = buildStringCourse(hall.points, palette.darkStone, { height: 0.12 });
    cornice.position.y = f * storeyHeight;
    g.add(cornice);
  }

  // Front ground-floor grand arch door with a voussoir hood.
  const door = buildCryptDoor({
    width: 1.2,
    height: 2.1,
    wallZ: wallZFor(3, halfW, halfD),
    palette,
    variant: 'iron-grille',
    seed: dna.seed,
  });
  door.name = 'undead-villa-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);
  addVoussoirHood(g, 1.2, 1.6, wallZFor(3, halfW, halfD), palette.stone, tagUndeadSeed(dna.seed, 'HOOD'));

  // Upper front bays: 3 or 5, alternating lantern/blind-niche.
  const bayRand = mulberry32(tagUndeadSeed(dna.seed, 'FBAY'));
  const bayCount = pickUndeadWeighted<number>(bayRand, [[3, 0.55], [5, 0.45]]);
  for (let f = 1; f < floors; f++) {
    for (let i = 0; i < bayCount; i++) {
      const t = (i + 0.5) / bayCount;
      const isBlind = i % 2 === 0;
      const bay = isBlind
        ? buildPlaqueNiche({ width: 0.5, height: 0.55, wallZ: wallZFor(3, halfW, halfD), palette })
        : buildBarredLanternWindow({ width: 0.5, height: 0.6, wallZ: wallZFor(3, halfW, halfD), palette });
      bay.name = `undead-villa-bay-${f}-${i}`;
      bay.position.y = f * storeyHeight + storeyHeight * 0.5;
      placeOnFace(bay, hall.faces[3]!, t);
      g.add(bay);
    }
  }

  // Side plaque niches.
  for (const fi of [0, 2]) {
    for (let i = 0; i < 3; i++) {
      const t = (i + 0.5) / 3;
      const niche = buildPlaqueNiche({ width: 0.42, height: 0.5, wallZ: wallZFor(fi, halfW, halfD), palette });
      niche.name = `undead-villa-side-niche-${fi}-${i}`;
      niche.position.y = storeyHeight * 0.5;
      placeOnFace(niche, hall.faces[fi]!, t);
      g.add(niche);
    }
  }

  // Ruin/repair asymmetry: a mismatched spolia patch on one side wall.
  const patch = buildSpoliaPatch({ width: 1.0, height: 1.0, wallZ: wallZFor(0, halfW, halfD), palette, seed: dna.seed });
  patch.name = 'undead-villa-patch';
  patch.position.y = storeyHeight * 1.4;
  placeOnFace(patch, hall.faces[0]!, 0.78);
  g.add(patch);

  // Roof.
  const roofRand = mulberry32(tagUndeadSeed(dna.seed, 'ROOF'));
  const roofKind = pickUndeadWeighted<'hip' | 'table-tomb'>(roofRand, [['hip', 0.6], ['table-tomb', 0.4]]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.2;
  if (roofKind === 'table-tomb') {
    const roof = buildTableTombLidRoof(halfW, halfD, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = height;
    g.add(roof);
  } else {
    const roof = buildUndeadRoof('hip', halfW, halfD, ridgeHeight, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
    roof.position.y = height;
    g.add(roof);
  }
  const finial = buildRoofFinial('obelisk', palette, tagUndeadSeed(dna.seed, 'FIN'));
  if (finial) {
    finial.position.y = height + ridgeHeight * 0.55;
    g.add(finial);
  }

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 8 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// inn — ossuary rest hall / bier hostel
// ─────────────────────────────────────────────────────────────────────────

export function buildUndeadInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const storeyHeight = 3.0;
  const height = storeyHeight * 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-inn';

  const hall = buildUndeadHall(halfW, halfD, height, tagUndeadSeed(dna.seed, 'HALL'), palette.stone);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.darkStone, 2, { height: 0.18 });
  g.add(plinth);

  // Three-bay front arcade: middle = main entry, flanking = bier niches.
  const bayPositions = [0.2, 0.5, 0.8];
  bayPositions.forEach((t, i) => {
    if (i === 1) {
      const door = buildCryptDoor({ width: 1.1, height: 2.0, wallZ: wallZFor(3, halfW, halfD), palette, variant: 'iron-grille', seed: dna.seed });
      door.name = 'undead-inn-entry';
      placeOnFace(door, hall.faces[3]!, t);
      g.add(door);
    } else {
      const niche = buildReliquaryNiche({ width: 0.7, height: 1.1, wallZ: wallZFor(3, halfW, halfD), palette, seed: dna.seed + i });
      niche.name = `undead-inn-arcade-niche-${i}`;
      niche.position.y = 0.7;
      placeOnFace(niche, hall.faces[3]!, t);
      g.add(niche);
    }
  });

  // Upper front rhythm: columbarium band.
  const columbarium = buildColumbariumBand({ width: halfW * 1.6, height: 1.1, wallZ: wallZFor(3, halfW, halfD), palette, rows: 2, cols: 4 });
  columbarium.name = 'undead-inn-columbarium';
  columbarium.position.y = storeyHeight + 0.6;
  placeOnFace(columbarium, hall.faces[3]!, 0.5);
  g.add(columbarium);

  // Side vents.
  for (const fi of [0, 2]) {
    const vent = buildBarredLanternWindow({ width: 0.4, height: 0.5, wallZ: wallZFor(fi, halfW, halfD), palette });
    vent.name = `undead-inn-side-vent-${fi}`;
    vent.position.y = storeyHeight * 1.5;
    placeOnFace(vent, hall.faces[fi]!, 0.5);
    g.add(vent);
  }

  // Rear service arch, offset from centre.
  const rearArch = buildUndeadDoor({ width: 1.0, height: 1.9, wallZ: wallZFor(1, halfW, halfD), palette: toOpeningPalette(palette) });
  rearArch.name = 'undead-inn-rear-arch';
  placeOnFace(rearArch, hall.faces[1]!, 0.32);
  g.add(rearArch);

  // Asymmetry: one shored bay near the left front corner.
  const shored = buildShoredCrack({ width: 0.8, height: storeyHeight * 0.9, wallZ: wallZFor(3, halfW, halfD), palette, seed: dna.seed + 5 });
  shored.name = 'undead-inn-shored-bay';
  shored.position.y = storeyHeight * 0.5;
  placeOnFace(shored, hall.faces[3]!, 0.06);
  g.add(shored);

  // Long stone-slate gable roof.
  const roof = buildUndeadRoof('gable', halfW, halfD, Math.min(halfW, halfD) * 1.1, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
  roof.position.y = height;
  g.add(roof);

  // Lantern brackets flanking the entry.
  for (const side of [-1, 1]) {
    const bracket = buildGallowsBracket({ material: palette.iron, paneMaterial: palette.lanternGlow });
    bracket.name = `undead-inn-lantern-bracket-${side}`;
    bracket.position.set(side * 0.75, storeyHeight * 0.75, wallZFor(3, halfW, halfD) + 0.05);
    bracket.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    g.add(bracket);
  }

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 7 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// shop — reliquary market under a crypt arcade
// ─────────────────────────────────────────────────────────────────────────

const SHOP_WALL_HEIGHT = 2.4;

export function buildUndeadShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-shop';

  // Shallow U-shaped shell: rear wall + two short side returns, front open.
  const rearFace = rectangleFaces(halfW, halfD)[1]!;
  const points = rectanglePoints(halfW, halfD);
  const wallSeed = tagUndeadSeed(dna.seed, 'HALL');
  const walls = buildWallSurfaceBlocks(0, SHOP_WALL_HEIGHT, wallSeed, palette.stone, {
    courseHeight: 0.38,
    blocksPerFace: Math.max(3, Math.round((halfW * 2) / 0.7)),
    jitter: 0.03,
    facesOverride: [rectangleFaces(halfW, halfD)[0]!, rectangleFaces(halfW, halfD)[1]!, rectangleFaces(halfW, halfD)[2]!],
  });
  walls.name = 'undead-shop-shell';
  g.add(walls);
  const quoins = buildQuoins(Math.max(halfW, halfD), SHOP_WALL_HEIGHT, undefined, palette.stone, points);
  g.add(quoins);
  const floorCap = buildFloorCap(0, palette.stone, undefined, points);
  floorCap.position.y = SHOP_WALL_HEIGHT;
  g.add(floorCap);

  const plinth = buildPlinthCourses(points, palette.darkStone, 2, { height: 0.16 });
  g.add(plinth);

  // Front counter arch (wide single arcade).
  const counterArch = buildUndeadDoor({ width: 1.9, height: 2.0, wallZ: halfD - 0.3, palette: toOpeningPalette(palette) });
  counterArch.name = 'undead-shop-front-arch';
  counterArch.position.y = 0;
  g.add(counterArch);

  // Sarcophagus counter across the front, waist-height, projecting proud.
  const counter = buildMonument({ variant: 'table-tomb', material: palette.stone, plinthMaterial: palette.darkStone, seed: dna.seed, width: halfW * 1.3, height: 0.85 });
  counter.name = 'undead-shop-counter';
  counter.position.set(0, 0, halfD - 0.55);
  g.add(counter);

  // Rear reliquary display niche + repaired crack.
  const rearNiche = buildReliquaryNiche({ width: 0.65, height: 0.8, wallZ: wallZFor(1, halfW, halfD), palette, seed: dna.seed });
  rearNiche.name = 'undead-shop-rear-niche';
  rearNiche.position.y = 1.1;
  placeOnFace(rearNiche, rearFace, 0.32);
  g.add(rearNiche);

  const crack = buildShoredCrack({ width: 0.6, height: 1.0, wallZ: wallZFor(1, halfW, halfD), palette, seed: dna.seed + 3 });
  crack.name = 'undead-shop-rear-crack';
  crack.position.y = 0.9;
  placeOnFace(crack, rearFace, 0.7);
  g.add(crack);

  // Side lantern niche.
  const sideLantern = buildBarredLanternWindow({ width: 0.35, height: 0.5, wallZ: wallZFor(0, halfW, halfD), palette });
  sideLantern.name = 'undead-shop-side-lantern';
  sideLantern.position.y = 1.2;
  placeOnFace(sideLantern, rectangleFaces(halfW, halfD)[0]!, 0.5);
  g.add(sideLantern);

  // Stone arcade canopy: a proud slab lintel over the counter arch.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2.1, 0.18, 0.4), palette.stone);
  canopy.name = 'undead-shop-canopy';
  canopy.position.set(0, SHOP_WALL_HEIGHT + 0.05, halfD + 0.1);
  canopy.castShadow = canopy.receiveShadow = true;
  g.add(canopy);
  const canopySupport = buildGallowsBracket({ material: palette.timber, paneMaterial: palette.lanternGlow, lit: false });
  canopySupport.name = 'undead-shop-canopy-brace';
  canopySupport.position.set(halfW - 0.3, SHOP_WALL_HEIGHT - 0.2, halfD - 0.05);
  canopySupport.rotation.y = Math.PI;
  g.add(canopySupport);

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// blacksmith — grave-forge / cemetery ironworks
// ─────────────────────────────────────────────────────────────────────────

const BLACKSMITH_WALL_HEIGHT = 3.0;

export function buildUndeadBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-blacksmith';

  const stackWingWidth = Math.min(1.4, fp.w * 0.3);
  const composed = composeMainAndWing({
    mainWidth: fp.w,
    mainDepth: fp.d,
    mainHeight: BLACKSMITH_WALL_HEIGHT,
    wing: { width: stackWingWidth, depth: stackWingWidth, height: BLACKSMITH_WALL_HEIGHT * 0.6, side: 'right', alongFraction: 0.15 },
  });

  const mainWalls = buildWallSurfaceBlocks(0, BLACKSMITH_WALL_HEIGHT, tagUndeadSeed(dna.seed, 'MAIN'), palette.stone, {
    courseHeight: 0.4,
    blocksPerFace: Math.max(3, Math.round((fp.w * 2) / 0.7)),
    jitter: 0.04,
    facesOverride: composed.main.faces,
  });
  mainWalls.name = 'undead-blacksmith-main-walls';
  g.add(mainWalls);
  const mainQuoins = buildQuoins(Math.max(fp.w, fp.d) / 2, BLACKSMITH_WALL_HEIGHT, undefined, palette.stone, composed.main.points);
  g.add(mainQuoins);
  const mainCap = buildFloorCap(0, palette.stone, undefined, composed.main.points);
  mainCap.position.y = BLACKSMITH_WALL_HEIGHT;
  g.add(mainCap);

  const wingWalls = buildWallSurfaceBlocks(0, composed.wing.height, tagUndeadSeed(dna.seed, 'WING'), palette.spolia, {
    courseHeight: 0.35,
    blocksPerFace: 3,
    jitter: 0.04,
    facesOverride: composed.wing.faces,
  });
  wingWalls.name = 'undead-blacksmith-wing-walls';
  g.add(wingWalls);
  const wingCap = buildFloorCap(0, palette.spolia, undefined, composed.wing.points);
  wingCap.position.y = composed.wing.height;
  g.add(wingCap);

  const plinth = buildPlinthCourses(composed.main.points, palette.darkStone, 2, { height: 0.18 });
  g.add(plinth);

  // Broad forge/work arch on the front face.
  const frontFace = composed.main.faces[3]!;
  const forgeArch = buildUndeadDoor({ width: 1.5, height: 1.8, wallZ: wallZFor(3, fp.w / 2, fp.d / 2), palette: toOpeningPalette(palette) });
  forgeArch.name = 'undead-blacksmith-forge-arch';
  placeOnFace(forgeArch, frontFace, 0.35);
  g.add(forgeArch);
  addVoussoirHood(g, 1.5, 1.1, wallZFor(3, fp.w / 2, fp.d / 2), palette.stone, tagUndeadSeed(dna.seed, 'HOOD'));

  // Barred vent on the opposite wall.
  const vent = buildBarredLanternWindow({ width: 0.5, height: 0.5, wallZ: wallZFor(0, fp.w / 2, fp.d / 2), palette });
  vent.name = 'undead-blacksmith-vent';
  vent.position.y = BLACKSMITH_WALL_HEIGHT * 0.6;
  placeOnFace(vent, composed.main.faces[0]!, 0.5);
  g.add(vent);

  // Crematory-like stack rising from the wing.
  const stack = buildCorbelledChimneyStack({
    width: stackWingWidth * 0.7,
    depth: stackWingWidth * 0.7,
    height: 5.5,
    material: palette.stone,
    collarMaterial: palette.iron,
    seed: tagUndeadSeed(dna.seed, 'STACK'),
  });
  stack.name = 'undead-blacksmith-stack';
  stack.position.set(composed.wing.center[0], composed.wing.height, composed.wing.center[1]);
  g.add(stack);

  // Half-gabled lean-to roof over the main hall, with a shored corner.
  const roof = buildUndeadRoof('gable', fp.w / 2, fp.d / 2, Math.min(fp.w, fp.d) * 0.5, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
  roof.position.y = BLACKSMITH_WALL_HEIGHT;
  g.add(roof);
  const shoredCorner = buildShoredCrack({ width: 0.9, height: 1.2, wallZ: wallZFor(2, fp.w / 2, fp.d / 2), palette, seed: dna.seed + 9 });
  shoredCorner.name = 'undead-blacksmith-shored-corner';
  shoredCorner.position.y = BLACKSMITH_WALL_HEIGHT * 0.6;
  placeOnFace(shoredCorner, composed.main.faces[2]!, 0.85);
  g.add(shoredCorner);

  // Iron rail yard boundary + gate panel leaning on the wall.
  const rail = buildRailSection({ length: fp.d * 0.9, material: palette.iron, finialMaterial: palette.iron, seed: dna.seed });
  rail.name = 'undead-blacksmith-yard-rail';
  rail.rotation.y = Math.PI / 2;
  rail.position.set(-(fp.w / 2 + 0.3), 0, 0);
  g.add(rail);

  const dressing = buildUndeadLotDressing({ halfW: fp.w / 2, halfD: fp.d / 2, palette, seed: dna.seed, propCount: 5 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// chapel — flagship necropolis chapel / ceremonial mausoleum
// ─────────────────────────────────────────────────────────────────────────

const CHAPEL_NAVE_HEIGHT = 3.3;

export function buildUndeadChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-chapel';

  const nave = buildUndeadHall(halfW, halfD, CHAPEL_NAVE_HEIGHT, tagUndeadSeed(dna.seed, 'NAVE'), palette.stone);
  g.add(nave.group);

  const plinth = buildPlinthCourses(nave.points, palette.spolia, 3, { height: 0.2 });
  g.add(plinth);

  // Grand front gate/door with voussoir hood.
  const door = buildCryptDoor({ width: 1.1, height: 2.2, wallZ: wallZFor(3, halfW, halfD), palette, variant: 'iron-grille', seed: dna.seed });
  door.name = 'undead-chapel-door';
  placeOnFace(door, nave.faces[3]!, 0.5);
  g.add(door);
  addVoussoirHood(g, 1.1, 1.65, wallZFor(3, halfW, halfD), palette.stone, tagUndeadSeed(dna.seed, 'HOOD'));

  // Side buttresses + 3 bays per long side.
  const bayT = [0.2, 0.5, 0.8];
  for (const fi of [0, 2]) {
    for (const t of bayT) {
      const buttress = buildButtress({
        height: CHAPEL_NAVE_HEIGHT * 0.85,
        width: 0.4,
        depth: 0.35,
        stages: 2,
        seed: tagUndeadSeed(dna.seed, `BUTR${fi}_${Math.round(t * 10)}`),
      }, palette.spolia);
      buttress.name = `undead-chapel-buttress-${fi}-${t}`;
      buttress.position.z = wallZFor(fi, halfW, halfD) - 0.12;
      placeOnFace(buttress, nave.faces[fi]!, t);
      g.add(buttress);
    }

    const bayRand = mulberry32(tagUndeadSeed(dna.seed, `BAYMOD${fi}`));
    bayT.forEach((t, i) => {
      const bayKind = pickUndeadWeighted<'lantern' | 'niche' | 'sealed'>(bayRand, [
        ['lantern', 0.4],
        ['niche', 0.3],
        ['sealed', 0.3],
      ]);
      let bay: THREE.Group;
      if (bayKind === 'lantern') {
        bay = buildBarredLanternWindow({ width: 0.55, height: 1.4, wallZ: wallZFor(fi, halfW, halfD), palette });
      } else if (bayKind === 'niche') {
        bay = buildPlaqueNiche({ width: 0.5, height: 0.9, wallZ: wallZFor(fi, halfW, halfD), palette });
      } else {
        bay = buildShoredCrack({ width: 0.6, height: 1.3, wallZ: wallZFor(fi, halfW, halfD), palette, seed: dna.seed + i });
      }
      bay.name = `undead-chapel-bay-${fi}-${i}`;
      bay.position.y = CHAPEL_NAVE_HEIGHT * 0.5;
      placeOnFace(bay, nave.faces[fi]!, t);
      g.add(bay);
    });
  }

  // Rear: blind plaque + two urn niches (apse simplification).
  const apseNiche = buildPlaqueNiche({ width: 0.6, height: 0.7, wallZ: wallZFor(1, halfW, halfD), palette });
  apseNiche.name = 'undead-chapel-apse-plaque';
  apseNiche.position.y = CHAPEL_NAVE_HEIGHT * 0.55;
  placeOnFace(apseNiche, nave.faces[1]!, 0.5);
  g.add(apseNiche);
  for (const t of [0.2, 0.8]) {
    const urnNiche = buildReliquaryNiche({ width: 0.45, height: 0.55, wallZ: wallZFor(1, halfW, halfD), palette, seed: dna.seed });
    urnNiche.name = `undead-chapel-apse-urn-${t}`;
    urnNiche.position.y = CHAPEL_NAVE_HEIGHT * 0.4;
    placeOnFace(urnNiche, nave.faces[1]!, t);
    g.add(urnNiche);
  }

  // Frieze under the cornice.
  const frieze = buildFriezeBand({ length: halfD * 2, variant: 'greek-key', material: palette.stone, seed: dna.seed });
  frieze.name = 'undead-chapel-frieze';
  frieze.rotation.y = Math.PI / 2;
  frieze.position.set(halfW - 0.02, CHAPEL_NAVE_HEIGHT - 0.28, 0);
  g.add(frieze);

  // Roof: steep stone-slate gable with a bellcote finial.
  const roofRand = mulberry32(tagUndeadSeed(dna.seed, 'ROOF'));
  const roofRise = Math.min(halfW, halfD) * 1.6 + (roofRand() < 0.35 ? 0 : 0);
  const roof = buildUndeadRoof('gable', halfW, halfD, roofRise, tagUndeadSeed(dna.seed, 'ROOF'), palette.roofSlate);
  roof.position.y = CHAPEL_NAVE_HEIGHT;
  g.add(roof);

  const pediment = buildPediment({ width: halfW * 1.8, variant: 'broken', material: palette.stone, tympanumMaterial: palette.darkStone, medallion: true, medallionMaterial: palette.bronze });
  pediment.name = 'undead-chapel-pediment';
  pediment.position.set(0, CHAPEL_NAVE_HEIGHT, wallZFor(3, halfW, halfD) + 0.02);
  g.add(pediment);

  const bellcote = buildBellcote(palette, tagUndeadSeed(dna.seed, 'BELL'));
  bellcote.name = 'undead-chapel-bellcote';
  bellcote.position.y = CHAPEL_NAVE_HEIGHT + roofRise;
  g.add(bellcote);

  // Forecourt: rail gate + pavers via lot dressing, plus a paired-obelisk avenue.
  const gate = buildRailGate({ width: 1.6, height: 1.1, material: palette.iron, finialMaterial: palette.iron });
  gate.name = 'undead-chapel-forecourt-gate';
  gate.position.set(0, 0, halfD + 1.4);
  g.add(gate);

  for (const side of [-1, 1]) {
    const obelisk = buildMonument({ variant: 'obelisk', material: palette.stone, plinthMaterial: palette.darkStone, seed: dna.seed + side, height: 1.1, width: 0.35 });
    obelisk.name = `undead-chapel-obelisk-${side}`;
    obelisk.position.set(side * 1.3, 0, halfD + 0.9);
    g.add(obelisk);
  }

  const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// watchtower — cemetery sentinel obelisk / bell-watch monument
// ─────────────────────────────────────────────────────────────────────────

export function buildUndeadWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const baseHalfW = fp.w / 2;
  const baseHalfD = fp.d / 2;
  const palette = buildUndeadPalette(dna);
  const g = new THREE.Group();
  g.name = 'undead-watchtower';

  const tierHeights = [2.6, 2.4, 2.2];
  const tiers = makeBatteredRectangleTiers(baseHalfW, baseHalfD, tierHeights, {
    baseBatterFrac: 0.1,
    insetPerTierFrac: 0.12,
  });

  let shaftTopY = 0;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const wallSeed = tagUndeadSeed(dna.seed, `TIER${i}`);
    const wallGroup = new THREE.Group();
    const walls = buildWallSurfaceBlocks(0, tier.height, wallSeed, palette.stone, {
      courseHeight: 0.4,
      blocksPerFace: 3,
      jitter: 0.03,
      facesOverride: tier.faces,
    });
    wallGroup.add(walls);
    const quoins = buildQuoins(Math.max(tier.halfW, tier.halfD), tier.height, undefined, palette.stone, tier.points);
    wallGroup.add(quoins);
    wallGroup.position.y = tier.y;
    wallGroup.name = `undead-watchtower-tier-${i}`;
    g.add(wallGroup);

    if (i > 0) {
      const belt = buildStringCourse(tier.points, palette.darkStone, { height: 0.1 });
      belt.position.y = tier.y;
      g.add(belt);
    }

    if (i === 0) {
      const door = buildUndeadDoor({ width: 0.55, height: 1.45, wallZ: wallZFor(3, tier.halfW, tier.halfD), palette: toOpeningPalette(palette) });
      door.name = 'undead-watchtower-door';
      placeOnFace(door, tier.faces[3]!, 0.5);
      g.add(door);
    } else {
      const slit = buildBarredLanternWindow({ width: 0.3, height: 0.6, wallZ: wallZFor(3, tier.halfW, tier.halfD), palette });
      slit.name = `undead-watchtower-slit-${i}`;
      slit.position.y = tier.height * 0.5;
      placeOnFace(slit, tier.faces[3]!, 0.5);
      g.add(slit);

      // A shored crack repair scar at mid-height, on one seed-chosen tier.
      if (i === 1) {
        const scar = buildShoredCrack({ width: 0.5, height: tier.height * 0.7, wallZ: wallZFor(0, tier.halfW, tier.halfD), palette, seed: dna.seed });
        scar.name = 'undead-watchtower-repair-scar';
        scar.position.y = tier.height * 0.5;
        placeOnFace(scar, tier.faces[0]!, 0.5);
        g.add(scar);
      }
    }

    shaftTopY = tier.y + tier.height;
  }

  const topTier = tiers[tiers.length - 1]!;
  const floorCap = buildFloorCap(0, palette.stone, undefined, topTier.points);
  floorCap.position.y = shaftTopY;
  g.add(floorCap);

  const corbelCourse = buildStringCourse(topTier.points, palette.darkStone, { height: 0.14, outset: 0.08 });
  corbelCourse.position.y = shaftTopY - 0.12;
  g.add(corbelCourse);

  // Rail platform crown around the top.
  const railRand = mulberry32(tagUndeadSeed(dna.seed, 'CROWN'));
  const rails: THREE.Group[] = [];
  const crownFaces = rectangleFaces(topTier.halfW, topTier.halfD);
  for (const face of crownFaces) {
    const length = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
    const rail = buildRailSection({ length: length * 0.85, height: 0.45, material: palette.iron, finialMaterial: palette.iron, seed: dna.seed });
    placeOnFace(rail, face, 0.5);
    rail.position.y = shaftTopY;
    rails.push(rail);
  }
  rails.forEach((r, i) => { r.name = `undead-watchtower-crown-rail-${i}`; g.add(r); });
  void railRand;

  // Small obelisk cap monument as the tower's finial.
  const finial = buildMonument({ variant: 'obelisk', material: palette.stone, plinthMaterial: palette.darkStone, seed: dna.seed, height: 1.4, width: 0.4 });
  finial.name = 'undead-watchtower-finial';
  finial.position.y = shaftTopY + 0.15;
  g.add(finial);

  const dressing = buildUndeadLotDressing({ halfW: baseHalfW, halfD: baseHalfD, palette, seed: dna.seed, propCount: 3 });
  g.add(dressing);

  return g;
}
