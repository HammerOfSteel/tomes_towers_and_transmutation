/**
 * FactionTerritoryProps.ts — Phase 6 (race-specific biome territory
 * dressing), batch 1: vulperia, undead, fae. Each faction's props are
 * built as `BlockGrid`s (same voxel/chamfered-block system building walls
 * use, see BlockKit.ts) at scatter scale (much smaller than a building),
 * reusing existing faction textures so dressing visually matches the
 * architecture it surrounds. See
 * docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md §4.
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import {
  createBlockGrid, setBlock, meshBlockGrid, type BlockGrid, type MeshBlockGridOptions,
} from './BlockKit';
import { buildVulperiaDenMoundGrid } from './FactionBlockProfiles';
import { earthTexture, barkTexture, ashStoneTexture, toadstoolTexture } from './FactionBlockTextures';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

// ── Vulperia ──────────────────────────────────────────────────────────────────

/** Small grounded dirt dome (~2.5x2x1.2 WU) with a carved burrow entrance
 *  at the front — reuses the exact same heightfield-mound occupancy
 *  technique buildVulperiaDenMoundGrid() already uses for building-scale
 *  den mounds, just at scatter scale. */
export function buildVulperiaWarrenMoundGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 2.5, 2, 1.2, { facade: true });
}

/** Smaller, flatter secondary den entrance (~1.5x1.5x0.8 WU) -- same
 *  technique, no facade needed since the whole mound reads as a low
 *  burrow-hole cluster rather than a proper doorway. */
export function buildVulperiaBurrowHoleGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 1.5, 1.5, 0.8, { facade: false });
}

/** A short bark-textured post topped by a wider 3x3 "woven" cap layer --
 *  reads as a twig/den marker, visually distinct from the two mound
 *  shapes above. Fixed shape (no seed/variation needed -- a small,
 *  deliberately-designed marker, not a procedural silhouette). */
export function buildVulperiaDenMarkerGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'bark');
  setBlock(grid, 0, 1, 0, 'bark');
  for (let bx = -1; bx <= 1; bx++) {
    for (let bz = -1; bz <= 1; bz++) {
      setBlock(grid, bx, 2, bz, 'woven');
    }
  }
  return grid;
}

export function meshVulperiaWarrenMound(seed: number): THREE.Group {
  const grid = buildVulperiaWarrenMoundGrid(seed);
  const palette = { earth: mat('#6b4a2f', { map: earthTexture() }), grass: mat('#4a6b2f'), facade: mat('#3d2e1a') };
  return meshBlockGrid(grid, palette, {});
}

export function meshVulperiaBurrowHole(seed: number): THREE.Group {
  const grid = buildVulperiaBurrowHoleGrid(seed);
  const palette = { earth: mat('#6b4a2f', { map: earthTexture() }), grass: mat('#4a6b2f') };
  return meshBlockGrid(grid, palette, {});
}

export function meshVulperiaDenMarker(): THREE.Group {
  const grid = buildVulperiaDenMarkerGrid();
  const palette = { bark: mat('#5a4530', { map: barkTexture() }), woven: mat('#8a6d3f') };
  return meshBlockGrid(grid, palette, {});
}

// ── Undead ────────────────────────────────────────────────────────────────────

/** Upright ashstone slab, ~1x3x1 blocks -- taller than wide, reading as a
 *  simple standing tombstone. Fixed shape (no seed needed). */
export function buildUndeadGravestoneGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'ashstone');
  setBlock(grid, 0, 1, 0, 'ashstone');
  setBlock(grid, 0, 2, 0, 'ashstone');
  return grid;
}

/** Low, irregular 2x2 footprint pile, one block tall except a single
 *  randomly-chosen corner raised to 2 -- a scattered bone-pile read
 *  rather than a neat stack. */
export function buildUndeadBonePileGrid(seed: number): BlockGrid {
  const grid = createBlockGrid();
  const corners: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [bx, bz] of corners) setBlock(grid, bx, 0, bz, 'bone');
  const raised = corners[Math.abs(seed) % corners.length]!;
  setBlock(grid, raised[0], 1, raised[1], 'bone');
  return grid;
}

/** Same grounded heightfield-mound technique as the vulperia warren mound
 *  (buildVulperiaDenMoundGrid) -- deliberately reusing the shared engine
 *  to show a very different read purely from chamfer settings (forced
 *  jagged, see meshUndeadCrumblingMound's suppressChamfer) and palette
 *  (ashstone, not earth) alone. No facade -- a decayed mound, not a
 *  proper burrow. */
export function buildUndeadCrumblingMoundGrid(seed: number): BlockGrid {
  return buildVulperiaDenMoundGrid(seed, 2.2, 2, 1.1, { facade: false, jitter: 0.3 });
}

export function meshUndeadGravestone(): THREE.Group {
  const grid = buildUndeadGravestoneGrid();
  const palette = { ashstone: mat('#8a8a85', { map: ashStoneTexture() }) };
  return meshBlockGrid(grid, palette, {});
}

export function meshUndeadBonePile(seed: number): THREE.Group {
  const grid = buildUndeadBonePileGrid(seed);
  const palette = { bone: mat('#d8d0b8') };
  return meshBlockGrid(grid, palette, {});
}

export function meshUndeadCrumblingMound(seed: number): THREE.Group {
  const grid = buildUndeadCrumblingMoundGrid(seed);
  const palette = { earth: mat('#6b6b60', { map: ashStoneTexture() }), grass: mat('#5a5a50') };
  // Force every edge sharp -- a decayed, broken silhouette rather than
  // the vulperia mound's soft organic chamfering (same suppressChamfer
  // mechanism FactionBuildingVariants.ts already uses for undead's
  // "deliberate decay" spire, see FactionBlockProfiles.ts's
  // buildUndeadTierGrid doc comment).
  const opts: MeshBlockGridOptions = { suppressChamfer: () => true };
  return meshBlockGrid(grid, palette, opts);
}

// ── Fae ───────────────────────────────────────────────────────────────────────

/** Small scatter-scale toadstool: a 1-block stalk column topped by a 3x3
 *  cap layer -- a genuinely small object (unlike buildFaeStalkGrid's
 *  building-scale minimum of 8 block-levels tall), purpose-built for
 *  ground-level scatter rather than reusing the Fae Court's own
 *  building-scale mushroom-hut profile. */
export function buildFaeSmallMushroomGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'stalk');
  setBlock(grid, 0, 1, 0, 'stalk');
  for (let bx = -1; bx <= 1; bx++) {
    for (let bz = -1; bz <= 1; bz++) {
      setBlock(grid, bx, 2, bz, 'cap');
    }
  }
  return grid;
}

/** Taller/wider variant: a 3-block stalk topped by a 5x5 cap layer. */
export function buildFaeLargeMushroomGrid(): BlockGrid {
  const grid = createBlockGrid();
  setBlock(grid, 0, 0, 0, 'stalk');
  setBlock(grid, 0, 1, 0, 'stalk');
  setBlock(grid, 0, 2, 0, 'stalk');
  for (let bx = -2; bx <= 2; bx++) {
    for (let bz = -2; bz <= 2; bz++) {
      setBlock(grid, bx, 3, bz, 'cap');
    }
  }
  return grid;
}

function faeMushroomPalette(): Record<string, THREE.MeshStandardMaterial> {
  return {
    stalk: mat('#d8d8c0', { roughness: 0.6, map: toadstoolTexture() }),
    cap: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c8ffb0'), map: toadstoolTexture(),
      emissive: new THREE.Color('#a0ff70'), emissiveIntensity: 0.6, roughness: 0.5,
    }),
  };
}

export function meshFaeSmallMushroom(): THREE.Group {
  return meshBlockGrid(buildFaeSmallMushroomGrid(), faeMushroomPalette(), {});
}

export function meshFaeLargeMushroom(): THREE.Group {
  return meshBlockGrid(buildFaeLargeMushroomGrid(), faeMushroomPalette(), {});
}

/** Composite "fairy ring": 5-6 clones of the small mushroom template
 *  arranged in a circle around the scatter point -- not its own BlockGrid,
 *  an arrangement of another prop's mesh (mirrors the Fae Court building's
 *  own "ring of smaller block-built toadstools clustered around the main
 *  one... each a reduced-scale instance of the same grid, not a separate
 *  primitive" pattern in FactionBuildingVariants.ts). Deterministic per
 *  seed via mulberry32 (project convention -- never Math.random()). */
export function meshFaeMushroomRing(seed: number): THREE.Group {
  const ring = new THREE.Group();
  const rand = mulberry32(seed);
  const count = 5 + Math.floor(rand() * 2); // 5 or 6
  const radius = 1.5 + rand() * 0.5; // 1.5-2.0 WU
  const template = meshFaeSmallMushroom();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
    const clone = template.clone();
    clone.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    clone.rotation.y = rand() * Math.PI * 2;
    ring.add(clone);
  }
  return ring;
}
