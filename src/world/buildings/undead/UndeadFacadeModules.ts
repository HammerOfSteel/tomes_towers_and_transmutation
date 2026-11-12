import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { depthFor } from '../kit/DepthLadder';
import { buildMonument } from '../kit/MonumentKit';
import { buildMetalBand } from '../kit/MetalBanding';
import {
  buildUndeadDoor,
  buildUndeadGrilleDoor,
  buildUndeadGrilleWindow,
  buildUndeadSealedSlab,
  type UndeadOpeningPalette,
} from './UndeadOpenings';
import type { UndeadPalette } from './UndeadNecropolisPalette';

/**
 * UndeadFacadeModules.ts — higher-level facade "modules" composed from the
 * shared opening/monument primitives, matching each per-kind opening
 * schedule in `2026-09-04-undead-buildings-design.md` (crypt doors, barred
 * lantern windows, blind plaque/reliquary niches, sealed slabs, shored
 * cracks, spolia patches, and columbarium bands). Every module produces
 * real recessed/proud 3D geometry -- doctrine Rule 1/2 apply here exactly
 * as they do to true window/door openings, even for "blind" (non-glazed)
 * facade features.
 */

function toOpeningPalette(palette: UndeadPalette): UndeadOpeningPalette {
  return {
    stone: palette.stone,
    glazing: palette.sealedGlazing,
    wood: palette.timber,
    iron: palette.iron,
    recess: palette.darkStone,
  };
}

export type CryptDoorVariant = 'iron-grille' | 'sealed-slab' | 'planked-repair';

export interface CryptDoorOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  variant: CryptDoorVariant;
  seed?: number;
}

/**
 * The front-door facade module: dispatches across the house/villa/chapel
 * blueprints' "door assembly" weighted axis (iron-grille arch / sealed
 * slab door / planked repair door with straps).
 */
export function buildCryptDoor(options: CryptDoorOptions): THREE.Group {
  const openingPalette = toOpeningPalette(options.palette);
  const group = new THREE.Group();
  group.name = `crypt-door-${options.variant}`;

  if (options.variant === 'iron-grille') {
    group.add(buildUndeadGrilleDoor({ width: options.width, height: options.height, wallZ: options.wallZ, palette: openingPalette }));
    return group;
  }

  if (options.variant === 'sealed-slab') {
    const sealed = buildUndeadSealedSlab({ width: options.width, height: options.height, wallZ: options.wallZ, palette: openingPalette });
    sealed.name = 'opening';
    group.add(sealed);
    return group;
  }

  // 'planked-repair': the ordinary planked door leaf plus extra iron strap
  // bands, reading as a hasty timber repair over the original stone
  // doorway.
  const opening = buildUndeadDoor({ width: options.width, height: options.height, wallZ: options.wallZ, palette: openingPalette });
  opening.name = 'opening';
  group.add(opening);
  const rand = mulberry32(options.seed ?? 0);
  const strapCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < strapCount; i++) {
    const band = buildMetalBand({ width: options.width * 0.9, depth: 0.02, material: options.palette.iron, bandHeight: 0.06 });
    band.name = `repair-strap-${i}`;
    band.position.set(0, options.height * (0.25 + i * 0.3), options.wallZ - 0.05);
    group.add(band);
  }
  return group;
}

export interface BarredLanternWindowOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  barCount?: number;
}

export function buildBarredLanternWindow(options: BarredLanternWindowOptions): THREE.Group {
  return buildUndeadGrilleWindow({
    width: options.width,
    height: options.height,
    wallZ: options.wallZ,
    palette: toOpeningPalette(options.palette),
    barCount: options.barCount,
  });
}

export interface BlindNicheOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
}

/**
 * A blind memorial plaque niche: a recessed panel (-RECESS) framed by a
 * proud stone surround (+FRAME), with a bronze plaque plate mounted proud
 * of the recess floor -- three distinct depth layers, never a single
 * coplanar rectangle, even though there is no aperture behind it.
 */
export function buildPlaqueNiche(options: BlindNicheOptions): THREE.Group {
  const { width, height, wallZ, palette } = options;
  const group = new THREE.Group();
  group.name = 'plaque-niche';

  const recessDepth = Math.abs(depthFor('RECESS'));
  const recess = new THREE.Mesh(new THREE.BoxGeometry(width, height, recessDepth), palette.darkStone);
  recess.name = 'recess';
  recess.position.z = wallZ + depthFor('RECESS') + recessDepth / 2;
  recess.castShadow = recess.receiveShadow = true;
  group.add(recess);

  const frameThickness = Math.max(0.05, width * 0.14);
  const surroundOuter = new THREE.Shape();
  surroundOuter.moveTo(-width / 2 - frameThickness, -height / 2 - frameThickness);
  surroundOuter.lineTo(width / 2 + frameThickness, -height / 2 - frameThickness);
  surroundOuter.lineTo(width / 2 + frameThickness, height / 2 + frameThickness);
  surroundOuter.lineTo(-width / 2 - frameThickness, height / 2 + frameThickness);
  surroundOuter.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-width / 2, -height / 2);
  hole.lineTo(width / 2, -height / 2);
  hole.lineTo(width / 2, height / 2);
  hole.lineTo(-width / 2, height / 2);
  hole.closePath();
  surroundOuter.holes.push(hole);
  const surroundDepth = depthFor('FRAME');
  const surround = new THREE.Mesh(
    new THREE.ExtrudeGeometry(surroundOuter, { depth: surroundDepth, bevelEnabled: false, curveSegments: 1 }),
    palette.stone,
  );
  surround.name = 'surround';
  surround.position.z = wallZ - surroundDepth;
  surround.castShadow = surround.receiveShadow = true;
  group.add(surround);

  const plaque = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, height * 0.6, 0.02), palette.bronze);
  plaque.name = 'plaque';
  plaque.position.z = recess.position.z + recessDepth / 2 + 0.011;
  plaque.castShadow = plaque.receiveShadow = true;
  group.add(plaque);

  return group;
}

export interface ReliquaryNicheOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  seed?: number;
}

/**
 * A reliquary display niche: the same recess+surround shell as
 * `buildPlaqueNiche`, but with a real stone shelf and a small urn monument
 * standing on it rather than a flat plaque -- the "reliquary
 * niche"/"display niche" facade module used by shop/inn/villa.
 */
export function buildReliquaryNiche(options: ReliquaryNicheOptions): THREE.Group {
  const { width, height, wallZ, palette } = options;
  const group = new THREE.Group();
  group.name = 'reliquary-niche';

  const shell = buildPlaqueNiche({ width, height, wallZ, palette });
  shell.remove(shell.getObjectByName('plaque')!);
  group.add(shell);

  const recessDepth = Math.abs(depthFor('RECESS'));
  const shelfDepth = recessDepth * 0.85;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(width * 0.75, 0.03, shelfDepth), palette.stone);
  shelf.name = 'shelf';
  shelf.position.set(0, -height * 0.28, wallZ + depthFor('RECESS') + shelfDepth / 2);
  shelf.castShadow = shelf.receiveShadow = true;
  group.add(shelf);

  const urn = buildMonument({ variant: 'urn', width: width * 0.32, height: height * 0.5, material: palette.stone, seed: options.seed ?? 0 });
  urn.name = 'reliquary-urn';
  urn.position.set(0, -height * 0.28 + 0.015, wallZ + depthFor('RECESS') + shelfDepth * 0.6);
  group.add(urn);

  return group;
}

export interface ShoredCrackOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  seed?: number;
}

/**
 * A maintained repair scar: a shallow recessed crack groove crossing the
 * wall face, propped by a diagonal timber shoring beam braced against the
 * wall -- undead's "maintained decay" signature (damage is visible and
 * real, but actively braced/repaired, unlike a beautiful abandoned ruin).
 */
export function buildShoredCrack(options: ShoredCrackOptions): THREE.Group {
  const { width, height, wallZ, palette } = options;
  const rand = mulberry32(options.seed ?? 0);
  const group = new THREE.Group();
  group.name = 'shored-crack';

  const crackWidth = Math.max(0.03, width * 0.05);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(crackWidth, height * 0.85, 0.02), palette.darkStone);
  crack.name = 'crack-groove';
  crack.position.set((rand() - 0.5) * width * 0.4, 0, wallZ - 0.008);
  crack.rotation.z = (rand() - 0.5) * 0.3;
  crack.castShadow = crack.receiveShadow = true;
  group.add(crack);

  const braceLength = height * 0.75;
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.07, braceLength, 0.09), palette.timber);
  brace.name = 'shoring-brace';
  brace.position.set(crack.position.x + width * 0.18, -height * 0.05, wallZ + 0.18);
  brace.rotation.z = 0.55;
  brace.castShadow = brace.receiveShadow = true;
  group.add(brace);

  const footPad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), palette.timber);
  footPad.name = 'shoring-foot';
  footPad.position.set(brace.position.x + Math.sin(brace.rotation.z) * braceLength * 0.5, -height * 0.46, wallZ + 0.32);
  footPad.castShadow = footPad.receiveShadow = true;
  group.add(footPad);

  return group;
}

export interface SpoliaPatchOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  seed?: number;
}

/**
 * A mismatched replacement-stone patch: 2-3 individual blocks of the
 * `spolia` material, each a real separate volume sitting slightly proud
 * of the surrounding wall plane (an imprecise repair, not a texture
 * swap) -- used by house/villa/watchtower's "mismatched repair" axis.
 */
export function buildSpoliaPatch(options: SpoliaPatchOptions): THREE.Group {
  const { width, height, wallZ, palette } = options;
  const rand = mulberry32(options.seed ?? 0);
  const group = new THREE.Group();
  group.name = 'spolia-patch';

  const blockCount = 2 + Math.floor(rand() * 2);
  const blockW = width / blockCount;
  for (let i = 0; i < blockCount; i++) {
    const bw = blockW * (0.82 + rand() * 0.3);
    const bh = height * (0.7 + rand() * 0.5);
    const proud = depthFor('PILASTER') * (0.3 + rand() * 0.4);
    const block = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.14), palette.spolia);
    block.name = `spolia-block-${i}`;
    block.position.set(-width / 2 + blockW * (i + 0.5), (rand() - 0.5) * height * 0.2, wallZ + proud);
    block.rotation.z = (rand() - 0.5) * 0.05;
    block.castShadow = block.receiveShadow = true;
    group.add(block);
  }

  return group;
}

export interface ColumbariumBandOptions {
  width: number;
  height: number;
  wallZ: number;
  palette: UndeadPalette;
  rows?: number;
  cols?: number;
}

/**
 * A columbarium niche band: a small grid of blind memorial niches
 * (ash-urn storage slots) tiled across a wall bay -- villa/inn's
 * "columbarium niche band"/"columbarium niches" facade module.
 */
export function buildColumbariumBand(options: ColumbariumBandOptions): THREE.Group {
  const { width, height, wallZ, palette, rows = 2, cols = 3 } = options;
  const group = new THREE.Group();
  group.name = 'columbarium-band';

  const cellW = width / cols;
  const cellH = height / rows;
  const nicheW = cellW * 0.72;
  const nicheH = cellH * 0.72;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const niche = buildPlaqueNiche({ width: nicheW, height: nicheH, wallZ, palette });
      niche.name = `columbarium-cell-${r}-${c}`;
      niche.position.set(-width / 2 + cellW * (c + 0.5), -height / 2 + cellH * (r + 0.5), 0);
      group.add(niche);
    }
  }

  return group;
}
