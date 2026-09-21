import { describe, it, expect } from 'vitest';
import { realmToWorldGrid } from '@/world/RealmToWorldGrid';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { RealmData, RealmCell } from '@/overworld-studio';

function fakeRealm(cells: RealmCell[][]): RealmData {
  return {
    cells, W: cells[0]!.length, H: cells.length,
    rivers: [], lakes: [], settlements: [], dungeons: [],
    towerX: 0, towerY: 0, seed: 1,
  };
}

describe('realmToWorldGrid — identity biome mapping', () => {
  it('preserves every RealmBiome value unchanged (no collapsing)', () => {
    const biomes: RealmCell['biome'][] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow', 'mountain',
    ];
    const cells = [biomes.map(biome => ({ elevation: 0.5, moisture: 0.5, biome }))];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, biomes.length);
    for (let col = 0; col < biomes.length; col++) {
      expect(grid.get(col, 0).biome).toBe(biomes[col]);
    }
  });

  it('direct-indexes a same-size realm (col,row) -> (col,row), not nearest-neighbor stretch', () => {
    // 4x4 realm where each cell's biome encodes its own coordinate via a
    // distinct value, so any resampling/stretch would be observable.
    const row0: RealmCell[] = ['ocean', 'beach', 'desert', 'savanna'].map(biome => ({ elevation: 0.5, moisture: 0.5, biome: biome as RealmCell['biome'] }));
    const row1: RealmCell[] = ['grassland', 'forest', 'taiga', 'tundra'].map(biome => ({ elevation: 0.5, moisture: 0.5, biome: biome as RealmCell['biome'] }));
    const realm = fakeRealm([row0, row1, row0, row1]);
    const grid = realmToWorldGrid(realm, 4);
    expect(grid.get(0, 0).biome).toBe('ocean');
    expect(grid.get(3, 0).biome).toBe('savanna');
    expect(grid.get(1, 1).biome).toBe('forest');
    expect(grid.get(2, 3).biome).toBe('taiga');
  });

  it('carves waterDepth = OCEAN_DEEP_DEPTH_WU for deep_ocean and marks it unwalkable', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 2);
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_DEEP_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
    expect(grid.get(1, 0).waterDepth).toBe(0);
    expect(grid.get(1, 0).walkable).toBe(true);
  });

  it('carves waterDepth = OCEAN_SHALLOW_DEPTH_WU for the ocean (shallow) band', () => {
    const cells = [[{ elevation: 0.32, moisture: 0.5, biome: 'ocean' as const }]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 1);
    expect(grid.get(0, 0).waterDepth).toBe(OCEAN_SHALLOW_DEPTH_WU);
    expect(grid.get(0, 0).walkable).toBe(false);
  });

  it('beach is dry and walkable with no carved depth', () => {
    const cells = [[{ elevation: 0.36, moisture: 0.5, biome: 'beach' as const }]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 1);
    expect(grid.get(0, 0).biome).toBe('beach');
    expect(grid.get(0, 0).waterDepth).toBe(0);
    expect(grid.get(0, 0).walkable).toBe(true);
  });

  it('quantizes continuous 0..1 realm elevation into WorldGrid 0-7 levels', () => {
    // Each value is padded with same-valued neighbor columns so the new
    // post-quantization smoothing pass (1.3 §3a) is a no-op at the two
    // read columns — this test is about the quantization formula itself,
    // not smoothing, so it isolates that by keeping every neighbor of
    // the read cell at the identical pre-smoothing value.
    const cells = [[
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.99, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.99, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.99, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 6);
    expect(grid.get(1, 0).elevation).toBe(0);
    expect(grid.get(4, 0).elevation).toBe(7);
  });

  it('produces intermediate levels for intermediate elevations (finer gradation than the old 5-level scheme)', () => {
    // Same same-valued-neighbor padding as above, for the same reason.
    const cells = [[
      { elevation: 0.30, moisture: 0.5, biome: 'grassland' as const }, // ~level 2
      { elevation: 0.30, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.30, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.55, moisture: 0.5, biome: 'grassland' as const }, // ~level 4
      { elevation: 0.55, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.55, moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 6);
    expect(grid.get(1, 0).elevation).toBe(2);
    expect(grid.get(4, 0).elevation).toBe(4);
  });

  it('smooths a single spiked elevation cell toward its flat neighbors', () => {
    // A 3x3 realm, all cells at elevation 0.10 (-> level 0 pre-smoothing)
    // except the center cell spiked to 0.99 (-> level 7 pre-smoothing).
    const cells: RealmCell[][] = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => ({
        biome: 'grassland' as const,
        moisture: 0.5,
        elevation: (row === 1 && col === 1) ? 0.99 : 0.10,
      })),
    );
    const realm = fakeRealm(cells);

    const grid = realmToWorldGrid(realm, 3);

    // Before smoothing the center would be level 7 with every neighbor at
    // level 0 — after the 3x3 self-weighted-double average
    // ((7*2 + 0*8) / 10 = 1.4 -> rounds to 1), it should land far below 7.
    // A corner (e.g. (0,0)) touches 3 of the 8 neighbor slots — (1,0),
    // (0,1) at level 0 and the spiked (1,1) at level 7 — so its own
    // average is (0*2 + 0 + 0 + 7) / 5 = 1.4 -> also rounds to 1, still
    // far below the un-smoothed spike of 7.
    expect(grid.get(1, 1).elevation).toBeLessThan(3);
    expect(grid.get(0, 0).elevation).toBe(1);
  });
});
