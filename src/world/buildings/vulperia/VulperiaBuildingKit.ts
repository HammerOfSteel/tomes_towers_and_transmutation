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
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import { buildTurfRoof, type TurfRoofPalette, type TurfRoofDormerSpec } from '../kit/TurfRoof';
import { buildLanternCage, buildWallBracket, buildGallowsBracket } from '../kit/LanternKit';
import { depthFor } from '../kit/DepthLadder';
import {
  buildVulperiaPalette,
  pickVulperiaWeighted,
  tagVulperiaSeed,
  type VulperiaPalette,
} from './VulperiaPalette';
import {
  buildVulperiaWindow,
  buildVulperiaDoor,
  buildVulperiaRoundWatch,
  buildVulperiaEyebrowDormerWindow,
  buildVulperiaGableSlit,
  type VulperiaOpeningPalette,
} from './VulperiaOpenings';
import { buildVulperiaGrounding } from './VulperiaGrounding';
import { buildVulperiaLotDressing } from './VulperiaLotDressing';

/**
 * VulperiaBuildingKit.ts — composes all eight canonical vulperia building
 * kinds (docs/superpowers/specs/2026-09-04-vulperia-buildings-design.md)
 * from the shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`)
 * plus the race-specific `VulperiaPalette.ts`/`VulperiaOpenings.ts`/
 * `VulperiaGrounding.ts`/`VulperiaLotDressing.ts` modules and the new
 * shared `TurfRoof.ts` module.
 *
 * Vulperia's identity axis (design spec §2, distinguishing it from every
 * other race so far): fox-folk WARRENS -- warm, watchful, clever, low and
 * earth-hugging, with many small round/framed openings and thick
 * segmented sod/turf roofs that sweep down like sheltering hills WITHOUT
 * ever reading as a smooth blob (doctrine's anti-smooth-geometry rule
 * applied to turf specifically). Every kind below follows the doctrine
 * (docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md): a
 * real depth ladder, the five-piece opening minimum on every door/window,
 * and a rigorous berm/skirt at every terrain contact.
 *
 * Massing simplification (documented, mirrors other races' pragmatic
 * choices under time constraints): villa/inn "side lobe"/"wing" masses
 * are built as a SECOND independently-walled-and-roofed hall rigidly
 * offset flush against the main hall (a genuine L-plan with its own real
 * ridge/hip seam where the two turf roofs meet), rather than reaching for
 * `MassComposer.ts`'s more general wing-composition machinery -- this
 * keeps wall-to-roof alignment trivially correct while still producing
 * two real intersecting volumes, exactly satisfying the doctrine's
 * "silhouette break" requirement (Rule 4).
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers (mirrors UndeadNecropolisKit.ts's/DwarvenBuildingKit.ts's
// placeOnFace/wallZFor/buildHall conventions; vulperia's own
// tagVulperiaSeed/pickVulperiaWeighted already live in VulperiaPalette.ts).
// ─────────────────────────────────────────────────────────────────────────

function placeOnFace(obj: THREE.Object3D, face: OctagonFace, t: number): void {
  obj.rotation.y = face.normalAngle;
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  const [targetX, targetZ] = facePointAt(face, t);
  obj.position.x += targetX - midX;
  obj.position.z += targetZ - midZ;
}

function wallZFor(faceIndex: number, halfW: number, halfD: number): number {
  return faceIndex === 0 || faceIndex === 2 ? halfW : halfD;
}

function toOpeningPalette(palette: VulperiaPalette): VulperiaOpeningPalette {
  return {
    stone: palette.stone,
    glazing: palette.glazing,
    wood: palette.timber,
    accent: palette.greenAccent,
  };
}

function toTurfPalette(palette: VulperiaPalette): TurfRoofPalette {
  return {
    timber: palette.turfTimber,
    boardDeck: palette.turfDeck,
    turfStop: palette.turfStop,
    soil: palette.turfSoil,
    grass: palette.turfGrass,
    grassAccent: palette.turfGrassAccent,
  };
}

/** Builds a rectangular hall's coursed walls, corner posts (`StoneTower
 * Quoins`, reused as vulperia's "rounded corner posts" -- the shared
 * kit's existing corner-post primitive, matching every other race's
 * convention rather than a bespoke rounded variant), and a flat floor
 * cap. The shared rectangular-mass technique every kind below reuses. */
function buildVulperiaHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  material: THREE.Material,
  wallOpts: WallBlockOptions = {},
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  g.name = 'vulperia-hall';
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  const longestFace = 2 * Math.max(halfW, halfD);
  const walls = buildWallSurfaceBlocks(0, height, seed, material, {
    courseHeight: 0.38,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.65)),
    jitter: 0.03,
    ...wallOpts,
    facesOverride: wallOpts.facesOverride ?? faces,
  });
  g.add(walls);

  const posts = buildQuoins(Math.max(halfW, halfD), height, undefined, material, points);
  posts.name = 'vulperia-hall-corner-posts';
  g.add(posts);

  const floorCap = buildFloorCap(0, material, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'vulperia-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

interface VulperiaWingResult {
  hallGroup: THREE.Group;
  roof: THREE.Group;
  centerX: number;
  centerZ: number;
  halfW: number;
  halfD: number;
  wallHeight: number;
}

/** Builds an independently-walled-and-roofed "wing" hall flush-adjacent
 * to a main hall on one side (`'left' | 'right' | 'rear'`), each with its
 * own `TurfRoof.lowGable` -- see the file-level doc comment for why this
 * is used instead of `TurfRoof`'s centred `crossGable` archetype for
 * villa/inn massing. */
function buildVulperiaWing(
  side: 'left' | 'right' | 'rear',
  mainHalfW: number,
  mainHalfD: number,
  wingHalfW: number,
  wingHalfD: number,
  wallHeight: number,
  ridgeHeight: number,
  seed: number,
  palette: VulperiaPalette,
): VulperiaWingResult {
  let centerX = 0;
  let centerZ = 0;
  if (side === 'left') centerX = -(mainHalfW + wingHalfW);
  else if (side === 'right') centerX = mainHalfW + wingHalfW;
  else centerZ = -(mainHalfD + wingHalfD);

  const hall = buildVulperiaHall(wingHalfW, wingHalfD, wallHeight, tagVulperiaSeed(seed, 'WING'), palette.cob, {
    courseHeight: 0.34,
  });
  hall.group.position.set(centerX, 0, centerZ);

  const roof = buildTurfRoof({
    archetype: side === 'rear' ? 'lowGable' : 'lowGable',
    halfWidth: side === 'rear' ? wingHalfW : wingHalfD,
    halfDepth: side === 'rear' ? wingHalfD : wingHalfW,
    eaveHeight: wallHeight,
    ridgeHeight,
    turfThickness: 0.26,
    seed: tagVulperiaSeed(seed, 'WINGROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.35,
  });
  // The wing's own ridge naturally runs the SHORT axis of a non-rear wing
  // (perpendicular to the main hall's ridge) so the two roofs read as a
  // genuine cross-gable seam rather than two parallel parallel planes;
  // rotate the whole roof group 90 degrees for left/right wings to match.
  if (side !== 'rear') roof.rotation.y = Math.PI / 2;
  roof.position.set(centerX, 0, centerZ);

  return { hallGroup: hall.group, roof, centerX, centerZ, halfW: wingHalfW, halfD: wingHalfD, wallHeight };
}

/** A squat corbelled chimney stack, placed offset on one side of the
 * ridge -- vulperia's default "small chimney offset left/right" prop. */
function buildVulperiaChimney(palette: VulperiaPalette, seed: number, height = 0.75): THREE.Group {
  return buildCorbelledChimneyStack({
    width: 0.42,
    depth: 0.42,
    height,
    courseCount: 4,
    material: palette.stone,
    collarMaterial: palette.bronze,
    capMaterial: palette.darkTimber,
    seed,
  });
}

/** A single lantern-pole prop (the "no chimney but lantern pole" axis
 * option, and inn/chapel/watchtower's various lantern-post props). */
function buildVulperiaLanternMast(palette: VulperiaPalette, height = 0.9): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-lantern-mast';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, height, 8), palette.timber);
  pole.name = 'mast-pole';
  pole.position.y = height / 2;
  pole.castShadow = pole.receiveShadow = true;
  group.add(pole);
  const cage = buildLanternCage({ material: palette.bronze, paneMaterial: palette.glazing, lit: true });
  cage.position.y = height + 0.05;
  group.add(cage);
  return group;
}

/** A fox-tail wind vane / banner finial atop a ridge -- vulperia's
 * recurring signal/ornament roof accent (house pennant, villa banner,
 * chapel wind vane, watchtower signal prop all share this shape). */
function buildFoxTailVane(palette: VulperiaPalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-foxtail-vane';
  const poleHeight = 0.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, poleHeight, 6), palette.bronze);
  pole.name = 'vane-pole';
  pole.position.y = poleHeight / 2;
  pole.castShadow = pole.receiveShadow = true;
  group.add(pole);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 7), palette.greenAccent);
  tail.name = 'vane-tail';
  tail.rotation.z = Math.PI / 2;
  tail.position.set(0.22, poleHeight * 0.92, 0);
  tail.castShadow = tail.receiveShadow = true;
  group.add(tail);
  void seed;
  return group;
}

/** A standalone raised porch volume in front of a door: two proud posts
 * (`+0.30` per the depth ladder), a header beam, and a tiny pent turf-
 * capped roof. Built as an independent structure rather than by punching
 * `TurfRoof`'s `porchCuts` into the main roof mesh -- this sidesteps a
 * real coordinate-mapping subtlety in `TurfRoof.ts` (its 'front'/'back'
 * slope names map to the LEFT/RIGHT walls, not the front/rear gable
 * ends -- see that file's face-aliasing doc comment) and guarantees the
 * porch always lands exactly where the door is, on every kind, with zero
 * risk of a silently-misplaced roof notch. Still delivers the doctrine's
 * "porch posts read as buttresses, cut through low eaves" language via a
 * real proud volume with its own turf-topped lid. */
function buildVulperiaPorch(width: number, postHeight: number, palette: VulperiaPalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-porch';
  const postDepth = depthFor('BUTTRESS');
  const postSize = 0.1;
  const halfW = width / 2;

  for (const sign of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, postHeight, postSize), palette.timber);
    post.name = `porch-post-${sign > 0 ? 'r' : 'l'}`;
    post.position.set(sign * (halfW - postSize * 0.5), postHeight / 2, postDepth * 0.5);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, postDepth), palette.darkTimber);
  header.name = 'porch-header';
  header.position.set(0, postHeight, postDepth * 0.5);
  header.castShadow = header.receiveShadow = true;
  group.add(header);

  const roofDepth = postDepth + 0.25;
  const lidBase = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.06, roofDepth), palette.turfDeck);
  lidBase.name = 'porch-roof-deck';
  lidBase.position.set(0, postHeight + 0.08, roofDepth * 0.5 - 0.05);
  lidBase.rotation.x = -0.12;
  lidBase.castShadow = lidBase.receiveShadow = true;
  group.add(lidBase);
  const lidTurf = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.1, roofDepth * 0.82), palette.turfGrass);
  lidTurf.name = 'porch-roof-turf';
  lidTurf.position.set(0, postHeight + 0.15, roofDepth * 0.46 - 0.05);
  lidTurf.rotation.x = -0.12;
  lidTurf.castShadow = lidTurf.receiveShadow = true;
  group.add(lidTurf);

  void seed;
  return group;
}

/** A cloth-canopy awning on two raked timber posts, jutting out from a
 * wall over an opening below -- the Night Market stall's canopy language
 * (design spec: "Night Market... awnings"), deliberately distinct in
 * material/thickness/silhouette from the turf-topped dwelling roofs so
 * it reads as market-stall cloth, not another sod roof plane. */
function buildVulperiaAwning(width: number, canopyDepth: number, mountHeight: number, palette: VulperiaPalette, clothMaterial: THREE.Material = palette.awning): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-awning';
  const postDepth = depthFor('BUTTRESS');
  const halfW = width / 2;
  const postHeight = mountHeight * 0.62;

  for (const sign of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, postHeight, 0.08), palette.timber);
    post.name = `awning-post-${sign > 0 ? 'r' : 'l'}`;
    post.position.set(sign * (halfW - 0.08), postHeight / 2, postDepth + canopyDepth * 0.82);
    post.rotation.x = -0.22;
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, canopyDepth), palette.darkTimber);
  frame.name = 'awning-frame';
  frame.position.set(0, mountHeight, postDepth + canopyDepth * 0.5);
  frame.rotation.x = -0.3;
  frame.castShadow = frame.receiveShadow = true;
  group.add(frame);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.03, canopyDepth * 0.92), clothMaterial);
  cloth.name = 'awning-cloth';
  cloth.position.set(0, mountHeight + 0.045, postDepth + canopyDepth * 0.48);
  cloth.rotation.x = -0.3;
  cloth.castShadow = cloth.receiveShadow = true;
  group.add(cloth);

  return group;
}

/** An open forge bay: two heavy proud stone posts (`+0.30` buttress
 * depth) and a dark timber header framing a real recessed dark interior
 * -- a genuine open working bay (no door leaf/glazing, since a forge bay
 * has neither), still delivering the doctrine's proud-surround/recess
 * depth-ladder language rather than a flat painted-on opening. */
function buildVulperiaForgeBay(width: number, height: number, palette: VulperiaPalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vulperia-blacksmith-forge-bay';
  const postDepth = depthFor('BUTTRESS');
  const halfW = width / 2;
  const postSize = 0.16;

  for (const sign of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), palette.stone);
    post.name = `forge-post-${sign > 0 ? 'r' : 'l'}`;
    post.position.set(sign * (halfW - postSize * 0.5), height / 2, postDepth * 0.6);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, postDepth), palette.darkTimber);
  header.name = 'forge-header';
  header.position.set(0, height, postDepth * 0.6);
  header.castShadow = header.receiveShadow = true;
  group.add(header);

  const interior = new THREE.Mesh(new THREE.BoxGeometry(width - postSize * 1.6, height - 0.18, 0.12), palette.darkTimber);
  interior.name = 'forge-interior';
  interior.position.set(0, (height - 0.18) / 2, -0.05);
  interior.castShadow = interior.receiveShadow = true;
  group.add(interior);

  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// house — Fox Garden burrow cottage
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-house';

  const wallHeight = 1.55;
  const ridgeHeight = wallHeight + 1.65;

  const hall = buildVulperiaHall(halfW, halfD, wallHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 2,
    stepWidth: 0.7,
  });
  g.add(grounding);

  // Door placement: off-centre by 0.20-0.35 WU per the door-placement axis.
  const doorRand = mulberry32(tagVulperiaSeed(dna.seed, 'DOOR'));
  const doorOffset = 0.5 + (0.2 + doorRand() * 0.15) / (halfW * 2) * (doorRand() > 0.5 ? 1 : -1);
  const door = buildVulperiaDoor({ width: 0.95, height: 1.6, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'vulperia-house-door';
  placeOnFace(door, hall.faces[3]!, doorOffset);
  g.add(door);

  // Window set: 45% two round windows, 35% one round + one dormer, 20% three tiny watch windows.
  const winRand = mulberry32(tagVulperiaSeed(dna.seed, 'WIN'));
  const windowSet = pickVulperiaWeighted<'two-round' | 'round-and-dormer' | 'three-tiny'>(winRand, [
    ['two-round', 0.45],
    ['round-and-dormer', 0.35],
    ['three-tiny', 0.2],
  ]);
  const sideFaces: OctagonFace[] = [hall.faces[0]!, hall.faces[2]!, hall.faces[1]!];
  if (windowSet === 'two-round') {
    for (let i = 0; i < 2; i++) {
      const win = buildVulperiaRoundWatch({ diameter: 0.48, wallZ: wallZFor(i === 0 ? 0 : 2, halfW, halfD), palette: openingPalette });
      win.name = `vulperia-house-window-${i}`;
      win.position.y = wallHeight * 0.55;
      placeOnFace(win, sideFaces[i]!, 0.5);
      g.add(win);
    }
  } else if (windowSet === 'round-and-dormer') {
    const win = buildVulperiaRoundWatch({ diameter: 0.5, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
    win.name = 'vulperia-house-window-0';
    win.position.y = wallHeight * 0.55;
    placeOnFace(win, sideFaces[0]!, 0.5);
    g.add(win);
  } else {
    const tinyFaceIndices = [0, 2, 1];
    for (let i = 0; i < 3; i++) {
      const win = buildVulperiaRoundWatch({ diameter: 0.34, wallZ: wallZFor(tinyFaceIndices[i]!, halfW, halfD), palette: openingPalette });
      win.name = `vulperia-house-window-${i}`;
      win.position.y = wallHeight * 0.6;
      placeOnFace(win, sideFaces[i]!, 0.5);
      g.add(win);
    }
  }

  // Roof: lowGable, with an eyebrow dormer punched in when the window set
  // calls for it. TurfRoof's 'back' slope face aliases to the LEFT (-X)
  // side (hall.faces[2]) -- see TurfRoof.ts's own face-aliasing doc
  // comment -- so the matching physical wall opening below is placed on
  // that exact same face for correct wall/roof alignment.
  const roofRand = mulberry32(tagVulperiaSeed(dna.seed, 'ROOF'));
  const asymmetric = roofRand() < 0.15;
  const dormers: TurfRoofDormerSpec[] = [];
  if (windowSet === 'round-and-dormer') {
    dormers.push({ id: 'house-dormer', face: 'back', offset: 0, width: 0.6, height: 0.5 });
  }
  const roof = buildTurfRoof({
    archetype: 'lowGable',
    halfWidth: halfW,
    halfDepth: halfD,
    eaveHeight: wallHeight,
    ridgeHeight: asymmetric ? ridgeHeight + 0.2 : ridgeHeight,
    turfThickness: 0.28,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.55,
    dormers,
  });
  // NOTE: eaveHeight/ridgeHeight above are already absolute Y offsets
  // within the roof group's own local space (TurfRoof.ts's computeSlope
  // sets eavePoint.y = eaveHeight directly), so the roof group itself
  // stays at the hall's own Y=0 origin -- no extra wallHeight offset.
  g.add(roof);

  if (windowSet === 'round-and-dormer') {
    const dormerWin = buildVulperiaEyebrowDormerWindow({ width: 0.42, height: 0.4, wallZ: wallZFor(2, halfW, halfD), palette: openingPalette });
    dormerWin.name = 'vulperia-house-window-1';
    dormerWin.position.y = wallHeight - 0.05;
    placeOnFace(dormerWin, hall.faces[2]!, 0.5);
    g.add(dormerWin);
  }

  // Chimney axis: 55% single squat chimney, 25% no chimney but lantern pole, 20% paired vents.
  const chimneyRand = mulberry32(tagVulperiaSeed(dna.seed, 'CHIM'));
  const chimneyKind = pickVulperiaWeighted<'chimney' | 'lantern' | 'vents'>(chimneyRand, [
    ['chimney', 0.55],
    ['lantern', 0.25],
    ['vents', 0.2],
  ]);
  const chimneySideSign = chimneyRand() > 0.5 ? 1 : -1;
  if (chimneyKind === 'chimney') {
    const chimney = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, 'CHIM'), 0.7);
    chimney.name = 'vulperia-house-chimney';
    chimney.position.set(chimneySideSign * halfW * 0.45, wallHeight + ridgeHeight * 0.55, 0);
    g.add(chimney);
  } else if (chimneyKind === 'lantern') {
    const lantern = buildVulperiaLanternMast(palette, 0.6);
    lantern.name = 'vulperia-house-lantern-mast';
    lantern.position.set(chimneySideSign * halfW * 0.55, wallHeight + ridgeHeight * 0.35, 0);
    g.add(lantern);
  } else {
    for (let i = 0; i < 2; i++) {
      const vent = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, `VENT${i}`), 0.42);
      vent.name = `vulperia-house-vent-${i}`;
      vent.position.set((i === 0 ? 1 : -1) * halfW * 0.45, wallHeight + ridgeHeight * 0.4, 0);
      g.add(vent);
    }
  }

  const dressing = buildVulperiaLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// terraced — Poor Burrows row segment
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_EAVE_HEIGHT = 2.25;
const TERRACED_RIDGE_HEIGHT = 3.85;

export function buildVulperiaTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-terraced';

  const hall = buildVulperiaHall(halfW, halfD, TERRACED_EAVE_HEIGHT, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 2,
    stepWidth: 0.6,
  });
  g.add(grounding);

  // Party sides: 45% both, 25% left, 25% right, 5% none.
  const partySides: 'both' | 'left' | 'right' | 'none' =
    dna.terrace === 'both' || dna.terrace === 'left' || dna.terrace === 'right'
      ? dna.terrace
      : pickVulperiaWeighted(mulberry32(tagVulperiaSeed(dna.seed, 'PARTY')), [
          ['both', 0.45], ['left', 0.25], ['right', 0.25], ['none', 0.05],
        ] as Array<['both' | 'left' | 'right' | 'none', number]>);
  const hasLeftParty = partySides === 'both' || partySides === 'left';
  const hasRightParty = partySides === 'both' || partySides === 'right';

  // Entry read: 50% raised porch cut, 35% recessed burrow door, 15% side-offset stair.
  const entryRand = mulberry32(tagVulperiaSeed(dna.seed, 'ENTRY'));
  const entryRead = pickVulperiaWeighted<'porch' | 'recessed' | 'side-stair'>(entryRand, [
    ['porch', 0.5], ['recessed', 0.35], ['side-stair', 0.15],
  ]);
  const door = buildVulperiaDoor({ width: 0.8, height: 1.55, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'vulperia-terraced-door';
  placeOnFace(door, hall.faces[3]!, entryRead === 'side-stair' ? 0.72 : 0.5);
  g.add(door);

  // Upper opening: 55% eyebrow dormer, 30% gable porthole, 15% shuttered slit.
  const upperRand = mulberry32(tagVulperiaSeed(dna.seed, 'UPPER'));
  const upperKind = pickVulperiaWeighted<'eyebrow' | 'porthole' | 'slit'>(upperRand, [
    ['eyebrow', 0.55], ['porthole', 0.3], ['slit', 0.15],
  ]);
  let upper: THREE.Group;
  if (upperKind === 'porthole') {
    upper = buildVulperiaRoundWatch({ diameter: 0.45, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  } else if (upperKind === 'slit') {
    upper = buildVulperiaGableSlit({ width: 0.28, height: 0.7, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  } else {
    upper = buildVulperiaEyebrowDormerWindow({ width: 0.45, height: 0.4, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  }
  upper.name = 'vulperia-terraced-upper';
  upper.position.y = TERRACED_EAVE_HEIGHT * 0.82;
  placeOnFace(upper, hall.faces[3]!, 0.5);
  g.add(upper);

  // Rear escape door/slit.
  const rearDoor = buildVulperiaGableSlit({ width: 0.3, height: 0.75, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  rearDoor.name = 'vulperia-terraced-rear-exit';
  rearDoor.position.y = 0.4;
  placeOnFace(rearDoor, hall.faces[1]!, 0.5);
  g.add(rearDoor);

  // Side windows only on non-party sides.
  if (!hasLeftParty) {
    const win = buildVulperiaRoundWatch({ diameter: 0.4, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
    win.name = 'vulperia-terraced-side-window-left';
    win.position.y = TERRACED_EAVE_HEIGHT * 0.55;
    placeOnFace(win, hall.faces[0]!, 0.5);
    g.add(win);
  }
  if (!hasRightParty) {
    const win = buildVulperiaRoundWatch({ diameter: 0.4, wallZ: wallZFor(2, halfW, halfD), palette: openingPalette });
    win.name = 'vulperia-terraced-side-window-right';
    win.position.y = TERRACED_EAVE_HEIGHT * 0.55;
    placeOnFace(win, hall.faces[2]!, 0.5);
    g.add(win);
  }

  // Roof: continuous rowGable.
  const roof = buildTurfRoof({
    archetype: 'rowGable',
    halfWidth: halfW,
    halfDepth: halfD,
    eaveHeight: TERRACED_EAVE_HEIGHT,
    ridgeHeight: TERRACED_RIDGE_HEIGHT,
    turfThickness: 0.3,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.35,
  });
  roof.position.y = 0;
  g.add(roof);

  if (entryRead === 'porch') {
    const porch = buildVulperiaPorch(1.1, 1.7, palette, dna.seed);
    porch.position.set(0, 0, wallZFor(3, halfW, halfD));
    placeOnFace(porch, hall.faces[3]!, 0.5);
    g.add(porch);
  }

  const dressing = buildVulperiaLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 3, entranceHalfWidth: 0.5 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// villa — Fox Den / elder burrow hall
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const mainHalfW = fp.w / 2;
  const mainHalfD = fp.d / 2;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-villa';

  // Floor read: merchant villa (2 floors) vs patriciate Fox Den (3 floors,
  // top floor mostly dormer/loft).
  const floorRand = mulberry32(tagVulperiaSeed(dna.seed, 'FLOOR'));
  const threeFloors = floorRand() < 0.4;
  const eaveHeight = threeFloors ? 4.6 : 3.9;
  const ridgeHeight = threeFloors ? 6.2 : 5.7;

  const hall = buildVulperiaHall(mainHalfW, mainHalfD, eaveHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  hall.group.name = 'vulperia-villa-main-hall';
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 3,
    stepWidth: 1.1,
    bermMargin: 0.4,
  });
  g.add(grounding);

  const roof = buildTurfRoof({
    archetype: 'longHall',
    halfWidth: mainHalfW,
    halfDepth: mainHalfD,
    eaveHeight,
    ridgeHeight,
    turfThickness: 0.32,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.5,
  });
  roof.position.y = 0;
  g.add(roof);

  // Massing axis: 45% side lobe right, 35% left, 20% rear lobe.
  const massingRand = mulberry32(tagVulperiaSeed(dna.seed, 'MASS'));
  const lobeSide = pickVulperiaWeighted<'left' | 'right' | 'rear'>(massingRand, [
    ['right', 0.45], ['left', 0.35], ['rear', 0.2],
  ]);
  const wingHalfW = 0.9;
  const wingHalfD = 1.1;
  const wing = buildVulperiaWing(lobeSide, mainHalfW, mainHalfD, wingHalfW, wingHalfD, eaveHeight * 0.82, ridgeHeight * 0.82, dna.seed, palette);
  wing.hallGroup.name = 'vulperia-villa-wing-hall';
  g.add(wing.hallGroup);
  g.add(wing.roof);
  const wingGrounding = buildVulperiaGrounding({
    points: rectanglePoints(wing.halfW, wing.halfD).map(([x, z]) => [x + wing.centerX, z + wing.centerZ] as [number, number]),
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed + 7,
    bermMargin: 0.35,
  });
  g.add(wingGrounding);

  // Dominant porch_cut_door.
  const door = buildVulperiaDoor({ width: 1.05, height: 1.75, wallZ: wallZFor(3, mainHalfW, mainHalfD), palette: openingPalette });
  door.name = 'vulperia-villa-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);
  const porch = buildVulperiaPorch(1.5, eaveHeight * 0.68, palette, dna.seed);
  porch.position.set(0, 0, wallZFor(3, mainHalfW, mainHalfD));
  placeOnFace(porch, hall.faces[3]!, 0.5);
  g.add(porch);

  // 4-6 round_watch windows across front/side gables.
  const windowCount = 4 + Math.floor(mulberry32(tagVulperiaSeed(dna.seed, 'WINCOUNT'))() * 3);
  const winFaceCycle: OctagonFace[] = [hall.faces[0]!, hall.faces[2]!, hall.faces[3]!, hall.faces[1]!];
  for (let i = 0; i < windowCount; i++) {
    const faceIdxCycle = [0, 2, 3, 1];
    const face = winFaceCycle[i % winFaceCycle.length]!;
    const t = 0.28 + (Math.floor(i / winFaceCycle.length) * 0.44);
    const win = buildVulperiaRoundWatch({ diameter: 0.5, wallZ: wallZFor(faceIdxCycle[i % 4]!, mainHalfW, mainHalfD), palette: openingPalette });
    win.name = `vulperia-villa-window-${i}`;
    win.position.y = eaveHeight * 0.4;
    placeOnFace(win, face, t);
    g.add(win);
  }

  // 2-3 eyebrow_dormer windows for upper floors, on the rear gable wall.
  const dormerCount = threeFloors ? 3 : 2;
  for (let i = 0; i < dormerCount; i++) {
    const t = (i + 1) / (dormerCount + 1);
    const dormerWin = buildVulperiaEyebrowDormerWindow({ width: 0.42, height: 0.4, wallZ: wallZFor(1, mainHalfW, mainHalfD), palette: openingPalette });
    dormerWin.name = `vulperia-villa-dormer-${i}`;
    dormerWin.position.y = eaveHeight * 0.85;
    placeOnFace(dormerWin, hall.faces[1]!, t);
    g.add(dormerWin);
  }

  // Hidden rear service door.
  const serviceDoor = buildVulperiaDoor({ width: 0.65, height: 1.3, wallZ: wallZFor(1, mainHalfW, mainHalfD), palette: openingPalette });
  serviceDoor.name = 'vulperia-villa-service-door';
  placeOnFace(serviceDoor, hall.faces[1]!, 0.2);
  g.add(serviceDoor);

  // Chimney/vent axis.
  const chimneyRand = mulberry32(tagVulperiaSeed(dna.seed, 'CHIM'));
  const chimneyKind = pickVulperiaWeighted<'single' | 'chimney-vent' | 'twin' | 'lantern'>(chimneyRand, [
    ['single', 0.45], ['chimney-vent', 0.3], ['twin', 0.15], ['lantern', 0.1],
  ]);
  if (chimneyKind === 'single' || chimneyKind === 'chimney-vent') {
    const chimney = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, 'CHIM'), 1.0);
    chimney.name = 'vulperia-villa-chimney';
    chimney.position.set(mainHalfW * 0.4, eaveHeight + ridgeHeight * 0.5, 0);
    g.add(chimney);
    if (chimneyKind === 'chimney-vent') {
      const vent = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, 'VENT'), 0.55);
      vent.name = 'vulperia-villa-vent';
      vent.position.set(-mainHalfW * 0.3, eaveHeight + ridgeHeight * 0.4, mainHalfD * 0.3);
      g.add(vent);
    }
  } else if (chimneyKind === 'twin') {
    for (let i = 0; i < 2; i++) {
      const chimney = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, `CHIM${i}`), 0.9);
      chimney.name = `vulperia-villa-chimney-${i}`;
      chimney.position.set((i === 0 ? 1 : -1) * mainHalfW * 0.42, eaveHeight + ridgeHeight * 0.5, 0);
      g.add(chimney);
    }
  } else {
    const lantern = buildVulperiaLanternMast(palette, 0.85);
    lantern.name = 'vulperia-villa-lantern-mast';
    lantern.position.set(0, eaveHeight + ridgeHeight * 0.55, 0);
    g.add(lantern);
  }

  // Roof-ridge banner (civic prop).
  const vane = buildFoxTailVane(palette, dna.seed);
  vane.name = 'vulperia-villa-banner';
  vane.position.set(0, eaveHeight + ridgeHeight * 0.62, mainHalfD * 0.6);
  g.add(vane);

  const dressing = buildVulperiaLotDressing({ halfW: mainHalfW + 0.3, halfD: mainHalfD + 0.3, palette, seed: dna.seed, propCount: 6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// inn — Wanderer's Den
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size);
  const mainHalfW = fp.w / 2;
  const mainHalfD = fp.d / 2;
  const eaveHeight = 2.4;
  const ridgeHeight = 4.65;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-inn';

  const hall = buildVulperiaHall(mainHalfW, mainHalfD, eaveHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 3,
    stepWidth: 1.3,
    bermMargin: 0.4,
  });
  g.add(grounding);

  const roof = buildTurfRoof({
    archetype: 'longHall',
    halfWidth: mainHalfW,
    halfDepth: mainHalfD,
    eaveHeight,
    ridgeHeight,
    turfThickness: 0.32,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.6,
  });
  g.add(roof);

  // Kitchen/stable wing: 40% rear, 30% left, 30% right.
  const wingRand = mulberry32(tagVulperiaSeed(dna.seed, 'WING'));
  const wingSide = pickVulperiaWeighted<'left' | 'right' | 'rear'>(wingRand, [
    ['rear', 0.4], ['left', 0.3], ['right', 0.3],
  ]);
  const wingHalfW = 1.25;
  const wingHalfD = 1.35;
  const wing = buildVulperiaWing(wingSide, mainHalfW, mainHalfD, wingHalfW, wingHalfD, eaveHeight * 0.78, ridgeHeight * 0.75, dna.seed, palette);
  wing.hallGroup.name = 'vulperia-inn-wing-hall';
  g.add(wing.hallGroup);
  g.add(wing.roof);
  const wingGrounding = buildVulperiaGrounding({
    points: rectanglePoints(wing.halfW, wing.halfD).map(([x, z]) => [x + wing.centerX, z + wing.centerZ] as [number, number]),
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed + 11,
    bermMargin: 0.32,
  });
  g.add(wingGrounding);

  // Wide porch_cut_door at front.
  const door = buildVulperiaDoor({ width: 1.2, height: 1.85, wallZ: wallZFor(3, mainHalfW, mainHalfD), palette: openingPalette });
  door.name = 'vulperia-inn-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);
  const porch = buildVulperiaPorch(1.7, eaveHeight * 0.72, palette, dna.seed);
  porch.position.set(0, 0, wallZFor(3, mainHalfW, mainHalfD));
  placeOnFace(porch, hall.faces[3]!, 0.5);
  g.add(porch);

  // Ground-floor round_watch windows (front + sides).
  const winFaces: OctagonFace[] = [hall.faces[3]!, hall.faces[0]!, hall.faces[2]!, hall.faces[3]!];
  const winT = [0.2, 0.5, 0.5, 0.8];
  for (let i = 0; i < 4; i++) {
    const win = buildVulperiaRoundWatch({ diameter: 0.46, wallZ: wallZFor(i === 1 ? 0 : i === 2 ? 2 : 3, mainHalfW, mainHalfD), palette: openingPalette });
    win.name = `vulperia-inn-window-${i}`;
    win.position.y = eaveHeight * 0.42;
    placeOnFace(win, winFaces[i]!, winT[i]!);
    g.add(win);
  }

  // Loft-room dormers on the rear wall.
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const dormerWin = buildVulperiaEyebrowDormerWindow({ width: 0.42, height: 0.4, wallZ: wallZFor(1, mainHalfW, mainHalfD), palette: openingPalette });
    dormerWin.name = `vulperia-inn-dormer-${i}`;
    dormerWin.position.y = eaveHeight * 0.85;
    placeOnFace(dormerWin, hall.faces[1]!, t);
    g.add(dormerWin);
  }

  // Kitchen chimney near the wing.
  const chimney = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, 'CHIM'), 1.05);
  chimney.name = 'vulperia-inn-chimney';
  chimney.position.set(wing.centerX * 0.6 || mainHalfW * 0.4, eaveHeight + ridgeHeight * 0.5, wing.centerZ * 0.6);
  g.add(chimney);

  // Hanging sign or lantern string.
  const signRand = mulberry32(tagVulperiaSeed(dna.seed, 'SIGN'));
  if (signRand() < 0.5) {
    const signGroup = new THREE.Group();
    signGroup.name = 'vulperia-inn-sign';
    const bracket = buildGallowsBracket({ reach: 0.5, postHeight: 0.5, material: palette.darkTimber, paneMaterial: palette.glazing, lit: true });
    signGroup.add(bracket);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.03), palette.greenAccent);
    board.name = 'sign-board';
    board.position.set(0.5, 0.15, 0);
    board.castShadow = board.receiveShadow = true;
    signGroup.add(board);
    signGroup.position.set(0, eaveHeight * 0.75, wallZFor(3, mainHalfW, mainHalfD));
    placeOnFace(signGroup, hall.faces[3]!, 0.22);
    g.add(signGroup);
  } else {
    const stringGroup = new THREE.Group();
    stringGroup.name = 'vulperia-inn-lantern-string';
    for (let i = 0; i < 3; i++) {
      const bracket = buildWallBracket({ material: palette.bronze, paneMaterial: palette.glazing, lit: true, reach: 0.2 });
      bracket.position.set((i - 1) * (mainHalfW * 0.6), eaveHeight * 0.8, wallZFor(3, mainHalfW, mainHalfD));
      placeOnFace(bracket, hall.faces[3]!, 0.5 + (i - 1) * 0.18);
      stringGroup.add(bracket);
    }
    g.add(stringGroup);
  }

  const dressing = buildVulperiaLotDressing({ halfW: mainHalfW + 0.5, halfD: mainHalfD + 0.5, palette, seed: dna.seed, propCount: 5 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// shop — Night Market den-mouth stall
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = 1.45;
  const ridgeHeight = 3.05;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-shop';

  const hall = buildVulperiaHall(halfW, halfD, wallHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    bermMargin: 0.28,
  });
  g.add(grounding);

  // Wide framed counter opening across most of the front (entrance) face.
  const counter = buildVulperiaWindow({ width: halfW * 1.35, height: 1.05, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, divisionStyle: 'cross' });
  counter.name = 'vulperia-shop-counter';
  counter.position.y = 0.5;
  placeOnFace(counter, hall.faces[3]!, 0.5);
  g.add(counter);

  // Side round_watch window.
  const sideWin = buildVulperiaRoundWatch({ diameter: 0.38, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
  sideWin.name = 'vulperia-shop-window';
  sideWin.position.y = wallHeight * 0.6;
  placeOnFace(sideWin, hall.faces[0]!, 0.5);
  g.add(sideWin);

  // Rear escape door.
  const rearDoor = buildVulperiaDoor({ width: 0.6, height: 1.15, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  rearDoor.name = 'vulperia-shop-rear-door';
  placeOnFace(rearDoor, hall.faces[1]!, 0.5);
  g.add(rearDoor);

  const roof = buildTurfRoof({
    archetype: 'lowGable',
    halfWidth: halfW,
    halfDepth: halfD,
    eaveHeight: wallHeight,
    ridgeHeight,
    turfThickness: 0.2,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.3,
  });
  g.add(roof);

  // Awning: real board+cloth canopy over the counter opening, distinct
  // from the turf roof behind it (Night Market stall read).
  const awning = buildVulperiaAwning(halfW * 1.75, 1.0, wallHeight + 0.4, palette);
  awning.name = 'vulperia-shop-awning';
  awning.position.set(0, 0, wallZFor(3, halfW, halfD));
  placeOnFace(awning, hall.faces[3]!, 0.5);
  g.add(awning);

  const dressing = buildVulperiaLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4, entranceHalfWidth: halfW * 0.9 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// blacksmith — Tinkerer's Shop
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const wallHeight = 1.85;
  const ridgeHeight = 3.6;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-blacksmith';

  const hall = buildVulperiaHall(halfW, halfD, wallHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    bermMargin: 0.35,
  });
  g.add(grounding);

  // Open forge bay in place of a front door -- the working side of the
  // smithy, an actually-open bay rather than a door with a leaf.
  const forgeBay = buildVulperiaForgeBay(halfW * 1.1, wallHeight * 0.92, palette);
  forgeBay.position.set(0, 0, wallZFor(3, halfW, halfD));
  placeOnFace(forgeBay, hall.faces[3]!, 0.5);
  g.add(forgeBay);
  // Dark scorched-stone apron on the ground in front of the forge bay.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.3, 0.03, 0.9), palette.stone);
  apron.name = 'vulperia-blacksmith-apron';
  apron.position.set(0, -0.015, wallZFor(3, halfW, halfD) + 0.5);
  apron.receiveShadow = true;
  g.add(apron);

  // Plank service door on a side wall.
  const serviceDoor = buildVulperiaDoor({ width: 0.85, height: 1.5, wallZ: wallZFor(2, halfW, halfD), palette: openingPalette });
  serviceDoor.name = 'vulperia-blacksmith-service-door';
  placeOnFace(serviceDoor, hall.faces[2]!, 0.35);
  g.add(serviceDoor);

  // 1-2 small side/rear round_watch windows.
  const win = buildVulperiaRoundWatch({ diameter: 0.4, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  win.name = 'vulperia-blacksmith-window-0';
  win.position.y = wallHeight * 0.6;
  placeOnFace(win, hall.faces[1]!, 0.4);
  g.add(win);
  const win2 = buildVulperiaRoundWatch({ diameter: 0.36, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
  win2.name = 'vulperia-blacksmith-window-1';
  win2.position.y = wallHeight * 0.62;
  placeOnFace(win2, hall.faces[0]!, 0.6);
  g.add(win2);

  const roof = buildTurfRoof({
    archetype: 'lowGable',
    halfWidth: halfW,
    halfDepth: halfD,
    eaveHeight: wallHeight,
    ridgeHeight,
    turfThickness: 0.26,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.4,
  });
  g.add(roof);

  // Tall chimney with a stone firebreak collar (base plinth) around its foot.
  const chimney = buildVulperiaChimney(palette, tagVulperiaSeed(dna.seed, 'CHIM'), 1.5);
  chimney.name = 'vulperia-blacksmith-chimney';
  chimney.position.set(halfW * 0.5, wallHeight + ridgeHeight * 0.45, -halfD * 0.3);
  g.add(chimney);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), palette.stone);
  collar.name = 'vulperia-blacksmith-chimney-collar';
  collar.position.set(halfW * 0.5, wallHeight + ridgeHeight * 0.45 - 0.7, -halfD * 0.3);
  collar.castShadow = collar.receiveShadow = true;
  g.add(collar);

  // Shallow board lean-to canopy over the forge bay.
  const canopy = buildVulperiaAwning(halfW * 1.3, 0.8, wallHeight + 0.15, palette, palette.turfDeck);
  canopy.name = 'vulperia-blacksmith-canopy';
  canopy.position.set(0, 0, wallZFor(3, halfW, halfD));
  placeOnFace(canopy, hall.faces[3]!, 0.5);
  g.add(canopy);

  const dressing = buildVulperiaLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4, entranceHalfWidth: halfW * 0.7 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// chapel — Den Mother's Hall
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const eaveHeight = 2.1;
  const ridgeHeight = 4.6;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-chapel';

  const hall = buildVulperiaHall(halfW, halfD, eaveHeight, tagVulperiaSeed(dna.seed, 'HALL'), palette.cob);
  g.add(hall.group);

  const grounding = buildVulperiaGrounding({
    points: hall.points,
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 3,
    stepWidth: 0.9,
    bermMargin: 0.42,
  });
  g.add(grounding);

  const roof = buildTurfRoof({
    archetype: 'longHall',
    halfWidth: halfW,
    halfDepth: halfD,
    eaveHeight,
    ridgeHeight,
    turfThickness: 0.3,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.55,
  });
  g.add(roof);

  // Central raised porch door.
  const door = buildVulperiaDoor({ width: 1.05, height: 1.8, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'vulperia-chapel-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);
  const porch = buildVulperiaPorch(1.4, eaveHeight * 0.78, palette, dna.seed);
  porch.position.set(0, 0, wallZFor(3, halfW, halfD));
  placeOnFace(porch, hall.faces[3]!, 0.5);
  g.add(porch);

  // 2 eyebrow_dormer windows per long side (4 total).
  const longFaces: OctagonFace[] = [hall.faces[0]!, hall.faces[2]!];
  let windowIndex = 0;
  for (const face of longFaces) {
    for (const t of [0.3, 0.7]) {
      const dormerWin = buildVulperiaEyebrowDormerWindow({ width: 0.46, height: 0.42, wallZ: wallZFor(face === hall.faces[0] ? 0 : 2, halfW, halfD), palette: openingPalette });
      dormerWin.name = `vulperia-chapel-window-${windowIndex}`;
      dormerWin.position.y = eaveHeight * 0.68;
      placeOnFace(dormerWin, face, t);
      g.add(dormerWin);
      windowIndex++;
    }
  }

  // Rear "den-mother" oculus/marker.
  const oculus = buildVulperiaRoundWatch({ diameter: 0.6, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  oculus.name = 'vulperia-chapel-rear-oculus';
  oculus.position.y = eaveHeight * 0.75;
  placeOnFace(oculus, hall.faces[1]!, 0.5);
  g.add(oculus);

  // Fox-tail wind vane finial and a warm lantern by the door.
  const vane = buildFoxTailVane(palette, dna.seed);
  vane.name = 'vulperia-chapel-vane';
  vane.position.set(0, eaveHeight + ridgeHeight * 0.5, 0);
  g.add(vane);
  const lantern = buildWallBracket({ material: palette.bronze, paneMaterial: palette.glazing, lit: true, reach: 0.22 });
  lantern.name = 'vulperia-chapel-lantern';
  lantern.position.set(0, eaveHeight * 0.55, wallZFor(3, halfW, halfD));
  placeOnFace(lantern, hall.faces[3]!, 0.28);
  g.add(lantern);

  const dressing = buildVulperiaLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 5, entranceHalfWidth: 0.6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// watchtower — Burrow Gate lookout
// ─────────────────────────────────────────────────────────────────────────

export function buildVulperiaWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const baseHalfW = fp.w / 2;
  const baseHalfD = fp.d / 2;
  const palette = buildVulperiaPalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'vulperia-watchtower';

  const stageHeights = [2.05, 2.0, 1.9];
  const stageHalves = [baseHalfW, baseHalfW * 0.82, baseHalfW * 0.68];
  const stageHalvesD = [baseHalfD, baseHalfD * 0.82, baseHalfD * 0.68];
  let stageBaseY = 0;
  let lastHalfW = baseHalfW;
  let lastHalfD = baseHalfD;

  for (let stage = 0; stage < 3; stage++) {
    const stageHalfW = stageHalves[stage]!;
    const stageHalfD = stageHalvesD[stage]!;
    const stageHeight = stageHeights[stage]!;
    const hall = buildVulperiaHall(stageHalfW, stageHalfD, stageHeight, tagVulperiaSeed(dna.seed, `STAGE${stage}`), palette.cob);
    hall.group.position.y = stageBaseY;
    hall.group.name = `vulperia-watchtower-stage-${stage}`;
    g.add(hall.group);

    if (stage === 0) {
      // Ground door.
      const door = buildVulperiaDoor({ width: 0.75, height: 1.5, wallZ: wallZFor(3, stageHalfW, stageHalfD), palette: openingPalette });
      door.name = 'vulperia-watchtower-door';
      placeOnFace(door, hall.faces[3]!, 0.5);
      g.add(door);
    } else {
      // Gable-slit watch openings, one per wall face on stages 1 and 2.
      for (let faceIdx = 0; faceIdx < 4; faceIdx++) {
        if (stage === 2 && (faceIdx === 0 || faceIdx === 2)) continue; // top stage: front/back slits only
        const slit = buildVulperiaGableSlit({ width: 0.24, height: 0.65, wallZ: wallZFor(faceIdx, stageHalfW, stageHalfD), palette: openingPalette });
        slit.name = `vulperia-watchtower-slit-${stage}-${faceIdx}`;
        slit.position.y = stageBaseY + stageHeight * 0.55;
        placeOnFace(slit, hall.faces[faceIdx]!, 0.5);
        g.add(slit);
      }
    }

    stageBaseY += stageHeight;
    lastHalfW = stageHalfW;
    lastHalfD = stageHalfD;
  }

  const grounding = buildVulperiaGrounding({
    points: rectanglePoints(baseHalfW, baseHalfD),
    stoneMaterial: palette.stone,
    earthMaterial: palette.earth,
    grassMaterial: palette.turfGrass,
    seed: dna.seed,
    bermMargin: 0.5,
    stepsFace: rectangleFaces(baseHalfW, baseHalfD)[3],
    stepCount: 2,
    stepWidth: 0.65,
  });
  g.add(grounding);

  // Corner stone pads at the tower's legs.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.35), palette.stone);
    pad.name = `vulperia-watchtower-pad-${sx}-${sz}`;
    pad.position.set(sx * baseHalfW * 0.85, -0.04, sz * baseHalfD * 0.85);
    pad.castShadow = pad.receiveShadow = true;
    g.add(pad);
  }

  const roof = buildTurfRoof({
    archetype: 'steepCap',
    halfWidth: lastHalfW,
    halfDepth: lastHalfD,
    eaveHeight: stageBaseY,
    ridgeHeight: stageBaseY + 1.0,
    turfThickness: 0.22,
    seed: tagVulperiaSeed(dna.seed, 'ROOF'),
    palette: toTurfPalette(palette),
    eaveOverhang: 0.3,
  });
  g.add(roof);

  // Fox-tail signal banner at the apex.
  const vane = buildFoxTailVane(palette, dna.seed);
  vane.name = 'vulperia-watchtower-vane';
  vane.position.set(0, stageBaseY + 1.0, 0);
  g.add(vane);

  // Signal lantern mounted on the top stage exterior.
  const lantern = buildWallBracket({ material: palette.bronze, paneMaterial: palette.glazing, lit: true, reach: 0.2 });
  lantern.name = 'vulperia-watchtower-lantern';
  lantern.position.set(0, stageBaseY - stageHeights[2]! * 0.35, wallZFor(3, lastHalfW, lastHalfD));
  placeOnFace(lantern, rectangleFaces(lastHalfW, lastHalfD)[3]!, 0.5);
  g.add(lantern);

  const dressing = buildVulperiaLotDressing({ halfW: baseHalfW, halfD: baseHalfD, palette, seed: dna.seed, propCount: 3, entranceHalfWidth: 0.5 });
  g.add(dressing);

  return g;
}
