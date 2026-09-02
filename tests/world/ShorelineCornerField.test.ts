// tests/world/ShorelineCornerField.test.ts
import { describe, it, expect } from 'vitest';
import { SHORELINE_CORNER_PULL_WU, shorelineCornerPull, shorelineBoundaryPoints } from '@/world/ShorelineCornerField';
import { shorelineEdgePoints, SHORELINE_WOBBLE_SUBDIVISIONS } from '@/world/ShorelineWobble';
import { WorldGrid } from '@/world/WorldGrid';

/** Marks every tile in `wg` as land (waterDepth 0, the WorldGrid default)
 *  except the given [col, row] pairs, which are marked water. */
function makeGrid(size: number, waterTiles: Array<[number, number]>): WorldGrid {
  const wg = new WorldGrid(size, size);
  for (const [c, r] of waterTiles) wg.set(c, r, { waterDepth: 2.0, feature: 'lake' });
  return wg;
}

describe('shorelineCornerPull', () => {
  it('is zero for an all-land vertex (full)', () => {
    const wg = makeGrid(5, []);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for an all-water vertex (empty)', () => {
    const wg = makeGrid(5, [[1, 1], [2, 1], [1, 2], [2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a straight coastline vertex (edge — 2 adjacent land, 2 adjacent water)', () => {
    // Vertex (2,2) touches NW=(1,1), NE=(2,1), SE=(2,2), SW=(1,2).
    // Water north (NW, NE), land south (SE, SW) -> a straight E-W coast.
    const wg = makeGrid(5, [[1, 1], [2, 1]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a checkerboard vertex (diagonal/saddle — documented scope limitation)', () => {
    // NW=(1,1) water, SE=(2,2) water, NE=(2,1) land, SW=(1,2) land.
    const wg = makeGrid(5, [[1, 1], [2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the lone land tile for an outer_corner vertex', () => {
    // Vertex (2,2): NW=(1,1) is the ONLY land tile; NE=(2,1), SE=(2,2),
    // SW=(1,2) are all water. The pull must point toward NW: both
    // components negative, magnitude exactly SHORELINE_CORNER_PULL_WU.
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]);
    const [dx, dz] = shorelineCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(-SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-SHORELINE_CORNER_PULL_WU, 10);
  });

  it('pulls toward the lone water tile for an inner_corner vertex', () => {
    // Vertex (2,2): SE=(2,2) is the ONLY water tile; NW=(1,1), NE=(2,1),
    // SW=(1,2) are all land. The pull must point toward SE: both
    // components positive, magnitude exactly SHORELINE_CORNER_PULL_WU.
    const wg = makeGrid(5, [[2, 2]]);
    const [dx, dz] = shorelineCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
  });

  it('is deterministic — the same vertex called twice returns identical results', () => {
    const wg = makeGrid(5, [[2, 2]]);
    expect(shorelineCornerPull(wg, 2, 2)).toEqual(shorelineCornerPull(wg, 2, 2));
  });

  it('never exceeds SHORELINE_CORNER_PULL_WU on either axis, across every possible 4-tile config', () => {
    // Exhaustively try every land/water combination of the 4 surrounding
    // tiles at vertex (2,2) by directly setting them (16 total configs).
    for (let mask = 0; mask < 16; mask++) {
      const wg = makeGrid(5, []);
      const cells: Array<[number, number]> = [[1, 1], [2, 1], [2, 2], [1, 2]]; // NW,NE,SE,SW
      for (let i = 0; i < 4; i++) {
        if (((mask >> i) & 1) === 0) wg.set(cells[i]![0], cells[i]![1], { waterDepth: 2.0 });
      }
      const [dx, dz] = shorelineCornerPull(wg, 2, 2);
      expect(Math.abs(dx)).toBeLessThanOrEqual(SHORELINE_CORNER_PULL_WU);
      expect(Math.abs(dz)).toBeLessThanOrEqual(SHORELINE_CORNER_PULL_WU);
    }
  });

  it('treats out-of-bounds tiles as land, matching waterAdjacency()\'s convention', () => {
    const wg = makeGrid(3, [[0, 0]]); // water at the very corner tile
    // Vertex (0,0): NW=(-1,-1) oob->land, NE=(0,-1) oob->land,
    // SE=(0,0) water, SW=(-1,0) oob->land -> inner_corner, minority=water@SE.
    expect(() => shorelineCornerPull(wg, 0, 0)).not.toThrow();
    const [dx, dz] = shorelineCornerPull(wg, 0, 0);
    expect(dx).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(SHORELINE_CORNER_PULL_WU, 10);
  });

  it('an isolated 1-tile pond pulls all 4 of its corners inward symmetrically', () => {
    // Pond at (2,2) in an otherwise all-land 5x5 grid. Its 4 corner
    // vertices are (2,2) NW, (3,2) NE, (3,3) SE, (2,3) SW.
    const wg = makeGrid(5, [[2, 2]]);
    const nw = shorelineCornerPull(wg, 2, 2);
    const ne = shorelineCornerPull(wg, 3, 2);
    const se = shorelineCornerPull(wg, 3, 3);
    const sw = shorelineCornerPull(wg, 2, 3);
    // Each corner pulls toward the pond's own center, i.e. toward
    // whichever diagonal direction the pond tile sits relative to it.
    expect(nw).toEqual([SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);   // pond is SE of NW vertex
    expect(ne).toEqual([-SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);  // pond is SW of NE vertex
    expect(se).toEqual([-SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]); // pond is NW of SE vertex
    expect(sw).toEqual([SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);  // pond is NE of SW vertex
  });

  it('an isolated 1-tile land peninsula pulls all 4 of its corners inward symmetrically (mirror of the pond case)', () => {
    // Land at (2,2), water everywhere else in a 5x5 grid.
    const wg = new WorldGrid(5, 5);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (c !== 2 || r !== 2) wg.set(c, r, { waterDepth: 2.0 });
      }
    }
    const nw = shorelineCornerPull(wg, 2, 2);
    const ne = shorelineCornerPull(wg, 3, 2);
    const se = shorelineCornerPull(wg, 3, 3);
    const sw = shorelineCornerPull(wg, 2, 3);
    expect(nw).toEqual([SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);
    expect(ne).toEqual([-SHORELINE_CORNER_PULL_WU, SHORELINE_CORNER_PULL_WU]);
    expect(se).toEqual([-SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);
    expect(sw).toEqual([SHORELINE_CORNER_PULL_WU, -SHORELINE_CORNER_PULL_WU]);
  });
});

describe('shorelineBoundaryPoints', () => {
  it('endpoints equal exactly corner + pull (not the plain grid corner)', () => {
    // Vertex (2,2) is an outer_corner (see the 'pulls toward the lone
    // land tile' test above) -> pull = [-0.5, -0.5]. Vertex (3,2) is
    // all-land (full) -> pull = [0, 0].
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]);
    const T = 2, GHW = 2, GHH = 2; // vertex (gx,gz) world pos = (gx-GHW)*T
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, false);
    // Plain grid corner for (2,2) is ((2-2)*2, (2-2)*2) = (0, 0); pulled -> (-0.5, -0.5).
    expect(pts[0]![0]).toBeCloseTo(-0.5, 10);
    expect(pts[0]![1]).toBeCloseTo(-0.5, 10);
    // Plain grid corner for (3,2) is ((3-2)*2, (2-2)*2) = (2, 0); pull is zero.
    expect(pts[pts.length - 1]![0]).toBeCloseTo(2, 10);
    expect(pts[pts.length - 1]![1]).toBeCloseTo(0, 10);
  });

  it('degenerates to the exact plain straight line when both corners have zero pull and noise is off', () => {
    const wg = makeGrid(5, []); // all land, no shoreline anywhere
    const T = 2, GHW = 2, GHH = 2;
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 1, 1, 2, 1, false);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      expect(pts[i]![0]).toBeCloseTo((1 - GHW) * T + ((2 - GHW) * T - (1 - GHW) * T) * t, 10);
      expect(pts[i]![1]).toBeCloseTo((1 - GHH) * T, 10);
    }
  });

  it('includes the exact ShorelineWobble noise offsets, plus interpolated pull, when includeNoiseWobble is true', () => {
    const wg = makeGrid(5, [[2, 1], [2, 2], [1, 2]]); // vertex (2,2) is outer_corner
    const T = 2, GHW = 2, GHH = 2;
    const pts = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const plainWobble = shorelineEdgePoints((2 - GHW) * T, (2 - GHH) * T, (3 - GHW) * T, (2 - GHH) * T);
    const n = SHORELINE_WOBBLE_SUBDIVISIONS;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const pullX = -0.5 * (1 - t) + 0 * t; // pull0=[-0.5,-0.5], pull1=[0,0]
      const pullZ = -0.5 * (1 - t) + 0 * t;
      expect(pts[i]![0]).toBeCloseTo(plainWobble[i]![0] + pullX, 10);
      expect(pts[i]![1]).toBeCloseTo(plainWobble[i]![1] + pullZ, 10);
    }
  });

  it('is deterministic — the same call twice returns identical results', () => {
    const wg = makeGrid(5, [[2, 2]]);
    const T = 2, GHW = 2, GHH = 2;
    const a = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const b = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    expect(a).toEqual(b);
  });

  it('reversed-endpoint calls produce the same point set, order reversed (tile/chunk agreement invariant)', () => {
    const wg = makeGrid(5, [[2, 2]]);
    const T = 2, GHW = 2, GHH = 2;
    const forward = shorelineBoundaryPoints(wg, T, GHW, GHH, 2, 2, 3, 2, true);
    const backward = shorelineBoundaryPoints(wg, T, GHW, GHH, 3, 2, 2, 2, true);
    expect(backward.slice().reverse()).toEqual(forward);
  });
});
