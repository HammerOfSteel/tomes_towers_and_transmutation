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

    expect(hasPlaneGeometry(crossA)).toBe(false);
    expect(hasNonFiniteGeometry(crossA)).toBe(false);
    expect(geometrySignature(crossA)).toBe(geometrySignature(crossB));
  });
});
