/**
 * ChunkManager.test.ts — 02-game-world-integration (RI-4)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ChunkManager, chunkKey, chunkKeyToCoord, chunkDistance,
  worldToChunkCoord, chunksWithinRadius,
  CHUNK_SIZE, LOAD_RADIUS_CHUNKS,
  type ChunkCoord, type ChunkHandlers,
} from '@/world/ChunkManager';

describe('chunkKey / chunkKeyToCoord', () => {
  it('round-trips a coordinate through key encoding', () => {
    const coord: ChunkCoord = { cx: -3, cz: 7 };
    expect(chunkKeyToCoord(chunkKey(coord))).toEqual(coord);
  });
});

describe('chunkDistance', () => {
  it('is Chebyshev (max of the two axis deltas)', () => {
    expect(chunkDistance({ cx: 0, cz: 0 }, { cx: 3, cz: 1 })).toBe(3);
    expect(chunkDistance({ cx: 0, cz: 0 }, { cx: 1, cz: 5 })).toBe(5);
    expect(chunkDistance({ cx: 2, cz: 2 }, { cx: 2, cz: 2 })).toBe(0);
  });
});

describe('worldToChunkCoord', () => {
  it('maps world position to the containing chunk using tileSize * chunkSize', () => {
    const tileSize = 4;
    const chunkWorldSize = tileSize * CHUNK_SIZE; // 64
    expect(worldToChunkCoord(0, 0, tileSize)).toEqual({ cx: 0, cz: 0 });
    expect(worldToChunkCoord(chunkWorldSize - 1, 0, tileSize)).toEqual({ cx: 0, cz: 0 });
    expect(worldToChunkCoord(chunkWorldSize, 0, tileSize)).toEqual({ cx: 1, cz: 0 });
    expect(worldToChunkCoord(-1, 0, tileSize)).toEqual({ cx: -1, cz: 0 });
  });
});

describe('chunksWithinRadius', () => {
  it('returns (2r+1)^2 chunks including the center', () => {
    for (const r of [0, 1, 2, 3]) {
      const chunks = chunksWithinRadius({ cx: 5, cz: 5 }, r);
      expect(chunks).toHaveLength((2 * r + 1) ** 2);
      expect(chunks).toContainEqual({ cx: 5, cz: 5 });
    }
  });

  it('every returned chunk is within the Chebyshev radius of center', () => {
    const center = { cx: 0, cz: 0 };
    for (const c of chunksWithinRadius(center, 2)) {
      expect(chunkDistance(center, c)).toBeLessThanOrEqual(2);
    }
  });
});

function mockHandlers(): ChunkHandlers<string> & { load: ReturnType<typeof vi.fn>; unload: ReturnType<typeof vi.fn> } {
  return {
    load: vi.fn((coord: ChunkCoord) => chunkKey(coord)),
    unload: vi.fn(),
  };
}

describe('ChunkManager', () => {
  it('rejects unloadRadius < loadRadius at construction', () => {
    expect(() => new ChunkManager(mockHandlers(), { loadRadius: 5, unloadRadius: 2 })).toThrow();
  });

  it('loads all chunks within loadRadius on first update, none pre-loaded', () => {
    const handlers = mockHandlers();
    const mgr = new ChunkManager(handlers, { tileSize: 4, loadRadius: 2, unloadRadius: 4 });

    const result = mgr.update(0, 0);
    expect(result.loaded).toHaveLength((2 * 2 + 1) ** 2);
    expect(result.unloaded).toHaveLength(0);
    expect(mgr.loadedChunkCount).toBe(25);
    expect(handlers.load).toHaveBeenCalledTimes(25);
  });

  it('is idempotent — a second update at the same position loads/unloads nothing new', () => {
    const handlers = mockHandlers();
    const mgr = new ChunkManager(handlers, { tileSize: 4, loadRadius: 1, unloadRadius: 3 });

    mgr.update(0, 0);
    handlers.load.mockClear();
    handlers.unload.mockClear();

    const result = mgr.update(0, 0);
    expect(result.loaded).toHaveLength(0);
    expect(result.unloaded).toHaveLength(0);
    expect(handlers.load).not.toHaveBeenCalled();
    expect(handlers.unload).not.toHaveBeenCalled();
  });

  it('loads newly-in-range chunks and leaves already-loaded ones alone as the player moves a little', () => {
    const handlers = mockHandlers();
    const tileSize = 4;
    const chunkWorldSize = tileSize * CHUNK_SIZE;
    const mgr = new ChunkManager(handlers, { tileSize, loadRadius: 1, unloadRadius: 3 });

    mgr.update(0, 0); // loads the 3x3 block around chunk (0,0)
    const loadedAfterFirst = mgr.loadedChunkCount;

    handlers.load.mockClear();
    mgr.update(chunkWorldSize, 0); // move one full chunk east → center becomes (1,0)

    // Some chunks should be newly loaded (the new east edge), some already loaded and skipped.
    expect(handlers.load).toHaveBeenCalled();
    expect(mgr.loadedChunkCount).toBeGreaterThanOrEqual(loadedAfterFirst);
    expect(mgr.isLoaded({ cx: 1, cz: 0 })).toBe(true);
  });

  it('unloads chunks once they fall beyond unloadRadius', () => {
    const handlers = mockHandlers();
    const tileSize = 4;
    const chunkWorldSize = tileSize * CHUNK_SIZE;
    const mgr = new ChunkManager(handlers, { tileSize, loadRadius: 1, unloadRadius: 2 });

    mgr.update(0, 0); // loads around chunk (0,0)
    expect(mgr.isLoaded({ cx: 0, cz: 0 })).toBe(true);

    // Jump far away — chunk (0,0) is now way beyond unloadRadius of 2.
    mgr.update(chunkWorldSize * 10, 0);

    expect(mgr.isLoaded({ cx: 0, cz: 0 })).toBe(false);
    expect(handlers.unload).toHaveBeenCalledWith({ cx: 0, cz: 0 }, chunkKey({ cx: 0, cz: 0 }));
  });

  it('keeps chunks loaded while within unloadRadius even if outside loadRadius', () => {
    const handlers = mockHandlers();
    const tileSize = 4;
    const chunkWorldSize = tileSize * CHUNK_SIZE;
    // loadRadius 1 (3x3), unloadRadius 3 — chunks between radius 2-3 stay loaded once loaded.
    const mgr = new ChunkManager(handlers, { tileSize, loadRadius: 1, unloadRadius: 3 });

    mgr.update(0, 0);
    expect(mgr.isLoaded({ cx: 0, cz: 0 })).toBe(true);

    // Move 2 chunks east: center becomes (2,0). Chunk (0,0) is now distance 2 from
    // center — outside the new loadRadius (1) but within unloadRadius (3), so it survives.
    mgr.update(chunkWorldSize * 2, 0);
    expect(mgr.isLoaded({ cx: 0, cz: 0 })).toBe(true);
  });

  it('dispose() unloads every currently-loaded chunk', () => {
    const handlers = mockHandlers();
    const mgr = new ChunkManager(handlers, { tileSize: 4, loadRadius: 1, unloadRadius: 2 });
    mgr.update(0, 0);
    const countBeforeDispose = mgr.loadedChunkCount;

    mgr.dispose();

    expect(mgr.loadedChunkCount).toBe(0);
    expect(handlers.unload).toHaveBeenCalledTimes(countBeforeDispose);
  });

  it('defaults match the documented RI-4 constants', () => {
    const handlers = mockHandlers();
    const mgr = new ChunkManager(handlers, { tileSize: 4 });
    const result = mgr.update(0, 0);
    expect(result.loaded).toHaveLength((2 * LOAD_RADIUS_CHUNKS + 1) ** 2);
  });
});
