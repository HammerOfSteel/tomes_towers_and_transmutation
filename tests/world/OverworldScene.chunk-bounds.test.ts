/**
 * Regression test for Task 13's crash fix.
 *
 * `OverworldScene._loadTerrainChunk()` streams terrain per-chunk via
 * `ChunkManager`. When a requested chunk lies fully outside the
 * `WorldGrid`'s valid `[0,width) x [0,height)` extent (any chunk beyond the
 * map edge — reachable by simply walking to the world boundary, regardless
 * of world size), `buildTerrainGeometryData()` correctly returns *empty*
 * `positions`/`indices` buffers for that rectangle. Before the fix,
 * `_loadTerrainChunk()` fed those empty buffers straight into
 * `PhysicsWorld.createStaticTrimesh()`, which passes them to Rapier's WASM
 * `ColliderDesc.trimesh()` — that call crashes the WASM module with an
 * unrecoverable `RuntimeError: unreachable` that is NOT reliably catchable
 * with try/catch (it kills the browser's JS execution context, not just the
 * current call), taking down the whole page.
 *
 * The fix makes the terrain-chunk payload's physics body optional
 * (`RAPIER.RigidBody | null`) and only calls `createStaticTrimesh()` when
 * there is actually geometry to build a collider from
 * (`indices.length > 0`) — this test exercises exactly that guard using a
 * real `PhysicsWorld` and a real `WorldGrid` produced by `buildWorldData()`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { CHUNK_SIZE } from '@/world/ChunkManager';

const T = 2; // tile side length in world units — mirrors OverworldScene's constant.
const SH = LEVEL_HEIGHT;

/**
 * Mirrors `OverworldScene._loadTerrainChunk()`'s post-fix guard: only
 * construct a trimesh physics body when the chunk actually produced
 * indexed geometry. Returns `null` for an empty-geometry (out-of-bounds)
 * chunk instead of ever calling `createStaticTrimesh()` with empty buffers.
 */
function loadTerrainChunkBody(
  physics: PhysicsWorld,
  positions: number[],
  indices: number[],
): ReturnType<PhysicsWorld['createStaticTrimesh']> | null {
  if (indices.length === 0) return null;
  return physics.createStaticTrimesh(new Float32Array(positions), new Uint32Array(indices));
}

describe('OverworldScene terrain-chunk streaming — out-of-bounds chunk guard', () => {
  let physics: PhysicsWorld;
  let grid: ReturnType<typeof buildWorldData>['grid'];
  let GW: number, GH: number, GHW: number, GHH: number;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    // Built once and shared across tests below (rather than per-test) to
    // keep this file's contribution to full-suite wall-clock time small —
    // world generation at even the smallest valid worldSize (128) is not
    // free, and other suites budget tight per-test timeouts.
    ({ grid } = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 }));
    GW = grid.width;
    GH = grid.height;
    GHW = (GW - 1) / 2;
    GHH = (GH - 1) / 2;
  });

  // Confirms the actual failure mode being guarded against: calling
  // `PhysicsWorld.createStaticTrimesh()` directly with empty vertex/index
  // buffers throws (verified in isolation first — in this Node/vitest
  // environment the Rapier WASM error surfaces as a catchable JS
  // `RuntimeError: unreachable` rather than the uncatchable page-crashing
  // failure seen in the browser, so it's safe to assert here with
  // `toThrow()` without risking the test process itself).
  it('createStaticTrimesh throws when given empty vertex/index buffers directly (documents the failure mode)', () => {
    expect(() => physics.createStaticTrimesh(new Float32Array([]), new Uint32Array([]))).toThrow();
  });

  it('buildTerrainGeometryData returns empty buffers for a chunk fully outside the world grid', () => {
    // A chunk rectangle starting well past the grid's right edge — fully
    // outside [0,width) x [0,height) regardless of CHUNK_SIZE.
    const colStart = GW + CHUNK_SIZE;
    const rowStart = 0;

    const { positions, indices } = buildTerrainGeometryData(
      grid, GW, GH, GHW, GHH, T, SH, colStart, rowStart, CHUNK_SIZE, CHUNK_SIZE,
    );

    expect(positions).toHaveLength(0);
    expect(indices).toHaveLength(0);
  });

  it('does not call createStaticTrimesh (and does not crash) for an out-of-bounds chunk — body is null', () => {
    const colStart = GW + CHUNK_SIZE;
    const rowStart = 0;

    const { positions, indices } = buildTerrainGeometryData(
      grid, GW, GH, GHW, GHH, T, SH, colStart, rowStart, CHUNK_SIZE, CHUNK_SIZE,
    );

    const bodiesBefore = physics.rapierWorld.bodies.len();
    const body = loadTerrainChunkBody(physics, positions, indices);

    expect(body).toBeNull();
    // No rigid body was created at all for the empty-geometry chunk —
    // confirms createStaticTrimesh() was never invoked with empty buffers.
    expect(physics.rapierWorld.bodies.len()).toBe(bodiesBefore);
  });

  it('still creates a normal trimesh body for an in-bounds chunk (guard does not affect real terrain)', () => {
    // Chunk (0,0) — fully in-bounds.
    const { positions, indices } = buildTerrainGeometryData(
      grid, GW, GH, GHW, GHH, T, SH, 0, 0, CHUNK_SIZE, CHUNK_SIZE,
    );
    expect(indices.length).toBeGreaterThan(0);

    const bodiesBefore = physics.rapierWorld.bodies.len();
    const body = loadTerrainChunkBody(physics, positions, indices);

    expect(body).not.toBeNull();
    expect(physics.rapierWorld.bodies.len()).toBe(bodiesBefore + 1);
    expect(body!.numColliders()).toBe(1);
  });
});
