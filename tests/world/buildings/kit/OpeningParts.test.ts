import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assertDepthSeparated, depthFor } from '@/world/buildings/kit/DepthLadder';
import { buildWindowOpening, buildDoorOpening } from '@/world/buildings/kit/OpeningParts';

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

describe('buildDoorOpening', () => {
  it('returns a recessed planked door with a threshold and strap bars at glazing depth', () => {
    const wallZ = 2.4;
    const materials = makeMaterials();
    const opening = buildDoorOpening({
      width: 0.9,
      straightHeight: 1.55,
      pointHeight: 0.48,
      recessDepth: 0.18,
      frameWidth: 0.12,
      frameProud: 0.06,
      wallZ,
      stoneMaterial: materials.stone,
      recessMaterial: materials.recess,
      woodMaterial: materials.wood,
    });

    const recess = requireChild(opening, 'recess');
    const surround = requireChild(opening, 'surround');
    const threshold = requireChild(opening, 'threshold');
    const doorLeaf = requireChild(opening, 'door-leaf');

    expect(recess.position.z - wallZ).toBeLessThanOrEqual(depthFor('REVEAL'));
    expect(surround.position.z - wallZ).toBeGreaterThanOrEqual(depthFor('FRAME'));
    expect(threshold.position.z - surround.position.z).toBeGreaterThanOrEqual(0.03);
    expect(threshold.position.z - surround.position.z).toBeLessThanOrEqual(0.06);

    // Doors occupy the set-back "glazing" rung in the depth ladder: they are
    // the closing leaf that lives behind the reveal rather than a glass pane.
    expect(doorLeaf.position.z - wallZ).toBeLessThanOrEqual(depthFor('GLAZING'));

    const planks = doorLeaf.children.filter((child) => child.name.startsWith('plank-'));
    const straps = doorLeaf.children.filter((child) => child.name.startsWith('strap-'));
    expect(planks.length).toBeGreaterThanOrEqual(5);
    expect(planks.length).toBeLessThanOrEqual(7);
    expect(straps.length).toBeGreaterThanOrEqual(3);
    expect(straps.length).toBeLessThanOrEqual(5);

    const plankBoxes = planks
      .map((plank) => new THREE.Box3().setFromObject(plank))
      .sort((a, b) => a.min.x - b.min.x);
    for (let i = 1; i < plankBoxes.length; i++) {
      expect(plankBoxes[i]!.min.x).toBeGreaterThan(plankBoxes[i - 1]!.max.x);
    }

    for (const strap of straps) {
      const strapBox = new THREE.Box3().setFromObject(strap);
      expect(strapBox.max.x - strapBox.min.x).toBeGreaterThan(0.45);
      expect(strapBox.max.y - strapBox.min.y).toBeLessThan(0.12);
    }

    const doorLeafBox = new THREE.Box3().setFromObject(doorLeaf);
    expect(doorLeafBox.max.y).toBeLessThanOrEqual(1.55 + 1e-6);
  });
});
