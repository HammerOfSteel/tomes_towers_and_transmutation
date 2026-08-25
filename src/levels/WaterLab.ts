// ── WaterLab ────────────────────────────────────────────────────────────────
//
//  Pure tier-data for the "Water Lab" dev-sandbox scene: a 24×24 world-unit
//  basin with 4 stepped elevations (dry bank → shallow shelf → deep floor →
//  abyss) cut into one side of a flat room, so a player can walk from dry
//  land into progressively deeper water and test wading vs. swimming vs.
//  diving without needing the full overworld.
//
//  This is intentionally NOT a Blueprint/DungeonPlan — the existing
//  blueprint schema (see src/levels/blueprint.ts) only supports 'wall' and
//  'pillar' tile types on a single flat floor elevation, so it cannot
//  express a stepped multi-elevation basin. WaterLabScene (a bespoke scene
//  class, mirroring how OverworldScene itself bypasses blueprints) consumes
//  this pure data to build its own meshes/colliders directly.

/** One walkable elevation tier in the basin. */
export interface WaterLabTier {
  /** Human-readable tier name for debug/UI labeling. */
  name: 'bank' | 'shallow' | 'deep' | 'abyss';
  /** World Y of this tier's walkable top surface. */
  y: number;
  /** Half-width/half-depth of this tier's square footprint (world units). */
  halfExtent: number;
  /** XZ center of this tier (world units, room-local — 0,0 is room center). */
  centerX: number;
  centerZ: number;
}

/** Overall room footprint — width and depth in world units. */
export const WATER_LAB_ROOM_SIZE = 24;

/** World Y of the animated water surface mesh (matches the dry bank height —
 *  the pool is a basin cut into the bank, not raised water). */
export const WATER_LAB_SURFACE_Y = 0;

/**
 * Returns the 4 stepped tiers of the basin, ordered from shallowest
 * (dry bank) to deepest (abyss floor). Each successively deeper tier is
 * nested (smaller footprint, centered the same) inside the previous one,
 * like a stepped pyramid dug into the ground. The abyss tier gives real
 * vertical room (3.8 WU below the deep floor, 5.0 WU below the surface) for
 * the dive mechanic (DIVE_TARGET_DEPTH = 3.0 WU, see PlayerController.ts).
 */
export function buildWaterLabTiers(): WaterLabTier[] {
  return [
    { name: 'bank',    y: 0,     halfExtent: 11, centerX: 0, centerZ: 0 },
    { name: 'shallow', y: -0.3,  halfExtent: 7,  centerX: 0, centerZ: 0 },
    { name: 'deep',    y: -1.2,  halfExtent: 4,  centerX: 0, centerZ: 0 },
    { name: 'abyss',   y: -5.0,  halfExtent: 2,  centerX: 0, centerZ: 0 },
  ];
}
