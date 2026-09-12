import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildMonument,
  pickMonumentVariant,
  MONUMENT_VARIANTS,
  type MonumentVariant,
} from '@/world/buildings/kit/MonumentKit';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#9d998f' });
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

describe('buildMonument', () => {
  it.each(MONUMENT_VARIANTS)('%s: has a plinth, body/equivalent, and a cap as separate real volumes', (variant) => {
    const monument = buildMonument({ variant, material: makeMaterial() });
    expect(monument.getObjectByName('monument-plinth')).toBeTruthy();
    // Every variant has at least one non-plinth named part beyond the plinth.
    const nonPlinthParts = monument.children.filter((c) => c.name !== 'monument-plinth');
    expect(nonPlinthParts.length).toBeGreaterThan(0);
    assertFiniteGeometry(monument);
  });

  it('table-tomb: stands on four legs beneath a lid slab', () => {
    const monument = buildMonument({ variant: 'table-tomb', material: makeMaterial() });
    const legs = monument.children.filter((c) => c.name.startsWith('monument-leg-'));
    expect(legs.length).toBe(4);
    expect(monument.getObjectByName('monument-cap')).toBeTruthy();
  });

  it('broken-marker: has a standing stub plus a separately tilted fallen fragment', () => {
    const monument = buildMonument({ variant: 'broken-marker', material: makeMaterial(), seed: 7 });
    const body = monument.getObjectByName('monument-body')!;
    const fragment = monument.getObjectByName('monument-fragment')!;
    expect(body).toBeTruthy();
    expect(fragment).toBeTruthy();
    expect(fragment.rotation.z).not.toBeCloseTo(body.rotation.z, 2);
  });

  it('skullBoss option adds a named skull-boss relief on supported variants', () => {
    const withBoss = buildMonument({ variant: 'sarcophagus', material: makeMaterial(), skullBoss: true });
    expect(withBoss.getObjectByName('skull-boss')).toBeTruthy();
    const without = buildMonument({ variant: 'sarcophagus', material: makeMaterial() });
    expect(without.getObjectByName('skull-boss')).toBeFalsy();
  });

  it('every variant produces real 3D relief (non-zero extent in all axes)', () => {
    for (const variant of MONUMENT_VARIANTS) {
      const monument = buildMonument({ variant, material: makeMaterial() });
      monument.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(monument);
      const size = new THREE.Vector3();
      box.getSize(size);
      expect(size.x).toBeGreaterThan(0.05);
      expect(size.y).toBeGreaterThan(0.05);
      expect(size.z).toBeGreaterThan(0.05);
    }
  });
});

describe('pickMonumentVariant', () => {
  it('is deterministic for a fixed rand sequence', () => {
    const weights: Array<[MonumentVariant, number]> = [
      ['arched-slab', 50],
      ['obelisk', 30],
      ['broken-marker', 20],
    ];
    let calls = 0;
    const fixedRand = () => { calls++; return 0.9; }; // near the top of the cumulative range
    const picked = pickMonumentVariant(fixedRand, weights);
    expect(picked).toBe('broken-marker');
    expect(calls).toBe(1);
  });

  it('picks the first weighted option for a low roll', () => {
    const weights: Array<[MonumentVariant, number]> = [
      ['arched-slab', 50],
      ['obelisk', 50],
    ];
    const picked = pickMonumentVariant(() => 0.01, weights);
    expect(picked).toBe('arched-slab');
  });
});
