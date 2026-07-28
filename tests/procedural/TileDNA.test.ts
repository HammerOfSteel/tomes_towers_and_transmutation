/**
 * TileDNA.test.ts — TV-1
 */

import { describe, it, expect } from 'vitest';
import {
  makeTileDNA,
  validateTileDNA,
  isKnownVariant,
  tileDnaKey,
  TILE_VARIANTS,
  TILE_DNA_VERSION,
  TileDNAError,
} from '@/procedural/TileDNA';

describe('makeTileDNA', () => {
  it('builds a ground-category tile by default', () => {
    const dna = makeTileDNA('grassland', 'lush', 42);
    expect(dna).toEqual({ v: TILE_DNA_VERSION, category: 'ground', biome: 'grassland', variant: 'lush', seed: 42, size: 2 });
  });

  it('defaults dungeon_stone and cave_rock to wall category', () => {
    expect(makeTileDNA('dungeon_stone', 'mossy', 1).category).toBe('wall');
    expect(makeTileDNA('cave_rock', 'wet', 1).category).toBe('wall');
  });

  it('defaults water to transition category', () => {
    expect(makeTileDNA('water', 'shallow', 1).category).toBe('transition');
  });

  it('applies overrides', () => {
    const dna = makeTileDNA('grassland', 'short', 7, { category: 'feature', size: 4, colorOverride: '#123456' });
    expect(dna.category).toBe('feature');
    expect(dna.size).toBe(4);
    expect(dna.colorOverride).toBe('#123456');
  });
});

describe('isKnownVariant', () => {
  it('recognises variants from TILE_VARIANTS', () => {
    for (const [biome, variants] of Object.entries(TILE_VARIANTS)) {
      for (const v of variants) expect(isKnownVariant(biome as any, v)).toBe(true);
    }
  });

  it('returns false for unknown variants', () => {
    expect(isKnownVariant('grassland', 'nonexistent')).toBe(false);
  });
});

describe('tileDnaKey', () => {
  it('produces a stable biome:variant key', () => {
    expect(tileDnaKey('desert', 'sand')).toBe('desert:sand');
  });
});

describe('validateTileDNA', () => {
  it('accepts a valid DNA object', () => {
    const dna = makeTileDNA('tundra', 'snow', 5);
    expect(validateTileDNA(dna)).toEqual(dna);
  });

  it('accepts colorOverride', () => {
    const dna = makeTileDNA('tundra', 'snow', 5, { colorOverride: '#abcdef' });
    expect(validateTileDNA(dna).colorOverride).toBe('#abcdef');
  });

  it('rejects non-objects', () => {
    expect(() => validateTileDNA(null)).toThrow(TileDNAError);
    expect(() => validateTileDNA('nope')).toThrow(TileDNAError);
  });

  it('rejects wrong version', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), v: 99 })).toThrow(/version/);
  });

  it('rejects invalid category', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), category: 'nope' })).toThrow(/category/);
  });

  it('rejects invalid biome', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), biome: 'nope' })).toThrow(/biome/);
  });

  it('rejects empty/missing variant', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), variant: '' })).toThrow(/variant/);
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), variant: 5 })).toThrow(/variant/);
  });

  it('rejects invalid seed', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), seed: 'x' })).toThrow(/seed/);
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), seed: NaN })).toThrow(/seed/);
  });

  it('rejects invalid size', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), size: 0 })).toThrow(/size/);
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), size: -1 })).toThrow(/size/);
  });

  it('rejects non-string colorOverride', () => {
    expect(() => validateTileDNA({ ...makeTileDNA('desert', 'sand', 1), colorOverride: 5 })).toThrow(/colorOverride/);
  });
});