import { describe, it, expect } from 'vitest';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import type { WorldSize } from '@/world/WorldGenConfig';

describe('WorldGenConfig — 512 world-size tier', () => {
  it('accepts 512 as a valid WorldSize', () => {
    const size: WorldSize = 512;
    expect(size).toBe(512);
  });

  it('defaults to the larger 512 world size (foundation rebuild)', () => {
    expect(DEFAULT_WORLD_GEN_CONFIG.worldSize).toBe(512);
  });
});
