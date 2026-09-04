import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

async function loadBuildLatheColumn() {
  const module = await import('../../../../src/world/buildings/kit/LatheColumn');
  return module.buildLatheColumn as (
    options: {
      height: number;
      radius?: number;
      crossSection?: 'round' | 'fluted' | 'lobed';
      fluteCount?: number;
      lobeCount?: number;
      brokenAtHeight?: number;
      seed?: number;
    },
    material: THREE.Material,
  ) => THREE.Group;
}

function makeStoneMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#918b80', roughness: 1 });
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const vertices: THREE.Vector3[] = [];
  const vertex = new THREE.Vector3();
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertices.push(vertex.clone().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
    }
  }
  return vertices;
}

function maxPlanRadius(root: THREE.Object3D): number {
  return Math.max(...worldVertices(root).map(vertex => Math.hypot(vertex.x, vertex.z)));
}

function bandVertices(root: THREE.Object3D, targetY: number, tolerance: number): THREE.Vector3[] {
  return worldVertices(root).filter(vertex => Math.abs(vertex.y - targetY) <= tolerance);
}

function radiusAtHeight(root: THREE.Object3D, normalizedHeight: number, tolerance = 0.03): number {
  const box = worldBox(root);
  const targetY = THREE.MathUtils.lerp(box.min.y, box.max.y, normalizedHeight);
  const vertices = bandVertices(root, targetY, tolerance);
  expect(vertices.length).toBeGreaterThan(0);
  return Math.max(...vertices.map(vertex => Math.hypot(vertex.x, vertex.z)));
}

function ringSeries(
  root: THREE.Object3D,
  normalizedHeight: number,
  binCount = 72,
  tolerance = 0.03,
): number[] {
  const box = worldBox(root);
  const targetY = THREE.MathUtils.lerp(box.min.y, box.max.y, normalizedHeight);
  const vertices = bandVertices(root, targetY, tolerance);
  expect(vertices.length).toBeGreaterThan(0);

  const bins = Array.from({ length: binCount }, () => [] as number[]);
  for (const vertex of vertices) {
    const angle = Math.atan2(vertex.z, vertex.x);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    const bin = Math.min(binCount - 1, Math.floor((normalizedAngle / (Math.PI * 2)) * binCount));
    bins[bin]!.push(Math.hypot(vertex.x, vertex.z));
  }

  const mean = vertices.reduce((sum, vertex) => sum + Math.hypot(vertex.x, vertex.z), 0) / vertices.length;
  return bins.map(values => (
    values.length === 0
      ? mean
      : values.reduce((sum, value) => sum + value, 0) / values.length
  ));
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function harmonicEnergy(values: number[], startFrequency: number, endFrequency: number): number {
  const length = values.length;
  let energy = 0;
  for (let frequency = startFrequency; frequency <= endFrequency; frequency++) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < length; index++) {
      const angle = (index / length) * Math.PI * 2;
      const value = values[index]!;
      real += value * Math.cos(frequency * angle);
      imaginary -= value * Math.sin(frequency * angle);
    }
    energy += Math.hypot(real, imaginary) / length;
  }
  return energy;
}

function axisSpread(root: THREE.Object3D, normalizedHeight: number, tolerance = 0.02): { x: number; z: number } {
  const box = worldBox(root);
  const targetY = THREE.MathUtils.lerp(box.min.y, box.max.y, normalizedHeight);
  const vertices = bandVertices(root, targetY, tolerance);
  expect(vertices.length).toBeGreaterThan(0);
  const xs = vertices.map(vertex => vertex.x);
  const zs = vertices.map(vertex => vertex.z);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    z: Math.max(...zs) - Math.min(...zs),
  };
}

interface WorldTriangle {
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  minY: number;
  maxY: number;
  minPlanRadius: number;
}

function worldTriangles(root: THREE.Object3D): WorldTriangle[] {
  root.updateMatrixWorld(true);
  const triangles: WorldTriangle[] = [];
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(position, index + 1).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(position, index + 2).applyMatrix4(mesh.matrixWorld);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const radialDistances = [a, b, c].map(vertex => Math.hypot(vertex.x, vertex.z));
      triangles.push({
        normal,
        centroid: a.clone().add(b).add(c).multiplyScalar(1 / 3),
        minY: Math.min(a.y, b.y, c.y),
        maxY: Math.max(a.y, b.y, c.y),
        minPlanRadius: Math.min(...radialDistances),
      });
    }
  }
  return triangles;
}

function meanCapNormalY(root: THREE.Object3D, anchor: 'top' | 'bottom'): number {
  const triangles = worldTriangles(root);
  const box = worldBox(root);
  const height = box.max.y - box.min.y;
  const bandHeight = Math.max(height * 0.18, 0.002);
  const capTriangles = triangles.filter((triangle) => (
    anchor === 'top'
      ? triangle.minY >= box.max.y - bandHeight
      : triangle.maxY <= box.min.y + bandHeight
  ) && triangle.maxY - triangle.minY <= bandHeight * 0.2);

  expect(capTriangles.length).toBeGreaterThan(0);
  return capTriangles.reduce((sum, triangle) => sum + triangle.normal.y, 0) / capTriangles.length;
}

function minOutwardNormalDotNearTop(root: THREE.Object3D): number {
  const triangles = worldTriangles(root);
  const box = worldBox(root);
  const bandHeight = Math.max((box.max.y - box.min.y) * 0.12, 0.03);
  const minimumSideRadius = maxPlanRadius(root) * 0.35;
  const sideTriangles = triangles.filter((triangle) => (
    triangle.maxY >= box.max.y - bandHeight
    && triangle.maxY - triangle.minY >= bandHeight * 0.25
    && Math.abs(triangle.normal.y) < 0.9
    && triangle.minPlanRadius >= minimumSideRadius
  ));
  expect(sideTriangles.length).toBeGreaterThan(0);

  return Math.min(...sideTriangles.map((triangle) => {
    const radial = new THREE.Vector3(triangle.centroid.x, 0, triangle.centroid.z);
    return radial.lengthSq() <= 1e-12
      ? 0
      : triangle.normal.dot(radial.normalize());
  }));
}

function ringSeriesAtWorldY(root: THREE.Object3D, targetY: number, tolerance = 0.03): number[] {
  const vertices = bandVertices(root, targetY, tolerance);
  expect(vertices.length).toBeGreaterThan(0);

  const binCount = 72;
  const bins = Array.from({ length: binCount }, () => [] as number[]);
  for (const vertex of vertices) {
    const angle = Math.atan2(vertex.z, vertex.x);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    const bin = Math.min(binCount - 1, Math.floor((normalizedAngle / (Math.PI * 2)) * binCount));
    bins[bin]!.push(Math.hypot(vertex.x, vertex.z));
  }

  const mean = vertices.reduce((sum, vertex) => sum + Math.hypot(vertex.x, vertex.z), 0) / vertices.length;
  return bins.map(values => (
    values.length === 0
      ? mean
      : values.reduce((sum, value) => sum + value, 0) / values.length
  ));
}

function rootMeanSquareDifference(a: number[], b: number[]): number {
  expect(a.length).toBe(b.length);
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]!) ** 2, 0) / a.length);
}

describe('buildLatheColumn', () => {
  it('builds a finite non-degenerate column whose overall height matches the request', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3 }, makeStoneMaterial());
    const box = worldBox(column);
    const size = box.getSize(new THREE.Vector3());

    expect(column).toBeInstanceOf(THREE.Group);
    expect([
      box.min.x,
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ].every(Number.isFinite)).toBe(true);
    expect(size.x).toBeGreaterThan(0.1);
    expect(size.y).toBeCloseTo(3, 2);
    expect(size.z).toBeGreaterThan(0.1);
  });

  it('creates distinct named architectural parts for the base, shaft, capital, and impost', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3 }, makeStoneMaterial());

    expect(column.getObjectByName('base')).toBeTruthy();
    expect(column.getObjectByName('shaft')).toBeTruthy();
    expect(column.getObjectByName('capital')).toBeTruthy();
    expect(column.getObjectByName('impost')).toBeTruthy();
  });

  it('gives the shaft measurable entasis instead of a straight linear taper', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const shaft = buildLatheColumn({ height: 3 }, makeStoneMaterial()).getObjectByName('shaft');

    expect(shaft).toBeTruthy();
    if (!shaft) return;

    const sampleHeights = [0.12, 0.35, 0.58, 0.82];
    const radii = sampleHeights.map(height => radiusAtHeight(shaft, height));
    const startRadius = radii[0]!;
    const endRadius = radii[radii.length - 1]!;
    const deviations = radii.map((radius, index) => {
      const t = (sampleHeights[index]! - sampleHeights[0]!) / (sampleHeights[sampleHeights.length - 1]! - sampleHeights[0]!);
      const straight = THREE.MathUtils.lerp(startRadius, endRadius, t);
      return radius - straight;
    });

    expect(Math.max(...deviations.slice(1, -1))).toBeGreaterThan(0.006);
    expect(Math.abs(deviations[1]! - deviations[2]!)).toBeLessThan(0.01);
  });

  it('makes the base and capital wider than the shaft while keeping all three parts geometrically distinct', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3 }, makeStoneMaterial());
    const base = column.getObjectByName('base');
    const shaft = column.getObjectByName('shaft');
    const capital = column.getObjectByName('capital');
    const impost = column.getObjectByName('impost');

    expect(base).toBeTruthy();
    expect(shaft).toBeTruthy();
    expect(capital).toBeTruthy();
    expect(impost).toBeTruthy();
    if (!base || !shaft || !capital || !impost) return;

    const shaftMidRadius = radiusAtHeight(shaft, 0.5);
    expect(maxPlanRadius(base)).toBeGreaterThan(shaftMidRadius * 1.15);
    expect(maxPlanRadius(capital)).toBeGreaterThan(shaftMidRadius * 1.15);

    const baseLowerRadius = radiusAtHeight(base, 0.15);
    const baseUpperRadius = radiusAtHeight(base, 0.82);
    const capitalLowerRadius = radiusAtHeight(capital, 0.18);
    const capitalUpperRadius = radiusAtHeight(capital, 0.82);
    const impostLower = axisSpread(impost, 0.2);
    const impostUpper = axisSpread(impost, 0.8);

    expect(baseLowerRadius).toBeGreaterThan(baseUpperRadius * 1.06);
    expect(capitalUpperRadius).toBeGreaterThan(capitalLowerRadius * 1.06);
    expect(Math.abs(impostUpper.x - impostLower.x)).toBeLessThan(0.02);
    expect(Math.abs(impostUpper.z - impostLower.z)).toBeLessThan(0.02);
    expect(standardDeviation(ringSeries(capital, 0.5))).toBeLessThan(0.01);
    expect(standardDeviation(ringSeries(impost, 0.5))).toBeGreaterThan(0.03);
  });

  it('emits numerically distinct round, fluted, and lobed shaft silhouettes', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const material = makeStoneMaterial();
    const round = buildLatheColumn({ height: 3, crossSection: 'round' }, material).getObjectByName('shaft');
    const fluted = buildLatheColumn({ height: 3, crossSection: 'fluted', fluteCount: 12 }, material).getObjectByName('shaft');
    const lobed = buildLatheColumn({ height: 3, crossSection: 'lobed', lobeCount: 4 }, material).getObjectByName('shaft');

    expect(round).toBeTruthy();
    expect(fluted).toBeTruthy();
    expect(lobed).toBeTruthy();
    if (!round || !fluted || !lobed) return;

    const roundRing = ringSeries(round, 0.5);
    const flutedRing = ringSeries(fluted, 0.5);
    const lobedRing = ringSeries(lobed, 0.5);

    const roundStdDev = standardDeviation(roundRing);
    const flutedStdDev = standardDeviation(flutedRing);
    const lobedStdDev = standardDeviation(lobedRing);
    const flutedHighEnergy = harmonicEnergy(flutedRing, 8, 16);
    const flutedLowEnergy = harmonicEnergy(flutedRing, 2, 6);
    const lobedHighEnergy = harmonicEnergy(lobedRing, 8, 16);
    const lobedLowEnergy = harmonicEnergy(lobedRing, 2, 6);

    expect(roundStdDev).toBeLessThan(0.004);
    expect(flutedStdDev).toBeGreaterThan(0.006);
    expect(lobedStdDev).toBeGreaterThan(0.012);
    expect(flutedHighEnergy).toBeGreaterThan(flutedLowEnergy * 1.5);
    expect(lobedLowEnergy).toBeGreaterThan(lobedHighEnergy * 2);
    expect(lobedStdDev).toBeGreaterThan(flutedStdDev * 1.25);
  });

  it('supports broken columns with capped height, missing upper parts, and a jagged non-flat break line', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const brokenAtHeight = 1.92;
    const column = buildLatheColumn({
      height: 3,
      brokenAtHeight,
      seed: 17,
    }, makeStoneMaterial());

    const box = worldBox(column);
    const shaft = column.getObjectByName('shaft');
    expect(box.max.y - box.min.y).toBeCloseTo(brokenAtHeight, 2);
    expect(column.getObjectByName('base')).toBeTruthy();
    expect(shaft).toBeTruthy();
    expect(column.getObjectByName('capital')).toBeFalsy();
    expect(column.getObjectByName('impost')).toBeFalsy();
    if (!shaft) return;

    const topBand = bandVertices(shaft, worldBox(shaft).max.y - 0.03, 0.04);
    expect(topBand.length).toBeGreaterThan(0);
    const yValues = topBand.map(vertex => vertex.y);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeGreaterThan(0.03);
  });

  it('treats a break height at the full column height as intact rather than spuriously broken', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const intact = buildLatheColumn({ height: 3 }, makeStoneMaterial());
    const fullHeightBreak = buildLatheColumn({ height: 3, brokenAtHeight: 3, seed: 11 }, makeStoneMaterial());

    expect(fullHeightBreak.getObjectByName('capital')).toBeTruthy();
    expect(fullHeightBreak.getObjectByName('impost')).toBeTruthy();
    expect(worldBox(fullHeightBreak).max.y - worldBox(fullHeightBreak).min.y).toBeCloseTo(
      worldBox(intact).max.y - worldBox(intact).min.y,
      3,
    );

    const fullHeightTop = bandVertices(fullHeightBreak, worldBox(fullHeightBreak).max.y - 0.01, 0.02);
    expect(fullHeightTop.length).toBeGreaterThan(0);
    const yValues = fullHeightTop.map(vertex => vertex.y);
    expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThan(0.01);
  });

  it('preserves the requested total height even for tiny or extremely squat columns', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const tiny = buildLatheColumn({ height: 0.1 }, makeStoneMaterial());
    const squat = buildLatheColumn({ height: 3, radius: 2 }, makeStoneMaterial());

    expect(worldBox(tiny).max.y - worldBox(tiny).min.y).toBeCloseTo(0.1, 3);
    expect(worldBox(squat).max.y - worldBox(squat).min.y).toBeCloseTo(3, 3);
  });

  it('keeps tiny broken columns within the requested cutoff and above the floor plane', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const brokenAtHeight = 0.01;
    const column = buildLatheColumn({ height: 3, brokenAtHeight, seed: 23 }, makeStoneMaterial());
    const box = worldBox(column);

    expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.max.y - box.min.y).toBeLessThanOrEqual(brokenAtHeight + 0.002);
    expect(column.getObjectByName('capital')).toBeFalsy();
    expect(column.getObjectByName('impost')).toBeFalsy();
  });

  it('honors brokenAtHeight at micro scales without reverting to an intact or oversized column', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const boundarySensitive = buildLatheColumn({
      height: 0.0000011,
      brokenAtHeight: 0.00000055,
      seed: 31,
    }, makeStoneMaterial());
    const tinyCut = buildLatheColumn({
      height: 0.0001,
      brokenAtHeight: 0.0000001,
      seed: 32,
    }, makeStoneMaterial());

    expect(boundarySensitive.getObjectByName('capital')).toBeFalsy();
    expect(boundarySensitive.getObjectByName('impost')).toBeFalsy();
    expect(worldBox(boundarySensitive).max.y - worldBox(boundarySensitive).min.y).toBeLessThanOrEqual(0.00000055 + 0.00000002);

    expect(worldBox(tinyCut).min.y).toBeGreaterThanOrEqual(-0.00000001);
    expect(worldBox(tinyCut).max.y - worldBox(tinyCut).min.y).toBeLessThanOrEqual(0.0000001 + 0.00000002);
  });

  it('orients intact top and bottom cap surfaces outward instead of inward', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3 }, makeStoneMaterial());
    const base = column.getObjectByName('base');
    const impost = column.getObjectByName('impost');

    expect(base).toBeTruthy();
    expect(impost).toBeTruthy();
    if (!base || !impost) return;

    expect(meanCapNormalY(base, 'bottom')).toBeLessThan(-0.7);
    expect(meanCapNormalY(impost, 'top')).toBeGreaterThan(0.7);
  });

  it('keeps the broken fracture wall facing outward rather than folding inward near the cut', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3, brokenAtHeight: 1.92, seed: 17 }, makeStoneMaterial());
    const shaft = column.getObjectByName('shaft');

    expect(shaft).toBeTruthy();
    if (!shaft) return;

    expect(minOutwardNormalDotNearTop(shaft)).toBeGreaterThan(0.05);
  });

  it('keeps lower broken shaft cuts outward-facing instead of producing folded fracture walls', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const column = buildLatheColumn({ height: 3, brokenAtHeight: 0.6, seed: 17 }, makeStoneMaterial());
    const shaft = column.getObjectByName('shaft');

    expect(shaft).toBeTruthy();
    if (!shaft) return;

    expect(minOutwardNormalDotNearTop(shaft)).toBeGreaterThan(0.05);
  });

  it('preserves fluted shaft silhouette below the fracture instead of re-normalizing it over the truncated height', async () => {
    const buildLatheColumn = await loadBuildLatheColumn();
    const intact = buildLatheColumn({ height: 3, crossSection: 'fluted', fluteCount: 12 }, makeStoneMaterial());
    const broken = buildLatheColumn({
      height: 3,
      crossSection: 'fluted',
      fluteCount: 12,
      brokenAtHeight: 1.92,
      seed: 41,
    }, makeStoneMaterial());
    const intactShaft = intact.getObjectByName('shaft');
    const brokenShaft = broken.getObjectByName('shaft');

    expect(intactShaft).toBeTruthy();
    expect(brokenShaft).toBeTruthy();
    if (!intactShaft || !brokenShaft) return;

    const brokenBox = worldBox(brokenShaft);
    const sampleY = brokenBox.min.y + (brokenBox.max.y - brokenBox.min.y) * 0.35;
    const intactProfile = ringSeriesAtWorldY(intactShaft, sampleY);
    const brokenProfile = ringSeriesAtWorldY(brokenShaft, sampleY);

    expect(rootMeanSquareDifference(intactProfile, brokenProfile)).toBeLessThan(0.002);
  });
});
