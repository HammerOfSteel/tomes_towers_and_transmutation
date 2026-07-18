/**
 * speciesMapping.test.ts — NS7: All 21 princess-creator species map to a valid
 * game species via PRINCESS_SPECIES_MAP.
 */

import { describe, it, expect } from 'vitest';
import { PRINCESS_SPECIES_MAP } from '@/princess-creator/defaults/PrincessDefaults';
import { SPECIES_IDS } from '@/princess-creator/types';

const VALID_GAME_SPECIES = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'] as const;

describe('PRINCESS_SPECIES_MAP — all 21 species mapped', () => {
  it('has exactly 21 entries', () => {
    expect(Object.keys(PRINCESS_SPECIES_MAP).length).toBe(21);
  });

  it.each([...SPECIES_IDS])('%s maps to a valid game species', (species) => {
    const gameSpecies = PRINCESS_SPECIES_MAP[species];
    expect(gameSpecies, `${species} is missing from PRINCESS_SPECIES_MAP`).toBeTruthy();
    expect(VALID_GAME_SPECIES).toContain(gameSpecies);
  });

  it('all 4 core species are covered', () => {
    const values = Object.values(PRINCESS_SPECIES_MAP);
    for (const gs of ['human', 'undead', 'vulperia', 'slime'] as const) {
      expect(values, `${gs} has no mapped species`).toContain(gs);
    }
  });

  it('elf/celestial/draconic are covered (NS tier-1)', () => {
    const values = Object.values(PRINCESS_SPECIES_MAP);
    for (const gs of ['elf', 'celestial', 'draconic'] as const) {
      expect(values, `${gs} has no mapped species (NS tier-1 missing)`).toContain(gs);
    }
  });
});
