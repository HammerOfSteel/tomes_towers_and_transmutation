/**
 * TerritoryDressing.ts — Phase 6 (race-specific biome territory dressing).
 *
 * Pure geometry/probability helpers for "is this scatter point inside a
 * settlement's territory, and if so, how likely is a faction-themed prop
 * here instead of a normal tree/rock?" No THREE.js or scene dependency —
 * see docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md §2.
 */
import type { SettlementFaction } from '@/overworld-studio';

/** Territory radius = settlement boundary radius (SettlementBoundary.ts's
 *  settlementBoundaryRadius()) x this multiplier — a meaningful ring of
 *  surrounding wilderness that scales with settlement size. */
export const TERRITORY_RADIUS_MULTIPLIER = 2.5;

/** Placement probability at the settlement centre (fades linearly to 0 at
 *  the territory radius edge). */
export const MAX_TERRITORY_PLACEMENT_PROBABILITY = 0.7;

/**
 * Probability that a scatter point at `distanceFromCenter` world units from
 * a settlement centre, within a territory of `territoryRadius`, gets
 * replaced by a faction territory-dressing prop instead of the normal
 * tree/rock. 0 at/beyond the radius, up to MAX_TERRITORY_PLACEMENT_PROBABILITY
 * at the centre — a linear gradient, not a hard on/off wall.
 */
export function territoryPlacementProbability(distanceFromCenter: number, territoryRadius: number): number {
  if (territoryRadius <= 0 || distanceFromCenter >= territoryRadius) return 0;
  const t = distanceFromCenter / territoryRadius; // 0 at centre, 1 at edge
  return MAX_TERRITORY_PLACEMENT_PROBABILITY * (1 - t);
}

export interface TerritorySettlement {
  worldPos: { x: number; z: number };
  radius: number;
  faction: SettlementFaction;
}

export interface TerritoryMatch {
  faction: SettlementFaction;
  distanceFromCenter: number;
  territoryRadius: number;
}

/**
 * Which settlement's territory (if any) contains `point`, and that
 * settlement's faction — null if the point falls outside every
 * settlement's territory. When multiple territories overlap, the nearest
 * settlement (by centre distance) wins.
 */
export function findTerritoryFaction(
  point: { x: number; z: number },
  settlements: readonly TerritorySettlement[],
): TerritoryMatch | null {
  let best: TerritoryMatch | null = null;
  for (const s of settlements) {
    const territoryRadius = s.radius * TERRITORY_RADIUS_MULTIPLIER;
    const d = Math.hypot(point.x - s.worldPos.x, point.z - s.worldPos.z);
    if (d >= territoryRadius) continue;
    if (!best || d < best.distanceFromCenter) best = { faction: s.faction, distanceFromCenter: d, territoryRadius };
  }
  return best;
}
