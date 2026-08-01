/**
 * SettlementPopulator.test.ts — 02-game-world-integration (SI-3)
 */

import { describe, it, expect } from 'vitest';
import { populateSettlement, FACTION_TO_SPECIES } from '@/world/SettlementPopulator';
import { spawnSettlement } from '@/world/SettlementSpawner';
import type { RealmSettlement, SettlementFaction } from '@/overworld-studio';

function makeSettlement(overrides: Partial<RealmSettlement> = {}): RealmSettlement {
  return {
    x: 10, y: 20, name: 'Testford', size: 'town', faction: 'human',
    ...overrides,
  };
}

describe('FACTION_TO_SPECIES', () => {
  it('covers every SettlementFaction with a valid GameSpecies', () => {
    const factions: SettlementFaction[] = [
      'human', 'elven', 'dwarven', 'orcish', 'vampire', 'undead', 'vulperia', 'slime', 'fae',
    ];
    for (const f of factions) {
      expect(FACTION_TO_SPECIES[f]).toBeTruthy();
    }
  });
});

describe('populateSettlement', () => {
  it('is deterministic for a given seed', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 7 });
    const a = populateSettlement(plan, { seed: 99 });
    const b = populateSettlement(plan, { seed: 99 });
    expect(b).toEqual(a);
  });

  it('is deterministic without an explicit seed', () => {
    const plan = spawnSettlement(makeSettlement(), { seed: 7 });
    const a = populateSettlement(plan);
    const b = populateSettlement(plan);
    expect(b).toEqual(a);
  });

  it('spawns no NPCs for a village (no quest-giver, and village mix has no shop/inn/watchtower)', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'village' }), { seed: 1 });
    const npcs = populateSettlement(plan, { seed: 1 });
    // Village mix (well/house/cottage/barn) has none of the trigger kinds.
    expect(npcs.length).toBe(0);
  });

  it('spawns a quest-giver for town and city settlements', () => {
    const town = populateSettlement(spawnSettlement(makeSettlement({ size: 'town' }), { seed: 2 }), { seed: 2 });
    const city = populateSettlement(spawnSettlement(makeSettlement({ size: 'city' }), { seed: 2 }), { seed: 2 });
    expect(town.some(n => n.dna.role === 'quest_giver')).toBe(true);
    expect(city.some(n => n.dna.role === 'quest_giver')).toBe(true);
  });

  it('spawns merchants near shop buildings', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'town' }), { seed: 3 });
    const npcs = populateSettlement(plan, { seed: 3 });
    const merchants = npcs.filter(n => n.dna.role === 'merchant');
    const shopCount = plan.buildings.filter(b => b.dna.buildingKind === 'shop').length;
    expect(shopCount).toBeGreaterThan(0);
    // 2-3 merchants per shop.
    expect(merchants.length).toBeGreaterThanOrEqual(shopCount * 2);
    expect(merchants.length).toBeLessThanOrEqual(shopCount * 3);
  });

  it('spawns guards near watchtower buildings (city mix)', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city' }), { seed: 4 });
    const npcs = populateSettlement(plan, { seed: 4 });
    const guards = npcs.filter(n => n.dna.role === 'guard');
    const towerCount = plan.buildings.filter(b => b.dna.buildingKind === 'watchtower').length;
    expect(towerCount).toBeGreaterThan(0);
    expect(guards.length).toBeGreaterThanOrEqual(towerCount);
  });

  it('spawns an innkeeper plus wanderers near inn/tavern buildings', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city' }), { seed: 5 });
    const npcs = populateSettlement(plan, { seed: 5 });
    const innBuildings = plan.buildings.filter(b => b.dna.buildingKind === 'inn' || b.dna.buildingKind === 'tavern');
    expect(innBuildings.length).toBeGreaterThan(0);
    const innkeepers = npcs.filter(n => n.dna.role === 'innkeeper');
    const wanderers = npcs.filter(n => n.dna.role === 'mysterious');
    expect(innkeepers.length).toBe(innBuildings.length);
    expect(wanderers.length).toBeGreaterThanOrEqual(innBuildings.length);
  });

  it('applies the mapped species to every NPC', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city', faction: 'elven' }), { seed: 6 });
    const npcs = populateSettlement(plan, { seed: 6 });
    expect(npcs.length).toBeGreaterThan(0);
    for (const npc of npcs) {
      expect(npc.dna.species).toBe('elf');
    }
  });

  it('places every NPC at finite world coordinates', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city' }), { seed: 8 });
    const npcs = populateSettlement(plan, { seed: 8 });
    for (const npc of npcs) {
      expect(Number.isFinite(npc.position.x)).toBe(true);
      expect(Number.isFinite(npc.position.z)).toBe(true);
    }
  });
});
