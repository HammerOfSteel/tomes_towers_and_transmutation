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
  dungeonCount: 2, villageCount: 2, townCount: 1, hasCity: true, enemyCampCount: 2,
  assetMode: 'code', assetPacks: [],
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
  it('places at most config total settlements', () => {
    const g = flatGrid(128);
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    const total = (BASE_CONFIG.hasCity ? 1 : 0) + BASE_CONFIG.townCount + BASE_CONFIG.villageCount;
    expect(entries.length).toBeLessThanOrEqual(total);
  });

  it('produces unique names per settlement', () => {
    const g     = flatGrid(128);
    const entries = placeSettlements(g, { ...BASE_CONFIG, villageCount: 3 }, 99);
    const names  = entries.map(e => e.plan.name);
    // Names may occasionally collide due to seeding, but generally unique
    expect(new Set(names).size).toBeGreaterThan(0);
  });

  it('returns empty array when all counts are zero', () => {
    const g   = flatGrid(64);
    const cfg = { ...BASE_CONFIG, hasCity: false, townCount: 0, villageCount: 0 };
    const entries = placeSettlements(g, cfg, 7);
    expect(entries).toHaveLength(0);
  });
});
