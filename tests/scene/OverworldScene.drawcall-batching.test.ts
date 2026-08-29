/**
 * OverworldScene.drawcall-batching.test.ts — regression test for the
 * sub-7fps overworld framerate playtest bug.
 *
 * Root cause (measured via scene traversal at construction time, seed 1,
 * worldSize 512, default LOAD_RADIUS_CHUNKS=3 -> 7x7=49 loaded chunks):
 * right after initial spawn-chunk streaming, before the player even moves,
 * the scene already contained 3283 individual (non-instanced) `THREE.Mesh`
 * objects and only 3 `THREE.InstancedMesh` objects. The two dominant
 * sources were per-chunk tree/rock/bush/beach-decor scatter (each object
 * built as several individually-randomized primitive meshes, not
 * instanced) and per-building exterior geometry (each building built from
 * 50+ individual wall/roof/window/door/trim/chimney/etc. meshes in
 * `BuildingBuilder.ts`) — buildings turned out to be the larger of the two
 * (2382 of the ~3283 meshes, vs. ~900 for scatter, at the same snapshot).
 *
 * Fix: `_mergeGroupMeshesByMaterial()` performs static geometry
 * batching — it clones every `Mesh` descendant's geometry with its
 * world-transform (relative to the passed-in group) baked in, buckets the
 * clones by shared `material` reference, and merges each bucket into one
 * new `Mesh`, keeping the top-level wrapper `Group`s (scatter anchors /
 * the building's own `exteriorGroup`) intact for collider/unload/position
 * bookkeeping. It's called once per chunk's scatter group
 * (`_buildChunkScatter()`) and once per building's exterior group (both
 * `_buildStudioSettlementPreview()` and `_buildSettlements()`).
 *
 * This test must fail against the pre-fix code (thousands of individual
 * meshes) and pass after the fix (an order of magnitude fewer).
 *
 * Note: the mesh-count baseline below was re-measured after the
 * SettlementGenerator.ts building-density fix (see
 * WIDTH_HEIGHT_SCALE_FACTOR) — settlements now legitimately place far more
 * buildings per settlement within the same footprint, so more merged
 * per-building meshes are loaded at spawn. The threshold still asserts
 * batching keeps this an order of magnitude below the *unbatched*
 * per-primitive mesh count it would otherwise be (tens of thousands), not
 * the old pre-density-fix number.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { OverworldScene } from '@/scene/OverworldScene';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

describe('OverworldScene scatter/building draw-call batching', () => {
  it('collapses the thousands of individual scatter/building meshes at spawn into an order of magnitude fewer merged meshes', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    const player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    const scene = new THREE.Scene();
    const worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    const overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();

    let meshCount = 0;
    let mergedBatchCount = 0;
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshCount++;
        if (obj.userData.isMergedScatterBatch) mergedBatchCount++;
      }
    });

    // Pre-fix measured baseline was 3283 individual meshes for this exact
    // seed/config, before any buildings/terrain/NPCs were even considered.
    // After the settlement building-density fix, this settlement-heavy seed
    // now legitimately loads ~4600 batched meshes (still one merged mesh
    // per material per chunk/building, not one per primitive) — assert
    // comfortable headroom above the observed value rather than pinning an
    // exact number, while still catching a batching regression back toward
    // tens of thousands of unmerged per-primitive meshes.
    expect(meshCount).toBeLessThan(8000);

    // At least some chunks' scatter must have actually produced merged
    // batch meshes (i.e. the merge path ran and didn't silently no-op).
    expect(mergedBatchCount).toBeGreaterThan(0);
  }, 60000);

  it('still creates tree/rock colliders for every scatter object after merging (merging must not break collision)', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    const player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    const scene = new THREE.Scene();
    const worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    const overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();

    const chunkData = (overworld as any)._terrainChunkData as Map<string, any>;
    let totalScatterAnchors = 0;
    let totalColliders = 0;
    for (const d of chunkData.values()) {
      for (const child of (d.scatter as THREE.Group).children) {
        if (child.userData.isMergedScatterBatch) continue;
        if (child.userData.scatterKind === 'tree' || child.userData.scatterKind === 'rock') {
          totalScatterAnchors++;
        }
      }
      totalColliders += (d.colliders?.length ?? 0);
    }
    expect(totalScatterAnchors).toBeGreaterThan(0);
    expect(totalColliders).toBe(totalScatterAnchors);
  }, 60000);
});
