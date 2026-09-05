import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import { factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';
import { buildSlimeBlacksmith } from '@/world/buildings/slime/SlimeBuildingKit';

const SEED = 7;

function makeDna(seed: number): BuildingDNA {
  return factionBuildingDna('blacksmith', 'slime', seed, 'medium', 1);
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function hasOnlyFinitePositions(root: THREE.Object3D): boolean {
  return collectMeshes(root).every(mesh => {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count * 3; index++) {
      if (!Number.isFinite(position.array[index])) return false;
    }
    return true;
  });
}

function collectNamedGroups(root: THREE.Object3D, prefix: string): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Group && object.name.startsWith(prefix)) groups.push(object);
  });
  return groups;
}

function requireGroup<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  expect(object, `${name} should exist`).toBeTruthy();
  return object as T;
}

function hostBox(root: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(requireGroup(root, 'slime-host-shell'));
}

describe('SlimeBlacksmith', () => {
  it('builds a finite forge group whose footprint matches the canonical blacksmith proportions', () => {
    const forge = buildSlimeBlacksmith(makeDna(SEED));
    expect(forge).toBeInstanceOf(THREE.Group);
    expect(collectMeshes(forge).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(forge)).toBe(true);

    const footprint = getFootprint('blacksmith', 'medium');
    const size = hostBox(forge).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(footprint.w * 0.5);
    expect(size.z).toBeGreaterThan(footprint.d * 0.5);
  });

  it('gives the forge a broad framed work arch that keeps the front recognisable', () => {
    const forge = buildSlimeBlacksmith(makeDna(SEED));
    const host = requireGroup(forge, 'slime-host-shell');
    const doors = collectNamedGroups(host, 'door-opening-');
    expect(doors.length).toBeGreaterThanOrEqual(1);

    const box = hostBox(forge);
    const widestDoor = Math.max(...doors.map(door => new THREE.Box3().setFromObject(door).getSize(new THREE.Vector3()).x));
    expect(widestDoor).toBeGreaterThan(1.4);
    expect(box.max.z).toBeGreaterThan(box.min.z);
  });

  it('adds a real vent/chimney silhouette, acid/mineral channel lips, and hardened secretion plate props', () => {
    const forge = buildSlimeBlacksmith(makeDna(SEED));
    expect(requireGroup(forge, 'blacksmith-vent-silhouette')).toBeTruthy();
    expect(requireGroup(forge, 'blacksmith-channel-lip')).toBeTruthy();
    expect(requireGroup(forge, 'blacksmith-plate-rack')).toBeTruthy();
    expect(requireGroup(forge, 'blacksmith-heat-source')).toBeTruthy();
  });

  it('gives both side vents grille/mullion divisions and a recessed reveal, not a plain hole', () => {
    const forge = buildSlimeBlacksmith(makeDna(SEED));
    const left = requireGroup(forge, 'blacksmith-vent-left');
    const right = requireGroup(forge, 'blacksmith-vent-right');

    for (const vent of [left, right]) {
      const division = vent.getObjectByName('division');
      expect(division, 'vent should have a division/mullion group').toBeTruthy();
      expect((division as THREE.Group).children.length).toBeGreaterThanOrEqual(2);
      expect(vent.getObjectByName('surround')).toBeTruthy();
    }
  });

  it('does not collapse to a dominant sphere/icosahedron mass and keeps ground-anchored extras above ground', () => {
    const forge = buildSlimeBlacksmith(makeDna(SEED));
    for (const mesh of collectMeshes(forge)) {
      expect(mesh.geometry.type).not.toBe('SphereGeometry');
      expect(mesh.geometry.type).not.toBe('IcosahedronGeometry');
    }
    for (const name of ['blacksmith-channel-lip', 'blacksmith-plate-rack', 'blacksmith-heat-source']) {
      const box = new THREE.Box3().setFromObject(requireGroup(forge, name));
      expect(box.min.y, `${name} should not sink below ground`).toBeGreaterThanOrEqual(-0.01);
    }
  });
});
