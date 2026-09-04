/**
 * StoneTowerGableRoof.test.ts — the gabled-ridge roof primitive for
 * rectangular tower-kit-family halls (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md): two raked planes meeting
 * at a central ridge, closed at each end by a gable triangle -- the
 * real-world vernacular default for a small rectangular nave, since none
 * of the kit's existing radial roof-caps (classic/pagoda/living) can fit
 * a rectangle.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGableRoofCap } from '@/world/buildings/StoneTowerGableRoof';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#888' });
}

function hasNaN(group: THREE.Group): boolean {
  let bad = false;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) {
        if (!Number.isFinite(pos.array[i])) bad = true;
      }
    }
  });
  return bad;
}

describe('buildGableRoofCap', () => {
  it('produces valid, non-NaN geometry across a range of dimensions', () => {
    for (const [hw, hd, rh] of [[2, 4, 2.5], [1, 2, 1.2], [3, 6, 3.5]] as [number, number, number][]) {
      const g = buildGableRoofCap(hw, hd, rh, mat());
      expect(hasNaN(g)).toBe(false);
      let meshCount = 0;
      g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
      expect(meshCount).toBeGreaterThan(0);
    }
  });

  it('reaches its full ridge height (the tallest mesh vertex is close to ridgeHeight, allowing for the small ridge-end finials on top)', () => {
    const ridgeHeight = 2.7;
    const g = buildGableRoofCap(2, 4, ridgeHeight, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y).toBeGreaterThan(ridgeHeight * 0.9);
    expect(box.max.y).toBeLessThan(ridgeHeight * 1.5); // finials add a bit more height on top
  });

  it('the two roof planes overhang slightly past halfWidth at the eave (a real flared eave, not flush with the wall)', () => {
    const halfWidth = 2;
    const g = buildGableRoofCap(halfWidth, 4, 2.5, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.x).toBeGreaterThan(halfWidth);
    expect(box.min.x).toBeLessThan(-halfWidth);
  });

  it('spans the full depth (2*halfDepth) along Z, closed at both gable ends', () => {
    const halfDepth = 4;
    const g = buildGableRoofCap(2, halfDepth, 2.5, mat());
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.z).toBeCloseTo(halfDepth, 0);
    expect(box.min.z).toBeCloseTo(-halfDepth, 0);
  });

  it('is deterministic (same inputs, same output geometry)', () => {
    const g1 = buildGableRoofCap(2, 4, 2.5, mat());
    const g2 = buildGableRoofCap(2, 4, 2.5, mat());
    let n1 = 0, n2 = 0;
    g1.traverse((o) => { if (o instanceof THREE.Mesh) n1 += o.geometry.attributes.position.count; });
    g2.traverse((o) => { if (o instanceof THREE.Mesh) n2 += o.geometry.attributes.position.count; });
    expect(n1).toBe(n2);
  });
});
