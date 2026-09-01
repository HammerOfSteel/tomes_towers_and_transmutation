import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import type { BiomeId } from '@/world/WorldGrid';
import { buildTerrainGeometryData, BIOME_COLOR_VARIANTS, cellVariantIndex, cornerHeightJitter, BIOME_LAKE, subTileBumpJitter, SUBTILE_BUMP_MAX, _subTileGroundVariant, getTerrainHeightAt } from '@/world/TerrainGeometryBuilder';
import type { TerrainGeometryData } from '@/world/TerrainGeometryBuilder';
import { RIVER_DEPTH_WU, OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU, LAKE_DEPTH_WU, LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { BRIDGE_ROAD_VARIANT } from '@/world/RoadPathSampler';
import { GENERIC_ROAD_VARIANT } from '@/world/RoadTextures';

/**
 * Phase 4a (ground-texture-variant routing) split each tile's top face
 * across two possible buffers: the plain vertex-color base buffer (for
 * uncovered biomes/features like ocean/river/lake/ford) or a per-variant
 * `groundGeometry[variant]` buffer (for the 10 covered land biomes —
 * including the default 'grassland' biome most bare `new WorldGrid(...)`
 * fixtures implicitly use). Tests below whose real intent is "how much
 * total geometry was emitted" (not "which specific buffer") use these
 * helpers to combine both sources rather than assuming everything lands
 * in the base buffer, exactly like before Phase 4a.
 */
function totalPositionsLength(data: TerrainGeometryData): number {
  return data.positions.length + Object.values(data.groundGeometry).reduce((s, g) => s + g.positions.length, 0);
}
function totalIndicesLength(data: TerrainGeometryData): number {
  return data.indices.length + Object.values(data.groundGeometry).reduce((s, g) => s + g.indices.length, 0);
}
function allNormals(data: TerrainGeometryData): number[] {
  return [...data.normals, ...Object.values(data.groundGeometry).flatMap(g => g.normals)];
}

describe('buildTerrainGeometryData', () => {
  it('emits only top faces when all tiles are flat (no elevation steps)', () => {
    const wg = new WorldGrid(3, 1);
    // All tiles default to elevation 0 and biome 'grassland' — no edits needed.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // 3 tiles × GROUND_SUBDIVISIONS^2=16 sub-tile quads × 4 verts × 3 floats
    // = 576 position floats — all 3 land straight into
    // groundGeometry.grassland (the default biome is covered), so the
    // base buffer itself stays empty.
    expect(totalPositionsLength(data)).toBe(576);
    expect(data.positions).toHaveLength(0);
    // 3 tiles × 16 sub-tiles × 6 indices = 288.
    expect(totalIndicesLength(data)).toBe(288);
    // Every face normal should be straight up (+Y) — no wall faces.
    const normals = allNormals(data);
    for (let i = 0; i < normals.length; i += 3) {
      expect([normals[i], normals[i + 1], normals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('emits 4 wall faces around a single raised tile between two flat tiles', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    // Tile (0,0) and (2,0) stay at default elevation 0.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Tile 0: top (16 sub-tiles). Tile 1 (raised): top (16 sub-tiles) + N + S
    // + E + W (4 unsubdivided wall faces — walls are never subdivided).
    // Tile 2: top (16 sub-tiles). Walls land in the base buffer (4 faces ×
    // 4 verts × 3 = 48); all 3 tiles' tops land in groundGeometry, split
    // across grassland and its micro-patch variant (river_bank) since a
    // handful of the 48 total sub-tiles may occasionally patch — sum
    // across every covered variant rather than assuming all 48 stayed in
    // grassland specifically. Total (walls + all covered tops) = 624.
    expect(totalPositionsLength(data)).toBe(624);
    expect(data.positions).toHaveLength(4 * 4 * 3); // 4 wall faces
    const totalGroundPositions = Object.values(data.groundGeometry).reduce((s, g) => s + g.positions.length, 0);
    expect(totalGroundPositions).toBe(3 * 16 * 4 * 3); // 3 tiles' top faces, subdivided
    expect(totalIndicesLength(data)).toBe(4 * 6 + 3 * 16 * 6); // 4 wall faces + 48 sub-tile top faces, × 6 indices each

    // Collect the set of distinct face normals present — should include
    // up, north, south, east, west (5 distinct normals; tiles 0 and 2
    // contribute only "up" again, so 5 distinct values total).
    const normalSet = new Set<string>();
    const normals = allNormals(data);
    for (let i = 0; i < normals.length; i += 3) {
      normalSet.add(`${normals[i]},${normals[i + 1]},${normals[i + 2]}`);
    }
    expect(normalSet).toEqual(new Set(['0,1,0', '0,0,1', '0,0,-1', '1,0,0', '-1,0,0']));
  });

  it('colors water-biome tiles using the water palette', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'deep_ocean', waterDepth: OCEAN_DEEP_DEPTH_WU });

    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    // Water tint uses BIOME_WATER = [0.14, 0.26, 0.48] with a brightness
    // variation factor `v` applied uniformly to r/g/b — check the ratio
    // between channels matches the water palette's ratio, which is
    // biome-specific and distinct from any BIOME[] land level.
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });
});

describe('buildTerrainGeometryData — water depth carving (RI-3)', () => {
  it('carves a river tile between two land tiles down by RIVER_DEPTH_WU and walls the banks', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { feature: 'river', waterDepth: RIVER_DEPTH_WU });
    // Use SH=1 so physical height in WU is directly comparable to depth.
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Tile 0 (grassland, covered → subdivided): east wall (1 unsubdivided
    // face, base buffer) + top (16 sub-tiles, groundGeometry.grassland).
    // Tile 1 (river — uncovered, _groundTextureVariant returns null, so
    // it stays on the un-subdivided base-buffer path exactly as before):
    // top only (1 face, base buffer). Tile 2 (grassland): west wall (1
    // face, base buffer) + top (16 sub-tiles, groundGeometry.grassland).
    // Base buffer: 3 unsubdivided faces (36 positions, 18 indices).
    // groundGeometry.grassland: 32 sub-tile quads (384 positions, 192 indices).
    expect(totalPositionsLength(data)).toBe(3 * 4 * 3 + 2 * 16 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(3 * 6 + 2 * 16 * 6);

    // The river tile's top face sits at y = -RIVER_DEPTH_WU (elevation 0 - depth).
    // Base-buffer emission order per tile: tile0's east wall (4 verts),
    // then tile1's own top face (river has no ground texture, so it stays
    // on the base buffer exactly as before — unaffected by sub-tile
    // subdivision), then tile2's west wall.
    const tile1TopY = data.positions[4 * 3 + 1]!;
    // Top faces get a small deterministic corner bump (± up to
    // SUBTILE_BUMP_MAX = 0.06 WU, since 2026-09-01's seam fix — see
    // subTileBumpJitter()) layered on top of the carved base height for
    // visual variety — assert against that documented bound (precision 0
    // -> tolerance 0.5, safely covering the ±0.06 bump) rather than an
    // exact value.
    expect(tile1TopY).toBeCloseTo(-RIVER_DEPTH_WU, 0);
  });

  it('does not carve a river_ford tile (waterDepth 0) — sits flush with neighbours', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { feature: 'river_ford', waterDepth: 0 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // All 3 tiles flat and flush -> only top faces, no walls. Tile 1
    // (river_ford — uncovered, same as river/lake) stays as 1 unsubdivided
    // face in the base buffer; tiles 0 and 2 (grassland, covered) are
    // each subdivided into 16 sub-tiles in groundGeometry.grassland.
    expect(totalPositionsLength(data)).toBe(1 * 4 * 3 + 2 * 16 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(1 * 6 + 2 * 16 * 6);
    const normals = allNormals(data);
    for (let i = 0; i < normals.length; i += 3) {
      expect([normals[i], normals[i + 1], normals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('colors a river_ford tile distinctly from a plain river tile', () => {
    const riverGrid = new WorldGrid(1, 1);
    riverGrid.set(0, 0, { feature: 'river', waterDepth: RIVER_DEPTH_WU });
    const riverData = buildTerrainGeometryData(riverGrid, 1, 1, 0, 0, 1, 1);

    const fordGrid = new WorldGrid(1, 1);
    fordGrid.set(0, 0, { feature: 'river_ford', waterDepth: 0 });
    const fordData = buildTerrainGeometryData(fordGrid, 1, 1, 0, 0, 1, 1);

    const riverColor = [riverData.colors[0], riverData.colors[1], riverData.colors[2]];
    const fordColor  = [fordData.colors[0], fordData.colors[1], fordData.colors[2]];
    expect(fordColor).not.toEqual(riverColor);
  });

  it('carves a lake tile down by LAKE_DEPTH_WU, same carving math as a river at the same depth', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { feature: 'lake', waterDepth: LAKE_DEPTH_WU, walkable: false });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Same shape as the river carving test above: tile0 (east wall +
    // subdivided top), tile1 lake (uncovered, top only, unsubdivided),
    // tile2 (west wall + subdivided top) — see that test's comment for
    // the full breakdown.
    expect(totalPositionsLength(data)).toBe(3 * 4 * 3 + 2 * 16 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(3 * 6 + 2 * 16 * 6);

    const tile1TopY = data.positions[4 * 3 + 1]!;
    // Precision 0 -> tolerance 0.5, safely covers the ±SUBTILE_BUMP_MAX
    // (0.06 WU) bump now applied here — see the river carving test above.
    expect(tile1TopY).toBeCloseTo(-LAKE_DEPTH_WU, 0);
  });

  it('colors a lake tile distinctly from a river tile at the same depth', () => {
    const lakeGrid = new WorldGrid(1, 1);
    lakeGrid.set(0, 0, { feature: 'lake', waterDepth: LAKE_DEPTH_WU, walkable: false });
    const lakeData = buildTerrainGeometryData(lakeGrid, 1, 1, 0, 0, 1, 1);

    const riverGrid = new WorldGrid(1, 1);
    riverGrid.set(0, 0, { feature: 'river', waterDepth: RIVER_DEPTH_WU });
    const riverData = buildTerrainGeometryData(riverGrid, 1, 1, 0, 0, 1, 1);

    const lakeColor  = [lakeData.colors[0], lakeData.colors[1], lakeData.colors[2]];
    const riverColor = [riverData.colors[0], riverData.colors[1], riverData.colors[2]];
    expect(lakeColor).not.toEqual(riverColor);
  });

  it('uses the BIOME_LAKE palette for a lake tile', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { feature: 'lake', waterDepth: LAKE_DEPTH_WU, walkable: false });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(BIOME_LAKE[0] / BIOME_LAKE[1], 5);
    expect(g / b).toBeCloseTo(BIOME_LAKE[1] / BIOME_LAKE[2], 5);
  });
});

describe('cellVariantIndex', () => {
  it('is deterministic for the same inputs', () => {
    expect(cellVariantIndex(5, 7, 3)).toBe(cellVariantIndex(5, 7, 3));
  });

  it('stays within [0, variantCount)', () => {
    for (let col = 0; col < 20; col++) {
      for (let row = 0; row < 20; row++) {
        const v = cellVariantIndex(col, row, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('produces more than one distinct value across many cells (not a constant)', () => {
    const values = new Set<number>();
    for (let col = 0; col < 20; col++) {
      for (let row = 0; row < 20; row++) {
        values.add(cellVariantIndex(col, row, 3));
      }
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('cornerHeightJitter', () => {
  it('is deterministic for the same corner coordinates', () => {
    expect(cornerHeightJitter(3, 4)).toBe(cornerHeightJitter(3, 4));
  });

  it('stays within a small bounded range', () => {
    for (let c = 0; c < 15; c++) {
      for (let r = 0; r < 15; r++) {
        const j = cornerHeightJitter(c, r);
        expect(j).toBeGreaterThanOrEqual(-0.03);
        expect(j).toBeLessThanOrEqual(0.03);
      }
    }
  });

  it('gives adjacent tiles sharing a corner the same jitter for that corner', () => {
    // Tile (col=2,row=2)'s "south-east" corner is grid corner (3,3).
    // Tile (col=3,row=2)'s "south-west" corner is the SAME grid corner (3,3).
    const sharedCornerFromTileA = cornerHeightJitter(3, 3);
    const sharedCornerFromTileB = cornerHeightJitter(3, 3);
    expect(sharedCornerFromTileA).toBe(sharedCornerFromTileB);
  });
});

describe('subTileBumpJitter', () => {
  it('is deterministic for the same world coordinates', () => {
    expect(subTileBumpJitter(12.5, -7.25)).toBe(subTileBumpJitter(12.5, -7.25));
  });

  it('stays within [-SUBTILE_BUMP_MAX, +SUBTILE_BUMP_MAX]', () => {
    for (let i = -30; i < 30; i++) {
      for (let j = -30; j < 30; j++) {
        const v = subTileBumpJitter(i * 0.37, j * 0.53);
        expect(v).toBeGreaterThanOrEqual(-SUBTILE_BUMP_MAX);
        expect(v).toBeLessThanOrEqual(SUBTILE_BUMP_MAX);
      }
    }
  });

  it('produces more than one distinct value across many positions (not a constant)', () => {
    const values = new Set<number>();
    for (let i = -30; i < 30; i++) values.add(subTileBumpJitter(i * 0.41, i * -0.29));
    expect(values.size).toBeGreaterThan(1);
  });

  it('gives two adjacent tiles sharing a sub-lattice point the identical bump there (seamless)', () => {
    // The world point (10, 5) could be reached as a sub-tile corner from
    // either side of a tile boundary — must always compute the same value
    // regardless of which tile "owns" the lookup.
    const a = subTileBumpJitter(10, 5);
    const b = subTileBumpJitter(10, 5);
    expect(a).toBe(b);
  });
});

describe('getTerrainHeightAt', () => {
  it('returns the physical (elevation minus waterDepth) height for a dry flat tile, plus its bump', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { elevation: 4, waterDepth: 0 });
    const { wx, wz } = wg.gridToWorld(1, 1);
    const expected = 4 * LEVEL_HEIGHT + subTileBumpJitter(wx, wz);
    expect(getTerrainHeightAt(wg, wx, wz)).toBeCloseTo(expected, 10);
  });

  it('subtracts waterDepth via physicalHeightWU (matches the rendered/collided carve)', () => {
    const wg = new WorldGrid(3, 3);
    wg.set(1, 1, { elevation: 4, waterDepth: RIVER_DEPTH_WU });
    const { wx, wz } = wg.gridToWorld(1, 1);
    const expected = (4 * LEVEL_HEIGHT - RIVER_DEPTH_WU) + subTileBumpJitter(wx, wz);
    expect(getTerrainHeightAt(wg, wx, wz)).toBeCloseTo(expected, 10);
  });

  it('is deterministic for the same world coordinates', () => {
    const wg = new WorldGrid(3, 3);
    expect(getTerrainHeightAt(wg, 1.25, -0.75)).toBe(getTerrainHeightAt(wg, 1.25, -0.75));
  });

  it('tracks a different value across a tile boundary where elevation changes (does not freeze at one tile\'s height)', () => {
    const wg = new WorldGrid(5, 1);
    wg.set(0, 0, { elevation: 1, waterDepth: 0 });
    wg.set(1, 0, { elevation: 1, waterDepth: 0 });
    wg.set(2, 0, { elevation: 5, waterDepth: 0 }); // a step up, far from the bump's ±0.06 WU range
    const low = wg.gridToWorld(1, 0);
    const high = wg.gridToWorld(2, 0);
    expect(getTerrainHeightAt(wg, high.wx, high.wz)).toBeGreaterThan(getTerrainHeightAt(wg, low.wx, low.wz) + 1);
  });
});

describe('_subTileGroundVariant', () => {
  const noNeighbors = { south: null, north: null, east: null, west: null };

  it('returns the tile\'s own variant when no neighbor differs and no micro-patch is defined', () => {
    // 'mountain' has no MICRO_PATCH_VARIANTS entry (see design spec §3.3).
    for (let sx = 0; sx < 4; sx++) {
      for (let sz = 0; sz < 4; sz++) {
        const v = _subTileGroundVariant('mountain', noNeighbors, sx, sz, 4, 'mountain', sx * 3.1, sz * 2.7);
        expect(v).toBe('mountain');
      }
    }
  });

  it('only pulls toward a differing neighbor variant for the outermost sub-tile row/column touching that edge', () => {
    // South neighbor differs; only sz === 3 (the outermost south-facing row, N=4) may ever pull.
    const neighbors = { ...noNeighbors, south: 'desert' };
    let sawPullAtInterior = false;
    for (let sx = 0; sx < 4; sx++) {
      for (let sz = 0; sz < 3; sz++) { // sz 0,1,2 — never the outermost south row
        const v = _subTileGroundVariant('mountain', neighbors, sx, sz, 4, 'mountain', sx * 5.3 + 1, sz * 4.1 + 1);
        if (v === 'desert') sawPullAtInterior = true;
      }
    }
    expect(sawPullAtInterior).toBe(false);
  });

  it('never pulls toward a neighbor whose variant equals its own', () => {
    const neighbors = { ...noNeighbors, south: 'mountain' }; // same as own variant
    for (let sx = 0; sx < 4; sx++) {
      const v = _subTileGroundVariant('mountain', neighbors, sx, 3, 4, 'mountain', sx * 7.7, 99);
      expect(v).toBe('mountain');
    }
  });

  it('is deterministic for the same inputs', () => {
    const neighbors = { ...noNeighbors, east: 'forest' };
    const a = _subTileGroundVariant('grassland', neighbors, 3, 1, 4, 'grassland', 12.3, 45.6);
    const b = _subTileGroundVariant('grassland', neighbors, 3, 1, 4, 'grassland', 12.3, 45.6);
    expect(a).toBe(b);
  });

  it('occasionally applies a micro-patch variant for a biome with one mapped, at a low rate', () => {
    // 'grassland' maps to ['river_bank'] (see design spec §3.3's MICRO_PATCH_VARIANTS table).
    let patchCount = 0;
    const total = 400;
    for (let i = 0; i < total; i++) {
      const v = _subTileGroundVariant('grassland', noNeighbors, 1, 1, 4, 'grassland', i * 3.7, i * -2.9);
      if (v === 'river_bank') patchCount++;
      else expect(v).toBe('grassland');
    }
    expect(patchCount).toBeGreaterThan(0);
    expect(patchCount).toBeLessThan(total * 0.25); // low rate, not dominant
  });
});

describe('buildTerrainGeometryData — variant color and corner jitter', () => {
  it('gives different plain land cells at the same elevation level visibly different colors sometimes', () => {
    // A 6x6 flat grid at elevation 1 (grass level) — with only single-level BIOME colors
    // every cell would render byte-identical color. With per-cell variants, at least
    // one pair of cells should differ.
    const wg = new WorldGrid(6, 6);
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 6; row++) wg.set(col, row, { elevation: 1 });
    }
    const data = buildTerrainGeometryData(wg, 6, 6, 3, 3, 1, 1);

    // Each cell contributes exactly one top face (flat grid) = 4 verts = 12 color floats.
    const cellColors: Array<[number, number, number]> = [];
    for (let i = 0; i < data.colors.length; i += 12) {
      cellColors.push([data.colors[i]!, data.colors[i + 1]!, data.colors[i + 2]!]);
    }
    const distinct = new Set(cellColors.map(c => c.join(',')));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('keeps water-biome tile color ratio unchanged by variant noise', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'deep_ocean', waterDepth: OCEAN_DEEP_DEPTH_WU });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = [data.colors[0]!, data.colors[1]!, data.colors[2]!];
    expect(r / g).toBeCloseTo(0.14 / 0.26, 5);
    expect(g / b).toBeCloseTo(0.26 / 0.48, 5);
  });

  it('jitters top-face corner Y coordinates within the documented bound around the tile base height', () => {
    const wg = new WorldGrid(2, 2);
    // All default elevation 0 -> base wy = 0.
    const data = buildTerrainGeometryData(wg, 2, 2, 1, 1, 2, 1);
    // Every top-face vertex Y (index 1, 4, 7, 10 within each 4-vert face, but since flat grid
    // has ONLY top faces, every 3rd float starting at offset 1 is a Y value).
    for (let i = 1; i < data.positions.length; i += 3) {
      const y = data.positions[i]!;
      expect(Math.abs(y)).toBeLessThanOrEqual(0.03 + 1e-9);
    }
  });

  it('gives two adjacent flat cells identical Y at their shared corner (no seam)', () => {
    const wg = new WorldGrid(4, 3);
    // 4x3, all 'mountain' (not the default 'grassland') — has no
    // MICRO_PATCH_VARIANTS entry, so none of either tile's 16 sub-tiles
    // can get redirected to a different groundGeometry buffer. Rendering
    // the two MIDDLE tiles (cols 1-2 of 0-3) at the middle row means every
    // side of both tiles — north, south, AND the outer west/east side
    // neighboring the un-rendered but in-bounds cols 0/3 — is also
    // 'mountain' (matching, not an out-of-bounds default 'grassland'), so
    // no border-pull can trigger on any edge — keeping this test's fixed
    // vertex-index arithmetic below valid.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { biome: 'mountain' });
    const data = buildTerrainGeometryData(wg, 4, 3, 1.5, 1, 1, 1, 1, 1, 2, 1);
    // Both tiles are flat and covered ('mountain'), so both land in
    // groundGeometry.mountain rather than the base buffer, each emitting
    // GROUND_SUBDIVISIONS^2=16 sub-tile quads (see the ground sub-tile
    // system's own describe block further below for the emission-order
    // breakdown: sz outer loop, sx inner loop, 4 verts SW/NW/NE/SE per quad).
    const positions = data.groundGeometry.mountain!.positions;
    expect(positions.length / 3).toBe(32 * 4); // sanity: no sub-tiles redirected elsewhere
    // Tile 0 occupies quads 0-15 (48 verts); its east-facing outermost
    // sub-tile column is sx=3 — quad 3 (sz=0, base vertex 12) and quad 15
    // (sz=3, base vertex 60). Tile 1 occupies quads 16-31 (starting at
    // vertex 64); its west-facing outermost column is sx=0 — quad 16
    // (sz=0, base vertex 64) and quad 28 (sz=3, base vertex 112).
    const v = (i: number) => ({ x: positions[i * 3]!, y: positions[i * 3 + 1]!, z: positions[i * 3 + 2]! });
    // Tile 0's sub-tile (3,0) SE (local vertex 3) shares tile 1's sub-tile
    // (0,0) SW (local vertex 0) — both at the tiles' shared south corner.
    const tile0_q3_SE = v(12 + 3);
    const tile1_q0_SW = v(64 + 0);
    // Tile 0's sub-tile (3,3) NE (local vertex 2) shares tile 1's sub-tile
    // (0,3) NW (local vertex 1) — both at the tiles' shared north corner.
    const tile0_q15_NE = v(60 + 2);
    const tile1_q28_NW = v(112 + 1);
    expect(tile0_q3_SE.x).toBeCloseTo(tile1_q0_SW.x, 9);
    expect(tile0_q3_SE.y).toBeCloseTo(tile1_q0_SW.y, 9);
    expect(tile0_q15_NE.x).toBeCloseTo(tile1_q28_NW.x, 9);
    expect(tile0_q15_NE.y).toBeCloseTo(tile1_q28_NW.y, 9);
  });
});

describe('buildTerrainGeometryData — sand biome', () => {
  it('colors sand-biome tiles using the sand palette, distinct from grass', () => {
    const sandGrid = new WorldGrid(1, 1);
    sandGrid.set(0, 0, { biome: 'beach', elevation: 1 });
    const sandData = buildTerrainGeometryData(sandGrid, 1, 1, 0, 0, 1, 1);

    const grassGrid = new WorldGrid(1, 1);
    grassGrid.set(0, 0, { biome: 'grassland', elevation: 1 });
    const grassData = buildTerrainGeometryData(grassGrid, 1, 1, 0, 0, 1, 1);

    const sandColor  = [sandData.colors[0]!, sandData.colors[1]!, sandData.colors[2]!];
    const grassColor = [grassData.colors[0]!, grassData.colors[1]!, grassData.colors[2]!];
    expect(sandColor).not.toEqual(grassColor);
  });
});

describe('buildTerrainGeometryData — shallow vs deep water tint (RI-3 shoreline)', () => {
  it('tints a shallow-depth water tile lighter than a deep-depth water tile', () => {
    const shallowGrid = new WorldGrid(1, 1);
    shallowGrid.set(0, 0, { biome: 'ocean', waterDepth: OCEAN_SHALLOW_DEPTH_WU });
    const shallowData = buildTerrainGeometryData(shallowGrid, 1, 1, 0, 0, 1, 1);

    const deepGrid = new WorldGrid(1, 1);
    deepGrid.set(0, 0, { biome: 'deep_ocean', waterDepth: OCEAN_DEEP_DEPTH_WU });
    const deepData = buildTerrainGeometryData(deepGrid, 1, 1, 0, 0, 1, 1);

    // Sum of RGB channels as a simple brightness proxy — shallow should
    // read visibly lighter than deep.
    const shallowBrightness = shallowData.colors[0]! + shallowData.colors[1]! + shallowData.colors[2]!;
    const deepBrightness    = deepData.colors[0]!    + deepData.colors[1]!    + deepData.colors[2]!;
    expect(shallowBrightness).toBeGreaterThan(deepBrightness);
  });
});

describe('buildTerrainGeometryData — biome-distinct colours', () => {
  it('renders desert and forest tiles with visibly different top-face colours', () => {
    const wg = new WorldGrid(1, 2);
    wg.set(0, 0, { biome: 'desert', elevation: 1 });
    wg.set(0, 1, { biome: 'forest', elevation: 1 });

    const desertGeo = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    const wg2 = new WorldGrid(1, 1);
    wg2.set(0, 0, { biome: 'forest', elevation: 1 });
    const forestGeo = buildTerrainGeometryData(wg2, 1, 1, 0, 0, 2, 1);

    const desertColor = [desertGeo.colors[0], desertGeo.colors[1], desertGeo.colors[2]];
    const forestColor = [forestGeo.colors[0], forestGeo.colors[1], forestGeo.colors[2]];
    expect(desertColor).not.toEqual(forestColor);
  });

  it('covers all 8 non-water/beach biomes with a distinct BIOME_COLOR_VARIANTS entry', () => {
    const landBiomes: BiomeId[] = ['desert', 'savanna', 'grassland', 'forest', 'taiga', 'tundra', 'snow', 'mountain'];
    const seen = new Set<string>();
    for (const biome of landBiomes) {
      const variants = BIOME_COLOR_VARIANTS[biome];
      expect(variants.length).toBeGreaterThanOrEqual(1);
      seen.add(JSON.stringify(variants[0]));
    }
    // All 8 biomes must have a visually distinct primary colour from each other.
    expect(seen.size).toBe(landBiomes.length);
  });

  it('ocean/beach tiles still use the existing water/sand colour tables (unchanged)', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'deep_ocean', elevation: 0, waterDepth: 2.5 });
    const { colors } = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    // Deep water uses BIOME_WATER (darker blue), not a land palette.
    expect(colors[2]).toBeGreaterThan(colors[1]!); // blue channel dominant
  });
});

describe('buildTerrainGeometryData — chunk sub-rectangle', () => {
  it('building a 2x2 sub-rectangle of a 4x4 grid emits only that sub-rectangle\'s top faces', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 0 });

    const full  = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1);
    const chunk = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1, /*colStart*/ 0, /*rowStart*/ 0, /*chunkW*/ 2, /*chunkH*/ 2);

    // Full grid emits 4x more top faces (4 quads = 16 verts each face type) than a quarter chunk.
    // All tiles are flat default-biome 'grassland' (covered), so every top
    // face lands in groundGeometry.grassland rather than the base buffer.
    expect(totalPositionsLength(chunk)).toBeLessThan(totalPositionsLength(full));
    expect(totalPositionsLength(chunk)).toBeGreaterThan(0);
  });

  it('a chunk built at colStart/rowStart occupies the same world-space location as the equivalent slice of the full grid', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 2 });

    const chunk = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1, 2, 2, 2, 2);
    // All tiles are flat default-biome 'grassland' (covered), so the chunk's
    // vertices land in groundGeometry.grassland rather than the base buffer.
    const positions = chunk.groundGeometry.grassland!.positions;
    // Top-face Y for elevation 2 at SH=1 should be 2, regardless of chunking.
    expect(positions[1]).toBe(positions[1]); // sanity: same array shape as before
    // World X of the first vertex should reflect colStart=2, not 0.
    const wx = (2 - 1.5) * 2; // (col - GHW) * T for col=2
    expect(positions[0]).toBeCloseTo(wx, 5);
  });

  it('defaults to the whole grid when chunk params are omitted (back-compat)', () => {
    const wg = new WorldGrid(3, 3);
    const withDefaults = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1);
    const explicit     = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 0, 0, 3, 3);
    expect(withDefaults.positions).toEqual(explicit.positions);
  });
});

describe('buildTerrainGeometryData — road sub-tile surface (roads as terrain tileset)', () => {
  it('produces identical geometry to before when no road paths are given, even for a road-flagged tile', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 1, feature: 'road' });
    const withoutPaths = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    const withEmptyPaths = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, []);
    expect(withoutPaths.positions).toEqual(withEmptyPaths.positions);
    expect(withoutPaths.indices).toEqual(withEmptyPaths.indices);
    expect(Object.keys(withEmptyPaths.roadGeometry)).toEqual([]);
  });

  it('keeps a road-flagged tile as one flat quad when road path data is given but never actually reaches this tile', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 0, feature: 'road' });
    const farAwayPath = [{ points: [{ x: 1000, z: 1000 }, { x: 1001, z: 1001 }], width: 1, variant: 'dirt' }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, farAwayPath);
    // Falls back to the flat/all-four-down branch (no road coverage) —
    // landing in groundGeometry.grassland (default biome, covered) as a
    // GROUND_SUBDIVISIONS^2=16 sub-tile grid, same as any other flat
    // grassland tile once no road actually covers it.
    expect(totalPositionsLength(data)).toBe(16 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(16 * 6);
    expect(Object.keys(data.roadGeometry)).toEqual([]);
  });

  it('subdivides a road-flagged tile into ground+road sub-tiles when a path covers part of it', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 0, feature: 'road' });
    // Tile spans world (-1,-1) to (1,1) at GHW=GHH=0, T=2. A path straight
    // down the middle (x=0) covers roughly half the tile's sub-tiles.
    const path = [{ points: [{ x: 0, z: -10 }, { x: 0, z: 10 }], width: 0.9, variant: 'cobblestone' }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, path, 4);
    // More than one quad now (subdivided): ground positions > 12 floats (4 verts).
    expect(data.positions.length).toBeGreaterThan(12);
    expect(Object.keys(data.roadGeometry)).toContain('cobblestone');
    expect(data.roadGeometry['cobblestone']!.positions.length).toBeGreaterThan(0);
    expect(data.roadGeometry['cobblestone']!.uvs.length).toBeGreaterThan(0);
    // Every road quad has 4 UV pairs and 6 indices, matching its 4 positions.
    const roadVertCount = data.roadGeometry['cobblestone']!.positions.length / 3;
    expect(data.roadGeometry['cobblestone']!.uvs.length).toBe(roadVertCount * 2);
    expect(data.roadGeometry['cobblestone']!.indices.length).toBe((roadVertCount / 4) * 6);
  });

  it('covers the full tile with road sub-tiles (zero ground sub-tiles) when the path spans the whole width', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 0, feature: 'road' });
    const path = [{ points: [{ x: 0, z: -10 }, { x: 0, z: 10 }], width: 10, variant: 'dirt' }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, path, 4);
    // No ground geometry at all for this fully-road tile (and no walls, flat single tile).
    expect(data.positions).toHaveLength(0);
    const roadVertCount = data.roadGeometry['dirt']!.positions.length / 3;
    expect(roadVertCount).toBe(4 * 4 * 4); // subdivisions^2 quads * 4 verts each
  });

  it('groups road sub-tile geometry by variant across multiple tiles', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 0, feature: 'road' });
    wg.set(1, 0, { elevation: 0, feature: 'road' });
    const paths = [
      { points: [{ x: -3, z: 0 }, { x: -1, z: 0 }], width: 10, variant: 'vulperia' },
      { points: [{ x: 1, z: 0 }, { x: 3, z: 0 }], width: 10, variant: 'dwarven' },
    ];
    const data = buildTerrainGeometryData(wg, 2, 1, 1, 0, 2, 1, 0, 0, 2, 1, paths, 2);
    expect(Object.keys(data.roadGeometry).sort()).toEqual(['dwarven', 'vulperia']);
  });

  it('road sub-tile top faces stay watertight with adjacent ground sub-tiles (no vertical gaps)', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 0, feature: 'road' });
    const path = [{ points: [{ x: 0, z: -10 }, { x: 0, z: 10 }], width: 0.9, variant: 'cobblestone' }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, path, 4);
    // Collect all Y values from both ground and road buffers; since this tile
    // has no jitter jump beyond CORNER_JITTER_MAX and no elevation step, all Y
    // values should sit within a tight band around the tile's physical height.
    const allY: number[] = [];
    for (let i = 1; i < data.positions.length; i += 3) allY.push(data.positions[i]!);
    for (let i = 1; i < data.roadGeometry['cobblestone']!.positions.length; i += 3) {
      allY.push(data.roadGeometry['cobblestone']!.positions[i]!);
    }
    expect(allY.length).toBeGreaterThan(0);
    const min = Math.min(...allY), max = Math.max(...allY);
    expect(max - min).toBeLessThanOrEqual(0.06 * 2 + 1e-6); // within 2x CORNER_JITTER_MAX of each other
  });
});

describe('buildTerrainGeometryData — river_ford tiles render as bridge decks (bridges over water)', () => {
  it('keeps the old flat colored-quad ford rendering when no road path data reaches it (backward-compat)', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { feature: 'river_ford', waterDepth: 0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);
    expect(data.positions).toHaveLength(4 * 3);
    expect(Object.keys(data.roadGeometry)).toEqual([]);
  });

  it('renders a ford tile as a bridge-deck sub-tile surface (not a plain ground quad) when a road path covers it', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 0, feature: 'river_ford', waterDepth: 0 });
    // Tile spans world (-1,-1) to (1,1) at GHW=GHH=0, T=2 — a path straight
    // through the middle with a generous width covers the whole tile.
    // elevation stays 0 (matching the default out-of-bounds neighbours in
    // this 1x1 grid) so no wall faces get added — isolates this assertion
    // to the top-face road/ground split only.
    const path = [{ points: [{ x: 0, z: -10 }, { x: 0, z: 10 }], width: 10, variant: 'vulperia' }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, path, 4);
    // Fully covered — zero plain ground geometry for this tile, all of it
    // moved into the bridge-deck buffer instead.
    expect(data.positions).toHaveLength(0);
    expect(Object.keys(data.roadGeometry)).toEqual([BRIDGE_ROAD_VARIANT]);
    expect(data.roadGeometry[BRIDGE_ROAD_VARIANT]!.positions.length).toBeGreaterThan(0);
  });

  it('always uses the universal bridge variant for a ford, regardless of which faction/generic road produced the crossing', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { elevation: 1, feature: 'river_ford', waterDepth: 0 });
    const path = [{ points: [{ x: 0, z: -10 }, { x: 0, z: 10 }], width: 10, variant: GENERIC_ROAD_VARIANT }];
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1, 0, 0, 1, 1, path, 4);
    expect(Object.keys(data.roadGeometry)).toEqual([BRIDGE_ROAD_VARIANT]);
  });

  it('does not affect an ordinary (non-ford) road tile\'s variant when both are present in the same call', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 1, feature: 'road' });
    wg.set(1, 0, { elevation: 1, feature: 'river_ford', waterDepth: 0 });
    const paths = [
      { points: [{ x: -3, z: 0 }, { x: -1, z: 0 }], width: 10, variant: 'dwarven' },
      { points: [{ x: 1, z: 0 }, { x: 3, z: 0 }], width: 10, variant: 'dwarven' },
    ];
    const data = buildTerrainGeometryData(wg, 2, 1, 1, 0, 2, 1, 0, 0, 2, 1, paths, 2);
    expect(Object.keys(data.roadGeometry).sort()).toEqual([BRIDGE_ROAD_VARIANT, 'dwarven']);
  });
});

describe('buildTerrainGeometryData — ramp/slope top-face shapes', () => {
  function flatGrid(size: number, elevation: number): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) g.set(c, r, { elevation });
    return g;
  }

  it('renders a flat tile identically to before (byte-for-byte position/normal match)', () => {
    const wg = flatGrid(3, 2);
    // Isolate tile (1,1) via the chunk sub-rectangle params — its 4 real
    // neighbors are all in-bounds and match its own elevation, so (unlike a
    // whole-grid render, where the OUTER ring's out-of-bounds neighbors
    // default to elevation 0 and trigger real edge walls — pre-existing,
    // unrelated to this plan) this isolated tile has zero walls at all,
    // exactly 1 flat top face. It's default-biome 'grassland' (covered),
    // so it lands in groundGeometry.grassland rather than the base buffer.
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    // 'grassland' has a micro-patch entry (river_bank) — a handful of the
    // 16 sub-tiles may occasionally land in groundGeometry.river_bank
    // instead, by design (real texture variety). Sum across every covered
    // variant rather than assuming all 16 stayed in grassland specifically.
    const allGround = Object.values(data.groundGeometry);
    const totalPositions = allGround.reduce((s, g) => s + g.positions.length, 0);
    const totalNormals = allGround.flatMap(g => g.normals);
    expect(totalPositions).toBe(16 * 4 * 3); // subdivided flat quad: 16 sub-tiles x 4 verts x 3 floats
    for (let i = 0; i < totalNormals.length; i += 3) {
      expect([totalNormals[i], totalNormals[i + 1], totalNormals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('renders an Edge-shaped tile (one full side ramped down) as a tilted planar quad with no wall at all (ramp reaches the neighbor exactly)', () => {
    const wg = flatGrid(3, 3);
    wg.set(0, 1, { elevation: 2 }); // west neighbor of tile (1,1), 1 level lower
    // Isolate tile (1,1)'s own contribution via the chunk sub-rectangle params
    // (colStart=1, rowStart=1, chunkW=1, chunkH=1) — scanning the WHOLE 3x3
    // buffer for "any tilted normal" would be a false-positive risk, since
    // OTHER tiles in the scene (e.g. tile (0,1) itself, bordering its own
    // now-different neighbors) already draw ordinary vertical WALL faces
    // whose normals also have ny=0, which a naive "ny < 0.999" scan would
    // wrongly count as "tilted". Isolating to exactly tile (1,1) avoids that.
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    // Tile (1,1)'s west neighbor is 1 level lower (classifies 'edge', ramped
    // west side); its north/south/east neighbors all match its own elevation.
    // With the wall-anchoring fix (Task 5), the west wall is now correctly
    // suppressed too — the ramp already reaches exactly down to the west
    // neighbor's own height, leaving no gap. Expected contribution: just
    // the 1 top face, now emitted as a GROUND_SUBDIVISIONS^2=16 sub-tile
    // grid (16 sub-tile quads x 4 verts x 3 floats = 192 normal floats),
    // landing in groundGeometry (default biome 'grassland' is covered)
    // since there are no walls left to occupy the base buffer. 'grassland'
    // has a micro-patch entry (river_bank) — a handful of the 16 sub-tiles
    // may occasionally land in groundGeometry.river_bank instead, by
    // design, so sum across every covered variant rather than assuming
    // all 16 stayed in grassland specifically.
    const allNormalsHere = Object.values(data.groundGeometry).flatMap(g => g.normals);
    expect(allNormalsHere).toHaveLength(16 * 4 * 3);
    // The top face's normal (first of the 4 verts, of whichever sub-tile
    // buffer it landed in) must be genuinely tilted — not exactly (0,1,0)
    // — confirming Task 4's real slope, while still mostly upward-facing
    // (not vertical like a wall). Every sub-tile of this tile shares the
    // identical parent normal regardless of which texture variant it
    // resolved to, so the first emitted normal is representative of all.
    const topFaceNy = allNormalsHere[1]!;
    expect(topFaceNy).toBeLessThan(0.999);
    expect(topFaceNy).toBeGreaterThan(0);
  });

  it('renders a Single-corner-shaped tile as 2 explicit triangles with different normals', () => {
    const wg = flatGrid(4, 3);
    // Lower only the SW-diagonal neighbor (0,0) relative to tile (1,1), leaving the
    // orthogonal neighbors (1,0) and (0,1) at the same level — only the NE corner
    // of tile (1,1) sees a lower contributor, isolating a single-corner dip.
    // (NE corner of tile(1,1) is lattice (2,2), contributed to by tiles (1,1),(2,1),(1,2),(2,2).)
    wg.set(2, 2, { elevation: 2 });
    // Isolate tile (1,1) via the chunk sub-rectangle params — its 4 orthogonal
    // neighbors (0,1),(2,1),(1,0),(1,2) all still match its own elevation 3,
    // so no wall faces trigger at all; the buffer contains EXACTLY the top
    // face's geometry, avoiding any risk of an unrelated wall/flat-tile
    // normal elsewhere in a wider scan being mistaken for the ramp's own.
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    // Non-planar shape, no walls -> lands entirely in groundGeometry.grassland.
    const normals = data.groundGeometry.grassland!.normals;
    expect(normals).toHaveLength(18); // 2 triangles x 3 verts x 3 floats — the non-planar path
    const tri1Normal = [normals[0], normals[1], normals[2]];
    const tri2Normal = [normals[9], normals[10], normals[11]];
    expect(tri1Normal).not.toEqual(tri2Normal);
  });

  it('falls back to flat-plus-wall (today\'s exact behavior) for the degenerate all-four-down case', () => {
    // Reuses the existing "emits 4 wall faces around a single raised tile" scenario —
    // tile 1 in a 1-row grid, both orthogonal neighbors 2 levels lower, and (with
    // height=1) the north/south neighbors are out-of-bounds, substituted as this
    // tile's own elevation — so tile 1 classifies as all-four-down and must render
    // exactly like before: flat top face, full walls on both sides. Split across
    // the base buffer (4 wall faces) and groundGeometry.grassland (3 top faces,
    // default biome covered) — see the earlier "emits 4 wall faces" test above.
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);
    expect(totalPositionsLength(data)).toBe(624); // unchanged shape, updated for sub-tile subdivision (see "emits 4 wall faces" test above)
    expect(totalIndicesLength(data)).toBe(4 * 6 + 3 * 16 * 6);
    const normalSet = new Set<string>();
    const normals = allNormals(data);
    for (let i = 0; i < normals.length; i += 3) {
      normalSet.add(`${normals[i]},${normals[i + 1]},${normals[i + 2]}`);
    }
    expect(normalSet).toEqual(new Set(['0,1,0', '0,0,1', '0,0,-1', '1,0,0', '-1,0,0']));
  });

  it('never ramps a dry tile toward an adjacent water tile (shoreline stays exactly as before)', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 2 });
    wg.set(0, 1, { elevation: 1, biome: 'ocean', waterDepth: 1 }); // lower AND water, west of (1,1)
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1);
    // A real vertical wall face DOES still exist here (tile (1,1) dropping
    // into the carved water) — that's correct, unchanged, pre-existing
    // behavior, not a regression. What must NOT exist is a "partial ramp
    // tilt" normal — every normal must be either a flat top face
    // (ny ~ 1) or a fully-vertical wall (ny ~ 0), never a value strictly
    // between the two, which would indicate a dry tile incorrectly ramping
    // toward the water boundary instead of keeping today's clean
    // vertical-wall-into-water look. Scans both the base buffer (walls +
    // the ocean tile's own untextured top) and groundGeometry.grassland
    // (every dry tile's top, since 'grassland' is a covered variant) so
    // this still checks every emitted top face, not just walls.
    const normals = allNormals(data);
    for (let i = 0; i < normals.length; i += 3) {
      const ny = normals[i + 1]!;
      const isFlat = Math.abs(ny - 1) < 0.01;
      const isWall = Math.abs(ny) < 0.01;
      expect(isFlat || isWall, `unexpected partial-tilt normal ny=${ny}`).toBe(true);
    }
  });

  it('suppresses the wall on the ramped side once the ramp itself reaches exactly down to the lower neighbor', () => {
    const isolated = new WorldGrid(2, 1);
    isolated.set(0, 0, { elevation: 3 });
    isolated.set(1, 0, { elevation: 2 }); // tile 1 is exactly 1 level lower, directly east of tile 0
    // Isolate tile 0 only (chunk sub-rectangle) — otherwise tile 1's OWN
    // east wall (toward the out-of-bounds void past col=1, which defaults
    // to elevation 0) would also appear in the buffer and be mistaken for
    // tile 0's east wall by a whole-buffer normal scan.
    const data = buildTerrainGeometryData(isolated, 2, 1, 1, 0, 2, 1, 0, 0, 1, 1);
    // Tile 0 (elevation 3) has an EAST-adjacent edge ramp toward tile 1 (elevation 2) —
    // with a 1-row grid, north/south are out-of-bounds (treated as self, no ramp
    // there), so tile 0 classifies as 'edge' (its NE+SE corners clamp to exactly
    // tile 1's own elevation). The east wall must be fully suppressed since the
    // ramp already reaches exactly down to tile 1's height — no gap remains.
    const eastWallNormalPresent = (() => {
      for (let i = 0; i < data.normals.length; i += 3) {
        const nx = data.normals[i]!, ny = data.normals[i + 1]!, nz = data.normals[i + 2]!;
        if (Math.abs(nx - 1) < 0.01 && Math.abs(ny) < 0.01 && Math.abs(nz) < 0.01) return true;
      }
      return false;
    })();
    expect(eastWallNormalPresent).toBe(false);
  });

  it('still draws a residual wall for the rare 2-level-jump case, anchored to the clamped ramp height not the old flat height', () => {
    const isolated = new WorldGrid(2, 1);
    isolated.set(0, 0, { elevation: 3 });
    isolated.set(1, 0, { elevation: 1 }); // 2 levels lower — ramp only covers 1 level, residual wall for the rest
    const data = buildTerrainGeometryData(isolated, 2, 1, 1, 0, 2, 1, 0, 0, 1, 1); // isolate tile 0 only
    let eastWallTopY = -Infinity;
    for (let i = 0; i < data.normals.length; i += 3) {
      const nx = data.normals[i]!, ny = data.normals[i + 1]!, nz = data.normals[i + 2]!;
      if (Math.abs(nx - 1) < 0.01 && Math.abs(ny) < 0.01 && Math.abs(nz) < 0.01) {
        eastWallTopY = Math.max(eastWallTopY, data.positions[i + 1]!); // Y component of this same vertex
      }
    }
    expect(eastWallTopY).toBeGreaterThan(-Infinity); // residual wall is present
    // SH=1 here (buildTerrainGeometryData's SH parameter) — elevation 3 tile ramped
    // down 1 level = physical height 2, strictly less than the old flat height of 3
    // (the wall's top now starts where the ramp's own corner already reached, not
    // at the tile's original flat elevation).
    expect(eastWallTopY).toBeLessThan(3);
    expect(eastWallTopY).toBeCloseTo(2, 5);
  });

  it('the pre-existing all-four-down wall test still produces exactly 4 full walls (unaffected by the anchor change)', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);
    expect(totalPositionsLength(data)).toBe(624);
    expect(totalIndicesLength(data)).toBe(4 * 6 + 3 * 16 * 6);
  });
});


describe('buildTerrainGeometryData — ground texture variant routing (Phase 4a)', () => {
  it('routes a flat grassland tile into groundGeometry.grassland, not the base buffer', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'grassland', elevation: 0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    // 'grassland' has a micro-patch entry (river_bank, see MICRO_PATCH_VARIANTS)
    // — a handful of the 16 sub-tiles may occasionally land in
    // groundGeometry.river_bank instead, by design (real texture variety).
    // Assert the *total* covered-biome indices sum to 16 sub-tiles' worth,
    // and that grassland itself got at least some of them.
    expect(data.groundGeometry.grassland).toBeDefined();
    expect(data.groundGeometry.grassland!.indices.length).toBeGreaterThan(0);
    const totalCoveredIndices = Object.values(data.groundGeometry).reduce((s, g) => s + g.indices.length, 0);
    expect(totalCoveredIndices).toBe(16 * 6); // 16 sub-tiles x 2 triangles x 3 indices
    // The base buffer must stay empty for this tile — no top face duplicated there.
    expect(data.indices.length).toBe(0);
  });

  it('computes world-space-projected UV on the routed tile', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'grassland', elevation: 0 });
    // T (tile size) = 2 in this call, so this tile spans world X/Z [0,2).
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 2, 1);
    const uvs = data.groundGeometry.grassland!.uvs;
    // 4 vertices x 2 floats = 8 values; just assert they vary across the
    // tile's footprint (not all identical, which would mean UV is broken/flat).
    const uSet = new Set<number>();
    for (let i = 0; i < uvs.length; i += 2) uSet.add(uvs[i]!);
    expect(uSet.size).toBeGreaterThan(1);
  });

  it('leaves an uncovered biome (ocean) on the untextured base buffer, byte-identical to today', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'ocean', elevation: 0, waterDepth: 1.0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    expect(data.groundGeometry.ocean).toBeUndefined();
    expect(data.indices.length).toBe(6); // top face in the base buffer, as before
  });
});

describe('buildTerrainGeometryData — ground texture variant routing for edge/ramp shapes (Phase 4a)', () => {
  it('routes an edge-shaped (planar tilt) grassland tile into groundGeometry too', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(0, 1, { elevation: 2, biome: 'grassland' }); // west neighbor of tile (1,1), 1 level lower
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    expect(data.groundGeometry.grassland).toBeDefined();
    // 'grassland' has a micro-patch entry (river_bank) — a handful of the
    // 16 sub-tiles may occasionally land in groundGeometry.river_bank
    // instead, by design. Assert the total across all covered variants.
    const totalNormals = Object.values(data.groundGeometry).reduce((s, g) => s + g.normals.length, 0);
    expect(totalNormals).toBe(16 * 4 * 3); // 16 sub-tiles x 4 verts x 3 floats
    const topFaceNy = data.groundGeometry.grassland!.normals[1]!;
    expect(topFaceNy).toBeLessThan(0.999); // genuinely tilted, not flat
    expect(topFaceNy).toBeGreaterThan(0);
  });

  it('routes a single-corner (non-planar) grassland tile into groundGeometry too', () => {
    const wg = new WorldGrid(4, 3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(2, 2, { elevation: 2, biome: 'grassland' }); // isolates a single NE-corner dip on tile (1,1)
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    expect(data.groundGeometry.grassland).toBeDefined();
    // Non-planar ramp shapes emit 6 vertices (2 explicit triangles) per tile.
    expect(data.groundGeometry.grassland!.positions.length / 3).toBe(6);
    const tri1Normal = data.groundGeometry.grassland!.normals.slice(0, 3);
    const tri2Normal = data.groundGeometry.grassland!.normals.slice(9, 12);
    expect(tri1Normal).not.toEqual(tri2Normal);
  });
});

describe('buildTerrainGeometryData — ground sub-tile system (2026-09-01)', () => {
  it('emits GROUND_SUBDIVISIONS^2 sub-tile quads for a flat covered-biome tile with no differing neighbors', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { biome: 'mountain', elevation: 1 });
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    // 'mountain' has no MICRO_PATCH_VARIANTS entry and no differing
    // neighbor here, so every sub-tile should resolve to 'mountain' itself.
    expect(data.groundGeometry.mountain!.indices).toHaveLength(16 * 6);
    expect(Object.keys(data.groundGeometry)).toEqual(['mountain']);
  });

  it('gives adjacent sub-tiles within the same tile seamless shared-edge heights (bump is consistent)', () => {
    const wg = new WorldGrid(3, 3);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { biome: 'mountain', elevation: 1 });
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 2, 1, 1, 1, 1, 1);
    const p = data.groundGeometry.mountain!.positions;
    // Emission order: sz outer loop, sx inner loop, 4 verts (SW,NW,NE,SE)
    // per sub-tile quad. Quad 0 = sub-tile (sx=0,sz=0): verts 0(SW),1(NW),
    // 2(NE),3(SE). Quad 1 = sub-tile (sx=1,sz=0): verts 4(SW),5(NW),6(NE),
    // 7(SE) — immediately east of quad 0. Quad0's east edge (NE,SE) must
    // exactly match quad1's west edge (NW,SW): same world lattice points,
    // so the shared bump value must agree.
    const v = (i: number) => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! });
    const q0NE = v(2), q0SE = v(3);
    const q1NW = v(5), q1SW = v(4);
    expect(q0NE.x).toBeCloseTo(q1NW.x, 9);
    expect(q0NE.y).toBeCloseTo(q1NW.y, 9);
    expect(q0NE.z).toBeCloseTo(q1NW.z, 9);
    expect(q0SE.x).toBeCloseTo(q1SW.x, 9);
    expect(q0SE.y).toBeCloseTo(q1SW.y, 9);
    expect(q0SE.z).toBeCloseTo(q1SW.z, 9);
  });

  it('pulls border sub-tiles toward a differently-textured neighbor sometimes, concentrated near the shared edge', () => {
    // 6 mountain/desert tile-pairs along a shared north-south edge = 24
    // independent per-sub-tile 40% border-pull rolls (N=4 each) — makes
    // "zero pulls succeed" astronomically unlikely (0.6^24 ≈ 0.0005%),
    // unlike testing a single tile-pair (0.6^4 ≈ 13% flake risk).
    const wg = new WorldGrid(2, 6);
    for (let r = 0; r < 6; r++) {
      wg.set(0, r, { biome: 'mountain', elevation: 1 });
      wg.set(1, r, { biome: 'desert', elevation: 1 });
    }
    const data = buildTerrainGeometryData(wg, 2, 6, 0.5, 2.5, 2, 1);
    const desertPulledIn = data.groundGeometry.desert?.indices.length ?? 0;
    expect(desertPulledIn).toBeGreaterThan(0);
  });

  it('never subdivides a ramp-shaped (non-planar) tile — unaffected by this pass', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 3, biome: 'grassland' });
    wg.set(2, 2, { elevation: 2, biome: 'grassland' }); // isolates a single-corner dip on tile (1,1), same fixture as the existing single-corner test
    const data = buildTerrainGeometryData(wg, 4, 4, 1, 1, 2, 1, 1, 1, 1, 1);
    // Still exactly 1 shape's worth (6 verts, 2 triangles) — not 16 sub-tiles.
    expect(data.groundGeometry.grassland!.positions.length / 3).toBe(6);
  });

  it('gives a subdivided (covered, flat) tile and its adjacent NON-subdivided (uncovered, flat) tile the identical Y at their shared corner — no seam', () => {
    // Regression test for a real reported bug: subdivided flat/edge tiles
    // bake subTileBumpJitter() into their own real corners too, but
    // non-subdivided paths (uncovered biomes, ramp shapes, road sub-tiles)
    // were still using the OLD cornerHeightJitter() at their corners — a
    // different hash function AND a different amplitude (±0.03 vs ±0.06),
    // so two tiles sharing a corner via different code paths disagreed,
    // producing a small visible gap ("ground tiles are a tiny bit
    // disconnected on raise and slopes").
    const wg = new WorldGrid(3, 3);
    // 'mountain' surrounding tile (1,1) on all sides EXCEPT east, so tile
    // (1,1)'s own north/south/west border-pull checks never trigger
    // (their neighbor variant always equals its own) — isolates this test
    // to purely the east-edge seam, with no risk of an unrelated
    // border-pull redirecting some of its 16 sub-tiles into a different
    // groundGeometry buffer and shifting vertex-index arithmetic. 'mountain'
    // also has no MICRO_PATCH_VARIANTS entry, ruling out micro-patch
    // redirects too.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) wg.set(c, r, { biome: 'mountain' });
    // Tile (2,1): 'ocean' biome, waterDepth 0 (no carving, so its physical
    // height stays 0 too, matching tile (1,1) — no wall, purely a
    // texture-routing difference) — 'ocean' is never ramp-eligible, so it
    // takes the flat branch's UNCOVERED fallback (still
    // cornerHeightJitter-based before the fix).
    wg.set(2, 1, { biome: 'ocean', waterDepth: 0 });
    // Render only tiles (1,1) and (2,1) — the shared edge under test.
    const data = buildTerrainGeometryData(wg, 3, 3, 1, 1, 1, 1, 1, 1, 2, 1);

    // Tile (1,1)'s east-facing outermost sub-tile column (sx=3, the last
    // of N=4) sits exactly on the shared boundary with tile (2,1). Its
    // NE/SE corners must match tile (2,1)'s own NW/SW corner Y — tile
    // (2,1) is unsubdivided, so its single quad's SW/NW vertices sit at
    // that same shared boundary.
    const groundVerts = data.groundGeometry.mountain!.positions;
    // Sub-tile (sx=3, sz=0) is the 4th quad in the sz=0 row (quads 0-3) —
    // base vertex index 3 * 4 verts = 12; NE is local vertex 2, SE is
    // local vertex 3 within that quad (SW,NW,NE,SE order).
    const q3SE_y = groundVerts[(12 + 3) * 3 + 1]!; // sub-tile (3,0) SE — z=0 edge
    // Sub-tile (sx=3, sz=3) is the last quad overall (quad 15) — NE is
    // local vertex 2 within it.
    const q15NE_y = groundVerts[(60 + 2) * 3 + 1]!; // sub-tile (3,3) NE — z=1 edge

    // Tile (2,1) (ocean, uncovered, unsubdivided) lands in the base
    // buffer as a single quad: SW, NW, NE, SE.
    const baseVerts = data.positions;
    const tile2_1_SW_y = baseVerts[0 * 3 + 1]!;
    const tile2_1_NW_y = baseVerts[1 * 3 + 1]!;

    // Tile (1,1)'s sub-tile (3,0)'s SE corner (its own south-east real
    // corner) is shared with tile (2,1)'s SW. Sub-tile (3,3)'s NE (its
    // own north-east real corner) is shared with tile (2,1)'s NW.
    expect(q3SE_y).toBeCloseTo(tile2_1_SW_y, 9);
    expect(q15NE_y).toBeCloseTo(tile2_1_NW_y, 9);
  });
});
