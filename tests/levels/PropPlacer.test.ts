/**
 * PropPlacer.test.ts — PROC-B3g (placer)
 * decorateRoom produces valid placements per floor theme.
 */

import { describe, it, expect } from 'vitest';
import { decorateRoom, themeForFloor } from '@/levels/PropPlacer';
import * as THREE from 'three';

describe('themeForFloor', () => {
  it('basement (-1) = alchemy',    () => expect(themeForFloor(-1)).toBe('alchemy'));
  it('floor 0 = dungeon',          () => expect(themeForFloor(0)).toBe('dungeon'));
  it('floor 1 = library',          () => expect(themeForFloor(1)).toBe('library'));
  it('floor 2 = alchemy',          () => expect(themeForFloor(2)).toBe('alchemy'));
  it('floor 3 = observatory',      () => expect(themeForFloor(3)).toBe('observatory'));
  it('floor 4+ = dungeon',         () => expect(themeForFloor(5)).toBe('dungeon'));
});

describe('decorateRoom', () => {
  const BASE = { floorIndex: 0, halfWidth: 6, halfDepth: 5, seed: 0xDEAD };

  it('returns at most maxProps items', () => {
    const placed = decorateRoom({ ...BASE, maxProps: 4 });
    expect(placed.length).toBeLessThanOrEqual(4);
  });

  it('returns non-zero props for a normal room', () => {
    const placed = decorateRoom(BASE);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('same seed → identical placement count and positions', () => {
    const a = decorateRoom(BASE);
    const b = decorateRoom(BASE);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBeCloseTo(b[i].x, 4);
      expect(a[i].z).toBeCloseTo(b[i].z, 4);
    }
  });

  it('different seeds → different layouts', () => {
    const a = decorateRoom({ ...BASE, seed: 1 });
    const b = decorateRoom({ ...BASE, seed: 2 });
    const aPos = a.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join('|');
    const bPos = b.map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join('|');
    expect(aPos).not.toBe(bPos);
  });

  it('all built props have a THREE.Group root', () => {
    const placed = decorateRoom(BASE);
    for (const p of placed) {
      expect(p.built.root).toBeInstanceOf(THREE.Group);
    }
  });

  it('props are within room bounds', () => {
    const { halfWidth: hw, halfDepth: hd } = BASE;
    const placed = decorateRoom(BASE);
    for (const p of placed) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(hw);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(hd);
    }
  });

  it('no two props are placed at the same spot', () => {
    const placed = decorateRoom({ ...BASE, maxProps: 8 });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const dist = Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z);
        expect(dist).toBeGreaterThan(0.5);
      }
    }
  });

  it('library floor uses library theme props', () => {
    const placed = decorateRoom({ ...BASE, floorIndex: 1, maxProps: 10 });
    const kinds  = new Set(placed.map(p => p.built.dna.propKind));
    // Library theme includes bookshelf/table/chair — at least one should appear
    const libraryKinds = ['bookshelf', 'table', 'chair', 'lantern', 'rug'];
    const hasLibrary = [...kinds].some(k => libraryKinds.includes(k));
    expect(hasLibrary).toBe(true);
  });

  it('custom theme override is respected', () => {
    const placed = decorateRoom({ ...BASE, theme: 'residential', maxProps: 6 });
    // Residential theme props are a subset we can validate
    for (const p of placed) {
      expect(p.built.dna.theme).toBe('residential');
    }
  });
});
