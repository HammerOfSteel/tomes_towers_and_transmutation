/**
 * SettlementPopulator.ts — 02-game-world-integration (SI-3)
 *
 * Pure data transform: a `SettlementSpawnPlan` (SI-1, `SettlementSpawner.ts`)
 * → a deterministic list of NPC placements (`NpcDNA` + world position) that
 * the (future) settlement renderer can turn into actual NPC instances via
 * `buildNpc(dna)` / `buildNpcSync(dna)` (`src/npc-creator/builder.ts`).
 *
 * Deviation from the spec's literal ward model: the TODO describes NPC
 * counts per *ward type* ("Market ward → 2-3 merchants", "Gate ward → 1-2
 * guards", "Inn ward → 1 innkeeper + 1-2 wanderers"). `SettlementSpawner.ts`
 * (SI-1) deliberately does not model wards — it places buildings directly by
 * kind (see its header for why). This module adapts the same intent to that
 * simpler model by keying off *building kind* instead of ward type:
 *   - `shop`                       → 2-3 merchants near that building
 *   - `watchtower` / `gate`        → 1-2 guards near that building
 *   - `inn` / `tavern`             → 1 innkeeper + 1-2 wanderers near it
 *   - once per town/city plan      → 1 quest-giver (at the `guild` building
 *                                     if present, else the settlement centre)
 * "Wanderer" isn't one of the existing `NpcRole` values (merchant / elder /
 * quest_giver / scholar / guard / innkeeper / mysterious) — mapped to
 * `mysterious`, the closest existing role for a non-vendor background NPC.
 *
 * `SettlementFaction` (9 values, realm map) → `GameSpecies` (7 values, NPC
 * creator) isn't 1:1 either (no dwarven/orcish/vampire/fae species) — mapped
 * to the closest existing species, documented in `FACTION_TO_SPECIES` below.
 */

import type { SettlementFaction } from '@/overworld-studio';
import type { GameSpecies } from '@/procedural/ProceduralDNA';
import { mulberry32 } from '@/core/prng';
import { getDefaultNpcDna } from '@/npc-creator/defaults/NpcDefaults';
import type { NpcDNA, NpcRole } from '@/npc-creator/types';
import type { SettlementSpawnPlan, SettlementBuildingPlacement, WorldPos2 } from './SettlementSpawner';

export interface NpcSpawnPlacement {
  dna: NpcDNA;
  position: WorldPos2;
}

/**
 * `SettlementFaction` → `GameSpecies` — the NPC creator only has 7 species,
 * so factions without a direct equivalent map to the closest match:
 * dwarven/orcish → human (no dedicated NPC bodytype), vampire → undead,
 * fae → elf.
 */
export const FACTION_TO_SPECIES: Record<SettlementFaction, GameSpecies> = {
  human: 'human',
  elven: 'elf',
  dwarven: 'human',
  orcish: 'human',
  vampire: 'undead',
  undead: 'undead',
  vulperia: 'vulperia',
  slime: 'slime',
  fae: 'elf',
};

const WANDERER_ROLE: NpcRole = 'mysterious';

/** Deterministic small radial offset around a building so NPCs don't all overlap it exactly. */
function nearbyOffset(rand: () => number, radius: number): WorldPos2 {
  const angle = rand() * Math.PI * 2;
  const dist = radius * (0.4 + rand() * 0.6);
  return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
}

function hashPlan(plan: SettlementSpawnPlan): number {
  let h = 0x85ebca6b ^ Math.round(plan.position.x * 31) ^ Math.round(plan.position.z * 131);
  for (let i = 0; i < plan.name.length; i++) {
    h = Math.imul(h ^ plan.name.charCodeAt(i), 2246822519);
  }
  return h >>> 0;
}

export interface PopulateSettlementOptions {
  /** Deterministic seed; derived from the plan's name + position if omitted (SI-6 determinism). */
  seed?: number;
}

/**
 * SI-3 — given a settlement's spawn plan (SI-1), produce a deterministic NPC
 * placement list in world space. Pure function — no Three.js, no DOM.
 */
export function populateSettlement(
  plan: SettlementSpawnPlan,
  options: PopulateSettlementOptions = {},
): NpcSpawnPlacement[] {
  const seed = options.seed ?? hashPlan(plan);
  const rand = mulberry32(seed);
  const species = FACTION_TO_SPECIES[plan.faction];

  const npcs: NpcSpawnPlacement[] = [];
  let npcSeedCounter = seed;

  const spawnNear = (role: NpcRole, building: SettlementBuildingPlacement, radius = 3): void => {
    npcSeedCounter = (npcSeedCounter + 0x9e3779b9) >>> 0;
    const dna = getDefaultNpcDna(species, role, npcSeedCounter);
    const offset = nearbyOffset(rand, radius);
    npcs.push({ dna, position: { x: building.position.x + offset.x, z: building.position.z + offset.z } });
  };

  let guildBuilding: SettlementBuildingPlacement | undefined;

  for (const building of plan.buildings) {
    const kind = building.dna.buildingKind;
    if (kind === 'shop') {
      const count = 2 + Math.floor(rand() * 2); // 2-3
      for (let i = 0; i < count; i++) spawnNear('merchant', building);
    } else if (kind === 'watchtower' || kind === 'gate') {
      const count = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < count; i++) spawnNear('guard', building);
    } else if (kind === 'inn' || kind === 'tavern') {
      spawnNear('innkeeper', building);
      const wanderers = 1 + Math.floor(rand() * 2); // 1-2
      for (let i = 0; i < wanderers; i++) spawnNear(WANDERER_ROLE, building);
    } else if (kind === 'guild' && !guildBuilding) {
      guildBuilding = building;
    }
  }

  if (plan.size === 'town' || plan.size === 'city') {
    npcSeedCounter = (npcSeedCounter + 0x9e3779b9) >>> 0;
    const questGiverDna = getDefaultNpcDna(species, 'quest_giver', npcSeedCounter);
    const position = guildBuilding
      ? { x: guildBuilding.position.x, z: guildBuilding.position.z }
      : { x: plan.position.x, z: plan.position.z };
    npcs.push({ dna: questGiverDna, position });
  }

  return npcs;
}
