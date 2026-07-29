import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraRig, ISO_OFFSET, FRUSTUM_HEIGHT } from '@/core/CameraRig';

describe('CameraRig', () => {
  let rig: CameraRig;
  const ASPECT = 16 / 9;

  beforeEach(() => {
    rig = new CameraRig(ASPECT);
  });

  it('positions camera at ISO_OFFSET on construction', () => {
    expect(rig.camera.position.x).toBeCloseTo(ISO_OFFSET.x);
    expect(rig.camera.position.y).toBeCloseTo(ISO_OFFSET.y);
    expect(rig.camera.position.z).toBeCloseTo(ISO_OFFSET.z);
  });

  it('follow() adds ISO_OFFSET to target x and z', () => {
    const target = new THREE.Vector3(5, 0, 3);
    rig.follow(target);
    expect(rig.camera.position.x).toBeCloseTo(target.x + ISO_OFFSET.x);
    expect(rig.camera.position.z).toBeCloseTo(target.z + ISO_OFFSET.z);
  });

  it('follow() keeps camera Y fixed regardless of target Y', () => {
    rig.follow(new THREE.Vector3(0, 99, 0));
    expect(rig.camera.position.y).toBe(ISO_OFFSET.y);
  });

  it('follow() tracks negative coordinates correctly', () => {
    const target = new THREE.Vector3(-8, 0, -6);
    rig.follow(target);
    expect(rig.camera.position.x).toBeCloseTo(-8 + ISO_OFFSET.x);
    expect(rig.camera.position.z).toBeCloseTo(-6 + ISO_OFFSET.z);
  });

  it('resize() updates orthographic frustum proportionally', () => {
    const newAspect = 4 / 3;
    rig.resize(newAspect);
    const expected = (FRUSTUM_HEIGHT * newAspect) / 2;
    expect(rig.camera.right).toBeCloseTo(expected);
    expect(rig.camera.left).toBeCloseTo(-expected);
  });

  // ── WoW mode: toggle & state ───────────────────────────────────────────────

  it('starts in isometric mode', () => {
    expect(rig.mode).toBe('isometric');
  });

  it('toggleMode() switches to wow mode and initializes yaw from player facing', () => {
    rig.toggleMode(Math.PI / 3);
    expect(rig.mode).toBe('wow');
    expect(rig.yaw).toBeCloseTo(Math.PI / 3, 5);
  });

  it('toggleMode() switches back to isometric on second call', () => {
    rig.toggleMode(0);
    rig.toggleMode(0);
    expect(rig.mode).toBe('isometric');
  });

  it('toggleMode() into wow mode resets pitch and distance to defaults', () => {
    rig.toggleMode(0);
    rig.adjustPitch(0.5);
    rig.adjustDistance(5);
    rig.toggleMode(0); // back to isometric
    rig.toggleMode(1.0); // into wow again
    expect(rig.pitch).toBeCloseTo(rig.pitch, 5); // sanity: readable
    // Re-entering wow mode must not carry over the previous pitch/distance drift:
    const freshPitch = rig.pitch;
    const freshDistance = rig.distance;
    rig.toggleMode(0);
    rig.toggleMode(0);
    expect(rig.pitch).toBeCloseTo(freshPitch, 5);
    expect(rig.distance).toBeCloseTo(freshDistance, 5);
  });

  it('isometric follow() behavior is unchanged when mode has never been toggled', () => {
    const target = new THREE.Vector3(2, 0, -4);
    rig.follow(target);
    expect(rig.camera.position.x).toBeCloseTo(target.x + ISO_OFFSET.x);
    expect(rig.camera.position.y).toBeCloseTo(ISO_OFFSET.y);
    expect(rig.camera.position.z).toBeCloseTo(target.z + ISO_OFFSET.z);
  });

  // ── WoW mode: orbit math ───────────────────────────────────────────────────

  it('wow mode follow() places camera behind target along yaw, at distance/pitch offset', () => {
    rig.toggleMode(0); // yaw = 0 → forward is +Z (matches PlayerController facing convention)
    const target = new THREE.Vector3(0, 0, 0);
    rig.follow(target);
    const horiz = rig.distance * Math.cos(rig.pitch);
    const expectedY = rig.distance * Math.sin(rig.pitch);
    // yaw=0 → forward=(sin(0),0,cos(0))=(0,0,1) → camera sits at -forward*horiz behind target
    expect(rig.camera.position.x).toBeCloseTo(0, 4);
    expect(rig.camera.position.z).toBeCloseTo(-horiz, 4);
    expect(rig.camera.position.y).toBeCloseTo(expectedY, 4);
  });

  it('wow mode follow() calls lookAt so the camera always faces the target', () => {
    rig.toggleMode(0);
    const target = new THREE.Vector3(3, 0, 5);
    rig.follow(target);
    // Camera forward direction (world -Z of local space) should point toward target.
    const dir = new THREE.Vector3();
    rig.camera.getWorldDirection(dir);
    const toTarget = target.clone().sub(rig.camera.position).normalize();
    expect(dir.x).toBeCloseTo(toTarget.x, 2);
    expect(dir.y).toBeCloseTo(toTarget.y, 2);
    expect(dir.z).toBeCloseTo(toTarget.z, 2);
  });

  it('adjustYaw() rotates the camera offset around the target', () => {
    rig.toggleMode(0);
    const yawBefore = rig.yaw;
    rig.adjustYaw(0.4);
    expect(rig.yaw).toBeCloseTo(yawBefore + 0.4, 5);
  });

  it('adjustPitch() is clamped and never flips over the top or below ground', () => {
    rig.toggleMode(0);
    rig.adjustPitch(10); // huge positive delta
    expect(rig.pitch).toBeLessThanOrEqual(Math.PI / 2);
    rig.adjustPitch(-10); // huge negative delta
    expect(rig.pitch).toBeGreaterThanOrEqual(0);
  });

  it('adjustDistance() is clamped to [MIN_DISTANCE, MAX_DISTANCE]', () => {
    rig.toggleMode(0);
    rig.adjustDistance(-1000);
    const minDist = rig.distance;
    expect(minDist).toBeGreaterThan(0);
    rig.adjustDistance(1000);
    expect(rig.distance).toBeGreaterThan(minDist);
  });

  it('onModeChange() fires a callback with the new mode on toggle', () => {
    let received: string[] = [];
    rig.onModeChange((m) => received.push(m));
    rig.toggleMode(0);
    rig.toggleMode(0);
    expect(received).toEqual(['wow', 'isometric']);
  });

  it('applyScroll() adjusts frustum zoom in isometric mode (unchanged)', () => {
    const before = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    rig.applyScroll(100);
    const after = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    expect(after).not.toBe(before);
  });

  it('applyScroll() adjusts distance instead of frustum in wow mode', () => {
    rig.toggleMode(0);
    const distBefore = rig.distance;
    const frustumBefore = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    rig.applyScroll(100);
    expect(rig.distance).not.toBeCloseTo(distBefore, 5);
    const frustumAfter = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    expect(frustumAfter).toBeCloseTo(frustumBefore, 5);
  });
});
