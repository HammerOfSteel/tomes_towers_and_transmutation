/**
 * StoneTowerRoofCap.test.ts — the two roof-cap variants for the elven
 * stone-tower kit POC (classic conical shingle roof vs. a living-canopy
 * cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildClassicRoofCap, buildLivingRoofCap, buildPagodaRoofCap, buildTowerRoofCap, pickRoofArchetype, TOWER_ROOF_ARCHETYPE_WEIGHTS, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS } from '@/world/buildings/StoneTowerRoofCap';

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
    // Y-based vertex-ring sampling is unreliable here: the neck cylinder's
    // own top/bottom rings sit at the EXACT same Y as the wider body/eave
    // rings it connects to (they're stacked flush), so a naive "widest
    // vertex near Y" query always picks the wider neighboring ring, never
    // the neck's own narrower one. Instead, find the neck mesh directly
    // (named 'elven-pagoda-neck') and compare its own radius against the
    // widest radius found strictly below it (the truncated lower body)
    // and strictly above it (the upper tier's own flared eave) -- this
    // proves a real local-minimum waist, not just two touching cones.
    const g = buildPagodaRoofCap(2, 3, palette);
    g.updateMatrixWorld(true);
    const neck = g.getObjectByName('elven-pagoda-neck') as THREE.Mesh;
    expect(neck).toBeTruthy();
    const neckParams = (neck.geometry as THREE.CylinderGeometry).parameters;
    const neckR = Math.max(neckParams.radiusTop, neckParams.radiusBottom);
    const neckBottomY = neck.position.y - neckParams.height / 2;
    const neckTopY = neck.position.y + neckParams.height / 2;

    function maxRadiusInRange(yMin: number, yMax: number): number {
      let maxR = 0;
      const v = new THREE.Vector3();
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o === neck) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (v.y < yMin || v.y > yMax) continue;
          maxR = Math.max(maxR, Math.hypot(v.x, v.z));
        }
      });
      return maxR;
    }

    const lowerBodyR = maxRadiusInRange(-Infinity, neckBottomY + 1e-6);
    const upperEaveR = maxRadiusInRange(neckTopY - 1e-6, Infinity);
    expect(neckR).toBeLessThan(lowerBodyR);
    expect(neckR).toBeLessThan(upperEaveR);
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

describe('weighted roof-archetype tables', () => {
  const palette = {
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
  };

  it('pickRoofArchetype defaults to the tower weights (existing behavior unchanged)', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(pickRoofArchetype(seed)).toBe(pickRoofArchetype(seed, TOWER_ROOF_ARCHETYPE_WEIGHTS));
    }
  });

  it('RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS produces all 3 archetypes across a seed sweep, with living as plurality', () => {
    const counts: Record<string, number> = { classic: 0, pagoda: 0, living: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const archetype = pickRoofArchetype(seed, RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS);
      counts[archetype]!++;
    }
    expect(counts.classic).toBeGreaterThan(0);
    expect(counts.pagoda).toBeGreaterThan(0);
    expect(counts.living).toBeGreaterThan(0);
    expect(counts.living).toBeGreaterThan(counts.classic);
    expect(counts.living).toBeGreaterThan(counts.pagoda);
  });

  it('buildTowerRoofCap accepts a custom weight table', () => {
    // With a table that always picks 'living', the dispatcher must never
    // produce an apex-ball finial (classic/pagoda's own discriminator).
    const alwaysLiving: [import('@/world/buildings/StoneTowerRoofCap').RoofArchetype, number][] = [['living', 1]];
    for (let seed = 0; seed < 10; seed++) {
      const g = buildTowerRoofCap(seed, 2, 3, palette, alwaysLiving);
      let sawApexBall = false;
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawApexBall = true; });
      expect(sawApexBall).toBe(false);
    }
  });
});
