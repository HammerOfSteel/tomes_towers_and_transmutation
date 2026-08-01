import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';

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
    wg.set(0, 0, { biome: 'water' });

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
