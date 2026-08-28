/**
 * PhysicsWorld.culling.test.ts
 *
 * Regression test for Task 13 final-review Issue B (Important):
 *
 * `PhysicsWorld.step()`'s distance-based culling (`cullingRadius`) used to
 * disable far FIXED bodies before stepping and unconditionally re-enable
 * every body it had just disabled afterward — regardless of whether that
 * body had ALREADY been disabled for an unrelated reason (e.g.
 * `OverworldScene.exit()` calling `setEnabled(false)` on chunk-streamed
 * tree/rock colliders when the player leaves the overworld for an interior
 * scene). Because those chunk colliders remain registered in the shared
 * Rapier world (only disabled, not removed) and a dungeon/tower's own
 * `cullingRadius` pass would find them "far away" relative to that scene's
 * player position, they'd get folded into `culled` and blindly flipped back
 * to enabled after `world.step()` — resurrecting invisible overworld
 * colliders inside an unrelated interior scene.
 *
 * The fix: culling only considers bodies that are CURRENTLY enabled before
 * disabling them for the step, so a body some other system deliberately
 * disabled is left alone and never re-enabled by the culling pass.
 *
 * Run: npx vitest run tests/physics/PhysicsWorld.culling.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';

describe('PhysicsWorld — distance culling vs externally-disabled bodies', () => {
  let physics: PhysicsWorld;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  it('does NOT re-enable a fixed body that was disabled for an unrelated reason, even when culling runs far from it', () => {
    // Simulate an overworld chunk tree/rock collider, far from the origin.
    const treeBody = physics.createStaticBox(
      new THREE.Vector3(500, 0, 500),
      new THREE.Vector3(0.5, 0.5, 0.5),
    );

    // Simulate OverworldScene.exit(): the scene is leaving for an interior,
    // so it disables (not removes) this chunk-streamed collider.
    treeBody.setEnabled(false);
    expect(treeBody.isEnabled()).toBe(false);

    // Now simulate an INTERIOR scene's own physics stepping with culling on,
    // with the player (culling origin) nowhere near the far-away tree body —
    // exactly the scenario that used to resurrect it.
    physics.cullingRadius = 30;
    physics.cullingOrigin = { x: 0, y: 0, z: 0 };
    physics.step(1 / 60);

    // The tree body must remain disabled — the interior's culling pass must
    // not have unconditionally re-enabled it.
    expect(treeBody.isEnabled()).toBe(false);

    // Sanity: it stays disabled across several more steps too, not just one.
    physics.step(1 / 60);
    physics.step(1 / 60);
    expect(treeBody.isEnabled()).toBe(false);
  });

  it('still culls-and-restores a body IT disabled for distance (the actual culling feature keeps working)', () => {
    const farBody = physics.createStaticBox(
      new THREE.Vector3(200, 0, 200),
      new THREE.Vector3(0.5, 0.5, 0.5),
    );
    expect(farBody.isEnabled()).toBe(true);

    physics.cullingRadius = 30;
    physics.cullingOrigin = { x: 0, y: 0, z: 0 };
    physics.step(1 / 60);

    // Culling transiently disables far bodies for the step, then re-enables
    // them afterward — that behavior (existing, intentional) must still work
    // for bodies that were enabled going into the step.
    expect(farBody.isEnabled()).toBe(true);
  });

  it('a chunk-reloaded body (re-enabled by the scene) becomes eligible for culling again', () => {
    const treeBody = physics.createStaticBox(
      new THREE.Vector3(-500, 0, -500),
      new THREE.Vector3(0.5, 0.5, 0.5),
    );
    treeBody.setEnabled(false); // scene exit / chunk unload

    physics.cullingRadius = 30;
    physics.cullingOrigin = { x: 0, y: 0, z: 0 };
    physics.step(1 / 60);
    expect(treeBody.isEnabled()).toBe(false);

    // Player returns to the overworld and this chunk reloads — the scene's
    // own enter()/_loadTerrainChunk() path re-enables it.
    treeBody.setEnabled(true);
    physics.step(1 / 60);
    // Far from the culling origin, so it's still transiently culled then
    // restored (the normal culling contract), not disabled forever.
    expect(treeBody.isEnabled()).toBe(true);
  });
});
