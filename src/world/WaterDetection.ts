import type { WorldGrid } from '@/world/WorldGrid';

/**
 * Returns true if the world-space position (wx, wz) lies on a river-feature or
 * water-biome tile. Used to drive the animated water shader's time uniform
 * gating and the player's submersion visual offset.
 */
export function isInWaterAt(wg: Pick<WorldGrid, 'worldToGrid' | 'get'>, wx: number, wz: number): boolean {
  const { col, row } = wg.worldToGrid(wx, wz);
  const cell = wg.get(col, row);
  return cell.feature === 'river' || cell.biome === 'water';
}
