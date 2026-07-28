/**
 * SettlementBoundary.test.ts — 02-game-world-integration (SI-4)
 */

import { describe, it, expect } from 'vitest';
import {
  settlementBoundaryRadius, isInsideSettlementBoundary, crossedSettlementBoundary, BOUNDARY_MARGIN,
} from '@/world/SettlementBoundary';
import { spawnSettlement } from '@/world/SettlementSpawner';
import type { RealmSettlement } from '@/overworld-studio';

function makeSettlement(overrides: Partial<RealmSettlement> = {}): RealmSettlement {
  return {
    x: 0, y: 0, name: 'Boundtown', size: 'town', faction: 'human',
    ...overrides,
  };
}

describe('settlementBoundaryRadius', () => {
  it('is the farthest building distance plus the margin', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 1 });
    let maxDist = 0;
    for (const b of plan.buildings) {
      maxDist = Math.max(maxDist, Math.hypot(b.position.x - plan.position.x, b.position.z - plan.position.z));
    }
    expect(settlementBoundaryRadius(plan)).toBeCloseTo(maxDist + BOUNDARY_MARGIN, 6);
  });

  it('grows with settlement size', () => {
    const village = spawnSettlement(makeSettlement({ size: 'village' }), { seed: 2 });
    const city = spawnSettlement(makeSettlement({ size: 'city' }), { seed: 2 });
    expect(settlementBoundaryRadius(city)).toBeGreaterThan(settlementBoundaryRadius(village));
  });
});

describe('isInsideSettlementBoundary', () => {
  it('is true at the centre and false far away', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 3 });
    expect(isInsideSettlementBoundary(plan.position, plan)).toBe(true);
    expect(isInsideSettlementBoundary({ x: plan.position.x + 10000, z: plan.position.z }, plan)).toBe(false);
  });

  it('respects an explicit radius override', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 4 });
    const farPoint = { x: plan.position.x + 5, z: plan.position.z };
    expect(isInsideSettlementBoundary(farPoint, plan, 1)).toBe(false);
    expect(isInsideSettlementBoundary(farPoint, plan, 100)).toBe(true);
  });
});

describe('crossedSettlementBoundary', () => {
  it('detects entering', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 5 });
    const radius = settlementBoundaryRadius(plan);
    const outside = { x: plan.position.x + radius + 50, z: plan.position.z };
    const inside = plan.position;
    expect(crossedSettlementBoundary(outside, inside, plan, radius)).toBe('entering');
  });

  it('detects exiting', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 6 });
    const radius = settlementBoundaryRadius(plan);
    const inside = plan.position;
    const outside = { x: plan.position.x + radius + 50, z: plan.position.z };
    expect(crossedSettlementBoundary(inside, outside, plan, radius)).toBe('exiting');
  });

  it('returns null when staying on the same side', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 7 });
    const radius = settlementBoundaryRadius(plan);
    const a = { x: plan.position.x, z: plan.position.z };
    const b = { x: plan.position.x + 1, z: plan.position.z };
    expect(crossedSettlementBoundary(a, b, plan, radius)).toBeNull();

    const farA = { x: plan.position.x + radius + 100, z: plan.position.z };
    const farB = { x: plan.position.x + radius + 200, z: plan.position.z };
    expect(crossedSettlementBoundary(farA, farB, plan, radius)).toBeNull();
  });
});
