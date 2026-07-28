/**
 * RealmRiverMesh.ts — 02-game-world-integration (RI-3)
 *
 * Builds a river surface mesh from an OW-A `RealmRiver` spline path
 * (`RealmData.rivers[]`). A river "at water level" is a flat horizontal
 * water plane following the path, not a cylindrical tube through the
 * ground — so this generates a width-varying quad-strip ribbon rather than
 * a `THREE.TubeGeometry`, which is the practical equivalent for a walkable
 * terrain river.
 *
 * Width scales linearly along the path from `RIVER_MIN_WIDTH` at the
 * headwaters (`river.points[0]`, where `generateRealmData()`'s flow-descent
 * algorithm starts) to `RIVER_MAX_WIDTH` at the mouth (last point) — per
 * RI-3's "headwaters narrow → mouth wide" requirement.
 *
 * Like `RealmToTerrain.ts`, this only imports *types* from
 * `overworld-studio.ts` (safe — no DOM-coupled runtime code pulled in).
 */

import * as THREE from 'three';
import type { RealmRiver, Vec2 } from '@/overworld-studio';
import { TERRAIN_TILE_SIZE, type TerrainTilePlacement } from './RealmToTerrain';

/** River width (world units) at the headwaters (river.points[0]). */
export const RIVER_MIN_WIDTH = 0.6;

/** River width (world units) at the mouth (last point). */
export const RIVER_MAX_WIDTH = 2.4;

/** Vertical offset above the sampled terrain height, avoids z-fighting with the ground plane. */
export const RIVER_WATER_LEVEL_OFFSET = 0.05;

export interface BuiltRiver {
  /** Three.js root group — add to scene with `scene.add(river.root)`. */
  root: THREE.Group;
  /** Release GPU resources. */
  dispose(): void;
}

/** Given world-space (x, z), return the terrain height (world units) to place the river surface at. */
export type RiverHeightSampler = (worldX: number, worldZ: number) => number;

function gridToWorld(pt: Vec2, tileSize: number): { x: number; z: number } {
  return { x: pt.x * tileSize, z: pt.y * tileSize };
}

/**
 * Build a lookup-based height sampler from `realmToTerrain()`'s placement
 * list — snaps a world (x, z) to its nearest grid cell and returns that
 * cell's smoothed terrain height. Cells outside the grid fall back to 0.
 */
export function makeHeightSampler(
  placements: readonly TerrainTilePlacement[],
  tileSize: number = TERRAIN_TILE_SIZE,
): RiverHeightSampler {
  const byCell = new Map<string, number>();
  for (const p of placements) byCell.set(`${p.gridX},${p.gridZ}`, p.height);

  return (worldX: number, worldZ: number): number => {
    const gridX = Math.round(worldX / tileSize);
    const gridZ = Math.round(worldZ / tileSize);
    return byCell.get(`${gridX},${gridZ}`) ?? 0;
  };
}

export interface BuildRiverMeshOptions {
  tileSize?: number;
  /** World-space height sampler — defaults to flat (0) if omitted. */
  heightAt?: RiverHeightSampler;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * RI-3 — build a width-varying river surface ribbon from a `RealmRiver`'s
 * spline path. Deterministic and pure aside from THREE.js object
 * allocation: same input always produces the same geometry.
 */
export function buildRiverMesh(river: RealmRiver, options: BuildRiverMeshOptions = {}): BuiltRiver {
  const tileSize  = options.tileSize  ?? TERRAIN_TILE_SIZE;
  const minWidth  = options.minWidth  ?? RIVER_MIN_WIDTH;
  const maxWidth  = options.maxWidth  ?? RIVER_MAX_WIDTH;
  const heightAt  = options.heightAt  ?? (() => 0);

  const worldPoints = river.points.map(p => gridToWorld(p, tileSize));
  const n = worldPoints.length;
  const root = new THREE.Group();

  if (n < 2) {
    // Degenerate river (too short to have a path) — nothing to render, but
    // still a valid, disposable BuiltRiver so callers don't need a special case.
    return { root, dispose: () => {} };
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const width = minWidth + (maxWidth - minWidth) * t;

    const p    = worldPoints[i]!;
    const prev = worldPoints[Math.max(0, i - 1)]!;
    const next = worldPoints[Math.min(n - 1, i + 1)]!;

    // Flow direction (tangent) in the XZ plane.
    let dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;

    // Perpendicular ("right") vector — rotate the tangent 90°.
    const rx = -dz, rz = dx;

    const y = heightAt(p.x, p.z) + RIVER_WATER_LEVEL_OFFSET;
    const halfWidth = width / 2;

    positions.push(p.x + rx * halfWidth, y, p.z + rz * halfWidth);
    positions.push(p.x - rx * halfWidth, y, p.z - rz * halfWidth);

    if (i < n - 1) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x2f6fa0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  root.add(mesh);

  root.userData['riverPointCount'] = n;

  return {
    root,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
