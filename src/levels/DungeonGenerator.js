// ── Dungeon Generator ─────────────────────────────────────────────────────────
//
//  Produces a DungeonPlan — a set of room instances (modified Blueprint copies)
//  whose door `targetId` fields are wired together.  The plan is fully
//  deterministic: the same seed always produces the same layout.
//
//  Blueprint topology (current pool):
//
//    cell_start   [N exit]  → entry room, always first
//    corridor_ns  [S in, N out] → N-S linear segment; repeated 0-K times
//    library_small[S in, E out] → the "hub" room before the east branch
//    corridor_ew  [W in, E out] → east branch; terminates with a dead-end door
//
//  For a richer generator add more blueprints with varied facings; the
//  algorithm automatically incorporates them via the compatibility tables.
import { validateBlueprint } from './blueprint';
import { mulberry32, randInt } from '@/core/prng';
// Raw blueprint JSON imports ── same as SceneManager; JSON has no side effects
import cellStartRaw from './blueprints/cell_start.json';
import corridorNsRaw from './blueprints/corridor_ns.json';
import corridorEwRaw from './blueprints/corridor_ew.json';
import librarySmallRaw from './blueprints/library_small.json';
// ── Helpers ───────────────────────────────────────────────────────────────────
const OPPOSITE = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
};
/** Deep-clone a Blueprint, assigning a new unique instance ID.
 *  All door `targetId` values are reset to `null` so the generator can
 *  wire them fresh (the base JSONs already have hand-crafted connections). */
function cloneRoom(base, instanceId) {
    return {
        ...base,
        id: instanceId,
        // Reset door targets so generator wires them from scratch
        doors: base.doors.map((d) => ({ ...d, targetId: null })),
        tiles: base.tiles, // read-only in generator; safe to share
        spawns: base.spawns, // read-only
        interactables: base.interactables, // read-only
        staircases: base.staircases, // read-only
    };
}
/** Find the index of a door with the given facing and no target yet. */
function findFreeDoor(room, facing) {
    return room.doors.findIndex((d) => d.facing === facing && d.targetId === null);
}
// ── Base blueprint pool ───────────────────────────────────────────────────────
function buildBasePool() {
    const raws = [cellStartRaw, corridorNsRaw, corridorEwRaw, librarySmallRaw];
    return new Map(raws.map((raw) => {
        const bp = validateBlueprint(raw);
        return [bp.id, bp];
    }));
}
// Lazy singleton — built once, never mutated.
let _basePool = null;
function getBasePool() {
    if (!_basePool)
        _basePool = buildBasePool();
    return _basePool;
}
// ── Generator ─────────────────────────────────────────────────────────────────
/**
 * Generate a dungeon layout deterministically from a seed.
 *
 * @param seed       32-bit integer seed (same seed → identical plan)
 * @param floorCount Scales the corridor count: corridors = floorCount + rand(3)
 * @param basePrints Override the blueprint pool (useful for tests)
 */
export function generateDungeon(seed, floorCount, basePrints = getBasePool()) {
    const rand = mulberry32(seed);
    const rooms = new Map();
    let idx = 0;
    /** Allocate a new instance of the given blueprint. */
    function allocRoom(bpId) {
        const base = basePrints.get(bpId);
        if (!base)
            throw new Error(`DungeonGenerator: unknown blueprint "${bpId}"`);
        const inst = cloneRoom(base, `room_${idx++}`);
        rooms.set(inst.id, inst);
        return inst;
    }
    /** Wire two rooms together: fromRoom[exitFacing] ↔ toRoom[oppositeFacing]. */
    function connect(fromRoom, exitFacing, toRoom) {
        const fromIdx = findFreeDoor(fromRoom, exitFacing);
        const toIdx = findFreeDoor(toRoom, OPPOSITE[exitFacing]);
        if (fromIdx === -1)
            throw new Error(`DungeonGenerator: room "${fromRoom.id}" (${fromRoom.id}) has no free ${exitFacing} door`);
        if (toIdx === -1)
            throw new Error(`DungeonGenerator: room "${toRoom.id}" has no free ${OPPOSITE[exitFacing]} door`);
        fromRoom.doors[fromIdx].targetId = toRoom.id;
        toRoom.doors[toIdx].targetId = fromRoom.id;
    }
    // ── Build the chain ──────────────────────────────────────────────────────
    //
    //  cell_start  →  [corridor_ns × N]  →  library_small  →  corridor_ew
    //
    //  N ∈ [floorCount, floorCount + 2]  (seed-controlled)
    const corridorCount = Math.max(0, floorCount - 1) + randInt(rand, 3); // 0..4 for floorCount=1..3
    const startRoom = allocRoom('cell_start');
    // Build N-S corridor chain
    let prevRoom = startRoom;
    let exitFacing = 'north'; // cell_start's free door faces north
    for (let i = 0; i < corridorCount; i++) {
        const corridor = allocRoom('corridor_ns');
        connect(prevRoom, exitFacing, corridor);
        prevRoom = corridor;
        exitFacing = 'north'; // corridor_ns exits north
    }
    // Hub room (library_small has south entry + east exit)
    const hub = allocRoom('library_small');
    connect(prevRoom, exitFacing, hub); // prevRoom.north → hub.south
    // East branch
    const branch = allocRoom('corridor_ew');
    connect(hub, 'east', branch); // hub.east → branch.west
    // branch.east remains null (dead-end exterior exit)
    return { rooms, startRoomId: startRoom.id, seed };
}
