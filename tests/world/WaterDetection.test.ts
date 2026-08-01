import { describe, it, expect } from 'vitest';
import { isInWaterAt } from '@/world/WaterDetection';
import type { WorldCell } from '@/world/WorldGrid';

function makeCell(overrides: Partial<WorldCell>): WorldCell {
  return {
    elevation: 0,
    biome: 'bog',
    feature: 'none',
    ...overrides,
  } as WorldCell;
}

function makeMockGrid(cell: WorldCell) {
  return {
    worldToGrid: (_wx: number, _wz: number) => ({ col: 3, row: 5 }),
    get: (_col: number, _row: number) => cell,
  };
}

describe('isInWaterAt', () => {
  it('returns true for a river-feature cell', () => {
    const wg = makeMockGrid(makeCell({ feature: 'river' }));
    expect(isInWaterAt(wg as any, 10, 20)).toBe(true);
  });

  it('returns true for a water-biome cell', () => {
    const wg = makeMockGrid(makeCell({ biome: 'water' }));
    expect(isInWaterAt(wg as any, 10, 20)).toBe(true);
  });

  it('returns false for a plain grass/dirt cell', () => {
    const wg = makeMockGrid(makeCell({ feature: 'none', biome: 'grass' as any }));
    expect(isInWaterAt(wg as any, 10, 20)).toBe(false);
  });

  it('delegates coordinate lookup to worldToGrid (any world position)', () => {
    const wg = makeMockGrid(makeCell({ feature: 'river' }));
    expect(isInWaterAt(wg as any, -999, 999)).toBe(true);
  });
});
