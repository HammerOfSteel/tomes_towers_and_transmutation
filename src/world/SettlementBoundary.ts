/**
 * SettlementBoundary.ts — 02-game-world-integration (SI-4, geometry only)
 *
 * Pure geometry helpers for a settlement's boundary (SI-1's
 * `SettlementSpawnPlan`): boundary radius, inside/outside test, and a
 * crossing detector between two player positions.
 *
 * Scope note: SI-4 also calls for collision walls, an ambient-audio zone
 * swap, and an "Entering [Name]" toast notification. Those are runtime
 * systems (physics colliders, the audio bus, the UI toast queue) that need
 * a live scene/game-loop to hook into — out of scope for a pure data
 * module. This module provides the deterministic geometry (`isInside`,
 * `crossedBoundary`) that those systems would call each frame/tick; the
 * actual collider/audio-zone/toast wiring is left for the `OverworldScene.ts`
 * integration step, same as every other module in this TODO.
 */

import type { SettlementSpawnPlan } from './SettlementSpawner';

/** Extra clearance (world units) added beyond the farthest building, so the boundary sits just outside the settlement, not through its outermost building. */
export const BOUNDARY_MARGIN = 4;

/** Fallback radius (world units) for a settlement with no non-centre buildings (shouldn't happen in practice, but keeps this total). */
const FALLBACK_RADIUS = 10;

/**
 * SI-4 — boundary radius: distance from the settlement centre to its
 * farthest building, plus `BOUNDARY_MARGIN`. Deterministic given the plan.
 */
export function settlementBoundaryRadius(plan: SettlementSpawnPlan, margin: number = BOUNDARY_MARGIN): number {
  let maxDist = 0;
  for (const b of plan.buildings) {
    const dx = b.position.x - plan.position.x;
    const dz = b.position.z - plan.position.z;
    maxDist = Math.max(maxDist, Math.hypot(dx, dz));
  }
  return (maxDist > 0 ? maxDist : FALLBACK_RADIUS) + margin;
}

/** SI-4 — is a world-space (x, z) position inside the settlement boundary? */
export function isInsideSettlementBoundary(
  position: { x: number; z: number },
  plan: SettlementSpawnPlan,
  radius: number = settlementBoundaryRadius(plan),
): boolean {
  const dx = position.x - plan.position.x;
  const dz = position.z - plan.position.z;
  return Math.hypot(dx, dz) <= radius;
}

export type BoundaryCrossing = 'entering' | 'exiting' | null;

/**
 * SI-4 — did the player cross the settlement boundary moving from
 * `prevPosition` to `currPosition` this frame/tick? Returns `'entering'` if
 * they went from outside to inside, `'exiting'` for inside-to-outside, or
 * `null` if they stayed on the same side (drives the "Entering [Name]"
 * toast + ambient audio zone swap at the call site).
 */
export function crossedSettlementBoundary(
  prevPosition: { x: number; z: number },
  currPosition: { x: number; z: number },
  plan: SettlementSpawnPlan,
  radius: number = settlementBoundaryRadius(plan),
): BoundaryCrossing {
  const wasInside = isInsideSettlementBoundary(prevPosition, plan, radius);
  const isInside = isInsideSettlementBoundary(currPosition, plan, radius);
  if (wasInside === isInside) return null;
  return isInside ? 'entering' : 'exiting';
}
