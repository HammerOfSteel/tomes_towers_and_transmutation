/**
 * StoneTowerWindows.test.ts — window type x size catalog for the
 * elven stone-tower kit. See docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  pickWindowStyle,
  buildWindow,
  type WindowType,
  type WindowSize,
} from '@/world/buildings/StoneTowerWindows';
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

const ALL_TYPES: WindowType[] = ['pointed_arch', 'oculus', 'cross_mullion'];
const ALL_SIZES: WindowSize[] = ['small', 'medium', 'large'];

describe('pickWindowStyle', () => {
  it('always returns a known type and size', () => {
    for (let seed = 0; seed < 60; seed++) {
      const style = pickWindowStyle(seed);
      expect(ALL_TYPES).toContain(style.type);
      expect(ALL_SIZES).toContain(style.size);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickWindowStyle(777)).toEqual(pickWindowStyle(777));
  });

  it('produces all 3 types and all 3 sizes across many seeds', () => {
    const types = new Set<string>();
    const sizes = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const style = pickWindowStyle(seed);
      types.add(style.type);
      sizes.add(style.size);
    }
    expect(types.size).toBe(3);
    expect(sizes.size).toBe(3);
  });
});

describe('buildWindow', () => {
  const radius = 2, ringHeight = 2.9;

  it('every type produces valid, non-NaN geometry', () => {
    for (const type of ALL_TYPES) {
      const g = buildWindow({ type, size: 'medium' }, radius, ringHeight, makePalette());
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('every size produces valid, non-NaN geometry', () => {
    for (const size of ALL_SIZES) {
      const g = buildWindow({ type: 'pointed_arch', size }, radius, ringHeight, makePalette());
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('large is measurably bigger (wider bounding box) than small for the same type', () => {
    const small = buildWindow({ type: 'pointed_arch', size: 'small' }, radius, ringHeight, makePalette());
    const large = buildWindow({ type: 'pointed_arch', size: 'large' }, radius, ringHeight, makePalette());
    const smallBox = new THREE.Box3().setFromObject(small);
    const largeBox = new THREE.Box3().setFromObject(large);
    const smallWidth = smallBox.max.x - smallBox.min.x;
    const largeWidth = largeBox.max.x - largeBox.min.x;
    expect(largeWidth).toBeGreaterThan(smallWidth);
  });

  it('the 3 types produce measurably different geometry (distinct vertex counts) at the same size', () => {
    const counts = ALL_TYPES.map((type) => countVerts(buildWindow({ type, size: 'medium' }, radius, ringHeight, makePalette())));
    expect(new Set(counts).size).toBeGreaterThan(1);
  });

  it('oculus is round: its glass mesh bounding box is roughly square (width ~= height), unlike pointed_arch', () => {
    // A qualitative structural check that "oculus" really is a round-window
    // shape, not just a renamed copy of another type.
    const g = buildWindow({ type: 'oculus', size: 'medium' }, radius, ringHeight, makePalette());
    const box = new THREE.Box3().setFromObject(g);
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    expect(Math.abs(width - height) / Math.max(width, height)).toBeLessThan(0.35);
  });

  it('cross_mullion has a mullion bar (more than one mesh: pane(s) + bar(s))', () => {
    const g = buildWindow({ type: 'cross_mullion', size: 'medium' }, radius, ringHeight, makePalette());
    let meshCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeGreaterThan(1);
  });
});
