import { describe, it, expect } from 'vitest';
import { pickQuatBuildingModelId } from '../QuatBuildingAdapter';

const RESIDENTIAL_VARIANTS = [
  'medieval_village_pack/buildings/House_1',
  'medieval_village_pack/buildings/House_2',
  'medieval_village_pack/buildings/House_3',
  'medieval_village_pack/buildings/House_4',
  'modern_type_buildings/city_pack/House1',
  'modern_type_buildings/city_pack/House2',
  'modern_type_buildings/city_pack/Building1_Small',
  'modern_type_buildings/city_pack/Building2_Small',
] as const;

const CIVIC_LARGE_VARIANTS = [
  'medieval_village_pack/buildings/Inn',
  'modern_type_buildings/city_pack/Building1_Large',
  'modern_type_buildings/city_pack/Building2_Large',
  'modern_type_buildings/city_pack/Building3_Big',
  'modern_type_buildings/city_pack/Building4',
] as const;

const GUILD_VARIANTS = [
  'medieval_village_pack/buildings/Mill',
  'modern_type_buildings/city_pack/Building1_Large',
  'modern_type_buildings/city_pack/Building4',
] as const;

const TOWER_VARIANTS = [
  'medieval_village_pack/buildings/Bell_Tower',
  'modern_type_buildings/city_pack/Building3_Small',
] as const;

describe('pickQuatBuildingModelId', () => {
  it.each([
    'house', 'terraced', 'cottage', 'shop', 'apothecary', 'ruin',
  ] as const)('cycles %s deterministically through all 8 residential variants by seed', (kind) => {
    const ids = RESIDENTIAL_VARIANTS.map((_, seed) => pickQuatBuildingModelId(kind, seed));
    expect(ids).toEqual(RESIDENTIAL_VARIANTS);
  });

  it('wraps around for seeds beyond the variant count', () => {
    expect(pickQuatBuildingModelId('house', RESIDENTIAL_VARIANTS.length)).toBe(RESIDENTIAL_VARIANTS[0]);
    expect(pickQuatBuildingModelId('house', RESIDENTIAL_VARIANTS.length + 1)).toBe(RESIDENTIAL_VARIANTS[1]);
  });

  it('is stable for negative seeds (no negative array index)', () => {
    expect(pickQuatBuildingModelId('house', -1)).toBe(RESIDENTIAL_VARIANTS[RESIDENTIAL_VARIANTS.length - 1]);
  });

  it.each(['villa', 'tavern', 'inn'] as const)(
    'cycles %s deterministically through the 5 civic-large variants by seed',
    (kind) => {
      const ids = CIVIC_LARGE_VARIANTS.map((_, seed) => pickQuatBuildingModelId(kind, seed));
      expect(ids).toEqual(CIVIC_LARGE_VARIANTS);
    },
  );

  it('cycles guild deterministically through the 3 guild variants by seed', () => {
    const ids = GUILD_VARIANTS.map((_, seed) => pickQuatBuildingModelId('guild', seed));
    expect(ids).toEqual(GUILD_VARIANTS);
  });

  it.each(['chapel', 'tower', 'watchtower'] as const)(
    'cycles %s deterministically through the 2 tower variants by seed',
    (kind) => {
      const ids = TOWER_VARIANTS.map((_, seed) => pickQuatBuildingModelId(kind, seed));
      expect(ids).toEqual(TOWER_VARIANTS);
    },
  );

  it.each([
    ['blacksmith', 'medieval_village_pack/buildings/Blacksmith'],
    ['barn', 'medieval_village_pack/buildings/Stable'],
    ['gate', 'medieval_village_pack/buildings/Stable'],
    ['well', 'medieval_village_pack/props/Well'],
    ['tent', 'medieval_village_pack/props/Gazebo'],
  ] as const)('maps %s → %s regardless of seed', (kind, expected) => {
    expect(pickQuatBuildingModelId(kind, 0)).toBe(expected);
    expect(pickQuatBuildingModelId(kind, 99)).toBe(expected);
  });

  it('cycles deterministically through both market-stall variants by seed', () => {
    expect(pickQuatBuildingModelId('market_stall', 0)).toBe('medieval_village_pack/props/MarketStand_1');
    expect(pickQuatBuildingModelId('market_stall', 1)).toBe('medieval_village_pack/props/MarketStand_2');
    expect(pickQuatBuildingModelId('market_stall', 2)).toBe('medieval_village_pack/props/MarketStand_1');
  });

  it.each([
    'house', 'terraced', 'cottage', 'villa', 'shop', 'inn', 'tavern',
    'apothecary', 'market_stall', 'guild', 'chapel', 'tower', 'watchtower',
    'blacksmith', 'barn', 'well', 'gate', 'tent', 'ruin',
  ] as const)('never returns null for any BuildingKind (%s) — no procedural fallback by design', (kind) => {
    expect(pickQuatBuildingModelId(kind, 0)).not.toBeNull();
  });
});
