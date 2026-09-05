import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildChevronBelt,
  buildCorbelRow,
  buildShieldPlaque,
  buildXLatticePanel,
} from '@/world/buildings/kit/AngularOrnament';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#847a68', roughness: 1 });
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

describe('buildChevronBelt', () => {
  it('produces alternating raised zigzag segments with real depth relief', () => {
    const belt = buildChevronBelt({ width: 3, material: makeMaterial(), segments: 6 });
    const segmentMeshes = belt.children.filter((c) => c.name.startsWith('chevron-segment-'));
    expect(segmentMeshes.length).toBeGreaterThanOrEqual(6);
    assertFiniteGeometry(belt);
    belt.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(belt);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.01); // genuine z relief, not flat
  });
});

describe('buildXLatticePanel', () => {
  it('produces two crossing diagonal strands with depth relief between them', () => {
    const panel = buildXLatticePanel({ width: 1.2, height: 1.6, material: makeMaterial() });
    const names = panel.children.map((c) => c.name);
    expect(names).toContain('strand-a');
    expect(names).toContain('strand-b');
    assertFiniteGeometry(panel);
  });
});

describe('buildShieldPlaque', () => {
  it('produces an extruded chamfered plaque, not a flat plane', () => {
    const plaque = buildShieldPlaque({ width: 0.5, height: 0.7, material: makeMaterial() });
    plaque.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(plaque);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.01);
    assertFiniteGeometry(plaque);
  });
});

describe('buildCorbelRow', () => {
  it('produces the requested count of stepped block corbels', () => {
    const row = buildCorbelRow({ count: 4, spacing: 0.4, material: makeMaterial() });
    const corbels = row.children.filter((c) => c.name.startsWith('corbel-'));
    expect(corbels).toHaveLength(4);
    assertFiniteGeometry(row);
  });
});
