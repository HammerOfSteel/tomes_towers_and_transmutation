/**
 * FogConfig.test.ts — regression test for Task 13's final review (Important
 * issue #2): telescope-mode remote-view fog distance must stay in
 * relationship with `ChunkManager`'s terrain unload radius, so terrain
 * fades into fog before it disappears instead of visibly popping out of a
 * still-clear view. Fails if either constant is changed in a way that lets
 * the fog's far distance drift far past the unload distance again.
 */
import { describe, it, expect } from 'vitest';
import { UNLOAD_RADIUS_CHUNKS, CHUNK_SIZE } from '@/world/ChunkManager';
import { CHUNK_UNLOAD_DISTANCE_WU, TELESCOPE_FOG_NEAR, TELESCOPE_FOG_FAR } from '@/rendering/FogConfig';

describe('FogConfig — telescope fog distance vs. chunk unload radius', () => {
  it('CHUNK_UNLOAD_DISTANCE_WU is derived from the live ChunkManager constants', () => {
    const tileSize = 2; // mirrors OverworldScene's T
    expect(CHUNK_UNLOAD_DISTANCE_WU).toBe(UNLOAD_RADIUS_CHUNKS * CHUNK_SIZE * tileSize);
  });

  it('fog near < far (a valid THREE.Fog range)', () => {
    expect(TELESCOPE_FOG_NEAR).toBeLessThan(TELESCOPE_FOG_FAR);
  });

  it('fog reaches full opacity at or shortly beyond the terrain unload distance, not far past it', () => {
    // The old, pre-fix value (800) was ~5x the unload distance (~160) — a
    // hardcoded literal that had visibly drifted. Guard against a similar
    // drift: far distance must stay within a small multiple of the unload
    // distance (comfortably enough for a gradual fade, not a hard cliff).
    expect(TELESCOPE_FOG_FAR).toBeGreaterThanOrEqual(CHUNK_UNLOAD_DISTANCE_WU);
    expect(TELESCOPE_FOG_FAR).toBeLessThanOrEqual(CHUNK_UNLOAD_DISTANCE_WU * 1.5);
  });

  it('regression: matches the previously reported broken relationship (800 vs ~160) no longer holding', () => {
    // Before the fix: far (800) vs. unload distance produced a ratio of 5x.
    // After the fix, that ratio must be much tighter.
    const ratio = TELESCOPE_FOG_FAR / CHUNK_UNLOAD_DISTANCE_WU;
    expect(ratio).toBeLessThan(2);
  });
});
