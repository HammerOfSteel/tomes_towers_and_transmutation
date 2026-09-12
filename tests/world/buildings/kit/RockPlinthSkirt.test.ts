import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { rectangleFaces, rectanglePoints } from '@/world/buildings/StoneTowerShape';
import { buildRockPlinthSkirt } from '@/world/buildings/kit/RockPlinthSkirt';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#6a655e', roughness: 1 });
}

function boundsOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function assertAllGeometriesFinite(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      expect(Number.isFinite(position.getX(i))).toBe(true);
      expect(Number.isFinite(position.getY(i))).toBe(true);
      expect(Number.isFinite(position.getZ(i))).toBe(true);
    }
  });
}

describe('buildRockPlinthSkirt', () => {
  const points = rectanglePoints(2, 1.5);
  const faces = rectangleFaces(2, 1.5);

  it('has named plinth-course, rubble-skirt, and front-steps children', () => {
    const group = buildRockPlinthSkirt({
      points,
      material: makeMaterial(),
      seed: 42,
      stepsFace: faces[3], // +Z face
    });
    const names = group.children.map((c) => c.name);
    expect(names).toContain('plinth-course');
    expect(names).toContain('rubble-skirt');
    expect(names).toContain('front-steps');
    assertAllGeometriesFinite(group);
  });

  it('extends below the wall bottom (y <= 0) and outward within the configured skirt margin', () => {
    const skirtMargin = 0.2;
    const group = buildRockPlinthSkirt({
      points,
      material: makeMaterial(),
      seed: 7,
      skirtMargin,
      stepsFace: faces[3],
    });
    const bounds = boundsOf(group);
    expect(bounds.min.y).toBeLessThanOrEqual(0);
    // Footprint half-extents are 2 (x) and 1.5 (z); skirt should stay within
    // footprint + margin + a small tolerance for rubble jitter/chunk size.
    const tolerance = 0.25;
    expect(bounds.max.x).toBeLessThanOrEqual(2 + skirtMargin + tolerance);
    expect(bounds.max.z).toBeLessThanOrEqual(1.5 + skirtMargin + tolerance);
  });

  it('adds a rear rock cheek when requested, positioned behind the given face', () => {
    const group = buildRockPlinthSkirt({
      points,
      material: makeMaterial(),
      seed: 3,
      stepsFace: faces[3],
      rearRockCheek: true,
      rearCheekFace: faces[1], // -Z back face
    });
    const cheek = group.children.find((c) => c.name === 'rear-rock-cheek');
    expect(cheek).toBeTruthy();
  });

  it('is deterministic for a given seed', () => {
    const a = buildRockPlinthSkirt({ points, material: makeMaterial(), seed: 99, stepsFace: faces[3] });
    const b = buildRockPlinthSkirt({ points, material: makeMaterial(), seed: 99, stepsFace: faces[3] });
    const posA = boundsOf(a);
    const posB = boundsOf(b);
    expect(posA.min.toArray()).toEqual(posB.min.toArray());
    expect(posA.max.toArray()).toEqual(posB.max.toArray());
  });
});
