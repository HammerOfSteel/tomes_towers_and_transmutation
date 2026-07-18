/**
 * HydrologyGenerator — carves rivers into a WorldGrid.
 *
 * Algorithm (OW-2):
 *   1. Pick `config.riverCount` source tiles from the outer rim (elevation ≥ 3,
 *      tile-radius > 70 % of half-width), spaced at least 15 % of grid-width apart.
 *   2. Walk each source downhill: at each step choose the unvisited orthogonal
 *      neighbour with the best score = elevation × 100 + distToCenter.  This drives
 *      rivers inward while preferring the steepest descent.
 *   3. Terminate a path when it enters the tower flat-zone
 *      (tR < FR × FLAT_MARGIN) or hits the world edge.
 *   4. Mark walked tiles as feature='river', walkable=false.
 *      Orthogonal neighbours of river tiles get feature='river_bank'.
 *
 * Rivers do NOT block the player physically in OW-2 (no extra Rapier colliders).
 * `walkable=false` is a data flag for future AI pathfinding and bridge placement.
 */
import { mulberry32 } from '@/core/prng';
// Terminate river before it enters the flat tower zone
const FLAT_MARGIN = 1.8;
// High-elevation rim: source tiles must be this far out (fraction of half-width)
const SOURCE_MIN_FRAC = 0.70;
// Minimum source spacing as fraction of grid width
const SOURCE_MIN_SPACING_FRAC = 0.15;
// Maximum river path length (safety cap)
const MAX_STEPS = 512;
export function generateHydrology(grid, config, seed) {
    const rand = mulberry32(seed ^ 0x77_A1_F0_3C);
    const GW = grid.width;
    const GH = grid.height;
    const GHW = (GW - 1) / 2;
    const GHH = (GH - 1) / 2;
    const FR = Math.round(GHW * 0.28);
    const terminateR = FR * FLAT_MARGIN;
    const sourceMinR = GHW * SOURCE_MIN_FRAC;
    const minSpacing = GW * SOURCE_MIN_SPACING_FRAC;
    // ── 1. Collect high-elevation rim candidates ───────────────────────────────
    const candidates = [];
    for (let row = 0; row < GH; row++) {
        for (let col = 0; col < GW; col++) {
            const dc = col - GHW, dr = row - GHH;
            const tR = Math.sqrt(dc * dc + dr * dr);
            if (tR >= sourceMinR && grid.get(col, row).elevation >= 3) {
                candidates.push({ col, row });
            }
        }
    }
    if (candidates.length === 0)
        return;
    // ── 2. Shuffle & select well-spaced sources ────────────────────────────────
    // Fisher-Yates shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
    }
    const chosen = [];
    for (const s of candidates) {
        if (chosen.length >= config.riverCount)
            break;
        const tooClose = chosen.some(c => {
            const dx = c.col - s.col, dz = c.row - s.row;
            return Math.sqrt(dx * dx + dz * dz) < minSpacing;
        });
        if (!tooClose)
            chosen.push(s);
    }
    // ── 3. Flow each river downhill ────────────────────────────────────────────
    for (const source of chosen) {
        const path = _flowDownhill(grid, source, GW, GH, GHW, GHH, terminateR);
        _markRiverPath(grid, path, GW, GH);
    }
}
// ── Internal: downhill flow ────────────────────────────────────────────────────
function _flowDownhill(grid, source, GW, GH, GHW, GHH, terminateR) {
    const visited = new Set();
    const path = [source];
    visited.add(source.row * GW + source.col);
    let current = source;
    for (let step = 0; step < MAX_STEPS; step++) {
        const { col, row } = current;
        const dc = col - GHW, dr = row - GHH;
        const tR = Math.sqrt(dc * dc + dr * dr);
        // Terminate at flat zone boundary
        if (tR < terminateR)
            break;
        // Terminate if already at bog level
        if (grid.get(col, row).elevation === 0)
            break;
        // Gather valid unvisited orthogonal neighbours
        const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const neighbours = [];
        for (const [dc2, dr2] of DIRS) {
            const nc = col + dc2;
            const nr = row + dr2;
            if (nc < 0 || nc >= GW || nr < 0 || nr >= GH)
                continue;
            if (visited.has(nr * GW + nc))
                continue;
            const cell = grid.get(nc, nr);
            if (cell.feature === 'river')
                continue; // don't cross another river
            // Score: prefer low elevation, break ties by proximity to centre
            const distToCenter = Math.sqrt((nc - GHW) ** 2 + (nr - GHH) ** 2);
            neighbours.push({
                col: nc, row: nr,
                score: cell.elevation * 100 + distToCenter * 0.5,
            });
        }
        if (neighbours.length === 0)
            break;
        // Pick the best-scoring neighbour (lowest score = most downhill + most central)
        neighbours.sort((a, b) => a.score - b.score);
        const next = neighbours[0];
        path.push({ col: next.col, row: next.row });
        visited.add(next.row * GW + next.col);
        current = next;
    }
    return path;
}
// ── Internal: mark river cells and banks ───────────────────────────────────────
function _markRiverPath(grid, path, GW, GH) {
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const { col, row } of path) {
        // Mark tile as river
        grid.set(col, row, { feature: 'river', walkable: false });
        // Mark orthogonal neighbours as river_bank (if not already water/river)
        for (const [dc, dr] of DIRS) {
            const nc = col + dc, nr = row + dr;
            if (nc < 0 || nc >= GW || nr < 0 || nr >= GH)
                continue;
            const c = grid.get(nc, nr);
            if (c.feature === 'none') {
                grid.set(nc, nr, { feature: 'river_bank' });
            }
        }
    }
}
