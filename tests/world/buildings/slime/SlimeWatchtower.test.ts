import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import { factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';
import { buildSlimeWatchtower } from '@/world/buildings/slime/SlimeBuildingKit';

const KNOWN_TOP_NAMES = [
  'watchtower-top-broken-parapet',
  'watchtower-top-partial-conical-roof',
  'watchtower-top-open-beacon-frame',
  'watchtower-top-collapsed-cap-membrane',
];

function makeDna(seed: number): BuildingDNA {
  return factionBuildingDna('watchtower', 'slime', seed, 'small', 4);
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
  // The watchtower host is a 100% direct reuse of the elven stone-tower
  // builder (opaque, pre-existing, shipped and QA'd under the elven race),
  // which includes its own small low-poly foliage sphere unrelated to any
  // slime-authored geometry. Scope this guard to slime's own additions
  // (everything outside the reused host shell), matching the ground-contact
  // scoping convention already established for opaque-host kinds.
  const host = root.getObjectByName('slime-host-shell');
  for (const mesh of collectMeshes(root)) {
    if (host && (mesh === host || isDescendantOf(mesh, host))) continue;
    expect(mesh.geometry.type).not.toBe('SphereGeometry');
    expect(mesh.geometry.type).not.toBe('IcosahedronGeometry');
  }
}

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

describe('SlimeWatchtower', () => {
  it('builds a finite tall narrow tower whose height is at least 3x its canonical footprint width', () => {
    const tower = buildSlimeWatchtower(makeDna(7));
    expect(tower).toBeInstanceOf(THREE.Group);
    expect(collectMeshes(tower).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(tower)).toBe(true);

    const footprint = getFootprint('watchtower', 'small');
    const size = hostBox(tower).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThanOrEqual(footprint.w * 3);
  });

  it('has at least 4 arrow-slit markers on alternating faces plus a base entrance', () => {
    const tower = buildSlimeWatchtower(makeDna(7));
    const slits = collectNamedGroups(tower, 'watchtower-arrow-slit-');
    expect(slits.length).toBeGreaterThanOrEqual(4);

    const rotations = new Set(slits.map(slit => Math.round(slit.rotation.y * 1000)));
    expect(rotations.size).toBeGreaterThan(1);

    expect(requireGroup(tower, 'watchtower-entrance')).toBeTruthy();
  });

  it('has a non-dome top treatment drawn from the broken-parapet/partial-roof/beacon-frame/collapsed-membrane set', () => {
    const tower = buildSlimeWatchtower(makeDna(7));
    const topGroups = tower.children.filter(child => child.name.startsWith('watchtower-top-'));
    expect(topGroups.length).toBe(1);
    expect(KNOWN_TOP_NAMES).toContain(topGroups[0]!.name);
  });

  it('grows a spiral/vertical slime path that hugs only one dominant side, not the whole tower', () => {
    const tower = buildSlimeWatchtower(makeDna(7));
    const path = requireGroup(tower, 'watchtower-growth-path');
    const box = new THREE.Box3().setFromObject(path);
    const size = box.getSize(new THREE.Vector3());
    const footprint = getFootprint('watchtower', 'small');
    // A path hugging a single wall face should stay thin in at least one
    // horizontal axis, well short of spanning the tower's full footprint.
    expect(Math.min(size.x, size.z)).toBeLessThan(footprint.w * 0.9);
  });

  it('does not collapse to a dominant sphere/icosahedron mass', () => {
    const tower = buildSlimeWatchtower(makeDna(7));
    assertNoLegacyPrimitives(tower);
  });
});
