/**
 * EditorSchema.ts — JSON schema types shared across all level editors.
 * These are the serialized data structures written to .ttt-level.json files.
 */

export const EDITOR_SCHEMA_VERSION = 1;

export type EditorType = 'tower_floor' | 'overworld' | 'building' | 'interior' | 'dungeon';

// ── Shared primitives ─────────────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number; }

export interface PlacedObject {
  id:       string;        // unique within this level ("obj_001")
  asset:    string;        // asset path ("/assets/kaykit_dungeon/wall.gltf")
  x:        number;
  y:        number;
  z:        number;
  ry:       number;        // Y rotation in radians
  scale:    number;        // uniform scale
  meta:     ObjectMeta;    // type-specific metadata
}

/** Type-specific metadata for interactable placed objects. */
export type ObjectMeta =
  | Record<string, never>                // empty for decorative objects
  | BookMeta
  | ChestMeta
  | StallMeta;

export interface BookMeta {
  type:           'book';
  contentText:    string;
  spellUnlock?:   string;
  firstReadOnly?: boolean;
}
export interface ChestMeta {
  type:       'chest';
  contents:   Array<{ itemId: string; quantity: number }>;
  requiresKey?: string;
}
export interface StallMeta {
  type:      'stall';
  inventory: Array<{ itemId: string; price: number; stock: number }>;
}

// ── Spawn markers ─────────────────────────────────────────────────────────────

export type SpawnType = 'enemy' | 'npc' | 'player_start';

export interface SpawnMarker {
  id:         string;
  type:       SpawnType;
  x:          number;
  y:          number;
  z:          number;
  /** For enemy spawns */
  enemyId?:   string;
  tier?:      1 | 2 | 3 | 'boss';
  count?:     number;
  pattern?:   'static' | 'patrol' | 'ambush' | 'wave';
  waveCount?: number;
  /** For NPC spawns */
  npcName?:   string;
  npcType?:   string;
  dialogueId?: string;
}

// ── Exit / transition markers ─────────────────────────────────────────────────

export type ExitType = 'stair_up' | 'stair_down' | 'tower_exit' | 'door' | 'dungeon_entrance' | 'dungeon_exit';

export interface ExitMarker {
  id:               string;
  type:             ExitType;
  x:                number;
  y:                number;
  z:                number;
  targetFloorIndex?: number;
  targetSceneId?:   string;   // for dungeon/building links
  facingAngle?:     number;   // player spawn facing direction
}

// ── Level documents ───────────────────────────────────────────────────────────

export interface BaseLevelDoc {
  schema:   typeof EDITOR_SCHEMA_VERSION;
  type:     EditorType;
  id:       string;
  name:     string;
  objects:  PlacedObject[];
  spawns:   SpawnMarker[];
  exits:    ExitMarker[];
}

export interface TowerFloorDoc extends BaseLevelDoc {
  type:         'tower_floor';
  floorIndex:   number;
  gridSize:     number;
  size:         { w: number; d: number };
  properties: {
    lightPreset?:   string;
    ambientQuote?:  string;
    encounterPool?: string;
    keyFixture?:    string;
    bossRoom?:      boolean;
  };
}

export interface OverworldPatchDoc extends BaseLevelDoc {
  type:          'overworld';
  worldSeed:     number;
  settlements:   SettlementEntry[];
  dungeonLinks:  DungeonLink[];
}

export interface SettlementEntry {
  id:          string;
  name:        string;
  x:           number;
  z:           number;
  type:        'village' | 'town' | 'fortified_town';
  buildings:   BuildingPlacement[];
}

export interface BuildingPlacement {
  id:            string;
  buildingDefId: string;
  x:             number;
  z:             number;
  ry:            number;
  interiorId?:   string;
}

export interface DungeonLink {
  id:              string;
  name:            string;
  x:               number;
  z:               number;
  dungeonSceneId:  string;
  entranceSpawn:   Vec3;
  exitSpawn:       Vec3;
}

export interface BuildingDoc extends BaseLevelDoc {
  type:       'building';
  floors:     number;
  footprint:  { w: number; d: number };
  style:      'stone' | 'wood' | 'mixed';
  interiorId?: string;
}

export interface InteriorDoc extends BaseLevelDoc {
  type:       'interior';
  buildingId: string;
  floorIndex: number;
  footprint:  { w: number; d: number };
}

export interface DungeonDoc extends BaseLevelDoc {
  type:   'dungeon';
  rooms:  DungeonRoom[];
}

export interface DungeonRoom {
  id:           string;
  name:         string;
  template?:    string;
  size:         { w: number; d: number };
  objects:      PlacedObject[];
  spawns:       SpawnMarker[];
  exits:        ExitMarker[];
  connections:  string[];  // IDs of connected rooms
}

export type LevelDoc = TowerFloorDoc | OverworldPatchDoc | BuildingDoc | InteriorDoc | DungeonDoc;
