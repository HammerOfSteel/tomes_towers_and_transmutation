/**
 * buildingCreatorState.ts — Procedural Asset Designer / Building Designer
 * (asset-designer.md "Building Designer" contract; game-inventory.md 12b
 * "Building Creator first slice")
 *
 * Pure state-management layer for a future `building-creator.html` surface.
 * Mirrors `src/npc-creator/creatorState.ts`'s architecture: zero DOM/Three.js
 * dependencies so it's fully unit-testable, with the actual page just wiring
 * DOM events to these functions and calling `buildBuilding(dna)` for preview.
 *
 * Required first-slice output per game-inventory.md 12b:
 *   - building archetype selector      → setKind
 *   - faction style selector           → setFaction
 *   - size selector                    → setSize
 *   - live preview                     → buildBuilding(dna) (existing pipeline)
 *   - save to AssetLibrary             → toLibraryEntry
 */

import type {
  BuildingDNA, BuildingKind, BuildingSize, Faction, TerraceSide,
} from './BuildingDNA';
import { factionBuildingDna, FACTION_PRESETS } from './BuildingDNA';

// ── Supported pickers (per asset-designer.md + BuildingDNA contract) ─────────

export const BUILDING_CREATOR_KINDS: readonly BuildingKind[] = [
  'house', 'terraced', 'cottage', 'villa',
  'shop', 'inn', 'tavern', 'apothecary', 'market_stall',
  'guild', 'chapel',
  'tower', 'watchtower', 'blacksmith', 'barn',
  'well', 'gate', 'tent', 'ruin',
];

export const BUILDING_CREATOR_FACTIONS: readonly Faction[] =
  Object.keys(FACTION_PRESETS) as Faction[];

export const BUILDING_CREATOR_SIZES: readonly BuildingSize[] =
  ['tiny', 'small', 'medium', 'large'];

// ── Creator state ─────────────────────────────────────────────────────────────

export interface BuildingCreatorState {
  dna: BuildingDNA;
}

/** Fresh creator state seeded from `factionBuildingDna` for (kind, faction). */
export function createInitialBuildingState(
  kind: BuildingKind = 'house',
  faction: Faction = 'human_rural',
  seed: number = Date.now() >>> 0,
  size: BuildingSize = 'medium',
): BuildingCreatorState {
  return { dna: factionBuildingDna(kind, faction, seed, size) };
}

/** Switch archetype — footprint/interior layout re-derive from the new kind at build time. */
export function setKind(state: BuildingCreatorState, kind: BuildingKind): BuildingCreatorState {
  return { dna: { ...state.dna, buildingKind: kind, name: `${_factionOf(state)} ${kind}` } };
}

/** Switch faction — rebuilds style/colors/condition from FACTION_PRESETS, keeps kind/size/seed. */
export function setFaction(state: BuildingCreatorState, faction: Faction): BuildingCreatorState {
  const preset = FACTION_PRESETS[faction];
  return {
    dna: {
      ...state.dna,
      style: preset.style,
      colors: preset.colors,
      condition: preset.condition,
      name: `${faction} ${state.dna.buildingKind}`,
    },
  };
}

export function setSize(state: BuildingCreatorState, size: BuildingSize): BuildingCreatorState {
  return { dna: { ...state.dna, size } };
}

export function setFloors(state: BuildingCreatorState, floors: 1 | 2 | 3 | 4): BuildingCreatorState {
  return { dna: { ...state.dna, floors } };
}

export function setTerrace(state: BuildingCreatorState, terrace: TerraceSide): BuildingCreatorState {
  return { dna: { ...state.dna, terrace } };
}

export function setRotation(state: BuildingCreatorState, rotation: number): BuildingCreatorState {
  return { dna: { ...state.dna, rotation } };
}

export function toggleFeature(
  state: BuildingCreatorState,
  feature: BuildingDNA['features'][number],
): BuildingCreatorState {
  const has = state.dna.features.includes(feature);
  const features = has
    ? state.dna.features.filter(f => f !== feature)
    : [...state.dna.features, feature];
  return { dna: { ...state.dna, features } };
}

export function setColor(
  state: BuildingCreatorState,
  slot: keyof BuildingDNA['colors'],
  hex: string,
): BuildingCreatorState {
  return { dna: { ...state.dna, colors: { ...state.dna.colors, [slot]: hex } } };
}

export function setName(state: BuildingCreatorState, name: string): BuildingCreatorState {
  return { dna: { ...state.dna, name } };
}

function _factionOf(state: BuildingCreatorState): string {
  // Name is stored as "<faction> <kind>" by convention — recover the faction prefix.
  return state.dna.name.split(' ')[0] ?? 'human_rural';
}

// ── Asset Library bridge ──────────────────────────────────────────────────────

/**
 * Shape a LibraryEntry-ready payload for `AssetLibrary.add()`.
 * Caller supplies `id`/`createdAt`/`thumbnail` — this only maps DNA → fields
 * so buildingCreatorState.ts doesn't need to import AssetLibrary directly
 * (keeps this module dependency-light and testable in isolation).
 */
export function toLibraryPayload(state: BuildingCreatorState): {
  type: 'building';
  name: string;
  seed: number;
  tags: string[];
  data: BuildingDNA;
} {
  return {
    type: 'building',
    name: state.dna.name || `${state.dna.buildingKind} building`,
    seed: state.dna.seed,
    tags: [`kind:${state.dna.buildingKind}`, `style:${state.dna.style}`, `size:${state.dna.size}`],
    data: state.dna,
  };
}