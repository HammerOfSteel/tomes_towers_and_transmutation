import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPediment } from '@/world/buildings/kit/Pediment';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#a09a8e' });
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

describe('buildPediment', () => {
  it('triangular: has cornice bars proud of a recessed tympanum panel', () => {
    const pediment = buildPediment({ width: 3, variant: 'triangular', material: makeMaterial() });
    const left = pediment.getObjectByName('cornice-left')!;
    const right = pediment.getObjectByName('cornice-right')!;
    const base = pediment.getObjectByName('cornice-base')!;
    const tympanum = pediment.getObjectByName('tympanum')!;
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(base).toBeTruthy();
    expect(tympanum).toBeTruthy();
    expect(base.position.z).toBeGreaterThan(tympanum.position.z);
    assertFiniteGeometry(pediment);
  });

  it('gabled-slab: adds a heavy slab cap proud of the tympanum', () => {
    const pediment = buildPediment({ width: 2.5, variant: 'gabled-slab', material: makeMaterial() });
    expect(pediment.getObjectByName('slab-cap')).toBeTruthy();
    assertFiniteGeometry(pediment);
  });

  it('segmental: builds an arced cornice from multiple segments', () => {
    const pediment = buildPediment({ width: 3, variant: 'segmental', material: makeMaterial() });
    const arcSegments = pediment.children.filter((c) => c.name.startsWith('cornice-arc-'));
    expect(arcSegments.length).toBeGreaterThan(4);
    expect(pediment.getObjectByName('tympanum')).toBeTruthy();
    assertFiniteGeometry(pediment);
  });

  it('broken: cornices do not meet at the apex and a fallen fragment exists', () => {
    const intact = buildPediment({ width: 3, variant: 'triangular', material: makeMaterial() });
    const broken = buildPediment({ width: 3, variant: 'broken', material: makeMaterial() });
    intact.updateMatrixWorld(true);
    broken.updateMatrixWorld(true);

    const intactBox = new THREE.Box3().setFromObject(intact);
    const brokenBox = new THREE.Box3().setFromObject(broken);
    // The broken pediment's surviving cornices reach a lower apex than an
    // intact triangular pediment of the same width.
    expect(brokenBox.max.y).toBeLessThan(intactBox.max.y);
    expect(broken.getObjectByName('fallen-fragment')).toBeTruthy();
    assertFiniteGeometry(broken);
  });

  it('medallion option adds a named medallion socket on non-broken variants', () => {
    const withMedallion = buildPediment({ width: 3, variant: 'triangular', material: makeMaterial(), medallion: true });
    expect(withMedallion.getObjectByName('medallion')).toBeTruthy();
    const without = buildPediment({ width: 3, variant: 'triangular', material: makeMaterial() });
    expect(without.getObjectByName('medallion')).toBeFalsy();
  });

  it('produces real z-relief (not a flat coplanar triangle)', () => {
    const pediment = buildPediment({ width: 3, variant: 'triangular', material: makeMaterial() });
    pediment.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pediment);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.08);
  });
});
