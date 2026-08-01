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

/** Loaded chunks beyond this Chebyshev radius of the player should be unloaded. */
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

  constructor(
    private readonly handlers: ChunkHandlers<T>,
    options: ChunkManagerOptions = {},
  ) {
    this.tileSize     = options.tileSize     ?? 4;
    this.chunkSize    = options.chunkSize    ?? CHUNK_SIZE;
    this.loadRadius   = options.loadRadius   ?? LOAD_RADIUS_CHUNKS;
    this.unloadRadius = options.unloadRadius ?? UNLOAD_RADIUS_CHUNKS;

    if (this.unloadRadius < this.loadRadius) {
      throw new Error('ChunkManager: unloadRadius must be >= loadRadius (otherwise chunks would unload immediately after loading)');
    }
  }

  get loadedChunkCount(): number {
    return this.loaded.size;
  }

  isLoaded(coord: ChunkCoord): boolean {
    return this.loaded.has(chunkKey(coord));
  }

  getLoadedChunks(): ChunkCoord[] {
    return [...this.loaded.keys()].map(chunkKeyToCoord);
  }

  /**
   * Recompute which chunks should be loaded/unloaded given the player's
   * current world position. Idempotent — calling this repeatedly with the
   * same position loads/unloads nothing further.
   */
  update(playerWorldX: number, playerWorldZ: number): ChunkUpdateResult {
    const center = worldToChunkCoord(playerWorldX, playerWorldZ, this.tileSize, this.chunkSize);
    const result: ChunkUpdateResult = { loaded: [], unloaded: [] };

    for (const coord of chunksWithinRadius(center, this.loadRadius)) {
      const key = chunkKey(coord);
      if (this.loaded.has(key)) continue;
      this.loaded.set(key, this.handlers.load(coord));
      result.loaded.push(coord);
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

  /** Unload every currently-loaded chunk (e.g. on scene teardown). */
  dispose(): void {
    for (const [key, data] of this.loaded) {
      this.handlers.unload(chunkKeyToCoord(key), data);
    }
    this.loaded.clear();
  }
}
