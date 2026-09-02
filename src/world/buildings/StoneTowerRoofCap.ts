/**
 * StoneTowerRoofCap.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): a classic conical
 * shingle roof (this task), and a living-canopy cap where the stone
 * shaft transitions into actual foliage (added in the next task) --
 * the clearest "hybrid stone + living tree" moment in the whole kit.
 */

import * as THREE from 'three';

/**
 * Classic conical shingle roof cap. A slight eave overhang (radius
 * *1.15) matches real tower-roof construction (the roof oversails the
 * wall below it). Relies on the material's own texture map (this kit's
 * caller passes a slateTexture()-mapped material) for shingle detail --
 * unlike the wall surface, this spec scoped the texture-vs-geometry
 * comparison to the wall only (see design spec's Testing section), so
 * the roof stays a single low-poly cone.
 */
export function buildClassicRoofCap(radius: number, coneHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(radius * 1.15, coneHeight, 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = coneHeight / 2;
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}
