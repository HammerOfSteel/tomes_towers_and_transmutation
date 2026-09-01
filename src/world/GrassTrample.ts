/**
 * GrassTrample.ts — a decaying, player-trampled-grass "trail" grid, sampled by
 * GrassField.ts's shader to flatten recently-walked-on blades. See
 * docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md for the full design
 * and the real Godot prior-art this adapts (§2), and §3 for why this is a CPU-side
 * Float32Array grid + THREE.DataTexture rather than a literal GPU render-target: this
 * project's test suite runs under jsdom (no real WebGL context — confirmed via
 * vitest.config.ts), and no existing test anywhere constructs a THREE.WebGLRenderer, so a
 * render-to-texture pass would be both unplumbed (OverworldScene has no renderer
 * reference today) and entirely unit-untestable. This file's math is pure and
 * fully tested; only the thin TrampleMap class (Task 2) touches THREE.js.
 */

/** World units per side of the tracked square window — matches GrassField.ts's full
 *  placement-window width (2 * GRASS_RADIUS = 48), so the trample grid always covers
 *  everywhere grass can actually be rendered. */
export const TRAMPLE_MAP_WORLD_SIZE = 48;

/** Cells per side of the grid (-> 0.75 WU/cell) — fine enough for a soft ~0.9 WU-radius
 *  stamp to read as a smooth blob, coarse enough that a full-grid decay pass (4096
 *  cells) is trivially cheap every frame. */
export const TRAMPLE_MAP_RESOLUTION = 64;

/** World-unit radius of one footstep's soft stamp. */
export const TRAMPLE_STAMP_RADIUS = 0.9;

/** Seconds for a trampled cell's intensity to halve. ~3 half-lives (~6s) fades a
 *  footprint to ~12.5% — a "little faint trail," not a lasting scar. */
export const TRAMPLE_DECAY_HALF_LIFE_S = 2.0;

/** World units the player must move from the grid's current center before it recenters
 *  (shifting existing data rather than discarding it — see shiftGrid()). */
export const TRAMPLE_RECENTER_THRESHOLD_WU = 12;

/** Multiplicative decay factor to apply to every cell this frame. */
export function decayFactor(dt: number, halfLifeS: number): number {
  return Math.pow(0.5, dt / halfLifeS);
}

/**
 * Maps a world position into the grid's cell space, given the window's current world
 * center. Returns null if the position falls outside the tracked window (half-open: the
 * window spans [center - worldSize/2, center + worldSize/2), matching how a single grid
 * of `resolution` cells can only ever represent `resolution` distinct positions per axis).
 */
export function worldToTrampleCell(
  worldX: number, worldZ: number,
  centerX: number, centerZ: number,
  worldSize: number, resolution: number,
): { col: number; row: number } | null {
  const cellSize = worldSize / resolution;
  const localX = worldX - centerX + worldSize / 2;
  const localZ = worldZ - centerZ + worldSize / 2;
  const col = Math.floor(localX / cellSize);
  const row = Math.floor(localZ / cellSize);
  if (col < 0 || col >= resolution || row < 0 || row >= resolution) return null;
  return { col, row };
}

/**
 * Writes a soft radial "footstep" blob centered at grid cell (centerCol, centerRow) into
 * `grid` (flat, row-major, length resolution*resolution). Uses Math.max against any
 * existing value at each touched cell (never adds/overwrites), so overlapping footsteps
 * saturate toward 1.0 instead of accumulating past it, and stamping never REDUCES a
 * still-strong nearby trail. Cells beyond `stampRadiusWU` are left completely untouched.
 */
export function stampInto(
  grid: Float32Array, resolution: number, cellWorldSize: number,
  centerCol: number, centerRow: number, stampRadiusWU: number,
): void {
  const cellRadius = Math.ceil(stampRadiusWU / cellWorldSize);
  for (let dr = -cellRadius; dr <= cellRadius; dr++) {
    const row = centerRow + dr;
    if (row < 0 || row >= resolution) continue;
    for (let dc = -cellRadius; dc <= cellRadius; dc++) {
      const col = centerCol + dc;
      if (col < 0 || col >= resolution) continue;
      const dx = dc * cellWorldSize;
      const dz = dr * cellWorldSize;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > stampRadiusWU) continue;
      const intensity = 1 - dist / stampRadiusWU;
      const idx = row * resolution + col;
      grid[idx] = Math.max(grid[idx], intensity);
    }
  }
}

/** Pure distance gate — true once the player has moved past `threshold` WU from the
 *  grid's current center (mirrors this session's own shouldPlaceBrushPoint() pattern
 *  from the overworld-editor paint-mode work). */
export function shouldRecenter(dx: number, dz: number, threshold: number): boolean {
  return Math.sqrt(dx * dx + dz * dz) > threshold;
}

/**
 * Returns a NEW grid (same size as `grid`) with content copied from the shifted offset:
 * `result[row][col] = grid[row + shiftRows][col + shiftCols]` wherever that source index
 * is in bounds, else 0 (a "revealed" edge starts untrampled). Used when recentering the
 * window so already-decaying trail data isn't discarded outright — see TrampleMap.update()
 * (Task 2) for how shiftCols/shiftRows are derived from the player's actual movement.
 */
export function shiftGrid(
  grid: Float32Array, resolution: number, shiftCols: number, shiftRows: number,
): Float32Array {
  const result = new Float32Array(resolution * resolution);
  for (let row = 0; row < resolution; row++) {
    const srcRow = row + shiftRows;
    if (srcRow < 0 || srcRow >= resolution) continue;
    for (let col = 0; col < resolution; col++) {
      const srcCol = col + shiftCols;
      if (srcCol < 0 || srcCol >= resolution) continue;
      result[row * resolution + col] = grid[srcRow * resolution + srcCol]!;
    }
  }
  return result;
}
