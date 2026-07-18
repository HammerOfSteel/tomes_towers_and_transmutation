/**
 * DungeonPlacer — scatters dungeon entrances across the WorldGrid.
 *
 * Placement rules:
 *   – Tile must be non-water, non-river, elevation 1–3 (not bog, not rocky peak).
 *   – Must be at tile-radius > FR × 2 from the world centre (clear of the tower).
 *   – Minimum world-unit spacing of 30 WU between entrances.
 *   – No more than config.dungeonCount entrances placed.
 *
 * Each entrance gets a weighted-random DungeonType, a unique seed derived from
 * the world seed, and a procedurally generated name.
 *
 * Grid cells are updated: content = 'dungeon_entrance', dungeonId = entry.id.
 */
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { pickDungeonType, DUNGEON_TYPE_CONFIGS } from './DungeonType';
import { generateDungeonName } from './DungeonNameGenerator';
const T = 2; // world-units per tile (matches OverworldScene)
const SPACING_WU = 30; // minimum world-unit distance between entrances
const FLAT_MULT = 2.0; // clear-zone around tower: FR × FLAT_MULT tiles
export function placeDungeons(grid, config, seed) {
    const rand = mulberry32(seed ^ 0xD0_04_CA_FE);
    const GW = grid.width;
    const GH = grid.height;
    const GHW = (GW - 1) / 2;
    const GHH = (GH - 1) / 2;
    const FR = Math.round(GHW * 0.28);
    const clearR = FR * FLAT_MULT;
    const W = GW * T;
    const H = GH * T;
    // Generate candidate world-space positions via Poisson disk
    const pts = poissonDisk(W, H, SPACING_WU, rand);
    const dungeons = [];
    for (const [px, pz] of pts) {
        if (dungeons.length >= config.dungeonCount)
            break;
        const wx = px - W / 2;
        const wz = pz - H / 2;
        const col = Math.floor(wx / T + GHW);
        const row = Math.floor(wz / T + GHH);
        if (col < 1 || col >= GW - 1 || row < 1 || row >= GH - 1)
            continue;
        const cell = grid.get(col, row);
        // Must be on walkable mid-elevation, non-water, non-feature tiles
        if (!cell.walkable)
            continue;
        if (cell.biome === 'water')
            continue;
        if (cell.feature === 'river')
            continue;
        if (cell.elevation < 1 || cell.elevation > 3)
            continue;
        if (cell.content !== 'empty')
            continue;
        // Must be outside the tower flat-zone
        const dc = col - GHW, dr = row - GHH;
        const tR = Math.sqrt(dc * dc + dr * dr);
        if (tR < clearR)
            continue;
        // Pick type and generate metadata
        const type = pickDungeonType(rand);
        const cfg = DUNGEON_TYPE_CONFIGS[type];
        const [min, max] = cfg.roomCount;
        const floorCount = min + Math.floor(rand() * (max - min + 1));
        const id = dungeons.length + 1;
        const entrySeed = (seed ^ (id * 0x9E_37_79_B9)) >>> 0;
        const name = generateDungeonName(entrySeed, type);
        dungeons.push({ id, seed: entrySeed, type, col, row, name, floorCount, discovered: false });
        // Mark the grid cell
        grid.set(col, row, { content: 'dungeon_entrance', dungeonId: id });
    }
    return dungeons;
}
