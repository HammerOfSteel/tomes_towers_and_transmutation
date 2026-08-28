/**
 * OverworldScene.chunk-collider-streaming.test.ts — regression test for
 * Task 13 final review Critical issue #1: "streamed-in chunks have zero
 * collision for their trees/rocks".
 *
 * Root cause: tree/rock colliders were only ever created once, in a loop
 * inside `enter()` that walked whatever chunks happened to already be in
 * `_terrainChunkData` at that instant (i.e. only the chunks loaded at scene
 * construction time near spawn). Any chunk streamed in afterwards — which is
 * nearly everywhere the player walks at the new 512-world default — got its
 * terrain mesh/collider and its tree/rock visual scatter, but NO tree/rock
 * colliders, so the player would walk straight through rendered trees and
 * boulders.
 *
 * Fix: collider creation moved into `_loadTerrainChunk()` itself, right
 * after `_buildChunkScatter()` returns, so every chunk gets its own
 * tree/rock colliders exactly once, at load time — regardless of whether
 * that happens during the scene's initial construction or later via
 * `_chunkManager.update()` as the player moves. `_unloadTerrainChunk()` was
 * updated to tear those colliders down again when the chunk unloads.
 *
 * This test explicitly streams in a NEW chunk that was NOT loaded at
 * `enter()` time (mirroring how the existing chunk-alignment tests in this
 * suite drive chunk loading via `_chunkManager.update()` + a
 * `flushPendingLoads()` drain) and asserts that chunk's tree/rock scatter
 * objects now have corresponding colliders tracked on its `TerrainChunkData`.
 * It must fail against the pre-fix code (where a freshly streamed-in
 * chunk's `colliders` array would be empty/absent while its scatter still
 * has tree/rock objects) and pass after the fix.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { OverworldScene } from '@/scene/OverworldScene';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { worldToChunkCoord, CHUNK_SIZE } from '@/world/ChunkManager';

const T = 2; // tile side length in world units — mirrors OverworldScene's constant.

describe('OverworldScene terrain-chunk streaming — tree/rock collider lifecycle', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;
  let scene: THREE.Scene;
  let overworld: OverworldScene;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    scene = new THREE.Scene();
    const worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();
  });

  it('a chunk streamed in AFTER enter() (not part of the initial load) gets tree/rock colliders for every tree/rock in its scatter', () => {
    // Far enough from spawn/origin that it's outside the initial load
    // radius (LOAD_RADIUS_CHUNKS=3, chunk=32 WU => initial load covers
    // roughly the first ~112 WU out from origin) but still outside the
    // tower's scatter clear-zone so trees/rocks are actually placed there.
    // Try several candidate probe points (like the sibling scatter-alignment
    // test does) since not every far-out chunk necessarily has land/trees —
    // some may land on water/beach/settlement cells with no tree/rock
    // scatter at all.
    const probes: Array<{ x: number; z: number }> = [
      { x: 400, z: 400 },
      { x: -400, z: 400 },
      { x: 400, z: -400 },
      { x: -400, z: -400 },
      { x: 400, z: 0 },
      { x: 0, z: 400 },
      { x: -400, z: 0 },
      { x: 0, z: -400 },
      { x: 350, z: 350 },
      { x: 450, z: 150 },
    ];

    let found = false;
    for (const { x: probeX, z: probeZ } of probes) {
      const requested = worldToChunkCoord(probeX, probeZ, T, CHUNK_SIZE);
      const key = `${requested.cx},${requested.cz}`;

      // Skip any probe that happens to already be loaded from construction —
      // this test specifically needs a chunk streamed in AFTER enter().
      if ((overworld as any)._terrainChunkData.has(key)) continue;

      const bodyCountBefore = physics.rapierWorld.bodies.len();

      // Mirrors how the existing chunk-alignment tests in this suite drive
      // chunk streaming: call the scene's real ChunkManager.update() with a
      // moved position, then flushPendingLoads() to synchronously drain the
      // budgeted queue (Task 13 final review Important issue #4) so the
      // requested chunk is guaranteed fully loaded by the time we assert.
      (overworld as any)._chunkManager.update(probeX, probeZ);
      (overworld as any)._chunkManager.flushPendingLoads();

      const chunkData = (overworld as any)._terrainChunkData.get(key);
      if (!chunkData) continue;

      const scatter = chunkData.scatter as THREE.Group;
      const treeRockCount = scatter.children.filter(
        (c: THREE.Object3D) => c.userData.scatterKind === 'tree' || c.userData.scatterKind === 'rock',
      ).length;
      if (treeRockCount === 0) continue; // try the next candidate

      found = true;

      const colliders = chunkData.colliders as unknown[];
      expect(colliders, 'Streamed-in chunk has no `colliders` array on its TerrainChunkData').toBeDefined();
      expect(
        colliders.length,
        `Streamed-in chunk ${key} has ${treeRockCount} trees/rocks but only ${colliders.length} colliders — every tree/rock must get its own collider`,
      ).toBe(treeRockCount);

      // The physics world itself must have gained one rigid body per
      // tree/rock (plus the chunk's own terrain trimesh body) — confirms the
      // colliders were actually registered with Rapier, not just tracked in
      // a JS array.
      const bodyCountAfter = physics.rapierWorld.bodies.len();
      expect(bodyCountAfter - bodyCountBefore).toBeGreaterThanOrEqual(treeRockCount);
      break;
    }

    expect(found, 'No streamed-in-after-enter() chunk with trees/rocks was found among the probe candidates').toBe(true);
  });
});
