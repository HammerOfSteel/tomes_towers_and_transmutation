// tests/world/LatticeDeform.test.ts
import { describe, it, expect } from 'vitest';
import { bilinearDeform, deformModule, type LatticeQuad } from '@/world/LatticeDeform';
import { buildRelaxedMeshGrid } from '@/world/RelaxedMeshGrid';

const UNIT_SQUARE: LatticeQuad = {
  nw: { x: 0, z: 0 }, ne: { x: 1, z: 0 }, se: { x: 1, z: 1 }, sw: { x: 0, z: 1 },
};

// A deliberately irregular (but simple, convex, non-degenerate) quad.
const IRREGULAR: LatticeQuad = {
  nw: { x: -1, z: -0.8 }, ne: { x: 2.2, z: -1.1 }, se: { x: 1.9, z: 2.3 }, sw: { x: -0.7, z: 2.0 },
};

describe('bilinearDeform', () => {
  it('deforms the 4 exact AABB corners to the target quad\'s own 4 corners', () => {
    const checkCorner = (got: { x: number; z: number }, expected: { x: number; z: number }) => {
      expect(got.x).toBeCloseTo(expected.x, 10);
      expect(got.z).toBeCloseTo(expected.z, 10);
    };
    checkCorner(bilinearDeform(0, 0, IRREGULAR), IRREGULAR.nw);
    checkCorner(bilinearDeform(1, 0, IRREGULAR), IRREGULAR.ne);
    checkCorner(bilinearDeform(1, 1, IRREGULAR), IRREGULAR.se);
    checkCorner(bilinearDeform(0, 1, IRREGULAR), IRREGULAR.sw);
  });

  it('deforms the center (0.5, 0.5) to the average of the 4 target corners', () => {
    const center = bilinearDeform(0.5, 0.5, IRREGULAR);
    const expectedX = (IRREGULAR.nw.x + IRREGULAR.ne.x + IRREGULAR.se.x + IRREGULAR.sw.x) / 4;
    const expectedZ = (IRREGULAR.nw.z + IRREGULAR.ne.z + IRREGULAR.se.z + IRREGULAR.sw.z) / 4;
    expect(center.x).toBeCloseTo(expectedX, 10);
    expect(center.z).toBeCloseTo(expectedZ, 10);
  });

  it('reproduces the input (fx, fz) exactly when the target quad is the unit square (identity case)', () => {
    for (const [fx, fz] of [[0, 0], [1, 0], [0.25, 0.75], [0.6, 0.1], [1, 1]] as const) {
      const p = bilinearDeform(fx, fz, UNIT_SQUARE);
      expect(p.x).toBeCloseTo(fx, 10);
      expect(p.z).toBeCloseTo(fz, 10);
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = bilinearDeform(0.3, 0.7, IRREGULAR);
    const b = bilinearDeform(0.3, 0.7, IRREGULAR);
    expect(a).toEqual(b);
  });

  it('never produces a NaN or infinite coordinate for a non-degenerate quad', () => {
    for (const [fx, fz] of [[0, 0], [0.5, 0.5], [1, 1], [0.1, 0.9], [-0.2, 1.3]] as const) {
      const p = bilinearDeform(fx, fz, IRREGULAR);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
});

describe('deformModule', () => {
  it('deforms every vertex of a module in one call, matching individual bilinearDeform results', () => {
    const vertices = [{ fx: 0, fz: 0 }, { fx: 1, fz: 0 }, { fx: 0.5, fz: 0.5 }, { fx: 1, fz: 1 }];
    const result = deformModule(vertices, IRREGULAR);
    expect(result).toHaveLength(4);
    for (let i = 0; i < vertices.length; i++) {
      expect(result[i]).toEqual(bilinearDeform(vertices[i]!.fx, vertices[i]!.fz, IRREGULAR));
    }
  });

  it('never produces NaN when deforming into a real quad sourced from RelaxedMeshGrid output (Phase 3 reuse)', () => {
    const { points, quads } = buildRelaxedMeshGrid(4, 4, 7);
    const firstQuad = quads[0]!;
    const quad: LatticeQuad = {
      nw: points[firstQuad[0]!]!, ne: points[firstQuad[1]!]!,
      se: points[firstQuad[2]!]!, sw: points[firstQuad[3]!]!,
    };
    const vertices = [{ fx: 0, fz: 0 }, { fx: 1, fz: 0 }, { fx: 1, fz: 1 }, { fx: 0, fz: 1 }, { fx: 0.5, fz: 0.5 }];
    const result = deformModule(vertices, quad);
    for (const p of result) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
});
