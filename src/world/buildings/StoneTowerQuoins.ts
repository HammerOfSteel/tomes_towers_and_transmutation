/**
 * StoneTowerQuoins.ts — raised vertical corner pilasters running each
 * octagon facet edge of a stone-tower ring (docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md follow-up rework):
 * real stone "quoins" -- alternating/reinforced corner stones -- give
 * the wall a coherent fluted/faceted silhouette matching the reference
 * tabletop-kit image's continuous corner definition, instead of an
 * undifferentiated jittered-block surface where every corner reads
 * the same as the flat faces.
 */

import * as THREE from 'three';
import { octagonPoints } from './StoneTowerShape';

/** How far a quoin's outward face sits beyond its own octagon vertex,
 * as a fraction of radius -- proud of the wall, matching a real raised
 * corner stone rather than a flush corner. */
const QUOIN_PROUD = 1.05;

/**
 * Builds 8 vertical corner-pilaster boxes, one at each octagon vertex
 * (`octagonPoints(radius, vertexScales)`), running the full
 * `ringHeight`, each pushed slightly proud of the wall along its own
 * radial direction so it reads as a distinct raised corner stone.
 * `vertexScales`, when given, is forwarded to `octagonPoints()` so
 * quoins follow the same per-floor jitter as the wall surface itself
 * (StoneTowerSilhouette.ts's `buildFloorVertexScales()`) -- a jittered
 * corner's quoin moves with it, rather than the quoin staying on an
 * unperturbed regular octagon while the wall around it wobbles.
 */
export function buildQuoins(
  radius: number, ringHeight: number, vertexScales: number[] | undefined, material: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const pts = octagonPoints(radius, vertexScales);
  const quoinWidth = radius * 0.1;
  const quoinDepth = radius * 0.1;

  for (const [x, z] of pts) {
    const ang = Math.atan2(x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(quoinWidth, ringHeight, quoinDepth), material);
    mesh.position.set(x * QUOIN_PROUD, ringHeight / 2, z * QUOIN_PROUD);
    mesh.rotation.y = ang;
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }

  return g;
}
