/**
 * WorldGen.test.ts — PROC-A7
 * Same seed → identical PlacementPlan every run.
 */

import { describe, it, expect } from 'vitest';
import { generateWorldPlan } from '@/procedural/WorldGen';

const SEED_A = 0xDEAD_BEEF;
const SEED_B = 0xCAFE_BABE;

describe('WorldGen determinism', () => {
  it('same seed produces identical plan on two calls', () => {
    const plan1 = generateWorldPlan(SEED_A);
    const plan2 = generateWorldPlan(SEED_A);

    expect(plan1.seed).toBe(SEED_A);
    expect(plan2.seed).toBe(SEED_A);
    expect(plan1.settlements).toHaveLength(plan2.settlements.length);

    // Every settlement should match exactly
    for (let i = 0; i < plan1.settlements.length; i++) {
      const s1 = plan1.settlements[i];
      const s2 = plan2.settlements[i];
      expect(s1.id).toBe(s2.id);
      expect(s1.name).toBe(s2.name);
      expect(s1.type).toBe(s2.type);
      expect(s1.pos.x).toBeCloseTo(s2.pos.x, 6);
      expect(s1.pos.z).toBeCloseTo(s2.pos.z, 6);
      expect(s1.buildings).toHaveLength(s2.buildings.length);
      expect(s1.npcs).toHaveLength(s2.npcs.length);
    }

    expect(plan1.wildEnemies).toHaveLength(plan2.wildEnemies.length);
    for (let i = 0; i < plan1.wildEnemies.length; i++) {
      expect(plan1.wildEnemies[i].id).toBe(plan2.wildEnemies[i].id);
      expect(plan1.wildEnemies[i].pos.x).toBeCloseTo(plan2.wildEnemies[i].pos.x, 6);
    }
  });

  it('different seeds produce different plans', () => {
    const planA = generateWorldPlan(SEED_A);
    const planB = generateWorldPlan(SEED_B);

    // At minimum, settlement positions should differ
    const posA = planA.settlements[0]?.pos;
    const posB = planB.settlements[0]?.pos;
    expect(posA?.x).not.toBeCloseTo(posB?.x ?? 0, 1);
  });
});

describe('WorldGen structure', () => {
  it('generates the requested number of settlements', () => {
    const plan = generateWorldPlan(SEED_A, { settlementCount: 5 });
    expect(plan.settlements).toHaveLength(5);
  });

  it('generates wild enemies', () => {
    const plan = generateWorldPlan(SEED_A, { wildEnemyCount: 8 });
    expect(plan.wildEnemies).toHaveLength(8);
  });

  it('every building has a unique id', () => {
    const plan = generateWorldPlan(SEED_A);
    const ids = plan.settlements.flatMap(s => s.buildings.map(b => b.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every NPC has a unique id', () => {
    const plan = generateWorldPlan(SEED_A);
    const ids = plan.settlements.flatMap(s => s.npcs.map(n => n.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every enemy has a unique id', () => {
    const plan = generateWorldPlan(SEED_A, { wildEnemyCount: 20 });
    const ids = plan.wildEnemies.map(e => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all settlement positions are within worldRadius', () => {
    const radius = 80;
    const plan   = generateWorldPlan(SEED_A, { worldRadius: radius, settlementCount: 6 });
    for (const s of plan.settlements) {
      const dist = Math.sqrt(s.pos.x ** 2 + s.pos.z ** 2);
      expect(dist).toBeLessThanOrEqual(radius);
    }
  });

  it('each settlement has a name, type, buildings, and npcs', () => {
    const plan = generateWorldPlan(SEED_A);
    for (const s of plan.settlements) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(3);
      expect(['hamlet', 'village', 'town', 'city']).toContain(s.type);
      expect(s.buildings.length).toBeGreaterThan(0);
      expect(s.npcs.length).toBeGreaterThan(0);
    }
  });

  it('buildings have valid kinds and styles', () => {
    const plan = generateWorldPlan(SEED_A);
    const validKinds   = ['house', 'inn', 'shop', 'guild', 'ruin', 'well', 'barn'];
    const validStyles  = ['thatched', 'stone', 'timber', 'arcane'];
    for (const s of plan.settlements) {
      for (const b of s.buildings) {
        expect(validKinds).toContain(b.kind);
        expect(validStyles).toContain(b.style);
        expect([1, 2, 3]).toContain(b.floors);
      }
    }
  });

  it('NPCs have valid roles and species', () => {
    const plan   = generateWorldPlan(SEED_A);
    const roles  = ['merchant', 'elder', 'quest_giver', 'scholar', 'guard', 'innkeeper', 'mysterious'];
    const species = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];
    for (const s of plan.settlements) {
      for (const n of s.npcs) {
        expect(roles).toContain(n.role);
        expect(species).toContain(n.species);
        expect(n.settlementId).toBe(s.id);
      }
    }
  });

  it('wild enemies have valid tiers and roles', () => {
    const plan = generateWorldPlan(SEED_A);
    const roles = ['melee', 'ranged', 'caster', 'swarm'];
    for (const e of plan.wildEnemies) {
      expect([1, 2, 3]).toContain(e.tier);
      expect(roles).toContain(e.combatRole);
      expect(e.patrolRadius).toBeGreaterThan(0);
    }
  });
});
