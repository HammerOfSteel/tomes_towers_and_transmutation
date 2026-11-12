/**
 * OrcishOpenings.test.ts — orcish door/window/vent presets over the
 * shared `OpeningParts.ts` five-piece opening primitives (doctrine's
 * FIVE-PIECE OPENING MINIMUM: recess, proud surround, sill, mullion,
 * set-back opaque glazing). Design spec: "rough Romanesque arches
 * (archRatio ~ 0.5)".
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildOrcishWindow,
  buildOrcishDoor,
  buildOrcishForgeMouth,
  type OrcishOpeningPalette,
} from '@/world/buildings/orcish/OrcishOpenings';

const palette: OrcishOpeningPalette = {
  timber: new THREE.MeshStandardMaterial({ color: '#6a5838' }),
  glazing: new THREE.MeshStandardMaterial({ color: '#140f0a' }),
  trim: new THREE.MeshStandardMaterial({ color: '#8a6840' }),
};

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return root.getObjectByName(name) ?? undefined;
}

function hasNaN(root: THREE.Object3D): boolean {
  let bad = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const pos = (o as THREE.Mesh).geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite(pos.array[i])) bad = true;
    }
  });
  return bad;
}

describe('buildOrcishWindow', () => {
  it('has all five opening-minimum pieces: recess, surround, sill, division, glazing', () => {
    const win = buildOrcishWindow({ width: 0.6, height: 0.7, wallZ: 0, palette });
    for (const name of ['recess', 'surround', 'sill', 'division', 'glazing']) {
      expect(findByName(win, name), `expected a "${name}" child`).toBeDefined();
    }
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildOrcishWindow({ width: 0.6, height: 0.7, wallZ: 0, palette }))).toBe(false);
  });
});

describe('buildOrcishDoor', () => {
  it('has recess, surround, threshold, and a planked door leaf', () => {
    const door = buildOrcishDoor({ width: 1.1, height: 1.9, wallZ: 0, palette });
    for (const name of ['recess', 'surround', 'threshold', 'door-leaf']) {
      expect(findByName(door, name), `expected a "${name}" child`).toBeDefined();
    }
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildOrcishDoor({ width: 1.1, height: 1.9, wallZ: 0, palette }))).toBe(false);
  });
});

describe('buildOrcishForgeMouth', () => {
  it('uses the forge-emissive material for its glazing when supplied', () => {
    const forgeEmissive = new THREE.MeshStandardMaterial({ color: '#3a1a08', emissive: '#ff5a1e' });
    const mouth = buildOrcishForgeMouth({ width: 1.8, height: 1.6, wallZ: 0, palette: { ...palette, forgeEmissive } });
    const glazingGroup = findByName(mouth, 'glazing');
    expect(glazingGroup).toBeDefined();
    const glazingMesh = glazingGroup!.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(glazingMesh.material).toBe(forgeEmissive);
  });

  it('produces finite geometry', () => {
    expect(hasNaN(buildOrcishForgeMouth({ width: 1.8, height: 1.6, wallZ: 0, palette }))).toBe(false);
  });
});
