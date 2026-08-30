/**
 * ModularSet.test.ts — TDD coverage for the human "greebling" pass
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §2e.10).
 *
 * Human's existing thatched/timber/stone/render wall-panel skeleton was
 * never part of the "blob geometry" complaint (it already uses BoxGeometry
 * panels + real canvas textures), so this phase deliberately does not
 * rebuild it. It only adds small BlockKit-style decorative clusters layered
 * on top: window-box planters here, plus a block-stack chimney rebuild
 * covered in BuildingBuilder.test.ts.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { windowBoxPlanter } from '@/world/buildings/ModularSet';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';

const colors = STYLE_COLORS['timber'];

function countMeshes(g: THREE.Group): number {
  let n = 0;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}

describe('windowBoxPlanter', () => {
  it('builds without throwing and returns a non-empty group', () => {
    const g = windowBoxPlanter(colors, 1);
    expect(g).toBeInstanceOf(THREE.Group);
    expect(countMeshes(g)).toBeGreaterThan(0);
  });

  it('includes a trough box plus several foliage blobs (not just one mesh)', () => {
    const g = windowBoxPlanter(colors, 1);
    // Trough + at least 3 foliage blobs = at least 4 meshes total.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(4);
  });

  it('trough mesh uses BoxGeometry (a built container, not a deformed blob)', () => {
    const g = windowBoxPlanter(colors, 1);
    const boxMeshes = g.children.filter(
      c => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry,
    );
    expect(boxMeshes.length).toBeGreaterThanOrEqual(1);
  });

  it('foliage blobs are small and stay within/just above the trough footprint (no stray geometry)', () => {
    const g = windowBoxPlanter(colors, 1);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    // A window-box greeble should be small — sanity bound so a bug (e.g. a
    // foliage blob accidentally scaled by 100x) fails loudly here rather
    // than only showing up in a screenshot review.
    expect(size.x).toBeLessThan(1.2);
    expect(size.y).toBeLessThan(1.0);
    expect(size.z).toBeLessThan(0.8);
  });

  it('is deterministic for a fixed seed (same child count + positions)', () => {
    const a = windowBoxPlanter(colors, 42);
    const b = windowBoxPlanter(colors, 42);
    expect(a.children.length).toBe(b.children.length);
    for (let i = 0; i < a.children.length; i++) {
      expect(a.children[i]!.position.toArray()).toEqual(b.children[i]!.position.toArray());
    }
  });

  it('varies foliage placement across seeds (not a static fixture)', () => {
    const seedsChildPositions = [1, 2, 3, 4, 5, 6, 7, 8].map(seed => {
      const g = windowBoxPlanter(colors, seed);
      return g.children.map(c => c.position.x.toFixed(3)).join(',');
    });
    const distinct = new Set(seedsChildPositions);
    expect(distinct.size).toBeGreaterThan(1);
  });
});
