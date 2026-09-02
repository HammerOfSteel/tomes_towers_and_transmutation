// ── ShorelineCornerField — dual-grid corner-pull for shoreline geometry ─────
//
//  Phase 1 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): where ShorelineWobble.ts perturbs only
//  the INTERIOR of a water/land boundary edge (its 2 endpoints — the tile
//  grid corners — always pinned exactly in place), this module computes a
//  genuine displacement FOR those corners themselves, driven by Phase 0's
//  DualGridCaseTable rather than noise. See
//  docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md
//  for the full derivation (including a hand-verified direction check).
//
//  A "corner" here is a WorldGrid tile-grid VERTEX at tile-index (gx, gz),
//  shared by up to 4 tiles: NW=(gx-1,gz-1), NE=(gx,gz-1), SE=(gx,gz),
//  SW=(gx-1,gz) — matching DualGridCaseTable's own [NW,NE,SE,SW] winding, so
//  no index remapping is needed at the call site. A vertex whose 4
//  surrounding tiles are exactly 3-vs-1 (the case table's outer_corner /
//  inner_corner shapes) gets pulled TOWARD whichever single tile is the
//  odd one out — this always reads as THAT tile's corner being chamfered/
//  rounded off, regardless of whether the odd tile is land or water (see
//  the design spec's "isolated pond" / "isolated peninsula" derivation).
//  Every other case (empty/full/edge/diagonal) gets zero pull.

import { buildDualGridCaseTable } from './DualGridCaseTable';
import { shorelineEdgePoints, SHORELINE_WOBBLE_SUBDIVISIONS } from './ShorelineWobble';
import type { WorldGrid } from './WorldGrid';

/** Per-axis corner-pull amplitude (world units) — see design spec for the
 *  magnitude-bound reasoning (clearly larger than ShorelineWobble's 0.4 WU
 *  noise amplitude, while leaving headroom under a tile's 1.0 WU
 *  half-width even combined with that noise layer). */
export const SHORELINE_CORNER_PULL_WU = 0.5;

/** Built once at module load — pure data, not per-world-seed content (see
 *  docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md). */
const _caseTable = buildDualGridCaseTable(2);

/** [dx, dz] unit direction for each corner index, matching the [NW, NE,
 *  SE, SW] winding: NW is up-left (-x,-z), NE is up-right (+x,-z), SE is
 *  down-right (+x,+z), SW is down-left (-x,+z) — "up"/"down" meaning
 *  toward smaller/larger `row` (matching WorldGrid.gridToWorld's wz
 *  convention: wz increases with row). */
const CORNER_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1], // NW
  [1, -1],  // NE
  [1, 1],   // SE
  [-1, 1],  // SW
];

function _isLandTile(wg: WorldGrid, col: number, row: number): boolean {
  return wg.get(col, row).waterDepth === 0;
}

/**
 * Corner-pull displacement [dx, dz] (world units) for the WorldGrid vertex
 * at tile-index (gx, gz). Zero unless exactly 1 of its 4 surrounding tiles
 * differs from the other 3 (dual-grid outer_corner/inner_corner); in that
 * case, returns SHORELINE_CORNER_PULL_WU toward that lone tile's diagonal
 * direction. Out-of-bounds tiles read as land (WorldGrid.get()'s own
 * default), matching ShorelineWobble.ts's waterAdjacency() convention.
 */
export function shorelineCornerPull(wg: WorldGrid, gx: number, gz: number): readonly [number, number] {
  const config = [
    _isLandTile(wg, gx - 1, gz - 1) ? 1 : 0, // NW
    _isLandTile(wg, gx,     gz - 1) ? 1 : 0, // NE
    _isLandTile(wg, gx,     gz)     ? 1 : 0, // SE
    _isLandTile(wg, gx - 1, gz)     ? 1 : 0, // SW
  ];
  const found = _caseTable.mapping[config.join(',')];
  if (!found) return [0, 0];
  const tile = _caseTable.tiles[found.tile]!;
  if (tile.label !== 'outer_corner' && tile.label !== 'inner_corner') return [0, 0];

  // Find the "odd one out" directly in the RAW (un-rotated) config: for
  // outer_corner it's the lone land (1) corner; for inner_corner it's the
  // lone water (0) corner. (Deliberately not derived from the case
  // table's canonical mask + `steps` — the canonical mask's minority
  // corner sits at a DIFFERENT index for outer_corner (index 3 / SW,
  // since [0,0,0,1] is lexicographically smaller than [1,0,0,0]) than for
  // inner_corner (index 0 / NW, since [0,1,1,1] is smallest) so a single
  // "steps % 4" formula shared between both labels was wrong.)
  const minorityValue = tile.label === 'outer_corner' ? 1 : 0;
  const minorityIndex = config.indexOf(minorityValue);
  const [dirX, dirZ] = CORNER_DIRS[minorityIndex]!;
  return [dirX * SHORELINE_CORNER_PULL_WU, dirZ * SHORELINE_CORNER_PULL_WU];
}

/** Same length/shape as shorelineEdgePoints()'s output, but with zero
 *  perpendicular offset at every point — used when `includeNoiseWobble`
 *  is false, so shorelineBoundaryPoints() always has an N+1-point base
 *  line to add corner pull onto, regardless of whether this particular
 *  edge is itself a direct water boundary. */
function _straightEdgePoints(x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  const n = SHORELINE_WOBBLE_SUBDIVISIONS;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return pts;
}

/**
 * Drop-in replacement for ShorelineWobble.ts's shorelineEdgePoints(), for
 * a tile edge between the WorldGrid vertices (gx0, gz0) and (gx1, gz1).
 * Always applies each endpoint's shorelineCornerPull() (interpolated
 * across the polyline: full pull at each endpoint, blended in between) --
 * this is intentionally NOT gated by `includeNoiseWobble`, so any two
 * tiles sharing a vertex always agree on its position even when only one
 * of them has a direct water neighbor on this specific side (see design
 * spec's diagonal-adjacency finding). `includeNoiseWobble` gates ONLY the
 * existing fine interior noise layer (shorelineEdgePoints() itself) --
 * pass the same direct-water-adjacency check callers already compute
 * today (e.g. ShorelineWobble.ts's waterAdjacency() or an equivalent
 * per-side `waterDepth > 0` check).
 */
export function shorelineBoundaryPoints(
  wg: WorldGrid, T: number, GHW: number, GHH: number,
  gx0: number, gz0: number, gx1: number, gz1: number,
  includeNoiseWobble: boolean,
): Array<[number, number]> {
  const x0 = (gx0 - GHW) * T, z0 = (gz0 - GHH) * T;
  const x1 = (gx1 - GHW) * T, z1 = (gz1 - GHH) * T;
  const base = includeNoiseWobble
    ? shorelineEdgePoints(x0, z0, x1, z1)
    : _straightEdgePoints(x0, z0, x1, z1);

  const pull0 = shorelineCornerPull(wg, gx0, gz0);
  const pull1 = shorelineCornerPull(wg, gx1, gz1);
  const n = base.length - 1;
  return base.map(([px, pz], i) => {
    const t = i / n;
    return [
      px + pull0[0] * (1 - t) + pull1[0] * t,
      pz + pull0[1] * (1 - t) + pull1[1] * t,
    ] as [number, number];
  });
}
