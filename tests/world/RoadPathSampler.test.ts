import { describe, it, expect } from 'vitest';
import { computeTileRoadCoverage, type RoadPathSegment } from '@/world/RoadPathSampler';

describe('computeTileRoadCoverage', () => {
  it('returns all-null coverage when there are no paths', () => {
    const result = computeTileRoadCoverage([], 0, 0, 4, 4);
    expect(result.length).toBe(16);
    expect(result.every(v => v === null)).toBe(true);
  });

  it('marks sub-tiles along a straight horizontal path as road, others as ground', () => {
    // A tile from (0,0) to (4,4), subdivided 4x4 (1 world-unit sub-tiles).
    // A road running along z=2 (the tile's vertical center) with width 1.5
    // should cover the row of sub-tiles centered at z=2 (sub-row index 1,
    // whose center is at z=1.5... let's use exact centers to avoid ambiguity).
    const path: RoadPathSegment = {
      points: [{ x: -10, z: 2 }, { x: 10, z: 2 }],
      width: 1.0,
      variant: 'cobblestone',
    };
    const result = computeTileRoadCoverage([path], 0, 0, 4, 4);
    // Sub-tile centers (subSize=1): row0 z=0.5, row1 z=1.5, row2 z=2.5, row3 z=3.5
    // distance from z=2 line: row0=1.5, row1=0.5, row2=0.5, row3=1.5; halfWidth=0.5
    // so rows 1 and 2 (distance exactly 0.5, <=) should be road, rows 0/3 ground.
    for (let sz = 0; sz < 4; sz++) {
      for (let sx = 0; sx < 4; sx++) {
        const idx = sz * 4 + sx;
        if (sz === 1 || sz === 2) {
          expect(result[idx]).toBe('cobblestone');
        } else {
          expect(result[idx]).toBeNull();
        }
      }
    }
  });

  it('returns the variant of the nearer path when two paths both reach the same sub-tile', () => {
    const near: RoadPathSegment = { points: [{ x: -10, z: 1.9 }, { x: 10, z: 1.9 }], width: 4, variant: 'near' };
    const far: RoadPathSegment  = { points: [{ x: -10, z: 2.5 }, { x: 10, z: 2.5 }], width: 4, variant: 'far' };
    const result = computeTileRoadCoverage([far, near], 0, 0, 4, 4);
    // Sub-tile at row 1 (center z=1.5) is closer to the "near" path (z=1.9, dist 0.4) than "far" (z=2.5, dist 1.0).
    expect(result[1 * 4 + 0]).toBe('near');
  });

  it('leaves every sub-tile null (no coverage) for a path whose bounding box never reaches the tile', () => {
    const path: RoadPathSegment = { points: [{ x: 1000, z: 1000 }, { x: 1001, z: 1001 }], width: 1, variant: 'far-away' };
    const result = computeTileRoadCoverage([path], 0, 0, 4, 4);
    expect(result.every(v => v === null)).toBe(true);
  });

  it('handles a degenerate single-point path segment list without throwing', () => {
    const path: RoadPathSegment = { points: [{ x: 2, z: 2 }], width: 1, variant: 'point' };
    expect(() => computeTileRoadCoverage([path], 0, 0, 4, 4)).not.toThrow();
  });

  it('is deterministic (same inputs, same output)', () => {
    const path: RoadPathSegment = { points: [{ x: 0, z: 0 }, { x: 4, z: 4 }], width: 1, variant: 'diag' };
    const a = computeTileRoadCoverage([path], 0, 0, 4, 4);
    const b = computeTileRoadCoverage([path], 0, 0, 4, 4);
    expect(a).toEqual(b);
  });

  it('returns a result array sized subdivisions*subdivisions for non-square subdivision counts too', () => {
    const result = computeTileRoadCoverage([], 0, 0, 4, 2);
    expect(result.length).toBe(4);
  });
});
