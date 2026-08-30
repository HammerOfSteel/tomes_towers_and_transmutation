import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import type { BiomeId } from '@/world/WorldGrid';
import { buildTerrainGeometryData, BIOME_COLOR_VARIANTS, cellVariantIndex, cornerHeightJitter, BIOME_LAKE } from '@/world/TerrainGeometryBuilder';
import type { TerrainGeometryData } from '@/world/TerrainGeometryBuilder';
import { RIVER_DEPTH_WU, OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU, LAKE_DEPTH_WU } from '@/world/WaterDepthConfig';
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

    // 3 tiles × 1 top face × 4 verts × 3 floats = 36 position floats — all
    // 3 land straight into groundGeometry.grassland (the default biome is
    // covered), so the base buffer itself stays empty.
    expect(totalPositionsLength(data)).toBe(36);
    expect(data.positions).toHaveLength(0);
    // 3 tiles × 1 top face × 6 indices = 18.
    expect(totalIndicesLength(data)).toBe(18);
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

    // Tile 0: top only (1 face). Tile 1 (raised): top + N + S + E + W (5 faces).
    // Tile 2: top only (1 face). Total 7 faces × 4 verts × 3 floats = 84,
    // split across the base buffer (walls only, 4 faces) and
    // groundGeometry.grassland (all 3 tops, since 'grassland' is covered).
    expect(totalPositionsLength(data)).toBe(84);
    expect(data.positions).toHaveLength(4 * 4 * 3); // 4 wall faces
    expect(data.groundGeometry.grassland!.positions).toHaveLength(3 * 4 * 3); // 3 top faces
    expect(totalIndicesLength(data)).toBe(42); // 7 faces × 6 indices

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

    // Tile 0: top + east wall (2 faces). Tile 1 (river): top only (1 face).
    // Tile 2: top + west wall (2 faces). Total 5 faces, split across the
    // base buffer (walls + the river's own untextured top face, since
    // 'river' has no ground texture) and groundGeometry.grassland (tile0's
    // and tile2's tops, since the default 'grassland' biome is covered).
    expect(totalPositionsLength(data)).toBe(5 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(5 * 6);

    // The river tile's top face sits at y = -RIVER_DEPTH_WU (elevation 0 - depth).
    // Base-buffer emission order per tile: tile0's east wall (4 verts),
    // then tile1's own top face (river has no ground texture, so it stays
    // on the base buffer exactly as before), then tile2's west wall.
    const tile1TopY = data.positions[4 * 3 + 1]!;
    // Top faces get a small deterministic corner jitter (± up to 0.03 WU)
    // layered on top of the carved base height for visual variety — assert
    // against that documented bound rather than an exact value.
    expect(tile1TopY).toBeCloseTo(-RIVER_DEPTH_WU, 1);
  });

  it('does not carve a river_ford tile (waterDepth 0) — sits flush with neighbours', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { feature: 'river_ford', waterDepth: 0 });
    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // All 3 tiles flat and flush -> only top faces, no walls (3 faces total).
    expect(totalPositionsLength(data)).toBe(3 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(3 * 6);
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

    // Same face-count shape as the river carving test: tile0 (top+east
    // wall), tile1 lake (top only), tile2 (top+west wall) = 5 faces, split
    // across the base buffer (walls + the lake's own untextured top face)
    // and groundGeometry.grassland (tile0/tile2's tops) — see the river
    // carving test above for the full breakdown.
    expect(totalPositionsLength(data)).toBe(5 * 4 * 3);
    expect(totalIndicesLength(data)).toBe(5 * 6);

    const tile1TopY = data.positions[4 * 3 + 1]!;
    expect(tile1TopY).toBeCloseTo(-LAKE_DEPTH_WU, 1);
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
    const wg = new WorldGrid(2, 1);
    const data = buildTerrainGeometryData(wg, 2, 1, 1, 0, 1, 1);
    // Both tiles are flat and default-biome 'grassland' (covered), so both
    // land in groundGeometry.grassland rather than the base buffer.
    const positions = data.groundGeometry.grassland!.positions;
    // Tile 0 (col=0): verts at local (wx,wy,wz),(wx,wy,wz1),(wx1,wy,wz1),(wx1,wy,wz) → indices 0..3
    // Tile 1 (col=1): same layout, base index 4..7.
    // Tile 0's east edge (v2,v3 = wx1 corner) must match tile 1's west edge (v0,v1 = wx corner)
    // since tile0's wx1 === tile1's wx (adjacent tiles, T=1).
    const face0 = [0, 1, 2, 3].map(v => ({
      x: positions[v * 3]!, y: positions[v * 3 + 1]!, z: positions[v * 3 + 2]!,
    }));
    const face1 = [4, 5, 6, 7].map(v => ({
      x: positions[v * 3]!, y: positions[v * 3 + 1]!, z: positions[v * 3 + 2]!,
    }));
    // face0 v2 (wx1,wz1) should match face1 v1 (wx,wz1) in both x and y (same world point).
    expect(face0[2]!.x).toBeCloseTo(face1[1]!.x, 9);
    expect(face0[2]!.y).toBeCloseTo(face1[1]!.y, 9);
    // face0 v3 (wx1,wz) should match face1 v0 (wx,wz) in both x and y.
    expect(face0[3]!.x).toBeCloseTo(face1[0]!.x, 9);
    expect(face0[3]!.y).toBeCloseTo(face1[0]!.y, 9);
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
    // Falls back to the un-subdivided single-quad behavior: 4 verts, 6
    // indices — landing in groundGeometry.grassland (default biome,
    // covered) rather than the base buffer, same as any other flat
    // grassland tile once no road actually covers it.
    expect(totalPositionsLength(data)).toBe(12);
    expect(totalIndicesLength(data)).toBe(6);
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
    const positions = data.groundGeometry.grassland!.positions;
    const normals = data.groundGeometry.grassland!.normals;
    expect(positions.length).toBe(4 * 3); // 1 flat quad, 4 verts x 3 floats
    for (let i = 0; i < normals.length; i += 3) {
      expect([normals[i], normals[i + 1], normals[i + 2]]).toEqual([0, 1, 0]);
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
    // neighbor's own height, leaving no gap. Expected contribution: just the
    // 1 top face (planar Edge quad, 4 verts) = 12 normal floats total,
    // landing in groundGeometry.grassland (default biome, covered) since
    // there are no walls left to occupy the base buffer.
    const normals = data.groundGeometry.grassland!.normals;
    expect(normals).toHaveLength(12);
    // The top face's normal (first of the 4 verts) must be genuinely tilted
    // — not exactly (0,1,0) — confirming Task 4's real slope, while still
    // mostly upward-facing (not vertical like a wall).
    const topFaceNy = normals[1]!;
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
    expect(totalPositionsLength(data)).toBe(84); // unchanged from the pre-existing test's expectation
    expect(totalIndicesLength(data)).toBe(42);
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
    expect(totalPositionsLength(data)).toBe(84);
    expect(totalIndicesLength(data)).toBe(42);
  });
});


describe('buildTerrainGeometryData — ground texture variant routing (Phase 4a)', () => {
  it('routes a flat grassland tile into groundGeometry.grassland, not the base buffer', () => {
    const wg = new WorldGrid(1, 1);
    wg.set(0, 0, { biome: 'grassland', elevation: 0 });
    const data = buildTerrainGeometryData(wg, 1, 1, 0, 0, 1, 1);

    expect(data.groundGeometry.grassland).toBeDefined();
    expect(data.groundGeometry.grassland!.indices.length).toBe(6); // one quad = 2 triangles
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
    expect(data.groundGeometry.grassland!.normals).toHaveLength(12); // 1 planar quad, 4 verts
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
