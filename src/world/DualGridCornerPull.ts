// ── DualGridCornerPull — biome-agnostic dual-grid "odd one out" corner-pull core ──
//
//  Extracted from ShorelineCornerField.ts (Phase 1 of the "organic world tiles"
//  roadmap) so land-biome borders (see
//  docs/superpowers/specs/2026-09-20-land-biome-dual-grid-borders-design.md) can
//  reuse the exact same shape math without duplicating it. Pure, engine-agnostic,
//  no WorldGrid dependency — a "config" here is always a raw 4-corner binary
//  state in [NW, NE, SE, SW] order, matching DualGridCaseTable's own winding.

import { buildDualGridCaseTable } from './DualGridCaseTable';

/** [dx, dz] unit direction for each corner index, matching the [NW, NE, SE, SW]
 *  winding — identical convention/values to ShorelineCornerField.ts's own
 *  (now-removed) CORNER_DIRS constant. */
export const CORNER_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1], // NW
  [1, -1],  // NE
  [1, 1],   // SE
  [-1, 1],  // SW
];

/** Built once at module load — pure data, not per-world-seed content. */
const _caseTable = buildDualGridCaseTable(2);

/**
 * Given a raw 4-corner binary config, returns the corner INDEX (0-3, [NW,
 * NE, SE, SW]) that should be pulled toward — the lone "odd one out" tile
 * for an outer_corner (1 "on") or inner_corner (1 "off") config — or `null`
 * for every other shape (empty/full/edge/diagonal), which never pull.
 */
export function binaryCornerPullDirection(
  config: readonly [number, number, number, number],
): number | null {
  const found = _caseTable.mapping[config.join(',')];
  if (!found) return null;
  const tile = _caseTable.tiles[found.tile]!;
  if (tile.label !== 'outer_corner' && tile.label !== 'inner_corner') return null;
  // See ShorelineCornerField.ts's original comment: deliberately read the
  // minority value directly off the RAW config, not derived from the
  // canonical mask + `steps` (the canonical minority index differs between
  // outer_corner and inner_corner, so a single "steps % 4" formula doesn't
  // work for both).
  const minorityValue = tile.label === 'outer_corner' ? 1 : 0;
  return config.indexOf(minorityValue);
}

/**
 * Corner-pull displacement [dx, dz] (world units) for a raw 4-corner binary
 * config, scaled by `amplitudeWU`. Zero unless `binaryCornerPullDirection`
 * returns a non-null index.
 */
export function cornerPull(
  config: readonly [number, number, number, number],
  amplitudeWU: number,
): readonly [number, number] {
  const minorityIndex = binaryCornerPullDirection(config);
  if (minorityIndex === null) return [0, 0];
  const [dirX, dirZ] = CORNER_DIRS[minorityIndex]!;
  return [dirX * amplitudeWU, dirZ * amplitudeWU];
}
