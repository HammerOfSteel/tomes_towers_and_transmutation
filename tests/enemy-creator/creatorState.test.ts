/**
 * creatorState.test.ts — Procedural Asset Designer / Enemy Designer
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialEnemyState, setSpecies, setCombatRole, setTier, setMovement,
  setIsBoss, setColor, setName, setAttackRange, setAggroRange, setBaseHp, setBaseDmg,
  toLibraryPayload,
  ENEMY_CREATOR_SPECIES, ENEMY_CREATOR_ROLES, ENEMY_CREATOR_TIERS, ENEMY_CREATOR_MOVEMENTS,
} from '@/enemy-creator/creatorState';

describe('picker lists', () => {
  it('ENEMY_CREATOR_SPECIES lists the 7 supported game species', () => {
    expect(ENEMY_CREATOR_SPECIES).toEqual([
      'human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic',
    ]);
  });

  it('ENEMY_CREATOR_ROLES matches EnemyCombatRole', () => {
    expect(ENEMY_CREATOR_ROLES).toEqual(['melee', 'ranged', 'caster', 'support', 'tank', 'swarm']);
  });

  it('ENEMY_CREATOR_TIERS is 1-4 (4 = boss)', () => {
    expect(ENEMY_CREATOR_TIERS).toEqual([1, 2, 3, 4]);
  });

  it('ENEMY_CREATOR_MOVEMENTS matches EnemyMovement', () => {
    expect(ENEMY_CREATOR_MOVEMENTS).toEqual(['patrol', 'charge', 'circle', 'ambush', 'swarm']);
  });
});

describe('createInitialEnemyState', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialEnemyState('human', 'melee', 1, 42);
    const b = createInitialEnemyState('human', 'melee', 1, 42);
    expect(a.dna).toEqual(b.dna);
  });

  it('defaults to human/melee/tier1', () => {
    const state = createInitialEnemyState(undefined, undefined, undefined, 1);
    expect(state.dna.species).toBe('human');
    expect(state.dna.combatRole).toBe('melee');
    expect(state.dna.tier).toBe(1);
  });
});

describe('setSpecies', () => {
  it('keeps role/tier/seed, preserves name, rebuilds stats for new species', () => {
    const state = setName(createInitialEnemyState('human', 'tank', 2, 9), 'Big Bob');
    const next = setSpecies(state, 'draconic');

    expect(next.dna.species).toBe('draconic');
    expect(next.dna.combatRole).toBe('tank');
    expect(next.dna.tier).toBe(2);
    expect(next.dna.seed).toBe(9);
    expect(next.dna.name).toBe('Big Bob');
  });
});

describe('setCombatRole', () => {
  it('rebuilds movement/ranges for the new role, keeps colors/species/tier', () => {
    const state = createInitialEnemyState('elf', 'melee', 1, 5);
    const next = setCombatRole(state, 'ranged');

    expect(next.dna.combatRole).toBe('ranged');
    expect(next.dna.movement).toBe('circle');
    expect(next.dna.attackRange).toBe(12);
    expect(next.dna.species).toBe('elf');
    expect(next.dna.tier).toBe(1);
    expect(next.dna.colors).toEqual(state.dna.colors);
  });
});

describe('setTier', () => {
  it('rebuilds baseHp/baseDmg for the new tier, keeps role/species/seed', () => {
    const state = createInitialEnemyState('human', 'melee', 1, 3);
    const next = setTier(state, 3);

    expect(next.dna.tier).toBe(3);
    expect(next.dna.baseHp).toBeGreaterThan(state.dna.baseHp);
    expect(next.dna.combatRole).toBe('melee');
    expect(next.dna.species).toBe('human');
    expect(next.dna.seed).toBe(3);
  });
});

describe('field setters', () => {
  const base = createInitialEnemyState('human', 'melee', 1, 1);

  it('setMovement', () => {
    expect(setMovement(base, 'ambush').dna.movement).toBe('ambush');
  });

  it('setIsBoss', () => {
    expect(setIsBoss(base, true).dna.isBoss).toBe(true);
  });

  it('setColor updates only the targeted slot', () => {
    const next = setColor(base, 'accent', '#ff00ff');
    expect(next.dna.colors.accent).toBe('#ff00ff');
    expect(next.dna.colors.body).toBe(base.dna.colors.body);
  });

  it('setName', () => {
    expect(setName(base, 'Grognak').dna.name).toBe('Grognak');
  });

  it('setAttackRange / setAggroRange / setBaseHp / setBaseDmg', () => {
    expect(setAttackRange(base, 20).dna.attackRange).toBe(20);
    expect(setAggroRange(base, 15).dna.aggroRange).toBe(15);
    expect(setBaseHp(base, 500).dna.baseHp).toBe(500);
    expect(setBaseDmg(base, 99).dna.baseDmg).toBe(99);
  });
});

describe('toLibraryPayload', () => {
  it('maps DNA to an enemy-typed library payload with descriptive tags', () => {
    const state = createInitialEnemyState('draconic', 'tank', 3, 55);
    const payload = toLibraryPayload(state);

    expect(payload.type).toBe('enemy');
    expect(payload.seed).toBe(55);
    expect(payload.tags).toEqual(
      expect.arrayContaining(['role:tank', 'tier:3', 'species:draconic']),
    );
    expect(payload.data).toEqual(state.dna);
  });

  it('adds a "boss" tag when isBoss is true', () => {
    const state = setIsBoss(createInitialEnemyState('human', 'melee', 4, 1), true);
    expect(toLibraryPayload(state).tags).toContain('boss');
  });

  it('falls back to "<role> <species>" when name is empty', () => {
    const state = setName(createInitialEnemyState('slime', 'swarm', 1, 1), '');
    expect(toLibraryPayload(state).name).toBe('swarm slime');
  });
});