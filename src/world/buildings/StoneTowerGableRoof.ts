/**
 * StoneTowerGableRoof.ts — a gabled-ridge roof primitive for rectangular
 * tower-kit-family halls (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md): two raked planes meeting
 * at a central ridge beam, closed at each end by a flat gable triangle
 * -- the real-world vernacular default roof for a small rectangular
 * nave (a "long single-cell" hall), matching the small Jenkin Chapel
 * (Cheshire) precedent. None of the kit's existing radial roof-caps
 * (StoneTowerRoofCap.ts's classic/pagoda/living, all built from
 * CylinderGeometry/ConeGeometry stacks) can fit a rectangle -- this is
 * a genuinely new primitive, not a variant of an existing one.
 *
 * Generically reusable by any future rectangular-hall building (not
 * elven-specific), matching how StoneTowerRoofCap.ts holds the radial
 * archetypes shared across the whole tower-kit family.
 */

import * as THREE from 'three';

/** Fraction of halfWidth the roof overhangs past the wall at the eave --
 * matches the tower kit's own flared-eave convention
 * (StoneTowerRoofCap.ts's `eaveOuterR`). */
const EAVE_OVERHANG_FRAC = 0.15;

/**
 * Builds one raked roof plane (a thin box) running from the eave at
 * world (side*outerHalfWidth, 0) up to the ridge at (0, ridgeHeight),
 * spanning the full depth along Z. `side` is +1 (right/+X slope) or -1
 * (left/-X slope).
 */
function _buildSlopePlane(outerHalfWidth: number, ridgeHeight: number, depth: number, material: THREE.Material, side: 1 | -1): THREE.Mesh {
  const slopeLength = Math.hypot(outerHalfWidth, ridgeHeight);
  const thickness = Math.max(0.06, outerHalfWidth * 0.03);
  const geo = new THREE.BoxGeometry(slopeLength, thickness, depth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(side * outerHalfWidth / 2, ridgeHeight / 2, 0);
  const dx = 0 - side * outerHalfWidth;
  const dy = ridgeHeight - 0;
  mesh.rotation.z = Math.atan2(dy, dx);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds one flat vertical gable-end triangle (fills the open gap under
 * a slope plane's own end) at world Z = `zPos`, spanning from
 * (-outerHalfWidth, 0) to (outerHalfWidth, 0) to (0, ridgeHeight).
 * `side: THREE.DoubleSide` on the material avoids any risk of the
 * triangle's winding direction facing the wrong way (a small, low-value
 * panel not worth a bespoke per-end winding derivation).
 */
function _buildGableEndTriangle(outerHalfWidth: number, ridgeHeight: number, zPos: number, material: THREE.Material): THREE.Mesh {
  const positions = new Float32Array([
    -outerHalfWidth, 0, 0,
    outerHalfWidth, 0, 0,
    0, ridgeHeight, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  const doubleSideMat = material.clone();
  (doubleSideMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, doubleSideMat);
  mesh.position.z = zPos;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a complete gabled-ridge roof: two raked planes (`_buildSlopePlane`),
 * a ridge-cap beam along the peak, 2 gable-end triangle fills
 * (`_buildGableEndTriangle`), and 2 small ridge-end finials (reusing the
 * tower kit's own corner-finial vocabulary) for decorative continuity
 * with the rest of the kit.
 */
export function buildGableRoofCap(halfWidth: number, halfDepth: number, ridgeHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const outerHalfWidth = halfWidth * (1 + EAVE_OVERHANG_FRAC);
  const depth = halfDepth * 2;

  g.add(_buildSlopePlane(outerHalfWidth, ridgeHeight, depth, material, 1));
  g.add(_buildSlopePlane(outerHalfWidth, ridgeHeight, depth, material, -1));

  const ridgeBeam = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 0.12, halfWidth * 0.12, depth * 1.02),
    material,
  );
  ridgeBeam.position.y = ridgeHeight;
  ridgeBeam.castShadow = ridgeBeam.receiveShadow = true;
  g.add(ridgeBeam);

  g.add(_buildGableEndTriangle(outerHalfWidth, ridgeHeight, halfDepth, material));
  g.add(_buildGableEndTriangle(outerHalfWidth, ridgeHeight, -halfDepth, material));

  const finialH = halfWidth * 0.3;
  for (const zSide of [1, -1]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(halfWidth * 0.045, finialH, 4), material);
    finial.position.set(0, ridgeHeight + finialH / 2, zSide * halfDepth);
    finial.castShadow = true;
    g.add(finial);
  }

  return g;
}
