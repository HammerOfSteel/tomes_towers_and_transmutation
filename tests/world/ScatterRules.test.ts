import { describe, it, expect } from 'vitest';
import { isScatterAllowed } from '@/world/ScatterRules';
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
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
      expect(isScatterAllowed(cell, kind)).toBe(true);
    }
  });

  it('disallows every scatter kind on a water-biome cell', () => {
    const cell = makeCell({ biome: 'ocean', waterDepth: 2.5 });
    for (const kind of ['tree', 'bush', 'rock', 'camp', 'ruin'] as const) {
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
      for (const kind of ['tree', 'bush', 'rock'] as const) {
        expect(isScatterAllowed(cell, kind)).toBe(false);
      }
    }
  });

  it('disallows tree/bush/rock on a non-empty content cell (building, entrance, etc.)', () => {
    const cell = makeCell({ content: 'building' });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
  });

  it('disallows tree/bush/rock inside a settlement zone', () => {
    const cell = makeCell({ settlementId: 3 });
    expect(isScatterAllowed(cell, 'tree')).toBe(false);
    expect(isScatterAllowed(cell, 'bush')).toBe(false);
    expect(isScatterAllowed(cell, 'rock')).toBe(false);
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
});
