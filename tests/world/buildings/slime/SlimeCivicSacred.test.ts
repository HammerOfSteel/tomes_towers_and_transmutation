import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import { factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';
import { buildSlimeVilla, buildSlimeChapel } from '@/world/buildings/slime/SlimeBuildingKit';

function makeDna(kind: 'villa' | 'chapel', seed: number): BuildingDNA {
  return factionBuildingDna(kind, 'slime', seed, kind === 'villa' ? 'large' : 'medium', kind === 'villa' ? 3 : 1);
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

function assertNoLegacyPrimitives(root: THREE.Object3D): void {
  for (const mesh of collectMeshes(root)) {
    expect(mesh.geometry.type).not.toBe('SphereGeometry');
    expect(mesh.geometry.type).not.toBe('IcosahedronGeometry');
  }
}

describe('SlimeVilla', () => {
  it('builds a finite 3-storey manor whose footprint matches the canonical villa proportions', () => {
    const villa = buildSlimeVilla(makeDna('villa', 11));
    expect(villa).toBeInstanceOf(THREE.Group);
    expect(collectMeshes(villa).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(villa)).toBe(true);

    const footprint = getFootprint('villa', 'large');
    const size = hostBox(villa).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(footprint.w * 0.5);
    expect(size.z).toBeGreaterThan(footprint.d * 0.5);
    expect(size.y).toBeGreaterThan(6);
  });

  it('retains multiple real facade openings and adds a visible elder-chamber gel motif', () => {
    const villa = buildSlimeVilla(makeDna('villa', 11));
    const host = requireGroup(villa, 'slime-host-shell');
    const windows = collectNamedGroups(host, 'window-opening-');
    const doors = collectNamedGroups(host, 'door-opening-');
    expect(windows.length).toBeGreaterThanOrEqual(4);
    expect(doors.length).toBeGreaterThanOrEqual(1);

    expect(requireGroup(villa, 'villa-elder-ring')).toBeTruthy();
    expect(requireGroup(villa, 'villa-coral-crown')).toBeTruthy();
  });

  it('does not collapse to a dominant sphere/icosahedron mass', () => {
    const villa = buildSlimeVilla(makeDna('villa', 11));
    assertNoLegacyPrimitives(villa);
  });
});

describe('SlimeChapel', () => {
  it('builds a finite long-nave chapel whose footprint matches the canonical chapel proportions', () => {
    const chapel = buildSlimeChapel(makeDna('chapel', 21));
    expect(chapel).toBeInstanceOf(THREE.Group);
    expect(collectMeshes(chapel).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(chapel)).toBe(true);

    const footprint = getFootprint('chapel', 'medium');
    const size = hostBox(chapel).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x);
    expect(size.z).toBeGreaterThan(footprint.d * 0.5);
  });

  it('keeps a recognisable front entrance and at least 4 lancet/side windows', () => {
    const chapel = buildSlimeChapel(makeDna('chapel', 21));
    const lancets = collectNamedGroups(chapel, 'chapel-lancet-');
    expect(lancets.length).toBeGreaterThanOrEqual(4);
    expect(requireGroup(chapel, 'chapel-entrance')).toBeTruthy();
  });

  it('has a pulse-pool focal module and a choir-screen tendril motif, not a free-floating orb', () => {
    const chapel = buildSlimeChapel(makeDna('chapel', 21));
    const pool = requireGroup(chapel, 'chapel-pulse-pool');
    const rim = pool.getObjectByName('chapel-pulse-pool-rim');
    expect(rim, 'pulse pool should have a real rim, not a free-floating orb').toBeTruthy();
    expect(requireGroup(chapel, 'chapel-choir-screen')).toBeTruthy();
  });

  it('does not collapse to a dominant sphere/icosahedron mass', () => {
    const chapel = buildSlimeChapel(makeDna('chapel', 21));
    assertNoLegacyPrimitives(chapel);
  });
});
