// ── Lamia princess: human upper body on a coiled serpent lower half ─────────
//
//  "She stands upright because she decided to. It took three weeks. She would
//  do it again." — the serpent body is a nested chain of tapering segments:
//  three segments dive from the hip to the floor, the rest wind into a ground
//  coil. Nested groups mean one sway ripples down the whole tail naturally.
//  The build self-levels: after assembly the coil's lowest point is measured
//  and the rig is dropped so she always rests exactly on the pedestal.

import * as THREE from 'three';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BodySynthesizer, BuildResult } from './contracts';
import {
  computeProportions, makeScaffold, addPuffSleeves, limbPart, shadowed, makeResult,
} from './shared';

const SEGMENTS = 9;

export const lamiaSynth: BodySynthesizer = {
  archetype: 'lamia',

  build(dna: PrincessDNA, kit: MaterialKit): BuildResult {
    const p = computeProportions(dna);
    // No legs: provisional rest height; self-leveled after the coil is built.
    p.baseY = 4.6;
    const scaffold = makeScaffold(dna, p);
    const { rig, characterGroup } = scaffold;

    // ── Upper body (human-style smooth toon) ──
    const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(p.headR, 32, 24), kit.skin));
    rig.head.add(head);
    const neck = shadowed(new THREE.Mesh(
      new THREE.CylinderGeometry(p.headR * 0.16, p.headR * 0.2, p.headCY - p.neckY, 12),
      kit.skin,
    ));
    neck.position.y = (p.headCY - p.neckY) / 2;
    rig.neck.add(neck);

    const chest = shadowed(new THREE.Mesh(new THREE.SphereGeometry(p.topR * 0.95, 20, 14), kit.primary));
    chest.position.y = 0.75;
    chest.scale.set(1, 0.85, 0.85);
    rig.torso.add(chest);
    if (dna.dress.puffSleeves) addPuffSleeves(kit, p, rig);

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

    // ── Hip wrap (fitted upper garment, flowing lower — the doc's wraps) ──
    const wrap = new THREE.Group();
    wrap.name = 'dress'; // picked up by the 'dress' hover/wheel region
    const wrapGeo = new THREE.CylinderGeometry(
      p.topR * 1.18, p.topR * 1.42 * dna.dress.flare, 1.55, 24,
    );
    const wrapMesh = shadowed(new THREE.Mesh(wrapGeo, kit.primary));
    wrapMesh.position.y = p.hipY + 0.72;
    wrap.add(wrapMesh);
    if (dna.dress.trim) {
      const trimGeo = new THREE.TorusGeometry(p.topR * 1.48 * dna.dress.flare, 0.13, 10, 24);
      trimGeo.rotateX(Math.PI / 2);
      const trim = shadowed(new THREE.Mesh(trimGeo, kit.secondary));
      trim.position.y = p.hipY - 0.35;
      wrap.add(trim);
    }
    if (dna.dress.sash) {
      const sashGeo = new THREE.CylinderGeometry(p.topR * 1.14, p.topR * 1.2, 0.42, 24);
      const sash = shadowed(new THREE.Mesh(sashGeo, kit.accent));
      sash.position.y = 0.35;
      wrap.add(sash);
    }
    rig.torso.add(wrap);

    // ── The serpent ──
    const serpent = new THREE.Group();
    serpent.name = 'serpent';
    serpent.userData.pick = 'body';
    serpent.position.y = p.hipY + 0.25;
    // Swing the dive so the coil winds around her FRONT — the classic
    // "sitting atop her own coil" lamia pose, readable from the camera.
    serpent.rotation.y = 2.25;
    rig.torso.add(serpent);

    const chub = 0.8 + 0.35 * dna.body.chubbiness;
    const lenScale = 0.85 + 0.35 * dna.body.legLength; // legLength = tail length
    interface SegNode { node: THREE.Group; baseTurn: number; basePitch: number }
    const chain: SegNode[] = [];
    let parent: THREE.Object3D = serpent;

    for (let i = 0; i < SEGMENTS; i++) {
      const node = new THREE.Group();
      const segLen = 1.18 * lenScale * (1 - i * 0.045);
      // Dive steeply (staying under her), then wind into the ground coil.
      // Cumulative dive = exactly −π/2 so the coil plane lies flat on the ground
      const pitch = i === 0 ? -1.05 : i === 1 ? -0.35 : i === 2 ? -0.17 : 0;
      const turn = i < 3 ? 0 : 0.98;
      node.position.z = i === 0 ? 0 : -1.18 * lenScale * (1 - (i - 1) * 0.045);
      node.rotation.order = 'YXZ';
      node.rotation.y = turn;
      node.rotation.x = pitch;

      const r = Math.max(0.3, p.topR * 1.15 * chub * (1 - i * 0.09));
      const segGeo = new THREE.SphereGeometry(r, 18, 12);
      segGeo.scale(1, 0.82, 1.4);
      const mesh = shadowed(new THREE.Mesh(segGeo, kit.skin));
      mesh.position.z = -segLen * 0.5;
      node.add(mesh);

      // Spine ridge scales down the back
      if (i < 6) {
        const ridgeGeo = new THREE.ConeGeometry(r * 0.22, r * 0.55, 4);
        const ridge = shadowed(new THREE.Mesh(ridgeGeo, kit.secondary));
        ridge.position.set(0, r * 0.72, -segLen * 0.5);
        ridge.rotation.x = -0.4;
        node.add(ridge);
      }
      // Tail decorations: gold rings wrapped around the body
      if (i === 2 || i === 5) {
        const ringGeo = new THREE.TorusGeometry(r * 0.98, 0.07, 8, 20);
        const ring = shadowed(new THREE.Mesh(ringGeo, kit.metal));
        ring.position.z = -segLen * 0.5;
        node.add(ring);
      }

      parent.add(node);
      chain.push({ node, baseTurn: turn, basePitch: pitch });
      parent = node;
    }
    // Tip: curls up at the end of the coil
    const tipGeo = new THREE.ConeGeometry(0.3, 1.3, 10);
    tipGeo.rotateX(-Math.PI / 2);
    tipGeo.translate(0, 0.12, -0.65);
    const tip = shadowed(new THREE.Mesh(tipGeo, kit.skin));
    tip.position.z = -1.18 * lenScale * (1 - (SEGMENTS - 1) * 0.045);
    tip.rotation.x = 0.5;
    parent.add(tip);

    // ── Self-level: rest the coil exactly on the floor ──
    characterGroup.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(serpent);
    const drop = box.min.y / dna.body.height; // box is world; root scale = height
    rig.root.position.y -= drop;
    rig.baseY = rig.root.position.y;

    const update = (t: number): void => {
      // Sway ripples down the nested chain; the coil breathes.
      for (let i = 0; i < chain.length; i++) {
        const { node, baseTurn, basePitch } = chain[i];
        node.rotation.y = baseTurn + Math.sin(t * 1.35 - i * 0.42) * 0.045;
        if (i >= 3) node.rotation.x = basePitch + Math.sin(t * 1.9 + i) * 0.012;
      }
      tip.rotation.x = 0.5 + Math.sin(t * 2.2) * 0.16;
    };

    return makeResult(scaffold, p, update);
  },
};
