/**
 * RoundedCornerPosts.test.ts — rounded-corner-post helper used by
 * buildHouseOrShop() (BuildingBuilder.ts) to round the sharp seam between
 * two perpendicular box wall panels without touching the panels
 * themselves. See docs/superpowers/specs/
 * 2026-09-02-rounded-building-corners-design.md (§A2).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addRoundedCornerPosts } from '@/world/buildings/RoundedCornerPosts';

function countVerts(geo: THREE.BufferGeometry): number {
  return geo.attributes.position.count;
}

function hasNaN(geo: THREE.BufferGeometry): boolean {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count * 3; i++) {
    if (!Number.isFinite(pos.array[i])) return true;
  }
  return false;
}

describe('addRoundedCornerPosts', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#a08060' });

  it('adds exactly 4 mesh posts to the group', () => {
    const g = new THREE.Group();
    addRoundedCornerPosts(g, 6, 4, 0.35, 3.0, 0.14, mat);
    const meshes = g.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBe(4);
  });

  it('produces finite, non-NaN geometry for every post', () => {
    const g = new THREE.Group();
    addRoundedCornerPosts(g, 6, 4, 0.35, 3.0, 0.14, mat);
    for (const child of g.children) {
      if (child instanceof THREE.Mesh) {
        expect(hasNaN(child.geometry)).toBe(false);
        expect(countVerts(child.geometry)).toBeGreaterThan(0);
      }
    }
  });

  it('each post is tangent to the building footprint edges (max |x| reaches w/2, max |z| reaches d/2)', () => {
    const w = 6, d = 4, radius = 0.14;
    const g = new THREE.Group();
    addRoundedCornerPosts(g, w, d, 0.35, 3.0, radius, mat);
    let maxAbsX = 0, maxAbsZ = 0;
    for (const child of g.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const pos = child.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const worldX = pos.getX(i) + child.position.x;
        const worldZ = pos.getZ(i) + child.position.z;
        maxAbsX = Math.max(maxAbsX, Math.abs(worldX));
        maxAbsZ = Math.max(maxAbsZ, Math.abs(worldZ));
      }
    }
    expect(maxAbsX).toBeCloseTo(w / 2, 5);
    expect(maxAbsZ).toBeCloseTo(d / 2, 5);
  });

  it('no post point exceeds the building footprint (stays within w/2, d/2 bounds)', () => {
    const w = 6, d = 4, radius = 0.14;
    const g = new THREE.Group();
    addRoundedCornerPosts(g, w, d, 0.35, 3.0, radius, mat);
    for (const child of g.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const pos = child.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const worldX = pos.getX(i) + child.position.x;
        const worldZ = pos.getZ(i) + child.position.z;
        expect(Math.abs(worldX)).toBeLessThanOrEqual(w / 2 + 1e-6);
        expect(Math.abs(worldZ)).toBeLessThanOrEqual(d / 2 + 1e-6);
      }
    }
  });

  it('is deterministic: identical inputs produce identical vertex data', () => {
    const g1 = new THREE.Group();
    const g2 = new THREE.Group();
    addRoundedCornerPosts(g1, 6, 4, 0.35, 3.0, 0.14, mat);
    addRoundedCornerPosts(g2, 6, 4, 0.35, 3.0, 0.14, mat);
    const verts1 = (g1.children[0] as THREE.Mesh).geometry.attributes.position.array;
    const verts2 = (g2.children[0] as THREE.Mesh).geometry.attributes.position.array;
    expect(Array.from(verts1)).toEqual(Array.from(verts2));
  });
});
