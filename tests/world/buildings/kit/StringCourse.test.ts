import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rectanglePoints } from '@/world/buildings/StoneTowerShape';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import {
  buildCircularPlinthCourses,
  buildPlinthCourses,
  buildStringCourse,
} from '@/world/buildings/kit/StringCourse';

function regularPolygonPoints(radius: number, sides: number): THREE.Vector2[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function makeStoneMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 1 });
}

function meshPositionValues(object: THREE.Object3D): number[] {
  const values: number[] = [];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    const position = geometry.getAttribute('position');

    expect(position, `${child.name || child.type} should have positions`).toBeTruthy();
    for (let index = 0; index < position.count; index++) {
      values.push(position.getX(index), position.getY(index), position.getZ(index));
    }
  });

  return values;
}

describe('buildPlinthCourses', () => {
  it('creates stepped named plinth courses that stack upward and taper consistently', () => {
    const plinth = buildPlinthCourses(rectanglePoints(2, 4), makeStoneMaterial(), 3);

    const courseNames = plinth.children.map(child => child.name);
    expect(courseNames).toEqual([
      'plinth-course-0',
      'plinth-course-1',
      'plinth-course-2',
    ]);

    const courses = plinth.children as THREE.Group[];
    const yValues = courses.map(course => course.position.y);
    expect(yValues[0]).toBeLessThan(yValues[1]);
    expect(yValues[1]).toBeLessThan(yValues[2]);

    const outsets = courses.map(course => Number(course.userData.outset));
    expect(outsets[0]).toBeGreaterThan(outsets[1]);
    expect(outsets[1]).toBeGreaterThan(outsets[2]);

    for (const course of courses) {
      expect(course.userData.proudDepth).toBeCloseTo(depthFor('TRIM'));
    }
  });

  it('produces finite geometry for rectangle and octagon point loops', () => {
    const rectangle = buildPlinthCourses(rectanglePoints(2, 4), makeStoneMaterial(), 3);
    const octagon = buildPlinthCourses(regularPolygonPoints(1.6, 8), makeStoneMaterial(), 3);

    for (const object of [rectangle, octagon]) {
      const values = meshPositionValues(object);
      expect(values.length).toBeGreaterThan(0);
      expect(values.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('buildStringCourse', () => {
  it('creates a single proud trim band at the requested height for arbitrary closed loops', () => {
    const height = 2.75;
    const stringCourse = buildStringCourse(
      regularPolygonPoints(1.4, 8),
      makeStoneMaterial(),
      { y: height, name: 'second-floor-string-course' },
    );

    expect(stringCourse.name).toBe('second-floor-string-course');
    expect(stringCourse.position.y).toBe(height);
    expect(stringCourse.userData.proudDepth).toBeCloseTo(depthFor('TRIM'));

    const values = meshPositionValues(stringCourse);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(Number.isFinite)).toBe(true);
  });
});

describe('buildCircularPlinthCourses', () => {
  it('builds stepped circular plinths by radius using the same trim projection contract', () => {
    const plinth = buildCircularPlinthCourses(1.5, makeStoneMaterial(), 3);

    expect(plinth.children).toHaveLength(3);

    const outsets = plinth.children.map(child => Number(child.userData.outset));
    expect(outsets[0]).toBeGreaterThan(outsets[1]);
    expect(outsets[1]).toBeGreaterThan(outsets[2]);

    const values = meshPositionValues(plinth);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every(Number.isFinite)).toBe(true);

    for (const course of plinth.children) {
      expect(course.userData.proudDepth).toBeCloseTo(depthFor('TRIM'));
    }
  });
});
