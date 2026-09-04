import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCrossGableRoof,
  buildGableRoof,
  buildHipRoof,
} from '@/world/buildings/kit/RoofMassing';

function makeRoofMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 1 });
}

function countTriangles(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    total += child.geometry.index ? child.geometry.index.count / 3 : position.count / 3;
  });
  return total;
}

function hasNonFiniteGeometry(object: THREE.Object3D): boolean {
  let bad = false;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      if (!Number.isFinite(position.getX(index))
        || !Number.isFinite(position.getY(index))
        || !Number.isFinite(position.getZ(index))) {
        bad = true;
      }
    }
  });
  return bad;
}

function hasPlaneGeometry(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry.type === 'PlaneGeometry') found = true;
  });
  return found;
}

function sizeOf(object: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
}

function slopeGroups(object: THREE.Object3D): THREE.Group[] {
  const groups: THREE.Group[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Group && child.userData.roofRole === 'slope') groups.push(child);
  });
  return groups;
}

function allMeshMaterials(object: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && !Array.isArray(child.material)) materials.push(child.material);
  });
  return materials;
}

function namedChildren<T extends THREE.Object3D>(object: THREE.Object3D, pattern: RegExp): T[] {
  return object.children.filter((child): child is T => pattern.test(child.name));
}

function highestNumberedChild<T extends THREE.Object3D>(object: THREE.Object3D, prefix: string): T | undefined {
  return namedChildren<T>(object, new RegExp(`^${prefix}-\\d+$`))
    .sort((a, b) => Number(a.name.slice(prefix.length + 1)) - Number(b.name.slice(prefix.length + 1)))
    .at(-1);
}

function localMeshXExtent(object: THREE.Object3D): number {
  let minX = Infinity;
  let maxX = -Infinity;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      minX = Math.min(minX, position.getX(index));
      maxX = Math.max(maxX, position.getX(index));
    }
  });
  return Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0;
}

function countNamedDescendants(object: THREE.Object3D, pattern: RegExp): number {
  let count = 0;
  object.traverse((child) => {
    if (pattern.test(child.name)) count++;
  });
  return count;
}

function geometrySignature(object: THREE.Object3D): string {
  object.updateMatrixWorld(true);
  const rows: Array<{ name: string; vertices: number[] }> = [];
  const vertex = new THREE.Vector3();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const vertices: number[] = [];
    const position = child.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      vertices.push(
        Number(vertex.x.toFixed(4)),
        Number(vertex.y.toFixed(4)),
        Number(vertex.z.toFixed(4)),
      );
    }
    rows.push({ name: child.parent?.name ?? child.name, vertices });
  });

  return JSON.stringify(rows);
}

describe('RoofMassing', () => {
  it('buildGableRoof creates two shingled slopes with thick eaves, a ridge cap, and no flat roof planes', () => {
    const material = makeRoofMaterial();
    const roof = buildGableRoof(4, 8, 3.2, 0xCAFE_BABE, material);
    const slopes = slopeGroups(roof);

    expect(slopes).toHaveLength(2);
    slopes.forEach((slope) => {
      expect(slope.getObjectByName('shingle-surface')).toBeTruthy();
      expect(slope.getObjectByName('course-0')).toBeTruthy();
      expect(countTriangles(slope)).toBeGreaterThan(40);

      const eave = slope.getObjectByName('eave-trim');
      expect(eave).toBeTruthy();
      const eaveSize = sizeOf(eave!);
      expect(eaveSize.y).toBeGreaterThan(0.05);
      expect(eaveSize.z).toBeGreaterThan(0.03);
    });

    const ridgeCap = roof.getObjectByName('ridge-cap');
    expect(ridgeCap).toBeTruthy();
    expect(sizeOf(ridgeCap!).y).toBeGreaterThan(0.08);

    expect(hasPlaneGeometry(roof)).toBe(false);
    expect(hasNonFiniteGeometry(roof)).toBe(false);

    const materials = allMeshMaterials(roof);
    expect(materials.length).toBeGreaterThan(0);
    materials.forEach(meshMaterial => expect(meshMaterial).toBe(material));
  });

  it('buildHipRoof creates four tiled slopes with tapered hip-end faces, finite geometry, and deterministic output', () => {
    const material = makeRoofMaterial();
    const halfWidth = 3;
    const halfDepth = 6;
    const roofA = buildHipRoof(halfWidth, halfDepth, 2.6, 12345, material);
    const roofB = buildHipRoof(halfWidth, halfDepth, 2.6, 12345, material);
    const slopes = slopeGroups(roofA);
    const outerHalfWidth = halfWidth * 1.15;
    const outerHalfDepth = halfDepth * 1.15;
    const ridgeHalfLength = outerHalfDepth - outerHalfWidth;

    expect(slopes).toHaveLength(4);
    slopes.forEach((slope) => {
      expect(countTriangles(slope)).toBeGreaterThan(20);
      expect(slope.getObjectByName('course-0')).toBeTruthy();
    });

    const topWidths = slopes.map(slope => Number(slope.userData.topWidth));
    expect(topWidths.filter(width => width < 0.25)).toHaveLength(2);
    expect(topWidths.filter(width => width > 2)).toHaveLength(2);

    const eastSlope = roofA.getObjectByName('hip-slope-east')!;
    const eastFirstStrip = eastSlope.getObjectByName('strip-0');
    const eastLastStrip = highestNumberedChild<THREE.Group>(eastSlope, 'strip');
    expect(eastFirstStrip).toBeTruthy();
    expect(eastLastStrip).toBeTruthy();
    expect(countNamedDescendants(eastFirstStrip!, /^course-\d+$/)).toBeGreaterThan(0);
    expect(countNamedDescendants(eastLastStrip!, /^course-\d+$/)).toBeGreaterThan(0);
    const eastBaseWidth = localMeshXExtent(eastFirstStrip!);
    const eastTipWidth = localMeshXExtent(eastLastStrip!);
    expect(eastBaseWidth).toBeGreaterThan(outerHalfDepth * 2 * 0.95);
    expect(eastTipWidth).toBeLessThan(ridgeHalfLength * 2 * 1.1);
    expect(eastTipWidth).toBeLessThan(eastBaseWidth * 0.6);

    const frontSlope = roofA.getObjectByName('hip-slope-front')!;
    const frontFirstStrip = frontSlope.getObjectByName('strip-0');
    const frontLastStrip = highestNumberedChild<THREE.Group>(frontSlope, 'strip');
    expect(frontFirstStrip).toBeTruthy();
    expect(frontLastStrip).toBeTruthy();
    expect(countNamedDescendants(frontFirstStrip!, /^course-\d+$/)).toBeGreaterThan(0);
    expect(countNamedDescendants(frontLastStrip!, /^course-\d+$/)).toBeGreaterThan(0);
    const frontBaseWidth = localMeshXExtent(frontFirstStrip!);
    const frontTipWidth = localMeshXExtent(frontLastStrip!);
    expect(frontBaseWidth).toBeGreaterThan(outerHalfWidth * 2 * 0.95);
    expect(frontTipWidth).toBeLessThan(0.5);
    expect(frontTipWidth).toBeLessThan(frontBaseWidth * 0.1);

    const frontBox = new THREE.Box3().setFromObject(roofA.getObjectByName('hip-slope-front')!);
    const backBox = new THREE.Box3().setFromObject(roofA.getObjectByName('hip-slope-back')!);
    expect(frontBox.max.z).toBeGreaterThan(outerHalfDepth - 0.05);
    expect(frontBox.min.z).toBeLessThan(ridgeHalfLength + 0.2);
    expect(backBox.min.z).toBeLessThan(-outerHalfDepth + 0.05);
    expect(backBox.max.z).toBeGreaterThan(-ridgeHalfLength - 0.2);

    const box = new THREE.Box3().setFromObject(roofA);
    expect(box.max.y).toBeGreaterThan(2.2);
    expect(box.max.x).toBeGreaterThan(3);
    expect(box.min.x).toBeLessThan(-3);
    expect(box.max.z).toBeGreaterThan(6);
    expect(box.min.z).toBeLessThan(-6);

    expect(hasPlaneGeometry(roofA)).toBe(false);
    expect(hasNonFiniteGeometry(roofA)).toBe(false);
    expect(geometrySignature(roofA)).toBe(geometrySignature(roofB));
  });

  it('buildCrossGableRoof composes two perpendicular tiled gable volumes without falling back to flat planes', () => {
    const material = makeRoofMaterial();
    const gable = buildGableRoof(4, 8, 3.1, 77, material);
    const crossA = buildCrossGableRoof(4, 8, 3.1, 77, material);
    const crossB = buildCrossGableRoof(4, 8, 3.1, 77, material);

    expect(crossA.getObjectByName('cross-gable-wing')).toBeTruthy();
    expect(slopeGroups(crossA)).toHaveLength(4);
    expect(countTriangles(crossA)).toBeGreaterThan(countTriangles(gable));

    const gableBox = new THREE.Box3().setFromObject(gable);
    const crossBox = new THREE.Box3().setFromObject(crossA);
    expect(crossBox.max.x - crossBox.min.x).toBeGreaterThan(gableBox.max.x - gableBox.min.x);
    expect(crossBox.max.z - crossBox.min.z).toBeGreaterThanOrEqual(gableBox.max.z - gableBox.min.z);

    for (const volumeName of ['cross-gable-main', 'cross-gable-wing']) {
      const volume = crossA.getObjectByName(volumeName);
      expect(volume).toBeTruthy();
      const volumeSlopes = slopeGroups(volume!);
      expect(volumeSlopes).toHaveLength(2);
      volumeSlopes.forEach((slope) => {
        const surface = slope.getObjectByName('shingle-surface');
        expect(surface).toBeTruthy();
        const claimedCourseCount = Number(surface?.userData.courseCount);
        expect(claimedCourseCount).toBeGreaterThanOrEqual(2);
        expect(countNamedDescendants(surface!, /^course-\d+$/)).toBe(claimedCourseCount);
      });
      expect(countNamedDescendants(volume!, /^course-\d+$/)).toBeGreaterThanOrEqual(4);
    }

    expect(hasPlaneGeometry(crossA)).toBe(false);
    expect(hasNonFiniteGeometry(crossA)).toBe(false);
    expect(geometrySignature(crossA)).toBe(geometrySignature(crossB));
  });
});
