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
import type { WorldCell } from './WorldGrid';

export type ScatterKind = 'tree' | 'bush' | 'rock' | 'camp' | 'ruin';

/**
 * Returns whether a scatter object of the given kind may be placed on
 * `cell`. All kinds share the "never on water, never on a road, never on
 * a non-empty/occupied tile, never inside a settlement zone" rules; trees
 * and bushes additionally exclude sand (no trees/undergrowth on a beach —
 * see `_scatterBeachDecor` for what DOES go there) and low/bog elevation
 * (unchanged from the pre-existing behavior).
 */
export function isScatterAllowed(cell: WorldCell, kind: ScatterKind): boolean {
  if (cell.biome === 'water') return false;
  if (cell.settlementId > 0) return false;

  if (kind === 'tree' || kind === 'bush' || kind === 'rock') {
    if (cell.feature === 'road' || cell.feature === 'road_dirt') return false;
    if (cell.content !== 'empty') return false;
  }

  if (kind === 'tree' || kind === 'bush') {
    if (cell.biome === 'sand') return false;
    if (cell.elevation < 1) return false; // no trees/undergrowth on bog
  }

  return true;
}
