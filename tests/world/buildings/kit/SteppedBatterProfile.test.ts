import { describe, expect, it } from 'vitest';
import { makeBatteredRectangleTiers, makeSteppedOctagonTiers } from '@/world/buildings/kit/SteppedBatterProfile';

describe('makeBatteredRectangleTiers', () => {
  it('produces one tier per height entry with widening lower / narrower upper extents', () => {
    const tiers = makeBatteredRectangleTiers(1.5, 1.0, [1.0, 0.9, 0.8]);
    expect(tiers).toHaveLength(3);
    // Lowest tier should batter outward beyond the nominal base half-width.
    expect(tiers[0]!.halfW).toBeGreaterThan(1.5);
    // Each subsequent tier should step inward relative to the previous one.
    expect(tiers[1]!.halfW).toBeLessThan(tiers[0]!.halfW);
    expect(tiers[2]!.halfW).toBeLessThan(tiers[1]!.halfW);
    expect(tiers[1]!.halfD).toBeLessThan(tiers[0]!.halfD);
  });

  it('stacks tiers upward with cumulative y offsets and per-tier face lists', () => {
    const tiers = makeBatteredRectangleTiers(1.2, 1.2, [1.0, 1.0]);
    expect(tiers[0]!.y).toBe(0);
    expect(tiers[1]!.y).toBeCloseTo(1.0, 5);
    expect(tiers[0]!.faces).toHaveLength(4);
    expect(tiers[0]!.points).toHaveLength(4);
  });
});

describe('makeSteppedOctagonTiers', () => {
  it('produces radii that step inward per tier and matching face counts', () => {
    const tiers = makeSteppedOctagonTiers(1.4, [0.9, 0.9, 0.9]);
    expect(tiers).toHaveLength(3);
    expect(tiers[1]!.radius).toBeLessThan(tiers[0]!.radius);
    expect(tiers[2]!.radius).toBeLessThan(tiers[1]!.radius);
    expect(tiers[0]!.faces).toHaveLength(8);
  });
});
