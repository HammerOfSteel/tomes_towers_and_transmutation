/**
 * EnemyDefaults.test.ts — PROC-B2i
 * Enemy defaults: valid DNA for all tiers + share codes.
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultEnemyDna,
  getEnemiesForFloor,
  BOSS_DEFAULTS,
  tierForFloor,
} from '@/enemy-creator/defaults/EnemyDefaults';
import { scaledHp, scaledDmg } from '@/enemy-creator/types';
import { encodeShareCode, decodeShareCode } from '@/procedural/ProceduralDNA';
import type { EnemyCombatRole } from '@/enemy-creator/types';

const ALL_ROLES: EnemyCombatRole[] = ['melee', 'ranged', 'caster', 'support', 'tank', 'swarm'];
const ALL_SPECIES = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'] as const;

describe('tierForFloor', () => {
  it('floors 0-1 → tier 1',  () => { expect(tierForFloor(0)).toBe(1); expect(tierForFloor(1)).toBe(1); });
  it('floors 2-5 → tier 2',  () => { expect(tierForFloor(2)).toBe(2); expect(tierForFloor(5)).toBe(2); });
  it('floors 6+ → tier 3',   () => { expect(tierForFloor(6)).toBe(3); expect(tierForFloor(9)).toBe(3); });
});

describe('getDefaultEnemyDna', () => {
  it('same params → identical DNA', () => {
    const a = getDefaultEnemyDna('undead', 'melee', 1, 42);
    const b = getDefaultEnemyDna('undead', 'melee', 1, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds → different DNA', () => {
    const a = getDefaultEnemyDna('human', 'melee', 1, 1);
    const b = getDefaultEnemyDna('human', 'melee', 1, 2);
    expect(a.seed).not.toBe(b.seed);
  });

  it('kind = enemy for all variants', () => {
    for (const sp of ALL_SPECIES) {
      for (const role of ALL_ROLES) {
        const dna = getDefaultEnemyDna(sp, role, 1, 99);
        expect(dna.kind).toBe('enemy');
      }
    }
  });

  it('tier 4 boss has isBoss = true and high HP', () => {
    const boss = getDefaultEnemyDna('draconic', 'melee', 4, 1, true);
    expect(boss.isBoss).toBe(true);
    expect(scaledHp(boss)).toBeGreaterThanOrEqual(200);
  });

  it('higher tiers have more HP', () => {
    const t1 = getDefaultEnemyDna('human', 'melee', 1, 1);
    const t3 = getDefaultEnemyDna('human', 'melee', 3, 1);
    expect(scaledHp(t3)).toBeGreaterThan(scaledHp(t1));
    expect(scaledDmg(t3)).toBeGreaterThan(scaledDmg(t1));
  });

  it('all species build without throwing', () => {
    for (const sp of ALL_SPECIES) {
      expect(() => getDefaultEnemyDna(sp, 'melee', 2, 77)).not.toThrow();
    }
  });

  it('all roles build without throwing', () => {
    for (const role of ALL_ROLES) {
      expect(() => getDefaultEnemyDna('human', role, 1, 77)).not.toThrow();
    }
  });
});

describe('getEnemiesForFloor', () => {
  it('returns requested count', () => {
    expect(getEnemiesForFloor(0, 5, 1)).toHaveLength(5);
    expect(getEnemiesForFloor(7, 3, 2)).toHaveLength(3);
  });

  it('floor 0 enemies are tier 1', () => {
    const enemies = getEnemiesForFloor(0, 4, 1);
    for (const e of enemies) expect(e.tier).toBe(1);
  });

  it('floor 8 enemies are tier 3', () => {
    const enemies = getEnemiesForFloor(8, 4, 1);
    for (const e of enemies) expect(e.tier).toBe(3);
  });

  it('same seed → identical pool', () => {
    const a = getEnemiesForFloor(3, 6, 42);
    const b = getEnemiesForFloor(3, 6, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('all have valid combat roles', () => {
    const enemies = getEnemiesForFloor(0, 10, 1);
    for (const e of enemies) expect(ALL_ROLES).toContain(e.combatRole);
  });
});

describe('BOSS_DEFAULTS', () => {
  it('has 7 boss entries (one per species)', () => {
    expect(BOSS_DEFAULTS).toHaveLength(7);
  });

  it('all bosses are tier 4 and isBoss = true', () => {
    for (const b of BOSS_DEFAULTS) {
      expect(b.tier).toBe(4);
      expect(b.isBoss).toBe(true);
    }
  });

  it('covers all 7 species', () => {
    const species = new Set(BOSS_DEFAULTS.map(b => b.species));
    for (const s of ALL_SPECIES) expect(species.has(s)).toBe(true);
  });
});

describe('Enemy share codes', () => {
  it('encode → decode round-trip', () => {
    const dna     = getDefaultEnemyDna('elf', 'caster', 2, 55);
    const code    = encodeShareCode(dna);
    const decoded = decodeShareCode(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.kind).toBe('enemy');
  });

  it('code starts with E2. prefix', () => {
    const code = encodeShareCode(getDefaultEnemyDna('human', 'melee', 1, 1));
    expect(code.startsWith('E2.')).toBe(true);
  });
});
