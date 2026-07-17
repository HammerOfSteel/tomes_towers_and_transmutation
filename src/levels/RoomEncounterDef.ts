// ── RoomEncounterDef ──────────────────────────────────────────────────────────
//
//  Typed definitions for designed room encounters — Phase B3.
//
//  Each dungeon side-room can carry an `encounterPool` of pre-authored encounter
//  definitions.  On room entry the SceneManager picks one pool entry (seeded by
//  room ID) and spawns enemies according to its pattern.
//
//  Enemy IDs must exist in the ENEMY_MANIFEST (Phase B1).  Until the manifest
//  is generated the IDs listed here serve as the canonical reference.

// ── Enemy tier ────────────────────────────────────────────────────────────────

/** Difficulty tier matching the B2 enemy roster tables. */
export type EnemyTier = 1 | 2 | 3 | 'boss';

// ── Spawn patterns ────────────────────────────────────────────────────────────

/**
 * How the enemy group is distributed across the room.
 *
 * `spread`      — evenly scattered across the floor (default).
 * `corners`     — one per corner, closing in on entry.
 * `elevated`    — placed on raised geometry (archers / ranged units).
 * `patrol_path` — enemies walk a fixed loop; aggro on player sight.
 * `floor_rise`  — enemies "rise" from the floor on a delay (ambush / zombies).
 */
export type SpawnPattern =
  | 'spread'
  | 'corners'
  | 'elevated'
  | 'patrol_path'
  | 'floor_rise';

// ── Single enemy group inside an encounter ────────────────────────────────────

export interface EnemySpawnDef {
  /** Canonical enemy ID — must match an entry in ENEMY_MANIFEST.json. */
  enemyId: string;
  /** How many of this enemy to spawn. */
  count: number;
  /** Placement / movement pattern. Defaults to `spread` if omitted. */
  spawnPattern?: SpawnPattern;
}

// ── Encounter pattern ─────────────────────────────────────────────────────────

/**
 * Named encounter archetype from the B3 design table.
 *
 * `entry`            2-3 tier-1 enemies, spread.
 * `patrol`           4 enemies on patrol paths; alert on sight.
 * `ambush`           Room appears empty; enemies rise/spawn on entry.
 * `ranged_gauntlet`  2 elevated ranged + 2 melee blocking the path.
 * `elite`            1 tier-2 enemy + 2 tier-1 support.
 * `swarm`            8-12 tier-1 enemies spawned in waves.
 * `puzzle`           Enemies locked behind pressure-plate gates.
 * `boss`             1 tier-3 boss + periodic minion waves.
 */
export type EncounterPattern =
  | 'entry'
  | 'patrol'
  | 'ambush'
  | 'ranged_gauntlet'
  | 'elite'
  | 'swarm'
  | 'puzzle'
  | 'boss';

// ── Room encounter definition ─────────────────────────────────────────────────

export interface RoomEncounterDef {
  /** Stable identifier — unique within the pool it belongs to. */
  id: string;
  /** Named archetype controlling spawn timing and AI behaviour. */
  pattern: EncounterPattern;
  /** Highest enemy tier present (used for floor-placement validation). */
  tier: EnemyTier;
  /** Enemy groups comprising this encounter. */
  enemies: readonly EnemySpawnDef[];
  /**
   * For `swarm` encounters: total number of waves.
   * Defaults to 1 (all enemies at once) if omitted.
   */
  waveCount?: number;
  /**
   * For `swarm` encounters: how many kills trigger the next wave.
   * When omitted the next wave spawns only after all current enemies are dead.
   */
  waveKillThreshold?: number;
  /**
   * Item granted at room centre when the room is cleared.
   * Defaults to `'none'` for ordinary rooms.
   */
  reward?: 'chest' | 'stat_orb' | 'none';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the total enemy count for an encounter (all groups × all waves). */
export function totalEnemyCount(def: RoomEncounterDef): number {
  const perWave = def.enemies.reduce((sum, g) => sum + g.count, 0);
  return perWave * (def.waveCount ?? 1);
}

/**
 * Validate a single RoomEncounterDef.
 * Returns an array of error strings (empty array = valid).
 */
export function validateEncounterDef(def: RoomEncounterDef): string[] {
  const errors: string[] = [];

  if (!def.id || !/^\w+$/.test(def.id)) {
    errors.push(`encounter "${def.id}": id must be a non-empty word string`);
  }
  if (def.enemies.length === 0) {
    errors.push(`encounter "${def.id}": must have at least one enemy group`);
  }
  for (const g of def.enemies) {
    if (g.count < 1) {
      errors.push(`encounter "${def.id}" group "${g.enemyId}": count must be ≥ 1`);
    }
  }
  if (def.waveCount !== undefined && def.waveCount < 1) {
    errors.push(`encounter "${def.id}": waveCount must be ≥ 1`);
  }
  if (def.waveKillThreshold !== undefined && def.waveKillThreshold < 1) {
    errors.push(`encounter "${def.id}": waveKillThreshold must be ≥ 1`);
  }
  if (
    def.pattern === 'swarm' &&
    def.waveCount !== undefined &&
    def.waveKillThreshold !== undefined
  ) {
    const perWave = def.enemies.reduce((sum, g) => sum + g.count, 0);
    if (def.waveKillThreshold > perWave) {
      errors.push(
        `encounter "${def.id}": waveKillThreshold (${def.waveKillThreshold}) ` +
        `exceeds enemies per wave (${perWave})`,
      );
    }
  }

  return errors;
}

// ── Encounter pools by floor tier ─────────────────────────────────────────────
//
//  Canonical encounter pool for each tower floor (B1–9).
//  Enemy IDs reference the B2 roster; GLBs not yet extracted are marked with
//  a TODO comment — they will resolve once Phase B1 / asset extraction lands.
//
//  Floor index → encounter pool:
//    floorIndex  -1  Basement (alchemical workshop) — no combat pool, scripted
//    floorIndex   0  Grand Entrance Hall             — no combat pool, scripted
//    floorIndex   1  Armoury                         — entry / patrol
//    floorIndex   2  Catacombs                       — ambush / swarm
//    floorIndex   3  Living Quarters                 — patrol / ranged_gauntlet
//    floorIndex   4  Conservatory                    — elite / swarm
//    floorIndex   5  Gallery                         — ranged_gauntlet / elite
//    floorIndex   6  Machine Hall                    — elite / swarm
//    floorIndex   7  Vault                           — elite / boss-lite
//    floorIndex   8  Observatory Antechamber         — elite / ranged_gauntlet
//    floorIndex   9  Observatory                     — boss

export const ENCOUNTER_POOL_F1: readonly RoomEncounterDef[] = [
  {
    id: 'f1_entry_skeletons',
    pattern: 'entry',
    tier: 1,
    enemies: [{ enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'spread' }],
    reward: 'none',
  },
  {
    id: 'f1_patrol_skeletons',
    pattern: 'patrol',
    tier: 1,
    enemies: [
      { enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'patrol_path' },
      { enemyId: 'skeleton_minion',  count: 2, spawnPattern: 'patrol_path' },
    ],
    reward: 'none',
  },
];

export const ENCOUNTER_POOL_F2: readonly RoomEncounterDef[] = [
  {
    id: 'f2_ambush_zombies',
    pattern: 'ambush',
    tier: 1,
    enemies: [
      { enemyId: 'zombie', count: 4, spawnPattern: 'floor_rise' }, // TODO: Easy Animated Pack
    ],
    reward: 'none',
  },
  {
    id: 'f2_swarm_imps',
    pattern: 'swarm',
    tier: 1,
    enemies: [{ enemyId: 'imp', count: 4, spawnPattern: 'corners' }], // TODO: Quaternius Monster Pack
    waveCount: 3,
    reward: 'stat_orb',
  },
];

export const ENCOUNTER_POOL_F3: readonly RoomEncounterDef[] = [
  {
    id: 'f3_patrol_mixed',
    pattern: 'patrol',
    tier: 1,
    enemies: [
      { enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'patrol_path' },
      { enemyId: 'imp',              count: 2, spawnPattern: 'patrol_path' }, // TODO: Quaternius
    ],
    reward: 'none',
  },
  {
    id: 'f3_ranged_gauntlet',
    pattern: 'ranged_gauntlet',
    tier: 1,
    enemies: [
      { enemyId: 'skeleton_archer', count: 2, spawnPattern: 'elevated' }, // TODO: Quaternius
      { enemyId: 'slime_cube',      count: 2, spawnPattern: 'spread' },   // TODO: Kenney Cube-Pets
    ],
    reward: 'none',
  },
];

export const ENCOUNTER_POOL_F4: readonly RoomEncounterDef[] = [
  {
    id: 'f4_elite_golem',
    pattern: 'elite',
    tier: 2,
    enemies: [
      { enemyId: 'golem_stone',     count: 1, spawnPattern: 'spread' }, // TODO: Quaternius
      { enemyId: 'skeleton_minion', count: 2, spawnPattern: 'corners' },
    ],
    reward: 'chest',
  },
  {
    id: 'f4_swarm_imps',
    pattern: 'swarm',
    tier: 1,
    enemies: [{ enemyId: 'imp', count: 4, spawnPattern: 'corners' }],
    waveCount: 3,
    reward: 'stat_orb',
  },
];

export const ENCOUNTER_POOL_F5: readonly RoomEncounterDef[] = [
  {
    id: 'f5_ranged_gauntlet_archers',
    pattern: 'ranged_gauntlet',
    tier: 2,
    enemies: [
      { enemyId: 'skeleton_archer', count: 2, spawnPattern: 'elevated' }, // TODO: Quaternius
      { enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'spread' },
    ],
    reward: 'none',
  },
  {
    id: 'f5_elite_dark_mage',
    pattern: 'elite',
    tier: 2,
    enemies: [
      { enemyId: 'dark_mage',       count: 1, spawnPattern: 'spread' }, // TODO: Easy Animated
      { enemyId: 'skeleton_minion', count: 2, spawnPattern: 'corners' },
    ],
    reward: 'chest',
  },
];

export const ENCOUNTER_POOL_F6: readonly RoomEncounterDef[] = [
  {
    id: 'f6_elite_pig_man',
    pattern: 'elite',
    tier: 2,
    enemies: [
      { enemyId: 'pig_man_brute',   count: 1, spawnPattern: 'spread' }, // TODO: meshy_mutated_pig_man
      { enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'corners' },
    ],
    reward: 'chest',
  },
  {
    id: 'f6_swarm_mixed',
    pattern: 'swarm',
    tier: 2,
    enemies: [
      { enemyId: 'imp',       count: 3, spawnPattern: 'corners' }, // TODO: Quaternius
      { enemyId: 'skeleton_warrior', count: 1, spawnPattern: 'spread' },
    ],
    waveCount: 3,
    reward: 'stat_orb',
  },
];

export const ENCOUNTER_POOL_F7: readonly RoomEncounterDef[] = [
  {
    id: 'f7_elite_dark_fay',
    pattern: 'elite',
    tier: 2,
    enemies: [
      { enemyId: 'dark_fay',        count: 1, spawnPattern: 'spread' }, // TODO: meshy_dark_fay
      { enemyId: 'skeleton_minion', count: 2, spawnPattern: 'spread' },
    ],
    reward: 'chest',
  },
  {
    id: 'f7_elite_spectral_knight',
    pattern: 'elite',
    tier: 3,
    enemies: [
      { enemyId: 'spectral_knight', count: 1, spawnPattern: 'spread' }, // TODO: Quaternius
    ],
    reward: 'stat_orb',
  },
];

export const ENCOUNTER_POOL_F8: readonly RoomEncounterDef[] = [
  {
    id: 'f8_elite_vampire_fay',
    pattern: 'elite',
    tier: 3,
    enemies: [
      { enemyId: 'vampire_fay',     count: 1, spawnPattern: 'spread' }, // TODO: meshy_vampire_fay
    ],
    reward: 'chest',
  },
  {
    id: 'f8_ranged_gauntlet_f8',
    pattern: 'ranged_gauntlet',
    tier: 3,
    enemies: [
      { enemyId: 'dark_mage',       count: 2, spawnPattern: 'elevated' }, // TODO: Easy Animated
      { enemyId: 'spectral_knight', count: 1, spawnPattern: 'spread' },   // TODO: Quaternius
    ],
    reward: 'none',
  },
];

export const ENCOUNTER_POOL_F9: readonly RoomEncounterDef[] = [
  {
    id: 'f9_boss_dragon_whelp',
    pattern: 'boss',
    tier: 'boss',
    enemies: [
      { enemyId: 'dragon_whelp', count: 1, spawnPattern: 'spread' }, // TODO: Quaternius
      // Periodic skeleton minion waves are managed by WaveManager, not listed here.
    ],
    reward: 'chest',
  },
];

// ── Floor index → encounter pool map ─────────────────────────────────────────

export const ENCOUNTER_POOLS: Readonly<Record<number, readonly RoomEncounterDef[]>> = {
  1: ENCOUNTER_POOL_F1,
  2: ENCOUNTER_POOL_F2,
  // Floor 3 (The Wizard's Chambers) is a safe room — no combat pool.
  4: ENCOUNTER_POOL_F4,
  5: ENCOUNTER_POOL_F5,
  6: ENCOUNTER_POOL_F6,
  7: ENCOUNTER_POOL_F7,
  8: ENCOUNTER_POOL_F8,
  9: ENCOUNTER_POOL_F9,
};
