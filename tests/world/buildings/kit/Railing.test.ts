import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRailSection, buildRailGate } from '@/world/buildings/kit/Railing';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#20211f', roughness: 0.6, metalness: 0.4 });
}

function assertFiniteGeometry(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
}

function picketChildren(section: THREE.Group): THREE.Object3D[] {
  return section.children.filter((c) => c.name.startsWith('picket-'));
}

describe('buildRailSection', () => {
  it('has posts, top/bottom rails, and at least 5 pickets', () => {
    const section = buildRailSection({ length: 1.2, material: makeMaterial() });
    expect(section.getObjectByName('post-a')).toBeTruthy();
    expect(section.getObjectByName('post-b')).toBeTruthy();
    expect(section.getObjectByName('top-rail')).toBeTruthy();
    expect(section.getObjectByName('bottom-rail')).toBeTruthy();
    expect(picketChildren(section).length).toBeGreaterThanOrEqual(5);
    assertFiniteGeometry(section);
  });

  it('never drops below the minimum picket count even for a very short section', () => {
    const section = buildRailSection({ length: 0.3, material: makeMaterial() });
    expect(picketChildren(section).length).toBeGreaterThanOrEqual(5);
  });

  it('adds finials by default and omits them when finials=false', () => {
    const withFinials = buildRailSection({ length: 1, material: makeMaterial() });
    expect(withFinials.getObjectByName('post-finial')).toBeTruthy();
    const without = buildRailSection({ length: 1, material: makeMaterial(), finials: false });
    expect(without.getObjectByName('post-finial')).toBeFalsy();
  });

  it('brokenFraction seeds real gaps in the picket line', () => {
    const intact = buildRailSection({ length: 2, material: makeMaterial(), seed: 3 });
    const broken = buildRailSection({ length: 2, material: makeMaterial(), seed: 3, brokenFraction: 0.6 });
    expect(picketChildren(broken).length).toBeLessThan(picketChildren(intact).length);
    assertFiniteGeometry(broken);
  });

  it('produces real z/y relief (not a flat plane)', () => {
    const section = buildRailSection({ length: 1.2, material: makeMaterial() });
    section.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(section);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.3);
  });
});

describe('buildRailGate', () => {
  it('has two hinge posts and two named gate leaves', () => {
    const gate = buildRailGate({ width: 1.4, material: makeMaterial() });
    expect(gate.getObjectByName('hinge-post-left')).toBeTruthy();
    expect(gate.getObjectByName('hinge-post-right')).toBeTruthy();
    expect(gate.getObjectByName('gate-leaf-left')).toBeTruthy();
    expect(gate.getObjectByName('gate-leaf-right')).toBeTruthy();
    assertFiniteGeometry(gate);
  });
});
