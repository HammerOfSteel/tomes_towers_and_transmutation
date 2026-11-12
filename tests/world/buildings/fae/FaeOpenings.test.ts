import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildFaeWindow,
  buildFaeDoor,
  buildFaeOculusWindow,
  buildFaePetalWindow,
  type FaeOpeningPalette,
} from '@/world/buildings/fae/FaeOpenings';
import { depthFor } from '@/world/buildings/kit/DepthLadder';

function makePalette(): FaeOpeningPalette {
  return {
    bark: new THREE.MeshStandardMaterial({ color: '#7a5a3a' }),
    glow: new THREE.MeshStandardMaterial({ color: '#3a2408', emissive: '#ffcf6e', emissiveIntensity: 1.1 }),
    petal: new THREE.MeshStandardMaterial({ color: '#f0d8f8' }),
    door: new THREE.MeshStandardMaterial({ color: '#9060a8' }),
  };
}

function requireChild(group: THREE.Group, name: string): THREE.Object3D {
  const child = group.getObjectByName(name);
  expect(child, `${name} should exist`).toBeTruthy();
  return child!;
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

describe('buildFaeWindow — oversized petal-lancet five-piece opening', () => {
  it('produces recess/surround/sill/division/glazing at separated depths', () => {
    const wallZ = 1.0;
    const opening = buildFaeWindow({ width: 1.2, height: 1.8, wallZ, palette: makePalette() });
    const recess = requireChild(opening, 'recess');
    const surround = requireChild(opening, 'surround');
    requireChild(opening, 'sill');
    requireChild(opening, 'division');
    const glazing = requireChild(opening, 'glazing');
    expect(recess.position.z - wallZ).toBeLessThanOrEqual(depthFor('REVEAL') + 1e-9);
    expect(surround.position.z - wallZ).toBeGreaterThanOrEqual(depthFor('FRAME'));
    expect(glazing.position.z - wallZ).toBeLessThanOrEqual(depthFor('GLAZING'));
    assertFiniteGeometry(opening);
  });

  it('uses a tall lancet profile (pointed top well above a plain rectangle)', () => {
    const opening = buildFaeWindow({ width: 1.0, height: 1.6, wallZ: 0, palette: makePalette() });
    opening.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(opening);
    const height = box.max.y - box.min.y;
    expect(height / 1.0).toBeGreaterThan(1.3);
  });

  it('glows warmly (glazing material carries emissive intensity)', () => {
    const opening = buildFaeWindow({ width: 1.0, height: 1.6, wallZ: 0, palette: makePalette() });
    const glazing = requireChild(opening, 'glazing') as THREE.Group;
    let sawEmissive = false;
    glazing.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        if (o.material.emissiveIntensity > 0) sawEmissive = true;
      }
    });
    expect(sawEmissive).toBe(true);
  });
});

describe('buildFaeDoor — oversized glowing petal-lancet door', () => {
  it('produces recess/surround/threshold/door-leaf with planks', () => {
    const opening = buildFaeDoor({ width: 1.4, height: 2.4, wallZ: 1.0, palette: makePalette() });
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'threshold');
    const leaf = requireChild(opening, 'door-leaf') as THREE.Group;
    const planks = leaf.children.filter((c) => c.name.startsWith('plank-'));
    expect(planks.length).toBeGreaterThanOrEqual(5);
    assertFiniteGeometry(opening);
  });
});

describe('buildFaeOculusWindow — round moon window', () => {
  it('produces a round five-piece opening with a twig-cross division', () => {
    const opening = buildFaeOculusWindow({ diameter: 0.9, wallZ: 0.5, palette: makePalette() });
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'sill');
    requireChild(opening, 'division');
    requireChild(opening, 'glazing');
    expect(opening.userData.openingShape).toBe('round');
    assertFiniteGeometry(opening);
  });
});

describe('buildFaePetalWindow — petal-garland overlay', () => {
  it('wraps the mandatory opening and adds a garland of proud petal blocks without replacing any required part', () => {
    const window = buildFaePetalWindow({ width: 1.0, height: 1.6, wallZ: 0, palette: makePalette() });
    const opening = requireChild(window, 'opening') as THREE.Group;
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'sill');
    requireChild(opening, 'division');
    requireChild(opening, 'glazing');
    const petals = window.children.filter((c) => c.name.startsWith('petal-'));
    expect(petals.length).toBeGreaterThanOrEqual(5);
    assertFiniteGeometry(window);
  });
});
