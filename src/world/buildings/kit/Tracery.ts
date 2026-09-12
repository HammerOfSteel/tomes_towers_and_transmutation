import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { finishArchitecturalGeometry, trimExtrudeSettings } from './Bevels';
import { depthFor } from './DepthLadder';

export interface TraceryFoilOptions {
  depth?: number;
  material?: THREE.Material;
}

export interface RoseWindowOptions {
  lobes: number;
  radius?: number;
  ringCount?: number;
  brokenEmission?: boolean;
  seed?: number;
}

const DEFAULT_FOIL_DEPTH = depthFor('FRAME');
const DEFAULT_ROSE_RADIUS = 1;
const DEFAULT_RING_COUNT = 2;
const DEFAULT_CURVE_SEGMENTS = 24;

// Medieval foils are not flat decals; they are pierced stone plates whose outer
// outline is set out from equal-radius circular lobes. The small central eye and
// the cusp lights between lobes are the openings, while the remaining stone is
// the tracery frame itself.
const FOIL_LOBE_ORBIT_RATIO = 0.4;
const FOIL_LOBE_RADIUS_RATIO = 0.64;
const FOIL_OCULUS_RATIO = 0.15;
const FOIL_CUSP_ORBIT_RATIO = 0.34;
const FOIL_CUSP_RADIUS_RATIO = 0.11;

const ROSE_OCULUS_RATIO = 0.14;
const ROSE_RING_SHARE = 0.42;
const ROSE_RING_SEGMENT_COVERAGE = 0.72;
const ROSE_SPOKE_JUNCTION_COVERAGE = 0.34;
const ROSE_SPOKE_WAIST_COVERAGE = 0.18;
const ROSE_SEGMENT_HOLE_RADIAL_INSET_RATIO = 0.24;
const ROSE_SEGMENT_HOLE_ANGULAR_INSET_RATIO = 0.24;
const BROKEN_SPOKE_TAG = 0x5350_4B45;
const BROKEN_RING_TAG = 0x524E_4730;

interface RoseRadialBand {
  innerRadius: number;
  outerRadius: number;
}

export interface RoseWindowLayout {
  lobes: number;
  radius: number;
  ringCount: number;
  requestedRingCount: number;
  depth: number;
  step: number;
  oculusRadius: number;
  ringBands: RoseRadialBand[];
  spokeBelts: RoseRadialBand[];
  ringSegmentAngleSpan: number;
  spokeJunctionAngleSpan: number;
  spokeWaistAngleSpan: number;
  junctionOverlapAngle: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function polarPoint(radius: number, angle: number): THREE.Vector2 {
  return new THREE.Vector2(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
  );
}

function circlePath(center: THREE.Vector2, radius: number): THREE.Path {
  const path = new THREE.Path();
  path.absarc(center.x, center.y, radius, 0, Math.PI * 2, false);
  return path;
}

function buildAnnularSectorPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): THREE.Path {
  const outerStart = polarPoint(outerRadius, startAngle);
  const innerEnd = polarPoint(innerRadius, endAngle);
  const path = new THREE.Path();
  path.moveTo(outerStart.x, outerStart.y);
  path.absarc(0, 0, outerRadius, startAngle, endAngle, false);
  path.lineTo(innerEnd.x, innerEnd.y);
  path.absarc(0, 0, innerRadius, endAngle, startAngle, true);
  path.closePath();
  return path;
}

function extrudeTraceryShape(shape: THREE.Shape, depth: number, curveSegments = DEFAULT_CURVE_SEGMENTS): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    ...trimExtrudeSettings(depth / 2),
    depth,
    bevelEnabled: true,
    steps: 1,
    curveSegments,
  });
  geometry.translate(0, 0, -depth / 2);
  return finishArchitecturalGeometry(geometry);
}

function createTraceryMesh(
  shape: THREE.Shape,
  depth: number,
  material: THREE.Material,
  name: string,
  userData: Record<string, unknown>,
  curveSegments = DEFAULT_CURVE_SEGMENTS,
): THREE.Mesh {
  const mesh = new THREE.Mesh(extrudeTraceryShape(shape, depth, curveSegments), material);
  mesh.name = name;
  mesh.userData = userData;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function circleIntersections(a: THREE.Vector2, b: THREE.Vector2, radius: number): [THREE.Vector2, THREE.Vector2] {
  const delta = new THREE.Vector2().subVectors(b, a);
  const distance = Math.max(delta.length(), 1e-6);
  const half = distance / 2;
  const midpoint = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5);
  const height = Math.sqrt(Math.max(radius * radius - half * half, 0));
  const normal = new THREE.Vector2(-delta.y / distance, delta.x / distance);
  return [
    midpoint.clone().addScaledVector(normal, height),
    midpoint.clone().addScaledVector(normal, -height),
  ];
}

function fartherFromOrigin(points: [THREE.Vector2, THREE.Vector2]): THREE.Vector2 {
  return points[0]!.lengthSq() >= points[1]!.lengthSq() ? points[0]! : points[1]!;
}

function appendOuterArc(shape: THREE.Shape, center: THREE.Vector2, radius: number, start: THREE.Vector2, end: THREE.Vector2): void {
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const ccwSweep = THREE.MathUtils.euclideanModulo(endAngle - startAngle, Math.PI * 2);
  const cwSweep = Math.PI * 2 - ccwSweep;
  const ccwMidAngle = startAngle + ccwSweep / 2;
  const cwMidAngle = startAngle - cwSweep / 2;
  const ccwMid = new THREE.Vector2(center.x + Math.cos(ccwMidAngle) * radius, center.y + Math.sin(ccwMidAngle) * radius);
  const cwMid = new THREE.Vector2(center.x + Math.cos(cwMidAngle) * radius, center.y + Math.sin(cwMidAngle) * radius);
  // Between two equal-circle intersections, the tracery outline is the sweep
  // that bulges AWAY from the foil's center rather than the short inner chord.
  shape.absarc(center.x, center.y, radius, startAngle, endAngle, cwMid.lengthSq() > ccwMid.lengthSq());
}

function buildFoilShape(radius: number, lobeCount: number): THREE.Shape {
  const orbitRadius = radius * FOIL_LOBE_ORBIT_RATIO;
  const lobeRadius = radius * FOIL_LOBE_RADIUS_RATIO;
  const step = (Math.PI * 2) / lobeCount;
  const centers = Array.from({ length: lobeCount }, (_, index) => polarPoint(orbitRadius, -Math.PI / 2 + index * step));
  const intersections = centers.map((center, index) => {
    const next = centers[(index + 1) % lobeCount]!;
    return fartherFromOrigin(circleIntersections(center, next, lobeRadius));
  });

  const shape = new THREE.Shape();
  const firstPoint = intersections[lobeCount - 1]!;
  shape.moveTo(firstPoint.x, firstPoint.y);

  for (let index = 0; index < lobeCount; index++) {
    const center = centers[index]!;
    const start = intersections[(index - 1 + lobeCount) % lobeCount]!;
    const end = intersections[index]!;
    appendOuterArc(shape, center, lobeRadius, start, end);
  }

  shape.closePath();
  shape.holes.push(circlePath(new THREE.Vector2(0, 0), radius * FOIL_OCULUS_RATIO));

  for (let index = 0; index < lobeCount; index++) {
    const angle = -Math.PI / 2 + (index + 0.5) * step;
    shape.holes.push(circlePath(polarPoint(radius * FOIL_CUSP_ORBIT_RATIO, angle), radius * FOIL_CUSP_RADIUS_RATIO));
  }

  return shape;
}

function buildAnnularSectorShape(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): THREE.Shape {
  const outerStart = polarPoint(outerRadius, startAngle);
  const innerEnd = polarPoint(innerRadius, endAngle);
  const shape = new THREE.Shape();
  shape.moveTo(outerStart.x, outerStart.y);
  shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
  shape.lineTo(innerEnd.x, innerEnd.y);
  shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
  shape.closePath();
  return shape;
}

function addSegmentPiercing(shape: THREE.Shape, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): void {
  const holeInner = innerRadius + (outerRadius - innerRadius) * ROSE_SEGMENT_HOLE_RADIAL_INSET_RATIO;
  const holeOuter = outerRadius - (outerRadius - innerRadius) * ROSE_SEGMENT_HOLE_RADIAL_INSET_RATIO;
  const holeStart = startAngle + (endAngle - startAngle) * ROSE_SEGMENT_HOLE_ANGULAR_INSET_RATIO;
  const holeEnd = endAngle - (endAngle - startAngle) * ROSE_SEGMENT_HOLE_ANGULAR_INSET_RATIO;

  if (holeOuter - holeInner > 0.018 && holeEnd - holeStart > 0.045) {
    shape.holes.push(buildAnnularSectorPath(holeInner, holeOuter, holeStart, holeEnd));
  }
}

function buildRingSegmentShape(innerRadius: number, outerRadius: number, angleCenter: number, angleSpan: number): THREE.Shape {
  const halfSpan = angleSpan / 2;
  const start = angleCenter - halfSpan;
  const end = angleCenter + halfSpan;
  const shape = buildAnnularSectorShape(innerRadius, outerRadius, start, end);
  addSegmentPiercing(shape, innerRadius, outerRadius, start, end);
  return shape;
}

function buildSpokeConnectorShape(
  innerRadius: number,
  outerRadius: number,
  angleCenter: number,
  junctionAngleSpan: number,
  waistAngleSpan: number,
): THREE.Shape {
  const junctionHalf = junctionAngleSpan * 0.5;
  const waistHalf = Math.min(waistAngleSpan, junctionAngleSpan) * 0.5;
  const waistRadius = THREE.MathUtils.lerp(innerRadius, outerRadius, 0.5);
  const startAngle = angleCenter - junctionHalf;
  const endAngle = angleCenter + junctionHalf;
  const innerStart = polarPoint(innerRadius, startAngle);
  const waistStart = polarPoint(waistRadius, angleCenter - waistHalf);
  const outerStart = polarPoint(outerRadius, startAngle);
  const waistEnd = polarPoint(waistRadius, angleCenter + waistHalf);
  const innerEnd = polarPoint(innerRadius, endAngle);
  const shape = new THREE.Shape();
  shape.moveTo(innerStart.x, innerStart.y);
  shape.lineTo(waistStart.x, waistStart.y);
  shape.lineTo(outerStart.x, outerStart.y);
  shape.absarc(0, 0, outerRadius, startAngle, endAngle, false);
  shape.lineTo(waistEnd.x, waistEnd.y);
  shape.lineTo(innerEnd.x, innerEnd.y);
  shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
  shape.closePath();
  return shape;
}

function createRoseWindowLayout(options: RoseWindowOptions): RoseWindowLayout {
  const lobes = Math.max(3, Math.floor(options.lobes));
  const radius = Math.max(options.radius ?? DEFAULT_ROSE_RADIUS, 0.25);
  const depth = DEFAULT_FOIL_DEPTH;
  const requestedRingCount = Math.max(1, Math.floor(options.ringCount ?? DEFAULT_RING_COUNT));
  const oculusRadius = radius * ROSE_OCULUS_RATIO;
  const radialSpan = radius - oculusRadius;
  const minBandThickness = Math.max(depth * 0.55, 0.03);
  const maxSupportedRingCount = Math.max(1, Math.floor(radialSpan / (minBandThickness * 2)));
  const ringCount = Math.min(requestedRingCount, maxSupportedRingCount);
  const step = (Math.PI * 2) / lobes;
  const ringThickness = radialSpan * ROSE_RING_SHARE / ringCount;
  const spokeThickness = radialSpan * (1 - ROSE_RING_SHARE) / ringCount;
  const ringSegmentAngleSpan = step * ROSE_RING_SEGMENT_COVERAGE;
  const spokeJunctionAngleSpan = Math.min(step * ROSE_SPOKE_JUNCTION_COVERAGE, ringSegmentAngleSpan);
  const spokeWaistAngleSpan = Math.min(step * ROSE_SPOKE_WAIST_COVERAGE, spokeJunctionAngleSpan);
  const junctionOverlapAngle = ringSegmentAngleSpan + spokeJunctionAngleSpan - step;
  const spokeBelts: RoseRadialBand[] = [];
  const ringBands: RoseRadialBand[] = [];

  let cursor = oculusRadius;
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
    const spokeInner = cursor;
    const spokeOuter = cursor + spokeThickness;
    spokeBelts.push({ innerRadius: spokeInner, outerRadius: spokeOuter });
    cursor = spokeOuter;

    const ringInner = cursor;
    const ringOuter = ringIndex === ringCount - 1 ? radius : cursor + ringThickness;
    ringBands.push({ innerRadius: ringInner, outerRadius: ringOuter });
    cursor = ringOuter;
  }

  return {
    lobes,
    radius,
    ringCount,
    requestedRingCount,
    depth,
    step,
    oculusRadius,
    ringBands,
    spokeBelts,
    ringSegmentAngleSpan,
    spokeJunctionAngleSpan,
    spokeWaistAngleSpan,
    junctionOverlapAngle,
  };
}

function pieceRandom(seed: number, primary: number, secondary: number): () => number {
  return mulberry32((seed ^ Math.imul(primary + 1, 0x9E37_79B9) ^ Math.imul(secondary + 1, 0x85EB_CA6B)) >>> 0);
}

function shuffleIndices(count: number, rand: () => number): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [indices[index], indices[swapIndex]] = [indices[swapIndex]!, indices[index]!];
  }
  return indices;
}

function selectBrokenSpokes(lobes: number, seed: number): Set<number> {
  const rand = mulberry32((seed ^ 0x5350_4F4B) >>> 0);
  const target = clamp(Math.floor(lobes / 3), 1, Math.max(1, lobes - 1));
  return new Set(shuffleIndices(lobes, rand).slice(0, target));
}

function selectBrokenRingSegments(lobes: number, ringCount: number, seed: number): Set<string> {
  const broken = new Set<string>();
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
    const rand = mulberry32((seed ^ Math.imul(ringIndex + 1, 0x5249_4E47)) >>> 0);
    const slotCount = Math.max(1, Math.ceil(lobes / 4));
    for (const slotIndex of shuffleIndices(lobes, rand).slice(0, slotCount)) {
      broken.add(`${ringIndex}:${slotIndex}`);
    }
  }
  return broken;
}

function buildBrokenRingFragment(
  innerRadius: number,
  outerRadius: number,
  angleCenter: number,
  angleSpan: number,
  depth: number,
  material: THREE.Material,
  ringIndex: number,
  slotIndex: number,
  seed: number,
): THREE.Mesh {
  const rand = pieceRandom(seed, BROKEN_RING_TAG + ringIndex, slotIndex);
  const fragmentShape = buildAnnularSectorShape(
    THREE.MathUtils.lerp(innerRadius, outerRadius, 0.18),
    THREE.MathUtils.lerp(innerRadius, outerRadius, 0.74),
    angleCenter - angleSpan * 0.18,
    angleCenter + angleSpan * 0.18,
  );
  const mesh = createTraceryMesh(fragmentShape, depth * (0.6 + rand() * 0.14), material, `ring-${ringIndex}-broken-segment-${slotIndex}`, {
    role: 'broken-tracery-fragment',
    kind: 'ring-segment',
    ringIndex,
    slotIndex,
  });
  const radialOffset = polarPoint((outerRadius - innerRadius) * (0.35 + rand() * 0.18), angleCenter);
  const tangentOffset = polarPoint((outerRadius - innerRadius) * (0.16 + rand() * 0.08), angleCenter + Math.PI / 2);
  mesh.position.add(new THREE.Vector3(radialOffset.x + tangentOffset.x, radialOffset.y + tangentOffset.y - (outerRadius - innerRadius) * 0.2, -depth * (0.12 + rand() * 0.12)));
  mesh.rotation.x = (rand() * 2 - 1) * 0.18;
  mesh.rotation.y = (rand() * 2 - 1) * 0.14;
  mesh.rotation.z = (rand() * 2 - 1) * 0.28;
  return mesh;
}

function buildBrokenSpokeFragment(
  innerRadius: number,
  outerRadius: number,
  angleCenter: number,
  junctionAngleSpan: number,
  waistAngleSpan: number,
  depth: number,
  material: THREE.Material,
  slotIndex: number,
  seed: number,
): THREE.Mesh {
  const rand = pieceRandom(seed, BROKEN_SPOKE_TAG, slotIndex);
  const fragmentShape = buildSpokeConnectorShape(
    THREE.MathUtils.lerp(innerRadius, outerRadius, 0.24),
    THREE.MathUtils.lerp(innerRadius, outerRadius, 0.7),
    angleCenter,
    junctionAngleSpan * 0.72,
    waistAngleSpan * 0.8,
  );
  const mesh = createTraceryMesh(fragmentShape, depth * (0.62 + rand() * 0.14), material, `spoke-broken-${slotIndex}`, {
    role: 'broken-tracery-fragment',
    kind: 'spoke',
    slotIndex,
  });
  const radialOffset = polarPoint((outerRadius - innerRadius) * (0.22 + rand() * 0.16), angleCenter);
  const tangentOffset = polarPoint((outerRadius - innerRadius) * (0.12 + rand() * 0.08), angleCenter + Math.PI / 2);
  mesh.position.add(new THREE.Vector3(radialOffset.x + tangentOffset.x, radialOffset.y + tangentOffset.y - (outerRadius - innerRadius) * 0.18, -depth * (0.12 + rand() * 0.12)));
  mesh.rotation.x = (rand() * 2 - 1) * 0.2;
  mesh.rotation.y = (rand() * 2 - 1) * 0.16;
  mesh.rotation.z = (rand() * 2 - 1) * 0.22;
  return mesh;
}

function buildFoil(name: string, radius: number, lobeCount: number, options: TraceryFoilOptions = {}): THREE.Group {
  const material = options.material ?? new THREE.MeshStandardMaterial({ color: '#b7b0a2' });
  const depth = Math.max(options.depth ?? DEFAULT_FOIL_DEPTH, 0.02);
  const group = new THREE.Group();
  group.name = name;
  group.add(createTraceryMesh(buildFoilShape(radius, lobeCount), depth, material, 'foil-frame', {
    role: 'foil-frame',
    lobes: lobeCount,
  }, 32));
  return group;
}

export function buildTrefoil(radius: number, options: TraceryFoilOptions = {}): THREE.Group {
  return buildFoil('trefoil', radius, 3, options);
}

export function buildQuatrefoil(radius: number, options: TraceryFoilOptions = {}): THREE.Group {
  return buildFoil('quatrefoil', radius, 4, options);
}

export function buildRoseWindow(options: RoseWindowOptions, material: THREE.Material): THREE.Group {
  const brokenEmission = options.brokenEmission ?? false;
  const seed = options.seed ?? 0;
  const layout = createRoseWindowLayout(options);
  const rose = new THREE.Group();
  rose.name = 'rose-window';
  rose.userData = {
    role: 'rose-window',
    lobes: layout.lobes,
    ringCount: layout.ringCount,
    requestedRingCount: layout.requestedRingCount,
    depth: layout.depth,
    junctionOverlapAngle: layout.junctionOverlapAngle,
  };
  const brokenSpokes = brokenEmission ? selectBrokenSpokes(layout.lobes, seed) : new Set<number>();
  const brokenRingSegments = brokenEmission ? selectBrokenRingSegments(layout.lobes, layout.ringCount, seed) : new Set<string>();

  for (let ringIndex = 0; ringIndex < layout.ringCount; ringIndex++) {
    const ringGroup = new THREE.Group();
    ringGroup.name = `ring-${ringIndex}`;
    const band = layout.ringBands[ringIndex]!;

    for (let slotIndex = 0; slotIndex < layout.lobes; slotIndex++) {
      const angleCenter = -Math.PI / 2 + slotIndex * layout.step + layout.step / 2;
      if (brokenRingSegments.has(`${ringIndex}:${slotIndex}`)) {
        ringGroup.add(buildBrokenRingFragment(
          band.innerRadius,
          band.outerRadius,
          angleCenter,
          layout.ringSegmentAngleSpan,
          layout.depth,
          material,
          ringIndex,
          slotIndex,
          seed,
        ));
        continue;
      }

      ringGroup.add(createTraceryMesh(
        buildRingSegmentShape(band.innerRadius, band.outerRadius, angleCenter, layout.ringSegmentAngleSpan),
        layout.depth,
        material,
        `ring-${ringIndex}-segment-${slotIndex}`,
        {
          role: 'ring-segment',
          ringIndex,
          slotIndex,
        },
      ));
    }

    rose.add(ringGroup);
  }

  for (let slotIndex = 0; slotIndex < layout.lobes; slotIndex++) {
    const spokeGroup = new THREE.Group();
    spokeGroup.name = `spoke-${slotIndex}`;
    const angleCenter = -Math.PI / 2 + slotIndex * layout.step;

    for (let beltIndex = 0; beltIndex < layout.spokeBelts.length; beltIndex++) {
      const belt = layout.spokeBelts[beltIndex]!;
      if (brokenSpokes.has(slotIndex)) {
        if (beltIndex === 0) {
          spokeGroup.add(buildBrokenSpokeFragment(
            belt.innerRadius,
            belt.outerRadius,
            angleCenter,
            layout.spokeJunctionAngleSpan,
            layout.spokeWaistAngleSpan,
            layout.depth,
            material,
            slotIndex,
            seed,
          ));
        }
        continue;
      }

      spokeGroup.add(createTraceryMesh(
        buildSpokeConnectorShape(
          belt.innerRadius,
          belt.outerRadius,
          angleCenter,
          layout.spokeJunctionAngleSpan,
          layout.spokeWaistAngleSpan,
        ),
        layout.depth,
        material,
        `spoke-${slotIndex}-connector-${beltIndex}`,
        {
          role: 'spoke-connector',
          slotIndex,
          beltIndex,
        },
      ));
    }

    rose.add(spokeGroup);
  }

  return rose;
}

export const __traceryTestUtils = {
  polarPoint: (radius: number, angle: number): THREE.Vector2 => polarPoint(radius, angle),
  buildTrefoilShape(radius: number): THREE.Shape {
    return buildFoilShape(radius, 3);
  },
  buildQuatrefoilShape(radius: number): THREE.Shape {
    return buildFoilShape(radius, 4);
  },
  createRoseWindowLayout(options: RoseWindowOptions): RoseWindowLayout {
    return createRoseWindowLayout(options);
  },
  buildRoseRingSegmentShape(layout: RoseWindowLayout, ringIndex: number, slotIndex: number): THREE.Shape {
    const band = layout.ringBands[ringIndex]!;
    const angleCenter = -Math.PI / 2 + slotIndex * layout.step + layout.step / 2;
    return buildRingSegmentShape(band.innerRadius, band.outerRadius, angleCenter, layout.ringSegmentAngleSpan);
  },
  buildRoseSpokeConnectorShape(layout: RoseWindowLayout, slotIndex: number, beltIndex: number): THREE.Shape {
    const belt = layout.spokeBelts[beltIndex]!;
    const angleCenter = -Math.PI / 2 + slotIndex * layout.step;
    return buildSpokeConnectorShape(
      belt.innerRadius,
      belt.outerRadius,
      angleCenter,
      layout.spokeJunctionAngleSpan,
      layout.spokeWaistAngleSpan,
    );
  },
};
