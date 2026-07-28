/**
 * TileColor.test.ts — TV-2
 */

import { describe, it, expect } from 'vitest';
import { TILE_VARIANT_COLOR, resolveTileColor, hasKnownColor } from '@/procedural/TileColor';
import { TILE_VARIANTS, makeTileDNA } from '@/procedural/TileDNA';
import type { TileBiome } from '@/procedural/TileDNA';

const ALL_BIOMES = Object.keys(TILE_VARIANTS) as TileBiome[];

describe('TILE_VARIANT_COLOR coverage', () => {
  it('defines a color for every biome+variant listed in TILE_VARIANTS', () => {
    for (const biome of ALL_BIOMES) {
      for (const variant of TILE_VARIANTS[biome]) {
        const color = TILE_VARIANT_COLOR[biome]?.[variant];
        expect(color, `missing color for ${biome}:${variant}`).toBeDefined();
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('resolveTileColor', () => {
  it('returns the palette color for a known biome+variant', () => {
    const dna = makeTileDNA('grassland', 'lush', 1);
    expect(resolveTileColor(dna)).toBe(TILE_VARIANT_COLOR.grassland.lush);
  });

  it('colorOverride always wins over the palette default', () => {
    const dna = makeTileDNA('grassland', 'lush', 1, { colorOverride: '#ff00ff' });
    expect(resolveTileColor(dna)).toBe('#ff00ff');
  });

  it('falls back to neutral grey for an unknown variant', () => {
    const dna = makeTileDNA('grassland', 'totally_new_variant', 1);
    expect(resolveTileColor(dna)).toBe('#808080');
  });
});

describe('hasKnownColor', () => {
  it('is true for every documented variant', () => {
    for (const biome of ALL_BIOMES) {
      for (const variant of TILE_VARIANTS[biome]) {
        expect(hasKnownColor(biome, variant)).toBe(true);
      }
    }
  });

  it('is false for an unknown variant', () => {
    expect(hasKnownColor('grassland', 'not_a_real_variant')).toBe(false);
  });
});