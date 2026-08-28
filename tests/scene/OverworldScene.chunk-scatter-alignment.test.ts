/**
 * OverworldScene.chunk-scatter-alignment.test.ts — regression test for
 * Task 13's scatter/terrain desync (`.superpowers/sdd/task-13-scatter-alignment-report.md`).
 *
 * Root cause: commit 4499ab3 fixed `_loadTerrainChunk()`'s grid-origin math
 * (`colStart`/`rowStart`) to apply the `Math.floor(GHW)`/`Math.floor(GHH)`
 * centering offset that `WorldGrid.worldToGrid()`/`gridToWorld()` use (see
 * `OverworldScene.chunk-terrain-alignment.test.ts`). But `_buildChunkScatter()`
 * — called immediately after `_loadTerrainChunk()` for the same `ChunkCoord`
 * to place that chunk's trees/rocks — still derived its world-space origin
 * from the OLD, unfixed formula (`coord.cx * chunkWorldSize - GHW * T`,
 * i.e. using the *fractional* `GHW`/`GHH` directly instead of their floored
 * grid-index equivalent). Before the terrain fix, both were wrong the same
 * way (self-consistent); after it, terrain moved but scatter didn't — so
 * trees/rocks (and their colliders) for a chunk landed roughly
 * `Math.floor(GHW) * T` / `Math.floor(GHH) * T` world units away from the
 * terrain mesh that should host them.
 *
 * This test asserts a loaded chunk's scatter group's tree/rock world
 * positions fall within that same chunk's terrain mesh bounding box —
 * it fails against the pre-fix `_buildChunkScatter()` formula and passes
 * once both derive their origin from the same grid-origin helper.
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

describe('OverworldScene terrain-chunk streaming — scatter/terrain alignment', () => {
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

  it('a loaded chunk\'s scattered trees/rocks sit within that chunk\'s own terrain mesh bounding box', () => {
    // Exercise several chunks (not just the origin/spawn chunk) so a
    // coincidental alignment at (0,0) can't mask the bug.
    // Kept well outside the tower's clear-zone radius (`FR * T`, ~144 world
    // units for the default 512 worldSize config) so scatter isn't skipped
    // by the tower proximity check in `_buildChunkScatter()` — that would
    // make the test pass vacuously instead of exercising the fix.
    const probes: Array<{ x: number; z: number }> = [
      { x: 200, z: 200 },
      { x: -200, z: 200 },
      { x: 200, z: -200 },
      { x: -260, z: -180 },
      { x: 300, z: 0 },
    ];

    let checkedAnyScatterObject = false;

    for (const { x, z } of probes) {
      const requested = worldToChunkCoord(x, z, T, CHUNK_SIZE);
      (overworld as any)._chunkManager.update(x, z);
      const key = `${requested.cx},${requested.cz}`;
      const chunkData = (overworld as any)._terrainChunkData.get(key);
      expect(chunkData, `No terrain chunk data loaded for requested chunk ${key}`).toBeDefined();

      const mesh = (chunkData as any).mesh as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;

      const scatter = (chunkData as any).scatter as THREE.Group;
      for (const child of scatter.children) {
        checkedAnyScatterObject = true;
        const { x: sx, z: sz } = child.position;
        expect(
          sx >= box.min.x && sx <= box.max.x,
          `Chunk ${key} scatter object x=${sx} outside its own terrain mesh x range [${box.min.x}, ${box.max.x}]`,
        ).toBe(true);
        expect(
          sz >= box.min.z && sz <= box.max.z,
          `Chunk ${key} scatter object z=${sz} outside its own terrain mesh z range [${box.min.z}, ${box.max.z}]`,
        ).toBe(true);
      }
    }

    expect(checkedAnyScatterObject, 'No scatter objects were placed in any probed chunk to test against').toBe(true);
  });
});
