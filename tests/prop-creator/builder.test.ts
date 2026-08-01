/**
 * builder.test.ts — PROC-B3g (builder)
 * buildProp builds all 12 archetypes without throwing.
 */

import { describe, it, expect } from 'vitest';
import { buildProp } from '@/prop-creator/builder';
import type { PropDNA, PropKind, PropMaterial } from '@/prop-creator/types';
import { MATERIAL_COLORS, KIND_DEFAULT_MATERIAL, KIND_SOLID } from '@/prop-creator/types';
import * as THREE from 'three';

const ALL_KINDS: PropKind[] = [
  'chest', 'bookshelf', 'table', 'chair', 'cauldron', 'lantern',
  'pillar', 'rug', 'door', 'statue', 'barrel', 'crate',
];
const ALL_MATERIALS: PropMaterial[] = ['stone', 'wood', 'bone', 'crystal', 'iron', 'clay'];

function makeDna(kind: PropKind, material: PropMaterial = 'wood', overrides: Partial<PropDNA> = {}): PropDNA {
  return {
    v: 1, kind: 'prop', name: `${material} ${kind}`, seed: 42,
    propKind: kind, material, theme: 'dungeon', condition: 'weathered',
    size: 1, colors: MATERIAL_COLORS[material], interactive: false,
    glow: false, glowIntensity: 0,
    ...overrides,
  };
}

describe('buildProp — all 12 archetypes', () => {
  for (const propKind of ALL_KINDS) {
    it(`builds ${propKind} without throwing`, () => {
      const dna   = makeDna(propKind);
      const built = buildProp(dna);
      expect(built.root).toBeInstanceOf(THREE.Group);
      expect(built.dna).toBe(dna);
      expect(typeof built.dispose).toBe('function');
    });

    it(`${propKind}: root has children`, () => {
      const built = buildProp(makeDna(propKind));
      expect(built.root.children.length).toBeGreaterThan(0);
    });

    it(`${propKind}: collision halfExtents are positive`, () => {
      const built = buildProp(makeDna(propKind));
      const he    = built.collision.halfExtents;
      expect(he.x).toBeGreaterThan(0);
      expect(he.y).toBeGreaterThan(0);
      expect(he.z).toBeGreaterThan(0);
    });

    it(`${propKind}: solid matches KIND_SOLID table`, () => {
      const built = buildProp(makeDna(propKind));
      expect(built.collision.solid).toBe(KIND_SOLID[propKind]);
    });
  }

  it('lantern with glow=true has a PointLight', () => {
    const built = buildProp(makeDna('lantern', 'iron', { glow: true, colors: { ...MATERIAL_COLORS['iron'], glow: '#ffaa40' } }));
    expect(built.light).toBeInstanceOf(THREE.PointLight);
  });

  it('cauldron with glow=true has a PointLight', () => {
    const built = buildProp(makeDna('cauldron', 'iron', { glow: true, colors: { ...MATERIAL_COLORS['iron'], glow: '#40ff80' } }));
    expect(built.light).toBeInstanceOf(THREE.PointLight);
  });

  it('non-glowing prop has light = null', () => {
    const built = buildProp(makeDna('chest', 'wood', { glow: false }));
    expect(built.light).toBeNull();
  });

  it('interactive chest has interactRadius on collision', () => {
    const built = buildProp(makeDna('chest', 'wood', { interactive: true }));
    expect(built.collision.interactRadius).toBeGreaterThan(0);
  });

  it('size scaling is applied to root', () => {
    const built = buildProp(makeDna('barrel', 'wood', { size: 2 }));
    expect(built.root.scale.x).toBeCloseTo(2);
  });

  it('all materials produce valid colors', () => {
    for (const mat of ALL_MATERIALS) {
      expect(() => buildProp(makeDna('crate', mat))).not.toThrow();
    }
  });

  it('userData contains propKind and propDna', () => {
    const dna   = makeDna('pillar', 'stone');
    const built = buildProp(dna);
    expect(built.root.userData['propKind']).toBe('pillar');
    expect(built.root.userData['propDna']).toBe(dna);
  });
});

describe('buildProp — conditions', () => {
  it('ruined condition applies without throwing', () => {
    expect(() => buildProp(makeDna('table', 'wood', { condition: 'ruined' }))).not.toThrow();
  });

  it('pristine condition applies without throwing', () => {
    expect(() => buildProp(makeDna('statue', 'stone', { condition: 'pristine' }))).not.toThrow();
  });
});
