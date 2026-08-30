/**
 * OverworldScene.settlement-parity.test.ts
 *
 * Parity test for Task 6: verifies that refactoring _buildSettlements() to
 * delegate to renderSettlementPlan() produces exactly the same building,
 * road, and lamp counts as the original implementation.
 *
 * Written BEFORE the refactor (Step 1) using seed 1 / worldSize 512, which
 * is confirmed (see drawcall-batching tests) to produce at least one
 * settlement. The expected values are hardcoded from the pre-refactor run
 * and must remain identical after the refactor.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { OverworldScene } from '@/scene/OverworldScene';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

describe('OverworldScene settlement rendering parity', () => {
  it('produces the same building/road/lamp counts before and after the SettlementRenderer refactor (seed 1)', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    const player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    const scene = new THREE.Scene();
    const worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    const overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();

    const buildingGroups: number = (overworld as any)._buildingGroups.length;
    const roadMeshes: number     = (overworld as any)._roadMeshes.length;
    const lampGroups: number     = (overworld as any)._lampGroups.length;
    const lampLights: number     = (overworld as any)._lampLights.length;
    const buildingData: number   = (overworld as any)._buildingData.length;

    // These values were recorded on the pre-refactor run and must not change.
    // Non-zero values confirm the settlement was actually rendered (not silently skipped).
    expect(buildingGroups).toBeGreaterThan(0);
    expect(roadMeshes).toBeGreaterThan(0);
    expect(lampGroups).toBeGreaterThan(0);
    expect(lampLights).toBe(lampGroups);
    expect(buildingData).toBeGreaterThan(0);

    // Snapshot the exact counts so any accidental change in the refactor is
    // caught. Note: buildingGroups also includes ward "feature cluster"
    // groups (park-ward Sacred Grove/Slime Pool/etc., see
    // WardFeatureClusters.ts / Phase 2a) since OverworldScene reuses the
    // same add/dispose array for both — an increase here after adding a
    // feature cluster is expected, not a regression. roadMeshes also jumped
    // (2 -> many) once real per-ribbon street meshes (SettlementRenderer.ts's
    // buildRoadRibbonMeshes(), previously built but never consumed) were
    // wired in on top of the flat per-tile pavement squares, replacing the
    // "every road tile is an identical flat square" look with actual
    // road-shaped ribbons — an increase here is the intended fix, not a
    // regression. buildingGroups/buildingData also shifted again once Phase
    // 1 of the biome/terrain overhaul added a real `mountain` RealmBiome:
    // some high-elevation cells that used to classify as forest/taiga/etc.
    // now classify as mountain instead, which perturbs the exact contents
    // of RealmGenerator.ts's shuffled settlement-candidate cell list for a
    // given seed (even though the RNG streams themselves are unchanged) —
    // a different settlement count/composition for seed 1 is an expected
    // side effect of legitimately changing biome classification, not a bug.
    // Shifted a third time when Phase 1 also widened the elevation-level
    // count from 5 (0-4) to 8 (0-7): finer quantization of the same
    // continuous elevation changes exactly which cells fall in each level
    // band, which (like the mountain-biome change above) perturbs the
    // settlement-candidate cell list's exact contents for a given seed.
    expect(buildingGroups).toMatchSnapshot();
    expect(roadMeshes).toMatchSnapshot();
    expect(lampGroups).toMatchSnapshot();
    expect(buildingData).toMatchSnapshot();
  }, 120_000);
});
