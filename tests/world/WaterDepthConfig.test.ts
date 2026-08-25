import { describe, it, expect } from 'vitest';
import {
  RIVER_DEPTH_WU,
  OCEAN_DEPTH_WU,
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

  it('subtracts the ocean depth for an ocean tile', () => {
    const h = physicalHeightWU({ elevation: 0, waterDepth: OCEAN_DEPTH_WU });
    expect(h).toBeCloseTo(0 * LEVEL_HEIGHT - OCEAN_DEPTH_WU, 9);
  });

  it('ocean depth is deeper than river depth', () => {
    expect(OCEAN_DEPTH_WU).toBeGreaterThan(RIVER_DEPTH_WU);
  });

  it('both depth constants are positive', () => {
    expect(RIVER_DEPTH_WU).toBeGreaterThan(0);
    expect(OCEAN_DEPTH_WU).toBeGreaterThan(0);
  });
});
