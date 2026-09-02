// tests/world/ShorelineWobble.test.ts
import { describe, it, expect } from 'vitest';
import {
  SHORELINE_WOBBLE_SUBDIVISIONS,
  shorelineEdgeOffsets,
  shorelineEdgePoints,
  waterAdjacency,
} from '@/world/ShorelineWobble';
import { WorldGrid } from '@/world/WorldGrid';

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
      for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(0.4);
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

describe('waterAdjacency', () => {
  it('detects a wet neighbor to the south (row + 1)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0 }); // south of (1,1)
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: true, east: false, west: false });
  });

  it('detects wet neighbors on multiple sides at once (a peninsula tip)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 2, { waterDepth: 2.0 }); // south
    wg.set(2, 1, { waterDepth: 2.0 }); // east
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: true, east: true, west: false });
  });

  it('returns all-false when this cell is itself wet', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0 });
    wg.set(1, 2, { waterDepth: 0 });
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: false, east: false, west: false });
  });

  it('returns all-false when every neighbor is dry', () => {
    const wg = new WorldGrid(3, 3);
    const adj = waterAdjacency(wg, 1, 1);
    expect(adj).toEqual({ north: false, south: false, east: false, west: false });
  });

  it('does not throw at the map edge (out-of-bounds neighbor defaults to dry)', () => {
    const wg = new WorldGrid(3, 3);
    expect(() => waterAdjacency(wg, 0, 0)).not.toThrow();
    expect(waterAdjacency(wg, 0, 0)).toEqual({ north: false, south: false, east: false, west: false });
  });
});

describe('chunk-boundary continuity', () => {
  it('two calls representing two different chunks rendering opposite sides of the same shared edge produce identical points', () => {
    const edgeFromChunkA = shorelineEdgePoints(40, 12, 42, 12);
    const edgeFromChunkB = shorelineEdgePoints(40, 12, 42, 12);
    expect(edgeFromChunkB).toEqual(edgeFromChunkA);
  });
});
