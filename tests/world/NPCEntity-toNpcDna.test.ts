/**
 * NPCEntity-toNpcDna.test.ts
 * Verifies the old-NPCRole → new-NpcRole/GameSpecies bridge used to build
 * new-system NpcDNA from the old NPCEntity constructor's inputs.
 */

import { describe, it, expect } from 'vitest';
import { toNpcDna } from '@/world/NPCEntity';
import type { NPCRole } from '@/world/NPCDnaGenerator';
import type { SettlementFaction } from '@/overworld-studio';
import { FACTION_TO_SPECIES } from '@/world/SettlementPopulator';

const ALL_OLD_ROLES: NPCRole[] = [
  'merchant', 'guard', 'citizen', 'scholar', 'innkeeper',
  'blacksmith', 'quest_giver', 'settlement_elder', 'mysterious',
];

const EXPECTED_ROLE_MAP: Record<NPCRole, string> = {
  merchant:         'merchant',
  guard:            'guard',
  citizen:          'citizen',
  scholar:          'scholar',
  innkeeper:        'innkeeper',
  blacksmith:       'merchant',
  quest_giver:      'quest_giver',
  settlement_elder: 'elder',
  mysterious:       'mysterious',
};

const ALL_FACTIONS: SettlementFaction[] = [
  'human', 'elven', 'dwarven', 'orcish', 'vampire', 'undead', 'vulperia', 'slime', 'fae',
];

describe('toNpcDna', () => {
  it('maps every old NPCRole to a valid new NpcRole', () => {
    for (const oldRole of ALL_OLD_ROLES) {
      const dna = toNpcDna(1, 2, 12345, oldRole, 'human');
      expect(dna.role).toBe(EXPECTED_ROLE_MAP[oldRole]);
    }
  });

  it('always produces the settlement faction\'s own species (race-exclusive population), never a random mix', () => {
    for (const faction of ALL_FACTIONS) {
      for (let col = 0; col < 20; col++) {
        const dna = toNpcDna(col, 0, 999, 'citizen', faction);
        expect(dna.species).toBe(FACTION_TO_SPECIES[faction]);
      }
    }
  });

  it('same col/row/seed/role/faction produces identical DNA (deterministic)', () => {
    const a = toNpcDna(3, 4, 555, 'merchant', 'elven');
    const b = toNpcDna(3, 4, 555, 'merchant', 'elven');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different col/row produces color variety across a settlement even though species stays fixed to the faction', () => {
    const seenColors = new Set<string>();
    const seenSpecies = new Set<string>();
    for (let col = 0; col < 30; col++) {
      const dna = toNpcDna(col, 7, 111, 'citizen', 'vulperia');
      seenColors.add(dna.colors.primary);
      seenSpecies.add(dna.species);
    }
    expect(seenColors.size).toBeGreaterThan(1);
    expect(seenSpecies).toEqual(new Set(['vulperia']));
  });

  it('two different factions in the same settlement-seed slot never share a species (race-exclusive, not just likely)', () => {
    // Regression guard for the reported bug: every race's settlement should
    // only ever be populated by its own species, never a random mix drawn
    // from a fixed global pool regardless of which faction owns the town.
    const humanSpecies  = toNpcDna(5, 5, 42, 'citizen', 'human').species;
    const vulperiaSpecies = toNpcDna(5, 5, 42, 'citizen', 'vulperia').species;
    expect(humanSpecies).not.toBe(vulperiaSpecies);
  });
});

