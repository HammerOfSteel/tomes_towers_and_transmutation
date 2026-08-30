import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateLakes } from '@/world/LakeGenerator';
import { LAKE_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { WorldGenConfig } from '@/world/WorldGenConfig';

function makeGridWithBasin(size = 21): WorldGrid {
  const grid = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const dc = col - (size - 1) / 2, dr = row - (size - 1) / 2;
      const isBasin = Math.abs(dc) < 2 && Math.abs(dr) < 2;
      grid.set(col, row, { elevation: isBasin ? 1 : 4 });
    }
  }
  return grid;
}

describe('generateLakes', () => {
  it('places at most config.lakeCount lakes with correct tile data', () => {
    const grid = makeGridWithBasin();
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(grid, config, 12345);
    let lakeTiles = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const c = grid.get(col, row);
        if (c.feature === 'lake') {
          lakeTiles++;
          expect(c.walkable).toBe(false);
          expect(c.waterDepth).toBe(LAKE_DEPTH_WU);
        }
      }
    }
    expect(lakeTiles).toBeGreaterThan(0);
  });

  it('marks dry neighbours of lake tiles as river_bank', () => {
    const grid = makeGridWithBasin();
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(grid, config, 12345);
    let bankTiles = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        if (grid.get(col, row).feature === 'river_bank') bankTiles++;
      }
    }
    expect(bankTiles).toBeGreaterThan(0);
  });

  it('does not overlap a pre-existing river tile', () => {
    const grid = makeGridWithBasin();
    grid.set(10, 10, { feature: 'river', waterDepth: 2.0, walkable: false });
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(grid, config, 12345);
    expect(grid.get(10, 10).feature).toBe('river'); // unchanged, not overwritten
  });

  it('is deterministic for a fixed seed', () => {
    const gridA = makeGridWithBasin();
    const gridB = makeGridWithBasin();
    const config = { lakeCount: 1 } as WorldGenConfig;
    generateLakes(gridA, config, 999);
    generateLakes(gridB, config, 999);
    for (let row = 0; row < gridA.height; row++) {
      for (let col = 0; col < gridA.width; col++) {
        expect(gridA.get(col, row).feature).toBe(gridB.get(col, row).feature);
      }
    }
  });
});
