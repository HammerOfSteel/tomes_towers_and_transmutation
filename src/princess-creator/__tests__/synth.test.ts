// ── Synth smoke tests: every archetype builds a complete, disposable rig ────
//
//  Runs in jsdom with NO renderer — synths must stay render-independent
//  (geometry + scene graph only), which these tests enforce.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ARCHETYPES } from '../types';
import { defaultDna } from '../dna';
import { randomDna } from '../randomize';
import { createMaterialKit } from '../materials';
import { composePrincess } from '../compose';
import { SOCKET_IDS } from '../synth/contracts';
import { Animator } from '../animate';

describe('composePrincess', () => {
  it.each(ARCHETYPES)('%s builds rig, sockets and meshes', (a) => {
    const dna = defaultDna(a);
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);

    expect(result.root).toBeInstanceOf(THREE.Group);
    expect(result.rig.shoulders).toHaveLength(2);
    expect(result.rig.knees).toHaveLength(2);
    for (const id of SOCKET_IDS) {
      expect(result.sockets[id]).toBeInstanceOf(THREE.Group);
    }
    let meshCount = 0;
    result.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshCount++;
    });
    expect(meshCount).toBeGreaterThan(3);

    result.dispose();
    kit.dispose();
  });

  it.each(ARCHETYPES)('%s update() runs headless without a renderer', (a) => {
    const dna = defaultDna(a);
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    expect(() => {
      result.update(0.016, 0.016);
      result.update(1.5, 0.016);
    }).not.toThrow();
    result.dispose();
    kit.dispose();
  });

  it('mirrored right-hand items and ears use negative x scale', () => {
    const dna = defaultDna('fox');
    dna.parts.handL = 'wand';
    dna.parts.handR = 'wand';
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const right = result.sockets.handR.children[0];
    const left = result.sockets.handL.children[0];
    expect(left.scale.x).toBe(1);
    expect(right.scale.x).toBe(-1);
    expect(result.sockets.earR.children[0].scale.x).toBe(-1);
    result.dispose();
    kit.dispose();
  });

  it('slime keeps sockets riding the animated rig', () => {
    const dna = defaultDna('slime');
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const scene = new THREE.Scene();
    scene.add(result.root);

    const animator = new Animator();
    animator.bind(result, dna);
    animator.update(0.5);
    result.update(0.5, 0.016);

    const headSocketPos = new THREE.Vector3();
    result.sockets.headTop.getWorldPosition(headSocketPos);
    expect(headSocketPos.y).toBeGreaterThan(5); // riding the head, not the floor
    const mc = result.root.getObjectByName('slimeBody');
    expect(mc).toBeTruthy();
    result.dispose();
    kit.dispose();
  });

  it('random DNA builds for 25 seeds per archetype without throwing', () => {
    for (const a of ARCHETYPES) {
      for (let seed = 1; seed <= 25; seed++) {
        const dna = randomDna(a, seed);
        const kit = createMaterialKit(dna);
        const result = composePrincess(dna, kit);
        result.update(0.1, 0.016);
        result.dispose();
        kit.dispose();
      }
    }
  });

  it('palette retint touches part materials without rebuild', () => {
    const dna = defaultDna('human');
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const before = kit.metal.color.getHexString();
    const next = structuredClone(dna);
    next.colors.metal = '#123456';
    kit.apply(next);
    expect(kit.metal.color.getHexString()).toBe('123456');
    expect(kit.metal.color.getHexString()).not.toBe(before);
    result.dispose();
    kit.dispose();
  });
});
