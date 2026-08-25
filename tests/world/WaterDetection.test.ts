import { describe, it, expect } from 'vitest';
import { getWaterInfoAt } from '@/world/WaterDetection';
import { LEVEL_HEIGHT, RIVER_DEPTH_WU, OCEAN_DEPTH_WU } from '@/world/WaterDepthConfig';
import type { WorldCell } from '@/world/WorldGrid';

function makeCell(overrides: Partial<WorldCell>): WorldCell {
  return {
    elevation: 0,
    biome: 'bog',
    feature: 'none',
    waterDepth: 0,
    ...overrides,
  } as WorldCell;
}

function makeMockGrid(cell: WorldCell) {
  return {
    worldToGrid: (_wx: number, _wz: number) => ({ col: 3, row: 5 }),
    get: (_col: number, _row: number) => cell,
  };
}

describe('getWaterInfoAt', () => {
  it('returns null for a dry cell (waterDepth 0, no feature)', () => {
    const wg = makeMockGrid(makeCell({ feature: 'none', biome: 'grass' as any }));
    expect(getWaterInfoAt(wg as any, 10, 20)).toBeNull();
  });

  it('returns null for a river_ford cell (waterDepth 0 — walkable crossing)', () => {
    const wg = makeMockGrid(makeCell({ feature: 'river_ford', waterDepth: 0 }));
    expect(getWaterInfoAt(wg as any, 10, 20)).toBeNull();
  });

  it('returns surface/floor info for a river cell', () => {
    const wg = makeMockGrid(makeCell({ feature: 'river', waterDepth: RIVER_DEPTH_WU, elevation: 2 }));
    const info = getWaterInfoAt(wg as any, 10, 20);
    expect(info).not.toBeNull();
    expect(info!.surfaceY).toBeCloseTo(2 * LEVEL_HEIGHT + 0.05, 9);
    expect(info!.floorY).toBeCloseTo(2 * LEVEL_HEIGHT - RIVER_DEPTH_WU, 9);
    expect(info!.depth).toBe(RIVER_DEPTH_WU);
  });

  it('returns surface/floor info for an ocean-biome water cell', () => {
    const wg = makeMockGrid(makeCell({ biome: 'water' as any, waterDepth: OCEAN_DEPTH_WU, elevation: 0 }));
    const info = getWaterInfoAt(wg as any, 10, 20);
    expect(info).not.toBeNull();
    expect(info!.depth).toBe(OCEAN_DEPTH_WU);
    expect(info!.floorY).toBeCloseTo(-OCEAN_DEPTH_WU, 9);
  });

  it('delegates coordinate lookup to worldToGrid (any world position)', () => {
    const wg = makeMockGrid(makeCell({ feature: 'river', waterDepth: RIVER_DEPTH_WU }));
    expect(getWaterInfoAt(wg as any, -999, 999)).not.toBeNull();
  });
});
