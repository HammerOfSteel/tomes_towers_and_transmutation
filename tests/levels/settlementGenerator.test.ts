import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateSettlementName } from '@/world/SettlementNameGenerator';
import { planSettlement, applySettlementToGrid, type PlacedBuilding } from '@/world/SettlementGenerator';
import { placeSettlements } from '@/world/SettlementPlacer';
import type { WorldGenConfig } from '@/world/WorldGenConfig';
import { generateRealmData } from '@/world/RealmGenerator';
import { buildSettlement, type SettlementModel, type WardType } from '@/world/SettlementModelGenerator';
import { WARD_TO_KIND, WARD_TO_SIZE, WARD_TO_FLOORS } from '@/buildingToDungeonPlan';
import { factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';

function flatGrid(size = 64): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      g.set(col, row, { elevation: 1, biome: 'grass', content: 'empty', feature: 'none', walkable: true });
    }
  }
  return g;
}

const BASE_CONFIG: WorldGenConfig = {
  seed: 42, worldSize: 128, riverCount: 2, lakeCount: 0,
  dungeonCount: 2, caveCount: 0, gladeCount: 0,
  settlementCount: 3, enemyCampCount: 2,
  assetMode: 'code', assetPacks: [], charMode: 'code', charPacks: [],
};

function overlaps(a: PlacedBuilding, b: PlacedBuilding): boolean {
  const ak = WARD_TO_KIND[a.wardType]!;
  const bk = WARD_TO_KIND[b.wardType]!;
  const as = a.isAnchor ? (WARD_TO_SIZE[a.wardType] ?? 'medium') : 'tiny';
  const bs = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
  const af = getFootprint(ak, as);
  const bf = getFootprint(bk, bs);
  const ahw = Math.ceil(af.w / 4), ahd = Math.ceil(af.d / 4);
  const bhw = Math.ceil(bf.w / 4), bhd = Math.ceil(bf.d / 4);
  return Math.abs(a.col - b.col) < ahw + bhw && Math.abs(a.row - b.row) < ahd + bhd;
}

function buildModelFor(type: 'village' | 'town' | 'city', seed: number, faction: any = 'human'): SettlementModel {
  const paramsByType = {
    village: { nPatches: 8, width: 320, height: 240, walled: false, hasCitadel: false, hasPlaza: true, nGates: 2 },
    town:    { nPatches: 12, width: 360, height: 280, walled: false, hasCitadel: false, hasPlaza: true, nGates: 3 },
    city:    { nPatches: 18, width: 420, height: 320, walled: true,  hasCitadel: true,  hasPlaza: true, nGates: 4 },
  } as const;
  const p = paramsByType[type];
  return buildSettlement({ seed, type, layout: 'auto', faction, warp: 0.35, ...p });
}

describe('generateSettlementName', () => {
  it('returns non-empty strings for all types', () => {
    for (const type of ['village', 'town', 'city'] as const) {
      const name = generateSettlementName(0x1234, type);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(generateSettlementName(0xDEAD, 'town')).toBe(generateSettlementName(0xDEAD, 'town'));
  });
});

describe('planSettlement', () => {
  it('is deterministic for the same seed', () => {
    const grid = flatGrid(128);
    const a = planSettlement('city', 64, 64, 0xABCD, grid);
    const b = planSettlement('city', 64, 64, 0xABCD, grid);
    expect(a).toEqual(b);
  });

  it('creates exactly one anchor per non-park ward with buildings and uses ward-derived mapping', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('city', 64, 64, 0xBEEF, grid, 'Trace City', 'dwarven');
    const model = buildModelFor('city', 0xBEEF, 'dwarven');
    const expectedWards = model.wards.filter(w => w.withinCity && WARD_TO_KIND[w.type]);
    for (const b of plan.buildings.filter(b => b.isAnchor)) {
      const kind = WARD_TO_KIND[b.wardType];
      const size = WARD_TO_SIZE[b.wardType] ?? 'medium';
      const floors = WARD_TO_FLOORS[b.wardType] ?? 2;
      expect(kind).toBeDefined();
      const dna = factionBuildingDna(kind!, 'dwarven', b.seed, size, floors as 1 | 2 | 3 | 4);
      expect(dna.size).toBe(size);
      expect(dna.floors).toBe(floors);
    }

    expect(plan.buildings.filter(b => b.isAnchor).length).toBeGreaterThan(0);
    expect(plan.buildings.filter(b => b.isAnchor).length).toBeLessThanOrEqual(expectedWards.length);
    for (const filler of plan.buildings.filter(b => !b.isAnchor)) {
      expect(WARD_TO_KIND[filler.wardType]).toBeDefined();
    }
  });

  it('never overlaps buildings using ward-derived footprints', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 12345, grid, 'NoOverlap', 'elven');
    for (let i = 0; i < plan.buildings.length; i++) {
      for (let j = i + 1; j < plan.buildings.length; j++) {
        expect(overlaps(plan.buildings[i]!, plan.buildings[j]!)).toBe(false);
      }
    }
  });

  it('snaps a building off invalid terrain onto the nearest valid tile', () => {
    const grid = flatGrid(128);
    const baseline = planSettlement('village', 64, 64, 777, grid, 'Snap', 'human');
    const target = baseline.buildings[0]!;
    grid.set(target.col, target.row, { biome: 'water' });
    grid.set(target.col + 1, target.row, { content: 'dungeon_entrance' });
    const snapped = planSettlement('village', 64, 64, 777, grid, 'Snap', 'human');
    const moved = snapped.buildings.find(b => b.seed === target.seed);
    expect(moved).toBeDefined();
    expect(moved!.col === target.col && moved!.row === target.row).toBe(false);
    expect(grid.get(moved!.col, moved!.row).biome).not.toBe('water');
    expect(grid.get(moved!.col, moved!.row).content).not.toBe('dungeon_entrance');
  });

  it('drops buildings gracefully when no valid tile exists in range', () => {
    const grid = flatGrid(64);
    for (let row = 0; row < 64; row++) {
      for (let col = 0; col < 64; col++) {
        if (Math.hypot(col - 32, row - 32) <= 20) grid.set(col, row, { biome: 'water', walkable: false });
      }
    }
    const plan = planSettlement('village', 32, 32, 2024, grid, 'Drop', 'human');
    expect(plan.buildings.length).toBe(0);
  });

  it('accepts explicit name and faction override', () => {
    const grid = flatGrid(64);
    const plan = planSettlement('town', 32, 32, 0x2222, grid, 'Custom Falls', 'elven');
    expect(plan.name).toBe('Custom Falls');
    expect(plan.faction).toBe('elven');
  });
});

describe('applySettlementToGrid', () => {
  it('marks road and building cells with the new placed-building shape', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 0xDEAD, grid, 'GridMark', 'human');
    applySettlementToGrid(plan, grid, 1);
    for (const b of plan.buildings) {
      const cell = grid.get(b.col, b.row);
      expect(cell.content).toBe('building');
      expect(cell.walkable).toBe(false);
    }
    for (const r of plan.roads) {
      expect(grid.get(r.col, r.row).feature).toBe('road');
    }
  });
});

describe('placeSettlements', () => {
  it('places at most config.settlementCount settlements', () => {
    const entries = placeSettlements(flatGrid(128), BASE_CONFIG, 42);
    expect(entries.length).toBeLessThanOrEqual(BASE_CONFIG.settlementCount);
  });

  it('carries over realm name, faction, and type onto the settlement plan', () => {
    const g = flatGrid(128);
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const realm = generateRealmData(42, 96, 72, cfg.settlementCount);
    const entries = placeSettlements(g, cfg, 42);
    const realmByName = new Map(realm.settlements.map(s => [s.name, s]));
    for (const e of entries) {
      const src = realmByName.get(e.plan.name);
      expect(src).toBeDefined();
      expect(e.plan.type).toBe(src!.size);
      expect(e.plan.faction).toBe(src!.faction);
    }
  });
});
