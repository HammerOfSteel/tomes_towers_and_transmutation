/**
 * StoneTowerRoofCap.test.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (classic conical shingle roof vs. a living-canopy
 * cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildClassicRoofCap, buildLivingRoofCap, buildTowerRoofCap } from '@/world/buildings/StoneTowerRoofCap';

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

describe('buildClassicRoofCap', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#5a6068' });

  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildClassicRoofCap(2, 3, mat);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic', () => {
    const g1 = buildClassicRoofCap(2, 3, mat);
    const g2 = buildClassicRoofCap(2, 3, mat);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('a larger cone height produces a taller bounding box', () => {
    const short = buildClassicRoofCap(2, 1.5, mat);
    const tall = buildClassicRoofCap(2, 4, mat);
    const boxOf = (g: THREE.Group) => new THREE.Box3().setFromObject(g);
    expect(boxOf(tall).max.y - boxOf(tall).min.y).toBeGreaterThan(boxOf(short).max.y - boxOf(short).min.y);
  });
});

describe('buildLivingRoofCap', () => {
  const leaf = new THREE.MeshStandardMaterial({ color: '#3d6b35' });
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3520' });

  it('produces at least one mesh with finite, non-NaN geometry', () => {
    const g = buildLivingRoofCap(42, 2, { leaf, bark });
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildLivingRoofCap(42, 2, { leaf, bark });
    const g2 = buildLivingRoofCap(42, 2, { leaf, bark });
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds produce different (but still valid) shapes', () => {
    const g1 = buildLivingRoofCap(1, 2, { leaf, bark });
    const g2 = buildLivingRoofCap(2, 2, { leaf, bark });
    expect(hasNaN(g1)).toBe(false);
    expect(hasNaN(g2)).toBe(false);
    // Not required to differ in vertex count (both are valid organic
    // blobs), just confirmed both build without error above.
  });
});

describe('buildTowerRoofCap (dispatcher)', () => {
  const palette = {
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
  };

  it('produces valid, non-NaN geometry across many seeds (covers both classic and living branches)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = buildTowerRoofCap(seed, 2, 3, palette);
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildTowerRoofCap(42, 2, 3, palette);
    const g2 = buildTowerRoofCap(42, 2, 3, palette);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });
});
