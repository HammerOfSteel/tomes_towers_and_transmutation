/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene
 * (batch 1 — grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid } from '@/world/WorldGrid';

// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²

// ── Placement ─────────────────────────────────────────────────────────────

export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
}

/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to `grassland`-biome tiles that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 */
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(DENSITY_PER_UNIT2);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const placements: GrassPlacement[] = [];

  for (let gx = centerX - radius; gx < centerX + radius; gx += gridStep) {
    for (let gz = centerZ - radius; gz < centerZ + radius; gz += gridStep) {
      const x = gx + (rand() - 0.5) * gridStep;
      const z = gz + (rand() - 0.5) * gridStep;

      const col = Math.floor(x / wg.tileUnit + halfW);
      const row = Math.floor(z / wg.tileUnit + halfH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

      const cell = wg.get(col, row);
      if (cell.biome !== 'grassland') continue;
      if (!isScatterAllowed(cell, 'grass')) continue;

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
      });
    }
  }
  return placements;
}

// ── Instance-buffer packing ──────────────────────────────────────────────

export interface GrassInstanceBuffers {
  positionRotation: Float32Array;
  scaleAndVariation: Float32Array;
}

/** Pack placements into the Float32Arrays the shader's instanced attributes expect. */
export function packGrassInstanceBuffers(placements: GrassPlacement[]): GrassInstanceBuffers {
  const count = placements.length;
  const positionRotation = new Float32Array(count * 4);
  const scaleAndVariation = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = placements[i]!;
    positionRotation[i * 4]     = p.x;
    positionRotation[i * 4 + 1] = p.y;
    positionRotation[i * 4 + 2] = p.z;
    positionRotation[i * 4 + 3] = p.rotation;
    scaleAndVariation[i * 4]     = p.scaleX;
    scaleAndVariation[i * 4 + 1] = p.scaleY;
    scaleAndVariation[i * 4 + 2] = p.tilt;
    scaleAndVariation[i * 4 + 3] = p.colorVar;
  }
  return { positionRotation, scaleAndVariation };
}
