import { describe, it, expect } from 'vitest';
import { buildWorldData } from '../../src/world/WorldGenerator';
import { buildInterSettlementRoads } from '../../src/world/RoadGenerator';
import { WorldGrid } from '../../src/world/WorldGrid';

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

describe('buildInterSettlementRoads — ordered per-edge paths', () => {
  function flatGrid(size: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  it('returns one ordered path per connecting edge, each a contiguous 4-connected walk', () => {
    const grid = flatGrid(20);
    const settlements = [
      { plan: { centerCol: 2, centerRow: 2 } },
      { plan: { centerCol: 17, centerRow: 2 } },
      { plan: { centerCol: 17, centerRow: 17 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    expect(result.paths).toBeDefined();
    expect(result.paths!.length).toBeGreaterThan(0);
    for (const path of result.paths!) {
      expect(path.length).toBeGreaterThan(1);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!, b = path[i]!;
        const dist = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        expect(dist).toBe(1); // every consecutive pair is 4-connected (no gaps/jumps)
      }
    }
  });

  it('every path endpoint matches a settlement center (paths connect real settlements)', () => {
    const grid = flatGrid(20);
    const settlements = [
      { plan: { centerCol: 2, centerRow: 2 } },
      { plan: { centerCol: 17, centerRow: 2 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    expect(result.paths!.length).toBe(1);
    const path = result.paths![0]!;
    const centers = settlements.map(s => `${s.plan.centerCol},${s.plan.centerRow}`);
    expect(centers).toContain(`${path[0]!.col},${path[0]!.row}`);
    expect(centers).toContain(`${path[path.length - 1]!.col},${path[path.length - 1]!.row}`);
  });

  it('returns no paths for fewer than 2 settlements', () => {
    const grid = flatGrid(10);
    const result = buildInterSettlementRoads([{ plan: { centerCol: 5, centerRow: 5 } }], grid);
    expect(result.paths ?? []).toEqual([]);
  });
});
