/**
 * buildingToDungeonPlan.ts — OW-D v2
 *
 * Converts a BuildingDNA into a DungeonPlan (set of Blueprint rooms).
 * Uses the same Blueprint format as dungeon/tower rooms so the existing
 * drawDungeonFloorPlan() and renderBlueprint() work without modification.
 *
 * One Blueprint per floor:
 *   - All rooms on a floor share a single Blueprint (the full floor grid)
 *   - Wall tiles come from HousePlan.grid (TILE_WALL = 1)
 *   - Door tiles become DoorEntry records
 *   - Adjacent floors wired via StaircaseEntry
 *   - Furniture placed by room purpose → InteractableEntry
 */

import type { Blueprint, TileEntry, DoorEntry, StaircaseEntry, InteractableEntry, FloorType } from '@/levels/blueprint';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import { factionBuildingDna, FLOOR_HEIGHT, type BuildingKind, type Faction, type BuildingSize } from './world/buildings/BuildingDNA';
import { generatePlan, deriveBlueprints, type RoomPurpose } from './world/buildings/InteriorGenerator';

// ── Floor type mapping ────────────────────────────────────────────────────────

const STYLE_FLOOR: Record<string, FloorType> = {
  thatched: 'wood',
  timber:   'wood',
  stone:    'stone',
  arcane:   'stone_arcane' as FloorType,  // fallback to stone_alchemy
  gothic:   'stone',
  vampiric: 'stone',
  nordic:   'wood',
  tudor:    'wood',
  elven:    'stone_herald' as FloorType,  // light stone
  dwarven:  'stone',
  nomadic:  'dirt',
  fae:      'grass',
  orcish:   'dirt',
};

// 'stone_arcane' doesn't exist — map it
function resolveFloorType(style: string, kind: BuildingKind): FloorType {
  const mapped: FloorType = (STYLE_FLOOR[style] as FloorType) ?? 'stone';
  // Override by building kind
  switch (kind) {
    case 'blacksmith': return 'stone_scorched';
    case 'chapel':     return 'stone_herald';
    case 'inn':
    case 'tavern':     return 'wood';
    case 'apothecary': return 'stone_alchemy';
    default:           return mapped === ('stone_arcane' as FloorType) ? 'stone_alchemy' : mapped;
  }
}

// ── Furniture per room purpose ────────────────────────────────────────────────

const PURPOSE_FURNITURE: Partial<Record<RoomPurpose, InteractableEntry['type'][]>> = {
  living:      ['bookshelf', 'candelabra'],
  kitchen:     ['cauldron', 'barrel'],
  bedroom:     ['bed', 'chest'],
  hall:        ['candelabra'],
  bar:         ['barrel', 'barrel'],
  storage:     ['crate', 'chest', 'barrel'],
  workshop:    ['anvil', 'candelabra'],
  chapel_nave: ['candelabra', 'containment_ring'],
};

// ── Tile constants (mirror InteriorGenerator) ─────────────────────────────────

const TILE_WALL = 1;
const TILE_DOOR = 2;

// ── Main converter ────────────────────────────────────────────────────────────

/**
 * Convert BuildingDNA to a DungeonPlan where each floor is a single Blueprint.
 * The plan can be rendered by drawDungeonFloorPlan() or renderBlueprint()
 * without any modification to those renderers.
 */
export function buildingToDungeonPlan(
  kind:    BuildingKind,
  faction: Faction,
  seed:    number,
  size:    BuildingSize = 'medium',
  floors:  1|2|3|4 = 2,
): DungeonPlan {
  const dna     = factionBuildingDna(kind, faction, seed, size, floors);
  const rooms   = new Map<string, Blueprint>();
  const floorIds: string[] = [];

  for (let fi = 0; fi < floors; fi++) {
    const floorSeed = seed ^ (fi * 0x6B8B4567);
    const plan      = generatePlan({ ...dna, seed: floorSeed });
    const bps       = deriveBlueprints(plan);
    const id        = `${kind}_f${fi}`;
    floorIds.push(id);

    // ── Tiles: every TILE_WALL cell ──────────────────────────────────────────
    const tiles: TileEntry[] = [];
    for (let z = 0; z < plan.d; z++) {
      for (let x = 0; x < plan.w; x++) {
        if (plan.grid[x + plan.w * z] === TILE_WALL) {
          tiles.push({ x, z, type: 'wall' });
        }
      }
    }

    // ── Doors: TILE_DOOR cells, facing determined by boundary position ───────
    const doors: DoorEntry[] = [];
    for (let z = 0; z < plan.d; z++) {
      for (let x = 0; x < plan.w; x++) {
        if (plan.grid[x + plan.w * z] !== TILE_DOOR) continue;
        let facing: DoorEntry['facing'] = 'south';
        if      (z === 0)          facing = 'north';
        else if (z === plan.d - 1) facing = 'south';
        else if (x === 0)          facing = 'west';
        else if (x === plan.w - 1) facing = 'east';
        doors.push({ x, z, facing, targetId: null });
      }
    }

    // ── Staircases: connect adjacent floors ─────────────────────────────────
    const staircases: StaircaseEntry[] = [];
    const stairX = plan.w - 2;
    const stairZ = 2;
    if (fi > 0) {
      staircases.push({ x: stairX, z: stairZ, facing: 'north', direction: 'down', targetId: floorIds[fi - 1]! });
    }
    if (fi < floors - 1) {
      staircases.push({ x: stairX, z: stairZ + 2, facing: 'north', direction: 'up', targetId: `${kind}_f${fi + 1}` });
    }

    // ── Interactables: scatter per room purpose ──────────────────────────────
    const interactables: InteractableEntry[] = [];
    for (const room of bps) {
      const items = PURPOSE_FURNITURE[room.purpose] ?? [];
      let placed = 0;
      const cx = room.centerX, cz = room.centerZ;
      for (const type of items) {
        if (placed >= 2) break;
        // Place at offset positions from room centre
        const ox = placed === 0 ? -1 : 1;
        const tx = Math.max(room.x + 1, Math.min(room.x + room.w - 2, cx + ox));
        const tz = Math.max(room.z + 1, Math.min(room.z + room.d - 2, cz));
        interactables.push({ x: tx, z: tz, type });
        placed++;
      }
    }

    const bp: Blueprint = {
      id,
      version: 1 as const,
      width:      plan.w,
      depth:      plan.d,
      cellSize:   1.0,
      wallHeight: FLOOR_HEIGHT,
      tiles, doors, staircases, interactables,
      spawns: [],
      floor:  fi,
      floorType: resolveFloorType(dna.style, kind),
    };

    rooms.set(id, bp);
  }

  return { rooms, startRoomId: floorIds[0]!, seed };
}

// ── Ward → BuildingKind mapping ───────────────────────────────────────────────

export const WARD_TO_KIND: Partial<Record<string, BuildingKind>> = {
  market:     'shop',
  church:     'chapel',
  inn:        'inn',
  smithy:     'blacksmith',
  craftsmen:  'shop',
  merchant:   'shop',
  patriciate: 'villa',
  slum:       'house',
  gateward:   'house',
  farm:       'house',   // barn not in BuildingKind yet; use house
  park:       null as unknown as BuildingKind,  // no interior
};
