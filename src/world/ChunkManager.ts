/**
 * ChunkManager.ts — 02-game-world-integration (RI-4)
 *
 * Generic chunk load/unload tracker: divides the world into fixed-size
 * chunks, and given the player's world position decides which chunks should
 * be loaded (within `loadRadius` chunks) and which loaded chunks should now
 * be unloaded (beyond `unloadRadius` chunks). Chunk membership uses
 * Chebyshev (square) distance — the common "render distance" convention —
 * so `chunksWithinRadius(center, r)` always yields exactly `(2r + 1)^2`
 * chunks.
 *
 * Deliberately generic over the loaded chunk payload type `T` and takes
 * `load`/`unload` as injected callbacks, so:
 *   - It has zero THREE.js/DOM dependency and is fully unit-testable with
 *     plain mock handlers (see `tests/world/ChunkManager.test.ts`).
 *   - It isn't tied to terrain specifically — the same manager can drive
 *     terrain-tile chunks (via `RealmToTerrain.ts` + `TileBuilder.ts`),
 *     prop/decoration chunks, or anything else that's spatially streamed.
 *
 * Wiring this into `OverworldScene.ts` (build a `THREE.Group` of
 * `buildTile()` instances per chunk on `load`, `scene.remove` + dispose on
 * `unload`, call `update(player.x, player.z)` from the scene's tick) is the
 * remaining integration step — left as a follow-up once there's an actual
 * terrain renderer to wire it into.
 */

/** Tile-grid size (in tiles) of one chunk edge. */
export const CHUNK_SIZE = 16;

/** Chunks within this Chebyshev radius of the player should be loaded. */
export const LOAD_RADIUS_CHUNKS = 3;

/**
 * Loaded chunks beyond this Chebyshev radius of the player should be
 * unloaded. Terrain (and everything chunk-streamed alongside it — see
 * `OverworldScene._buildChunkScatter()`) visually disappears at roughly
 * `UNLOAD_RADIUS_CHUNKS * CHUNK_SIZE * <tileSize>` world units from the
 * player (~160 WU with the overworld's tileSize=2). Task 13's final review
 * (Important issue #2) flagged that the *telescope-mode* remote-view fog
 * distance in `main.ts` (`enterTelescopeMode()`) used to reach full opacity
 * at 800 WU — far past this unload radius — so terrain visibly popped out
 * of existence in full view instead of fading into fog first. That fog
 * distance now derives from these two constants (see
 * `src/rendering/FogConfig.ts`'s `TELESCOPE_FOG_FAR`) specifically so the
 * two can't silently drift apart again — if you change
 * `UNLOAD_RADIUS_CHUNKS` (or `CHUNK_SIZE`), `TELESCOPE_FOG_FAR` moves with
 * it automatically; you only need to revisit `FogConfig.ts` if the
 * *tileSize* assumption baked into it (2 WU/tile, matching
 * `OverworldScene`'s `T` constant) ever changes.
 */
export const UNLOAD_RADIUS_CHUNKS = 5;

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

export function chunkKeyToCoord(key: string): ChunkCoord {
  const [cx, cz] = key.split(',').map(Number);
  return { cx: cx!, cz: cz! };
}

/** Chebyshev (square/"chessboard") distance between two chunk coordinates. */
export function chunkDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}

/** World (x, z) → the chunk coordinate containing it. */
export function worldToChunkCoord(
  worldX: number,
  worldZ: number,
  tileSize: number,
  chunkSize: number = CHUNK_SIZE,
): ChunkCoord {
  const chunkWorldSize = tileSize * chunkSize;
  return {
    cx: Math.floor(worldX / chunkWorldSize),
    cz: Math.floor(worldZ / chunkWorldSize),
  };
}

/** All chunk coordinates within Chebyshev `radius` of `center` (inclusive), `(2*radius+1)^2` of them. */
export function chunksWithinRadius(center: ChunkCoord, radius: number): ChunkCoord[] {
  const result: ChunkCoord[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      result.push({ cx: center.cx + dx, cz: center.cz + dz });
    }
  }
  return result;
}

export interface ChunkHandlers<T> {
  /** Called once per newly-in-range chunk — return whatever payload represents the loaded chunk (e.g. a `THREE.Group`). */
  load(coord: ChunkCoord): T;
  /** Called once per chunk that just fell outside `unloadRadius` — release its resources. */
  unload(coord: ChunkCoord, data: T): void;
}

export interface ChunkManagerOptions {
  tileSize?: number;
  chunkSize?: number;
  loadRadius?: number;
  unloadRadius?: number;
  /**
   * Caps how many NEW chunk loads a single `update()` call will actually
   * execute (Task 13 final review, Important issue #4). Crossing one chunk
   * boundary can bring up to `2*loadRadius+1` newly-in-range chunks at once
   * (a full edge), and a diagonal crossing can bring in a full corner — with
   * an expensive `handlers.load()` (geometry + physics trimesh + Poisson
   * scatter) that's a guaranteed synchronous frame hitch. When set, any
   * newly-in-range chunks beyond this per-call budget are queued and drained
   * by later `update()` calls instead of loaded immediately — see
   * `flushPendingLoads()` to force the whole queue synchronously when that's
   * actually required (e.g. an initial spawn load, or a test written against
   * the pre-budgeting synchronous contract). Undefined (default) = unlimited,
   * i.e. the original synchronous-in-one-call behavior every existing
   * caller/test relies on.
   */
  maxLoadsPerUpdate?: number;
}

export interface ChunkUpdateResult {
  loaded: ChunkCoord[];
  unloaded: ChunkCoord[];
}

/**
 * RI-4 — tracks which chunks are currently loaded and streams them in/out
 * as the player moves. Call `update(playerWorldX, playerWorldZ)` whenever
 * the player's position changes (e.g. once per frame, or throttled to only
 * when they cross a chunk boundary).
 */
export class ChunkManager<T> {
  private readonly loaded = new Map<string, T>();
  private readonly tileSize: number;
  private readonly chunkSize: number;
  private readonly loadRadius: number;
  private readonly unloadRadius: number;
  private readonly maxLoadsPerUpdate: number;
  /** Chunks that are in-range but haven't been loaded yet because a prior
   *  `update()` call hit its `maxLoadsPerUpdate` budget — drained a few at a
   *  time by subsequent `update()` calls, or all at once by
   *  `flushPendingLoads()`. FIFO order (oldest request first). */
  private readonly pendingLoadQueue: ChunkCoord[] = [];
  private readonly pendingLoadKeys = new Set<string>();

  constructor(
    private readonly handlers: ChunkHandlers<T>,
    options: ChunkManagerOptions = {},
  ) {
    this.tileSize     = options.tileSize     ?? 4;
    this.chunkSize    = options.chunkSize    ?? CHUNK_SIZE;
    this.loadRadius   = options.loadRadius   ?? LOAD_RADIUS_CHUNKS;
    this.unloadRadius = options.unloadRadius ?? UNLOAD_RADIUS_CHUNKS;
    this.maxLoadsPerUpdate = options.maxLoadsPerUpdate ?? Infinity;

    if (this.unloadRadius < this.loadRadius) {
      throw new Error('ChunkManager: unloadRadius must be >= loadRadius (otherwise chunks would unload immediately after loading)');
    }
  }

  get loadedChunkCount(): number {
    return this.loaded.size;
  }

  /** Number of in-range chunks queued but not yet loaded (budgeted by `maxLoadsPerUpdate`). */
  get pendingLoadCount(): number {
    return this.pendingLoadQueue.length;
  }

  isLoaded(coord: ChunkCoord): boolean {
    return this.loaded.has(chunkKey(coord));
  }

  getLoadedChunks(): ChunkCoord[] {
    return [...this.loaded.keys()].map(chunkKeyToCoord);
  }

  private loadOne(coord: ChunkCoord, result: ChunkCoord[]): void {
    const key = chunkKey(coord);
    this.pendingLoadKeys.delete(key);
    if (this.loaded.has(key)) return; // already loaded via some other path — stay safe
    this.loaded.set(key, this.handlers.load(coord));
    result.push(coord);
  }

  /**
   * Recompute which chunks should be loaded/unloaded given the player's
   * current world position. Idempotent — calling this repeatedly with the
   * same position loads/unloads nothing further.
   *
   * Newly-in-range chunks are enqueued and drained up to `maxLoadsPerUpdate`
   * per call (default unlimited, i.e. every newly-in-range chunk loads
   * synchronously within this single call — the original behavior). Unloads
   * are always applied immediately/unbounded — they're cheap (dispose +
   * remove body) relative to a load (geometry + trimesh + scatter), so there
   * was no evidence budgeting them was necessary.
   */
  update(playerWorldX: number, playerWorldZ: number): ChunkUpdateResult {
    const center = worldToChunkCoord(playerWorldX, playerWorldZ, this.tileSize, this.chunkSize);
    const result: ChunkUpdateResult = { loaded: [], unloaded: [] };

    for (const coord of chunksWithinRadius(center, this.loadRadius)) {
      const key = chunkKey(coord);
      if (this.loaded.has(key) || this.pendingLoadKeys.has(key)) continue;
      this.pendingLoadQueue.push(coord);
      this.pendingLoadKeys.add(key);
    }

    // Drop any still-pending loads that fell out of unload range (e.g. the
    // player moved away quickly since they were queued) BEFORE draining —
    // otherwise a budgeted drain could spend this call's whole budget on
    // stale requests queued for a since-abandoned position instead of the
    // chunks actually near the player right now.
    for (let i = this.pendingLoadQueue.length - 1; i >= 0; i--) {
      const coord = this.pendingLoadQueue[i]!;
      if (chunkDistance(coord, center) > this.unloadRadius) {
        this.pendingLoadKeys.delete(chunkKey(coord));
        this.pendingLoadQueue.splice(i, 1);
      }
    }

    let drained = 0;
    while (this.pendingLoadQueue.length > 0 && drained < this.maxLoadsPerUpdate) {
      this.loadOne(this.pendingLoadQueue.shift()!, result.loaded);
      drained++;
    }

    for (const [key, data] of [...this.loaded.entries()]) {
      const coord = chunkKeyToCoord(key);
      if (chunkDistance(coord, center) <= this.unloadRadius) continue;
      this.handlers.unload(coord, data);
      this.loaded.delete(key);
      result.unloaded.push(coord);
    }

    return result;
  }

  /**
   * Immediately load every currently-queued pending chunk, ignoring
   * `maxLoadsPerUpdate`. For callers that need a synchronous "everything
   * currently in range is now actually loaded" guarantee right after a
   * single `update()` call — e.g. an initial spawn-centered load (so the
   * world isn't empty for the first frame) or tests written against the
   * pre-budgeting synchronous contract.
   */
  flushPendingLoads(): ChunkCoord[] {
    const flushed: ChunkCoord[] = [];
    while (this.pendingLoadQueue.length > 0) {
      this.loadOne(this.pendingLoadQueue.shift()!, flushed);
    }
    return flushed;
  }

  /** Unload every currently-loaded chunk (e.g. on scene teardown). */
  dispose(): void {
    this.pendingLoadQueue.length = 0;
    this.pendingLoadKeys.clear();
    for (const [key, data] of this.loaded) {
      this.handlers.unload(chunkKeyToCoord(key), data);
    }
    this.loaded.clear();
  }
}
