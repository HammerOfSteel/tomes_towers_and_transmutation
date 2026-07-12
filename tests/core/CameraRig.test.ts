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
});
