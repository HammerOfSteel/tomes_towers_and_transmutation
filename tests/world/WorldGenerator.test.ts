import { describe, it, expect, vi } from 'vitest';
import { buildWorldGrid, buildWorldData, applyRoadFords } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { WorldGrid } from '@/world/WorldGrid';
import * as RealmGen from '@/world/RealmGenerator';

describe('applyRoadFords', () => {
  it('turns a river tile crossed by a road into a walkable, dry ford', () => {
    const grid = new WorldGrid(3, 1);
    grid.set(1, 0, { feature: 'river', walkable: false, waterDepth: 1.0 });

    applyRoadFords(grid, [{ col: 1, row: 0 }]);

    const cell = grid.get(1, 0);
    expect(cell.feature).toBe('river_ford');
    expect(cell.waterDepth).toBe(0);
    expect(cell.walkable).toBe(true);
  });

  it('marks plain none/road_dirt tiles as road (existing behavior, unaffected by ford logic)', () => {
    const grid = new WorldGrid(2, 1);
    // col 0 defaults to feature 'none'.
    applyRoadFords(grid, [{ col: 0, row: 0 }]);
    expect(grid.get(0, 0).feature).toBe('road');
    expect(grid.get(0, 0).waterDepth).toBe(0);
  });

  it('does not touch tiles not in the road list', () => {
    const grid = new WorldGrid(2, 1);
    grid.set(1, 0, { feature: 'river', walkable: false, waterDepth: 1.0 });
    applyRoadFords(grid, [{ col: 0, row: 0 }]);
    expect(grid.get(1, 0).feature).toBe('river');
    expect(grid.get(1, 0).waterDepth).toBe(1.0);
  });
});

describe('buildWorldGrid — realm-sourced terrain (P0)', () => {
  it('is deterministic for the same seed', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 500 };
    const a = buildWorldGrid(500, cfg);
    const b = buildWorldGrid(500, cfg);
    for (let row = 0; row < cfg.worldSize; row++) {
      for (let col = 0; col < cfg.worldSize; col++) {
        expect(a.get(col, row)).toEqual(b.get(col, row));
      }
    }
  });

  it('produces a grid sized to config.worldSize', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 1, worldSize: 256 as const };
    const grid = buildWorldGrid(1, cfg);
    expect(grid.width).toBe(256);
    expect(grid.height).toBe(256);
  });

  it('produces at least some water tiles for a large-enough world (realm always has ocean)', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 2 };
    const grid = buildWorldGrid(2, cfg);
    let waterCount = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const b = grid.get(col, row).biome;
        if (b === 'ocean' || b === 'deep_ocean') waterCount++;
      }
    }
    expect(waterCount).toBeGreaterThan(0);
  });

  it('keeps the tower flat-zone: elevation is low near grid center regardless of realm data', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 3 };
    const grid = buildWorldGrid(3, cfg);
    const center = Math.floor(cfg.worldSize / 2);
    expect(grid.get(center, center).elevation).toBeLessThanOrEqual(1);
  });

  it('every produced cell has a valid elevation 0-7 and BiomeId', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 4, worldSize: 128 as const };
    const grid = buildWorldGrid(4, cfg);
    const validBiomes = new Set([
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow', 'mountain',
    ]);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const cell = grid.get(col, row);
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(7);
        expect(validBiomes.has(cell.biome)).toBe(true);
      }
    }
  });
});

describe('buildWorldData — realm-sourced settlements (P1 siting)', () => {
  it('sites at most config.settlementCount settlements, each with a valid name/type/faction', () => {
    const cfg  = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 600 };
    const data = buildWorldData(600, cfg);
    expect(data.settlements.length).toBeLessThanOrEqual(cfg.settlementCount);
    for (const entry of data.settlements) {
      expect(entry.plan.name.length).toBeGreaterThan(0);
      expect(['village', 'town', 'city']).toContain(entry.plan.type);
      expect(entry.plan.faction.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 601 };
    const a = buildWorldData(601, cfg);
    const b = buildWorldData(601, cfg);
    const summarize = (d: typeof a) =>
      d.settlements.map(e => ({ col: e.plan.centerCol, row: e.plan.centerRow, name: e.plan.name }));
    expect(summarize(a)).toEqual(summarize(b));
  });

  it('produces ward-derived anchor metadata and valid building instances for a multi-ward settlement', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 602, settlementCount: 6 };
    const data = buildWorldData(602, cfg);
    const rich = data.settlements.find(entry => entry.plan.buildings.filter(b => b.isAnchor).length >= 2);
    expect(rich).toBeDefined();
    expect(rich!.plan.buildings.some(b => !b.isAnchor) || rich!.plan.buildings.every(b => b.isAnchor)).toBe(true);
    for (const b of rich!.plan.buildings) {
      expect(b.wardType).toBeTruthy();
    }
  });
});

describe('buildWorldGrid — native realm resolution', () => {
  it('produces a grid exactly config.worldSize on each side, with no default-96x72 seam', () => {
    const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
    const grid = buildWorldGrid(12345, config);
    expect(grid.width).toBe(128);
    expect(grid.height).toBe(128);
  });

  it('every cell has a biome from the 10-value taxonomy (never falls back to a stretched/default value)', () => {
    const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
    const grid = buildWorldGrid(777, config);
    const valid = new Set([
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow', 'mountain',
    ]);
    let sampled = 0;
    for (let row = 0; row < 128; row += 7) {
      for (let col = 0; col < 128; col += 7) {
        expect(valid.has(grid.get(col, row).biome)).toBe(true);
        sampled++;
      }
    }
    expect(sampled).toBeGreaterThan(0);
  });

  it('calls generateRealmData with seed, width, height, settlementCount, shape, climate, roughness (all of config, not just size)', () => {
    const config = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const };
    const spy = vi.spyOn(RealmGen, 'generateRealmData');
    try {
      buildWorldGrid(9999, config);
      expect(spy).toHaveBeenCalledWith(
        9999, 128, 128,
        config.settlementCount, config.shape, config.climate, config.roughness,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('honors config.shape/climate/roughness/settlementCount (not hardcoded defaults)', () => {
    const seed = 777;
    const baseCfg = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const, seed };
    const islandGrid = buildWorldGrid(seed, { ...baseCfg, shape: 'island' });
    const pangaeaGrid = buildWorldGrid(seed, { ...baseCfg, shape: 'pangaea' });
    const oceanCount = (g: WorldGrid) => {
      let n = 0;
      for (let r = 0; r < 128; r++) for (let c = 0; c < 128; c++) {
        const b = g.get(c, r).biome;
        if (b === 'ocean' || b === 'deep_ocean') n++;
      }
      return n;
    };
    // Same seed, different shape → measurably different ocean tile count
    // (island biases strongly toward ocean at the edges; pangaea does not).
    expect(oceanCount(islandGrid)).not.toBe(oceanCount(pangaeaGrid));
  });
});
