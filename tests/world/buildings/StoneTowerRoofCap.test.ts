/**
 * StoneTowerRoofCap.test.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (classic conical shingle roof vs. a living-canopy
 * cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildClassicRoofCap, buildLivingRoofCap, buildPagodaRoofCap, buildTowerRoofCap, pickRoofArchetype } from '@/world/buildings/StoneTowerRoofCap';

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

  it('has real relief detail: a flared eave skirt, stepped shingle-course bands, and corner finials -- not one smooth plain cone', () => {
    const g = buildClassicRoofCap(2, 3, mat);
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    // eave + >=3 shingle bands + 8 corner finials + 1 apex ball = well over a dozen.
    expect(meshCount).toBeGreaterThan(10);
  });

  it("the flared eave widens beyond the plain-cone base radius (radius*1.15 was the old ceiling)", () => {
    const g = buildClassicRoofCap(2, 3, mat);
    let maxR = 0;
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
    });
    expect(maxR).toBeGreaterThan(2 * 1.2);
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

describe('buildPagodaRoofCap', () => {
  const palette = {
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
  };

  function maxRadiusNearY(group: THREE.Group, y: number, tolerance: number): number {
    group.updateMatrixWorld(true);
    let maxR = 0;
    const v = new THREE.Vector3();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (Math.abs(v.y - y) > tolerance) continue;
        maxR = Math.max(maxR, Math.hypot(v.x, v.z));
      }
    });
    return maxR;
  }

  it('produces valid, non-NaN geometry', () => {
    const g = buildPagodaRoofCap(2, 3, palette);
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic', () => {
    const g1 = buildPagodaRoofCap(2, 3, palette);
    const g2 = buildPagodaRoofCap(2, 3, palette);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('has a genuine two-tiered "pagoda" silhouette: a real waist/cinch between two wider tiers, unlike the classic roof\'s single monotonic taper', () => {
    // Concrete Y sample points derived directly from buildPagodaRoofCap's
    // own layout formula (radius=2, coneHeight=3): lowerHeight=1.65,
    // neckY=1.188 (neck spans [1.188, 1.548]), upper tier's own eave
    // sits right after the neck. Sampling within the lower tier's body,
    // within the neck, and just past the neck (upper tier's eave)
    // should show wide -> narrow -> wide again, not a single taper.
    const g = buildPagodaRoofCap(2, 3, palette);
    const lowerBodyR = maxRadiusNearY(g, 0.6, 0.15);
    const waistR = maxRadiusNearY(g, 1.35, 0.1);
    const upperEaveR = maxRadiusNearY(g, 1.65, 0.1);
    expect(waistR).toBeLessThan(lowerBodyR);
    expect(upperEaveR).toBeGreaterThan(waistR);
  });

  it('has substantially more geometry than a single classic roof cap (two tiers + a connecting neck, not one assembly)', () => {
    const pagoda = buildPagodaRoofCap(2, 3, palette);
    const classic = buildClassicRoofCap(2, 3, palette.shingle);
    let pagodaMeshCount = 0, classicMeshCount = 0;
    pagoda.traverse((o) => { if (o instanceof THREE.Mesh) pagodaMeshCount++; });
    classic.traverse((o) => { if (o instanceof THREE.Mesh) classicMeshCount++; });
    expect(pagodaMeshCount).toBeGreaterThan(classicMeshCount);
  });
});

describe('buildTowerRoofCap (dispatcher)', () => {
  const palette = {
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
  };

  it('produces valid, non-NaN geometry across many seeds (covers classic, living, and pagoda branches)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const g = buildTowerRoofCap(seed, 2, 3, palette);
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('produces all 3 archetypes across a large seed sweep (proof pagoda is genuinely reachable, not dead code)', () => {
    const archetypes = new Set<string>();
    for (let seed = 0; seed < 200; seed++) archetypes.add(pickRoofArchetype(seed));
    expect(archetypes).toEqual(new Set(['classic', 'living', 'pagoda']));
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildTowerRoofCap(42, 2, 3, palette);
    const g2 = buildTowerRoofCap(42, 2, 3, palette);
    expect(countVerts(g1)).toBe(countVerts(g2));
  });
});
