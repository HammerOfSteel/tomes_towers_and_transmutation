import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShutter, buildShutterPair } from '@/world/buildings/kit/Shutter';

function material(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#332222' });
}

function allMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of allMeshes(root)) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    for (const v of [box.min, box.max]) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
  }
}

describe('buildShutter', () => {
  it('builds a closed louvred leaf with a leaf, >=5 slats, 2 hinges, and a holdback', () => {
    const leaf = buildShutter({
      width: 0.32,
      height: 1.2,
      material: material(),
      hingeMaterial: material(),
      state: 'closed_louvred',
    });
    assertFiniteGeometry(leaf);

    const names = new Set<string>();
    leaf.traverse((o) => { if (o.name) names.add(o.name); });

    expect(names.has('leaf')).toBe(true);
    const slatCount = [...names].filter((n) => n.startsWith('slat-')).length;
    expect(slatCount).toBeGreaterThanOrEqual(5);
    const hingeCount = [...names].filter((n) => n.startsWith('hinge-strap-')).length;
    expect(hingeCount).toBe(2);
    expect(names.has('holdback')).toBe(true);
  });

  it('gives leaf/slats/hinges distinct depth offsets (no coplanar surfaces)', () => {
    const leaf = buildShutter({
      width: 0.32,
      height: 1.2,
      material: material(),
      hingeMaterial: material(),
      state: 'closed_louvred',
    });
    const leafMesh = leaf.getObjectByName('leaf') as THREE.Mesh;
    const slatMesh = leaf.getObjectByName('slat-0') as THREE.Mesh;
    const hingeMesh = leaf.getObjectByName('hinge-strap-top') as THREE.Mesh;
    const holdback = leaf.getObjectByName('holdback')!;
    const depths = [leafMesh.position.z, slatMesh.position.z, hingeMesh.position.z, holdback.position.z];
    for (let i = 0; i < depths.length; i++) {
      for (let j = i + 1; j < depths.length; j++) {
        expect(Math.abs(depths[i]! - depths[j]!)).toBeGreaterThanOrEqual(0.005);
      }
    }
  });

  it('folds fully open so the leaf footprint moves outward past the opening edge', () => {
    const closed = buildShutter({ width: 0.4, height: 1.0, material: material(), state: 'closed_louvred', hinge: 'left' });
    const open = buildShutter({ width: 0.4, height: 1.0, material: material(), state: 'folded_open', hinge: 'left' });
    const closedBox = new THREE.Box3().setFromObject(closed);
    const openBox = new THREE.Box3().setFromObject(open);
    // Closed leaf spans roughly [-width/2, width/2]; fully folded open should
    // swing the whole leaf to one side, past the closed leaf's own edge.
    expect(openBox.min.x).toBeLessThan(closedBox.min.x - 0.01);
  });

  it('produces boarded-in-place planks instead of louvre slats', () => {
    const leaf = buildShutter({
      width: 0.32,
      height: 1.2,
      material: material(),
      state: 'boarded_in_place',
    });
    const names = new Set<string>();
    leaf.traverse((o) => { if (o.name) names.add(o.name); });
    const boardCount = [...names].filter((n) => n.startsWith('board-')).length;
    expect(boardCount).toBeGreaterThanOrEqual(3);
    expect([...names].some((n) => n.startsWith('slat-'))).toBe(false);
  });
});

describe('buildShutterPair', () => {
  it('builds two leaves spanning the full opening width', () => {
    const pair = buildShutterPair({
      width: 0.7,
      height: 1.3,
      material: material(),
      hingeMaterial: material(),
      state: 'closed_louvred',
    });
    assertFiniteGeometry(pair);
    expect(pair.getObjectByName('shutter-leaf-left')).toBeTruthy();
    expect(pair.getObjectByName('shutter-leaf-right')).toBeTruthy();
    const box = new THREE.Box3().setFromObject(pair);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.x).toBeGreaterThan(0.6);
    expect(size.x).toBeLessThan(0.85);
  });

  it('supports one leaf ajar while the other stays closed', () => {
    const pair = buildShutterPair({
      width: 0.7,
      height: 1.3,
      material: material(),
      state: 'closed_louvred',
      rightState: 'one_ajar',
    });
    const left = pair.getObjectByName('shutter-leaf-left')!;
    const right = pair.getObjectByName('shutter-leaf-right')!;
    const leftPivot = left.getObjectByName('hinge-pivot')!;
    const rightPivot = right.getObjectByName('hinge-pivot')!;
    expect(leftPivot.rotation.y).toBeCloseTo(0, 5);
    expect(Math.abs(rightPivot.rotation.y)).toBeGreaterThan(0.1);
  });
});
