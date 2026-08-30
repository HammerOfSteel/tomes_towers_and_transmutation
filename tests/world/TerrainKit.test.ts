import { describe, it, expect } from 'vitest';
import { classifyTileShape, orderCornersForDiagonal, triangleNormal, buildQuadFace, type RampShape, type Diagonal } from '@/world/TerrainKit';

describe('orderCornersForDiagonal', () => {
  it('orders sw,nw,ne,se unchanged for the sw-ne diagonal', () => {
    const corners = { sw: 'SW', nw: 'NW', ne: 'NE', se: 'SE' };
    expect(orderCornersForDiagonal(corners, 'sw-ne')).toEqual(['SW', 'NW', 'NE', 'SE']);
  });

  it('rotates to nw,ne,se,sw for the nw-se diagonal (keeps the diagonal as v0-v2)', () => {
    const corners = { sw: 'SW', nw: 'NW', ne: 'NE', se: 'SE' };
    expect(orderCornersForDiagonal(corners, 'nw-se')).toEqual(['NW', 'NE', 'SE', 'SW']);
  });
});

describe('triangleNormal', () => {
  it('returns straight up (0,1,0) for a flat horizontal triangle', () => {
    const n = triangleNormal([0, 0, 0], [0, 0, 1], [1, 0, 1]);
    expect(n[0]).toBeCloseTo(0);
    expect(n[1]).toBeCloseTo(1);
    expect(n[2]).toBeCloseTo(0);
  });

  it('returns a unit-length vector', () => {
    const n = triangleNormal([0, 0, 0], [1, 1, 0], [0, 1, 1]);
    const len = Math.hypot(n[0], n[1], n[2]);
    expect(len).toBeCloseTo(1);
  });

  it('tilts away from straight-up for a sloped triangle', () => {
    const n = triangleNormal([0, 0, 0], [0, -1, 1], [1, -1, 1]);
    expect(n[1]).toBeLessThan(1);
  });
});

describe('buildQuadFace', () => {
  it('emits exactly 6 vertices (2 triangles) with matching normal/position counts', () => {
    const corners = {
      sw: [0, 0, 0] as [number, number, number],
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { positions, normals } = buildQuadFace(corners, 'sw-ne');
    expect(positions).toHaveLength(18);
    expect(normals).toHaveLength(18);
  });

  it('gives both triangles the identical straight-up normal for a flat quad', () => {
    const corners = {
      sw: [0, 0, 0] as [number, number, number],
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { normals } = buildQuadFace(corners, 'sw-ne');
    // 6 verts x 3 floats; triangle 1 = verts 0-2, triangle 2 = verts 3-5.
    const tri1Normal = [normals[0], normals[1], normals[2]];
    const tri2Normal = [normals[9], normals[10], normals[11]];
    expect(tri1Normal[1]).toBeCloseTo(1);
    expect(tri2Normal[1]).toBeCloseTo(1);
  });

  it('gives the two triangles genuinely different normals for a single-corner-dipped quad', () => {
    const corners = {
      sw: [0, -1, 0] as [number, number, number], // dipped corner
      nw: [0, 0, 2] as [number, number, number],
      ne: [2, 0, 2] as [number, number, number],
      se: [2, 0, 0] as [number, number, number],
    };
    const { normals } = buildQuadFace(corners, 'sw-ne');
    const tri1Normal = [normals[0], normals[1], normals[2]];
    const tri2Normal = [normals[9], normals[10], normals[11]];
    // Not identical — the dip breaks planarity, so the two triangles tilt differently.
    expect(tri1Normal).not.toEqual(tri2Normal);
  });
});


// All 16 combinations of [sw, nw, ne, se], with the shape+diagonal every
// combination must classify to. Order: sw, nw, ne, se.
const CASES: Array<{ corners: [boolean, boolean, boolean, boolean]; shape: RampShape; diagonal: Diagonal }> = [
  { corners: [false, false, false, false], shape: 'flat',         diagonal: 'sw-ne' },
  { corners: [true,  false, false, false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, true,  false, false], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [false, false, true,  false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, false, false, true ], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [true,  true,  false, false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  false, true,  false], shape: 'saddle',        diagonal: 'sw-ne' },
  { corners: [true,  false, false, true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  true,  false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  false, true ], shape: 'saddle',        diagonal: 'nw-se' },
  { corners: [false, false, true,  true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  false], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [true,  true,  false, true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  false, true,  true ], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [false, true,  true,  true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  true ], shape: 'all-four-down', diagonal: 'sw-ne' },
];

describe('classifyTileShape', () => {
  it('classifies all 16 corner-low combinations to the correct shape and diagonal', () => {
    for (const { corners, shape, diagonal } of CASES) {
      const result = classifyTileShape(corners);
      expect(result.shape, `corners=${JSON.stringify(corners)}`).toBe(shape);
      expect(result.diagonal, `corners=${JSON.stringify(corners)}`).toBe(diagonal);
    }
  });

  it('is a pure function (same input always produces the same output)', () => {
    const a = classifyTileShape([true, false, true, false]);
    const b = classifyTileShape([true, false, true, false]);
    expect(a).toEqual(b);
  });
});
