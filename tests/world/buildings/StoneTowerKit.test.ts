/**
 * StoneTowerKit.test.ts — the top-level elven stone-tower kit POC
 * assembly (base + wall rings + roof cap). See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTowerBase, buildTowerWallRing, buildElvenStoneTower, pickWallProp, type StoneTowerPalette } from '@/world/buildings/StoneTowerKit';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

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

describe('pickWallProp', () => {
  const ALL_PROPS = ['none', 'vine', 'moss_patch', 'banner'];

  it('always returns a known prop outcome', () => {
    for (let seed = 0; seed < 60; seed++) {
      expect(ALL_PROPS).toContain(pickWallProp(seed));
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickWallProp(321)).toBe(pickWallProp(321));
  });

  it('produces all 4 outcomes across many seeds, roughly matching the documented weights', () => {
    const counts: Record<string, number> = { none: 0, vine: 0, moss_patch: 0, banner: 0 };
    const N = 2000;
    for (let seed = 0; seed < N; seed++) counts[pickWallProp(seed)]!++;
    for (const key of ALL_PROPS) expect(counts[key]).toBeGreaterThan(0);
    // Generous bands (documented weights: none 35%, vine 35%, moss 15%, banner 15%).
    expect(counts.none! / N).toBeGreaterThan(0.2);
    expect(counts.none! / N).toBeLessThan(0.5);
    expect(counts.vine! / N).toBeGreaterThan(0.2);
    expect(counts.vine! / N).toBeLessThan(0.5);
    expect(counts.moss_patch! / N).toBeGreaterThan(0.05);
    expect(counts.moss_patch! / N).toBeLessThan(0.3);
    expect(counts.banner! / N).toBeGreaterThan(0.05);
    expect(counts.banner! / N).toBeLessThan(0.3);
  });
});

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

  it('omitting the new optional params (vertexScales/offset/rotation) leaves the group at local origin with zero rotation', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    expect(g.position.x).toBe(0);
    expect(g.position.z).toBe(0);
    expect(g.rotation.y).toBe(0);
  });

  it('offsetX/offsetZ move the returned group to that local position', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), false, undefined, 0.3, -0.5, 0);
    expect(g.position.x).toBeCloseTo(0.3, 9);
    expect(g.position.z).toBeCloseTo(-0.5, 9);
  });

  it('rotationOffset rotates the returned group about Y', () => {
    const g = buildTowerWallRing(2, 2.9, 42, makePalette(), false, undefined, 0, 0, 0.4);
    expect(g.rotation.y).toBeCloseTo(0.4, 9);
  });

  it('vertexScales perturbs the wall geometry (measurably different bounding radius vs. an unscaled ring)', () => {
    function maxRadialExtent(group: THREE.Group): number {
      let maxR = 0;
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)));
          }
        }
      });
      return maxR;
    }
    const base = buildTowerWallRing(2, 2.9, 42, makePalette(), false);
    const scaled = buildTowerWallRing(2, 2.9, 42, makePalette(), false, [1, 1, 1.3, 1, 1, 1, 1, 1]);
    expect(maxRadialExtent(scaled)).toBeGreaterThan(maxRadialExtent(base));
  });

  it('a seed sweep produces more than 2 distinct mesh counts (proof the prop catalog -- vine/moss/banner/none -- actually varies, not just vine-or-nothing as before)', () => {
    const meshCounts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const g = buildTowerWallRing(2, 2.9, seed, makePalette(), false);
      let meshCount = 0;
      g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
      meshCounts.add(meshCount);
    }
    expect(meshCounts.size).toBeGreaterThan(2);
  });
});

function makeTowerDna(kind: 'watchtower' | 'tower', overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 99,
    buildingKind: kind, size: 'medium', floors: 1,
    style: 'stone', condition: 'weathered',
    hasInterior: false, interiorLayout: 'single_room',
    colors: STYLE_COLORS['stone'], rotation: 0,
    terrace: 'none', features: [], faction: 'elven',
    ...overrides,
  };
}

describe('buildElvenStoneTower', () => {
  it('produces valid, non-NaN geometry for the watchtower kind', () => {
    const g = buildElvenStoneTower(makeTowerDna('watchtower'));
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('produces valid, non-NaN geometry for the tower kind, across all sizes', () => {
    for (const size of ['tiny', 'small', 'medium', 'large'] as const) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { size }));
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildElvenStoneTower(makeTowerDna('tower', { seed: 42 }));
    const g2 = buildElvenStoneTower(makeTowerDna('tower', { seed: 42 }));
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('different seeds produce valid towers of varying height (floor count varies)', () => {
    const heights: number[] = [];
    for (let seed = 0; seed < 15; seed++) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { seed }));
      const box = new THREE.Box3().setFromObject(g);
      heights.push(box.max.y - box.min.y);
      expect(hasNaN(g)).toBe(false);
    }
    // At least two distinct heights across 15 seeds -- proves floor
    // count actually varies, not fixed.
    expect(new Set(heights.map((h) => Math.round(h * 10))).size).toBeGreaterThan(1);
  });

  it('produces a reasonable tower silhouette: taller than it is wide', () => {
    const g = buildElvenStoneTower(makeTowerDna('tower', { seed: 7, size: 'medium' }));
    const box = new THREE.Box3().setFromObject(g);
    const height = box.max.y - box.min.y;
    const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    expect(height).toBeGreaterThan(width);
  });

  it('is deterministic for the same seed (silhouette-profile variety does not break reproducibility)', () => {
    const g1 = buildElvenStoneTower(makeTowerDna('tower', { seed: 314 }));
    const g2 = buildElvenStoneTower(makeTowerDna('tower', { seed: 314 }));
    const box1 = new THREE.Box3().setFromObject(g1);
    const box2 = new THREE.Box3().setFromObject(g2);
    expect(countVerts(g1)).toBe(countVerts(g2));
    expect(box1.min.toArray()).toEqual(box2.min.toArray());
    expect(box1.max.toArray()).toEqual(box2.max.toArray());
  });

  it("different seeds produce measurably different floor-ring shapes/positions (the actual fix for 'towers only vary by height/roof')", () => {
    // Extract floor 0's ring group (children: [0]=base, [1..floors]=rings, [last]=roof)
    // and compare its world-space bounding box across several seeds --
    // proves the per-floor silhouette/jitter actually reaches the built
    // geometry, not just internal math that never gets used.
    const boxSignatures = new Set<string>();
    for (let seed = 0; seed < 8; seed++) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { seed }));
      const floorRing = g.children[1]!;
      const box = new THREE.Box3().setFromObject(floorRing);
      boxSignatures.add(JSON.stringify([box.min.toArray().map(n => +n.toFixed(4)), box.max.toArray().map(n => +n.toFixed(4))]));
    }
    // Overwhelmingly unlikely all 8 seeds coincidentally produce an
    // identical floor-0 ring bounding box unless variety isn't wired in.
    expect(boxSignatures.size).toBeGreaterThan(1);
  });

  it('every silhouette profile produces valid, non-NaN geometry across the realistic floor-count range', () => {
    // pickSilhouetteProfile is seed-driven and not directly overridable
    // here, so sweep enough seeds to exercise all 4 profiles at least
    // once (StoneTowerSilhouette.test.ts already proves the seed space
    // covers all 4 within far fewer than 100 draws).
    for (let seed = 0; seed < 100; seed++) {
      const g = buildElvenStoneTower(makeTowerDna('tower', { seed }));
      expect(hasNaN(g)).toBe(false);
    }
  });
});
