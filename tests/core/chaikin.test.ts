import { describe, it, expect } from 'vitest';
import { chaikin } from '@/core/chaikin';

describe('chaikin', () => {
  it('returns the same start and end points after smoothing', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const out = chaikin(pts, 3);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('produces more points with each pass (corner cutting subdivides)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const onePass = chaikin(pts, 1);
    const twoPass = chaikin(pts, 2);
    expect(onePass.length).toBeGreaterThan(pts.length);
    expect(twoPass.length).toBeGreaterThan(onePass.length);
  });

  it('is deterministic for the same input', () => {
    const pts = [{ x: 1, y: 2 }, { x: 5, y: 8 }, { x: 9, y: 3 }, { x: 2, y: 7 }];
    expect(chaikin(pts, 3)).toEqual(chaikin(pts, 3));
  });

  it('defaults to 3 passes when passes is omitted', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(chaikin(pts)).toEqual(chaikin(pts, 3));
  });

  it('handles a 2-point input without throwing', () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 4 }];
    expect(() => chaikin(pts, 2)).not.toThrow();
  });
});
