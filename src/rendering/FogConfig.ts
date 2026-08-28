/**
 * FogConfig.ts — Task 13 final review (Important issue #2).
 *
 * `main.ts`'s telescope-mode remote-view fog (`enterTelescopeMode()`) used
 * to be a hardcoded `new THREE.Fog(0x4a6888, 200, 800)` — reaching full
 * opacity only at 800 world units. But `OverworldScene`'s chunk streaming
 * (`ChunkManager`) unloads terrain (and everything chunk-scoped alongside
 * it — trees, rocks, per-chunk bush/beach clutter) once it falls beyond
 * `UNLOAD_RADIUS_CHUNKS` chunks from the player, which is only
 * `UNLOAD_RADIUS_CHUNKS * CHUNK_SIZE * TILE_SIZE_WU` world units away
 * (~160 WU). Distant whole-world (unchunked) props — buildings, ruins,
 * roads — sit well inside 800 WU but well outside 160 WU, so they used to
 * render clearly, floating over open ocean/void where terrain had already
 * streamed out from underneath them.
 *
 * `TELESCOPE_FOG_FAR` is derived directly from `ChunkManager`'s
 * `UNLOAD_RADIUS_CHUNKS`/`CHUNK_SIZE` constants (not a separately
 * maintained literal) specifically so the two can't silently drift apart
 * again — see the regression test in
 * `tests/rendering/FogConfig.test.ts`.
 */
import { UNLOAD_RADIUS_CHUNKS, CHUNK_SIZE } from '@/world/ChunkManager';

/** World units per tile in the overworld — mirrors `OverworldScene`'s `T`
 *  constant. Not imported directly to avoid a rendering→scene dependency
 *  for what is otherwise a small, pure numeric relationship; if that
 *  constant ever changes, this must be updated too (the regression test
 *  below only guards the ChunkManager-derived half of the relationship). */
const TILE_SIZE_WU = 2;

/** World-unit distance at which terrain chunks unload (approx.) — the same
 *  quantity `ChunkManager`'s own doc comment describes. */
export const CHUNK_UNLOAD_DISTANCE_WU = UNLOAD_RADIUS_CHUNKS * CHUNK_SIZE * TILE_SIZE_WU;

/** Telescope remote-view fog start — leaves room for a gradual fade-in
 *  before the far/unload boundary rather than an abrupt wall. */
export const TELESCOPE_FOG_NEAR = Math.round(CHUNK_UNLOAD_DISTANCE_WU * 0.5);

/** Telescope remote-view fog end — at/just past the terrain unload
 *  distance, so terrain finishes fading into fog at roughly the same place
 *  it actually disappears, instead of popping out of a still-clear view. */
export const TELESCOPE_FOG_FAR = Math.round(CHUNK_UNLOAD_DISTANCE_WU * 1.25);
