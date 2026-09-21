/**
 * RealmToWorldGrid.ts — builds a live-game WorldGrid directly from a
 * Studio-generated RealmData (P0/foundation-rebuild of the Studio<->live
 * parity work, see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md).
 *
 * WorldGrid.BiomeId is now identical to RealmBiome (see WorldGrid.ts), so
 * biome values pass through unchanged — no collapsing table. Realm and
 * world grid are generated at the same size (WorldGenerator.ts calls
 * generateRealmData(seed, config.worldSize, config.worldSize)), so this
 * is a direct 1:1 index, not a resample. A defensive nearest-index
 * fallback is kept for the (currently unused) case of a differently-sized
 * realm being passed in, so this function never throws on legitimate
 * mismatched input.
 */

import { WorldGrid } from './WorldGrid';
import type { WorldSize } from './WorldGenConfig';
import type { RealmData } from '@/overworld-studio';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from './WaterDepthConfig';

/** Number of discrete elevation levels WorldGrid cells quantize into (0 to
 *  ELEVATION_LEVELS-1). Widened from the original 5 (0-4) to 8 (0-7) as
 *  Phase 1 of the biome/terrain overhaul, giving finer terracing gradation
 *  and ~75% more total height range at the same per-level height
 *  (LEVEL_HEIGHT in WaterDepthConfig.ts is unchanged) — see
 *  docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 1.
 *  Exported so WorldGenerator.ts's rim-bias clamp and any other consumer
 *  that needs "the current max level" can derive it from one source of
 *  truth instead of duplicating the magic number 7. */
export const ELEVATION_LEVELS = 8;

/** Quantize a continuous 0..1 realm elevation into WorldGrid's discrete
 *  elevation levels (0 to ELEVATION_LEVELS-1). */
function quantizeElevation(elevation: number): number {
  return Math.max(0, Math.min(ELEVATION_LEVELS - 1, Math.floor(elevation * ELEVATION_LEVELS)));
}

const NEIGHBOR_OFFSETS_8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],           [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/** One-pass 3x3 neighbor-average smoothing applied AFTER quantization, so
 *  a single spiked cell doesn't read as an isolated "pixel" blob of
 *  elevation — the cell's own (already-quantized) value counts double in
 *  the average (weight 2 of 10 total, vs weight 1 for each of up to 8
 *  neighbors) so real ridgelines/plateaus aren't smoothed flat, just
 *  de-spiked. Reads from a snapshot of the pre-smoothing elevations (not
 *  live `grid.get()` values being written mid-pass) so the result doesn't
 *  depend on sweep order. Water tiles are excluded from both being
 *  smoothed and from contributing to a neighbor's average — elevation
 *  levels under water carve to depth via a separate mechanism (see
 *  WaterDepthConfig.ts's physicalHeightWU), not through this level field.
 *  See docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md
 *  §3a. */
function _smoothQuantizedElevation(grid: WorldGrid, worldSize: number): void {
  const isWater = (biome: string) => biome === 'ocean' || biome === 'deep_ocean';
  const snapshot: number[][] = [];
  for (let row = 0; row < worldSize; row++) {
    snapshot.push(Array.from({ length: worldSize }, (_, col) => grid.get(col, row).elevation));
  }
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = grid.get(col, row);
      if (isWater(cell.biome)) continue;
      let sum = snapshot[row]![col]! * 2;
      let count = 2;
      for (const [dc, dr] of NEIGHBOR_OFFSETS_8) {
        const nCol = col + dc, nRow = row + dr;
        if (nCol < 0 || nCol >= worldSize || nRow < 0 || nRow >= worldSize) continue;
        const nCell = grid.get(nCol, nRow);
        if (isWater(nCell.biome)) continue;
        sum += snapshot[nRow]![nCol]!;
        count++;
      }
      grid.set(col, row, { elevation: Math.round(sum / count) });
    }
  }
}

/**
 * Sample a realm cell for a target WorldGrid position. Direct 1:1 index
 * when `realm` is already `worldSize x worldSize` (the normal case);
 * nearest-neighbor fallback otherwise so mismatched sizes degrade
 * gracefully instead of throwing.
 */
function sampleRealmCell(realm: RealmData, col: number, row: number, worldSize: number) {
  const realmW = Math.max(1, realm.W);
  const realmH = Math.max(1, realm.H);
  if (realmW === worldSize && realmH === worldSize) {
    return realm.cells[row]![col]!;
  }
  const rx = Math.min(realmW - 1, Math.floor((col / worldSize) * realmW));
  const ry = Math.min(realmH - 1, Math.floor((row / worldSize) * realmH));
  return realm.cells[ry]![rx]!;
}

export function realmToWorldGrid(realm: RealmData, worldSize: number): WorldGrid {
  const grid = new WorldGrid(worldSize as WorldSize, worldSize as WorldSize);
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = sampleRealmCell(realm, col, row, worldSize);
      const biome = cell.biome;
      // Ocean tiles get a real carved depth (RI-3, already shipped) so
      // they're physically swimmable — two tiers so `ocean` (shallow,
      // coastal ring) reads as wading depth while `deep_ocean` (open
      // water) triggers real swim mode.
      const isWater = biome === 'deep_ocean' || biome === 'ocean';
      const waterDepth = biome === 'deep_ocean' ? OCEAN_DEEP_DEPTH_WU
                        : biome === 'ocean'      ? OCEAN_SHALLOW_DEPTH_WU
                        : 0;
      grid.set(col, row, {
        elevation: quantizeElevation(cell.elevation),
        biome,
        waterDepth,
        walkable: !isWater,
      });
    }
  }
  _smoothQuantizedElevation(grid, worldSize);
  return grid;
}
