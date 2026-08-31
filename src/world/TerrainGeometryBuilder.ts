/**
 * TerrainGeometryBuilder.ts — pure geometry builder for the overworld's
 * blocky-step terrain mesh.
 *
 * Extracted so the exact same vertex/index buffers back both the visual
 * mesh (OverworldScene._buildTerrain) and the physics collider
 * (OverworldScene._createTerrainCollider) — guaranteeing they can never
 * mismatch, which was the root cause of players clipping through terrain
 * at elevation edges/slopes (the old collider used a Rapier heightfield
 * that smoothly interpolated between samples instead of stepping).
 */
import type { WorldGrid, BiomeId, WorldCell } from './WorldGrid';
import { physicalHeightWU } from './WaterDepthConfig';
import { computeTileRoadCoverage, BRIDGE_ROAD_VARIANT, type RoadPathSegment } from './RoadPathSampler';
import { classifyTileShape, orderCornersForDiagonal, triangleNormal, buildQuadFace } from './TerrainKit';
import { GROUND_TERRAIN_VARIANTS } from './TerrainTextures';

/** World units per texture tile for road sub-tile UV — smaller than
 *  BlockKit's UV_TILE_WU since roads are a narrower feature that reads
 *  better with finer texture tiling. */
const ROAD_UV_TILE_WU = 1.0;

/** World-space UV tiling period (WU) for ground textures — close to one
 *  tile's own footprint (T=2 WU) so the texture shows real per-tile detail
 *  without an obviously-repeating wallpaper look at typical camera
 *  distance. See docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.1. */
const GROUND_UV_TILE_WU = 2.5;

/** Sub-tile grid resolution for ground tiles — same N=4 convention roads
 *  already established (RoadPathSampler.ts's roadSubdivisions default),
 *  for consistency rather than a new magic number. */
const GROUND_SUBDIVISIONS = 4;

/** Probability (per independent roll) that an outermost-row/column
 *  sub-tile pulls toward a differing neighbor's variant instead of its
 *  own — see design spec §3.3. */
const BORDER_PULL_PROBABILITY = 0.40;

/** Probability that a sub-tile swaps to a micro-patch variant, for
 *  biomes that have one mapped. */
const MICRO_PATCH_PROBABILITY = 0.06;

/** Which "micro-patch" texture variant occasionally interrupts a biome's
 *  own ground texture — reuses the 10 variants already shipped in Phase
 *  4a, no new content. Biomes not listed have no micro-patch (already
 *  read as fairly uniform — mountain/snow/desert/beach/river_bank). See
 *  docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md §3.3. */
const MICRO_PATCH_VARIANTS: Partial<Record<BiomeId, readonly string[]>> = {
  grassland: ['river_bank'],
  forest:    ['mountain'],
  savanna:   ['desert'],
  taiga:     ['mountain'],
  tundra:    ['snow'],
};

/** Deterministic pseudo-random unit value [0, 1) for a world position,
 *  offset by `salt` so multiple independent rolls at the same position
 *  (one per border direction, one for micro-patch selection) don't
 *  correlate with each other. */
function _subTileRoll(worldX: number, worldZ: number, salt: number): number {
  const xi = Math.floor(worldX * 1000) | 0;
  const zi = Math.floor(worldZ * 1000) | 0;
  let h = (xi * 374761393 + zi * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Resolves which texture variant one ground sub-tile should render with
 *  — border dithering (pull toward a differing orthogonal neighbor's
 *  variant, only for the outermost sub-tile row/column touching that
 *  edge) checked in a fixed S/N/E/W priority order, then an occasional
 *  low-probability micro-patch swap, else the tile's own variant. Pure
 *  function — the caller resolves neighbor cells/variants and passes
 *  them in. Exported (like cornerHeightJitter/cellVariantIndex) for
 *  direct unit testing. */
export function _subTileGroundVariant(
  ownVariant: string,
  neighborVariant: { south: string | null; north: string | null; east: string | null; west: string | null },
  sx: number, sz: number, subdivisions: number,
  ownBiome: BiomeId,
  subWorldX: number, subWorldZ: number,
): string {
  const isOutermostSouth = sz === subdivisions - 1;
  const isOutermostNorth = sz === 0;
  const isOutermostEast  = sx === subdivisions - 1;
  const isOutermostWest  = sx === 0;

  if (isOutermostSouth && neighborVariant.south !== null && neighborVariant.south !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 1) < BORDER_PULL_PROBABILITY) return neighborVariant.south;
  }
  if (isOutermostNorth && neighborVariant.north !== null && neighborVariant.north !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 2) < BORDER_PULL_PROBABILITY) return neighborVariant.north;
  }
  if (isOutermostEast && neighborVariant.east !== null && neighborVariant.east !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 3) < BORDER_PULL_PROBABILITY) return neighborVariant.east;
  }
  if (isOutermostWest && neighborVariant.west !== null && neighborVariant.west !== ownVariant) {
    if (_subTileRoll(subWorldX, subWorldZ, 4) < BORDER_PULL_PROBABILITY) return neighborVariant.west;
  }

  const microPatches = MICRO_PATCH_VARIANTS[ownBiome];
  if (microPatches && microPatches.length > 0) {
    if (_subTileRoll(subWorldX, subWorldZ, 5) < MICRO_PATCH_PROBABILITY) {
      const idx = Math.min(
        Math.floor(_subTileRoll(subWorldX, subWorldZ, 6) * microPatches.length),
        microPatches.length - 1,
      );
      return microPatches[idx]!;
    }
  }

  return ownVariant;
}


/** Biome vertex colours [r, g, b] for height levels 0–7 — kept for backward-compat callers
 * that only need the "primary" look; internally buildTerrainGeometryData now picks from
 * BIOME_VARIANTS for patchiness, this array is variant index 0 of each level. Levels 5-7
 * (added in Phase 1 of the biome/terrain overhaul, widening from the original 5 levels to 8)
 * continue the "higher = rockier/barer" progression above level 4's rocky upland. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
  [0.42, 0.39, 0.34],   // 5  high slope
  [0.48, 0.46, 0.42],   // 6  alpine ridge
  [0.58, 0.56, 0.53],   // 7  peak / summit
];

/**
 * 3 color-look variants per elevation level, giving each level visible patchiness
 * instead of one flat repeated color. Variant 0 always equals the corresponding
 * BIOME[] entry for backward compatibility. Names loosely mirror TileDNA.ts's
 * TILE_VARIANTS vocabulary (e.g. grassland: short/lush/patchy) for cross-system
 * naming consistency, without importing TileDNA.ts (terrain rendering intentionally
 * stays decoupled from the Studio-only Tile Designer system — see design doc).
 */
export const BIOME_VARIANTS: readonly (readonly [number, number, number])[][] = [
  // 0  bog / muddy path — variants: base, drier, wetter
  [[0.20, 0.26, 0.11], [0.24, 0.28, 0.14], [0.17, 0.23, 0.10]],
  // 1  grass — variants: base(short), lush, patchy
  [[0.26, 0.44, 0.16], [0.22, 0.40, 0.15], [0.30, 0.46, 0.20]],
  // 2  forest floor — variants: base(leaf litter), moss, roots
  [[0.20, 0.36, 0.13], [0.18, 0.34, 0.20], [0.24, 0.32, 0.16]],
  // 3  highland — variants: base, mossy, pebbly
  [[0.35, 0.41, 0.26], [0.32, 0.40, 0.24], [0.39, 0.38, 0.30]],
  // 4  rocky upland — variants: base, dry, pebbly
  [[0.44, 0.41, 0.30], [0.46, 0.40, 0.28], [0.41, 0.39, 0.34]],
  // 5  high slope — variants: base, dry, pebbly
  [[0.42, 0.39, 0.34], [0.45, 0.42, 0.37], [0.38, 0.36, 0.31]],
  // 6  alpine ridge — variants: base, dry, pebbly
  [[0.48, 0.46, 0.42], [0.51, 0.49, 0.45], [0.44, 0.42, 0.38]],
  // 7  peak / summit — variants: base, dry, pebbly
  [[0.58, 0.56, 0.53], [0.61, 0.59, 0.56], [0.54, 0.52, 0.49]],
];

export const BIOME_RIVER: [number, number, number] = [0.18, 0.38, 0.62]; // blue channel
export const BIOME_WATER: [number, number, number] = [0.14, 0.26, 0.48]; // deep water
/** Lake tint — a calmer, slightly greener blue than BIOME_RIVER, reading
 *  as still water rather than flowing water. */
export const BIOME_LAKE: [number, number, number] = [0.20, 0.40, 0.44];
/** Shallow, walkable ford crossing — a pale wet-stone/sand tint distinct
 *  from both deep river blue and dry land, per RI-3's fords-are-visually-
 *  distinct requirement. */
export const BIOME_FORD:  [number, number, number] = [0.52, 0.48, 0.38];

/** Sand/beach biome tint — pale warm tan, distinct from grass/rock. */
export const BIOME_SAND: readonly [number, number, number] = [0.76, 0.68, 0.50];
/** Per-cell colour-look variants for sand, following the same 3-variant
 *  pattern as BIOME_VARIANTS (base, lighter/drier, darker/wetter near the
 *  waterline). */
export const BIOME_SAND_VARIANTS: readonly (readonly [number, number, number])[] =
  [[0.76, 0.68, 0.50], [0.80, 0.73, 0.56], [0.70, 0.62, 0.44]];

/** Water tiles carved shallower than this (world units) render with the
 *  lighter shallow-water tint; deeper tiles render with the existing
 *  darker BIOME_WATER tint. Sits at the midpoint between
 *  OCEAN_SHALLOW_DEPTH_WU and OCEAN_DEEP_DEPTH_WU (1.0 and 2.5) so the
 *  threshold tracks those constants' intent without importing them
 *  directly — this module stays a pure function of `cell.waterDepth`,
 *  matching physicalHeightWU()'s existing depth-value-agnostic design. */
export const SHALLOW_WATER_TINT_THRESHOLD_WU = 1.75;
/** Lighter, more turquoise tint for shallow (wading-depth) water. */
export const BIOME_WATER_SHALLOW: readonly [number, number, number] = [0.24, 0.46, 0.58];

/** Per-biome colour-look variants for the 7 non-water/beach biomes (ocean
 *  tiers and beach keep using BIOME_WATER / BIOME_SAND_VARIANTS above,
 *  which are already biome-correct). 2-3 variants each, following the
 *  same "base / lighter / darker" patchiness pattern as BIOME_VARIANTS.
 *  deep_ocean/ocean/beach are included with empty-equivalent aliases
 *  (pointing at the existing tables) purely so this is a total Record
 *  over BiomeId — buildTerrainGeometryData's water/beach branches never
 *  actually read these three entries. */
export const BIOME_COLOR_VARIANTS: Record<BiomeId, readonly (readonly [number, number, number])[]> = {
  deep_ocean: [BIOME_WATER],
  ocean:      [BIOME_WATER_SHALLOW],
  beach:      BIOME_SAND_VARIANTS,
  desert:     [[0.78, 0.66, 0.42], [0.82, 0.70, 0.46], [0.72, 0.60, 0.36]],
  savanna:    [[0.62, 0.56, 0.28], [0.66, 0.60, 0.32], [0.56, 0.50, 0.24]],
  grassland:  [[0.26, 0.44, 0.16], [0.22, 0.40, 0.15], [0.30, 0.46, 0.20]],
  forest:     [[0.16, 0.32, 0.14], [0.14, 0.30, 0.20], [0.19, 0.28, 0.15]],
  taiga:      [[0.15, 0.28, 0.20], [0.13, 0.26, 0.24], [0.18, 0.30, 0.22]],
  tundra:     [[0.42, 0.44, 0.36], [0.46, 0.46, 0.40], [0.38, 0.40, 0.34]],
  snow:       [[0.88, 0.90, 0.92], [0.92, 0.93, 0.95], [0.82, 0.85, 0.88]],
  // Bare rocky mountain slopes (Phase 1 of the biome/terrain overhaul) —
  // warm grey-brown rock, deliberately distinct from tundra's cooler
  // blue-grey and desert's tan so a mountain reads as its own biome rather
  // than a recolored tundra/desert.
  mountain:   [[0.40, 0.37, 0.33], [0.44, 0.40, 0.36], [0.34, 0.32, 0.29]],
};

/**
 * Deterministic per-cell hash → integer variant index in [0, variantCount).
 * Same (col, row, variantCount) always yields the same result. Uses a cheap
 * integer mix (not mulberry32/PRNG-stream — no state, single call per cell,
 * so a direct hash is simpler and equally deterministic).
 */
export function cellVariantIndex(col: number, row: number, variantCount: number): number {
  let h = (col * 374761393 + row * 668265263) | 0; // large odd primes, standard integer hash mix
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  const unsigned = h >>> 0;
  return unsigned % variantCount;
}

/** Max Y-offset (world units) applied to a single grid corner by cornerHeightJitter. */
export const CORNER_JITTER_MAX = 0.03;

/**
 * Deterministic per-GRID-CORNER (not per-cell) small Y jitter, in world units,
 * within [-CORNER_JITTER_MAX, +CORNER_JITTER_MAX]. Keying by corner lattice
 * coordinates (rather than cell coordinates) guarantees that every tile
 * sharing a given corner computes the identical jitter value for it — so
 * adjacent tiles' top faces never separate at their shared edge/corner.
 */
export function cornerHeightJitter(cornerCol: number, cornerRow: number): number {
  let h = (cornerCol * 1274126177 + cornerRow * 2654435761) | 0;
  h = (h ^ (h >>> 15)) * 2246822519 | 0;
  h = h ^ (h >>> 13);
  const unit = (h >>> 0) / 4294967296; // → [0, 1)
  return (unit * 2 - 1) * CORNER_JITTER_MAX; // → [-max, +max]
}

/** Max Y-offset (world units) applied to a sub-tile lattice point by subTileBumpJitter. */
export const SUBTILE_BUMP_MAX = 0.06;

/**
 * Deterministic per-SUB-TILE-LATTICE-POINT small Y bump, in world units,
 * within [-SUBTILE_BUMP_MAX, +SUBTILE_BUMP_MAX]. Keyed by absolute world
 * position (not grid-corner integers, since sub-tile lattice points fall at
 * fractional tile coordinates) — scaled and truncated to integers first
 * (same convention as NatureAssetDNA.ts's hashIndex()) so the bit-mixing
 * hash operates on well-defined 32-bit inputs. Because this is a pure
 * function of world position, any two sub-tile quads referencing the same
 * lattice point — adjacent sub-tiles within one tile, or adjacent tiles
 * sharing a real corner — always compute the identical value there, so
 * bumped sub-tile geometry never separates at a shared edge.
 */
export function subTileBumpJitter(worldX: number, worldZ: number): number {
  const xi = Math.floor(worldX * 1000) | 0;
  const zi = Math.floor(worldZ * 1000) | 0;
  let h = (xi * 1274126177 + zi * 2654435761) | 0;
  h = (h ^ (h >>> 15)) * 2246822519 | 0;
  h = h ^ (h >>> 13);
  const unit = (h >>> 0) / 4294967296; // → [0, 1)
  return (unit * 2 - 1) * SUBTILE_BUMP_MAX; // → [-max, +max]
}

/** True for any tile that should never participate in ramp geometry —
 *  neither as the tile being classified nor as a neighbor contributing to
 *  a corner — so shorelines/riverbanks keep today's exact flat-carved +
 *  vertical-wall look (ramps are a dry-land-only feature, see
 *  docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md §2). */
function _isWaterTile(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return cell.biome === 'deep_ocean' || cell.biome === 'ocean' || cell.waterDepth > 0;
}

/** Whether ramp classification should even be attempted for this tile. */
function _isRampEligible(cell: Pick<WorldCell, 'biome' | 'waterDepth'>): boolean {
  return !_isWaterTile(cell);
}

/**
 * Raw (unclamped) elevation for the grid corner at lattice point
 * (cornerCol, cornerRow) — the minimum elevation among the up-to-4 tiles
 * sharing that corner, matching cornerHeightJitter()'s existing lattice
 * convention (corner (c,r) is tile (c,r)'s SW corner, tile (c-1,r)'s SE
 * corner, tile (c,r-1)'s NW corner, tile (c-1,r-1)'s NE corner).
 * Out-of-bounds and water-tile contributors are excluded (substituted
 * with `selfElevation`) so map edges and shorelines never spuriously pull
 * a corner down.
 */
function _rawCornerElevation(
  wg: WorldGrid, cornerCol: number, cornerRow: number, selfElevation: number,
): number {
  let m = selfElevation;
  for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
    const c = cornerCol + dc, r = cornerRow + dr;
    if (c < 0 || c >= wg.width || r < 0 || r >= wg.height) continue;
    const cell = wg.get(c, r);
    if (_isWaterTile(cell)) continue;
    m = Math.min(m, cell.elevation);
  }
  return m;
}

/**
 * A tile's 4 corner elevation levels — `[sw, nw, ne, se]` — each clamped
 * to at most 1 level below the tile's own elevation (see design spec §3).
 */
function _tileCornerLevels(wg: WorldGrid, col: number, row: number): [number, number, number, number] {
  const selfElevation = wg.get(col, row).elevation;
  const clamp = (raw: number) => Math.max(selfElevation - 1, Math.min(selfElevation, raw));
  return [
    clamp(_rawCornerElevation(wg, col,     row,     selfElevation)), // SW
    clamp(_rawCornerElevation(wg, col,     row + 1, selfElevation)), // NW
    clamp(_rawCornerElevation(wg, col + 1, row + 1, selfElevation)), // NE
    clamp(_rawCornerElevation(wg, col + 1, row,     selfElevation)), // SE
  ];
}

/** Which of a tile's 4 corners are one level below its own elevation. */
function _lowCorners(
  levels: readonly [number, number, number, number], selfElevation: number,
): [boolean, boolean, boolean, boolean] {
  return [
    levels[0] < selfElevation,
    levels[1] < selfElevation,
    levels[2] < selfElevation,
    levels[3] < selfElevation,
  ];
}

export interface RoadVariantGeometry {
  positions: number[];
  normals:   number[];
  uvs:       number[];
  indices:   number[];
}

/** One ground-texture variant's own geometry buffers — mirrors
 *  RoadVariantGeometry, plus a `colors` array since ground needs
 *  per-vertex color preserved for the tint-preserving `color * map`
 *  multiply (roads don't carry per-vertex color today). */
export interface GroundVariantGeometry {
  positions: number[]; normals: number[]; colors: number[]; uvs: number[]; indices: number[];
}

export interface TerrainGeometryData {
  positions: number[];
  normals:   number[];
  colors:    number[];
  indices:   number[];
  /** Road sub-tile surface geometry, grouped by texture/material variant
   *  (e.g. a faction id for settlement streets, a generic id for open-road
   *  stretches). Kept as a SEPARATE draw target rather than merged into
   *  the ground buffers above — a road-covered sub-tile is simply never
   *  emitted into the ground buffer at all (a literal hole), so a road
   *  never occupies the same X/Z footprint as a ground quad at the same
   *  time. This is what makes a road genuinely part of the terrain
   *  surface instead of a competing overlay mesh, eliminating the
   *  z-fighting failure mode categorically rather than just pushing the
   *  overlay further away with a height offset. */
  roadGeometry: Record<string, RoadVariantGeometry>;
  /** Ground (non-road, non-water) top-face surface geometry, grouped by
   *  texture variant (e.g. 'grassland', 'forest') — see
   *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md.
   *  A tile whose biome/feature has a real texture routes its top face
   *  here instead of the plain vertex-color base buffer above; everything
   *  else (water, uncovered biomes) stays on the base buffer unchanged. */
  groundGeometry: Record<string, GroundVariantGeometry>;
}

/**
 * Build the raw vertex/index/normal/color buffers for the overworld terrain.
 *
 * For each tile at height H:
 *   – Top face     (normal +Y)
 *   – South wall   (normal +Z) when south neighbour is lower
 *   – North wall   (normal −Z) when north neighbour is lower
 *   – East  wall   (normal +X) when east  neighbour is lower
 *   – West  wall   (normal −X) when west  neighbour is lower
 *
 * `GW`/`GH` = grid width/height (tile counts). `GHW`/`GHH` = half-grid-width/
 * height offsets used to center the grid at world origin. `T` = tile side
 * length (world units). `SH` = world-unit height increment per elevation level.
 */
export function buildTerrainGeometryData(
  wg: WorldGrid,
  GW: number, GH: number, GHW: number, GHH: number,
  T: number, SH: number,
  colStart: number = 0, rowStart: number = 0,
  chunkW: number = GW, chunkH: number = GH,
  roadPaths: readonly RoadPathSegment[] = [],
  roadSubdivisions: number = 4,
): TerrainGeometryData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const clr: number[] = [];
  const idx: number[] = [];
  const roadGeometry: Record<string, RoadVariantGeometry> = {};
  const groundGeometry: Record<string, GroundVariantGeometry> = {};

  /** Append a quad face into a road-variant's own buffers (created lazily
   *  on first use), with world-space-projected planar UV so the texture
   *  reads as continuous across sub-tiles/tiles rather than stamped. */
  const addRoadFace = (
    variant: string,
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
  ): void => {
    let g = roadGeometry[variant];
    if (!g) { g = { positions: [], normals: [], uvs: [], indices: [] }; roadGeometry[variant] = g; }
    const base = g.positions.length / 3;
    g.positions.push(...v0, ...v1, ...v2, ...v3);
    g.normals.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    for (const [vx, , vz] of [v0, v1, v2, v3]) {
      g.uvs.push(vx / ROAD_UV_TILE_WU, vz / ROAD_UV_TILE_WU);
    }
    g.indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };

  /** Ground-texture variant key for a cell, or null to keep today's
   *  untextured vertex-color-only path. Priority order matches the
   *  existing biomeRgb selection chain further down in this function —
   *  see docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md §3.2. */
  const _groundTextureVariant = (cell: WorldCell): string | null => {
    if (cell.biome === 'ocean' || cell.biome === 'deep_ocean') return null;
    if (cell.feature === 'river' || cell.feature === 'lake' || cell.feature === 'river_ford') return null;
    if (cell.feature === 'river_bank') return 'river_bank';
    if (cell.biome === 'beach') return 'beach';
    return (GROUND_TERRAIN_VARIANTS as readonly string[]).includes(cell.biome) ? cell.biome : null;
  };

  /** Append a quad face into a ground-variant's own buffers (created lazily
   *  on first use), with world-space-projected planar UV (same technique as
   *  addRoadFace) plus the tile's vertex color preserved for the
   *  tint-preserving color*map multiply. */
  const addGroundFace = (
    variant: string,
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
  ): void => {
    let geo = groundGeometry[variant];
    if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry[variant] = geo; }
    const base = geo.positions.length / 3;
    geo.positions.push(...v0, ...v1, ...v2, ...v3);
    geo.normals.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    geo.colors.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    for (const [vx, , vz] of [v0, v1, v2, v3]) {
      geo.uvs.push(vx / GROUND_UV_TILE_WU, vz / GROUND_UV_TILE_WU);
    }
    geo.indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };

  /** Emits one flat/edge-shaped tile's top face as a GROUND_SUBDIVISIONS×
   *  GROUND_SUBDIVISIONS sub-tile grid instead of a single quad — each
   *  sub-tile's height is bilinearly interpolated from the tile's own 4
   *  corner heights (exact, since flat/edge shapes are already planar)
   *  plus subTileBumpJitter(), and each sub-tile independently resolves
   *  its own texture variant via _subTileGroundVariant(). Shares one
   *  normal across every sub-tile (matching the parent shape's own
   *  already-computed normal — flat's fixed up-normal, or edge's real
   *  tilted normal), consistent with how the pre-existing per-tile jitter
   *  already never perturbs the normal either. See
   *  docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md. */
  const emitGroundSubTiles = (
    col: number, row: number, cell: WorldCell, groundVariant: string,
    swY: number, nwY: number, neY: number, seY: number,
    nx: number, ny: number, nz: number,
    wxTile: number, wzTile: number,
    tr: number, tg: number, tb: number,
  ): void => {
    const N = GROUND_SUBDIVISIONS;
    const heightAt = (u: number, w: number): number =>
      swY * (1 - u) * (1 - w) + seY * u * (1 - w) + nwY * (1 - u) * w + neY * u * w;

    const neighborVariant = {
      south: _groundTextureVariant(wg.get(col, row + 1)),
      north: _groundTextureVariant(wg.get(col, row - 1)),
      east:  _groundTextureVariant(wg.get(col + 1, row)),
      west:  _groundTextureVariant(wg.get(col - 1, row)),
    };

    for (let sz = 0; sz < N; sz++) {
      for (let sx = 0; sx < N; sx++) {
        const u0 = sx / N, u1 = (sx + 1) / N;
        const w0 = sz / N, w1 = (sz + 1) / N;
        const px0 = wxTile + u0 * T, px1 = wxTile + u1 * T;
        const pz0 = wzTile + w0 * T, pz1 = wzTile + w1 * T;

        const ySW = heightAt(u0, w0) + subTileBumpJitter(px0, pz0);
        const yNW = heightAt(u0, w1) + subTileBumpJitter(px0, pz1);
        const yNE = heightAt(u1, w1) + subTileBumpJitter(px1, pz1);
        const ySE = heightAt(u1, w0) + subTileBumpJitter(px1, pz0);

        const subCenterX = (px0 + px1) / 2, subCenterZ = (pz0 + pz1) / 2;
        const variant = _subTileGroundVariant(
          groundVariant, neighborVariant, sx, sz, N, cell.biome, subCenterX, subCenterZ,
        );

        addGroundFace(
          variant,
          [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
          nx, ny, nz, tr, tg, tb,
        );
      }
    }
  };

  /** Elevation *level* of a (possibly out-of-bounds) tile — used only for
   *  colour/variant lookups, which are keyed by the logical land level. */
  const lvl = (c: number, r: number): number => wg.get(c, r).elevation;

  /** Physical (carved) height in world units of a (possibly out-of-bounds)
   *  tile — used for actual geometry (top-face Y, wall placement). Equals
   *  `elevation × SH` for dry tiles, or less for river/ocean tiles carrying
   *  `waterDepth` (see WaterDepthConfig.ts). This is the single source of
   *  truth shared with the Rapier collider (same buffers) and with
   *  `WaterDetection.getWaterInfoAt()`'s floor query — both pass this same
   *  `SH` parameter through so they can never disagree. */
  const physH = (c: number, r: number): number => physicalHeightWU(wg.get(c, r), SH);

  /**
   * Append a quad face to the buffers.
   * v0→v1→v2→v3 must be counter-clockwise when viewed along the outward normal.
   */
  const addFace = (
    v0: [number, number, number], v1: [number, number, number],
    v2: [number, number, number], v3: [number, number, number],
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
  ): void => {
    const base = pos.length / 3;
    pos.push(...v0, ...v1, ...v2, ...v3);
    nrm.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
    clr.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
    idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
  };

  const rowEnd = Math.min(GH, rowStart + chunkH);
  const colEnd = Math.min(GW, colStart + chunkW);
  for (let row = rowStart; row < rowEnd; row++) {
    for (let col = colStart; col < colEnd; col++) {
      const H   = lvl(col, row);
      const wy  = physH(col, row);
      const wx  = (col - GHW) * T;
      const wz  = (row - GHH) * T;
      const wx1 = wx + T;
      const wz1 = wz + T;

      // Subtle per-tile brightness variation (avoids repetitive flat look)
      const v = 0.92 + ((col * 29 + row * 19) % 18) / 200;

      // Biome/feature-aware colour selection
      const cell = wg.get(col, row);
      let biomeRgb: readonly [number, number, number];
      if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') {
        biomeRgb = cell.waterDepth < SHALLOW_WATER_TINT_THRESHOLD_WU ? BIOME_WATER_SHALLOW : BIOME_WATER;
      } else if (cell.biome === 'beach') {
        const vi = cellVariantIndex(col, row, BIOME_SAND_VARIANTS.length);
        biomeRgb = BIOME_SAND_VARIANTS[vi]!;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'lake') {
        biomeRgb = BIOME_LAKE;
      } else if (cell.feature === 'river_ford') {
        biomeRgb = BIOME_FORD;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        const variants = BIOME_COLOR_VARIANTS[cell.biome] ?? BIOME_VARIANTS[H] ?? [BIOME[H]!];
        const vi = cellVariantIndex(col, row, variants.length);
        biomeRgb = variants[vi]!;
      }
      const [rb, gb, bb] = biomeRgb;
      const tr = rb * v, tg = gb * v, tb = bb * v;

      // ── TOP face (normal +Y) ─────────────────────────────────────────
      // Small per-corner jitter added on top of the flat elevation height gives the
      // ground an organic, non-uniform look while keeping wall faces (collision-critical)
      // perfectly flat. Corner coordinates are grid-lattice points shared by neighbouring
      // tiles, so adjacent tiles' shared edges/corners always agree (no seams).
      const jSW = cornerHeightJitter(col,     row);
      const jNW = cornerHeightJitter(col,     row + 1);
      const jNE = cornerHeightJitter(col + 1, row + 1);
      const jSE = cornerHeightJitter(col + 1, row);

      // Ramp classification (see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md):
      // a dry tile's 4 corners derive from its real neighbors' elevation levels
      // (clamped to at most 1 level of slope); water tiles are never ramp-eligible,
      // so shorelines/riverbanks are completely unaffected by this block.
      const rampEligible = _isRampEligible(cell);
      const cornerLevels = rampEligible ? _tileCornerLevels(wg, col, row) : [H, H, H, H] as const;
      const lowCorners = rampEligible ? _lowCorners(cornerLevels, H) : [false, false, false, false] as const;
      const { shape, diagonal } = classifyTileShape(lowCorners);

      // Raw (pre-jitter) ramp corner Y offsets from this tile's own `wy` — always 0 for
      // flat/all-four-down/non-ramp-eligible tiles (byte-identical to pre-ramp behavior),
      // exactly (H - level) * SH (0 or SH) for genuinely ramped shapes. Computed once here
      // so both the top face below AND the wall blocks further down can share it.
      const rampDrop = (level: number): number =>
        (!rampEligible || shape === 'flat' || shape === 'all-four-down') ? 0 : (H - level) * SH;
      const swY = wy - rampDrop(cornerLevels[0]);
      const nwY = wy - rampDrop(cornerLevels[1]);
      const neY = wy - rampDrop(cornerLevels[2]);
      const seY = wy - rampDrop(cornerLevels[3]);

      // Road sub-tile surface: only attempted for tiles already flagged as
      // carrying a road, and only when the caller actually supplied path
      // data. `computeTileRoadCoverage()` can legitimately return "no
      // coverage" even for a road-flagged tile (e.g. path data that's
      // incomplete or doesn't quite reach this tile) — in that case we fall
      // through to the exact same single-quad behavior as before, so a gap
      // in the input data never produces a visible hole in the terrain.
      //
      // `river_ford` tiles (a road/A* path crossing a river, re-tagged by
      // WorldGenerator.applyRoadFords() per RI-3) get the same sub-tile
      // treatment as an ordinary road so the crossing renders as a real
      // bridge deck instead of a plain colored ground quad — see the
      // BRIDGE_ROAD_VARIANT override just below. Road sub-tiles never get
      // ramp geometry (deferred non-goal — see design spec §2), always
      // using the flat `wy` + jitter exactly as before.
      const isRoadTile = cell.feature === 'road' || cell.feature === 'road_dirt' || cell.feature === 'river_ford';
      const rawCoverage = (isRoadTile && roadPaths.length > 0)
        ? computeTileRoadCoverage(roadPaths, wx, wz, T, roadSubdivisions)
        : null;
      // A ford isn't owned by any one settlement/faction, so every covered
      // sub-tile always renders with the universal bridge-deck variant,
      // regardless of which road's variant `computeTileRoadCoverage()`
      // actually matched.
      const coverage = (rawCoverage && cell.feature === 'river_ford')
        ? rawCoverage.map(v => (v === null ? null : BRIDGE_ROAD_VARIANT))
        : rawCoverage;
      const hasRoadCoverage = coverage !== null && coverage.some(vnt => vnt !== null);

      if (hasRoadCoverage) {
        // Bilinearly interpolate the tile's 4 corner jitters across the
        // sub-tile grid — keeps the same organic-but-seamless look as the
        // un-subdivided case (adjacent tiles' shared corners still match
        // exactly, since we're interpolating from the identical jitter
        // values they'd compute too) without needing per-sub-tile jitter.
        const heightAt = (u: number, w: number): number =>
          jSW * (1 - u) * (1 - w) + jSE * u * (1 - w) + jNW * (1 - u) * w + jNE * u * w;

        for (let sz = 0; sz < roadSubdivisions; sz++) {
          for (let sx = 0; sx < roadSubdivisions; sx++) {
            const variant = coverage![sz * roadSubdivisions + sx];
            const u0 = sx / roadSubdivisions, u1 = (sx + 1) / roadSubdivisions;
            const w0 = sz / roadSubdivisions, w1 = (sz + 1) / roadSubdivisions;
            const px0 = wx + u0 * T, px1 = wx + u1 * T;
            const pz0 = wz + w0 * T, pz1 = wz + w1 * T;
            const ySW = wy + heightAt(u0, w0), yNW = wy + heightAt(u0, w1);
            const yNE = wy + heightAt(u1, w1), ySE = wy + heightAt(u1, w0);
            if (variant === null) {
              // Ground sub-tile — same colour pipeline as the un-subdivided case.
              addFace(
                [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
                0, 1, 0,  tr, tg, tb,
              );
            } else {
              // Road sub-tile — a literal hole in the ground buffer above,
              // filled by this separate, per-variant textured buffer
              // instead. Same footprint and height as a ground sub-tile
              // would have had here, so there is no seam and — critically
              // — no second surface occupying the same space, which is
              // what eliminates the z-fighting the previous overlay-mesh
              // approach suffered from.
              addRoadFace(
                variant,
                [px0, ySW, pz0], [px0, yNW, pz1], [px1, yNE, pz1], [px1, ySE, pz0],
                0, 1, 0,
              );
            }
          }
        }
      } else if (shape === 'flat' || shape === 'all-four-down' || !rampEligible) {
        // Identical to pre-ramp behavior: jitter-only positions, fixed up-normal.
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          emitGroundSubTiles(col, row, cell, groundVariant, swY, nwY, neY, seY, 0, 1, 0, wx, wz, tr, tg, tb);
        } else {
          addFace(
            [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
            0, 1, 0,  tr, tg, tb,
          );
        }
      } else if (shape === 'edge') {
        // Genuinely tilted but still planar — cheap 4-vertex/1-normal path
        // with a REAL computed normal (an Edge ramp really is sloped).
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const [v0, v1, v2, v3] = orderCornersForDiagonal(corners, diagonal);
        const n = triangleNormal(v0, v1, v2);
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          // NOTE: emitGroundSubTiles interpolates from the tile's raw
          // (pre-jitter) swY/nwY/neY/seY, not the jittered v0..v3 corners
          // computed just above for the non-subdivided fallback path —
          // this is intentional (see design spec §3.2: the new bump
          // replaces, not layers with, the old per-tile jitter).
          emitGroundSubTiles(col, row, cell, groundVariant, swY, nwY, neY, seY, n[0], n[1], n[2], wx, wz, tr, tg, tb);
        } else {
          addFace(v0, v1, v2, v3, n[0], n[1], n[2], tr, tg, tb);
        }
      } else {
        // single-corner / outer-corner / saddle: non-planar, 2 explicit
        // triangles with independently-computed per-triangle normals.
        const corners = {
          sw: [wx,  swY + jSW, wz]  as [number, number, number],
          nw: [wx,  nwY + jNW, wz1] as [number, number, number],
          ne: [wx1, neY + jNE, wz1] as [number, number, number],
          se: [wx1, seY + jSE, wz]  as [number, number, number],
        };
        const { positions: rampPos, normals: rampNrm } = buildQuadFace(corners, diagonal);
        const groundVariant = _groundTextureVariant(cell);
        if (groundVariant !== null) {
          let geo = groundGeometry[groundVariant];
          if (!geo) { geo = { positions: [], normals: [], colors: [], uvs: [], indices: [] }; groundGeometry[groundVariant] = geo; }
          const base = geo.positions.length / 3;
          geo.positions.push(...rampPos);
          geo.normals.push(...rampNrm);
          for (let i = 0; i < 6; i++) geo.colors.push(tr, tg, tb);
          for (let i = 0; i < rampPos.length; i += 3) {
            geo.uvs.push(rampPos[i]! / GROUND_UV_TILE_WU, rampPos[i + 2]! / GROUND_UV_TILE_WU);
          }
          geo.indices.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
        } else {
          const base = pos.length / 3;
          pos.push(...rampPos);
          nrm.push(...rampNrm);
          for (let i = 0; i < 6; i++) clr.push(tr, tg, tb);
          idx.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
        }
      }

      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      // Wall faces compare *physical* (carved) height, not raw elevation
      // level, so a land tile next to a carved river/ocean tile grows a
      // wall down into the basin — a real riverbank/shore lip — with no
      // extra logic. Anchored to this tile's own NW/NE ramp corners
      // (Task 4) rather than the flat `wy`, so a ramp that already
      // reaches down to a lower neighbor doesn't leave a redundant wall —
      // see docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md §5.
      const wallTopS = Math.min(nwY, neY);
      const wyS = physH(col, row + 1);
      if (wyS < wallTopS) {
        const d = 0.76;
        addFace(
          [wx1, wallTopS, wz1], [wx, wallTopS, wz1], [wx, wyS, wz1], [wx1, wyS, wz1],
          0, 0, 1,  tr * d, tg * d, tb * d,
        );
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const wallTopN = Math.min(swY, seY);
      const wyN = physH(col, row - 1);
      if (wyN < wallTopN) {
        const d = 0.50;
        addFace(
          [wx, wallTopN, wz], [wx1, wallTopN, wz], [wx1, wyN, wz], [wx, wyN, wz],
          0, 0, -1,  tr * d, tg * d, tb * d,
        );
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const wallTopE = Math.min(neY, seY);
      const wyE = physH(col + 1, row);
      if (wyE < wallTopE) {
        const d = 0.63;
        addFace(
          [wx1, wallTopE, wz], [wx1, wallTopE, wz1], [wx1, wyE, wz1], [wx1, wyE, wz],
          1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const wallTopW = Math.min(swY, nwY);
      const wyW = physH(col - 1, row);
      if (wyW < wallTopW) {
        const d = 0.55;
        addFace(
          [wx, wallTopW, wz1], [wx, wallTopW, wz], [wx, wyW, wz], [wx, wyW, wz1],
          -1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }
    }
  }

  return { positions: pos, normals: nrm, colors: clr, indices: idx, roadGeometry, groundGeometry };
}
