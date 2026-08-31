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
    // Road meshes are now built per-terrain-chunk (baked into the terrain
    // sub-tile surface, see RoadPathSampler.ts / TerrainGeometryBuilder.ts's
    // roadGeometry output) rather than eagerly for every settlement
    // regardless of player position, so counting rendered road meshes here
    // would depend on chunk-streaming proximity to the player's spawn
    // point (an orthogonal concern this test isn't set up to control).
    // Check that road *path* collection itself worked instead — the
    // chunk-proximity-independent precondition for any road mesh to ever
    // render at all.
    const roadPaths: number = (overworld as any)._roadPaths.length;
    const lampGroups: number     = (overworld as any)._lampGroups.length;
    const lampLights: number     = (overworld as any)._lampLights.length;
    const buildingData: number   = (overworld as any)._buildingData.length;

    // These values were recorded on the pre-refactor run and must not change.
    // Non-zero values confirm the settlement was actually rendered (not silently skipped).
    expect(buildingGroups).toBeGreaterThan(0);
    expect(roadPaths).toBeGreaterThan(0);
    expect(lampGroups).toBeGreaterThan(0);
    expect(lampLights).toBe(lampGroups);
    expect(buildingData).toBeGreaterThan(0);

    // Snapshot the exact counts so any accidental change in the refactor is
    // caught. Note: buildingGroups also includes ward "feature cluster"
    // groups (park-ward Sacred Grove/Slime Pool/etc., see
    // WardFeatureClusters.ts / Phase 2a) since OverworldScene reuses the
    // same add/dispose array for both — an increase here after adding a
    // feature cluster is expected, not a regression. buildingGroups/
    // buildingData also shifted again once Phase 1 of the biome/terrain
    // overhaul added a real `mountain` RealmBiome: some high-elevation
    // cells that used to classify as forest/taiga/etc. now classify as
    // mountain instead, which perturbs the exact contents of
    // RealmGenerator.ts's shuffled settlement-candidate cell list for a
    // given seed (even though the RNG streams themselves are unchanged) —
    // a different settlement count/composition for seed 1 is an expected
    // side effect of legitimately changing biome classification, not a bug.
    // Shifted a third time when Phase 1 also widened the elevation-level
    // count from 5 (0-4) to 8 (0-7): finer quantization of the same
    // continuous elevation changes exactly which cells fall in each level
    // band, which (like the mountain-biome change above) perturbs the
    // settlement-candidate cell list's exact contents for a given seed.
    // roadPaths replaces the old roadMeshes snapshot: roads are now baked
    // directly into the terrain sub-tile surface (per-chunk, on demand)
    // instead of being eagerly built as a separate overlay mesh for every
    // settlement regardless of player position — this counts the
    // settlement-street + inter-settlement-road *path segments* collected
    // at construction time (chunk-proximity-independent), not rendered
    // meshes.
    // Shifted a fourth time (buildingGroups only) once planSettlement()
    // gained a road-clearance safety net (resolveRoadClearanceViolations()
    // in SettlementGenerator.ts, see tests/levels/settlementGenerator.
    // test.ts's "keeps every building clear of every road ribbon band"):
    // a handful of buildings that used to render on top of a road (their
    // real, post-getFootprint() footprint intruding into the road
    // ribbon's real rendered width) now get relocated or, when no clear
    // nearby tile exists, dropped — an expected small reduction in count
    // for a settlement whose layout happens to place buildings close to
    // its roads, not a regression.
    // Shifted a fifth time (buildingGroups 203->212, lampGroups 140->141,
    // buildingData 57->61) once RealmGenerator.ts's Phase 4 domain-warp
    // (_domainWarp(), see docs/superpowers/specs/2026-08-31-organic-biome-
    // transitions-design.md) landed: warping the biome-classification
    // sample coordinate perturbs exactly which cells classify as which
    // biome/elevation for a given seed (same underlying mechanism as the
    // mountain-biome and elevation-quantization shifts noted above), which
    // again perturbs RealmGenerator.ts's settlement-candidate cell list
    // for seed 1 — a different settlement layout/composition, not a bug.
    // Shifted a sixth time (buildingGroups 212->251, lampGroups 141->140,
    // buildingData 61->63) once RealmGenerator.ts's Phase 5 race/faction
    // biome affinity (pickFaction(), see docs/superpowers/specs/2026-08-31-
    // race-biome-affinity-design.md) landed: settlements can now be sited
    // on mountain/tundra biomes (previously excluded), and faction
    // assignment is now biased by biome instead of uniform-random — both
    // change which/how-many settlements land for seed 1 and which
    // faction's building set each one renders with, again a different
    // settlement layout/composition, not a bug.
    expect(buildingGroups).toMatchSnapshot();
    expect(roadPaths).toMatchSnapshot();
    expect(lampGroups).toMatchSnapshot();
    expect(buildingData).toMatchSnapshot();
  }, 120_000);
});
