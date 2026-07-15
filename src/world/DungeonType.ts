/**
 * DungeonType — type registry for the 6 dungeon flavours that can appear in
 * the overworld.  Each type drives both the entrance mesh and the DungeonGenerator
 * parameters used when the player enters.
 */

export type DungeonType =
  | 'cave'
  | 'crypt'
  | 'ruins'
  | 'mine'
  | 'library_ruin'
  | 'lair';

export type EntranceMeshKey =
  | 'cave_arch'
  | 'crypt_door'
  | 'ruin_pillars'
  | 'mine_shaft'
  | 'book_portal';

export interface DungeonTypeConfig {
  displayName:     string;
  /** Number of corridor rooms (passed to generateDungeon as floorCount). */
  roomCount:       [min: number, max: number];
  /** Rapier enemy variant spawned inside. */
  enemyVariant:    'slime' | 'undead' | 'construct';
  /** Key used to pick the entrance mesh builder. */
  entranceMeshKey: EntranceMeshKey;
  /** Rough probability weight for placement (sum across all types = baseline). */
  weight:          number;
}

export const DUNGEON_TYPE_CONFIGS: Readonly<Record<DungeonType, DungeonTypeConfig>> = {
  cave:         { displayName: 'Cave',          roomCount: [2, 4],  enemyVariant: 'slime',     entranceMeshKey: 'cave_arch',    weight: 4 },
  crypt:        { displayName: 'Crypt',         roomCount: [3, 6],  enemyVariant: 'undead',    entranceMeshKey: 'crypt_door',   weight: 2 },
  ruins:        { displayName: 'Ruins',         roomCount: [3, 5],  enemyVariant: 'construct', entranceMeshKey: 'ruin_pillars', weight: 3 },
  mine:         { displayName: 'Mine',          roomCount: [4, 7],  enemyVariant: 'slime',     entranceMeshKey: 'mine_shaft',   weight: 3 },
  library_ruin: { displayName: 'Library Ruin',  roomCount: [4, 8],  enemyVariant: 'construct', entranceMeshKey: 'book_portal',  weight: 1 },
  lair:         { displayName: 'Lair',          roomCount: [5, 10], enemyVariant: 'slime',     entranceMeshKey: 'cave_arch',    weight: 1 },
};

/** Weighted-random pick of a DungeonType from the seed-driven rand. */
export function pickDungeonType(rand: () => number): DungeonType {
  const entries = Object.entries(DUNGEON_TYPE_CONFIGS) as [DungeonType, DungeonTypeConfig][];
  const total   = entries.reduce((s, [, c]) => s + c.weight, 0);
  let r = rand() * total;
  for (const [type, cfg] of entries) {
    r -= cfg.weight;
    if (r <= 0) return type;
  }
  return 'cave';
}
