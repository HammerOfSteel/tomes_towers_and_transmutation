/**
 * NPCEntity-toNpcDna.test.ts
 * Verifies the old-NPCRole → new-NpcRole/GameSpecies bridge used to build
 * new-system NpcDNA from the old NPCEntity constructor's inputs.
 */

import { describe, it, expect } from 'vitest';
import { toNpcDna } from '@/world/NPCEntity';
import type { NPCRole } from '@/world/NPCDnaGenerator';

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

describe('toNpcDna', () => {
  it('maps every old NPCRole to a valid new NpcRole', () => {
    for (const oldRole of ALL_OLD_ROLES) {
      const dna = toNpcDna(1, 2, 12345, oldRole);
      expect(dna.role).toBe(EXPECTED_ROLE_MAP[oldRole]);
    }
  });

  it('picks a species from the flavor-preserving replacement pool', () => {
    const validSpecies = new Set(['human', 'elf', 'vulperia', 'draconic', 'slime', 'celestial']);
    for (let col = 0; col < 20; col++) {
      const dna = toNpcDna(col, 0, 999, 'citizen');
      expect(validSpecies.has(dna.species)).toBe(true);
    }
  });

  it('same col/row/seed/role produces identical DNA (deterministic)', () => {
    const a = toNpcDna(3, 4, 555, 'merchant');
    const b = toNpcDna(3, 4, 555, 'merchant');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different col/row produces different species/color mix across a settlement', () => {
    const seen = new Set<string>();
    for (let col = 0; col < 30; col++) {
      const dna = toNpcDna(col, 7, 111, 'citizen');
      seen.add(`${dna.species}:${dna.colors.primary}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
