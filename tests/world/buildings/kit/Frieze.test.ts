import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFriezeBand } from '@/world/buildings/kit/Frieze';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.9 });
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

function motifChildren(band: THREE.Group): THREE.Object3D[] {
  return band.children.filter((c) => c.name.startsWith('frieze-motif-'));
}

describe('buildFriezeBand', () => {
  it('greek-key: produces repeating named motifs with real depth relief', () => {
    const band = buildFriezeBand({ length: 3, variant: 'greek-key', material: makeMaterial() });
    const motifs = motifChildren(band);
    expect(motifs.length).toBeGreaterThan(1);
    assertFiniteGeometry(band);
    band.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(band);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.02);
  });

  it('greek-key: motif size does not scale with total length (fixed-size module)', () => {
    const short = buildFriezeBand({ length: 3, variant: 'greek-key', material: makeMaterial() });
    const long = buildFriezeBand({ length: 9, variant: 'greek-key', material: makeMaterial() });
    short.updateMatrixWorld(true);
    long.updateMatrixWorld(true);

    const shortMotif = motifChildren(short)[0]!;
    const longMotif = motifChildren(long)[0]!;
    const shortBox = new THREE.Box3().setFromObject(shortMotif);
    const longBox = new THREE.Box3().setFromObject(longMotif);
    const shortWidth = shortBox.max.x - shortBox.min.x;
    const longWidth = longBox.max.x - longBox.min.x;
    expect(Math.abs(shortWidth - longWidth)).toBeLessThan(1e-6);

    // Longer band gets MORE motifs, not bigger ones.
    expect(motifChildren(long).length).toBeGreaterThan(motifChildren(short).length);
  });

  it('dentil: produces evenly spaced tooth motifs', () => {
    const band = buildFriezeBand({ length: 2.4, variant: 'dentil', material: makeMaterial() });
    const motifs = motifChildren(band);
    expect(motifs.length).toBeGreaterThanOrEqual(3);
    assertFiniteGeometry(band);
  });

  it('plain-double-string: produces two named horizontal bars', () => {
    const band = buildFriezeBand({ length: 4, variant: 'plain-double-string', material: makeMaterial() });
    expect(band.getObjectByName('string-upper')).toBeTruthy();
    expect(band.getObjectByName('string-lower')).toBeTruthy();
    assertFiniteGeometry(band);
  });

  it('cracked: omits exactly one motif slot and adds a visible crack mark', () => {
    const intact = buildFriezeBand({ length: 3, variant: 'dentil', material: makeMaterial(), seed: 5 });
    const cracked = buildFriezeBand({ length: 3, variant: 'cracked', material: makeMaterial(), seed: 5 });
    expect(motifChildren(cracked).length).toBe(motifChildren(intact).length - 1);
    expect(cracked.getObjectByName('frieze-crack')).toBeTruthy();
    assertFiniteGeometry(cracked);
  });

  it('is deterministic for the same seed and length', () => {
    const a = buildFriezeBand({ length: 3.4, variant: 'cracked', material: makeMaterial(), seed: 11 });
    const b = buildFriezeBand({ length: 3.4, variant: 'cracked', material: makeMaterial(), seed: 11 });
    expect(motifChildren(a).length).toBe(motifChildren(b).length);
    const crackA = a.getObjectByName('frieze-crack')!;
    const crackB = b.getObjectByName('frieze-crack')!;
    expect(crackA.position.x).toBeCloseTo(crackB.position.x, 10);
  });
});
