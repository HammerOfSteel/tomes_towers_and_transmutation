// ── WaterMeshBuilder — pure geometry builder for the water-surface mesh ──────
//
//  Extracted from OverworldScene._buildWaterMesh() so its shoreline-wobble
//  boundary logic is directly unit-testable with a small hand-crafted
//  WorldGrid, mirroring TerrainGeometryBuilder.ts's own extraction (same
//  file's header comment explains the same motivation: a pure function is
//  vastly easier to test precisely than a private method on a class that
//  needs a full procedurally-generated world to construct).

import type { WorldGrid } from './WorldGrid';
import { shorelineEdgePoints } from './ShorelineWobble';

export interface WaterMeshGeometryData {
  positions: number[];
  indices: number[];
}

/**
 * Builds the flat water-surface mesh's geometry: one quad per water tile
 * (river/lake/ocean/deep_ocean), with any edge bordering dry land wobbled
 * using the exact same ShorelineWobble points the land tile on the other
 * side computes for its own wall/top-surface boundary — so the two meshes
 * always meet with no gap, by construction.
 */
export function buildWaterMeshGeometryData(
  wg: WorldGrid,
  GW: number, GH: number, GHW: number, GHH: number,
  T: number, SH: number,
): WaterMeshGeometryData {
  const pos: number[] = [];
  const idx: number[] = [];

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const cell = wg.get(col, row);
      if (cell.feature !== 'river' && cell.feature !== 'lake' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;

      const wx  = (col - GHW) * T;
      const wz  = (row - GHH) * T;
      const wx1 = wx + T;
      const wz1 = wz + T;
      const wy  = cell.elevation * SH + 0.05;

      // Wobble this water tile's own edges wherever the neighbor is dry
      // land — the SAME ShorelineWobble points the land tile on the other
      // side computes for its own wall/top-surface, so the two meshes'
      // boundaries always match with no gap. (waterAdjacency() itself only
      // answers "does this DRY tile border water" per its doc comment, so
      // dryness is checked directly here, from the water tile's own
      // col/row, rather than reusing that helper backwards.)
      const southDry = wg.get(col, row + 1).waterDepth === 0;
      const northDry = wg.get(col, row - 1).waterDepth === 0;
      const eastDry  = wg.get(col + 1, row).waterDepth === 0;
      const westDry  = wg.get(col - 1, row).waterDepth === 0;

      // Each side's points always ordered per ShorelineWobble.ts's
      // convention (horizontal edges west-first, vertical edges
      // north-first), matching exactly what the land tile on the other
      // side of each edge computes — this is what guarantees the two
      // meshes meet with no gap.
      const westPts  = shorelineEdgePoints(wx,  wz,  wx,  wz1); // N -> S
      const southPts = shorelineEdgePoints(wx,  wz1, wx1, wz1); // W -> E
      const eastPts  = shorelineEdgePoints(wx1, wz,  wx1, wz1); // N -> S
      const northPts = shorelineEdgePoints(wx,  wz,  wx1, wz);  // W -> E

      // Re-orient each side for a single consistent ring traversal
      // (NW -> SW -> SE -> NE -> back to NW) — the exact corner order the
      // pre-existing code's original flat-quad triangulation already
      // proved produces a +Y-up-facing triangle winding (see its own
      // comment about the naive-winding back-face-culling bug this fixed).
      // Non-land-adjacent sides fall back to their own plain 2-point
      // (unwobbled) edge, in the same orientation, so the ring-building
      // logic below is uniform either way.
      const west  = westDry  ? westPts  : [westPts[0]!,  westPts[westPts.length - 1]!];
      const south = southDry ? southPts : [southPts[0]!, southPts[southPts.length - 1]!];
      const east  = (eastDry ? eastPts  : [eastPts[0]!,  eastPts[eastPts.length - 1]!]).slice().reverse();
      const north = (northDry ? northPts : [northPts[0]!, northPts[northPts.length - 1]!]).slice().reverse();

      const ring: Array<[number, number]> = [
        ...west,               // NW ... SW
        ...south.slice(1),     // SW -> ... -> SE (drop duplicate SW)
        ...east.slice(1),      // SE -> ... -> NE (drop duplicate SE)
        ...north.slice(1, -1), // NE -> ... (drop duplicate NE; drop trailing NW, already ring[0])
      ];

      // Fan-triangulate from the ring's first point (NW) — correct for any
      // subset of wobbled/plain sides since `ring` is always a simple,
      // consistently-wound polygon boundary. When every side is unwobbled
      // this reduces to exactly [NW, SW, SE, NE] with 2 triangles — byte-
      // identical to the original flat-quad triangulation, so a fully-
      // interior water tile (the common case, no land neighbors) renders
      // exactly as it always has.
      const base = pos.length / 3;
      for (const [rx, rz] of ring) pos.push(rx, wy, rz);
      for (let i = 1; i < ring.length - 1; i++) {
        idx.push(base, base + i, base + i + 1);
      }
    }
  }

  return { positions: pos, indices: idx };
}
