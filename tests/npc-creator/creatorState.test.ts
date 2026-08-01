/**
 * creatorState.test.ts — Procedural Asset Designer / NPC Designer
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createInitialState, setSpecies, setRole, setPersonality, setBodyPreset,
  setName, setColor, setHat, setTool, setBadge, rerollDialogue,
  saveToGallery, loadFromShareCode,
  NPC_CREATOR_SPECIES, NPC_CREATOR_ROLES,
} from '@/npc-creator/creatorState';
import { ROLE_HAT, ROLE_TOOL, ROLE_BADGE } from '@/npc-creator/types';

// localStorage mock (gallery persistence)
const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
});

describe('NPC_CREATOR_SPECIES / NPC_CREATOR_ROLES', () => {
  it('lists the 7 supported species per asset-designer.md', () => {
    expect(NPC_CREATOR_SPECIES).toEqual([
      'human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic',
    ]);
  });

  it('lists the 7 supported roles per asset-designer.md', () => {
    expect(NPC_CREATOR_ROLES).toEqual([
      'merchant', 'elder', 'quest_giver', 'scholar', 'guard', 'innkeeper', 'mysterious',
    ]);
  });
});

describe('createInitialState', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialState('human', 'merchant', 123);
    const b = createInitialState('human', 'merchant', 123);
    expect(a.dna).toEqual(b.dna);
  });

  it('defaults to human merchant when no args given', () => {
    const state = createInitialState(undefined, undefined, 1);
    expect(state.dna.species).toBe('human');
    expect(state.dna.role).toBe('merchant');
  });
});

describe('setSpecies', () => {
  it('changes species and rebuilds appearance, but preserves name/personality', () => {
    const state = setName(createInitialState('human', 'guard', 5), 'Bob');
    const withPersonality = setPersonality(state, 'eccentric');
    const next = setSpecies(withPersonality, 'draconic');

    expect(next.dna.species).toBe('draconic');
    expect(next.dna.role).toBe('guard');
    expect(next.dna.name).toBe('Bob');
    expect(next.dna.personality).toBe('eccentric');
  });
});

describe('setRole', () => {
  it('updates hat/tool/badge to the new role defaults', () => {
    const state = createInitialState('elf', 'merchant', 9);
    const next = setRole(state, 'scholar');

    expect(next.dna.role).toBe('scholar');
    expect(next.dna.hat).toBe(ROLE_HAT.scholar);
    expect(next.dna.tool).toBe(ROLE_TOOL.scholar);
    expect(next.dna.badge).toBe(ROLE_BADGE.scholar);
    expect(next.dna.species).toBe('elf');
  });
});

describe('field setters', () => {
  const base = createInitialState('human', 'merchant', 1);

  it('setBodyPreset', () => {
    expect(setBodyPreset(base, 2).dna.bodyPreset).toBe(2);
  });

  it('setName', () => {
    expect(setName(base, 'Aldric').dna.name).toBe('Aldric');
  });

  it('setColor updates only the targeted slot', () => {
    const next = setColor(base, 'hair', '#123456');
    expect(next.dna.colors.hair).toBe('#123456');
    expect(next.dna.colors.skin).toBe(base.dna.colors.skin);
  });

  it('setHat / setTool / setBadge', () => {
    expect(setHat(base, 'crown_simple').dna.hat).toBe('crown_simple');
    expect(setTool(base, 'sword').dna.tool).toBe('sword');
    expect(setBadge(base, 'quest_seal').dna.badge).toBe('quest_seal');
  });
});

describe('rerollDialogue', () => {
  it('changes dialogue_seed but nothing else', () => {
    const base = createInitialState('human', 'merchant', 1);
    const next = rerollDialogue(base, 42);
    expect(next.dna.dialogue_seed).not.toBe(base.dna.dialogue_seed);
    expect(next.dna.species).toBe(base.dna.species);
    expect(next.dna.colors).toEqual(base.dna.colors);
  });

  it('is deterministic for the same seed', () => {
    const base = createInitialState('human', 'merchant', 1);
    expect(rerollDialogue(base, 42).dna.dialogue_seed)
      .toBe(rerollDialogue(base, 42).dna.dialogue_seed);
  });
});

describe('saveToGallery / loadFromShareCode', () => {
  it('round-trips a creator state through the gallery share code', () => {
    const state = setName(createInitialState('slime', 'innkeeper', 7), 'Glub');
    const entry = saveToGallery(state);

    expect(entry.name).toBe('Glub');
    expect(entry.code.startsWith('N')).toBe(true);

    const restored = loadFromShareCode(entry.code);
    expect(restored).not.toBeNull();
    expect(restored?.dna.species).toBe('slime');
    expect(restored?.dna.role).toBe('innkeeper');
    expect(restored?.dna.name).toBe('Glub');
  });

  it('falls back to "<species> <role>" when name is empty', () => {
    const state = createInitialState('draconic', 'guard', 3);
    const entry = saveToGallery(state);
    expect(entry.name).toBe('draconic guard');
  });

  it('loadFromShareCode returns null for garbage input', () => {
    expect(loadFromShareCode('not a real code')).toBeNull();
  });
});