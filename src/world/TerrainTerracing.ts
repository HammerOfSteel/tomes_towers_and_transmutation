/**
 * TerrainTerracing.ts — enforces a maximum 1-level elevation difference
 * between any two orthogonally-adjacent dry-land WorldGrid tiles, by
 * repeatedly raising (never lowering) the lower tile of any such pair.
 *
 * This is what lets TerrainKit.ts's existing single-level ramp classifier
 * (classifyTileShape()) handle every elevation drop in the world without
 * any changes to that file: after this pass runs, no multi-level "cliff"
 * drop can exist, because every drop greater than 1 level has been
 * converted into a run of single-level steps.
 *
 * Monotonically non-decreasing (only raises) and bounded above by
 * ELEVATION_LEVELS-1, so this always converges to a unique fixed point
 * regardless of sweep order — the same terrain terraces identically no
 * matter how many times or in what order this runs, which is what keeps
 * tile/chunk boundary agreement intact (see
 * docs/superpowers/specs/2026-09-22-terrain-elevation-slopes-design.md §4).
 */

import { WorldGrid, type WorldCell } from './WorldGrid';

const NEIGHBOR_OFFSETS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function _isTerracingEligible(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return cell.biome !== 'ocean' && cell.biome !== 'deep_ocean' && cell.waterDepth === 0;
}

/**
 * Mutates `grid` in place. Water tiles (ocean/deep_ocean biome, or any
 * tile with waterDepth > 0 — river/lake carves) are excluded from both
 * being raised and from acting as a neighbor pull, since ramp/slope
 * geometry only ever applies to dry land — a coastline or riverbank
 * keeps its existing vertical-wall-into-the-basin look, unaffected by
 * this pass.
 */
export function terraceElevation(grid: WorldGrid): void {
  const { width, height } = grid;
  const maxIterations = Math.max(width, height);
  let changed = true;
  let iterations = 0;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = grid.get(col, row);
        if (!_isTerracingEligible(cell)) continue;
        let target = cell.elevation;
        for (const [dc, dr] of NEIGHBOR_OFFSETS_4) {
          const nCol = col + dc, nRow = row + dr;
          if (nCol < 0 || nCol >= width || nRow < 0 || nRow >= height) continue;
          const nCell = grid.get(nCol, nRow);
          if (!_isTerracingEligible(nCell)) continue;
          if (nCell.elevation > target + 1) target = nCell.elevation - 1;
        }
        if (target !== cell.elevation) {
          grid.set(col, row, { elevation: target });
          changed = true;
        }
      }
    }
  }
}
