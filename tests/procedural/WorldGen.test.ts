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

  it('uses custom settlement NPC overrides from the asset library when present', () => {
    localStorage.removeItem('ttt_asset_library');

    const baseline = generateWorldPlan(SEED_A, { settlementCount: 1 });
    const settlement = baseline.settlements[0]!;
    const customNpc = {
      npcId: 'npc-custom-1',
      displayName: 'Archivist Sel',
      species: 'elf',
      role: 'scholar',
      settlementId: settlement.id,
      settlementName: settlement.name,
      pos: { x: 12, y: 0, z: -7 },
      npcSeed: 123456,
    };

    localStorage.setItem('ttt_asset_library', JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'library_npc_custom_1',
          type: 'npc',
          name: 'Archivist Sel (scholar)',
          seed: settlement.seed,
          createdAt: 1,
          tags: [`settlement:${settlement.id}`, 'role:scholar', 'species:elf'],
          isCustom: true,
          thumbnail: null,
          data: customNpc,
        },
      ],
    }));

    const overridden = generateWorldPlan(SEED_A, { settlementCount: 1 });
    const npcs = overridden.settlements[0]!.npcs;

    expect(npcs).toHaveLength(1);
    expect(npcs[0]!.id).toBe('npc-custom-1');
    expect(npcs[0]!.species).toBe('elf');
    expect(npcs[0]!.role).toBe('scholar');
    expect(npcs[0]!.settlementId).toBe(settlement.id);
    expect(npcs[0]!.pos).toEqual({ x: 12, y: 0, z: -7 });

    localStorage.removeItem('ttt_asset_library');
  });

  it('uses custom settlement building overrides from the asset library when present', () => {
    localStorage.removeItem('ttt_asset_library');

    const baseline = generateWorldPlan(SEED_A, { settlementCount: 1 });
    const settlement = baseline.settlements[0]!;
    const customBuilding = {
      buildingId: 'bld-custom-1',
      settlementId: settlement.id,
      kind: 'inn',
      style: 'arcane',
      floors: 3,
      rotation: 1.25,
      seed: 424242,
      hasInterior: true,
      pos: { x: 21, y: 0, z: -13 },
    };

    localStorage.setItem('ttt_asset_library', JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'library_building_custom_1',
          type: 'building',
          name: 'Custom Arcane Inn',
          seed: 987654321,
          createdAt: 1,
          tags: [`settlement:${settlement.id}`, 'building:bld-custom-1', 'dtype:building'],
          isCustom: true,
          thumbnail: null,
          data: customBuilding,
        },
      ],
    }));

    const overridden = generateWorldPlan(SEED_A, { settlementCount: 1 });
    const buildings = overridden.settlements[0]!.buildings;

    expect(buildings).toHaveLength(1);
    expect(buildings[0]!.id).toBe('bld-custom-1');
    expect(buildings[0]!.kind).toBe('inn');
    expect(buildings[0]!.style).toBe('arcane');
    expect(buildings[0]!.floors).toBe(3);
    expect(buildings[0]!.rotation).toBe(1.25);
    expect(buildings[0]!.seed).toBe(424242);
    expect(buildings[0]!.hasInterior).toBe(true);
    expect(buildings[0]!.pos).toEqual({ x: 21, y: 0, z: -13 });

    localStorage.removeItem('ttt_asset_library');
  });

  it('falls back to procedural building generation when no matching building overrides exist', () => {
    localStorage.setItem('ttt_asset_library', JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'library_building_other_settlement',
          type: 'building',
          name: 'Other Settlement Building',
          seed: 999999,
          createdAt: 1,
          tags: ['settlement:not-the-right-one', 'dtype:building'],
          isCustom: true,
          thumbnail: null,
          data: {
            buildingId: 'bld-other-1',
            settlementId: 'not-the-right-one',
            kind: 'shop',
            style: 'stone',
            floors: 2,
            pos: { x: 5, y: 0, z: 5 },
          },
        },
      ],
    }));

    const plan = generateWorldPlan(SEED_A, { settlementCount: 1 });
    expect(plan.settlements[0]!.buildings.length).toBeGreaterThan(1);

    localStorage.removeItem('ttt_asset_library');
  });

  it('ignores malformed custom building overrides', () => {
    localStorage.setItem('ttt_asset_library', JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'library_building_bad_1',
          type: 'building',
          name: 'Broken Building',
          seed: SEED_A,
          createdAt: 1,
          tags: ['dtype:building'],
          isCustom: true,
          thumbnail: null,
          data: {
            settlementId: 'broken',
            kind: 'not-a-kind',
            floors: 'bad',
            pos: { x: 'bad', z: null },
          },
        },
      ],
    }));

    expect(() => generateWorldPlan(SEED_A, { settlementCount: 1 })).not.toThrow();

    localStorage.removeItem('ttt_asset_library');
  });
});
