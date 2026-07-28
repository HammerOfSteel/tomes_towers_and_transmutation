/**
 * tileCreatorState.ts — Procedural Tile Designer (TV-3)
 *
 * Pure state-management layer for the standalone Tile Creator surface.
 * Mirrors the npc/building/enemy/prop creatorState architecture: zero
 * DOM/Three.js dependencies, fully unit-tested — the actual UI just wires
 * DOM events to these functions and calls `buildTile(dna)` for the live
 * preview.
 */

import type { TileDNA, TileCategory, TileBiome } from './TileDNA';
import { TILE_VARIANTS, makeTileDNA } from './TileDNA';
import { resolveTileColor } from './TileColor';

// ── Supported pickers (per TileDNA contract) ─────────────────────────────────

export const TILE_CREATOR_CATEGORIES: readonly TileCategory[] =
  ['ground', 'wall', 'ceiling', 'feature', 'transition'];

export const TILE_CREATOR_BIOMES: readonly TileBiome[] =
  Object.keys(TILE_VARIANTS) as TileBiome[];

/** Known variants for a biome, per TV-2's table. */
export function variantsForBiome(biome: TileBiome): readonly string[] {
  return TILE_VARIANTS[biome];
}

// ── Creator state ─────────────────────────────────────────────────────────────

export interface TileCreatorState {
  dna: TileDNA;
  /** Whether the user has explicitly picked a colour (vs using the palette default). */
  hasColorOverride: boolean;
}

/** Fresh creator state seeded from defaults for (biome, variant). */
export function createInitialTileState(
  biome: TileBiome = 'grassland',
  variant: string = TILE_VARIANTS['grassland'][0],
  seed: number = Date.now() >>> 0,
): TileCreatorState {
  return { dna: makeTileDNA(biome, variant, seed), hasColorOverride: false };
}

/** Switch biome — resets variant to the new biome's first known variant, clears colour override. */
export function setBiome(state: TileCreatorState, biome: TileBiome): TileCreatorState {
  const variant = TILE_VARIANTS[biome][0];
  const dna = makeTileDNA(biome, variant, state.dna.seed, {
    category: state.dna.category,
    size: state.dna.size,
    roughness: state.dna.roughness,
  });
  return { dna, hasColorOverride: false };
}

/** Switch variant within the current biome, clears colour override. */
export function setVariant(state: TileCreatorState, variant: string): TileCreatorState {
  const dna = makeTileDNA(state.dna.biome, variant, state.dna.seed, {
    category: state.dna.category,
    size: state.dna.size,
    roughness: state.dna.roughness,
  });
  return { dna, hasColorOverride: false };
}

export function setCategory(state: TileCreatorState, category: TileCategory): TileCreatorState {
  return { ...state, dna: { ...state.dna, category } };
}

export function setSize(state: TileCreatorState, size: number): TileCreatorState {
  return { ...state, dna: { ...state.dna, size } };
}

export function setRoughness(state: TileCreatorState, roughness: number): TileCreatorState {
  return { ...state, dna: { ...state.dna, roughness } };
}

export function setColorOverride(state: TileCreatorState, hex: string): TileCreatorState {
  return { dna: { ...state.dna, colorOverride: hex }, hasColorOverride: true };
}

/** Revert to the biome/variant's palette default colour. */
export function clearColorOverride(state: TileCreatorState): TileCreatorState {
  const { colorOverride: _drop, ...rest } = state.dna;
  return { dna: rest, hasColorOverride: false };
}

export function setSeed(state: TileCreatorState, seed: number): TileCreatorState {
  return { ...state, dna: { ...state.dna, seed } };
}

/** Currently displayed colour (override if set, else the resolved palette default). */
export function currentColor(state: TileCreatorState): string {
  return resolveTileColor(state.dna);
}

// ── Generate variations ───────────────────────────────────────────────────────

/**
 * "Generate variations" — deterministically seed `count` sibling TileDNAs
 * for the current (category, biome, variant), each with a distinct seed
 * derived from `baseSeed`. Pure function: caller decides what to do with the
 * results (render swatches, let the user pick one to adopt).
 */
export function generateVariationSeeds(
  state: TileCreatorState,
  count: number,
  baseSeed: number = Date.now() >>> 0,
): TileDNA[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const seed = (baseSeed ^ (i * 0x9E37_79B9)) >>> 0;
    return makeTileDNA(state.dna.biome, state.dna.variant, seed, {
      category: state.dna.category,
      size: state.dna.size,
      roughness: state.dna.roughness,
    });
  });
}

/** Adopt one of the generated variation DNAs as the active state. */
export function adoptVariation(_state: TileCreatorState, dna: TileDNA): TileCreatorState {
  return { dna, hasColorOverride: dna.colorOverride !== undefined };
}

// ── Asset Library bridge ──────────────────────────────────────────────────────

/**
 * Shape a LibraryEntry-ready payload for `AssetLibrary.add()`.
 * Mirrors the other creatorState modules' `toLibraryPayload` convention —
 * caller supplies `id`/`createdAt`/`thumbnail`, keeping this module free of
 * an AssetLibrary import for isolated testability.
 */
export function toLibraryPayload(state: TileCreatorState): {
  type: 'tile';
  name: string;
  seed: number;
  tags: string[];
  data: TileDNA;
} {
  return {
    type: 'tile',
    name: `${state.dna.biome} ${state.dna.variant}`.replace(/_/g, ' '),
    seed: state.dna.seed,
    tags: [
      `category:${state.dna.category}`,
      `biome:${state.dna.biome}`,
      `variant:${state.dna.variant}`,
    ],
    data: state.dna,
  };
}
