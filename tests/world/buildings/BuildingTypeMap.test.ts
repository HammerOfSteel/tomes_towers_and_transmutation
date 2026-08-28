import { describe, it, expect } from 'vitest';
import { mapStudioFactionToRuntimeFaction } from '../../../src/world/buildings/BuildingTypeMap';

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
