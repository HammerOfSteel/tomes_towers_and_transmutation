/**
 * creatorState.ts — Procedural Asset Designer / NPC Designer (asset-designer.md)
 *
 * Pure state-management layer for the standalone `npc-creator.html` surface.
 * Deliberately has zero Three.js / DOM dependencies so it can be fully unit
 * tested — the HTML page just wires DOM events to these functions and calls
 * `buildNpc(dna)` (existing PROC-B1 builder) for the live preview.
 *
 * Covers the asset-designer.md contract for the NPC Designer:
 *   - species picker (current supported GameSpecies)
 *   - role picker (current NpcRole contract)
 *   - appearance controls layered on top of NpcDNA (bodyPreset, colors,
 *     accessories, personality, name)
 *   - save UI target: existing NPC gallery/share-code persistence
 */

import type { GameSpecies } from '@/procedural/ProceduralDNA';
import type {
  NpcDNA, NpcRole, NpcPersonality, NpcHatId, NpcToolId, NpcBadgeId, NpcColors,
} from './types';
import { ROLE_HAT, ROLE_TOOL, ROLE_BADGE } from './types';
import { getDefaultNpcDna } from './defaults/NpcDefaults';
import {
  addToNpcGallery, npcDnaToShareCode, shareCodeToNpcDna,
  type NpcGalleryEntry,
} from './gallery';

// ── Supported pickers (per asset-designer.md contract) ───────────────────────

export const NPC_CREATOR_SPECIES: readonly GameSpecies[] =
  ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];

export const NPC_CREATOR_ROLES: readonly NpcRole[] =
  ['merchant', 'elder', 'quest_giver', 'scholar', 'guard', 'innkeeper', 'mysterious'];

// ── Creator state ─────────────────────────────────────────────────────────────

export interface NpcCreatorState {
  dna: NpcDNA;
}

/** Fresh creator state seeded from the default builder for (species, role). */
export function createInitialState(
  species: GameSpecies = 'human',
  role: NpcRole = 'merchant',
  seed: number = Date.now() >>> 0,
): NpcCreatorState {
  return { dna: getDefaultNpcDna(species, role, seed) };
}

/**
 * Switch species — rebuilds appearance defaults for the new species while
 * preserving role, seed, and name (species change should not silently wipe a
 * hand-picked name).
 */
export function setSpecies(state: NpcCreatorState, species: GameSpecies): NpcCreatorState {
  const rebuilt = getDefaultNpcDna(species, state.dna.role, state.dna.seed);
  return { dna: { ...rebuilt, name: state.dna.name, personality: state.dna.personality } };
}

/**
 * Switch role — updates hat/tool/badge to the new role's defaults (per
 * ROLE_HAT/ROLE_TOOL/ROLE_BADGE) while preserving species/appearance/name.
 */
export function setRole(state: NpcCreatorState, role: NpcRole): NpcCreatorState {
  return {
    dna: {
      ...state.dna,
      role,
      hat: ROLE_HAT[role],
      tool: ROLE_TOOL[role],
      badge: ROLE_BADGE[role],
    },
  };
}

export function setPersonality(state: NpcCreatorState, personality: NpcPersonality): NpcCreatorState {
  return { dna: { ...state.dna, personality } };
}

export function setBodyPreset(state: NpcCreatorState, bodyPreset: 0 | 1 | 2): NpcCreatorState {
  return { dna: { ...state.dna, bodyPreset } };
}

export function setName(state: NpcCreatorState, name: string): NpcCreatorState {
  return { dna: { ...state.dna, name } };
}

export function setColor(state: NpcCreatorState, slot: keyof NpcColors, hex: string): NpcCreatorState {
  return { dna: { ...state.dna, colors: { ...state.dna.colors, [slot]: hex } } };
}

export function setHat(state: NpcCreatorState, hat: NpcHatId): NpcCreatorState {
  return { dna: { ...state.dna, hat } };
}

export function setTool(state: NpcCreatorState, tool: NpcToolId): NpcCreatorState {
  return { dna: { ...state.dna, tool } };
}

export function setBadge(state: NpcCreatorState, badge: NpcBadgeId): NpcCreatorState {
  return { dna: { ...state.dna, badge } };
}

/** Re-roll the dialogue_seed only — appearance stays fixed, dialogue lines shuffle. */
export function rerollDialogue(state: NpcCreatorState, seed: number = Date.now() >>> 0): NpcCreatorState {
  return { dna: { ...state.dna, dialogue_seed: (seed * 0x9E3779B9) >>> 0 } };
}

// ── Save / share ──────────────────────────────────────────────────────────────

/** Save the current NPC to the gallery, returning the persisted entry. */
export function saveToGallery(state: NpcCreatorState, thumb = ''): NpcGalleryEntry {
  const name = state.dna.name || `${state.dna.species} ${state.dna.role}`;
  return addToNpcGallery({ name, code: npcDnaToShareCode(state.dna), thumb });
}

/** Load a creator state from a saved gallery entry's share code. */
export function loadFromShareCode(code: string): NpcCreatorState | null {
  const dna = shareCodeToNpcDna(code);
  return dna ? { dna } : null;
}