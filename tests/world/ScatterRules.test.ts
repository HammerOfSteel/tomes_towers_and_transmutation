import { describe, it, expect } from 'vitest';
import { isScatterAllowed, isWaterDecorAllowed, isNearWaterTile } from '@/world/ScatterRules';
import { WorldGrid } from '@/world/WorldGrid';
import type { WorldCell } from '@/world/WorldGrid';

function makeCell(overrides: Partial<WorldCell> = {}): WorldCell {
  return {
    elevation: 2,
    biome: 'grassland',
    feature: 'none',
    content: 'empty',
    dungeonId: 0,
    buildingId: 0,
    settlementId: 0,
    walkable: true,
    waterDepth: 0,
    ...overrides,
  };
}

describe('isScatterAllowed', () => {
  it('allows every scatter kind on a plain empty grass cell', () => {
    const cell = makeCell();
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass', 'ambient'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(true);
    }
  });

  it('disallows every scatter kind on a water-biome cell', () => {
    const cell = makeCell({ biome: 'ocean', waterDepth: 2.5 });
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin', 'grass', 'ambient'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(false);
    }
  });

  it('disallows trees on a sand-biome cell but allows rocks and camps', () => {
    const cell = makeCell({ biome: 'beach' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(true);
    expect(isScatterAllowed(cell, 'camp')).toBe(true);
    expect(isScatterAllowed(cell, 'ruin')).toBe(true);
  });

  it('disallows every scatter kind on a bog/low-elevation cell for trees and bushes only', () => {
    const cell = makeCell({ elevation: 0 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    // Rocks/camps/ruins never had an elevation restriction — preserve that.
    expect(isScatterAllowed(cell, 'rock')).toBe(true);
    expect(isScatterAllowed(cell, 'camp')).toBe(true);
    expect(isScatterAllowed(cell, 'ruin')).toBe(true);
  });

  it('disallows every scatter kind on a road tile', () => {
    for (const feature of ['road', 'road_dirt'] as const) {
      const cell = makeCell({ feature });
      for (const kind of ['tree', 'bush', 'rock', 'grass', 'ambient'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });

  it('disallows tree/bush/rock/grass/ambient on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
    expect(isScatterAllowed(cell, 'ambient')).toBe(false);
  });

  it('disallows tree/bush/rock/grass/ambient inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
    expect(isScatterAllowed(cell, 'grass')).toBe(false);
    expect(isScatterAllowed(cell, 'ambient')).toBe(false);
  });
});

describe('isScatterAllowed — widened biome taxonomy', () => {
  it('disallows trees/rocks on both ocean tiers, not just one', () => {
    const oceanCell = makeCell({ biome: 'ocean' });
    const deepOceanCell = makeCell({ biome: 'deep_ocean' });
    expect(isScatterAllowed(oceanCell, 'tree')).toBe(false);
    expect(isScatterAllowed(deepOceanCell, 'rock')).toBe(false);
  });

  it('disallows trees/bushes on beach (renamed from sand)', () => {
    const cell = makeCell({ biome: 'beach', elevation: 1 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
  });

  it('disallows tree/bush/rock on a river/lake tile even though it sits on an ordinary land biome', () => {
    const riverCell = makeCell({ biome: 'grassland', feature: 'river', waterDepth: 2.0, walkable: false });
    const lakeCell  = makeCell({ biome: 'forest',    feature: 'lake',  waterDepth: 2.0, walkable: false });
    for (const cell of [riverCell, lakeCell]) {
      expect(isScatterAllowed(cell, 'tree')).toBe(false);
      expect(isScatterAllowed(cell, 'bush')).toBe(false);
      expect(isScatterAllowed(cell, 'rock')).toBe(false);
    }
  });
});

describe('isWaterDecorAllowed', () => {
  it('allows reeds on any dry tile (river_bank feature tag not required)', () => {
    // Only river tiles get the explicit 'river_bank' feature tag
    // (HydrologyGenerator.ts) — lakes/oceans don't, so reed placement must not
    // depend on that specific tag; actual shoreline adjacency is a separate
    // grid-neighbor check (isNearWaterTile), not this per-cell function's job.
    expect(isWaterDecorAllowed(makeCell({ feature: 'river_bank' }), 'reed')).toBe(true);
    expect(isWaterDecorAllowed(makeCell({ feature: 'none' }), 'reed')).toBe(true);
  });

  it('disallows reeds on a submerged tile or on beach (beach already has its own decor)', () => {
    expect(isWaterDecorAllowed(makeCell({ feature: 'river', waterDepth: 2.0, walkable: false }), 'reed')).toBe(false);
    expect(isWaterDecorAllowed(makeCell({ biome: 'beach' }), 'reed')).toBe(false);
  });

  it('allows underwater props on any submerged tile (river, lake, ocean, deep_ocean alike)', () => {
    const riverCell = makeCell({ feature: 'river', waterDepth: 2.0, walkable: false });
    const lakeCell   = makeCell({ feature: 'lake',  waterDepth: 2.0, walkable: false });
    const oceanCell  = makeCell({ biome: 'ocean',      waterDepth: 1.0, walkable: false });
    const deepCell   = makeCell({ biome: 'deep_ocean', waterDepth: 2.5, walkable: false });
    for (const cell of [riverCell, lakeCell, oceanCell, deepCell]) {
      expect(isWaterDecorAllowed(cell, 'underwater')).toBe(true);
    }
  });

  it('disallows underwater props on a dry tile (waterDepth 0), including a walkable ford', () => {
    expect(isWaterDecorAllowed(makeCell(), 'underwater')).toBe(false);
    expect(isWaterDecorAllowed(makeCell({ feature: 'river_ford', waterDepth: 0 }), 'underwater')).toBe(false);
  });

  it('disallows both kinds inside a settlement zone', () => {
    const cell = makeCell({ feature: 'river_bank', settlementId: 3 });
    expect(isWaterDecorAllowed(cell, 'reed')).toBe(false);
    const underwaterCell = makeCell({ feature: 'river', waterDepth: 2.0, walkable: false, settlementId: 3 });
    expect(isWaterDecorAllowed(underwaterCell, 'underwater')).toBe(false);
  });

  it('disallows both kinds on a non-empty (occupied) tile', () => {
    const cell = makeCell({ feature: 'river_bank', content: 'dungeon_entrance' });
    expect(isWaterDecorAllowed(cell, 'reed')).toBe(false);
    const underwaterCell = makeCell({ feature: 'river', waterDepth: 2.0, walkable: false, content: 'dungeon_entrance' });
    expect(isWaterDecorAllowed(underwaterCell, 'underwater')).toBe(false);
  });
});

describe('isNearWaterTile', () => {
  function makeGrid(size: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  it('returns true when an orthogonal neighbor is submerged', () => {
    const wg = makeGrid(5);
    wg.set(3, 2, { feature: 'lake', waterDepth: 2.0, walkable: false });
    expect(isNearWaterTile(wg, 2, 2)).toBe(true); // west neighbor of the lake tile
  });

  it('returns false when no orthogonal neighbor is submerged (a diagonal water tile does not count)', () => {
    const wg = makeGrid(5);
    wg.set(3, 3, { feature: 'lake', waterDepth: 2.0, walkable: false }); // diagonal from (2,2)
    expect(isNearWaterTile(wg, 2, 2)).toBe(false);
  });

  it('returns false deep in dry land, far from any water', () => {
    const wg = makeGrid(5);
    expect(isNearWaterTile(wg, 2, 2)).toBe(false);
  });

  it('skips out-of-bounds neighbors instead of throwing (map edge is safe)', () => {
    const wg = makeGrid(5);
    expect(() => isNearWaterTile(wg, 0, 0)).not.toThrow();
    expect(isNearWaterTile(wg, 0, 0)).toBe(false);
  });
});
