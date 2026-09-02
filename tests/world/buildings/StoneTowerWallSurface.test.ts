/**
 * StoneTowerWallSurface.test.ts — the two swappable wall-surface
 * strategies for the elven stone-tower kit POC (textured prism vs. real
 * block geometry). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildWallSurfaceTextured } from '@/world/buildings/StoneTowerWallSurface';

function countTriangles(group: THREE.Group): number {
  let tris = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.attributes.position;
      tris += o.geometry.index ? o.geometry.index.count / 3 : pos.count / 3;
    }
  });
  return tris;
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

describe('buildWallSurfaceTextured (Strategy T)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#9aa0a8' });

  it('produces a group with at least one mesh', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThan(0);
  });

  it('produces finite, non-NaN geometry', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(hasNaN(g)).toBe(false);
  });

  it('is cheap: an 8-sided prism has at most a few dozen triangles', () => {
    const g = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g)).toBeLessThan(50);
  });

  it('is deterministic', () => {
    const g1 = buildWallSurfaceTextured(2, 3, mat);
    const g2 = buildWallSurfaceTextured(2, 3, mat);
    expect(countTriangles(g1)).toBe(countTriangles(g2));
  });
});
