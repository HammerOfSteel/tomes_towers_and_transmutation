/**
 * tileCreatorState.test.ts — Procedural Tile Designer (TV-3)
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialTileState, setBiome, setVariant, setCategory, setSize, setRoughness,
  setColorOverride, clearColorOverride, setSeed, currentColor,
  generateVariationSeeds, adoptVariation, toLibraryPayload,
  TILE_CREATOR_CATEGORIES, TILE_CREATOR_BIOMES, variantsForBiome,
} from '@/procedural/tileCreatorState';
import { TILE_VARIANTS } from '@/procedural/TileDNA';

describe('picker lists', () => {
  it('TILE_CREATOR_CATEGORIES matches TileCategory', () => {
    expect(TILE_CREATOR_CATEGORIES).toEqual(['ground', 'wall', 'ceiling', 'feature', 'transition']);
  });

  it('TILE_CREATOR_BIOMES lists all TileBiome keys', () => {
    expect(TILE_CREATOR_BIOMES).toEqual(Object.keys(TILE_VARIANTS));
  });

  it('variantsForBiome mirrors TILE_VARIANTS', () => {
    for (const biome of TILE_CREATOR_BIOMES) {
      expect(variantsForBiome(biome)).toEqual(TILE_VARIANTS[biome]);
    }
  });
});

describe('createInitialTileState', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialTileState('grassland', 'lush', 42);
    const b = createInitialTileState('grassland', 'lush', 42);
    expect(a.dna).toEqual(b.dna);
  });

  it('defaults to grassland/short, no color override', () => {
    const state = createInitialTileState();
    expect(state.dna.biome).toBe('grassland');
    expect(state.dna.variant).toBe('short');
    expect(state.hasColorOverride).toBe(false);
  });
});

describe('setBiome', () => {
  it('resets to the new biome first variant and clears color override', () => {
    const state = setColorOverride(createInitialTileState('grassland', 'lush', 5), '#ff00ff');
    const next = setBiome(state, 'desert');

    expect(next.dna.biome).toBe('desert');
    expect(next.dna.variant).toBe(TILE_VARIANTS['desert'][0]);
    expect(next.dna.colorOverride).toBeUndefined();
    expect(next.hasColorOverride).toBe(false);
    expect(next.dna.seed).toBe(5);
  });
});

describe('setVariant', () => {
  it('keeps biome/seed, clears color override', () => {
    const state = setColorOverride(createInitialTileState('grassland', 'lush', 9), '#123456');
    const next = setVariant(state, 'patchy');

    expect(next.dna.biome).toBe('grassland');
    expect(next.dna.variant).toBe('patchy');
    expect(next.dna.seed).toBe(9);
    expect(next.hasColorOverride).toBe(false);
  });
});

describe('field setters', () => {
  const base = createInitialTileState('grassland', 'lush', 1);

  it('setCategory', () => {
    expect(setCategory(base, 'feature').dna.category).toBe('feature');
  });

  it('setSize', () => {
    expect(setSize(base, 3).dna.size).toBe(3);
  });

  it('setRoughness', () => {
    expect(setRoughness(base, 0.3).dna.roughness).toBe(0.3);
  });

  it('setSeed', () => {
    expect(setSeed(base, 777).dna.seed).toBe(777);
  });

  it('setColorOverride / clearColorOverride', () => {
    const withOverride = setColorOverride(base, '#abcdef');
    expect(withOverride.dna.colorOverride).toBe('#abcdef');
    expect(withOverride.hasColorOverride).toBe(true);

    const cleared = clearColorOverride(withOverride);
    expect(cleared.dna.colorOverride).toBeUndefined();
    expect(cleared.hasColorOverride).toBe(false);
  });
});

describe('currentColor', () => {
  it('resolves the palette default when no override is set', () => {
    const state = createInitialTileState('grassland', 'lush', 1);
    expect(currentColor(state)).toBe('#3d8a34');
  });

  it('resolves the override when set', () => {
    const state = setColorOverride(createInitialTileState('grassland', 'lush', 1), '#ff00ff');
    expect(currentColor(state)).toBe('#ff00ff');
  });
});

describe('generateVariationSeeds', () => {
  it('produces `count` DNAs sharing biome/variant/category but distinct seeds', () => {
    const state = createInitialTileState('cave_rock', 'wet', 1);
    const variations = generateVariationSeeds(state, 5, 1000);

    expect(variations).toHaveLength(5);
    const seeds = variations.map(v => v.seed);
    expect(new Set(seeds).size).toBe(5);
    for (const v of variations) {
      expect(v.biome).toBe('cave_rock');
      expect(v.variant).toBe('wet');
      expect(v.category).toBe(state.dna.category);
    }
  });

  it('is deterministic for the same baseSeed', () => {
    const state = createInitialTileState('cave_rock', 'wet', 1);
    const a = generateVariationSeeds(state, 3, 42);
    const b = generateVariationSeeds(state, 3, 42);
    expect(a).toEqual(b);
  });
});

describe('adoptVariation', () => {
  it('replaces dna and derives hasColorOverride from the new dna', () => {
    const state = createInitialTileState('grassland', 'lush', 1);
    const [variation] = generateVariationSeeds(state, 1, 5);
    const next = adoptVariation(state, variation);
    expect(next.dna).toBe(variation);
    expect(next.hasColorOverride).toBe(false);
  });
});

describe('toLibraryPayload', () => {
  it('maps DNA to a tile-typed library payload with descriptive tags', () => {
    const state = createInitialTileState('tundra', 'ice_patch', 3);
    const payload = toLibraryPayload(state);

    expect(payload.type).toBe('tile');
    expect(payload.seed).toBe(3);
    expect(payload.name).toBe('tundra ice patch');
    expect(payload.tags).toEqual(
      expect.arrayContaining(['category:ground', 'biome:tundra', 'variant:ice_patch']),
    );
    expect(payload.data).toEqual(state.dna);
  });
});
