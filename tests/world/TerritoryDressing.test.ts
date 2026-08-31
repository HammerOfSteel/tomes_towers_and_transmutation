import { describe, it, expect } from 'vitest';
import { TERRITORY_RADIUS_MULTIPLIER, territoryPlacementProbability, findTerritoryFaction } from '@/world/TerritoryDressing';

describe('territoryPlacementProbability', () => {
  it('is 0 at or beyond the territory radius', () => {
    expect(territoryPlacementProbability(50, 50)).toBe(0);
    expect(territoryPlacementProbability(60, 50)).toBe(0);
  });

  it('is at its maximum (0.7) exactly at the centre', () => {
    expect(territoryPlacementProbability(0, 50)).toBeCloseTo(0.7, 9);
  });

  it('decreases monotonically as distance increases', () => {
    const p0 = territoryPlacementProbability(0, 100);
    const p25 = territoryPlacementProbability(25, 100);
    const p50 = territoryPlacementProbability(50, 100);
    const p75 = territoryPlacementProbability(75, 100);
    expect(p0).toBeGreaterThan(p25);
    expect(p25).toBeGreaterThan(p50);
    expect(p50).toBeGreaterThan(p75);
  });

  it('returns 0 for a non-positive territory radius (defensive, avoids divide-by-zero)', () => {
    expect(territoryPlacementProbability(5, 0)).toBe(0);
    expect(territoryPlacementProbability(5, -10)).toBe(0);
  });
});

describe('findTerritoryFaction', () => {
  const settlements = [
    { worldPos: { x: 0, z: 0 }, radius: 20, faction: 'vulperia' as const },
    { worldPos: { x: 200, z: 0 }, radius: 10, faction: 'undead' as const },
  ];

  it('finds the faction for a point inside a settlement\'s territory', () => {
    // Territory radius = 20 * 2.5 = 50; point at distance 30 is inside.
    const result = findTerritoryFaction({ x: 30, z: 0 }, settlements);
    expect(result).not.toBeNull();
    expect(result!.faction).toBe('vulperia');
  });

  it('returns null for a point outside every settlement\'s territory', () => {
    const result = findTerritoryFaction({ x: 1000, z: 1000 }, settlements);
    expect(result).toBeNull();
  });

  it('picks the nearest settlement when territories overlap', () => {
    // undead territory radius = 10 * 2.5 = 25; a point at x=190 is distance 10
    // from undead (200,0) and distance 190 from vulperia (0,0) -- undead wins.
    const result = findTerritoryFaction({ x: 190, z: 0 }, settlements);
    expect(result!.faction).toBe('undead');
  });

  it('returns an empty-list-safe null (no settlements at all)', () => {
    expect(findTerritoryFaction({ x: 0, z: 0 }, [])).toBeNull();
  });

  it('computes the territory radius as radius * TERRITORY_RADIUS_MULTIPLIER (returned in the match)', () => {
    const result = findTerritoryFaction({ x: 5, z: 0 }, settlements);
    expect(result!.territoryRadius).toBeCloseTo(20 * TERRITORY_RADIUS_MULTIPLIER, 9);
  });
});
