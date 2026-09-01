import { describe, it, expect } from 'vitest';
import {
  decayFactor, shouldPlaceStamp, computeCrushAt,
  TrampleMap, MAX_TRAMPLE_STAMPS, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S,
  TRAMPLE_MIN_STAMP_SPACING_WU, FALLBACK_STAMP_POSITIONS, FALLBACK_STAMP_AGES,
} from '@/world/GrassTrample';

describe('decayFactor', () => {
  it('returns exactly 0.5 when dt equals the half-life', () => {
    expect(decayFactor(2.0, 2.0)).toBeCloseTo(0.5, 10);
  });

  it('returns 1 when dt is 0 (no decay yet)', () => {
    expect(decayFactor(0, 2.0)).toBe(1);
  });

  it('returns 0.125 after 3 half-lives', () => {
    expect(decayFactor(6.0, 2.0)).toBeCloseTo(0.125, 10);
  });

  it('is effectively 0 for a very large age (inactive-slot sentinel)', () => {
    expect(decayFactor(1e6, 2.0)).toBeCloseTo(0, 10);
  });
});

describe('shouldPlaceStamp', () => {
  it('always places the first stamp (lastStampPos is null)', () => {
    expect(shouldPlaceStamp(null, { x: 5, z: 5 }, 1.2)).toBe(true);
  });

  it('does not place a stamp at the exact same spot (zero-distance repeat)', () => {
    const p = { x: 10, z: 10 };
    expect(shouldPlaceStamp(p, { x: 10, z: 10 }, 1.2)).toBe(false);
  });

  it('does not place a stamp just under the minimum spacing', () => {
    expect(shouldPlaceStamp({ x: 0, z: 0 }, { x: 1.1, z: 0 }, 1.2)).toBe(false);
  });

  it('places a stamp exactly at the minimum spacing (boundary is inclusive)', () => {
    expect(shouldPlaceStamp({ x: 0, z: 0 }, { x: 1.2, z: 0 }, 1.2)).toBe(true);
  });

  it('places a stamp well past the minimum spacing', () => {
    expect(shouldPlaceStamp({ x: 0, z: 0 }, { x: 100, z: 100 }, 1.2)).toBe(true);
  });

  it('measures distance diagonally (x and z both contribute)', () => {
    // distance = sqrt(1^2 + 1^2) = 1.414 > 1.2
    expect(shouldPlaceStamp({ x: 0, z: 0 }, { x: 1, z: 1 }, 1.2)).toBe(true);
  });
});

describe('computeCrushAt', () => {
  it('returns 0 for the fallback (all-inactive) stamp arrays everywhere', () => {
    const crush = computeCrushAt(
      FALLBACK_STAMP_POSITIONS, FALLBACK_STAMP_AGES, MAX_TRAMPLE_STAMPS,
      0, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S,
    );
    expect(crush).toBe(0);
  });

  it('returns ~1 exactly at a fresh (age=0) stamp position', () => {
    const positions = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
    const ages = new Float32Array(MAX_TRAMPLE_STAMPS).fill(1e6);
    positions[0] = 10; positions[1] = 20; // stamp 0 at (10, 20)
    ages[0] = 0;
    const crush = computeCrushAt(positions, ages, MAX_TRAMPLE_STAMPS, 10, 20, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crush).toBeCloseTo(1, 5);
  });

  it('falls off with distance from the stamp and returns 0 beyond the stamp radius', () => {
    const positions = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
    const ages = new Float32Array(MAX_TRAMPLE_STAMPS).fill(1e6);
    ages[0] = 0; // stamp 0 at (0, 0), fresh
    const near = computeCrushAt(positions, ages, MAX_TRAMPLE_STAMPS, TRAMPLE_STAMP_RADIUS / 2, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    const far = computeCrushAt(positions, ages, MAX_TRAMPLE_STAMPS, TRAMPLE_STAMP_RADIUS * 2, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(near).toBeCloseTo(0.5, 5);
    expect(far).toBe(0);
  });

  it('decays over time (older stamp -> lower crush at its own position)', () => {
    const positions = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
    const ages = new Float32Array(MAX_TRAMPLE_STAMPS).fill(1e6);
    ages[0] = TRAMPLE_DECAY_HALF_LIFE_S; // exactly one half-life old
    const crush = computeCrushAt(positions, ages, MAX_TRAMPLE_STAMPS, 0, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crush).toBeCloseTo(0.5, 5);
  });

  it('takes the max across overlapping stamps, not a sum (never exceeds 1)', () => {
    const positions = new Float32Array(MAX_TRAMPLE_STAMPS * 2);
    const ages = new Float32Array(MAX_TRAMPLE_STAMPS).fill(1e6);
    ages[0] = 0; ages[1] = 0; // two fresh stamps, both at (0,0)
    const crush = computeCrushAt(positions, ages, MAX_TRAMPLE_STAMPS, 0, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crush).toBeCloseTo(1, 5);
  });
});

describe('TrampleMap', () => {
  it('constructs with all stamps inactive (zero crush everywhere)', () => {
    const map = new TrampleMap();
    const crush = computeCrushAt(map.stampPositions, map.stampAges, MAX_TRAMPLE_STAMPS, 0, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crush).toBe(0);
    map.dispose();
  });

  it('placing a single stamp makes crush ~1 at that exact position immediately after', () => {
    const map = new TrampleMap();
    map.update(5, 5, 1 / 30);
    const crush = computeCrushAt(map.stampPositions, map.stampAges, MAX_TRAMPLE_STAMPS, 5, 5, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crush).toBeCloseTo(1, 5);
    map.dispose();
  });

  it('does not place a new stamp for a tiny movement under TRAMPLE_MIN_STAMP_SPACING_WU', () => {
    const map = new TrampleMap();
    map.update(0, 0, 1 / 30);
    map.update(0.1, 0, 1 / 30); // well under the 1.2 WU spacing
    // Only slot 0 should ever have been written — slot 1 stays at the sentinel age.
    expect(map.stampAges[1]).toBeGreaterThan(1000);
    map.dispose();
  });

  it('places a new stamp once the player has moved past TRAMPLE_MIN_STAMP_SPACING_WU', () => {
    const map = new TrampleMap();
    map.update(0, 0, 1 / 30);
    map.update(TRAMPLE_MIN_STAMP_SPACING_WU + 1, 0, 1 / 30);
    expect(map.stampAges[1]).toBeLessThan(1000); // slot 1 was written this call
    map.dispose();
  });

  it('ages existing stamps over successive update() calls', () => {
    const map = new TrampleMap();
    map.update(0, 0, 1);
    expect(map.stampAges[0]).toBeCloseTo(0, 5);
    map.update(0, 0, 1); // same position — no new stamp, but existing one ages
    expect(map.stampAges[0]).toBeCloseTo(1, 5);
    map.dispose();
  });

  it('wraps the ring buffer after MAX_TRAMPLE_STAMPS distinct stamps (oldest is overwritten)', () => {
    const map = new TrampleMap();
    // Walk far enough in a straight line to place MAX_TRAMPLE_STAMPS + 2 stamps.
    for (let i = 0; i <= MAX_TRAMPLE_STAMPS + 1; i++) {
      map.update(i * (TRAMPLE_MIN_STAMP_SPACING_WU + 1), 0, 1 / 30);
    }
    // Slot 0 (the very first stamp, at x=0) should have been overwritten by the wrap —
    // crush at the original x=0 position should now be 0 (no stamp left there).
    const crushAtOrigin = computeCrushAt(map.stampPositions, map.stampAges, MAX_TRAMPLE_STAMPS, 0, 0, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S);
    expect(crushAtOrigin).toBe(0);
    map.dispose();
  });

  it('update() does not throw across many frames of simulated player movement', () => {
    const map = new TrampleMap();
    let x = 0, z = 0;
    for (let i = 0; i < 200; i++) {
      x += 0.3; z += 0.1;
      expect(() => map.update(x, z, 1 / 30)).not.toThrow();
    }
    map.dispose();
  });

  it('dispose() does not throw and can be called safely', () => {
    const map = new TrampleMap();
    expect(() => map.dispose()).not.toThrow();
  });
});
