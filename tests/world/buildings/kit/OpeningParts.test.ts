import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assertDepthSeparated, depthFor } from '@/world/buildings/kit/DepthLadder';
import { buildWindowOpening } from '@/world/buildings/kit/OpeningParts';

function makeMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#9aa0a8' }),
    recess: new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.95 }),
    glazing: new THREE.MeshStandardMaterial({ color: '#1a2a1a', roughness: 0.85, emissive: '#0b120b' }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 1 }),
  };
}

function requireChild(group: THREE.Group, name: string): THREE.Object3D {
  const child = group.getObjectByName(name);
  expect(child, `${name} should exist`).toBeTruthy();
  return child!;
}

describe('buildWindowOpening', () => {
  it('returns the five named window pieces at separated depths with opaque set-back glazing', () => {
    const wallZ = 2;
    const opening = buildWindowOpening({
      width: 0.72,
      straightHeight: 1.08,
      pointHeight: 0.42,
      recessDepth: 0.16,
      frameWidth: 0.09,
      frameProud: 0.05,
      wallZ,
      stoneMaterial: makeMaterials().stone,
      recessMaterial: makeMaterials().recess,
      glazingMaterial: makeMaterials().glazing,
    });

    const recess = requireChild(opening, 'recess');
    const surround = requireChild(opening, 'surround');
    const sill = requireChild(opening, 'sill');
    const division = requireChild(opening, 'division');
    const glazing = requireChild(opening, 'glazing');

    // The cavity piece represents the reveal depth, so it should anchor at the
    // reveal ladder role instead of the shallower decorative recess role.
    expect(recess.position.z - wallZ).toBeLessThanOrEqual(depthFor('REVEAL'));
    expect(surround.position.z - wallZ).toBeGreaterThanOrEqual(depthFor('FRAME'));
    expect(sill.position.z - surround.position.z).toBeGreaterThanOrEqual(0.03);
    expect(sill.position.z - surround.position.z).toBeLessThanOrEqual(0.06);

    const divisionBox = new THREE.Box3().setFromObject(division);
    expect(divisionBox.max.y - divisionBox.min.y).toBeGreaterThan(0.7);

    expect(glazing.position.z - wallZ).toBeLessThanOrEqual(depthFor('GLAZING'));
    opening.updateMatrixWorld(true);
    glazing.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          expect(material.transparent ?? false).toBe(false);
        }
      }
    });

    assertDepthSeparated([
      recess.position.z - wallZ,
      surround.position.z - wallZ,
      sill.position.z - wallZ,
      division.position.z - wallZ,
      glazing.position.z - wallZ,
    ]);
  });
});
