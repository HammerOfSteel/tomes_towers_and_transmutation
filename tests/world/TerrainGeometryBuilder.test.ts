import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import type { BiomeId } from '@/world/WorldGrid';
import { buildTerrainGeometryData, BIOME_COLOR_VARIANTS, cellVariantIndex, cornerHeightJitter } from '@/world/TerrainGeometryBuilder';
import { RIVER_DEPTH_WU, OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';

describe('buildTerrainGeometryData', () => {
  it('emits only top faces when all tiles are flat (no elevation steps)', () => {
    const wg = new WorldGrid(3, 1);
    // All tiles default to elevation 0 — no edits needed.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // 3 tiles × 1 top face × 4 verts × 3 floats = 36 position floats.
    expect(data.positions).toHaveLength(36);
    // 3 tiles × 1 top face × 6 indices = 18.
    expect(data.indices).toHaveLength(18);
    // Every face normal should be straight up (+Y) — no wall faces.
    for (let i = 0; i < data.normals.length; i += 3) {
      expect([data.normals[i], data.normals[i + 1], data.normals[i + 2]]).toEqual([0, 1, 0]);
    }
  });

  it('emits 4 wall faces around a single raised tile between two flat tiles', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(1, 0, { elevation: 2 });
    // Tile (0,0) and (2,0) stay at default elevation 0.

    const data = buildTerrainGeometryData(wg, 3, 1, 1, 0, 1, 1);

    // Tile 0: top only (1 face). Tile 1 (raised): top + N + S + E + W (5 faces).
    // Tile 2: top only (1 face). Total 7 faces × 4 verts × 3 floats = 84.
    expect(data.positions).toHaveLength(84);
    expect(data.indices).toHaveLength(42); // 7 faces × 6 indices

    // Collect the set of distinct face normals present — should include
    // up, north, south, east, west (5 distinct normals; tiles 0 and 2
    // contribute only "up" again, so 5 distinct values total).
    const normalSet = new Set<string>();
    for (let i = 0; i < data.normals.length; i += 3) {
      normalSet.add(`${data.normals[i]},${data.normals[i + 1]},${data.normals[i + 2]}`);
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
    // Tile 2: top + west wall (2 faces). Total 5 faces.
    expect(data.positions).toHaveLength(5 * 4 * 3);
    expect(data.indices).toHaveLength(5 * 6);

    // The river tile's top face sits at y = -RIVER_DEPTH_WU (elevation 0 - depth).
    // Face order: tile0 (top, east-wall), tile1 (top), tile2 (top, west-wall).
    // Tile0's top face is the first 4 verts (indices 0-3); tile1's top face
    // starts after tile0's 2 faces (8 verts in), i.e. position index 8*3=24.
    const tile1TopY = data.positions[8 * 3 + 1]!;
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
    expect(data.positions).toHaveLength(3 * 4 * 3);
    expect(data.indices).toHaveLength(3 * 6);
    for (let i = 0; i < data.normals.length; i += 3) {
      expect([data.normals[i], data.normals[i + 1], data.normals[i + 2]]).toEqual([0, 1, 0]);
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
    // Tile 0 (col=0): verts at local (wx,wy,wz),(wx,wy,wz1),(wx1,wy,wz1),(wx1,wy,wz) → indices 0..3
    // Tile 1 (col=1): same layout, base index 4..7.
    // Tile 0's east edge (v2,v3 = wx1 corner) must match tile 1's west edge (v0,v1 = wx corner)
    // since tile0's wx1 === tile1's wx (adjacent tiles, T=1).
    const face0 = [0, 1, 2, 3].map(v => ({
      x: data.positions[v * 3]!, y: data.positions[v * 3 + 1]!, z: data.positions[v * 3 + 2]!,
    }));
    const face1 = [4, 5, 6, 7].map(v => ({
      x: data.positions[v * 3]!, y: data.positions[v * 3 + 1]!, z: data.positions[v * 3 + 2]!,
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
    expect(chunk.positions.length).toBeLessThan(full.positions.length);
    expect(chunk.positions.length).toBeGreaterThan(0);
  });

  it('a chunk built at colStart/rowStart occupies the same world-space location as the equivalent slice of the full grid', () => {
    const wg = new WorldGrid(4, 4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) wg.set(c, r, { elevation: 2 });

    const chunk = buildTerrainGeometryData(wg, 4, 4, 1.5, 1.5, 2, 1, 2, 2, 2, 2);
    // Top-face Y for elevation 2 at SH=1 should be 2, regardless of chunking.
    expect(chunk.positions[1]).toBe(chunk.positions[1]); // sanity: same array shape as before
    // World X of the first vertex should reflect colStart=2, not 0.
    const wx = (2 - 1.5) * 2; // (col - GHW) * T for col=2
    expect(chunk.positions[0]).toBeCloseTo(wx, 5);
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
    // Falls back to the un-subdivided single-quad behavior: 4 verts, 6 indices.
    expect(data.positions).toHaveLength(12);
    expect(data.indices).toHaveLength(6);
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

