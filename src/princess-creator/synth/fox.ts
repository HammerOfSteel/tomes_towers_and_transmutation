// ── Fox princess: flat-shaded low-poly body (fox POC lineage) ────────────────
//
//  kit slot mapping for fox: skin = fur base, hair = fur alt (tips/chest),
//  primary = dress, dark = boots/nose.

import * as THREE from 'three';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BodySynthesizer, BuildResult } from './contracts';
import {
  computeProportions, makeScaffold, buildDress, addPuffSleeves,
  limbPart, shadowed, makeResult,
} from './shared';

export const foxSynth: BodySynthesizer = {
  archetype: 'fox',

  build(dna: PrincessDNA, kit: MaterialKit): BuildResult {
    const p = computeProportions(dna);
    const scaffold = makeScaffold(dna, p);
    const { rig } = scaffold;
    const R = p.headR * 0.94;

    // Head: icosahedron reads beautifully low-poly
    const head = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), kit.skin));
    rig.head.add(head);

    // Snout + nose
    const snoutLen = 0.62 * R * dna.species.snoutLength;
    const snoutGeo = new THREE.ConeGeometry(0.34 * R, snoutLen, 5);
    snoutGeo.rotateX(Math.PI / 2);
    const snout = shadowed(new THREE.Mesh(snoutGeo, kit.hair));
    snout.position.set(0, -0.18 * R, R * 0.82 + snoutLen * 0.3);
    rig.head.add(snout);
    const nose = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 * R, 0), kit.dark);
    nose.position.set(0, -0.18 * R, R * 0.82 + snoutLen * 0.82);
    rig.head.add(nose);

    // Cheek fluff tufts (angled down-out, like fur ruff)
    for (const side of [-1, 1]) {
      const tuftGeo = new THREE.ConeGeometry(0.16 * R, 0.42 * R * dna.species.fluff * 0.7, 4);
      tuftGeo.rotateZ((Math.PI / 2 + 0.55) * side);
      const tuft = shadowed(new THREE.Mesh(tuftGeo, kit.hair));
      tuft.position.set(0.82 * R * side, -0.32 * R, 0.1 * R);
      rig.head.add(tuft);
    }

    // Dress (hex default) + hem frill
    rig.torso.add(buildDress(dna, kit, p));
    if (dna.dress.puffSleeves) addPuffSleeves(kit, p, rig);

    // Chest fluff
    const chestGeo = new THREE.ConeGeometry(p.topR * 0.62, 1.1, 4);
    chestGeo.rotateX(-0.35);
    const chestFluff = shadowed(new THREE.Mesh(chestGeo, kit.hair));
    chestFluff.position.set(0, 0.35, p.topR * 0.62);
    rig.torso.add(chestFluff);

    // Arms: 5-sided cylinders, fur upper / alt lower, paw mitts
    for (let i = 0; i < 2; i++) {
      const upper = limbPart(
        new THREE.CylinderGeometry(p.armThick * 1.15, p.armThick * 0.9, p.armUpper, 5),
        kit.skin, -p.armUpper / 2,
      );
      rig.shoulders[i].add(upper);
      const lower = limbPart(
        new THREE.CylinderGeometry(p.armThick * 0.85, p.armThick * 0.72, p.armLower, 5),
        kit.hair, -p.armLower / 2,
      );
      rig.elbows[i].add(lower);
      const paw = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(p.armThick * 1.25, 0), kit.hair));
      paw.position.y = -p.armLower - 0.05;
      rig.elbows[i].add(paw);
    }

    // Legs + little boots
    for (let i = 0; i < 2; i++) {
      const thigh = limbPart(
        new THREE.CylinderGeometry(p.legThick * 1.3, p.legThick, p.legUpper, 5),
        kit.skin, -p.legUpper / 2,
      );
      rig.hips[i].add(thigh);
      const calf = limbPart(
        new THREE.CylinderGeometry(p.legThick, p.legThick * 0.8, p.legLower, 5),
        kit.hair, -p.legLower / 2,
      );
      rig.knees[i].add(calf);
      const bootGeo = new THREE.BoxGeometry(p.legThick * 2.6, 0.55, p.legThick * 3.6);
      bootGeo.translate(0, -0.2, p.legThick * 0.8);
      const boot = shadowed(new THREE.Mesh(bootGeo, kit.dark));
      boot.position.y = -p.legLower - 0.08;
      rig.knees[i].add(boot);
    }

    return makeResult(scaffold, p, () => { /* ear flicks & tail swish live in the parts */ });
  },
};
