// ── PrincessFactory: the game-facing façade ──────────────────────────────────
//
//  The ONLY module the main game should import from the Atelier
//  (docs/princess-creator/INTEGRATION.md, path A). Zero DOM/UI dependencies —
//  give it DNA (object or share code), get a living princess.
//
//  import { buildPrincess } from '@/princess-creator/factory';
//  const p = buildPrincess('P2.…', { targetHeight: 1.6 });
//  scene.add(p.root);           // each frame: p.update(t, dt)

import * as THREE from 'three';
import type { PrincessDNA } from './types';
import { sanitizeDna, shareCodeToDna, cloneDna } from './dna';
import { createMaterialKit } from './materials';
import { composePrincess } from './compose';
import { Animator, type EmoteId } from './animate';
import type { PrincessRig, Sockets } from './synth/contracts';

export interface PrincessInstance {
  root: THREE.Group;
  dna: PrincessDNA;
  rig: PrincessRig;
  sockets: Sockets;
  /** Call every frame: drives idle/walk/emotes + secondary motion + slime re-blob. */
  update(t: number, dt: number): void;
  playEmote(id: EmoteId): void;
  setWalking(on: boolean): void;
  dispose(): void;
}

export interface FactoryOptions {
  /** Rescale so the full build stands this many world units tall (game: ~1.6). */
  targetHeight?: number;
  /** false → skip the built-in Animator (drive the rig yourself). Default true. */
  animate?: boolean;
}

export function buildPrincess(
  source: PrincessDNA | string,
  opts: FactoryOptions = {},
): PrincessInstance {
  const dna = typeof source === 'string'
    ? shareCodeToDna(source)
    : sanitizeDna(cloneDna(source));
  if (!dna) throw new Error('buildPrincess: invalid share code');

  const kit = createMaterialKit(dna);
  const result = composePrincess(dna, kit);

  if (opts.targetHeight && opts.targetHeight > 0) {
    result.root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(result.root);
    const h = box.max.y - box.min.y;
    if (h > 0.001) result.root.scale.multiplyScalar(opts.targetHeight / h);
  }

  const animator = opts.animate === false ? null : new Animator();
  animator?.bind(result, dna);

  return {
    root: result.root,
    dna,
    rig: result.rig,
    sockets: result.sockets,
    update(t, dt) {
      animator?.update(t);
      result.update(t, dt);
    },
    playEmote(id) {
      animator?.playEmote(id);
    },
    setWalking(on) {
      animator?.setWalking(on);
    },
    dispose() {
      result.dispose();
      kit.dispose();
    },
  };
}
