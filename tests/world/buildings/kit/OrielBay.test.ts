import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildOrielBay } from '@/world/buildings/kit/OrielBay';

function mat(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#556' });
}

function baseOptions() {
  return {
    width: 1.6,
    projection: 0.5,
    height: 2.2,
    wallMaterial: mat(),
    roofMaterial: mat(),
    corbelMaterial: mat(),
    stoneMaterial: mat(),
    glazingMaterial: mat(),
  };
}

describe('buildOrielBay', () => {
  it('projects at least the requested distance from the wall', () => {
    const bay = buildOrielBay(baseOptions());
    const box = new THREE.Box3().setFromObject(bay);
    expect(box.max.z).toBeGreaterThanOrEqual(0.45);
  });

  it('builds at least 2 corbels supporting the bay', () => {
    const bay = buildOrielBay(baseOptions());
    const names = new Set<string>();
    bay.traverse((o) => { if (o.name) names.add(o.name); });
    const corbelCount = [...names].filter((n) => n.startsWith('corbel-')).length;
    expect(corbelCount).toBeGreaterThanOrEqual(2);
  });

  it('builds 3 five-piece window faces (front, left, right)', () => {
    const bay = buildOrielBay(baseOptions());
    for (const face of ['wall-front', 'wall-left', 'wall-right']) {
      const wall = bay.getObjectByName(face);
      expect(wall, `expected ${face} to exist`).toBeTruthy();
      const openingNames = new Set<string>();
      wall!.traverse((o) => { if (o.name) openingNames.add(o.name); });
      for (const part of ['recess', 'surround', 'sill', 'division', 'glazing']) {
        expect(openingNames.has(part), `expected ${face} to have a ${part} part`).toBe(true);
      }
    }
  });

  it('has a floor cap and a roof cap', () => {
    const bay = buildOrielBay(baseOptions());
    expect(bay.getObjectByName('floor-cap')).toBeTruthy();
    expect(bay.getObjectByName('roof-cap')).toBeTruthy();
  });

  it('produces finite, mergeable geometry with uv attributes on every mesh', () => {
    const bay = buildOrielBay(baseOptions());
    bay.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      expect(Number.isFinite(box.min.x)).toBe(true);
      expect(Number.isFinite(box.max.x)).toBe(true);
      expect(mesh.geometry.getAttribute('uv')).toBeTruthy();
    });
  });

  it('is deterministic for a given seed', () => {
    const a = buildOrielBay({ ...baseOptions(), seed: 7 });
    const b = buildOrielBay({ ...baseOptions(), seed: 7 });
    const boxA = new THREE.Box3().setFromObject(a);
    const boxB = new THREE.Box3().setFromObject(b);
    expect(boxA.min.toArray()).toEqual(boxB.min.toArray());
    expect(boxA.max.toArray()).toEqual(boxB.max.toArray());
  });
});
