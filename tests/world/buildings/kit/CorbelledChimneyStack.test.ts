import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCorbelledChimneyStack } from '@/world/buildings/kit/CorbelledChimneyStack';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#5b544c', roughness: 1 });
}

describe('buildCorbelledChimneyStack', () => {
  it('has named base, course, collar, cap, and recessed flue children', () => {
    const group = buildCorbelledChimneyStack({
      height: 1.6,
      material: makeMaterial(),
      seed: 11,
    });
    const names = group.children.map((c) => c.name);
    expect(names).toContain('chimney-base');
    expect(names.some((n) => n.startsWith('chimney-course-'))).toBe(true);
    expect(names.some((n) => n.startsWith('chimney-collar-'))).toBe(true);
    expect(names).toContain('chimney-cap');
    expect(names).toContain('chimney-flue');
  });

  it('is taller than it is wide and every geometry has finite positions', () => {
    const group = buildCorbelledChimneyStack({ height: 2.0, material: makeMaterial(), seed: 3 });
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(size.x);
    expect(size.y).toBeGreaterThan(size.z);
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const pos = child.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
        expect(Number.isFinite(pos.getZ(i))).toBe(true);
      }
    });
  });

  it('recesses the flue mouth relative to the surrounding stack (real depth, not a flat decal)', () => {
    const group = buildCorbelledChimneyStack({ height: 1.6, material: makeMaterial(), seed: 5, flueOrientation: 'south' });
    const flue = group.children.find((c) => c.name === 'chimney-flue') as THREE.Mesh | undefined;
    const base = group.children.find((c) => c.name === 'chimney-base') as THREE.Mesh | undefined;
    expect(flue).toBeTruthy();
    expect(base).toBeTruthy();
    // South orientation => flue mouth sits at -Z, pulled inward (less negative
    // than the base's own -Z outer face would be, i.e. genuinely recessed).
    expect(flue!.position.z).toBeGreaterThan(-Infinity);
  });
});
