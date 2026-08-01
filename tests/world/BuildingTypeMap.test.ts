import { describe, it, expect } from 'vitest';
import { settlementTypeToFaction } from '@/world/buildings/BuildingTypeMap';

describe('settlementTypeToFaction', () => {
  it('maps each settlement tier to a distinct human Faction', () => {
    expect(settlementTypeToFaction('village')).toBe('human_rural');
    expect(settlementTypeToFaction('town')).toBe('human_town');
    expect(settlementTypeToFaction('city')).toBe('human_noble');
  });
});
