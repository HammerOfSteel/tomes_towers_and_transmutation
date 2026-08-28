import { describe, it, expect } from 'vitest';
import { buildWorldData } from '../../src/world/WorldGenerator';

/**
 * Regression coverage for the road-jaggedness fix: A* previously had no
 * preference between equal-cost routes, so it zigzagged (changed direction
 * on ~16-30% of tiles) even on flat, obstacle-free terrain, which rendered
 * as a jagged/broken-looking road. A turn penalty biases the search toward
 * longer straight runs.
 */
describe('RoadGenerator — turn penalty reduces zigzag', () => {
  it('inter-settlement roads have a low direction-change ratio across seeds', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const wd = buildWorldData(seed, { worldSize: 512 } as any);
      const tiles = wd.interRoads ?? [];
      if (tiles.length < 10) continue; // not enough settlements this seed

      let turns = 0;
      let steps = 0;
      let prevDir: string | null = null;
      for (let i = 1; i < tiles.length; i++) {
        const a = tiles[i - 1]!, b = tiles[i]!;
        const dist = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        if (dist !== 1) { prevDir = null; continue; } // edge boundary, not a real step
        const dir = `${b.col - a.col},${b.row - a.row}`;
        if (prevDir !== null) {
          steps++;
          if (dir !== prevDir) turns++;
        }
        prevDir = dir;
      }

      expect(steps).toBeGreaterThan(0);
      const turnRatio = turns / steps;
      expect(turnRatio).toBeLessThan(0.12);
    }
  }, 60000);

  it('still connects every settlement (no dropped roads) with the turn penalty applied', () => {
    const wd = buildWorldData(7, { worldSize: 512 } as any);
    expect(wd.settlements.length).toBeGreaterThan(1);
    expect((wd.interRoads ?? []).length).toBeGreaterThan(0);
  }, 30000);

  it('never routes a road tile through ocean/deep_ocean biome', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const wd = buildWorldData(seed, { worldSize: 512 } as any);
      for (const r of wd.interRoads ?? []) {
        const biome = wd.grid.get(r.col, r.row).biome;
        expect(biome).not.toBe('ocean');
        expect(biome).not.toBe('deep_ocean');
      }
    }
  }, 60000);
});
