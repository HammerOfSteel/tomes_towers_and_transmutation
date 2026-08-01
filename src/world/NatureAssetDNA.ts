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

export type TreeArchetype = 'conifer' | 'deciduous' | 'sparse';
export type RockArchetype = 'boulder' | 'slab' | 'cluster';

const TREE_ARCHETYPES: readonly TreeArchetype[] = ['conifer', 'deciduous', 'sparse'];
const ROCK_ARCHETYPES: readonly RockArchetype[] = ['boulder', 'slab', 'cluster'];

/** Deterministic tree archetype for a tree placed at world position (wx, wz). */
export function pickTreeArchetype(wx: number, wz: number): TreeArchetype {
  return TREE_ARCHETYPES[hashIndex(wx, wz, TREE_ARCHETYPES.length)]!;
}

/** Deterministic rock archetype for a rock placed at world position (wx, wz). */
export function pickRockArchetype(wx: number, wz: number): RockArchetype {
  // Offset inputs so a tree and rock at the same coordinates (never happens in practice due to
  // placement exclusion rules, but keeps the two functions independent) wouldn't be forced to
  // correlate archetype choices.
  return ROCK_ARCHETYPES[hashIndex(wx + 91.7, wz - 41.3, ROCK_ARCHETYPES.length)]!;
}
