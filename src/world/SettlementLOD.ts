/**
 * SettlementLOD.ts — 02-game-world-integration (SI-5)
 *
 * Pure distance-threshold helpers for settlement level-of-detail. Given a
 * player's distance to a settlement's centre, decides whether it should be
 * a billboard, full 3D geometry, or not rendered at all, and whether NPCs
 * should be spawned. No Three.js, no scene — the actual billboard sprite
 * swap / geometry show-hide / NPC spawn-despawn is the renderer's job each
 * frame, driven by these pure functions.
 */

/** Beyond this distance (world units) the settlement isn't rendered at all. */
export const LOD_HIDDEN_DISTANCE = 80;

/** Within this distance (world units) the settlement gets full 3D building geometry (between here and LOD_HIDDEN_DISTANCE it's a billboard cluster). */
export const LOD_FULL_DISTANCE = 40;

/** Within this distance (world units) NPCs are spawned. */
export const LOD_NPC_DISTANCE = 20;

export type SettlementLodTier = 'hidden' | 'billboard' | 'full';

/**
 * SI-5 — which LOD tier should a settlement render at, given the player's
 * distance to its centre?
 *   - `> LOD_HIDDEN_DISTANCE` (80u)             → 'hidden'    (not rendered)
 *   - `LOD_FULL_DISTANCE..LOD_HIDDEN_DISTANCE`  → 'billboard' (simple sprite cluster)
 *   - `<= LOD_FULL_DISTANCE` (40u)              → 'full'      (full 3D geometry)
 */
export function settlementLodTier(distance: number): SettlementLodTier {
  if (distance > LOD_HIDDEN_DISTANCE) return 'hidden';
  if (distance > LOD_FULL_DISTANCE) return 'billboard';
  return 'full';
}

/** SI-5 — should NPCs be spawned at this distance (<= 20u)? */
export function shouldSpawnSettlementNpcs(distance: number): boolean {
  return distance <= LOD_NPC_DISTANCE;
}
