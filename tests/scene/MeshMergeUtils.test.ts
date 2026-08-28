import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeGroupMeshesByMaterial } from '../../src/scene/MeshMergeUtils';

describe('mergeGroupMeshesByMaterial', () => {
  it('merges multiple meshes sharing one material into a single mesh', () => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.set(i, 0, 0);
      group.add(mesh);
    }
    mergeGroupMeshesByMaterial(group);
    const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(meshes.length).toBe(1);
  });

  it('leaves meshes with different materials unmerged', () => {
    const group = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matA));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), matB));
    mergeGroupMeshesByMaterial(group);
    const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh);
    expect(meshes.length).toBe(2);
  });
});
