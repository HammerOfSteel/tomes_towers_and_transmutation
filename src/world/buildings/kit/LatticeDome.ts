import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';

export interface LatticeDomeOptions {
  radius: number;
  ribsPerFamily?: number;
  tubeRadius?: number;
  weaveOffset?: number;
  vineHooks?: boolean;
  vineHookDensity?: number;
  brokenSegments?: boolean;
  brokenSegmentDensity?: number;
  seed?: number;
}

type FamilyKey = 'a' | 'b';

interface FamilySpec {
  key: FamilyKey;
  direction: 1 | -1;
  startAngleOffset: number;
  radialOffset: number;
}

interface LatticeDomeLayout {
  radius: number;
  ribsPerFamily: number;
  tubeRadius: number;
  apexTubeRadius: number;
  halfWeaveOffset: number;
  stepAngle: number;
  twistAngle: number;
  maxPhi: number;
  crossingParameters: number[];
  segmentBoundaries: number[];
  radialSegments: number;
  damageEnabled: boolean;
  brokenSegmentDensity: number;
  vineHooks: boolean;
  vineHookDensity: number;
  seed: number;
}

const DEFAULT_RIBS_PER_FAMILY = 8;
const DEFAULT_SEED = 0x1A77_1CE0;
const HELIX_TURNS = 1;
const DEFAULT_RADIAL_SEGMENTS = 10;
const DEFAULT_VINE_HOOK_DENSITY = 0.16;
const EPSILON = 1e-6;
const ICOSAHEDRON_INSCRIBED_RADIUS_RATIO = (
  Math.sqrt(3) * (3 + Math.sqrt(5))
) / (
  3 * Math.sqrt(10 + 2 * Math.sqrt(5))
);
const FAMILY_TAGS: Record<FamilyKey, number> = {
  a: 0x4641_4D41,
  b: 0x4641_4D42,
};

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function clampUnit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(value!, 0, 1);
}

function pieceRandom(seed: number, ...tags: number[]): () => number {
  let hashed = seed >>> 0;
  for (const tag of tags) {
    hashed = (hashed ^ Math.imul((tag + 1) >>> 0, 0x9E37_79B9)) >>> 0;
    hashed = ((hashed << 13) | (hashed >>> 19)) >>> 0;
  }
  return mulberry32(hashed >>> 0);
}

function segmentId(family: FamilyKey, ribIndex: number, segmentIndex: number): string {
  return `${family}:${ribIndex}:${segmentIndex}`;
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

function polylineLength(points: readonly THREE.Vector3[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += points[index - 1]!.distanceTo(points[index]!);
  }
  return length;
}

function buildTaperedTubeGeometry(
  points: readonly THREE.Vector3[],
  startRadius: number,
  endRadius: number,
  radialSegments: number,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(point => point.clone()), false, 'centripetal');
  const approximateLength = polylineLength(points);
  const referenceRadius = Math.max(startRadius, endRadius, EPSILON);
  const tubularSegments = THREE.MathUtils.clamp(
    Math.ceil(approximateLength / Math.max(referenceRadius * 1.35, 0.002)),
    3,
    8,
  );
  curve.arcLengthDivisions = Math.max(48, tubularSegments * 8);

  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = new THREE.Vector3();
  const radial = new THREE.Vector3();

  for (let segmentIndex = 0; segmentIndex <= tubularSegments; segmentIndex++) {
    const t = segmentIndex / tubularSegments;
    const center = curve.getPointAt(t);
    const normal = frames.normals[segmentIndex]!;
    const binormal = frames.binormals[segmentIndex]!;
    const ringRadius = THREE.MathUtils.lerp(startRadius, endRadius, t);

    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const angle = (radialIndex / radialSegments) * Math.PI * 2;
      radial.copy(normal).multiplyScalar(Math.cos(angle) * ringRadius);
      radial.addScaledVector(binormal, Math.sin(angle) * ringRadius);
      vertex.copy(center).add(radial);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(radialIndex / radialSegments, t);
    }
  }

  const indices: number[] = [];
  for (let segmentIndex = 0; segmentIndex < tubularSegments; segmentIndex++) {
    const row = segmentIndex * radialSegments;
    const nextRow = (segmentIndex + 1) * radialSegments;

    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const next = (radialIndex + 1) % radialSegments;
      const a = row + radialIndex;
      const b = nextRow + radialIndex;
      const c = nextRow + next;
      const d = row + next;
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

function buildLayout(options: LatticeDomeOptions): LatticeDomeLayout {
  const radius = clampPositive(options.radius, 2);
  const ribsPerFamily = Math.max(4, Math.floor(clampPositive(options.ribsPerFamily, DEFAULT_RIBS_PER_FAMILY)));
  const tubeRadius = Math.min(clampPositive(options.tubeRadius, Math.max(radius * 0.012, 0.01)), radius * 0.12);
  const weaveOffset = Math.min(
    clampPositive(options.weaveOffset, Math.max(tubeRadius * 0.75, radius * 0.01)),
    radius * 0.18,
  );
  const halfWeaveOffset = weaveOffset * 0.5;
  // Keep the tip strictly proportional to the base radius so ultra-thin ribs
  // still taper instead of widening from an absolute-world-unit floor.
  const apexTubeRadius = tubeRadius * 0.42;
  const topSurfaceRadius = THREE.MathUtils.clamp(
    Math.max(radius * 0.035, halfWeaveOffset + apexTubeRadius * 2.4),
    radius * 0.01,
    radius * 0.45,
  );
  const maxPhi = Math.acos(THREE.MathUtils.clamp(topSurfaceRadius / radius, EPSILON, 0.9999));
  const crossingCount = ribsPerFamily * 2 * HELIX_TURNS;
  const crossingParameters = Array.from({ length: crossingCount }, (_, index) => (index + 0.5) / crossingCount);
  const segmentBoundaries = [0, ...crossingParameters, 1];
  const damageEnabled = options.brokenSegments ?? ((options.brokenSegmentDensity ?? 0) > 0);

  return {
    radius,
    ribsPerFamily,
    tubeRadius,
    apexTubeRadius,
    halfWeaveOffset,
    stepAngle: (Math.PI * 2) / ribsPerFamily,
    twistAngle: Math.PI * 2 * HELIX_TURNS,
    maxPhi,
    crossingParameters,
    segmentBoundaries,
    radialSegments: DEFAULT_RADIAL_SEGMENTS,
    damageEnabled,
    brokenSegmentDensity: clampUnit(options.brokenSegmentDensity, 0.18),
    vineHooks: options.vineHooks ?? false,
    vineHookDensity: clampUnit(options.vineHookDensity, DEFAULT_VINE_HOOK_DENSITY),
    seed: (options.seed ?? DEFAULT_SEED) >>> 0,
  };
}

function domePoint(layout: LatticeDomeLayout, theta: number, t: number, radialOffset: number): THREE.Vector3 {
  const phi = layout.maxPhi * THREE.MathUtils.clamp(t, 0, 1);
  const surfaceRadius = layout.radius * Math.cos(phi);
  // The weave offset is applied in plan radius rather than the full surface
  // normal; this keeps the over/under read legible while staying analytically simple.
  const planRadius = Math.max(surfaceRadius + radialOffset, layout.apexTubeRadius * 1.2);
  return new THREE.Vector3(
    Math.cos(theta) * planRadius,
    layout.radius * Math.sin(phi),
    Math.sin(theta) * planRadius,
  );
}

function ribTheta(layout: LatticeDomeLayout, family: FamilySpec, ribIndex: number, t: number): number {
  return layout.stepAngle * ribIndex + family.startAngleOffset + family.direction * layout.twistAngle * t;
}

function ribPoint(layout: LatticeDomeLayout, family: FamilySpec, ribIndex: number, t: number): THREE.Vector3 {
  return domePoint(layout, ribTheta(layout, family, ribIndex, t), t, family.radialOffset);
}

function ribTubeRadiusAt(layout: LatticeDomeLayout, t: number): number {
  return THREE.MathUtils.lerp(layout.tubeRadius, layout.apexTubeRadius, Math.pow(THREE.MathUtils.clamp(t, 0, 1), 0.9));
}

function familyBRibIndexAtCrossing(layout: LatticeDomeLayout, familyARibIndex: number, crossingIndex: number): number {
  return (familyARibIndex + crossingIndex) % layout.ribsPerFamily;
}

function adjacentCrossingSegmentIndices(crossingIndex: number): readonly [number, number] {
  return [crossingIndex, crossingIndex + 1];
}

function crossingHasAllAdjacentSegments(
  layout: LatticeDomeLayout,
  familyARibIndex: number,
  crossingIndex: number,
  brokenSegmentIds: Set<string>,
): boolean {
  const familyBRibIndex = familyBRibIndexAtCrossing(layout, familyARibIndex, crossingIndex);
  return adjacentCrossingSegmentIndices(crossingIndex).every(segmentIndex => (
    !brokenSegmentIds.has(segmentId('a', familyARibIndex, segmentIndex))
    && !brokenSegmentIds.has(segmentId('b', familyBRibIndex, segmentIndex))
  ));
}

function segmentSamplePoints(
  layout: LatticeDomeLayout,
  family: FamilySpec,
  ribIndex: number,
  tStart: number,
  tEnd: number,
): THREE.Vector3[] {
  const sampleCount = Math.max(
    3,
    Math.ceil((tEnd - tStart) * layout.crossingParameters.length * 4),
  );

  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = THREE.MathUtils.lerp(tStart, tEnd, index / sampleCount);
    return ribPoint(layout, family, ribIndex, t);
  });
}

function selectBrokenSegmentIds(layout: LatticeDomeLayout): Set<string> {
  if (!layout.damageEnabled) return new Set<string>();

  const broken = new Set<string>();
  const lastSegmentIndex = layout.segmentBoundaries.length - 2;

  for (const family of ['a', 'b'] as const) {
    for (let ribIndex = 0; ribIndex < layout.ribsPerFamily; ribIndex++) {
      // Preserve the first and last spans so damaged canopies stay anchored at the rim and apex.
      for (let segmentIndex = 1; segmentIndex < lastSegmentIndex; segmentIndex++) {
        const rand = pieceRandom(layout.seed, FAMILY_TAGS[family], ribIndex, segmentIndex);
        if (rand() < layout.brokenSegmentDensity) {
          broken.add(segmentId(family, ribIndex, segmentIndex));
        }
      }
    }
  }

  return broken;
}

function buildRibGroup(
  layout: LatticeDomeLayout,
  family: FamilySpec,
  ribIndex: number,
  material: THREE.Material,
  brokenSegmentIds: Set<string>,
): THREE.Group {
  const rib = new THREE.Group();
  rib.name = `rib-${family.key}-${ribIndex}`;
  rib.userData.role = 'rib';
  rib.userData.family = family.key;
  rib.userData.ribIndex = ribIndex;

  for (let segmentIndex = 0; segmentIndex < layout.segmentBoundaries.length - 1; segmentIndex++) {
    if (brokenSegmentIds.has(segmentId(family.key, ribIndex, segmentIndex))) continue;

    const tStart = layout.segmentBoundaries[segmentIndex]!;
    const tEnd = layout.segmentBoundaries[segmentIndex + 1]!;
    const points = segmentSamplePoints(layout, family, ribIndex, tStart, tEnd);
    const geometry = buildTaperedTubeGeometry(
      points,
      ribTubeRadiusAt(layout, tStart),
      ribTubeRadiusAt(layout, tEnd),
      layout.radialSegments,
    );
    rib.add(createMesh(geometry, material, `rib-${family.key}-${ribIndex}-segment-${segmentIndex}`, {
      role: 'rib-segment',
      family: family.key,
      ribIndex,
      segmentIndex,
    }));
  }

  return rib;
}

function createKnuckleGroup(
  layout: LatticeDomeLayout,
  familyA: FamilySpec,
  familyB: FamilySpec,
  material: THREE.Material,
  brokenSegmentIds: Set<string>,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'crossing-knuckles';
  group.userData.role = 'crossing-knuckles';
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const midpoint = new THREE.Vector3();

  for (let ribIndex = 0; ribIndex < layout.ribsPerFamily; ribIndex++) {
    for (let crossingIndex = 0; crossingIndex < layout.crossingParameters.length; crossingIndex++) {
      const t = layout.crossingParameters[crossingIndex]!;
      if (!crossingHasAllAdjacentSegments(layout, ribIndex, crossingIndex, brokenSegmentIds)) continue;

      const familyBRibIndex = familyBRibIndexAtCrossing(layout, ribIndex, crossingIndex);
      const familyAPoint = ribPoint(layout, familyA, ribIndex, t);
      const familyBPoint = ribPoint(layout, familyB, familyBRibIndex, t);
      const tubeRadius = ribTubeRadiusAt(layout, t);
      midpoint.copy(familyAPoint).add(familyBPoint).multiplyScalar(0.5);
      const contactReach = Math.max(
        midpoint.distanceTo(familyAPoint),
        midpoint.distanceTo(familyBPoint),
      ) + tubeRadius;
      const knuckleRadius = contactReach / ICOSAHEDRON_INSCRIBED_RADIUS_RATIO;
      const mesh = createMesh(geometry, material, `knuckle-${ribIndex}-${crossingIndex}`, {
        role: 'crossing-knuckle',
        ribIndex,
        crossingIndex,
        familyBRibIndex,
        crossingT: t,
        contactReach,
        knuckleRadius,
        adjacentSegmentIndices: [...adjacentCrossingSegmentIndices(crossingIndex)],
      });
      mesh.position.copy(midpoint);
      mesh.scale.setScalar(knuckleRadius);
      group.add(mesh);
    }
  }

  return group;
}

function buildVineHookGeometry(anchor: THREE.Vector3, outward: THREE.Vector3, size: number, rodRadius: number): THREE.BufferGeometry {
  const points = [
    anchor,
    anchor.clone().addScaledVector(outward, size * 0.55),
    anchor.clone().addScaledVector(outward, size * 0.82).add(new THREE.Vector3(0, size * 0.28, 0)),
    anchor.clone().addScaledVector(outward, size * 0.58).add(new THREE.Vector3(0, size * 0.68, 0)),
  ];
  return buildTaperedTubeGeometry(points, rodRadius, rodRadius * 0.8, 8);
}

function createVineHookGroup(layout: LatticeDomeLayout, material: THREE.Material): THREE.Group | null {
  if (!layout.vineHooks) return null;

  const group = new THREE.Group();
  group.name = 'vine-hooks';
  group.userData.role = 'vine-hooks';

  const hookSize = Math.max(layout.tubeRadius * 2.4, layout.radius * 0.035);
  const rodRadius = Math.max(layout.tubeRadius * 0.22, 0.0012);

  for (let ribIndex = 0; ribIndex < layout.ribsPerFamily; ribIndex++) {
    for (let crossingIndex = 0; crossingIndex < layout.crossingParameters.length; crossingIndex++) {
      const rand = pieceRandom(layout.seed, 0x5649_4E45, ribIndex, crossingIndex);
      if (rand() >= layout.vineHookDensity) continue;

      const t = layout.crossingParameters[crossingIndex]!;
      const theta = layout.stepAngle * ribIndex + layout.twistAngle * t;
      const anchor = domePoint(layout, theta, t, layout.halfWeaveOffset * 0.25);
      const outward = new THREE.Vector3(anchor.x, 0, anchor.z).normalize();
      if (outward.lengthSq() <= EPSILON) continue;

      const geometry = buildVineHookGeometry(
        anchor.clone().addScaledVector(outward, layout.tubeRadius * 0.35),
        outward,
        hookSize,
        rodRadius,
      );
      const mesh = createMesh(geometry, material, `vine-hook-${ribIndex}-${crossingIndex}`, {
        role: 'vine-hook',
        ribIndex,
        crossingIndex,
      });
      group.add(mesh);
    }
  }

  return group.children.length > 0 ? group : null;
}

export function buildLatticeDome(options: LatticeDomeOptions, material: THREE.Material): THREE.Group {
  const layout = buildLayout(options);
  const familyA: FamilySpec = {
    key: 'a',
    direction: 1,
    startAngleOffset: 0,
    radialOffset: layout.halfWeaveOffset,
  };
  const familyB: FamilySpec = {
    key: 'b',
    direction: -1,
    startAngleOffset: layout.stepAngle * 0.5,
    radialOffset: -layout.halfWeaveOffset,
  };
  const brokenSegmentIds = selectBrokenSegmentIds(layout);

  const dome = new THREE.Group();
  dome.name = 'lattice-dome';
  dome.userData.role = 'lattice-dome';
  dome.userData.radius = layout.radius;
  dome.userData.ribsPerFamily = layout.ribsPerFamily;
  dome.userData.tubeRadius = layout.tubeRadius;
  dome.userData.weaveOffset = layout.halfWeaveOffset * 2;

  for (const family of [familyA, familyB]) {
    const familyGroup = new THREE.Group();
    familyGroup.name = `family-${family.key}`;
    familyGroup.userData.role = 'rib-family';
    familyGroup.userData.family = family.key;

    for (let ribIndex = 0; ribIndex < layout.ribsPerFamily; ribIndex++) {
      familyGroup.add(buildRibGroup(layout, family, ribIndex, material, brokenSegmentIds));
    }

    dome.add(familyGroup);
  }

  dome.add(createKnuckleGroup(layout, familyA, familyB, material, brokenSegmentIds));

  const vineHooks = createVineHookGroup(layout, material);
  if (vineHooks) dome.add(vineHooks);

  return dome;
}
