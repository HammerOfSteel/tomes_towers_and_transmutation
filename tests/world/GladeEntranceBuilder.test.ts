/**
 * GladeEntranceBuilder.test.ts — 02-game-world-integration (CG-2)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildGladeEntrance, isNearGladeEntrance,
  GLADE_ENTRANCE_TRIGGER_RADIUS, GLADE_MUSHROOM_COUNT, GLADE_PARTICLE_COUNT,
} from '@/world/GladeEntranceBuilder';

describe('buildGladeEntrance', () => {
  it('builds a valid entrance group with pillars, mushrooms, shaft, and particles', () => {
    const built = buildGladeEntrance();
    expect(built.root).toBeInstanceOf(THREE.Group);
    // 2 pillars + shaft + GLADE_MUSHROOM_COUNT mushrooms + particles = 4 + count
    expect(built.root.children.length).toBe(3 + GLADE_MUSHROOM_COUNT + 1);
    expect(built.particles).toBeInstanceOf(THREE.Points);
    expect(() => built.dispose()).not.toThrow();
  });

  it('has the expected number of particles', () => {
    const built = buildGladeEntrance();
    const posAttr = built.particles.geometry.getAttribute('position');
    expect(posAttr.count).toBe(GLADE_PARTICLE_COUNT);
    built.dispose();
  });

  it('advances particle animation without throwing', () => {
    const built = buildGladeEntrance();
    expect(() => built.update(0.016)).not.toThrow();
    expect(() => built.update(1)).not.toThrow();
    built.dispose();
  });

  it('wraps particles back to the bottom once they drift past the top', () => {
    const built = buildGladeEntrance();
    const posAttr = built.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) posAttr.setY(i, 2.5);
    posAttr.needsUpdate = true;
    built.update(0.016);
    for (let i = 0; i < posAttr.count; i++) {
      expect(posAttr.getY(i)).toBeLessThanOrEqual(2.4);
    }
    built.dispose();
  });
});

describe('isNearGladeEntrance', () => {
  it('is true within the default trigger radius', () => {
    expect(isNearGladeEntrance({ x: 1, z: 0 }, { x: 0, z: 0 })).toBe(true);
    expect(isNearGladeEntrance({ x: 0, z: GLADE_ENTRANCE_TRIGGER_RADIUS }, { x: 0, z: 0 })).toBe(true);
  });

  it('is false outside the trigger radius', () => {
    expect(isNearGladeEntrance({ x: 100, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });

  it('respects a custom radius', () => {
    expect(isNearGladeEntrance({ x: 5, z: 0 }, { x: 0, z: 0 }, 10)).toBe(true);
    expect(isNearGladeEntrance({ x: 5, z: 0 }, { x: 0, z: 0 }, 1)).toBe(false);
  });
});
