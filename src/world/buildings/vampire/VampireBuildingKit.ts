/**
 * VampireBuildingKit.ts — composes all eight canonical vampire building
 * kinds (docs/superpowers/specs/2026-09-04-vampire-buildings-design.md)
 * from the shared cross-race Tier 1-3 kit (`src/world/buildings/kit/`) plus
 * the race-specific `VampireMaterials.ts`/`VampireOpenings.ts` presets and
 * the two new shared kit modules this race required (`Shutter.ts`,
 * `OrielBay.ts`).
 *
 * Every builder follows the doctrine (docs/superpowers/specs/
 * 2026-09-04-modular-building-kit-doctrine.md): a real depth ladder (no
 * coplanar surfaces), the five-piece opening minimum on every door/window,
 * and zero blob/box placeholder openings or back-geometry. Vampire's own
 * identity axis (design spec section 2): VERTICAL, ARISTOCRATIC,
 * MAINTAINED, INHABITED — Gothic-Revival/Second-Empire manor forms, steep
 * mansard/gable roofs, tall shuttered lancet windows, oriel bays, wrought
 * iron, ornate chimneys — explicitly NOT "undead but purple": every
 * building here has an intact roof, closed (never broken) windows, and no
 * missing walls.
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
import { buildGableRoof, buildHipRoof, buildMansardRoof, type RoofMassingOptions } from '../kit/RoofMassing';
import { buildPlinthCourses, buildStringCourse } from '../kit/StringCourse';
import { buildButtress } from '../kit/Buttress';
import { buildVoussoirArch } from '../kit/VoussoirArch';
import { buildRoseWindow } from '../kit/Tracery';
import { composeMainAndWing, type MassSpec } from '../kit/MassComposer';
import { makeBatteredRectangleTiers } from '../kit/SteppedBatterProfile';
import { buildCorbelledChimneyStack } from '../kit/CorbelledChimneyStack';
import { buildOrielBay } from '../kit/OrielBay';
import { buildShutter } from '../kit/Shutter';
import { buildVampirePalette, type VampirePalette } from './VampireMaterials';
import {
  buildVampireWindow,
  buildVampireShutteredWindow,
  buildVampireDoor,
  buildVampireOculus,
  type VampireOpeningPalette,
} from './VampireOpenings';

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers (mirrors DwarvenBuildingKit.ts's/OrcishBuildingKit.ts's own
// tagSeed/pickWeighted/placeOnFace/wallZFor/buildRectHall conventions).
// ─────────────────────────────────────────────────────────────────────────

/** Turns a short ASCII tag into a seed-mixing constant, giving every
 * sub-feature below its own independent, deterministic RNG stream from the
 * same building seed. */
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

function toOpeningPalette(palette: VampirePalette, wallMaterial: THREE.Material, glazing: THREE.Material): VampireOpeningPalette {
  return {
    stone: palette.stoneTrim,
    glazing,
    wood: palette.darkTimber,
    iron: palette.iron,
    recess: wallMaterial,
  };
}

/** Builds a rectangular hall's walls (per-course blocks), quoins at its 4
 * real corners, and a flat floor cap -- the shared rectangular-mass
 * technique every kind below reuses. */
function buildVampireHall(
  halfW: number,
  halfD: number,
  height: number,
  seed: number,
  material: THREE.Material,
  wallOpts: WallBlockOptions = {},
): { group: THREE.Group; faces: OctagonFace[]; points: [number, number][] } {
  const g = new THREE.Group();
  g.name = 'vampire-hall';
  const points = rectanglePoints(halfW, halfD);
  const faces = rectangleFaces(halfW, halfD);

  const longestFace = 2 * Math.max(halfW, halfD);
  const walls = buildWallSurfaceBlocks(0, height, seed, material, {
    courseHeight: 0.42,
    blocksPerFace: Math.max(3, Math.round(longestFace / 0.75)),
    jitter: 0.03,
    ...wallOpts,
    facesOverride: wallOpts.facesOverride ?? faces,
  });
  g.add(walls);

  const quoins = buildQuoins(Math.max(halfW, halfD), height, undefined, material, points);
  quoins.name = 'vampire-hall-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, material, undefined, points);
  floorCap.position.y = height;
  floorCap.name = 'vampire-hall-floor-cap';
  g.add(floorCap);

  return { group: g, faces, points };
}

/** Builds one rectangular mass's walls + quoins + floor cap from an
 * already-positioned `MassSpec` (main OR wing, both from
 * `MassComposer.composeMainAndWing()`). */
function buildMassFromSpec(mass: Pick<MassSpec, 'points' | 'faces' | 'height'>, seed: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  let longest = 0;
  const n = mass.points.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = mass.points[i]!;
    const [bx, bz] = mass.points[(i + 1) % n]!;
    longest = Math.max(longest, Math.hypot(bx - ax, bz - az));
  }
  const walls = buildWallSurfaceBlocks(0, mass.height, seed, material, {
    courseHeight: 0.42,
    blocksPerFace: Math.max(3, Math.round(longest / 0.75)),
    jitter: 0.03,
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

/** Weighted roof-family pick shared by every kind's own variation table:
 * 'gable' (steep gable, `buildGableRoof`), 'hip' (4-sided hip,
 * `buildHipRoof`), or 'mansard' (steep-then-shallow gambrel profile,
 * `buildMansardRoof` -- the new RoofMassing.ts export this race required). */
export type VampireRoofFamily = 'gable' | 'hip' | 'mansard';

function buildVampireRoof(
  family: VampireRoofFamily,
  halfW: number,
  halfD: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  opts: RoofMassingOptions = {},
): THREE.Group {
  if (family === 'hip') return buildHipRoof(halfW, halfD, ridgeHeight, seed, material, opts);
  if (family === 'mansard') return buildMansardRoof(halfW, halfD, ridgeHeight, seed, material, opts);
  return buildGableRoof(halfW, halfD, ridgeHeight, seed, material, opts);
}

/** Places an ornate corbelled chimney stack (this race's "maintained,
 * occupied" tell -- always present, capped with a small iron finial ball,
 * never a bare cylinder/box). */
function placeVampireChimney(
  halfW: number,
  halfD: number,
  baseY: number,
  placement: 'rear-left' | 'rear-right' | 'centre',
  palette: VampirePalette,
  seed: number,
  height = 1.4,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-chimney';
  const stack = buildCorbelledChimneyStack({
    width: 0.42,
    depth: 0.48,
    height,
    material: palette.blackBrick,
    collarMaterial: palette.iron,
    capMaterial: palette.stoneTrim,
    flueMaterial: palette.darkGlass,
    seed,
  });
  g.add(stack);
  const finial = buildFinial(palette.iron, 0.12);
  finial.position.y = height + 0.02;
  g.add(finial);

  const inset = 0.55;
  switch (placement) {
    case 'rear-left': g.position.set(-halfW + inset, baseY, -halfD + inset); break;
    case 'rear-right': g.position.set(halfW - inset, baseY, -halfD + inset); break;
    case 'centre': g.position.set(0, baseY, 0); break;
  }
  return g;
}

/** A small carved-bracket finial: a tapered box shaft topped by a faceted
 * cap -- never a bare CylinderGeometry cone or SphereGeometry ball standing
 * in for hand-carved ornament (doctrine anti-pattern). */
function buildFinial(material: THREE.Material, scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-finial';
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05 * scale, 0.22 * scale, 0.05 * scale), material);
  shaft.position.y = 0.11 * scale;
  shaft.castShadow = shaft.receiveShadow = true;
  g.add(shaft);
  const capLower = new THREE.Mesh(new THREE.BoxGeometry(0.09 * scale, 0.05 * scale, 0.09 * scale), material);
  capLower.position.y = 0.24 * scale;
  capLower.rotation.y = Math.PI / 4;
  capLower.castShadow = capLower.receiveShadow = true;
  g.add(capLower);
  const spike = new THREE.Mesh(new THREE.BoxGeometry(0.025 * scale, 0.14 * scale, 0.025 * scale), material);
  spike.position.y = 0.34 * scale;
  spike.castShadow = spike.receiveShadow = true;
  g.add(spike);
  return g;
}

/** Wrought-iron railing: evenly-spaced posts + a top/bottom rail band +
 * thin pickets -- used for balconies, forecourt fences, and roof cresting. */
function buildIronRailing(width: number, height: number, material: THREE.Material, postCount = 5): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-railing';
  const postSize = 0.03;
  for (let i = 0; i < postCount; i++) {
    const x = -width / 2 + (i / (postCount - 1)) * width;
    const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), material);
    post.position.set(x, height / 2, 0);
    post.castShadow = post.receiveShadow = true;
    g.add(post);
  }
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, 0.03), material);
  topRail.position.y = height - 0.02;
  topRail.castShadow = topRail.receiveShadow = true;
  g.add(topRail);
  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, 0.03), material);
  bottomRail.position.y = 0.03;
  bottomRail.castShadow = bottomRail.receiveShadow = true;
  g.add(bottomRail);
  const picketCount = postCount * 2;
  for (let i = 0; i <= picketCount; i++) {
    const x = -width / 2 + (i / picketCount) * width;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.012, height * 0.82, 0.012), material);
    picket.position.set(x, height * 0.44, 0);
    picket.castShadow = picket.receiveShadow = true;
    g.add(picket);
  }
  return g;
}

/** A gated forecourt fence: two `buildIronRailing()` runs flanking a
 * two-post gate with a small pointed arch cresting over the gap. */
function buildVampireGateAndFence(totalWidth: number, height: number, palette: VampirePalette, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-fence-and-gate';
  const gateWidth = Math.min(totalWidth * 0.3, 1.1);
  const runWidth = (totalWidth - gateWidth) / 2;

  for (const side of [-1, 1] as const) {
    const run = buildIronRailing(runWidth, height, palette.iron, 4);
    run.name = 'vampire-fence';
    run.position.x = side * (gateWidth / 2 + runWidth / 2);
    g.add(run);
  }

  const gate = new THREE.Group();
  gate.name = 'vampire-gate';
  for (const side of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, height * 1.2, 0.07), palette.iron);
    post.position.set(side * gateWidth / 2, height * 0.6, 0);
    post.castShadow = post.receiveShadow = true;
    gate.add(post);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(gateWidth * 0.5, 0.025, 6, 12, Math.PI), palette.iron);
  arch.position.y = height * 1.2;
  arch.rotation.z = Math.PI;
  arch.castShadow = arch.receiveShadow = true;
  gate.add(arch);
  const finial = buildFinial(palette.iron, 0.8);
  finial.position.y = height * 1.2 + gateWidth * 0.5;
  gate.add(finial);
  void seed;
  g.add(gate);
  return g;
}

/** A small wrought-iron lantern bracket (bracket arm + hanging cage +
 * amber glow), mounted flush on a wall face. */
function buildVampireLantern(palette: VampirePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-lantern';
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), palette.iron);
  bracket.position.z = 0.11;
  bracket.castShadow = bracket.receiveShadow = true;
  g.add(bracket);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), palette.iron);
  cage.position.set(0, -0.06, 0.2);
  cage.castShadow = cage.receiveShadow = true;
  g.add(cage);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), palette.amberGlass);
  glow.position.set(0, -0.06, 0.2);
  g.add(glow);
  return g;
}

/** A hanging trade/crest sign: wall bracket + chains + a shaped plate --
 * used by both the inn (crest sign) and the shop (trade sign). */
function buildVampireHangingSign(width: number, height: number, palette: VampirePalette, plateMaterial?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-inn-sign';
  const bracket = new THREE.Group();
  bracket.name = 'vampire-sign-bracket';
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.32), palette.iron);
  arm.position.z = 0.16;
  arm.castShadow = arm.receiveShadow = true;
  bracket.add(arm);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), palette.iron);
  brace.position.set(0, -0.11, 0.16);
  brace.rotation.x = Math.PI / 5;
  brace.castShadow = brace.receiveShadow = true;
  bracket.add(brace);
  g.add(bracket);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03), plateMaterial ?? palette.iron);
  plate.name = 'vampire-sign-plate';
  plate.position.set(0, -0.22 - height / 2, 0.3);
  plate.castShadow = plate.receiveShadow = true;
  g.add(plate);
  return g;
}

/** A cloth awning stretched on iron rods with visible brackets/fascia --
 * never a flat unsupported slab. */
function buildVampireAwning(width: number, depth: number, palette: VampirePalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-awning';
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, depth), palette.blackBrick);
  cloth.position.set(0, 0, depth / 2);
  cloth.rotation.x = -0.25;
  cloth.castShadow = cloth.receiveShadow = true;
  g.add(cloth);
  for (const side of [-1, 1] as const) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, depth * 1.05), palette.iron);
    rod.position.set(side * width * 0.42, -0.05, depth / 2);
    rod.rotation.x = -0.25;
    rod.castShadow = rod.receiveShadow = true;
    g.add(rod);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), palette.iron);
    bracket.name = 'vampire-awning-bracket';
    bracket.position.set(side * width * 0.42, -0.07, 0.02);
    bracket.rotation.x = -0.5;
    bracket.castShadow = bracket.receiveShadow = true;
    g.add(bracket);
  }
  return g;
}

/** A proud vertical iron grille (3-4 bars) mounted in front of an opening
 * -- layered over the complete five-piece opening, never replacing its
 * mullions. */
function buildVampireGrille(width: number, height: number, material: THREE.Material, barCount = 4): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-grille';
  for (let i = 0; i < barCount; i++) {
    const x = -width / 2 + ((i + 0.5) / barCount) * width;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, height, 0.02), material);
    bar.position.set(x, height / 2, 0);
    bar.castShadow = bar.receiveShadow = true;
    g.add(bar);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.025), material);
  crossbar.position.y = height * 0.5;
  crossbar.castShadow = crossbar.receiveShadow = true;
  g.add(crossbar);
  return g;
}

/** A small shuttered dormer box mounted on a mansard roof's own steep
 * lower band (uses `roof.userData.dormerAnchors`, falling back to a
 * reasonable default position when absent). */
function buildVampireDormer(palette: VampirePalette, openingPalette: VampireOpeningPalette, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-dormer';
  const halfW = 0.32;
  const height = 0.5;
  const hall = buildVampireHall(halfW, 0.22, height, seed, palette.ashlar, { blocksPerFace: 2 });
  g.add(hall.group);
  const roof = buildGableRoof(halfW, 0.22, 0.3, seed, palette.roofTile, { shingle: { silhouette: 'rectangular' } });
  roof.position.y = height;
  g.add(roof);
  const win = buildVampireShutteredWindow({
    width: 0.32,
    height: 0.4,
    wallZ: 0.22,
    palette: openingPalette,
    archRatio: 1.4,
  });
  win.position.y = height * 0.2;
  g.add(win);
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// House — shuttered gabled residence
// ─────────────────────────────────────────────────────────────────────────

const HOUSE_STOREY_HEIGHT = 3.0;

export function buildVampireHouse(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('house', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const g = new THREE.Group();
  g.name = 'vampire-house';

  const wallRand = mulberry32(tagSeed(dna.seed, 'WALL'));
  const wallFinish = pickWeighted<'limewash' | 'ashlar' | 'blackBrick'>(wallRand, [
    ['limewash', 0.45],
    ['ashlar', 0.35],
    ['blackBrick', 0.20],
  ]);
  const wallMaterial = palette[wallFinish];
  const glazingRand = mulberry32(tagSeed(dna.seed, 'GLOW'));
  const glazing = glazingRand() < 0.7 ? palette.amberGlass : palette.darkGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);

  const height = HOUSE_STOREY_HEIGHT * 2;
  const hall = buildVampireHall(halfW, halfD, height, tagSeed(dna.seed, 'HALL'), wallMaterial);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 1, { height: 0.2 });
  g.add(plinth);

  // Off-centre planked pointed door.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const door = buildVampireDoor({
    width: 0.78,
    height: 1.9,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 1.45 + doorRand() * 0.2,
  });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.32);
  g.add(door);

  // Upper front lancet: shuttered, per spec's own state weights.
  const shutterRand = mulberry32(tagSeed(dna.seed, 'SHUT'));
  const shutterState = pickWeighted<'closed_louvred' | 'one_ajar' | 'boarded_in_place'>(shutterRand, [
    ['closed_louvred', 0.45],
    ['one_ajar', 0.25],
    ['boarded_in_place', 0.30],
  ]);
  const upperWin = buildVampireShutteredWindow({
    width: 0.65,
    height: 1.25,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    shutterState,
  });
  upperWin.position.y = HOUSE_STOREY_HEIGHT * 1.15;
  placeOnFace(upperWin, hall.faces[3]!, 0.68);
  g.add(upperWin);

  // Side window(s), 1-2 per visible long face.
  const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
  for (const fi of [0, 2]) {
    const sideWin = buildVampireShutteredWindow({
      width: 0.55,
      height: 0.95,
      wallZ: wallZFor(fi, halfW, halfD),
      palette: openingPalette,
    });
    sideWin.name = 'vampire-shuttered-window vampire-side-window';
    sideWin.position.y = HOUSE_STOREY_HEIGHT * 0.55;
    placeOnFace(sideWin, hall.faces[fi]!, 0.5);
    g.add(sideWin);
  }
  void sideRand;

  // Rear: boarded-in-place window (intact, not broken).
  const rearWin = buildVampireShutteredWindow({
    width: 0.5,
    height: 0.85,
    wallZ: wallZFor(1, halfW, halfD),
    palette: openingPalette,
    shutterState: 'boarded_in_place',
  });
  rearWin.position.y = HOUSE_STOREY_HEIGHT * 0.55;
  placeOnFace(rearWin, hall.faces[1]!, 0.5);
  g.add(rearWin);

  // Roof.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<VampireRoofFamily>(roofRand, [
    ['gable', 0.80],
    ['mansard', 0.20],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.35;
  const roof = buildVampireRoof(roofFamily, halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = height;
  g.add(roof);

  const finialTop = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001));
  finialTop.visible = false;
  void finialTop;
  const ridgeFinial = buildFinial(palette.iron, 1.1);
  ridgeFinial.position.set(0, height + ridgeHeight + 0.02, 0);
  g.add(ridgeFinial);

  // Chimney.
  const chimney = placeVampireChimney(halfW, halfD, height, 'rear-left', palette, tagSeed(dna.seed, 'CHIM'));
  g.add(chimney);

  // Lantern bracket over the door.
  const lantern = buildVampireLantern(palette);
  lantern.position.set(halfD * 0 + 0.32, 2.05, wallZFor(3, halfW, halfD) + 0.02);
  placeOnFace(lantern, hall.faces[3]!, 0.32);
  g.add(lantern);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Terraced — tall narrow townhouse row segment
// ─────────────────────────────────────────────────────────────────────────

const TERRACED_STOREY_HEIGHT = 2.9;

export function buildVampireTerraced(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('terraced', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.limewash;
  const glazing = palette.amberGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-terraced';

  const floors = 3;
  const height = TERRACED_STOREY_HEIGHT * floors;
  const hall = buildVampireHall(halfW, halfD, height, tagSeed(dna.seed, 'HALL'), wallMaterial);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 1, { height: 0.18 });
  g.add(plinth);

  // Narrow off-centre door.
  const door = buildVampireDoor({
    width: 0.68,
    height: 1.75,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
  });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.28);
  g.add(door);

  // Two facade bays, 3 floors of shuttered windows each (front only --
  // party walls on the sides preclude side windows entirely, per spec).
  const winRand = mulberry32(tagSeed(dna.seed, 'WIN'));
  for (let floor = 0; floor < floors; floor++) {
    const t = floor === 0 ? [0.72] : [0.3, 0.72];
    for (const bt of t) {
      const win = buildVampireShutteredWindow({
        width: 0.52,
        height: 1.1,
        wallZ: wallZFor(3, halfW, halfD),
        palette: openingPalette,
        shutterState: winRand() < 0.15 ? 'boarded_in_place' : 'closed_louvred',
      });
      win.position.y = TERRACED_STOREY_HEIGHT * (floor + 0.55);
      placeOnFace(win, hall.faces[3]!, bt);
      g.add(win);
    }
  }

  // String courses at each floor line.
  for (let floor = 1; floor < floors; floor++) {
    const belt = buildStringCourse(hall.points, palette.stoneTrim, { height: 0.1 });
    belt.position.y = TERRACED_STOREY_HEIGHT * floor;
    g.add(belt);
  }

  // Shared iron balcony at 2nd floor.
  const balconyRand = mulberry32(tagSeed(dna.seed, 'BALC'));
  if (balconyRand() < 0.7) {
    const balcony = buildIronRailing(fp.w * 0.55, 0.5, palette.iron, 4);
    balcony.name = 'vampire-balcony';
    balcony.position.set(0, TERRACED_STOREY_HEIGHT * 1 + 0.05, wallZFor(3, halfW, halfD) + 0.08);
    g.add(balcony);
  }

  // Steep mansard roof with 1-2 dormers and ridge cresting.
  const roof = buildVampireRoof('mansard', halfW, halfD, halfW * 1.7, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = height;
  g.add(roof);

  const cresting = buildIronRailing(fp.w * 0.9, 0.16, palette.iron, 4);
  cresting.name = 'vampire-ridge-cresting';
  cresting.position.y = height + halfW * 1.7;
  g.add(cresting);

  const dormerCount = mulberry32(tagSeed(dna.seed, 'DORM'))() < 0.6 ? 1 : 2;
  for (let i = 0; i < dormerCount; i++) {
    const dormer = buildVampireDormer(palette, openingPalette, tagSeed(dna.seed, `DORM${i}`));
    const t = dormerCount === 1 ? 0.5 : i === 0 ? 0.3 : 0.7;
    dormer.position.y = height + halfW * 0.55;
    placeOnFace(dormer, hall.faces[3]!, t);
    g.add(dormer);
  }

  // One or two slim chimney stacks between party walls.
  const chimney = placeVampireChimney(halfW, halfD, height, 'rear-left', palette, tagSeed(dna.seed, 'CHIM'), 1.1);
  g.add(chimney);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Villa — Count's manor / flagship residence
// ─────────────────────────────────────────────────────────────────────────

const VILLA_GROUND_HEIGHT = 3.15;
const VILLA_UPPER_HEIGHT = 3.15;
const VILLA_ATTIC_HEIGHT = 2.4;

export function buildVampireVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('villa', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.ashlar;
  const glazing = palette.amberGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-villa';

  const groundHeight = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT;
  const hall = buildVampireHall(halfW, halfD, groundHeight, tagSeed(dna.seed, 'MAIN'), wallMaterial);
  hall.group.name = 'vampire-villa-mass-main';
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 2, { height: 0.2 });
  g.add(plinth);
  const cornice = buildStringCourse(hall.points, palette.stoneTrim, { height: 0.12 });
  cornice.position.y = VILLA_GROUND_HEIGHT;
  g.add(cornice);

  // Wing: L-plan or T-plan single-floor wing.
  const massRand = mulberry32(tagSeed(dna.seed, 'MASS'));
  const massVariant = pickWeighted<'wing-l' | 'wing-t' | 'turret'>(massRand, [
    ['wing-l', 0.4],
    ['wing-t', 0.25],
    ['turret', 0.35],
  ]);
  if (massVariant === 'wing-l' || massVariant === 'wing-t') {
    const alongFraction = massVariant === 'wing-l' ? 0.18 : 0.5;
    const wingWidth = fp.w * 0.5;
    const wingDepth = fp.d * 0.55;
    const { wing } = composeMainAndWing({
      mainWidth: fp.w,
      mainDepth: fp.d,
      mainHeight: VILLA_GROUND_HEIGHT,
      wing: { width: wingWidth, depth: wingDepth, height: VILLA_GROUND_HEIGHT, side: 'left', alongFraction },
    });
    const wingHall = buildMassFromSpec(wing, tagSeed(dna.seed, 'WING'), wallMaterial);
    wingHall.name = 'vampire-villa-mass-wing';
    g.add(wingHall);
    const wingHalfW = wingWidth / 2;
    const wingHalfD = wingDepth / 2;
    const wingRoof = buildVampireRoof('hip', wingHalfW, wingHalfD, wingHalfW * 0.9, tagSeed(dna.seed, 'WROOF'), palette.roofTile);
    wingRoof.position.set(wing.center[0], VILLA_GROUND_HEIGHT, wing.center[1]);
    g.add(wingRoof);
  } else {
    // Corner turret: a narrower, taller mass with its own tented roof.
    const turretHalf = Math.min(halfW, halfD) * 0.45;
    const turretHeight = groundHeight + VILLA_ATTIC_HEIGHT * 1.4;
    const turretHall = buildVampireHall(turretHalf, turretHalf, turretHeight, tagSeed(dna.seed, 'TURR'), wallMaterial, { blocksPerFace: 2 });
    turretHall.group.name = 'vampire-villa-turret';
    turretHall.group.position.set(halfW - turretHalf * 0.7, 0, halfD - turretHalf * 0.7);
    g.add(turretHall.group);
    const turretRoof = buildVampireRoof('hip', turretHalf, turretHalf, turretHalf * 1.6, tagSeed(dna.seed, 'TROOF'), palette.roofTile);
    turretRoof.position.set(halfW - turretHalf * 0.7, turretHeight, halfD - turretHalf * 0.7);
    g.add(turretRoof);
    const turretFinial = buildFinial(palette.iron, 1.2);
    turretFinial.position.set(halfW - turretHalf * 0.7, turretHeight + turretHalf * 1.6 + 0.02, halfD - turretHalf * 0.7);
    g.add(turretFinial);
  }

  // Monumental arched front door with voussoir flourish.
  const doorRand = mulberry32(tagSeed(dna.seed, 'DOOR'));
  const doorWidth = 1.1;
  const doorHeight = 2.15;
  const archRatio = 1.45 + doorRand() * 0.2;
  const door = buildVampireDoor({ width: doorWidth, height: doorHeight, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette, archRatio });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);

  const pointHeight = Math.min(doorHeight * 0.42, (doorWidth / 2) * archRatio);
  const straightHeight = Math.max(doorHeight * 0.58, doorHeight - pointHeight);
  const archGroup = buildVoussoirArch({
    width: doorWidth * 1.3,
    springHeight: straightHeight + 0.12,
    archRatio,
    material: palette.stoneTrim,
    seed: tagSeed(dna.seed, 'ARCH'),
  });
  archGroup.name = 'vampire-door-arch';
  archGroup.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(archGroup, hall.faces[3]!, 0.5);
  g.add(archGroup);

  // Ground floor: 2 large arched sash windows either side of the door.
  const groundRand = mulberry32(tagSeed(dna.seed, 'GRND'));
  for (const t of [0.18, 0.82]) {
    const win = buildVampireShutteredWindow({
      width: 0.9,
      height: 1.6,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      shutterState: groundRand() < 0.5 ? 'closed_louvred' : 'one_ajar',
    });
    win.position.y = VILLA_GROUND_HEIGHT * 0.4;
    placeOnFace(win, hall.faces[3]!, t);
    g.add(win);
  }

  // First floor: 3-4 lancets/cross-mullions, or an OrielBay as the
  // signature bay.
  const bayRand = mulberry32(tagSeed(dna.seed, 'BAY'));
  const useOriel = bayRand() < 0.6;
  if (useOriel) {
    const oriel = buildOrielBay({
      width: 1.6,
      projection: 0.55,
      height: VILLA_UPPER_HEIGHT * 0.85,
      wallMaterial,
      roofMaterial: palette.roofTile,
      corbelMaterial: palette.stoneTrim,
      stoneMaterial: palette.stoneTrim,
      glazingMaterial: glazing,
      recessMaterial: wallMaterial,
      seed: tagSeed(dna.seed, 'ORIEL'),
    });
    oriel.name = 'vampire-oriel-bay';
    oriel.position.set(0, VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.08, halfD);
    g.add(oriel);
    for (const t of [0.15, 0.85]) {
      const win = buildVampireShutteredWindow({
        width: 0.65,
        height: 1.35,
        wallZ: wallZFor(3, halfW, halfD),
        palette: openingPalette,
      });
      win.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.35;
      placeOnFace(win, hall.faces[3]!, t);
      g.add(win);
    }
  } else {
    const balcony = buildIronRailing(1.4, 0.5, palette.iron, 4);
    balcony.name = 'vampire-balcony';
    balcony.position.set(0, VILLA_GROUND_HEIGHT + 0.05, wallZFor(3, halfW, halfD) + 0.08);
    g.add(balcony);
    for (const t of [0.15, 0.38, 0.62, 0.85]) {
      const win = buildVampireShutteredWindow({
        width: 0.6,
        height: 1.3,
        wallZ: wallZFor(3, halfW, halfD),
        palette: openingPalette,
      });
      win.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.35;
      placeOnFace(win, hall.faces[3]!, t);
      g.add(win);
    }
  }

  // Side windows, ground + upper.
  for (const fi of [0, 2]) {
    const groundWin = buildVampireShutteredWindow({ width: 0.6, height: 1.2, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette });
    groundWin.position.y = VILLA_GROUND_HEIGHT * 0.42;
    placeOnFace(groundWin, hall.faces[fi]!, 0.5);
    g.add(groundWin);
    const upperWin = buildVampireShutteredWindow({ width: 0.55, height: 1.1, wallZ: wallZFor(fi, halfW, halfD), palette: openingPalette });
    upperWin.position.y = VILLA_GROUND_HEIGHT + VILLA_UPPER_HEIGHT * 0.42;
    placeOnFace(upperWin, hall.faces[fi]!, 0.5);
    g.add(upperWin);
  }

  // Attic dormers via oculus pair.
  for (const t of [0.35, 0.65]) {
    const oculus = buildVampireOculus({ diameter: 0.5, wallZ: wallZFor(3, halfW, halfD), palette: openingPalette });
    oculus.name = 'vampire-oculus';
    oculus.position.y = groundHeight - 0.4;
    placeOnFace(oculus, hall.faces[3]!, t);
    g.add(oculus);
  }

  // Roof: mansard or hip hybrid.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<VampireRoofFamily>(roofRand, [
    ['mansard', 0.55],
    ['hip', 0.45],
  ]);
  const roofRise = Math.min(halfW, halfD) * 1.5;
  const roof = buildVampireRoof(roofFamily, halfW, halfD, roofRise, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = groundHeight;
  g.add(roof);
  const ridgeFinial = buildFinial(palette.iron, 1.3);
  ridgeFinial.position.set(0, groundHeight + roofRise + 0.02, 0);
  g.add(ridgeFinial);

  // 2-3 ornate chimneys.
  const chimney1 = placeVampireChimney(halfW, halfD, groundHeight, 'rear-left', palette, tagSeed(dna.seed, 'CHM1'), 1.6);
  g.add(chimney1);
  const chimney2 = placeVampireChimney(halfW, halfD, groundHeight, 'rear-right', palette, tagSeed(dna.seed, 'CHM2'), 1.5);
  g.add(chimney2);

  // Crest plaque over the door.
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), palette.stoneTrim);
  crest.name = 'vampire-crest';
  crest.position.set(0, doorHeight + 0.5, wallZFor(3, halfW, halfD) + 0.06);
  g.add(crest);

  // Carriage lanterns.
  for (const t of [0.1, 0.9]) {
    const lantern = buildVampireLantern(palette);
    lantern.position.y = 1.9;
    placeOnFace(lantern, hall.faces[3]!, t);
    g.add(lantern);
  }

  // Gated iron forecourt (kept narrower than the villa's own footprint
  // width so the fence never dominates the building's overall silhouette).
  const fence = buildVampireGateAndFence(fp.w * 0.85, 0.9, palette, tagSeed(dna.seed, 'GATE'));
  fence.position.set(0, 0, halfD + 1.1);
  g.add(fence);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Inn — gated boarding house with a wide carriage arch
// ─────────────────────────────────────────────────────────────────────────

const INN_STOREY_HEIGHT = 3.0;

export function buildVampireInn(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('inn', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.ashlar;
  const glazing = palette.amberGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-inn';

  const floors = 2;
  const height = INN_STOREY_HEIGHT * floors;
  const hall = buildVampireHall(halfW, halfD, height, tagSeed(dna.seed, 'HALL'), wallMaterial);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 2, { height: 0.2 });
  g.add(plinth);
  const cornice = buildStringCourse(hall.points, palette.stoneTrim, { height: 0.12 });
  cornice.position.y = INN_STOREY_HEIGHT;
  g.add(cornice);

  // Wide carriage-arch double door, centred, tall enough for a coach.
  const door = buildVampireDoor({
    width: 1.5,
    height: 2.2,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 1.5,
  });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);

  const archGroup = buildVoussoirArch({
    width: 1.5 * 1.25,
    springHeight: 1.55,
    archRatio: 1.5,
    material: palette.stoneTrim,
    seed: tagSeed(dna.seed, 'ARCH'),
  });
  archGroup.name = 'vampire-door-arch';
  archGroup.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(archGroup, hall.faces[3]!, 0.5);
  g.add(archGroup);

  // Ground floor flanking windows.
  const groundRand = mulberry32(tagSeed(dna.seed, 'GRND'));
  for (const t of [0.14, 0.86]) {
    const win = buildVampireShutteredWindow({
      width: 0.6,
      height: 1.2,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      shutterState: groundRand() < 0.5 ? 'closed_louvred' : 'one_ajar',
    });
    win.position.y = INN_STOREY_HEIGHT * 0.42;
    placeOnFace(win, hall.faces[3]!, t);
    g.add(win);
  }

  // Upper-floor guest-room windows, front + both sides.
  const winRand = mulberry32(tagSeed(dna.seed, 'WIN'));
  for (const t of [0.1, 0.3, 0.7, 0.9]) {
    const win = buildVampireShutteredWindow({
      width: 0.55,
      height: 1.1,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      shutterState: winRand() < 0.2 ? 'boarded_in_place' : 'closed_louvred',
    });
    win.position.y = INN_STOREY_HEIGHT * 1.4;
    placeOnFace(win, hall.faces[3]!, t);
    g.add(win);
  }
  for (const fi of [0, 2]) {
    const win = buildVampireShutteredWindow({
      width: 0.55,
      height: 1.05,
      wallZ: wallZFor(fi, halfW, halfD),
      palette: openingPalette,
    });
    win.position.y = INN_STOREY_HEIGHT * 1.4;
    placeOnFace(win, hall.faces[fi]!, 0.5);
    g.add(win);
  }

  // Iron balcony over the carriage arch.
  const balcony = buildIronRailing(1.7, 0.5, palette.iron, 5);
  balcony.name = 'vampire-balcony';
  balcony.position.set(0, INN_STOREY_HEIGHT + 0.05, wallZFor(3, halfW, halfD) + 0.08);
  g.add(balcony);

  // Roof: long gable/hip family, with 2 chimney stacks straddling the ridge.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<VampireRoofFamily>(roofRand, [
    ['gable', 0.4],
    ['hip', 0.35],
    ['mansard', 0.25],
  ]);
  const roofRise = Math.min(halfW, halfD) * 1.45;
  const roof = buildVampireRoof(roofFamily, halfW, halfD, roofRise, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = height;
  g.add(roof);
  const ridgeFinial = buildFinial(palette.iron, 1.15);
  ridgeFinial.position.set(0, height + roofRise + 0.02, 0);
  g.add(ridgeFinial);

  const chimney1 = placeVampireChimney(halfW, halfD, height, 'rear-left', palette, tagSeed(dna.seed, 'CHM1'), 1.5);
  g.add(chimney1);
  const chimney2 = placeVampireChimney(halfW, halfD, height, 'rear-right', palette, tagSeed(dna.seed, 'CHM2'), 1.4);
  g.add(chimney2);

  // Hanging crest sign flanking the carriage arch.
  const sign = buildVampireHangingSign(0.5, 0.5, palette, palette.blackBrick);
  sign.position.set(-1.1, INN_STOREY_HEIGHT * 0.85, wallZFor(3, halfW, halfD) + 0.02);
  g.add(sign);

  // Lantern flanking the arch.
  const lantern = buildVampireLantern(palette);
  lantern.position.y = 2.1;
  placeOnFace(lantern, hall.faces[3]!, 0.86);
  g.add(lantern);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Shop — narrow trade frontage with a locked display bay
// ─────────────────────────────────────────────────────────────────────────

const SHOP_STOREY_HEIGHT = 2.9;

export function buildVampireShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('shop', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.limewash;
  const glazing = palette.amberGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-shop';

  const height = SHOP_STOREY_HEIGHT * 2;
  const hall = buildVampireHall(halfW, halfD, height, tagSeed(dna.seed, 'HALL'), wallMaterial);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 1, { height: 0.16 });
  g.add(plinth);

  // Narrow door, off to one side of the frontage.
  const door = buildVampireDoor({
    width: 0.72,
    height: 1.85,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
  });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.24);
  g.add(door);

  // Locked display bay: a large five-piece window with an iron grille
  // layered proud in front (never a naive flat "shop window" plane).
  const display = buildVampireWindow({
    width: 1.5,
    height: 1.5,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    shape: 'round',
    divisionStyle: 'cross',
  });
  display.name = 'vampire-display-window';
  display.position.y = SHOP_STOREY_HEIGHT * 0.42;
  placeOnFace(display, hall.faces[3]!, 0.66);
  g.add(display);

  const grille = buildVampireGrille(1.3, 1.3, palette.iron, 5);
  grille.position.set(0, SHOP_STOREY_HEIGHT * 0.42 - 0.65, wallZFor(3, halfW, halfD) + 0.14);
  placeOnFace(grille, hall.faces[3]!, 0.66);
  g.add(grille);

  // Upper floor: 1-2 shuttered residence windows above the shop.
  const upperRand = mulberry32(tagSeed(dna.seed, 'UPPR'));
  for (const t of [0.3, 0.7]) {
    const win = buildVampireShutteredWindow({
      width: 0.5,
      height: 0.95,
      wallZ: wallZFor(3, halfW, halfD),
      palette: openingPalette,
      shutterState: upperRand() < 0.7 ? 'closed_louvred' : 'one_ajar',
    });
    win.position.y = SHOP_STOREY_HEIGHT * 1.45;
    placeOnFace(win, hall.faces[3]!, t);
    g.add(win);
  }

  // Iron-supported cloth awning over the display bay.
  const awning = buildVampireAwning(1.9, 0.7, palette);
  awning.position.set(0, SHOP_STOREY_HEIGHT * 0.42 + 0.85, wallZFor(3, halfW, halfD) + 0.02);
  placeOnFace(awning, hall.faces[3]!, 0.66);
  g.add(awning);

  // Hanging trade sign beside the door.
  const sign = buildVampireHangingSign(0.42, 0.42, palette, palette.stoneTrim);
  sign.position.set(0, SHOP_STOREY_HEIGHT * 0.8, wallZFor(3, halfW, halfD) + 0.02);
  placeOnFace(sign, hall.faces[3]!, 0.24);
  g.add(sign);

  // Roof.
  const roofRand = mulberry32(tagSeed(dna.seed, 'ROOF'));
  const roofFamily = pickWeighted<VampireRoofFamily>(roofRand, [
    ['gable', 0.55],
    ['mansard', 0.25],
    ['hip', 0.2],
  ]);
  const ridgeHeight = Math.min(halfW, halfD) * 1.3;
  const roof = buildVampireRoof(roofFamily, halfW, halfD, ridgeHeight, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = height;
  g.add(roof);
  const ridgeFinial = buildFinial(palette.iron, 0.9);
  ridgeFinial.position.set(0, height + ridgeHeight + 0.02, 0);
  g.add(ridgeFinial);

  const chimney = placeVampireChimney(halfW, halfD, height, 'rear-left', palette, tagSeed(dna.seed, 'CHIM'), 1.1);
  g.add(chimney);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Blacksmith — a working forge with a massive chimney breast
// ─────────────────────────────────────────────────────────────────────────

const BLACKSMITH_HEIGHT = 4.4;

export function buildVampireBlacksmith(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('blacksmith', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.blackBrick;
  const glazing = palette.bloodGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-blacksmith';

  const hall = buildVampireHall(halfW, halfD, BLACKSMITH_HEIGHT, tagSeed(dna.seed, 'HALL'), wallMaterial);
  g.add(hall.group);

  const plinth = buildPlinthCourses(hall.points, palette.stoneTrim, 1, { height: 0.22 });
  g.add(plinth);

  // Wide arched forge door, set behind a proud riveted iron frame.
  const doorWidth = 1.3;
  const doorHeight = 2.1;
  const door = buildVampireDoor({
    width: doorWidth,
    height: doorHeight,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 1.45,
  });
  door.name = 'vampire-door';
  placeOnFace(door, hall.faces[3]!, 0.5);
  g.add(door);

  const forgeFrame = new THREE.Group();
  forgeFrame.name = 'vampire-forge-frame';
  const frameThickness = 0.08;
  const frameDepthOffset = 0.16;
  for (const side of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, doorHeight * 1.08, frameThickness), palette.iron);
    post.position.set(side * (doorWidth / 2 + 0.1), doorHeight * 0.54, frameDepthOffset);
    post.castShadow = post.receiveShadow = true;
    forgeFrame.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.36, frameThickness, frameThickness), palette.iron);
  lintel.position.set(0, doorHeight * 1.08, frameDepthOffset);
  lintel.castShadow = lintel.receiveShadow = true;
  forgeFrame.add(lintel);
  forgeFrame.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(forgeFrame, hall.faces[3]!, 0.5);
  g.add(forgeFrame);

  // Louvred ventilation shutters (no glass) high on the front/side walls.
  for (const [fi, t] of [[3, 0.15], [3, 0.85], [0, 0.5]] as const) {
    const vent = buildShutter({
      width: 0.42,
      height: 0.6,
      material: palette.darkTimber,
      hingeMaterial: palette.iron,
      state: 'closed_louvred',
      wallZ: wallZFor(fi, halfW, halfD),
    });
    vent.name = 'vampire-vent';
    vent.position.y = BLACKSMITH_HEIGHT * 0.78;
    placeOnFace(vent, hall.faces[fi]!, t);
    g.add(vent);
  }

  // Barred ember-glow rear forge window.
  const forgeWindow = buildVampireWindow({
    width: 0.6,
    height: 0.6,
    wallZ: wallZFor(1, halfW, halfD),
    palette: { ...openingPalette, glazing: palette.bloodGlass },
    shape: 'round',
    divisionStyle: 'cross',
  });
  forgeWindow.name = 'vampire-forge-window';
  forgeWindow.position.y = BLACKSMITH_HEIGHT * 0.35;
  placeOnFace(forgeWindow, hall.faces[1]!, 0.5);
  g.add(forgeWindow);

  const forgeGrille = buildVampireGrille(0.55, 0.55, palette.iron, 4);
  forgeGrille.position.y = BLACKSMITH_HEIGHT * 0.35;
  placeOnFace(forgeGrille, hall.faces[1]!, 0.5);
  forgeGrille.position.z += 0.12 * Math.cos(hall.faces[1]!.normalAngle);
  forgeGrille.position.x += 0.12 * Math.sin(hall.faces[1]!.normalAngle);
  g.add(forgeGrille);

  // Massive full-height chimney breast against the rear wall, built up
  // from the ground (not just a rooftop stack) -- reads as the forge's
  // structural, load-bearing hearth mass.
  const chimneyBreastHeight = BLACKSMITH_HEIGHT + 2.6;
  const chimneyBreast = buildCorbelledChimneyStack({
    width: 0.95,
    depth: 0.85,
    height: chimneyBreastHeight,
    courseCount: 10,
    material: palette.blackBrick,
    collarMaterial: palette.iron,
    capMaterial: palette.stoneTrim,
    flueMaterial: palette.darkGlass,
    seed: tagSeed(dna.seed, 'CHIM'),
  });
  chimneyBreast.name = 'vampire-chimney';
  chimneyBreast.position.set(0, 0, -halfD - 0.42);
  g.add(chimneyBreast);
  const chimneyFinial = buildFinial(palette.iron, 1.3);
  chimneyFinial.position.set(0, chimneyBreastHeight + 0.02, -halfD - 0.42);
  g.add(chimneyFinial);

  // Roof: a working forge's steep gable, smoke-blackened tile.
  const roofRise = Math.min(halfW, halfD) * 1.2;
  const roof = buildVampireRoof('gable', halfW, halfD, roofRise, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = BLACKSMITH_HEIGHT;
  g.add(roof);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Chapel — private family chapel (maintained, not a ruin/mausoleum)
// ─────────────────────────────────────────────────────────────────────────

const CHAPEL_NAVE_HEIGHT = 3.4;

function buildVampireBellcote(palette: VampirePalette, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vampire-bellcote';
  const width = 0.7;
  const height = 0.6;
  for (const side of [-1, 1] as const) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.14, height, 0.14), palette.stoneTrim);
    pier.position.set(side * width * 0.4, height / 2, 0);
    pier.castShadow = pier.receiveShadow = true;
    g.add(pier);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.16), palette.stoneTrim);
  cap.position.y = height + 0.06;
  cap.castShadow = cap.receiveShadow = true;
  g.add(cap);
  const gablet = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 0.22, 0.12), palette.stoneTrim);
  gablet.position.y = height + 0.22 + 0.11;
  gablet.rotation.z = Math.PI / 4;
  gablet.castShadow = gablet.receiveShadow = true;
  g.add(gablet);
  const bell = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), palette.iron);
  bell.position.y = height * 0.4;
  bell.castShadow = bell.receiveShadow = true;
  g.add(bell);
  void seed;
  return g;
}

export function buildVampireChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('chapel', dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.ashlar;
  const glazing = palette.bloodGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-chapel';

  const nave = buildVampireHall(halfW, halfD, CHAPEL_NAVE_HEIGHT, tagSeed(dna.seed, 'NAVE'), wallMaterial);
  g.add(nave.group);

  const plinth = buildPlinthCourses(nave.points, palette.stoneTrim, 1, { height: 0.2 });
  g.add(plinth);

  // Pointed double door (modelled as one wide lancet leaf) with a
  // voussoir arch flourish above.
  const doorWidth = 1.3;
  const doorHeight = 2.2;
  const door = buildVampireDoor({
    width: doorWidth,
    height: doorHeight,
    wallZ: wallZFor(3, halfW, halfD),
    palette: openingPalette,
    archRatio: 1.6,
  });
  door.name = 'vampire-door';
  placeOnFace(door, nave.faces[3]!, 0.5);
  g.add(door);

  const archGroup = buildVoussoirArch({
    width: doorWidth * 1.3,
    springHeight: 1.6,
    archRatio: 1.6,
    material: palette.stoneTrim,
    seed: tagSeed(dna.seed, 'ARCH'),
  });
  archGroup.name = 'vampire-door-arch';
  archGroup.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(archGroup, nave.faces[3]!, 0.5);
  g.add(archGroup);

  // Rose tracery window with set-back red glass, above the door.
  const roseGroup = new THREE.Group();
  roseGroup.name = 'vampire-rose-window';
  const roseRadius = Math.min(halfW * 0.85, 0.85);
  const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(roseRadius * 0.94, 24), palette.bloodGlass);
  roseGlass.name = 'vampire-rose-glass';
  roseGlass.position.z = -0.08;
  roseGroup.add(roseGlass);
  const rose = buildRoseWindow({ lobes: 8, radius: roseRadius, ringCount: 2, seed: tagSeed(dna.seed, 'ROSE') }, palette.stoneTrim);
  roseGroup.add(rose);
  roseGroup.position.y = CHAPEL_NAVE_HEIGHT * 0.68;
  roseGroup.position.z = wallZFor(3, halfW, halfD);
  placeOnFace(roseGroup, nave.faces[3]!, 0.5);
  g.add(roseGroup);

  // Buttresses at bay divisions on both long walls (>= 4 total).
  for (const fi of [0, 2]) {
    for (const t of [0.25, 0.75]) {
      const buttress = buildButtress({
        height: CHAPEL_NAVE_HEIGHT * 0.9,
        width: 0.4,
        depth: 0.36,
        stages: 2,
        seed: tagSeed(dna.seed, `BUTR${fi}_${Math.round(t * 10)}`),
      }, palette.stoneTrim);
      buttress.name = 'vampire-buttress';
      buttress.position.z = wallZFor(fi, halfW, halfD) - 0.15;
      placeOnFace(buttress, nave.faces[fi]!, t);
      g.add(buttress);
    }
  }

  // Side lancet windows between the buttresses.
  const sideRand = mulberry32(tagSeed(dna.seed, 'SIDE'));
  for (const fi of [0, 2]) {
    for (const t of [0.5]) {
      const win = buildVampireShutteredWindow({
        width: 0.55,
        height: 1.5,
        wallZ: wallZFor(fi, halfW, halfD),
        palette: openingPalette,
        shutterState: sideRand() < 0.6 ? 'closed_louvred' : 'boarded_in_place',
      });
      win.position.y = CHAPEL_NAVE_HEIGHT * 0.55;
      placeOnFace(win, nave.faces[fi]!, t);
      g.add(win);
    }
  }

  // Steep nave gable roof with ridge cresting + bellcote.
  const roofRise = Math.min(halfW, halfD) * 1.5;
  const roof = buildGableRoof(halfW, halfD, roofRise, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = CHAPEL_NAVE_HEIGHT;
  g.add(roof);

  const cresting = buildIronRailing(fp.d * 0.9, 0.14, palette.iron, 6);
  cresting.name = 'vampire-ridge-cresting';
  cresting.rotation.y = Math.PI / 2;
  cresting.position.y = CHAPEL_NAVE_HEIGHT + roofRise;
  g.add(cresting);

  const bellcote = buildVampireBellcote(palette, tagSeed(dna.seed, 'BELL'));
  bellcote.position.set(0, CHAPEL_NAVE_HEIGHT + roofRise, halfD * 0.35);
  g.add(bellcote);

  const finial = buildFinial(palette.iron, 1.2);
  finial.position.set(0, CHAPEL_NAVE_HEIGHT + roofRise + 0.02, -halfD * 0.4);
  g.add(finial);

  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Watchtower — tall tapered private lookout shaft
// ─────────────────────────────────────────────────────────────────────────

export function buildVampireWatchtower(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint('watchtower', dna.size);
  const baseHalfW = fp.w / 2;
  const baseHalfD = fp.d / 2;
  const palette = buildVampirePalette(dna);
  const wallMaterial = palette.ashlar;
  const glazing = palette.amberGlass;
  const openingPalette = toOpeningPalette(palette, wallMaterial, glazing);
  const g = new THREE.Group();
  g.name = 'vampire-watchtower';

  const tierHeights = [2.6, 2.2, 2.0, 1.8];
  const tiers = makeBatteredRectangleTiers(baseHalfW, baseHalfD, tierHeights, {
    baseBatterFrac: 0.12,
    insetPerTierFrac: 0.14,
  });

  let shaftTopY = 0;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const wallSeed = tagSeed(dna.seed, `TIER${i}`);
    const wallGroup = new THREE.Group();
    const walls = buildWallSurfaceBlocks(0, tier.height, wallSeed, wallMaterial, {
      courseHeight: 0.4,
      blocksPerFace: 3,
      jitter: 0.03,
      facesOverride: tier.faces,
    });
    wallGroup.add(walls);
    const quoins = buildQuoins(Math.max(tier.halfW, tier.halfD), tier.height, undefined, palette.stoneTrim, tier.points);
    wallGroup.add(quoins);
    wallGroup.position.y = tier.y;
    g.add(wallGroup);

    if (i > 0) {
      const belt = buildStringCourse(tier.points, palette.stoneTrim, { height: 0.1 });
      belt.position.y = tier.y;
      g.add(belt);
    }

    if (i === 0) {
      const door = buildVampireDoor({
        width: 0.6,
        height: 1.3,
        wallZ: wallZFor(3, tier.halfW, tier.halfD),
        palette: openingPalette,
      });
      door.name = 'vampire-door';
      placeOnFace(door, tier.faces[3]!, 0.5);
      g.add(door);
    } else {
      const win = buildVampireShutteredWindow({
        width: 0.34,
        height: 0.7,
        wallZ: wallZFor(3, tier.halfW, tier.halfD),
        palette: openingPalette,
      });
      win.position.y = tier.height * 0.5;
      placeOnFace(win, tier.faces[3]!, 0.5);
      g.add(win);
    }

    shaftTopY = tier.y + tier.height;
  }

  const topTier = tiers[tiers.length - 1]!;
  const floorCap = buildFloorCap(0, palette.stoneTrim, undefined, topTier.points);
  floorCap.position.y = shaftTopY;
  g.add(floorCap);

  const corbelCourse = buildStringCourse(topTier.points, palette.stoneTrim, { height: 0.14, outset: 0.08 });
  corbelCourse.position.y = shaftTopY - 0.12;
  g.add(corbelCourse);

  // Needle roof: a tall, steep hip roof capped by an iron finial.
  const roofRise = Math.max(topTier.halfW, topTier.halfD) * 3.4;
  const roof = buildHipRoof(topTier.halfW, topTier.halfD, roofRise, tagSeed(dna.seed, 'ROOF'), palette.roofTile);
  roof.position.y = shaftTopY;
  g.add(roof);

  const finial = buildFinial(palette.iron, 1.6);
  finial.position.y = shaftTopY + roofRise + 0.02;
  g.add(finial);

  return g;
}
