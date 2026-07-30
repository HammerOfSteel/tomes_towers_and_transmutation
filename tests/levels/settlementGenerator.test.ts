/**
 * OW-5 — Settlement Generator tests.
 *
 * Tests cover:
 *  - Settlement name generation for all three types.
 *  - planSettlement() produces valid Plans with buildings + roads within grid bounds.
 *  - applySettlementToGrid() marks road/building cells correctly.
 *  - placeSettlements() honours config counts and minimum spacing.
 */

import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateSettlementName } from '@/world/SettlementNameGenerator';
import { planSettlement, applySettlementToGrid } from '@/world/SettlementGenerator';
import { placeSettlements } from '@/world/SettlementPlacer';
import type { WorldGenConfig } from '@/world/WorldGenConfig';
import { BUILDING_SPECS } from '@/world/buildings/BuildingTypes';
import type { PlacedBuilding } from '@/world/SettlementGenerator';
import { generateRealmData } from '@/world/RealmGenerator';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Name generator ─────────────────────────────────────────────────────────────

describe('generateSettlementName', () => {
  it('returns non-empty strings for all types', () => {
    for (const type of ['village', 'town', 'city'] as const) {
      const name = generateSettlementName(0x1234, type);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    const n1 = generateSettlementName(0xDEAD, 'town');
    const n2 = generateSettlementName(0xDEAD, 'town');
    expect(n1).toBe(n2);
  });

  it('produces different names for different seeds', () => {
    const names = new Set(
      [0, 1, 2, 3, 100, 999].map(s => generateSettlementName(s, 'village')),
    );
    expect(names.size).toBeGreaterThan(2);
  });
});

// ── planSettlement ─────────────────────────────────────────────────────────────

describe('planSettlement', () => {
  const GW = 64, cc = 32, cr = 32;

  it('returns a plan with at least 1 building for every type', () => {
    const g = flatGrid(GW);
    for (const type of ['village', 'town', 'city'] as const) {
      const plan = planSettlement(type, cc, cr, 0xABCD, g);
      expect(plan.type).toBe(type);
      expect(plan.buildings.length).toBeGreaterThan(0);
    }
  });

  it('all building positions are within grid bounds', () => {
    const g = flatGrid(GW);
    for (const type of ['village', 'town', 'city'] as const) {
      const plan = planSettlement(type, cc, cr, 0x1234, g);
      for (const b of plan.buildings) {
        expect(b.col).toBeGreaterThanOrEqual(0);
        expect(b.col).toBeLessThan(GW);
        expect(b.row).toBeGreaterThanOrEqual(0);
        expect(b.row).toBeLessThan(GW);
      }
    }
  });

  it('plan has a non-empty name', () => {
    const g = flatGrid(GW);
    const plan = planSettlement('village', cc, cr, 0x5678, g);
    expect(plan.name.length).toBeGreaterThan(0);
  });

  it('defaults to faction "human" when no faction is given', () => {
    const g = flatGrid(GW);
    const plan = planSettlement('village', cc, cr, 0x1111, g);
    expect(plan.faction).toBe('human');
  });

  it('accepts an explicit name and faction override', () => {
    const g = flatGrid(GW);
    const plan = planSettlement('town', cc, cr, 0x2222, g, 'Custom Falls', 'elven');
    expect(plan.name).toBe('Custom Falls');
    expect(plan.faction).toBe('elven');
  });
});

// ── applySettlementToGrid ─────────────────────────────────────────────────────

describe('applySettlementToGrid', () => {
  it('marks building cells as content=building', () => {
    const g    = flatGrid(64);
    const plan = planSettlement('village', 32, 32, 0xABCD, g);
    applySettlementToGrid(plan, g, 1);
    const bldgCells = plan.buildings.filter(b => {
      const cell = g.get(b.col, b.row);
      return cell.content === 'building';
    });
    expect(bldgCells.length).toBe(plan.buildings.length);
  });

  it('marks road cells as feature=road', () => {
    const g    = flatGrid(64);
    const plan = planSettlement('town', 32, 32, 0xDEAD, g);
    applySettlementToGrid(plan, g, 1);
    for (const r of plan.roads) {
      // Road cell must have feature road
      const cell = g.get(r.col, r.row);
      expect(cell.feature).toBe('road');
    }
  });
});

// ── placeSettlements ──────────────────────────────────────────────────────────

describe('placeSettlements', () => {
  it('places at most config.settlementCount settlements', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBeLessThanOrEqual(BASE_CONFIG.settlementCount);
  });

  it('produces unique names per settlement', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 5 }, 99);
    const names = entries.map(e => e.plan.name);
    expect(new Set(names).size).toBeGreaterThan(0);
  });

  it('returns empty array when settlementCount is 0', () => {
    const g = flatGrid(64);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 0 }, 7);
    expect(entries).toHaveLength(0);
  });

  it('is deterministic for the same seed', () => {
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const e1 = placeSettlements(flatGrid(128), cfg, 777);
    const e2 = placeSettlements(flatGrid(128), cfg, 777);
    const summarize = (es: typeof e1) => es.map(e => ({ col: e.plan.centerCol, row: e.plan.centerRow, name: e.plan.name }));
    expect(summarize(e1)).toEqual(summarize(e2));
  });

  it('processes settlements in city -> town -> village priority order', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 6 }, 42);
    const idsByType: Record<string, number[]> = { city: [], town: [], village: [] };
    for (const e of entries) idsByType[e.plan.type]!.push(e.id);
    const maxCityId    = idsByType.city!.length    ? Math.max(...idsByType.city!)    : -Infinity;
    const minTownId    = idsByType.town!.length    ? Math.min(...idsByType.town!)    : Infinity;
    const maxTownId    = idsByType.town!.length    ? Math.max(...idsByType.town!)    : -Infinity;
    const minVillageId = idsByType.village!.length ? Math.min(...idsByType.village!) : Infinity;
    expect(maxCityId).toBeLessThan(minTownId);
    expect(maxTownId).toBeLessThan(minVillageId);
  });

  it('carries over realm name, faction, and type onto the settlement plan', () => {
    const g = flatGrid(128);
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const realm = generateRealmData(42, 96, 72, cfg.settlementCount);
    const entries = placeSettlements(g, cfg, 42);
    expect(entries.length).toBeGreaterThan(0);
    const realmByName = new Map(realm.settlements.map(s => [s.name, s]));
    for (const e of entries) {
      const src = realmByName.get(e.plan.name);
      expect(src).toBeDefined();
      expect(e.plan.type).toBe(src!.size);
      expect(e.plan.faction).toBe(src!.faction);
    }
  });

  it('enforces minimum spacing between placed settlements by (later-placed) type', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 6 }, 42);
    const MIN_DIST: Record<string, number> = { city: 35, town: 22, village: 14 };
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!.plan, b = entries[j]!.plan; // b was placed after a
        const dist = Math.hypot(a.centerCol - b.centerCol, a.centerRow - b.centerRow);
        expect(dist).toBeGreaterThanOrEqual(MIN_DIST[b.type]! - 0.001);
      }
    }
  });

  it('never sites a settlement on a tile pre-occupied by a dungeon', () => {
    const g = flatGrid(128);
    for (let row = 60; row <= 68; row++) {
      for (let col = 60; col <= 68; col++) {
        g.set(col, row, { content: 'dungeon_entrance' });
      }
    }
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 3 }, 11);
    for (const e of entries) {
      const inBlockedZone = e.plan.centerCol >= 60 && e.plan.centerCol <= 68 &&
                             e.plan.centerRow >= 60 && e.plan.centerRow <= 68;
      expect(inBlockedZone).toBe(false);
    }
  });

  it('drops all settlements when the entire grid is invalid terrain', () => {
    const g = new WorldGrid(64, 64);
    for (let row = 0; row < 64; row++) {
      for (let col = 0; col < 64; col++) {
        g.set(col, row, { elevation: 1, biome: 'water', content: 'empty', feature: 'none', walkable: false });
      }
    }
    const entries = placeSettlements(g, { ...BASE_CONFIG, settlementCount: 3 }, 5);
    expect(entries).toHaveLength(0);
  });
});

// ── Building overlap regression (TV-3 side-track: footprint-aware layout) ────

describe('planSettlement building overlap', () => {
  function overlaps(a: PlacedBuilding, b: PlacedBuilding): boolean {
    const [aw, ad] = BUILDING_SPECS[a.type].footprint;
    const [bw, bd] = BUILDING_SPECS[b.type].footprint;
    const ahw = Math.ceil(aw / 2), ahd = Math.ceil(ad / 2);
    const bhw = Math.ceil(bw / 2), bhd = Math.ceil(bd / 2);
    return Math.abs(a.col - b.col) < ahw + bhw && Math.abs(a.row - b.row) < ahd + bhd;
  }

  it('no two buildings overlap, and no building overlaps a road tile, for several seeds per settlement type', () => {
    const g = flatGrid(128);
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [1, 2, 3, 42, 999]) {
        const plan = planSettlement(type, 64, 64, seed, g);
        const roadKeys = new Set(plan.roads.map(r => `${r.col},${r.row}`));
        for (let i = 0; i < plan.buildings.length; i++) {
          for (let j = i + 1; j < plan.buildings.length; j++) {
            const a = plan.buildings[i]!, b = plan.buildings[j]!;
            expect(
              overlaps(a, b),
              `${type} seed=${seed}: ${a.type}@(${a.col},${a.row}) overlaps ${b.type}@(${b.col},${b.row})`,
            ).toBe(false);
          }
        }
        // Building AABB must not cover any road tile either.
        for (const b of plan.buildings) {
          const [fw, fd] = BUILDING_SPECS[b.type].footprint;
          const hw = Math.ceil(fw / 2), hd = Math.ceil(fd / 2);
          let hitsRoad = false;
          for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
            for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
              if (roadKeys.has(`${b.col + dc},${b.row + dr}`)) hitsRoad = true;
            }
          }
          expect(
            hitsRoad,
            `${type} seed=${seed}: ${b.type}@(${b.col},${b.row}) overlaps a road tile`,
          ).toBe(false);
        }
      }
    }
  });
});
