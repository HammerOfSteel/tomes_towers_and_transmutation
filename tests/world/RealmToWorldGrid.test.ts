import { describe, it, expect } from 'vitest';
import { realmToWorldGrid } from '@/world/RealmToWorldGrid';
import { generateRealmData } from '@/world/RealmGenerator';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { RealmData, RealmCell } from '@/overworld-studio';

function fakeRealm(cells: RealmCell[][]): RealmData {
  return {
    cells, W: cells[0]!.length, H: cells.length,
    rivers: [], settlements: [], dungeons: [],
    towerX: 0, towerY: 0, seed: 1,
  };
}

describe('realmToWorldGrid', () => {
  it('maps every RealmBiome to a valid WorldGrid BiomeId', () => {
    const biomes: RealmCell['biome'][] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ];
    const validWorldBiomes = new Set(['bog', 'grass', 'forest', 'highland', 'rocky', 'water', 'sand']);
    const cells = [biomes.map(biome => ({ elevation: 0.5, moisture: 0.5, biome }))];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    for (let col = 0; col < 128; col++) {
      expect(validWorldBiomes.has(grid.get(col, 0).biome)).toBe(true);
    }
  });

  it('maps ocean biomes to water (not bog) so existing water-avoidance logic works', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.2, moisture: 0.5, biome: 'ocean' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(64, 0).biome).toBe('water');
  });

  it('carves waterDepth = OCEAN_DEEP_DEPTH_WU for deep_ocean and marks it unwalkable', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_DEEP_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
    // Non-water tile stays dry and walkable.
    expect(grid.get(127, 0).waterDepth).toBe(0);
    expect(grid.get(127, 0).walkable).toBe(true);
  });

  it('carves waterDepth = OCEAN_SHALLOW_DEPTH_WU for the ocean (shallow) band', () => {
    const cells = [[
      { elevation: 0.32, moisture: 0.5, biome: 'ocean' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_SHALLOW_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
  });

  it('shallow ocean depth is less than deep ocean depth', () => {
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeLessThan(OCEAN_DEEP_DEPTH_WU);
  });

  it('maps beach to a distinct sand biome, not grass', () => {
    const cells = [[
      { elevation: 0.36, moisture: 0.5, biome: 'beach' as const },
      { elevation: 0.5,  moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('sand');
    expect(grid.get(0, 0).waterDepth).toBe(0);
    expect(grid.get(0, 0).walkable).toBe(true);
    expect(grid.get(127, 0).biome).toBe('grass');
  });

  it('maps forest and taiga to forest', () => {
    const cells = [[
      { elevation: 0.5, moisture: 0.5, biome: 'forest' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'taiga' as const },
    ]];
    const grid = realmToWorldGrid(fakeRealm(cells), 128);
    expect(grid.get(0, 0).biome).toBe('forest');
    expect(grid.get(127, 0).biome).toBe('forest');
  });

  it('quantizes elevation 0..1 into 0..4 discrete levels', () => {
    const cells = [[
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.25, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.5,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.75, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 1.0,  moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 5);
    expect(grid.get(0, 0).elevation).toBe(0);
    expect(grid.get(1, 0).elevation).toBe(1);
    expect(grid.get(2, 0).elevation).toBe(2);
    expect(grid.get(3, 0).elevation).toBe(3);
    expect(grid.get(4, 0).elevation).toBe(4); // 1.0 * 5 = 5, clamped to 4
  });

  it('is deterministic — same realm produces same grid twice', () => {
    const realm = generateRealmData(321, 40, 30);
    const a = realmToWorldGrid(realm, 128);
    const b = realmToWorldGrid(realm, 128);
    for (let row = 0; row < 128; row++) {
      for (let col = 0; col < 128; col++) {
        expect(a.get(col, row)).toEqual(b.get(col, row));
      }
    }
  });

  it('produces a grid of exactly worldSize x worldSize regardless of realm dimensions', () => {
    const realm = generateRealmData(9, 96, 72);
    const grid256 = realmToWorldGrid(realm, 256);
    expect(grid256.width).toBe(256);
    expect(grid256.height).toBe(256);
  });
});
