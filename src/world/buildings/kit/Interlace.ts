import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';

export type InterlaceVariant = 'straight' | 'gableVerge';

export interface InterlaceOptions {
  /** Total path length. For gableVerge this is the full chevron: eave -> ridge -> eave. */
  length: number;
  variant?: InterlaceVariant;
  /** Reserved for future expansion; this tier-1 ornament currently emits the required 3-strand plait only. */
  strandCount?: number;
  cordRadius?: number;
  period?: number;
  raisedRelief?: number;
  terminalKnots?: boolean;
  radialSegments?: number;
  /** Ridge rise for the full gable chevron path used by the gableVerge variant. */
  ridgeHeight?: number;
  seed?: number;
}

interface InterlaceLayout {
  length: number;
  variant: InterlaceVariant;
  strandCount: number;
  cordRadius: number;
  period: number;
  reliefAmplitude: number;
  lateralAmplitude: number;
  terminalKnots: boolean;
  radialSegments: number;
  ridgeHeight: number;
  halfRun: number;
  bodySampleCount: number;
  terminalBlendLength: number;
  knotMajorRadius: number;
  knotMinorRadius: number;
  knotLift: number;
  seed: number;
}

const DEFAULT_STRAND_COUNT = 3;
const DEFAULT_RADIAL_SEGMENTS = 6;
const DEFAULT_SEED = 0x1A7E_1ACE;
const EPSILON = 1e-6;

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(Math.round(value!), min, max);
}

function createMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  userData: Record<string, unknown>,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = userData;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function smoothstep01(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function arbitraryPerpendicular(tangent: THREE.Vector3): THREE.Vector3 {
  const reference = Math.abs(tangent.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(reference, tangent);
  if (normal.lengthSq() <= EPSILON) {
    normal.crossVectors(new THREE.Vector3(1, 0, 0), tangent);
  }
  if (normal.lengthSq() <= EPSILON) {
    normal.set(0, 1, 0);
  }
  return normal.normalize();
}

function polylineLength(points: readonly THREE.Vector3[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += points[index - 1]!.distanceTo(points[index]!);
  }
  return length;
}

function buildLayout(options: InterlaceOptions): InterlaceLayout {
  const length = clampPositive(options.length, 2.4);
  const variant = options.variant ?? 'straight';
  const strandCount = clampInteger(
    options.strandCount,
    DEFAULT_STRAND_COUNT,
    DEFAULT_STRAND_COUNT,
    DEFAULT_STRAND_COUNT,
  );
  const cordRadius = Math.min(
    clampPositive(options.cordRadius, Math.max(0.035, Math.min(length * 0.03, 0.085))),
    Math.max(length * 0.14, 0.06),
  );
  const requestedPeriod = clampPositive(options.period, Math.max(cordRadius * 10, length / 5));
  const period = Math.max(requestedPeriod, cordRadius * 5.5);
  const minimumWeaveRadius = (cordRadius / Math.max(Math.sin(Math.PI / strandCount), 0.25)) * 1.02;
  const reliefAmplitude = Math.max(clampPositive(options.raisedRelief, cordRadius * 1.5), minimumWeaveRadius);
  const lateralAmplitude = Math.max(reliefAmplitude * 1.12, minimumWeaveRadius);
  const bodySampleCountBase = Math.max(1, length / period);
  let bodySampleCount = Math.max(12, Math.ceil(bodySampleCountBase * 12));
  if (bodySampleCount % 2 !== 0) bodySampleCount += 1;
  const terminalBlendLength = Math.min(
    Math.max(period * 0.35, cordRadius * 2.4),
    length * 0.24,
  );
  const halfPathLength = length * 0.5;
  const defaultRidgeHeight = Math.min(length * 0.22, halfPathLength * 0.82);
  const ridgeHeight = variant === 'gableVerge'
    ? Math.min(
      clampPositive(options.ridgeHeight, defaultRidgeHeight),
      Math.max(halfPathLength - cordRadius * 1.5, cordRadius * 1.5),
    )
    : 0;
  const halfRun = variant === 'gableVerge'
    ? Math.max(
      Math.sqrt(Math.max(halfPathLength * halfPathLength - ridgeHeight * ridgeHeight, EPSILON)),
      cordRadius * 0.6,
    )
    : length * 0.5;

  return {
    length,
    variant,
    strandCount,
    cordRadius,
    period,
    reliefAmplitude,
    lateralAmplitude,
    terminalKnots: options.terminalKnots ?? true,
    radialSegments: clampInteger(options.radialSegments, DEFAULT_RADIAL_SEGMENTS, 3, 10),
    ridgeHeight,
    halfRun,
    bodySampleCount,
    terminalBlendLength,
    knotMajorRadius: Math.max(cordRadius * 2.8, period * 0.22),
    knotMinorRadius: Math.max(cordRadius * 2.2, period * 0.16),
    knotLift: Math.max(reliefAmplitude * 0.55, cordRadius * 1.2),
    seed: (options.seed ?? DEFAULT_SEED) >>> 0,
  };
}

function backboneSample(layout: InterlaceLayout, distance: number): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const clampedDistance = THREE.MathUtils.clamp(distance, 0, layout.length);
  if (layout.variant === 'straight') {
    return {
      point: new THREE.Vector3(clampedDistance - layout.length * 0.5, 0, 0),
      tangent: new THREE.Vector3(1, 0, 0),
    };
  }

  const halfPathLength = layout.length * 0.5;
  const start = new THREE.Vector3(-layout.halfRun, 0, 0);
  const apex = new THREE.Vector3(0, layout.ridgeHeight, 0);
  const end = new THREE.Vector3(layout.halfRun, 0, 0);

  if (clampedDistance <= halfPathLength) {
    const t = clampedDistance / Math.max(halfPathLength, EPSILON);
    return {
      point: start.clone().lerp(apex, t),
      tangent: apex.clone().sub(start).normalize(),
    };
  }

  const t = (clampedDistance - halfPathLength) / Math.max(halfPathLength, EPSILON);
  return {
    point: apex.clone().lerp(end, t),
    tangent: end.clone().sub(apex).normalize(),
  };
}

function terminalEnvelope(layout: InterlaceLayout, distance: number): number {
  if (layout.terminalBlendLength <= EPSILON) return 1;
  const startBlend = smoothstep01(distance / layout.terminalBlendLength);
  const endBlend = smoothstep01((layout.length - distance) / layout.terminalBlendLength);
  return startBlend * endBlend;
}

function strandPoint(layout: InterlaceLayout, strandIndex: number, normalizedT: number): THREE.Vector3 {
  const distance = THREE.MathUtils.clamp(normalizedT, 0, 1) * layout.length;
  const { point, tangent } = backboneSample(layout, distance);
  const lateralAxis = new THREE.Vector3(-tangent.y, tangent.x, 0);
  if (lateralAxis.lengthSq() <= EPSILON) lateralAxis.set(0, 1, 0);
  lateralAxis.normalize();

  const phase = (distance / layout.period) * Math.PI * 2 + (strandIndex / layout.strandCount) * Math.PI * 2;
  const envelope = terminalEnvelope(layout, distance);
  const lateralOffset = Math.sin(phase) * layout.lateralAmplitude * envelope;
  const reliefOffset = Math.cos(phase) * layout.reliefAmplitude * envelope;

  return point
    .clone()
    .addScaledVector(lateralAxis, lateralOffset)
    .add(new THREE.Vector3(0, 0, reliefOffset));
}

function sampleStrandPoints(layout: InterlaceLayout, strandIndex: number): THREE.Vector3[] {
  return Array.from({ length: layout.bodySampleCount + 1 }, (_, index) => (
    strandPoint(layout, strandIndex, index / layout.bodySampleCount)
  ));
}

function tangentAt(points: readonly THREE.Vector3[], index: number): THREE.Vector3 {
  const previous = points[Math.max(index - 1, 0)]!;
  const next = points[Math.min(index + 1, points.length - 1)]!;
  const tangent = next.clone().sub(previous);
  if (tangent.lengthSq() <= EPSILON && index < points.length - 1) {
    tangent.copy(points[index + 1]!).sub(points[index]!);
  }
  if (tangent.lengthSq() <= EPSILON && index > 0) {
    tangent.copy(points[index]!).sub(points[index - 1]!);
  }
  if (tangent.lengthSq() <= EPSILON) tangent.set(1, 0, 0);
  return tangent.normalize();
}

function buildOpenTubeGeometry(
  points: readonly THREE.Vector3[],
  radius: number,
  radialSegments: number,
): THREE.BufferGeometry {
  const tangents = points.map((_, index) => tangentAt(points, index));
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  normals[0] = arbitraryPerpendicular(tangents[0]!);
  binormals[0] = new THREE.Vector3().crossVectors(tangents[0]!, normals[0]!).normalize();
  normals[0] = new THREE.Vector3().crossVectors(binormals[0]!, tangents[0]!).normalize();

  for (let index = 1; index < points.length; index += 1) {
    let normal = normals[index - 1]!.clone()
      .addScaledVector(tangents[index]!, -normals[index - 1]!.dot(tangents[index]!));
    if (normal.lengthSq() <= EPSILON) normal = arbitraryPerpendicular(tangents[index]!);
    normal.normalize();

    let binormal = new THREE.Vector3().crossVectors(tangents[index]!, normal);
    if (binormal.lengthSq() <= EPSILON) {
      normal = arbitraryPerpendicular(tangents[index]!);
      binormal = new THREE.Vector3().crossVectors(tangents[index]!, normal);
    }

    binormals[index] = binormal.normalize();
    normals[index] = new THREE.Vector3().crossVectors(binormals[index]!, tangents[index]!).normalize();
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringVertexCount = radialSegments + 1;
  const radial = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let segmentIndex = 0; segmentIndex < points.length; segmentIndex += 1) {
    const center = points[segmentIndex]!;
    const normal = normals[segmentIndex]!;
    const binormal = binormals[segmentIndex]!;
    const longitudinalT = points.length > 1 ? segmentIndex / (points.length - 1) : 0;

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const angle = (radialIndex / radialSegments) * Math.PI * 2;
      radial.copy(normal).multiplyScalar(Math.cos(angle) * radius);
      radial.addScaledVector(binormal, Math.sin(angle) * radius);
      vertex.copy(center).add(radial);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(radialIndex / radialSegments, longitudinalT);
    }
  }

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const row = segmentIndex * ringVertexCount;
    const nextRow = (segmentIndex + 1) * ringVertexCount;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = row + radialIndex;
      const b = nextRow + radialIndex;
      const c = nextRow + radialIndex + 1;
      const d = row + radialIndex + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function terminalKnotRandom(seed: number, tag: number): () => number {
  return mulberry32((seed ^ tag) >>> 0);
}

function buildTerminalKnotGeometry(
  layout: InterlaceLayout,
  side: 'start' | 'end',
): THREE.BufferGeometry {
  const direction = side === 'start' ? -1 : 1;
  const distance = side === 'start' ? 0 : layout.length;
  const { point, tangent } = backboneSample(layout, distance);
  const lateralAxis = new THREE.Vector3(-tangent.y, tangent.x, 0);
  if (lateralAxis.lengthSq() <= EPSILON) lateralAxis.set(0, 1, 0);
  lateralAxis.normalize();
  const normalAxis = new THREE.Vector3(0, 0, 1);
  const rand = terminalKnotRandom(layout.seed, side === 'start' ? 0x5354_4152 : 0x454E_4421);
  const rotation = (rand() - 0.5) * 0.5;
  const major = layout.knotMajorRadius * (0.95 + rand() * 0.1);
  const minor = Math.max(layout.knotMinorRadius, major * 0.92) * (0.95 + rand() * 0.08);
  const lift = layout.knotLift * (0.92 + rand() * 0.12);
  const center = point.clone()
    .addScaledVector(tangent, direction * major * 0.48)
    .addScaledVector(normalAxis, lift * 0.38);
  const sampleCount = 18;
  const trefoilRadius = Math.max(major, minor);

  const points = Array.from({ length: sampleCount }, (_, index) => {
    const angle = (index / sampleCount) * Math.PI * 2 + rotation;
    const lobeScale = 1 + Math.cos(angle * 3) * 0.4;
    const tangentialRadius = trefoilRadius * lobeScale;
    const lateralRadius = trefoilRadius * lobeScale;
    const undulation = Math.sin(angle * 3) * lift * 0.08;
    return center.clone()
      .addScaledVector(tangent, Math.cos(angle) * tangentialRadius * direction)
      .addScaledVector(lateralAxis, Math.sin(angle) * lateralRadius)
      .addScaledVector(normalAxis, undulation);
  });

  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  const tubularSegments = THREE.MathUtils.clamp(
    Math.ceil(polylineLength(points) / Math.max(layout.cordRadius * 1.3, 0.03)),
    12,
    24,
  );
  curve.arcLengthDivisions = tubularSegments * 4;
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    layout.cordRadius * 0.94,
    layout.radialSegments,
    true,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildInterlace(options: InterlaceOptions, material: THREE.Material): THREE.Group {
  const layout = buildLayout(options);
  const interlace = new THREE.Group();
  interlace.name = 'interlace';
  interlace.userData.role = 'interlace';
  interlace.userData.variant = layout.variant;
  interlace.userData.length = layout.length;
  interlace.userData.lengthSemantics = layout.variant === 'gableVerge'
    ? 'fullChevron'
    : 'singleRun';
  interlace.userData.period = layout.period;
  interlace.userData.cordRadius = layout.cordRadius;

  for (let strandIndex = 0; strandIndex < layout.strandCount; strandIndex += 1) {
    const points = sampleStrandPoints(layout, strandIndex);
    interlace.add(createMesh(
      buildOpenTubeGeometry(points, layout.cordRadius, layout.radialSegments),
      material,
      `strand-${strandIndex}`,
      {
        role: 'strand',
        strandIndex,
      },
    ));
  }

  if (layout.terminalKnots) {
    interlace.add(createMesh(
      buildTerminalKnotGeometry(layout, 'start'),
      material,
      'terminal-knot-start',
      { role: 'terminal-knot', side: 'start' },
    ));
    interlace.add(createMesh(
      buildTerminalKnotGeometry(layout, 'end'),
      material,
      'terminal-knot-end',
      { role: 'terminal-knot', side: 'end' },
    ));
  }

  return interlace;
}
