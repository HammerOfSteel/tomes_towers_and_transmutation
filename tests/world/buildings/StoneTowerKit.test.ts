/**
 * StoneTowerKit.test.ts — the top-level elven stone-tower kit POC
 * assembly (base + wall rings + roof cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTowerBase, buildTowerWallRing, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';

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

function countVerts(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

function makePalette(): StoneTowerPalette {
  return {
    stone:     new THREE.MeshStandardMaterial({ color: '#9aa0a8' }),
    shingle:   new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf:      new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark:      new THREE.MeshStandardMaterial({ color: '#4a3520' }),
    moonstone: new THREE.MeshStandardMaterial({ color: '#d8e8f0' }),
  };
}

describe('buildTowerBase', () => {
  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildTowerBase(2, 0.6, 42, makePalette());
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildTowerBase(2, 0.6, 42, makePalette());
    const g2 = buildTowerBase(2, 0.6, 42, makePalette());
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds still produce valid geometry (root/rock placement varies)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = buildTowerBase(2, 0.6, seed, makePalette());
      expect(hasNaN(g)).toBe(false);
    }
  });
});

describe('buildTowerWallRing', () => {
  it('produces valid, non-NaN geometry with a window', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('produces valid, non-NaN geometry without a window', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('a windowed ring has more geometry than a plain one at the same seed', () => {
    const withWindow = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    const plain = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    expect(countVerts(withWindow)).toBeGreaterThan(countVerts(plain));
  });

  it('is deterministic for the same seed/hasWindow', () => {
    const g1 = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    const g2 = buildTowerWallRing(2, 2.9, 42, makePalette(), true);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });
});
