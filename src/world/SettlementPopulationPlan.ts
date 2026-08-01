/**
 * SettlementPopulationPlan.ts — PROC-C / WG-1
 *
 * Deterministic settlement population planner: given a settlement record and
 * seed, produces population counts by size band and a fixed roster of named
 * key NPCs (innkeeper, blacksmith/smith, merchant) plus filler NPCs for the
 * remaining population.
 *
 * Follows the procedural-gen skill discipline: a single seeded RNG instance
 * is threaded through every choice — never the global Math.random().
 *
 * This plan feeds `NPCSpawner.spawnForSettlement()` (via `roles`) and the
 * Asset Library NPC save flow; it does not build 3D instances itself.
 */

import { mulberry32 } from '@/core/prng';
import type { NpcRole } from '@/npc-creator/types';
import type { GameSpecies } from '@/procedural/ProceduralDNA';
import { generateNameForSpecies } from '@/world/NameGenerator';

export type SettlementSize = 'village' | 'town' | 'city';

/** Population range (inclusive) per settlement size band, per WG-1. */
export const POPULATION_RANGE: Readonly<Record<SettlementSize, readonly [number, number]>> = {
  village: [5, 8],
  town:    [12, 20],
  city:    [25, 40],
};

/** A settlement always gets one of each of these named key roles, if population allows. */
const NAMED_KEY_ROLES: readonly { title: string; role: NpcRole }[] = [
  { title: 'innkeeper', role: 'innkeeper' },
  { title: 'blacksmith', role: 'merchant' },   // NpcRole has no dedicated smith role yet — tagged via title
  { title: 'merchant', role: 'merchant' },
];

const FILLER_ROLES: readonly NpcRole[] = ['guard', 'guard', 'scholar', 'elder', 'quest_giver', 'mysterious'];

export interface NamedSettlementNpc {
  /** Stable slot id within the settlement, e.g. "settlement-42/innkeeper". */
  id: string;
  /** Human-readable job title (may not map 1:1 onto NpcRole — e.g. "blacksmith"). */
  title: string;
  role: NpcRole;
  name: string;
  species: GameSpecies;
  /** Deterministic seed for this individual NPC's DNA. */
  seed: number;
}

export interface FillerSettlementNpc {
  id: string;
  role: NpcRole;
  species: GameSpecies;
  seed: number;
}

export interface SettlementPopulationPlan {
  settlementId: string;
  size: SettlementSize;
  seed: number;
  /** Total inhabitant count, drawn from POPULATION_RANGE for this size. */
  population: number;
  /** Fixed named roster — always present when population budget allows. */
  namedNpcs: NamedSettlementNpc[];
  /** Remaining population filled with procedural filler NPCs. */
  fillerNpcs: FillerSettlementNpc[];
}

const DEFAULT_SPECIES_POOL: readonly GameSpecies[] = [
  'human', 'human', 'vulperia', 'elf', 'undead', 'slime', 'celestial', 'draconic',
];

function speciesToNameable(species: GameSpecies): Parameters<typeof generateNameForSpecies>[0] {
  switch (species) {
    case 'human':     return 'human';
    case 'vulperia':  return 'fox';
    case 'slime':     return 'slime';
    case 'undead':    return 'undead';
    case 'elf':       return 'elf';
    case 'celestial': return 'celestial';
    case 'draconic':  return 'draconic';
  }
}

export interface SettlementPopulationPlanOptions {
  speciesPool?: readonly GameSpecies[];
}

/**
 * Generate a deterministic population plan for a settlement.
 * Same (settlementId, size, seed) always produces the same roster.
 */
export function generateSettlementPopulationPlan(
  settlementId: string,
  size: SettlementSize,
  seed: number,
  opts: SettlementPopulationPlanOptions = {},
): SettlementPopulationPlan {
  const speciesPool = opts.speciesPool ?? DEFAULT_SPECIES_POOL;
  const rand = mulberry32(seed ^ 0x5E77_1E4E);

  const [min, max] = POPULATION_RANGE[size];
  const population = min + Math.floor(rand() * (max - min + 1));

  const pickSpecies = () => speciesPool[Math.floor(rand() * speciesPool.length)]!;

  const namedNpcs: NamedSettlementNpc[] = [];
  const namedCount = Math.min(NAMED_KEY_ROLES.length, population);
  for (let i = 0; i < namedCount; i++) {
    const { title, role } = NAMED_KEY_ROLES[i]!;
    const npcSeed = (seed ^ ((i + 1) * 0x9E37_79B9)) >>> 0;
    const species = pickSpecies();
    namedNpcs.push({
      id: `${settlementId}/${title}`,
      title,
      role,
      name: generateNameForSpecies(speciesToNameable(species)),
      species,
      seed: npcSeed,
    });
  }

  const fillerCount = Math.max(0, population - namedNpcs.length);
  const fillerNpcs: FillerSettlementNpc[] = [];
  for (let i = 0; i < fillerCount; i++) {
    const role = FILLER_ROLES[Math.floor(rand() * FILLER_ROLES.length)]!;
    const species = pickSpecies();
    const npcSeed = (seed ^ ((namedNpcs.length + i + 1) * 0x9E37_79B9)) >>> 0;
    fillerNpcs.push({
      id: `${settlementId}/filler/${i}`,
      role,
      species,
      seed: npcSeed,
    });
  }

  return { settlementId, size, seed, population, namedNpcs, fillerNpcs };
}