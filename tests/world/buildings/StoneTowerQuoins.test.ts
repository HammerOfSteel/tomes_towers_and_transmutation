/**
 * StoneTowerQuoins.test.ts — raised vertical corner pilasters running
 * each octagon facet edge of a stone-tower ring, giving the wall a
 * coherent fluted/faceted read (matching the reference tabletop-kit
 * image's continuous corner definition) instead of an undifferentiated
 * jittered-block surface with no distinct edges.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildQuoins } from '@/world/buildings/StoneTowerQuoins';
import { octagonPoints } from '@/world/buildings/StoneTowerShape';

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

describe('buildQuoins', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces exactly 8 quoin meshes (one per octagon corner)', () => {
    const g = buildQuoins(2, 2.9, undefined, material);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBe(8);
  });

  it('produces valid, non-NaN geometry', () => {
    const g = buildQuoins(2, 2.9, undefined, material);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic (pure function of its inputs)', () => {
    const g1 = buildQuoins(2, 2.9, undefined, material);
    const g2 = buildQuoins(2, 2.9, undefined, material);
    const box1 = new THREE.Box3().setFromObject(g1);
    const box2 = new THREE.Box3().setFromObject(g2);
    expect(box1.min.toArray()).toEqual(box2.min.toArray());
    expect(box1.max.toArray()).toEqual(box2.max.toArray());
  });

  it('each quoin sits proud of (farther from the axis than) its corresponding octagon vertex -- a raised corner strip, not flush with the wall', () => {
    const radius = 2;
    const g = buildQuoins(radius, 2.9, undefined, material);
    const pts = octagonPoints(radius);
    const meshes: THREE.Mesh[] = [];
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    expect(meshes.length).toBe(pts.length);
    for (const mesh of meshes) {
      const meshR = Math.hypot(mesh.position.x, mesh.position.z);
      expect(meshR).toBeGreaterThan(radius);
    }
  });

  it('spans the full ring height (runs from the base to the top of the ring, not a short accent)', () => {
    const ringHeight = 2.9;
    const g = buildQuoins(2, ringHeight, undefined, material);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y - box.min.y).toBeCloseTo(ringHeight, 1);
  });

  it('follows vertexScales when given, matching the wall surface\'s own per-floor jitter (a quoin at a scaled-up corner sits farther out)', () => {
    const radius = 2;
    const base = buildQuoins(radius, 2.9, undefined, material);
    const scaled = buildQuoins(radius, 2.9, [1, 1, 1.3, 1, 1, 1, 1, 1], material);
    const baseMeshes: THREE.Mesh[] = [];
    const scaledMeshes: THREE.Mesh[] = [];
    base.traverse((o) => { if (o instanceof THREE.Mesh) baseMeshes.push(o); });
    scaled.traverse((o) => { if (o instanceof THREE.Mesh) scaledMeshes.push(o); });
    const baseR = Math.hypot(baseMeshes[2]!.position.x, baseMeshes[2]!.position.z);
    const scaledR = Math.hypot(scaledMeshes[2]!.position.x, scaledMeshes[2]!.position.z);
    expect(scaledR).toBeGreaterThan(baseR);
  });
});
