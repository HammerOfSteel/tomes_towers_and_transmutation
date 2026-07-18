// ── Blueprint Schema v1.0 ─────────────────────────────────────────────────
// All room layouts are defined in JSON conforming to this schema.
// Blueprints are authored by hand (or exported by the editor in Phase 4)
// and consumed by BlueprintRenderer at runtime.
export const BLUEPRINT_VERSION = 1;
// ── Validation ────────────────────────────────────────────────────────────
export class BlueprintError extends Error {
    constructor(id, msg) {
        super(`Blueprint "${id}": ${msg}`);
        this.name = 'BlueprintError';
    }
}
const VALID_TILE_TYPES = ['wall', 'pillar'];
const VALID_FACINGS = ['north', 'south', 'east', 'west'];
const VALID_STAIR_DIRS = ['up', 'down'];
const VALID_SPAWN_TYPES = ['slime'];
const VALID_INTERACTABLE_TYPES = [
    'bookshelf', 'lectern',
    'cauldron', 'telescope', 'forge', 'quest_board', 'greenhouse_orb',
    'barrel', 'crate', 'chest', 'candelabra', 'workbench_key', 'locked_door',
    'potion_rack', 'distillation_coil', 'fermenting_vat', 'herb_bundle',
    'anvil', 'cooling_trough',
    'bed', 'wardrobe', 'writing_desk', 'bunk', 'mess_table',
    'reading_table', 'globe',
    'map_table', 'weapon_stand',
    'plant_pot', 'raised_planter',
    'containment_ring', 'astrolabe',
    'banner', 'rug',
];
const VALID_FLOOR_TYPES = [
    'stone', 'stone_alchemy', 'stone_herald', 'stone_damp',
    'stone_scorched', 'stone_sealed', 'stone_celestial',
    'grass', 'dirt', 'wood',
];
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);
/** Validates a raw parsed value as a Blueprint, throwing BlueprintError on failure. */
export function validateBlueprint(raw) {
    if (typeof raw !== 'object' || raw === null)
        throw new BlueprintError('?', 'expected an object');
    const r = raw;
    const id = typeof r.id === 'string' ? r.id : '?';
    if (typeof r.id !== 'string' || r.id.length === 0)
        throw new BlueprintError(id, 'id must be a non-empty string');
    if (r.version !== BLUEPRINT_VERSION)
        throw new BlueprintError(id, `unsupported version (got ${String(r.version)}, expected ${BLUEPRINT_VERSION})`);
    if (typeof r.width !== 'number' || r.width < 1 || !Number.isInteger(r.width))
        throw new BlueprintError(id, 'width must be a positive integer');
    if (typeof r.depth !== 'number' || r.depth < 1 || !Number.isInteger(r.depth))
        throw new BlueprintError(id, 'depth must be a positive integer');
    if (typeof r.cellSize !== 'number' || r.cellSize <= 0)
        throw new BlueprintError(id, 'cellSize must be a positive number');
    if (typeof r.wallHeight !== 'number' || r.wallHeight <= 0)
        throw new BlueprintError(id, 'wallHeight must be a positive number');
    if (!Array.isArray(r.tiles))
        throw new BlueprintError(id, 'tiles must be an array');
    if (!Array.isArray(r.doors))
        throw new BlueprintError(id, 'doors must be an array');
    if (!Array.isArray(r.staircases))
        throw new BlueprintError(id, 'staircases must be an array');
    if (!Array.isArray(r.spawns))
        throw new BlueprintError(id, 'spawns must be an array');
    if (!Array.isArray(r.interactables))
        throw new BlueprintError(id, 'interactables must be an array');
    if (typeof r.floor !== 'number' || !Number.isInteger(r.floor))
        throw new BlueprintError(id, 'floor must be an integer');
    if (r.floorType !== undefined && !VALID_FLOOR_TYPES.includes(r.floorType))
        throw new BlueprintError(id, `invalid floorType "${String(r.floorType)}"`);
    for (const t of r.tiles) {
        const tile = t;
        if (typeof tile.x !== 'number' || typeof tile.z !== 'number')
            throw new BlueprintError(id, `tile missing numeric x/z: ${JSON.stringify(t)}`);
        if (!VALID_TILE_TYPES.includes(tile.type))
            throw new BlueprintError(id, `unknown tile type "${String(tile.type)}"`);
        if (tile.rotation !== undefined && !VALID_ROTATIONS.has(tile.rotation))
            throw new BlueprintError(id, `invalid tile rotation "${String(tile.rotation)}"`);
    }
    for (const d of r.doors) {
        const door = d;
        if (typeof door.x !== 'number' || typeof door.z !== 'number')
            throw new BlueprintError(id, `door missing numeric x/z: ${JSON.stringify(d)}`);
        if (!VALID_FACINGS.includes(door.facing))
            throw new BlueprintError(id, `invalid door facing "${String(door.facing)}"`);
        if (door.targetId !== null && typeof door.targetId !== 'string')
            throw new BlueprintError(id, 'door targetId must be a string or null');
    }
    for (const s of r.staircases) {
        const stair = s;
        if (typeof stair.x !== 'number' || typeof stair.z !== 'number')
            throw new BlueprintError(id, `staircase missing numeric x/z: ${JSON.stringify(s)}`);
        if (!VALID_FACINGS.includes(stair.facing))
            throw new BlueprintError(id, `invalid staircase facing "${String(stair.facing)}"`);
        if (!VALID_STAIR_DIRS.includes(stair.direction))
            throw new BlueprintError(id, `invalid staircase direction "${String(stair.direction)}"`);
        if (stair.targetId !== null && typeof stair.targetId !== 'string')
            throw new BlueprintError(id, 'staircase targetId must be a string or null');
    }
    for (const s of r.spawns) {
        const spawn = s;
        if (typeof spawn.x !== 'number' || typeof spawn.z !== 'number')
            throw new BlueprintError(id, `spawn missing numeric x/z: ${JSON.stringify(s)}`);
        if (!VALID_SPAWN_TYPES.includes(spawn.type))
            throw new BlueprintError(id, `unknown spawn type "${String(spawn.type)}"`);
    }
    for (const i of r.interactables) {
        const item = i;
        if (typeof item.x !== 'number' || typeof item.z !== 'number')
            throw new BlueprintError(id, `interactable missing numeric x/z: ${JSON.stringify(i)}`);
        if (!VALID_INTERACTABLE_TYPES.includes(item.type))
            throw new BlueprintError(id, `unknown interactable type "${String(item.type)}"`);
        if (item.rotation !== undefined && !VALID_ROTATIONS.has(item.rotation))
            throw new BlueprintError(id, `invalid interactable rotation "${String(item.rotation)}"`);
        if (item.spellUnlock !== undefined && typeof item.spellUnlock !== 'string')
            throw new BlueprintError(id, 'interactable spellUnlock must be a string');
    }
    return raw;
}
/** Serialize a Blueprint to a canonical JSON string (2-space indent). */
export function serializeBlueprint(bp) {
    return JSON.stringify(bp, null, 2);
}
/** Parse a JSON string and validate it as a Blueprint. */
export function parseBlueprint(json) {
    let raw;
    try {
        raw = JSON.parse(json);
    }
    catch (e) {
        throw new BlueprintError('?', `invalid JSON: ${String(e)}`);
    }
    return validateBlueprint(raw);
}
// ── Helpers ───────────────────────────────────────────────────────────────
/** Convert grid cell (cx, cz) to world-space centre, with room centred at origin. */
export function cellToWorld(cx, cz, bp) {
    return {
        x: (cx + 0.5) * bp.cellSize - (bp.width * bp.cellSize) / 2,
        z: (cz + 0.5) * bp.cellSize - (bp.depth * bp.cellSize) / 2,
    };
}
/** Compute the world spawn position for a player entering through a given door
 *  or staircase.  The player is placed `cellSize` units inward from the entry
 *  cell along the facing direction. */
export function doorSpawnPosition(entry, bp) {
    const { x: cx, z: cz } = cellToWorld(entry.x, entry.z, bp);
    const inset = bp.cellSize;
    let ox = 0;
    let oz = 0;
    switch (entry.facing) {
        case 'north':
            oz = +inset;
            break; // enter from north → step south (increasing z)
        case 'south':
            oz = -inset;
            break; // enter from south → step north (decreasing z)
        case 'east':
            ox = -inset;
            break; // enter from east  → step west
        case 'west':
            ox = +inset;
            break; // enter from west  → step east
    }
    return { x: cx + ox, y: 1.5, z: cz + oz };
}
/** Return true if `playerPos` is inside the door trigger AABB. */
export function isInsideTrigger(playerX, playerZ, center, half) {
    return (Math.abs(playerX - center.x) <= half.x &&
        Math.abs(playerZ - center.z) <= half.z);
}
