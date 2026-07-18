/**
 * DungeonType — type registry for the 6 dungeon flavours that can appear in
 * the overworld.  Each type drives both the entrance mesh and the DungeonGenerator
 * parameters used when the player enters.
 */
export const DUNGEON_TYPE_CONFIGS = {
    cave: { displayName: 'Cave', roomCount: [2, 4], enemyVariant: 'slime', entranceMeshKey: 'cave_arch', weight: 4 },
    crypt: { displayName: 'Crypt', roomCount: [3, 6], enemyVariant: 'undead', entranceMeshKey: 'crypt_door', weight: 2 },
    ruins: { displayName: 'Ruins', roomCount: [3, 5], enemyVariant: 'construct', entranceMeshKey: 'ruin_pillars', weight: 3 },
    mine: { displayName: 'Mine', roomCount: [4, 7], enemyVariant: 'slime', entranceMeshKey: 'mine_shaft', weight: 3 },
    library_ruin: { displayName: 'Library Ruin', roomCount: [4, 8], enemyVariant: 'construct', entranceMeshKey: 'book_portal', weight: 1 },
    lair: { displayName: 'Lair', roomCount: [5, 10], enemyVariant: 'slime', entranceMeshKey: 'cave_arch', weight: 1 },
};
/** Weighted-random pick of a DungeonType from the seed-driven rand. */
export function pickDungeonType(rand) {
    const entries = Object.entries(DUNGEON_TYPE_CONFIGS);
    const total = entries.reduce((s, [, c]) => s + c.weight, 0);
    let r = rand() * total;
    for (const [type, cfg] of entries) {
        r -= cfg.weight;
        if (r <= 0)
            return type;
    }
    return 'cave';
}
