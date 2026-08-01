// ── Body synthesizer contracts ───────────────────────────────────────────────
//  See docs/princess-creator/ARCHITECTURE.md §3.

import type * as THREE from 'three';
import type { Archetype, PrincessDNA } from '../types';
import type { MaterialKit } from '../materials';

export type SocketId =
  | 'headTop' | 'earL' | 'earR' | 'hairBack' | 'face'
  | 'back' | 'tail' | 'handL' | 'handR';

export const SOCKET_IDS: readonly SocketId[] = [
  'headTop', 'earL', 'earR', 'hairBack', 'face', 'back', 'tail', 'handL', 'handR',
];

export type Sockets = Record<SocketId, THREE.Group>;

export interface PrincessRig {
  root: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Object3D;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  hips: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
  baseY: number;
}

/** Derived measurements shared by synths, face and parts (unit scale). */
export interface Proportions {
  headR: number;
  dressH: number;
  hemR: number;
  topR: number;
  shoulderX: number;
  shoulderY: number;
  armUpper: number;
  armLower: number;
  armThick: number;
  hipX: number;
  hipY: number;
  legUpper: number;
  legLower: number;
  legThick: number;
  neckY: number;
  headCY: number;
  baseY: number;
}

export interface BuildResult {
  root: THREE.Group;
  rig: PrincessRig;
  sockets: Sockets;
  proportions: Proportions;
  /** Per-frame: secondary motion + (slime) re-blob. Call AFTER the Animator. */
  update(t: number, dt: number): void;
  dispose(): void;
  /** Optional hooks registered by face/parts/aura modules. */
  hooks: {
    setBlink?: (v: number) => void;
    tick: Array<(t: number, dt: number) => void>;
    /** Extra cleanup (custom materials etc.) run by dispose(). */
    disposers: Array<() => void>;
  };
}

export interface BodySynthesizer {
  readonly archetype: Archetype;
  build(dna: PrincessDNA, kit: MaterialKit): BuildResult;
}
