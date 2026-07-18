// ── Human princess: smooth toon body (chibi human POC lineage) ──────────────

import * as THREE from 'three';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BodySynthesizer, BuildResult } from './contracts';
import {
  computeProportions, makeScaffold, buildDress, addPuffSleeves,
  limbPart, shadowed, makeResult,
} from './shared';

export const humanSynth: BodySynthesizer = {
  archetype: 'human',

  build(dna: PrincessDNA, kit: MaterialKit): BuildResult {
    const p = computeProportions(dna);
    const scaffold = makeScaffold(dna, p);
    const { rig } = scaffold;

    // Head
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(p.headR, 32, 24), kit.skin));
    rig.head.add(head);

    // Neck
    const neck = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(p.headR * 0.16, p.headR * 0.2, p.headCY - p.neckY, 12),
      kit.skin,
    ));
    neck.position.y = (p.headCY - p.neckY) / 2;
    rig.neck.add(neck);

    // Dress + chest
    rig.torso.add(buildDress(dna, kit, p));
    const chest = shadowed(new THREE.Mesh(new THREE.SphereGeometry(p.topR * 0.95, 20, 14), kit.primary));
    chest.position.y = 0.75;
    chest.scale.set(1, 0.85, 0.85);
    rig.torso.add(chest);
    if (dna.dress.puffSleeves) addPuffSleeves(kit, p, rig);

    // Arms (capsules) + hands
    for (let i = 0; i < 2; i++) {
      const upper = limbPart(
        new THREE.CapsuleGeometry(p.armThick, p.armUpper * 0.8, 4, 12), kit.skin, -p.armUpper / 2,
      );
      rig.shoulders[i].add(upper);
      const lower = limbPart(
        new THREE.CapsuleGeometry(p.armThick * 0.88, p.armLower * 0.8, 4, 12), kit.skin, -p.armLower / 2,
      );
      rig.elbows[i].add(lower);
      const hand = shadowed(new THREE.Mesh(new THREE.SphereGeometry(p.armThick * 1.35, 12, 10), kit.skin));
      hand.position.y = -p.armLower - 0.05;
      rig.elbows[i].add(hand);
    }

    // Legs (capsules) + rounded shoes
    for (let i = 0; i < 2; i++) {
      const thigh = limbPart(
        new THREE.CapsuleGeometry(p.legThick, p.legUpper * 0.8, 4, 12), kit.skin, -p.legUpper / 2,
      );
      rig.hips[i].add(thigh);
      const calf = limbPart(
        new THREE.CapsuleGeometry(p.legThick * 0.85, p.legLower * 0.8, 4, 12), kit.skin, -p.legLower / 2,
      );
      rig.knees[i].add(calf);
      const shoeGeo = new THREE.CapsuleGeometry(p.legThick * 1.2, 0.5, 6, 12);
      shoeGeo.rotateX(Math.PI / 2);
      shoeGeo.translate(0, -0.12, 0.22);
      const shoe = shadowed(new THREE.Mesh(shoeGeo, kit.accent));
      shoe.position.y = -p.legLower - 0.12;
      rig.knees[i].add(shoe);
    }

    return makeResult(scaffold, p, () => { /* no archetype-specific secondary motion */ });
  },
};
