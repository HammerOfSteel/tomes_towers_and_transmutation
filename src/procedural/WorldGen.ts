/**
 * WorldGen.ts — PROC-A5
 *
 * Top-level procedural world-generation coordinator.
 * Given a world seed, produces a deterministic PlacementPlan describing
 * where every building, NPC, enemy, and prop should appear.
 *
 * The game calls this at world-load time.  Creative mode calls the same
 * function then lets the designer override individual placements.
 *
 * No Three.js imports here — this is pure data generation.
 * The actual `build*(dna)` calls happen at scene-enter time.
 */

import type { GameSpecies } from './ProceduralDNA';

// ── Placement types ───────────────────────────────────────────────────────────

/** A world-space position. */
export interface WorldPos {
  x: number;
  y: number;
  z: number;
}

export interface PlacedBuilding {
  id:       string;        // unique ID within this plan
  kind:     'house' | 'inn' | 'shop' | 'guild' | 'ruin' | 'well' | 'barn';
  style:    'thatched' | 'stone' | 'timber' | 'arcane';
  floors:   1 | 2 | 3;
  pos:      WorldPos;
  rotation: number;        // Y-axis radians
  seed:     number;
  hasInterior: boolean;
}

export interface PlacedNpc {
  id:         string;
  species:    GameSpecies;
  role:       'merchant' | 'elder' | 'quest_giver' | 'scholar' | 'guard' | 'innkeeper' | 'mysterious';
  pos:        WorldPos;
  seed:       number;
  /** ID of the settlement this NPC belongs to, or null for world NPCs. */
  settlementId: string | null;
}

export interface PlacedEnemy {
  id:         string;
  species:    GameSpecies;
  combatRole: 'melee' | 'ranged' | 'caster' | 'swarm';
  tier:       1 | 2 | 3;
  pos:        WorldPos;
  seed:       number;
  /** Patrol radius around pos. */
  patrolRadius: number;
}

export interface PlacedProp {
  id:       string;
  kind:     string;        // matches PropDNA.kind
  material: string;
  pos:      WorldPos;
  rotation: number;
  seed:     number;
  roomId:   string | null; // null = overworld prop
}

export interface Settlement {
  id:         string;
  name:       string;
  type:       'hamlet' | 'village' | 'town' | 'city';
  pos:        WorldPos;
  seed:       number;
  buildings:  PlacedBuilding[];
  npcs:       PlacedNpc[];
}

/**
 * Complete deterministic placement plan for a world region.
 * Same seed → identical plan every time.
 */
export interface PlacementPlan {
  seed:        number;
  generatedAt: number;     // Date.now() — informational only
  settlements: Settlement[];
  wildEnemies: PlacedEnemy[];
  overworldProps: PlacedProp[];
}

// ── RNG ───────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Settlement names ──────────────────────────────────────────────────────────

const SETTLEMENT_PREFIXES = ['Ash', 'Bright', 'Cold', 'Dark', 'Elder', 'Fell', 'Grey', 'High', 'Iron', 'Low', 'Mill', 'Old', 'Stone', 'Swift', 'Thorn'];
const SETTLEMENT_SUFFIXES = ['bridge', 'brook', 'cliff', 'cross', 'dale', 'ford', 'gate', 'haven', 'holm', 'keep', 'moor', 'stead', 'ton', 'vale', 'worth'];

function settlementName(seed: number): string {
  const r = mulberry32(seed);
  return SETTLEMENT_PREFIXES[Math.floor(r() * SETTLEMENT_PREFIXES.length)] +
         SETTLEMENT_SUFFIXES[Math.floor(r() * SETTLEMENT_SUFFIXES.length)];
}

// ── Building generation ───────────────────────────────────────────────────────

const BUILDING_KINDS: PlacedBuilding['kind'][] = ['house', 'house', 'house', 'inn', 'shop', 'guild', 'well', 'ruin'];
const BUILDING_STYLES: PlacedBuilding['style'][] = ['thatched', 'stone', 'timber', 'arcane'];

function generateSettlementBuildings(
  settlementSeed: number,
  centerX: number,
  centerZ: number,
  count: number,
): PlacedBuilding[] {
  const r = mulberry32(settlementSeed ^ 0xBEEF_1234);
  const buildings: PlacedBuilding[] = [];

  for (let i = 0; i < count; i++) {
    const angle  = r() * Math.PI * 2;
    const radius = 8 + r() * 20;
    const kind   = BUILDING_KINDS[Math.floor(r() * BUILDING_KINDS.length)];
    const style  = BUILDING_STYLES[Math.floor(r() * BUILDING_STYLES.length)];
    const floors = ([1, 1, 1, 2, 2, 3][Math.floor(r() * 6)] ?? 1) as 1 | 2 | 3;

    buildings.push({
      id:          `bld-${settlementSeed}-${i}`,
      kind,
      style,
      floors,
      pos:         { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
      rotation:    r() * Math.PI * 2,
      seed:        (settlementSeed ^ (i * 0x9E3779B9)) >>> 0,
      hasInterior: kind !== 'well',
    });
  }

  return buildings;
}

// ── NPC generation ────────────────────────────────────────────────────────────

const NPC_ROLES: PlacedNpc['role'][] = ['merchant', 'guard', 'innkeeper', 'quest_giver', 'scholar', 'elder'];
const NPC_SPECIES: GameSpecies[] = ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];

function generateSettlementNpcs(
  settlementId: string,
  settlementSeed: number,
  centerX: number,
  centerZ: number,
  count: number,
): PlacedNpc[] {
  const r = mulberry32(settlementSeed ^ 0xCAFE_BABE);
  const npcs: PlacedNpc[] = [];

  for (let i = 0; i < count; i++) {
    const angle   = r() * Math.PI * 2;
    const radius  = 4 + r() * 15;
    const role    = NPC_ROLES[Math.floor(r() * NPC_ROLES.length)];
    const species = NPC_SPECIES[Math.floor(r() * NPC_SPECIES.length)];

    npcs.push({
      id:           `npc-${settlementSeed}-${i}`,
      species,
      role,
      pos:          { x: centerX + Math.cos(angle) * radius, y: 0, z: centerZ + Math.sin(angle) * radius },
      seed:         (settlementSeed ^ (i * 0xDEAD_BEEF)) >>> 0,
      settlementId,
    });
  }

  return npcs;
}

// ── Enemy generation ──────────────────────────────────────────────────────────

const ENEMY_ROLES: PlacedEnemy['combatRole'][] = ['melee', 'melee', 'ranged', 'caster', 'swarm'];

function generateWildEnemies(worldSeed: number, count: number, worldRadius: number): PlacedEnemy[] {
  const r = mulberry32(worldSeed ^ 0xF00D_BABE);
  const enemies: PlacedEnemy[] = [];

  for (let i = 0; i < count; i++) {
    const angle   = r() * Math.PI * 2;
    const radius  = worldRadius * 0.3 + r() * worldRadius * 0.6;
    const tier    = ([1, 1, 2, 2, 3][Math.floor(r() * 5)] ?? 1) as 1 | 2 | 3;
    const species = NPC_SPECIES[Math.floor(r() * NPC_SPECIES.length)];
    const role    = ENEMY_ROLES[Math.floor(r() * ENEMY_ROLES.length)];

    enemies.push({
      id:           `enemy-${worldSeed}-${i}`,
      species,
      combatRole:   role,
      tier,
      pos:          { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius },
      seed:         (worldSeed ^ (i * 0xABCD_1234)) >>> 0,
      patrolRadius: 5 + r() * 10,
    });
  }

  return enemies;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface WorldGenOptions {
  /** Number of settlements to generate. Default: 3. */
  settlementCount?: number;
  /** Buildings per settlement (base). Default: 6. */
  buildingsPerSettlement?: number;
  /** NPCs per settlement (base). Default: 4. */
  npcsPerSettlement?: number;
  /** Wild enemies in the overworld. Default: 12. */
  wildEnemyCount?: number;
  /** Half-width of the world area in world units. Default: 120. */
  worldRadius?: number;
}

/**
 * Generate a complete PlacementPlan from a seed.
 * Same seed always produces the same plan.
 */
export function generateWorldPlan(seed: number, opts: WorldGenOptions = {}): PlacementPlan {
  const {
    settlementCount       = 3,
    buildingsPerSettlement = 6,
    npcsPerSettlement      = 4,
    wildEnemyCount         = 12,
    worldRadius            = 120,
  } = opts;

  const r           = mulberry32(seed ^ 0x1234_ABCD);
  const settlements: Settlement[] = [];

  for (let i = 0; i < settlementCount; i++) {
    const angle        = r() * Math.PI * 2;
    const radius       = worldRadius * 0.25 + r() * worldRadius * 0.55;
    const centerX      = Math.cos(angle) * radius;
    const centerZ      = Math.sin(angle) * radius;
    const settlementSeed = (seed ^ ((i + 1) * 0x9E37_79B9)) >>> 0;
    const id           = `settlement-${settlementSeed}`;
    const type         = (['hamlet', 'village', 'town', 'city'] as const)[Math.floor(r() * 4)];
    const buildingCount = buildingsPerSettlement + Math.floor(r() * 4);
    const npcCount      = npcsPerSettlement + Math.floor(r() * 3);

    settlements.push({
      id,
      name:      settlementName(settlementSeed),
      type,
      pos:       { x: centerX, y: 0, z: centerZ },
      seed:      settlementSeed,
      buildings: generateSettlementBuildings(settlementSeed, centerX, centerZ, buildingCount),
      npcs:      generateSettlementNpcs(id, settlementSeed, centerX, centerZ, npcCount),
    });
  }

  return {
    seed,
    generatedAt:    Date.now(),
    settlements,
    wildEnemies:    generateWildEnemies(seed, wildEnemyCount, worldRadius),
    overworldProps: [],   // PROC-B3: props added once PropBuilder is implemented
  };
}
