/**
 * BuildingBuilder.test.ts — PROC-C tests
 * All 9 building kinds build without error, correct bounds.
 */

import { describe, it, expect } from 'vitest';
import { buildBuilding } from '@/world/buildings/BuildingBuilder';
import type { BuildingDNA, BuildingKind, BuildingSize, BuildingStyle } from '@/world/buildings/BuildingDNA';
import { STYLE_COLORS, SIZE_FOOTPRINT, FLOOR_HEIGHT } from '@/world/buildings/BuildingDNA';
import * as THREE from 'three';

const ALL_KINDS: BuildingKind[] = [
  'house', 'shop', 'inn', 'guild',
  'terraced', 'cottage', 'villa', 'tavern',
  'blacksmith', 'apothecary', 'watchtower',
  'chapel', 'tent', 'market_stall',
  'ruin', 'well', 'barn',
];
const ALL_STYLES: BuildingStyle[] = ['thatched', 'stone', 'timber', 'arcane'];
const ALL_SIZES: BuildingSize[] = ['tiny', 'small', 'medium', 'large'];

function makeDna(kind: BuildingKind, overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed: 99,
    buildingKind: kind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['thatched'], rotation: 0,
    terrace: 'none', features: [],
    ...overrides,
  };
}

describe('BuildingBuilder — all 7 kinds', () => {
  for (const kind of ALL_KINDS) {
    it(`builds ${kind} without throwing`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
      expect(inst.dna.buildingKind).toBe(kind);
      expect(typeof inst.dispose).toBe('function');
    });

    it(`${kind}: exteriorGroup has children`, () => {
      const inst = buildBuilding(makeDna(kind));
      expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    });

    it(`${kind}: bounds have positive extents`, () => {
      const { bounds } = buildBuilding(makeDna(kind));
      expect(bounds.halfWidth).toBeGreaterThan(0);
      expect(bounds.halfDepth).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  }
});

describe('BuildingBuilder — styles', () => {
  for (const style of ALL_STYLES) {
    it(`${style} style builds without throwing`, () => {
      expect(() => buildBuilding(makeDna('house', { style, colors: STYLE_COLORS[style] }))).not.toThrow();
    });
  }
});

describe('BuildingBuilder — sizes', () => {
  for (const size of ALL_SIZES) {
    it(`${size} size produces correct footprint`, () => {
      const inst = buildBuilding(makeDna('house', { size }));
      const fp   = SIZE_FOOTPRINT[size];
      expect(inst.bounds.halfWidth).toBeCloseTo(fp.w / 2, 1);
      expect(inst.bounds.halfDepth).toBeCloseTo(fp.d / 2, 1);
    });
  }
});

describe('BuildingBuilder — floors', () => {
  it('2-floor building is taller than 1-floor', () => {
    const one = buildBuilding(makeDna('house', { floors: 1 }));
    const two = buildBuilding(makeDna('house', { floors: 2 }));
    expect(two.bounds.height).toBeGreaterThan(one.bounds.height);
  });

  it('height scales with FLOOR_HEIGHT', () => {
    const inst = buildBuilding(makeDna('house', { floors: 2 }));
    expect(inst.bounds.height).toBeGreaterThanOrEqual(FLOOR_HEIGHT * 2);
  });
});

describe('BuildingBuilder — conditions', () => {
  it('ruined house builds without throwing', () => {
    expect(() => buildBuilding(makeDna('house', { condition: 'ruined' }))).not.toThrow();
  });

  it('pristine inn builds without throwing', () => {
    expect(() => buildBuilding(makeDna('inn', { condition: 'pristine' }))).not.toThrow();
  });
});

describe('BuildingBuilder — userData', () => {
  it('root userData contains buildingKind', () => {
    const inst = buildBuilding(makeDna('shop'));
    expect(inst.exteriorGroup.userData['buildingKind']).toBe('shop');
  });

  it('rotation is applied to group', () => {
    const inst = buildBuilding(makeDna('house', { rotation: Math.PI / 2 }));
    expect(inst.exteriorGroup.rotation.y).toBeCloseTo(Math.PI / 2, 4);
  });
});

describe('BuildingBuilder — determinism', () => {
  it('same seed → identical child count', () => {
    const a = buildBuilding(makeDna('house', { seed: 42 }));
    const b = buildBuilding(makeDna('house', { seed: 42 }));
    expect(a.exteriorGroup.children.length).toBe(b.exteriorGroup.children.length);
  });

  it('different seeds → potentially different child counts', () => {
    const a = buildBuilding(makeDna('house', { seed: 1 }));
    const b = buildBuilding(makeDna('house', { seed: 999 }));
    // Both should succeed — outcomes may vary
    expect(a.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(b.exteriorGroup).toBeInstanceOf(THREE.Group);
  });
});
