import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLanternCage, buildGallowsBracket, buildWallBracket } from '@/world/buildings/kit/LanternKit';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#2a2a28' });
}

function makePaneMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#f2c96a', emissive: '#f2c96a', emissiveIntensity: 1 });
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

describe('buildLanternCage', () => {
  it('surrounds the emissive pane with real iron cage bars, base, and cap', () => {
    const cage = buildLanternCage({ material: makeMaterial(), paneMaterial: makePaneMaterial() });
    expect(cage.getObjectByName('lantern-pane')).toBeTruthy();
    expect(cage.getObjectByName('lantern-base')).toBeTruthy();
    expect(cage.getObjectByName('lantern-cap')).toBeTruthy();
    expect(cage.getObjectByName('lantern-ring')).toBeTruthy();
    const bars = cage.children.filter((c) => c.name.startsWith('lantern-bar-'));
    expect(bars.length).toBeGreaterThanOrEqual(4);
    assertFiniteGeometry(cage);
  });

  it('the pane is a minority of total meshes (cage dominates, not a glowing blob)', () => {
    const cage = buildLanternCage({ material: makeMaterial(), paneMaterial: makePaneMaterial(), barCount: 6 });
    let total = 0;
    cage.traverse((c) => { if (c instanceof THREE.Mesh) total++; });
    expect(total).toBeGreaterThanOrEqual(9); // base + pane + 6 bars + cap + ring
  });

  it('supports an unlit/broken variant via the lit flag', () => {
    const lit = buildLanternCage({ material: makeMaterial(), paneMaterial: makePaneMaterial(), lit: true });
    const unlit = buildLanternCage({ material: makeMaterial(), paneMaterial: makePaneMaterial(), lit: false });
    expect(lit.userData.lit).toBe(true);
    expect(unlit.userData.lit).toBe(false);
  });
});

describe('buildGallowsBracket', () => {
  it('has a post, arm, brace, and a hung lantern cage', () => {
    const bracket = buildGallowsBracket({ material: makeMaterial(), paneMaterial: makePaneMaterial() });
    expect(bracket.getObjectByName('bracket-post')).toBeTruthy();
    expect(bracket.getObjectByName('bracket-arm')).toBeTruthy();
    expect(bracket.getObjectByName('bracket-brace')).toBeTruthy();
    expect(bracket.getObjectByName('lantern-cage')).toBeTruthy();
    assertFiniteGeometry(bracket);
  });

  it('has real horizontal reach and vertical rise (not a flat plane)', () => {
    const bracket = buildGallowsBracket({ material: makeMaterial(), paneMaterial: makePaneMaterial(), reach: 0.6, postHeight: 0.5 });
    bracket.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bracket);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.4);
    expect(box.max.y - box.min.y).toBeGreaterThan(0.4);
  });
});

describe('buildWallBracket', () => {
  it('has a wall plate, scroll arm, and lantern cage projecting from the wall', () => {
    const bracket = buildWallBracket({ material: makeMaterial(), paneMaterial: makePaneMaterial() });
    expect(bracket.getObjectByName('bracket-plate')).toBeTruthy();
    expect(bracket.getObjectByName('bracket-scroll')).toBeTruthy();
    expect(bracket.getObjectByName('lantern-cage')).toBeTruthy();
    assertFiniteGeometry(bracket);
  });
});
