import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

interface LatticeDomeOptions {
  radius: number;
  ribsPerFamily?: number;
  tubeRadius?: number;
  weaveOffset?: number;
  vineHooks?: boolean;
  vineHookDensity?: number;
  brokenSegments?: boolean;
  brokenSegmentDensity?: number;
  seed?: number;
}

async function loadLatticeDomeModule() {
  return import('../../../../src/world/buildings/kit/LatticeDome');
}

async function loadBuildLatticeDome() {
  const module = await loadLatticeDomeModule();
  return module.buildLatticeDome as (
    options: LatticeDomeOptions,
    material: THREE.Material,
  ) => THREE.Group;
}

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#7b6f60', roughness: 1 });
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function collectRoleMeshes(root: THREE.Object3D, role: string): THREE.Mesh[] {
  return collectMeshes(root).filter(mesh => mesh.userData.role === role);
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function worldVertices(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const vertices: THREE.Vector3[] = [];
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertices.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld));
    }
  }
  return vertices;
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of collectMeshes(root)) {
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      expect(Number.isFinite(position.getX(index))).toBe(true);
      expect(Number.isFinite(position.getY(index))).toBe(true);
      expect(Number.isFinite(position.getZ(index))).toBe(true);
    }
  }
}

function meanBandPlanRadius(root: THREE.Object3D, normalizedHeight: number, toleranceRatio = 0.05): number {
  const box = worldBox(root);
  const height = box.max.y - box.min.y;
  const targetY = THREE.MathUtils.lerp(box.min.y, box.max.y, normalizedHeight);
  const tolerance = Math.max(height * toleranceRatio, 1e-4);
  const band = worldVertices(root).filter(vertex => Math.abs(vertex.y - targetY) <= tolerance);
  expect(band.length).toBeGreaterThan(0);
  return band.reduce((sum, vertex) => sum + Math.hypot(vertex.x, vertex.z), 0) / band.length;
}

function trailingIndex(name: string): number {
  const match = name.match(/(\d+)$/);
  return match ? Number.parseInt(match[1]!, 10) : -1;
}

function sortedRibGroups(family: THREE.Object3D): THREE.Object3D[] {
  return [...family.children].sort((a, b) => trailingIndex(a.name) - trailingIndex(b.name));
}

function sortedSegmentMeshes(rib: THREE.Object3D): THREE.Mesh[] {
  return collectRoleMeshes(rib, 'rib-segment').sort((a, b) => trailingIndex(a.name) - trailingIndex(b.name));
}

function endBandRadius(mesh: THREE.Mesh, anchor: 'bottom' | 'top', fraction = 0.12): number {
  const vertices = worldVertices(mesh);
  const ys = vertices.map(vertex => vertex.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bandHeight = Math.max((maxY - minY) * fraction, 1e-5);
  const band = vertices.filter(vertex => (
    anchor === 'bottom'
      ? vertex.y <= minY + bandHeight
      : vertex.y >= maxY - bandHeight
  ));
  expect(band.length).toBeGreaterThan(0);
  const center = band.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / band.length);
  return band.reduce((sum, vertex) => sum + vertex.distanceTo(center), 0) / band.length;
}

function tubeRingVertexCount(mesh: THREE.Mesh): number {
  const uv = mesh.geometry.getAttribute('uv');
  const firstV = uv.getY(0);
  let count = 1;
  while (count < uv.count && Math.abs(uv.getY(count) - firstV) <= 1e-6) count += 1;
  return count;
}

function tubeEndRingRadius(mesh: THREE.Mesh, anchor: 'start' | 'end'): number {
  const position = mesh.geometry.getAttribute('position');
  const ringVertexCount = tubeRingVertexCount(mesh);
  const startIndex = anchor === 'start' ? 0 : position.count - ringVertexCount;
  const vertices = Array.from({ length: ringVertexCount }, (_, index) => (
    new THREE.Vector3(
      position.getX(startIndex + index),
      position.getY(startIndex + index),
      position.getZ(startIndex + index),
    )
  ));
  const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).multiplyScalar(1 / vertices.length);
  return vertices.reduce((sum, vertex) => sum + vertex.distanceTo(center), 0) / vertices.length;
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

  return {
    total,
    zeroAreaCount,
    minDoubleArea,
  };
}

function expectNoZeroAreaTriangles(root: THREE.Object3D, label: string): void {
  const metrics = triangleAreaMetrics(root);
  expect(
    metrics.zeroAreaCount,
    `${label} emitted ${metrics.zeroAreaCount}/${metrics.total} zero-area triangles`,
  ).toBe(0);
  expect(
    metrics.minDoubleArea,
    `${label} had min double-area ${metrics.minDoubleArea}`,
  ).toBeGreaterThan(1e-12);
}

function countTriangles(root: THREE.Object3D): number {
  return collectMeshes(root).reduce((sum, mesh) => {
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    return sum + (index ? index.count / 3 : position.count / 3);
  }, 0);
}

function ribSegmentNames(root: THREE.Object3D): string[] {
  return collectRoleMeshes(root, 'rib-segment').map(mesh => mesh.name).sort();
}

function missingSegmentNames(reference: THREE.Object3D, variant: THREE.Object3D): string[] {
  const variantNames = new Set(ribSegmentNames(variant));
  return ribSegmentNames(reference).filter(name => !variantNames.has(name));
}

function nearestVertexDistance(root: THREE.Object3D, point: THREE.Vector3): number {
  return Math.min(...worldVertices(root).map(vertex => vertex.distanceTo(point)));
}

function approximateKnuckleRadius(mesh: THREE.Mesh): number {
  const size = worldBox(mesh).getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z) * 0.5;
}

interface TestLatticeLayout {
  radius: number;
  ribsPerFamily: number;
  tubeRadius: number;
  apexTubeRadius: number;
  halfWeaveOffset: number;
  stepAngle: number;
  twistAngle: number;
  maxPhi: number;
  crossingCount: number;
}

function clampPositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback;
}

function buildTestLayout(options: LatticeDomeOptions): TestLatticeLayout {
  const radius = clampPositive(options.radius, 2);
  const ribsPerFamily = Math.max(4, Math.floor(clampPositive(options.ribsPerFamily, 8)));
  const tubeRadius = Math.min(clampPositive(options.tubeRadius, Math.max(radius * 0.012, 0.01)), radius * 0.12);
  const weaveOffset = Math.min(
    clampPositive(options.weaveOffset, Math.max(tubeRadius * 0.75, radius * 0.01)),
    radius * 0.18,
  );
  const halfWeaveOffset = weaveOffset * 0.5;
  const apexTubeRadius = tubeRadius * 0.42;
  const topSurfaceRadius = THREE.MathUtils.clamp(
    Math.max(radius * 0.035, halfWeaveOffset + apexTubeRadius * 2.4),
    radius * 0.01,
    radius * 0.45,
  );

  return {
    radius,
    ribsPerFamily,
    tubeRadius,
    apexTubeRadius,
    halfWeaveOffset,
    stepAngle: (Math.PI * 2) / ribsPerFamily,
    twistAngle: Math.PI * 2,
    maxPhi: Math.acos(THREE.MathUtils.clamp(topSurfaceRadius / radius, 1e-6, 0.9999)),
    crossingCount: ribsPerFamily * 2,
  };
}

function testDomePoint(layout: TestLatticeLayout, theta: number, t: number, radialOffset: number): THREE.Vector3 {
  const phi = layout.maxPhi * THREE.MathUtils.clamp(t, 0, 1);
  const surfaceRadius = layout.radius * Math.cos(phi);
  const planRadius = Math.max(surfaceRadius + radialOffset, layout.apexTubeRadius * 1.2);
  return new THREE.Vector3(
    Math.cos(theta) * planRadius,
    layout.radius * Math.sin(phi),
    Math.sin(theta) * planRadius,
  );
}

function familyBRibIndexAtCrossing(layout: TestLatticeLayout, familyARibIndex: number, crossingIndex: number): number {
  return (familyARibIndex + crossingIndex) % layout.ribsPerFamily;
}

function crossingMetrics(layout: TestLatticeLayout, familyARibIndex: number, crossingIndex: number) {
  const t = (crossingIndex + 0.5) / layout.crossingCount;
  const familyBRibIndex = familyBRibIndexAtCrossing(layout, familyARibIndex, crossingIndex);
  const familyATheta = layout.stepAngle * familyARibIndex + layout.twistAngle * t;
  const familyBTheta = (
    layout.stepAngle * familyBRibIndex
    + layout.stepAngle * 0.5
    - layout.twistAngle * t
  );

  return {
    t,
    familyBRibIndex,
    familyAPoint: testDomePoint(layout, familyATheta, t, layout.halfWeaveOffset),
    familyBPoint: testDomePoint(layout, familyBTheta, t, -layout.halfWeaveOffset),
    tubeRadius: THREE.MathUtils.lerp(layout.tubeRadius, layout.apexTubeRadius, Math.pow(t, 0.9)),
  };
}

function actualBoundingSphereRadius(mesh: THREE.Mesh): number {
  mesh.updateMatrixWorld(true);
  mesh.geometry.computeBoundingSphere();
  const scale = mesh.getWorldScale(new THREE.Vector3());
  expect(Math.abs(scale.x - scale.y)).toBeLessThan(1e-6);
  expect(Math.abs(scale.x - scale.z)).toBeLessThan(1e-6);
  return (mesh.geometry.boundingSphere?.radius ?? 0) * scale.x;
}

function segmentKey(family: string, ribIndex: number, segmentIndex: number): string {
  return `${family}:${ribIndex}:${segmentIndex}`;
}

function survivingSegmentIds(root: THREE.Object3D): Set<string> {
  return new Set(
    collectRoleMeshes(root, 'rib-segment').map(mesh => (
      segmentKey(
        String(mesh.userData.family),
        Number(mesh.userData.ribIndex),
        Number(mesh.userData.segmentIndex),
      )
    )),
  );
}

function expectedKnuckleNames(layout: TestLatticeLayout, survivingSegments: Set<string>): string[] {
  const names: string[] = [];
  for (let familyARibIndex = 0; familyARibIndex < layout.ribsPerFamily; familyARibIndex++) {
    for (let crossingIndex = 0; crossingIndex < layout.crossingCount; crossingIndex++) {
      const familyBRibIndex = familyBRibIndexAtCrossing(layout, familyARibIndex, crossingIndex);
      const adjacentSegments = [crossingIndex, crossingIndex + 1];
      const crossingSurvives = adjacentSegments.every(segmentIndex => (
        survivingSegments.has(segmentKey('a', familyARibIndex, segmentIndex))
        && survivingSegments.has(segmentKey('b', familyBRibIndex, segmentIndex))
      ));

      if (crossingSurvives) names.push(`knuckle-${familyARibIndex}-${crossingIndex}`);
    }
  }
  return names.sort();
}

function expectKnuckleTouchesBothRibs(mesh: THREE.Mesh, layout: TestLatticeLayout): void {
  const familyARibIndex = Number(mesh.userData.ribIndex);
  const crossingIndex = Number(mesh.userData.crossingIndex);
  const { familyAPoint, familyBPoint, tubeRadius } = crossingMetrics(layout, familyARibIndex, crossingIndex);
  const center = mesh.getWorldPosition(new THREE.Vector3());
  const reach = actualBoundingSphereRadius(mesh);

  expect(
    reach,
    `${mesh.name} reach ${reach} did not span family-a distance ${center.distanceTo(familyAPoint)} with tube radius ${tubeRadius}`,
  ).toBeGreaterThanOrEqual(center.distanceTo(familyAPoint) + tubeRadius - 1e-6);
  expect(
    reach,
    `${mesh.name} reach ${reach} did not span family-b distance ${center.distanceTo(familyBPoint)} with tube radius ${tubeRadius}`,
  ).toBeGreaterThanOrEqual(center.distanceTo(familyBPoint) + tubeRadius - 1e-6);
}

describe('buildLatticeDome', () => {
  it('builds a finite non-degenerate canopy group', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const dome = buildLatticeDome({ radius: 2 }, makeMaterial());
    const box = worldBox(dome);
    const size = box.getSize(new THREE.Vector3());

    expect(dome).toBeInstanceOf(THREE.Group);
    expect([
      box.min.x,
      box.min.y,
      box.min.z,
      box.max.x,
      box.max.y,
      box.max.z,
    ].every(Number.isFinite)).toBe(true);
    expect(size.x).toBeGreaterThan(1);
    expect(size.y).toBeGreaterThan(1);
    expect(size.z).toBeGreaterThan(1);
    assertFiniteGeometry(dome);
    expectNoZeroAreaTriangles(dome, 'radius=2');
  });

  it('creates two named rib families with multiple individually named ribs and honors ribsPerFamily', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const ribsPerFamily = 10;
    const dome = buildLatticeDome({ radius: 2, ribsPerFamily }, makeMaterial());
    const familyA = dome.getObjectByName('family-a');
    const familyB = dome.getObjectByName('family-b');

    expect(familyA).toBeTruthy();
    expect(familyB).toBeTruthy();
    if (!familyA || !familyB) return;

    expect(familyA.children).toHaveLength(ribsPerFamily);
    expect(familyB.children).toHaveLength(ribsPerFamily);
    expect(sortedRibGroups(familyA).every((rib, index) => rib.name === `rib-a-${index}`)).toBe(true);
    expect(sortedRibGroups(familyB).every((rib, index) => rib.name === `rib-b-${index}`)).toBe(true);
    expect(sortedRibGroups(familyA).every(rib => sortedSegmentMeshes(rib).length > 0)).toBe(true);
    expect(sortedRibGroups(familyB).every(rib => sortedSegmentMeshes(rib).length > 0)).toBe(true);
  });

  it('keeps one rib family measurably farther from the central axis than the other at comparable heights', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const dome = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.05,
      weaveOffset: 0.12,
    }, makeMaterial());
    const familyA = dome.getObjectByName('family-a');
    const familyB = dome.getObjectByName('family-b');

    expect(familyA).toBeTruthy();
    expect(familyB).toBeTruthy();
    if (!familyA || !familyB) return;

    const deltas = [0.22, 0.5, 0.76].map((height) => (
      meanBandPlanRadius(familyA, height) - meanBandPlanRadius(familyB, height)
    ));

    expect(deltas.every(delta => delta > 0.035)).toBe(true);
    expect(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length).toBeGreaterThan(0.05);
  });

  it('gives each rib a real geometric taper from the base to the apex', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const dome = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.08,
      weaveOffset: 0.08,
    }, makeMaterial());
    const rib = dome.getObjectByName('rib-a-0');

    expect(rib).toBeTruthy();
    if (!rib) return;

    const segments = sortedSegmentMeshes(rib);
    expect(segments.length).toBeGreaterThan(1);
    const baseRadius = endBandRadius(segments[0]!, 'bottom');
    const apexRadius = endBandRadius(segments[segments.length - 1]!, 'top');

    expect(baseRadius - apexRadius).toBeGreaterThan(0.015);
    expect(baseRadius).toBeGreaterThan(apexRadius * 1.3);
  });

  it('emits crossing knuckles as a separate non-degenerate group with real volume', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const dome = buildLatticeDome({ radius: 2, ribsPerFamily: 8 }, makeMaterial());
    const knuckles = dome.getObjectByName('crossing-knuckles');

    expect(knuckles).toBeTruthy();
    if (!knuckles) return;

    const meshes = collectRoleMeshes(knuckles, 'crossing-knuckle');
    expect(meshes.length).toBeGreaterThan(0);
    const size = worldBox(meshes[0]!).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.002);
    expect(size.y).toBeGreaterThan(0.002);
    expect(size.z).toBeGreaterThan(0.002);
  });

  it('places crossing knuckles on real intersections between both rib families', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    for (const options of [
      { radius: 2, ribsPerFamily: 8, tubeRadius: 0.05, weaveOffset: 0.12, seed: 4 },
      { radius: 4, ribsPerFamily: 12, tubeRadius: 0.06, weaveOffset: 0.15, seed: 9 },
    ]) {
      const dome = buildLatticeDome(options, makeMaterial());
      const familyA = dome.getObjectByName('family-a');
      const familyB = dome.getObjectByName('family-b');
      const knuckles = dome.getObjectByName('crossing-knuckles');

      expect(familyA).toBeTruthy();
      expect(familyB).toBeTruthy();
      expect(knuckles).toBeTruthy();
      if (!familyA || !familyB || !knuckles) continue;

      const meshes = collectRoleMeshes(knuckles, 'crossing-knuckle');
      expect(meshes.length).toBeGreaterThan(0);

      for (const knuckle of meshes) {
        const center = worldBox(knuckle).getCenter(new THREE.Vector3());
        const reach = approximateKnuckleRadius(knuckle);
        expect(nearestVertexDistance(familyA, center)).toBeLessThan(reach);
        expect(nearestVertexDistance(familyB, center)).toBeLessThan(reach);
      }
    }
  });

  it('deterministically removes specific rib segments for broken canopy variants and reduces total rib geometry', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const intact = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.04,
      weaveOffset: 0.06,
      seed: 7,
    }, makeMaterial());
    const brokenA = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.04,
      weaveOffset: 0.06,
      brokenSegments: true,
      brokenSegmentDensity: 0.24,
      seed: 7,
    }, makeMaterial());
    const brokenB = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.04,
      weaveOffset: 0.06,
      brokenSegments: true,
      brokenSegmentDensity: 0.24,
      seed: 7,
    }, makeMaterial());
    const brokenC = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.04,
      weaveOffset: 0.06,
      brokenSegments: true,
      brokenSegmentDensity: 0.24,
      seed: 19,
    }, makeMaterial());

    const missingA = missingSegmentNames(intact, brokenA);
    const missingB = missingSegmentNames(intact, brokenB);
    const missingC = missingSegmentNames(intact, brokenC);

    expect(missingA.length).toBeGreaterThan(0);
    expect(missingA).toEqual(missingB);
    expect(missingC).not.toEqual(missingA);
    expect(countTriangles(brokenA)).toBeLessThan(countTriangles(intact));
    expect(ribSegmentNames(brokenA).length).toBeLessThan(ribSegmentNames(intact).length);
  });

  it('sizes every knuckle to span both real rib centerlines even for extreme weave offsets', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const options = {
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.005,
      weaveOffset: 0.36,
    } satisfies LatticeDomeOptions;
    const layout = buildTestLayout(options);
    const dome = buildLatticeDome(options, makeMaterial());
    const knuckles = dome.getObjectByName('crossing-knuckles');

    expect(knuckles).toBeTruthy();
    if (!knuckles) return;

    const meshes = collectRoleMeshes(knuckles, 'crossing-knuckle');
    expect(meshes).toHaveLength(layout.ribsPerFamily * layout.crossingCount);

    for (const mesh of meshes) {
      expectKnuckleTouchesBothRibs(mesh, layout);
    }
  });

  it('only emits broken-canopy knuckles where both rib families keep every adjacent span', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const options = {
      radius: 2,
      ribsPerFamily: 8,
      tubeRadius: 0.04,
      weaveOffset: 0.06,
      brokenSegments: true,
      brokenSegmentDensity: 0.24,
      seed: 7,
    } satisfies LatticeDomeOptions;
    const layout = buildTestLayout(options);
    const dome = buildLatticeDome(options, makeMaterial());
    const survivingSegments = survivingSegmentIds(dome);
    const expectedNamesForPresentCrossings = expectedKnuckleNames(layout, survivingSegments);
    const knuckles = dome.getObjectByName('crossing-knuckles');

    expect(knuckles).toBeTruthy();
    if (!knuckles) return;

    const meshes = collectRoleMeshes(knuckles, 'crossing-knuckle');
    const actualKnuckleNames = meshes.map(mesh => mesh.name).sort();

    expect(expectedNamesForPresentCrossings.length).toBeLessThan(layout.ribsPerFamily * layout.crossingCount);
    expect(actualKnuckleNames).toEqual(expectedNamesForPresentCrossings);

    for (const mesh of meshes) {
      expectKnuckleTouchesBothRibs(mesh, layout);
    }
  });

  it('only emits optional vine hooks when enabled and gives them non-degenerate geometry', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const withoutHooks = buildLatticeDome({ radius: 2, ribsPerFamily: 8, seed: 5 }, makeMaterial());
    const withHooks = buildLatticeDome({ radius: 2, ribsPerFamily: 8, vineHooks: true, seed: 5 }, makeMaterial());

    expect(withoutHooks.getObjectByName('vine-hooks')).toBeFalsy();

    const hookGroup = withHooks.getObjectByName('vine-hooks');
    expect(hookGroup).toBeTruthy();
    if (!hookGroup) return;

    const hookMeshes = collectRoleMeshes(hookGroup, 'vine-hook');
    expect(hookMeshes.length).toBeGreaterThan(0);
    const size = worldBox(hookMeshes[0]!).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.001);
    expect(size.y).toBeGreaterThan(0.001);
    expect(size.z).toBeGreaterThan(0.001);
  });

  it('keeps micro-scale ribs tapering toward the apex instead of widening from an absolute floor', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const dome = buildLatticeDome({
      radius: 2,
      ribsPerFamily: 4,
      tubeRadius: 0.0001,
      weaveOffset: 0.002,
      seed: 21,
    }, makeMaterial());
    const rib = dome.getObjectByName('rib-a-0');

    expect(rib).toBeTruthy();
    if (!rib) return;

    const segments = sortedSegmentMeshes(rib);
    expect(segments.length).toBeGreaterThan(1);
    const baseRadius = tubeEndRingRadius(segments[0]!, 'start');
    const apexRadius = tubeEndRingRadius(segments[segments.length - 1]!, 'end');

    expect(baseRadius).toBeGreaterThan(apexRadius);
    expectNoZeroAreaTriangles(dome, 'micro-taper-extreme');
  });

  it('avoids zero-area triangles across common and thin-edge parameter sweeps', async () => {
    const buildLatticeDome = await loadBuildLatticeDome();
    const material = makeMaterial();
    const sweepCases: Array<{ label: string; options: LatticeDomeOptions }> = [
      { label: 'default-ish', options: { radius: 2, ribsPerFamily: 8, tubeRadius: 0.02, seed: 3 } },
      { label: 'mid-scale', options: { radius: 1.2, ribsPerFamily: 6, tubeRadius: 0.015, weaveOffset: 0.03, seed: 5 } },
      { label: 'large-with-hooks', options: { radius: 3, ribsPerFamily: 12, tubeRadius: 0.035, weaveOffset: 0.06, vineHooks: true, seed: 9 } },
      { label: 'small-broken', options: { radius: 0.65, ribsPerFamily: 5, tubeRadius: 0.008, weaveOffset: 0.014, brokenSegments: true, brokenSegmentDensity: 0.22, seed: 13 } },
      { label: 'thin-extreme', options: { radius: 0.35, ribsPerFamily: 4, tubeRadius: 0.0035, weaveOffset: 0.005, brokenSegments: true, brokenSegmentDensity: 0.18, seed: 17 } },
    ];

    for (const sweepCase of sweepCases) {
      const dome = buildLatticeDome(sweepCase.options, material);
      assertFiniteGeometry(dome);
      expectNoZeroAreaTriangles(dome, sweepCase.label);
    }
  }, 15000);
});
