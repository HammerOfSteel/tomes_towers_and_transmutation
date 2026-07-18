// ── Slime princess: true Spore-style metaball body ───────────────────────────
//
//  The body is a MarchingCubes isosurface re-blobbed EVERY FRAME from the
//  current world positions of the rig joints (slime POC lineage) — which is
//  why the jelly squashes, stretches and wobbles for free while the Animator
//  just rotates ordinary joints. Sockets ride the same joints, so crowns and
//  eyes track the blob automatically.

import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import type { PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';
import type { BodySynthesizer, BuildResult } from './contracts';
import { computeProportions, makeScaffold, shadowed, makeResult } from './shared';

const RESOLUTION = 40;
const MAX_POLYS = 30000;
const SUBTRACT = 12;

export const slimeSynth: BodySynthesizer = {
  archetype: 'slime',

  build(dna: PrincessDNA, kit: MaterialKit): BuildResult {
    const p = computeProportions(dna);
    const scaffold = makeScaffold(dna, p);
    const { rig, characterGroup } = scaffold;

    // ── Marching cubes volume ──
    // Local box: [-volR, +volR]³ centered at y = volY (covers the whole body).
    const volR = 9.5;
    const volY = 7.5;
    const mc = new MarchingCubes(RESOLUTION, kit.skin, false, false, MAX_POLYS);
    mc.name = 'slimeBody';
    mc.position.y = volY;
    mc.scale.setScalar(volR);
    mc.isolation = 60;
    mc.castShadow = true;
    mc.receiveShadow = true;
    mc.frustumCulled = false;
    characterGroup.add(mc);

    // Inner glow core (a little heart of the slime)
    const core = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), kit.glow));
    core.visible = dna.species.coreGlow > 0.03;
    core.scale.setScalar(0.6 + dna.species.coreGlow * 0.7);
    rig.torso.add(core);

    // ── Blob math ──
    const chub = 0.85 + 0.35 * dna.body.chubbiness;
    const v = new THREE.Vector3();

    // POC strengths were tuned for a volume of world half-extent 15. Ball
    // radii in normalized field units depend only on strength/subtract, so a
    // tighter volume shrinks balls in world space — compensate quadratically.
    const STRENGTH_SCALE = (15 / volR) ** 2;

    const addBlobLocal = (local: THREE.Vector3, strength: number): void => {
      const x = (local.x - mc.position.x) / (volR * 2) + 0.5;
      const y = (local.y - mc.position.y) / (volR * 2) + 0.5;
      const z = (local.z - mc.position.z) / (volR * 2) + 0.5;
      if (x > 0.06 && x < 0.94 && y > 0.06 && y < 0.94 && z > 0.06 && z < 0.94) {
        mc.addBall(x, y, z, strength * STRENGTH_SCALE, SUBTRACT);
      }
    };

    /** World position of `obj` (+ local offset) → characterGroup space → blob. */
    const blobAt = (obj: THREE.Object3D, offX: number, offY: number, offZ: number, strength: number): void => {
      v.set(offX, offY, offZ);
      obj.localToWorld(v);
      characterGroup.worldToLocal(v);
      addBlobLocal(v, strength);
    };

    const wobbleAmp = dna.species.wobble;

    const update = (t: number): void => {
      characterGroup.updateWorldMatrix(true, true);
      mc.reset();

      const wob = (i: number): number => 1 + Math.sin(t * 3.1 + i * 1.7) * 0.08 * wobbleAmp;

      // Head (+ hair volumes)
      const headS = 0.088 * p.headR;
      blobAt(rig.head, 0, 0, 0, headS * wob(0));
      const hs = dna.hair.style;
      if (hs === 'twintails' || hs === 'pigtails') {
        const sway = Math.sin(t * 2) * 0.28 * (0.5 + wobbleAmp);
        const hx = p.headR * 0.95;
        const hy = -p.headR * 0.35 - dna.hair.length * 0.4;
        blobAt(rig.head, -hx, hy, -0.5 + sway, headS * 0.42 * dna.hair.length);
        blobAt(rig.head, hx, hy, -0.5 - sway, headS * 0.42 * dna.hair.length);
      } else if (hs === 'bun') {
        blobAt(rig.head, 0, p.headR * 0.75, -p.headR * 0.35, headS * 0.38);
      } else if (hs === 'long' || hs === 'bob') {
        blobAt(rig.head, 0, -p.headR * 0.15, -p.headR * 0.72, headS * 0.5 * dna.hair.length);
      }

      // Torso column (+ neck connector so head and body always merge)
      const chestS = 0.08 * chub;
      blobAt(rig.neck, 0, (p.headCY - p.neckY) * 0.45, 0, chestS * 0.6);
      blobAt(rig.torso, 0, 0.4, 0, chestS * wob(1));
      blobAt(rig.torso, 0, p.hipY * 0.45, 0, chestS * 0.88 * wob(2));
      blobAt(rig.torso, 0, p.hipY, 0, 0.1 * chub * wob(3));

      // Jelly skirt ring (the "dress")
      const skirtR = p.hemR * 0.5 * dna.dress.flare;
      const skirtY = p.hipY - 1.15 * dna.dress.length;
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2; // static ring, wobble via strength
        blobAt(rig.torso, Math.cos(a) * skirtR, skirtY, Math.sin(a) * skirtR, 0.058 * dna.dress.flare * wob(4 + i));
      }
      blobAt(rig.torso, 0, skirtY - 0.3, 0, 0.062 * dna.dress.flare);

      // Arms: shoulder → elbow → hand (+ midpoints), all riding the joints
      const armS = 0.028 * chub;
      for (let i = 0; i < 2; i++) {
        blobAt(rig.shoulders[i], 0, 0, 0, armS * 1.15);
        blobAt(rig.shoulders[i], 0, -p.armUpper * 0.5, 0, armS * 0.95);
        blobAt(rig.elbows[i], 0, 0, 0, armS * 0.85);
        blobAt(rig.elbows[i], 0, -p.armLower * 0.55, 0, armS * 0.8);
        blobAt(rig.elbows[i], 0, -p.armLower, 0.1, armS * 1.0); // cute mitt
      }

      // Legs: hip → knee → foot
      const legS = 0.034 * chub;
      for (let i = 0; i < 2; i++) {
        blobAt(rig.hips[i], 0, 0, 0, legS * 1.15);
        blobAt(rig.hips[i], 0, -p.legUpper * 0.5, 0, legS * 0.95);
        blobAt(rig.knees[i], 0, 0, 0, legS * 0.9);
        blobAt(rig.knees[i], 0, -p.legLower * 0.55, 0, legS * 0.85);
        blobAt(rig.knees[i], 0, -p.legLower, 0.15, legS * 1.1); // foot blob
      }

      mc.update();
    };

    // Prime once so the first rendered frame has a body.
    update(0);

    return makeResult(scaffold, p, update, () => {
      mc.geometry.dispose();
    });
  },
};
