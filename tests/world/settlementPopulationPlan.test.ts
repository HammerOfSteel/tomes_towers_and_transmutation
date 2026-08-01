/**
 * settlementPopulationPlan.test.ts — PROC-C / WG-1
 */

import { describe, it, expect } from 'vitest';
import {
  generateSettlementPopulationPlan,
  POPULATION_RANGE,
} from '@/world/SettlementPopulationPlan';

describe('generateSettlementPopulationPlan', () => {
  it('is deterministic for the same inputs (aside from name text, which uses non-seeded flavor generation)', () => {
    const a = generateSettlementPopulationPlan('settlement-1', 'town', 12345);
    const b = generateSettlementPopulationPlan('settlement-1', 'town', 12345);
    const strip = (plan: typeof a) => ({
      ...plan,
      namedNpcs: plan.namedNpcs.map(({ name: _name, ...rest }) => rest),
    });
    expect(strip(a)).toEqual(strip(b));
    expect(a.population).toBe(b.population);
    expect(a.fillerNpcs).toEqual(b.fillerNpcs);
  });

  it('produces different rosters for different seeds', () => {
    const a = generateSettlementPopulationPlan('settlement-1', 'town', 1);
    const b = generateSettlementPopulationPlan('settlement-1', 'town', 2);
    expect(a).not.toEqual(b);
  });

  it.each([
    ['village', 5, 8],
    ['town', 12, 20],
    ['city', 25, 40],
  ] as const)('keeps %s population within [%d, %d]', (size, min, max) => {
    for (let seed = 0; seed < 30; seed++) {
      const plan = generateSettlementPopulationPlan('s', size, seed);
      expect(plan.population).toBeGreaterThanOrEqual(min);
      expect(plan.population).toBeLessThanOrEqual(max);
      expect(POPULATION_RANGE[size]).toEqual([min, max]);
    }
  });

  it('always includes innkeeper, blacksmith, and merchant when population allows', () => {
    const plan = generateSettlementPopulationPlan('settlement-1', 'town', 999);
    const titles = plan.namedNpcs.map(n => n.title);
    expect(titles).toEqual(['innkeeper', 'blacksmith', 'merchant']);
    expect(plan.namedNpcs.every(n => n.name.length > 0)).toBe(true);
  });

  it('named + filler counts always sum to total population', () => {
    for (const size of ['village', 'town', 'city'] as const) {
      for (let seed = 0; seed < 15; seed++) {
        const plan = generateSettlementPopulationPlan('s', size, seed);
        expect(plan.namedNpcs.length + plan.fillerNpcs.length).toBe(plan.population);
      }
    }
  });

  it('caps named roster to population size for very small settlements', () => {
    // Force minimum village population and confirm named roster never
    // exceeds available population slots.
    for (let seed = 0; seed < 50; seed++) {
      const plan = generateSettlementPopulationPlan('tiny', 'village', seed);
      expect(plan.namedNpcs.length).toBeLessThanOrEqual(plan.population);
      expect(plan.namedNpcs.length).toBeLessThanOrEqual(3);
    }
  });

  it('gives every NPC a stable, unique id', () => {
    const plan = generateSettlementPopulationPlan('settlement-7', 'city', 42);
    const ids = [...plan.namedNpcs.map(n => n.id), ...plan.fillerNpcs.map(n => n.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respects a custom species pool', () => {
    const plan = generateSettlementPopulationPlan('s', 'town', 5, { speciesPool: ['slime'] });
    const allSpecies = [
      ...plan.namedNpcs.map(n => n.species),
      ...plan.fillerNpcs.map(n => n.species),
    ];
    expect(allSpecies.every(s => s === 'slime')).toBe(true);
  });
});