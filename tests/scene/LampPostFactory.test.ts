import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeLampPost } from '../../src/scene/LampPostFactory';

describe('makeLampPost', () => {
  it('returns a THREE.Group with at least one mesh child', () => {
    const lamp = makeLampPost();
    expect(lamp).toBeInstanceOf(THREE.Group);
    const meshCount = lamp.children.filter((c) => (c as THREE.Mesh).isMesh).length;
    expect(meshCount).toBeGreaterThan(0);
  });

  it('returns a fresh, independent group on each call', () => {
    const lampA = makeLampPost();
    const lampB = makeLampPost();
    expect(lampA).not.toBe(lampB);
    lampA.position.set(5, 0, 0);
    expect(lampB.position.x).toBe(0);
  });
});
