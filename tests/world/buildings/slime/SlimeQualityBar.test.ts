import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
import { SLIME_BUILDING_BUILDERS, type BuildingKitKind } from '@/world/buildings/slime/SlimeBuildingKit';

const SEED = 33;

// One field per kind, taken directly from that kind's own `*Variation`
// interface in SlimeBuildingKit.ts, that always encodes an asymmetric or
// dominant-side procedural choice (a corner/face/offset, or -- for the two
// opaque-host kinds whose signature extras are inherently symmetric
// (chapel/villa) -- a non-uniform growth/exposure treatment roll). Presence
// of a defined value here is this suite's "asymmetry marker" check.
const ASYMMETRY_FIELD_BY_KIND: Record<BuildingKitKind, string> = {
  house: 'dominantGrowthSide',
  terraced: 'doorOffset',
  shop: 'bayOffset',
  inn: 'signSide',
  blacksmith: 'workArchOffset',
  villa: 'elderExposure',
  chapel: 'apseTreatment',
  watchtower: 'growthFace',
};

function makeDna(kind: BuildingKitKind, seed: number): BuildingDNA {
  return factionBuildingDna(kind, 'slime', seed);
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function collectGroups(root: THREE.Object3D): THREE.Group[] {
  const groups: THREE.Group[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Group) groups.push(object);
  });
  return groups;
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

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/** A rough signature of a built kind's shape, cheap enough to compare across all 8 kinds. */
function signatureOf(root: THREE.Object3D): { meshCount: number; groupNames: string; size: string } {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const groupNames = collectGroups(root)
    .map(group => group.name)
    .filter(name => name.length > 0)
    .sort()
    .join('|');
  return {
    meshCount: collectMeshes(root).length,
    groupNames,
    size: `${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)}`,
  };
}

const KINDS = Object.keys(SLIME_BUILDING_BUILDERS) as BuildingKitKind[];

describe('Slime quality bar', () => {
  it.each(KINDS)('%s: builds non-empty finite geometry', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    expect(built).toBeInstanceOf(THREE.Group);
    expect(collectMeshes(built).length).toBeGreaterThan(0);
    expect(hasOnlyFinitePositions(built)).toBe(true);
  });

  it.each(KINDS)('%s: names its top-level group and blueprint metadata by kind', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    expect(built.name).toBe(`slime-${kind}`);
    expect(built.userData.buildingKind).toBe(kind);
    expect(built.userData.kindBlueprint).toBeTruthy();
    expect(built.userData.kindVariation).toBeTruthy();
  });

  it.each(KINDS)('%s: adds at least one kind-specific named extras group beyond the shared host/overlay scaffold', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    const kindSpecificGroups = built.children.filter(
      child => child.name !== 'slime-host-shell' && child.name !== 'slime-overlays' && child.name.length > 0,
    );
    expect(kindSpecificGroups.length).toBeGreaterThan(0);
    for (const group of kindSpecificGroups) {
      expect(group.name.toLowerCase()).not.toContain('blob');
    }
  });

  it.each(KINDS)('%s: has at least one module anchored near the host\'s own ground line', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    const host = built.getObjectByName('slime-host-shell');
    expect(host, 'slime-host-shell should exist').toBeTruthy();
    const hostBox = new THREE.Box3().setFromObject(host!);

    const groundAnchored = collectGroups(built).some(group => {
      if (group === host || (host && isDescendantOf(group, host))) return false;
      if (group.children.length === 0) return false;
      const box = new THREE.Box3().setFromObject(group);
      if (!Number.isFinite(box.min.y)) return false;
      return box.min.y <= hostBox.min.y + 0.35;
    });
    expect(groundAnchored, `${kind} should have at least one non-host group anchored near the ground`).toBe(true);
  });

  it.each(KINDS)('%s: rolls a defined asymmetry/dominant-growth-side marker', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    const field = ASYMMETRY_FIELD_BY_KIND[kind];
    const variation = built.userData.kindVariation as Record<string, unknown>;
    expect(variation, `${kind} should expose a kindVariation object`).toBeTruthy();
    expect(variation[field], `${kind} should define variation.${field}`).toBeDefined();
  });

  it.each(KINDS)('%s: contains no raw legacy-blob primitive meshes (Sphere/Icosahedron) outside the reused opaque host', kind => {
    const built = SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED));
    const host = built.getObjectByName('slime-host-shell');
    for (const mesh of collectMeshes(built)) {
      if (host && (mesh === host || isDescendantOf(mesh, host))) continue;
      expect(mesh.geometry.type).not.toBe('SphereGeometry');
      expect(mesh.geometry.type).not.toBe('IcosahedronGeometry');
    }
  });

  it('does not collapse all 8 kinds to an identical mesh-count/group-name/size signature', () => {
    const signatures = KINDS.map(kind => signatureOf(SLIME_BUILDING_BUILDERS[kind](makeDna(kind, SEED))));
    const unique = new Set(signatures.map(sig => `${sig.meshCount}|${sig.size}|${sig.groupNames}`));
    expect(unique.size).toBe(KINDS.length);
  });
});
