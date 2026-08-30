/**
 * LakeGenerator — carves lakes into a WorldGrid, reusing the river
 * swim-collision machinery (waterDepth-driven carving/collision/swim
 * detection — see WaterDepthConfig.ts and TerrainGeometryBuilder.ts).
 * See docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §3.
 */

import { WorldGrid } from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import { mulberry32 } from '@/core/prng';
import { LAKE_DEPTH_WU } from './WaterDepthConfig';
import { selectLakeSources, floodFillBasin } from './LakeSiting';

// Minimum source spacing as fraction of grid width — mirrors river source spacing.
const LAKE_MIN_SPACING_FRAC = 0.15;
// Tile budget per lake — reads as a small pond, not a sprawling sea.
const LAKE_MAX_SIZE = 40;

export function generateLakes(
  grid:   WorldGrid,
  config: WorldGenConfig,
  seed:   number,
): void {
  // Distinct PRNG stream from rivers (0x4C414B45 = 'LAKE' in ASCII hex).
  const rand = mulberry32(seed ^ 0x4C_41_4B_45);
  const GW = grid.width;
  const GH = grid.height;
  const minSpacing = GW * LAKE_MIN_SPACING_FRAC;

  const elevationAt = (col: number, row: number) => grid.get(col, row).elevation;
  const isBlocked   = (col: number, row: number) => grid.get(col, row).feature !== 'none';

  const sources = selectLakeSources(
    GW, GH, elevationAt, isBlocked, minSpacing, config.lakeCount, rand,
  );

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

  for (const source of sources) {
    // A source could have been claimed by a lake basin sited earlier in
    // this same loop (floodFillBasin doesn't know about prior lakes) —
    // re-check before flood-filling from it.
    if (isBlocked(source.col, source.row)) continue;

    const basin = floodFillBasin(source, GW, GH, elevationAt, isBlocked, LAKE_MAX_SIZE);
    for (const { col, row } of basin) {
      grid.set(col, row, { feature: 'lake', walkable: false, waterDepth: LAKE_DEPTH_WU });

      // Mark orthogonal neighbours as river_bank (if not already water/feature) —
      // reuses the existing bank tile type since "dry land immediately
      // touching water" has no river-specific meaning otherwise.
      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= GW || nr < 0 || nr >= GH) continue;
        if (grid.get(nc, nr).feature === 'none') {
          grid.set(nc, nr, { feature: 'river_bank' });
        }
      }
    }
  }
}
