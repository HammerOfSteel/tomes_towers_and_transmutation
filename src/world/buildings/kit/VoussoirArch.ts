import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { depthFor } from './DepthLadder';
import { GOTHIC_ARCH_ROMANESQUE_RATIO } from './GothicArch';

export interface BuildVoussoirArchOptions {
  width: number;
  springHeight: number;
  archRatio: number;
  material: THREE.Material;
  /** Number of ordinary voussoirs per side, excluding the keystone. */
  voussoirCount?: number;
  /** Radial thickness from intrados to extrados. */
  radialThickness?: number;
  /** Extrusion depth along Z for each block. */
  blockDepth?: number;
  /** Center depth of the ordinary voussoirs. */
  depth?: number;
  seed?: number;
  /** 1 = intact arch. Below 1, the keystone is lost first, then upper stones per side. */
  survivalFraction?: number;
  /** Forward Z offset applied only to the keystone. */
  keystoneProud?: number;
}

interface ArchMetrics {
  halfSpan: number;
  radius: number;
  centerOffset: number;
  rise: number;
  halfSweep: number;
}

const DEFAULT_VOUSSOIRS_PER_SIDE = 4;
const DEFAULT_RADIAL_THICKNESS = 0.24;
const DEFAULT_BLOCK_DEPTH = 0.16;
const DEFAULT_KEYSTONE_PROUD = 0.03;
const DEFAULT_ROTATION_JITTER = 0.025;
const DEFAULT_SIZE_JITTER = 0.08;
const KEYSTONE_WIDTH_FACTOR = 1.2;
const JOINT_FRACTION = 0.18;
const LEFT_TAG = 0x4C45_4654;
const RIGHT_TAG = 0x5249_4748;
const KEYSTONE_TAG = 0x4B45_5953;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function signed(rand: () => number): number {
  return rand() * 2 - 1;
}

function getEffectiveArchRatio(archRatio: number): number {
  return Math.max(archRatio, GOTHIC_ARCH_ROMANESQUE_RATIO);
}

function getArchMetrics(width: number, archRatio: number): ArchMetrics {
  // GothicArch.ts keeps this helper private, so this additive module re-derives
  // the same standard two-centred-arch geometry instead of widening that file's API.
  const span = Math.max(width, 0);
  const radius = span * getEffectiveArchRatio(archRatio);
  const halfSpan = span / 2;
  const centerOffset = radius - halfSpan;
  const rise = Math.sqrt(Math.max(radius * radius - centerOffset * centerOffset, 0));
  const halfSweep = Math.atan2(rise, centerOffset);

  return { halfSpan, radius, centerOffset, rise, halfSweep };
}

function polarPoint(centerX: number, centerY: number, radius: number, angle: number): THREE.Vector2 {
  return new THREE.Vector2(
    centerX + Math.cos(angle) * radius,
    centerY + Math.sin(angle) * radius,
  );
}

function shrinkInterval(start: number, end: number, margin: number): [number, number] {
  const span = Math.abs(end - start);
  const appliedMargin = Math.min(margin, span * 0.6);
  if (start > end) {
    return [start - appliedMargin / 2, end + appliedMargin / 2];
  }
  return [start + appliedMargin / 2, end - appliedMargin / 2];
}

function buildPolygonShape(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i]!.x, points[i]!.y);
  }
  shape.closePath();
  return shape;
}

function createExtrudedMesh(
  shape: THREE.Shape,
  depth: number,
  material: THREE.Material,
  name: string,
  userData: Record<string, unknown>,
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(center.x, center.y, userData.depthCenter as number);
  mesh.userData = userData;
  return mesh;
}

function pieceRandom(seed: number, tag: number, slotIndex: number): () => number {
  return mulberry32((seed ^ tag ^ Math.imul(slotIndex + 1, 0x9E37_79B9)) >>> 0);
}

function buildSideVoussoir(options: {
  centerX: number;
  centerY: number;
  innerRadius: number;
  radialThickness: number;
  angleStart: number;
  angleEnd: number;
  blockDepth: number;
  depthCenter: number;
  material: THREE.Material;
  name: string;
  side: 'left' | 'right';
  slotIndex: number;
  seed: number;
  tag: number;
}): THREE.Mesh {
  const rand = pieceRandom(options.seed, options.tag, options.slotIndex);
  const rotationJitter = signed(rand) * DEFAULT_ROTATION_JITTER;
  const thickness = options.radialThickness * (1 + signed(rand) * DEFAULT_SIZE_JITTER);
  const margin = Math.abs(options.angleEnd - options.angleStart) * JOINT_FRACTION;
  const [trimmedStart, trimmedEnd] = shrinkInterval(options.angleStart, options.angleEnd, margin);
  const outerRadius = options.innerRadius + Math.max(thickness, 0.02);

  const shape = buildPolygonShape([
    polarPoint(options.centerX, options.centerY, options.innerRadius, trimmedStart),
    polarPoint(options.centerX, options.centerY, options.innerRadius, trimmedEnd),
    polarPoint(options.centerX, options.centerY, outerRadius, trimmedEnd),
    polarPoint(options.centerX, options.centerY, outerRadius, trimmedStart),
  ]);

  const mesh = createExtrudedMesh(shape, options.blockDepth, options.material, options.name, {
    role: 'voussoir',
    side: options.side,
    slotIndex: options.slotIndex,
    depthCenter: options.depthCenter,
  });
  mesh.rotation.z = rotationJitter;
  return mesh;
}

function buildKeystone(options: {
  centerOffset: number;
  springHeight: number;
  innerRadius: number;
  radialThickness: number;
  leftBoundaryAngle: number;
  rightBoundaryAngle: number;
  apexLeftAngle: number;
  apexRightAngle: number;
  apexY: number;
  blockDepth: number;
  depthCenter: number;
  material: THREE.Material;
  seed: number;
}): THREE.Mesh {
  const rand = pieceRandom(options.seed, KEYSTONE_TAG, 0);
  const thickness = options.radialThickness * (1.08 + signed(rand) * (DEFAULT_SIZE_JITTER * 0.5));
  const leftAngle = THREE.MathUtils.lerp(options.leftBoundaryAngle, options.apexLeftAngle, JOINT_FRACTION * 0.5);
  const rightAngle = THREE.MathUtils.lerp(options.rightBoundaryAngle, options.apexRightAngle, JOINT_FRACTION * 0.5);
  const outerRadius = options.innerRadius + Math.max(thickness, 0.02);
  const apexOuterRise = Math.sqrt(Math.max(outerRadius * outerRadius - options.centerOffset * options.centerOffset, 0));
  const apexOuter = new THREE.Vector2(0, options.springHeight + apexOuterRise);

  const shape = buildPolygonShape([
    polarPoint(options.centerOffset, options.springHeight, options.innerRadius, leftAngle),
    new THREE.Vector2(0, options.apexY),
    polarPoint(-options.centerOffset, options.springHeight, options.innerRadius, rightAngle),
    polarPoint(-options.centerOffset, options.springHeight, outerRadius, rightAngle),
    apexOuter,
    polarPoint(options.centerOffset, options.springHeight, outerRadius, leftAngle),
  ]);

  const mesh = createExtrudedMesh(shape, options.blockDepth, options.material, 'keystone', {
    role: 'keystone',
    depthCenter: options.depthCenter,
  });
  mesh.rotation.z = signed(rand) * (DEFAULT_ROTATION_JITTER * 0.35);
  return mesh;
}

function survivingSideCount(voussoirCount: number, survivalFraction: number): number {
  if (survivalFraction >= 1) return voussoirCount;
  return clamp(Math.ceil(voussoirCount * clamp(survivalFraction, 0, 1) - 1e-6), 0, voussoirCount);
}

export function buildVoussoirArch(options: BuildVoussoirArchOptions): THREE.Group {
  const voussoirCount = Math.max(1, Math.floor(options.voussoirCount ?? DEFAULT_VOUSSOIRS_PER_SIDE));
  const radialThickness = Math.max(options.radialThickness ?? DEFAULT_RADIAL_THICKNESS, 0.04);
  const blockDepth = Math.max(options.blockDepth ?? DEFAULT_BLOCK_DEPTH, 0.02);
  const depthCenter = options.depth ?? depthFor('FRAME');
  const survivalFraction = clamp(options.survivalFraction ?? 1, 0, 1);
  const keystoneProud = options.keystoneProud ?? DEFAULT_KEYSTONE_PROUD;
  const seed = options.seed ?? 0;
  const metrics = getArchMetrics(options.width, options.archRatio);
  const apexY = options.springHeight + metrics.rise;

  const group = new THREE.Group();
  group.name = 'voussoir-arch';
  group.userData = {
    role: 'voussoir-arch',
    voussoirCount,
    survivingPerSide: survivingSideCount(voussoirCount, survivalFraction),
    hasKeystone: survivalFraction >= 1,
  };

  const step = metrics.halfSweep / (voussoirCount + KEYSTONE_WIDTH_FACTOR / 2);
  const keystoneHalfAngle = step * KEYSTONE_WIDTH_FACTOR * 0.5;
  const sideSurvivors = survivingSideCount(voussoirCount, survivalFraction);

  for (let index = 0; index < sideSurvivors; index++) {
    const leftLower = Math.PI - index * step;
    const leftUpper = Math.PI - (index + 1) * step;
    group.add(buildSideVoussoir({
      centerX: metrics.centerOffset,
      centerY: options.springHeight,
      innerRadius: metrics.radius,
      radialThickness,
      angleStart: leftLower,
      angleEnd: leftUpper,
      blockDepth,
      depthCenter,
      material: options.material,
      name: `voussoir-left-${index}`,
      side: 'left',
      slotIndex: index,
      seed,
      tag: LEFT_TAG,
    }));

    const rightLower = index * step;
    const rightUpper = (index + 1) * step;
    group.add(buildSideVoussoir({
      centerX: -metrics.centerOffset,
      centerY: options.springHeight,
      innerRadius: metrics.radius,
      radialThickness,
      angleStart: rightLower,
      angleEnd: rightUpper,
      blockDepth,
      depthCenter,
      material: options.material,
      name: `voussoir-right-${index}`,
      side: 'right',
      slotIndex: index,
      seed,
      tag: RIGHT_TAG,
    }));
  }

  if (survivalFraction >= 1) {
    const apexLeftAngle = Math.PI - metrics.halfSweep;
    const apexRightAngle = metrics.halfSweep;
    const leftBoundaryAngle = Math.PI - metrics.halfSweep + keystoneHalfAngle;
    const rightBoundaryAngle = metrics.halfSweep - keystoneHalfAngle;
    group.add(buildKeystone({
      centerOffset: metrics.centerOffset,
      springHeight: options.springHeight,
      innerRadius: metrics.radius,
      radialThickness,
      leftBoundaryAngle,
      rightBoundaryAngle,
      apexLeftAngle,
      apexRightAngle,
      apexY,
      blockDepth,
      depthCenter: depthCenter + keystoneProud,
      material: options.material,
      seed,
    }));
  }

  return group;
}
