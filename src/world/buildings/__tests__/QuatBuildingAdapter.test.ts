import { describe, it, expect } from 'vitest';
import { pickQuatBuildingModelId } from '../QuatBuildingAdapter';

describe('pickQuatBuildingModelId', () => {
  it('cycles deterministically through all 4 house variants by seed', () => {
    const ids = [0, 1, 2, 3].map(seed => pickQuatBuildingModelId('house', seed));
    expect(ids).toEqual([
      'medieval_village_pack/buildings/House_1',
      'medieval_village_pack/buildings/House_2',
      'medieval_village_pack/buildings/House_3',
      'medieval_village_pack/buildings/House_4',
    ]);
  });

  it('wraps around for seeds beyond the variant count', () => {
    expect(pickQuatBuildingModelId('house', 4)).toBe('medieval_village_pack/buildings/House_1');
    expect(pickQuatBuildingModelId('house', 5)).toBe('medieval_village_pack/buildings/House_2');
  });

  it('is stable for negative seeds (no negative array index)', () => {
    expect(pickQuatBuildingModelId('house', -1)).toBe('medieval_village_pack/buildings/House_4');
  });

  it.each([
    ['inn', 'medieval_village_pack/buildings/Inn'],
    ['tavern', 'medieval_village_pack/buildings/Inn'],
    ['villa', 'medieval_village_pack/buildings/Inn'],
    ['blacksmith', 'medieval_village_pack/buildings/Blacksmith'],
    ['watchtower', 'medieval_village_pack/buildings/Bell_Tower'],
    ['tower', 'medieval_village_pack/buildings/Bell_Tower'],
    ['chapel', 'medieval_village_pack/buildings/Bell_Tower'],
    ['barn', 'medieval_village_pack/buildings/Stable'],
    ['gate', 'medieval_village_pack/buildings/Stable'],
    ['guild', 'medieval_village_pack/buildings/Mill'],
    ['well', 'medieval_village_pack/props/Well'],
    ['tent', 'medieval_village_pack/props/Gazebo'],
  ] as const)('maps %s → %s regardless of seed', (kind, expected) => {
    expect(pickQuatBuildingModelId(kind, 0)).toBe(expected);
    expect(pickQuatBuildingModelId(kind, 99)).toBe(expected);
  });

  it.each([
    'terraced', 'cottage', 'shop', 'apothecary', 'ruin',
  ] as const)('maps house-scale kind %s onto the house variants (reused stand-in)', (kind) => {
    expect(pickQuatBuildingModelId(kind, 0)).toBe('medieval_village_pack/buildings/House_1');
    expect(pickQuatBuildingModelId(kind, 1)).toBe('medieval_village_pack/buildings/House_2');
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
