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
import {
  createBlockGrid, setBlock, meshBlockGrid, type BlockGrid, type MeshBlockGridOptions,
} from './BlockKit';
import { buildVulperiaDenMoundGrid } from './FactionBlockProfiles';
import { earthTexture, barkTexture, ashStoneTexture } from './FactionBlockTextures';

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
