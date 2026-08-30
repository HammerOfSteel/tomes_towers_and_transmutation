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

/**
 * Reorders a tile's 4 corners so the requested diagonal becomes the
 * shared edge between the 2 emitted triangles (matching the existing
 * `addFace()`-style convention in `TerrainGeometryBuilder.ts`, where a
 * quad's v0..v3 always triangulates as (v0,v1,v2)/(v0,v2,v3) — i.e. the
 * diagonal is always v0-v2). Rotating the vertex order preserves
 * counter-clockwise winding (rotating a CCW list cyclically stays CCW).
 */
export function orderCornersForDiagonal<T>(
  corners: { sw: T; nw: T; ne: T; se: T },
  diagonal: Diagonal,
): [T, T, T, T] {
  return diagonal === 'sw-ne'
    ? [corners.sw, corners.nw, corners.ne, corners.se]
    : [corners.nw, corners.ne, corners.se, corners.sw];
}

/** Unit-length face normal of the triangle (a, b, c), via the cross
 *  product of its two edge vectors. Winding must be counter-clockwise
 *  when viewed along the intended outward normal (matches every other
 *  face-emission helper in this codebase). */
export function triangleNormal(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export interface QuadFaceGeometry {
  /** 18 floats: 2 triangles x 3 verts x 3 floats (x,y,z), not indexed/deduplicated. */
  positions: number[];
  /** 18 floats, one normal per vertex — the 3 vertices of a given triangle
   *  always share the identical normal (flat-shaded per triangle); the two
   *  triangles composing the quad may differ from each other when the quad
   *  is non-planar. */
  normals: number[];
}

/**
 * Builds explicit 2-triangle geometry for a tile's top face given its 4
 * corner world-space positions and which diagonal to split along.
 * Always used for non-planar shapes (single-corner/outer-corner/saddle) —
 * flat/edge/all-four-down are cheaper to render via the existing
 * single-normal `addFace()` helper directly (see Task 4), since those
 * shapes are always genuinely planar (or intentionally forced flat).
 */
export function buildQuadFace(
  corners: {
    sw: readonly [number, number, number];
    nw: readonly [number, number, number];
    ne: readonly [number, number, number];
    se: readonly [number, number, number];
  },
  diagonal: Diagonal,
): QuadFaceGeometry {
  const [v0, v1, v2, v3] = orderCornersForDiagonal(corners, diagonal);
  // Matches addFace()'s existing (0,1,2)/(0,2,3) index convention — the
  // diagonal is always v0-v2 after ordering, so triangle 1 = v0,v1,v2 and
  // triangle 2 = v0,v2,v3.
  const n1 = triangleNormal(v0, v1, v2);
  const n2 = triangleNormal(v0, v2, v3);
  const positions: number[] = [...v0, ...v1, ...v2, ...v0, ...v2, ...v3];
  const normals: number[] = [...n1, ...n1, ...n1, ...n2, ...n2, ...n2];
  return { positions, normals };
}
