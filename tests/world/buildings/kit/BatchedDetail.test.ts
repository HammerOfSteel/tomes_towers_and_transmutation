import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BatchedDetailRegistry,
  buildBatchedDetails,
  type DetailRecord,
} from '@/world/buildings/kit/BatchedDetail';

function makeMaterial(color = '#94a3b8'): THREE.Material {
  return new THREE.MeshStandardMaterial({ color, roughness: 1 });
}

function makeTransform(position: THREE.Vector3, rotationY = 0, scale = new THREE.Vector3(1, 1, 1)): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    scale,
  );
}

function expectMatrixClose(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index] ?? 0, 6);
  });
}

function makeRockGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.62, 0,
    -0.55, 0.08, 0.34,
    0.58, 0.02, 0.28,
    0.34, -0.42, -0.5,
    -0.38, -0.36, -0.46,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0.5, 1,
    0, 0.68,
    1, 0.62,
    0.86, 0,
    0.14, 0,
  ], 2));
  geometry.setIndex([
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 1,
    1, 4, 3,
    1, 3, 2,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function countGeometryTriangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  return geometry.getAttribute('position').count / 3;
}

function fallbackMeshes(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
}

function countBatchedMeshTriangles(mesh: THREE.BatchedMesh): number {
  let total = 0;
  for (let instanceId = 0; instanceId < mesh.instanceCount; instanceId++) {
    const geometryId = mesh.getGeometryIdAt(instanceId);
    const range = mesh.getGeometryRangeAt(geometryId);
    expect(range).not.toBeNull();
    total += (range?.count ?? 0) / 3;
  }
  return total;
}

function countObjectTriangles(object: THREE.Object3D): number {
  if (object instanceof THREE.BatchedMesh) {
    return countBatchedMeshTriangles(object);
  }

  let total = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    total += countGeometryTriangles(child.geometry);
  });
  return total;
}

function countResultTriangles(result: { objects: THREE.Object3D[] }): number {
  return result.objects.reduce((total, object) => total + countObjectTriangles(object), 0);
}

describe('BatchedDetailRegistry', () => {
  it('groups same-material records into one BatchedMesh under jsdom and preserves per-instance transforms', () => {
    const material = makeMaterial();
    const boxMatrix = makeTransform(new THREE.Vector3(2, 1, -3), Math.PI / 6);
    const rockMatrix = makeTransform(new THREE.Vector3(-1.5, 0.5, 4), Math.PI / 3, new THREE.Vector3(1.2, 0.8, 1.1));
    const registry = new BatchedDetailRegistry();

    registry.add({ id: 'box', geometry: new THREE.BoxGeometry(1, 1, 1), material, matrix: boxMatrix });
    registry.add({ id: 'rock', geometry: makeRockGeometry(), material, matrix: rockMatrix });

    const result = registry.build();

    expect(result.usedBatching).toBe(true);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]).toBeInstanceOf(THREE.BatchedMesh);

    const batch = result.objects[0] as THREE.BatchedMesh;
    expect(batch.material).toBe(material);
    expect(batch.instanceCount).toBe(2);
    expect(batch.getGeometryIdAt(0)).not.toBe(batch.getGeometryIdAt(1));

    const actualBoxMatrix = new THREE.Matrix4();
    const actualRockMatrix = new THREE.Matrix4();
    expect(batch.getMatrixAt(0, actualBoxMatrix)).toBe(actualBoxMatrix);
    expect(batch.getMatrixAt(1, actualRockMatrix)).toBe(actualRockMatrix);
    expectMatrixClose(actualBoxMatrix, boxMatrix);
    expectMatrixClose(actualRockMatrix, rockMatrix);
  });

  it('separates records that use different material references into distinct output objects', () => {
    const stone = makeMaterial('#94a3b8');
    const moss = makeMaterial('#65a30d');
    const result = buildBatchedDetails([
      { geometry: new THREE.BoxGeometry(1, 1, 1), material: stone },
      { geometry: makeRockGeometry(), material: moss },
    ]);

    expect(result.usedBatching).toBe(true);
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0]).toBeInstanceOf(THREE.BatchedMesh);
    expect(result.objects[1]).toBeInstanceOf(THREE.BatchedMesh);
    expect((result.objects[0] as THREE.BatchedMesh).material).toBe(stone);
    expect((result.objects[1] as THREE.BatchedMesh).material).toBe(moss);
  });

  it('keeps heterogeneous geometry records in the result without dropping triangles', () => {
    const material = makeMaterial();
    const records: DetailRecord[] = [
      { geometry: new THREE.BoxGeometry(1, 1, 1), material, matrix: makeTransform(new THREE.Vector3(-2, 0, 0)) },
      { geometry: makeRockGeometry(), material, matrix: makeTransform(new THREE.Vector3(0, 0.2, 0), Math.PI / 5) },
      { geometry: new THREE.ConeGeometry(0.45, 1.1, 7, 1), material, matrix: makeTransform(new THREE.Vector3(2, 0, 0)) },
    ];

    const result = buildBatchedDetails(records);

    expect(result.usedBatching).toBe(true);
    expect(result.objects).toHaveLength(1);
    expect(countResultTriangles(result)).toBe(
      records.reduce((total, record) => total + countGeometryTriangles(record.geometry), 0),
    );
  });

  it('can fall back to plain material-grouped THREE.Group output when forced', () => {
    const stone = makeMaterial('#78716c');
    const ivy = makeMaterial('#4d7c0f');
    const stoneMatrix = makeTransform(new THREE.Vector3(1, 0, 0), 0, new THREE.Vector3(1.1, 1, 0.9));
    const ivyMatrix = makeTransform(new THREE.Vector3(-1, 0.5, 2), Math.PI / 4);
    const result = buildBatchedDetails([
      { id: 'stone-a', geometry: new THREE.BoxGeometry(1, 1, 1), material: stone, matrix: stoneMatrix },
      { id: 'stone-b', geometry: makeRockGeometry(), material: stone },
      { id: 'ivy', geometry: new THREE.PlaneGeometry(0.5, 0.75), material: ivy, matrix: ivyMatrix },
    ], { forceFallback: true });

    expect(result.usedBatching).toBe(false);
    expect(result.objects).toHaveLength(2);
    result.objects.forEach(object => expect(object).toBeInstanceOf(THREE.Group));

    const stoneGroup = result.objects[0] as THREE.Group;
    const ivyGroup = result.objects[1] as THREE.Group;
    const stoneMeshes = fallbackMeshes(stoneGroup);
    const ivyMeshes = fallbackMeshes(ivyGroup);

    expect(stoneMeshes).toHaveLength(2);
    expect(ivyMeshes).toHaveLength(1);
    expect(stoneMeshes.every(mesh => mesh.material === stone)).toBe(true);
    expect(ivyMeshes.every(mesh => mesh.material === ivy)).toBe(true);
    expect(stoneMeshes[0]).not.toBeInstanceOf(THREE.BatchedMesh);
    expectMatrixClose(stoneMeshes[0]!.matrix, stoneMatrix);
    expectMatrixClose(ivyMeshes[0]!.matrix, ivyMatrix);
  });

  it('returns a sensible empty result and handles a single record', () => {
    const empty = buildBatchedDetails([]);
    expect(empty.usedBatching).toBe(false);
    expect(empty.objects).toEqual([]);

    const material = makeMaterial();
    const matrix = makeTransform(new THREE.Vector3(0, 2, 0), Math.PI / 8);
    const single = buildBatchedDetails([
      { geometry: new THREE.BoxGeometry(1, 2, 1), material, matrix },
    ]);

    expect(single.usedBatching).toBe(true);
    expect(single.objects).toHaveLength(1);
    expect(single.objects[0]).toBeInstanceOf(THREE.BatchedMesh);

    const batch = single.objects[0] as THREE.BatchedMesh;
    expect(batch.instanceCount).toBe(1);
    const actualMatrix = new THREE.Matrix4();
    batch.getMatrixAt(0, actualMatrix);
    expectMatrixClose(actualMatrix, matrix);
  });

  it('spills one material group into multiple BatchedMesh objects when batch capacities are exceeded', () => {
    const material = makeMaterial();
    const records = Array.from({ length: 5 }, (_, index) => ({
      id: `detail-${index}`,
      geometry: new THREE.BoxGeometry(1 + index * 0.05, 1, 1),
      material,
      matrix: makeTransform(new THREE.Vector3(index * 1.5, 0, 0)),
    }));
    const sample = records[0]!.geometry;
    const expectedTriangles = records.reduce((total, record) => total + countGeometryTriangles(record.geometry), 0);

    const result = buildBatchedDetails(records, {
      maxInstanceCount: 8,
      maxVertexCount: sample.getAttribute('position').count * 2,
      maxIndexCount: (sample.getIndex()?.count ?? 0) * 2,
    });

    expect(result.usedBatching).toBe(true);
    expect(result.objects).toHaveLength(3);
    expect(result.objects.every(object => object instanceof THREE.BatchedMesh)).toBe(true);
    expect((result.objects[0] as THREE.BatchedMesh).instanceCount).toBe(2);
    expect((result.objects[1] as THREE.BatchedMesh).instanceCount).toBe(2);
    expect((result.objects[2] as THREE.BatchedMesh).instanceCount).toBe(1);
    expect(countResultTriangles(result)).toBe(expectedTriangles);
  });
});
