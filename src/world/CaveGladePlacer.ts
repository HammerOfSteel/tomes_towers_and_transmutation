/**
 * CaveGladePlacer.ts — 02-game-world-integration (CG-3)
 *
 * Pure data transform: places deterministic cave and glade markers on the
 * realm map, given the same `RealmTerrainInput` shape RI-1's
 * `realmToTerrain()` consumes (`RealmData.cells`/`W`/`H`/`seed`).
 *
 * Historical deviation from the spec, now partially resolved: `RealmBiome`
 * originally had no `mountain` or `bog` biome ("Caves: prefer mountain/bog/
 * tundra biomes" in the spec), so this module adapted that intent to the
 * biomes that existed at the time: high-elevation cells
 * (`elevation >= CAVE_ELEVATION_THRESHOLD`, the closest analogue to
 * "mountain") or `tundra`/`taiga` cells (cold + often-wet, the closest
 * analogue to "bog"). Phase 1 of the biome/terrain overhaul added a real
 * `mountain` `RealmBiome` value, so `isMountainOrBogLike()` now also checks
 * `biome === 'mountain'` directly (catching cells whose elevation sits in
 * the mountain-classification band but below the historical elevation
 * threshold) — the elevation-threshold check is kept alongside it rather
 * than replaced, since no real "bog" biome exists yet to fully retire the
 * approximation. Glades prefer `forest`/`taiga` biomes, matching the spec
 * directly.
 *
 * Like `DungeonSiteMetadata.ts`, this deliberately does **not** modify
 * `overworld-studio.ts`'s `RealmData` interface or `generateRealmData()` —
 * `RealmData` doesn't have `caves`/`glades` fields yet, and extending a
 * large DOM-coupled generator function carries real risk of breaking the
 * working Studio page. Instead this is a standalone placement pass that
 * runs on the same cell grid the Studio already produces, producing its
 * own `CaveMarker[]`/`GladeMarker[]` that a caller can merge into
 * `RealmData` (or store alongside it) however the eventual integration
 * step decides to wire things up.
 */

import { mulberry32 } from '@/core/prng';
import type { RealmTerrainInput } from './RealmToTerrain';

/** Elevation (RealmCell.elevation, expected in [0, 1]) above which a cell counts as "mountain-like" for cave placement. */
export const CAVE_ELEVATION_THRESHOLD = 0.75;

/** CG-1 entrance-prop biome variants. */
export type CaveEntranceBiome = 'crystal' | 'lava' | 'ice' | 'fungal' | 'ancient';

export const CAVE_ENTRANCE_BIOMES: readonly CaveEntranceBiome[] = ['crystal', 'lava', 'ice', 'fungal', 'ancient'];

export interface CaveMarker {
  x: number;
  y: number;
  seed: number;
  biome: CaveEntranceBiome;
}

export interface GladeMarker {
  x: number;
  y: number;
  seed: number;
}

export interface PlaceCaveGladeOptions {
  /** How many caves to place (spec: 2-4). Defaults to a seeded random value in that range. */
  caveCount?: number;
  /** How many glades to place (spec: 1-3). Defaults to a seeded random value in that range. */
  gladeCount?: number;
  /** Minimum realm-cell distance between any two placed markers (caves, glades, and `avoid` points). */
  minSpacing?: number;
  /** Existing marker positions (e.g. settlements/dungeons) to steer clear of. */
  avoid?: ReadonlyArray<{ x: number; y: number }>;
}

const DEFAULT_MIN_SPACING = 4;

function isMountainOrBogLike(cell: { elevation: number; biome: string }): boolean {
  return cell.elevation >= CAVE_ELEVATION_THRESHOLD || cell.biome === 'mountain' || cell.biome === 'tundra' || cell.biome === 'taiga';
}

function isForestLike(cell: { biome: string }): boolean {
  return cell.biome === 'forest' || cell.biome === 'taiga';
}

function isLandCell(cell: { biome: string }): boolean {
  return cell.biome !== 'deep_ocean' && cell.biome !== 'ocean';
}

/** Fisher-Yates shuffle using a seeded PRNG, for deterministic-but-unbiased candidate ordering. */
function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function farEnough(
  candidate: { x: number; y: number },
  placed: ReadonlyArray<{ x: number; y: number }>,
  minSpacing: number,
): boolean {
  return placed.every(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) >= minSpacing);
}

export interface CaveGladePlacement {
  caves: CaveMarker[];
  glades: GladeMarker[];
}

/**
 * CG-3 — deterministically place cave and glade markers across the realm
 * map's land cells. Same `(input, options)` always produces the same
 * result — no THREE.js, no DOM.
 */
export function placeCavesAndGlades(
  input: RealmTerrainInput,
  options: PlaceCaveGladeOptions = {},
): CaveGladePlacement {
  const rand = mulberry32(input.seed ^ 0xC4_5E_9B_17);
  const minSpacing = options.minSpacing ?? DEFAULT_MIN_SPACING;
  const caveCount = options.caveCount ?? (2 + Math.floor(rand() * 3)); // 2-4
  const gladeCount = options.gladeCount ?? (1 + Math.floor(rand() * 3)); // 1-3

  const allCells: Array<{ x: number; y: number; elevation: number; biome: string }> = [];
  for (let y = 0; y < input.H; y++) {
    for (let x = 0; x < input.W; x++) {
      const cell = input.cells[y]?.[x];
      if (!cell || !isLandCell(cell)) continue;
      allCells.push({ x, y, elevation: cell.elevation, biome: cell.biome });
    }
  }

  const placed: Array<{ x: number; y: number }> = [...(options.avoid ?? [])];

  const caveCandidates = shuffled(allCells.filter(isMountainOrBogLike), rand);
  const caves: CaveMarker[] = [];
  for (const cell of caveCandidates) {
    if (caves.length >= caveCount) break;
    if (!farEnough(cell, placed, minSpacing)) continue;
    const seed = (input.seed ^ Math.imul(cell.x + 1, 2654435761) ^ Math.imul(cell.y + 1, 40503)) >>> 0;
    const biome = CAVE_ENTRANCE_BIOMES[Math.floor(rand() * CAVE_ENTRANCE_BIOMES.length)]!;
    caves.push({ x: cell.x, y: cell.y, seed, biome });
    placed.push(cell);
  }

  const gladeCandidates = shuffled(allCells.filter(isForestLike), rand);
  const glades: GladeMarker[] = [];
  for (const cell of gladeCandidates) {
    if (glades.length >= gladeCount) break;
    if (!farEnough(cell, placed, minSpacing)) continue;
    const seed = (input.seed ^ Math.imul(cell.x + 1, 2246822519) ^ Math.imul(cell.y + 1, 3266489917)) >>> 0;
    glades.push({ x: cell.x, y: cell.y, seed });
    placed.push(cell);
  }

  return { caves, glades };
}
