import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDoorOpening, buildWindowOpening } from '@/world/buildings/kit/OpeningParts';
import { depthFor } from '@/world/buildings/kit/DepthLadder';
import { createSlimeMaterialSet } from '@/world/buildings/slime/SlimeMaterials';
import {
  applySlimeDoorOverlay,
  applySlimeWindowOverlay,
} from '@/world/buildings/slime/SlimeOpeningOverlay';

function makeHostMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#9aa0a8' }),
    recess: new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.95 }),
    glazing: new THREE.MeshStandardMaterial({ color: '#1a2a1a', roughness: 0.85, emissive: '#0b120b' }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a3520', roughness: 1 }),
  };
}

function requireObject<T extends THREE.Object3D = THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  expect(object, `${name} should exist`).toBeTruthy();
  return object as T;
}

function clonePositions(root: THREE.Object3D, names: string[]): Record<string, THREE.Vector3> {
  return Object.fromEntries(names.map(name => [name, requireObject(root, name).position.clone()]));
}

function expectSamePositions(root: THREE.Object3D, before: Record<string, THREE.Vector3>): void {
  for (const [name, position] of Object.entries(before)) {
    expect(requireObject(root, name).position.toArray()).toEqual(position.toArray());
  }
}

function boxOf(object: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(object);
}

function areaXY(object: THREE.Object3D): number {
  const box = boxOf(object);
  return (box.max.x - box.min.x) * (box.max.y - box.min.y);
}

function overlapAreaXY(left: THREE.Box3, right: THREE.Box3): number {
  const minX = Math.max(left.min.x, right.min.x);
  const maxX = Math.min(left.max.x, right.max.x);
  const minY = Math.max(left.min.y, right.min.y);
  const maxY = Math.min(left.max.y, right.max.y);
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function expectDescendantsNotProuderThan(root: THREE.Object3D, referenceBox: THREE.Box3): void {
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = boxOf(object);
    expect(box.max.z).toBeLessThanOrEqual(referenceBox.max.z + 1e-3);
  });
}

function slimeMaterials() {
  return createSlimeMaterialSet('mint_green');
}

describe('SlimeOpeningOverlay', () => {
  it('replaces the host glazing with a gel lens while keeping the structural window pieces fixed', () => {
    const host = buildWindowOpening({
      width: 0.72,
      straightHeight: 1.08,
      pointHeight: 0.42,
      recessDepth: 0.16,
      frameWidth: 0.09,
      frameProud: 0.05,
      wallZ: 0,
      stoneMaterial: makeHostMaterials().stone,
      recessMaterial: makeHostMaterials().recess,
      glazingMaterial: makeHostMaterials().glazing,
      divisionStyle: 'cross',
    });
    const before = clonePositions(host, ['recess', 'surround', 'sill', 'division']);
    const glazing = requireObject<THREE.Group>(host, 'glazing');
    const glazingPosition = glazing.position.clone();
    const glazingBox = boxOf(glazing);

    const result = applySlimeWindowOverlay(host, {
      seed: 37,
      materials: slimeMaterials(),
      width: 0.72,
      straightHeight: 1.08,
      pointHeight: 0.42,
      cloggingRatio: 0.42,
      maxCloggingRatio: 0.35,
      addLip: true,
      addDrip: true,
    });

    expect(result).toBe(host);
    for (const name of ['recess', 'surround', 'sill', 'division']) {
      expect(requireObject(result, name)).toBeTruthy();
    }
    expect(result.getObjectByName('glazing')).toBeFalsy();

    const lens = requireObject<THREE.Group>(result, 'slime-window-lens');
    expect(requireObject(lens, 'gel-lens-pane')).toBeTruthy();
    expect(requireObject(lens, 'gel-lens-rim')).toBeTruthy();
    expect(lens.position.z).toBeCloseTo(glazingPosition.z, 6);
    expect(lens.position.z).toBeLessThanOrEqual(depthFor('GLAZING'));
    expectDescendantsNotProuderThan(lens, glazingBox);

    const lip = requireObject(result, 'slime-window-lip');
    const drip = requireObject(result, 'slime-window-drip');
    expect(overlapAreaXY(boxOf(lip), glazingBox)).toBe(0);
    expect(overlapAreaXY(boxOf(drip), glazingBox)).toBe(0);
    expectSamePositions(result, before);
  });

  it('keeps the window gel lens within the configured clogging cap measured against the clear opening area', () => {
    const host = buildWindowOpening({
      width: 0.72,
      straightHeight: 1.08,
      pointHeight: 0.42,
      recessDepth: 0.16,
      frameWidth: 0.09,
      frameProud: 0.05,
      wallZ: 0,
      stoneMaterial: makeHostMaterials().stone,
      recessMaterial: makeHostMaterials().recess,
      glazingMaterial: makeHostMaterials().glazing,
    });
    const glazing = requireObject(host, 'glazing');
    const clearArea = areaXY(glazing);

    applySlimeWindowOverlay(host, {
      seed: 41,
      materials: slimeMaterials(),
      width: 0.72,
      straightHeight: 1.08,
      pointHeight: 0.42,
      cloggingRatio: 0.55,
      maxCloggingRatio: 0.35,
      addLip: false,
      addDrip: false,
    });

    const lensArea = areaXY(requireObject(host, 'slime-window-lens'));
    expect(lensArea).toBeLessThanOrEqual(clearArea * 0.35 + 1e-3);
  });

  it('replaces the host door leaf with a membrane face while keeping the structural door pieces fixed', () => {
    const host = buildDoorOpening({
      width: 0.9,
      straightHeight: 1.55,
      pointHeight: 0.48,
      recessDepth: 0.18,
      frameWidth: 0.12,
      frameProud: 0.06,
      wallZ: 0,
      stoneMaterial: makeHostMaterials().stone,
      recessMaterial: makeHostMaterials().recess,
      woodMaterial: makeHostMaterials().wood,
    });
    const before = clonePositions(host, ['recess', 'surround', 'threshold']);
    const doorLeaf = requireObject<THREE.Group>(host, 'door-leaf');
    const doorLeafPosition = doorLeaf.position.clone();
    const doorLeafBox = boxOf(doorLeaf);

    const result = applySlimeDoorOverlay(host, {
      seed: 53,
      materials: slimeMaterials(),
      width: 0.9,
      straightHeight: 1.55,
      pointHeight: 0.48,
      cloggingRatio: 0.5,
      maxCloggingRatio: 0.3,
      addLip: true,
      addDrip: true,
    });

    expect(result).toBe(host);
    for (const name of ['recess', 'surround', 'threshold']) {
      expect(requireObject(result, name)).toBeTruthy();
    }
    expect(result.getObjectByName('door-leaf')).toBeFalsy();

    const membrane = requireObject<THREE.Group>(result, 'slime-door-membrane');
    expect(requireObject(membrane, 'membrane-panel')).toBeTruthy();
    expect(requireObject(membrane, 'membrane-rim')).toBeTruthy();
    expect(membrane.position.z).toBeCloseTo(doorLeafPosition.z, 6);
    expect(membrane.position.z).toBeLessThanOrEqual(depthFor('GLAZING'));
    expectDescendantsNotProuderThan(membrane, doorLeafBox);

    const lip = requireObject(result, 'slime-door-lip');
    const drip = requireObject(result, 'slime-door-drip');
    expect(overlapAreaXY(boxOf(lip), doorLeafBox)).toBe(0);
    expect(overlapAreaXY(boxOf(drip), doorLeafBox)).toBe(0);
    expectSamePositions(result, before);
  });

  it('keeps the door membrane within the configured clogging cap measured against the host door face area', () => {
    const host = buildDoorOpening({
      width: 0.9,
      straightHeight: 1.55,
      pointHeight: 0.48,
      recessDepth: 0.18,
      frameWidth: 0.12,
      frameProud: 0.06,
      wallZ: 0,
      stoneMaterial: makeHostMaterials().stone,
      recessMaterial: makeHostMaterials().recess,
      woodMaterial: makeHostMaterials().wood,
    });
    const doorLeaf = requireObject(host, 'door-leaf');
    const clearArea = areaXY(doorLeaf);

    applySlimeDoorOverlay(host, {
      seed: 59,
      materials: slimeMaterials(),
      width: 0.9,
      straightHeight: 1.55,
      pointHeight: 0.48,
      cloggingRatio: 0.52,
      maxCloggingRatio: 0.3,
      addLip: false,
      addDrip: false,
    });

    const membraneArea = areaXY(requireObject(host, 'slime-door-membrane'));
    expect(membraneArea).toBeLessThanOrEqual(clearArea * 0.3 + 1e-3);
  });
});
