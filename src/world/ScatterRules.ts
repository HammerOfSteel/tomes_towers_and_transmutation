/**
 * ScatterRules.ts — centralizes "is it OK to place a scatter object (tree,
 * bush, rock, enemy camp, ruin) on this cell?" logic.
 *
 * Before this module, each of OverworldScene's five scatter methods
 * (_plantTrees, _plantBushes, _placeRocks, _spawnCamps, _addRuins)
 * duplicated a slightly different subset of these checks ad-hoc.
 * _spawnCamps and _addRuins had NO water exclusion at all, meaning
 * enemies/ruins could land on open water. _plantTrees/_plantBushes used
 * an `elevation < 1` heuristic that doesn't reliably exclude the shallow
 * ocean band (it quantizes to elevation === 1, same as ordinary dry
 * land). This module is the single, testable source of truth instead.
 */
import type { WorldCell, WorldGrid } from './WorldGrid';

export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin' | 'grass' | 'ambient';

/**
 * Returns whether a scatter object of the given kind may be placed on
 * `cell`. All kinds share the "never on water, never on a road, never on
 * a non-empty/occupied tile, never inside a settlement zone" rules; trees
 * and bushes additionally exclude sand (no trees/undergrowth on a beach —
 * see `_scatterBeachDecor` for what DOES go there) and low/bog elevation
 * (unchanged from the pre-existing behavior).
 */
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
  // A river/lake tile sits on an ordinary land biome (not a special water
  // biome, since Phase 3's lakes) — waterDepth is the generic "is this
  // actually water" signal already used elsewhere (WaterDetection.ts,
  // TerrainGeometryBuilder.ts), so check it directly rather than
  // enumerating feature==='river'/'lake' by name.
  if (cell.waterDepth > 0) return false;
  if (cell.settlementId > 0) return false;

  if (kind === 'tree' || kind === 'bush' || kind === 'rock' || kind === 'grass' || kind === 'ambient') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }

  if (kind === 'tree' || kind === 'bush') {
    if (cell.biome === 'beach') return false;
    if (cell.elevation < 1) return false; // no trees/undergrowth in the lowest band
  }

  return true;
}

/** Decor kinds that are specifically FOR water/water-adjacent tiles — the exact
 *  inverse concern from `isScatterAllowed()` above, which unconditionally
 *  excludes every one of ITS kinds from any water tile. Kept as a separate
 *  function rather than a new `ScatterKind` case: folding a "wants water"
 *  exception into `isScatterAllowed()` would undermine its whole reason for
 *  existing (a single airtight "never on water" guarantee for every kind it
 *  already covers) with a confusing, easy-to-misread special case. */
export type WaterDecorKind = 'reed' | 'underwater';

/**
 * Returns whether a water/water-adjacent decorative prop (shoreline reeds,
 * underwater rocks/seaweed) may be placed on `cell`. `'reed'` is for any DRY
 * tile — river, lake, or ocean shoreline alike, not just `river_bank`-tagged
 * tiles (only river tiles get that specific feature tag; lakes/oceans don't,
 * per `HydrologyGenerator.ts`) — excluding `beach` biome, which already has
 * its own decor (`_buildChunkBeachDecor()`'s driftwood/dune-grass/pebbles).
 * Actual shoreline ADJACENCY (is this dry tile actually next to water?) is a
 * grid-neighbor question this per-cell function can't answer alone — see
 * `isNearWaterTile()`, which the caller combines with this check. `'underwater'`
 * is for any actually-submerged tile (`waterDepth > 0` — river, lake, ocean,
 * deep_ocean alike), the one intentional exception to every other scatter
 * kind's water exclusion.
 */
export function isWaterDecorAllowed(cell: WorldCell, kind: WaterDecorKind): boolean {
  if (cell.settlementId > 0) return false;
  if (cell.content !== 'empty') return false;
  if (kind === 'reed') return cell.waterDepth === 0 && cell.biome !== 'beach';
  return cell.waterDepth > 0; // 'underwater'
}

/** True if the tile at (col, row) has at least one orthogonal neighbor that's
 *  actually submerged (`waterDepth > 0`) — the shoreline-adjacency half of
 *  reed placement that `isWaterDecorAllowed()` can't determine from a single
 *  cell alone. Out-of-bounds neighbors are skipped (not counted either way),
 *  matching the same map-edge-safety convention used elsewhere (e.g.
 *  `GrassField.ts`'s `computeEdgeBlend()`). */
export function isNearWaterTile(wg: WorldGrid, col: number, row: number): boolean {
  const deltas: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dc, dr] of deltas) {
    const c = col + dc, r = row + dr;
    if (c < 0 || c >= wg.width || r < 0 || r >= wg.height) continue;
    if (wg.get(c, r).waterDepth > 0) return true;
  }
  return false;
}

