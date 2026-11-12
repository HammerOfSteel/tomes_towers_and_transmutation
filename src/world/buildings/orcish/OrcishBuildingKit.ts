/**
 * OrcishBuildingKit.ts — composes all eight canonical orcish building
 * kinds (docs/superpowers/specs/2026-09-04-orcish-buildings-design.md)
 * from the shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`)
 * plus the race-specific `OrcishMaterials.ts`/`OrcishOpenings.ts`
 * presets and the new orcish-only `LashedTimber`/`HidePanel`/
 * `RibbedRoof`/`SalvageSpoils` modules.
 *
 * Every builder follows the doctrine (docs/superpowers/specs/
 * 2026-09-04-modular-building-kit-doctrine.md): a real depth ladder (no
 * coplanar surfaces), the five-piece opening minimum on every door/
 * window/hearth mouth, and zero blob/box placeholder openings, smooth
 * cone/dome roofs, or single-primitive props. Orcish trades the masonry
 * kit's cut-stone block courses for lashed tapered logs and the stone
 * arch kit for a squat Romanesque/tusk arch (`archRatio ~ 0.5`); see
 * `OrcishOpenings.ts` for the shared translation layer.
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
import { buildFloorCap } from '../StoneTowerFloorCap';
import { buildRockPlinthSkirt } from '../kit/RockPlinthSkirt';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { composeMainAndWing } from '../kit/MassComposer';
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import { buildPipeRun } from '../kit/PipeworkVent';
import { depthFor } from '../kit/DepthLadder';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import {
  buildTaperedLog,
  buildLogCourseWall,
  buildPostFrame,
  buildCrossBrace,
  buildLashingBand,
} from '../kit/LashedTimber';
import { buildRibbedHideWall, buildHidePanel } from '../kit/HidePanel';
import {
  buildConicalHideRoof,
  buildDomedHideRoof,
  buildLonghouseHideRoof,
  buildRibbedAwning,
} from '../kit/RibbedRoof';
import {
  buildTuskFinial,
  buildSkullTrophy,
  buildCapturedShield,
  buildBannerStrip,
  buildWeaponRack,
  buildCrossedBlades,
  buildPlankCrate,
  buildStaveKeg,
  buildFirewoodBundle,
  buildHideBundle,
  buildAnvil,
  buildCoalBin,
  buildSlagTrough,
  buildTotemPole,
} from '../kit/SalvageSpoils';
import { buildOrcishPalette, type OrcishPalette } from './OrcishMaterials';
import {
  buildOrcishWindow,
  buildOrcishDoor,
  buildOrcishForgeMouth,
  type OrcishOpeningPalette,
} from './OrcishOpenings';

// ─────────────────────────────────────────────────────────────────────────
// Generic helpers (mirrors DwarvenBuildingKit.ts's own private helpers --
// intentionally duplicated per-race rather than extracted, matching the
// established dwarven/slime convention of small race-local utilities).
// ─────────────────────────────────────────────────────────────────────────

/** Turns a short ASCII tag into a seed-mixing constant so every private
 * helper below gets its own independent, deterministic RNG stream from
 * the same building seed. */
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

/** Rotates + positions `obj` onto `face` at fractional position `t`. */
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

function toOpeningPalette(palette: OrcishPalette): OrcishOpeningPalette {
  return {
    timber: palette.timber,
    glazing: palette.darkGlazing,
    trim: palette.trim,
    forgeEmissive: palette.forgeEmissive,
  };
}

/** Builds a lashed-timber hall: log-course walls + a post frame at the
 * corners/bays + a flat floor cap -- the orcish sibling of
 * `DwarvenBuildingKit.ts`'s `buildRectHall()`, swapping cut-stone block
 * courses for tapered logs (design spec section 2: "Block-course
 * discipline, different material"). */
function buildLashedHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  palette: OrcishPalette,
  logOpts: Parameters<typeof buildLogCourseWall>[4] = {},
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  const walls = buildLogCourseWall(faces, height, tagSeed(seed, 'LOGW'), palette.timber, {
    logsPerFace: Math.max(2, Math.round((2 * Math.max(halfW, halfD)) / 0.9)),
    ...logOpts,
  });
  g.add(walls);

  const posts = buildPostFrame(faces, height, tagSeed(seed, 'POST'), palette.timber, { postSpacing: 1.0 });
  g.add(posts);

  const lashMid = buildLashingBand(faces, height * 0.5, palette.trim);
  const lashTop = buildLashingBand(faces, height * 0.96, palette.trim);
  g.add(lashMid, lashTop);

  const floorCap = buildFloorCap(0, palette.timber, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'orcish-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Builds a simple vertical-plank wall panel on one face: repeated thin
 * boxed planks side by side (never a single wall-sized box) -- the
 * terraced upper storey's "vertical salvage planks" wall option. */
function buildPlankWallFace(face: OctagonFace, height: number, seed: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plank-wall-face';
  const rand = mulberry32(seed >>> 0);
  const [ax, az] = face.a;
  const [bx, bz] = face.b;
  const faceLen = Math.hypot(bx - ax, bz - az);
  const plankWidth = 0.22;
  const count = Math.max(3, Math.round(faceLen / plankWidth));
  const outwardX = Math.sin(face.normalAngle);
  const outwardZ = Math.cos(face.normalAngle);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const jitter = 0.01 + rand() * 0.012;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(faceLen / count - 0.015, height, 0.03), material);
    plank.name = `plank-${i}`;
    plank.position.set(px + outwardX * jitter, height / 2, pz + outwardZ * jitter);
    plank.rotation.y = face.normalAngle;
    plank.castShadow = plank.receiveShadow = true;
    g.add(plank);
  }
  mergeGroupMeshesByMaterial(g);
  return g;
}

/** Builds a small hanging trophy/sign socket mounted proud of a wall face
 * (doctrine trophy depth `+0.30`, `DEPTH_LADDER.BUTTRESS`). `content` is
 * added as a child so callers can swap the exact prop. */
function mountOnWall(content: THREE.Object3D, face: OctagonFace, y: number, t = 0.5): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.add(content);
  content.position.z += depthFor('BUTTRESS');
  anchor.position.y = y;
  placeOnFace(anchor, face, t);
  return anchor;
}

/** Builds a lashed-timber hall from an already-positioned `MassSpec`
 * (points+faces translated off-origin, e.g. from `composeMainAndWing()`)
 * -- the orcish sibling of `DwarvenBuildingKit.ts`'s `buildMassFromSpec`,
 * used for villa's flush-attached wing mass. */
function buildLashedMassFromSpec(
  points: [number, number][],
  faces: OctagonFace[],
  height: number,
  seed: number,
  palette: OrcishPalette,
  logOpts: Parameters<typeof buildLogCourseWall>[4] = {},
): THREE.Group {
  const g = new THREE.Group();
  const walls = buildLogCourseWall(faces, height, tagSeed(seed, 'LOGW'), palette.timber, {
    logsPerFace: 3,
    courseHeight: 0.4,
    ...logOpts,
  });
  g.add(walls);
  const posts = buildPostFrame(faces, height, tagSeed(seed, 'POST'), palette.timber, { postSpacing: 1.0 });
  g.add(posts);
  const lashTop = buildLashingBand(faces, height * 0.94, palette.trim);
  g.add(lashTop);
  const floorCap = buildFloorCap(0, palette.timber, undefined, points);
  floorCap.position.y = height;
  g.add(floorCap);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// House
// ─────────────────────────────────────────────────────────────────────────

const HOUSE_EAVE_HEIGHT = 2.05;

/** Builds a small ribbed hide hut: lashed-log low walls with hide infill
 * bays, an off-centre plank/hide door, a smoke/window slot, one of three
 * ribbed-hide roof archetypes, front tusk finials, and a weighted front
 * spoil socket -- see design spec section 4 `house`. */
export function buildOrcishHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = HOUSE_EAVE_HEIGHT;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-house';

  const { group: hall, faces, points } = buildLashedHall(halfW, halfD, wallHeight, dna.seed, palette, { courseHeight: 0.38 });
  g.add(hall);

  // Hide infill panels in a subset of bays (design spec: "hide infill
  // panels in 20-35% of bays"). Pick 1-2 of the 4 faces at random.
  const hideRand = mulberry32(tagSeed(dna.seed, 'HIDE'));
  const hideFaceCount = hideRand() < 0.5 ? 1 : 2;
  const shuffledFaces = [0, 1, 2, 3].sort(() => hideRand() - 0.5).slice(0, hideFaceCount);
  for (const fi of shuffledFaces) {
    const wall = buildRibbedHideWall([faces[fi]!], wallHeight, tagSeed(dna.seed, `HW${fi}`), palette.hide, palette.trim);
    g.add(wall);
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: faces[3] });
  g.add(plinth);

  // Front door, off-centre by 0.25-0.45 WU.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const offset = 0.25 + doorRand() * 0.2;
  const doorT = 0.5 + (doorRand() < 0.5 ? -1 : 1) * (offset / fp.w);
  const door = buildOrcishDoor({ width: 0.85, height: 1.55, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, archRatio: 0.5 });
  door.name = 'orcish-door';
  placeOnFace(door, faces[3]!, doorT);
  g.add(door);

  // Side smoke/window slot.
  const winFace = faces[doorRand() < 0.5 ? 0 : 2]!;
  const winFaceIndex = winFace === faces[0] ? 0 : 2;
  const window = buildOrcishWindow({ width: 0.45, height: 0.55, wallZ: wallZFor(winFaceIndex, halfW, halfD), palette: openingPalette, shape: 'round' });
  window.name = 'orcish-window';
  window.position.y = wallHeight * 0.6;
  placeOnFace(window, winFace, 0.5);
  g.add(window);

  // 30% chance of a second rear slot.
  if (doorRand() < 0.3) {
    const rear = buildOrcishWindow({ width: 0.4, height: 0.5, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette, shape: 'round' });
    rear.name = 'orcish-rear-window';
    rear.position.y = wallHeight * 0.6;
    placeOnFace(rear, faces[1]!, 0.5);
    g.add(rear);
  }

  // Roof: domed 55% / conical 30% / lean-to patch 15%.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofKind = pickWeighted<'domed' | 'conical' | 'lean-to'>(roofRand, [
    ['domed', 0.55],
    ['conical', 0.30],
    ['lean-to', 0.15],
  ]);
  const baseRadius = Math.max(halfW, halfD) * 1.08;
  let roof: THREE.Group;
  let roofPeak: number;
  if (roofKind === 'domed') {
    roofPeak = 1.15 + roofRand() * 0.15;
    roof = buildDomedHideRoof({ baseRadius, height: roofPeak, ribCount: 11, seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber });
  } else if (roofKind === 'conical') {
    roofPeak = 1.1 + roofRand() * 0.15;
    roof = buildConicalHideRoof({ baseRadius, apexHeight: roofPeak, ribCount: 8, seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber });
  } else {
    roofPeak = 0.9 + roofRand() * 0.15;
    roof = buildRibbedAwning({ width: fp.w * 1.1, depth: fp.d * 1.1, frontHeight: roofPeak * 0.55, backHeight: roofPeak, ribCount: 5, seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber });
  }
  roof.position.y = wallHeight;
  g.add(roof);

  // Two tusk tips at the roof front.
  for (const side of [-1, 1]) {
    const tusk = buildTuskFinial({ material: palette.bone, length: 0.35 });
    tusk.rotation.z = side * 0.35;
    tusk.position.set(side * halfW * 0.5, wallHeight + roofPeak * 0.85, halfD * 0.9);
    g.add(tusk);
  }

  // Front spoil socket.
  const spoilRand = mulberry32(tagSeed(dna.seed, 'SPOIL'));
  const spoilKind = pickWeighted<'none' | 'shield' | 'skulls' | 'banner'>(spoilRand, [
    ['none', 0.30],
    ['shield', 0.30],
    ['skulls', 0.25],
    ['banner', 0.15],
  ]);
  if (spoilKind === 'shield') {
    const shield = buildCapturedShield({ radius: 0.3, faceMaterial: palette.trim, rimMaterial: palette.iron });
    g.add(mountOnWall(shield, faces[3]!, wallHeight * 0.75));
  } else if (spoilKind === 'skulls') {
    for (const side of [-1, 1]) {
      const skull = buildSkullTrophy({ boneMaterial: palette.bone, darkMaterial: palette.stone, scale: 0.9 });
      g.add(mountOnWall(skull, faces[3]!, wallHeight * 0.75, 0.5 + side * 0.18));
    }
  } else if (spoilKind === 'banner') {
    const banner = buildBannerStrip({ clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'BANN') });
    g.add(mountOnWall(banner, faces[3]!, 0, 0.2));
  }

  // Firewood stack near a rear corner.
  const firewood = buildFirewoodBundle({ material: palette.timber, seed: tagSeed(dna.seed, 'WOOD') });
  firewood.position.set(-halfW - 0.3, 0, -halfD - 0.25);
  g.add(firewood);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Terraced
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_STOREY_HEIGHT = 2.55;

/** Builds a narrow, cramped lashed-timber row hut: a lower log-course
 * storey, an upper storey whose wall module is one of hide-panels/
 * vertical-planks/shield-patch, party-wall-aware side suppression, a
 * shared ragged gabled hide roof, and a street-facing prop socket -- see
 * design spec section 4 `terraced`. */
export function buildOrcishTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const floorH = TERRACED_STOREY_HEIGHT;
  const lowerH = floorH;
  const upperH = floorH;
  const wallHeight = lowerH + upperH;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-terraced';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Lower storey: full log-course wall + posts (party walls still get a
  // wall body -- only their WINDOWS are suppressed below).
  const lowerWalls = buildLogCourseWall(faces, lowerH, tagSeed(dna.seed, 'LOWW'), palette.timber, {
    logsPerFace: Math.max(2, Math.round((2 * Math.max(halfW, halfD)) / 0.8)),
    courseHeight: 0.42,
  });
  g.add(lowerWalls);
  const lowerPosts = buildPostFrame(faces, lowerH, tagSeed(dna.seed, 'LOWP'), palette.timber, { postSpacing: 0.85 });
  g.add(lowerPosts);

  // Upper storey wall module: hide panels 45% / vertical planks 35% /
  // captured-shield patch 20%.
  const upperRand = mulberry32(tagSeed(dna.seed, 'UPPR'));
  const upperKind = pickWeighted<'hide' | 'planks' | 'shield-patch'>(upperRand, [
    ['hide', 0.45],
    ['planks', 0.35],
    ['shield-patch', 0.20],
  ]);
  const upperGroup = new THREE.Group();
  upperGroup.name = 'terraced-upper-wall';
  upperGroup.position.y = lowerH;
  if (upperKind === 'hide') {
    upperGroup.add(buildRibbedHideWall(faces, upperH, tagSeed(dna.seed, 'UPPH'), palette.hide, palette.trim));
  } else if (upperKind === 'planks') {
    for (const face of faces) upperGroup.add(buildPlankWallFace(face, upperH, tagSeed(dna.seed, `PLK${face.normalAngle}`), palette.patch));
  } else {
    // shield-patch: keep a log wall behind, then bolt captured shields
    // across the front as a mismatched salvage patch.
    upperGroup.add(buildLogCourseWall(faces, upperH, tagSeed(dna.seed, 'UPPS'), palette.patch, { courseHeight: 0.4 }));
    for (let i = 0; i < 2; i++) {
      const shield = buildCapturedShield({ radius: 0.22, faceMaterial: palette.trim, rimMaterial: palette.iron });
      const anchor = mountOnWall(shield, faces[3]!, upperH * 0.5, 0.25 + i * 0.5);
      upperGroup.add(anchor);
    }
  }
  g.add(upperGroup);

  const upperLash = buildLashingBand(faces, lowerH, palette.trim);
  g.add(upperLash);

  // A short jettied header + corbel brackets under the upper front wall
  // on 15% of seeds, standing in for a projecting jetty overhang.
  const jettyRand = mulberry32(tagSeed(dna.seed, 'JETT'));
  if (jettyRand() < 0.15) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(fp.w * 0.96, 0.08, 0.08), palette.timber);
    header.name = 'jetty-header';
    header.position.set(0, lowerH, halfD + 0.06);
    g.add(header);
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.22), palette.trim);
      bracket.name = 'jetty-bracket';
      bracket.position.set(side * halfW * 0.7, lowerH - 0.05, halfD + 0.1);
      g.add(bracket);
    }
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: faces[3] });
  g.add(plinth);

  // Narrow front door, off-centre.
  const doorT = 0.5 + 0.18;
  const door = buildOrcishDoor({ width: 0.75, height: 1.45, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, archRatio: 0.5 });
  door.name = 'orcish-door';
  placeOnFace(door, faces[3]!, doorT);
  g.add(door);

  // Upper front barred slot.
  const upperWin = buildOrcishWindow({ width: 0.5, height: 0.55, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, shape: 'round' });
  upperWin.name = 'orcish-upper-window';
  upperWin.position.y = lowerH + upperH * 0.5;
  placeOnFace(upperWin, faces[3]!, 0.5 - 0.2);
  g.add(upperWin);

  // Rear smoke slot.
  const rearWin = buildOrcishWindow({ width: 0.4, height: 0.5, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette, shape: 'round' });
  rearWin.name = 'orcish-rear-window';
  rearWin.position.y = lowerH * 0.6;
  placeOnFace(rearWin, faces[1]!, 0.5);
  g.add(rearWin);

  // Side windows are disabled entirely for a terraced row hut -- narrow
  // party-wall footprints keep detail on front/rear only (design spec:
  // "side party walls use fewer sockets and no side windows").
  void dna.terrace;

  // Shared ragged gabled hide roof.
  const ridgeHeight = 0.95 + mulberry32(tagSeed(dna.seed, 'ROOF'))() * 0.25;
  const roof = buildLonghouseHideRoof({
    width: fp.w, length: fp.d, wallTopY: wallHeight, ridgeHeight,
    rafterCount: 5, seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber,
  });
  g.add(roof);

  // Bone spike on one corner only (asymmetry).
  const spike = buildTuskFinial({ material: palette.bone, length: 0.28 });
  spike.position.set(halfW * 0.85, wallHeight + ridgeHeight * 0.7, halfD * 0.6);
  spike.rotation.z = -0.3;
  g.add(spike);

  // Exterior brace + hanging hide strip.
  const brace = buildCrossBrace(
    new THREE.Vector3(-halfW - 0.05, 0, halfD * 0.3),
    new THREE.Vector3(-halfW - 0.4, lowerH * 0.7, halfD * 0.3),
    0.05, palette.timber,
  );
  g.add(brace);
  const laundry = buildHideBundle({ material: palette.hide, tieMaterial: palette.trim });
  laundry.position.set(-halfW - 0.35, lowerH * 0.65, halfD * 0.3);
  laundry.scale.setScalar(0.6);
  g.add(laundry);

  // Street prop socket: none 40% / firewood bundle 25% / broken crate 20% / bone charm 15%.
  const propRand = mulberry32(tagSeed(dna.seed, 'PROP'));
  const propKind = pickWeighted<'none' | 'firewood' | 'crate' | 'charm'>(propRand, [
    ['none', 0.40], ['firewood', 0.25], ['crate', 0.20], ['charm', 0.15],
  ]);
  if (propKind === 'firewood') {
    const wood = buildFirewoodBundle({ material: palette.timber, seed: tagSeed(dna.seed, 'STWD') });
    wood.position.set(halfW + 0.25, 0, halfD * 0.4);
    g.add(wood);
  } else if (propKind === 'crate') {
    const crate = buildPlankCrate({ material: palette.patch, strapMaterial: palette.iron });
    crate.name = 'broken-crate';
    crate.position.set(halfW + 0.28, 0, halfD * 0.4);
    crate.rotation.y = 0.4;
    g.add(crate);
  } else if (propKind === 'charm') {
    const charm = buildTuskFinial({ material: palette.bone, length: 0.18, radius: 0.03 });
    charm.name = 'bone-charm';
    charm.position.set(halfW + 0.1, lowerH * 0.6, halfD + 0.05);
    g.add(charm);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Villa
// ─────────────────────────────────────────────────────────────────────────

const VILLA_TIER_HEIGHT = 2.8;

/** Builds a warlord hall / great hut: a broad lashed-timber longhouse
 * mass with 35%/25%/40% odds of a porch-front, side-lean-to, or straight
 * plan, heavy corner posts, a monumental double war door under a bone
 * voussoir arch, a wide longhouse roof (35% adds a command cap, 20%
 * adds red awning wings), and an oversized roof-crest trophy -- see
 * design spec section 4 `villa`. */
export function buildOrcishVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const floors = Math.max(1, Math.min(2, dna.floors));
  const wallHeight = VILLA_TIER_HEIGHT * floors;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-villa';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Hall plan: straight longhouse 40% / porch-front hall 35% / side
  // lean-to hall 25%.
  const planRand = mulberry32(tagSeed(dna.seed, 'PLAN'));
  const hallPlan = pickWeighted<'straight' | 'porch' | 'lean-to'>(planRand, [
    ['straight', 0.40],
    ['porch', 0.35],
    ['lean-to', 0.25],
  ]);

  const mainWalls = buildLogCourseWall(faces, wallHeight, tagSeed(dna.seed, 'LOGW'), palette.timber, {
    logsPerFace: Math.max(3, Math.round((2 * Math.max(halfW, halfD)) / 0.85)),
    courseHeight: 0.42,
  });
  mainWalls.name = 'orcish-villa-main-walls';
  g.add(mainWalls);

  // Four heavy corner posts, proud at PILASTER depth.
  const posts = buildPostFrame(faces, wallHeight, tagSeed(dna.seed, 'POST'), palette.timber, { postSpacing: Math.max(halfW, halfD) * 2 });
  g.add(posts);
  const lashMid = buildLashingBand(faces, wallHeight * 0.5, palette.trim);
  const lashTop = buildLashingBand(faces, wallHeight * 0.94, palette.trim);
  g.add(lashMid, lashTop);

  if (hallPlan === 'lean-to') {
    const { wing } = composeMainAndWing({
      mainWidth: fp.w, mainDepth: fp.d, mainHeight: wallHeight,
      wing: { width: fp.w * 0.5, depth: fp.d * 0.55, height: wallHeight * 0.6, side: 'left', alongFraction: 0.25 },
    });
    const wingHall = buildLashedMassFromSpec(wing.points, wing.faces, wing.height, tagSeed(dna.seed, 'WING'), palette, { logsPerFace: 2 });
    wingHall.name = 'orcish-villa-wing';
    g.add(wingHall);
    const wingRoof = buildRibbedAwning({
      width: fp.w * 0.5, depth: fp.d * 0.55, frontHeight: wing.height * 0.75, backHeight: wing.height,
      seed: tagSeed(dna.seed, 'WRF'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    wingRoof.position.set(wing.center[0], wing.height, wing.center[1]);
    g.add(wingRoof);
    const wingPlinth = buildRockPlinthSkirt({ points: wing.points, material: palette.stone, seed: tagSeed(dna.seed, 'WPLN') });
    g.add(wingPlinth);
  }

  let porchDepth = 0;
  if (hallPlan === 'porch') {
    porchDepth = 0.9;
    for (const side of [-1, 1]) {
      const post = buildTaperedLog({ length: wallHeight * 0.85, radiusBase: 0.12, radiusTop: 0.1, material: palette.timber });
      post.name = 'porch-post';
      post.position.set(side * fp.w * 0.3, wallHeight * 0.425, halfD + porchDepth);
      g.add(post);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(fp.w * 0.62, 0.14, 0.14), palette.timber);
    header.name = 'porch-header';
    header.position.set(0, wallHeight * 0.86, halfD + porchDepth);
    g.add(header);
    const porchRoof = buildRibbedAwning({
      width: fp.w * 0.66, depth: porchDepth + 0.3, frontHeight: wallHeight * 0.7, backHeight: wallHeight * 0.88,
      seed: tagSeed(dna.seed, 'PRCH'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    porchRoof.position.set(0, 0, halfD + porchDepth * 0.5);
    g.add(porchRoof);
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: faces[3] });
  g.add(plinth);

  // Monumental double war door: 1.35 W x 2.05 H.
  const doorWidth = 1.35;
  const doorHeight = 2.05;
  const door = buildOrcishDoor({
    width: doorWidth, height: doorHeight, wallZ: wallZFor(3, halfW, halfD) + porchDepth,
    palette: openingPalette, archRatio: 0.5,
  });
  door.name = 'orcish-door';
  placeOnFace(door, faces[3]!, 0.5);
  g.add(door);

  // Rough bone voussoir arch flourish standing proud of the door surround.
  const arch = buildVoussoirArch({
    width: doorWidth * 1.3, springHeight: doorHeight * 0.65, archRatio: 0.5,
    material: palette.bone, seed: tagSeed(dna.seed, 'ARCH'),
  });
  arch.name = 'villa-door-arch';
  arch.position.z = wallZFor(3, halfW, halfD) + porchDepth;
  placeOnFace(arch, faces[3]!, 0.5);
  g.add(arch);

  // 2 front high smoke slots.
  for (const t of [0.2, 0.8]) {
    const slot = buildOrcishWindow({ width: 0.45, height: 0.5, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, shape: 'round' });
    slot.name = 'orcish-window';
    slot.position.y = wallHeight * 0.82;
    placeOnFace(slot, faces[3]!, t);
    g.add(slot);
  }

  // 2-4 side slots (suppressed on the lean-to side when that plan is chosen).
  const sideFaces = hallPlan === 'lean-to' ? [0] : [0, 2];
  for (const fi of sideFaces) {
    for (const t of [0.3, 0.7]) {
      const win = buildOrcishWindow({ width: 0.45, height: 0.55, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette, shape: 'round' });
      win.name = 'orcish-window';
      win.position.y = wallHeight * 0.45;
      placeOnFace(win, faces[fi]!, t);
      g.add(win);
    }
  }

  // Wide longhouse gable roof, 9-11 rafters.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const ridgeHeight = 1.4 + roofRand() * 0.4;
  const roof = buildLonghouseHideRoof({
    width: fp.w, length: fp.d, wallTopY: wallHeight, ridgeHeight,
    rafterCount: 9 + Math.round(roofRand() * 2), seed: tagSeed(dna.seed, 'ROOF'),
    hideMaterial: palette.hide, ribMaterial: palette.timber,
  });
  g.add(roof);

  // 35% adds a smaller command cap/towerlet over the entrance.
  if (roofRand() < 0.35) {
    const cap = buildConicalHideRoof({
      baseRadius: Math.min(halfW, halfD) * 0.45,
      apexHeight: 1.0, ribCount: 6, seed: tagSeed(dna.seed, 'CCAP'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    cap.name = 'villa-command-cap';
    cap.position.set(0, wallHeight + ridgeHeight * 0.5, halfD * 0.3);
    g.add(cap);
  }

  // 20% adds red awning wings off the eaves.
  if (roofRand() < 0.20) {
    for (const side of [-1, 1]) {
      const wing = buildRibbedAwning({
        width: fp.w * 0.35, depth: 0.9, frontHeight: wallHeight * 0.6, backHeight: wallHeight,
        seed: tagSeed(dna.seed, `AWNG${side}`), hideMaterial: palette.redCloth, ribMaterial: palette.timber,
      });
      wing.position.set(side * halfW * 0.55, 0, -halfD - 0.1);
      g.add(wing);
    }
  }

  // Trophy bay: tusk skull 45% / captured shields 25% / crossed blades 20% / red war banner 10%.
  const trophyRand = mulberry32(tagSeed(dna.seed, 'TRPH'));
  const trophyKind = pickWeighted<'skull' | 'shields' | 'blades' | 'banner'>(trophyRand, [
    ['skull', 0.45], ['shields', 0.25], ['blades', 0.20], ['banner', 0.10],
  ]);
  let trophy: THREE.Object3D;
  if (trophyKind === 'skull') {
    trophy = buildSkullTrophy({ boneMaterial: palette.bone, darkMaterial: palette.stone });
  } else if (trophyKind === 'shields') {
    const rack = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const shield = buildCapturedShield({ radius: 0.28, faceMaterial: palette.trim, rimMaterial: palette.iron });
      shield.position.x = (i - 1) * 0.4;
      rack.add(shield);
    }
    trophy = rack;
  } else if (trophyKind === 'blades') {
    trophy = buildCrossedBlades({ length: 0.9, bladeMaterial: palette.iron, bindingMaterial: palette.trim });
  } else {
    trophy = buildBannerStrip({ width: 0.6, length: 1.4, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'VTRB') });
  }
  trophy.name = 'villa-oversized-trophy';
  trophy.scale.setScalar(1.4);
  const anchor = mountOnWall(trophy, faces[3]!, doorHeight + 0.55, 0.5);
  g.add(anchor);

  // Roof crest: tusk ridge 40% / banner pole 25% / smoke crown 20% / broken spike row 15%.
  const crestRand = mulberry32(tagSeed(dna.seed, 'CRST'));
  const crestKind = pickWeighted<'tusk' | 'banner' | 'smoke' | 'spikes'>(crestRand, [
    ['tusk', 0.40], ['banner', 0.25], ['smoke', 0.20], ['spikes', 0.15],
  ]);
  const crestY = wallHeight + ridgeHeight + 0.05;
  if (crestKind === 'tusk') {
    for (const side of [-1, 1]) {
      const spike = buildTuskFinial({ material: palette.bone, length: 0.5 });
      spike.position.set(side * 0.15, crestY, 0);
      spike.rotation.z = side * -0.3;
      g.add(spike);
    }
  } else if (crestKind === 'banner') {
    const banner = buildBannerStrip({ width: 0.4, length: 1.1, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'VCRB') });
    banner.position.set(0, crestY, 0);
    g.add(banner);
  } else if (crestKind === 'smoke') {
    const vent = buildPipeRun({ segments: [{ dir: 'up', length: 0.6 }], radius: 0.09, material: palette.iron });
    vent.position.set(0, crestY, 0);
    g.add(vent);
  } else {
    for (let i = 0; i < 3; i++) {
      const spike = buildTuskFinial({ material: palette.bone, length: 0.22 + (i % 2) * 0.08 });
      spike.position.set((i - 1) * 0.35, crestY, 0);
      g.add(spike);
    }
  }

  // Wall patch grammar: mostly logs 45% / logs+hide 35% / logs+shield salvage 20%.
  const patchRand = mulberry32(tagSeed(dna.seed, 'PTCH'));
  const patchKind = pickWeighted<'logs' | 'hide' | 'shields'>(patchRand, [
    ['logs', 0.45], ['hide', 0.35], ['shields', 0.20],
  ]);
  if (patchKind === 'hide') {
    const patch = buildRibbedHideWall([faces[0]!], wallHeight * 0.4, tagSeed(dna.seed, 'HPAT'), palette.hide, palette.trim);
    patch.position.y = wallHeight * 0.05;
    g.add(patch);
  } else if (patchKind === 'shields') {
    for (let i = 0; i < 3; i++) {
      const shield = buildCapturedShield({ radius: 0.22, faceMaterial: palette.patch, rimMaterial: palette.iron });
      const shieldAnchor = mountOnWall(shield, faces[2]!, wallHeight * 0.4, 0.2 + i * 0.3);
      g.add(shieldAnchor);
    }
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Inn
// ─────────────────────────────────────────────────────────────────────────

const INN_LOWER_HEIGHT = 3.0;
const INN_LOFT_HEIGHT = 2.2;

/** Builds a mead hall / longhouse: repeated post frames every 1.0 WU
 * with log infill below and hide windbreak infill above, a double front
 * door, 4 shuttered side windows, 2 roof smoke vents, one open drinking
 * porch bay, a steep longhouse hide roof, and a weighted hanging sign --
 * see design spec section 4 `inn`. */
export function buildOrcishInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', 'large');
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = INN_LOWER_HEIGHT + INN_LOFT_HEIGHT;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-inn';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Hall profile: straight high ridge 45% / sagging patched ridge 35% / offset porch wing 20%.
  const profileRand = mulberry32(tagSeed(dna.seed, 'PROF'));
  const hallProfile = pickWeighted<'straight' | 'sagging' | 'offset-wing'>(profileRand, [
    ['straight', 0.45],
    ['sagging', 0.35],
    ['offset-wing', 0.20],
  ]);

  // Lower log infill band + repeated post frame every 1.0 WU.
  const lowerWalls = buildLogCourseWall(faces, INN_LOWER_HEIGHT, tagSeed(dna.seed, 'LOWW'), palette.timber, {
    logsPerFace: Math.max(4, Math.round((2 * Math.max(halfW, halfD)) / 0.85)),
    courseHeight: 0.42,
  });
  g.add(lowerWalls);
  const posts = buildPostFrame(faces, wallHeight, tagSeed(dna.seed, 'POST'), palette.timber, { postSpacing: 1.0 });
  g.add(posts);

  // Upper hide windbreak infill.
  const upperHide = buildRibbedHideWall(faces, INN_LOFT_HEIGHT, tagSeed(dna.seed, 'UPPH'), palette.hide, palette.trim);
  upperHide.position.y = INN_LOWER_HEIGHT;
  g.add(upperHide);

  const lashMid = buildLashingBand(faces, INN_LOWER_HEIGHT * 0.5, palette.trim);
  const lashJoin = buildLashingBand(faces, INN_LOWER_HEIGHT, palette.trim);
  const lashTop = buildLashingBand(faces, wallHeight * 0.96, palette.trim);
  g.add(lashMid, lashJoin, lashTop);

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: faces[3] });
  g.add(plinth);

  // Front double door: 1.25 W x 1.85 H.
  const door = buildOrcishDoor({ width: 1.25, height: 1.85, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, archRatio: 0.5 });
  door.name = 'orcish-door';
  placeOnFace(door, faces[3]!, 0.5);
  g.add(door);

  // 4 shuttered/barred windows on the long sides (2 per side).
  for (const fi of [0, 2]) {
    for (const t of [0.28, 0.72]) {
      const win = buildOrcishWindow({ width: 0.55, height: 0.65, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette, shape: 'round' });
      win.name = 'orcish-window';
      win.position.y = INN_LOWER_HEIGHT * 0.45;
      placeOnFace(win, faces[fi]!, t);
      g.add(win);
    }
  }

  // Smoke/roof detail: two vents 40% / crown vent 25% / banner ridge 20% / broken rafter 15%.
  const smokeRand = mulberry32(tagSeed(dna.seed, 'SMOK'));
  const smokeKind = pickWeighted<'two-vents' | 'crown' | 'banner' | 'broken'>(smokeRand, [
    ['two-vents', 0.40], ['crown', 0.25], ['banner', 0.20], ['broken', 0.15],
  ]);

  // Porch side: left 35% / right 35% / front 20% / none 10%.
  const porchRand = mulberry32(tagSeed(dna.seed, 'PRCH'));
  const porchSide = pickWeighted<'left' | 'right' | 'front' | 'none'>(porchRand, [
    ['left', 0.35], ['right', 0.35], ['front', 0.20], ['none', 0.10],
  ]);
  if (porchSide !== 'none') {
    const porchFaceIndex = porchSide === 'left' ? 2 : porchSide === 'right' ? 0 : 3;
    const face = faces[porchFaceIndex]!;
    const wide = buildOrcishWindow({ width: 2.0, height: 1.4, wallZ: wallZFor(porchFaceIndex, halfW, halfD), palette: openingPalette, shape: 'round' });
    wide.name = 'inn-porch-opening';
    wide.position.y = 0.75;
    placeOnFace(wide, face, 0.5);
    g.add(wide);
    // Counter/bench rail across the opening.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.12), palette.timber);
    rail.name = 'inn-porch-bench-rail';
    rail.position.set(0, 0.55, wallZFor(porchFaceIndex, halfW, halfD) + (porchFaceIndex === 3 ? 0.1 : -0.1));
    rail.rotation.y = face.normalAngle;
    placeOnFace(rail, face, 0.5);
    g.add(rail);
    // Two posts framing the porch bay.
    for (const side of [-1, 1]) {
      const post = buildTaperedLog({ length: 1.5, radiusBase: 0.1, radiusTop: 0.08, material: palette.timber });
      post.name = 'inn-porch-post';
      const [px, pz] = facePointAt(face, 0.5 + side * 0.32);
      post.position.set(px + Math.sin(face.normalAngle) * 0.15, 0.75, pz + Math.cos(face.normalAngle) * 0.15);
      g.add(post);
    }
  }

  // Steep longhouse roof.
  const ridgeHeight = hallProfile === 'sagging' ? 2.6 : 2.95;
  const roof = buildLonghouseHideRoof({
    width: fp.w, length: fp.d, wallTopY: wallHeight, ridgeHeight,
    rafterCount: 10, overhang: 0.35, sag: hallProfile === 'sagging' ? 0.09 : 0.04,
    seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber,
  });
  g.add(roof);

  if (hallProfile === 'offset-wing') {
    const { wing } = composeMainAndWing({
      mainWidth: fp.w, mainDepth: fp.d, mainHeight: INN_LOWER_HEIGHT,
      wing: { width: fp.w * 0.4, depth: fp.d * 0.5, height: INN_LOWER_HEIGHT * 0.75, side: 'right', alongFraction: 0.75 },
    });
    const wingHall = buildLashedMassFromSpec(wing.points, wing.faces, wing.height, tagSeed(dna.seed, 'WING'), palette, { logsPerFace: 2 });
    wingHall.name = 'inn-offset-wing';
    g.add(wingHall);
    const wingRoof = buildRibbedAwning({
      width: fp.w * 0.4, depth: fp.d * 0.5, frontHeight: wing.height * 0.8, backHeight: wing.height,
      seed: tagSeed(dna.seed, 'WGRF'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    wingRoof.position.set(wing.center[0], wing.height, wing.center[1]);
    g.add(wingRoof);
  }

  if (smokeKind === 'two-vents') {
    for (const t of [0.32, 0.68]) {
      const [vx, vz] = facePointAt(faces[1]!, t);
      const vent = buildConicalHideRoof({ baseRadius: 0.3, apexHeight: 0.4, ribCount: 6, seed: tagSeed(dna.seed, `VENT${t}`), hideMaterial: palette.hide, ribMaterial: palette.timber });
      vent.name = 'inn-smoke-vent';
      vent.position.set(vx, wallHeight + ridgeHeight * 0.4, vz);
      g.add(vent);
    }
  } else if (smokeKind === 'crown') {
    const crown = buildConicalHideRoof({ baseRadius: 0.4, apexHeight: 0.5, ribCount: 8, seed: tagSeed(dna.seed, 'CRWN'), hideMaterial: palette.hide, ribMaterial: palette.timber });
    crown.name = 'inn-crown-vent';
    crown.position.set(0, wallHeight + ridgeHeight * 0.85, 0);
    g.add(crown);
  } else if (smokeKind === 'banner') {
    const banner = buildBannerStrip({ width: 0.4, length: ridgeHeight * 0.7, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'RBAN') });
    banner.name = 'inn-banner-ridge';
    banner.position.set(0, wallHeight + ridgeHeight, 0);
    g.add(banner);
  } else {
    const brokenRafter = buildTaperedLog({ length: 0.6, radiusBase: 0.05, radiusTop: 0.03, material: palette.timber });
    brokenRafter.name = 'inn-broken-rafter';
    brokenRafter.rotation.z = 0.5;
    brokenRafter.position.set(halfW * 0.5, wallHeight + ridgeHeight * 0.7, 0);
    g.add(brokenRafter);
  }

  // Sign module: shield 40% / tusk 25% / red cloth 20% / skull 15%.
  const signRand = mulberry32(tagSeed(dna.seed, 'SIGN'));
  const signKind = pickWeighted<'shield' | 'tusk' | 'cloth' | 'skull'>(signRand, [
    ['shield', 0.40], ['tusk', 0.25], ['cloth', 0.20], ['skull', 0.15],
  ]);
  let sign: THREE.Object3D;
  if (signKind === 'shield') sign = buildCapturedShield({ radius: 0.32, faceMaterial: palette.trim, rimMaterial: palette.iron });
  else if (signKind === 'tusk') sign = buildTuskFinial({ material: palette.bone, length: 0.4 });
  else if (signKind === 'cloth') sign = buildBannerStrip({ width: 0.5, length: 0.7, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'SGNB') });
  else sign = buildSkullTrophy({ boneMaterial: palette.bone, scale: 0.7 });
  sign.name = 'inn-hanging-sign';
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), palette.iron);
  bracket.name = 'inn-sign-bracket';
  bracket.position.set(halfW * 0.5, INN_LOWER_HEIGHT * 0.85, halfD + 0.25);
  g.add(bracket);
  sign.position.set(halfW * 0.5 + 0.22, INN_LOWER_HEIGHT * 0.7, halfD + 0.25);
  g.add(sign);

  // Props: stave kegs and hanging skins near the porch/door.
  const keg1 = buildStaveKeg({ material: palette.timber, hoopMaterial: palette.iron });
  keg1.position.set(-halfW - 0.3, 0, -halfD * 0.3);
  g.add(keg1);
  const keg2 = buildStaveKeg({ material: palette.timber, hoopMaterial: palette.iron, radius: 0.22, height: 0.4 });
  keg2.position.set(-halfW - 0.55, 0, -halfD * 0.1);
  g.add(keg2);
  const hangingSkin = buildHideBundle({ material: palette.hide, tieMaterial: palette.trim });
  hangingSkin.name = 'inn-hanging-skin';
  hangingSkin.rotation.z = Math.PI / 2;
  hangingSkin.position.set(halfW + 0.15, INN_LOWER_HEIGHT * 0.75, halfD * 0.5);
  g.add(hangingSkin);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Shop
// ─────────────────────────────────────────────────────────────────────────

const SHOP_BACK_HEIGHT = 1.45;
const SHOP_AWNING_FRONT = 2.0;

/** Builds a loot stall / trade lean-to: a short back (+ optional side)
 * lashed-timber wall with hide infill, a mostly-open front counter
 * aperture framed by two heavy posts, a red stretched-hide awning roof,
 * and a weighted goods socket -- see design spec section 4 `shop`. */
export function buildOrcishShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', 'small');
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-shop';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Stall wall layout: back wall only 35% / L-shaped 40% / U-shaped low wall 25%.
  const layoutRand = mulberry32(tagSeed(dna.seed, 'LAYT'));
  const layout = pickWeighted<'back' | 'l-shape' | 'u-shape'>(layoutRand, [
    ['back', 0.35], ['l-shape', 0.40], ['u-shape', 0.25],
  ]);
  const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
  const lShapeSide = sideRand() < 0.5 ? 0 : 2;
  const wallFaceIndices = layout === 'back' ? [1] : layout === 'l-shape' ? [1, lShapeSide] : [1, 0, 2];
  const wallHeight = layout === 'u-shape' ? SHOP_BACK_HEIGHT * 0.75 : SHOP_BACK_HEIGHT;
  const wallFaces = wallFaceIndices.map((i) => faces[i]!);

  const walls = buildLogCourseWall(wallFaces, wallHeight, tagSeed(dna.seed, 'LOGW'), palette.timber, {
    logsPerFace: 3,
    courseHeight: 0.36,
  });
  g.add(walls);
  const hideInfill = buildRibbedHideWall(wallFaces, wallHeight * 0.4, tagSeed(dna.seed, 'HIDE'), palette.hide, palette.trim);
  hideInfill.position.y = wallHeight * 0.55;
  g.add(hideInfill);
  const posts = buildPostFrame(wallFaces, wallHeight, tagSeed(dna.seed, 'WPST'), palette.timber, { postSpacing: 1.3 });
  g.add(posts);

  // Front: two heavy posts framing the open counter, no front wall.
  for (const side of [-1, 1]) {
    const post = buildTaperedLog({ length: SHOP_AWNING_FRONT, radiusBase: 0.12, radiusTop: 0.09, material: palette.timber });
    post.name = 'shop-front-post';
    post.position.set(side * halfW * 0.92, SHOP_AWNING_FRONT / 2, halfD - 0.05);
    g.add(post);
  }

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN') });
  g.add(plinth);

  // Counter aperture: 1.8 W x 0.75 H on the front face.
  const counter = buildOrcishWindow({ width: 1.8, height: 0.75, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, shape: 'round' });
  counter.name = 'shop-counter-aperture';
  counter.position.y = 0.6;
  placeOnFace(counter, faces[3]!, 0.5);
  g.add(counter);

  // Counter module: plank slab 45% / shield-plank slab 25% / hide-draped slab 20% / bone-edged slab 10%.
  const counterRand = mulberry32(tagSeed(dna.seed, 'CNTR'));
  const counterKind = pickWeighted<'plank' | 'shield' | 'hide' | 'bone'>(counterRand, [
    ['plank', 0.45], ['shield', 0.25], ['hide', 0.20], ['bone', 0.10],
  ]);
  const counterMat = counterKind === 'shield' ? palette.patch : counterKind === 'bone' ? palette.bone : palette.timber;
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.5), counterMat);
  counterTop.name = 'shop-counter-slab';
  counterTop.position.set(0, 0.65, halfD - 0.25);
  g.add(counterTop);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), palette.timber);
    leg.name = 'shop-counter-leg';
    leg.position.set(side * 0.75, 0.3, halfD - 0.25);
    g.add(leg);
  }
  if (counterKind === 'hide') {
    const drape = buildHidePanel({ width: 1.6, height: 0.35, ribCount: 2, sag: 0.05, skinMaterial: palette.hide, ribMaterial: palette.trim });
    drape.name = 'shop-counter-drape';
    drape.position.set(0, 0.45, halfD - 0.02);
    g.add(drape);
  }

  // Optional rear flap door: 0.65 W x 1.2 H, only when the back wall exists (always does).
  const rearDoorRand = mulberry32(tagSeed(dna.seed, 'RDOR'));
  if (rearDoorRand() < 0.5) {
    const rearDoor = buildOrcishDoor({
      width: 0.65, height: 1.2, wallZ: wallZFor(1, halfW, halfD), palette: { ...openingPalette, glazing: palette.hide }, archRatio: 0.5,
    });
    rearDoor.name = 'shop-rear-flap';
    placeOnFace(rearDoor, faces[1]!, 0.5);
    g.add(rearDoor);
  }

  // Awning color: red cloth 60% / red-tan stripe 25% / patched dark hide 15%.
  const awningRand = mulberry32(tagSeed(dna.seed, 'AWNC'));
  const awningKind = pickWeighted<'red' | 'stripe' | 'patched'>(awningRand, [
    ['red', 0.60], ['stripe', 0.25], ['patched', 0.15],
  ]);
  if (awningKind === 'stripe') {
    for (const side of [-1, 1]) {
      const half = buildRibbedAwning({
        width: fp.w * 0.55, depth: fp.d * 0.7, frontHeight: SHOP_AWNING_FRONT, backHeight: 2.65,
        ribCount: 3, seed: tagSeed(dna.seed, `AWNG${side}`),
        hideMaterial: side < 0 ? palette.redCloth : palette.patch, ribMaterial: palette.timber,
      });
      half.position.x = side * fp.w * 0.25;
      g.add(half);
    }
  } else {
    const awning = buildRibbedAwning({
      width: fp.w * 1.02, depth: fp.d * 0.85, frontHeight: SHOP_AWNING_FRONT, backHeight: 2.65,
      ribCount: 5, seed: tagSeed(dna.seed, 'AWNG'),
      hideMaterial: awningKind === 'patched' ? palette.patch : palette.redCloth, ribMaterial: palette.timber,
    });
    g.add(awning);
  }

  // Goods socket: weapon rack 30% / shield pile 25% / hide bundle 20% / salvage crate stack 15% / empty 10%.
  const goodsRand = mulberry32(tagSeed(dna.seed, 'GOOD'));
  const goodsKind = pickWeighted<'rack' | 'shields' | 'hide' | 'crates' | 'empty'>(goodsRand, [
    ['rack', 0.30], ['shields', 0.25], ['hide', 0.20], ['crates', 0.15], ['empty', 0.10],
  ]);
  if (goodsKind === 'rack') {
    const rack = buildWeaponRack({ frameMaterial: palette.timber, bladeMaterial: palette.iron, seed: tagSeed(dna.seed, 'GRCK') });
    rack.position.set(halfW - 0.4, 0, -halfD + 0.35);
    g.add(rack);
  } else if (goodsKind === 'shields') {
    for (let i = 0; i < 3; i++) {
      const shield = buildCapturedShield({ radius: 0.2, faceMaterial: palette.trim, rimMaterial: palette.iron });
      shield.position.set(halfW - 0.35, 0.2 + i * 0.22, -halfD + 0.4);
      shield.rotation.x = -Math.PI / 2 + 0.3;
      g.add(shield);
    }
  } else if (goodsKind === 'hide') {
    const bundle = buildHideBundle({ material: palette.hide, tieMaterial: palette.trim });
    bundle.position.set(halfW - 0.4, 0, -halfD + 0.35);
    g.add(bundle);
  } else if (goodsKind === 'crates') {
    for (let i = 0; i < 2; i++) {
      const crate = buildPlankCrate({ material: palette.patch, strapMaterial: palette.iron });
      crate.position.set(halfW - 0.4, i * 0.46, -halfD + 0.35);
      g.add(crate);
    }
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Blacksmith
// ─────────────────────────────────────────────────────────────────────────

const SMITH_SHELTER_EAVE = 2.2;
const SMITH_STACK_TOP = 5.1;

/** Builds a forge/smelter flagship: a rough stone forge pad + arched
 * hearth wall, an asymmetric lashed-timber work shelter on one side, a
 * riveted metal chimney/furnace stack breaking the roofline, and an
 * always-present anvil/coal-bin/rack/trough ensemble whose prop-socket
 * weight biases prominence rather than gating presence -- see design
 * spec section 4 `blacksmith`. */
export function buildOrcishBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-blacksmith';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Rough stone forge pad + back hearth wall plinth.
  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), plinthCourseHeight: 0.2, plinthLevels: 3 });
  g.add(plinth);
  const hearthWall = buildLogCourseWall([faces[1]!], 0.7, tagSeed(dna.seed, 'HRTW'), palette.stone, { logsPerFace: 3, courseHeight: 0.22 });
  hearthWall.name = 'blacksmith-hearth-wall';
  g.add(hearthWall);

  // Main forge mouth: 1.8 W x 1.6 H, dark interior, tusk/voussoir surround.
  const forgeMouth = buildOrcishForgeMouth({ width: 1.8, height: 1.6, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  forgeMouth.name = 'blacksmith-forge-mouth';
  placeOnFace(forgeMouth, faces[1]!, 0.5);
  g.add(forgeMouth);

  // Hearth surround: bone tusk arch 40% / rough stone voussoirs 35% / iron-banded frame 25%.
  const surroundRand = mulberry32(tagSeed(dna.seed, 'SURR'));
  const surroundKind = pickWeighted<'tusk' | 'voussoir' | 'iron'>(surroundRand, [
    ['tusk', 0.40], ['voussoir', 0.35], ['iron', 0.25],
  ]);
  const surroundMat = surroundKind === 'tusk' ? palette.bone : surroundKind === 'iron' ? palette.iron : palette.stone;
  const arch = buildVoussoirArch({ width: 1.8 * 1.25, springHeight: 1.6 * 0.7, archRatio: 0.5, material: surroundMat, seed: tagSeed(dna.seed, 'ARCH') });
  arch.name = 'blacksmith-hearth-arch';
  arch.position.z = wallZFor(1, halfW, halfD);
  placeOnFace(arch, faces[1]!, 0.5);
  g.add(arch);

  // Work shelter: left lean-to 35% / right lean-to 35% / rear shed 20% / open pad 10%.
  const shelterRand = mulberry32(tagSeed(dna.seed, 'SHLT'));
  const shelterKind = pickWeighted<'left' | 'right' | 'rear' | 'open'>(shelterRand, [
    ['left', 0.35], ['right', 0.35], ['rear', 0.20], ['open', 0.10],
  ]);
  if (shelterKind !== 'open') {
    const shelterFaceIndex = shelterKind === 'left' ? 2 : shelterKind === 'right' ? 0 : 1;
    const shelterFace = faces[shelterFaceIndex]!;
    const shelterWalls = buildLogCourseWall([shelterFace], SMITH_SHELTER_EAVE, tagSeed(dna.seed, 'SHLW'), palette.timber, { logsPerFace: 3, courseHeight: 0.4 });
    shelterWalls.name = 'blacksmith-shelter-wall';
    g.add(shelterWalls);
    const shelterPosts = buildPostFrame([shelterFace], SMITH_SHELTER_EAVE, tagSeed(dna.seed, 'SHLP'), palette.timber, { postSpacing: 1.1 });
    g.add(shelterPosts);
    // HidePanel roof over the work bay -- half-gable/thick ribbed awning.
    const shelterRoof = buildRibbedAwning({
      width: shelterFaceIndex === 1 ? fp.w * 0.9 : fp.d * 0.9, depth: 1.4, frontHeight: SMITH_SHELTER_EAVE * 0.8, backHeight: SMITH_SHELTER_EAVE,
      seed: tagSeed(dna.seed, 'SHLR'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    shelterRoof.name = 'blacksmith-shelter-roof';
    shelterRoof.rotation.y = shelterFace.normalAngle;
    placeOnFace(shelterRoof, shelterFace, 0.5);
    g.add(shelterRoof);
    // Service slot: 0.55 x 0.55 on the shelter wall.
    const slot = buildOrcishWindow({ width: 0.55, height: 0.55, wallZ: wallZFor(shelterFaceIndex, halfW, halfD), palette: openingPalette, shape: 'round' });
    slot.name = 'blacksmith-service-slot';
    slot.position.y = SMITH_SHELTER_EAVE * 0.5;
    placeOnFace(slot, shelterFace, 0.5);
    g.add(slot);
  }

  // Work-bay front opening: 2.2 W x 1.7 H framed by posts (open, no wall/door).
  for (const side of [-1, 1]) {
    const post = buildTaperedLog({ length: 1.9, radiusBase: 0.13, radiusTop: 0.1, material: palette.timber });
    post.name = 'blacksmith-bay-post';
    post.position.set(side * 1.1, 0.95, halfD - 0.05);
    g.add(post);
  }
  const bayHeader = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), palette.timber);
  bayHeader.name = 'blacksmith-bay-header';
  bayHeader.position.set(0, 1.85, halfD - 0.05);
  g.add(bayHeader);

  // Half-gable roof over the work bay (never one flat plane).
  const bayRoof = buildRibbedAwning({
    width: fp.w * 0.7, depth: fp.d * 0.75, frontHeight: 1.9, backHeight: SMITH_SHELTER_EAVE + 0.3,
    ribCount: 5, seed: tagSeed(dna.seed, 'BAYR'), hideMaterial: palette.hide, ribMaterial: palette.timber,
  });
  bayRoof.name = 'blacksmith-bay-roof';
  g.add(bayRoof);

  // Chimney module (breaks the roofline): tall riveted stack 50% / squat furnace stack 25% / twin vents 15% / bent pipe stack 10%.
  const chimneyRand = mulberry32(tagSeed(dna.seed, 'CHIM'));
  const chimneyKind = pickWeighted<'tall' | 'squat' | 'twin' | 'bent'>(chimneyRand, [
    ['tall', 0.50], ['squat', 0.25], ['twin', 0.15], ['bent', 0.10],
  ]);
  const chimneyX = -halfW + 0.7;
  const chimneyZ = -halfD + 0.6;
  if (chimneyKind === 'twin') {
    for (const side of [-0.35, 0.35]) {
      const stack = buildCorbelledChimneyStack({
        width: 0.5, depth: 0.5, height: SMITH_STACK_TOP * 0.75, material: palette.iron,
        collarMaterial: palette.trim, capMaterial: palette.iron, flueMaterial: palette.forgeEmissive,
        seed: tagSeed(dna.seed, `TWIN${side}`), collarBands: 3,
      });
      stack.position.set(chimneyX + side, 0, chimneyZ);
      g.add(stack);
    }
  } else if (chimneyKind === 'bent') {
    const stack = buildCorbelledChimneyStack({
      width: 0.6, depth: 0.6, height: SMITH_STACK_TOP * 0.65, material: palette.iron,
      collarMaterial: palette.trim, capMaterial: palette.iron, flueMaterial: palette.forgeEmissive,
      seed: tagSeed(dna.seed, 'BENT'), collarBands: 2,
    });
    stack.position.set(chimneyX, 0, chimneyZ);
    g.add(stack);
    const pipe = buildPipeRun({ segments: [{ dir: 'up', length: 0.6 }, { dir: 'left', length: 0.5 }, { dir: 'up', length: 0.8 }], radius: 0.1, material: palette.iron, start: new THREE.Vector3(chimneyX, SMITH_STACK_TOP * 0.65, chimneyZ) });
    pipe.name = 'blacksmith-bent-pipe';
    g.add(pipe);
  } else {
    const stackHeight = chimneyKind === 'squat' ? SMITH_STACK_TOP * 0.6 : SMITH_STACK_TOP;
    const stack = buildCorbelledChimneyStack({
      width: 0.8, depth: 0.8, height: stackHeight, material: palette.iron,
      collarMaterial: palette.trim, capMaterial: palette.iron, flueMaterial: palette.forgeEmissive,
      seed: tagSeed(dna.seed, 'STCK'), collarBands: chimneyKind === 'squat' ? 2 : 3,
    });
    stack.name = 'blacksmith-chimney-stack';
    stack.position.set(chimneyX, 0, chimneyZ);
    g.add(stack);
  }

  // Prop socket: weapon rack 30% / anvil focus 25% / coal bins 20% / slag trough 15% / shield trophy 10%
  // -- the winning axis is the most PROMINENT prop (placed front-and-center,
  // larger scale); the anvil/coal-bin/rack/trough ensemble is otherwise
  // always present per spec ("open work-bay... always-present anvil+
  // coal-bin+weapon-rack+slag-trough ensemble" -- a documented
  // simplification: presence is constant, only prominence varies).
  const propRand = mulberry32(tagSeed(dna.seed, 'PROP'));
  const propKind = pickWeighted<'rack' | 'anvil' | 'coal' | 'slag' | 'shield'>(propRand, [
    ['rack', 0.30], ['anvil', 0.25], ['coal', 0.20], ['slag', 0.15], ['shield', 0.10],
  ]);

  const anvil = buildAnvil({ material: palette.iron });
  anvil.name = 'blacksmith-anvil';
  anvil.scale.setScalar(propKind === 'anvil' ? 1.4 : 1.0);
  anvil.position.set(0.4, 0, halfD - 0.8);
  g.add(anvil);

  const coalBin = buildCoalBin({ material: palette.patch, seed: tagSeed(dna.seed, 'COAL') });
  coalBin.name = 'blacksmith-coal-bin';
  coalBin.scale.setScalar(propKind === 'coal' ? 1.4 : 1.0);
  coalBin.position.set(-0.6, 0, halfD - 0.6);
  g.add(coalBin);

  const rack = buildWeaponRack({ frameMaterial: palette.timber, bladeMaterial: palette.iron, seed: tagSeed(dna.seed, 'RACK') });
  rack.name = 'blacksmith-weapon-rack';
  rack.scale.setScalar(propKind === 'rack' ? 1.3 : 1.0);
  rack.position.set(halfW - 0.4, 0, halfD - 0.5);
  g.add(rack);

  const trough = buildSlagTrough({ material: palette.stone });
  trough.name = 'blacksmith-slag-trough';
  trough.scale.setScalar(propKind === 'slag' ? 1.4 : 1.0);
  trough.position.set(0.5, 0, -halfD + 0.9);
  g.add(trough);

  if (propKind === 'shield') {
    const shieldTrophy = buildCapturedShield({ radius: 0.4, faceMaterial: palette.trim, rimMaterial: palette.iron });
    const shieldAnchor = mountOnWall(shieldTrophy, faces[1]!, 1.9, 0.15);
    g.add(shieldAnchor);
  }

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapel
// ─────────────────────────────────────────────────────────────────────────

const CHAPEL_POST_HEIGHT = 2.6;

/** Builds a war totem shrine: a mostly-open post-and-rail frame (no
 * solid walls), a front ritual portal with a hide-flap "glazing" swap, a
 * rear altar recess with crossed-bone mullions, a long ribbed hide
 * canopy (continuous / broken / two-separated per the canopy-module
 * axis), a line of totem poles down the aisle, and a stone altar plinth
 * + fire ring -- see design spec section 4 `chapel`. */
export function buildOrcishChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildOrcishPalette(dna);
  const openingPalette = toOpeningPalette(palette);

  const g = new THREE.Group();
  g.name = 'orcish-chapel';

  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  // Mostly-open post-and-rib frame + low lashing-band rails.
  const posts = buildPostFrame(faces, CHAPEL_POST_HEIGHT, tagSeed(dna.seed, 'POST'), palette.timber, { postSpacing: 1.3 });
  g.add(posts);
  const railLow = buildLashingBand(faces, 0.5, palette.trim);
  const railMid = buildLashingBand(faces, 1.1, palette.trim);
  g.add(railLow, railMid);

  const plinth = buildRockPlinthSkirt({ points, material: palette.stone, seed: tagSeed(dna.seed, 'PLIN'), stepsFace: faces[3] });
  g.add(plinth);

  // Side enclosure: open rails 40% / hide screens 35% / shield screens 25%.
  const enclosureRand = mulberry32(tagSeed(dna.seed, 'ENCL'));
  const enclosureKind = pickWeighted<'open' | 'hide' | 'shields'>(enclosureRand, [
    ['open', 0.40], ['hide', 0.35], ['shields', 0.25],
  ]);
  if (enclosureKind === 'hide') {
    for (const fi of [0, 2]) {
      const screen = buildRibbedHideWall([faces[fi]!], CHAPEL_POST_HEIGHT * 0.55, tagSeed(dna.seed, `HSCR${fi}`), palette.hide, palette.trim);
      screen.position.y = 0.3;
      g.add(screen);
    }
  } else if (enclosureKind === 'shields') {
    for (const fi of [0, 2]) {
      for (let i = 0; i < 4; i++) {
        const shield = buildCapturedShield({ radius: 0.25, faceMaterial: palette.trim, rimMaterial: palette.iron });
        const anchor = mountOnWall(shield, faces[fi]!, 1.2, 0.15 + i * 0.23);
        g.add(anchor);
      }
    }
  }
  // Two side slit panels: 0.45 W x 0.75 H (always present, on both sides).
  for (const fi of [0, 2]) {
    const slit = buildOrcishWindow({ width: 0.45, height: 0.75, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette, shape: 'round' });
    slit.name = 'chapel-side-slit';
    slit.position.y = 1.3;
    placeOnFace(slit, faces[fi]!, 0.5);
    g.add(slit);
  }

  // Front ritual portal: 1.2 W x 2.2 H, hide-flap "glazing" swap, tusk arch surround.
  const portal = buildOrcishDoor({
    width: 1.2, height: 2.2, wallZ: wallZFor(3, halfW, halfD),
    palette: { ...openingPalette, glazing: palette.hide }, archRatio: 0.5,
  });
  portal.name = 'chapel-ritual-portal';
  placeOnFace(portal, faces[3]!, 0.5);
  g.add(portal);
  const portalArch = buildVoussoirArch({ width: 1.2 * 1.3, springHeight: 2.2 * 0.55, archRatio: 0.5, material: palette.bone, seed: tagSeed(dna.seed, 'PARC') });
  portalArch.name = 'chapel-portal-arch';
  portalArch.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(portalArch, faces[3]!, 0.5);
  g.add(portalArch);

  // Rear altar recess: 0.9 W x 1.1 H behind crossed-bone mullions.
  const altarRecess = buildOrcishWindow({
    width: 0.9, height: 1.1, wallZ: wallZFor(1, halfW, halfD),
    palette: { ...openingPalette, trim: palette.bone }, shape: 'round', divisionStyle: 'cross',
  });
  altarRecess.name = 'chapel-altar-recess';
  altarRecess.position.y = 0.9;
  placeOnFace(altarRecess, faces[1]!, 0.5);
  g.add(altarRecess);

  // Stone altar plinth + fire ring near the rear.
  const altarPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.5), palette.stone);
  altarPlinth.name = 'chapel-altar-plinth';
  altarPlinth.position.set(0, 0.225, -halfD + 0.9);
  g.add(altarPlinth);
  const fireRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.08, 6, 16), palette.stone);
  fireRing.name = 'chapel-fire-ring';
  fireRing.rotation.x = Math.PI / 2;
  fireRing.position.set(0, 0.06, 0);
  g.add(fireRing);

  // Canopy module: continuous hide ridge 45% / broken panel canopy 30% / two separated canopies 25%
  // -- both "broken panel" and "two separated canopies" converge on the
  // same 2-segment-with-gap implementation (documented simplification:
  // a broken panel and a smoke-gap between two canopies read the same
  // way in this kit -- a literal ridge discontinuity over the fire ring).
  const canopyRand = mulberry32(tagSeed(dna.seed, 'CNPY'));
  const canopyKind = pickWeighted<'continuous' | 'split'>(canopyRand, [
    ['continuous', 0.45], ['split', 0.55],
  ]);
  const ridgeHeight = 1.3 + canopyRand() * 0.4;
  if (canopyKind === 'continuous') {
    const roof = buildLonghouseHideRoof({
      width: fp.w, length: fp.d, wallTopY: CHAPEL_POST_HEIGHT, ridgeHeight,
      rafterCount: 8, seed: tagSeed(dna.seed, 'ROOF'), hideMaterial: palette.hide, ribMaterial: palette.timber,
    });
    g.add(roof);
  } else {
    const segLength = fp.d * 0.42;
    for (const zSign of [-1, 1]) {
      const roof = buildLonghouseHideRoof({
        width: fp.w, length: segLength, wallTopY: CHAPEL_POST_HEIGHT, ridgeHeight,
        rafterCount: 4, seed: tagSeed(dna.seed, `ROOF${zSign}`), hideMaterial: palette.hide, ribMaterial: palette.timber,
      });
      roof.name = 'chapel-canopy-segment';
      roof.position.z = zSign * (fp.d / 2 - segLength / 2 - 0.4);
      g.add(roof);
    }
  }

  // Optional red banner strip down the ridge.
  const bannerRand = mulberry32(tagSeed(dna.seed, 'RIDG'));
  if (bannerRand() < 0.4) {
    const banner = buildBannerStrip({ width: 0.4, length: fp.d * 0.6, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'RIDB') });
    banner.name = 'chapel-ridge-banner';
    banner.rotation.x = Math.PI / 2;
    banner.position.set(0, CHAPEL_POST_HEIGHT + ridgeHeight - 0.1, 0);
    g.add(banner);
  }

  // Shrine layout: central totem aisle 45% / rear altar focus 35% / open fire circle 20%.
  const layoutRand = mulberry32(tagSeed(dna.seed, 'SHRN'));
  const shrineLayout = pickWeighted<'aisle' | 'altar-focus' | 'fire-circle'>(layoutRand, [
    ['aisle', 0.45], ['altar-focus', 0.35], ['fire-circle', 0.20],
  ]);

  // Totem motif: tusks 35% / skull masks 30% / crossed blades 20% / captured banner 15%.
  const motifRand = mulberry32(tagSeed(dna.seed, 'MOTF'));
  const motifKind = pickWeighted<'tusks' | 'skulls' | 'blades' | 'banner'>(motifRand, [
    ['tusks', 0.35], ['skulls', 0.30], ['blades', 0.20], ['banner', 0.15],
  ]);

  const totemCount = shrineLayout === 'aisle' ? 4 : shrineLayout === 'altar-focus' ? 2 : 1;
  const totemZStart = shrineLayout === 'altar-focus' ? -halfD + 1.5 : -halfD * 0.6;
  const totemZEnd = shrineLayout === 'altar-focus' ? -halfD + 2.6 : halfD * 0.6;
  for (let i = 0; i < totemCount; i++) {
    const t = totemCount === 1 ? 0.5 : i / (totemCount - 1);
    const z = totemZStart + (totemZEnd - totemZStart) * t;
    const totem = buildTotemPole({ material: palette.timber, boneMaterial: palette.bone, height: 4.4 + motifRand() * 0.6 });
    totem.name = 'chapel-totem-pole';
    totem.position.set((i % 2 === 0 ? -1 : 1) * halfW * 0.55, 0, z);
    g.add(totem);

    let topper: THREE.Object3D | undefined;
    if (motifKind === 'tusks') {
      topper = buildTuskFinial({ material: palette.bone, length: 0.4 });
    } else if (motifKind === 'blades') {
      topper = buildCrossedBlades({ length: 0.5, bladeMaterial: palette.iron, bindingMaterial: palette.trim });
    } else if (motifKind === 'banner') {
      topper = buildBannerStrip({ width: 0.3, length: 0.5, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, `TOPB${i}`) });
    }
    if (topper) {
      topper.name = 'chapel-totem-topper';
      topper.position.copy(totem.position);
      topper.position.y = 4.4;
      g.add(topper);
    }
  }

  // Skull shelf + weapon offerings near the altar.
  const skullShelf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), palette.timber);
  skullShelf.name = 'chapel-skull-shelf';
  skullShelf.position.set(0, 1.0, -halfD + 1.1);
  g.add(skullShelf);
  for (let i = 0; i < 3; i++) {
    const skull = buildSkullTrophy({ boneMaterial: palette.bone, scale: 0.55 });
    skull.name = `chapel-shelf-skull-${i}`;
    skull.position.set((i - 1) * 0.28, 1.08, -halfD + 1.1);
    g.add(skull);
  }
  const offerings = buildCrossedBlades({ length: 0.5, bladeMaterial: palette.iron, bindingMaterial: palette.trim });
  offerings.name = 'chapel-weapon-offering';
  offerings.rotation.x = -Math.PI / 2;
  offerings.position.set(0.6, 0.02, -halfD + 0.9);
  g.add(offerings);

  return g;
}

/** Builds a boxed plank platform floor with real board-to-board gaps and
 * a single rectangular ladder/hatch hole (framed by a raised lip, not an
 * absent-geometry void) -- the watchtower's platform deck, design spec:
 * "Platform is plank courses with gaps... all gaps are framed, not
 * absent geometry." */
function buildPlankPlatform(
  width: number,
  depth: number,
  hatchWidth: number,
  hatchDepth: number,
  hatchOffsetX: number,
  material: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'watchtower-platform';
  const plankWidth = 0.24;
  const plankCount = Math.max(3, Math.round(depth / plankWidth));
  const hatchHalfW = hatchWidth / 2;
  const hatchHalfD = hatchDepth / 2;
  for (let i = 0; i < plankCount; i++) {
    const z = -depth / 2 + (i + 0.5) * (depth / plankCount);
    // Skip/split planks that cross the hatch footprint so the hole is a
    // real gap in the deck, not merely painted over.
    if (Math.abs(z - 0) < hatchHalfD && Math.abs(hatchOffsetX) < width / 2) {
      const leftLen = width / 2 + hatchOffsetX - hatchHalfW;
      const rightLen = width / 2 - hatchOffsetX - hatchHalfW;
      if (leftLen > 0.05) {
        const leftPlank = new THREE.Mesh(new THREE.BoxGeometry(leftLen, 0.06, plankWidth * 0.94), material);
        leftPlank.name = `platform-plank-${i}-a`;
        leftPlank.position.set(-width / 2 + leftLen / 2, -0.03, z);
        leftPlank.castShadow = leftPlank.receiveShadow = true;
        g.add(leftPlank);
      }
      if (rightLen > 0.05) {
        const rightPlank = new THREE.Mesh(new THREE.BoxGeometry(rightLen, 0.06, plankWidth * 0.94), material);
        rightPlank.name = `platform-plank-${i}-b`;
        rightPlank.position.set(width / 2 - rightLen / 2, -0.03, z);
        rightPlank.castShadow = rightPlank.receiveShadow = true;
        g.add(rightPlank);
      }
    } else {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, plankWidth * 0.94), material);
      plank.name = `platform-plank-${i}`;
      plank.position.set(0, -0.03, z);
      plank.castShadow = plank.receiveShadow = true;
      g.add(plank);
    }
  }
  // Raised hatch-lip frame (real proud geometry framing the hole).
  const lipHeight = 0.05;
  for (const [name, sx, sz, px, pz] of [
    ['hatch-lip-front', hatchWidth + 0.08, 0.04, 0, hatchHalfD],
    ['hatch-lip-back', hatchWidth + 0.08, 0.04, 0, -hatchHalfD],
    ['hatch-lip-left', 0.04, hatchDepth, -hatchHalfW, 0],
    ['hatch-lip-right', 0.04, hatchDepth, hatchHalfW, 0],
  ] as Array<[string, number, number, number, number]>) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(sx, lipHeight, sz), material);
    lip.name = name;
    lip.position.set(hatchOffsetX + px, lipHeight / 2, pz);
    g.add(lip);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Watchtower
// ─────────────────────────────────────────────────────────────────────────

const WATCHTOWER_PLATFORM_Y = 4.2;

/** Builds a lashed lookout platform: 4 tapered-log legs (straight /
 * splayed / asymmetric-repaired stance), 2 tiers of cross braces, a
 * boxed plank platform with a framed ladder hatch + rung ladder, a
 * parapet rail with 3-4 framed lookout gaps, a small ribbed hide roof
 * cap, and a signal prop -- see design spec section 4 `watchtower`. */
export function buildOrcishWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildOrcishPalette(dna);
  const platformY = WATCHTOWER_PLATFORM_Y;

  const g = new THREE.Group();
  g.name = 'orcish-watchtower';

  // Leg stance: straight 30% / splayed 50% / asymmetric-repaired leg 20%.
  const stanceRand = mulberry32(tagSeed(dna.seed, 'STNC'));
  const stance = pickWeighted<'straight' | 'splayed' | 'asymmetric'>(stanceRand, [
    ['straight', 0.30], ['splayed', 0.50], ['asymmetric', 0.20],
  ]);
  const legCorners: [number, number][] = [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]];
  const splayFactor = stance === 'straight' ? 0 : 0.45;
  const legTops: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = legCorners[i]!;
    const thisSplay = stance === 'asymmetric' && i === 3 ? 0.15 : splayFactor;
    const base = new THREE.Vector3(cx * (1 + thisSplay), 0, cz * (1 + thisSplay));
    const top = new THREE.Vector3(cx, platformY, cz);
    legTops.push(top);
    const leg = buildCrossBrace(base, top, 0.11, palette.timber);
    leg.name = `watchtower-leg-${i}`;
    g.add(leg);
  }

  // 2 tiers of X-braces between adjacent legs.
  for (const tierT of [0.35, 0.7]) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legCorners[i]!;
      const [bx, bz] = legCorners[(i + 1) % 4]!;
      const legA0 = new THREE.Vector3(ax * (1 + splayFactor), 0, az * (1 + splayFactor));
      const legA1 = new THREE.Vector3(ax, platformY, az);
      const legB0 = new THREE.Vector3(bx * (1 + splayFactor), 0, bz * (1 + splayFactor));
      const legB1 = new THREE.Vector3(bx, platformY, bz);
      const pA = legA0.clone().lerp(legA1, tierT - 0.08);
      const pB = legB0.clone().lerp(legB1, tierT + 0.08);
      const pC = legA0.clone().lerp(legA1, tierT + 0.08);
      const pD = legB0.clone().lerp(legB1, tierT - 0.08);
      const braceX1 = buildCrossBrace(pA, pB, 0.045, palette.trim);
      braceX1.name = 'watchtower-cross-brace';
      g.add(braceX1);
      const braceX2 = buildCrossBrace(pC, pD, 0.045, palette.trim);
      braceX2.name = 'watchtower-cross-brace';
      g.add(braceX2);
    }
  }

  // Ladder: rungs up the front-right leg.
  const rungCount = 10;
  for (let i = 0; i < rungCount; i++) {
    const t = (i + 0.5) / rungCount;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), palette.timber);
    rung.name = `watchtower-ladder-rung-${i}`;
    rung.position.set(halfW * 0.6, t * platformY * 0.94, halfD + 0.15);
    g.add(rung);
  }

  // Plank platform with a framed ladder hatch.
  const platformSize = Math.max(halfW, halfD) * 2 + 0.4;
  const platform = buildPlankPlatform(platformSize, platformSize, 0.55, 0.55, halfW * 0.5, palette.timber);
  platform.position.y = platformY;
  g.add(platform);

  // Parapet rail: log rail 40% / shield rail 30% / spike rail 20% / broken rail 10%.
  const railRand = mulberry32(tagSeed(dna.seed, 'RAIL'));
  const railKind = pickWeighted<'log' | 'shield' | 'spike' | 'broken'>(railRand, [
    ['log', 0.40], ['shield', 0.30], ['spike', 0.20], ['broken', 0.10],
  ]);
  const railHalf = platformSize / 2 - 0.06;
  const railFaces = rectangleFaces(railHalf, railHalf);
  const railHeight = 0.65;
  const railY = platformY + railHeight * 0.5;
  if (railKind === 'log') {
    const railBand = buildLashingBand(railFaces, railHeight * 0.85, palette.trim);
    railBand.position.y = platformY;
    g.add(railBand);
    for (const face of railFaces) {
      const post = buildTaperedLog({ length: railHeight, radiusBase: 0.05, radiusTop: 0.04, material: palette.timber });
      post.name = 'watchtower-rail-post';
      post.rotation.x = -Math.PI / 2;
      const [mx, mz] = facePointAt(face, 0.5);
      post.position.set(mx, railY, mz);
      g.add(post);
    }
  } else if (railKind === 'shield') {
    for (const face of railFaces) {
      const shield = buildCapturedShield({ radius: 0.28, faceMaterial: palette.trim, rimMaterial: palette.iron });
      shield.name = 'watchtower-rail-shield';
      shield.position.set(0, railY, railHalf);
      shield.rotation.y = face.normalAngle;
      const [mx, mz] = facePointAt(face, 0.5);
      shield.position.set(mx, railY, mz);
      g.add(shield);
    }
  } else if (railKind === 'spike') {
    for (const face of railFaces) {
      for (const t of [0.25, 0.75]) {
        const spike = buildTuskFinial({ material: palette.bone, length: 0.35, radius: 0.03 });
        spike.name = 'watchtower-rail-spike';
        const [px, pz] = facePointAt(face, t);
        spike.position.set(px, platformY + 0.1, pz);
        g.add(spike);
      }
    }
  } else {
    const railBand = buildLashingBand([railFaces[0]!, railFaces[2]!], railHeight * 0.85, palette.trim);
    railBand.name = 'watchtower-broken-rail';
    railBand.position.y = platformY;
    g.add(railBand);
  }

  // 3-4 framed lookout slit gaps in the parapet.
  const slitCount = 3 + (mulberry32(tagSeed(dna.seed, 'SLIT'))() < 0.5 ? 0 : 1);
  for (let i = 0; i < slitCount; i++) {
    const face = railFaces[i % railFaces.length]!;
    const frame = new THREE.Group();
    frame.name = 'watchtower-lookout-slit';
    const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), palette.trim);
    sillMesh.name = 'lookout-slit-sill';
    sillMesh.position.y = -0.15;
    frame.add(sillMesh);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), palette.trim);
    lintel.name = 'lookout-slit-lintel';
    lintel.position.y = 0.15;
    frame.add(lintel);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), palette.trim);
    crossbar.name = 'lookout-slit-crossbar';
    frame.add(crossbar);
    const [fx, fz] = facePointAt(face, 0.5);
    frame.position.set(fx, railY, fz);
    frame.rotation.y = face.normalAngle;
    g.add(frame);
  }

  // Roof cap: hide hip 45% / conical rib cap 35% / open platform 20%.
  const capRand = mulberry32(tagSeed(dna.seed, 'CAP'));
  const capKind = pickWeighted<'hip' | 'conical' | 'open'>(capRand, [
    ['hip', 0.45], ['conical', 0.35], ['open', 0.20],
  ]);
  let roofPeak = 0;
  if (capKind !== 'open') {
    roofPeak = 1.3 + capRand() * 0.4;
    const cap = capKind === 'hip'
      ? buildDomedHideRoof({ baseRadius: platformSize * 0.6, height: roofPeak, ribCount: 6, seed: tagSeed(dna.seed, 'CAPG'), hideMaterial: palette.hide, ribMaterial: palette.timber })
      : buildConicalHideRoof({ baseRadius: platformSize * 0.58, apexHeight: roofPeak, ribCount: 6, seed: tagSeed(dna.seed, 'CAPG'), hideMaterial: palette.hide, ribMaterial: palette.timber });
    cap.name = 'watchtower-roof-cap';
    cap.position.y = platformY + railHeight;
    g.add(cap);
  }

  // Signal prop: red pennant 35% / horn 25% / skull spike 25% / none 15%.
  const signalRand = mulberry32(tagSeed(dna.seed, 'SGNL'));
  const signalKind = pickWeighted<'pennant' | 'horn' | 'skull' | 'none'>(signalRand, [
    ['pennant', 0.35], ['horn', 0.25], ['skull', 0.25], ['none', 0.15],
  ]);
  const crestY = platformY + railHeight + roofPeak + 0.1;
  if (signalKind === 'pennant') {
    const pennant = buildBannerStrip({ width: 0.35, length: 0.7, clothMaterial: palette.redCloth, poleMaterial: palette.timber, seed: tagSeed(dna.seed, 'PENB') });
    pennant.name = 'watchtower-signal-pennant';
    pennant.position.set(0, crestY, 0);
    g.add(pennant);
  } else if (signalKind === 'horn') {
    const horn = buildTuskFinial({ material: palette.bone, length: 0.5, curve: (55 * Math.PI) / 180 });
    horn.name = 'watchtower-hanging-horn';
    horn.rotation.z = Math.PI;
    horn.position.set(railHalf, railY, railHalf);
    g.add(horn);
  } else if (signalKind === 'skull') {
    const skull = buildSkullTrophy({ boneMaterial: palette.bone });
    skull.name = 'watchtower-signal-skull';
    skull.position.set(0, crestY, 0);
    g.add(skull);
  }

  // Corner spikes + a shield on one side (always-present per spec).
  for (const t of [0, 0.5]) {
    const spike = buildTuskFinial({ material: palette.bone, length: 0.3 });
    spike.name = 'watchtower-corner-spike';
    const [px, pz] = facePointAt(railFaces[0]!, t);
    spike.position.set(px, platformY + railHeight, pz);
    g.add(spike);
  }
  const sideShield = buildCapturedShield({ radius: 0.3, faceMaterial: palette.trim, rimMaterial: palette.iron });
  sideShield.name = 'watchtower-side-shield';
  sideShield.rotation.y = Math.PI / 2;
  sideShield.position.set(-halfW - 0.1, platformY * 0.4, 0);
  g.add(sideShield);

  return g;
}
