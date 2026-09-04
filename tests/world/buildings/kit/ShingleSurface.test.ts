import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShingleSurface, type ShingleSurfaceOptions } from '@/world/buildings/kit/ShingleSurface';

type TileCenter = { x: number; y: number; width: number; height: number };

function countTriangles(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    total += child.geometry.index ? child.geometry.index.count / 3 : position.count / 3;
  });
  return total;
}

function countVertices(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) total += child.geometry.getAttribute('position').count;
  });
  return total;
}

function courseGroups(group: THREE.Group): THREE.Group[] {
  return group.children.filter((child): child is THREE.Group => child instanceof THREE.Group && child.name.startsWith('course-'));
}

function tileCenters(course: THREE.Group): TileCenter[] {
  return (course.userData.tileCenters as TileCenter[] | undefined) ?? [];
}

function layoutSignature(group: THREE.Group): string {
  return JSON.stringify(
    courseGroups(group).map(course => ({
      name: course.name,
      rowOffset: Number(course.userData.rowOffset.toFixed(4)),
      kickDegrees: Number(course.userData.kickDegrees.toFixed(4)),
      tileCenters: tileCenters(course).map(center => ({
        x: Number(center.x.toFixed(4)),
        y: Number(center.y.toFixed(4)),
        width: Number(center.width.toFixed(4)),
        height: Number(center.height.toFixed(4)),
      })),
    })),
  );
}

function geometrySignature(group: THREE.Group): string {
  group.updateMatrixWorld(true);
  const signature: Array<{ name: string; vertices: number[] }> = [];
  const vertex = new THREE.Vector3();

  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const vertices: number[] = [];
    for (let index = 0; index < position.count; index++) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      vertices.push(
        Number(vertex.x.toFixed(4)),
        Number(vertex.y.toFixed(4)),
        Number(vertex.z.toFixed(4)),
      );
    }
    signature.push({ name: child.parent?.name ?? child.name, vertices });
  });

  return JSON.stringify(signature);
}

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 1 });
}

describe('buildShingleSurface', () => {
  const width = 4.2;
  const slopeLength = 3.5;

  it('creates multiple named merged course rows with stable per-course metadata', () => {
    const material = makeMaterial();
    const options: ShingleSurfaceOptions = { courseHeight: 0.35, tilesPerCourse: 8, jitter: 0.12 };
    const roof = buildShingleSurface(width, slopeLength, 42, material, options);

    const courses = courseGroups(roof);
    expect(courses).toHaveLength(Math.round(slopeLength / 0.35));

    courses.forEach((course, index) => {
      expect(course.name).toBe(`course-${index}`);
      expect(course.userData.courseIndex).toBe(index);
      expect(tileCenters(course).length).toBeGreaterThan(0);
    });
  });

  it('alternates stagger so odd courses are horizontally offset from even courses', () => {
    const material = makeMaterial();
    const roof = buildShingleSurface(width, slopeLength, 7, material, {
      courseHeight: 0.5,
      tilesPerCourse: 6,
      jitter: 0,
    });

    const [course0, course1] = courseGroups(roof);
    expect(course0).toBeTruthy();
    expect(course1).toBeTruthy();

    const row0 = tileCenters(course0).map(center => center.x);
    const row1 = tileCenters(course1).map(center => center.x);
    const averageGap = (row0[row0.length - 1]! - row0[0]!) / (row0.length - 1);
    const firstOffset = Math.abs(row1[0]! - row0[0]!);

    expect(firstOffset).toBeCloseTo(averageGap * 0.5, 3);
    expect(row1).not.toEqual(row0);
    expect(course1.userData.rowOffset).toBeCloseTo(averageGap * 0.5, 6);
  });

  it('keeps the finished panel centered on the local origin despite staggered rows', () => {
    const material = makeMaterial();
    const roof = buildShingleSurface(width, slopeLength, 7, material, {
      courseHeight: 0.5,
      tilesPerCourse: 6,
      jitter: 0,
    });

    const tileBounds = courseGroups(roof).reduce((bounds, course) => bounds.union(new THREE.Box3().setFromObject(course)), new THREE.Box3());
    const centerX = (tileBounds.min.x + tileBounds.max.x) * 0.5;
    expect(centerX).toBeCloseTo(0, 6);
  });

  it('uses a default kick in-range and clamps custom kickDegrees into 2-5°', () => {
    const material = makeMaterial();
    const defaultRoof = buildShingleSurface(width, slopeLength, 1, material);
    expect(defaultRoof.userData.kickDegrees).toBeGreaterThanOrEqual(2);
    expect(defaultRoof.userData.kickDegrees).toBeLessThanOrEqual(5);
    expect(defaultRoof.userData.kickDegrees).toBeCloseTo(3, 6);

    const clampedLow = buildShingleSurface(width, slopeLength, 1, material, { kickDegrees: 0.5 });
    const clampedHigh = buildShingleSurface(width, slopeLength, 1, material, { kickDegrees: 12 });
    expect(clampedLow.userData.kickDegrees).toBe(2);
    expect(clampedHigh.userData.kickDegrees).toBe(5);

    const firstCourse = courseGroups(clampedHigh)[0];
    expect(firstCourse.userData.kickDegrees).toBe(5);
  });

  it('adds identifiable ridge, eave, and verge trim, and honours trim toggles', () => {
    const material = makeMaterial();
    const roof = buildShingleSurface(width, slopeLength, 9, material, {
      courseHeight: 0.35,
      tilesPerCourse: 8,
      jitter: 0,
    });

    const ridge = roof.getObjectByName('ridge-trim');
    const eave = roof.getObjectByName('eave-trim');
    const verge = roof.getObjectByName('verge-trim');
    expect(ridge).toBeTruthy();
    expect(eave).toBeTruthy();
    expect(verge).toBeTruthy();

    const ridgeBox = new THREE.Box3().setFromObject(ridge!);
    const eaveBox = new THREE.Box3().setFromObject(eave!);
    const vergeBox = new THREE.Box3().setFromObject(verge!);
    const tileBounds = courseGroups(roof).reduce((bounds, course) => bounds.union(new THREE.Box3().setFromObject(course)), new THREE.Box3());
    expect(ridgeBox.max.y).toBeGreaterThanOrEqual(slopeLength);
    expect(eaveBox.min.y).toBeLessThan(0);
    expect(vergeBox.min.x).toBeLessThanOrEqual(-width / 2);
    expect(vergeBox.max.x).toBeGreaterThanOrEqual(width / 2);
    expect(ridgeBox.max.y).toBeGreaterThanOrEqual(tileBounds.max.y);
    expect(vergeBox.min.x).toBeLessThanOrEqual(tileBounds.min.x);
    expect(vergeBox.max.x).toBeGreaterThanOrEqual(tileBounds.max.x);

    const trimmedOff = buildShingleSurface(width, slopeLength, 9, material, {
      trim: { ridge: false, eave: false, verge: false },
    });
    expect(trimmedOff.getObjectByName('ridge-trim')).toBeUndefined();
    expect(trimmedOff.getObjectByName('eave-trim')).toBeUndefined();
    expect(trimmedOff.getObjectByName('verge-trim')).toBeUndefined();
  });

  it('produces materially richer geometry than one plane while staying under a bounded per-panel triangle ceiling', () => {
    const material = makeMaterial();
    const roof = buildShingleSurface(width, slopeLength, 5, material, {
      courseHeight: 0.35,
      tilesPerCourse: 8,
      silhouette: 'fishscale',
    });

    const triangles = countTriangles(roof);
    // One 4.2m x 3.5m panel at this default-ish density is expected to be
    // reused many times across a settlement, so keep it comfortably below
    // "several thousand" triangles per panel while still being much richer
    // than a 2-triangle placeholder plane.
    expect(triangles).toBeGreaterThan(2);
    expect(triangles).toBeLessThan(4000);
  });

  it('keeps every merged mesh on the exact same material instance', () => {
    const material = makeMaterial();
    const roof = buildShingleSurface(width, slopeLength, 13, material, {
      courseHeight: 0.4,
      tilesPerCourse: 7,
    });

    const materials: THREE.Material[] = [];
    roof.traverse((child) => {
      if (child instanceof THREE.Mesh && !Array.isArray(child.material)) materials.push(child.material);
    });

    expect(materials.length).toBeGreaterThan(0);
    materials.forEach(meshMaterial => expect(meshMaterial).toBe(material));
  });

  it('is deterministic for the same seed and measurably changes layout for different seeds', () => {
    const material = makeMaterial();
    const a = buildShingleSurface(width, slopeLength, 99, material, { courseHeight: 0.35, tilesPerCourse: 8 });
    const b = buildShingleSurface(width, slopeLength, 99, material, { courseHeight: 0.35, tilesPerCourse: 8 });
    const c = buildShingleSurface(width, slopeLength, 100, material, { courseHeight: 0.35, tilesPerCourse: 8 });

    expect(layoutSignature(a)).toBe(layoutSignature(b));
    expect(layoutSignature(c)).not.toBe(layoutSignature(a));
  });

  it('supports rectangular, diamond, and fishscale silhouettes as genuinely distinct geometry', () => {
    const material = makeMaterial();
    const common = { courseHeight: 0.35, tilesPerCourse: 8, jitter: 0 } satisfies ShingleSurfaceOptions;
    const rectangular = buildShingleSurface(width, slopeLength, 17, material, { ...common, silhouette: 'rectangular' });
    const diamond = buildShingleSurface(width, slopeLength, 17, material, { ...common, silhouette: 'diamond' });
    const fishscale = buildShingleSurface(width, slopeLength, 17, material, { ...common, silhouette: 'fishscale' });

    expect(courseGroups(rectangular)).toHaveLength(Math.round(slopeLength / common.courseHeight));
    expect(courseGroups(diamond)).toHaveLength(Math.round(slopeLength / common.courseHeight));
    expect(courseGroups(fishscale)).toHaveLength(Math.round(slopeLength / common.courseHeight));

    const triangleCounts = [countTriangles(rectangular), countTriangles(diamond), countTriangles(fishscale)];
    const vertexCounts = [countVertices(rectangular), countVertices(diamond), countVertices(fishscale)];
    expect(new Set(triangleCounts).size).toBeGreaterThan(1);
    expect(new Set(vertexCounts).size).toBeGreaterThan(1);
    expect(geometrySignature(rectangular)).not.toBe(geometrySignature(diamond));
    expect(geometrySignature(diamond)).not.toBe(geometrySignature(fishscale));
  });
});
