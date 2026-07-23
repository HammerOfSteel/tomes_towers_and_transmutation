/**
 * WallOcclusionManager.test.ts
 *
 * Unit tests for the wall occlusion system.
 *
 * Tests are written BEFORE the implementation is verified so any regression
 * in the raycasting / hide-restore cycle is caught immediately.
 *
 * Run: npx vitest run tests/rendering/WallOcclusionManager.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { WallOcclusionManager } from '@/rendering/WallOcclusionManager';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a wall mesh at (x, 0, z) with the isWall tag. */
function makeWall(x: number, z: number, w = 1, h = 3, d = 1): THREE.Mesh {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mat  = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, h / 2, z);
  mesh.userData.isWall = true;
  return mesh;
}

/** Create a group containing wall meshes. */
function makeRoomGroup(...walls: THREE.Mesh[]): THREE.Group {
  const group = new THREE.Group();
  walls.forEach(w => group.add(w));
  return group;
}

/** Build a perspective camera at (x, y, z) looking toward the origin. */
function cameraAt(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(x, y, z);
  cam.lookAt(0, 1.5, 0);
  cam.updateMatrixWorld();
  return cam;
}

/** Build a player group centred at (x, y, z). */
function playerAt(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.updateMatrixWorld();
  return g;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WallOcclusionManager', () => {

  let mgr: WallOcclusionManager;

  beforeEach(() => {
    mgr = new WallOcclusionManager();
  });

  it('creates without throwing', () => {
    expect(mgr).toBeDefined();
  });

  it('reset() is safe to call with nothing hidden', () => {
    expect(() => mgr.reset()).not.toThrow();
  });

  it('hides a wall mesh that is directly between camera and player', () => {
    // Camera at (0, 1.5, 8), wall at (0, 1.5, 4), player at origin
    const wall   = makeWall(0, 4);
    const room   = makeRoomGroup(wall);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    // Update world matrices so the ray can hit correctly
    room.updateMatrixWorld(true);

    mgr.update(camera, player, room);

    expect(wall.visible).toBe(false);
  });

  it('does NOT hide a wall mesh that is beside the player (not occluding)', () => {
    // Camera at (0, 1.5, 8), wall to the side at (5, 1.5, 0), player at origin
    const sideWall = makeWall(5, 0);
    const room     = makeRoomGroup(sideWall);
    const camera   = cameraAt(0, 1.5, 8);
    const player   = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);

    expect(sideWall.visible).toBe(true);
  });

  it('restores previously hidden walls on next frame when no longer occluding', () => {
    // Frame 1: wall between camera and player → hidden
    const wall   = makeWall(0, 4);
    const room   = makeRoomGroup(wall);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);
    expect(wall.visible).toBe(false);

    // Frame 2: move camera to the other side — wall no longer occluding
    const camera2 = cameraAt(0, 1.5, -8);
    camera2.lookAt(0, 1.5, 4);
    camera2.updateMatrixWorld();

    mgr.update(camera2, player, room);
    expect(wall.visible).toBe(true);
  });

  it('reset() restores all hidden walls immediately', () => {
    const wall   = makeWall(0, 4);
    const room   = makeRoomGroup(wall);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);
    expect(wall.visible).toBe(false);

    mgr.reset();
    expect(wall.visible).toBe(true);
  });

  it('handles null roomGroup gracefully (no room loaded)', () => {
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);
    expect(() => mgr.update(camera, player, null)).not.toThrow();
  });

  it('handles empty room group (no walls)', () => {
    const room   = makeRoomGroup();   // empty
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);
    expect(() => mgr.update(camera, player, room)).not.toThrow();
  });

  it('skips meshes not tagged userData.isWall', () => {
    const geo    = new THREE.BoxGeometry(1, 3, 1);
    const mat    = new THREE.MeshStandardMaterial();
    const noTag  = new THREE.Mesh(geo, mat);
    noTag.position.set(0, 1.5, 4);   // same position as a wall would be
    // isWall is NOT set
    const room   = makeRoomGroup(noTag);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);

    expect(noTag.visible).toBe(true);   // not hidden — tag missing
  });

  it('handles multiple occluding walls simultaneously', () => {
    const w1 = makeWall(0, 5);
    const w2 = makeWall(0, 3);
    const room   = makeRoomGroup(w1, w2);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);

    expect(w1.visible).toBe(false);
    expect(w2.visible).toBe(false);
  });

  it('update() is idempotent — calling twice gives same result', () => {
    const wall   = makeWall(0, 4);
    const room   = makeRoomGroup(wall);
    const camera = cameraAt(0, 1.5, 8);
    const player = playerAt(0, 0, 0);

    room.updateMatrixWorld(true);
    mgr.update(camera, player, room);
    mgr.update(camera, player, room);

    expect(wall.visible).toBe(false);
  });

});
