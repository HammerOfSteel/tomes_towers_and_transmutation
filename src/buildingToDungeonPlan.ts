/**
 * buildingToDungeonPlan.ts — OW-D v3 (dungeon-style per-room Blueprints)
 *
 * Each room from InteriorGenerator becomes its OWN Blueprint (width×depth),
 * with perimeter walls and doors that open onto adjacent rooms — exactly the
 * pattern the tower and dungeon use.  The BFS layout in drawDungeonFloorPlan()
 * then places each room next to its neighbour with a corridor gap, giving the
 * natural "navigate room-by-room" feel.
 *
 * Architecture:
 *   generatePlan(dna) → HousePlan (grid + RoomDef[])
 *     For each RoomDef → Blueprint(w+2, d+2)  (perimeter wall border)
 *     Scan grid for TILE_FLOOR cells in shared-wall zones → door entries
 *     Wire floor-N stair-room → floor-N+1 entrance-room
 */

import type { Blueprint, TileEntry, DoorEntry, InteractableEntry, FloorType } from '@/levels/blueprint';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import {
  factionBuildingDna,
  FLOOR_HEIGHT,
  type BuildingKind,
  type Faction,
  type BuildingSize,
} from './world/buildings/BuildingDNA';
import { generatePlan, type RoomPurpose, type RoomDef } from './world/buildings/InteriorGenerator';
import { mulberry32 } from '@/core/prng';

// ── Floor type mapping ────────────────────────────────────────────────────────

const STYLE_FLOOR: Record<string, FloorType> = {
  thatched: 'wood',  timber:  'wood',  stone:    'stone',
  arcane:   'stone_alchemy', gothic: 'stone', vampiric: 'stone',
  nordic:   'wood',  tudor:   'wood',  elven:    'stone_herald',
  dwarven:  'stone', nomadic: 'dirt',  fae:      'grass',  orcish: 'dirt',
};

function resolveFloorType(style: string, kind: BuildingKind): FloorType {
  const base: FloorType = (STYLE_FLOOR[style] as FloorType) ?? 'stone';
  switch (kind) {
    case 'blacksmith': return 'stone_scorched';
    case 'chapel':     return 'stone_herald';
    case 'inn': case 'tavern': return 'wood';
    case 'apothecary': return 'stone_alchemy';
    default: return base;
  }
}

// ── Furniture per room purpose ────────────────────────────────────────────────

const PURPOSE_FURNITURE: Partial<Record<RoomPurpose, InteractableEntry['type'][]>> = {
  living:      ['bookshelf', 'candelabra', 'reading_table'],
  kitchen:     ['cauldron', 'barrel', 'barrel'],
  bedroom:     ['bed', 'chest', 'candelabra'],
  hall:        ['candelabra', 'candelabra'],
  bar:         ['barrel', 'barrel', 'mess_table'],
  storage:     ['crate', 'chest', 'barrel'],
  workshop:    ['anvil', 'weapon_stand', 'candelabra'],
  chapel_nave: ['candelabra', 'containment_ring', 'candelabra'],
};

// ── Tile constants ────────────────────────────────────────────────────────────

const TILE_FLOOR = 0;
const TILE_DOOR  = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build perimeter wall tiles for a Blueprint of size bw×bd. */
function buildPerimeterWalls(bw: number, bd: number): TileEntry[] {
  const tiles: TileEntry[] = [];
  for (let x = 0; x < bw; x++) {
    tiles.push({ x, z: 0,    type: 'wall' });
    tiles.push({ x, z: bd-1, type: 'wall' });
  }
  for (let z = 1; z < bd-1; z++) {
    tiles.push({ x: 0,    z, type: 'wall' });
    tiles.push({ x: bw-1, z, type: 'wall' });
  }
  return tiles;
}

/** Remove the wall tile at local (lx, lz) from a Blueprint (opens a doorway). */
function openWall(bp: Blueprint, lx: number, lz: number): void {
  const idx = bp.tiles.findIndex(t => t.x === lx && t.z === lz);
  if (idx !== -1) bp.tiles.splice(idx, 1);
}

/**
 * Place furniture pseudo-randomly inside a room Blueprint.
 * Uses seeded rand so the layout is deterministic.
 */
function placeFurniture(
  purpose: RoomPurpose,
  bw: number, bd: number,
  seed: number,
): InteractableEntry[] {
  const items  = PURPOSE_FURNITURE[purpose] ?? [];
  const rand   = mulberry32(seed);
  const result: InteractableEntry[] = [];
  const used   = new Set<string>();

  for (const type of items) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 1 + Math.floor(rand() * (bw - 2));
      const z = 1 + Math.floor(rand() * (bd - 2));
      const key = `${x},${z}`;
      if (used.has(key)) continue;
      used.add(key);
      result.push({ x, z, type });
      break;
    }
  }
  return result;
}

/**
 * Check if rooms A and B share a wall with a TILE_FLOOR passage between them.
 * If so, open a doorway on each Blueprint and wire them together.
 */
function tryConnect(
  rA: RoomDef, rB: RoomDef,
  bpA: Blueprint, bpB: Blueprint,
  grid: Uint8Array, gridW: number,
): boolean {
  // N-S: A above B
  if (rA.z + rA.d + 1 === rB.z) {
    const wallZ = rA.z + rA.d;
    const xMin  = Math.max(rA.x, rB.x);
    const xMax  = Math.min(rA.x + rA.w - 1, rB.x + rB.w - 1);
    for (let gx = xMin; gx <= xMax; gx++) {
      if (grid[gx + gridW * wallZ] !== TILE_FLOOR) continue;
      const lxA = gx - rA.x + 1;
      const lxB = gx - rB.x + 1;
      openWall(bpA, lxA, bpA.depth - 1);
      bpA.doors.push({ x: lxA, z: bpA.depth - 1, facing: 'south', targetId: bpB.id });
      openWall(bpB, lxB, 0);
      bpB.doors.push({ x: lxB, z: 0, facing: 'north', targetId: bpA.id });
      return true;
    }
    return false;
  }
  // S-N: B above A
  if (rB.z + rB.d + 1 === rA.z) {
    return tryConnect(rB, rA, bpB, bpA, grid, gridW);
  }
  // E-W: A left of B
  if (rA.x + rA.w + 1 === rB.x) {
    const wallX = rA.x + rA.w;
    const zMin  = Math.max(rA.z, rB.z);
    const zMax  = Math.min(rA.z + rA.d - 1, rB.z + rB.d - 1);
    for (let gz = zMin; gz <= zMax; gz++) {
      if (grid[wallX + gridW * gz] !== TILE_FLOOR) continue;
      const lzA = gz - rA.z + 1;
      const lzB = gz - rB.z + 1;
      openWall(bpA, bpA.width - 1, lzA);
      bpA.doors.push({ x: bpA.width - 1, z: lzA, facing: 'east', targetId: bpB.id });
      openWall(bpB, 0, lzB);
      bpB.doors.push({ x: 0, z: lzB, facing: 'west', targetId: bpA.id });
      return true;
    }
    return false;
  }
  // W-E: B left of A
  if (rB.x + rB.w + 1 === rA.x) {
    return tryConnect(rB, rA, bpB, bpA, grid, gridW);
  }
  return false;
}

// ── Main converter ────────────────────────────────────────────────────────────

/**
 * Convert BuildingDNA into a DungeonPlan with one Blueprint per room.
 * Adjacent rooms are wired via door entries (dungeon-style).
 * Floors are connected via staircase doors on the back room.
 */
export function buildingToDungeonPlan(
  kind:    BuildingKind,
  faction: Faction,
  seed:    number,
  size:    BuildingSize = 'medium',
  floors:  1|2|3|4 = 2,
): DungeonPlan {
  const rooms = new Map<string, Blueprint>();
  let startRoomId = '';

  // Per-floor room ID arrays needed to wire the floor transitions
  const floorRoomIds: string[][] = [];

  for (let fi = 0; fi < floors; fi++) {
    const floorSeed = seed ^ (fi * 0x6B8B4567);
    const dna       = factionBuildingDna(kind, faction, floorSeed, size, 1);
    const plan      = generatePlan(dna);
    const flrType   = resolveFloorType(dna.style, kind);

    if (plan.rooms.length === 0) continue;

    const ids: string[] = [];

    // ── Step 1: One Blueprint per room ───────────────────────────────────
    for (let ri = 0; ri < plan.rooms.length; ri++) {
      const room = plan.rooms[ri]!;
      const id   = `${kind}_f${fi}_r${ri}`;
      ids.push(id);

      const bw = room.w + 2;   // Blueprint width  (room + 1 wall each side)
      const bd = room.d + 2;   // Blueprint depth

      rooms.set(id, {
        id,
        version:      1 as const,
        width:        bw,
        depth:        bd,
        cellSize:     1.0,
        wallHeight:   FLOOR_HEIGHT,
        tiles:        buildPerimeterWalls(bw, bd),
        doors:        [],
        staircases:   [],
        spawns:       [],
        interactables: placeFurniture(room.purpose, bw, bd, floorSeed ^ (ri * 0x9E3779B9)),
        floor:        fi,
        floorType:    flrType,
      });
    }

    floorRoomIds.push(ids);
    if (fi === 0) startRoomId = ids[0]!;

    // ── Step 2: Wire adjacent rooms via passage cells in the grid ─────────
    for (let a = 0; a < plan.rooms.length; a++) {
      for (let b = a + 1; b < plan.rooms.length; b++) {
        tryConnect(
          plan.rooms[a]!, plan.rooms[b]!,
          rooms.get(ids[a]!)!, rooms.get(ids[b]!)!,
          plan.grid, plan.w,
        );
      }
    }

    // ── Step 3: Exterior door on the entrance room (room 0, floor 0) ─────
    if (fi === 0) {
      const entBp   = rooms.get(ids[0]!)!;
      const entRoom = plan.rooms[0]!;

      // Try to align with the actual TILE_DOOR cell from generatePlan
      let extDoorX = Math.floor(entBp.width / 2);
      outer: for (let gz = 0; gz < plan.d; gz++) {
        for (let gx = 0; gx < plan.w; gx++) {
          if (plan.grid[gx + plan.w * gz] === TILE_DOOR &&
              gx >= entRoom.x && gx < entRoom.x + entRoom.w) {
            extDoorX = gx - entRoom.x + 1;
            break outer;
          }
        }
      }
      openWall(entBp, extDoorX, entBp.depth - 1);
      entBp.doors.push({ x: extDoorX, z: entBp.depth - 1, facing: 'south', targetId: null });
    }
  }

  // ── Step 4: Wire floors together ─────────────────────────────────────────
  for (let fi = 0; fi < floors - 1; fi++) {
    const thisIds = floorRoomIds[fi]!;
    const nextIds = floorRoomIds[fi + 1]!;
    if (!thisIds.length || !nextIds.length) continue;

    // Back room of this floor → first room of next floor (staircase)
    const stairBp = rooms.get(thisIds[thisIds.length - 1]!)!;
    const landBp  = rooms.get(nextIds[0]!)!;

    const sDoorX = Math.floor(stairBp.width / 2);
    openWall(stairBp, sDoorX, 0);
    stairBp.doors.push({ x: sDoorX, z: 0, facing: 'north', targetId: landBp.id });

    const lDoorX = Math.floor(landBp.width / 2);
    openWall(landBp, lDoorX, landBp.depth - 1);
    landBp.doors.push({ x: lDoorX, z: landBp.depth - 1, facing: 'south', targetId: stairBp.id });
  }

  return { rooms, startRoomId, seed };
}

// ── Ward → BuildingKind mapping ───────────────────────────────────────────────

export const WARD_TO_KIND: Partial<Record<string, BuildingKind>> = {
  market:     'shop',
  church:     'chapel',
  inn:        'inn',
  smithy:     'blacksmith',
  craftsmen:  'shop',
  merchant:   'villa',
  patriciate: 'villa',
  slum:       'terraced',
  gateward:   'house',
  farm:       'house',
  park:       null as unknown as BuildingKind,
};

export const WARD_TO_SIZE: Partial<Record<string, BuildingSize>> = {
  market:     'small',
  church:     'medium',
  inn:        'large',
  smithy:     'medium',
  craftsmen:  'small',
  merchant:   'medium',
  patriciate: 'large',
  slum:       'tiny',
  gateward:   'small',
  farm:       'small',
};

export const WARD_TO_FLOORS: Partial<Record<string, 1|2|3|4>> = {
  inn:        2,
  patriciate: 3,
  merchant:   2,
  church:     1,
  smithy:     1,
  farm:       1,
  slum:       2,
};

