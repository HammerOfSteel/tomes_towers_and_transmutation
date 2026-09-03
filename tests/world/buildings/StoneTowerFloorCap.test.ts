/**
 * StoneTowerFloorCap.test.ts — the filled octagon disc primitive that
 * bridges tower-kit ring boundaries (docs/superpowers/specs/
 * 2026-09-04-tower-kit-floor-caps-and-roof-variety-design.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorCap } from '@/world/buildings/StoneTowerFloorCap';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#888' });
}

describe('buildFloorCap', () => {
  it('builds a mesh named elven-tower-floor-cap with a face normal pointing +Y', () => {
    const cap = buildFloorCap(2, mat());
    expect(cap.name).toBe('elven-tower-floor-cap');
    cap.geometry.computeVertexNormals();
    const normals = cap.geometry.attributes.normal;
    expect(normals).toBeDefined();
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getY(i)).toBeGreaterThan(0.9);
    }
  });

  it('lies flat at y=0 with all vertices within the given radius', () => {
    const cap = buildFloorCap(3, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(0);
      const dist = Math.hypot(pos.getX(i), pos.getZ(i));
      expect(dist).toBeLessThanOrEqual(3 + 1e-6);
    }
  });

  it('has no NaN vertices and at least 8 triangles (one per octagon edge)', () => {
    const cap = buildFloorCap(1.5, mat());
    const pos = cap.geometry.attributes.position;
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i])).toBe(true);
    }
    const index = cap.geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index!.count / 3).toBeGreaterThanOrEqual(8);
  });

  it('follows per-corner vertexScales jitter, matching octagonPoints()', () => {
    const scales = [1, 1, 1, 1, 1, 1, 1, 1.5]; // corner 7 pushed further out
    const cap = buildFloorCap(2, mat(), scales);
    const pos = cap.geometry.attributes.position;
    let maxDist = 0;
    for (let i = 0; i < pos.count; i++) {
      maxDist = Math.max(maxDist, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    expect(maxDist).toBeGreaterThan(2.9); // corner 7 at radius*1.5 = 3.0
  });
});
