/**
 * StoneTowerFloorCap.ts — solid octagonal floor/ceiling discs bridging
 * every floor-ring transition in the tower-kit family (docs/superpowers/
 * specs/2026-09-04-tower-kit-floor-caps-and-roof-variety-design.md):
 * fixes a real visible bug where a narrower ring/roof sitting on a wider
 * ring below left an exposed, unfloored "shelf" -- since
 * StoneTowerWallSurface.ts's per-course block walls are a genuinely
 * hollow shell (individual protruding blocks with mortar gaps, no
 * backing wall), any such step exposed the pitch-black hollow interior
 * through the gaps between blocks, most visibly where a living-canopy
 * roof cap's much-narrower "neck" sits on the full-width top floor ring.
 */

import * as THREE from 'three';
import { octagonPoints } from './StoneTowerShape';

/**
 * Builds a flat, filled octagon disc (matching StoneTowerShape.ts's
 * shared octagon cross-section, including any per-corner `vertexScales`
 * jitter) lying in the local XZ plane at y=0 -- callers position/parent
 * it at whichever ring-top height needs a floor. Built as a plain
 * triangle fan from the center to each of the 8 boundary points; this
 * exact winding order (0, a, b) was verified by direct computation to
 * already produce a +Y-facing normal, so no extra rotation step is
 * needed (unlike THREE.ShapeGeometry, which builds in the XY plane and
 * would need an explicit rotateX).
 *
 * An optional `pointsOverride` parameter lets a caller supply an
 * arbitrary corner-point list (e.g. a rectangle) instead of a regular
 * octagon -- see `ElvenChapelKit.ts`'s nave for the first consumer.
 * `radius` becomes unused in that case (the UV mapping below falls back
 * to the override points' own max extent).
 */
export function buildFloorCap(
  radius: number, material: THREE.Material, vertexScales?: number[],
  pointsOverride?: [number, number][],
): THREE.Mesh {
  const pts = pointsOverride ?? octagonPoints(radius, vertexScales);
  const positions: number[] = [0, 0, 0]; // center vertex, index 0
  // Simple planar UV mapping (x/z projected into [0,1]) -- required so
  // this geometry merges cleanly with the wall/quoin/entrance geometry
  // it shares a material with (see mergeGroupMeshesByMaterial() in
  // MeshMergeUtils.ts, called on the whole building group by
  // SettlementRenderer.ts): mergeGeometries() requires every geometry in
  // a merge bucket to have the exact same attribute set, and a missing
  // `uv` attribute here caused it to fail silently (logged, not thrown)
  // -- which in turn caused mergeGroupMeshesByMaterial() to drop AND
  // dispose EVERY mesh in that material's bucket, including the wall
  // itself, leaving affected buildings with no visible walls at all
  // (a real regression caught via live Playwright verification, not
  // any automated test -- see this file's own test for the regression
  // guard now in place). When `pointsOverride` is given (e.g. a
  // rectangle nave, which has no single natural "radius"), the UV
  // normalization falls back to the max absolute coordinate across the
  // override points instead of `radius`, so UVs stay in a sane [0,1]-ish
  // range regardless of shape.
  const uvScale = pointsOverride
    ? Math.max(1e-6, ...pts.flatMap(([x, z]) => [Math.abs(x), Math.abs(z)])) * 2
    : radius * 2;
  const uvs: number[] = [0.5, 0.5];
  for (const [x, z] of pts) uvs.push(x / uvScale + 0.5, z / uvScale + 0.5);
  for (const [x, z] of pts) positions.push(x, 0, z);

  const indices: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % n);
    indices.push(0, a, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'elven-tower-floor-cap';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
