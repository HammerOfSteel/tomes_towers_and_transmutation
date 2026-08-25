import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateHydrology } from '@/world/HydrologyGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { RIVER_DEPTH_WU } from '@/world/WaterDepthConfig';

describe('generateHydrology — waterDepth', () => {
  it('sets waterDepth = RIVER_DEPTH_WU on every carved river tile', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const, riverCount: 3 };
    const grid = new WorldGrid(cfg.worldSize, cfg.worldSize);
    // Give the whole grid enough elevation for river sourcing to find candidates.
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) grid.set(col, row, { elevation: 4 });
    }
    generateHydrology(grid, cfg, 42);

    let riverTileCount = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const cell = grid.get(col, row);
        if (cell.feature === 'river') {
          riverTileCount++;
          expect(cell.waterDepth).toBe(RIVER_DEPTH_WU);
        }
      }
    }
    expect(riverTileCount).toBeGreaterThan(0);
  });

  it('leaves river_bank tiles dry (waterDepth 0)', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const, riverCount: 3 };
    const grid = new WorldGrid(cfg.worldSize, cfg.worldSize);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) grid.set(col, row, { elevation: 4 });
    }
    generateHydrology(grid, cfg, 42);

    let bankTileCount = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const cell = grid.get(col, row);
        if (cell.feature === 'river_bank') {
          bankTileCount++;
          expect(cell.waterDepth).toBe(0);
        }
      }
    }
    expect(bankTileCount).toBeGreaterThan(0);
  });

  it('leaves non-river tiles untouched (waterDepth 0)', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const, riverCount: 0 };
    const grid = new WorldGrid(cfg.worldSize, cfg.worldSize);
    generateHydrology(grid, cfg, 1);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        expect(grid.get(col, row).waterDepth).toBe(0);
      }
    }
  });
});
