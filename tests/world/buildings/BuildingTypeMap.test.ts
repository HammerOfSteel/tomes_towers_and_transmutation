import { describe, it, expect } from 'vitest';
import {
  mapStudioFactionToRuntimeFaction,
  createSettlementBuildingDna,
} from '../../../src/world/buildings/BuildingTypeMap';
import type { PlacedBuilding } from '../../../src/world/SettlementGenerator';

describe('mapStudioFactionToRuntimeFaction', () => {
  it('maps a known studio faction string to a valid runtime Faction', () => {
    const result = mapStudioFactionToRuntimeFaction('human');
    expect(typeof result).toBe('string');
    expect(result).toBe('human_town');
  });

  it('maps elven studio faction correctly', () => {
    expect(mapStudioFactionToRuntimeFaction('elven')).toBe('elven');
  });

  it('falls back to a default Faction for an unrecognized studio faction string', () => {
    const result = mapStudioFactionToRuntimeFaction('totally-unknown-faction-xyz');
    expect(typeof result).toBe('string');
    expect(result).toBe('human_town');
  });
});

describe('createSettlementBuildingDna — buildingKind override', () => {
  function makeBuilding(overrides: Partial<PlacedBuilding> = {}): PlacedBuilding {
    return {
      wardType: 'market', // WARD_TO_KIND['market'] === 'shop'
      isAnchor: true,
      col: 0,
      row: 0,
      offsetX: 0,
      offsetZ: 0,
      rotation: 0,
      seed: 1,
      ...overrides,
    };
  }

  it('uses WARD_TO_KIND when no override is given (existing behaviour)', () => {
    const dna = createSettlementBuildingDna(makeBuilding(), 'village', 'human_town');
    expect(dna?.buildingKind).toBe('shop');
  });

  it('uses the override kind instead of WARD_TO_KIND when given', () => {
    const dna = createSettlementBuildingDna(makeBuilding(), 'village', 'human_town', 'watchtower');
    expect(dna?.buildingKind).toBe('watchtower');
  });

  it('applies the override to non-anchor buildings too', () => {
    const dna = createSettlementBuildingDna(
      makeBuilding({ isAnchor: false, wardType: 'farm' }), // WARD_TO_KIND['farm'] === 'house'
      'village', 'human_town', 'watchtower',
    );
    expect(dna?.buildingKind).toBe('watchtower');
  });

  it('overrides even a ward whose own mapping differs entirely from the override', () => {
    const dna = createSettlementBuildingDna(
      makeBuilding({ wardType: 'slum' }), // WARD_TO_KIND['slum'] === 'terraced'
      'city', 'elven', 'tower',
    );
    expect(dna?.buildingKind).toBe('tower');
  });
});
