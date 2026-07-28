/**
 * creatorState.test.ts — Procedural Asset Designer / Prop Designer
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialPropState, setPropKind, setMaterial, setTheme, setCondition,
  setSize, setColor, setGlow, setGlowIntensity, setName, setInteractionType,
  toLibraryPayload,
  PROP_CREATOR_KINDS, PROP_CREATOR_MATERIALS, PROP_CREATOR_THEMES, PROP_CREATOR_CONDITIONS,
} from '@/prop-creator/creatorState';
import { MATERIAL_COLORS, KIND_DEFAULT_MATERIAL } from '@/prop-creator/types';

describe('picker lists', () => {
  it('PROP_CREATOR_KINDS lists all 12 PropKinds', () => {
    expect(PROP_CREATOR_KINDS).toEqual([
      'chest', 'bookshelf', 'table', 'chair', 'cauldron', 'lantern',
      'pillar', 'rug', 'door', 'statue', 'barrel', 'crate',
    ]);
  });

  it('PROP_CREATOR_MATERIALS matches PropMaterial', () => {
    expect(PROP_CREATOR_MATERIALS).toEqual(['stone', 'wood', 'bone', 'crystal', 'iron', 'clay']);
  });

  it('PROP_CREATOR_THEMES matches PropTheme', () => {
    expect(PROP_CREATOR_THEMES).toEqual(['dungeon', 'library', 'alchemy', 'observatory', 'overworld', 'residential']);
  });

  it('PROP_CREATOR_CONDITIONS matches PropCondition', () => {
    expect(PROP_CREATOR_CONDITIONS).toEqual(['pristine', 'weathered', 'damaged', 'ruined']);
  });
});

describe('createInitialPropState', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialPropState('chest', 'wood', 42);
    const b = createInitialPropState('chest', 'wood', 42);
    expect(a.dna).toEqual(b.dna);
  });

  it('defaults to chest/wood, not interactive, no glow', () => {
    const state = createInitialPropState();
    expect(state.dna.propKind).toBe('chest');
    expect(state.dna.material).toBe('wood');
    expect(state.dna.interactive).toBe(false);
    expect(state.dna.glow).toBe(false);
    expect(state.interactionType).toBe('none');
  });
});

describe('setPropKind', () => {
  it('rebuilds the default material/colours for the new kind, preserves name/seed', () => {
    const state = setName(createInitialPropState('chest', 'wood', 7), 'My Chest');
    const next  = setPropKind(state, 'pillar');

    expect(next.dna.propKind).toBe('pillar');
    expect(next.dna.material).toBe(KIND_DEFAULT_MATERIAL['pillar']);
    expect(next.dna.colors).toEqual(MATERIAL_COLORS[KIND_DEFAULT_MATERIAL['pillar']]);
    expect(next.dna.seed).toBe(7);
    expect(next.dna.name).toBe('My Chest');
  });
});

describe('setMaterial', () => {
  it('rebuilds the colour palette for the new material', () => {
    const state = createInitialPropState('lantern', 'iron', 1);
    const next  = setMaterial(state, 'crystal');
    expect(next.dna.material).toBe('crystal');
    expect(next.dna.colors).toEqual(MATERIAL_COLORS['crystal']);
  });
});

describe('field setters', () => {
  const base = createInitialPropState('table', 'wood', 1);

  it('setTheme', () => {
    expect(setTheme(base, 'alchemy').dna.theme).toBe('alchemy');
  });

  it('setCondition', () => {
    expect(setCondition(base, 'ruined').dna.condition).toBe('ruined');
  });

  it('setSize', () => {
    expect(setSize(base, 1.5).dna.size).toBe(1.5);
  });

  it('setColor updates only the targeted slot', () => {
    const next = setColor(base, 'detail', '#ff00ff');
    expect(next.dna.colors.detail).toBe('#ff00ff');
    expect(next.dna.colors.base).toBe(base.dna.colors.base);
  });

  it('setGlow / setGlowIntensity', () => {
    expect(setGlow(base, true).dna.glow).toBe(true);
    expect(setGlowIntensity(base, 0.7).dna.glowIntensity).toBe(0.7);
  });

  it('setName', () => {
    expect(setName(base, 'Rickety Table').dna.name).toBe('Rickety Table');
  });
});

describe('setInteractionType', () => {
  it('"none" keeps interactive false', () => {
    const next = setInteractionType(createInitialPropState(), 'none');
    expect(next.interactionType).toBe('none');
    expect(next.dna.interactive).toBe(false);
  });

  it('any non-none type sets interactive true', () => {
    for (const t of ['lootable', 'readable', 'usable'] as const) {
      const next = setInteractionType(createInitialPropState(), t);
      expect(next.interactionType).toBe(t);
      expect(next.dna.interactive).toBe(true);
    }
  });
});

describe('toLibraryPayload', () => {
  it('maps DNA to a prop-typed library payload with descriptive tags', () => {
    const state = createInitialPropState('cauldron', 'iron', 12);
    const payload = toLibraryPayload(state);

    expect(payload.type).toBe('prop');
    expect(payload.seed).toBe(12);
    expect(payload.tags).toEqual(
      expect.arrayContaining(['kind:cauldron', 'material:iron', 'theme:dungeon', 'interaction:none']),
    );
    expect(payload.data).toEqual(state.dna);
  });

  it('falls back to "<material> <kind>" when name is empty', () => {
    const state = setName(createInitialPropState('barrel', 'wood', 1), '');
    expect(toLibraryPayload(state).name).toBe('wood barrel');
  });
});
