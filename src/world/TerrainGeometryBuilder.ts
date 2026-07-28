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

/** Biome vertex colours [r, g, b] for height levels 0–4. */
export const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];

export const BIOME_RIVER: [number, number, number] = [0.18, 0.38, 0.62]; // blue channel
export const BIOME_WATER: [number, number, number] = [0.14, 0.26, 0.48]; // deep water

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

  /** Height level of a (possibly out-of-bounds) tile. */
  const lvl = (c: number, r: number): number => wg.get(c, r).elevation;

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
      const wy  = H * SH;
      const wx  = (col - GHW) * T;
      const wz  = (row - GHH) * T;
      const wx1 = wx + T;
      const wz1 = wz + T;

      // Subtle per-tile brightness variation (avoids repetitive flat look)
      const v = 0.92 + ((col * 29 + row * 19) % 18) / 200;

      // Biome/feature-aware colour selection
      const cell = wg.get(col, row);
      let biomeRgb: [number, number, number];
      if (cell.biome === 'water') {
        biomeRgb = BIOME_WATER;
      } else if (cell.feature === 'river') {
        biomeRgb = BIOME_RIVER;
      } else if (cell.feature === 'river_bank') {
        const b = BIOME[H]!;
        biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
      } else {
        biomeRgb = BIOME[H]!;
      }
      const [rb, gb, bb] = biomeRgb;
      const tr = rb * v, tg = gb * v, tb = bb * v;

      // ── TOP face (normal +Y) ─────────────────────────────────────────
      addFace(
        [wx, wy, wz], [wx, wy, wz1], [wx1, wy, wz1], [wx1, wy, wz],
        0, 1, 0,  tr, tg, tb,
      );

      // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
      const Hs = lvl(col, row + 1);
      if (Hs < H) {
        const wy2 = Hs * SH;
        const d = 0.76;
        addFace(
          [wx1, wy, wz1], [wx, wy, wz1], [wx, wy2, wz1], [wx1, wy2, wz1],
          0, 0, 1,  tr * d, tg * d, tb * d,
        );
      }

      // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
      const Hn = lvl(col, row - 1);
      if (Hn < H) {
        const wy2 = Hn * SH;
        const d = 0.50;
        addFace(
          [wx, wy, wz], [wx1, wy, wz], [wx1, wy2, wz], [wx, wy2, wz],
          0, 0, -1,  tr * d, tg * d, tb * d,
        );
      }

      // ── EAST wall (+X face, at wx1) ──────────────────────────────────
      const He = lvl(col + 1, row);
      if (He < H) {
        const wy2 = He * SH;
        const d = 0.63;
        addFace(
          [wx1, wy, wz], [wx1, wy, wz1], [wx1, wy2, wz1], [wx1, wy2, wz],
          1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }

      // ── WEST wall (−X face, at wx) ───────────────────────────────────
      const Hw = lvl(col - 1, row);
      if (Hw < H) {
        const wy2 = Hw * SH;
        const d = 0.55;
        addFace(
          [wx, wy, wz1], [wx, wy, wz], [wx, wy2, wz], [wx, wy2, wz1],
          -1, 0, 0,  tr * d, tg * d, tb * d,
        );
      }
    }
  }

  return { positions: pos, normals: nrm, colors: clr, indices: idx };
}
