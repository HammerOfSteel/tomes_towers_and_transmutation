import { describe, it, expect } from 'vitest';
import { poissonDisk } from '@/core/poissonDisk';
import { mulberry32 } from '@/core/prng';

describe('poissonDisk', () => {
  it('produces no two points closer than minDist', () => {
    const seeds = [0, 1, 42, 999, 0xDEAD_BEEF];
    for (const seed of seeds) {
      const rand  = mulberry32(seed);
      const pts   = poissonDisk(100, 100, 8, rand);
      const r2    = 8 * 8; // squared min distance

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i][0] - pts[j][0];
          const dy = pts[i][1] - pts[j][1];
          expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(r2 - 1e-9);
        }
      }
    }
  });

  it('all output points are within the sampling area', () => {
    const rand = mulberry32(7);
    const W = 60, H = 40;
    const pts = poissonDisk(W, H, 5, rand);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(H);
    }
  });

  it('is deterministic: same seed → same points', () => {
    const rand1 = mulberry32(100);
    const rand2 = mulberry32(100);
    const pts1 = poissonDisk(80, 80, 7, rand1);
    const pts2 = poissonDisk(80, 80, 7, rand2);
    expect(pts1).toEqual(pts2);
  });

  it('produces more than one point for a reasonably large area', () => {
    const rand = mulberry32(55);
    const pts = poissonDisk(200, 200, 10, rand);
    expect(pts.length).toBeGreaterThan(20);
  });
});
