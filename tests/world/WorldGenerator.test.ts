import { describe, it, expect } from 'vitest';
import { buildWorldGrid } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

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
        if (grid.get(col, row).biome === 'water') waterCount++;
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

  it('every produced cell has a valid elevation 0-4 and BiomeId', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 4, worldSize: 128 as const };
    const grid = buildWorldGrid(4, cfg);
    const validBiomes = new Set(['bog', 'grass', 'forest', 'highland', 'rocky', 'water']);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const cell = grid.get(col, row);
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(4);
        expect(validBiomes.has(cell.biome)).toBe(true);
      }
    }
  });
});
