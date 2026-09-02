// tests/world/ShorelineWobble.test.ts
import { describe, it, expect } from 'vitest';
import {
  SHORELINE_WOBBLE_SUBDIVISIONS,
  shorelineEdgeOffsets,
  shorelineEdgePoints,
} from '@/world/ShorelineWobble';

describe('shorelineEdgeOffsets', () => {
  it('returns SHORELINE_WOBBLE_SUBDIVISIONS + 1 offsets', () => {
    const offsets = shorelineEdgeOffsets(0, 0, 2, 0);
    expect(offsets).toHaveLength(SHORELINE_WOBBLE_SUBDIVISIONS + 1);
  });

  it('always pins the first and last offset to exactly 0 (tile corners never move)', () => {
    const offsets = shorelineEdgeOffsets(10, 4, 12, 4);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(0);
  });

  it('is deterministic — the same edge called twice returns identical offsets', () => {
    const a = shorelineEdgeOffsets(0, 0, 2, 0);
    const b = shorelineEdgeOffsets(0, 0, 2, 0);
    expect(a).toEqual(b);
  });

  it('keeps every interior offset within the configured amplitude bound', () => {
    for (let i = 0; i < 20; i++) {
      const x0 = i * 2, z0 = i * 3.7;
      const offsets = shorelineEdgeOffsets(x0, z0, x0 + 2, z0);
      for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(0.18);
    }
  });

  it('produces different offsets for a different edge position (not a constant)', () => {
    const a = shorelineEdgeOffsets(0, 0, 2, 0);
    const b = shorelineEdgeOffsets(100, 40, 102, 40);
    const anyDifferent = a.slice(1, -1).some((v, i) => v !== b[1 + i]);
    expect(anyDifferent).toBe(true);
  });
});

describe('shorelineEdgePoints', () => {
  it('perturbs only Z for a horizontal edge (z0 === z1)', () => {
    const pts = shorelineEdgePoints(0, 5, 2, 5);
    for (const [x] of pts) expect(Number.isFinite(x)).toBe(true);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      expect(pts[i]![0]).toBeCloseTo((0 + (2 - 0) * (i / n)), 10);
    }
  });

  it('perturbs only X for a vertical edge (x0 === x1)', () => {
    const pts = shorelineEdgePoints(7, 0, 7, 2);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      expect(pts[i]![1]).toBeCloseTo((0 + (2 - 0) * (i / n)), 10);
    }
  });

  it('endpoints are exactly the input corners, unperturbed', () => {
    const pts = shorelineEdgePoints(3, 8, 5, 8);
    expect(pts[0]).toEqual([3, 8]);
    expect(pts[pts.length - 1]).toEqual([5, 8]);
  });
});
