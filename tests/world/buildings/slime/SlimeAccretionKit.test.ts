import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSlimeMaterialSet } from '@/world/buildings/slime/SlimeMaterials';
import {
  buildGelLipCourse,
  buildMembraneSheet,
  buildTendrilBridge,
  buildFacetedDripRun,
  buildGelLensInfill,
  buildPuddleSkirtTiles,
  buildContainedGelVat,
} from '@/world/buildings/slime/SlimeAccretionKit';

function makeMaterials() {
  return createSlimeMaterialSet('mint_green');
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function countVerts(root: THREE.Object3D): number {
  return collectMeshes(root).reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
}

function hasNaN(root: THREE.Object3D): boolean {
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count * 3; index++) {
      if (!Number.isFinite(position.array[index])) return true;
    }
  }
  return false;
}

function findBiggestMesh(root: THREE.Object3D): THREE.Mesh {
  const meshes = collectMeshes(root);
  expect(meshes.length).toBeGreaterThan(0);
  return meshes.reduce((biggest, mesh) => (
    mesh.geometry.getAttribute('position').count > biggest.geometry.getAttribute('position').count ? mesh : biggest
  ));
}

function snapshot(root: THREE.Object3D): string {
  root.updateMatrixWorld(true);
  const parts: string[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(object);
    const positions = object.geometry.getAttribute('position');
    parts.push([
      object.name,
      object.geometry.type,
      positions.count,
      box.min.toArray().map(value => value.toFixed(3)).join(','),
      box.max.toArray().map(value => value.toFixed(3)).join(','),
    ].join('|'));
  });
  return parts.sort().join('::');
}

function radialProfile(
  mesh: THREE.Mesh,
  start: THREE.Vector3,
  end: THREE.Vector3,
): Array<{ longitudinal: number; radius: number }> {
  mesh.updateMatrixWorld(true);
  const axis = end.clone().sub(start);
  const length = axis.length();
  expect(length).toBeGreaterThan(0);
  axis.normalize();

  const vertex = new THREE.Vector3();
  const profileBySlice = new Map<string, { longitudinal: number; radius: number }>();
  const position = mesh.geometry.getAttribute('position');

  for (let index = 0; index < position.count; index++) {
    vertex.set(
      position.getX(index),
      position.getY(index),
      position.getZ(index),
    ).applyMatrix4(mesh.matrixWorld);
    const offset = vertex.clone().sub(start);
    const longitudinal = THREE.MathUtils.clamp(offset.dot(axis), 0, length);
    const onAxis = start.clone().addScaledVector(axis, longitudinal);
    const radius = vertex.distanceTo(onAxis);
    const key = longitudinal.toFixed(3);
    const current = profileBySlice.get(key);
    if (!current || radius > current.radius) {
      profileBySlice.set(key, { longitudinal, radius });
    }
  }

  return [...profileBySlice.values()]
    .filter(sample => sample.longitudinal > length * 0.05 && sample.longitudinal < length * 0.95)
    .sort((left, right) => left.longitudinal - right.longitudinal);
}

function buildCases(seed = 37) {
  const materials = makeMaterials();
  return [
    {
      name: 'gel-lip-course',
      build: () => buildGelLipCourse({
        seed,
        start: new THREE.Vector3(-0.9, 0.2, 0),
        end: new THREE.Vector3(0.9, 0.2, 0),
        outwardNormal: new THREE.Vector3(0, 0, 1),
        material: materials.hardenedGel,
      }),
    },
    {
      name: 'membrane-sheet',
      build: () => buildMembraneSheet({
        seed,
        corners: [
          new THREE.Vector3(-0.8, 1.05, 0),
          new THREE.Vector3(0.8, 1.05, 0),
          new THREE.Vector3(0.7, 0.05, 0),
          new THREE.Vector3(-0.7, 0.05, 0),
        ],
        membraneMaterial: materials.containedGel,
        rimMaterial: materials.hardenedGel,
        ribMaterial: materials.gelDark,
      }),
    },
    {
      name: 'tendril-bridge',
      build: () => buildTendrilBridge({
        seed,
        start: new THREE.Vector3(0, 0, 0),
        end: new THREE.Vector3(0, 0, 2.4),
        material: materials.gelDark,
        anchorMaterial: materials.hardenedGel,
      }),
    },
    {
      name: 'faceted-drip-run',
      build: () => buildFacetedDripRun({
        seed,
        start: new THREE.Vector3(-0.75, 0, 0),
        end: new THREE.Vector3(0.75, 0, 0),
        material: materials.gel,
      }),
    },
    {
      name: 'gel-lens-infill',
      build: () => buildGelLensInfill({
        seed,
        width: 0.72,
        straightHeight: 0.92,
        pointHeight: 0.32,
        openingShape: 'arch',
        material: materials.containedGel,
        rimMaterial: materials.gelDark,
        ribMaterial: materials.hardenedGel,
      }),
    },
    {
      name: 'puddle-skirt-tiles',
      build: () => buildPuddleSkirtTiles({
        seed,
        center: new THREE.Vector3(0, 0, 0),
        radiusX: 1.2,
        radiusZ: 0.95,
        material: materials.hardenedGel,
      }),
    },
    {
      name: 'contained-gel-vat',
      build: () => buildContainedGelVat({
        seed,
        radius: 0.42,
        height: 0.95,
        frameMaterial: materials.hardenedGel,
        bandMaterial: materials.gelDark,
        gelMaterial: materials.containedGel,
        baseMaterial: materials.wetStain,
      }),
    },
  ] as const;
}

describe('SlimeAccretionKit', () => {
  it('returns named non-empty finite geometry for all seven builders', () => {
    for (const testCase of buildCases()) {
      const group = testCase.build();
      expect(group).toBeInstanceOf(THREE.Group);
      expect(group.name).toBe(testCase.name);
      expect(collectMeshes(group).length).toBeGreaterThan(0);
      expect(countVerts(group)).toBeGreaterThan(0);
      expect(hasNaN(group)).toBe(false);
    }
  });

  it('is deterministic for the same seed across all seven builders', () => {
    for (const testCase of buildCases(73)) {
      const first = testCase.build();
      const second = testCase.build();
      expect(snapshot(first)).toBe(snapshot(second));
    }
  });

  it('avoids large sphere or icosahedron domes as dominant or supporting geometry', () => {
    for (const testCase of buildCases()) {
      const group = testCase.build();
      const dominantMesh = findBiggestMesh(group);
      expect(['SphereGeometry', 'IcosahedronGeometry']).not.toContain(dominantMesh.geometry.type);

      let sawLargeRoundPrimitive = false;
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.geometry.type !== 'SphereGeometry' && object.geometry.type !== 'IcosahedronGeometry') return;
        object.geometry.computeBoundingSphere();
        if ((object.geometry.boundingSphere?.radius ?? 0) > 0.25) {
          sawLargeRoundPrimitive = true;
        }
      });
      expect(sawLargeRoundPrimitive).toBe(false);
    }
  });

  it('gives membrane sheets real rim and rib construction rather than a single flat plane', () => {
    const membrane = buildCases()[1].build();
    const meshes = collectMeshes(membrane);
    expect(meshes.length).toBeGreaterThan(1);
    expect(membrane.getObjectByName('membrane-rim')).toBeTruthy();
    expect(membrane.getObjectByName('membrane-rib-0')).toBeTruthy();
  });

  it('gives gel lens infill its own rim and rib geometry while staying a set-back pane module', () => {
    const lens = buildCases()[4].build();
    const meshes = collectMeshes(lens);
    expect(meshes.length).toBeGreaterThan(1);
    expect(lens.getObjectByName('gel-lens-pane')).toBeTruthy();
    expect(lens.getObjectByName('gel-lens-rim')).toBeTruthy();
    expect(lens.getObjectByName('gel-lens-rib-0')).toBeTruthy();
  });

  it('builds a tendril bridge whose radius genuinely varies along its length', () => {
    const start = new THREE.Vector3(0, 0, 0);
    const end = new THREE.Vector3(0, 0, 2.4);
    const tendril = buildTendrilBridge({
      seed: 91,
      start,
      end,
      material: makeMaterials().gelDark,
      anchorMaterial: makeMaterials().hardenedGel,
    });
    tendril.updateMatrixWorld(true);

    const body = tendril.getObjectByName('tendril-bridge-body');
    expect(body).toBeInstanceOf(THREE.Mesh);

    const profile = radialProfile(body as THREE.Mesh, start, end);
    expect(profile.length).toBeGreaterThanOrEqual(3);

    const first = profile[0]!.radius;
    const middle = profile[Math.floor(profile.length / 2)]!.radius;
    const last = profile[profile.length - 1]!.radius;

    expect(new Set([first, middle, last].map(value => value.toFixed(3))).size).toBeGreaterThan(1);
    expect(middle).toBeGreaterThan(first + 0.005);
    expect(middle).toBeGreaterThan(last + 0.005);
  });
});
