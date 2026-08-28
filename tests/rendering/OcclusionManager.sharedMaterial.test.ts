/**
 * OcclusionManager.sharedMaterial.test.ts
 *
 * Regression test for Task 13 final-review Issue A (Critical):
 *
 * OverworldScene now POOLS materials across many scatter meshes (all
 * conifers of a given texture variant share one `THREE.Material` instance —
 * see `_pooledMaterial()`). Before this fix, `OcclusionManager.update()`
 * mutated `mesh.material.opacity` directly, so fading ONE mesh visually
 * faded every OTHER mesh sharing that pooled material, and a second mesh
 * starting to fade while the first was still faded would record the
 * already-dimmed opacity as its "original" — leaving the shared material
 * permanently stuck translucent once both meshes stopped occluding.
 *
 * This test builds two meshes sharing one material instance, drives them
 * through an overlapping fade/restore cycle via real raycasting (camera →
 * player), and asserts:
 *   1. The shared material object itself is NEVER mutated (opacity stays 1).
 *   2. Each mesh ends up back on the shared material reference once its own
 *      fade completes, fully restored to opaque.
 *   3. Overlapping fades (mesh B starts fading while mesh A is still faded)
 *      do not desync doesn't corrupt anything for a mesh that finishes later.
 *
 * Run: npx vitest run tests/rendering/OcclusionManager.sharedMaterial.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { OcclusionManager } from '@/rendering/OcclusionManager';

function cameraAt(x: number, y: number, z: number, lookAt: THREE.Vector3): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  cam.position.set(x, y, z);
  cam.lookAt(lookAt);
  cam.updateMatrixWorld();
  return cam;
}

/** Tall box (height 2 > the 0.35 candidate threshold) sharing `mat`. */
function makeBox(mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mat);
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** Runs `update()` enough times to fully settle any in-progress fade/restore. */
function settle(mgr: OcclusionManager, camera: THREE.Camera, player: THREE.Vector3, steps = 60): void {
  for (let i = 0; i < steps; i++) mgr.update(camera, player, 0.05);
}

describe('OcclusionManager — pooled/shared scatter materials', () => {
  let mgr: OcclusionManager;

  beforeEach(() => {
    mgr = new OcclusionManager();
  });

  it('never mutates the shared material object when fading a mesh that uses it', () => {
    const sharedMat = new THREE.MeshLambertMaterial({ color: 0x224422 });
    const treeA = makeBox(sharedMat, 0, 1, 4);   // directly between camera and player
    const treeB = makeBox(sharedMat, 20, 1, 4);  // far away, never occludes

    mgr.setMeshes([treeA, treeB]);
    const camera = cameraAt(0, 1, 10, new THREE.Vector3(0, 1, 0));
    const player = new THREE.Vector3(0, 1, 0);

    settle(mgr, camera, player, 30);

    // treeA should now be faded (its OWN material clone), treeB untouched.
    expect(treeA.material).not.toBe(sharedMat);
    expect((treeA.material as THREE.MeshLambertMaterial).opacity).toBeLessThan(0.3);
    expect(treeB.material).toBe(sharedMat);
    // The pooled material itself must remain fully opaque — this is the
    // core regression check: before the fix, fading treeA would have
    // directly mutated `sharedMat.opacity`, corrupting treeB's appearance too.
    expect(sharedMat.opacity).toBe(1);
    expect(sharedMat.transparent).toBe(false);

    // Move the camera so treeA no longer occludes, and let it fully restore.
    const camera2 = cameraAt(0, 1, -10, new THREE.Vector3(0, 1, 4));
    settle(mgr, camera2, player, 60);

    // treeA must be restored to the ORIGINAL shared material reference —
    // not merely have its opacity reset on a lingering clone.
    expect(treeA.material).toBe(sharedMat);
    expect(sharedMat.opacity).toBe(1);
    expect(sharedMat.transparent).toBe(false);
  });

  it('overlapping fades on meshes sharing one material never leave it permanently translucent', () => {
    // Regression for the specific bug described in the review: mesh B starts
    // fading while mesh A is still mid-fade/fully-faded, sharing one material.
    const sharedMat = new THREE.MeshLambertMaterial({ color: 0x334433 });
    const treeA = makeBox(sharedMat, 0, 1, 4);
    const treeB = makeBox(sharedMat, 0, 1, 4); // same spot — both on the ray

    mgr.setMeshes([treeA, treeB]);
    const camera = cameraAt(0, 1, 10, new THREE.Vector3(0, 1, 0));
    const player = new THREE.Vector3(0, 1, 0);

    // Both start occluding together (both hit by the same ray) — advance a
    // few steps so they're partially faded (not fully settled) to emulate
    // "still fading" overlap, then keep fading to completion.
    for (let i = 0; i < 3; i++) mgr.update(camera, player, 0.05);
    settle(mgr, camera, player, 60);

    expect(sharedMat.opacity).toBe(1); // never mutated regardless of overlap

    // Now move the camera away so BOTH stop occluding, and fully restore.
    const camera2 = cameraAt(0, 1, -10, new THREE.Vector3(0, 1, 4));
    settle(mgr, camera2, player, 80);

    expect(treeA.material).toBe(sharedMat);
    expect(treeB.material).toBe(sharedMat);
    expect(sharedMat.opacity).toBe(1);
    expect(sharedMat.transparent).toBe(false);
  });

  it('dispose() restores any in-flight fades to the original shared material', () => {
    const sharedMat = new THREE.MeshLambertMaterial({ color: 0x445544 });
    const tree = makeBox(sharedMat, 0, 1, 4);

    mgr.setMeshes([tree]);
    const camera = cameraAt(0, 1, 10, new THREE.Vector3(0, 1, 0));
    const player = new THREE.Vector3(0, 1, 0);

    mgr.update(camera, player, 0.05); // begin fading — clones the material
    expect(tree.material).not.toBe(sharedMat);

    mgr.dispose();

    expect(tree.material).toBe(sharedMat);
    expect(sharedMat.opacity).toBe(1);
  });
});
