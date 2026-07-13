import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, randPick } from '@/core/prng';

describe('mulberry32', () => {
  it('produces values in [0, 1)', () => {
    const rand = mulberry32(0);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic: same seed → identical sequence', () => {
    const SEED = 0xDEADBEEF;
    const r1 = mulberry32(SEED);
    const r2 = mulberry32(SEED);
    for (let i = 0; i < 50; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it('different seeds produce different first values', () => {
    const v1 = mulberry32(1)();
    const v2 = mulberry32(2)();
    expect(v1).not.toBe(v2);
  });

  it('sequential calls on the same instance advance state', () => {
    const rand = mulberry32(42);
    const a = rand();
    const b = rand();
    expect(a).not.toBe(b);
  });
});

describe('randInt', () => {
  it('returns integers in [0, n)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = randInt(rand, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('covers the full range with n=2 over many draws', () => {
    const rand = mulberry32(99);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) seen.add(randInt(rand, 2));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(1)).toBe(true);
  });
});

describe('randPick', () => {
  it('returns undefined for an empty array', () => {
    expect(randPick(mulberry32(0), [])).toBeUndefined();
  });

  it('always returns the only element for a singleton array', () => {
    const rand = mulberry32(1);
    expect(randPick(rand, ['x'])).toBe('x');
  });

  it('picks from all elements over many draws', () => {
    const rand = mulberry32(42);
    const pool = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randPick(rand, pool)!);
    expect(seen.size).toBe(pool.length);
  });
});
