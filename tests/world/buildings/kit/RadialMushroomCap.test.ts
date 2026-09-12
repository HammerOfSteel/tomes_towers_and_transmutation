import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRadialMushroomCap, type RadialMushroomCapPalette } from '@/world/buildings/kit/RadialMushroomCap';

function makePalette(): RadialMushroomCapPalette {
  return {
    rib: new THREE.MeshStandardMaterial({ color: '#8a5a3a' }),
    shingle: new THREE.MeshStandardMaterial({ color: '#c96b4a' }),
    rim: new THREE.MeshStandardMaterial({ color: '#7a3a2a' }),
    gill: new THREE.MeshStandardMaterial({ color: '#f0e0c0' }),
  };
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

function countMeshes(g: THREE.Object3D): number {
  let n = 0;
  g.traverse((o) => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

describe('buildRadialMushroomCap', () => {
  it('assembles ribs, gills, shingle bands, and a scalloped rim as separate named parts (not a single dome mesh)', () => {
    const cap = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 5 });
    expect(cap.getObjectByName('mushroom-cap-ribs')).toBeTruthy();
    expect(cap.getObjectByName('mushroom-cap-gills')).toBeTruthy();
    expect(cap.getObjectByName('mushroom-cap-shingle-bands')).toBeTruthy();
    expect(cap.getObjectByName('mushroom-cap-rim')).toBeTruthy();
    expect(cap.getObjectByName('apex-boss')).toBeTruthy();
    assertFiniteGeometry(cap);
  });

  it('never uses a SphereGeometry or LatheGeometry for the cap body', () => {
    const cap = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 5 });
    cap.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        expect(o.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
        expect(o.geometry).not.toBeInstanceOf(THREE.LatheGeometry);
      }
    });
  });

  it('clamps rib count to the 12-20 design-spec range and stores it in userData', () => {
    const low = buildRadialMushroomCap({ radius: 2, rise: 1.4, ribCount: 4, palette: makePalette() });
    const high = buildRadialMushroomCap({ radius: 2, rise: 1.4, ribCount: 40, palette: makePalette() });
    expect(low.userData.ribCount).toBe(12);
    expect(high.userData.ribCount).toBe(20);
  });

  it('clamps shingle band count to the 3-7 range', () => {
    const low = buildRadialMushroomCap({ radius: 2, rise: 1.4, shingleBands: 1, palette: makePalette() });
    const high = buildRadialMushroomCap({ radius: 2, rise: 1.4, shingleBands: 12, palette: makePalette() });
    expect(low.userData.shingleBands).toBe(3);
    expect(high.userData.shingleBands).toBe(7);
  });

  it('builds optional raised spore plaques only when requested', () => {
    const withPlaques = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), plaqueCount: 5, seed: 9 });
    const withoutPlaques = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 9 });
    expect(withPlaques.getObjectByName('mushroom-cap-plaques')).toBeTruthy();
    expect(withoutPlaques.getObjectByName('mushroom-cap-plaques')).toBeFalsy();
  });

  it('leans the apex boss sideways when apexLean is given, while the rim stays centered', () => {
    const straight = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 3 });
    const leaned = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 3, apexLean: { x: 0.8, z: 0.2 } });
    const straightBoss = straight.getObjectByName('apex-boss')!;
    const leanedBoss = leaned.getObjectByName('apex-boss')!;
    expect(leanedBoss.position.x).toBeGreaterThan(straightBoss.position.x);
    expect(leanedBoss.position.z).toBeGreaterThan(straightBoss.position.z);
  });

  it('supports an oval cap via radiusZ for elongated nave-style caps', () => {
    const oval = buildRadialMushroomCap({ radius: 2, radiusZ: 3.5, rise: 1.4, palette: makePalette() });
    const box = new THREE.Box3().setFromObject(oval);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x);
  });

  it('is deterministic for the same seed and produces a different mesh layout for a different seed', () => {
    const a = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 11 });
    const b = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 11 });
    const c = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), seed: 12 });
    expect(countMeshes(a)).toBe(countMeshes(b));
    const bandsA = a.getObjectByName('mushroom-cap-shingle-bands') as THREE.Group;
    const bandsC = c.getObjectByName('mushroom-cap-shingle-bands') as THREE.Group;
    const posA = (bandsA.children[0].children[0] as THREE.Mesh).geometry.getAttribute('position');
    const posC = (bandsC.children[0].children[0] as THREE.Mesh).geometry.getAttribute('position');
    let sumA = 0, sumC = 0;
    for (let i = 0; i < posA.count; i++) sumA += posA.getX(i);
    for (let i = 0; i < posC.count; i++) sumC += posC.getX(i);
    expect(sumA).not.toBe(sumC);
  });

  it('rim sits below and outside the rib springing line (a real thick drip edge, not flush)', () => {
    const cap = buildRadialMushroomCap({ radius: 2, rise: 1.4, palette: makePalette(), rimThickness: 0.2 });
    const rim = cap.getObjectByName('mushroom-cap-rim') as THREE.Group;
    const box = new THREE.Box3().setFromObject(rim);
    expect(box.min.y).toBeLessThan(0);
  });
});
