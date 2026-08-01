/**
 * RealmRiverMesh.test.ts — 02-game-world-integration (RI-3)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildRiverMesh, makeHeightSampler,
  RIVER_MIN_WIDTH, RIVER_MAX_WIDTH, RIVER_WATER_LEVEL_OFFSET,
} from '@/world/RealmRiverMesh';
import { realmToTerrain, TERRAIN_TILE_SIZE, type RealmTerrainInput, type RealmTerrainCell } from '@/world/RealmToTerrain';
import type { RealmRiver, RealmBiome } from '@/overworld-studio';

function straightRiver(length: number): RealmRiver {
  return { points: Array.from({ length }, (_, i) => ({ x: 0, y: i })) };
}

describe('buildRiverMesh', () => {
  it('builds a valid group + geometry for a normal river path', () => {
    const river = straightRiver(6);
    const built = buildRiverMesh(river);
    expect(built.root).toBeInstanceOf(THREE.Group);
    expect(built.root.children).toHaveLength(1);
    const mesh = built.root.children[0] as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    // 2 vertices per path point (left/right edge of the ribbon).
    expect(mesh.geometry.attributes['position']!.count).toBe(river.points.length * 2);
    expect(() => built.dispose()).not.toThrow();
  });

  it('handles a degenerate (0 or 1 point) river without throwing', () => {
    const empty = buildRiverMesh({ points: [] });
    expect(empty.root.children).toHaveLength(0);
    expect(() => empty.dispose()).not.toThrow();

    const single = buildRiverMesh({ points: [{ x: 0, y: 0 }] });
    expect(single.root.children).toHaveLength(0);
    expect(() => single.dispose()).not.toThrow();
  });

  it('widens from RIVER_MIN_WIDTH at the headwaters to RIVER_MAX_WIDTH at the mouth', () => {
    const river = straightRiver(10);
    const built = buildRiverMesh(river);
    const mesh = built.root.children[0] as THREE.Mesh;
    const pos = mesh.geometry.attributes['position']!;

    const dist = (i: number) => {
      const ax = pos.getX(i * 2), az = pos.getZ(i * 2);
      const bx = pos.getX(i * 2 + 1), bz = pos.getZ(i * 2 + 1);
      return Math.hypot(ax - bx, az - bz);
    };

    const headwaterWidth = dist(0);
    const mouthWidth = dist(river.points.length - 1);

    expect(headwaterWidth).toBeCloseTo(RIVER_MIN_WIDTH, 5);
    expect(mouthWidth).toBeCloseTo(RIVER_MAX_WIDTH, 5);
    expect(mouthWidth).toBeGreaterThan(headwaterWidth);
  });

  it('honours custom minWidth/maxWidth overrides', () => {
    const river = straightRiver(4);
    const built = buildRiverMesh(river, { minWidth: 1, maxWidth: 5 });
    const mesh = built.root.children[0] as THREE.Mesh;
    const pos = mesh.geometry.attributes['position']!;
    const headDist = Math.hypot(pos.getX(0) - pos.getX(1), pos.getZ(0) - pos.getZ(1));
    expect(headDist).toBeCloseTo(1, 5);
  });

  it('places the ribbon at heightAt(x,z) + RIVER_WATER_LEVEL_OFFSET', () => {
    const river = straightRiver(3);
    const built = buildRiverMesh(river, { heightAt: () => 2 });
    const mesh = built.root.children[0] as THREE.Mesh;
    const pos = mesh.geometry.attributes['position']!;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(2 + RIVER_WATER_LEVEL_OFFSET, 5);
    }
  });

  it('scales world position by tileSize', () => {
    const river: RealmRiver = { points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] };
    const built = buildRiverMesh(river, { tileSize: 10 });
    const mesh = built.root.children[0] as THREE.Mesh;
    const pos = mesh.geometry.attributes['position']!;
    // Centreline x should be near 10 (=1*10) and 20 (=2*10) for the two points.
    expect(Math.min(pos.getX(0), pos.getX(1))).toBeLessThan(11);
    expect(Math.max(pos.getX(2), pos.getX(3))).toBeGreaterThan(19);
  });

  it('produces the expected triangle index count', () => {
    const river = straightRiver(5);
    const built = buildRiverMesh(river);
    const mesh = built.root.children[0] as THREE.Mesh;
    // (n - 1) quads * 2 triangles * 3 indices each.
    expect(mesh.geometry.index!.count).toBe((river.points.length - 1) * 6);
  });
});

describe('makeHeightSampler', () => {
  function makeGrid(biomeGrid: RealmBiome[][], elevationGrid: number[][]): RealmTerrainCell[][] {
    return biomeGrid.map((row, y) => row.map((biome, x) => ({ biome, elevation: elevationGrid[y]![x]! })));
  }

  it('samples the correct smoothed height at known grid cells', () => {
    const biomeGrid: RealmBiome[][] = [
      ['grassland', 'grassland'],
      ['grassland', 'grassland'],
    ];
    const elevationGrid = [
      [0.2, 0.4],
      [0.6, 0.8],
    ];
    const cells = makeGrid(biomeGrid, elevationGrid);
    const input: RealmTerrainInput = { cells, W: 2, H: 2, seed: 1 };
    const placements = realmToTerrain(input);
    const sampler = makeHeightSampler(placements);

    const p = placements.find(p => p.gridX === 1 && p.gridZ === 1)!;
    expect(sampler(1 * TERRAIN_TILE_SIZE, 1 * TERRAIN_TILE_SIZE)).toBeCloseTo(p.height, 6);
  });

  it('falls back to 0 for out-of-grid coordinates', () => {
    const cells = makeGrid([['grassland']], [[0.5]]);
    const input: RealmTerrainInput = { cells, W: 1, H: 1, seed: 1 };
    const sampler = makeHeightSampler(realmToTerrain(input));
    expect(sampler(999, 999)).toBe(0);
  });
});
