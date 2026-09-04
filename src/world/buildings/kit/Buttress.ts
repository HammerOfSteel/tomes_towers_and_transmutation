import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { finishArchitecturalGeometry, trimExtrudeSettings } from './Bevels';
import { depthFor } from './DepthLadder';
import { buildGableRoof } from './RoofMassing';

export type ButtressCapStyle = 'flat' | 'gablet' | 'pinnacle';

export interface ButtressOptions {
  height: number;
  width?: number;
  stages?: number;
  depth?: number;
  cap?: ButtressCapStyle;
  brokenTopHeight?: number;
  seed?: number;
}

interface Footprint {
  width: number;
  depth: number;
}

interface SegmentSpec {
  name: string;
  role: 'buttress-stage' | 'weathered-cap';
  startY: number;
  height: number;
  bottom: Footprint;
  top: Footprint;
  stageIndex: number;
}

interface BrokenTopPlacement {
  breakIndex: number;
  visibleHeight: number;
}

const DEFAULT_WIDTH = 0.6;
const DEFAULT_STAGE_COUNT = 3;
const DEFAULT_CAP: ButtressCapStyle = 'flat';
const DEFAULT_FLAT_CAP_HEIGHT = 0.08;
const DEFAULT_SEED = 0xB077_2E55;
const EPSILON = 1e-6;

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function rectangularShape(width: number, height: number): THREE.Shape {
  const halfWidth = width * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, height);
  shape.lineTo(-halfWidth, height);
  shape.closePath();
  return shape;
}

function buildRectangularPrismGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const bevelWidth = Math.max(Math.min(width, height, depth) * 0.16, 0.01);
  const geometry = new THREE.ExtrudeGeometry(rectangularShape(width, height), {
    ...trimExtrudeSettings(bevelWidth),
    depth,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new THREE.Box3();
  const size = bounds.getSize(new THREE.Vector3());
  geometry.scale(
    width / Math.max(size.x, EPSILON),
    height / Math.max(size.y, EPSILON),
    depth / Math.max(size.z, EPSILON),
  );
  geometry.computeBoundingBox();
  const normalizedBounds = geometry.boundingBox ?? new THREE.Box3();
  const centerX = (normalizedBounds.min.x + normalizedBounds.max.x) * 0.5;
  geometry.translate(-centerX, -normalizedBounds.min.y, -normalizedBounds.min.z);
  return finishArchitecturalGeometry(geometry);
}

function footprintOutline(footprint: Footprint): THREE.Vector2[] {
  return [
    new THREE.Vector2(-footprint.width * 0.5, 0),
    new THREE.Vector2(-footprint.width * 0.5, footprint.depth),
    new THREE.Vector2(footprint.width * 0.5, footprint.depth),
    new THREE.Vector2(footprint.width * 0.5, 0),
  ];
}

function createSolidBetweenProfiles(
  bottomOutline: THREE.Vector2[],
  topOutline: THREE.Vector2[],
  height: number,
  topOffsets: readonly number[] = [0, 0, 0, 0],
): THREE.BufferGeometry {
  const vertexData: number[] = [];
  const bottoms = bottomOutline.map(point => new THREE.Vector3(point.x, 0, point.y));
  const tops = topOutline.map((point, index) => new THREE.Vector3(point.x, height + (topOffsets[index] ?? 0), point.y));

  const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    vertexData.push(
      a.x, a.y, a.z,
      b.x, b.y, b.z,
      c.x, c.y, c.z,
    );
  };

  for (let index = 1; index < tops.length - 1; index++) {
    pushTriangle(tops[0]!, tops[index]!, tops[index + 1]!);
    pushTriangle(bottoms[0]!, bottoms[index + 1]!, bottoms[index]!);
  }

  for (let index = 0; index < bottoms.length; index++) {
    const next = (index + 1) % bottoms.length;
    pushTriangle(bottoms[index]!, bottoms[next]!, tops[next]!);
    pushTriangle(bottoms[index]!, tops[next]!, tops[index]!);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexData, 3));
  geometry.computeVertexNormals();
  return finishArchitecturalGeometry(geometry);
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

function interpolateFootprint(bottom: Footprint, top: Footprint, t: number): Footprint {
  return {
    width: THREE.MathUtils.lerp(bottom.width, top.width, t),
    depth: THREE.MathUtils.lerp(bottom.depth, top.depth, t),
  };
}

function computeStageFootprints(width: number, depth: number, stageCount: number): Footprint[] {
  if (stageCount <= 1) return [{ width, depth }];

  const targetWidth = Math.max(
    width - Math.min(width * 0.08, 0.06) * (stageCount - 1),
    width * 0.55,
  );
  const targetDepth = Math.max(
    depth - Math.min(depth * 0.15, 0.055) * (stageCount - 1),
    depth * 0.45,
  );

  return Array.from({ length: stageCount }, (_, index) => {
    const t = index / (stageCount - 1);
    return {
      width: THREE.MathUtils.lerp(width, targetWidth, t),
      depth: THREE.MathUtils.lerp(depth, targetDepth, t),
    };
  });
}

function buildSegments(footprints: Footprint[], height: number): SegmentSpec[] {
  const segments: SegmentSpec[] = [];
  const stageCount = footprints.length;
  const weatheredCapHeight = stageCount > 1
    ? Math.min(Math.max(height * 0.04, 0.12), height / (stageCount * 2.4))
    : 0;
  const stageHeight = (height - weatheredCapHeight * Math.max(stageCount - 1, 0)) / stageCount;

  let cursorY = 0;
  for (let index = 0; index < stageCount; index++) {
    const footprint = footprints[index]!;
    segments.push({
      name: `buttress-stage-${index}`,
      role: 'buttress-stage',
      startY: cursorY,
      height: stageHeight,
      bottom: footprint,
      top: footprint,
      stageIndex: index,
    });
    cursorY += stageHeight;

    if (index === stageCount - 1) continue;

    segments.push({
      name: `weathered-cap-${index}`,
      role: 'weathered-cap',
      startY: cursorY,
      height: weatheredCapHeight,
      bottom: footprint,
      top: footprints[index + 1]!,
      stageIndex: index,
    });
    cursorY += weatheredCapHeight;
  }

  return segments;
}

function resolveBrokenTopPlacement(segments: SegmentSpec[], brokenTopHeight: number): BrokenTopPlacement | null {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]!;
    const segmentEnd = segment.startY + segment.height;

    if (brokenTopHeight < segmentEnd - EPSILON) {
      return {
        breakIndex: index,
        visibleHeight: Math.min(
          segment.height,
          Math.max(brokenTopHeight - segment.startY, EPSILON * 8),
        ),
      };
    }

    if (Math.abs(brokenTopHeight - segmentEnd) <= EPSILON) {
      return {
        breakIndex: index,
        visibleHeight: segment.height,
      };
    }
  }

  return null;
}

function buildStageMesh(segment: SegmentSpec, material: THREE.Material): THREE.Mesh {
  const mesh = createMesh(
    buildRectangularPrismGeometry(segment.bottom.width, segment.height, segment.bottom.depth),
    material,
    segment.name,
    {
      role: segment.role,
      stageIndex: segment.stageIndex,
      width: segment.bottom.width,
      depth: segment.bottom.depth,
    },
  );
  mesh.position.y = segment.startY;
  return mesh;
}

function buildWeatheredCapMesh(segment: SegmentSpec, material: THREE.Material): THREE.Mesh {
  const mesh = createMesh(
    createSolidBetweenProfiles(
      footprintOutline(segment.bottom),
      footprintOutline(segment.top),
      segment.height,
    ),
    material,
    segment.name,
    {
      role: segment.role,
      stageIndex: segment.stageIndex,
      fromWidth: segment.bottom.width,
      fromDepth: segment.bottom.depth,
      toWidth: segment.top.width,
      toDepth: segment.top.depth,
    },
  );
  mesh.position.y = segment.startY;
  return mesh;
}

function buildBrokenTopOutline(footprint: Footprint, rand: () => number): THREE.Vector2[] {
  const maxSideInset = Math.min(footprint.width * 0.12, 0.06);
  const maxFrontInset = Math.min(footprint.depth * 0.18, 0.05);
  const maxBackInset = Math.min(footprint.depth * 0.08, 0.02);

  const leftBackInset = rand() * maxSideInset;
  const leftFrontInset = rand() * maxSideInset;
  const rightFrontInset = rand() * maxSideInset;
  const rightBackInset = rand() * maxSideInset;

  return [
    new THREE.Vector2(-footprint.width * 0.5 + leftBackInset, rand() * maxBackInset),
    new THREE.Vector2(-footprint.width * 0.5 + leftFrontInset, footprint.depth - rand() * maxFrontInset),
    new THREE.Vector2(footprint.width * 0.5 - rightFrontInset, footprint.depth - rand() * maxFrontInset),
    new THREE.Vector2(footprint.width * 0.5 - rightBackInset, rand() * maxBackInset),
  ];
}

function buildBrokenTopOffsets(footprint: Footprint, segmentHeight: number, rand: () => number): number[] {
  const maxDrop = Math.min(
    Math.max(Math.min(footprint.width, footprint.depth) * 0.22, 0.05),
    segmentHeight * 0.7,
  );
  const apexIndex = Math.floor(rand() * 4);

  return Array.from({ length: 4 }, (_, index) => (
    index === apexIndex
      ? 0
      : -(0.2 + rand() * 0.8) * maxDrop
  ));
}

function buildBrokenTopMesh(segment: SegmentSpec, visibleHeight: number, seed: number, material: THREE.Material): THREE.Mesh {
  const partialTop = visibleHeight >= segment.height - EPSILON
    ? segment.top
    : interpolateFootprint(segment.bottom, segment.top, visibleHeight / segment.height);
  const rand = mulberry32((seed ^ 0x4252_4F4B ^ Math.imul(segment.stageIndex + 1, 0x9E37_79B9)) >>> 0);
  const geometry = createSolidBetweenProfiles(
    footprintOutline(segment.bottom),
    buildBrokenTopOutline(partialTop, rand),
    visibleHeight,
    buildBrokenTopOffsets(partialTop, visibleHeight, rand),
  );

  const mesh = createMesh(
    geometry,
    material,
    `${segment.name}-broken`,
    {
      role: 'broken-top',
      stageIndex: segment.stageIndex,
      originalRole: segment.role,
      width: partialTop.width,
      depth: partialTop.depth,
    },
  );
  mesh.position.y = segment.startY;
  return mesh;
}

function buildFlatCap(footprint: Footprint, material: THREE.Material): THREE.Mesh {
  const mesh = createMesh(
    buildRectangularPrismGeometry(footprint.width * 1.06, DEFAULT_FLAT_CAP_HEIGHT, footprint.depth + 0.03),
    material,
    'flat-cap',
    {
      role: 'flat-cap',
    },
  );
  return mesh;
}

function buildGabletCap(footprint: Footprint, material: THREE.Material, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'gablet-cap';
  group.userData.role = 'gablet-cap';
  group.userData.width = footprint.width;
  group.userData.depth = footprint.depth;

  const targetWidth = footprint.width * 0.9;
  const targetDepth = footprint.depth * 0.92;
  const halfWidth = targetWidth / (2 * 1.15);
  const halfDepth = targetDepth / 2.04;
  const ridgeHeight = Math.max(Math.max(footprint.width, footprint.depth) * 0.36, 0.14);
  const roof = buildGableRoof(
    halfWidth,
    halfDepth,
    ridgeHeight,
    (seed ^ 0x4741_424C) >>> 0,
    material,
  );

  roof.name = 'gablet-roof';
  roof.updateMatrixWorld(true);
  let roofBounds = new THREE.Box3().setFromObject(roof);
  roof.position.x -= (roofBounds.min.x + roofBounds.max.x) * 0.5;
  roof.position.y -= roofBounds.min.y;
  roof.position.z -= roofBounds.min.z;
  roof.updateMatrixWorld(true);
  roofBounds = new THREE.Box3().setFromObject(roof);
  const roofSize = roofBounds.getSize(new THREE.Vector3());
  const scaleX = targetWidth / Math.max(roofSize.x, EPSILON);
  const scaleZ = targetDepth / Math.max(roofSize.z, EPSILON);
  const scaleY = Math.sqrt(scaleX * scaleZ);
  roof.scale.set(scaleX, scaleY, scaleZ);
  roof.updateMatrixWorld(true);
  roofBounds = new THREE.Box3().setFromObject(roof);
  roof.position.x -= (roofBounds.min.x + roofBounds.max.x) * 0.5;
  roof.position.y -= roofBounds.min.y;
  roof.position.z -= roofBounds.min.z;
  group.add(roof);
  return group;
}

function buildPinnacleCap(footprint: Footprint, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pinnacle-cap';
  group.userData.role = 'pinnacle-cap';
  group.userData.width = footprint.width;
  group.userData.depth = footprint.depth;

  const baseHeight = 0.06;
  const base = createMesh(
    buildRectangularPrismGeometry(footprint.width * 0.76, baseHeight, footprint.depth * 0.82),
    material,
    'pinnacle-base',
    { role: 'pinnacle-cap' },
  );
  group.add(base);

  const spireHeight = Math.max(Math.max(footprint.width, footprint.depth) * 0.78, 0.28);
  const spire = createMesh(
    createSolidBetweenProfiles(
      footprintOutline({ width: footprint.width * 0.54, depth: footprint.depth * 0.56 }),
      footprintOutline({
        width: Math.max(footprint.width * 0.08, 0.02),
        depth: Math.max(footprint.depth * 0.08, 0.02),
      }),
      spireHeight,
    ),
    material,
    'pinnacle-spire',
    { role: 'pinnacle-cap' },
  );
  spire.position.y = baseHeight;
  group.add(spire);
  return group;
}

function buildCap(cap: ButtressCapStyle, footprint: Footprint, height: number, seed: number, material: THREE.Material): THREE.Object3D | null {
  if (cap === 'gablet') {
    const gablet = buildGabletCap(footprint, material, seed);
    gablet.position.y = height;
    return gablet;
  }

  if (cap === 'pinnacle') {
    const pinnacle = buildPinnacleCap(footprint, material);
    pinnacle.position.y = height;
    return pinnacle;
  }

  const flatCap = buildFlatCap(footprint, material);
  flatCap.position.y = height;
  return flatCap;
}

export function buildButtress(options: ButtressOptions, material: THREE.Material): THREE.Group {
  const height = clampPositive(options.height, 4);
  const width = clampPositive(options.width, DEFAULT_WIDTH);
  const stageCount = Math.max(1, Math.floor(clampPositive(options.stages, DEFAULT_STAGE_COUNT)));
  const depth = clampPositive(options.depth, depthFor('BUTTRESS'));
  const cap = options.cap ?? DEFAULT_CAP;
  const seed = (options.seed ?? DEFAULT_SEED) >>> 0;
  const brokenTopHeight = Number.isFinite(options.brokenTopHeight) && options.brokenTopHeight! > 0 && options.brokenTopHeight! < height
    ? options.brokenTopHeight!
    : undefined;

  const buttress = new THREE.Group();
  buttress.name = 'buttress';
  buttress.userData.role = 'buttress';
  buttress.userData.height = height;
  buttress.userData.width = width;
  buttress.userData.depth = depth;
  buttress.userData.stages = stageCount;
  buttress.userData.cap = cap;
  buttress.userData.brokenTopHeight = brokenTopHeight;

  const footprints = computeStageFootprints(width, depth, stageCount);
  const segments = buildSegments(footprints, height);
  const brokenPlacement = brokenTopHeight === undefined
    ? null
    : resolveBrokenTopPlacement(segments, brokenTopHeight);

  if (brokenPlacement) {
    for (let index = 0; index < brokenPlacement.breakIndex; index++) {
      const segment = segments[index]!;
      buttress.add(segment.role === 'buttress-stage'
        ? buildStageMesh(segment, material)
        : buildWeatheredCapMesh(segment, material));
    }

    buttress.add(buildBrokenTopMesh(
      segments[brokenPlacement.breakIndex]!,
      brokenPlacement.visibleHeight,
      seed,
      material,
    ));
    return buttress;
  }

  for (const segment of segments) {
    buttress.add(segment.role === 'buttress-stage'
      ? buildStageMesh(segment, material)
      : buildWeatheredCapMesh(segment, material));
  }

  const topFootprint = footprints[footprints.length - 1]!;
  const capObject = buildCap(cap, topFootprint, height, seed, material);
  if (capObject) buttress.add(capObject);

  return buttress;
}
