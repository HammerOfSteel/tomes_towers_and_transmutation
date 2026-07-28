/**
 * TileColor.ts — TV-2 (Procedural Tile Designer variant palette)
 *
 * Canonical default hex color per (biome, variant) pair, covering every
 * variant listed in tile-designer.md's TV-2 table. This is the missing link
 * between the TV-1 `TileDNA` schema and an eventual TV-3 preview/builder —
 * `resolveTileColor(dna)` is what a canvas/mesh renderer would call to get a
 * starting color, honouring `dna.colorOverride` when present.
 *
 * Pure data + pure function — no THREE.js, no canvas. Deterministic and
 * fully testable without a DOM.
 */

import type { TileBiome, TileDNA } from './TileDNA';
import { isKnownVariant } from './TileDNA';

/** Default hex color per (biome, variant). Mirrors TV-2's variant table exactly. */
export const TILE_VARIANT_COLOR: Readonly<Record<TileBiome, Readonly<Record<string, string>>>> = {
  grassland: {
    short:  '#6fa848',
    lush:   '#3d8a34',
    patchy: '#8a9a52',
  },
  forest_floor: {
    leaf_litter: '#7a5a34',
    moss:        '#4a6b3a',
    roots:       '#5a4028',
  },
  desert: {
    sand:    '#d8b060',
    cracked: '#b8905a',
    dune:    '#e0c078',
  },
  tundra: {
    snow:          '#e8f0f8',
    ice_patch:     '#a8d8f0',
    frozen_ground: '#8a9aa0',
  },
  dungeon_stone: {
    plain:    '#8a8478',
    mossy:    '#6a7a5c',
    cracked:  '#767068',
    scorched: '#5a4638',
  },
  cave_rock: {
    wet:            '#4a5850',
    dry:            '#8a7a68',
    crystal_veined: '#7098b0',
    lava_rimmed:    '#8a4030',
  },
  settlement_cobble: {
    worn:      '#a8a090',
    new:       '#c8c0b0',
    decorated: '#b8a878',
  },
  water: {
    shallow: '#5090c0',
    deep:    '#204878',
  },
};

/**
 * Resolve the display color for a TileDNA. `colorOverride` always wins;
 * otherwise falls back to the known variant palette, then a neutral grey for
 * unknown biome/variant combinations authored outside TV-2's known set.
 */
export function resolveTileColor(dna: TileDNA): string {
  if (dna.colorOverride) return dna.colorOverride;
  const known = TILE_VARIANT_COLOR[dna.biome]?.[dna.variant];
  if (known) return known;
  return '#808080';
}

/** Whether `resolveTileColor` would return a palette-defined color (vs the grey fallback). */
export function hasKnownColor(biome: TileBiome, variant: string): boolean {
  return isKnownVariant(biome, variant) && TILE_VARIANT_COLOR[biome]?.[variant] !== undefined;
}