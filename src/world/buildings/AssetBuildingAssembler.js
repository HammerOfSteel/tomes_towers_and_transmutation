/**
 * AssetBuildingAssembler — constructs modular 3-D buildings from
 * Kenney Retro Fantasy Kit (public/assets/buildings/) GLB pieces.
 *
 * Coordinate conventions
 * ──────────────────────
 *  • Scale S = T = 2  → 1 Kenney native unit = 2 WU = 1 game tile
 *  • Kenney tile origins sit at the bottom-centre of the tile
 *  • wall.glb default orientation: primary (textured) face on the –Z side
 *      rotY =  0       → face points North (–Z)
 *      rotY =  π       → face points South (+Z)
 *      rotY = –π/2     → face points East  (+X)
 *      rotY = +π/2     → face points West  (–X)
 *
 * Assembly layout for a [cols × rows] footprint
 * ──────────────────────────────────────────────
 *  Floor layer   (y = 0):           cols × rows  floor.glb tiles
 *  Wall layers   (y = f × S):       perimeter tiles get wall tiles facing
 *                                   outward; corner tiles get two wall tiles
 *                                   (one NS-facing, one EW-facing) to cover
 *                                   both exterior faces without explicit corner
 *                                   pieces (the kit has none).
 *  Roof layer    (y = floors × S):  hip-roof assembly –
 *                                   corners → roof-corner.glb
 *                                   edges   → roof-edge.glb
 *                                   centre  → roof.glb
 */
import * as THREE from 'three';
import { BUILDING_SPECS } from './BuildingTypes';
// ── Constants ─────────────────────────────────────────────────────────────────
/** Scale factor: 1 Kenney unit = S world units = 1 game tile (T = 2). */
const S = 2;
const BASE = '/assets/buildings/';
const WALL_SETS = {
    cottage: { plain: 'wall', window: 'wall-window', door: 'wall-door' },
    inn: { plain: 'wall-paint', window: 'wall-paint-window', door: 'wall-paint-door' },
    market_stall: { plain: 'wall-half', window: 'wall-half', door: 'wall-half' },
    smithy: { plain: 'wall-fortified', window: 'wall-fortified-window', door: 'wall-fortified-door' },
    tavern: { plain: 'wall-pane-wood', window: 'wall-pane-wood-window', door: 'wall-pane-wood-door' },
    temple: { plain: 'wall-fortified', window: 'wall-fortified-window', door: 'wall-fortified-door' },
    city_hall: { plain: 'wall-fortified-paint', window: 'wall-fortified-paint-window', door: 'wall-fortified-paint-door' },
    guard_tower: { plain: 'wall-fortified', window: 'wall-fortified-window', door: 'wall-fortified-door' },
    well: { plain: 'wall-half', window: 'wall-half', door: 'wall-half' },
    market_cross: { plain: 'wall', window: 'wall', door: 'wall' },
};
/** Map each WallSet stem to a full GLB path. */
function _paths(ws) {
    return {
        plain: `${BASE}${ws.plain}.glb`,
        window: `${BASE}${ws.window}.glb`,
        door: `${BASE}${ws.door}.glb`,
    };
}
const WALL_PATHS = Object.fromEntries(Object.entries(WALL_SETS).map(([k, v]) => [k, _paths(v)]));
// ── Piece paths ────────────────────────────────────────────────────────────────
const FLOOR_GLB = `${BASE}floor.glb`;
const ROOF_GLB = `${BASE}roof.glb`;
const ROOF_CORNER_GLB = `${BASE}roof-corner.glb`;
const ROOF_EDGE_GLB = `${BASE}roof-edge.glb`;
const TOWER_BASE_GLB = `${BASE}tower-base.glb`;
const TOWER_BODY_GLB = `${BASE}tower.glb`;
const TOWER_TOP_GLB = `${BASE}tower-top.glb`;
const OVERHANG_GLB = `${BASE}overhang.glb`;
const STRUCTURE_POLE_GLB = `${BASE}structure-pole.glb`;
/** All GLB paths this assembler may request – preload these before calling assembleBuilding(). */
export const BUILDING_PRELOAD_PATHS = [
    ...new Set([
        FLOOR_GLB, ROOF_GLB, ROOF_CORNER_GLB, ROOF_EDGE_GLB,
        TOWER_BASE_GLB, TOWER_BODY_GLB, TOWER_TOP_GLB,
        OVERHANG_GLB, STRUCTURE_POLE_GLB,
        ...Object.values(WALL_PATHS).flatMap(ws => [ws.plain, ws.window, ws.door]),
    ]),
];
// ── Tiny seeded RNG (Mulberry32) ───────────────────────────────────────────────
function _rng(seed) {
    let s = (seed ^ 0xDEAD_BEEF) >>> 0;
    return () => {
        s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
        return s / 0x1_0000_0000;
    };
}
// ── Helper: clone + place a tile ──────────────────────────────────────────────
function _tile(loader, path, group, x, y, z, rotY = 0, scale = S) {
    const m = loader.getClone(path);
    if (!m)
        return;
    m.scale.setScalar(scale);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
}
// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Synchronously assembles a complete building from cached GLB clones.
 * Call `loader.preload(BUILDING_PRELOAD_PATHS)` before using this.
 *
 * The returned group is centred at (0, 0, 0) in its local space.
 * Apply world position / rotation externally.
 */
export function assembleBuilding(loader, type, seed) {
    const group = new THREE.Group();
    const spec = BUILDING_SPECS[type];
    const [cols, rows] = spec.footprint;
    const floors = spec.minFloors;
    // ── Special buildings ─────────────────────────────────────────────────────
    if (type === 'guard_tower') {
        _assembleGuardTower(loader, group, floors);
        return group;
    }
    if (type === 'well') {
        _assembleWell(loader, group);
        return group;
    }
    if (type === 'market_cross') {
        _assembleMarketCross(loader, group);
        return group;
    }
    if (type === 'market_stall') {
        _assembleMarketStall(loader, group, cols, rows);
        return group;
    }
    // ── Standard modular building ─────────────────────────────────────────────
    const ws = WALL_PATHS[type];
    const rng = _rng(seed);
    // Door tile: center of south wall, ground floor.
    // For 2-tile wide buildings (cols=2), put door at ix=0 (west side).
    const doorIx = cols <= 2 ? 0 : Math.floor(cols / 2);
    // ── Floor layer (ground level) ─────────────────────────────────────────
    for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
            _tile(loader, FLOOR_GLB, group, (ix - cols / 2 + 0.5) * S, 0, (iz - rows / 2 + 0.5) * S);
        }
    }
    // ── Wall layers ────────────────────────────────────────────────────────
    for (let f = 0; f < floors; f++) {
        const wy = f * S;
        for (let iz = 0; iz < rows; iz++) {
            for (let ix = 0; ix < cols; ix++) {
                const lx = (ix - cols / 2 + 0.5) * S;
                const lz = (iz - rows / 2 + 0.5) * S;
                const isN = iz === 0;
                const isS = iz === rows - 1;
                const isE = ix === cols - 1;
                const isW = ix === 0;
                if (!isN && !isS && !isE && !isW)
                    continue; // interior — skip
                // Each exterior direction this tile touches gets one wall tile.
                // Corner tiles get TWO wall tiles (one per edge direction) so both
                // exterior faces are textured correctly.
                const wallFaces = [];
                if (isN)
                    wallFaces.push({ rotY: 0 });
                if (isS)
                    wallFaces.push({ rotY: Math.PI });
                if (isE)
                    wallFaces.push({ rotY: -Math.PI / 2 });
                if (isW)
                    wallFaces.push({ rotY: Math.PI / 2 });
                for (const { rotY } of wallFaces) {
                    const isSouthFace = rotY === Math.PI;
                    const isDoor = f === 0 && isSouthFace && ix === doorIx;
                    // Windows: upper floors always get windows; ground floor gets windows
                    // on non-door tiles based on RNG (≈60% chance).
                    const isWindow = !isDoor && (f > 0 || rng() > 0.35);
                    const path = isDoor ? ws.door : isWindow ? ws.window : ws.plain;
                    _tile(loader, path, group, lx, wy, lz, rotY);
                }
            }
        }
    }
    // ── Roof layer ─────────────────────────────────────────────────────────
    const wyRoof = floors * S;
    for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
            const lx = (ix - cols / 2 + 0.5) * S;
            const lz = (iz - rows / 2 + 0.5) * S;
            const isN = iz === 0;
            const isS = iz === rows - 1;
            const isE = ix === cols - 1;
            const isW = ix === 0;
            let path;
            let rotY = 0;
            if (isN && isW) {
                path = ROOF_CORNER_GLB;
                rotY = Math.PI;
            }
            else if (isN && isE) {
                path = ROOF_CORNER_GLB;
                rotY = Math.PI / 2;
            }
            else if (isS && isW) {
                path = ROOF_CORNER_GLB;
                rotY = -Math.PI / 2;
            }
            else if (isS && isE) {
                path = ROOF_CORNER_GLB;
                rotY = 0;
            }
            else if (isN) {
                path = ROOF_EDGE_GLB;
                rotY = Math.PI;
            }
            else if (isS) {
                path = ROOF_EDGE_GLB;
                rotY = 0;
            }
            else if (isE) {
                path = ROOF_EDGE_GLB;
                rotY = -Math.PI / 2;
            }
            else if (isW) {
                path = ROOF_EDGE_GLB;
                rotY = Math.PI / 2;
            }
            else {
                path = ROOF_GLB;
                rotY = 0;
            }
            _tile(loader, path, group, lx, wyRoof, lz, rotY);
        }
    }
    return group;
}
// ── Specialised assembly helpers ──────────────────────────────────────────────
/**
 * guard_tower: stacked buildings/tower-base + tower (body) × (floors-2) + tower-top.
 * Uses the dedicated cylindrical tower models instead of wall-by-wall assembly.
 */
function _assembleGuardTower(loader, group, floors) {
    // buildings/tower.glb is ~1 WU tall native → S = 2 WU per section.
    const tileH = 1.0 * S;
    const sections = [
        [TOWER_BASE_GLB, 0],
        ...Array.from({ length: Math.max(0, floors - 2) }, (_, i) => [TOWER_BODY_GLB, (i + 1) * tileH]),
        [TOWER_TOP_GLB, (floors - 1) * tileH],
    ];
    for (const [path, y] of sections) {
        _tile(loader, path, group, 0, y, 0);
    }
}
/**
 * well: four wall-half tiles arranged in a ring + a small roof cap.
 * Scaled down to 60% to fit the 1×1 game-tile footprint neatly.
 */
function _assembleWell(loader, group) {
    const ws = WALL_PATHS.well;
    const sc = S * 0.6;
    const r = 0.5 * sc;
    const wallDirs = [
        [0, 0, -r], [0, 0, r], [-r, 0, 0], [r, 0, 0],
    ];
    const rotYs = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
    for (let i = 0; i < 4; i++) {
        const [x, , z] = wallDirs[i];
        _tile(loader, ws.plain, group, x, 0, z, rotYs[i], sc);
    }
    _tile(loader, ROOF_CORNER_GLB, group, 0, 0.5 * sc, 0, 0, sc);
}
/**
 * market_cross: a single decorative pole.
 */
function _assembleMarketCross(loader, group) {
    _tile(loader, STRUCTURE_POLE_GLB, group, 0, 0, 0);
}
/**
 * market_stall: open-sided awning.
 * Back wall (north): wall-half tiles at ground level.
 * Canopy (south): overhang tiles above counter height.
 */
function _assembleMarketStall(loader, group, cols, rows) {
    const ws = WALL_PATHS.market_stall;
    // Floor
    for (let iz = 0; iz < rows; iz++) {
        for (let ix = 0; ix < cols; ix++) {
            _tile(loader, FLOOR_GLB, group, (ix - cols / 2 + 0.5) * S, 0, (iz - rows / 2 + 0.5) * S);
        }
    }
    // North back wall (half height)
    for (let ix = 0; ix < cols; ix++) {
        _tile(loader, ws.plain, group, (ix - cols / 2 + 0.5) * S, 0, (-rows / 2) * S, 0);
    }
    // Overhang canopy along south row
    for (let ix = 0; ix < cols; ix++) {
        _tile(loader, OVERHANG_GLB, group, (ix - cols / 2 + 0.5) * S, S * 0.5, (rows / 2 - 0.5) * S, Math.PI);
    }
}
