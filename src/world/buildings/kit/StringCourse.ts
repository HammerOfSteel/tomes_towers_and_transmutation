import * as THREE from 'three';
import { finishArchitecturalGeometry, trimExtrudeSettings } from './Bevels';
import { depthFor } from './DepthLadder';

export type CourseLoopPoint = THREE.Vector2 | [number, number];

export interface CourseOptions {
  height?: number;
  name?: string;
  outset?: number;
  proudDepth?: number;
  y?: number;
}

const DEFAULT_COURSE_HEIGHT = 0.08;
const DEFAULT_CIRCLE_SEGMENTS = 16;
const EPSILON = 1e-6;

function toVector2(point: CourseLoopPoint): THREE.Vector2 {
  return point instanceof THREE.Vector2
    ? point.clone()
    : new THREE.Vector2(point[0], point[1]);
}

function sanitizeLoop(points: CourseLoopPoint[]): THREE.Vector2[] {
  const cleaned = points.map(toVector2);
  if (cleaned.length >= 2 && cleaned[0]!.distanceToSquared(cleaned[cleaned.length - 1]!) <= EPSILON) {
    cleaned.pop();
  }
  if (cleaned.length < 3) {
    throw new Error('String courses require at least three distinct loop points.');
  }
  return cleaned;
}

function polygonArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function outwardNormal(start: THREE.Vector2, end: THREE.Vector2, orientation: number): THREE.Vector2 {
  const edge = end.clone().sub(start).normalize();
  return orientation >= 0
    ? new THREE.Vector2(edge.y, -edge.x)
    : new THREE.Vector2(-edge.y, edge.x);
}

function intersectOffsetLines(
  point: THREE.Vector2,
  prevDirection: THREE.Vector2,
  nextDirection: THREE.Vector2,
  prevNormal: THREE.Vector2,
  nextNormal: THREE.Vector2,
  distance: number,
): THREE.Vector2 {
  const prevPoint = point.clone().addScaledVector(prevNormal, distance);
  const nextPoint = point.clone().addScaledVector(nextNormal, distance);
  const denominator = prevDirection.x * nextDirection.y - prevDirection.y * nextDirection.x;

  if (Math.abs(denominator) <= EPSILON) {
    return point.clone().addScaledVector(prevNormal.clone().add(nextNormal).normalize(), distance);
  }

  const delta = nextPoint.clone().sub(prevPoint);
  const t = (delta.x * nextDirection.y - delta.y * nextDirection.x) / denominator;
  return prevPoint.addScaledVector(prevDirection, t);
}

function offsetLoop(points: THREE.Vector2[], distance: number): THREE.Vector2[] {
  const orientation = polygonArea(points);

  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    const prevDirection = point.clone().sub(previous).normalize();
    const nextDirection = next.clone().sub(point).normalize();
    const prevNormal = outwardNormal(previous, point, orientation);
    const nextNormal = outwardNormal(point, next, orientation);

    return intersectOffsetLines(point, prevDirection, nextDirection, prevNormal, nextNormal, distance);
  });
}

function ensureWinding(points: THREE.Vector2[], ccw: boolean): THREE.Vector2[] {
  const area = polygonArea(points);
  const isCcw = area >= 0;
  if (isCcw === ccw) return points;
  return [...points].reverse();
}

function buildPath(points: THREE.Vector2[]): THREE.Path {
  const path = new THREE.Path();
  const first = points[0]!;
  path.moveTo(first.x, -first.y);
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    path.lineTo(point.x, -point.y);
  }
  path.lineTo(first.x, -first.y);
  return path;
}

function buildShape(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape();
  const first = points[0]!;
  shape.moveTo(first.x, -first.y);
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    shape.lineTo(point.x, -point.y);
  }
  shape.lineTo(first.x, -first.y);
  return shape;
}

function buildCourseGeometry(points: THREE.Vector2[], outset: number, proudDepth: number, height: number): THREE.BufferGeometry {
  const innerLoop = ensureWinding(offsetLoop(points, outset), true);
  const outerLoop = ensureWinding(offsetLoop(points, outset + proudDepth), true);
  const shape = buildShape(outerLoop);
  shape.holes.push(buildPath(ensureWinding(innerLoop, false)));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    ...trimExtrudeSettings(Math.min(height, proudDepth) / 2),
    depth: height,
    steps: 1,
  });

  geometry.rotateX(-Math.PI / 2);
  return finishArchitecturalGeometry(geometry);
}

function buildLoopCourse(points: CourseLoopPoint[], material: THREE.Material, options: CourseOptions = {}): THREE.Group {
  const loop = sanitizeLoop(points);
  const proudDepth = options.proudDepth ?? depthFor('TRIM');
  const height = options.height ?? DEFAULT_COURSE_HEIGHT;
  const outset = options.outset ?? 0;
  const course = new THREE.Group();

  course.name = options.name ?? 'string-course';
  course.position.y = options.y ?? 0;
  course.userData.proudDepth = proudDepth;
  course.userData.outset = outset;
  course.userData.height = height;

  const mesh = new THREE.Mesh(buildCourseGeometry(loop, outset, proudDepth, height), material);
  mesh.name = `${course.name}-mesh`;
  mesh.castShadow = mesh.receiveShadow = true;
  course.add(mesh);

  return course;
}

export function buildStringCourse(
  points: CourseLoopPoint[],
  material: THREE.Material,
  options: CourseOptions = {},
): THREE.Group {
  return buildLoopCourse(points, material, {
    name: options.name ?? 'string-course',
    proudDepth: options.proudDepth ?? depthFor('TRIM'),
    ...options,
  });
}

export function buildPlinthCourses(
  points: CourseLoopPoint[],
  material: THREE.Material,
  levels = 3,
  options: Omit<CourseOptions, 'name' | 'outset' | 'y'> = {},
): THREE.Group {
  const proudDepth = options.proudDepth ?? depthFor('TRIM');
  const height = options.height ?? DEFAULT_COURSE_HEIGHT;
  const plinth = new THREE.Group();
  plinth.name = 'plinth-courses';

  for (let index = 0; index < levels; index++) {
    // Stepped plinths traditionally widen at the bottom, then taper back
    // toward the wall above, so each higher tier reduces its outward set.
    const outset = proudDepth * (levels - index - 1);
    plinth.add(buildLoopCourse(points, material, {
      height,
      name: `plinth-course-${index}`,
      outset,
      proudDepth,
      y: index * height,
    }));
  }

  return plinth;
}

function circularPoints(radius: number, segments: number): THREE.Vector2[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

export function buildCircularPlinthCourses(
  radius: number,
  material: THREE.Material,
  levels = 3,
  options: Omit<CourseOptions, 'name' | 'outset' | 'y'> & { segments?: number } = {},
): THREE.Group {
  const segments = options.segments ?? DEFAULT_CIRCLE_SEGMENTS;
  // Sixteen sides reads as round for gazebo-scale bases without adding a more
  // expensive bespoke radial mesh path; it still exercises the shared loop code.
  return buildPlinthCourses(circularPoints(radius, segments), material, levels, options);
}
