/**
 * TileDNA.ts — TV-1 (Procedural Tile Designer data layer)
 *
 * Shared DNA schema for procedural terrain/dungeon/cave/settlement tiles.
 * Mirrors the ProceduralDNA pattern (PROC-A2) so tiles can eventually plug
 * into the same registry/builder conventions used by NPCs, enemies, props,
 * and buildings.
 *
 * A "tile" here is a data descriptor for a repeatable ground/wall/feature
 * unit — the actual mesh/material construction happens in category-specific
 * builders that are added incrementally (TV-3).
 */

// ── Categories ────────────────────────────────────────────────────────────────

export type TileCategory = 'ground' | 'wall' | 'ceiling' | 'feature' | 'transition';

// ── Biome / type groupings ────────────────────────────────────────────────────
// Deliberately broader than any single subsystem's biome enum (realm biomes,
// cave biomes, dungeon floor types, settlement ground) — the tile system is
// the common denominator all of them render through.

export type TileBiome =
  | 'grassland' | 'forest_floor' | 'desert' | 'tundra'
  | 'dungeon_stone' | 'cave_rock' | 'settlement_cobble' | 'water';

/** Known variant names per biome — see TV-2 in tile-designer.md for the full contract. */
export const TILE_VARIANTS: Readonly<Record<TileBiome, readonly string[]>> = {
  grassland:          ['short', 'lush', 'patchy'],
  forest_floor:       ['leaf_litter', 'moss', 'roots'],
  desert:             ['sand', 'cracked', 'dune'],
  tundra:             ['snow', 'ice_patch', 'frozen_ground'],
  dungeon_stone:      ['plain', 'mossy', 'cracked', 'scorched'],
  cave_rock:          ['wet', 'dry', 'crystal_veined', 'lava_rimmed'],
  settlement_cobble:  ['worn', 'new', 'decorated'],
  water:              ['shallow', 'deep'],
};

function isTileBiome(value: unknown): value is TileBiome {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TILE_VARIANTS, value);
}

/** Whether `variant` is one of the known variants for `biome`. Unknown variants are
 * still permitted (designers can author new ones) — this is advisory, not enforced. */
export function isKnownVariant(biome: TileBiome, variant: string): boolean {
  return (TILE_VARIANTS[biome] ?? []).includes(variant);
}

// ── TileDNA ───────────────────────────────────────────────────────────────────

export interface TileDNA {
  /** Schema version — bump when the shape changes incompatibly. */
  v: number;
  category: TileCategory;
  biome: TileBiome;
  /** Variant name — one of TILE_VARIANTS[biome] by convention, but not enforced. */
  variant: string;
  /** Deterministic seed — same seed + biome + variant → identical tile output. */
  seed: number;
  /** World-unit size of one tile edge. Default: 2. */
  size: number;
  /** Optional hex color override (e.g. "#7a8a6a") — bypasses biome default palette. */
  colorOverride?: string;
  /** Optional material roughness override [0–1]. Builder defaults to 0.85 when absent. */
  roughness?: number;
}

export const TILE_DNA_VERSION = 1;

/** Construct a default TileDNA for a given biome + variant + seed. */
export function makeTileDNA(
  biome: TileBiome,
  variant: string,
  seed: number,
  overrides: Partial<Pick<TileDNA, 'category' | 'size' | 'colorOverride' | 'roughness'>> = {},
): TileDNA {
  return {
    v: TILE_DNA_VERSION,
    category: overrides.category ?? defaultCategoryForBiome(biome),
    biome,
    variant,
    seed,
    size: overrides.size ?? 2,
    ...(overrides.colorOverride ? { colorOverride: overrides.colorOverride } : {}),
    ...(overrides.roughness !== undefined ? { roughness: overrides.roughness } : {}),
  };
}

function defaultCategoryForBiome(biome: TileBiome): TileCategory {
  switch (biome) {
    case 'dungeon_stone':
    case 'cave_rock':
      return 'wall';
    case 'water':
      return 'transition';
    default:
      return 'ground';
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: readonly TileCategory[] = ['ground', 'wall', 'ceiling', 'feature', 'transition'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export class TileDNAError extends Error {
  constructor(msg: string) {
    super(`TileDNA: ${msg}`);
    this.name = 'TileDNAError';
  }
}

/** Validate a raw parsed value as TileDNA, throwing TileDNAError on failure. */
export function validateTileDNA(raw: unknown): TileDNA {
  if (!isPlainObject(raw)) throw new TileDNAError('expected an object');
  if (raw.v !== TILE_DNA_VERSION) throw new TileDNAError(`unsupported version (got ${String(raw.v)})`);
  if (!VALID_CATEGORIES.includes(raw.category as TileCategory)) throw new TileDNAError(`invalid category "${String(raw.category)}"`);
  if (!isTileBiome(raw.biome)) throw new TileDNAError(`invalid biome "${String(raw.biome)}"`);
  if (typeof raw.variant !== 'string' || !raw.variant) throw new TileDNAError('variant must be a non-empty string');
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) throw new TileDNAError('seed must be a finite number');
  if (typeof raw.size !== 'number' || raw.size <= 0) throw new TileDNAError('size must be a positive number');
  if (raw.colorOverride !== undefined && typeof raw.colorOverride !== 'string') {
    throw new TileDNAError('colorOverride must be a string when present');
  }
  if (raw.roughness !== undefined && (typeof raw.roughness !== 'number' || raw.roughness < 0 || raw.roughness > 1)) {
    throw new TileDNAError('roughness must be a number in [0, 1] when present');
  }

  return {
    v: TILE_DNA_VERSION,
    category: raw.category as TileCategory,
    biome: raw.biome,
    variant: raw.variant,
    seed: raw.seed,
    size: raw.size,
    ...(typeof raw.colorOverride === 'string' ? { colorOverride: raw.colorOverride } : {}),
    ...(typeof raw.roughness === 'number' ? { roughness: raw.roughness } : {}),
  };
}

/** Stable identity key for a TileDNA — used by TileRegistry lookups and dedupe. */
export function tileDnaKey(biome: TileBiome, variant: string): string {
  return `${biome}:${variant}`;
}