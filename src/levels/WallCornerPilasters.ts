// ── WallCornerPilasters — dual-grid wall-corner pilaster detection ──────────
//
//  Phase 4 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): generalizes BlueprintRenderer.ts's
//  existing "corner pilaster" wall-silhouette-softening system to use
//  Phase 0's DualGridCaseTable, fixing a real gap in its prior ad-hoc rule
//  (which required a wall tile's DIAGONAL neighbour to also be wall before
//  even checking for an inner_corner -- missing the mirror-image
//  inner_corner shape where the diagonal is floor and BOTH orthogonal
//  "bridge" neighbours are wall instead). See
//  docs/superpowers/specs/2026-09-02-dungeon-wall-corner-pilaster-design.md
//  for the full derivation.

import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';

/** Grid-space (fractional cell-index) center point of a corner vertex
 *  needing a pilaster -- pass directly to blueprint.ts's cellToWorld(),
 *  which already accepts fractional coordinates. */
export interface CornerPilasterPoint {
  cx: number;
  cz: number;
}

/** Built once at module load -- pure data, shared with every other
 *  DualGridCaseTable consumer in this codebase. */
const _caseTable = buildDualGridCaseTable(2);

/**
 * Given a set of "wall" cell coordinates (as `"x,z"` string keys, matching
 * BlueprintRenderer.ts's own convention -- callers are responsible for
 * excluding door/staircase-backing tiles from this set exactly as the
 * existing code already does), finds every vertex shared by 4 cells whose
 * dual-grid classification is a genuine `inner_corner` (exactly 3 of the 4
 * surrounding cells are wall) -- the concave notch where a pilaster should
 * soften the silhouette. Deduplicated: a vertex shared by multiple wall
 * tiles is only ever returned once.
 */
export function findWallCornerPilasterPoints(wallTileSet: ReadonlySet<string>): CornerPilasterPoint[] {
  const isWall = (x: number, z: number): boolean => wallTileSet.has(`${x},${z}`);
  const seen = new Set<string>();
  const result: CornerPilasterPoint[] = [];

  for (const key of wallTileSet) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr), z = Number(zStr);

    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      // The 4 cells around the vertex at (x + dx*0.5, z + dz*0.5): this
      // tile itself, the diagonal neighbour, and the 2 orthogonal
      // "bridge" neighbours. Winding order doesn't matter for a label
      // lookup -- the case table's classification is rotation-invariant
      // by construction (see DualGridCaseTable.ts).
      const config = [
        isWall(x, z) ? 1 : 0,
        isWall(x + dx, z) ? 1 : 0,
        isWall(x + dx, z + dz) ? 1 : 0,
        isWall(x, z + dz) ? 1 : 0,
      ];
      const found = _caseTable.mapping[config.join(',')];
      if (!found) continue;
      if (_caseTable.tiles[found.tile]!.label !== 'inner_corner') continue;

      const cx = x + dx * 0.5, cz = z + dz * 0.5;
      const pointKey = `${cx.toFixed(6)},${cz.toFixed(6)}`;
      if (seen.has(pointKey)) continue;
      seen.add(pointKey);
      result.push({ cx, cz });
    }
  }

  return result;
}
