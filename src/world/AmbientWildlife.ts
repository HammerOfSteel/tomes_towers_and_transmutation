/**
 * AmbientWildlife.ts — peaceful, chunk-scoped ambient creatures (rabbits, goats) for the live
 * OverworldScene (Phase 9 batch 1 — 2 ground-based species; birds/flight deferred to a
 * follow-up batch; see docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md).
 *
 * Purely cosmetic: no health, no damage, no death, no combat, no player interaction beyond
 * fleeing when approached. Reuses the same procedural creature-rig system
 * (CreatureDNA/buildCreature/animateCreature) already used for the player, enemies, and NPCs.
 */
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid, BiomeId } from '@/world/WorldGrid';

// ── Species ───────────────────────────────────────────────────────────────

export type AmbientSpecies = 'rabbit' | 'goat';

export interface AmbientSpeciesDef {
  species: AmbientSpecies;
  dna: CreatureDNA;
}

function _rabbitDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.4;
  dna.face = {
    type: 'cute', eyeColor: 0x2a1a0a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x8a7a5c, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xc9b896, secondary: 0x8a7a5c, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x8a7a5c, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

function _goatDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.75;
  dna.face = {
    type: 'blank', eyeColor: 0x3a2a1a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x9a8a70, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xe8e0d0, secondary: 0x9a8a70, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x9a8a70, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

export const AMBIENT_SPECIES: Record<AmbientSpecies, AmbientSpeciesDef> = {
  rabbit: { species: 'rabbit', dna: _rabbitDNA() },
  goat:   { species: 'goat',   dna: _goatDNA() },
};

// ── Per-biome density rules ─────────────────────────────────────────────────

export interface AmbientBiomeRule {
  species: AmbientSpecies;
  /** Relative spawn density vs. AMBIENT_BASE_SPACING's single Poisson-disk pass — see this
   *  plan's Global Constraints for the (spacing_base/spacing_desired)² derivation. */
  keepProbability: number;
}

export const AMBIENT_BIOME_RULES: Partial<Record<BiomeId, AmbientBiomeRule>> = {
  forest:    { species: 'rabbit', keepProbability: 1.0 },
  grassland: { species: 'rabbit', keepProbability: 1.0 },
  taiga:     { species: 'rabbit', keepProbability: 0.327 },
  mountain:  { species: 'goat',   keepProbability: 0.529 },
};

// ── Tunables (see design spec §3/§4) ────────────────────────────────────────

export const WANDER_RADIUS = 8;              // world units from spawn point
export const FLEE_TRIGGER_RADIUS = 6;        // world units from player
export const FLEE_EXIT_RADIUS = FLEE_TRIGGER_RADIUS * 1.5; // hysteresis band
export const WANDER_SPEED = 1.2;             // world units / second
export const FLEE_SPEED = 4.0;               // world units / second
export const IDLE_MIN_DWELL = 2;             // seconds
export const IDLE_MAX_DWELL = 5;             // seconds
export const MAX_ACTIVE_AMBIENT_CREATURES = 24;
export const AMBIENT_BASE_SPACING = 40;      // world units, single per-chunk Poisson-disk pass

// ── Placement ─────────────────────────────────────────────────────────────

export interface AmbientSpawnPoint {
  x: number;
  z: number;
  species: AmbientSpecies;
}

/**
 * Scatter ambient-wildlife spawn points within a `chunkWorldSize`×`chunkWorldSize` WU square
 * whose corner is at world `(originX, originZ)` — mirrors `OverworldScene.ts`'s
 * `_buildChunkScatter()` tree/rock loop structure exactly (same Poisson-disk + per-candidate
 * biome/isScatterAllowed gating), but at a single `AMBIENT_BASE_SPACING` and with an additional
 * per-biome probability-thinning step (see this plan's Global Constraints) instead of scatter's
 * per-kind fixed spacing. Deterministic for a fixed `seed`.
 */
export function selectAmbientSpawnPoints(
  wg: WorldGrid,
  originX: number,
  originZ: number,
  chunkWorldSize: number,
  seed: number,
): AmbientSpawnPoint[] {
  const rand = mulberry32(seed);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const points: AmbientSpawnPoint[] = [];

  const candidates = poissonDisk(chunkWorldSize, chunkWorldSize, AMBIENT_BASE_SPACING, rand);
  for (const [px, pz] of candidates) {
    const x = originX + px;
    const z = originZ + pz;

    const col = Math.floor(x / wg.tileUnit + halfW);
    const row = Math.floor(z / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

    const cell = wg.get(col, row);
    const rule = AMBIENT_BIOME_RULES[cell.biome];
    if (!rule) continue;
    if (!isScatterAllowed(cell, 'ambient')) continue;
    if (rand() > rule.keepProbability) continue;

    points.push({ x, z, species: rule.species });
  }
  return points;
}
