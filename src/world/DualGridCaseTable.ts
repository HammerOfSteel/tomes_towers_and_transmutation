// ── DualGridCaseTable — rotation-canonical dual-grid case table ──────────────
//
//  Phase 0 of the "organic world tiles" roadmap (TODO/organic_world_tiles_todo.md):
//  shared, engine-agnostic infrastructure for the Townscaper-style "dual grid"
//  technique — typing a shape by its 4 CORNER states instead of typing whole
//  cells, so a shared render tile can be authored once per *canonical* corner
//  pattern and rotated to fit every raw pattern that's a rotation of it.
//
//  For `states` possible values per corner, there are `states^4` raw 4-corner
//  configs. Grouping every raw config by its lexicographically-smallest
//  rotation collapses that down to a much smaller set of canonical tiles —
//  for the binary (states=2) case used by shorelines/building corners, this
//  is exactly 6 tiles: empty (0 "on" corners), outer_corner (1), edge (2
//  adjacent), diagonal (2 opposite — the classic marching-squares "saddle"
//  ambiguity, handled here as a genuine 6th shape rather than a special
//  case), inner_corner (3), full (4).
//
//  Corner order/winding: [NW, NE, SE, SW], visited clockwise viewed from
//  above — the same convention `BlockKit.ts`'s `CornerId` type already
//  establishes in this codebase, so Phase 1/2 consumers (terrain shorelines,
//  building corners) can share one mental model. `rotateMask()` rotates the
//  physical shape 90° clockwise: the corner that was at NW moves to NE, so
//  the new NE/SE/SW/NW values are the old NW/NE/SE/SW values respectively.

/** One canonical (rotation-representative) tile in the case table. */
export interface DualGridCaseTile {
  /** The canonical corner-state mask, in [NW, NE, SE, SW] order. Chosen as
   *  the lexicographically-smallest rotation among every raw config that
   *  maps to this tile. */
  mask: number[];
  /** How many of the `states^4` raw configs map to this canonical tile —
   *  a diagnostic/testing invariant (sums to `states^4` across all tiles). */
  configCount: number;
  /** Human-readable topological name. Only populated for the binary
   *  (`states=2`) case, where the 6 shapes have well-known names; empty
   *  string for any other `states` value. */
  label: string;
}

/** Where a raw 4-corner config sits relative to the case table: which
 *  canonical tile it collapses to, and how many 90° clockwise rotations of
 *  that canonical tile's mask reproduce this exact raw config. */
export interface DualGridMapping {
  tile: number;
  steps: number;
}

export interface DualGridCaseTable {
  tiles: DualGridCaseTile[];
  /** key = the raw config's 4 corner values joined by commas, e.g. "0,1,0,0". */
  mapping: Record<string, DualGridMapping>;
}

/** Rotate a 4-corner mask 90° clockwise (see file header for the winding
 *  convention this assumes). */
export function rotateMask(mask: number[]): number[] {
  const [nw, ne, se, sw] = mask;
  return [sw!, nw!, ne!, se!];
}

function maskKey(mask: number[]): string {
  return mask.join(',');
}

/** Lexicographic comparison of two equal-length numeric arrays. */
function isLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}

/** Human label for a binary canonical mask, by count + arrangement of "on" corners. */
function binaryLabel(mask: number[]): string {
  const onCount = mask.reduce((s, v) => s + v, 0);
  switch (onCount) {
    case 0: return 'empty';
    case 4: return 'full';
    case 1: return 'outer_corner';
    case 3: return 'inner_corner';
    case 2:
      // mask is [NW, NE, SE, SW] — opposite corners are indices 0&2 (NW/SE)
      // or 1&3 (NE/SW). Two "on" corners are a saddle/diagonal iff they're
      // the opposite pair, i.e. mask[0] === mask[2] (both on, or — since
      // onCount is exactly 2 here, this only happens when both are on).
      return mask[0] === mask[2] ? 'diagonal' : 'edge';
    default:
      return '?';
  }
}

/**
 * Build the rotation-canonical dual-grid case table for `states` possible
 * values per corner over 4 corners. See file header for the algorithm and
 * the well-known states=2 -> 6-tiles result.
 */
export function buildDualGridCaseTable(states: number): DualGridCaseTable {
  const canonToTile = new Map<string, number>();
  const tiles: DualGridCaseTile[] = [];
  const mapping: Record<string, DualGridMapping> = {};

  for (let nw = 0; nw < states; nw++) {
    for (let ne = 0; ne < states; ne++) {
      for (let se = 0; se < states; se++) {
        for (let sw = 0; sw < states; sw++) {
          const config = [nw, ne, se, sw];

          // Canonical = lexicographically smallest of the 4 rotations.
          let best = config;
          let rotated = config;
          for (let i = 0; i < 3; i++) {
            rotated = rotateMask(rotated);
            if (isLess(rotated, best)) best = rotated;
          }

          const bestKey = maskKey(best);
          let tileIdx: number;
          if (canonToTile.has(bestKey)) {
            tileIdx = canonToTile.get(bestKey)!;
          } else {
            tileIdx = tiles.length;
            canonToTile.set(bestKey, tileIdx);
            tiles.push({ mask: best, configCount: 0, label: '' });
          }
          tiles[tileIdx]!.configCount++;

          // How many 90° rotations of the canonical mask reproduce `config`.
          let steps = 0;
          let probe = best;
          for (let k = 0; k < 4; k++) {
            if (maskKey(probe) === maskKey(config)) { steps = k; break; }
            probe = rotateMask(probe);
          }

          mapping[maskKey(config)] = { tile: tileIdx, steps };
        }
      }
    }
  }

  if (states === 2) {
    for (const tile of tiles) tile.label = binaryLabel(tile.mask);
  }

  return { tiles, mapping };
}
