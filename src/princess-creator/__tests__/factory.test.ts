// ── PrincessFactory: the game-facing façade ──────────────────────────────────

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SPECIES_IDS } from '../types';
import { defaultDna, dnaToShareCode } from '../dna';
import { buildPrincess } from '../factory';

describe('buildPrincess', () => {
  it('builds from a share code string', () => {
    const code = dnaToShareCode(defaultDna('skeleton'));
    const p = buildPrincess(code);
    expect(p.dna.species).toBe('skeleton');
    expect(p.root).toBeInstanceOf(THREE.Group);
    p.update(0.5, 0.016);
    p.playEmote('wave');
    p.update(0.6, 0.016);
    p.dispose();
  });

  it('throws on garbage codes', () => {
    expect(() => buildPrincess('P2.NOT_A_CODE%%%')).toThrow();
  });

  it('targetHeight rescales the build (game units)', () => {
    const p = buildPrincess(defaultDna('human'), { targetHeight: 1.6, animate: false });
    p.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(p.root);
    const h = box.max.y - box.min.y;
    expect(h).toBeGreaterThan(1.4);
    expect(h).toBeLessThan(1.8);
    p.dispose();
  });

  it('animate:false leaves the rig neutral for external drivers', () => {
    const p = buildPrincess(defaultDna('foxling'), { animate: false });
    p.update(1, 0.016); // secondary motion only — must not throw
    expect(p.rig.shoulders[0].rotation.x).toBe(0); // no idle pose applied
    p.dispose();
  });

  it('every species builds through the factory', () => {
    for (const s of SPECIES_IDS) {
      const p = buildPrincess(defaultDna(s), { animate: false });
      p.update(0.1, 0.016);
      p.dispose();
    }
  });
});

describe('geometry leak guard (D8)', () => {
  it('every geometry created in a build is disposed with it', () => {
    const proto = THREE.BufferGeometry.prototype as unknown as { dispose(): void };
    const original = proto.dispose;
    let disposeCalls = 0;
    proto.dispose = function patched(this: THREE.BufferGeometry) {
      disposeCalls++;
      return original.call(this);
    };
    try {
      for (const s of SPECIES_IDS) {
        const p = buildPrincess(defaultDna(s), { animate: false });
        const inTree = new Set<string>();
        p.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry) inTree.add(mesh.geometry.uuid);
        });
        const before = disposeCalls;
        p.dispose();
        const freed = disposeCalls - before;
        // Every distinct geometry in the tree must be disposed at least once
        // (aura/point geometries included via hooks.disposers).
        expect(freed).toBeGreaterThanOrEqual(inTree.size);
      }
    } finally {
      proto.dispose = original;
    }
  });
});
