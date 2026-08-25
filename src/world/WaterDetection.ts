import type { WorldGrid } from '@/world/WorldGrid';
import { LEVEL_HEIGHT, physicalHeightWU } from '@/world/WaterDepthConfig';

/** Small upward offset applied to the water surface's visual Y above the
 *  tile's logical elevation — must match `OverworldScene._buildWaterMesh()`'s
 *  `cell.elevation * SH + 0.05`, since that mesh IS the surface the player
 *  sees and should swim at. Kept here (not re-derived) so the two can never
 *  drift apart silently. */
const WATER_SURFACE_OFFSET_WU = 0.05;

export interface WaterInfo {
  /** World-space Y of the water's visible surface. */
  surfaceY: number;
  /** World-space Y of the carved floor beneath the water (collision-critical). */
  floorY: number;
  /** Water depth in world units (surfaceY − floorY, modulo the small visual offset). */
  depth: number;
}

/**
 * Returns real per-point water surface/floor info for the world-space
 * position (wx, wz), or `null` if that position is dry (including
 * `river_ford` crossings, which carry `waterDepth: 0` and are meant to be
 * walked across normally). Replaces the old boolean-only `isInWaterAt()` —
 * callers (namely `OverworldScene.update()`) use this to drive real swim
 * state via `PlayerController.setSwimming()`/`setSubmersion()`, matching the
 * Water Lab dev room's proven swim feel instead of a cosmetic offset.
 */
export function getWaterInfoAt(
  wg: Pick<WorldGrid, 'worldToGrid' | 'get'>,
  wx: number,
  wz: number,
): WaterInfo | null {
  const { col, row } = wg.worldToGrid(wx, wz);
  const cell = wg.get(col, row);
  if (cell.waterDepth <= 0) return null;

  const surfaceY = cell.elevation * LEVEL_HEIGHT + WATER_SURFACE_OFFSET_WU;
  const floorY = physicalHeightWU(cell);
  return { surfaceY, floorY, depth: cell.waterDepth };
}
