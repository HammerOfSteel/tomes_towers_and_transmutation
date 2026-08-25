/**
 * WaterDepthConfig.ts — shared constants + math for carving physical water
 * depth into the overworld's stepped terrain (RI-3 unblock, see
 * TODO/02-game-world-integration/realm-integration.md).
 *
 * `WorldCell.elevation` stays the *logical* land height (used by
 * DungeonPlacer, SettlementPlacer, minimap, rim-bias post-processing, etc.)
 * — untouched by this module. `waterDepth` is a separate physical-carve
 * overlay: `physicalHeightWU()` is the single source of truth both
 * `TerrainGeometryBuilder` (mesh + Rapier collider) and `WaterDetection`
 * (swim surface/floor query) call, so the rendered/collided terrain and the
 * gameplay swim query can never disagree.
 */
import type { WorldCell } from './WorldGrid';

/** World-unit height increment per elevation level (moved out of
 *  OverworldScene's local `SH` const so WaterDetection/TerrainGeometryBuilder
 *  can share the exact same value). */
export const LEVEL_HEIGHT = 0.55;

/** Carved depth (world units) for river tiles.
 *
 *  Tuned (not the original 1.0 WU design-doc placeholder) via manual
 *  playtest verification: with the player capsule's rest-on-floor offset
 *  (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS = 0.85 WU, see PlayerController.ts)
 *  and SWIM_ENTER_DEPTH_THRESHOLD = 0.9, a standing player's depth-below-
 *  surface while resting on the carved floor is `waterDepth - 0.85`. Depths
 *  at or below ~1.75 WU therefore only ever reach "wading" (setSubmersion),
 *  never real swim mode, no matter how long the player stands there — which
 *  contradicts this task's explicit goal ("walking into a river ... should
 *  transition into real swim state", not just a deeper wade). 2.0 WU gives
 *  a standing depth of 1.15, comfortably past the enter threshold. */
export const RIVER_DEPTH_WU = 2.0;

/** Carved depth (world units) for ocean-rim water-biome tiles — deeper than
 *  rivers since the ocean is the world's deepest water body. Same tuning
 *  rationale as RIVER_DEPTH_WU above; 2.5 WU keeps a visible margin over the
 *  river depth so the ocean still reads as the deeper body. */
export const OCEAN_DEPTH_WU = 2.5;

/**
 * Physical (carved) height of a tile in world units: the logical elevation
 * converted to world units, minus any carved water depth. Dry tiles and
 * fords (`waterDepth === 0`) return the same height as their logical
 * elevation — i.e. no carving.
 *
 * `levelHeight` defaults to `LEVEL_HEIGHT` (the live overworld's real
 * per-level height) but can be overridden — `TerrainGeometryBuilder` passes
 * through its own `SH` parameter so tests can use simplified values (e.g. 1)
 * without this module silently reintroducing the production constant.
 */
export function physicalHeightWU(
  cell: Pick<WorldCell, 'elevation' | 'waterDepth'>,
  levelHeight: number = LEVEL_HEIGHT,
): number {
  return cell.elevation * levelHeight - cell.waterDepth;
}
