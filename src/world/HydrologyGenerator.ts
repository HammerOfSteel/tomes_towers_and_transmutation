/**
 * HydrologyGenerator — carves rivers into a WorldGrid.
 *
 * Algorithm (OW-2):
 *   1. Pick `config.riverCount` source tiles from the outer rim (elevation ≥ 3,
 *      tile-radius > 70 % of half-width), spaced at least 15 % of grid-width apart.
 *   2. Walk each source downhill: at each step choose the unvisited orthogonal
 *      neighbour with the best score = elevation × 100 + distToCenter.  This drives
 *      rivers inward while preferring the steepest descent.
 *   3. Terminate a path when it enters the tower flat-zone
 *      (tR < FR × FLAT_MARGIN) or hits the world edge.
 *   4. Mark walked tiles as feature='river', walkable=false.
 *      Orthogonal neighbours of river tiles get feature='river_bank'.
 *
 * Rivers physically block the player (RI-3): each river tile gets
 * `waterDepth = RIVER_DEPTH_WU`, which `TerrainGeometryBuilder` carves into
 * both the visual mesh and the Rapier collider as a real basin — walking in
 * drops the player into real swim state (see `WaterDetection.getWaterInfoAt`
 * and `OverworldScene.update()`). `walkable=false` remains a data flag for
 * AI pathfinding; fords (tiles where a generated road crosses a river) are
 * re-tagged `feature='river_ford'`, `waterDepth=0`, `walkable=true` by
 * `WorldGenerator.buildWorldData()` after roads are built.
 */

import { WorldGrid } from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import { mulberry32 } from '@/core/prng';
import { RIVER_DEPTH_WU } from './WaterDepthConfig';
import { ELEVATION_LEVELS } from './RealmToWorldGrid';
import { selectRiverSources, flowDownhill } from './RiverFlow';

// Terminate river before it enters the flat tower zone
const FLAT_MARGIN     = 1.8;
// High-elevation rim: source tiles must be this far out (fraction of half-width)
const SOURCE_MIN_FRAC = 0.70;
// Minimum source spacing as fraction of grid width
const SOURCE_MIN_SPACING_FRAC = 0.15;
// Maximum river path length (safety cap)
const MAX_STEPS = 512;
// River sources must sit at or above this elevation level — the top ~40% of
// levels (matches the original "elevation >= 3" out of 0-4 before Phase 1's
// widening to 0-7; recomputed from ELEVATION_LEVELS so this stays correct
// if the level count changes again).
const RIVER_SOURCE_MIN_LEVEL = Math.round(ELEVATION_LEVELS * 0.6);

export function generateHydrology(
  grid:   WorldGrid,
  config: WorldGenConfig,
  seed:   number,
): void {
  const rand = mulberry32(seed ^ 0x77_A1_F0_3C);

  const GW  = grid.width;
  const GH  = grid.height;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);
  const terminateR  = FR * FLAT_MARGIN;
  const sourceMinR  = GHW * SOURCE_MIN_FRAC;
  const minSpacing  = GW * SOURCE_MIN_SPACING_FRAC;

  // The actual source-selection and downhill-walk algorithm lives in the
  // pure, grid-shape-agnostic RiverFlow.ts (shared with RealmGenerator.ts's
  // Studio preview) — see
  // docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §2.
  const elevationAt = (col: number, row: number) => grid.get(col, row).elevation;
  const isRiver      = (col: number, row: number) => grid.get(col, row).feature === 'river';

  const chosen = selectRiverSources(
    GW, GH, elevationAt, RIVER_SOURCE_MIN_LEVEL, sourceMinR, minSpacing, config.riverCount, rand,
  );

  for (const source of chosen) {
    const path = flowDownhill(source, GW, GH, elevationAt, isRiver, terminateR, MAX_STEPS);
    _markRiverPath(grid, path, GW, GH);
  }
}

// ── Internal: mark river cells and banks ───────────────────────────────────────

function _markRiverPath(
  grid: WorldGrid,
  path: { col: number; row: number }[],
  GW:   number,
  GH:   number,
): void {
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

  for (const { col, row } of path) {
    // Mark tile as river — waterDepth carves a real physical basin (see
    // WaterDepthConfig.ts) so the terrain collider actually has a hole here,
    // not just a cosmetic surface tint.
    grid.set(col, row, { feature: 'river', walkable: false, waterDepth: RIVER_DEPTH_WU });

    // Mark orthogonal neighbours as river_bank (if not already water/river)
    for (const [dc, dr] of DIRS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= GW || nr < 0 || nr >= GH) continue;
      const c = grid.get(nc, nr);
      if (c.feature === 'none') {
        grid.set(nc, nr, { feature: 'river_bank' });
      }
    }
  }
}
