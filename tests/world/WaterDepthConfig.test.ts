import { describe, it, expect } from 'vitest';
import {
  RIVER_DEPTH_WU,
  OCEAN_SHALLOW_DEPTH_WU,
  OCEAN_DEEP_DEPTH_WU,
  LAKE_DEPTH_WU,
  LEVEL_HEIGHT,
  physicalHeightWU,
} from '@/world/WaterDepthConfig';

describe('WaterDepthConfig — physicalHeightWU', () => {
  it('equals elevation * LEVEL_HEIGHT for a dry tile (waterDepth 0)', () => {
    expect(physicalHeightWU({ elevation: 2, waterDepth: 0 })).toBeCloseTo(2 * LEVEL_HEIGHT, 9);
  });

  it('subtracts the river depth for a river tile', () => {
    const h = physicalHeightWU({ elevation: 3, waterDepth: RIVER_DEPTH_WU });
    expect(h).toBeCloseTo(3 * LEVEL_HEIGHT - RIVER_DEPTH_WU, 9);
  });

  it('subtracts the shallow ocean depth for a shallow-band ocean tile', () => {
    const h = physicalHeightWU({ elevation: 0, waterDepth: OCEAN_SHALLOW_DEPTH_WU });
    expect(h).toBeCloseTo(0 * LEVEL_HEIGHT - OCEAN_SHALLOW_DEPTH_WU, 9);
  });

  it('subtracts the deep ocean depth for a deep-band ocean tile', () => {
    const h = physicalHeightWU({ elevation: 0, waterDepth: OCEAN_DEEP_DEPTH_WU });
    expect(h).toBeCloseTo(0 * LEVEL_HEIGHT - OCEAN_DEEP_DEPTH_WU, 9);
  });

  it('deep ocean depth is deeper than shallow ocean depth, which is deeper than river depth', () => {
    expect(OCEAN_DEEP_DEPTH_WU).toBeGreaterThan(OCEAN_SHALLOW_DEPTH_WU);
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeGreaterThan(0);
  });

  it('all depth constants are positive', () => {
    expect(RIVER_DEPTH_WU).toBeGreaterThan(0);
    expect(OCEAN_SHALLOW_DEPTH_WU).toBeGreaterThan(0);
    expect(OCEAN_DEEP_DEPTH_WU).toBeGreaterThan(0);
  });
});

describe('WaterDepthConfig — LAKE_DEPTH_WU', () => {
  it('is a positive number', () => {
    expect(LAKE_DEPTH_WU).toBeGreaterThan(0);
  });

  it('equals RIVER_DEPTH_WU (same swim-triggering depth, separately named)', () => {
    expect(LAKE_DEPTH_WU).toBe(RIVER_DEPTH_WU);
  });

  it('subtracts the lake depth for a lake tile', () => {
    const h = physicalHeightWU({ elevation: 1, waterDepth: LAKE_DEPTH_WU });
    expect(h).toBeCloseTo(1 * LEVEL_HEIGHT - LAKE_DEPTH_WU, 9);
  });
});
