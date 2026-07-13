// ── Blueprint Schema v1.0 ─────────────────────────────────────────────────
// All room layouts are defined in JSON conforming to this schema.
// Blueprints are authored by hand (or exported by the editor in Phase 4)
// and consumed by BlueprintRenderer at runtime.

export const BLUEPRINT_VERSION = 1 as const;

export type TileType = 'wall' | 'pillar';
export type DoorFacing = 'north' | 'south' | 'east' | 'west';
export type StairDirection = 'up' | 'down';
export type SpawnType = 'slime';
export type InteractableType = 'bookshelf' | 'lectern';
export type FloorType = 'stone' | 'grass' | 'dirt' | 'wood';
/** Clockwise rotation around the Y axis in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

export interface TileEntry {
  /** Grid column — 0 is the west edge, increases east. */
  x: number;
  /** Grid row — 0 is the north edge, increases south. */
  z: number;
  type: TileType;
  /** Wall height override in world units. Omit to use Blueprint.wallHeight. */
  h?: number;
  /** Clockwise rotation around Y axis. Defaults to 0. */
  rotation?: Rotation;
}

export interface DoorEntry {
  x: number;
  z: number;
  /** Which wall the door sits on (the direction you walk to exit). */
  facing: DoorFacing;
  /** Blueprint ID this door connects to. null = exterior exit (no destination yet). */
  targetId: string | null;
}

export interface SpawnEntry {
  x: number;
  z: number;
  type: SpawnType;
}

export interface InteractableEntry {
  x: number;
  z: number;
  type: InteractableType;
  /** Text displayed when the player reads/examines this object. */
  content?: string;
  /** Clockwise rotation around Y axis. Defaults to 0 (faces south into the room). */
  rotation?: Rotation;
  /** Spell key that is unlocked the first time this item is read. */
  spellUnlock?: string;
}

export interface StaircaseEntry {
  x: number;
  z: number;
  /** Which wall the staircase is built against (the direction you exit). */
  facing: DoorFacing;
  /** Whether this staircase leads up or down one floor. */
  direction: StairDirection;
  /** Blueprint ID of the room at the other end of the staircase. */
  targetId: string | null;
}

export interface Blueprint {
  id: string;
  version: typeof BLUEPRINT_VERSION;
  /** Room width in grid cells (X axis). */
  width: number;
  /** Room depth in grid cells (Z axis). */
  depth: number;
  /** World units per grid cell. */
  cellSize: number;
  /** Default wall height in world units. */
  wallHeight: number;
  /** Wall and pillar placements. Floor is implicit for all unlisted cells. */
  tiles: TileEntry[];
  doors: DoorEntry[];
  /** Staircases leading to rooms on adjacent floors. */
  staircases: StaircaseEntry[];
  spawns: SpawnEntry[];
  interactables: InteractableEntry[];
  /** Which floor this room is on (0 = ground, 1 = first floor up, etc.). */
  floor: number;
  /** Floor material type. Defaults to 'stone'. Affects floor colour in the renderer. */
  floorType?: FloorType;
}

// ── Validation ────────────────────────────────────────────────────────────

export class BlueprintError extends Error {
  constructor(id: string, msg: string) {
    super(`Blueprint "${id}": ${msg}`);
    this.name = 'BlueprintError';
  }
}

const VALID_TILE_TYPES: TileType[] = ['wall', 'pillar'];
const VALID_FACINGS: DoorFacing[] = ['north', 'south', 'east', 'west'];
const VALID_STAIR_DIRS: StairDirection[] = ['up', 'down'];
const VALID_SPAWN_TYPES: SpawnType[] = ['slime'];
const VALID_INTERACTABLE_TYPES: InteractableType[] = ['bookshelf', 'lectern'];
const VALID_FLOOR_TYPES: FloorType[] = ['stone', 'grass', 'dirt', 'wood'];
const VALID_ROTATIONS = new Set<number>([0, 90, 180, 270]);

/** Validates a raw parsed value as a Blueprint, throwing BlueprintError on failure. */
export function validateBlueprint(raw: unknown): Blueprint {
  if (typeof raw !== 'object' || raw === null)
    throw new BlueprintError('?', 'expected an object');

  const r = raw as Record<string, unknown>;
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
  if (r.floorType !== undefined && !VALID_FLOOR_TYPES.includes(r.floorType as FloorType))
    throw new BlueprintError(id, `invalid floorType "${String(r.floorType)}"`);

  for (const t of r.tiles as unknown[]) {
    const tile = t as Record<string, unknown>;
    if (typeof tile.x !== 'number' || typeof tile.z !== 'number')
      throw new BlueprintError(id, `tile missing numeric x/z: ${JSON.stringify(t)}`);
    if (!VALID_TILE_TYPES.includes(tile.type as TileType))
      throw new BlueprintError(id, `unknown tile type "${String(tile.type)}"`);
    if (tile.rotation !== undefined && !VALID_ROTATIONS.has(tile.rotation as number))
      throw new BlueprintError(id, `invalid tile rotation "${String(tile.rotation)}"`);
  }

  for (const d of r.doors as unknown[]) {
    const door = d as Record<string, unknown>;
    if (typeof door.x !== 'number' || typeof door.z !== 'number')
      throw new BlueprintError(id, `door missing numeric x/z: ${JSON.stringify(d)}`);
    if (!VALID_FACINGS.includes(door.facing as DoorFacing))
      throw new BlueprintError(id, `invalid door facing "${String(door.facing)}"`);
    if (door.targetId !== null && typeof door.targetId !== 'string')
      throw new BlueprintError(id, 'door targetId must be a string or null');
  }

  for (const s of r.staircases as unknown[]) {
    const stair = s as Record<string, unknown>;
    if (typeof stair.x !== 'number' || typeof stair.z !== 'number')
      throw new BlueprintError(id, `staircase missing numeric x/z: ${JSON.stringify(s)}`);
    if (!VALID_FACINGS.includes(stair.facing as DoorFacing))
      throw new BlueprintError(id, `invalid staircase facing "${String(stair.facing)}"`);
    if (!VALID_STAIR_DIRS.includes(stair.direction as StairDirection))
      throw new BlueprintError(id, `invalid staircase direction "${String(stair.direction)}"`);
    if (stair.targetId !== null && typeof stair.targetId !== 'string')
      throw new BlueprintError(id, 'staircase targetId must be a string or null');
  }

  for (const s of r.spawns as unknown[]) {
    const spawn = s as Record<string, unknown>;
    if (typeof spawn.x !== 'number' || typeof spawn.z !== 'number')
      throw new BlueprintError(id, `spawn missing numeric x/z: ${JSON.stringify(s)}`);
    if (!VALID_SPAWN_TYPES.includes(spawn.type as SpawnType))
      throw new BlueprintError(id, `unknown spawn type "${String(spawn.type)}"`);
  }

  for (const i of r.interactables as unknown[]) {
    const item = i as Record<string, unknown>;
    if (typeof item.x !== 'number' || typeof item.z !== 'number')
      throw new BlueprintError(id, `interactable missing numeric x/z: ${JSON.stringify(i)}`);
    if (!VALID_INTERACTABLE_TYPES.includes(item.type as InteractableType))
      throw new BlueprintError(id, `unknown interactable type "${String(item.type)}"`);
    if (item.rotation !== undefined && !VALID_ROTATIONS.has(item.rotation as number))
      throw new BlueprintError(id, `invalid interactable rotation "${String(item.rotation)}"`);
    if (item.spellUnlock !== undefined && typeof item.spellUnlock !== 'string')
      throw new BlueprintError(id, 'interactable spellUnlock must be a string');
  }

  return raw as Blueprint;
}

/** Serialize a Blueprint to a canonical JSON string (2-space indent). */
export function serializeBlueprint(bp: Blueprint): string {
  return JSON.stringify(bp, null, 2);
}

/** Parse a JSON string and validate it as a Blueprint. */
export function parseBlueprint(json: string): Blueprint {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new BlueprintError('?', `invalid JSON: ${String(e)}`);
  }
  return validateBlueprint(raw);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Convert grid cell (cx, cz) to world-space centre, with room centred at origin. */
export function cellToWorld(
  cx: number,
  cz: number,
  bp: Blueprint,
): { x: number; z: number } {
  return {
    x: (cx + 0.5) * bp.cellSize - (bp.width * bp.cellSize) / 2,
    z: (cz + 0.5) * bp.cellSize - (bp.depth * bp.cellSize) / 2,
  };
}

/** Compute the world spawn position for a player entering through a given door
 *  or staircase.  The player is placed `cellSize` units inward from the entry
 *  cell along the facing direction. */
export function doorSpawnPosition(
  entry: DoorEntry | StaircaseEntry,
  bp: Blueprint,
): { x: number; y: number; z: number } {
  const { x: cx, z: cz } = cellToWorld(entry.x, entry.z, bp);
  const inset = bp.cellSize;
  let ox = 0;
  let oz = 0;
  switch (entry.facing) {
    case 'north': oz = +inset; break;  // enter from north → step south (increasing z)
    case 'south': oz = -inset; break;  // enter from south → step north (decreasing z)
    case 'east':  ox = -inset; break;  // enter from east  → step west
    case 'west':  ox = +inset; break;  // enter from west  → step east
  }
  return { x: cx + ox, y: 1.5, z: cz + oz };
}

/** Return true if `playerPos` is inside the door trigger AABB. */
export function isInsideTrigger(
  playerX: number,
  playerZ: number,
  center: { x: number; z: number },
  half: { x: number; z: number },
): boolean {
  return (
    Math.abs(playerX - center.x) <= half.x &&
    Math.abs(playerZ - center.z) <= half.z
  );
}
