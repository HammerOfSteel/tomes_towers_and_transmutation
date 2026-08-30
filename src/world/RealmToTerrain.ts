/**
 * RealmToTerrain.ts — 02-game-world-integration (RI-1, RI-2)
 *
 * Pure data transform: OW-A `RealmData` (realm map biome/elevation cells) →
 * a flat list of `TerrainTilePlacement`s that the (future) chunked terrain
 * renderer can turn into actual `THREE.Group`s via `buildTile()`
 * (`src/procedural/TileBuilder.ts`).
 *
 * Deliberately only imports *types* from `overworld-studio.ts` (`import
 * type`) — that file wires up DOM elements (`document.getElementById(...)`)
 * at module scope for the standalone Studio page, so importing any of its
 * runtime values/functions here would crash outside that page. Type-only
 * imports are erased at compile time, so this stays safe to import from
 * game runtime code (`OverworldScene.ts`, tests, etc.).
 *
 * Scope note: this covers RI-1 (realm → terrain placement + height
 * smoothing) and RI-2 (biome → TileDNA mapping + transition-tile flagging).
 * RI-3 (river mesh), RI-4 (chunk streaming/`ChunkManager`), and the LOD tiers
 * mentioned in RI-1 are downstream rendering/streaming concerns layered on
 * top of this pure placement list — left for a follow-up slice once an
 * actual terrain renderer consumes this output.
 */

import type { RealmBiome, RealmData } from '@/overworld-studio';
import { makeTileDNA, type TileBiome, type TileDNA } from '@/procedural/TileDNA';

/** World-unit size of one realm cell → one terrain tile (RI-1). */
export const TERRAIN_TILE_SIZE = 4;

/** World-unit height per unit of normalized elevation [0,1] (RI-1). */
export const TERRAIN_HEIGHT_SCALE = 0.5;

export interface BiomeTileMapping {
  biome: TileBiome;
  variant: string;
}

/**
 * RI-2 — canonical realm-biome → tile-biome/variant mapping.
 * Every `RealmBiome` must have an entry (enforced by the `Record` type and
 * covered by a completeness test).
 */
export const BIOME_TILE_MAP: Readonly<Record<RealmBiome, BiomeTileMapping>> = {
  deep_ocean: { biome: 'water',        variant: 'deep' },
  ocean:      { biome: 'water',        variant: 'shallow' },
  beach:      { biome: 'desert',       variant: 'sand' },
  desert:     { biome: 'desert',       variant: 'cracked' },
  savanna:    { biome: 'grassland',    variant: 'patchy' },
  grassland:  { biome: 'grassland',    variant: 'short' },
  forest:     { biome: 'forest_floor', variant: 'leaf_litter' },
  taiga:      { biome: 'forest_floor', variant: 'moss' },
  tundra:     { biome: 'tundra',       variant: 'frozen_ground' },
  snow:       { biome: 'tundra',       variant: 'snow' },
  // Interim approximation (Phase 1 of the biome/terrain overhaul) — closest
  // existing TileBiome/variant to bare mountain rock. A dedicated
  // TileBiome for mountain terrain is Phase 8's job (full biome-taxonomy
  // texture wiring), not this phase's.
  mountain:   { biome: 'cave_rock',    variant: 'dry' },
};

/** Minimal structural shape this module needs from a realm cell — matches `RealmData.cells[y][x]`. */
export interface RealmTerrainCell {
  elevation: number;
  biome: RealmBiome;
}

export interface RealmTerrainInput {
  cells: RealmTerrainCell[][];
  W: number;
  H: number;
  seed: number;
}

export interface TerrainTilePlacement {
  gridX: number;
  gridZ: number;
  worldX: number;
  worldZ: number;
  /** Smoothed elevation × TERRAIN_HEIGHT_SCALE. */
  height: number;
  /** True when at least one orthogonal neighbour maps to a different tile biome (RI-2 border blending hook). */
  isBiomeTransition: boolean;
  dna: TileDNA;
}

/** Deterministic per-cell seed derived from the realm seed + grid position. */
function cellSeed(realmSeed: number, x: number, y: number): number {
  return (realmSeed ^ Math.imul(x + 1, 0x27d4eb2f) ^ Math.imul(y + 1, 0x165667b1)) >>> 0;
}

/** Average elevation over the cell and its up-to-8 in-bounds neighbours (RI-1 height smoothing). */
function smoothedElevation(cells: RealmTerrainCell[][], x: number, y: number, W: number, H: number): number {
  let sum = 0, count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
      sum += cells[ny]![nx]!.elevation;
      count++;
    }
  }
  return count > 0 ? sum / count : cells[y]![x]!.elevation;
}

/** Map a single realm biome to a fully-formed `TileDNA` (RI-2). */
export function realmCellToTileDNA(biome: RealmBiome, seed: number, category: TileDNA['category'] = 'ground'): TileDNA {
  const mapping = BIOME_TILE_MAP[biome];
  return makeTileDNA(mapping.biome, mapping.variant, seed, {
    category,
    size: TERRAIN_TILE_SIZE,
  });
}

/**
 * RI-1 — transform a realm's cell grid into world-placed terrain tiles.
 * Pure and deterministic: the same `(cells, seed)` always produces the same
 * placement list (same tile DNA per cell, same heights).
 */
export function realmToTerrain(
  data: RealmTerrainInput,
  tileSize: number = TERRAIN_TILE_SIZE,
): TerrainTilePlacement[] {
  const { cells, W, H, seed } = data;
  const placements: TerrainTilePlacement[] = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = cells[y]![x]!;
      const ownTileBiome = BIOME_TILE_MAP[cell.biome].biome;

      let isBiomeTransition = false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
        if (BIOME_TILE_MAP[cells[ny]![nx]!.biome].biome !== ownTileBiome) { isBiomeTransition = true; break; }
      }

      const seedForCell = cellSeed(seed, x, y);
      const dna = realmCellToTileDNA(cell.biome, seedForCell, isBiomeTransition ? 'transition' : 'ground');

      placements.push({
        gridX: x,
        gridZ: y,
        worldX: x * tileSize,
        worldZ: y * tileSize,
        height: smoothedElevation(cells, x, y, W, H) * TERRAIN_HEIGHT_SCALE,
        isBiomeTransition,
        dna,
      });
    }
  }

  return placements;
}

/** Convenience overload accepting a full `RealmData` (drops the fields this module doesn't need). */
export function realmDataToTerrain(data: RealmData, tileSize: number = TERRAIN_TILE_SIZE): TerrainTilePlacement[] {
  return realmToTerrain({ cells: data.cells, W: data.W, H: data.H, seed: data.seed }, tileSize);
}
