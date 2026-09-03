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
 */
export function buildFloorCap(radius: number, material: THREE.Material, vertexScales?: number[]): THREE.Mesh {
  const pts = octagonPoints(radius, vertexScales);
  const positions: number[] = [0, 0, 0]; // center vertex, index 0
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
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'elven-tower-floor-cap';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
