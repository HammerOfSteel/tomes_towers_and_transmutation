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
import type { WorldGrid } from './WorldGrid';
import { physicalHeightWU } from './WaterDepthConfig';

/** Biome vertex colours [r, g, b] for height levels 0–4 — kept for backward-compat callers
 * that only need the "primary" look; internally buildTerrainGeometryData now picks from
 * BIOME_VARIANTS for patchiness, this array is variant index 0 of each level. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
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
];

export const BIOME_RIVER: [number, number, number] = [0.18, 0.38, 0.62]; // blue channel
export const BIOME_WATER: [number, number, number] = [0.14, 0.26, 0.48]; // deep water
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
const CORNER_JITTER_MAX = 0.03;

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

export interface TerrainGeometryData {
  positions: number[];
  normals:   number[];
  colors:    number[];
  indices:   number[];
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
): TerrainGeometryData {
  const pos: number[] = [];
  const nrm: number[] = [];
  const clr: number[] = [];
  const idx: number[] = [];

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

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
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
      if (cell.biome === 'water') {
        biomeRgb = cell.waterDepth < SHALLOW_WATER_TINT_THRESHOLD_WU ? BIOME_WATER_SHALLOW : BIOME_WATER;
      } else if (cell.biome === 'sand') {
        const vi = cellVariantIndex(col, row, BIOME_SAND_VARIANTS.length);
        biomeRgb = BIOME_SAND_VARIANTS[vi]!;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'river_ford') {
        biomeRgb = BIOME_FORD;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        const variants = BIOME_VARIANTS[H] ?? [BIOME[H]!];
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
      addFace(
        [wx, wy + jSW, wz], [wx, wy + jNW, wz1], [wx1, wy + jNE, wz1], [wx1, wy + jSE, wz],
        0, 1, 0,  tr, tg, tb,
      );

      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      // Wall faces compare *physical* (carved) height, not raw elevation
      // level, so a land tile next to a carved river/ocean tile grows a
      // wall down into the basin — a real riverbank/shore lip — with no
      // extra logic: this is the same "draw a wall wherever my neighbour is
      // lower" rule as before, just fed carved heights instead of levels.
      const wyS = physH(col, row + 1);
      if (wyS < wy) {
        const d = 0.76;
        addFace(
          [wx1, wy, wz1], [wx, wy, wz1], [wx, wyS, wz1], [wx1, wyS, wz1],
          0, 0, 1,  tr * d, tg * d, tb * d,
        );
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const wyN = physH(col, row - 1);
      if (wyN < wy) {
        const d = 0.50;
        addFace(
          [wx, wy, wz], [wx1, wy, wz], [wx1, wyN, wz], [wx, wyN, wz],
          0, 0, -1,  tr * d, tg * d, tb * d,
        );
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const wyE = physH(col + 1, row);
      if (wyE < wy) {
        const d = 0.63;
        addFace(
          [wx1, wy, wz], [wx1, wy, wz1], [wx1, wyE, wz1], [wx1, wyE, wz],
          1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const wyW = physH(col - 1, row);
      if (wyW < wy) {
        const d = 0.55;
        addFace(
          [wx, wy, wz1], [wx, wy, wz], [wx, wyW, wz], [wx, wyW, wz1],
          -1, 0, 0,  tr * d, tg * d, tb * d,
        );

      }
    }
  }

  return { positions: pos, normals: nrm, colors: clr, indices: idx };
}
