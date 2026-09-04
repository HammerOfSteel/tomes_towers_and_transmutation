/**
 * ElvenMarketStallKit.ts — the elven market stall ("Moonlit Exchange",
 * the `shop` building kind), rebuilt on the same real block-course +
 * carved-opening construction technique as the elven stone-tower kit
 * (docs/superpowers/specs/2026-09-03-elven-market-stall-design.md),
 * replacing the prior `BlockKit`-voxel sapling approach.
 *
 * Unlike `ElvenTreehouseKit.ts`'s fully-enclosed residential home, a
 * real market stall is genuinely OPEN: a partial back wall (not a full
 * ring) for lockable storage, a wide carved counter-opening facing the
 * "street," a fabric awning for weather/shade, and a small living
 * sapling on top -- matching real historical market-stall construction
 * (1-2 walls + an open counter, not 4 full walls) and this project's
 * own existing "Moonlit Exchange" concept (a trading platform beneath a
 * small sapling), just rebuilt with real geometry throughout.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint } from './BuildingDNA';
import { barkTexture } from './FactionBlockTextures';
import { octagonFaces } from './StoneTowerShape';
import { buildWallSurfaceBlocks } from './StoneTowerWallSurface';
import { buildRecessedArchOpening, type RecessedArchOptions } from './StoneTowerOpenings';
import { buildLivingRoofCap } from './StoneTowerRoofCap';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/** Materials for the stall's fabric awning. */
export interface StallAwningPalette {
  wood: THREE.Material;
  leaf: THREE.Material;
}

/**
 * Builds a striped fabric awning: flat alternating-colored panels
 * sloping down and outward from a ridge, extending
 * `BuildingBuilder.ts`'s existing generic `buildMarketStall()` technique
 * (real, period-accurate -- real awnings are tensioned near-flat, not a
 * cloth-sim shortcut) with an elven wood/leaf palette. Named
 * `buildStallAwning`, not `canopy` -- that name is already claimed by
 * the foliage roof (`buildLivingRoofCap`) elsewhere in this kit.
 */
export function buildStallAwning(width: number, depth: number, seed: number, palette: StallAwningPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);
  const panelCount = 5 + Math.floor(rand() * 2); // 5-6
  const panelW = width / panelCount;
  for (let i = 0; i < panelCount; i++) {
    const material = i % 2 === 0 ? palette.wood : palette.leaf;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.96, depth), material);
    panel.rotation.x = -0.3; // slopes down/outward for weather shedding
    panel.position.set(-width / 2 + panelW * (i + 0.5), 0, -depth * 0.1);
    panel.castShadow = true;
    g.add(panel);
  }
  return g;
}

/**
 * Public entry point: builds a complete elven market stall for the
 * given `BuildingDNA` (dispatched from FactionBuildingVariants.ts's
 * elven `shop` override).
 */
export function buildElvenMarketStall(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const radius = Math.max(1, Math.min(fp.w, fp.d) / 2);
  const wallHeight = 1.3; // waist-high back wall, not a full floor -- a stall, not a house
  const seedBase = dna.seed ^ 0xE1F3_5001;

  const woodMat = mat(dna.colors.walls, { roughness: 0.9, map: barkTexture(Math.max(1, radius), Math.max(1, wallHeight)) });
  const leafMat = mat(dna.colors.roof, { roughness: 0.75 });
  const barkMat = mat('#4a3520', { roughness: 0.9, map: barkTexture() });
  const cavityMat = mat('#1a140c', { roughness: 0.95 });
  const moonstoneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d8e8f0'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.7, roughness: 0.5,
  });

  const g = new THREE.Group();

  // Partial back wall: only 3 of the octagon's 8 faces (the back half,
  // roughly facing away from the "street") -- a genuine partial wall
  // via buildWallSurfaceBlocks' facesOverride, not a full enclosed ring
  // (the single biggest fix per the research: real stalls are 1-2
  // walls, not 4).
  const allFaces = octagonFaces(radius);
  const backFaces = [allFaces[3]!, allFaces[4]!, allFaces[5]!];
  const wall = buildWallSurfaceBlocks(radius, wallHeight, seedBase, woodMat, { facesOverride: backFaces });
  wall.name = 'elven-stall-back-wall';
  g.add(wall);

  // Carved counter-opening: a wide, short (square-topped, pointHeight=0)
  // recessed opening in the center back face -- the same genuinely
  // carved technique as the tower's doors/windows, sized for a counter
  // rather than a doorway.
  const counterFace = allFaces[4]!;
  const counterOpts: RecessedArchOptions = {
    width: radius * 1.0,
    straightHeight: wallHeight * 0.4,
    pointHeight: 0,
    recessDepth: radius * 0.14,
    frameWidth: radius * 0.06,
    frameProud: radius * 0.04,
  };
  const counter = buildRecessedArchOpening(counterOpts, radius, cavityMat, woodMat);
  counter.position.y = wallHeight * 0.32;
  counter.rotation.y = counterFace.normalAngle;
  g.add(counter);

  // Counter slab (waist-height display shelf), posts, awning, and sign all
  // sit on the OPEN "front"/customer side -- the OPPOSITE direction from
  // the back wall's own outward normal, not further behind it. (A real
  // stall's counter projects toward the street, not into the exterior
  // behind its own back wall.)
  const slabAngle = counterFace.normalAngle + Math.PI;
  const slabDist = radius + radius * 0.22;
  const counterSlab = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.1, 0.1, radius * 0.4), woodMat);
  counterSlab.position.set(Math.sin(slabAngle) * slabDist, wallHeight * 0.32, Math.cos(slabAngle) * slabDist);
  counterSlab.rotation.y = slabAngle;
  counterSlab.castShadow = counterSlab.receiveShadow = true;
  g.add(counterSlab);

  // 2 corner posts (bark-textured, thematically small tree-limb posts
  // rather than plain iron poles) framing the open counter side.
  for (const side of [-1, 1]) {
    const postAngle = slabAngle + side * 0.7;
    const postDist = radius * 1.05;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.06, radius * 0.08, wallHeight + 0.5, 6), barkMat);
    post.position.set(Math.sin(postAngle) * postDist, (wallHeight + 0.5) / 2, Math.cos(postAngle) * postDist);
    post.castShadow = true;
    g.add(post);
  }

  // Fabric awning over the counter.
  const awning = buildStallAwning(radius * 2.0, radius * 1.3, seedBase ^ 0x1, { wood: woodMat, leaf: leafMat });
  awning.position.set(Math.sin(slabAngle) * (radius * 0.6), wallHeight + 0.5, Math.cos(slabAngle) * (radius * 0.6));
  awning.rotation.y = slabAngle;
  g.add(awning);

  // Small living sapling canopy on a short trunk stub above the back
  // wall -- the same "grown from a living tree" identity as the
  // treehouse home's own roof, just miniature.
  const trunkH = 0.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.15, radius * 0.22, trunkH, 8), barkMat);
  trunk.position.y = wallHeight + trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const canopy = buildLivingRoofCap(seedBase ^ 0x1DEA, radius * 0.55, { leaf: leafMat, bark: barkMat });
  canopy.name = 'elven-stall-sapling-canopy';
  canopy.position.y = wallHeight + trunkH;
  g.add(canopy);

  // Hanging trade-sign: a bark-textured bracket + board with a glowing
  // moonstone accent standing in for a carved trade symbol (the
  // historical illiterate-customer convention -- a pictorial symbol,
  // not lettering).
  const signAngle = slabAngle + 0.9;
  const signDist = radius * 1.1;
  const signX = Math.sin(signAngle) * signDist, signZ = Math.cos(signAngle) * signDist;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), barkMat);
  bracket.position.set(signX, wallHeight + 0.35, signZ);
  g.add(bracket);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), woodMat);
  board.position.set(signX, wallHeight + 0.1, signZ);
  board.rotation.y = signAngle;
  g.add(board);
  const symbol = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), moonstoneMat);
  symbol.position.set(signX + Math.sin(signAngle) * 0.03, wallHeight + 0.1, signZ + Math.cos(signAngle) * 0.03);
  g.add(symbol);

  // Goods on the counter + hanging glow-motes (kept from the prior
  // implementation -- already-established elven "moonlit night market"
  // flavor, not part of the technique complaint).
  const r = mulberry32(seedBase ^ 0x2);
  const goodsMat = mat('#c8783a', { roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const good = new THREE.Mesh(new THREE.SphereGeometry(0.09 + r() * 0.04, 6, 6), goodsMat);
    const goodAngle = slabAngle + (i - 1) * 0.25;
    const goodDist = radius * 1.25;
    good.position.set(Math.sin(goodAngle) * goodDist, wallHeight * 0.32 + 0.12, Math.cos(goodAngle) * goodDist);
    g.add(good);
  }
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.8 });
  for (let i = 0; i < 3; i++) {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.04 + r() * 0.015, 6, 6), glowMat));
    const last = g.children[g.children.length - 1]!;
    last.position.set((r() - 0.5) * radius * 1.6, wallHeight + 0.6 + r() * 0.3, (r() - 0.5) * radius * 1.6);
  }

  return g;
}
