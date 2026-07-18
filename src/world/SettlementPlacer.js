/**
 * SettlementPlacer — finds valid center tiles and generates SettlementPlans.
 *
 * Placement strategy:
 *   1. Collect candidate tiles: non-water, non-river, elevation 1–2,
 *      biome grass/forest, within the habitable annulus (outside flat zone,
 *      inside rim), no existing dungeon entrance.
 *   2. Score each candidate by how many adjacent tiles are river (ford bonus).
 *   3. Pick centers in priority order (city → towns → villages), enforcing
 *      minimum tile-distance between already-placed settlements.
 *   4. Call planSettlement() + applySettlementToGrid() for each.
 */
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { planSettlement, applySettlementToGrid } from './SettlementGenerator';
const T = 2; // world-units per tile (matches OverworldScene / DungeonPlacer)
// Minimum tile-distance between any two settlement centers
const MIN_DIST_CITY = 35;
const MIN_DIST_TOWN = 22;
const MIN_DIST_VILLAGE = 14;
export function placeSettlements(grid, config, seed) {
    const rand = mulberry32(seed ^ 0x5E77_1E_A5);
    const GW = grid.width;
    const GH = grid.height;
    const GHW = (GW - 1) / 2;
    const GHH = (GH - 1) / 2;
    const FR = Math.round(GHW * 0.28);
    // Habitable annulus: outside 2×FR (tower area) and inside 0.82×GHW (before rim)
    const innerR = FR * 2.0;
    const outerR = GHW * 0.82;
    const W = GW * T;
    const H = GH * T;
    // Poisson-disk with small spacing to generate dense candidate set
    const spacing = Math.max(14, Math.round(GHW * 0.22)) * T;
    const pts = poissonDisk(W, H, spacing, rand);
    const candidates = [];
    for (const [px, pz] of pts) {
        const wx = px - W / 2;
        const wz = pz - H / 2;
        const col = Math.round(wx / T + GHW);
        const row = Math.round(wz / T + GHH);
        if (col < 2 || col >= GW - 2 || row < 2 || row >= GH - 2)
            continue;
        const dc = col - GHW, dr = row - GHH;
        const tR = Math.sqrt(dc * dc + dr * dr);
        if (tR < innerR || tR > outerR)
            continue;
        const cell = grid.get(col, row);
        if (cell.biome === 'water')
            continue;
        if (cell.feature === 'river')
            continue;
        if (cell.elevation < 1 || cell.elevation > 2)
            continue;
        if (cell.content !== 'empty')
            continue;
        // River adjacency bonus
        let riverScore = 0;
        for (const [dc2, dr2] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (grid.get(col + dc2, row + dr2).feature === 'river')
                riverScore++;
        }
        candidates.push({ col, row, riverScore });
    }
    // Sort by score descending
    candidates.sort((a, b) => b.riverScore - a.riverScore);
    const placements = [];
    const entries = [];
    function _tooClose(col, row, minDist) {
        for (const p of placements) {
            const dc = col - p.col, dr = row - p.row;
            if (Math.sqrt(dc * dc + dr * dr) < minDist)
                return true;
        }
        return false;
    }
    // Place city first (if enabled)
    if (config.hasCity) {
        for (const cand of candidates) {
            if (_tooClose(cand.col, cand.row, MIN_DIST_CITY))
                continue;
            const id = entries.length + 1;
            const eSeed = (seed ^ (id * 0x9E37_79B9)) >>> 0;
            const plan = planSettlement('city', cand.col, cand.row, eSeed, grid);
            applySettlementToGrid(plan, grid, id);
            placements.push({ col: cand.col, row: cand.row, type: 'city' });
            entries.push({ id, seed: eSeed, plan });
            break;
        }
    }
    // Towns
    for (let t = 0; t < config.townCount && t < 3; t++) {
        for (const cand of candidates) {
            if (_tooClose(cand.col, cand.row, MIN_DIST_TOWN))
                continue;
            const id = entries.length + 1;
            const eSeed = (seed ^ (id * 0x9E37_79B9)) >>> 0;
            const plan = planSettlement('town', cand.col, cand.row, eSeed, grid);
            applySettlementToGrid(plan, grid, id);
            placements.push({ col: cand.col, row: cand.row, type: 'town' });
            entries.push({ id, seed: eSeed, plan });
            break;
        }
    }
    // Villages
    for (let v = 0; v < config.villageCount && v < 6; v++) {
        for (const cand of candidates) {
            if (_tooClose(cand.col, cand.row, MIN_DIST_VILLAGE))
                continue;
            const id = entries.length + 1;
            const eSeed = (seed ^ (id * 0x9E37_79B9)) >>> 0;
            const plan = planSettlement('village', cand.col, cand.row, eSeed, grid);
            applySettlementToGrid(plan, grid, id);
            placements.push({ col: cand.col, row: cand.row, type: 'village' });
            entries.push({ id, seed: eSeed, plan });
            break;
        }
    }
    return entries;
}
