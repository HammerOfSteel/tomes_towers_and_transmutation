/**
 * RoundedCornerPosts.ts — small, additive helper that rounds the sharp
 * vertical seam between two perpendicular box wall panels (as used by
 * BuildingBuilder.ts's plain-box builders, e.g. buildHouseOrShop()),
 * without touching the existing wall panel meshes at all. See
 * docs/superpowers/specs/2026-09-02-rounded-building-corners-design.md
 * (§A2) for the full design rationale — this is the box-panel-building
 * counterpart to BlockKit.ts's rounded chamfer arc (§A1), giving both
 * building-construction families in this codebase the same rounded-corner
 * visual language.
 */

import * as THREE from 'three';

/**
 * IMPORTANT (verified against three.js's CylinderGeometry source,
 * node_modules/three/src/geometries/CylinderGeometry.js's
 * generateTorso()): the `radialSegments` constructor argument is the
 * number of straight segments drawn across whatever `thetaLength` you
 * pass in — theta is computed as `u * thetaLength + thetaStart` where
 * `u = x / radialSegments` for `x` from `0` to `radialSegments`. It does
 * NOT scale down proportionally for a partial arc, so passing a
 * "full-circle" segment count together with a quarter-circle
 * `thetaLength` (as an earlier draft of this file mistakenly assumed)
 * would render the FULL segment count packed into just the quarter —
 * far denser than intended. `RADIAL_SEGMENTS` below is therefore the
 * actual number of straight segments each quarter-circle post renders
 * with, directly.
 */
const RADIAL_SEGMENTS = 8;

/**
 * [signX, signZ, thetaStart] for each of a building's 4 corners, in
 * three.js's CylinderGeometry angle convention (theta=0 is local +z,
 * theta=PI/2 is local +x, since CylinderGeometry computes
 * `x = radius * sin(theta)`, `z = radius * cos(theta)` — NOT the
 * standard math convention used by BlockKit.ts's CORNER_ARC table). Each
 * entry's thetaStart is chosen so the quarter-circle sweep
 * (thetaLength = PI/2) traces from the tangent point on one wall face to
 * the tangent point on the other, bulging outward through the true
 * corner direction in between:
 *
 *  - (+x,+z): thetaStart=0 sweeps from the tangent point on the +z wall
 *    face (theta=0 -> local (0,radius)) to the tangent point on the +x
 *    wall face (theta=PI/2 -> local (radius,0)).
 *  - (+x,-z): thetaStart=PI/2 sweeps from the +x face's tangent point to
 *    the -z face's tangent point (theta=PI -> local (0,-radius)).
 *  - (-x,-z): thetaStart=PI sweeps from the -z face's tangent point to
 *    the -x face's tangent point (theta=3PI/2 -> local (-radius,0)).
 *  - (-x,+z): thetaStart=3PI/2 sweeps from the -x face's tangent point
 *    back around to the +z face's tangent point (theta=2PI -> local
 *    (0,radius)).
 */
const CORNERS: Array<[number, number, number]> = [
  [ 1,  1, 0],
  [ 1, -1, Math.PI / 2],
  [-1, -1, Math.PI],
  [-1,  1, Math.PI * 1.5],
];

/**
 * Adds 4 quarter-cylinder corner posts to `group`, one at each corner of a
 * `w` x `d` rectangular footprint, each centered `radius` back from the
 * true corner along both axes so its curved outer surface is exactly
 * tangent to both adjacent wall faces (no gap or overlap when `radius`
 * matches the wall panels' own half-thickness). Spans from `yBase` to
 * `yBase + height`, matching the wall panels' own vertical span.
 */
export function addRoundedCornerPosts(
  group: THREE.Group,
  w: number, d: number,
  yBase: number, height: number,
  radius: number,
  material: THREE.Material,
): void {
  const halfW = w / 2, halfD = d / 2;
  for (const [signX, signZ, thetaStart] of CORNERS) {
    const cx = signX * (halfW - radius);
    const cz = signZ * (halfD - radius);
    const geo = new THREE.CylinderGeometry(radius, radius, height, RADIAL_SEGMENTS, 1, false, thetaStart, Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, yBase + height / 2, cz);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
}
