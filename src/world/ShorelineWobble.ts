// ── ShorelineWobble — noise-perturbed water/land boundary points ─────────────
//
//  Every tile edge where a dry tile borders a water tile is, today, a
//  perfectly straight line running the tile's full 2 WU width — this is
//  the actual cause of the "blocky/staircase" shoreline look (confirmed via
//  investigation: see docs/superpowers/specs/2026-09-02-shoreline-edge-
//  smoothing-design.md). This module computes a small, deterministic,
//  noise-driven perpendicular offset for points along such an edge, with
//  the two endpoints ALWAYS pinned to the tile's actual grid corners (so
//  edges/tiles that share a corner always still connect with no gap).
//
//  Call site convention (must be followed everywhere this is used, or two
//  tiles sharing an edge could disagree): a horizontal edge (z0 === z1) is
//  always called west-endpoint-first (x0 < x1); a vertical edge (x0 === x1)
//  is always called north-endpoint-first (z0 < z1). Both terrain wall/top-
//  surface generation (TerrainGeometryBuilder.ts) and the water-surface
//  mesh (OverworldScene._buildWaterMesh()) call this identically, which is
//  what guarantees their geometry meets with no gap by construction.

import { createNoise2D } from '@/core/SimplexNoise';
import type { WorldGrid } from './WorldGrid';

/** Sub-tile lattice resolution for shoreline wobble — matches
 *  GROUND_SUBDIVISIONS (TerrainGeometryBuilder.ts) so wobble points line up
 *  exactly with the existing sub-tile grid's corner positions. */
export const SHORELINE_WOBBLE_SUBDIVISIONS = 4;

/** Max perpendicular displacement (world units) applied to an interior edge
 *  point. Kept well under half a sub-tile (0.25 WU) so wobbled segments can
 *  never double back on themselves or cross a neighboring segment. */
const SHORE_WOBBLE_AMPLITUDE_WU = 0.18;

/** Low-frequency domain scale — a full noise wave spans several tiles, so
 *  the wobble reads as a slow, flowing curve rather than jittery per-point
 *  noise. */
const SHORE_WOBBLE_FREQUENCY = 0.15;

const _shoreNoise = createNoise2D(0x5C0A_57D3);

/**
 * Returns SHORELINE_WOBBLE_SUBDIVISIONS + 1 perpendicular offsets (world
 * units) for points evenly spaced along the straight edge from (x0,z0) to
 * (x1,z1). The first and last offsets are always exactly 0 — the tile-grid
 * corners never move. Interior offsets come from a shared, deterministic 2D
 * noise function sampled at each point's own world position, so calling
 * this twice with the same edge always returns identical results.
 */
export function shorelineEdgeOffsets(x0: number, z0: number, x1: number, z1: number): number[] {
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const offsets: number[] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n) { offsets.push(0); continue; }
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    offsets.push(_shoreNoise(px * SHORE_WOBBLE_FREQUENCY, pz * SHORE_WOBBLE_FREQUENCY) * SHORE_WOBBLE_AMPLITUDE_WU);
  }
  return offsets;
}

/**
 * Same as shorelineEdgeOffsets(), but returns the actual [x, z] world points
 * along the edge with the perpendicular offset already applied — for a
 * horizontal edge (z0 === z1) the offset perturbs Z; for a vertical edge
 * (x0 === x1) the offset perturbs X.
 */
export function shorelineEdgePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  const offsets = shorelineEdgeOffsets(x0, z0, x1, z1);
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const horizontal = z0 === z1;
  return offsets.map((offset, i) => {
    const t = i / n;
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    return horizontal ? [px, pz + offset] : [px + offset, pz] as [number, number];
  });
}

/** Which of a dry tile's 4 orthogonal edges border an actually-submerged
 *  neighbor (`waterDepth > 0`). All-false if this cell is itself wet — the
 *  DRY tile across a shared water/land edge is the one whose top-surface
 *  and wall generation needs the wobble treatment, not the wet tile. */
export interface WaterAdjacency {
  north: boolean;
  south: boolean;
  east:  boolean;
  west:  boolean;
}

export function waterAdjacency(wg: WorldGrid, col: number, row: number): WaterAdjacency {
  if (wg.get(col, row).waterDepth > 0) {
    return { north: false, south: false, east: false, west: false };
  }
  return {
    north: wg.get(col, row - 1).waterDepth > 0,
    south: wg.get(col, row + 1).waterDepth > 0,
    east:  wg.get(col + 1, row).waterDepth > 0,
    west:  wg.get(col - 1, row).waterDepth > 0,
  };
}
