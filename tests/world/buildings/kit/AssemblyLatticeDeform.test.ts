import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { deformAssembly } from '@/world/buildings/kit/AssemblyLatticeDeform';

function makeTallBoxAssembly(height = 4, width = 1, depth = 1): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth, 1, 8, 1), new THREE.MeshStandardMaterial());
  mesh.position.y = height / 2;
  group.add(mesh);
  return group;
}

function boxOf(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
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

describe('deformAssembly', () => {
  it('is an exact no-op for an all-zero profile (does not even clone geometry)', () => {
    const group = makeTallBoxAssembly();
    const mesh = group.children[0] as THREE.Mesh;
    const originalGeometry = mesh.geometry;
    const originalPositions = (originalGeometry.getAttribute('position') as THREE.BufferAttribute).array.slice();

    const result = deformAssembly(group, {});

    expect(result).toBe(group);
    expect(mesh.geometry).toBe(originalGeometry); // literally the same geometry instance, never touched
    const after = mesh.geometry.getAttribute('position').array;
    expect(Array.from(after)).toEqual(Array.from(originalPositions));
  });

  it('leans the top of the assembly sideways while keeping the base fixed', () => {
    const group = makeTallBoxAssembly(4);
    const before = boxOf(group);
    deformAssembly(group, { leanX: 1.5 });
    const after = boxOf(group);

    // Base should stay put; the top should shift toward +X by ~leanX.
    expect(after.min.y).toBeCloseTo(before.min.y, 3);
    expect(after.max.x).toBeGreaterThan(before.max.x + 1.0);
    assertFiniteGeometry(group);
  });

  it('curl adds an accelerating (quadratic) extra shift concentrated near the top', () => {
    const linearOnly = makeTallBoxAssembly(4);
    deformAssembly(linearOnly, { leanX: 1.0 });
    const curled = makeTallBoxAssembly(4);
    deformAssembly(curled, { leanX: 1.0, curlX: 1.0 });

    const linearBox = boxOf(linearOnly);
    const curledBox = boxOf(curled);
    // Both lean the same linear amount, but curl adds extra displacement
    // concentrated at the top -- the curled box's top corner should reach
    // further out than the linear-only one.
    expect(curledBox.max.x).toBeGreaterThan(linearBox.max.x);
  });

  it('bulges the mid-height radially outward while leaving top and bottom unchanged', () => {
    const group = makeTallBoxAssembly(4, 1, 1);
    const before = boxOf(group);
    deformAssembly(group, { bulge: 0.6 });
    const after = boxOf(group);

    expect(after.min.y).toBeCloseTo(before.min.y, 3);
    expect(after.max.y).toBeCloseTo(before.max.y, 3);
    // The bulge should widen the assembly's overall X/Z footprint since it
    // pushes mid-height vertices outward radially.
    expect(after.max.x - after.min.x).toBeGreaterThan(before.max.x - before.min.x);
    expect(after.max.z - after.min.z).toBeGreaterThan(before.max.z - before.min.z);
    assertFiniteGeometry(group);
  });

  it('restricts bulge to a single axis when bulgeAxis is set', () => {
    const group = makeTallBoxAssembly(4, 1, 1);
    const before = boxOf(group);
    deformAssembly(group, { bulge: 0.6, bulgeAxis: 'x' });
    const after = boxOf(group);

    expect(after.max.x - after.min.x).toBeGreaterThan(before.max.x - before.min.x);
    expect(after.max.z - after.min.z).toBeCloseTo(before.max.z - before.min.z, 3);
  });

  it('operates in the group-local frame -- an externally positioned/rotated group deforms identically to an unpositioned one', () => {
    const plain = makeTallBoxAssembly(4);
    deformAssembly(plain, { leanX: 1.2, bulge: 0.3 });
    const plainLocalBox = new THREE.Box3();
    (plain.children[0] as THREE.Mesh).geometry.computeBoundingBox();
    plainLocalBox.copy((plain.children[0] as THREE.Mesh).geometry.boundingBox!);

    const moved = makeTallBoxAssembly(4);
    moved.position.set(50, 10, -30);
    moved.rotation.y = Math.PI / 3;
    deformAssembly(moved, { leanX: 1.2, bulge: 0.3 });
    const movedLocalBox = new THREE.Box3();
    (moved.children[0] as THREE.Mesh).geometry.computeBoundingBox();
    movedLocalBox.copy((moved.children[0] as THREE.Mesh).geometry.boundingBox!);

    expect(movedLocalBox.min.toArray().map(n => Number(n.toFixed(3)))).toEqual(plainLocalBox.min.toArray().map(n => Number(n.toFixed(3))));
    expect(movedLocalBox.max.toArray().map(n => Number(n.toFixed(3)))).toEqual(plainLocalBox.max.toArray().map(n => Number(n.toFixed(3))));
  });

  it('handles a nested, y-rotated child mesh without producing NaNs', () => {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = 0.7;
    inner.position.set(0.5, 0, -0.3);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1, 1, 6, 1), new THREE.MeshStandardMaterial());
    mesh.position.y = 2;
    inner.add(mesh);
    group.add(inner);

    deformAssembly(group, { leanX: 0.8, leanZ: -0.4, curlX: 0.5, bulge: 0.3 });
    assertFiniteGeometry(group);
  });

  it('recomputes vertex normals after deforming (not left stale for a now-slanted surface)', () => {
    const group = makeTallBoxAssembly(4);
    const mesh = group.children[0] as THREE.Mesh;
    deformAssembly(group, { leanX: 2, curlX: 1 });
    expect(mesh.geometry.getAttribute('normal')).toBeTruthy();
    const normals = mesh.geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const len = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      expect(len).toBeGreaterThan(0.9);
      expect(len).toBeLessThan(1.1);
    }
  });

  it('returns the same group reference for chaining', () => {
    const group = makeTallBoxAssembly();
    expect(deformAssembly(group, { leanX: 1 })).toBe(group);
  });
});
