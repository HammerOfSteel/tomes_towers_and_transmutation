/**
 * buildingCreatorState.test.ts — Procedural Asset Designer / Building Designer
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialBuildingState, setKind, setFaction, setSize, setFloors,
  setTerrace, setRotation, toggleFeature, setColor, setName, toLibraryPayload,
  BUILDING_CREATOR_KINDS, BUILDING_CREATOR_FACTIONS, BUILDING_CREATOR_SIZES,
} from '@/world/buildings/buildingCreatorState';
import { FACTION_PRESETS } from '@/world/buildings/BuildingDNA';

describe('picker lists', () => {
  it('BUILDING_CREATOR_KINDS covers every BuildingKind from BuildingDNA', () => {
    expect(BUILDING_CREATOR_KINDS).toContain('house');
    expect(BUILDING_CREATOR_KINDS).toContain('watchtower');
    expect(BUILDING_CREATOR_KINDS).toContain('ruin');
    expect(BUILDING_CREATOR_KINDS.length).toBe(19);
  });

  it('BUILDING_CREATOR_FACTIONS matches FACTION_PRESETS keys', () => {
    expect(new Set(BUILDING_CREATOR_FACTIONS)).toEqual(new Set(Object.keys(FACTION_PRESETS)));
  });

  it('BUILDING_CREATOR_SIZES lists all 4 sizes', () => {
    expect(BUILDING_CREATOR_SIZES).toEqual(['tiny', 'small', 'medium', 'large']);
  });
});

describe('createInitialBuildingState', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialBuildingState('house', 'human_rural', 42);
    const b = createInitialBuildingState('house', 'human_rural', 42);
    expect(a.dna).toEqual(b.dna);
  });

  it('defaults to house/human_rural/medium', () => {
    const state = createInitialBuildingState(undefined, undefined, 1);
    expect(state.dna.buildingKind).toBe('house');
    expect(state.dna.style).toBe(FACTION_PRESETS.human_rural.style);
    expect(state.dna.size).toBe('medium');
  });
});

describe('setKind', () => {
  it('changes buildingKind and updates the name prefix-preserving convention', () => {
    const state = createInitialBuildingState('house', 'elven', 1);
    const next = setKind(state, 'tavern');
    expect(next.dna.buildingKind).toBe('tavern');
    expect(next.dna.name).toBe('elven tavern');
  });
});

describe('setFaction', () => {
  it('rebuilds style/colors/condition but keeps kind/size/seed', () => {
    const state = createInitialBuildingState('inn', 'human_rural', 7, 'large');
    const next = setFaction(state, 'dwarven');

    expect(next.dna.style).toBe(FACTION_PRESETS.dwarven.style);
    expect(next.dna.colors).toEqual(FACTION_PRESETS.dwarven.colors);
    expect(next.dna.condition).toBe(FACTION_PRESETS.dwarven.condition);
    expect(next.dna.buildingKind).toBe('inn');
    expect(next.dna.size).toBe('large');
    expect(next.dna.seed).toBe(7);
    expect(next.dna.name).toBe('dwarven inn');
  });
});

describe('field setters', () => {
  const base = createInitialBuildingState('house', 'human_rural', 1);

  it('setSize', () => {
    expect(setSize(base, 'tiny').dna.size).toBe('tiny');
  });

  it('setFloors', () => {
    expect(setFloors(base, 3).dna.floors).toBe(3);
  });

  it('setTerrace', () => {
    expect(setTerrace(base, 'left').dna.terrace).toBe('left');
  });

  it('setRotation', () => {
    expect(setRotation(base, 1.57).dna.rotation).toBeCloseTo(1.57);
  });

  it('setName', () => {
    expect(setName(base, 'The Rusty Anchor').dna.name).toBe('The Rusty Anchor');
  });

  it('setColor updates only the targeted slot', () => {
    const next = setColor(base, 'roof', '#ff00ff');
    expect(next.dna.colors.roof).toBe('#ff00ff');
    expect(next.dna.colors.walls).toBe(base.dna.colors.walls);
  });
});

describe('toggleFeature', () => {
  it('adds a feature when absent, removes it when present', () => {
    const base = createInitialBuildingState('villa', 'human_noble', 1);
    expect(base.dna.features).toEqual([]);

    const withBay = toggleFeature(base, 'bay_window');
    expect(withBay.dna.features).toEqual(['bay_window']);

    const withoutBay = toggleFeature(withBay, 'bay_window');
    expect(withoutBay.dna.features).toEqual([]);
  });

  it('supports multiple simultaneous features', () => {
    let state = createInitialBuildingState('chapel', 'human_noble', 1);
    state = toggleFeature(state, 'buttress');
    state = toggleFeature(state, 'battlements');
    expect(state.dna.features.sort()).toEqual(['battlements', 'buttress']);
  });
});

describe('toLibraryPayload', () => {
  it('maps DNA to a building-typed library payload with descriptive tags', () => {
    const state = createInitialBuildingState('blacksmith', 'dwarven', 55, 'large');
    const payload = toLibraryPayload(state);

    expect(payload.type).toBe('building');
    expect(payload.seed).toBe(55);
    expect(payload.tags).toEqual(
      expect.arrayContaining(['kind:blacksmith', 'style:dwarven', 'size:large']),
    );
    expect(payload.data).toEqual(state.dna);
  });

  it('falls back to "<kind> building" when name is empty', () => {
    const state = createInitialBuildingState('house', 'human_rural', 1);
    const forced = setName(state, '');
    expect(toLibraryPayload(forced).name).toBe('house building');
  });
});