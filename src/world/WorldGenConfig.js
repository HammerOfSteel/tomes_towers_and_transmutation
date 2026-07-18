/**
 * WorldGenConfig — parametric configuration for overworld generation.
 *
 * Stored to localStorage so the player's world-gen preferences persist across
 * sessions.  A seed of 0 means "randomise at game start"; the actual seed used
 * is written back after generation so the same world can be recreated.
 */
/** Ordered list of Kenney Retro Fantasy asset packs available in the project. */
export const KENNEY_PACKS = [
    { id: 'buildings', name: 'Buildings', icon: '🏠', desc: 'Walls, roofs, floors, towers, stairs', recommended: true },
    { id: 'castle', name: 'Castle', icon: '🏰', desc: 'Tower sections, walls, gates, battlements', recommended: false },
    { id: 'dungeon', name: 'Dungeon', icon: '🗝️', desc: 'Corridors, rooms, dungeon props', recommended: false },
    { id: 'nature', name: 'Nature', icon: '🌿', desc: 'Trees, rocks, rivers, ground tiles', recommended: true },
    { id: 'town', name: 'Town', icon: '🏘️', desc: 'Roads, props, lanterns, fountains', recommended: true },
];
export const DEFAULT_WORLD_GEN_CONFIG = {
    seed: 0,
    worldSize: 128,
    riverCount: 4,
    lakeCount: 2,
    dungeonCount: 6,
    villageCount: 3,
    townCount: 1,
    hasCity: true,
    enemyCampCount: 8,
    assetMode: 'code',
    assetPacks: ['buildings', 'nature', 'town'],
    charMode: 'code',
    charPacks: ['kaykit_adventurers', 'kaykit_skeletons', 'fox', 'slime', 'goblin_pack', 'villager_npc'],
};
const LS_KEY = 'ttt_world_gen_config';
/** Load config from localStorage, filling missing keys with defaults. */
export function loadWorldGenConfig() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw)
            return { ...DEFAULT_WORLD_GEN_CONFIG };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_WORLD_GEN_CONFIG, ...parsed };
    }
    catch {
        return { ...DEFAULT_WORLD_GEN_CONFIG };
    }
}
/** Persist config to localStorage. */
export function saveWorldGenConfig(cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}
/** Return a copy with seed set to a fresh random value. */
export function randomiseSeed(cfg) {
    return { ...cfg, seed: Math.floor(Math.random() * 0xFFFF_FFFF) + 1 };
}
