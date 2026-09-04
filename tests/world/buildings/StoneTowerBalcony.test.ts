/**
 * StoneTowerBalcony.test.ts — optional top-floor projecting gallery
 * for the elven stone-tower kit. See docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shouldHaveBalcony, buildBalcony } from '@/world/buildings/StoneTowerBalcony';
import type { StoneTowerPalette } from '@/world/buildings/StoneTowerKit';

function makePalette(): StoneTowerPalette {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#9aa0a8' }),
    shingle: new THREE.MeshStandardMaterial({ color: '#5a6068' }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35' }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3520' }),
    moonstone: new THREE.MeshStandardMaterial({ color: '#d8e8f0' }),
  };
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

function countVerts(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => { if (o instanceof THREE.Mesh) n += o.geometry.attributes.position.count; });
  return n;
}

describe('shouldHaveBalcony', () => {
  it('is deterministic for the same seed', () => {
    expect(shouldHaveBalcony(123)).toBe(shouldHaveBalcony(123));
  });

  it('produces both true and false across many seeds (a real chance, not always-on/off)', () => {
    const results = new Set<boolean>();
    for (let seed = 0; seed < 200; seed++) results.add(shouldHaveBalcony(seed));
    expect(results.size).toBe(2);
  });

  it('is roughly the documented ~40% chance across a large seed sweep', () => {
    let trueCount = 0;
    const N = 1000;
    for (let seed = 0; seed < N; seed++) if (shouldHaveBalcony(seed)) trueCount++;
    const frac = trueCount / N;
    expect(frac).toBeGreaterThan(0.25);
    expect(frac).toBeLessThan(0.55);
  });
});

describe('buildBalcony', () => {
  const radius = 2;

  it('produces valid, non-NaN geometry with at least one mesh', () => {
    const g = buildBalcony(42, radius, makePalette());
    expect(countVerts(g)).toBeGreaterThan(0);
    expect(hasNaN(g)).toBe(false);
  });

  it('is deterministic for the same seed', () => {
    const g1 = buildBalcony(42, radius, makePalette());
    const g2 = buildBalcony(42, radius, makePalette());
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('projects outward: its bounding radius is measurably larger than the input radius', () => {
    const g = buildBalcony(42, radius, makePalette());
    const box = new THREE.Box3().setFromObject(g);
    const maxExtent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
    expect(maxExtent).toBeGreaterThan(radius);
  });

  it('has multiple distinct parts (corbels + deck + parapet, not a single primitive)', () => {
    const g = buildBalcony(42, radius, makePalette());
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThan(3); // several corbel brackets + deck + parapet
  });

  it('the parapet is a genuinely OPEN rib gallery (visible gaps between posts), not a solid drum -- a ray cast horizontally through the parapet band from outside must reach the tower centre through at least one gap', () => {
    const g = buildBalcony(42, radius, makePalette());
    g.updateMatrixWorld(true);
    // Only test rib/rail meshes (exclude corbels/deck, which legitimately
    // sit lower and would otherwise block every ray).
    const parapetMeshes: THREE.Mesh[] = [];
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.position.y > radius * 0.15) parapetMeshes.push(o);
    });
    expect(parapetMeshes.length).toBeGreaterThan(0);
    const railY = parapetMeshes.reduce((s, m) => s + m.position.y, 0) / parapetMeshes.length;

    const raycaster = new THREE.Raycaster();
    const deckRadius = radius * 1.35; // matches buildBalcony's own deckRadius formula
    let hitCount = 0;
    const rayCount = 64;
    for (let i = 0; i < rayCount; i++) {
      const ang = (i / rayCount) * Math.PI * 2;
      const origin = new THREE.Vector3(Math.sin(ang) * deckRadius * 3, railY, Math.cos(ang) * deckRadius * 3);
      const dir = new THREE.Vector3(-Math.sin(ang), 0, -Math.cos(ang));
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObjects(parapetMeshes, false);
      if (hits.length > 0) hitCount++;
    }
    // A solid drum would hit on every single ray; a genuinely open rib
    // gallery must have a substantial fraction of rays pass clean
    // through a gap between ribs.
    expect(hitCount).toBeLessThan(rayCount);
    expect(hitCount).toBeGreaterThan(0); // ribs must still exist and block SOME rays
  });
});
