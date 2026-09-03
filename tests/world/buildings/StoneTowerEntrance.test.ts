/**
 * StoneTowerEntrance.test.ts — ground-floor archway entrance for the
 * elven stone-tower kit. See docs/superpowers/specs/
 * 2026-09-03-elven-stone-tower-features-design.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  pickEntranceStyle,
  buildEntrance,
  type EntranceStyle,
} from '@/world/buildings/StoneTowerEntrance';
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

const ALL_STYLES: EntranceStyle[] = ['plain_arch', 'flanked_pillars'];

describe('pickEntranceStyle', () => {
  it('always returns a known style', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(ALL_STYLES).toContain(pickEntranceStyle(seed));
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickEntranceStyle(555)).toBe(pickEntranceStyle(555));
  });

  it('produces both styles across many seeds', () => {
    const styles = new Set<string>();
    for (let seed = 0; seed < 100; seed++) styles.add(pickEntranceStyle(seed));
    expect(styles.size).toBe(2);
  });
});

describe('buildEntrance', () => {
  const radius = 2.4; // matches buildTowerBase's plinth radius (radius * 1.2)

  it('every style produces valid, non-NaN geometry', () => {
    for (const style of ALL_STYLES) {
      const g = buildEntrance(style, radius, 42, makePalette());
      expect(countVerts(g)).toBeGreaterThan(0);
      expect(hasNaN(g)).toBe(false);
    }
  });

  it('is deterministic for the same style/seed', () => {
    const g1 = buildEntrance('plain_arch', radius, 42, makePalette());
    const g2 = buildEntrance('plain_arch', radius, 42, makePalette());
    expect(countVerts(g1)).toBe(countVerts(g2));
  });

  it('flanked_pillars has more geometry than plain_arch at the same seed (the 2 extra pillars)', () => {
    const plain = buildEntrance('plain_arch', radius, 42, makePalette());
    const flanked = buildEntrance('flanked_pillars', radius, 42, makePalette());
    expect(countVerts(flanked)).toBeGreaterThan(countVerts(plain));
  });
});
