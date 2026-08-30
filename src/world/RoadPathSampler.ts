/**
 * RoadPathSampler.ts — pure geometry helper that classifies a terrain
 * tile's sub-tile grid as "road" (and which road texture variant) or
 * "ground", based on one or more continuous world-space road paths.
 *
 * This is the piece that lets roads become genuine terrain sub-tiles
 * (baked into the same mesh as the ground, narrower than a full tile,
 * and able to curve) instead of a separate overlay mesh floating a hair
 * above the terrain — the overlay approach was the root cause of visible
 * z-fighting/flicker where the road plane and the ground's own per-corner
 * cosmetic jitter competed for the same depth. See
 * docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2's
 * "Roads as a first-class terrain surface" item.
 *
 * Road paths come from two sources, both converted to this module's
 * common `RoadPathSegment` shape by their respective callers:
 *   - Settlement-internal streets: `SettlementPlan.roadRibbons` (already a
 *     continuous, ward-model-derived centerline).
 *   - Inter-settlement roads: `RoadGenerator.ts`'s per-edge A* tile paths,
 *     Chaikin-smoothed into a continuous curve by the caller.
 */

/**
 * Variant key used for a bridge deck — the sub-tile surface rendered where
 * a road crosses water (currently: an inter-settlement road's A* path
 * landing on a river tile, which `WorldGenerator.applyRoadFords()` already
 * re-tags `feature: 'river_ford'`, per RI-3). A ford crossing isn't owned
 * by any one settlement/faction, so it always uses this single universal
 * variant regardless of which road produced it — see
 * `TerrainGeometryBuilder.ts`'s `river_ford` coverage-override branch and
 * `RoadTextures.ts`'s wood-plank texture for this variant. Prefixed with an
 * underscore for the same reason as `GENERIC_ROAD_VARIANT` (RoadTextures.ts)
 * — it can never collide with a real settlement faction string.
 */
export const BRIDGE_ROAD_VARIANT = '_bridge_deck';

export interface RoadPathSegment {
  /** Centerline points in world-space (x, z world units). */
  points: readonly { x: number; z: number }[];
  /** Road width in world units (the road spans halfWidth either side of the centerline). */
  width: number;
  /** Texture/material variant key (e.g. a faction id for settlement streets, or a generic id for open-road stretches). */
  variant: string;
}

/** Shortest distance from point (px,pz) to the segment (ax,az)-(bx,bz). */
function distancePointToSegment(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * Classifies each sub-tile of one tile (world-space origin at
 * `tileWorldX`/`tileWorldZ`, size `tileSize`, subdivided into
 * `subdivisions` x `subdivisions` sub-tiles) as covered by a road path
 * or not. Returns a row-major array (length `subdivisions * subdivisions`)
 * of the covering path's `variant`, or `null` for plain ground. When two
 * paths' road bands overlap the same sub-tile, the nearer one wins.
 */
export function computeTileRoadCoverage(
  paths: readonly RoadPathSegment[],
  tileWorldX: number, tileWorldZ: number, tileSize: number, subdivisions: number,
): (string | null)[] {
  const result: (string | null)[] = new Array(subdivisions * subdivisions).fill(null);
  if (paths.length === 0 || subdivisions <= 0) return result;

  const subSize = tileSize / subdivisions;
  // Coarse per-tile bounding-box pre-filter: skip paths whose bounding box
  // (expanded by half-width) doesn't even reach this tile, so a long
  // inter-settlement path doesn't get segment-tested against every distant
  // tile it never comes near.
  const tileMinX = tileWorldX, tileMaxX = tileWorldX + tileSize;
  const tileMinZ = tileWorldZ, tileMaxZ = tileWorldZ + tileSize;
  const relevant = paths.filter(path => {
    const halfW = path.width / 2;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of path.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    return !(maxX + halfW < tileMinX || minX - halfW > tileMaxX
           || maxZ + halfW < tileMinZ || minZ - halfW > tileMaxZ);
  });
  if (relevant.length === 0) return result;

  for (let sz = 0; sz < subdivisions; sz++) {
    for (let sx = 0; sx < subdivisions; sx++) {
      const cx = tileWorldX + (sx + 0.5) * subSize;
      const cz = tileWorldZ + (sz + 0.5) * subSize;
      let bestVariant: string | null = null;
      let bestDist = Infinity;
      for (const path of relevant) {
        const halfW = path.width / 2;
        for (let i = 0; i < path.points.length - 1; i++) {
          const a = path.points[i]!, b = path.points[i + 1]!;
          const d = distancePointToSegment(cx, cz, a.x, a.z, b.x, b.z);
          if (d <= halfW && d < bestDist) {
            bestDist = d;
            bestVariant = path.variant;
          }
        }
      }
      result[sz * subdivisions + sx] = bestVariant;
    }
  }
  return result;
}
