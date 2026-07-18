// ── Tower Generator ───────────────────────────────────────────────────────────
//
//  Generates all 11 tower floors (basement B + floors 0–9) as a DungeonPlan
//  that the existing SceneManager.loadDungeon() can consume unchanged.
//
//  Each floor consists of:
//    1. A circular main chamber (~17×17 cells, radius=7)
//    2. 2–4 seeded side rooms attached via door triggers
//
//  Chamber IDs are deterministic (no seed component) so cleared-room state
//  survives across multiple game sessions with the same tower layout:
//    "tower_<floorId>_chamber"    — the circular hall
//    "tower_<floorId>_room_<n>"  — the nth side room (0-based)
//
//  Staircase connectivity (north wall = up, south wall = down):
//    Each chamber's UP staircase targetId → chamber ID of the floor above
//    Each chamber's DOWN staircase targetId → chamber ID of the floor below
//
//  Usage:
//    const plan = generateTower(seed);
//    sceneManager.loadDungeon(plan);
import { BLUEPRINT_VERSION } from './blueprint';
import { mulberry32, randInt } from '@/core/prng';
import { TOWER_FLOOR_DEFS, PLAYER_START_FLOOR_INDEX, FLOORS_ORDERED, } from './TowerFloorDef';
// ── Layout constants ──────────────────────────────────────────────────────────
const CELL = 2; // world units per cell
const WALL_H = 3.5; // default wall height
const R = 7; // chamber circle radius in cells
const SZ = 2 * R + 3; // 17 — chamber grid side length
const CX = R + 1; // 8  — cell-space centre X
const CZ_CENTER = R + 1; // 8  — cell-space centre Z
// Staircase cells (floor cells on the circle edge, touching perimeter wall)
const STAIR_UP_X = CX;
const STAIR_UP_Z = 1;
const STAIR_DOWN_X = CX;
const STAIR_DOWN_Z = SZ - 2; // 15
// Door slots on the chamber perimeter — wall cells adjacent to a floor cell.
const DOOR_SLOTS = [
    { x: SZ - 2, z: 5, facing: 'east' }, // NE
    { x: SZ - 2, z: 11, facing: 'east' }, // SE
    { x: 1, z: 5, facing: 'west' }, // NW
    { x: 1, z: 11, facing: 'west' }, // SW
];
// Side room grid size (cells)
const SR_W = 9;
const SR_D = 9;
// ── Decorative element positions ──────────────────────────────────────────────
// 8-pillar ring at radius ~5 (using Pythagorean triples: 3-4-5)
const PILLAR_RING = [
    { x: CX + 5, z: CZ_CENTER }, // E  (13, 8)
    { x: CX + 4, z: CZ_CENTER + 3 }, // ENE (12, 11)
    { x: CX, z: CZ_CENTER + 5 }, // S  (8, 13)
    { x: CX - 4, z: CZ_CENTER + 3 }, // WSW (4, 11)
    { x: CX - 5, z: CZ_CENTER }, // W  (3, 8)
    { x: CX - 4, z: CZ_CENTER - 3 }, // WNW (4, 5)
    { x: CX, z: CZ_CENTER - 5 }, // N  (8, 3)
    { x: CX + 4, z: CZ_CENTER - 3 }, // ENE (12, 5)
];
// 4 bookshelves inside the chamber — shifted to NE/SW quadrants so they
// never sit on the staircase axis (x=8) at z=2 or z=14, which would block
// access to the UP/DOWN staircases at (8,1) and (8,15).
const BOOKSHELF_RING = [
    { x: 15, z: 8, rotation: 90 }, // East wall (between door slots at z=5 and z=11)
    { x: 1, z: 8, rotation: 90 }, // West wall
    { x: 12, z: 4, rotation: 0 }, // NE quadrant — clear of all door slots and staircase axes
    { x: 4, z: 12, rotation: 180 }, // SW quadrant — faces north toward center
];
// 4 candelabras at mid-radius cardinal positions — far enough from centre to
// leave the main fixture visible, clear of pillar ring, door slots, and staircase axes.
const CANDELABRA_RING = [
    { x: CX, z: CZ_CENTER - 4 }, // N  (8, 4)
    { x: CX + 4, z: CZ_CENTER }, // E  (12, 8)
    { x: CX, z: CZ_CENTER + 4 }, // S  (8, 12)
    { x: CX - 4, z: CZ_CENTER }, // W  (4, 8)
];
// ── ID helpers ────────────────────────────────────────────────────────────────
function chamberId(def) {
    return `tower_${def.id}_chamber`;
}
function sideRoomId(def, n) {
    return `tower_${def.id}_room_${n}`;
}
// ── Circular chamber builder ──────────────────────────────────────────────────
function buildChamber(def, sideRoomIds, stairDownTarget, stairUpTarget) {
    const wallH = def.wallHeight ?? WALL_H;
    // Wall tiles — every cell outside the circle
    const tiles = [];
    for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SZ; x++) {
            const dx = x - CX;
            const dz = z - CZ_CENTER;
            if (dx * dx + dz * dz > R * R) {
                tiles.push({ x, z, type: 'wall' });
            }
        }
    }
    // Decorative pillar ring (optional)
    if (def.chamberPillars) {
        for (const p of PILLAR_RING) {
            tiles.push({ x: p.x, z: p.z, type: 'pillar' });
        }
    }
    // Door tiles — selected perimeter walls become passable openings
    const doors = sideRoomIds.map((targetId, i) => ({
        x: DOOR_SLOTS[i].x,
        z: DOOR_SLOTS[i].z,
        facing: DOOR_SLOTS[i].facing,
        targetId,
    }));
    // Exterior exit door (foyer only) — a door on slot exteriorExitSlot that
    // leads back to the overworld instead of a side room (targetId = null)
    if (def.exteriorExitSlot !== undefined) {
        const exitSlot = DOOR_SLOTS[def.exteriorExitSlot];
        doors.push({ x: exitSlot.x, z: exitSlot.z, facing: exitSlot.facing, targetId: null });
    }
    // Staircases
    const staircases = [];
    if (stairDownTarget !== null) {
        staircases.push({
            x: STAIR_DOWN_X, z: STAIR_DOWN_Z,
            facing: 'south', direction: 'down', targetId: stairDownTarget,
        });
    }
    if (stairUpTarget !== null) {
        staircases.push({
            x: STAIR_UP_X, z: STAIR_UP_Z,
            facing: 'north', direction: 'up', targetId: stairUpTarget,
        });
    }
    // Key fixture at chamber centre
    const interactables = [
        {
            x: CX, z: CZ_CENTER,
            type: def.keyFixture.type,
            content: def.keyFixture.content,
            spellUnlock: def.keyFixture.spellUnlock,
        },
    ];
    // Optional second chamber fixture (e.g. library telescope) — placed east of centre
    if (def.chamberExtraFixture) {
        interactables.push({
            x: CX + 3, z: CZ_CENTER,
            type: def.chamberExtraFixture.type,
            content: def.chamberExtraFixture.content,
            spellUnlock: def.chamberExtraFixture.spellUnlock,
        });
    }
    // Decorative bookshelf ring (optional) — 4 shelves close to cardinal walls
    if (def.chamberBookshelves) {
        for (let i = 0; i < BOOKSHELF_RING.length; i++) {
            const s = BOOKSHELF_RING[i];
            interactables.push({
                x: s.x, z: s.z,
                type: 'bookshelf',
                rotation: s.rotation,
                ...(def.chamberBookshelfContent ? { content: def.chamberBookshelfContent[i] } : {}),
            });
        }
    }
    // Candelabra ring (optional) — 4 tall candelabras at mid-radius cardinal positions
    if (def.chamberCandelabras) {
        for (const c of CANDELABRA_RING) {
            interactables.push({ x: c.x, z: c.z, type: 'candelabra' });
        }
    }
    // Explicit scatter items (barrels, crates, chests, narrative key items)
    if (def.chamberScatter) {
        for (const s of def.chamberScatter) {
            interactables.push({
                x: s.x, z: s.z,
                type: s.type,
                rotation: s.rotation,
                content: s.content,
            });
        }
    }
    return {
        id: chamberId(def),
        version: BLUEPRINT_VERSION,
        width: SZ, depth: SZ,
        cellSize: CELL,
        wallHeight: wallH,
        tiles, doors, staircases, spawns: [],
        interactables,
        floor: def.floorIndex,
        floorType: def.floorType,
    };
}
// ── Side room builder ─────────────────────────────────────────────────────────
function buildSideRoom(def, roomIndex, chamberBpId, slotFacing, // the chamber slot facing
rand) {
    // The side room's return door faces the opposite direction from the chamber slot
    const returnFacing = slotFacing === 'east' ? 'west' : 'east';
    const doorX = returnFacing === 'west' ? 0 : SR_W - 1;
    // Perimeter walls
    const tiles = [];
    for (let z = 0; z < SR_D; z++) {
        for (let x = 0; x < SR_W; x++) {
            if (x === 0 || x === SR_W - 1 || z === 0 || z === SR_D - 1) {
                tiles.push({ x, z, type: 'wall' });
            }
        }
    }
    // Door back to the chamber
    const doors = [
        {
            x: doorX,
            z: Math.floor(SR_D / 2),
            facing: returnFacing,
            targetId: chamberBpId,
        },
    ];
    // Enemy spawns in interior cells
    const spawns = [];
    for (let i = 0; i < def.enemiesPerRoom; i++) {
        const sx = 2 + randInt(rand, SR_W - 4);
        const sz = 2 + randInt(rand, SR_D - 4);
        spawns.push({ x: sx, z: sz, type: 'slime' });
    }
    // A prop placed in the corner furthest from the door
    const interactables = [];
    if (def.sideRoomProps.length > 0) {
        const propType = def.sideRoomProps[roomIndex % def.sideRoomProps.length];
        // Prop in the corner away from the return door
        const propX = returnFacing === 'west' ? SR_W - 2 : 1;
        interactables.push({
            x: propX,
            z: 1,
            type: propType,
        });
        // Second prop if room has multiple prop types
        if (def.sideRoomProps.length > 1) {
            const propType2 = def.sideRoomProps[(roomIndex + 1) % def.sideRoomProps.length];
            interactables.push({
                x: propX,
                z: SR_D - 2,
                type: propType2,
            });
        }
    }
    return {
        id: sideRoomId(def, roomIndex),
        version: BLUEPRINT_VERSION,
        width: SR_W,
        depth: SR_D,
        cellSize: CELL,
        wallHeight: WALL_H,
        tiles,
        doors,
        staircases: [],
        spawns,
        interactables,
        floor: def.floorIndex,
        floorType: def.floorType,
    };
}
// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Generate all 11 tower floors deterministically from a 32-bit seed.
 * Returns a DungeonPlan compatible with SceneManager.loadDungeon().
 * The player starts in the Living Quarters circular chamber (floor 3).
 */
export function generateTower(seed) {
    const rand = mulberry32(seed);
    const rooms = new Map();
    // ── Step 1: decide how many side rooms each floor gets ───────────────────
    const sideRoomCounts = new Map();
    for (const def of FLOORS_ORDERED) {
        const [min, max] = def.sideRoomCount;
        sideRoomCounts.set(def.floorIndex, min + randInt(rand, max - min + 1));
    }
    // ── Step 2: build chamber blueprints and side rooms ──────────────────────
    for (const def of FLOORS_ORDERED) {
        const count = sideRoomCounts.get(def.floorIndex);
        // Side room IDs for this floor
        const srIds = Array.from({ length: count }, (_, i) => sideRoomId(def, i));
        // Staircase targets: chamber ID of adjacent floor (null at top/bottom)
        const below = getFloorDef(def.floorIndex - 1);
        const above = getFloorDef(def.floorIndex + 1);
        const downTarget = below ? chamberId(below) : null;
        const upTarget = above ? chamberId(above) : null;
        // Build and register the circular chamber
        const chamber = buildChamber(def, srIds, downTarget, upTarget);
        rooms.set(chamber.id, chamber);
        // Build and register each side room
        for (let i = 0; i < count; i++) {
            const slot = DOOR_SLOTS[i];
            const sr = buildSideRoom(def, i, chamber.id, slot.facing, rand);
            rooms.set(sr.id, sr);
        }
    }
    const startFloorDef = FLOORS_ORDERED.find((d) => d.floorIndex === PLAYER_START_FLOOR_INDEX);
    const startRoomId = chamberId(startFloorDef);
    return { rooms, startRoomId, seed };
}
// ── Internal helper (re-exported for tests) ───────────────────────────────────
function getFloorDef(floorIndex) {
    return TOWER_FLOOR_DEFS.find((d) => d.floorIndex === floorIndex);
}
