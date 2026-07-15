/**
 * WorldGenConfig — parametric configuration for overworld generation.
 *
 * Stored to localStorage so the player's world-gen preferences persist across
 * sessions.  A seed of 0 means "randomise at game start"; the actual seed used
 * is written back after generation so the same world can be recreated.
 */

export type WorldSize = 128 | 256;

export interface WorldGenConfig {
  /** PRNG seed for the whole world.  0 = randomise on first generate. */
  seed:           number;
  /** Tile count per side.  128 → 256×256 world-units.  256 → 512×512. */
  worldSize:      WorldSize;
  /** Number of river paths to carve (OW-2). */
  riverCount:     number;
  /** Number of lake basins (OW-2). */
  lakeCount:      number;
  /** Dungeon/cave entrances to scatter (OW-3). */
  dungeonCount:   number;
  /** Small villages to generate (OW-5). */
  villageCount:   number;
  /** Mid-size towns to generate (OW-5). */
  townCount:      number;
  /** Whether to include one large city (OW-5). */
  hasCity:        boolean;
  /** Number of enemy camps to place. */
  enemyCampCount: number;
  /**
   * Visual rendering mode.
   * 'code'   — default: procedural Three.js geometry (fast, always consistent).
   * 'kenney' — replaces procedural geometry with Kenney GLB tile assets.
   *            Only packs listed in `assetPacks` are activated.
   */
  assetMode:  'code' | 'kenney';
  /**
   * Which Kenney asset packs to activate when assetMode is 'kenney'.
   * Valid values: 'buildings' | 'castle' | 'dungeon' | 'nature' | 'town'
   */
  assetPacks: string[];
}

// ── Kenney pack catalogue (used by Settings UI + Sandbox) ────────────────────

export interface KenneyPackDef {
  id:          string;
  name:        string;
  icon:        string;
  desc:        string;
  recommended: boolean;
}

/** Ordered list of Kenney Retro Fantasy asset packs available in the project. */
export const KENNEY_PACKS: readonly KenneyPackDef[] = [
  { id: 'buildings', name: 'Buildings', icon: '🏠', desc: 'Walls, roofs, floors, towers, stairs',  recommended: true  },
  { id: 'castle',    name: 'Castle',    icon: '🏰', desc: 'Tower sections, walls, gates, battlements', recommended: false },
  { id: 'dungeon',   name: 'Dungeon',   icon: '🗝️', desc: 'Corridors, rooms, dungeon props',       recommended: false },
  { id: 'nature',    name: 'Nature',    icon: '🌿', desc: 'Trees, rocks, rivers, ground tiles',    recommended: true  },
  { id: 'town',      name: 'Town',      icon: '🏘️', desc: 'Roads, props, lanterns, fountains',    recommended: true  },
] as const;

export const DEFAULT_WORLD_GEN_CONFIG: Readonly<WorldGenConfig> = {
  seed:           0,
  worldSize:      128,
  riverCount:     4,
  lakeCount:      2,
  dungeonCount:   6,
  villageCount:   3,
  townCount:      1,
  hasCity:        true,
  enemyCampCount: 8,
  assetMode:      'code',
  assetPacks:     ['buildings', 'nature', 'town'],
};

const LS_KEY = 'ttt_world_gen_config';

/** Load config from localStorage, filling missing keys with defaults. */
export function loadWorldGenConfig(): WorldGenConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_WORLD_GEN_CONFIG };
    const parsed = JSON.parse(raw) as Partial<WorldGenConfig>;
    return { ...DEFAULT_WORLD_GEN_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_WORLD_GEN_CONFIG };
  }
}

/** Persist config to localStorage. */
export function saveWorldGenConfig(cfg: WorldGenConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** Return a copy with seed set to a fresh random value. */
export function randomiseSeed(cfg: WorldGenConfig): WorldGenConfig {
  return { ...cfg, seed: Math.floor(Math.random() * 0xFFFF_FFFF) + 1 };
}
