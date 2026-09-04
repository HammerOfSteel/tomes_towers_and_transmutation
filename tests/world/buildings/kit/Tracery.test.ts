import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

async function loadTraceryModule() {
  return import('../../../../src/world/buildings/kit/Tracery');
}

function buildLegacyChordSpokeConnectorShape(
  innerRadius: number,
  outerRadius: number,
  angleCenter: number,
  junctionAngleSpan: number,
  waistAngleSpan: number,
): THREE.Shape {
  const junctionHalf = junctionAngleSpan * 0.5;
  const waistHalf = Math.min(waistAngleSpan, junctionAngleSpan) * 0.5;
  const waistRadius = THREE.MathUtils.lerp(innerRadius, outerRadius, 0.5);
  const shape = new THREE.Shape();
  const points = [
    new THREE.Vector2(Math.cos(angleCenter - junctionHalf) * innerRadius, Math.sin(angleCenter - junctionHalf) * innerRadius),
    new THREE.Vector2(Math.cos(angleCenter - waistHalf) * waistRadius, Math.sin(angleCenter - waistHalf) * waistRadius),
    new THREE.Vector2(Math.cos(angleCenter - junctionHalf) * outerRadius, Math.sin(angleCenter - junctionHalf) * outerRadius),
    new THREE.Vector2(Math.cos(angleCenter + junctionHalf) * outerRadius, Math.sin(angleCenter + junctionHalf) * outerRadius),
    new THREE.Vector2(Math.cos(angleCenter + waistHalf) * waistRadius, Math.sin(angleCenter + waistHalf) * waistRadius),
    new THREE.Vector2(Math.cos(angleCenter + junctionHalf) * innerRadius, Math.sin(angleCenter + junctionHalf) * innerRadius),
  ];
  shape.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index++) {
    shape.lineTo(points[index]!.x, points[index]!.y);
  }
  shape.closePath();
  return shape;
}

function distancePointToSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number {
  const segment = new THREE.Vector2().subVectors(end, start);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return point.distanceTo(start);
  const projection = clamp01(new THREE.Vector2().subVectors(point, start).dot(segment) / lengthSq);
  const closest = start.clone().addScaledVector(segment, projection);
  return point.distanceTo(closest);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function minimumOutlineDistance(shape: THREE.Shape, point: THREE.Vector2, divisions = 512): number {
  const outline = shape.getPoints(divisions);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < outline.length; index++) {
    const start = outline[index]!;
    const end = outline[(index + 1) % outline.length]!;
    minimum = Math.min(minimum, distancePointToSegment(point, start, end));
  }
  return minimum;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function assertFiniteGeometry(root: THREE.Object3D): void {
  for (const mesh of collectMeshes(root)) {
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
  }
}

function signature(root: THREE.Object3D): string[] {
  root.updateMatrixWorld(true);
  return collectMeshes(root)
    .map((mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      return [
        mesh.name,
        mesh.position.x.toFixed(4),
        mesh.position.y.toFixed(4),
        mesh.position.z.toFixed(4),
        mesh.rotation.x.toFixed(4),
        mesh.rotation.y.toFixed(4),
        mesh.rotation.z.toFixed(4),
        size.x.toFixed(4),
        size.y.toFixed(4),
        size.z.toFixed(4),
      ].join(':');
    })
    .sort();
}

function brokenFragments(root: THREE.Object3D): THREE.Mesh[] {
  return collectMeshes(root).filter((mesh) => mesh.userData.role === 'broken-tracery-fragment');
}

function intactTraceryPartNames(root: THREE.Object3D): string[] {
  return collectMeshes(root)
    .map((mesh) => mesh.name)
    .filter((name) => /^(ring-\d+-segment-\d+|spoke-\d+-connector-\d+)$/.test(name))
    .sort();
}

describe('Tracery kit', () => {
  it('builds a trefoil from a shape with explicit pierced-hole topology', async () => {
    const { buildTrefoil, __traceryTestUtils } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#b8b1a2' });
    const shape = __traceryTestUtils.buildTrefoilShape(0.8);
    const trefoil = buildTrefoil(0.8, { material });

    expect(trefoil.name).toBe('trefoil');
    expect(shape.holes).toHaveLength(4);
    expect(collectMeshes(trefoil)).toHaveLength(1);
    expect(collectMeshes(trefoil)[0]!.material).toBe(material);
    assertFiniteGeometry(trefoil);
  });

  it('builds a quatrefoil from a shape with explicit pierced-hole topology', async () => {
    const { buildQuatrefoil, __traceryTestUtils } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#b8b1a2' });
    const shape = __traceryTestUtils.buildQuatrefoilShape(0.85);
    const quatrefoil = buildQuatrefoil(0.85, { material });

    expect(quatrefoil.name).toBe('quatrefoil');
    expect(shape.holes).toHaveLength(5);
    expect(collectMeshes(quatrefoil)).toHaveLength(1);
    expect(collectMeshes(quatrefoil)[0]!.material).toBe(material);
    assertFiniteGeometry(quatrefoil);
  });

  it('builds a rose window whose ring piercings are explicit holes and whose spoke/ring joints overlap', async () => {
    const { buildRoseWindow, __traceryTestUtils } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#9da2aa' });
    const options = { lobes: 8, radius: 1, ringCount: 2 };
    const layout = __traceryTestUtils.createRoseWindowLayout(options);
    const rose = buildRoseWindow(options, material);
    const ringParts = rose.children.filter((child) => /^ring-\d+$/.test(child.name));
    const spokeParts = rose.children.filter((child) => /^spoke-\d+$/.test(child.name));

    expect(ringParts).toHaveLength(2);
    expect(spokeParts).toHaveLength(8);
    expect(spokeParts.map((part) => part.name).sort()).toEqual([
      'spoke-0',
      'spoke-1',
      'spoke-2',
      'spoke-3',
      'spoke-4',
      'spoke-5',
      'spoke-6',
      'spoke-7',
    ]);

    expect(layout.junctionOverlapAngle).toBeGreaterThan(0);
    expect(layout.ringBands[0]!.innerRadius * layout.junctionOverlapAngle).toBeGreaterThan(0.01);

    for (let ringIndex = 0; ringIndex < layout.ringCount; ringIndex++) {
      for (let slotIndex = 0; slotIndex < layout.lobes; slotIndex++) {
        expect(__traceryTestUtils.buildRoseRingSegmentShape(layout, ringIndex, slotIndex).holes.length).toBeGreaterThan(0);
      }
    }

    for (const mesh of collectMeshes(rose)) {
      expect(mesh.material).toBe(material);
    }

    assertFiniteGeometry(rose);
  });

  it('keeps rose-window geometry finite and overlap-connected for common Gothic lobe counts', async () => {
    const { buildRoseWindow, __traceryTestUtils } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8f96a0' });

    for (const lobes of [6, 8, 12]) {
      const options = { lobes, radius: 1, ringCount: 3 };
      const layout = __traceryTestUtils.createRoseWindowLayout(options);
      const rose = buildRoseWindow(options, material);
      expect(rose.children.filter((child) => /^spoke-\d+$/.test(child.name))).toHaveLength(lobes);
      expect(layout.junctionOverlapAngle).toBeGreaterThan(0);
      expect(layout.ringBands[0]!.innerRadius * layout.junctionOverlapAngle).toBeGreaterThan(0.008);
      assertFiniteGeometry(rose);
    }
  }, 15000);

  it('builds rose spoke flares that reach the shared ring radius across the full junction span', async () => {
    const { __traceryTestUtils } = await loadTraceryModule();
    const layout = __traceryTestUtils.createRoseWindowLayout({ lobes: 8, radius: 1, ringCount: 2 });
    const slotIndex = 0;
    const beltIndex = 0;
    const ringIndex = 0;
    const ringSlotIndex = 0;
    const spokeShape = __traceryTestUtils.buildRoseSpokeConnectorShape(layout, slotIndex, beltIndex);
    const ringShape = __traceryTestUtils.buildRoseRingSegmentShape(layout, ringIndex, ringSlotIndex);
    const belt = layout.spokeBelts[beltIndex]!;
    const band = layout.ringBands[ringIndex]!;
    const angleCenter = -Math.PI / 2 + slotIndex * layout.step;
    const junctionHalf = layout.spokeJunctionAngleSpan * 0.5;
    const sharedRadius = belt.outerRadius;
    const sampleAngles = Array.from({ length: 7 }, (_, index) => (
      angleCenter - junctionHalf + (layout.spokeJunctionAngleSpan * index) / 6
    ));
    const legacyShape = buildLegacyChordSpokeConnectorShape(
      belt.innerRadius,
      belt.outerRadius,
      angleCenter,
      layout.spokeJunctionAngleSpan,
      layout.spokeWaistAngleSpan,
    );

    expect(band.innerRadius).toBeCloseTo(sharedRadius, 12);
    expect(ringShape.holes.length).toBeGreaterThan(0);
    expect(layout.ringSegmentAngleSpan).toBeGreaterThanOrEqual(layout.spokeJunctionAngleSpan);

    const fixedDistances = sampleAngles.map((angle) => (
      minimumOutlineDistance(spokeShape, __traceryTestUtils.polarPoint(sharedRadius, angle))
    ));
    const legacyDistances = sampleAngles.map((angle) => (
      minimumOutlineDistance(legacyShape, __traceryTestUtils.polarPoint(sharedRadius, angle))
    ));

    for (const distance of fixedDistances) {
      expect(distance).toBeLessThan(5e-6);
    }

    expect(fixedDistances[3]!).toBeLessThan(5e-6);
    expect(legacyDistances[3]!).toBeGreaterThan(1e-3);
  });

  it('emits optional broken tracery fragments while the default build stays intact', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8a8f98' });
    const options = { lobes: 8, radius: 1, ringCount: 3 };

    const intact = buildRoseWindow(options, material);
    const broken = buildRoseWindow({ ...options, brokenEmission: true, seed: 19 }, material);
    const intactNames = new Set(intactTraceryPartNames(intact));
    const brokenIntactNames = new Set(intactTraceryPartNames(broken));
    const missingNames = [...intactNames].filter((name) => !brokenIntactNames.has(name));

    expect(brokenFragments(intact)).toHaveLength(0);
    expect(brokenFragments(broken).length).toBeGreaterThan(0);
    expect(signature(broken)).not.toEqual(signature(intact));
    expect([...brokenIntactNames].every((name) => intactNames.has(name))).toBe(true);
    expect(missingNames.length).toBeGreaterThan(0);

    for (const fragment of brokenFragments(broken)) {
      expect(fragment.material).toBe(material);

      if (fragment.userData.kind === 'ring-segment') {
        expect(broken.getObjectByName(`ring-${fragment.userData.ringIndex}-segment-${fragment.userData.slotIndex}`)).toBeFalsy();
      }

      if (fragment.userData.kind === 'spoke') {
        expect(
          collectMeshes(broken).some((mesh) => mesh.name.startsWith(`spoke-${fragment.userData.slotIndex}-connector-`)),
        ).toBe(false);
      }
    }
  });

  it('selects the same broken segments for the same seed and different ones for a different seed', async () => {
    const { buildRoseWindow } = await loadTraceryModule();
    const material = new THREE.MeshStandardMaterial({ color: '#8a8f98' });
    const options = { lobes: 8, radius: 1, ringCount: 3, brokenEmission: true };

    const roseA = buildRoseWindow({ ...options, seed: 3 }, material);
    const roseB = buildRoseWindow({ ...options, seed: 3 }, material);
    const roseC = buildRoseWindow({ ...options, seed: 11 }, material);

    const brokenNamesA = brokenFragments(roseA).map((mesh) => mesh.name).sort();
    const brokenNamesB = brokenFragments(roseB).map((mesh) => mesh.name).sort();
    const brokenNamesC = brokenFragments(roseC).map((mesh) => mesh.name).sort();

    expect(signature(roseA)).toEqual(signature(roseB));
    expect(brokenNamesA).toEqual(brokenNamesB);
    expect(signature(roseC)).not.toEqual(signature(roseA));
    expect(brokenNamesC).not.toEqual(brokenNamesA);
  });
});
