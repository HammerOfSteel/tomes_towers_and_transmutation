/**
 * StoneTowerShape.ts — shared octagon cross-section math for the elven
 * stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md). Every tower piece (base,
 * wall rings, roof cap) shares this same 8-sided cross-section, matching
 * the faceted-round silhouette in the user's reference image while
 * keeping per-ring triangle counts low.
 *
 * Angle convention: `x = radius * Math.sin(angle)`, `z = radius *
 * Math.cos(angle)` — matches THREE.CylinderGeometry's own internal
 * convention (angle 0 = local +Z/"north", increasing angle rotates
 * toward +X/"east"), so geometry built here stays consistent with
 * THREE's built-in primitives used elsewhere in this kit (e.g.
 * StoneTowerWallSurface.ts's textured-strategy CylinderGeometry).
 */

const SIDES = 8;

/** Returns the 8 corner points of a regular octagon of the given
 * circumradius, as [x, z] pairs. Point 0 is at local +Z (angle 0).
 *
 * `vertexScales`, when given, must have exactly `SIDES` (8) entries —
 * one multiplier per corner, applied to `radius` for that corner only,
 * letting a caller (StoneTowerSilhouette.ts's per-floor jitter) perturb
 * individual corners away from a perfect regular octagon. Omitted (or
 * `undefined`) reproduces the exact regular-octagon output below,
 * unchanged — this keeps every existing caller/test (which never pass
 * this new parameter) byte-for-byte backward compatible. A wrong-length
 * array throws rather than being silently ignored or clamped, since a
 * mismatched length is a caller bug (e.g. forgetting a corner), not
 * organic/expected input. */
export function octagonPoints(radius: number, vertexScales?: number[]): [number, number][] {
  if (vertexScales !== undefined && vertexScales.length !== SIDES) {
    throw new Error(`octagonPoints: vertexScales must have exactly ${SIDES} entries, got ${vertexScales.length}`);
  }
  const pts: [number, number][] = [];
  for (let i = 0; i < SIDES; i++) {
    const angle = (i / SIDES) * Math.PI * 2;
    const r = vertexScales !== undefined ? radius * vertexScales[i]! : radius;
    pts.push([r * Math.sin(angle), r * Math.cos(angle)]);
  }
  return pts;
}

/** One face of the octagon: its two corner points, and the angle (this
 * module's sin/cos convention) that bisects them — i.e. the direction
 * pointing straight out from the face's midpoint. */
export interface OctagonFace {
  a: [number, number];
  b: [number, number];
  normalAngle: number;
}

/** Returns the 8 faces of a regular octagon of the given circumradius,
 * in the same winding order as octagonPoints(). `vertexScales` is
 * forwarded verbatim to the underlying `octagonPoints()` call — see its
 * doc comment. */
export function octagonFaces(radius: number, vertexScales?: number[]): OctagonFace[] {
  const pts = octagonPoints(radius, vertexScales);
  const faces: OctagonFace[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % SIDES]!;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    faces.push({ a, b, normalAngle: Math.atan2(midX, midZ) });
  }
  return faces;
}

/**
 * Returns the 4 corners of a rectangle of the given half-width/half-depth,
 * as [x, z] pairs -- same winding direction as `octagonPoints()` (verified
 * by direct computation to produce the same +Y-facing floor-cap normal):
 * (halfW, halfD) -> (halfW, -halfD) -> (-halfW, -halfD) -> (-halfW, halfD).
 * Used by any building whose footprint is a genuine rectangle rather than
 * a regular octagon (e.g. the elven chapel's 4x8 nave) -- paired with
 * `rectangleFaces()` below, this lets `buildFloorCap()`/`buildQuoins()`
 * (via their `pointsOverride` parameter) and `buildWallSurfaceBlocks()`
 * (via its existing `facesOverride` parameter) build a real rectangular
 * hall using the exact same real per-course block-and-mortar technique as
 * every octagonal tower-kit building, with zero new wall-building code.
 */
export function rectanglePoints(halfW: number, halfD: number): [number, number][] {
  return [
    [halfW, halfD],
    [halfW, -halfD],
    [-halfW, -halfD],
    [-halfW, halfD],
  ];
}

/**
 * Returns the 4 faces of a rectangle of the given half-width/half-depth,
 * in the same `OctagonFace` shape and winding order as `octagonFaces()`.
 * Face 0 = the +X (right) wall, face 1 = the -Z (back) wall, face 2 =
 * the -X (left) wall, face 3 = the +Z (front, entrance) wall -- matching
 * `rectanglePoints()`'s own corner order.
 */
export function rectangleFaces(halfW: number, halfD: number): OctagonFace[] {
  const pts = rectanglePoints(halfW, halfD);
  const faces: OctagonFace[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const midX = (a[0] + b[0]) / 2;
    const midZ = (a[1] + b[1]) / 2;
    faces.push({ a, b, normalAngle: Math.atan2(midX, midZ) });
  }
  return faces;
}

/**
 * Linearly interpolates a point along a face's own a->b segment, for
 * `t` in [0, 1] (t=0 -> `face.a`, t=1 -> `face.b`, t=0.5 -> the face's
 * own midpoint). Works for ANY face (rectangle or octagon) -- a small,
 * pure, generically reusable utility, distinct from
 * `buildWallSurfaceBlocks()`'s own inline per-block placement math
 * (which additionally handles per-course jitter/offset that a
 * window/entrance placement caller doesn't need).
 */
export function facePointAt(face: OctagonFace, t: number): [number, number] {
  const [ax, az] = face.a;
  const [bx, bz] = face.b;
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}
