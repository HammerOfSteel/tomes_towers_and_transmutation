/**
 * NatureAssetDNA.ts — deterministic archetype selection for procedurally
 * placed overworld nature props (trees, rocks, bushes).
 *
 * Generalizes the per-cell hash-to-bucket technique introduced in
 * TerrainGeometryBuilder.ts's cellVariantIndex/cornerHeightJitter (Phase 1
 * of the overworld-feel branch) so tree/rock/bush archetype choice is
 * deterministic for a given world position — same seed/world always
 * produces the same-looking forest, no per-frame or per-load randomness.
 */

import type { BiomeId } from './WorldGrid';

/** Deterministic hash of two floating-point world coordinates → integer bucket in [0, count). */
export function hashIndex(a: number, b: number, count: number): number {
  // Coordinates are world-space floats (can be fractional/negative) — scale and
  // truncate to integers first so the bit-mixing hash below operates on well-defined
  // 32-bit integer inputs.
  const ai = Math.floor(a * 1000) | 0;
  const bi = Math.floor(b * 1000) | 0;
  let h = (ai * 374761393 + bi * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  const unsigned = h >>> 0;
  return unsigned % count;
}

export type TreeArchetype = 'conifer' | 'deciduous' | 'sparse' | 'cactus' | 'acacia';
export type RockArchetype = 'boulder' | 'slab' | 'cluster';

const ROCK_ARCHETYPES: readonly RockArchetype[] = ['boulder', 'slab', 'cluster'];

/** Which archetypes each biome is allowed to pick from — closes the "pine
 *  tree next to oak tree regardless of biome" mismatch (see
 *  docs/superpowers/specs/2026-08-30-nature-asset-biome-correctness-design.md §3.1).
 *  `beach`/`ocean`/`deep_ocean` are never actually reached in practice
 *  (ScatterRules.ts's isScatterAllowed() already excludes trees from these
 *  biomes) — included only so the table is total over BiomeId. */
const BIOME_TREE_ARCHETYPES: Record<BiomeId, readonly TreeArchetype[]> = {
  grassland:  ['deciduous', 'sparse'],
  forest:     ['conifer', 'deciduous'],
  taiga:      ['conifer'],
  tundra:     ['sparse'],
  mountain:   ['sparse'],
  snow:       ['sparse'],
  desert:     ['cactus'],
  savanna:    ['acacia'],
  beach:      ['sparse'],
  ocean:      ['sparse'],
  deep_ocean: ['sparse'],
};

/** Deterministic tree archetype for a tree placed at world position (wx, wz),
 *  restricted to the archetypes allowed for `biome`. */
export function pickTreeArchetype(biome: BiomeId, wx: number, wz: number): TreeArchetype {
  const set = BIOME_TREE_ARCHETYPES[biome];
  return set[hashIndex(wx, wz, set.length)]!;
}

/** Deterministic rock archetype for a rock placed at world position (wx, wz). */
export function pickRockArchetype(wx: number, wz: number): RockArchetype {
  // Offset inputs so a tree and rock at the same coordinates (never happens in practice due to
  // placement exclusion rules, but keeps the two functions independent) wouldn't be forced to
  // correlate archetype choices.
  return ROCK_ARCHETYPES[hashIndex(wx + 91.7, wz - 41.3, ROCK_ARCHETYPES.length)]!;
}
