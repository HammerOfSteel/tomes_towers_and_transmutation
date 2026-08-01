// ── Game animation clips: keyframed, species-aware, exportable ──────────────
//
//  Every clip is declarative data over the shared rig contract (10 rotation
//  joints + root offset/rotation + torso squash), so the SAME clips drive the
//  Atelier preview, the game's PrincessFactory, and the JSON export consumed
//  by external tooling. See docs/princess-creator/ANIMATIONS.md.
//
//  Authoring rules:
//  - Sparse keys: unspecified channels fill from the neutral stance at bake.
//  - Angles in radians, times normalized 0..1 over `duration` seconds.
//  - `events` are game hooks (hit frames, cast release, footsteps).
//  - Chibi principles: anticipation, squash & stretch, snappy arrivals.

import type { PrincessDNA, SpeciesId } from '../types';

export type JointId =
  | 'torso' | 'neck'
  | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR'
  | 'hipL' | 'hipR' | 'kneeL' | 'kneeR';

export const JOINT_IDS: readonly JointId[] = [
  'torso', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR',
  'hipL', 'hipR', 'kneeL', 'kneeR',
];

export type Ease = 'linear' | 'smooth' | 'snap' | 'hold';
export type V3 = readonly [number, number, number];

export interface ClipKey {
  t: number;                                  // 0..1
  ease?: Ease;                                // easing INTO this key (default smooth)
  joints?: Partial<Record<JointId, V3>>;
  rootY?: number;                             // offset from rest height
  rootRot?: V3;
  torsoScale?: number;
}

export interface ClipEvent { t: number; id: string }

export interface ClipDef {
  id: string;
  label: string;
  group: 'locomotion' | 'combat' | 'reaction' | 'misc';
  duration: number;                           // seconds
  loop: boolean;
  /** Death clips hold their final frame until another clip plays. */
  holdLast?: boolean;
  keys: ClipKey[];
  events?: ClipEvent[];
}

export const ANIM_IDS = [
  'idle', 'idle_alt', 'walk', 'run',
  'attack_1', 'attack_2', 'cast_spell_1', 'cast_spell_2',
  'get_hit_1', 'get_hit_2', 'block_1', 'block_2',
  'jump_begin', 'jump_idle', 'jump_land',
  'die_1', 'die_2',
  'victory', 'curtsy', 'stunned', 'read',
  'wave', 'twirl', 'dance',
] as const;
export type AnimId = (typeof ANIM_IDS)[number];

/** Base states the game loops; everything else is a one-shot. */
export const STATE_IDS: readonly AnimId[] = [
  'idle', 'idle_alt', 'walk', 'run', 'jump_idle', 'block_1', 'stunned', 'read',
];

export const NEUTRAL: Required<Pick<ClipKey, 'joints' | 'rootY' | 'rootRot' | 'torsoScale'>> = {
  joints: {
    torso: [0, 0, 0], neck: [0, 0, 0],
    shoulderL: [0.12, 0, 0.52], shoulderR: [0.12, 0, -0.52],
    elbowL: [-0.35, 0, -0.15], elbowR: [-0.35, 0, 0.15],
    hipL: [0.08, 0.18, 0.06], hipR: [0.08, -0.18, -0.06],
    kneeL: [0, 0, 0], kneeR: [0, 0, 0],
  },
  rootY: 0,
  rootRot: [0, 0, 0],
  torsoScale: 1,
};

const k = (t: number, key: Omit<ClipKey, 't'> = {}): ClipKey => ({ t, ...key });

// Convenience partial poses
const ARMS_UP: Partial<Record<JointId, V3>> = {
  shoulderL: [-2.6, 0, 0.5], shoulderR: [-2.6, 0, -0.5],
  elbowL: [-0.2, 0, -0.1], elbowR: [-0.2, 0, 0.1],
};
const GUARD: Partial<Record<JointId, V3>> = {
  shoulderL: [-0.9, 0.5, 0.35], shoulderR: [-0.9, -0.5, -0.35],
  elbowL: [-1.7, 0, -0.25], elbowR: [-1.7, 0, 0.25],
  torso: [0.14, 0, 0],
};

// ── The base library ─────────────────────────────────────────────────────────

export const CLIPS: Record<AnimId, ClipDef> = {
  idle: {
    id: 'idle', label: 'Idle', group: 'locomotion', duration: 3.6, loop: true,
    keys: [
      k(0),
      k(0.25, { joints: { torso: [0, 0, 0.03], neck: [0.02, 0.2, 0.04] } }),
      k(0.5, { joints: { neck: [0.04, 0, -0.02] }, torsoScale: 1.015 }),
      k(0.75, { joints: { torso: [0, 0, -0.03], neck: [0.02, -0.22, -0.05] } }),
      k(1),
    ],
  },
  idle_alt: {
    id: 'idle_alt', label: 'Idle (crown check)', group: 'locomotion', duration: 4.2, loop: true,
    keys: [
      k(0),
      // reach up and straighten the crown — she has standards
      k(0.18, { joints: { shoulderR: [-2.5, -0.3, -0.35], elbowR: [-1.5, 0, 0.4], neck: [0.12, -0.15, 0.06] } }),
      k(0.3, { joints: { shoulderR: [-2.55, -0.3, -0.3], elbowR: [-1.35, 0, 0.35], neck: [0.1, 0.1, -0.04] } }),
      k(0.42, { joints: { shoulderR: [-2.5, -0.3, -0.38], elbowR: [-1.5, 0, 0.42], neck: [0.12, -0.05, 0.05] } }),
      k(0.6, { ease: 'smooth' }),
      k(0.78, { joints: { hipR: [0.5, -0.18, -0.06], kneeR: [0.6, 0, 0], torso: [0, 0, 0.04] } }), // little foot tap
      k(0.86, { joints: { hipR: [0.08, -0.18, -0.06], kneeR: [0, 0, 0] } }),
      k(1),
    ],
  },
  walk: {
    id: 'walk', label: 'Walk', group: 'locomotion', duration: 0.68, loop: true,
    events: [{ t: 0.05, id: 'step' }, { t: 0.55, id: 'step' }],
    keys: [
      k(0, { joints: { hipL: [0.55, 0.05, 0.03], hipR: [-0.5, -0.05, -0.03], kneeR: [0.9, 0, 0], shoulderL: [-0.45, 0, 0.42], shoulderR: [0.5, 0, -0.42], elbowL: [-0.45, 0, -0.1], elbowR: [-0.2, 0, 0.1], torso: [0.04, 0.09, 0.045], neck: [0.06, 0, -0.03] } }),
      k(0.25, { rootY: 0.32, joints: { hipL: [0, 0.05, 0.03], hipR: [0, -0.05, -0.03], kneeR: [0.35, 0, 0], torso: [0.05, 0, 0] } }),
      k(0.5, { joints: { hipL: [-0.5, 0.05, 0.03], hipR: [0.55, -0.05, -0.03], kneeL: [0.9, 0, 0], shoulderL: [0.5, 0, 0.42], shoulderR: [-0.45, 0, -0.42], elbowL: [-0.2, 0, -0.1], elbowR: [-0.45, 0, 0.1], torso: [0.04, -0.09, -0.045], neck: [0.06, 0, 0.03] } }),
      k(0.75, { rootY: 0.32, joints: { hipL: [0, 0.05, 0.03], hipR: [0, -0.05, -0.03], kneeL: [0.35, 0, 0], torso: [0.05, 0, 0] } }),
      k(1, { joints: { hipL: [0.55, 0.05, 0.03], hipR: [-0.5, -0.05, -0.03], kneeR: [0.9, 0, 0], shoulderL: [-0.45, 0, 0.42], shoulderR: [0.5, 0, -0.42], elbowL: [-0.45, 0, -0.1], elbowR: [-0.2, 0, 0.1], torso: [0.04, 0.09, 0.045], neck: [0.06, 0, -0.03] } }),
    ],
  },
  run: {
    id: 'run', label: 'Run', group: 'locomotion', duration: 0.46, loop: true,
    events: [{ t: 0.1, id: 'step' }, { t: 0.6, id: 'step' }],
    keys: [
      k(0, { joints: { torso: [0.32, 0.12, 0.05], hipL: [0.95, 0.05, 0], hipR: [-0.75, -0.05, 0], kneeR: [1.35, 0, 0], shoulderL: [-0.9, 0, 0.3], shoulderR: [0.85, 0, -0.3], elbowL: [-1.1, 0, -0.1], elbowR: [-1.1, 0, 0.1], neck: [-0.1, 0, 0] } }),
      k(0.25, { rootY: 0.55, joints: { torso: [0.3, 0, 0], hipL: [0.2, 0, 0], hipR: [0.1, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.6, 0, 0] } }),
      k(0.5, { joints: { torso: [0.32, -0.12, -0.05], hipL: [-0.75, 0.05, 0], hipR: [0.95, -0.05, 0], kneeL: [1.35, 0, 0], shoulderL: [0.85, 0, 0.3], shoulderR: [-0.9, 0, -0.3], elbowL: [-1.1, 0, -0.1], elbowR: [-1.1, 0, 0.1], neck: [-0.1, 0, 0] } }),
      k(0.75, { rootY: 0.55, joints: { torso: [0.3, 0, 0], hipL: [0.1, 0, 0], hipR: [0.2, 0, 0], kneeL: [0.6, 0, 0], kneeR: [0.4, 0, 0] } }),
      k(1, { joints: { torso: [0.32, 0.12, 0.05], hipL: [0.95, 0.05, 0], hipR: [-0.75, -0.05, 0], kneeR: [1.35, 0, 0], shoulderL: [-0.9, 0, 0.3], shoulderR: [0.85, 0, -0.3], elbowL: [-1.1, 0, -0.1], elbowR: [-1.1, 0, 0.1], neck: [-0.1, 0, 0] } }),
    ],
  },

  attack_1: {
    id: 'attack_1', label: 'Attack: Swipe', group: 'combat', duration: 0.55, loop: false,
    events: [{ t: 0.42, id: 'hit' }],
    keys: [
      k(0),
      // windup: arm back, torso coils
      k(0.3, { joints: { shoulderR: [-0.5, -1.1, -0.9], elbowR: [-1.2, 0, 0.3], torso: [0.06, -0.55, -0.06], neck: [0, 0.35, 0] }, rootY: 0.05 }),
      // strike: fast arrival
      k(0.48, { ease: 'snap', joints: { shoulderR: [-1.15, 0.9, -0.2], elbowR: [-0.25, 0, 0.1], torso: [0.12, 0.6, 0.08], neck: [0.05, -0.3, 0], hipL: [0.3, 0.18, 0.06], hipR: [-0.2, -0.18, -0.06] } }),
      k(0.72, { joints: { shoulderR: [-0.9, 0.7, -0.25], torso: [0.1, 0.45, 0.06] } }),
      k(1),
    ],
  },
  attack_2: {
    id: 'attack_2', label: 'Attack: Overhead', group: 'combat', duration: 0.8, loop: false,
    events: [{ t: 0.55, id: 'hit' }],
    keys: [
      k(0),
      k(0.32, { joints: { ...ARMS_UP, torso: [-0.22, 0, 0], neck: [-0.15, 0, 0] }, rootY: 0.25, torsoScale: 1.04 }),
      k(0.42, { joints: { ...ARMS_UP, torso: [-0.26, 0, 0] }, rootY: 0.3 }),
      k(0.58, { ease: 'snap', rootY: -0.5, torsoScale: 0.94, joints: { shoulderL: [-1.05, 0.3, 0.35], shoulderR: [-1.05, -0.3, -0.35], elbowL: [-0.3, 0, -0.1], elbowR: [-0.3, 0, 0.1], torso: [0.42, 0, 0], neck: [0.2, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], hipL: [0.5, 0.18, 0.06], hipR: [0.5, -0.18, -0.06] } }),
      k(0.8, { rootY: -0.2, joints: { torso: [0.2, 0, 0] } }),
      k(1),
    ],
  },
  cast_spell_1: {
    id: 'cast_spell_1', label: 'Cast: Bolt', group: 'combat', duration: 0.9, loop: false,
    events: [{ t: 0.55, id: 'cast_release' }],
    keys: [
      k(0),
      // gather: hands to chest, slight crouch
      k(0.3, { joints: { shoulderL: [-0.85, 0.65, 0.4], shoulderR: [-0.85, -0.65, -0.4], elbowL: [-1.6, 0, -0.2], elbowR: [-1.6, 0, 0.2], torso: [0.1, 0, 0] }, rootY: -0.15, torsoScale: 0.98 }),
      // release: both palms thrust forward
      k(0.58, { ease: 'snap', joints: { shoulderL: [-1.35, -0.15, 0.25], shoulderR: [-1.35, 0.15, -0.25], elbowL: [-0.1, 0, -0.05], elbowR: [-0.1, 0, 0.05], torso: [0.18, 0, 0], neck: [-0.08, 0, 0] }, rootY: 0.08, torsoScale: 1.03 }),
      k(0.8, { joints: { shoulderL: [-1.2, 0, 0.3], shoulderR: [-1.2, 0, -0.3] } }),
      k(1),
    ],
  },
  cast_spell_2: {
    id: 'cast_spell_2', label: 'Cast: Tempest', group: 'combat', duration: 1.2, loop: false,
    events: [{ t: 0.68, id: 'cast_release' }],
    keys: [
      k(0),
      k(0.25, { joints: { shoulderL: [-0.4, 0, 0.9], shoulderR: [-0.4, 0, -0.9], torso: [0.08, 0, 0] }, rootY: -0.2, torsoScale: 0.97 }),
      // rise: arms sweep skyward, feet leave the ground
      k(0.55, { joints: { ...ARMS_UP, torso: [-0.18, 0, 0], neck: [-0.25, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0] }, rootY: 0.75, torsoScale: 1.06 }),
      k(0.7, { ease: 'snap', joints: { ...ARMS_UP, torso: [-0.2, 0, 0] }, rootY: 0.85 }),
      // settle
      k(0.88, { rootY: 0, joints: { shoulderL: [-0.3, 0, 0.55], shoulderR: [-0.3, 0, -0.55] } }),
      k(1),
    ],
  },

  get_hit_1: {
    id: 'get_hit_1', label: 'Hit: Flinch', group: 'reaction', duration: 0.4, loop: false,
    keys: [
      k(0),
      k(0.2, { ease: 'snap', joints: { torso: [-0.3, 0, 0], neck: [-0.35, 0, 0.1], shoulderL: [0.4, 0, 0.7], shoulderR: [0.4, 0, -0.7] }, rootY: -0.12, torsoScale: 0.96 }),
      k(0.55, { joints: { torso: [-0.12, 0, 0], neck: [-0.1, 0, 0] } }),
      k(1),
    ],
  },
  get_hit_2: {
    id: 'get_hit_2', label: 'Hit: Stagger', group: 'reaction', duration: 0.5, loop: false,
    keys: [
      k(0),
      k(0.18, { ease: 'snap', joints: { torso: [0.05, 0.25, 0.3], neck: [0.05, 0.3, 0.2], hipL: [0.35, 0.2, 0.1], kneeL: [0.5, 0, 0] }, rootY: -0.15 }),
      k(0.5, { joints: { torso: [0.02, 0.1, 0.12] } }),
      k(1),
    ],
  },
  block_1: {
    id: 'block_1', label: 'Block (hold)', group: 'combat', duration: 1.2, loop: true,
    keys: [
      k(0, { joints: GUARD, rootY: -0.1 }),
      k(0.5, { joints: { ...GUARD, torso: [0.16, 0, 0.015] }, rootY: -0.12, torsoScale: 1.01 }),
      k(1, { joints: GUARD, rootY: -0.1 }),
    ],
  },
  block_2: {
    id: 'block_2', label: 'Block: Deflect', group: 'combat', duration: 0.5, loop: false,
    events: [{ t: 0.3, id: 'parry' }],
    keys: [
      k(0, { joints: GUARD, rootY: -0.1 }),
      k(0.28, { ease: 'snap', joints: { shoulderL: [-1.3, 0.8, 0.7], elbowL: [-1.1, 0, -0.3], torso: [0.1, 0.35, 0.08], neck: [0, 0.2, 0] }, rootY: 0.02 }),
      k(0.6, { joints: GUARD, rootY: -0.1 }),
      k(1),
    ],
  },

  jump_begin: {
    id: 'jump_begin', label: 'Jump: Launch', group: 'locomotion', duration: 0.3, loop: false,
    events: [{ t: 0.55, id: 'liftoff' }],
    keys: [
      k(0),
      k(0.4, { joints: { kneeL: [0.9, 0, 0], kneeR: [0.9, 0, 0], hipL: [0.7, 0.18, 0.06], hipR: [0.7, -0.18, -0.06], torso: [0.28, 0, 0], shoulderL: [0.7, 0, 0.4], shoulderR: [0.7, 0, -0.4] }, rootY: -0.75, torsoScale: 0.92 }),
      k(1, { ease: 'snap', joints: { ...ARMS_UP, kneeL: [0.2, 0, 0], kneeR: [0.2, 0, 0], torso: [-0.1, 0, 0] }, rootY: 1.3, torsoScale: 1.07 }),
    ],
  },
  jump_idle: {
    id: 'jump_idle', label: 'Jump: Airborne', group: 'locomotion', duration: 0.7, loop: true,
    keys: [
      k(0, { rootY: 1.1, joints: { kneeL: [0.85, 0, 0], kneeR: [0.85, 0, 0], hipL: [0.45, 0.18, 0.06], hipR: [0.45, -0.18, -0.06], shoulderL: [-1.6, 0, 0.6], shoulderR: [-1.6, 0, -0.6], torso: [0.06, 0, 0] } }),
      k(0.5, { rootY: 1.25, joints: { kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], torso: [0.02, 0, 0] } }),
      k(1, { rootY: 1.1, joints: { kneeL: [0.85, 0, 0], kneeR: [0.85, 0, 0], hipL: [0.45, 0.18, 0.06], hipR: [0.45, -0.18, -0.06], shoulderL: [-1.6, 0, 0.6], shoulderR: [-1.6, 0, -0.6], torso: [0.06, 0, 0] } }),
    ],
  },
  jump_land: {
    id: 'jump_land', label: 'Jump: Land', group: 'locomotion', duration: 0.32, loop: false,
    events: [{ t: 0.15, id: 'land' }],
    keys: [
      k(0, { rootY: 0.6, joints: { kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0] } }),
      k(0.35, { ease: 'snap', rootY: -0.55, torsoScale: 0.9, joints: { kneeL: [1.0, 0, 0], kneeR: [1.0, 0, 0], hipL: [0.6, 0.18, 0.06], hipR: [0.6, -0.18, -0.06], torso: [0.3, 0, 0], shoulderL: [0.5, 0, 0.6], shoulderR: [0.5, 0, -0.6] } }),
      k(0.7, { rootY: 0.06, torsoScale: 1.03 }),
      k(1),
    ],
  },

  die_1: {
    id: 'die_1', label: 'Defeat: Swoon', group: 'reaction', duration: 1.2, loop: false, holdLast: true,
    keys: [
      k(0),
      // the classic: back of hand to forehead
      k(0.18, { joints: { shoulderR: [-2.6, -0.4, -0.3], elbowR: [-1.9, 0, 0.5], neck: [-0.25, 0, 0.06], torso: [-0.12, 0, 0.02] } }),
      k(0.45, { joints: { torso: [-0.18, 0, -0.08], kneeL: [0.7, 0, 0], kneeR: [0.7, 0, 0], hipL: [0.35, 0.18, 0.06], hipR: [0.35, -0.18, -0.06] }, rootY: -0.15 }),
      // knees give out — sinks into a seated slump
      k(0.72, { ease: 'snap', rootY: -0.95, joints: { kneeL: [2.1, 0, 0], kneeR: [2.1, 0, 0], hipL: [1.0, 0.15, 0.05], hipR: [1.0, -0.15, -0.05], torso: [-0.3, 0, -0.12], neck: [-0.5, 0, 0.15], shoulderL: [0.15, 0, 0.75], shoulderR: [0.1, 0, -0.85], elbowL: [-0.2, 0, -0.1], elbowR: [-0.15, 0, 0.1] } }),
      k(1, { rootRot: [-0.22, 0, 0.08], rootY: -1.05, torsoScale: 0.99, joints: { neck: [-0.6, 0, 0.2], torso: [-0.35, 0, -0.14] } }),
    ],
  },
  die_2: {
    id: 'die_2', label: 'Defeat: Crumple', group: 'reaction', duration: 1.3, loop: false, holdLast: true,
    keys: [
      k(0),
      k(0.25, { joints: { torso: [0.35, 0, 0], neck: [0.3, 0, 0], shoulderL: [0.2, 0, 0.3], shoulderR: [0.2, 0, -0.3] }, rootY: -0.2 }),
      // to her knees
      k(0.5, { joints: { kneeL: [1.5, 0, 0], kneeR: [1.5, 0, 0], hipL: [0.9, 0.1, 0.03], hipR: [0.9, -0.1, -0.03], torso: [0.5, 0, 0], neck: [0.45, 0, 0] }, rootY: -1.4 }),
      k(0.72, { joints: { torso: [0.65, 0.08, 0.05], neck: [0.55, 0, 0] }, rootY: -1.5 }),
      k(1, { ease: 'snap', rootRot: [1.1, 0.12, 0], rootY: -1.7, joints: { torso: [0.7, 0.08, 0.05], shoulderL: [-0.6, 0, 0.9], shoulderR: [-0.6, 0, -0.9] } }),
    ],
  },

  victory: {
    id: 'victory', label: 'Victory!', group: 'misc', duration: 1.4, loop: false,
    keys: [
      k(0),
      k(0.2, { joints: { kneeL: [0.6, 0, 0], kneeR: [0.6, 0, 0], torso: [0.15, 0, 0] }, rootY: -0.4, torsoScale: 0.95 }),
      k(0.42, { ease: 'snap', joints: { ...ARMS_UP, torso: [-0.1, 0, 0], neck: [-0.2, 0, 0.08] }, rootY: 1.5, torsoScale: 1.06 }),
      k(0.62, { joints: { ...ARMS_UP }, rootY: 0.1 }),
      k(0.8, { joints: { shoulderL: [-2.4, 0, 0.6], shoulderR: [-2.4, 0, -0.6], neck: [0, 0, 0.1] }, rootY: 0.35, rootRot: [0, 1.2, 0] }),
      k(1, { rootRot: [0, 0, 0] }),
    ],
  },
  curtsy: {
    id: 'curtsy', label: 'Curtsy', group: 'misc', duration: 1.2, loop: false,
    keys: [
      k(0),
      k(0.3, { joints: { hipR: [-0.5, -0.5, -0.15], kneeR: [1.1, 0, 0], kneeL: [0.5, 0, 0], torso: [0.22, 0, 0], neck: [0.3, 0, 0], shoulderL: [0.15, 0, 0.95], shoulderR: [0.15, 0, -0.95], elbowL: [-0.5, 0, -0.3], elbowR: [-0.5, 0, 0.3] }, rootY: -0.75 }),
      k(0.55, { joints: { hipR: [-0.5, -0.5, -0.15], kneeR: [1.1, 0, 0], kneeL: [0.5, 0, 0], torso: [0.24, 0, 0], neck: [0.34, 0, 0] }, rootY: -0.8 }),
      k(0.85, {}),
      k(1),
    ],
  },
  stunned: {
    id: 'stunned', label: 'Stunned', group: 'reaction', duration: 1.6, loop: true,
    keys: [
      k(0, { joints: { neck: [0.15, 0, 0.2], torso: [0.06, 0, 0.08], shoulderL: [0.3, 0, 0.75], shoulderR: [0.3, 0, -0.75] }, rootY: -0.15 }),
      k(0.25, { joints: { neck: [0.28, 0.25, 0], torso: [0.1, 0.06, 0] } }),
      k(0.5, { joints: { neck: [0.15, 0, -0.2], torso: [0.06, 0, -0.08] }, rootY: -0.18 }),
      k(0.75, { joints: { neck: [0.28, -0.25, 0], torso: [0.1, -0.06, 0] } }),
      k(1, { joints: { neck: [0.15, 0, 0.2], torso: [0.06, 0, 0.08], shoulderL: [0.3, 0, 0.75], shoulderR: [0.3, 0, -0.75] }, rootY: -0.15 }),
    ],
  },
  read: {
    id: 'read', label: 'Reading', group: 'misc', duration: 3.4, loop: true,
    keys: [
      k(0, { joints: { shoulderL: [-1.15, 0.45, 0.3], shoulderR: [-1.15, -0.45, -0.3], elbowL: [-1.25, 0, -0.15], elbowR: [-1.25, 0, 0.15], neck: [0.4, 0, 0], torso: [0.1, 0, 0] } }),
      k(0.45, { joints: { neck: [0.42, 0.08, 0.02], torso: [0.11, 0, 0.01] } }),
      // page turn
      k(0.58, { joints: { shoulderR: [-1.3, -0.2, -0.25], elbowR: [-0.9, 0, 0.3], neck: [0.38, 0.05, 0] } }),
      k(0.68, { joints: { shoulderR: [-1.15, -0.45, -0.3], elbowR: [-1.25, 0, 0.15] } }),
      k(1, { joints: { shoulderL: [-1.15, 0.45, 0.3], shoulderR: [-1.15, -0.45, -0.3], elbowL: [-1.25, 0, -0.15], elbowR: [-1.25, 0, 0.15], neck: [0.4, 0, 0], torso: [0.1, 0, 0] } }),
    ],
  },
  wave: {
    id: 'wave', label: 'Wave', group: 'misc', duration: 2.0, loop: false,
    keys: [
      k(0),
      k(0.2, { joints: { shoulderR: [-0.15, 0, -2.35], neck: [0, 0, 0.12] } }),
      k(0.35, { joints: { shoulderR: [-0.15, 0, -2.35], elbowR: [-0.5, 0, 0.5], neck: [0, 0, 0.12] } }),
      k(0.5, { joints: { shoulderR: [-0.15, 0, -2.35], elbowR: [-0.5, 0, -0.35] } }),
      k(0.65, { joints: { shoulderR: [-0.15, 0, -2.35], elbowR: [-0.5, 0, 0.5] } }),
      k(0.8, { joints: { shoulderR: [-0.15, 0, -2.35], elbowR: [-0.5, 0, -0.35] } }),
      k(1),
    ],
  },
  twirl: {
    id: 'twirl', label: 'Twirl', group: 'misc', duration: 1.9, loop: false,
    keys: [
      k(0),
      k(0.2, { joints: { shoulderL: [0, 0, 1.5], shoulderR: [0, 0, -1.5] }, rootY: 0.1 }),
      k(0.5, { joints: { shoulderL: [0, 0, 1.5], shoulderR: [0, 0, -1.5] }, rootRot: [0, Math.PI * 2, 0], rootY: 0.5 }),
      k(0.8, { ease: 'smooth', joints: { shoulderL: [0, 0, 1.5], shoulderR: [0, 0, -1.5] }, rootRot: [0, Math.PI * 4, 0], rootY: 0.1 }),
      k(1, { rootRot: [0, Math.PI * 4, 0] }),
    ],
  },
  dance: {
    id: 'dance', label: 'Dance', group: 'misc', duration: 2.6, loop: false,
    keys: [
      k(0),
      k(0.125, { rootY: 0.45, joints: { shoulderL: [-1.2, 0, 0.7], shoulderR: [0.5, 0, -0.7], torso: [0.05, 0, 0.09], neck: [0, 0, 0.12] } }),
      k(0.25, { rootY: 0, joints: { shoulderL: [0.5, 0, 0.7], shoulderR: [-1.2, 0, -0.7], torso: [0.05, 0, -0.09], neck: [0, 0, -0.12] } }),
      k(0.375, { rootY: 0.45, joints: { shoulderL: [-1.2, 0, 0.7], shoulderR: [0.5, 0, -0.7], torso: [0.05, 0, 0.09] } }),
      k(0.5, { rootY: 0, joints: { shoulderL: [0.5, 0, 0.7], shoulderR: [-1.2, 0, -0.7], torso: [0.05, 0, -0.09] } }),
      k(0.625, { rootY: 0.45, joints: { shoulderL: [-1.2, 0, 0.7], shoulderR: [0.5, 0, -0.7], torso: [0.05, 0, 0.09] } }),
      k(0.75, { rootY: 0, joints: { shoulderL: [0.5, 0, 0.7], shoulderR: [-1.2, 0, -0.7], torso: [0.05, 0, -0.09] } }),
      k(0.875, { rootY: 0.5, joints: { ...ARMS_UP, torso: [0, 0, 0] } }),
      k(1),
    ],
  },
};

// ── Species overrides ────────────────────────────────────────────────────────
//
//  Full clip replacements (lamia slither, slime melt, skeleton collapse) and
//  per-species playback speed. Everything else inherits the base set.

export interface SpeciesAnim {
  speed?: number;                                  // global playback multiplier
  replace?: Partial<Record<AnimId, ClipDef>>;
}

const LAMIA_SLITHER: ClipDef = {
  id: 'walk', label: 'Slither', group: 'locomotion', duration: 0.9, loop: true,
  keys: [
    k(0, { joints: { torso: [0.06, 0.22, 0.06], neck: [0.03, -0.12, -0.03] }, rootY: 0.08 }),
    k(0.25, { joints: { torso: [0.08, 0, 0] }, rootY: 0.18 }),
    k(0.5, { joints: { torso: [0.06, -0.22, -0.06], neck: [0.03, 0.12, 0.03] }, rootY: 0.08 }),
    k(0.75, { joints: { torso: [0.08, 0, 0] }, rootY: 0.18 }),
    k(1, { joints: { torso: [0.06, 0.22, 0.06], neck: [0.03, -0.12, -0.03] }, rootY: 0.08 }),
  ],
};

const SPECIES_ANIM: Partial<Record<SpeciesId, SpeciesAnim>> = {
  lamia: {
    speed: 0.95,
    replace: {
      walk: LAMIA_SLITHER,
      run: { ...LAMIA_SLITHER, id: 'run', label: 'Slither (fast)', duration: 0.55 },
      jump_begin: {
        id: 'jump_begin', label: 'Coil Spring', group: 'locomotion', duration: 0.34, loop: false,
        events: [{ t: 0.6, id: 'liftoff' }],
        keys: [
          k(0),
          k(0.45, { rootY: -0.9, torsoScale: 0.9, joints: { torso: [0.3, 0, 0], shoulderL: [0.6, 0, 0.5], shoulderR: [0.6, 0, -0.5] } }),
          k(1, { ease: 'snap', rootY: 1.4, torsoScale: 1.08, joints: { ...ARMS_UP, torso: [-0.12, 0, 0] } }),
        ],
      },
      jump_land: {
        id: 'jump_land', label: 'Coil Settle', group: 'locomotion', duration: 0.36, loop: false,
        events: [{ t: 0.2, id: 'land' }],
        keys: [
          k(0, { rootY: 0.6 }),
          k(0.4, { ease: 'snap', rootY: -0.6, torsoScale: 0.9, joints: { torso: [0.3, 0, 0] } }),
          k(1),
        ],
      },
    },
  },
  slime: {
    replace: {
      die_1: {
        id: 'die_1', label: 'Defeat: Melt', group: 'reaction', duration: 1.4, loop: false, holdLast: true,
        keys: [
          k(0),
          k(0.25, { joints: { neck: [0.3, 0, 0.1] }, rootY: -0.3, torsoScale: 1.05 }),
          k(0.6, { rootY: -2.2, torsoScale: 1.25, joints: { torso: [0.15, 0, 0], shoulderL: [0.5, 0, 1.1], shoulderR: [0.5, 0, -1.1] } }),
          k(1, { ease: 'smooth', rootY: -3.6, torsoScale: 1.45, joints: { neck: [0.6, 0, 0] } }),
        ],
      },
    },
  },
  skeleton: {
    replace: {
      die_2: {
        id: 'die_2', label: 'Defeat: Collapse', group: 'reaction', duration: 1.0, loop: false, holdLast: true,
        keys: [
          k(0),
          k(0.2, { joints: { torso: [0, 0, 0.12], neck: [0, 0, 0.2] } }),
          k(0.35, { joints: { torso: [0, 0, -0.14], neck: [0, 0, -0.22] } }),
          // the magic gives out: straight down into a pile
          k(0.6, { ease: 'snap', rootY: -2.6, torsoScale: 0.85, joints: { kneeL: [2.0, 0, 0], kneeR: [2.0, 0, 0], hipL: [1.2, 0.2, 0.1], hipR: [1.2, -0.2, -0.1], torso: [0.5, 0, 0.1], neck: [0.6, 0, 0.25], shoulderL: [0.2, 0, 1.2], shoulderR: [0.2, 0, -1.2] } }),
          k(1, { rootY: -2.75, torsoScale: 0.82, joints: { neck: [0.7, 0, 0.3] } }),
        ],
      },
    },
  },
  troll: { speed: 0.78 },
  pixie: { speed: 1.15 },
  goblin: { speed: 1.1 },
  gnome: { speed: 1.05 },
  moonborn: { speed: 0.9 },
  specter: { speed: 0.88 },
};

// ── Baking & resolution ──────────────────────────────────────────────────────

export interface BakedKey {
  t: number;
  ease: Ease;
  joints: Record<JointId, V3>;
  rootY: number;
  rootRot: V3;
  torsoScale: number;
}

export interface BakedClip {
  id: AnimId;
  label: string;
  group: ClipDef['group'];
  duration: number;
  loop: boolean;
  holdLast: boolean;
  keys: BakedKey[];
  events: ClipEvent[];
}

/** Fill sparse channels: value at a key = interpolate between the nearest
 *  keys that specify it (or neutral when none do), so runtime sampling is a
 *  plain lerp between adjacent fully-specified keys. */
export function bakeClip(def: ClipDef): BakedClip {
  // A key with no channels at all (`k(0)`, `k(1, { ease })`) is an explicit
  // full-neutral anchor — the pose returns home there, rather than the
  // nearest specified value bleeding outward across it.
  const keys = [...def.keys]
    .sort((a, b) => a.t - b.t)
    .map((key) => {
      const empty = !key.joints && key.rootY === undefined
        && key.rootRot === undefined && key.torsoScale === undefined;
      return empty
        ? { ...key, joints: NEUTRAL.joints, rootY: NEUTRAL.rootY, rootRot: NEUTRAL.rootRot, torsoScale: NEUTRAL.torsoScale }
        : key;
    });

  const channel = <T>(get: (key: ClipKey) => T | undefined, neutral: T, lerp: (a: T, b: T, u: number) => T): T[] => {
    const known: Array<{ i: number; v: T }> = [];
    keys.forEach((key, i) => {
      const v = get(key);
      if (v !== undefined) known.push({ i, v });
    });
    return keys.map((_key, i) => {
      if (known.length === 0) return neutral;
      const after = known.find((e) => e.i >= i);
      const before = [...known].reverse().find((e) => e.i <= i);
      if (before && after && before.i !== after.i) {
        const u = (keys[i].t - keys[before.i].t) / (keys[after.i].t - keys[before.i].t || 1);
        return lerp(before.v, after.v, u);
      }
      return (before ?? after)!.v;
    });
  };

  const lerpV3 = (a: V3, b: V3, u: number): V3 =>
    [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const lerpN = (a: number, b: number, u: number): number => a + (b - a) * u;

  const jointTracks = {} as Record<JointId, V3[]>;
  for (const j of JOINT_IDS) {
    jointTracks[j] = channel((key) => key.joints?.[j], NEUTRAL.joints[j] as V3, lerpV3);
  }
  const rootYs = channel((key) => key.rootY, NEUTRAL.rootY, lerpN);
  const rootRots = channel((key) => key.rootRot, NEUTRAL.rootRot, lerpV3);
  const scales = channel((key) => key.torsoScale, NEUTRAL.torsoScale, lerpN);

  return {
    id: def.id as AnimId,
    label: def.label,
    group: def.group,
    duration: def.duration,
    loop: def.loop,
    holdLast: def.holdLast ?? false,
    events: def.events ?? [],
    keys: keys.map((key, i) => ({
      t: key.t,
      ease: key.ease ?? 'smooth',
      joints: Object.fromEntries(JOINT_IDS.map((j) => [j, jointTracks[j][i]])) as Record<JointId, V3>,
      rootY: rootYs[i],
      rootRot: rootRots[i],
      torsoScale: scales[i],
    })),
  };
}

export type ClipSet = Record<AnimId, BakedClip>;

export interface AnimTweak { speed?: number; amp?: number }
export type TweakMap = Partial<Record<AnimId, AnimTweak>>;

/** Resolve the final clip set for a princess: base → species → tweaks. */
export function resolveClips(dna: PrincessDNA, tweaks: TweakMap = {}): ClipSet {
  const speciesAnim = SPECIES_ANIM[dna.species] ?? {};
  const speed = (speciesAnim.speed ?? 1) * (0.85 + dna.motion.energy * 0.3);
  const set = {} as ClipSet;
  for (const id of ANIM_IDS) {
    const def = speciesAnim.replace?.[id] ?? CLIPS[id];
    const baked = bakeClip(def);
    const tweak = tweaks[id] ?? {};
    baked.duration = baked.duration / (speed * (tweak.speed ?? 1));
    const amp = tweak.amp ?? 1;
    if (amp !== 1) {
      for (const key of baked.keys) {
        for (const j of JOINT_IDS) {
          const n = NEUTRAL.joints[j] as V3;
          const v = key.joints[j];
          key.joints[j] = [
            n[0] + (v[0] - n[0]) * amp,
            n[1] + (v[1] - n[1]) * amp,
            n[2] + (v[2] - n[2]) * amp,
          ];
        }
        key.rootY *= amp;
      }
    }
    set[id] = baked;
  }
  return set;
}

export function speciesAnimInfo(species: SpeciesId): SpeciesAnim {
  return SPECIES_ANIM[species] ?? {};
}
