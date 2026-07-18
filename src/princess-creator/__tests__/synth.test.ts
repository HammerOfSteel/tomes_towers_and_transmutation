// ── Synth smoke tests: every archetype builds a complete, disposable rig ────
//
//  Runs in jsdom with NO renderer — synths must stay render-independent
//  (geometry + scene graph only), which these tests enforce.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SPECIES_IDS } from '../types';
import { defaultDna } from '../dna';
import { randomDna } from '../randomize';
import { createMaterialKit } from '../materials';
import { composePrincess } from '../compose';
import { SOCKET_IDS } from '../synth/contracts';
import { Animator } from '../animate';

describe('composePrincess', () => {
  it.each(SPECIES_IDS)('%s builds rig, sockets and meshes', (a) => {
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

  it.each(SPECIES_IDS)('%s update() runs headless without a renderer', (a) => {
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
    const dna = defaultDna('foxling');
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

  it('wave 2 species tech: flame hair, mist trail, leaf wings, ghost materials', () => {
    // Ignis: hair group is shaped fire
    const ignis = defaultDna('ignis');
    const kitI = createMaterialKit(ignis);
    const rI = composePrincess(ignis, kitI);
    expect(rI.rig.head.getObjectByName('hair:flame')).toBeTruthy();
    expect(ignis.aura.style).toBe('ember');
    rI.update(0.5, 0.016);
    rI.dispose(); kitI.dispose();

    // Specter: translucent kit + mist hair + wisp trail
    const spec = defaultDna('specter');
    const kitS = createMaterialKit(spec);
    expect(kitS.skin.transparent).toBe(true);
    expect(kitS.skin.opacity).toBeLessThan(1);
    expect(kitS.hair.transparent).toBe(true);
    const rS = composePrincess(spec, kitS);
    expect(rS.rig.head.getObjectByName('hair:mist')).toBeTruthy();
    expect(spec.parts.tail).toBe('wisp');
    rS.update(0.5, 0.016);
    rS.dispose(); kitS.dispose();

    // Fae: leaf wings in the back socket + leaves sprinkled in the hair
    const fae = defaultDna('fae');
    const kitF = createMaterialKit(fae);
    const rF = composePrincess(fae, kitF);
    expect(fae.parts.back).toBe('wings_leaf');
    expect(rF.sockets.back.children.length).toBeGreaterThan(0);
    const hairGroup = rF.rig.head.children.find((c) => c.name.startsWith('hair:'));
    expect(hairGroup).toBeTruthy();
    let leafMeshes = 0;
    hairGroup!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === kitF.accent) leafMeshes++;
    });
    expect(leafMeshes).toBeGreaterThanOrEqual(7); // sprinkled leaves (+ties)
    rF.dispose(); kitF.dispose();
  });

  it('wave 2b species tech: wet kit, moon phases, wreath + growth', () => {
    // Naiad: clearcoat/iridescence wet materials + fin ears + bubbles
    const naiad = defaultDna('naiad');
    const kitN = createMaterialKit(naiad);
    const physSkin = kitN.skin as THREE.MeshPhysicalMaterial;
    expect(physSkin.clearcoat).toBeGreaterThan(0.5);
    expect(physSkin.iridescence).toBeGreaterThan(0);
    expect(naiad.parts.ears).toBe('fin');
    expect(naiad.aura.style).toBe('bubbles');
    const rN = composePrincess(naiad, kitN);
    rN.update(0.5, 0.016);
    rN.dispose(); kitN.dispose();

    // Moonborn: crescent crown geometry changes per subtype
    const counts: number[] = [];
    for (const phase of ['crescent', 'full', 'eclipse']) {
      const moon = defaultDna('moonborn');
      moon.subtype = phase;
      const kitM = createMaterialKit(moon);
      expect((kitM.hair as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.1);
      const rM = composePrincess(moon, kitM);
      const crown = rM.sockets.headTop.children[0];
      let verts = 0;
      crown.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) verts += m.geometry.getAttribute('position').count;
      });
      counts.push(verts);
      rM.dispose(); kitM.dispose();
    }
    // Each lunar phase produces distinct geometry
    expect(new Set(counts).size).toBe(3);

    // Verdant: living wreath + flowers in the hair + vine bands
    const verdant = defaultDna('verdant');
    const kitV = createMaterialKit(verdant);
    const rV = composePrincess(verdant, kitV);
    expect(verdant.parts.crown).toBe('wreath');
    const hairV = rV.rig.head.children.find((c) => c.name.startsWith('hair:'));
    expect(hairV).toBeTruthy();
    let blooms = 0;
    hairV!.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === kitV.metal) blooms++; // flower centers
    });
    expect(blooms).toBeGreaterThanOrEqual(3);
    rV.dispose(); kitV.dispose();
  });

  it('random DNA builds for 25 seeds per archetype without throwing', () => {
    for (const a of SPECIES_IDS) {
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
