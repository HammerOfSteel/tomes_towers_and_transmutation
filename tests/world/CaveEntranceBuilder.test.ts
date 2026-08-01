/**
 * CaveEntranceBuilder.test.ts — 02-game-world-integration (CG-1)
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildCaveEntrance, isNearCaveEntrance, CAVE_ENTRANCE_TRIGGER_RADIUS,
} from '@/world/CaveEntranceBuilder';
import type { CaveEntranceBiome } from '@/world/CaveGladePlacer';

const BIOMES: CaveEntranceBiome[] = ['crystal', 'lava', 'ice', 'fungal', 'ancient'];

describe('buildCaveEntrance', () => {
  for (const biome of BIOMES) {
    it(`builds a valid entrance group for biome=${biome}`, () => {
      const built = buildCaveEntrance(biome);
      expect(built.root).toBeInstanceOf(THREE.Group);
      expect(built.root.children.length).toBeGreaterThan(0);
      expect(built.root.userData['caveEntranceBiome']).toBe(biome);
      expect(() => built.dispose()).not.toThrow();
    });
  }

  it('produces the same structure for the same biome (deterministic)', () => {
    const a = buildCaveEntrance('crystal');
    const b = buildCaveEntrance('crystal');
    expect(a.root.children.length).toBe(b.root.children.length);
    a.dispose();
    b.dispose();
  });

  it('gives crystal and lava biomes an emissive accent material', () => {
    const built = buildCaveEntrance('lava');
    let foundEmissive = false;
    built.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.emissiveIntensity && mat.emissiveIntensity > 0) foundEmissive = true;
      }
    });
    expect(foundEmissive).toBe(true);
    built.dispose();
  });
});

describe('isNearCaveEntrance', () => {
  it('is true within the default trigger radius', () => {
    expect(isNearCaveEntrance({ x: 1, z: 0 }, { x: 0, z: 0 })).toBe(true);
    expect(isNearCaveEntrance({ x: 0, z: CAVE_ENTRANCE_TRIGGER_RADIUS }, { x: 0, z: 0 })).toBe(true);
  });

  it('is false outside the trigger radius', () => {
    expect(isNearCaveEntrance({ x: 100, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });

  it('respects a custom radius', () => {
    expect(isNearCaveEntrance({ x: 5, z: 0 }, { x: 0, z: 0 }, 10)).toBe(true);
    expect(isNearCaveEntrance({ x: 5, z: 0 }, { x: 0, z: 0 }, 1)).toBe(false);
  });
});
