/**
 * SettlementSpawner.test.ts — 02-game-world-integration (SI-1)
 */

import { describe, it, expect } from 'vitest';
import {
  spawnSettlement,
  settlementWorldPosition,
  settlementToBuildingFaction,
} from '@/world/SettlementSpawner';
import { TERRAIN_TILE_SIZE } from '@/world/RealmToTerrain';
import type { RealmSettlement } from '@/overworld-studio';

function makeSettlement(overrides: Partial<RealmSettlement> = {}): RealmSettlement {
  return {
    x: 10, y: 20, name: 'Testford', size: 'village', faction: 'human',
    ...overrides,
  };
}

describe('settlementWorldPosition', () => {
  it('scales realm cell coords by TERRAIN_TILE_SIZE', () => {
    const pos = settlementWorldPosition({ x: 10, y: 20 });
    expect(pos).toEqual({ x: 10 * TERRAIN_TILE_SIZE, z: 20 * TERRAIN_TILE_SIZE });
  });
});

describe('settlementToBuildingFaction', () => {
  it('maps human faction by settlement size', () => {
    expect(settlementToBuildingFaction('human', 'village')).toBe('human_rural');
    expect(settlementToBuildingFaction('human', 'town')).toBe('human_town');
    expect(settlementToBuildingFaction('human', 'city')).toBe('human_noble');
  });

  it('maps undead to undead_common', () => {
    expect(settlementToBuildingFaction('undead', 'town')).toBe('undead_common');
  });

  it('passes through non-human, non-undead factions unchanged', () => {
    expect(settlementToBuildingFaction('elven', 'town')).toBe('elven');
    expect(settlementToBuildingFaction('dwarven', 'city')).toBe('dwarven');
    expect(settlementToBuildingFaction('orcish', 'village')).toBe('orcish');
    expect(settlementToBuildingFaction('vampire', 'city')).toBe('vampire');
    expect(settlementToBuildingFaction('vulperia', 'village')).toBe('vulperia');
    expect(settlementToBuildingFaction('slime', 'town')).toBe('slime');
    expect(settlementToBuildingFaction('fae', 'city')).toBe('fae');
  });
});

describe('spawnSettlement', () => {
  it('is deterministic for a given seed (SI-6)', () => {
    const settlement = makeSettlement();
    const planA = spawnSettlement(settlement, { seed: 42 });
    const planB = spawnSettlement(settlement, { seed: 42 });
    expect(planB).toEqual(planA);
  });

  it('is deterministic without an explicit seed (derived from x/y/name)', () => {
    const settlement = makeSettlement();
    const planA = spawnSettlement(settlement);
    const planB = spawnSettlement(settlement);
    expect(planB).toEqual(planA);
  });

  it('produces different layouts for different settlements at the same size', () => {
    const planA = spawnSettlement(makeSettlement({ x: 1, y: 1 }));
    const planB = spawnSettlement(makeSettlement({ x: 99, y: 5 }));
    expect(planA.buildings.map(b => b.position)).not.toEqual(planB.buildings.map(b => b.position));
  });

  it('places the settlement centre at the realm-cell world position', () => {
    const settlement = makeSettlement({ x: 3, y: 7 });
    const plan = spawnSettlement(settlement);
    expect(plan.position).toEqual({ x: 3 * TERRAIN_TILE_SIZE, z: 7 * TERRAIN_TILE_SIZE });
  });

  for (const size of ['village', 'town', 'city'] as const) {
    it(`spawns buildings without error for size=${size}`, () => {
      const settlement = makeSettlement({ size });
      const plan = spawnSettlement(settlement);
      expect(plan.buildings.length).toBeGreaterThan(0);
      for (const b of plan.buildings) {
        expect(b.dna.kind).toBe('building');
        expect(Number.isFinite(b.position.x)).toBe(true);
        expect(Number.isFinite(b.position.z)).toBe(true);
        expect(Number.isFinite(b.rotation)).toBe(true);
      }
    });
  }

  it('city settlements have more buildings than towns, which have more than villages', () => {
    const village = spawnSettlement(makeSettlement({ size: 'village' }));
    const town = spawnSettlement(makeSettlement({ size: 'town' }));
    const city = spawnSettlement(makeSettlement({ size: 'city' }));
    expect(town.buildings.length).toBeGreaterThan(village.buildings.length);
    expect(city.buildings.length).toBeGreaterThan(town.buildings.length);
  });

  it('applies the mapped faction style to every building via factionBuildingDna', () => {
    const settlement = makeSettlement({ faction: 'elven', size: 'town' });
    const plan = spawnSettlement(settlement);
    for (const b of plan.buildings) {
      expect(b.dna.style).toBe('elven');
    }
  });

  it('does not place two buildings at the exact same position', () => {
    const plan = spawnSettlement(makeSettlement({ size: 'city' }));
    const seen = new Set<string>();
    for (const b of plan.buildings) {
      const key = `${b.position.x.toFixed(3)},${b.position.z.toFixed(3)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('keeps the well/plaza marker at the settlement centre', () => {
    const plan = spawnSettlement(makeSettlement());
    const well = plan.buildings.find(b => b.dna.buildingKind === 'well');
    expect(well).toBeDefined();
    expect(well!.position).toEqual(plan.position);
  });
});
