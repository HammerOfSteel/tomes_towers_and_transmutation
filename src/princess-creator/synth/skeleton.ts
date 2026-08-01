// ── Skeleton princess: bone-segment body (chibi skeleton POC lineage) ───────
//
//  kit slot mapping: skin = bone, primary = gown, secondary = trim/cape,
//  glow = soul glow (eyes handled by the face module's 'glow' style).

import * as THREE from 'three';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BodySynthesizer, BuildResult } from './contracts';
import {
  computeProportions, makeScaffold, buildDress, limbPart, shadowed, makeResult,
} from './shared';

/** Bone: tapered shaft + icosahedron joint knob at the pivot. */
function bone(length: number, thickness: number, kit: MaterialKit): THREE.Group {
  const g = new THREE.Group();
  const shaft = limbPart(
    new THREE.CylinderGeometry(thickness * 0.6, thickness, length, 5),
    kit.skin, -length / 2,
  );
  g.add(shaft);
  const knob = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(thickness * 1.35, 0), kit.skin));
  g.add(knob);
  return g;
}

export const skeletonSynth: BodySynthesizer = {
  archetype: 'skeleton',

  build(dna: PrincessDNA, kit: MaterialKit): BuildResult {
    const p = computeProportions(dna);
    const scaffold = makeScaffold(dna, p);
    const { rig } = scaffold;
    const R = p.headR;
    const bt = 0.16 * dna.traits.boneThickness * (0.8 + 0.2 * dna.body.chubbiness);

    // Skull: icosahedron with a flattened jaw
    const skullGeo = new THREE.IcosahedronGeometry(R, 2);
    const pos = skullGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -R * 0.4) pos.setY(i, -R * 0.4 + (y + R * 0.4) * 0.65);
    }
    skullGeo.computeVertexNormals();
    const skull = shadowed(new THREE.Mesh(skullGeo, kit.skin));
    rig.head.add(skull);

    // Nasal cavity
    const noseGeo = new THREE.ConeGeometry(0.1 * R, 0.18 * R, 3);
    noseGeo.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, kit.dark);
    nose.position.set(0, -0.24 * R, R * 0.92);
    rig.head.add(nose);

    // Neck vertebra
    const vertebra = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * R, 0.16 * R, p.headCY - p.neckY, 6),
      kit.skin,
    ));
    vertebra.position.y = (p.headCY - p.neckY) / 2;
    rig.neck.add(vertebra);

    // Gown + collarbone
    rig.torso.add(buildDress(dna, kit, p));
    const clavicle = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(bt * 0.7, bt * 0.7, p.shoulderX * 2, 6),
      kit.skin,
    ));
    clavicle.rotation.z = Math.PI / 2;
    clavicle.position.y = p.shoulderY + 0.15;
    rig.torso.add(clavicle);

    // Bony arms + block hands
    for (let i = 0; i < 2; i++) {
      rig.shoulders[i].add(bone(p.armUpper, bt, kit));
      rig.elbows[i].add(bone(p.armLower, bt * 0.9, kit));
      const hand = shadowed(new THREE.Mesh(new THREE.BoxGeometry(bt * 2.4, bt * 3, bt * 1.4), kit.skin));
      hand.position.y = -p.armLower - 0.1;
      rig.elbows[i].add(hand);
    }

    // Bony legs + block feet
    for (let i = 0; i < 2; i++) {
      rig.hips[i].add(bone(p.legUpper, bt * 1.2, kit));
      rig.knees[i].add(bone(p.legLower, bt * 1.1, kit));
      const footGeo = new THREE.BoxGeometry(bt * 3, bt * 1.8, bt * 5);
      footGeo.translate(0, -bt * 0.9, bt * 1.4);
      const foot = shadowed(new THREE.Mesh(footGeo, kit.skin));
      foot.position.y = -p.legLower - 0.05;
      rig.knees[i].add(foot);
    }

    return makeResult(scaffold, p, () => { /* cape ripple lives in the back part */ });
  },
};
