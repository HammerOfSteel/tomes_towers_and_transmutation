/**
 * TileRegistry.test.ts — TV-4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TileRegistry } from '@/procedural/TileRegistry';
import { makeTileDNA } from '@/procedural/TileDNA';

describe('TileRegistry', () => {
  let reg: TileRegistry;

  beforeEach(() => { reg = new TileRegistry(); });

  it('starts empty', () => {
    expect(reg.size).toBe(0);
    expect(reg.getAllBase()).toHaveLength(0);
  });

  it('resolve() falls back to a deterministic default when unregistered', () => {
    const dna = reg.resolve('grassland', 'lush', 42);
    expect(dna).toEqual(makeTileDNA('grassland', 'lush', 42));
  });

  it('register() + resolve() returns the registered DNA', () => {
    const custom = makeTileDNA('grassland', 'lush', 1, { colorOverride: '#ff00ff' });
    reg.register(custom);
    expect(reg.resolve('grassland', 'lush', 999)).toEqual(custom);
    expect(reg.size).toBe(1);
  });

  it('register() with same biome+variant overwrites', () => {
    reg.register(makeTileDNA('desert', 'sand', 1));
    reg.register(makeTileDNA('desert', 'sand', 2, { size: 5 }));
    expect(reg.size).toBe(1);
    expect(reg.resolve('desert', 'sand', 0).seed).toBe(2);
  });

  it('registerForLocation() scopes an override to one location', () => {
    const base = makeTileDNA('dungeon_stone', 'plain', 1);
    const overridden = makeTileDNA('dungeon_stone', 'plain', 2, { colorOverride: '#332211' });
    reg.register(base);
    reg.registerForLocation('room-42', overridden);

    expect(reg.resolveForLocation('dungeon_stone', 'plain', 0, 'room-42')).toEqual(overridden);
    expect(reg.resolveForLocation('dungeon_stone', 'plain', 0, 'room-99')).toEqual(base);
    expect(reg.resolve('dungeon_stone', 'plain', 0)).toEqual(base);
  });

  it('registerForLocation() replaces an existing override for the same location', () => {
    const first = makeTileDNA('cave_rock', 'wet', 1);
    const second = makeTileDNA('cave_rock', 'wet', 2);
    reg.registerForLocation('cave-1', first);
    reg.registerForLocation('cave-1', second);

    const overrides = reg.getLocationOverrides('cave_rock', 'wet');
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.dna).toEqual(second);
  });

  it('clearLocationOverride() removes a specific override', () => {
    reg.registerForLocation('loc-a', makeTileDNA('tundra', 'snow', 1));
    reg.registerForLocation('loc-b', makeTileDNA('tundra', 'snow', 2));
    reg.clearLocationOverride('tundra', 'snow', 'loc-a');

    expect(reg.getLocationOverrides('tundra', 'snow')).toHaveLength(1);
    expect(reg.getLocationOverrides('tundra', 'snow')[0]!.locationId).toBe('loc-b');
  });

  it('clearLocationOverride() is a no-op when nothing is registered', () => {
    expect(() => reg.clearLocationOverride('tundra', 'snow', 'nope')).not.toThrow();
  });

  it('clear() empties both base and override maps', () => {
    reg.register(makeTileDNA('forest_floor', 'moss', 1));
    reg.registerForLocation('loc', makeTileDNA('forest_floor', 'moss', 2));
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.getLocationOverrides('forest_floor', 'moss')).toHaveLength(0);
  });
});