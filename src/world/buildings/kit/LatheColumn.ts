import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { finishArchitecturalGeometry } from './Bevels';

export type LatheColumnCrossSection = 'round' | 'fluted' | 'lobed';

export interface LatheColumnOptions {
  height: number;
  radius?: number;
  crossSection?: LatheColumnCrossSection;
  fluteCount?: number;
  lobeCount?: number;
  brokenAtHeight?: number;
  seed?: number;
}

type PartName = 'base' | 'shaft' | 'capital' | 'impost';
type RadiusFn = (profileRadius: number, angle: number, normalizedY: number) => number;

interface RingSpec {
  y: number;
  radius: number;
  yOffsets?: number[];
  radialScales?: number[];
}

interface PartGeometrySpec {
  name: PartName;
  startY: number;
  height: number;
  rings: RingSpec[];
  radiusFn: RadiusFn;
  closeBottom: boolean;
  closeTop: boolean;
}

interface BrokenPartPlacement {
  name: PartName;
  visibleHeight: number;
}

interface BrokenTopProfile {
  fractureBandDepth: number;
  maxDrop: number;
}

interface BrokenSectionGeometry {
  shellGeometry: THREE.BufferGeometry;
  fractureCapGeometry: THREE.BufferGeometry;
}

interface ColumnLayout {
  baseHeight: number;
  shaftHeight: number;
  capitalHeight: number;
  impostHeight: number;
  shaftBaseRadius: number;
  shaftTopRadius: number;
}

const DEFAULT_RADIUS = 0.18;
const DEFAULT_SEED = 0xC011_4D5A;
const DEFAULT_RADIAL_SEGMENTS = 72;
const DEFAULT_FLUTE_COUNT = 12;
const DEFAULT_LOBE_COUNT = 4;
const EPSILON = 1e-6;
const NUMERIC_EPSILON = Number.EPSILON * 64;
const ARCHITECTURAL_VERTEX_MERGE_TOLERANCE = 1e-4;
const MIN_FRACTURE_DROP = 0.03;
const MIN_FRACTURE_BAND_DEPTH = 0.04;
const PART_SEED_TAGS: Record<PartName, number> = {
  base: 0x4241_5345,
  shaft: 0x5348_4654,
  capital: 0x4341_5054,
  impost: 0x494D_5054,
};

function triangleEdgeLengthSquared(
  vertexData: number[],
  firstOffset: number,
  secondOffset: number,
): number {
  const dx = vertexData[firstOffset]! - vertexData[secondOffset]!;
  const dy = vertexData[firstOffset + 1]! - vertexData[secondOffset + 1]!;
  const dz = vertexData[firstOffset + 2]! - vertexData[secondOffset + 2]!;
  return dx * dx + dy * dy + dz * dz;
}

function minTriangleEdgeLength(vertexData: number[]): number {
  let minEdgeLengthSquared = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < vertexData.length; offset += 9) {
    minEdgeLengthSquared = Math.min(
      minEdgeLengthSquared,
      triangleEdgeLengthSquared(vertexData, offset, offset + 3),
      triangleEdgeLengthSquared(vertexData, offset + 3, offset + 6),
      triangleEdgeLengthSquared(vertexData, offset + 6, offset),
    );
  }
  return minEdgeLengthSquared === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.sqrt(minEdgeLengthSquared);
}

function adaptiveArchitecturalMergeTolerance(vertexData: number[]): number {
  const minimumEdgeLength = minTriangleEdgeLength(vertexData);
  if (!Number.isFinite(minimumEdgeLength)) return ARCHITECTURAL_VERTEX_MERGE_TOLERANCE;
  return Math.min(
    ARCHITECTURAL_VERTEX_MERGE_TOLERANCE,
    Math.max(minimumEdgeLength * 0.5, NUMERIC_EPSILON),
  );
}

function finishLatheGeometry(geometry: THREE.BufferGeometry, vertexData: number[]): THREE.BufferGeometry {
  // Never let the architectural weld tolerance exceed half of the smallest authored edge,
  // or mergeVertices can collapse intentional tiny-height ring spacing into zero-area faces.
  const tolerance = adaptiveArchitecturalMergeTolerance(vertexData);
  if (tolerance >= ARCHITECTURAL_VERTEX_MERGE_TOLERANCE) {
    return finishArchitecturalGeometry(geometry);
  }

  const merged = mergeVertices(geometry.clone(), tolerance);
  return toCreasedNormals(merged);
}

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function clampFinite(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

function scaledTolerance(...values: number[]): number {
  const scale = Math.max(...values.map(value => Math.abs(value)), 1e-9);
  return Math.max(scale * 1e-8, NUMERIC_EPSILON);
}

function ringRepresentationTolerance(...values: number[]): number {
  return Math.max(scaledTolerance(...values), ARCHITECTURAL_VERTEX_MERGE_TOLERANCE);
}

function computeLayout(height: number, radius: number): ColumnLayout {
  const slenderness = THREE.MathUtils.clamp(height / Math.max(radius * 8, EPSILON), 0, 1);
  const baseShare = THREE.MathUtils.lerp(0.19, 0.14, slenderness);
  const capitalShare = THREE.MathUtils.lerp(0.145, 0.12, slenderness);
  const impostShare = THREE.MathUtils.lerp(0.105, 0.08, slenderness);
  const shaftShare = 1 - baseShare - capitalShare - impostShare;

  const baseHeight = height * baseShare;
  const capitalHeight = height * capitalShare;
  const impostHeight = height * impostShare;
  const shaftHeight = height * shaftShare;

  return {
    baseHeight,
    shaftHeight,
    capitalHeight,
    impostHeight,
    shaftBaseRadius: radius * 1.04,
    shaftTopRadius: radius * 0.94,
  };
}

function buildShaftRadius(normalizedY: number, radius: number): number {
  const linear = THREE.MathUtils.lerp(radius * 1.04, radius * 0.94, normalizedY);
  const entasisBulge = radius * 0.085 * Math.pow(Math.sin(normalizedY * Math.PI), 1.6);
  return linear + entasisBulge;
}

function buildShaftRings(height: number, radius: number): RingSpec[] {
  const ringCount = 40;
  return Array.from({ length: ringCount + 1 }, (_, index) => {
    const t = index / ringCount;
    return {
      y: height * t,
      radius: buildShaftRadius(t, radius),
    };
  });
}

function buildBaseRings(height: number, shaftBaseRadius: number, radius: number): RingSpec[] {
  return [
    { y: 0, radius: radius * 1.48 },
    { y: height * 0.12, radius: radius * 1.56 },
    { y: height * 0.32, radius: radius * 1.22 },
    { y: height * 0.56, radius: radius * 1.34 },
    { y: height * 0.82, radius: radius * 1.08 },
    { y: height, radius: shaftBaseRadius * 1.04 },
  ];
}

function buildCapitalRings(height: number, shaftTopRadius: number, radius: number): RingSpec[] {
  return [
    { y: 0, radius: shaftTopRadius * 1.04 },
    { y: height * 0.18, radius: radius * 1.02 },
    { y: height * 0.5, radius: radius * 1.18 },
    { y: height * 0.82, radius: radius * 1.38 },
    { y: height, radius: radius * 1.3 },
  ];
}

function buildImpostRings(height: number): RingSpec[] {
  return [
    { y: 0, radius: 0.985 },
    { y: height * 0.18, radius: 1 },
    { y: height * 0.5, radius: 1 },
    { y: height * 0.82, radius: 1 },
    { y: height, radius: 0.985 },
  ];
}

function roundRadiusFn(profileRadius: number): number {
  return profileRadius;
}

function buildShaftRadiusFn(
  crossSection: LatheColumnCrossSection,
  fluteCount: number,
  lobeCount: number,
): RadiusFn {
  return (profileRadius: number, angle: number, normalizedY: number) => {
    const blend = Math.pow(Math.sin(normalizedY * Math.PI), 0.8);
    if (crossSection === 'fluted') {
      const groove = 0.5 + 0.5 * Math.cos(angle * fluteCount);
      return profileRadius * (1 - 0.12 * groove * groove * blend);
    }

    if (crossSection === 'lobed') {
      return profileRadius * (1 + 0.18 * Math.cos(angle * lobeCount) * blend);
    }

    return profileRadius;
  };
}

function superellipseRadius(angle: number, halfWidth: number, halfDepth: number, exponent = 5.5): number {
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const denominator = Math.pow(
    Math.pow(cosine / Math.max(halfWidth, EPSILON), exponent)
      + Math.pow(sine / Math.max(halfDepth, EPSILON), exponent),
    1 / exponent,
  );
  return 1 / Math.max(denominator, EPSILON);
}

function buildImpostRadiusFn(halfWidth: number, halfDepth: number, exponent = 12): RadiusFn {
  return (profileRadius: number, angle: number) => (
    superellipseRadius(angle, halfWidth * profileRadius, halfDepth * profileRadius, exponent)
  );
}

function interpolateRingRadius(rings: RingSpec[], height: number): number {
  const firstTolerance = ringRepresentationTolerance(height, rings[0]!.y);
  if (height <= rings[0]!.y + firstTolerance) return rings[0]!.radius;

  for (let index = 1; index < rings.length; index++) {
    const lower = rings[index - 1]!;
    const upper = rings[index]!;
    const tolerance = ringRepresentationTolerance(height, lower.y, upper.y);
    if (height <= upper.y + tolerance) {
      if (Math.abs(height - lower.y) <= tolerance) return lower.radius;
      if (Math.abs(height - upper.y) <= tolerance) return upper.radius;
      const span = Math.max(upper.y - lower.y, tolerance);
      const t = THREE.MathUtils.clamp((height - lower.y) / span, 0, 1);
      return THREE.MathUtils.lerp(lower.radius, upper.radius, t);
    }
  }

  return rings[rings.length - 1]!.radius;
}

function sliceRingsToHeight(rings: RingSpec[], visibleHeight: number): RingSpec[] {
  const tolerance = scaledTolerance(visibleHeight, rings[rings.length - 1]!.y);
  const ringTolerance = Math.max(tolerance, ARCHITECTURAL_VERTEX_MERGE_TOLERANCE);
  const sliced = rings.filter(ring => ring.y < visibleHeight - ringTolerance).map(ring => ({
    y: ring.y,
    radius: ring.radius,
  }));

  if (sliced.length === 0 || sliced[0]!.y > tolerance) {
    sliced.unshift({ y: 0, radius: rings[0]!.radius });
  }

  const topSource = rings.find(ring => Math.abs(ring.y - visibleHeight) <= ringTolerance);
  const topRing = topSource
    ? { y: visibleHeight, radius: topSource.radius }
    : { y: visibleHeight, radius: interpolateRingRadius(rings, visibleHeight) };

  const lastRing = sliced[sliced.length - 1];
  const radiusTolerance = lastRing
    ? Math.max(scaledTolerance(lastRing.radius, topRing.radius), ARCHITECTURAL_VERTEX_MERGE_TOLERANCE)
    : ringTolerance;
  const isNearDuplicate = !!lastRing
    && Math.abs(lastRing.y - topRing.y) <= ringTolerance
    && Math.abs(lastRing.radius - topRing.radius) <= radiusTolerance;
  const preservesBaseAnchor = !!lastRing && Math.abs(lastRing.y) <= tolerance;
  if (!lastRing) {
    sliced.push(topRing);
  } else if (isNearDuplicate) {
    if (!preservesBaseAnchor) {
      sliced[sliced.length - 1] = topRing;
    }
  } else {
    sliced.push(topRing);
  }

  if (sliced.length === 1 && sliced[0]!.y > tolerance && visibleHeight > tolerance) {
    sliced.unshift({ y: 0, radius: sliced[0]!.radius });
  }

  return sliced;
}

function resolveBrokenTopProfile(sectionHeight: number, referenceRadius: number): BrokenTopProfile {
  const maxDrop = Math.min(
    Math.max(referenceRadius * 0.18, MIN_FRACTURE_DROP),
    sectionHeight * 0.72,
  );

  return {
    fractureBandDepth: Math.min(
      Math.max(maxDrop / 0.82, MIN_FRACTURE_BAND_DEPTH),
      sectionHeight,
    ),
    maxDrop,
  };
}

function buildBrokenTopVariations(
  radialSegments: number,
  maxDrop: number,
  seed: number,
): Pick<RingSpec, 'yOffsets' | 'radialScales'> {
  const rand = mulberry32(seed >>> 0);
  const apexStart = Math.floor(rand() * radialSegments);
  const apexSpan = Math.max(1, Math.floor(radialSegments * 0.04));
  const troughStart = (apexStart + Math.floor(radialSegments / 2)) % radialSegments;
  const troughSpan = Math.max(1, Math.floor(radialSegments * 0.06));
  const yOffsets: number[] = [];
  const radialScales: number[] = [];

  for (let index = 0; index < radialSegments; index++) {
    const wrappedApexDistance = Math.min(
      Math.abs(index - apexStart),
      radialSegments - Math.abs(index - apexStart),
    );
    const wrappedTroughDistance = Math.min(
      Math.abs(index - troughStart),
      radialSegments - Math.abs(index - troughStart),
    );
    const isApex = wrappedApexDistance <= apexSpan;
    const isTrough = wrappedTroughDistance <= troughSpan;
    yOffsets.push(
      isApex
        ? 0
        : isTrough
          ? -maxDrop
          : -(0.35 + rand() * 0.65) * maxDrop,
    );
    radialScales.push(1);
  }

  return { yOffsets, radialScales };
}

function buildRingVertices(
  ring: RingSpec,
  profileHeight: number,
  radialSegments: number,
  radiusFn: RadiusFn,
): THREE.Vector3[] {
  return Array.from({ length: radialSegments }, (_, index) => {
    const angle = (index / radialSegments) * Math.PI * 2;
    const normalizedY = profileHeight <= NUMERIC_EPSILON ? 0 : ring.y / profileHeight;
    const radius = Math.max(
      radiusFn(ring.radius, angle, normalizedY) * (ring.radialScales?.[index] ?? 1),
      EPSILON * 8,
    );
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      ring.y + (ring.yOffsets?.[index] ?? 0),
      Math.sin(angle) * radius,
    );
  });
}

function pushTriangle(vertexData: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
  vertexData.push(
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z,
  );
}

function appendRingCap(vertexData: number[], ring: THREE.Vector3[], upward: boolean): void {
  const center = ring.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    if (upward) {
      pushTriangle(vertexData, center, next, current);
    } else {
      pushTriangle(vertexData, center, current, next);
    }
  }
}

function buildSectionGeometry(
  rings: RingSpec[],
  sectionHeight: number,
  radiusFn: RadiusFn,
  closeBottom: boolean,
  closeTop: boolean,
  radialSegments = DEFAULT_RADIAL_SEGMENTS,
  profileHeight = sectionHeight,
  finishGeometry = true,
): THREE.BufferGeometry {
  const ringVertices = rings.map(ring => buildRingVertices(ring, profileHeight, radialSegments, radiusFn));
  const vertexData: number[] = [];

  for (let ringIndex = 0; ringIndex < ringVertices.length - 1; ringIndex++) {
    const lower = ringVertices[ringIndex]!;
    const upper = ringVertices[ringIndex + 1]!;
    for (let segmentIndex = 0; segmentIndex < radialSegments; segmentIndex++) {
      const nextSegment = (segmentIndex + 1) % radialSegments;
      const a = lower[segmentIndex]!;
      const b = lower[nextSegment]!;
      const c = upper[nextSegment]!;
      const d = upper[segmentIndex]!;
      pushTriangle(vertexData, a, c, b);
      pushTriangle(vertexData, a, d, c);
    }
  }

  if (closeBottom) appendRingCap(vertexData, ringVertices[0]!, false);
  if (closeTop) appendRingCap(vertexData, ringVertices[ringVertices.length - 1]!, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexData, 3));
  geometry.computeVertexNormals();
  return finishGeometry ? finishLatheGeometry(geometry, vertexData) : geometry;
}

function buildBrokenSectionGeometry(
  spec: PartGeometrySpec,
  visibleHeight: number,
  seed: number,
  radialSegments = DEFAULT_RADIAL_SEGMENTS,
): BrokenSectionGeometry {
  const topRing = {
    y: visibleHeight,
    radius: interpolateRingRadius(spec.rings, visibleHeight),
  };
  const referenceRadius = spec.radiusFn(
    topRing.radius,
    0,
    spec.height <= NUMERIC_EPSILON ? 0 : THREE.MathUtils.clamp(topRing.y / spec.height, 0, 1),
  );
  const { fractureBandDepth, maxDrop } = resolveBrokenTopProfile(visibleHeight, referenceRadius);
  const lowerRings = sliceRingsToHeight(spec.rings, Math.max(visibleHeight - fractureBandDepth, 0));
  const fracturedTopRing: RingSpec = {
    ...topRing,
    ...buildBrokenTopVariations(
      radialSegments,
      maxDrop,
      (seed ^ PART_SEED_TAGS[spec.name]) >>> 0,
    ),
  };
  const shellRings = [...lowerRings, fracturedTopRing];
  const shellSupportRing = lowerRings[lowerRings.length - 1]!;
  const minFractureOffset = Math.min(...(fracturedTopRing.yOffsets ?? [0]));
  const minShellBandHeight = Math.max(visibleHeight + minFractureOffset - shellSupportRing.y, 0);
  const finishShellGeometry = minShellBandHeight > ARCHITECTURAL_VERTEX_MERGE_TOLERANCE;

  const fractureCapGeometry = new THREE.BufferGeometry();
  const fractureCapVertexData: number[] = [];
  appendRingCap(
    fractureCapVertexData,
    buildRingVertices(fracturedTopRing, spec.height, radialSegments, spec.radiusFn),
    true,
  );
  fractureCapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fractureCapVertexData, 3));
  fractureCapGeometry.computeVertexNormals();

  return {
    shellGeometry: buildSectionGeometry(
      shellRings,
      visibleHeight,
      spec.radiusFn,
      spec.closeBottom,
      false,
      radialSegments,
      spec.height,
      finishShellGeometry,
    ),
    fractureCapGeometry: finishLatheGeometry(fractureCapGeometry, fractureCapVertexData),
  };
}

function createPartMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  role = name,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.role = role;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPartGroup(name: PartName, children: THREE.Object3D[]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.role = name;
  for (const child of children) group.add(child);
  return group;
}

function buildParts(
  height: number,
  radius: number,
  crossSection: LatheColumnCrossSection,
  fluteCount: number,
  lobeCount: number,
): PartGeometrySpec[] {
  const layout = computeLayout(height, radius);
  const baseStart = 0;
  const shaftStart = layout.baseHeight;
  const capitalStart = shaftStart + layout.shaftHeight;
  const impostStart = capitalStart + layout.capitalHeight;
  const impostHalfWidth = radius * 1.42;
  const impostHalfDepth = radius * 1.04;

  return [
    {
      name: 'base',
      startY: baseStart,
      height: layout.baseHeight,
      rings: buildBaseRings(layout.baseHeight, layout.shaftBaseRadius, radius),
      radiusFn: roundRadiusFn,
      closeBottom: true,
      closeTop: true,
    },
    {
      name: 'shaft',
      startY: shaftStart,
      height: layout.shaftHeight,
      rings: buildShaftRings(layout.shaftHeight, radius),
      radiusFn: buildShaftRadiusFn(crossSection, fluteCount, lobeCount),
      closeBottom: true,
      closeTop: true,
    },
    {
      name: 'capital',
      startY: capitalStart,
      height: layout.capitalHeight,
      rings: buildCapitalRings(layout.capitalHeight, layout.shaftTopRadius, radius),
      radiusFn: roundRadiusFn,
      closeBottom: true,
      closeTop: true,
    },
    {
      name: 'impost',
      startY: impostStart,
      height: layout.impostHeight,
      rings: buildImpostRings(layout.impostHeight),
      radiusFn: buildImpostRadiusFn(impostHalfWidth, impostHalfDepth, 14),
      closeBottom: true,
      closeTop: true,
    },
  ];
}

function resolveBrokenPlacement(parts: PartGeometrySpec[], brokenAtHeight: number): BrokenPartPlacement | null {
  for (const part of parts) {
    const partEnd = part.startY + part.height;
    const tolerance = scaledTolerance(part.startY, part.height, partEnd, brokenAtHeight);
    if (brokenAtHeight < partEnd - tolerance) {
      return {
        name: part.name,
        visibleHeight: Math.max(brokenAtHeight - part.startY, 0),
      };
    }

    if (Math.abs(brokenAtHeight - partEnd) <= tolerance) {
      return {
        name: part.name,
        visibleHeight: part.height,
      };
    }
  }

  return null;
}

export function buildLatheColumn(options: LatheColumnOptions, material: THREE.Material): THREE.Group {
  const height = clampPositive(options.height, 3);
  const radius = clampPositive(options.radius, DEFAULT_RADIUS);
  const crossSection = options.crossSection ?? 'round';
  const fluteCount = Math.max(3, Math.floor(clampPositive(options.fluteCount, DEFAULT_FLUTE_COUNT)));
  const lobeCount = Math.max(3, Math.floor(clampPositive(options.lobeCount, DEFAULT_LOBE_COUNT)));
  const brokenAtHeight = clampFinite(options.brokenAtHeight);
  const seed = (options.seed ?? DEFAULT_SEED) >>> 0;
  const parts = buildParts(height, radius, crossSection, fluteCount, lobeCount);
  const breakTolerance = scaledTolerance(height, brokenAtHeight ?? 0);
  const brokenPlacement = brokenAtHeight !== undefined && brokenAtHeight > breakTolerance && brokenAtHeight < height - breakTolerance
    ? resolveBrokenPlacement(parts, Math.min(brokenAtHeight, height))
    : null;

  const column = new THREE.Group();
  column.name = 'lathe-column';
  column.userData.role = 'lathe-column';
  column.userData.height = height;
  column.userData.radius = radius;
  column.userData.crossSection = crossSection;
  column.userData.brokenAtHeight = brokenPlacement ? brokenAtHeight : undefined;

  for (const part of parts) {
    if (brokenPlacement && part.startY > brokenAtHeight! + EPSILON) break;

    const partObject = brokenPlacement?.name === part.name
      ? (() => {
        const brokenGeometry = buildBrokenSectionGeometry(part, brokenPlacement.visibleHeight, seed);
        return createPartGroup(part.name, [
          createPartMesh(`${part.name}-shell`, brokenGeometry.shellGeometry, material, `${part.name}-shell`),
          createPartMesh(`${part.name}-fracture-cap`, brokenGeometry.fractureCapGeometry, material, 'fracture-cap'),
        ]);
      })()
      : createPartMesh(
        part.name,
        buildSectionGeometry(part.rings, part.height, part.radiusFn, part.closeBottom, part.closeTop),
        material,
        part.name,
      );
    partObject.position.y = part.startY;
    column.add(partObject);

    if (brokenPlacement?.name === part.name) break;
  }

  return column;
}
