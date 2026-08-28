/**
 * OverworldScene.chunk-terrain-alignment.test.ts — regression test for
 * Task 13's swim-mode regression (`.superpowers/sdd/task-13-swim-regression-report.md`).
 *
 * Root cause: `_loadTerrainChunk()` translated a `ChunkCoord` to a grid
 * `colStart`/`rowStart` via `coord.cx * CHUNK_SIZE` / `coord.cz * CHUNK_SIZE`
 * alone. `ChunkManager`'s chunk coordinates live in a 0-centered world-space
 * grid (`worldToChunkCoord()` — chunk (0,0) covers world X/Z in
 * `[0, chunkWorldSize)`), but `WorldGrid` col/row indices are centered so
 * that world (0,0) sits at grid col/row `(GHW, GHH)` (see
 * `WorldGrid.worldToGrid()`/`gridToWorld()`). Without translating through
 * that same `GHW`/`GHH` offset, a chunk's terrain mesh/collider was built
 * from the wrong grid rectangle relative to where it actually renders in
 * world space — frequently out-of-bounds default cells (flat, dry,
 * `waterDepth: 0`) instead of the real (possibly water-carved) cells at
 * that location. `_buildChunkScatter()` already applied this exact offset
 * in world units (`- GHW * T`); `_loadTerrainChunk()` did not apply its
 * grid-index equivalent.
 *
 * This surfaced as: teleporting the player into confirmed deep water
 * (`cell.waterDepth > 0`) never triggered swim mode, because the physics
 * collider actually under the player was mismatched default/flat terrain,
 * not the carved water floor — see `tests/e2e/river-lake-swim.spec.ts`.
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
import type { InputState } from '@/core/InputManager';

function neutralInput(): InputState {
  return {
    moveForward: false, moveBackward: false, moveLeft: false, moveRight: false,
    jump: false, run: false, dodge: false, interact: false,
    turnDragHeld: false,
  } as InputState;
}

const T = 2; // tile side length in world units — mirrors OverworldScene's constant.

describe('OverworldScene terrain-chunk streaming — grid/chunk coordinate alignment', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;
  let scene: THREE.Scene;
  let overworld: OverworldScene;
  let worldData: ReturnType<typeof buildWorldData>;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    scene = new THREE.Scene();
    // Fixed seed for a deterministic, reproducible water tile.
    worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();
  });

  it('the chunk covering a real water tile\'s world position is built from that same cell (not an unrelated/out-of-bounds rectangle)', () => {
    const tile = overworld.findFirstWaterTile();
    expect(tile, 'World generation produced no water tile to test against').not.toBeNull();
    const { x: wx, z: wz } = tile!;

    const cell = overworld.debugCellAt(wx, wz);
    expect(cell.waterDepth, 'Water tile unexpectedly has waterDepth 0').toBeGreaterThan(0);

    // Mirrors ChunkManager.update()'s own chunk selection for this world position.
    const requested = worldToChunkCoord(wx, wz, T, CHUNK_SIZE);
    // The scene was `enter()`ed and the ChunkManager was updated at construction
    // time centered on the player's start position (0, 5, 0) — force it to also
    // cover the water tile's chunk so we can inspect what got built there.
    (overworld as any)._chunkManager.update(wx, wz);
    const key = `${requested.cx},${requested.cz}`;
    const chunkData = (overworld as any)._terrainChunkData.get(key);
    expect(chunkData, `No terrain chunk data loaded for requested chunk ${key}`).toBeDefined();

    // The regression, checked directly against the actual built geometry
    // (not by re-deriving the fixed formula and comparing it to itself):
    // before the fix, `ChunkManager` requests a chunk on the assumption
    // that chunk (cx, cz) covers the WORLD-SPACE rectangle
    // `[cx*chunkWorldSize, (cx+1)*chunkWorldSize)` (see `worldToChunkCoord()`),
    // but `_loadTerrainChunk()` built that chunk's mesh from grid columns
    // `[cx*CHUNK_SIZE, (cx+1)*CHUNK_SIZE)` with no GHW/GHH re-centering —
    // which places the mesh's actual vertices (positioned via
    // `(col - GHW) * T` in `buildTerrainGeometryData`) roughly `GHW*T`/`GHH*T`
    // world units away from the rectangle ChunkManager assumed. So the mesh
    // "loaded" for the water tile's chunk key never actually covered the
    // water tile's real world position at all. After the fix, the chunk's
    // own geometry bounding box must contain (wx, wz).
    const geo = (chunkData as any).mesh.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(
      wx >= box.min.x && wx <= box.max.x,
      `Water tile x=${wx} outside loaded chunk mesh's x range [${box.min.x}, ${box.max.x}]`,
    ).toBe(true);
    expect(
      wz >= box.min.z && wz <= box.max.z,
      `Water tile z=${wz} outside loaded chunk mesh's z range [${box.min.z}, ${box.max.z}]`,
    ).toBe(true);
  });

  it('teleporting the player into deep water triggers real swim mode (end-to-end, mirrors river-lake-swim.spec.ts)', () => {
    // Find a water tile that's robustly surrounded by more water on all 4
    // sides (not a single-tile coastal sliver) so the KCC's small physics
    // settling drift (sub-tile horizontal jitter as it resolves the capsule
    // against the collider) can't accidentally push the test itself onto a
    // neighboring dry tile — that would be a test-selection artifact, not a
    // sign the chunk-alignment fix regressed.
    const grid = worldData.grid;
    const GHW = (grid.width - 1) / 2;
    const GHH = (grid.height - 1) / 2;
    let target: { col: number; row: number } | null = null;
    for (let row = 1; row < grid.height - 1 && !target; row++) {
      for (let col = 1; col < grid.width - 1; col++) {
        const c = grid.get(col, row);
        if (c.waterDepth <= 0) continue;
        const n = grid.get(col, row + 1), s = grid.get(col, row - 1);
        const e = grid.get(col + 1, row), w = grid.get(col - 1, row);
        if (n.waterDepth > 0 && s.waterDepth > 0 && e.waterDepth > 0 && w.waterDepth > 0) {
          target = { col, row };
          break;
        }
      }
    }
    expect(target, 'No water tile with 4 water neighbours found to test against').not.toBeNull();
    const { col, row } = target!;
    const wx = (col - GHW) * T;
    const wz = (row - GHH) * T;
    const cell = overworld.debugCellAt(wx, wz);
    expect(cell.waterDepth).toBeGreaterThan(0);

    const surfaceY = cell.elevation * 0.55 + 0.05;
    player.teleport(new THREE.Vector3(wx, surfaceY - 1.2, wz));

    const input = neutralInput();
    for (let i = 0; i < 10; i++) {
      physics.step(1 / 60);
      player.update(input, 1 / 60, 'isometric');
      overworld.update(1 / 60);
    }

    expect(player.isSwimming).toBe(true);
  });
});
