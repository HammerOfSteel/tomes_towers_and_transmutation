import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCurledConeShingleRoof } from '@/world/buildings/kit/ShingleSurface';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#8a4a2a' });
}

function assertFiniteGeometry(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
}

function countMeshes(g: THREE.Object3D): number {
  let n = 0;
  g.traverse((o) => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

describe('buildCurledConeShingleRoof', () => {
  it('builds multiple discrete tile courses, not a single smooth cone mesh', () => {
    const roof = buildCurledConeShingleRoof(1.5, 3, 7, makeMaterial());
    const courses = roof.children.filter((c) => c.name.startsWith('cone-course-'));
    expect(courses.length).toBeGreaterThanOrEqual(4);
    // Each course should itself contain real tile geometry (merged into
    // one mesh per course, but that mesh must carry many triangles --
    // proof it's a field of small tiles, not one flat ring).
    for (const course of courses) {
      const mesh = course.children[0] as THREE.Mesh;
      expect(mesh).toBeInstanceOf(THREE.Mesh);
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(pos.count).toBeGreaterThan(30);
    }
    assertFiniteGeometry(roof);
  });

  it('never uses a single ConeGeometry or LatheGeometry for the roof body', () => {
    const roof = buildCurledConeShingleRoof(1.5, 3, 7, makeMaterial());
    roof.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith('cone-tile')) {
        expect(o.geometry).not.toBeInstanceOf(THREE.ConeGeometry);
        expect(o.geometry).not.toBeInstanceOf(THREE.LatheGeometry);
      }
    });
  });

  it('shrinks course radius toward the apex without ever reaching zero (a small flat tip, not a pinprick)', () => {
    const roof = buildCurledConeShingleRoof(2, 4, 3, makeMaterial(), { apexRadiusFrac: 0.08 });
    const first = roof.getObjectByName('cone-course-0') as THREE.Group;
    const last = roof.children.filter((c) => c.name.startsWith('cone-course-')).at(-1) as THREE.Group;
    const firstBox = new THREE.Box3().setFromObject(first);
    const lastBox = new THREE.Box3().setFromObject(last);
    const firstSpan = firstBox.max.x - firstBox.min.x;
    const lastSpan = lastBox.max.x - lastBox.min.x;
    expect(lastSpan).toBeLessThan(firstSpan);
    expect(lastSpan).toBeGreaterThan(0.05); // never collapses to a literal point
  });

  it('curls the apex sideways relative to the base center when curl is set, growing quadratically with height', () => {
    const straight = buildCurledConeShingleRoof(1.5, 4, 5, makeMaterial());
    const curled = buildCurledConeShingleRoof(1.5, 4, 5, makeMaterial(), { curl: { x: 1.2 } });
    const straightCourses = straight.children.filter((c) => c.name.startsWith('cone-course-'));
    const curledCourses = curled.children.filter((c) => c.name.startsWith('cone-course-'));
    const straightTopBox = new THREE.Box3().setFromObject(straightCourses.at(-1)!);
    const curledTopBox = new THREE.Box3().setFromObject(curledCourses.at(-1)!);
    const straightTopCenterX = (straightTopBox.min.x + straightTopBox.max.x) / 2;
    const curledTopCenterX = (curledTopBox.min.x + curledTopBox.max.x) / 2;
    expect(curledTopCenterX).toBeGreaterThan(straightTopCenterX + 0.3);
  });

  it('adds a thick eave fascia ring at the base by default, and omits it when disabled', () => {
    const withEave = buildCurledConeShingleRoof(1.5, 3, 4, makeMaterial());
    const withoutEave = buildCurledConeShingleRoof(1.5, 3, 4, makeMaterial(), { trim: { eave: false } });
    expect(withEave.getObjectByName('cone-eave-trim')).toBeTruthy();
    expect(withoutEave.getObjectByName('cone-eave-trim')).toBeFalsy();
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const a = buildCurledConeShingleRoof(1.5, 3, 42, makeMaterial());
    const b = buildCurledConeShingleRoof(1.5, 3, 42, makeMaterial());
    const c = buildCurledConeShingleRoof(1.5, 3, 43, makeMaterial());
    expect(countMeshes(a)).toBe(countMeshes(b));
    const meshA = a.getObjectByName('cone-course-0')!.children[0] as THREE.Mesh;
    const meshC = c.getObjectByName('cone-course-0')!.children[0] as THREE.Mesh;
    const posA = meshA.geometry.getAttribute('position');
    const posC = meshC.geometry.getAttribute('position');
    let sumA = 0, sumC = 0;
    for (let i = 0; i < posA.count; i++) sumA += posA.getX(i);
    for (let i = 0; i < posC.count; i++) sumC += posC.getX(i);
    expect(sumA).not.toBe(sumC);
  });

  it('supports the fishscale, diamond, and rectangular silhouettes without throwing', () => {
    for (const silhouette of ['fishscale', 'diamond', 'rectangular'] as const) {
      const roof = buildCurledConeShingleRoof(1.2, 2.5, 1, makeMaterial(), { silhouette });
      expect(countMeshes(roof)).toBeGreaterThan(0);
      assertFiniteGeometry(roof);
    }
  });
});
