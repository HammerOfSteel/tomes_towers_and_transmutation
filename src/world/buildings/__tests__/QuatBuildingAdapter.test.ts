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
    ['blacksmith', 'medieval_village_pack/buildings/Blacksmith'],
    ['watchtower', 'medieval_village_pack/buildings/Bell_Tower'],
    ['tower', 'medieval_village_pack/buildings/Bell_Tower'],
    ['barn', 'medieval_village_pack/buildings/Stable'],
  ] as const)('maps %s → %s regardless of seed', (kind, expected) => {
    expect(pickQuatBuildingModelId(kind, 0)).toBe(expected);
    expect(pickQuatBuildingModelId(kind, 99)).toBe(expected);
  });

  it.each([
    'shop', 'guild', 'chapel', 'cottage', 'villa', 'terraced',
    'apothecary', 'market_stall', 'gate', 'tent', 'well', 'ruin',
  ] as const)('returns null for unmapped kind %s (falls through to procedural)', (kind) => {
    expect(pickQuatBuildingModelId(kind, 0)).toBeNull();
  });
});
