import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBoltPlate, buildMetalBand, buildStrapSet } from '@/world/buildings/kit/MetalBanding';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#33302c', roughness: 0.6, metalness: 0.6 });
}

describe('buildMetalBand', () => {
  it('wraps a rectangular cross-section with four named strap pieces', () => {
    const band = buildMetalBand({ width: 0.7, depth: 0.85, material: makeMaterial() });
    const names = band.children.map((c) => c.name).sort();
    expect(names).toEqual(['band-back', 'band-front', 'band-left', 'band-right']);
  });
});

describe('buildBoltPlate', () => {
  it('produces a plate with 2-4 raised bolt heads', () => {
    const plate = buildBoltPlate({ width: 0.3, height: 0.2, material: makeMaterial() });
    const bolts = plate.children.filter((c) => c.name.startsWith('bolt-'));
    expect(bolts.length).toBeGreaterThanOrEqual(2);
    expect(bolts.length).toBeLessThanOrEqual(4);
    plate.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(plate);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.01);
  });
});

describe('buildStrapSet', () => {
  it('produces 3-5 strap meshes across a leaf', () => {
    const straps = buildStrapSet({ leafWidth: 0.6, leafHeight: 1.6, material: makeMaterial() });
    const strapMeshes = straps.children.filter((c) => c.name.startsWith('strap-'));
    expect(strapMeshes.length).toBeGreaterThanOrEqual(3);
    expect(strapMeshes.length).toBeLessThanOrEqual(5);
  });
});
