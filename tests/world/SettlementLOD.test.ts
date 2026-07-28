/**
 * SettlementLOD.test.ts — 02-game-world-integration (SI-5)
 */

import { describe, it, expect } from 'vitest';
import {
  settlementLodTier, shouldSpawnSettlementNpcs,
  LOD_HIDDEN_DISTANCE, LOD_FULL_DISTANCE, LOD_NPC_DISTANCE,
} from '@/world/SettlementLOD';

describe('settlementLodTier', () => {
  it('is hidden beyond 80u', () => {
    expect(settlementLodTier(LOD_HIDDEN_DISTANCE + 1)).toBe('hidden');
    expect(settlementLodTier(200)).toBe('hidden');
  });

  it('is billboard between 40u and 80u', () => {
    expect(settlementLodTier(LOD_HIDDEN_DISTANCE)).toBe('billboard');
    expect(settlementLodTier(60)).toBe('billboard');
    expect(settlementLodTier(LOD_FULL_DISTANCE + 1)).toBe('billboard');
  });

  it('is full within 40u', () => {
    expect(settlementLodTier(LOD_FULL_DISTANCE)).toBe('full');
    expect(settlementLodTier(0)).toBe('full');
    expect(settlementLodTier(10)).toBe('full');
  });
});

describe('shouldSpawnSettlementNpcs', () => {
  it('is true within 20u', () => {
    expect(shouldSpawnSettlementNpcs(0)).toBe(true);
    expect(shouldSpawnSettlementNpcs(LOD_NPC_DISTANCE)).toBe(true);
  });

  it('is false beyond 20u', () => {
    expect(shouldSpawnSettlementNpcs(LOD_NPC_DISTANCE + 0.01)).toBe(false);
    expect(shouldSpawnSettlementNpcs(50)).toBe(false);
  });
});
