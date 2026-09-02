// tests/world/WaterMeshBuilder.test.ts
//
//  Unit tests for buildWaterMeshGeometryData() — extracted from
//  OverworldScene._buildWaterMesh() so its shoreline-wobble boundary logic
//  is directly testable with a small hand-crafted WorldGrid, without
//  needing a full procedurally-generated OverworldScene (which the rest of
//  this file's sibling OverworldScene.*.test.ts suite requires via
//  buildWorldData() -- too heavy and imprecise for pinning down an exact
//  small water/land layout).

import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { buildWaterMeshGeometryData } from '@/world/WaterMeshBuilder';
import { shorelineEdgePoints } from '@/world/ShorelineWobble';

describe('buildWaterMeshGeometryData', () => {
  it('returns null-equivalent (empty) geometry when there is no water at all', () => {
    const wg = new WorldGrid(3, 3);
    const data = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);
    expect(data.positions).toHaveLength(0);
    expect(data.indices).toHaveLength(0);
  });

  it('an interior water tile (surrounded by other water) renders as a plain flat quad', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { waterDepth: 2.0, feature: 'lake' });
    const data = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);
    // Every tile is water with only water neighbors (map edges are
    // out-of-bounds -> default dry cells, so the OUTER ring does have land
    // "neighbors" at the edge -- only the CENTER tile (1,1) is genuinely
    // surrounded on all 4 sides by water). Isolate tile (1,1)'s own quad by
    // its distinct corner set: NW=(0,0), SW=(0,2), SE=(2,2), NE=(2,0).
    const tileNW = [0, 0], tileSW = [0, 2], tileSE = [2, 2], tileNE = [2, 0];
    const found = (x: number, z: number) => {
      for (let i = 0; i < data.positions.length; i += 3) {
        if (Math.abs(data.positions[i]! - x) < 1e-9 && Math.abs(data.positions[i + 2]! - z) < 1e-9) return true;
      }
      return false;
    };
    expect(found(tileNW[0]!, tileNW[1]!)).toBe(true);
    expect(found(tileSW[0]!, tileSW[1]!)).toBe(true);
    expect(found(tileSE[0]!, tileSE[1]!)).toBe(true);
    expect(found(tileNE[0]!, tileNE[1]!)).toBe(true);
  });

  it('a water tile bordering land wobbles its edge using the exact ShorelineWobble points', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0, feature: 'lake' }); // dry land all around it
    const data = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);

    // Tile (1,1) sits at world (wx=0, wz=0). Its south edge runs from
    // (0,2) to (2,2) — the exact same call the land tile on the other
    // side (tile (1,2)) computes for its own wall/top-surface boundary.
    const southPts = shorelineEdgePoints(0, 2, 2, 2);
    const interiorPt = southPts[1]!; // an interior (wobbled) lattice point
    expect(interiorPt[1]).not.toBe(2); // sanity: really is perturbed

    let found = false;
    for (let i = 0; i < data.positions.length; i += 3) {
      if (Math.abs(data.positions[i]! - interiorPt[0]) < 1e-9 && Math.abs(data.positions[i + 2]! - interiorPt[1]) < 1e-9) {
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('two independent builds of the same grid produce byte-identical geometry (determinism)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0, feature: 'lake' });
    const a = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);
    const b = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it('every index references a valid vertex (no degenerate/out-of-range triangle)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { waterDepth: 2.0, feature: 'lake' });
    const data = buildWaterMeshGeometryData(wg, 3, 3, 1, 1, 2, 0.55);
    const vertexCount = data.positions.length / 3;
    for (const i of data.indices) expect(i).toBeLessThan(vertexCount);
  });
});
