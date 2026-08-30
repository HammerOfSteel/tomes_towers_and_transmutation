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

describe('buildInterSettlementRoads — L-shape fallback must never cross open water', () => {
  function flatGrid(size: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  /**
   * Regression coverage for a reported visual bug: when two settlements are
   * genuinely unreachable by land (e.g., separated by a full-width ocean
   * strait, as happens on an archipelago/island-shaped realm), A* correctly
   * returns [] (ocean/deep_ocean tiles cost Infinity in _moveCost, so they
   * can never appear in any A*-found path) — but the code then fell back to
   * _lShape(), a blind axis-aligned line with zero terrain awareness, which
   * happily drew a "road" straight across the open sea. That tile then got
   * marked feature:'road' by WorldGenerator (river-only fords aside, ocean
   * tiles have no ford handling at all), rendering as an actual road/lamp-
   * post-lined path floating over/under the water — visually broken, and a
   * road that makes no narrative sense (no ferry/bridge, just pavement on
   * the sea floor). Two settlements separated by an impassable strait
   * should simply not get a road between them, not a nonsensical one.
   */
  it('skips a connecting edge entirely rather than crossing an impassable ocean strait', () => {
    const grid = flatGrid(40);
    // A full-height ocean band splits the grid into two separate landmasses.
    for (let row = 0; row < 40; row++) {
      for (let col = 15; col < 25; col++) {
        grid.set(col, row, { biome: 'ocean' });
      }
    }
    const settlements = [
      { plan: { centerCol: 5,  centerRow: 20 } },
      { plan: { centerCol: 35, centerRow: 20 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);

    for (const t of result.tiles) {
      const biome = grid.get(t.col, t.row).biome;
      expect(biome).not.toBe('ocean');
      expect(biome).not.toBe('deep_ocean');
    }
    for (const path of result.paths) {
      for (const p of path) {
        const biome = grid.get(p.col, p.row).biome;
        expect(biome).not.toBe('ocean');
        expect(biome).not.toBe('deep_ocean');
      }
    }
    // The two islands are unreachable from each other by land — no road
    // (real or fallback) should exist connecting them at all.
    expect(result.tiles.length).toBe(0);
    expect(result.paths.length).toBe(0);
  });

  it('still uses the L-shape fallback normally when it does NOT cross water (unaffected by the fix)', () => {
    const grid = flatGrid(20);
    // No water anywhere — A* may still occasionally fail to find a path in
    // pathological cases, but the L-shape fallback here is entirely over
    // land, so it must still be used (this isn't a "never fall back" fix,
    // only a "never fall back across open water" fix).
    const settlements = [
      { plan: { centerCol: 2, centerRow: 2 } },
      { plan: { centerCol: 17, centerRow: 17 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    expect(result.tiles.length).toBeGreaterThan(0);
    expect(result.paths.length).toBe(1);
  });

  it('still connects settlements on the SAME landmass even when a separate impassable strait exists elsewhere on the map', () => {
    const grid = flatGrid(40);
    for (let row = 0; row < 40; row++) {
      for (let col = 15; col < 25; col++) {
        grid.set(col, row, { biome: 'ocean' });
      }
    }
    const settlements = [
      { plan: { centerCol: 2,  centerRow: 2 } },
      { plan: { centerCol: 12, centerRow: 12 } }, // same landmass as above (col < 15)
      { plan: { centerCol: 35, centerRow: 20 } },  // across the strait — unreachable
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    // At least the same-landmass pair must still be connected.
    expect(result.tiles.length).toBeGreaterThan(0);
    for (const t of result.tiles) {
      expect(t.col).toBeLessThan(15); // no tile should have crossed onto/through the strait
    }
  });
});

describe('buildInterSettlementRoads — lake avoidance (mirrors the ocean-crossing fix)', () => {
  function flatGrid(size: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  /**
   * Lakes sit on ordinary land biomes (not a special lake BiomeId), so the
   * ocean-only biome checks in _moveCost/_pathCrossesWater would not catch
   * them — this mirrors the ocean-crossing regression test above, but with
   * a `feature: 'lake'` band instead of a `biome: 'ocean'` band.
   */
  it('skips a connecting edge entirely rather than crossing an impassable lake', () => {
    const grid = flatGrid(40);
    for (let row = 0; row < 40; row++) {
      for (let col = 15; col < 25; col++) {
        grid.set(col, row, { feature: 'lake', walkable: false, waterDepth: 2.0 });
      }
    }
    const settlements = [
      { plan: { centerCol: 5,  centerRow: 20 } },
      { plan: { centerCol: 35, centerRow: 20 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);

    for (const t of result.tiles) {
      expect(grid.get(t.col, t.row).feature).not.toBe('lake');
    }
    for (const path of result.paths) {
      for (const p of path) {
        expect(grid.get(p.col, p.row).feature).not.toBe('lake');
      }
    }
    expect(result.tiles.length).toBe(0);
    expect(result.paths.length).toBe(0);
  });

  it('still uses the L-shape fallback normally when it does NOT cross a lake (unaffected by the fix)', () => {
    const grid = flatGrid(20);
    const settlements = [
      { plan: { centerCol: 2, centerRow: 2 } },
      { plan: { centerCol: 17, centerRow: 17 } },
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    expect(result.tiles.length).toBeGreaterThan(0);
    expect(result.paths.length).toBe(1);
  });

  it('still connects settlements on the SAME landmass even when a separate lake exists elsewhere on the map', () => {
    const grid = flatGrid(40);
    for (let row = 0; row < 40; row++) {
      for (let col = 15; col < 25; col++) {
        grid.set(col, row, { feature: 'lake', walkable: false, waterDepth: 2.0 });
      }
    }
    const settlements = [
      { plan: { centerCol: 2,  centerRow: 2 } },
      { plan: { centerCol: 12, centerRow: 12 } }, // same landmass as above (col < 15)
      { plan: { centerCol: 35, centerRow: 20 } },  // across the lake — unreachable
    ];
    const result = buildInterSettlementRoads(settlements, grid);
    expect(result.tiles.length).toBeGreaterThan(0);
    for (const t of result.tiles) {
      expect(t.col).toBeLessThan(15); // no tile should have crossed onto/through the lake
    }
  });
});
