import { describe, it, expect } from 'vitest';
import { buildWaterLabTiers, WATER_LAB_ROOM_SIZE, WATER_LAB_SURFACE_Y } from '@/levels/WaterLab';

describe('buildWaterLabTiers', () => {
  it('returns exactly 4 tiers: bank, shallow, deep, abyss, in that depth order', () => {
    const tiers = buildWaterLabTiers();
    expect(tiers).toHaveLength(4);
    expect(tiers.map(t => t.name)).toEqual(['bank', 'shallow', 'deep', 'abyss']);
  });

  it('has decreasing Y as tiers go from bank to abyss', () => {
    const tiers = buildWaterLabTiers();
    const [bank, shallow, deep, abyss] = tiers;
    expect(bank.y).toBe(0);
    expect(shallow.y).toBe(-0.3);
    expect(deep.y).toBe(-1.2);
    expect(abyss.y).toBe(-5.0);
    expect(bank.y).toBeGreaterThan(shallow.y);
    expect(shallow.y).toBeGreaterThan(deep.y);
    expect(deep.y).toBeGreaterThan(abyss.y);
  });

  it('every tier fits within the room bounds', () => {
    const tiers = buildWaterLabTiers();
    for (const t of tiers) {
      expect(Math.abs(t.centerX) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
      expect(Math.abs(t.centerZ) + t.halfExtent).toBeLessThanOrEqual(WATER_LAB_ROOM_SIZE / 2);
    }
  });

  it('each tier is nested (smaller or equal footprint) inside the previous one', () => {
    const tiers = buildWaterLabTiers();
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.halfExtent).toBeLessThanOrEqual(tiers[i - 1]!.halfExtent);
    }
  });

  it('WATER_LAB_SURFACE_Y matches the bank tier height (basin cut into the bank)', () => {
    const tiers = buildWaterLabTiers();
    expect(WATER_LAB_SURFACE_Y).toBe(tiers[0].y);
  });
});
