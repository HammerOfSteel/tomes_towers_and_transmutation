/**
 * StoneTowerWallSurface.ts — the two swappable wall-surface strategies
 * for the elven stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a cheap textured
 * octagonal prism (Strategy T) vs. real protruding stone-block geometry
 * per course (Strategy G, added in a later task). Both share the
 * `buildWallSurface()` dispatcher's signature so the tower-assembly code
 * (StoneTowerKit.ts) is agnostic to which is active.
 */

import * as THREE from 'three';

/**
 * Strategy T: a plain 8-sided extruded prism (matches
 * StoneTowerShape.ts's octagon cross-section exactly, since
 * THREE.CylinderGeometry with radialSegments=8 produces the identical
 * regular octagon -- verified: both use x=r*sin(theta), z=r*cos(theta)).
 * Cheapest possible wall surface; relies entirely on the material's
 * texture map for the coursed-stone look.
 */
export function buildWallSurfaceTextured(radius: number, height: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(radius, radius, height, 8, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = height / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
