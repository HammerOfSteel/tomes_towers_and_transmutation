import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
import {
  buildHumanHouse,
  buildHumanTerraced,
  buildHumanVilla,
  buildHumanInn,
  buildHumanShop,
  buildHumanBlacksmith,
  buildHumanChapel,
  buildHumanWatchtower,
} from '@/world/buildings/human/HumanBuildingsKit';

const KIND_BUILDERS = {
  house: buildHumanHouse,
  terraced: buildHumanTerraced,
  villa: buildHumanVilla,
  inn: buildHumanInn,
  shop: buildHumanShop,
  blacksmith: buildHumanBlacksmith,
  chapel: buildHumanChapel,
  watchtower: buildHumanWatchtower,
} as const;

type Kind = keyof typeof KIND_BUILDERS;
const KINDS = Object.keys(KIND_BUILDERS) as Kind[];
const SEEDS = [1, 2, 3, 4, 5, 42, 99];
const FACTIONS = ['human_rural', 'human_town', 'human_noble'] as const;

function dnaFor(kind: Kind, faction: (typeof FACTIONS)[number], seed: number) {
  return factionBuildingDna(kind, faction, seed);
}

function collectMeshes(group: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  return meshes;
}

function assertNoNaN(group: THREE.Object3D, label: string): void {
  group.traverse((obj) => {
    expect(Number.isFinite(obj.position.x), `${label}: position.x finite`).toBe(true);
    expect(Number.isFinite(obj.position.y), `${label}: position.y finite`).toBe(true);
    expect(Number.isFinite(obj.position.z), `${label}: position.z finite`).toBe(true);
    if (obj instanceof THREE.Mesh) {
      obj.geometry.computeBoundingBox();
      const box = obj.geometry.boundingBox;
      if (box) {
        expect(Number.isFinite(box.min.x) && Number.isFinite(box.max.x), `${label}: geometry bbox finite`).toBe(true);
      }
    }
  });
}

describe('HumanBuildingsKit: cross-kind sweep', () => {
  it.each(KINDS)('builds %s for every seed with real, grounded, finite geometry', (kind) => {
    for (const seed of SEEDS) {
      const dna = dnaFor(kind, 'human_town', seed);
      const group = KIND_BUILDERS[kind](dna);
      expect(group).toBeInstanceOf(THREE.Group);
      const meshes = collectMeshes(group);
      expect(meshes.length, `${kind} seed ${seed} should have real geometry`).toBeGreaterThan(10);
      assertNoNaN(group, `${kind} seed ${seed}`);

      // Ground contact (doctrine Rule 6): overall bounding box should touch
      // (or nearly touch) y=0 -- no floating building.
      const box = new THREE.Box3().setFromObject(group);
      expect(box.min.y, `${kind} seed ${seed} should touch the ground`).toBeLessThan(0.5);
    }
  });

  it.each(FACTIONS)('builds every kind for the %s sub-faction without throwing', (faction) => {
    for (const kind of KINDS) {
      const dna = dnaFor(kind, faction, 7);
      expect(() => KIND_BUILDERS[kind](dna)).not.toThrow();
    }
  });

  it.each(KINDS)('is deterministic for %s given the same seed', (kind) => {
    const dna = dnaFor(kind, 'human_town', 123);
    const flatten = (g: THREE.Object3D) => {
      const positions: number[] = [];
      g.traverse((obj) => positions.push(obj.position.x, obj.position.y, obj.position.z));
      return positions;
    };
    expect(flatten(KIND_BUILDERS[kind](dna))).toEqual(flatten(KIND_BUILDERS[kind](dna)));
  });

  it.each(KINDS)('%s has at least one proud timber-frame member (posts sitting forward of the wall plane)', (kind) => {
    const dna = dnaFor(kind, 'human_town', 11);
    const group = KIND_BUILDERS[kind](dna);
    let postCount = 0;
    group.traverse((obj: THREE.Object3D) => {
      if (obj.name === 'post' || obj.name.startsWith('post-')) postCount++;
    });
    expect(postCount, `${kind} should include real TimberFrame posts somewhere (ground floor or upper storey)`).toBeGreaterThan(0);
  });

  it.each(KINDS)('%s exposes at least one five-piece door or window opening', (kind) => {
    const dna = dnaFor(kind, 'human_town', 22);
    const group = KIND_BUILDERS[kind](dna);
    let recess = false;
    let surround = false;
    let glazingOrLeaf = false;
    group.traverse((obj: THREE.Object3D) => {
      if (obj.name === 'recess') recess = true;
      if (obj.name === 'surround' || obj.name === 'arch-surround' || obj.name === 'lintel') surround = true;
      if (obj.name === 'glazing' || obj.name === 'door-leaf') glazingOrLeaf = true;
    });
    expect(recess, `${kind}: recess piece`).toBe(true);
    expect(surround, `${kind}: surround piece`).toBe(true);
    expect(glazingOrLeaf, `${kind}: glazing/door-leaf piece`).toBe(true);
  });
});

describe('HumanBuildingsKit: per-kind asymmetry (doctrine Rule 7)', () => {
  it.each(KINDS)('%s is not perfectly mirror-symmetric across its front facade for at least one seed in a small sweep', (kind) => {
    // Sample a handful of seeds and require that at least one produces an
    // asymmetric front -- avoids a flaky single-seed assertion while still
    // enforcing the doctrine's mandatory-asymmetry rule across the family.
    let anyAsymmetric = false;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const dna = dnaFor(kind, 'human_town', seed);
      const group = KIND_BUILDERS[kind](dna);
      const xs: number[] = [];
      group.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) xs.push(Math.round(obj.position.x * 100) / 100);
      });
      const sorted = [...xs].sort((a, b) => a - b);
      const mirrored = xs.map((x) => -x).sort((a, b) => a - b);
      const isSymmetric = sorted.length === mirrored.length && sorted.every((v, i) => Math.abs(v - mirrored[i]!) < 1e-6);
      if (!isSymmetric) {
        anyAsymmetric = true;
        break;
      }
    }
    expect(anyAsymmetric, `${kind} should be asymmetric for at least one of several seeds`).toBe(true);
  });
});
