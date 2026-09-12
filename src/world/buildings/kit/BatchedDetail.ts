import * as THREE from 'three';

export interface DetailRecord {
  id?: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix?: THREE.Matrix4;
}

export interface BatchedDetailOptions {
  /**
   * Always use the plain Group/Mesh fallback, even if `THREE.BatchedMesh`
   * constructs successfully in the current environment.
   */
  forceFallback?: boolean;
  /**
   * Optional caller-supplied capability flag. Pass `false` from known
   * headless/no-WebGL contexts to skip probing BatchedMesh entirely.
   */
  supportsBatching?: boolean;
  /** Preferred per-batch vertex budget before spilling into another batch. */
  maxVertexCount?: number;
  /** Preferred per-batch index budget before spilling into another batch. */
  maxIndexCount?: number;
  /** Preferred per-batch instance budget before spilling into another batch. */
  maxInstanceCount?: number;
}

export interface BatchedDetailResult {
  usedBatching: boolean;
  objects: THREE.Object3D[];
}

interface GeometryLayoutInfo {
  compatibilityKey: string;
  vertexCount: number;
  indexCount: number;
}

interface PreparedDetailRecord {
  record: DetailRecord;
  matrix: THREE.Matrix4;
  geometryInfo: GeometryLayoutInfo;
}

interface MaterialBucket {
  material: THREE.Material;
  compatibilityOrder: string[];
  recordsByCompatibility: Map<string, PreparedDetailRecord[]>;
}

interface BatchedSegment {
  records: PreparedDetailRecord[];
  uniqueVertexCount: number;
  uniqueIndexCount: number;
  instanceCount: number;
}

const DEFAULT_MAX_INSTANCE_COUNT = 4096;
const DEFAULT_MAX_VERTEX_COUNT = 262_144;
const DEFAULT_MAX_INDEX_COUNT = 524_288;
const DEFAULT_MATRIX = new THREE.Matrix4();

let cachedBatchedMeshAvailability: boolean | undefined;

function cloneOrIdentityMatrix(matrix?: THREE.Matrix4): THREE.Matrix4 {
  return matrix?.clone() ?? DEFAULT_MATRIX.clone();
}

function normalizePositiveLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

function normalizeNonNegativeLimit(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 ? Math.floor(value!) : fallback;
}

function createGeometryCompatibilityKey(geometry: THREE.BufferGeometry): string {
  const indexMode = geometry.getIndex() ? 'indexed' : 'non-indexed';
  const attributes = Object.keys(geometry.attributes)
    .sort()
    .map((name) => {
      const attribute = geometry.getAttribute(name);
      return `${name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`;
    })
    .join('|');

  return `${indexMode}|${attributes}`;
}

function getGeometryLayoutInfo(
  geometry: THREE.BufferGeometry,
  cache: WeakMap<THREE.BufferGeometry, GeometryLayoutInfo>,
): GeometryLayoutInfo {
  const cached = cache.get(geometry);
  if (cached) return cached;

  const position = geometry.getAttribute('position');
  if (!position) {
    throw new Error('buildBatchedDetails(): detail geometry must define a position attribute');
  }

  const info: GeometryLayoutInfo = {
    compatibilityKey: createGeometryCompatibilityKey(geometry),
    vertexCount: position.count,
    indexCount: geometry.getIndex()?.count ?? 0,
  };
  cache.set(geometry, info);
  return info;
}

function ensureBounds(geometry: THREE.BufferGeometry): void {
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
}

function shouldUseBatching(options: BatchedDetailOptions): boolean {
  if (options.forceFallback) return false;
  if (options.supportsBatching !== undefined) return options.supportsBatching;
  if (cachedBatchedMeshAvailability !== undefined) return cachedBatchedMeshAvailability;
  if (typeof THREE.BatchedMesh !== 'function') {
    cachedBatchedMeshAvailability = false;
    return cachedBatchedMeshAvailability;
  }

  let material: THREE.Material | null = null;
  let mesh: THREE.BatchedMesh | null = null;
  try {
    material = new THREE.MeshBasicMaterial();
    mesh = new THREE.BatchedMesh(1, 3, 3, material);
    cachedBatchedMeshAvailability = mesh.isBatchedMesh === true;
  } catch {
    cachedBatchedMeshAvailability = false;
  } finally {
    mesh?.dispose();
    material?.dispose();
  }

  return cachedBatchedMeshAvailability;
}

function bucketRecords(
  records: readonly DetailRecord[],
  geometryInfoCache: WeakMap<THREE.BufferGeometry, GeometryLayoutInfo>,
): MaterialBucket[] {
  const buckets: MaterialBucket[] = [];
  const bucketsByMaterial = new WeakMap<THREE.Material, MaterialBucket>();

  for (const record of records) {
    let bucket = bucketsByMaterial.get(record.material);
    if (!bucket) {
      bucket = {
        material: record.material,
        compatibilityOrder: [],
        recordsByCompatibility: new Map<string, PreparedDetailRecord[]>(),
      };
      bucketsByMaterial.set(record.material, bucket);
      buckets.push(bucket);
    }

    const geometryInfo = getGeometryLayoutInfo(record.geometry, geometryInfoCache);
    const preparedRecord: PreparedDetailRecord = {
      record,
      matrix: cloneOrIdentityMatrix(record.matrix),
      geometryInfo,
    };

    let compatibilityRecords = bucket.recordsByCompatibility.get(geometryInfo.compatibilityKey);
    if (!compatibilityRecords) {
      compatibilityRecords = [];
      bucket.recordsByCompatibility.set(geometryInfo.compatibilityKey, compatibilityRecords);
      bucket.compatibilityOrder.push(geometryInfo.compatibilityKey);
    }

    compatibilityRecords.push(preparedRecord);
  }

  return buckets;
}

function createEmptySegment(): BatchedSegment {
  return {
    records: [],
    uniqueVertexCount: 0,
    uniqueIndexCount: 0,
    instanceCount: 0,
  };
}

function splitIntoSegments(
  preparedRecords: readonly PreparedDetailRecord[],
  options: Required<Pick<BatchedDetailOptions, 'maxVertexCount' | 'maxIndexCount' | 'maxInstanceCount'>>,
): BatchedSegment[] {
  const segments: BatchedSegment[] = [];
  let segment = createEmptySegment();
  let seenGeometries = new Set<THREE.BufferGeometry>();

  const pushSegment = (): void => {
    if (segment.records.length === 0) return;
    segments.push(segment);
    segment = createEmptySegment();
    seenGeometries = new Set<THREE.BufferGeometry>();
  };

  for (const preparedRecord of preparedRecords) {
    const geometry = preparedRecord.record.geometry;
    const isNewGeometry = !seenGeometries.has(geometry);
    const nextVertexCount = segment.uniqueVertexCount + (isNewGeometry ? preparedRecord.geometryInfo.vertexCount : 0);
    const nextIndexCount = segment.uniqueIndexCount + (isNewGeometry ? preparedRecord.geometryInfo.indexCount : 0);
    const nextInstanceCount = segment.instanceCount + 1;

    const wouldOverflow = segment.records.length > 0 && (
      nextVertexCount > options.maxVertexCount
      || nextIndexCount > options.maxIndexCount
      || nextInstanceCount > options.maxInstanceCount
    );

    if (wouldOverflow) {
      pushSegment();
    }

    segment.records.push(preparedRecord);
    segment.instanceCount++;
    if (!seenGeometries.has(geometry)) {
      seenGeometries.add(geometry);
      segment.uniqueVertexCount += preparedRecord.geometryInfo.vertexCount;
      segment.uniqueIndexCount += preparedRecord.geometryInfo.indexCount;
    }
  }

  pushSegment();
  return segments;
}

function buildFallbackGroups(records: readonly DetailRecord[]): THREE.Object3D[] {
  const groups: THREE.Object3D[] = [];
  const groupsByMaterial = new WeakMap<THREE.Material, THREE.Group>();

  for (const record of records) {
    let group = groupsByMaterial.get(record.material);
    if (!group) {
      group = new THREE.Group();
      group.name = 'batched-detail-fallback-group';
      group.userData.detailMode = 'fallback';
      group.userData.recordIds = [];
      groupsByMaterial.set(record.material, group);
      groups.push(group);
    }

    const mesh = new THREE.Mesh(record.geometry, record.material);
    mesh.name = record.id ?? '';
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(record.matrix ?? DEFAULT_MATRIX);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.userData.recordIds.push(record.id ?? null);
    group.add(mesh);
  }

  return groups;
}

function buildBatchedMesh(material: THREE.Material, segment: BatchedSegment): THREE.BatchedMesh {
  const batch = new THREE.BatchedMesh(
    Math.max(segment.instanceCount, 1),
    Math.max(segment.uniqueVertexCount, 1),
    Math.max(segment.uniqueIndexCount, 0),
    material,
  );

  batch.name = 'batched-detail-mesh';
  batch.castShadow = true;
  batch.receiveShadow = true;
  batch.userData.detailMode = 'batched';
  batch.userData.recordIds = [];

  const geometryIds = new WeakMap<THREE.BufferGeometry, number>();

  for (const preparedRecord of segment.records) {
    const { geometry } = preparedRecord.record;
    let geometryId = geometryIds.get(geometry);
    if (geometryId === undefined) {
      ensureBounds(geometry);
      geometryId = batch.addGeometry(geometry);
      geometryIds.set(geometry, geometryId);
    }

    const instanceId = batch.addInstance(geometryId);
    batch.setMatrixAt(instanceId, preparedRecord.matrix);
    batch.userData.recordIds.push(preparedRecord.record.id ?? null);
  }

  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return batch;
}

function buildBatchedObjects(
  records: readonly DetailRecord[],
  options: BatchedDetailOptions,
): THREE.Object3D[] {
  const geometryInfoCache = new WeakMap<THREE.BufferGeometry, GeometryLayoutInfo>();
  const buckets = bucketRecords(records, geometryInfoCache);
  const resolvedOptions = {
    maxInstanceCount: normalizePositiveLimit(options.maxInstanceCount, DEFAULT_MAX_INSTANCE_COUNT),
    maxVertexCount: normalizePositiveLimit(options.maxVertexCount, DEFAULT_MAX_VERTEX_COUNT),
    maxIndexCount: normalizeNonNegativeLimit(options.maxIndexCount, DEFAULT_MAX_INDEX_COUNT),
  };

  const objects: THREE.Object3D[] = [];
  for (const bucket of buckets) {
    for (const compatibilityKey of bucket.compatibilityOrder) {
      const preparedRecords = bucket.recordsByCompatibility.get(compatibilityKey);
      if (!preparedRecords || preparedRecords.length === 0) continue;

      const segments = splitIntoSegments(preparedRecords, resolvedOptions);
      for (const segment of segments) {
        objects.push(buildBatchedMesh(bucket.material, segment));
      }
    }
  }

  return objects;
}

export class BatchedDetailRegistry {
  private readonly records: DetailRecord[] = [];
  private readonly options: BatchedDetailOptions;

  constructor(options: BatchedDetailOptions = {}) {
    this.options = { ...options };
  }

  add(record: DetailRecord): void {
    this.records.push(record);
  }

  build(options: BatchedDetailOptions = {}): BatchedDetailResult {
    const mergedOptions: BatchedDetailOptions = { ...this.options, ...options };
    if (this.records.length === 0) {
      return { usedBatching: false, objects: [] };
    }

    if (!shouldUseBatching(mergedOptions)) {
      return {
        usedBatching: false,
        objects: buildFallbackGroups(this.records),
      };
    }

    return {
      usedBatching: true,
      objects: buildBatchedObjects(this.records, mergedOptions),
    };
  }
}

export function buildBatchedDetails(
  records: readonly DetailRecord[],
  options: BatchedDetailOptions = {},
): BatchedDetailResult {
  const registry = new BatchedDetailRegistry(options);
  for (const record of records) registry.add(record);
  return registry.build();
}
