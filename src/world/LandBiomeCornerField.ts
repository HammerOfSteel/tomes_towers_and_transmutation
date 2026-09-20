// ── LandBiomeCornerField — dual-grid corner-pull for land-biome borders ──────
//
//  Sub-task 1.1 of Overworld/Outdoor Polish Phase 1. Generalizes
//  ShorelineCornerField.ts's water/land "odd one out" corner-pull to
//  land-biome borders (grassland<->desert, forest<->tundra, etc.), reusing
//  DualGridCornerPull.ts's binary case-table math unchanged — shape only
//  ever depends on the corners' EQUALITY pattern, never on which specific
//  biomes are involved, so no N-biome case table is needed. See
//  docs/superpowers/specs/2026-09-20-land-biome-dual-grid-borders-design.md.
//
//  Scope guard: only applies at vertices where all 4 surrounding tiles are
//  dry land (no water tile touching). A vertex touching any water tile
//  keeps using ONLY ShorelineCornerField's water/land pull (merged in
//  TerrainGeometryBuilder.ts) — this avoids two independent pull sources
//  fighting over the same vertex.
//
//  N-biome ambiguity: a vertex can touch 3 or 4 DISTINCT biomes, which has
//  no natural binary split. Resolved via a "plurality" reduction — each of
//  the 4 tiles is classified as matching-the-plurality-biome (1) or not
//  (0), where "plurality" is whichever biome appears most often among the
//  4 (ties broken by BIOME_ORDER, a fixed canonical order matching
//  WorldGrid.ts's BiomeId union declaration order) — before feeding the
//  existing binary case table.

import { cornerPull } from './DualGridCornerPull';
import type { WorldGrid, BiomeId } from './WorldGrid';

/** Same magnitude as ShorelineCornerField's SHORELINE_CORNER_PULL_WU — see
 *  that module's own design-spec reasoning for the bound (clearly larger
 *  than ShorelineWobble's 0.4 WU noise amplitude, leaving headroom under a
 *  tile's 1.0 WU half-width). Kept as an independent constant (not a
 *  re-export) since land-biome and water/land borders are conceptually
 *  separate tunables even though they start at the same value. */
export const LAND_BIOME_CORNER_PULL_WU = 0.5;

/** Fixed canonical order for plurality tie-breaking — matches WorldGrid.ts's
 *  BiomeId union declaration order exactly, so this stays in sync if a new
 *  biome is ever added there (deliberately not alphabetical — mirrors the
 *  source of truth instead of an arbitrary independent ordering). */
const BIOME_ORDER: readonly BiomeId[] = [
  'deep_ocean', 'ocean', 'beach', 'desert', 'savanna', 'grassland',
  'forest', 'taiga', 'tundra', 'snow', 'mountain',
];

/**
 * Reduces 4 (possibly all-distinct) biomes to a binary 4-corner config:
 * 1 where a corner matches the "plurality" biome (the most frequent among
 * the 4, ties broken by BIOME_ORDER), 0 otherwise.
 */
export function pluralityBiomeConfig(
  biomes: readonly [BiomeId, BiomeId, BiomeId, BiomeId],
): [number, number, number, number] {
  const counts = new Map<BiomeId, number>();
  for (const b of biomes) counts.set(b, (counts.get(b) ?? 0) + 1);
  let plurality: BiomeId = biomes[0];
  let bestCount = -1;
  for (const b of BIOME_ORDER) {
    const c = counts.get(b) ?? 0;
    if (c > bestCount) { bestCount = c; plurality = b; }
  }
  return biomes.map((b) => (b === plurality ? 1 : 0)) as [number, number, number, number];
}

/** True iff the tile at (col, row) is dry land — no water depth, and not
 *  an ocean/deep_ocean biome. Matches TerrainGeometryBuilder.ts's private
 *  `_isWaterTile()` check exactly (duplicated here rather than imported,
 *  since that helper is not exported — see design spec's scope-guard
 *  note); out-of-bounds tiles read as WorldGrid's default cell (grassland,
 *  waterDepth 0), which is dry land, matching ShorelineCornerField's own
 *  "out of bounds reads as land" convention. */
function _isDryLandTile(wg: WorldGrid, col: number, row: number): boolean {
  const cell = wg.get(col, row);
  return cell.waterDepth === 0 && cell.biome !== 'deep_ocean' && cell.biome !== 'ocean';
}

/**
 * Corner-pull displacement [dx, dz] (world units) for the WorldGrid vertex
 * at tile-index (gx, gz), driven by land-biome differences. Zero unless
 * all 4 surrounding tiles are dry land AND their plurality-reduced config
 * is an outer_corner/inner_corner shape.
 */
export function landBiomeCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const coords: ReadonlyArray<readonly [number, number]> = [
    [gx - 1, gz - 1], // NW
    [gx,     gz - 1], // NE
    [gx,     gz],     // SE
    [gx - 1, gz],     // SW
  ];
  for (const [c, r] of coords) {
    if (!_isDryLandTile(wg, c, r)) return [0, 0];
  }
  const biomes = coords.map(([c, r]) => wg.get(c, r).biome) as [BiomeId, BiomeId, BiomeId, BiomeId];
  const config = pluralityBiomeConfig(biomes);
  return cornerPull(config, LAND_BIOME_CORNER_PULL_WU);
}
