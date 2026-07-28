/**
 * creatorState.ts — Procedural Asset Designer / Prop Designer
 * (asset-designer.md "Prop Designer"; PROC-B3 groundwork already shipped
 * `types.ts`/`builder.ts`)
 *
 * Pure state-management layer for the standalone Prop Creator surface.
 * Mirrors `src/npc-creator/creatorState.ts` / `src/enemy-creator/creatorState.ts`'s
 * architecture exactly: zero DOM/Three.js dependencies, fully unit-tested —
 * the actual UI just wires DOM events to these functions and calls
 * `buildProp(dna)` (existing PROC-B3 builder) for the live preview.
 */

import type { PropDNA, PropKind, PropMaterial, PropTheme, PropCondition, PropColors } from './types';
import { MATERIAL_COLORS, KIND_DEFAULT_MATERIAL } from './types';

// ── Supported pickers (per PropDNA contract) ─────────────────────────────────

export const PROP_CREATOR_KINDS: readonly PropKind[] = [
  'chest', 'bookshelf', 'table', 'chair', 'cauldron', 'lantern',
  'pillar', 'rug', 'door', 'statue', 'barrel', 'crate',
];

export const PROP_CREATOR_MATERIALS: readonly PropMaterial[] =
  ['stone', 'wood', 'bone', 'crystal', 'iron', 'clay'];

export const PROP_CREATOR_THEMES: readonly PropTheme[] =
  ['dungeon', 'library', 'alchemy', 'observatory', 'overworld', 'residential'];

export const PROP_CREATOR_CONDITIONS: readonly PropCondition[] =
  ['pristine', 'weathered', 'damaged', 'ruined'];

// ── Interaction type (per asset-designer.md's Prop Designer spec) ───────────

export type PropInteractionType = 'none' | 'lootable' | 'readable' | 'usable';

// ── Creator state ─────────────────────────────────────────────────────────────

export interface PropCreatorState {
  dna: PropDNA;
  /** UI-facing interaction type; PropDNA only has a boolean `interactive` flag
   *  so this is kept alongside the DNA and folded into the library tag on save. */
  interactionType: PropInteractionType;
}

function defaultName(kind: PropKind, material: PropMaterial): string {
  return `${material} ${kind}`.replace(/_/g, ' ');
}

/** Fresh creator state seeded from defaults for (kind, material). */
export function createInitialPropState(
  kind: PropKind = 'chest',
  material: PropMaterial = KIND_DEFAULT_MATERIAL['chest'],
  seed: number = Date.now() >>> 0,
): PropCreatorState {
  const dna: PropDNA = {
    v: 1,
    kind: 'prop',
    name: defaultName(kind, material),
    seed,
    propKind: kind,
    material,
    theme: 'dungeon',
    condition: 'pristine',
    size: 1,
    colors: MATERIAL_COLORS[material],
    interactive: false,
    glow: false,
    glowIntensity: 0,
  };
  return { dna, interactionType: 'none' };
}

/** Switch prop kind — rebuilds the default material for the new kind, preserves theme/condition/name/seed. */
export function setPropKind(state: PropCreatorState, kind: PropKind): PropCreatorState {
  const material = KIND_DEFAULT_MATERIAL[kind];
  return {
    ...state,
    dna: { ...state.dna, propKind: kind, material, colors: MATERIAL_COLORS[material] },
  };
}

/** Switch material — rebuilds the default colour palette for the new material. */
export function setMaterial(state: PropCreatorState, material: PropMaterial): PropCreatorState {
  return { ...state, dna: { ...state.dna, material, colors: MATERIAL_COLORS[material] } };
}

export function setTheme(state: PropCreatorState, theme: PropTheme): PropCreatorState {
  return { ...state, dna: { ...state.dna, theme } };
}

export function setCondition(state: PropCreatorState, condition: PropCondition): PropCreatorState {
  return { ...state, dna: { ...state.dna, condition } };
}

export function setSize(state: PropCreatorState, size: number): PropCreatorState {
  return { ...state, dna: { ...state.dna, size } };
}

export function setColor(state: PropCreatorState, slot: keyof PropColors, hex: string): PropCreatorState {
  return { ...state, dna: { ...state.dna, colors: { ...state.dna.colors, [slot]: hex } } };
}

export function setGlow(state: PropCreatorState, glow: boolean): PropCreatorState {
  return { ...state, dna: { ...state.dna, glow } };
}

export function setGlowIntensity(state: PropCreatorState, glowIntensity: number): PropCreatorState {
  return { ...state, dna: { ...state.dna, glowIntensity } };
}

export function setName(state: PropCreatorState, name: string): PropCreatorState {
  return { ...state, dna: { ...state.dna, name } };
}

/**
 * Set the UI-facing interaction type. `none` clears PropDNA.interactive;
 * anything else sets it true (the builder's collision metadata only cares
 * about the boolean — the richer interaction semantics belong to
 * whatever runtime system consumes the saved library entry).
 */
export function setInteractionType(state: PropCreatorState, interactionType: PropInteractionType): PropCreatorState {
  return {
    ...state,
    interactionType,
    dna: { ...state.dna, interactive: interactionType !== 'none' },
  };
}

// ── Asset Library bridge ──────────────────────────────────────────────────────

/**
 * Shape a LibraryEntry-ready payload for `AssetLibrary.add()`.
 * Mirrors `enemyCreatorState.ts`'s `toLibraryPayload` convention — caller
 * supplies `id`/`createdAt`/`thumbnail`, keeping this module free of an
 * AssetLibrary import for isolated testability.
 */
export function toLibraryPayload(state: PropCreatorState): {
  type: 'prop';
  name: string;
  seed: number;
  tags: string[];
  data: PropDNA;
} {
  return {
    type: 'prop',
    name: state.dna.name || defaultName(state.dna.propKind, state.dna.material),
    seed: state.dna.seed,
    tags: [
      `kind:${state.dna.propKind}`,
      `material:${state.dna.material}`,
      `theme:${state.dna.theme}`,
      `interaction:${state.interactionType}`,
    ],
    data: state.dna,
  };
}
