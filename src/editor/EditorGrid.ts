import type {
  Blueprint,
  TileEntry,
  DoorEntry,
  SpawnEntry,
  InteractableEntry,
  StaircaseEntry,
  DoorFacing,
  StairDirection,
  FloorType,
  Rotation,
} from '@/levels/blueprint';
import { validateBlueprint, serializeBlueprint, parseBlueprint } from '@/levels/blueprint';

// ── Palette ───────────────────────────────────────────────────────────────

export type PaletteKind =
  | 'wall'
  | 'pillar'
  | 'door'
  | 'spawn'
  | 'bookshelf'
  | 'lectern'
  | 'staircase'
  | 'erase';

export interface PlaceOptions {
  facing?: DoorFacing;
  targetId?: string | null;
  direction?: StairDirection;
  content?: string;
  rotation?: Rotation;
}

// ── EditorGrid ────────────────────────────────────────────────────────────

/** Mutable blueprint state for the level editor.
 *  Pure data — no Three.js or Rapier references. Fully unit-testable. */
export class EditorGrid {
  private _id: string;
  private _width: number;
  private _depth: number;
  private _floor: number;
  private _floorType: FloorType = 'stone';

  private readonly _tiles = new Map<string, TileEntry>();
  private readonly _doors = new Map<string, DoorEntry>();
  private readonly _spawns = new Map<string, SpawnEntry>();
  private readonly _interactables = new Map<string, InteractableEntry>();
  private readonly _staircases = new Map<string, StaircaseEntry>();

  constructor(id = 'new_room', width = 7, depth = 7, floor = 0) {
    this._id = id;
    this._width = Math.max(3, width);
    this._depth = Math.max(3, depth);
    this._floor = Math.trunc(floor);
    this._buildBorderWalls();
  }

  // ── Factory ───────────────────────────────────────────────────────────

  /** Populate a new EditorGrid from an existing validated Blueprint. */
  static fromBlueprint(bp: Blueprint): EditorGrid {
    const g = new EditorGrid(bp.id, bp.width, bp.depth, bp.floor);
    g._floorType = bp.floorType ?? 'stone';
    // Replace auto-generated border walls with exactly what the blueprint says.
    g._tiles.clear();
    for (const t of bp.tiles) g._tiles.set(`${t.x},${t.z}`, { ...t });
    for (const d of bp.doors) g._doors.set(`${d.x},${d.z}`, { ...d });
    for (const s of bp.spawns) g._spawns.set(`${s.x},${s.z}`, { ...s });
    for (const i of bp.interactables) g._interactables.set(`${i.x},${i.z}`, { ...i });
    for (const st of bp.staircases) g._staircases.set(`${st.x},${st.z}`, { ...st });
    return g;
  }

  /** Deserialize from JSON, validate, and return as an EditorGrid.
   *  Throws `BlueprintError` if the JSON is malformed or fails validation. */
  static deserialize(json: string): EditorGrid {
    const bp = parseBlueprint(json);
    validateBlueprint(bp);
    return EditorGrid.fromBlueprint(bp);
  }

  // ── Accessors ─────────────────────────────────────────────────────────

  get id(): string { return this._id; }
  get width(): number { return this._width; }
  get depth(): number { return this._depth; }
  get floor(): number { return this._floor; }
  get floorType(): FloorType { return this._floorType; }

  set id(v: string) { this._id = v; }
  set floor(v: number) { this._floor = Math.trunc(v); }
  set floorType(v: FloorType) { this._floorType = v; }

  // ── Placement ─────────────────────────────────────────────────────────

  /** Place an entity at grid cell (x, z). Out-of-bounds calls are ignored.
   *  Any existing entity at that cell is replaced first. */
  place(x: number, z: number, kind: PaletteKind, opts: PlaceOptions = {}): void {
    if (x < 0 || x >= this._width || z < 0 || z >= this._depth) return;
    const key = `${x},${z}`;
    this._clearCell(key);
    if (kind === 'erase') return;

    if (kind === 'wall') {
      this._tiles.set(key, { x, z, type: 'wall', ...(opts.rotation ? { rotation: opts.rotation } : {}) });
    } else if (kind === 'pillar') {
      this._tiles.set(key, { x, z, type: 'pillar', ...(opts.rotation ? { rotation: opts.rotation } : {}) });
    } else if (kind === 'door') {
      this._doors.set(key, {
        x, z,
        facing: opts.facing ?? 'north',
        targetId: opts.targetId ?? null,
      });
    } else if (kind === 'spawn') {
      this._spawns.set(key, { x, z, type: 'slime' });
    } else if (kind === 'bookshelf') {
      this._interactables.set(key, {
        x, z,
        type: 'bookshelf',
        content: opts.content ?? 'Empty page.',
        ...(opts.rotation ? { rotation: opts.rotation } : {}),
      });
    } else if (kind === 'lectern') {
      this._interactables.set(key, {
        x, z,
        type: 'lectern',
        content: opts.content ?? 'Empty page.',
        ...(opts.rotation ? { rotation: opts.rotation } : {}),
      });
    } else if (kind === 'staircase') {
      this._staircases.set(key, {
        x, z,
        facing: opts.facing ?? 'north',
        direction: opts.direction ?? 'up',
        targetId: opts.targetId ?? null,
      });
    }
  }

  /** Remove any entity at grid cell (x, z). */
  erase(x: number, z: number): void {
    this._clearCell(`${x},${z}`);
  }

  // ── Resize ────────────────────────────────────────────────────────────

  /** Resize the grid. Entities that fall outside the new bounds are removed. */
  resize(width: number, depth: number): void {
    this._width = Math.max(3, width);
    this._depth = Math.max(3, depth);
    for (const map of [
      this._tiles, this._doors, this._spawns,
      this._interactables, this._staircases,
    ]) {
      for (const key of [...map.keys()]) {
        const [cx, cz] = key.split(',').map(Number);
        if (cx >= this._width || cz >= this._depth) map.delete(key);
      }
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────

  /** Convert the current state to a validated Blueprint object. */
  toBlueprint(): Blueprint {
    return {
      id: this._id,
      version: 1,
      width: this._width,
      depth: this._depth,
      cellSize: 2,
      wallHeight: 3,
      floor: this._floor,
      floorType: this._floorType,
      tiles: [...this._tiles.values()],
      doors: [...this._doors.values()],
      spawns: [...this._spawns.values()],
      interactables: [...this._interactables.values()],
      staircases: [...this._staircases.values()],
    };
  }

  /** Serialize to pretty-printed JSON ready for download. */
  serialize(): string {
    return serializeBlueprint(this.toBlueprint());
  }

  /** Validate the current state. Returns `null` if valid, else the error message. */
  validate(): string | null {
    try {
      validateBlueprint(this.toBlueprint());
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────

  private _buildBorderWalls(): void {
    for (let x = 0; x < this._width; x++) {
      this._tiles.set(`${x},0`, { x, z: 0, type: 'wall' });
      this._tiles.set(`${x},${this._depth - 1}`, { x, z: this._depth - 1, type: 'wall' });
    }
    for (let z = 1; z < this._depth - 1; z++) {
      this._tiles.set(`0,${z}`, { x: 0, z, type: 'wall' });
      this._tiles.set(`${this._width - 1},${z}`, { x: this._width - 1, z, type: 'wall' });
    }
  }

  private _clearCell(key: string): void {
    this._tiles.delete(key);
    this._doors.delete(key);
    this._spawns.delete(key);
    this._interactables.delete(key);
    this._staircases.delete(key);
  }
}
