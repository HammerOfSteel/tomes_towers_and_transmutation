/**
 * NpcDefaults.test.ts — PROC-B1j (part 1)
 * Default NPC blueprints: valid DNA for all 7 species.
 */

import { describe, it, expect } from 'vitest';
import { NPC_DEFAULTS, getDefaultNpcDna } from '@/npc-creator/defaults/NpcDefaults';
import type { NpcRole } from '@/npc-creator/types';
import { npcDnaToShareCode, shareCodeToNpcDna } from '@/npc-creator/gallery';

const ALL_ROLES: NpcRole[] = ['merchant', 'elder', 'quest_giver', 'scholar', 'guard', 'innkeeper', 'mysterious'];
const ALL_SPECIES = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'] as const;

describe('NPC_DEFAULTS', () => {
  it('has 7 default entries (one per species)', () => {
    expect(NPC_DEFAULTS).toHaveLength(7);
  });

  it('every default has kind = npc', () => {
    for (const dna of NPC_DEFAULTS) {
      expect(dna.kind).toBe('npc');
    }
  });

  it('covers all 7 species', () => {
    const species = new Set(NPC_DEFAULTS.map(d => d.species));
    for (const s of ALL_SPECIES) {
      expect(species.has(s), `missing species: ${s}`).toBe(true);
    }
  });

  it('every default has valid role', () => {
    for (const dna of NPC_DEFAULTS) {
      expect(ALL_ROLES).toContain(dna.role);
    }
  });

  it('every default has valid colors', () => {
    for (const dna of NPC_DEFAULTS) {
      expect(dna.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(dna.colors.skin).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('getDefaultNpcDna', () => {
  it('same species+role+seed produces identical DNA', () => {
    const a = getDefaultNpcDna('human', 'merchant', 42);
    const b = getDefaultNpcDna('human', 'merchant', 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds produce different DNAs', () => {
    const a = getDefaultNpcDna('human', 'merchant', 1);
    const b = getDefaultNpcDna('human', 'merchant', 2);
    expect(a.seed).not.toBe(b.seed);
  });

  it('hat matches role convention', () => {
    const guard   = getDefaultNpcDna('human', 'guard', 1);
    const scholar = getDefaultNpcDna('human', 'scholar', 1);
    expect(guard.hat).toBe('soldier_helm');
    expect(scholar.hat).toBe('wide_brim');
  });

  it('generates all 7 species without throwing', () => {
    for (const species of ALL_SPECIES) {
      expect(() => getDefaultNpcDna(species, 'merchant', 99)).not.toThrow();
    }
  });

  it('generates all roles without throwing', () => {
    for (const role of ALL_ROLES) {
      expect(() => getDefaultNpcDna('human', role, 99)).not.toThrow();
    }
  });
});

describe('NPC share codes', () => {
  it('encodes and decodes round-trip', () => {
    const dna     = getDefaultNpcDna('elf', 'scholar', 123);
    const code    = npcDnaToShareCode(dna);
    const decoded = shareCodeToNpcDna(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe('npc');
    expect(decoded!.species).toBe('elf');
    expect(decoded!.role).toBe('scholar');
  });

  it('code starts with N2. prefix', () => {
    const code = npcDnaToShareCode(getDefaultNpcDna('human', 'merchant', 1));
    expect(code.startsWith('N2.')).toBe(true);
  });

  it('returns null for princess share code', () => {
    const princessCode = 'P2.eyJ2IjoiMiIsInNwZWNpZXMiOiJodW1hbiIsImtpbmQiOiJwcmluY2VzcyJ9';
    expect(shareCodeToNpcDna(princessCode)).toBeNull();
  });
});
