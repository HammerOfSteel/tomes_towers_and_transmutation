/**
 * defaults.test.ts — PC6: Verify all 4 base princess DNA templates are valid
 * and produce a non-throwing PrincessInstance at targetHeight 1.6.
 *
 * These tests run in jsdom so THREE.js geometry works.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PRINCESSES, PRINCESS_SPECIES_MAP } from '@/princess-creator/defaults/PrincessDefaults';
import { sanitizeDna } from '@/princess-creator/dna';
import { buildPrincess } from '@/princess-creator/factory';

describe('PrincessDefaults — base templates', () => {
  it('exports exactly 4 default princesses', () => {
    expect(DEFAULT_PRINCESSES.length).toBe(4);
  });

  it('all defaults have unique names', () => {
    const names = DEFAULT_PRINCESSES.map(d => d.name);
    const unique = new Set(names);
    expect(unique.size).toBe(4);
  });

  it.each(DEFAULT_PRINCESSES.map(d => [d.name, d] as const))(
    '%s: sanitizeDna returns a valid DNA object', (_, dna) => {
      const clean = sanitizeDna(dna);
      expect(clean).toBeTruthy();
      expect(clean.v).toBe(2);
      expect(typeof clean.species).toBe('string');
    }
  );

  it.each(DEFAULT_PRINCESSES.map(d => [d.name, d] as const))(
    '%s: buildPrincess returns an instance with root and update', (_, dna) => {
      expect(() => {
        const inst = buildPrincess(dna, { targetHeight: 1.6 });
        expect(inst.root).toBeTruthy();
        expect(typeof inst.update).toBe('function');
        expect(typeof inst.dispose).toBe('function');
        inst.dispose();
      }).not.toThrow();
    }
  );

  it.each(DEFAULT_PRINCESSES.map(d => [d.name, d] as const))(
    '%s: targetHeight 1.6 produces height in range [1.3, 2.0] WU', (_, dna) => {
      const inst = buildPrincess(dna, { targetHeight: 1.6 });
      const box  = new THREE.Box3().setFromObject(inst.root);
      const h    = box.max.y - box.min.y;
      expect(h).toBeGreaterThan(1.3);
      expect(h).toBeLessThan(2.0);
      inst.dispose();
    }
  );
});

describe('PRINCESS_SPECIES_MAP — all 21 species have a mapping', () => {
  const EXPECTED_SPECIES = [
    'human', 'elf', 'high_elf', 'pixie', 'fae', 'undead', 'celestial',
    'draconic', 'gnome', 'goblin', 'foxling', 'ignis', 'specter',
    'naiad', 'moonborn', 'verdant', 'lamia', 'orc', 'troll', 'slime', 'skeleton',
  ] as const;

  it.each(EXPECTED_SPECIES)('%s maps to a valid game species', (species) => {
    const gameSpecies = PRINCESS_SPECIES_MAP[species];
    expect(gameSpecies, `${species} missing from PRINCESS_SPECIES_MAP`).toBeTruthy();
    expect(['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'])
      .toContain(gameSpecies);
  });

  it('has 21 mappings total', () => {
    expect(Object.keys(PRINCESS_SPECIES_MAP).length).toBe(21);
  });
});
