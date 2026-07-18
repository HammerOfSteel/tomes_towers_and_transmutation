/**
 * WorldData — top-level container that holds everything generated for a world:
 * the procedural config, the per-tile data grid, and all placed entity lists.
 *
 * Entity lists (dungeons, settlements, buildings) are populated by their
 * respective placement passes in WorldDataBuilder.  New phases add more lists
 * here without touching callers that only need the existing fields.
 */
export {};
