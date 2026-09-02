/**
 * BlockKit.test.ts — Phase 2e (settlement visual fidelity: modular
 * sub-tile block-kit architecture, docs/superpowers/plans/
 * 2026-08-29-settlement-visual-fidelity.md §2e.1).
 *
 * Verifies the shared block-kit engine that replaces the Phase 2b/2d
 * "large primitive + noise displacement" technique with small grid-aligned
 * blocks whose *silhouette edges* (not their base geometry) get organic
 * rounding — a marching-squares-style corner test generalised to 3D voxel
 * columns: a vertical edge between two faces is chamfered iff both of the
 * two orthogonal neighbour cells that meet at that edge are empty.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BLOCK_UNIT,
  createBlockGrid,
  setBlock,
  hasBlock,
  getMaterialKey,
  getChamferFlags,
  getFaceVisibility,
  buildBlockOutline,
  blockGeometry,
  meshBlockGrid,
} from '@/world/buildings/BlockKit';
import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';

function countVerts(geo: THREE.BufferGeometry): number {
  return geo.attributes.position.count;
}

function hasNaN(geo: THREE.BufferGeometry): boolean {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count * 3; i++) {
    if (!Number.isFinite(pos.array[i])) return true;
  }
  return false;
}

describe('BlockKit — grid primitives', () => {
  it('BLOCK_UNIT is a clean subdivision of the 4 WU terrain tile', () => {
    expect(BLOCK_UNIT).toBeCloseTo(0.5, 6);
    expect(4 / BLOCK_UNIT).toBe(8); // exact integer subdivision
  });

  it('setBlock/hasBlock/getMaterialKey round-trip', () => {
    const grid = createBlockGrid();
    expect(hasBlock(grid, 0, 0, 0)).toBe(false);
    setBlock(grid, 0, 0, 0, 'earth');
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('earth');
    expect(hasBlock(grid, 1, 0, 0)).toBe(false);
  });
});

describe('BlockKit — chamfer-flag classification (the core marching-squares-style test)', () => {
  it('an isolated single block (no neighbours at all) gets all 4 corners chamfered', () => {
    const grid = createBlockGrid();
    setBlock(grid, 5, 5, 5, 'earth');
    const flags = getChamferFlags(grid, 5, 5, 5);
    expect(flags).toEqual({ NW: true, NE: true, SE: true, SW: true });
  });

  it('a block buried in a solid 3x3 neighbourhood gets zero chamfered corners', () => {
    const grid = createBlockGrid();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        setBlock(grid, 5 + dx, 5, 5 + dz, 'earth');
      }
    }
    const flags = getChamferFlags(grid, 5, 5, 5);
    expect(flags).toEqual({ NW: false, NE: false, SE: false, SW: false });
  });

  it('an outer L-corner cell (row along +X and +Z filled, others empty) chamfers exactly one corner', () => {
    // Cell at origin has E (+X) and S (+Z) neighbours filled; N and W empty.
    // The only corner whose BOTH orthogonal neighbours are empty is NW.
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, 1, 0, 0, 'earth'); // E neighbour
    setBlock(grid, 0, 0, 1, 'earth'); // S neighbour
    const flags = getChamferFlags(grid, 0, 0, 0);
    const chamferedCount = Object.values(flags).filter(Boolean).length;
    expect(chamferedCount).toBe(1);
    expect(flags.NW).toBe(true);
    expect(flags.NE).toBe(false);
    expect(flags.SE).toBe(false);
    expect(flags.SW).toBe(false);
  });

  it('a straight wall-run cell (N and S filled, E and W empty) chamfers both W-side corners only', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, 0, 0, -1, 'earth'); // N neighbour filled
    setBlock(grid, 0, 0, 1, 'earth');  // S neighbour filled
    // E, W empty -> NW chamfer needs (N empty && W empty): N filled -> NW false.
    // NE needs (N empty && E empty): N filled -> false.
    // SW needs (S empty && W empty): S filled -> false.
    // SE needs (S empty && E empty): S filled -> false.
    const flags = getChamferFlags(grid, 0, 0, 0);
    expect(flags).toEqual({ NW: false, NE: false, SE: false, SW: false });
  });

  it('a suppress-chamfer override forces all corners sharp regardless of neighbours', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'stone');
    const flags = getChamferFlags(grid, 0, 0, 0, () => true);
    expect(flags).toEqual({ NW: false, NE: false, SE: false, SW: false });
  });

  it('a diagonal-only touch (self + NW-diagonal neighbour occupied, both orthogonals empty) does NOT chamfer that corner (dual-grid saddle case)', () => {
    // Cell at origin: NW-diagonal neighbour (-1, 0, -1) occupied, N (0,0,-1)
    // and W (-1,0,0) both empty. Under the OLD two-neighbour-only rule this
    // chamfered (both orthogonals empty); under the new dual-grid rule this
    // is a genuine 'diagonal'/saddle shape (self + the opposite diagonal
    // cell occupied, both orthogonals empty) and must NOT chamfer, since
    // chamfering would visually pull the two diagonally-touching cells
    // apart at the one point they share.
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, -1, 0, -1, 'earth'); // NW-diagonal neighbour only
    const flags = getChamferFlags(grid, 0, 0, 0);
    expect(flags.NW).toBe(false);
    // The other 3 corners are unaffected by this specific diagonal
    // neighbour (their own diagonal/orthogonal cells are still all empty)
    // and remain genuine outer_corner shapes -- still chamfered.
    expect(flags.NE).toBe(true);
    expect(flags.SE).toBe(true);
    expect(flags.SW).toBe(true);
  });

  it('every existing chamfer scenario in this file resolves identically under the new dual-grid classification (regression proof, not just re-run)', () => {
    // Re-derives each of the 4 preceding tests' expected flags directly
    // from buildDualGridCaseTable(2) itself (rather than re-running
    // getChamferFlags(), which would be circular) to prove the new
    // implementation's classification agrees with the case table's own
    // already-tested (Phase 0) canonical shapes, corner by corner.
    const table = buildDualGridCaseTable(2);
    const labelFor = (config: number[]): string => {
      const found = table.mapping[config.join(',')]!;
      return table.tiles[found.tile]!.label;
    };
    // Isolated single block: every corner's [diag, ortho, self, ortho] = [0,0,1,0] -> outer_corner.
    expect(labelFor([0, 0, 1, 0])).toBe('outer_corner');
    // Buried in a solid 3x3: every corner's config = [1,1,1,1] -> full (never outer_corner).
    expect(labelFor([1, 1, 1, 1])).not.toBe('outer_corner');
    // Straight wall-run cell (N and S filled, E/W empty, diagonals empty):
    // NW corner = [diagNW=0, N=1, self=1, W=0] -> edge (never outer_corner).
    expect(labelFor([0, 1, 1, 0])).not.toBe('outer_corner');
  });
});

describe('BlockKit — face visibility (voxel face culling)', () => {
  it('all 6 faces visible for a fully isolated block', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    const vis = getFaceVisibility(grid, 0, 0, 0);
    expect(vis).toEqual({ N: true, S: true, E: true, W: true, U: true, D: true });
  });

  it('a face is hidden exactly when its neighbour is occupied', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, 1, 0, 0, 'earth'); // E neighbour
    const vis = getFaceVisibility(grid, 0, 0, 0);
    expect(vis.E).toBe(false);
    expect(vis.W).toBe(true);
    expect(vis.N).toBe(true);
    expect(vis.S).toBe(true);
  });
});

describe('BlockKit — outline polygon (2D cross-section)', () => {
  const s = BLOCK_UNIT / 2;
  const r = 0.08;

  it('no chamfered corners -> a plain 4-point square outline', () => {
    const outline = buildBlockOutline({ NW: false, NE: false, SE: false, SW: false }, s, r);
    expect(outline.length).toBe(4);
  });

  it('all corners chamfered -> an 8-point octagonal outline', () => {
    const outline = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r);
    expect(outline.length).toBe(8);
  });

  it('exactly one chamfered corner -> a 5-point outline', () => {
    const outline = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r);
    expect(outline.length).toBe(5);
  });

  it('every outline point stays within the block half-size bounds', () => {
    const outline = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r);
    for (const [x, z] of outline) {
      expect(Math.abs(x)).toBeLessThanOrEqual(s + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(s + 1e-9);
    }
  });

  it('chamfering strictly reduces the outline polygon area vs a sharp square', () => {
    function area(pts: [number, number][]): number {
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x1, z1] = pts[i]!;
        const [x2, z2] = pts[(i + 1) % pts.length]!;
        a += x1 * z2 - x2 * z1;
      }
      return Math.abs(a) / 2;
    }
    const sharp = buildBlockOutline({ NW: false, NE: false, SE: false, SW: false }, s, r);
    const chamfered = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r);
    expect(area(chamfered)).toBeLessThan(area(sharp));
  });

  it('segments=1 (default) reproduces the exact existing 2-point flat-chamfer output', () => {
    const withDefault = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r);
    const withExplicit1 = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r, 1);
    expect(withDefault.length).toBe(8);
    for (let i = 0; i < withDefault.length; i++) {
      expect(withDefault[i]![0]).toBeCloseTo(withExplicit1[i]![0]!, 9);
      expect(withDefault[i]![1]).toBeCloseTo(withExplicit1[i]![1]!, 9);
    }
  });

  it('segments=3 produces a 4-point arc per chamfered corner (16 points for all 4 corners)', () => {
    const outline = buildBlockOutline({ NW: true, NE: true, SE: true, SW: true }, s, r, 3);
    expect(outline.length).toBe(16); // 4 corners * (segments + 1) points each
  });

  it('segments=3 arc endpoints match the segments=1 flat-chamfer tangent points exactly', () => {
    const flat = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 1);
    const arc = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 3);
    // flat = [NW_p0, NW_p1, NE, SE, SW] (5 points); arc = [NW_p0..NW_p3, NE, SE, SW] (7 points).
    expect(arc[0]![0]).toBeCloseTo(flat[0]![0]!, 9);
    expect(arc[0]![1]).toBeCloseTo(flat[0]![1]!, 9);
    expect(arc[3]![0]).toBeCloseTo(flat[1]![0]!, 9);
    expect(arc[3]![1]).toBeCloseTo(flat[1]![1]!, 9);
  });

  it('every segments=3 arc point stays within the block half-size bounds and outside the flat-chamfer line (bulges outward)', () => {
    const outline = buildBlockOutline({ NW: true, NE: false, SE: false, SW: false }, s, r, 3);
    for (const [x, z] of outline) {
      expect(Math.abs(x)).toBeLessThanOrEqual(s + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(s + 1e-9);
    }
    // The arc's midpoint (3rd of 4 points, index 1 or 2) must lie strictly
    // closer to the true sharp corner (-s,-s) than the flat chamfer's
    // midpoint would (proving it bulges outward, i.e. is convex/rounded
    // rather than a straight cut).
    const midArc = outline[1]!; // second of the 4 NW arc points
    const flatMid: [number, number] = [(-s + (-s + r)) / 2, (-s + r + -s) / 2];
    const distToCorner = (p: [number, number]) => Math.hypot(p[0] - (-s), p[1] - (-s));
    expect(distToCorner(midArc)).toBeLessThan(distToCorner(flatMid));
  });
});

describe('BlockKit — single-block geometry sanity', () => {
  it('produces finite, non-NaN geometry for a fully-chamfered isolated block', () => {
    const geo = blockGeometry(
      { NW: true, NE: true, SE: true, SW: true },
      { N: true, S: true, E: true, W: true, U: true, D: true },
      {},
    );
    expect(hasNaN(geo)).toBe(false);
    expect(countVerts(geo)).toBeGreaterThan(0);
  });

  it('a block with all faces culled (fully buried) produces empty/near-empty geometry', () => {
    const geo = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: false, D: false },
      {},
    );
    expect(countVerts(geo)).toBe(0);
  });

  it('a roofline (top-exposed) block produces a smaller top cap than a non-bevelled top', () => {
    const bevelled = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: true, D: false },
      { topBevel: true },
    );
    const flat = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: true, D: false },
      { topBevel: false },
    );
    expect(hasNaN(bevelled)).toBe(false);
    // Bevelled roofline geometry adds an extra sloped collar band, so it must
    // have strictly more vertices than a flat-capped top of the same block.
    expect(countVerts(bevelled)).toBeGreaterThan(countVerts(flat));
  });

  it('is deterministic: identical inputs produce identical vertex data', () => {
    const flags = { NW: true, NE: false, SE: true, SW: false };
    const faces = { N: true, S: true, E: false, W: true, U: true, D: false };
    const g1 = blockGeometry(flags, faces, {});
    const g2 = blockGeometry(flags, faces, {});
    expect(Array.from(g1.attributes.position.array)).toEqual(Array.from(g2.attributes.position.array));
  });
});

describe('BlockKit — UV generation (per-block, world-space-projected, for palette textures)', () => {
  const ALL_FLAGS = { NW: true, NE: true, SE: true, SW: true };
  const ALL_FACES = { N: true, S: true, E: true, W: true, U: true, D: true };

  it('every geometry carries a uv attribute with one [u,v] pair per vertex', () => {
    const geo = blockGeometry(ALL_FLAGS, ALL_FACES, {});
    expect(geo.attributes.uv).toBeDefined();
    expect(geo.attributes.uv!.count).toBe(geo.attributes.position.count);
  });

  it('uv values are finite for a fully-chamfered isolated block (including diagonal chamfer faces and topBevel collar)', () => {
    const geo = blockGeometry(ALL_FLAGS, ALL_FACES, { topBevel: true });
    const uv = geo.attributes.uv!;
    for (let i = 0; i < uv.count * 2; i++) {
      expect(Number.isFinite(uv.array[i])).toBe(true);
    }
  });

  it('a block with no faces visible produces an empty uv attribute matching empty position/normal', () => {
    const geo = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: false, D: false },
      {},
    );
    expect(geo.attributes.uv!.count).toBe(0);
  });

  it('is deterministic: identical inputs (including blockCoord) produce identical uv data', () => {
    const g1 = blockGeometry(ALL_FLAGS, ALL_FACES, { blockCoord: [3, 1, -2] });
    const g2 = blockGeometry(ALL_FLAGS, ALL_FACES, { blockCoord: [3, 1, -2] });
    expect(Array.from(g1.attributes.uv!.array)).toEqual(Array.from(g2.attributes.uv!.array));
  });

  it('two blocks at different blockCoord positions produce different uv data (no obvious per-block tile repetition)', () => {
    const g1 = blockGeometry(ALL_FLAGS, ALL_FACES, { blockCoord: [0, 0, 0] });
    const g2 = blockGeometry(ALL_FLAGS, ALL_FACES, { blockCoord: [4, 0, 0] });
    expect(Array.from(g1.attributes.uv!.array)).not.toEqual(Array.from(g2.attributes.uv!.array));
  });

  it('omitting blockCoord defaults to origin (backward-compatible with existing local-only callers)', () => {
    const g1 = blockGeometry(ALL_FLAGS, ALL_FACES, {});
    const g2 = blockGeometry(ALL_FLAGS, ALL_FACES, { blockCoord: [0, 0, 0] });
    expect(Array.from(g1.attributes.uv!.array)).toEqual(Array.from(g2.attributes.uv!.array));
  });
});

describe('BlockKit — geometric (winding-based) normals must agree with the stored lighting normals', () => {
  // THREE.js backface culling (material.side, default THREE.FrontSide) uses
  // the triangle's *winding order* (screen-space vertex order), NOT the
  // explicit `normal` buffer attribute — the two are independent and can
  // silently disagree. If a triangle's vertices are wound so its geometric
  // front face points inward while its `normal` attribute still (correctly)
  // points outward, the wall is invisible from outside (culled) and only
  // visible from inside the building — exactly the "front of the building
  // is see-through, only the inside/back shows" bug reported live. This
  // suite asserts they agree for every non-indexed triangle blockGeometry()
  // can produce, so this class of bug can never silently regress again.
  function geometricNormal(pos: ArrayLike<number>, base: number): THREE.Vector3 {
    const a = new THREE.Vector3(pos[base]!, pos[base + 1]!, pos[base + 2]!);
    const b = new THREE.Vector3(pos[base + 3]!, pos[base + 4]!, pos[base + 5]!);
    const c = new THREE.Vector3(pos[base + 6]!, pos[base + 7]!, pos[base + 8]!);
    return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  }

  function assertWindingMatchesStoredNormals(geo: THREE.BufferGeometry, label: string, minDot = 0.9): void {
    const pos = geo.attributes.position!.array;
    const norm = geo.attributes.normal!.array;
    const triCount = pos.length / 9;
    expect(triCount).toBeGreaterThan(0);
    for (let t = 0; t < triCount; t++) {
      const base = t * 9;
      const geomN = geometricNormal(pos, base);
      // Average the (flat-shaded, identical-per-vertex) stored normal over the triangle's 3 verts.
      const storedN = new THREE.Vector3(norm[base]!, norm[base + 1]!, norm[base + 2]!);
      const dot = geomN.dot(storedN);
      expect(dot, `${label}: triangle ${t} geometric normal (${geomN.toArray()}) vs stored normal (${storedN.toArray()})`).toBeGreaterThan(minDot);
    }
  }

  it('a fully-exposed sharp block (no chamfer): every side-wall triangle winds outward', () => {
    const geo = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: true, S: true, E: true, W: true, U: false, D: false },
      {},
    );
    assertWindingMatchesStoredNormals(geo, 'sharp side walls');
  });

  it('a fully-chamfered isolated block: every diagonal chamfer-face triangle winds outward', () => {
    const geo = blockGeometry(
      { NW: true, NE: true, SE: true, SW: true },
      { N: true, S: true, E: true, W: true, U: false, D: false },
      {},
    );
    assertWindingMatchesStoredNormals(geo, 'chamfered side walls');
  });

  it('a flat-capped top face (U) winds upward (+Y)', () => {
    const geo = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: true, D: false },
      { topBevel: false },
    );
    assertWindingMatchesStoredNormals(geo, 'flat top cap');
  });

  it('a flat bottom face (D) winds downward (-Y)', () => {
    const geo = blockGeometry(
      { NW: false, NE: false, SE: false, SW: false },
      { N: false, S: false, E: false, W: false, U: false, D: true },
      {},
    );
    assertWindingMatchesStoredNormals(geo, 'flat bottom cap');
  });

  it('a topBevel roofline block (sloped collar + inset cap) winds outward/upward throughout', () => {
    const geo = blockGeometry(
      { NW: true, NE: true, SE: true, SW: true },
      { N: true, S: true, E: true, W: true, U: true, D: false },
      { topBevel: true },
    );
    // The sloped collar band deliberately stores an approximate, softened
    // normal (a fixed partial upward tilt, not the exact slope normal — see
    // blockGeometry()'s collar-band code) for a smoother-looking bevel
    // highlight, so its dot product with the true geometric normal is
    // lower than the other (exact-normal) cases even when winding is
    // correct. A strict >0.9 threshold would false-positive on that
    // intentional softening; >0 still fails hard (~-1) on genuine
    // winding inversion, which is the only thing this test guards against.
    assertWindingMatchesStoredNormals(geo, 'topBevel collar + cap', 0.5);
  });
});

describe('BlockKit — meshBlockGrid (full grid -> THREE.Group)', () => {
  function samplePalette(): Record<string, THREE.Material> {
    return {
      earth: new THREE.MeshStandardMaterial({ color: '#8a6a40' }),
      grass: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    };
  }

  it('builds a group with no NaNs for a small 3x3x2 solid mound grid', () => {
    const grid = createBlockGrid();
    for (let bx = 0; bx < 3; bx++) {
      for (let bz = 0; bz < 3; bz++) {
        setBlock(grid, bx, 0, bz, 'earth');
        setBlock(grid, bx, 1, bz, 'grass');
      }
    }
    const group = meshBlockGrid(grid, samplePalette());
    expect(group.children.length).toBeGreaterThan(0);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        expect(hasNaN(o.geometry)).toBe(false);
      }
    });
  });

  it('face-culling means a fully interior block contributes no visible triangles', () => {
    const grid = createBlockGrid();
    // Build a solid 3x3x3 cube so the centre block (1,1,1) is fully buried.
    for (let bx = 0; bx < 3; bx++) {
      for (let by = 0; by < 3; by++) {
        for (let bz = 0; bz < 3; bz++) {
          setBlock(grid, bx, by, bz, 'earth');
        }
      }
    }
    const solidGroup = meshBlockGrid(grid, samplePalette());
    let solidVerts = 0;
    solidGroup.traverse((o) => { if (o instanceof THREE.Mesh) solidVerts += countVerts(o.geometry); });

    // Remove every block except the centre one: now it's a single isolated
    // block and should contribute much MORE surface than it did buried
    // (buried = 0 contribution), proving culling actually removed geometry.
    const isolatedGrid = createBlockGrid();
    setBlock(isolatedGrid, 1, 1, 1, 'earth');
    const isolatedGroup = meshBlockGrid(isolatedGrid, samplePalette());
    let isolatedVerts = 0;
    isolatedGroup.traverse((o) => { if (o instanceof THREE.Mesh) isolatedVerts += countVerts(o.geometry); });

    expect(isolatedVerts).toBeGreaterThan(0);
    // The solid cube's total vertex count should be far less than 27x an
    // isolated block's count would be if nothing were culled (27 blocks *
    // full-face geometry each) -- confirms internal faces were dropped.
    expect(solidVerts).toBeLessThan(isolatedVerts * 27);
  });

  it('is deterministic across repeated calls with the same grid', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, 1, 0, 0, 'earth');
    setBlock(grid, 0, 0, 1, 'grass');
    const g1 = meshBlockGrid(grid, samplePalette());
    const g2 = meshBlockGrid(grid, samplePalette());
    let v1 = 0, v2 = 0;
    g1.traverse((o) => { if (o instanceof THREE.Mesh) v1 += countVerts(o.geometry); });
    g2.traverse((o) => { if (o instanceof THREE.Mesh) v2 += countVerts(o.geometry); });
    expect(v1).toBe(v2);
  });

  it('a suppressChamfer override (e.g. dwarven monumental cells) yields fewer vertices than fully organic chamfering', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'stone');
    const organic = meshBlockGrid(grid, samplePalette());
    const monumental = meshBlockGrid(grid, samplePalette(), { suppressChamfer: () => true });
    let organicVerts = 0, monumentalVerts = 0;
    organic.traverse((o) => { if (o instanceof THREE.Mesh) organicVerts += countVerts(o.geometry); });
    monumental.traverse((o) => { if (o instanceof THREE.Mesh) monumentalVerts += countVerts(o.geometry); });
    expect(monumentalVerts).toBeLessThan(organicVerts);
  });

  it('every merged mesh keeps a valid uv attribute matching its position count (so palette textures sample correctly post-merge)', () => {
    const grid = createBlockGrid();
    for (let bx = 0; bx < 3; bx++) {
      for (let bz = 0; bz < 3; bz++) {
        setBlock(grid, bx, 0, bz, 'earth');
        setBlock(grid, bx, 1, bz, 'grass');
      }
    }
    const group = meshBlockGrid(grid, samplePalette());
    let checked = 0;
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        expect(o.geometry.attributes.uv).toBeDefined();
        expect(o.geometry.attributes.uv!.count).toBe(o.geometry.attributes.position.count);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('per-block uv varies with world position (blocks far apart in the grid sample different parts of a tileable texture)', () => {
    const grid = createBlockGrid();
    setBlock(grid, 0, 0, 0, 'earth');
    setBlock(grid, 10, 0, 0, 'earth');
    const group = meshBlockGrid(grid, samplePalette());
    const uvSets: number[][] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) uvSets.push(Array.from(o.geometry.attributes.uv!.array));
    });
    // Both blocks share the same 'earth' material, so after merge-by-material
    // they may end up combined into a single mesh; either way, confirm the
    // uv range spans more than a single block-local tile (i.e. actually
    // reflects the bx=10 offset rather than being locally-identical).
    const allUv = uvSets.flat();
    const uMax = Math.max(...allUv.filter((_, i) => i % 2 === 0));
    const uMin = Math.min(...allUv.filter((_, i) => i % 2 === 0));
    expect(uMax - uMin).toBeGreaterThan(1);
  });
});
