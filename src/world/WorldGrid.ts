/**
 * WorldGrid — typed per-tile data layer for the overworld.
 *
 * Replaces the raw `Uint8Array _grid` previously inline in OverworldScene.
 * OW-2+ phases extend WorldCell with additional feature/content data rather
 * than adding more parallel arrays.
 */

/**
 * Matches Overworld Studio's `RealmBiome` (`src/overworld-studio.ts`)
 * exactly — a deliberate rename-not-add-alongside decision so every
 * consumer switches on the same literal set the realm generator produces,
 * with no collapsing/mapping table needed (see RealmToWorldGrid.ts).
 */
export type BiomeId =
  | 'deep_ocean' | 'ocean' | 'beach'
  | 'desert' | 'savanna' | 'grassland'
  | 'forest' | 'taiga' | 'tundra' | 'snow'
  | 'mountain';

/**
 * Feature = a geographic/man-made overlay on the tile (roads, rivers).
 * Populated by OW-2 (hydrology) and OW-5 (settlements).
 */
export type TileFeature = 'none' | 'river' | 'river_bank' | 'river_ford' | 'lake' | 'road' | 'road_dirt';

/**
 * Content = an object that occupies the tile.
 * Populated by OW-3 (dungeons), OW-4 (buildings), OW-5 (settlements).
 */
export type TileContent =
  | 'empty'
  | 'tree'
  | 'rock'
  | 'ruin'
  | 'building'
  | 'dungeon_entrance'
  | 'cave_entrance'
  | 'glade_entrance';

export interface WorldCell {
  /** 0–7 integer elevation level (matches existing SH-scaled rendering;
   *  widened from 0-4 in Phase 1 of the biome/terrain overhaul — see
   *  RealmToWorldGrid.ts's ELEVATION_LEVELS). */
  elevation:    number;
  biome:        BiomeId;
  feature:      TileFeature;
  content:      TileContent;
  /** 0 = no dungeon; set by OW-3. */
  dungeonId:    number;
  /** 0 = no building; set by OW-4. */
  buildingId:   number;
  /** 0 = no settlement; set by OW-5. */
  settlementId: number;
  walkable:     boolean;
  /** World units of carved physical depth below `elevation × LEVEL_HEIGHT`
   *  (see `WaterDepthConfig.ts`). 0 = dry land or a ford — the tile's
   *  physical height equals its logical elevation with no carving.
   *  Populated by `HydrologyGenerator` (rivers) and `RealmToWorldGrid`
   *  (ocean-rim water); consumed by `TerrainGeometryBuilder` (carves the
   *  mesh/collider) and `WaterDetection` (swim surface/floor query). */
  waterDepth:   number;
}

function _defaultCell(): WorldCell {
  return {
    elevation:    0,
    biome:        'grassland',
    feature:      'none',
    content:      'empty',
    dungeonId:    0,
    buildingId:   0,
    settlementId: 0,
    walkable:     true,
    waterDepth:   0,
  };
}

export class WorldGrid {
  readonly width:    number;
  readonly height:   number;
  /** Row-major flat array: `cells[row * width + col]`. */
  readonly cells:    WorldCell[];
  /** World-space units per tile (always 2, matching interior cell size). */
  readonly tileUnit: number = 2;

  constructor(width: number, height: number) {
    this.width  = width;
    this.height = height;
    this.cells  = Array.from({ length: width * height }, _defaultCell);
  }

  /** Safe read — returns a default cell for out-of-bounds queries. */
  get(col: number, row: number): WorldCell {
    if (col < 0 || col >= this.width || row < 0 || row >= this.height)
      return _defaultCell();
    return this.cells[row * this.width + col];
  }

  /** Partial-patch a cell in-place; silently ignores out-of-bounds. */
  set(col: number, row: number, patch: Partial<WorldCell>): void {
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return;
    Object.assign(this.cells[row * this.width + col], patch);
  }

  /** World-space XZ centre of tile (col, row). */
  gridToWorld(col: number, row: number): { wx: number; wz: number } {
    const halfW = (this.width  - 1) / 2;
    const halfH = (this.height - 1) / 2;
    return {
      wx: (col - halfW) * this.tileUnit,
      wz: (row - halfH) * this.tileUnit,
    };
  }

  /** Tile col/row from a world-space XZ position. */
  worldToGrid(wx: number, wz: number): { col: number; row: number } {
    const halfW = (this.width  - 1) / 2;
    const halfH = (this.height - 1) / 2;
    return {
      col: Math.floor(wx / this.tileUnit + halfW),
      row: Math.floor(wz / this.tileUnit + halfH),
    };
  }
}
