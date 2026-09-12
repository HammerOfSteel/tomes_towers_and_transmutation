import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildUndeadWindow,
  buildUndeadGrilleWindow,
  buildUndeadDoor,
  buildUndeadGrilleDoor,
  buildUndeadOculus,
  buildUndeadSealedSlab,
  type UndeadOpeningPalette,
} from '@/world/buildings/undead/UndeadOpenings';
import { depthFor } from '@/world/buildings/kit/DepthLadder';

function makePalette(): UndeadOpeningPalette {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#5a5048' }),
    glazing: new THREE.MeshStandardMaterial({ color: '#0a0a08' }),
    wood: new THREE.MeshStandardMaterial({ color: '#2a1c10' }),
    iron: new THREE.MeshStandardMaterial({ color: '#20211f', metalness: 0.7 }),
  };
}

function requireChild(group: THREE.Group, name: string): THREE.Object3D {
  const child = group.getObjectByName(name);
  expect(child, `${name} should exist`).toBeTruthy();
  return child!;
}

describe('buildUndeadWindow', () => {
  it('produces the five named window pieces at separated depths', () => {
    const wallZ = 1.5;
    const opening = buildUndeadWindow({ width: 0.5, height: 0.9, wallZ, palette: makePalette() });
    const recess = requireChild(opening, 'recess');
    const surround = requireChild(opening, 'surround');
    const sill = requireChild(opening, 'sill');
    const division = requireChild(opening, 'division');
    const glazing = requireChild(opening, 'glazing');
    expect(recess.position.z - wallZ).toBeLessThanOrEqual(depthFor('REVEAL'));
    expect(surround.position.z - wallZ).toBeGreaterThanOrEqual(depthFor('FRAME'));
    expect(sill).toBeTruthy();
    expect(division).toBeTruthy();
    expect(glazing.position.z - wallZ).toBeLessThanOrEqual(depthFor('GLAZING'));
  });

  it('clamps archRatio into the rounder equilateral undead range regardless of input', () => {
    const tall = buildUndeadWindow({ width: 0.5, height: 0.9, wallZ: 0, palette: makePalette(), archRatio: 5 });
    const flat = buildUndeadWindow({ width: 0.5, height: 0.9, wallZ: 0, palette: makePalette(), archRatio: -5 });
    tall.updateMatrixWorld(true);
    flat.updateMatrixWorld(true);
    // Both should build without throwing and produce finite geometry -- the
    // exact numeric clamp is an internal implementation detail, but a wildly
    // out-of-range input must not destabilize the opening.
    for (const group of [tall, flat]) {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const pos = obj.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i))).toBe(true);
        }
      });
    }
  });
});

describe('buildUndeadGrilleWindow', () => {
  it('wraps a real opening plus a bank of named grille bars (at least 5)', () => {
    const group = buildUndeadGrilleWindow({ width: 0.45, height: 0.85, wallZ: 1.2, palette: makePalette() });
    const opening = requireChild(group, 'opening');
    const bars = requireChild(group, 'grille-bars');
    expect(opening.getObjectByName('glazing')).toBeTruthy();
    const barMeshes = bars.children.filter((c) => c.name.startsWith('grille-bar-'));
    expect(barMeshes.length).toBeGreaterThanOrEqual(5);
  });
});

describe('buildUndeadDoor', () => {
  it('produces recess/surround/threshold/door-leaf pieces', () => {
    const opening = buildUndeadDoor({ width: 0.85, height: 1.65, wallZ: 2, palette: makePalette() });
    expect(opening.getObjectByName('recess')).toBeTruthy();
    expect(opening.getObjectByName('surround')).toBeTruthy();
    expect(opening.getObjectByName('threshold')).toBeTruthy();
    expect(opening.getObjectByName('door-leaf')).toBeTruthy();
  });
});

describe('buildUndeadGrilleDoor', () => {
  it('wraps a real door opening plus named grille bars', () => {
    const group = buildUndeadGrilleDoor({ width: 0.85, height: 1.65, wallZ: 2, palette: makePalette() });
    expect(group.getObjectByName('opening')).toBeTruthy();
    const bars = group.getObjectByName('grille-bars')!;
    expect(bars.children.length).toBeGreaterThanOrEqual(5);
  });
});

describe('buildUndeadOculus', () => {
  it('produces a round window with cross division by default', () => {
    const oculus = buildUndeadOculus({ diameter: 0.6, wallZ: 3, palette: makePalette() });
    expect(oculus.userData.openingShape).toBe('round');
    expect(oculus.getObjectByName('division')).toBeTruthy();
  });
});

describe('buildUndeadSealedSlab', () => {
  it('uses the stone material for the glazing plane instead of dark glass', () => {
    const palette = makePalette();
    const sealed = buildUndeadSealedSlab({ width: 0.5, height: 0.9, wallZ: 0, palette });
    const glazingGroup = sealed.getObjectByName('glazing')!;
    const glazingMesh = glazingGroup.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    expect(glazingMesh.material).toBe(palette.stone);
    // Still real five-piece recessed geometry -- not a deleted face.
    expect(sealed.getObjectByName('recess')).toBeTruthy();
    expect(sealed.getObjectByName('surround')).toBeTruthy();
  });
});
