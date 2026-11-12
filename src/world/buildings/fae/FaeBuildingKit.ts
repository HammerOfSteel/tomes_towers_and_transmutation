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
import { buildRadialMushroomCap, type RadialMushroomCapPalette } from '../kit/RadialMushroomCap';
import { buildCurledConeShingleRoof } from '../kit/ShingleSurface';
import { buildGableRoof } from '../kit/RoofMassing';
import { buildLanternCage } from '../kit/LanternKit';
import { buildRailSection } from '../kit/Railing';
import { deformAssembly, type AssemblyDeformProfile } from '../kit/AssemblyLatticeDeform';
import { depthFor } from '../kit/DepthLadder';
import {
  buildFaePalette,
  pickFaeWeighted,
  tagFaeSeed,
  type FaePalette,
} from './FaePalette';
import {
  buildFaeWindow,
  buildFaeDoor,
  buildFaeOculusWindow,
  buildFaePetalWindow,
  type FaeOpeningPalette,
} from './FaeOpenings';
import { buildFaeGrounding } from './FaeGrounding';
import { buildFaeLotDressing } from './FaeLotDressing';

/**
 * FaeBuildingKit.ts — composes all eight canonical fae building kinds
 * (docs/superpowers/specs/2026-09-04-fae-buildings-design.md) from the
 * shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`) plus the
 * race-specific `FaePalette.ts`/`FaeOpenings.ts`/`FaeGrounding.ts`/
 * `FaeLotDressing.ts` modules and the new shared
 * `RadialMushroomCap.ts`/`AssemblyLatticeDeform.ts`/
 * `ShingleSurface.buildCurledConeShingleRoof()` modules.
 *
 * Fae's identity axis (design spec §2, distinguishing it from every other
 * race so far): TINY INHABITED FAIRY ARCHITECTURE -- stump/fungal
 * cottages with oversized, warmly-glowing petal-lancet doors/windows,
 * broad ribbed mushroom-cap or curled tile-course cone roofs, and
 * root-flare foundations that read as though the building genuinely grew
 * out of the ground. Every kind below follows the doctrine
 * (docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md): a
 * real depth ladder, the five-piece opening minimum on every door/window,
 * and organic silhouettes achieved ONLY via `deformAssembly()`'s bounded
 * post-assembly lean/curl/bulge on top of a legible kit-of-parts base --
 * never free-form sculpting.
 *
 * Massing simplification (documented, mirrors vulperia/dwarven/undead's
 * own pragmatic choices under time constraints):
 *  - villa's side turret is built as a SECOND independently-walled-and-
 *    roofed hall rigidly offset flush against the main hall (a genuine
 *    L-plan with its own real seam where the two masses meet), rather
 *    than reaching for `MassComposer.ts`'s more general wing machinery.
 *  - chapel's canopy uses the design spec's own explicitly-sanctioned
 *    "Alternative: elongated mushroom cap over nave with radial/
 *    longitudinal ribs" (§4.7), rather than a bespoke lattice-dome
 *    branch canopy, and its "8-12 stump/toadstool columns" become proud
 *    bark corner/interval pilasters along the long walls (still legible
 *    stump-column rhythm, just attached rather than free-standing).
 *  - blacksmith's "asymmetric leaf/petal shed roof" uses the shared
 *    `RoofMassing.buildGableRoof()` (a real two-slope shingle-course
 *    roof) rather than a bespoke single-pitch shed builder -- still a
 *    genuinely constructed tile roof, satisfying every doctrine
 *    requirement the blueprint cares about.
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
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

function toOpeningPalette(palette: FaePalette): FaeOpeningPalette {
  return {
    bark: palette.darkBark,
    glow: palette.glow,
    petal: palette.petal,
    door: palette.door,
  };
}

function toCapPalette(palette: FaePalette): RadialMushroomCapPalette {
  return {
    rib: palette.darkBark,
    shingle: palette.cap,
    rim: palette.capRim,
    gill: palette.gill,
    plaque: palette.petal,
  };
}

interface FaeHallResult {
  group: THREE.Group;
  faces: OctagonFace[];
  points: [number, number][];
}

/** Builds a rectangular hall's coursed bark-block walls (hidden under the
 * vertical-grain `barkTexture()` map), a ring of proud vertical bark
 * ribs (design spec §4.1: "8-12 vertical bark ribs, each 0.04-0.09 WU
 * proud, jittered"), corner root-posts (`StoneTowerQuoins`, reused as
 * fae's corner buttress read), and a flat floor cap. */
function buildFaeHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  palette: FaePalette,
  wallOpts: WallBlockOptions = {},
): FaeHallResult {
  const g = new THREE.Group();
  g.name = 'fae-hall';
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  const longestFace = 2 * Math.max(halfW, halfD);
  const walls = buildWallSurfaceBlocks(0, height, seed, palette.bark, {
    courseHeight: 0.42,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.7)),
    jitter: 0.04,
    ...wallOpts,
    facesOverride: wallOpts.facesOverride ?? faces,
  });
  g.add(walls);

  g.add(buildBarkRibs(faces, height, seed, palette.darkBark));

  const posts = buildQuoins(Math.max(halfW, halfD), height, undefined, palette.darkBark, points);
  posts.name = 'fae-hall-root-posts';
  g.add(posts);

  const floorCap = buildFloorCap(0, palette.bark, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'fae-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** A ring of proud vertical bark ribs running the full wall height --
 * design spec §4.1's "8-12 vertical bark ribs, each 0.04-0.09 WU proud,
 * jittered" detail, layered on top of the coursed structural wall. */
function buildBarkRibs(faces: OctagonFace[], height: number, seed: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-bark-ribs';
  const rand = mulberry32((seed ^ 0x5249_4253) >>> 0);
  const ribsPerFace = 3;

  for (const face of faces) {
    const [ax, az] = face.a;
    const [bx, bz] = face.b;
    const outwardX = Math.sin(face.normalAngle);
    const outwardZ = Math.cos(face.normalAngle);
    for (let i = 0; i < ribsPerFace; i++) {
      const t = (i + 0.5) / ribsPerFace;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const proud = 0.04 + rand() * 0.05;
      const width = 0.09 + rand() * 0.03;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(width, height * 0.98, proud * 2), material);
      rib.name = `bark-rib-${face.normalAngle.toFixed(2)}-${i}`;
      rib.position.set(px + outwardX * proud, height * 0.49, pz + outwardZ * proud);
      rib.rotation.y = face.normalAngle;
      rib.castShadow = rib.receiveShadow = true;
      group.add(rib);
    }
  }
  return group;
}

/** A hollow stump chimney (design spec's "curled chimney sprout" /
 * "hollow stump" chimney axis): reuses the shared corbelled chimney
 * stack with bark/bronze materials instead of dwarven's masonry
 * palette. */
function buildFaeChimney(palette: FaePalette, seed: number, height = 0.7): THREE.Group {
  return buildCorbelledChimneyStack({
    width: 0.4,
    depth: 0.4,
    height,
    courseCount: 4,
    material: palette.darkBark,
    collarMaterial: palette.bronze,
    capMaterial: palette.cap,
    seed,
  });
}

/** A lantern-topped post -- fae's recurring "lantern hook near door" /
 * lantern-post prop, reused atop rooflines and as ground dressing. */
function buildFaeLanternMast(palette: FaePalette, height = 0.85): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-lantern-mast';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, height, 8), palette.darkBark);
  pole.name = 'mast-pole';
  pole.position.y = height / 2;
  pole.castShadow = pole.receiveShadow = true;
  group.add(pole);
  const cage = buildLanternCage({ material: palette.bronze, paneMaterial: palette.glow, lit: true });
  cage.position.y = height + 0.05;
  group.add(cage);
  return group;
}

/** A small flower-bud roof finial -- fae's recurring "flower bud"
 * finial axis (chapel/villa/watchtower crown ornament). */
function buildFaeFlowerFinial(palette: FaePalette, radius = 0.1): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-flower-finial';
  const bud = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 1.6, 6), palette.petal);
  bud.name = 'finial-bud';
  bud.position.y = radius * 0.8;
  bud.castShadow = bud.receiveShadow = true;
  group.add(bud);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.35, radius * 0.9, 5), palette.petal);
    petal.name = `finial-petal-${i}`;
    petal.position.set(Math.cos(angle) * radius * 0.6, radius * 0.25, Math.sin(angle) * radius * 0.6);
    petal.rotation.x = Math.PI * 0.32;
    petal.rotation.y = -angle;
    petal.castShadow = petal.receiveShadow = true;
    group.add(petal);
  }
  return group;
}

/** A shallow proud porch nub in front of a door: two root posts, a
 * header beam, and a tiny mushroom-cap-let over the top -- design spec
 * §4.1's "off-centre porch nub (0.7 x 0.6 WU)". */
function buildFaePorch(width: number, postHeight: number, palette: FaePalette, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-porch';
  const postDepth = depthFor('BUTTRESS');
  const postSize = 0.1;
  const halfW = width / 2;

  for (const sign of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postSize * 0.45, postSize * 0.6, postHeight, 7), palette.darkBark);
    post.name = `porch-post-${sign > 0 ? 'r' : 'l'}`;
    post.position.set(sign * (halfW - postSize * 0.5), postHeight / 2, postDepth * 0.5);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, postDepth), palette.darkBark);
  header.name = 'porch-header';
  header.position.set(0, postHeight, postDepth * 0.5);
  header.castShadow = header.receiveShadow = true;
  group.add(header);

  const cap = buildRadialMushroomCap({
    radius: width * 0.62,
    rise: width * 0.32,
    ribCount: 12,
    shingleBands: 3,
    seed,
    palette: toCapPalette(palette),
  });
  cap.name = 'porch-cap';
  cap.position.set(0, postHeight + 0.05, postDepth * 0.4);
  group.add(cap);

  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// house — "Glowcap Cottage"
// ─────────────────────────────────────────────────────────────────────────

export function buildFaeHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-house';

  const wallHeight = 2.0;
  const body = new THREE.Group();
  body.name = 'fae-house-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette);
  body.add(hall.group);

  // Door: off-centre by 0.2-0.35 WU per the door-placement axis (70%
  // off-centre weighted below).
  const doorRand = mulberry32(tagFaeSeed(dna.seed, 'DOOR'));
  const centred = doorRand() > 0.7;
  const doorOffset = centred ? 0.5 : 0.5 + (0.22 + doorRand() * 0.12) / (halfW * 2) * (doorRand() > 0.5 ? 1 : -1);
  const door = buildFaeDoor({ width: 1.05, height: 1.55, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'fae-house-door';
  placeOnFace(door, hall.faces[3]!, doorOffset);
  body.add(door);

  // Window type axis: 45% petal lancet, 35% round oculus, 20% split twig square.
  const winRand = mulberry32(tagFaeSeed(dna.seed, 'WIN'));
  const windowType = pickFaeWeighted<'petal' | 'oculus' | 'split'>(winRand, [
    ['petal', 0.45], ['oculus', 0.35], ['split', 0.2],
  ]);
  const frontWin = windowType === 'oculus'
    ? buildFaeOculusWindow({ diameter: 0.62, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette })
    : buildFaePetalWindow({ width: 0.62, height: 0.85, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, divisionStyle: windowType === 'split' ? 'cross' : 'vertical' });
  frontWin.name = 'fae-house-window-0';
  frontWin.position.y = wallHeight * 0.62;
  placeOnFace(frontWin, hall.faces[3]!, centred ? 0.22 : 1 - doorOffset);
  body.add(frontWin);

  // Optional side oculus (never both sides symmetrically).
  const sideRand = mulberry32(tagFaeSeed(dna.seed, 'SIDEWIN'));
  if (sideRand() < 0.6) {
    const sideFaceIndex = sideRand() > 0.5 ? 0 : 2;
    const sideWin = buildFaeOculusWindow({ diameter: 0.42, wallZ: wallZFor(sideFaceIndex, halfW, halfD), palette: openingPalette });
    sideWin.name = 'fae-house-side-oculus';
    sideWin.position.y = wallHeight * 0.68;
    placeOnFace(sideWin, hall.faces[sideFaceIndex]!, 0.5);
    body.add(sideWin);
  }

  // Roof: 60% mushroom cap, 25% curled shingle cone, 15% petal cup (approximated as a small-rise mushroom cap).
  const roofRand = mulberry32(tagFaeSeed(dna.seed, 'ROOF'));
  const roofType = pickFaeWeighted<'mushroom' | 'cone' | 'cup'>(roofRand, [
    ['mushroom', 0.6], ['cone', 0.25], ['cup', 0.15],
  ]);
  const capRadius = Math.max(halfW, halfD) + 0.55;
  let roof: THREE.Group;
  if (roofType === 'cone') {
    roof = buildCurledConeShingleRoof(capRadius * 0.85, 1.7, tagFaeSeed(dna.seed, 'ROOF'), palette.cap, {
      curl: { x: 0.35, z: 0.15 },
    });
  } else {
    roof = buildRadialMushroomCap({
      radius: capRadius,
      rise: roofType === 'cup' ? 0.85 : 1.5,
      ribCount: 14,
      shingleBands: 4,
      plaqueCount: 3,
      seed: tagFaeSeed(dna.seed, 'ROOF'),
      palette: toCapPalette(palette),
    });
  }
  roof.position.y = wallHeight;
  body.add(roof);

  // Chimney sprout.
  if (mulberry32(tagFaeSeed(dna.seed, 'CHIM'))() < 0.7) {
    const chimney = buildFaeChimney(palette, tagFaeSeed(dna.seed, 'CHIM'), 0.6);
    chimney.name = 'fae-house-chimney';
    chimney.position.set(halfW * 0.4, wallHeight + 1.1, -halfD * 0.3);
    body.add(chimney);
  }

  // Deformation profile axis: 45% gentle lean, 30% belly bulge, 15% curled-roof-only, 10% near-straight.
  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'lean' | 'bulge' | 'roofOnly' | 'straight'>(deformRand, [
    ['lean', 0.45], ['bulge', 0.3], ['roofOnly', 0.15], ['straight', 0.1],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'lean'
    ? { leanX: (deformRand() - 0.5) * 0.28, curlX: (deformRand() - 0.5) * 0.12 }
    : deformKind === 'bulge'
      ? { bulge: 0.12 + deformRand() * 0.08 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 2,
    stepWidth: 0.7,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// terraced — "Pixie Row House"
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_WALL_HEIGHT = 3.6;

export function buildFaeTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-terraced';

  const body = new THREE.Group();
  body.name = 'fae-terraced-body';

  const hall = buildFaeHall(halfW, halfD, TERRACED_WALL_HEIGHT, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.36 });
  body.add(hall.group);

  // Ground door: narrow arched/planked door.
  const door = buildFaeDoor({ width: 0.85, height: 1.5, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'fae-terraced-door';
  placeOnFace(door, hall.faces[3]!, 0.32);
  body.add(door);

  // Upper oversized window.
  const upperWin = buildFaePetalWindow({ width: 0.9, height: 1.0, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  upperWin.name = 'fae-terraced-window';
  upperWin.position.y = TERRACED_WALL_HEIGHT * 0.62;
  placeOnFace(upperWin, hall.faces[3]!, 0.72);
  body.add(upperWin);

  // String course at floor split.
  const stringCourse = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 2 + 0.1, 0.08, halfD * 2 + 0.1),
    palette.darkBark,
  );
  stringCourse.name = 'fae-terraced-string-course';
  stringCourse.position.y = TERRACED_WALL_HEIGHT * 0.48;
  stringCourse.castShadow = stringCourse.receiveShadow = true;
  body.add(stringCourse);

  // Balcony rail on 35% of seeds.
  if (mulberry32(tagFaeSeed(dna.seed, 'BALCONY'))() < 0.35) {
    const rail = buildRailSection({ length: halfW * 1.4, height: 0.42, material: palette.bronze, finialMaterial: palette.petal, seed: dna.seed });
    rail.name = 'fae-terraced-balcony-rail';
    rail.rotation.y = Math.PI;
    rail.position.set(0, TERRACED_WALL_HEIGHT * 0.5, halfD + 0.05);
    body.add(rail);
  }

  // Roof: tall narrow curled shingle cone, curl direction varies by seed.
  const curlRand = mulberry32(tagFaeSeed(dna.seed, 'CURL'));
  const curlDir = pickFaeWeighted<'left' | 'right' | 'forward' | 'low'>(curlRand, [
    ['left', 0.35], ['right', 0.35], ['forward', 0.2], ['low', 0.1],
  ]);
  const capRadius = Math.max(halfW, halfD) + 0.3;
  const roof = curlDir === 'low'
    ? buildRadialMushroomCap({ radius: capRadius, rise: 1.1, ribCount: 12, shingleBands: 3, seed: tagFaeSeed(dna.seed, 'ROOF'), palette: toCapPalette(palette) })
    : buildCurledConeShingleRoof(capRadius, 2.3, tagFaeSeed(dna.seed, 'ROOF'), palette.cap, {
        curl: {
          x: curlDir === 'left' ? -0.5 : curlDir === 'right' ? 0.5 : 0.1,
          z: curlDir === 'forward' ? 0.55 : 0.1,
        },
      });
  roof.position.y = TERRACED_WALL_HEIGHT;
  body.add(roof);

  const deformAxis = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'lean' | 'pinch' | 'roofOnly' | 'straight'>(deformAxis, [
    ['lean', 0.5], ['pinch', 0.25], ['roofOnly', 0.15], ['straight', 0.1],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'lean'
    ? { leanX: (deformAxis() - 0.5) * 0.2 }
    : deformKind === 'pinch'
      ? { bulge: -0.06 - deformAxis() * 0.04 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 1,
    stepWidth: 0.6,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 3 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// villa — "Fae Court House"
// ─────────────────────────────────────────────────────────────────────────

interface FaeWingResult {
  hallGroup: THREE.Group;
  roof: THREE.Group;
  centerX: number;
  centerZ: number;
}

function buildFaeTurretWing(
  mainHalfW: number,
  wingHalfW: number,
  wingHalfD: number,
  wallHeight: number,
  seed: number,
  palette: FaePalette,
): FaeWingResult {
  const centerX = mainHalfW + wingHalfW;
  const hall = buildFaeHall(wingHalfW, wingHalfD, wallHeight, tagFaeSeed(seed, 'TURRET'), palette, { courseHeight: 0.36 });
  hall.group.position.set(centerX, 0, 0);

  const roof = buildCurledConeShingleRoof(Math.max(wingHalfW, wingHalfD) + 0.3, 2.0, tagFaeSeed(seed, 'TURRETROOF'), palette.cap, {
    curl: { x: 0.3, z: 0.2 },
  });
  roof.position.set(centerX, wallHeight, 0);

  return { hallGroup: hall.group, roof, centerX, centerZ: 0 };
}

export function buildFaeVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-villa';

  const wallHeight = 2.55 * 2 * 0.72; // two storeys, compressed to a single readable wall body
  const body = new THREE.Group();
  body.name = 'fae-villa-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.4 });
  body.add(hall.group);

  // Grand front door.
  const door = buildFaeDoor({ width: 1.25, height: 1.85, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'fae-villa-door';
  placeOnFace(door, hall.faces[3]!, 0.28);
  body.add(door);

  // Ground floor windows (2-3, at least one different type).
  const groundWin0 = buildFaePetalWindow({ width: 0.7, height: 0.95, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  groundWin0.name = 'fae-villa-window-0';
  groundWin0.position.y = wallHeight * 0.28;
  placeOnFace(groundWin0, hall.faces[3]!, 0.68);
  body.add(groundWin0);

  const groundWin1 = buildFaeOculusWindow({ diameter: 0.55, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
  groundWin1.name = 'fae-villa-window-1';
  groundWin1.position.y = wallHeight * 0.3;
  placeOnFace(groundWin1, hall.faces[0]!, 0.35);
  body.add(groundWin1);

  // Upper windows (2-4 smaller glowing windows).
  for (let i = 0; i < 3; i++) {
    const upperWin = buildFaeWindow({ width: 0.5, height: 0.75, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
    upperWin.name = `fae-villa-upper-window-${i}`;
    upperWin.position.y = wallHeight * 0.72;
    placeOnFace(upperWin, hall.faces[3]!, 0.18 + i * 0.28);
    body.add(upperWin);
  }

  // Balcony over the door.
  const rail = buildRailSection({ length: halfW * 0.9, height: 0.4, material: palette.bronze, finialMaterial: palette.petal, seed: dna.seed });
  rail.name = 'fae-villa-balcony-rail';
  rail.position.set(0, wallHeight * 0.5, halfD + 0.06);
  body.add(rail);

  // Main mushroom-cap roof.
  const capRadius = Math.max(halfW, halfD) * 0.72 + 0.5;
  const mainRoof = buildRadialMushroomCap({
    radius: capRadius,
    radiusZ: capRadius * (halfD / halfW),
    rise: 2.0,
    ribCount: 16,
    shingleBands: 5,
    plaqueCount: 4,
    seed: tagFaeSeed(dna.seed, 'ROOF'),
    palette: toCapPalette(palette),
  });
  mainRoof.position.y = wallHeight;
  body.add(mainRoof);

  const finial = buildFaeFlowerFinial(palette, 0.16);
  finial.position.y = wallHeight + 2.15;
  body.add(finial);

  // Side turret wing (45% main hall + side turret plan composition).
  const wingHalfW = Math.min(1.1, halfW * 0.35);
  const wingHalfD = halfD * 0.85;
  const turret = buildFaeTurretWing(halfW, wingHalfW, wingHalfD, wallHeight * 0.82, tagFaeSeed(dna.seed, 'WING'), palette);
  body.add(turret.hallGroup);
  body.add(turret.roof);

  const turretDoor = buildFaeOculusWindow({ diameter: 0.5, wallZ: wallZFor(3, wingHalfW, wingHalfD), palette: openingPalette });
  turretDoor.name = 'fae-villa-turret-window';
  turretDoor.position.set(turret.centerX, wallHeight * 0.4, 0);
  placeOnFace(turretDoor, rectangleFaces(wingHalfW, wingHalfD)[3]!, 0.5);
  turretDoor.position.x += turret.centerX;
  body.add(turretDoor);

  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'lean' | 'bulge' | 'sweep' | 'straight'>(deformRand, [
    ['lean', 0.35], ['bulge', 0.3], ['sweep', 0.2], ['straight', 0.15],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'lean'
    ? { leanX: (deformRand() - 0.5) * 0.18 }
    : deformKind === 'bulge'
      ? { bulge: 0.08 + deformRand() * 0.06 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    rootMargin: 0.5,
    stepsFace: hall.faces[3],
    stepCount: 3,
    stepWidth: 1.0,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// inn — "Firefly Inn"
// ─────────────────────────────────────────────────────────────────────────

export function buildFaeInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size) ?? { w: 7, d: 5 };
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-inn';

  const wallHeight = 3.4;
  const body = new THREE.Group();
  body.name = 'fae-inn-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.4 });
  body.add(hall.group);

  // Double fairy door -- two leaves side-by-side.
  for (const sign of [-1, 1] as const) {
    const leaf = buildFaeDoor({ width: 0.72, height: 1.7, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
    leaf.name = `fae-inn-door-${sign > 0 ? 'r' : 'l'}`;
    placeOnFace(leaf, hall.faces[3]!, 0.5 + sign * 0.11);
    body.add(leaf);
  }

  // Ground windows flanking porch.
  for (const sign of [-1, 1] as const) {
    const win = buildFaePetalWindow({ width: 0.68, height: 0.95, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
    win.name = `fae-inn-ground-window-${sign > 0 ? 'r' : 'l'}`;
    win.position.y = wallHeight * 0.24;
    placeOnFace(win, hall.faces[3]!, 0.5 + sign * 0.3);
    body.add(win);
  }

  // Upper windows (3-4 small).
  for (let i = 0; i < 4; i++) {
    const win = buildFaeWindow({ width: 0.42, height: 0.62, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
    win.name = `fae-inn-upper-window-${i}`;
    win.position.y = wallHeight * 0.72;
    placeOnFace(win, hall.faces[3]!, 0.12 + i * 0.25);
    body.add(win);
  }

  // Service oculus on one side.
  const serviceWin = buildFaeOculusWindow({ diameter: 0.4, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
  serviceWin.name = 'fae-inn-service-oculus';
  serviceWin.position.y = wallHeight * 0.3;
  placeOnFace(serviceWin, hall.faces[0]!, 0.7);
  body.add(serviceWin);

  // Porch over the double door.
  const porch = buildFaePorch(1.6, 1.2, palette, tagFaeSeed(dna.seed, 'PORCH'));
  porch.position.set(0, 0, halfD);
  body.add(porch);

  // Wide low mushroom cap.
  const capRadius = Math.max(halfW, halfD) + 0.75;
  const roof = buildRadialMushroomCap({
    radius: capRadius,
    rise: 1.9,
    ribCount: 16,
    shingleBands: 4,
    plaqueCount: 5,
    seed: tagFaeSeed(dna.seed, 'ROOF'),
    palette: toCapPalette(palette),
  });
  roof.position.y = wallHeight;
  body.add(roof);

  const chimney = buildFaeChimney(palette, tagFaeSeed(dna.seed, 'CHIM'), 0.85);
  chimney.name = 'fae-inn-chimney';
  chimney.position.set(-halfW * 0.5, wallHeight + 1.6, halfD * 0.2);
  body.add(chimney);

  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'belly' | 'leanPorch' | 'sweep' | 'straight'>(deformRand, [
    ['belly', 0.4], ['leanPorch', 0.25], ['sweep', 0.2], ['straight', 0.15],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'belly'
    ? { bulge: 0.1 + deformRand() * 0.06 }
    : deformKind === 'leanPorch'
      ? { leanZ: 0.06 + deformRand() * 0.05 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    rootMargin: 0.45,
    stepsFace: hall.faces[3],
    stepCount: 3,
    stepWidth: 1.4,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// shop — "Petal Market Stall"
// ─────────────────────────────────────────────────────────────────────────

export function buildFaeShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-shop';

  const wallHeight = 1.9;
  const body = new THREE.Group();
  body.name = 'fae-shop-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.36 });
  body.add(hall.group);

  // Counter/service window bay: a wide low oversized window.
  const counter = buildFaeWindow({ width: Math.min(1.7, halfW * 1.5), height: 1.0, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, divisionStyle: 'cross' });
  counter.name = 'fae-shop-counter';
  counter.position.y = wallHeight * 0.1;
  placeOnFace(counter, hall.faces[3]!, 0.42);
  body.add(counter);

  // Side door.
  const door = buildFaeDoor({ width: 0.75, height: 1.35, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  door.name = 'fae-shop-door';
  placeOnFace(door, hall.faces[1]!, 0.72);
  body.add(door);

  // Small upper oculus / sign niche.
  const oculus = buildFaeOculusWindow({ diameter: 0.36, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  oculus.name = 'fae-shop-oculus';
  oculus.position.y = wallHeight * 0.82;
  placeOnFace(oculus, hall.faces[3]!, 0.85);
  body.add(oculus);

  // Petal awning: a small-radius, wide-rim mushroom cap tuned with a
  // large shingle-band/rim ratio so it reads as an overlapping petal
  // canopy rather than a full toadstool -- design spec §4.5's "petal
  // awning: 5-9 overlapping thick petal plates with ribs".
  const roofRand = mulberry32(tagFaeSeed(dna.seed, 'ROOF'));
  const roofType = pickFaeWeighted<'petal' | 'mushroom' | 'leaf'>(roofRand, [
    ['petal', 0.5], ['mushroom', 0.3], ['leaf', 0.2],
  ]);
  const capRadius = Math.max(halfW, halfD) + 0.45;
  const roof = buildRadialMushroomCap({
    radius: capRadius,
    rise: roofType === 'mushroom' ? 1.1 : 0.55,
    ribCount: roofType === 'petal' ? 9 : 12,
    shingleBands: roofType === 'petal' ? 2 : 3,
    tileSilhouette: roofType === 'leaf' ? 'rectangular' : 'scallop',
    seed: tagFaeSeed(dna.seed, 'ROOF'),
    palette: toCapPalette(palette),
  });
  roof.position.y = wallHeight;
  body.add(roof);

  const deformRand2 = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'lean' | 'curl' | 'straight'>(deformRand2, [
    ['lean', 0.45], ['curl', 0.35], ['straight', 0.2],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'lean'
    ? { leanX: (deformRand2() - 0.5) * 0.15 }
    : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    stepsFace: hall.faces[3],
    stepCount: 1,
    stepWidth: 0.9,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// blacksmith — "Glowforge Hollow"
// ─────────────────────────────────────────────────────────────────────────

function buildFaeForgeBay(width: number, height: number, palette: FaePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fae-forge-bay';
  const postDepth = depthFor('BUTTRESS');
  const halfW = width / 2;
  const postSize = 0.16;

  for (const sign of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postSize * 0.5, postSize * 0.65, height, 7), palette.root);
    post.name = `forge-post-${sign > 0 ? 'r' : 'l'}`;
    post.position.set(sign * (halfW - postSize * 0.5), height / 2, postDepth * 0.6);
    post.castShadow = post.receiveShadow = true;
    group.add(post);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, postDepth), palette.darkBark);
  header.name = 'forge-header';
  header.position.set(0, height, postDepth * 0.6);
  header.castShadow = header.receiveShadow = true;
  group.add(header);

  const interior = new THREE.Mesh(new THREE.BoxGeometry(width - postSize * 1.6, height - 0.18, 0.12), palette.darkBark);
  interior.name = 'forge-interior';
  interior.position.set(0, (height - 0.18) / 2, -0.05);
  interior.castShadow = interior.receiveShadow = true;
  group.add(interior);

  const emberGlow = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.12, 0.05), palette.glow);
  emberGlow.name = 'forge-embers';
  emberGlow.position.set(0, 0.14, -0.02);
  emberGlow.castShadow = emberGlow.receiveShadow = true;
  group.add(emberGlow);

  return group;
}

export function buildFaeBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-blacksmith';

  const wallHeight = 2.75;
  const body = new THREE.Group();
  body.name = 'fae-blacksmith-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, {
    courseHeight: 0.42,
    facesOverride: rectangleFaces(halfW, halfD).filter((_, i) => i !== 3),
  });
  body.add(hall.group);

  // Open forge bay on the front (rear-center placement axis, front-facing here for visibility).
  const forge = buildFaeForgeBay(halfW * 1.3, wallHeight * 0.85, palette);
  forge.position.set(0, 0, halfD);
  body.add(forge);

  // Side service door.
  const door = buildFaeDoor({ width: 0.9, height: 1.45, wallZ: wallZFor(0, halfW, halfD), palette: openingPalette });
  door.name = 'fae-blacksmith-door';
  placeOnFace(door, hall.faces[0]!, 0.7);
  body.add(door);

  // Ventilation oculi.
  for (let i = 0; i < 2; i++) {
    const oculus = buildFaeOculusWindow({ diameter: 0.4, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
    oculus.name = `fae-blacksmith-oculus-${i}`;
    oculus.position.y = wallHeight * 0.65;
    placeOnFace(oculus, hall.faces[1]!, 0.3 + i * 0.4);
    body.add(oculus);
  }

  // Asymmetric leaf-shed roof: a real two-slope shingle-course gable
  // roof (RoofMassing.buildGableRoof) rather than a bespoke single-pitch
  // shed builder -- see file-level doc comment for rationale.
  const ridgeRise = Math.min(halfW, halfD) * 1.1;
  const roof = buildGableRoof(halfW, halfD, ridgeRise, tagFaeSeed(dna.seed, 'ROOF'), palette.cap, {
    eaveOverhangFrac: 0.28,
  });
  roof.position.y = wallHeight;
  body.add(roof);

  // Curled smoke-vent chimney cap.
  const vent = buildCurledConeShingleRoof(0.35, 0.8, tagFaeSeed(dna.seed, 'VENT'), palette.capRim, {
    curl: { x: 0.2, z: 0.1 },
  });
  vent.name = 'fae-blacksmith-vent';
  vent.position.set(halfW * 0.35, wallHeight + ridgeRise + 0.1, -halfD * 0.3);
  body.add(vent);

  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'sag' | 'lean' | 'straight'>(deformRand, [
    ['sag', 0.35], ['lean', 0.25], ['straight', 0.4],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'sag'
    ? { bulge: -0.05 - deformRand() * 0.04 }
    : deformKind === 'lean'
      ? { leanZ: (deformRand() - 0.5) * 0.15 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    rootMargin: 0.4,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 4 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// chapel — "Faerie Ring Chapel"
// ─────────────────────────────────────────────────────────────────────────

export function buildFaeChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-chapel';

  const wallHeight = 2.8;
  const body = new THREE.Group();
  body.name = 'fae-chapel-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.42 });
  body.add(hall.group);

  // Stump-column pilasters along the long walls -- design spec's
  // "8-12 stump/toadstool columns" (attached pilaster rhythm, see
  // file-level doc comment).
  const columnCount = pickFaeWeighted<number>(mulberry32(tagFaeSeed(dna.seed, 'COLS')), [
    [8, 0.35], [10, 0.35], [12, 0.2], [9, 0.1],
  ]);
  for (const faceIndex of [0, 2]) {
    const face = rectangleFaces(halfW, halfD)[faceIndex]!;
    const outwardX = Math.sin(face.normalAngle);
    const outwardZ = Math.cos(face.normalAngle);
    const perSide = Math.round(columnCount / 2);
    for (let i = 0; i < perSide; i++) {
      const t = (i + 0.5) / perSide;
      const [px, pz] = facePointAt(face, t);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, wallHeight, 8), palette.bark);
      column.name = `fae-chapel-column-${faceIndex}-${i}`;
      column.position.set(px + outwardX * 0.16, wallHeight / 2, pz + outwardZ * 0.16);
      column.castShadow = column.receiveShadow = true;
      body.add(column);
    }
  }

  // Ritual door in a root frame.
  const door = buildFaeDoor({ width: 1.1, height: 1.75, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'fae-chapel-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  body.add(door);

  // 4-6 lancet windows along the sides.
  const windowsPerSide = 3;
  for (const faceIndex of [0, 2]) {
    const face = hall.faces[faceIndex]!;
    for (let i = 0; i < windowsPerSide; i++) {
      const t = (i + 0.5) / windowsPerSide;
      const win = buildFaeWindow({ width: 0.55, height: 1.1, wallZ: wallZFor(faceIndex, halfW, halfD), palette: openingPalette });
      win.name = `fae-chapel-window-${faceIndex}-${i}`;
      win.position.y = wallHeight * 0.45;
      placeOnFace(win, face, t);
      body.add(win);
    }
  }

  // Rear round rose/petal oculus above the altar.
  const rose = buildFaeOculusWindow({ diameter: 0.9, wallZ: wallZFor(1, halfW, halfD), palette: openingPalette });
  rose.name = 'fae-chapel-rose-oculus';
  rose.position.y = wallHeight * 0.68;
  placeOnFace(rose, hall.faces[1]!, 0.5);
  body.add(rose);

  // Altar stone/root, off-centre at rear.
  const altar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), palette.stone);
  altar.name = 'fae-chapel-altar';
  altar.position.set(halfW * 0.15, 0.25, -halfD * 0.72);
  altar.castShadow = altar.receiveShadow = true;
  body.add(altar);
  const altarGlow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), palette.glow);
  altarGlow.name = 'fae-chapel-altar-glow';
  altarGlow.position.set(halfW * 0.15, 0.51, -halfD * 0.72);
  altarGlow.castShadow = altarGlow.receiveShadow = true;
  body.add(altarGlow);

  // Elongated mushroom-cap nave canopy (design spec §4.7's explicitly
  // sanctioned alternative to a lattice-dome branch canopy).
  const canopy = buildRadialMushroomCap({
    radius: halfW + 0.4,
    radiusZ: halfD + 0.5,
    rise: 2.2,
    ribCount: 18,
    shingleBands: 5,
    plaqueCount: 4,
    seed: tagFaeSeed(dna.seed, 'ROOF'),
    palette: toCapPalette(palette),
  });
  canopy.position.y = wallHeight;
  body.add(canopy);

  const finial = buildFaeFlowerFinial(palette, 0.18);
  finial.position.y = wallHeight + 2.55;
  body.add(finial);

  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'sway' | 'skew' | 'straight'>(deformRand, [
    ['sway', 0.35], ['skew', 0.25], ['straight', 0.4],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'sway'
    ? { curlX: (deformRand() - 0.5) * 0.1 }
    : {};
  deformAssembly(body, profile);
  g.add(body);

  // Sacred fairy-ring skirt: moss ring, stones, roots around the nave.
  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    rootMargin: 0.5,
    stepsFace: hall.faces[3],
    stepCount: 2,
    stepWidth: 1.0,
  });
  g.add(grounding);

  // Lanterns + firefly-ring read via lot dressing (denser prop count).
  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 6 });
  g.add(dressing);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// watchtower — "Moonmoth Lookout"
// ─────────────────────────────────────────────────────────────────────────

export function buildFaeWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildFaePalette(dna);
  const openingPalette = toOpeningPalette(palette);
  const g = new THREE.Group();
  g.name = 'fae-watchtower';

  const storeyHeight = 2.15;
  const storeyCount = 3;
  const wallHeight = storeyHeight * storeyCount;
  const body = new THREE.Group();
  body.name = 'fae-watchtower-body';

  const hall = buildFaeHall(halfW, halfD, wallHeight, tagFaeSeed(dna.seed, 'HALL'), palette, { courseHeight: 0.36 });
  body.add(hall.group);

  // String courses every storey.
  for (let s = 1; s < storeyCount; s++) {
    const course = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.08, 0.07, halfD * 2 + 0.08), palette.darkBark);
    course.name = `fae-watchtower-string-course-${s}`;
    course.position.y = storeyHeight * s;
    course.castShadow = course.receiveShadow = true;
    body.add(course);
  }

  // Ground door: tiny arched door.
  const door = buildFaeDoor({ width: 0.65, height: 1.25, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
  door.name = 'fae-watchtower-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  body.add(door);

  // 2-3 narrow glowing slit windows per storey, rotated around the shaft.
  const faceOrder = [3, 0, 1, 2];
  for (let s = 0; s < storeyCount; s++) {
    const faceIndex = faceOrder[s % faceOrder.length]!;
    const win = buildFaeWindow({ width: 0.28, height: 0.85, wallZ: wallZFor(faceIndex, halfW, halfD), palette: openingPalette });
    win.name = `fae-watchtower-window-${s}`;
    win.position.y = storeyHeight * (s + 0.55);
    placeOnFace(win, hall.faces[faceIndex]!, 0.5);
    body.add(win);
  }

  // Lookout balcony wrap near the top.
  const lookoutRand = mulberry32(tagFaeSeed(dna.seed, 'LOOKOUT'));
  const lookoutKind = pickFaeWeighted<'balcony' | 'nest' | 'lantern' | 'banner'>(lookoutRand, [
    ['balcony', 0.4], ['nest', 0.3], ['lantern', 0.2], ['banner', 0.1],
  ]);
  if (lookoutKind === 'balcony' || lookoutKind === 'nest') {
    for (let side = 0; side < 4; side++) {
      const face = hall.faces[side]!;
      const rail = buildRailSection({
        length: (side === 0 || side === 2 ? halfD : halfW) * 1.3,
        height: 0.36,
        material: palette.bronze,
        finialMaterial: palette.petal,
        seed: dna.seed + side,
      });
      rail.name = `fae-watchtower-rail-${side}`;
      const [midX, midZ] = facePointAt(face, 0.5);
      rail.position.set(midX + Math.sin(face.normalAngle) * 0.15, wallHeight - 0.3, midZ + Math.cos(face.normalAngle) * 0.15);
      rail.rotation.y = face.normalAngle;
      body.add(rail);
    }
  } else if (lookoutKind === 'lantern') {
    const lantern = buildFaeLanternMast(palette, 0.5);
    lantern.position.y = wallHeight;
    body.add(lantern);
  }

  // Tall curled conical roof, curl direction per axis.
  const curlRand = mulberry32(tagFaeSeed(dna.seed, 'CURL'));
  const curlDir = pickFaeWeighted<'forward' | 'left' | 'right' | 'double'>(curlRand, [
    ['forward', 0.35], ['left', 0.25], ['right', 0.25], ['double', 0.15],
  ]);
  const roof = buildCurledConeShingleRoof(Math.max(halfW, halfD) + 0.45, 2.7, tagFaeSeed(dna.seed, 'ROOF'), palette.cap, {
    curl: {
      x: curlDir === 'left' ? -0.6 : curlDir === 'right' ? 0.6 : curlDir === 'double' ? 0.35 : 0.15,
      z: curlDir === 'forward' ? 0.65 : curlDir === 'double' ? -0.3 : 0.1,
    },
  });
  roof.position.y = wallHeight;
  body.add(roof);

  const finial = buildFaeFlowerFinial(palette, 0.12);
  finial.position.y = wallHeight + 2.85;
  body.add(finial);

  const deformRand = mulberry32(tagFaeSeed(dna.seed, 'DEFORM'));
  const deformKind = pickFaeWeighted<'lean' | 'twist' | 'waist' | 'straight'>(deformRand, [
    ['lean', 0.45], ['twist', 0.25], ['waist', 0.2], ['straight', 0.1],
  ]);
  const profile: AssemblyDeformProfile = deformKind === 'lean'
    ? { leanX: (deformRand() - 0.5) * 0.3, curlX: (deformRand() - 0.5) * 0.15 }
    : deformKind === 'waist'
      ? { bulge: -0.05 - deformRand() * 0.05 }
      : {};
  deformAssembly(body, profile);
  g.add(body);

  // Strong root flare -- the narrow footprint needs visual anchoring.
  const grounding = buildFaeGrounding({
    points: hall.points,
    rootMaterial: palette.root,
    mossMaterial: palette.moss,
    stoneMaterial: palette.stone,
    seed: dna.seed,
    rootMargin: 0.6,
    stepsFace: hall.faces[3],
    stepCount: 1,
    stepWidth: 0.5,
  });
  g.add(grounding);

  const dressing = buildFaeLotDressing({ halfW, halfD, palette, seed: dna.seed, propCount: 3 });
  g.add(dressing);

  return g;
}
