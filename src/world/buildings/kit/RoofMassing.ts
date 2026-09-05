import * as THREE from 'three';
import { buildShingleSurface, type ShingleSurfaceOptions } from './ShingleSurface';

const DEFAULT_EAVE_OVERHANG_FRAC = 0.15;
const DEFAULT_COURSE_HEIGHT = 0.35;
const MIN_STRIP_WIDTH = 0.24;

export interface RoofMassingOptions {
  eaveOverhangFrac?: number;
  shingle?: ShingleSurfaceOptions;
}

export interface CrossGableRoofOptions extends RoofMassingOptions {
  wingHalfWidth?: number;
  wingHalfDepth?: number;
  wingRidgeHeight?: number;
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function markRoofMesh(mesh: THREE.Mesh, name?: string): THREE.Mesh {
  if (name) mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeDoubleSidedTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([
    a.x, a.y, a.z,
    b.x, b.y, b.z,
    c.x, c.y, c.z,
    a.x, a.y, a.z,
    c.x, c.y, c.z,
    b.x, b.y, b.z,
  ]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return markRoofMesh(new THREE.Mesh(geometry, material), name);
}

function setBasis(group: THREE.Group, origin: THREE.Vector3, xAxis: THREE.Vector3, yAxis: THREE.Vector3): void {
  const x = xAxis.clone().normalize();
  const y = yAxis.clone().normalize();
  const z = x.clone().cross(y).normalize();
  const matrix = new THREE.Matrix4().makeBasis(x, y, z);
  group.position.copy(origin);
  group.setRotationFromMatrix(matrix);
}

function shingleOptionsWithTrim(
  options: ShingleSurfaceOptions | undefined,
  trim: NonNullable<ShingleSurfaceOptions['trim']>,
  courseHeight?: number,
): ShingleSurfaceOptions {
  return {
    ...options,
    ...(courseHeight ? { courseHeight } : {}),
    trim: {
      ridge: trim.ridge,
      eave: trim.eave,
      verge: trim.verge,
    },
  };
}

function makeLinearCap(
  start: THREE.Vector3,
  end: THREE.Vector3,
  material: THREE.Material,
  width: number,
  height: number,
  name: string,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const length = Math.max(direction.length(), 0.01);
  const mesh = markRoofMesh(new THREE.Mesh(new THREE.BoxGeometry(width, height, length), material), name);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
  return mesh;
}

function buildTaperedShingleSlope(
  baseWidth: number,
  topWidth: number,
  slopeLength: number,
  seed: number,
  material: THREE.Material,
  options: ShingleSurfaceOptions | undefined,
  name: string,
  trim: { eave: boolean; ridge: boolean; verge: boolean },
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.roofRole = 'slope';
  group.userData.baseWidth = baseWidth;
  group.userData.topWidth = topWidth;

  const requestedCourseHeight = clampPositive(options?.courseHeight ?? DEFAULT_COURSE_HEIGHT, DEFAULT_COURSE_HEIGHT);
  const courseCount = Math.max(1, Math.round(clampPositive(slopeLength, requestedCourseHeight) / requestedCourseHeight));
  const actualCourseHeight = slopeLength / courseCount;
  group.userData.courseCount = courseCount;
  group.userData.courseHeight = actualCourseHeight;

  for (let courseIndex = 0; courseIndex < courseCount; courseIndex++) {
    const y0 = courseIndex * actualCourseHeight;
    const y1 = (courseIndex + 1) * actualCourseHeight;
    const midT = Math.min(1, Math.max(0, (y0 + y1) * 0.5 / slopeLength));
    const stripWidth = Math.max(MIN_STRIP_WIDTH, THREE.MathUtils.lerp(baseWidth, topWidth, midT));
    const strip = buildShingleSurface(
      stripWidth,
      actualCourseHeight,
      (seed ^ (0x4849_5000 + courseIndex)) >>> 0,
      material,
      shingleOptionsWithTrim(options, {
        eave: trim.eave && courseIndex === 0,
        ridge: trim.ridge && courseIndex === courseCount - 1,
        verge: trim.verge,
      }, actualCourseHeight),
    );
    strip.name = `strip-${courseIndex}`;
    strip.position.y = y0;
    group.add(strip);
  }

  return group;
}

function buildRectangularSlope(
  panelWidth: number,
  slopeLength: number,
  seed: number,
  material: THREE.Material,
  options: ShingleSurfaceOptions | undefined,
  name: string,
  trim: { eave: boolean; ridge: boolean; verge: boolean },
): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.roofRole = 'slope';
  group.userData.baseWidth = panelWidth;
  group.userData.topWidth = panelWidth;

  const surface = buildShingleSurface(
    panelWidth,
    slopeLength,
    seed,
    material,
    shingleOptionsWithTrim(options, trim),
  );
  group.add(surface);
  return group;
}

function placeDepthRidgeSlope(
  slope: THREE.Group,
  halfRun: number,
  ridgeHeight: number,
  side: -1 | 1,
): void {
  const slopeLength = Math.hypot(halfRun, ridgeHeight);
  const xAxis = new THREE.Vector3(0, 0, side === 1 ? -1 : 1);
  const yAxis = new THREE.Vector3(-side * halfRun / slopeLength, ridgeHeight / slopeLength, 0);
  setBasis(slope, new THREE.Vector3(side * halfRun, 0, 0), xAxis, yAxis);
}

function placeWidthRidgeSlope(
  slope: THREE.Group,
  eaveOffset: number,
  ridgeRun: number,
  ridgeHeight: number,
  side: -1 | 1,
): void {
  const slopeLength = Math.hypot(ridgeRun, ridgeHeight);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const yAxis = new THREE.Vector3(0, ridgeHeight / slopeLength, -side * ridgeRun / slopeLength);
  setBasis(slope, new THREE.Vector3(0, 0, side * eaveOffset), xAxis, yAxis);
}

function buildGableRoofAssembly(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  options: RoofMassingOptions = {},
): THREE.Group {
  const roof = new THREE.Group();
  roof.name = 'gable-roof';

  const innerHalfWidth = clampPositive(halfWidth, 1);
  const innerHalfDepth = clampPositive(halfDepth, 1);
  const height = clampPositive(ridgeHeight, innerHalfWidth * 0.5);
  const overhangFrac = clampPositive(options.eaveOverhangFrac ?? DEFAULT_EAVE_OVERHANG_FRAC, DEFAULT_EAVE_OVERHANG_FRAC);
  const outerHalfWidth = innerHalfWidth * (1 + overhangFrac);
  const depth = innerHalfDepth * 2;
  const slopeLength = Math.hypot(outerHalfWidth, height);

  const eastSlope = buildRectangularSlope(
    depth,
    slopeLength,
    (seed ^ 0x4741_4245) >>> 0,
    material,
    options.shingle,
    'gable-slope-east',
    { eave: true, ridge: false, verge: true },
  );
  placeDepthRidgeSlope(eastSlope, outerHalfWidth, height, 1);

  const westSlope = buildRectangularSlope(
    depth,
    slopeLength,
    (seed ^ 0x4741_4246) >>> 0,
    material,
    options.shingle,
    'gable-slope-west',
    { eave: true, ridge: false, verge: true },
  );
  placeDepthRidgeSlope(westSlope, outerHalfWidth, height, -1);

  roof.add(eastSlope, westSlope);

  roof.add(makeDoubleSidedTriangle(
    new THREE.Vector3(-outerHalfWidth, 0, innerHalfDepth),
    new THREE.Vector3(outerHalfWidth, 0, innerHalfDepth),
    new THREE.Vector3(0, height, innerHalfDepth),
    material,
    'gable-end-front',
  ));
  roof.add(makeDoubleSidedTriangle(
    new THREE.Vector3(outerHalfWidth, 0, -innerHalfDepth),
    new THREE.Vector3(-outerHalfWidth, 0, -innerHalfDepth),
    new THREE.Vector3(0, height, -innerHalfDepth),
    material,
    'gable-end-back',
  ));

  const ridgeCap = markRoofMesh(
    new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(outerHalfWidth * 0.28, 0.18),
        Math.max(height * 0.14, 0.14),
        depth * 1.02,
      ),
      material,
    ),
    'ridge-cap',
  );
  ridgeCap.position.set(0, height + Math.max(height * 0.03, 0.03), 0);
  roof.add(ridgeCap);

  return roof;
}

function buildHipRoofCanonical(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  options: RoofMassingOptions = {},
): THREE.Group {
  const roof = new THREE.Group();
  roof.name = 'hip-roof';

  const innerHalfWidth = clampPositive(halfWidth, 1);
  const innerHalfDepth = clampPositive(halfDepth, innerHalfWidth);
  const height = clampPositive(ridgeHeight, innerHalfWidth * 0.5);
  const overhangFrac = clampPositive(options.eaveOverhangFrac ?? DEFAULT_EAVE_OVERHANG_FRAC, DEFAULT_EAVE_OVERHANG_FRAC);
  const outerHalfWidth = innerHalfWidth * (1 + overhangFrac);
  const outerHalfDepth = innerHalfDepth * (1 + overhangFrac);
  const ridgeHalfLength = Math.max(0, outerHalfDepth - outerHalfWidth);
  const sideSlopeLength = Math.hypot(outerHalfWidth, height);
  const endRun = outerHalfDepth - ridgeHalfLength;
  const endSlopeLength = Math.hypot(endRun, height);

  const east = buildTaperedShingleSlope(
    outerHalfDepth * 2,
    ridgeHalfLength * 2,
    sideSlopeLength,
    (seed ^ 0x4849_5001) >>> 0,
    material,
    options.shingle,
    'hip-slope-east',
    { eave: true, ridge: false, verge: false },
  );
  placeDepthRidgeSlope(east, outerHalfWidth, height, 1);

  const west = buildTaperedShingleSlope(
    outerHalfDepth * 2,
    ridgeHalfLength * 2,
    sideSlopeLength,
    (seed ^ 0x4849_5002) >>> 0,
    material,
    options.shingle,
    'hip-slope-west',
    { eave: true, ridge: false, verge: false },
  );
  placeDepthRidgeSlope(west, outerHalfWidth, height, -1);

  const front = buildTaperedShingleSlope(
    outerHalfWidth * 2,
    0,
    endSlopeLength,
    (seed ^ 0x4849_5003) >>> 0,
    material,
    options.shingle,
    'hip-slope-front',
    { eave: true, ridge: false, verge: false },
  );
  placeWidthRidgeSlope(front, outerHalfDepth, endRun, height, 1);

  const back = buildTaperedShingleSlope(
    outerHalfWidth * 2,
    0,
    endSlopeLength,
    (seed ^ 0x4849_5004) >>> 0,
    material,
    options.shingle,
    'hip-slope-back',
    { eave: true, ridge: false, verge: false },
  );
  placeWidthRidgeSlope(back, outerHalfDepth, endRun, height, -1);

  roof.add(east, west, front, back);

  const capWidth = Math.max(innerHalfWidth * 0.16, 0.14);
  const capHeight = Math.max(height * 0.12, 0.12);
  if (ridgeHalfLength > 1e-4) {
    const ridgeCap = makeLinearCap(
      new THREE.Vector3(0, height + capHeight * 0.18, -ridgeHalfLength),
      new THREE.Vector3(0, height + capHeight * 0.18, ridgeHalfLength),
      material,
      capWidth,
      capHeight,
      'ridge-cap',
    );
    roof.add(ridgeCap);
  }

  const ridgeFront = new THREE.Vector3(0, height + capHeight * 0.1, ridgeHalfLength);
  const ridgeBack = new THREE.Vector3(0, height + capHeight * 0.1, -ridgeHalfLength);
  const corners = {
    frontEast: new THREE.Vector3(outerHalfWidth, 0, outerHalfDepth),
    frontWest: new THREE.Vector3(-outerHalfWidth, 0, outerHalfDepth),
    backEast: new THREE.Vector3(outerHalfWidth, 0, -outerHalfDepth),
    backWest: new THREE.Vector3(-outerHalfWidth, 0, -outerHalfDepth),
  };
  roof.add(
    makeLinearCap(ridgeFront, corners.frontEast, material, capWidth * 0.75, capHeight * 0.9, 'hip-cap-front-east'),
    makeLinearCap(ridgeFront, corners.frontWest, material, capWidth * 0.75, capHeight * 0.9, 'hip-cap-front-west'),
    makeLinearCap(ridgeBack, corners.backEast, material, capWidth * 0.75, capHeight * 0.9, 'hip-cap-back-east'),
    makeLinearCap(ridgeBack, corners.backWest, material, capWidth * 0.75, capHeight * 0.9, 'hip-cap-back-west'),
  );

  return roof;
}

/**
 * Two rectangular tiled slopes meeting on a ridge, with explicit gable-end
 * triangle closures adapted from the older StoneTowerGableRoof primitive so
 * this new kit module can stay self-contained and avoid importing its private
 * helpers.
 */
export function buildGableRoof(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  options: RoofMassingOptions = {},
): THREE.Group {
  return buildGableRoofAssembly(halfWidth, halfDepth, ridgeHeight, seed, material, options);
}

/**
 * Four-sided hip roof over a rectangle. The long-side trapezoids and short-side
 * triangles are approximated with one-course shingle strips whose widths taper
 * course-by-course; the tip strips clamp to a tiny minimum width instead of a
 * mathematical point so the final course still has valid shingle geometry.
 */
export function buildHipRoof(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  options: RoofMassingOptions = {},
): THREE.Group {
  if (halfDepth >= halfWidth) return buildHipRoofCanonical(halfWidth, halfDepth, ridgeHeight, seed, material, options);

  const rotated = buildHipRoofCanonical(halfDepth, halfWidth, ridgeHeight, seed, material, options);
  rotated.rotation.y = Math.PI / 2;
  return rotated;
}

/**
 * Explicit, deliberately scoped compound case: a centered "+" cross-gable
 * formed by a main gable plus a smaller perpendicular wing volume. The volumes
 * intentionally overlap where real valleys would later be boolean-cut by a more
 * general roof solver.
 */
export function buildCrossGableRoof(
  halfWidth: number,
  halfDepth: number,
  ridgeHeight: number,
  seed: number,
  material: THREE.Material,
  options: CrossGableRoofOptions = {},
): THREE.Group {
  const roof = new THREE.Group();
  roof.name = 'cross-gable-roof';

  const main = buildGableRoofAssembly(
    halfWidth,
    halfDepth,
    ridgeHeight,
    (seed ^ 0x4352_4F53) >>> 0,
    material,
    options,
  );
  main.name = 'cross-gable-main';

  const wingHalfWidth = clampPositive(options.wingHalfWidth ?? Math.min(halfWidth, halfDepth) * 0.6, Math.min(halfWidth, halfDepth) * 0.6);
  const wingHalfDepth = clampPositive(options.wingHalfDepth ?? Math.max(halfWidth * 1.15, wingHalfWidth * 1.2), Math.max(halfWidth * 1.15, wingHalfWidth * 1.2));
  const wingRidgeHeight = clampPositive(options.wingRidgeHeight ?? ridgeHeight * 0.92, ridgeHeight * 0.92);
  const wing = buildGableRoofAssembly(
    wingHalfWidth,
    wingHalfDepth,
    wingRidgeHeight,
    (seed ^ 0x5749_4E47) >>> 0,
    material,
    options,
  );
  wing.name = 'cross-gable-wing';
  wing.rotation.y = Math.PI / 2;

  roof.add(main, wing);
  return roof;
}
