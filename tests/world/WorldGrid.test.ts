import { describe, it, expect } from 'vitest';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';

describe('WorldGrid — waterDepth field', () => {
  it('defaults every cell to waterDepth 0 (dry)', () => {
    const wg = new WorldGrid(3, 3);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(wg.get(col, row).waterDepth).toBe(0);
      }
    }
  });

  it('out-of-bounds reads also default to waterDepth 0', () => {
    const wg = new WorldGrid(2, 2);
    expect(wg.get(-1, -1).waterDepth).toBe(0);
    expect(wg.get(99, 99).waterDepth).toBe(0);
  });

  it('can be patched via set() like any other cell field', () => {
    const wg = new WorldGrid(2, 2);
    wg.set(0, 0, { waterDepth: 1.5 });
    expect(wg.get(0, 0).waterDepth).toBe(1.5);
    // Unrelated cell stays untouched.
    expect(wg.get(1, 1).waterDepth).toBe(0);
  });
});

describe('WorldGrid — river_ford feature', () => {
  it('accepts river_ford as a valid TileFeature via set()', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { feature: 'river_ford', waterDepth: 0, walkable: true });
    const cell = wg.get(0, 0);
    expect(cell.feature).toBe('river_ford');
    expect(cell.waterDepth).toBe(0);
    expect(cell.walkable).toBe(true);
  });
});

describe('WorldGrid — BiomeId taxonomy (10 values, matches RealmBiome)', () => {
  it('accepts every RealmBiome-aligned biome value via set()', () => {
    const biomes: BiomeId[] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ];
    const wg = new WorldGrid(1, 1);
    for (const biome of biomes) {
      wg.set(0, 0, { biome });
      expect(wg.get(0, 0).biome).toBe(biome);
    }
  });

  it('defaults every cell to grassland (a valid, walkable land biome)', () => {
    const wg = new WorldGrid(2, 2);
    expect(wg.get(0, 0).biome).toBe('grassland');
    expect(wg.get(-1, -1).biome).toBe('grassland'); // out-of-bounds default too
  });
});

describe('WorldGrid — beach biome', () => {
  it('accepts beach as a valid BiomeId via set()', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'beach' });
    expect(wg.get(0, 0).biome).toBe('beach');
  });
});
