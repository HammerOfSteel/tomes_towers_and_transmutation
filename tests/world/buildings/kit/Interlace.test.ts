import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

interface InterlaceOptions {
  length: number;
  variant?: 'straight' | 'gableVerge';
  strandCount?: number;
  cordRadius?: number;
  period?: number;
  raisedRelief?: number;
  terminalKnots?: boolean;
  radialSegments?: number;
  ridgeHeight?: number;
  seed?: number;
}

async function loadBuildInterlace() {
  const module = await import('../../../../src/world/buildings/kit/Interlace');
  return module.buildInterlace as (
    options: InterlaceOptions,
    material: THREE.Material,
  ) => THREE.Group;
}

function makeTrimMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#8a775d', roughness: 1 });
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function strandMeshes(root: THREE.Object3D): THREE.Mesh[] {
  return collectMeshes(root)
    .filter(mesh => /^strand-\d+$/.test(mesh.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const vertices: THREE.Vector3[] = [];
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertices.push(
        new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld),
      );
    }
  }
  return vertices;
}

function worldBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function ringRowIndices(mesh: THREE.Mesh): Map<number, number[]> {
  const uv = mesh.geometry.getAttribute('uv');
  const rows = new Map<number, number[]>();
  for (let index = 0; index < uv.count; index++) {
    const key = Number(uv.getY(index).toFixed(5));
    const row = rows.get(key);
    if (row) {
      row.push(index);
    } else {
      rows.set(key, [index]);
    }
  }
  return rows;
}

function ringVerticesAt(mesh: THREE.Mesh, normalizedT: number): THREE.Vector3[] {
  mesh.updateMatrixWorld(true);
  const rows = ringRowIndices(mesh);
  const nearest = [...rows.keys()].reduce((best, candidate) => (
    Math.abs(candidate - normalizedT) < Math.abs(best - normalizedT) ? candidate : best
  ));
  const position = mesh.geometry.getAttribute('position');
  return rows.get(nearest)!.map(index => (
    new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld)
  ));
}

function meanPoint(points: readonly THREE.Vector3[]): THREE.Vector3 {
  return points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
}

function ringCenterAt(mesh: THREE.Mesh, normalizedT: number): THREE.Vector3 {
  const rows = ringRowIndices(mesh);
  const keys = [...rows.keys()].sort((a, b) => a - b);
  const clampedT = THREE.MathUtils.clamp(normalizedT, 0, 1);
  const lowerKey = [...keys].reverse().find(key => key <= clampedT) ?? keys[0]!;
  const upperKey = keys.find(key => key >= clampedT) ?? keys.at(-1)!;

  const lowerCenter = meanPoint(rows.get(lowerKey)!.map(index => (
    new THREE.Vector3()
      .fromBufferAttribute(mesh.geometry.getAttribute('position'), index)
      .applyMatrix4(mesh.matrixWorld)
  )));

  if (upperKey === lowerKey) return lowerCenter;

  const upperCenter = meanPoint(rows.get(upperKey)!.map(index => (
    new THREE.Vector3()
      .fromBufferAttribute(mesh.geometry.getAttribute('position'), index)
      .applyMatrix4(mesh.matrixWorld)
  )));
  const blend = (clampedT - lowerKey) / Math.max(upperKey - lowerKey, 1e-6);
  return lowerCenter.lerp(upperCenter, blend);
}

function ringMeanRadius(mesh: THREE.Mesh, normalizedT: number): number {
  const vertices = ringVerticesAt(mesh, normalizedT);
  const center = meanPoint(vertices);
  return vertices.reduce((sum, vertex) => sum + vertex.distanceTo(center), 0) / vertices.length;
}

function interlaceCenterAt(root: THREE.Object3D, normalizedT: number): THREE.Vector3 {
  const centers = strandMeshes(root).map(mesh => ringCenterAt(mesh, normalizedT));
  expect(centers).toHaveLength(3);
  return meanPoint(centers);
}

function endClusterRadius(root: THREE.Object3D, anchor: 'start' | 'end'): number {
  const centers = strandMeshes(root).map(mesh => ringCenterAt(mesh, anchor === 'start' ? 0 : 1));
  const center = meanPoint(centers);
  return Math.max(...centers.map(point => point.distanceTo(center)));
}

function pointLineDistance(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3): number {
  const line = end.clone().sub(start);
  const lineLengthSq = line.lengthSq();
  if (lineLengthSq <= 1e-12) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(line) / lineLengthSq, 0, 1);
  const closest = start.clone().addScaledVector(line, t);
  return point.distanceTo(closest);
}

function crossingFractionsForPairZeroOne(length: number, period: number): number[] {
  const crossings: number[] = [];
  for (let distance = period / 12; distance < length; distance += period / 2) {
    crossings.push(distance / length);
  }
  return crossings;
}

function countVerticesBeyondX(root: THREE.Object3D, threshold: number, side: 'left' | 'right'): number {
  return worldVertices(root).filter(vertex => (
    side === 'left'
      ? vertex.x < threshold
      : vertex.x > threshold
  )).length;
}

function hasNonFiniteGeometry(root: THREE.Object3D): boolean {
  return worldVertices(root).some(vertex => (
    !Number.isFinite(vertex.x)
    || !Number.isFinite(vertex.y)
    || !Number.isFinite(vertex.z)
  ));
}

function triangleAreaMetrics(
  root: THREE.Object3D,
  zeroAreaEpsilon = 1e-12,
): { total: number; zeroAreaCount: number; minDoubleArea: number } {
  root.updateMatrixWorld(true);
  let total = 0;
  let zeroAreaCount = 0;
  let minDoubleArea = Number.POSITIVE_INFINITY;

  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getIndex();
    const triangleCount = index ? index.count / 3 : position.count / 3;

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const readIndex = (corner: number) => (
        index ? index.getX(triangleIndex * 3 + corner) : triangleIndex * 3 + corner
      );
      const a = new THREE.Vector3().fromBufferAttribute(position, readIndex(0)).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(position, readIndex(1)).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(position, readIndex(2)).applyMatrix4(mesh.matrixWorld);
      const doubleArea = b.clone().sub(a).cross(c.clone().sub(a)).length();
      total += 1;
      minDoubleArea = Math.min(minDoubleArea, doubleArea);
      if (doubleArea <= zeroAreaEpsilon) zeroAreaCount += 1;
    }
  }

  return { total, zeroAreaCount, minDoubleArea };
}

function countTriangles(root: THREE.Object3D): number {
  return collectMeshes(root).reduce((sum, mesh) => {
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    return sum + (index ? index.count / 3 : position.count / 3);
  }, 0);
}

function geometrySignature(root: THREE.Object3D): string {
  root.updateMatrixWorld(true);
  const rows = collectMeshes(root)
    .map((mesh) => {
      const vertices: number[] = [];
      const position = mesh.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) {
        const world = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
        vertices.push(
          Number(world.x.toFixed(5)),
          Number(world.y.toFixed(5)),
          Number(world.z.toFixed(5)),
        );
      }
      return { name: mesh.name, vertices };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return JSON.stringify(rows);
}

function projectedRadialSeriesXY(mesh: THREE.Object3D, binCount = 72): number[] {
  const vertices = worldVertices(mesh);
  const center = meanPoint(vertices);
  const bins = Array.from({ length: binCount }, () => [] as number[]);
  for (const vertex of vertices) {
    const dx = vertex.x - center.x;
    const dy = vertex.y - center.y;
    const angle = Math.atan2(dy, dx);
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
    const bin = Math.min(binCount - 1, Math.floor((normalizedAngle / (Math.PI * 2)) * binCount));
    bins[bin]!.push(Math.hypot(dx, dy));
  }

  const fallback = vertices.reduce((sum, vertex) => (
    sum + Math.hypot(vertex.x - center.x, vertex.y - center.y)
  ), 0) / Math.max(vertices.length, 1);

  return bins.map(values => (
    values.length === 0 ? fallback : Math.max(...values)
  ));
}

function harmonicEnergy(values: number[], frequency: number): number {
  let real = 0;
  let imaginary = 0;
  const length = values.length;
  for (let index = 0; index < length; index++) {
    const angle = (index / length) * Math.PI * 2;
    real += values[index]! * Math.cos(frequency * angle);
    imaginary -= values[index]! * Math.sin(frequency * angle);
  }
  return Math.hypot(real, imaginary) / length;
}

describe('Interlace', () => {
  it('creates real alternating over-under relief across successive crossings', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const length = 6;
    const period = 1;
    const interlace = buildInterlace({
      length,
      period,
      cordRadius: 0.08,
      raisedRelief: 0.16,
      terminalKnots: false,
      radialSegments: 6,
    }, material);
    const strands = strandMeshes(interlace);
    const crossings = crossingFractionsForPairZeroOne(length, period).filter(t => t > 0.2 && t < 0.8).slice(0, 4);

    expect(strands).toHaveLength(3);
    expect(crossings).toHaveLength(4);

    const zSigns = crossings.map((t) => {
      const first = ringCenterAt(strands[0]!, t);
      const second = ringCenterAt(strands[1]!, t);
      expect(Math.abs(first.y - second.y)).toBeLessThan(0.035);
      const zDelta = first.z - second.z;
      expect(Math.abs(zDelta)).toBeGreaterThan(0.18);
      return Math.sign(zDelta);
    });

    expect(zSigns.every(sign => sign !== 0)).toBe(true);
    for (let index = 1; index < zSigns.length; index++) {
      expect(zSigns[index]).toBe(-zSigns[index - 1]!);
    }
  });

  it('builds strands as raised cords with a measurable tube radius', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const interlace = buildInterlace({
      length: 4.8,
      period: 0.8,
      cordRadius: 0.07,
      raisedRelief: 0.14,
      terminalKnots: false,
      radialSegments: 5,
    }, material);
    const strand = strandMeshes(interlace)[0]!;
    const radii = [0.2, 0.5, 0.8].map(t => ringMeanRadius(strand, t));

    radii.forEach((radius) => {
      expect(radius).toBeGreaterThan(0.055);
      expect(radius).toBeLessThan(0.085);
    });
  });

  it('adds distinct terminal knot geometry beyond the plain braid envelope', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const baseOptions: InterlaceOptions = {
      length: 4.5,
      period: 0.75,
      cordRadius: 0.06,
      raisedRelief: 0.13,
      radialSegments: 6,
    };
    const plain = buildInterlace({ ...baseOptions, terminalKnots: false }, material);
    const knotted = buildInterlace({ ...baseOptions, terminalKnots: true }, material);
    const plainBox = worldBox(plain);
    const knotBox = worldBox(knotted);

    expect(knotBox.min.x).toBeLessThan(plainBox.min.x - 0.08);
    expect(knotBox.max.x).toBeGreaterThan(plainBox.max.x + 0.08);
    expect(countVerticesBeyondX(plain, plainBox.min.x - 0.04, 'left')).toBe(0);
    expect(countVerticesBeyondX(plain, plainBox.max.x + 0.04, 'right')).toBe(0);
    expect(countVerticesBeyondX(knotted, plainBox.min.x - 0.04, 'left')).toBeGreaterThan(18);
    expect(countVerticesBeyondX(knotted, plainBox.max.x + 0.04, 'right')).toBeGreaterThan(18);
    expect(collectMeshes(knotted).length).toBeGreaterThan(collectMeshes(plain).length);
  });

  it('is deterministic and terminates within the requested run length without splayed strand ends', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const options: InterlaceOptions = {
      length: 3.6,
      period: 0.9,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: false,
      radialSegments: 6,
      seed: 17,
    };
    const first = buildInterlace(options, material);
    const second = buildInterlace(options, material);
    const startCenter = interlaceCenterAt(first, 0);
    const endCenter = interlaceCenterAt(first, 1);

    expect(geometrySignature(first)).toBe(geometrySignature(second));
    expect(endCenter.x - startCenter.x).toBeGreaterThan(3.5);
    expect(endCenter.x - startCenter.x).toBeLessThan(3.7);
    expect(endClusterRadius(first, 'start')).toBeLessThan(0.015);
    expect(endClusterRadius(first, 'end')).toBeLessThan(0.015);
  });

  it('uses seed deterministically to vary terminal knot geometry', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const baseOptions: InterlaceOptions = {
      length: 4.2,
      period: 0.7,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: true,
      seed: 11,
    };
    const first = buildInterlace(baseOptions, material);
    const repeat = buildInterlace(baseOptions, material);
    const changedSeed = buildInterlace({ ...baseOptions, seed: 12 }, material);

    expect(geometrySignature(first)).toBe(geometrySignature(repeat));
    expect(geometrySignature(first)).not.toBe(geometrySignature(changedSeed));
  });

  it('shapes terminal knots as trefoil roundels rather than oval loops', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const interlace = buildInterlace({
      length: 4.2,
      period: 0.7,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: true,
      seed: 11,
    }, material);
    const startKnot = interlace.getObjectByName('terminal-knot-start');
    expect(startKnot).toBeTruthy();

    const radialSeries = projectedRadialSeriesXY(startKnot!);
    const secondHarmonic = harmonicEnergy(radialSeries, 2);
    const thirdHarmonic = harmonicEnergy(radialSeries, 3);

    expect(thirdHarmonic).toBeGreaterThan(0.015);
    expect(thirdHarmonic).toBeGreaterThan(secondHarmonic * 1.2);
  });

  it('keeps representative straight and gable builds within a low-poly triangle budget', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const straight = buildInterlace({
      length: 4.8,
      period: 0.8,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: true,
      strandCount: 6,
    }, material);
    const gable = buildInterlace({
      length: 4.8,
      variant: 'gableVerge',
      ridgeHeight: 1.1,
      period: 0.8,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: true,
    }, material);

    expect(strandMeshes(straight)).toHaveLength(3);
    expect(countTriangles(straight)).toBeLessThan(3200);
    expect(countTriangles(gable)).toBeLessThan(3200);
    expect(countTriangles(straight)).toBeGreaterThan(1200);
    expect(countTriangles(gable)).toBeGreaterThan(1200);
  });

  it('keeps the straight variant colinear while the gable verge variant forms a full chevron with the requested ridge height', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const length = 4.8;
    const ridgeHeight = 1.1;
    const straight = buildInterlace({
      length,
      period: 0.8,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: false,
      variant: 'straight',
    }, material);
    const gable = buildInterlace({
      length,
      period: 0.8,
      cordRadius: 0.05,
      raisedRelief: 0.12,
      terminalKnots: false,
      variant: 'gableVerge',
      ridgeHeight,
    }, material);

    const straightSamples = [0, 0.25, 0.5, 0.75, 1].map(t => interlaceCenterAt(straight, t));
    const gableSamples = [0, 0.25, 0.5, 0.75, 1].map(t => interlaceCenterAt(gable, t));
    const straightDeviation = straightSamples
      .slice(1, -1)
      .map(point => pointLineDistance(point, straightSamples[0]!, straightSamples.at(-1)!));
    const gableMid = gableSamples[2]!;
    const gableLineDistance = pointLineDistance(gableMid, gableSamples[0]!, gableSamples.at(-1)!);
    const leftRunLength = gableSamples[0]!.distanceTo(gableMid);
    const rightRunLength = gableMid.distanceTo(gableSamples.at(-1)!);

    straightDeviation.forEach(distance => expect(distance).toBeLessThan(0.02));
    expect(Math.abs(straightSamples[2]!.y)).toBeLessThan(0.02);
    expect(gableMid.y).toBeGreaterThan(1.02);
    expect(gableMid.y).toBeLessThan(1.16);
    expect(Math.abs(gableSamples[0]!.y)).toBeLessThan(0.02);
    expect(Math.abs(gableSamples.at(-1)!.y)).toBeLessThan(0.02);
    expect(gableSamples[0]!.x).toBeLessThan(-2.05);
    expect(gableSamples.at(-1)!.x).toBeGreaterThan(2.05);
    expect(leftRunLength).toBeGreaterThan(2.35);
    expect(leftRunLength).toBeLessThan(2.45);
    expect(rightRunLength).toBeGreaterThan(2.35);
    expect(rightRunLength).toBeLessThan(2.45);
    expect(gableLineDistance).toBeGreaterThan(0.8);
  });

  it('keeps short and extreme variants finite with no zero-area triangles', async () => {
    const buildInterlace = await loadBuildInterlace();
    const material = makeTrimMaterial();
    const variants: InterlaceOptions[] = [
      {
        length: 1.05,
        period: 1.6,
        cordRadius: 0.028,
        raisedRelief: 0.01,
        radialSegments: 3,
        terminalKnots: false,
      },
      {
        length: 2.2,
        period: 0.55,
        cordRadius: 0.012,
        raisedRelief: 0.2,
        radialSegments: 4,
        terminalKnots: true,
        seed: 9,
      },
      {
        length: 1.7,
        variant: 'gableVerge',
        ridgeHeight: 0.72,
        period: 0.9,
        cordRadius: 0.03,
        raisedRelief: 0.09,
        radialSegments: 3,
        terminalKnots: true,
        seed: 77,
      },
    ];

    for (const options of variants) {
      const interlace = buildInterlace(options, material);
      const metrics = triangleAreaMetrics(interlace);
      const box = worldBox(interlace);
      const size = box.getSize(new THREE.Vector3());

      expect(hasNonFiniteGeometry(interlace)).toBe(false);
      expect(metrics.zeroAreaCount).toBe(0);
      expect(metrics.minDoubleArea).toBeGreaterThan(1e-12);
      expect(metrics.total).toBeGreaterThan(40);
      expect(size.length()).toBeGreaterThan(0.2);
    }
  });
});
