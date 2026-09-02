// tests/levels/WallCornerPilasters.test.ts
import { describe, it, expect } from 'vitest';
import { findWallCornerPilasterPoints } from '@/levels/WallCornerPilasters';

/** Builds a wallTileSet from a list of [x, z] wall-cell coordinates,
 *  matching BlueprintRenderer.ts's own "x,z" string-key convention. */
function wallSet(cells: Array<[number, number]>): Set<string> {
  return new Set(cells.map(([x, z]) => `${x},${z}`));
}

describe('findWallCornerPilasterPoints', () => {
  it('places no pilaster for a solid 3x3 block (every corner is empty or full, never inner_corner)', () => {
    const cells: Array<[number, number]> = [];
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cells.push([x, z]);
    const points = findWallCornerPilasterPoints(wallSet(cells));
    expect(points).toHaveLength(0);
  });

  it('places no pilaster along a straight wall run (every corner is an edge shape)', () => {
    // A straight horizontal wall run: (0,0), (1,0), (2,0) all wall, nothing else.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [2, 0]]));
    expect(points).toHaveLength(0);
  });

  it('places a pilaster at the previously-handled inner_corner sub-case (diagonal wall, one bridge wall)', () => {
    // Vertex shared by (0,0)[wall], (1,0)[wall, bridge], (1,1)[wall, diagonal], (0,1)[floor].
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [1, 1]]));
    expect(points.some(p => Math.abs(p.cx - 0.5) < 1e-9 && Math.abs(p.cz - 0.5) < 1e-9)).toBe(true);
  });

  it('places a pilaster at the PREVIOUSLY-MISSED mirror inner_corner sub-case (diagonal floor, both bridges wall) -- the actual bug fix', () => {
    // Vertex shared by (0,0)[wall], (1,0)[wall, bridge], (0,1)[wall, bridge], (1,1)[floor, diagonal].
    // The old ad-hoc rule required the diagonal (1,1) to be wall before even
    // checking the bridges, so this configuration was never detected --
    // this test is the direct proof of the fix.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 0], [0, 1]]));
    expect(points.some(p => Math.abs(p.cx - 0.5) < 1e-9 && Math.abs(p.cz - 0.5) < 1e-9)).toBe(true);
  });

  it('places no pilaster for an outer_corner (a single isolated wall tile) -- deliberately out of scope', () => {
    const points = findWallCornerPilasterPoints(wallSet([[5, 5]]));
    expect(points).toHaveLength(0);
  });

  it('places no pilaster for a diagonal/saddle checkerboard touch', () => {
    // (0,0) and (1,1) wall (diagonal pair), (1,0) and (0,1) floor.
    const points = findWallCornerPilasterPoints(wallSet([[0, 0], [1, 1]]));
    expect(points).toHaveLength(0);
  });

  it('never places two pilasters at the exact same point (dedup, matching the original code\'s own placedCorners guard)', () => {
    // A small stepped ring likely to have multiple wall tiles sharing the same corner vertex.
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]];
    const points = findWallCornerPilasterPoints(wallSet(cells));
    const seen = new Set<string>();
    for (const p of points) {
      const key = `${p.cx.toFixed(6)},${p.cz.toFixed(6)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('is deterministic for the same input', () => {
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [2, 2]];
    const a = findWallCornerPilasterPoints(wallSet(cells));
    const b = findWallCornerPilasterPoints(wallSet(cells));
    expect(a).toEqual(b);
  });
});
