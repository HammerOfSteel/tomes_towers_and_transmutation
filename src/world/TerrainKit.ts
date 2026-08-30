/**
 * TerrainKit.ts — pure geometry classifier + emitter for ramp/slope
 * terrain shapes, mirroring BlockKit.ts's role for buildings (pure
 * corner-data-in, geometry-buffers-out, no THREE.js/WorldGrid dependency).
 *
 * See docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md
 * for the full corner-height derivation rule and shape taxonomy rationale
 * this module implements.
 */

export type RampShape =
  | 'flat' | 'single-corner' | 'edge' | 'saddle' | 'outer-corner' | 'all-four-down';

export type Diagonal = 'sw-ne' | 'nw-se';

export interface RampClassification {
  shape: RampShape;
  /** Which diagonal to split the quad along when triangulating a non-planar
   *  shape — chosen so the shape's distinguishing corner(s) sit on the
   *  diagonal itself (single-corner/outer-corner: passes through the lone
   *  odd corner; saddle: connects the two low corners, giving the "valley"
   *  reading rather than the "ridge" reading). Irrelevant for flat/edge/
   *  all-four-down (both diagonal choices are geometrically equivalent for
   *  a planar quad) but always populated for API consistency. */
  diagonal: Diagonal;
}

/**
 * Classifies a tile's 4 corners — `[sw, nw, ne, se]`, `true` meaning that
 * corner is one elevation level below the tile's own elevation — into one
 * of the 5 canonical ramp shapes (plus the degenerate all-four-down
 * fallback), and picks the correct triangulation diagonal.
 */
export function classifyTileShape(
  lowCorners: readonly [boolean, boolean, boolean, boolean],
): RampClassification {
  const [sw, nw, ne, se] = lowCorners;
  const lowCount = [sw, nw, ne, se].filter(Boolean).length;

  if (lowCount === 0) return { shape: 'flat', diagonal: 'sw-ne' };
  if (lowCount === 4) return { shape: 'all-four-down', diagonal: 'sw-ne' };

  if (lowCount === 1) {
    // Diagonal passes through the lone low corner.
    const diagonal: Diagonal = (sw || ne) ? 'sw-ne' : 'nw-se';
    return { shape: 'single-corner', diagonal };
  }

  if (lowCount === 3) {
    // Diagonal passes through the lone HIGH corner (the odd one out).
    const highIsSwOrNe = !sw || !ne;
    const diagonal: Diagonal = highIsSwOrNe ? 'sw-ne' : 'nw-se';
    return { shape: 'outer-corner', diagonal };
  }

  // lowCount === 2: either adjacent (edge, planar) or diagonal (saddle).
  if (sw && ne && !nw && !se) return { shape: 'saddle', diagonal: 'sw-ne' };
  if (nw && se && !sw && !ne) return { shape: 'saddle', diagonal: 'nw-se' };
  // Adjacent pair — genuinely planar, diagonal choice doesn't affect the
  // resulting surface (see design spec §4/§6), 'sw-ne' by convention.
  return { shape: 'edge', diagonal: 'sw-ne' };
}
