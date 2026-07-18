// ── Princess Creator: DNA types ──────────────────────────────────────────────
//
//  Pure data — no three.js imports here. The DNA is the single source of truth
//  for a princess. See docs/princess-creator/DNA_SCHEMA.md.

export type Archetype = 'human' | 'fox' | 'slime' | 'skeleton';
export const ARCHETYPES: readonly Archetype[] = ['human', 'fox', 'slime', 'skeleton'];

export type DressStyle = 'bell' | 'aline' | 'hex' | 'layered' | 'slim';
export type EyeStyle =
  | 'sparkle' | 'round' | 'lash' | 'sleepy' | 'star' | 'glow' | 'void' | 'button';
export type MouthStyle = 'smile' | 'open' | 'cat' | 'pout' | 'fang' | 'teeth' | 'none';
export type HairStyle = 'none' | 'bob' | 'pigtails' | 'twintails' | 'bun' | 'long';
export type CrownId = 'none' | 'classic' | 'tiara' | 'crooked' | 'flower' | 'halo';
export type EarId = 'none' | 'fox' | 'cat' | 'round' | 'long';
export type TailId = 'none' | 'fluffy' | 'thin' | 'bone' | 'wisp';
export type BackId = 'none' | 'bow' | 'cape' | 'wings';
export type HandItemId = 'none' | 'wand' | 'staff' | 'fan' | 'tome';
export type IdleStyle = 'sway' | 'bob' | 'float' | 'rattle';

export const DRESS_STYLES: readonly DressStyle[] = ['bell', 'aline', 'hex', 'layered', 'slim'];
export const EYE_STYLES: readonly EyeStyle[] = ['sparkle', 'round', 'lash', 'sleepy', 'star', 'glow', 'void', 'button'];
export const MOUTH_STYLES: readonly MouthStyle[] = ['smile', 'open', 'cat', 'pout', 'fang', 'teeth', 'none'];
export const HAIR_STYLES: readonly HairStyle[] = ['none', 'bob', 'pigtails', 'twintails', 'bun', 'long'];
export const CROWN_IDS: readonly CrownId[] = ['none', 'classic', 'tiara', 'crooked', 'flower', 'halo'];
export const EAR_IDS: readonly EarId[] = ['none', 'fox', 'cat', 'round', 'long'];
export const TAIL_IDS: readonly TailId[] = ['none', 'fluffy', 'thin', 'bone', 'wisp'];
export const BACK_IDS: readonly BackId[] = ['none', 'bow', 'cape', 'wings'];
export const HAND_ITEM_IDS: readonly HandItemId[] = ['none', 'wand', 'staff', 'fan', 'tome'];
export const IDLE_STYLES: readonly IdleStyle[] = ['sway', 'bob', 'float', 'rattle'];

export interface BodyDna {
  height: number;         // 0.8–1.25 global scale
  headSize: number;       // 0.75–1.5 head radius multiplier
  chubbiness: number;     // 0.6–1.8 torso/limb thickness
  armLength: number;      // 0.7–1.3
  legLength: number;      // 0.7–1.3
  shoulderWidth: number;  // 0.75–1.3
  hipWidth: number;       // 0.75–1.4
}

export interface DressDna {
  style: DressStyle;
  flare: number;          // 0.6–1.6 hem radius multiplier
  length: number;         // 0.7–1.3 hem drop multiplier
  trim: boolean;
  sash: boolean;
  puffSleeves: boolean;
}

export interface FaceDna {
  eyeStyle: EyeStyle;
  eyeSize: number;        // 0.7–1.5
  eyeSpacing: number;     // 0.75–1.3
  eyeTilt: number;        // −0.3–0.3 rad
  blush: number;          // 0–1
  mouth: MouthStyle;
}

export interface HairDna {
  style: HairStyle;
  length: number;         // 0.6–1.5
}

export interface PartsDna {
  crown: CrownId;
  crownTilt: number;      // −0.35–0.35 rad
  crownSize: number;      // 0.6–1.6  (wheel-scalable)
  ears: EarId;
  earSize: number;        // 0.6–1.8
  tail: TailId;
  tailSize: number;       // 0.6–1.6
  back: BackId;
  backSize: number;       // 0.6–1.6  (wheel-scalable)
  handL: HandItemId;
  handR: HandItemId;
  handSize: number;       // 0.6–1.6  (wheel-scalable, both hands)
}

export interface ColorsDna {
  primary: string;        // dress body
  secondary: string;      // trim / ruffles / fur tips
  accent: string;         // sash / bows / gems / cape
  skin: string;           // skin / fur base / jelly / bone
  hair: string;           // hair (fox: alt fur)
  eyes: string;           // iris / glow color
  metal: string;          // crown & jewelry
  glow: string;           // emissive accents
}

export interface SpeciesDna {
  snoutLength: number;      // 0.5–1.6  (fox)
  fluff: number;            // 0.5–2.0  (fox tail/ears)
  wobble: number;           // 0–1      (slime)
  translucency: number;     // 0.2–0.9  (slime transmission)
  coreGlow: number;         // 0–1      (slime nucleus)
  boneThickness: number;    // 0.6–1.6  (skeleton)
  eyeGlowIntensity: number; // 0–1.5    (skeleton)
}

export interface MotionDna {
  energy: number;         // 0–1
  bounce: number;         // 0–1
  idleStyle: IdleStyle;
}

export interface PrincessDNA {
  v: 1;
  name: string;
  seed: number;
  archetype: Archetype;
  body: BodyDna;
  dress: DressDna;
  face: FaceDna;
  hair: HairDna;
  parts: PartsDna;
  colors: ColorsDna;
  species: SpeciesDna;
  motion: MotionDna;
}

/** Numeric field ranges, used by clampDna + UI sliders. */
export interface Range { min: number; max: number }
export const RANGES = {
  body: {
    height: { min: 0.8, max: 1.25 },
    headSize: { min: 0.75, max: 1.5 },
    chubbiness: { min: 0.6, max: 1.8 },
    armLength: { min: 0.7, max: 1.3 },
    legLength: { min: 0.7, max: 1.3 },
    shoulderWidth: { min: 0.75, max: 1.3 },
    hipWidth: { min: 0.75, max: 1.4 },
  },
  dress: {
    flare: { min: 0.6, max: 1.6 },
    length: { min: 0.7, max: 1.3 },
  },
  face: {
    eyeSize: { min: 0.7, max: 1.5 },
    eyeSpacing: { min: 0.75, max: 1.3 },
    eyeTilt: { min: -0.3, max: 0.3 },
    blush: { min: 0, max: 1 },
  },
  hair: {
    length: { min: 0.6, max: 1.5 },
  },
  parts: {
    crownTilt: { min: -0.35, max: 0.35 },
    crownSize: { min: 0.6, max: 1.6 },
    earSize: { min: 0.6, max: 1.8 },
    tailSize: { min: 0.6, max: 1.6 },
    backSize: { min: 0.6, max: 1.6 },
    handSize: { min: 0.6, max: 1.6 },
  },
  species: {
    snoutLength: { min: 0.5, max: 1.6 },
    fluff: { min: 0.5, max: 2.0 },
    wobble: { min: 0, max: 1 },
    translucency: { min: 0.2, max: 0.9 },
    coreGlow: { min: 0, max: 1 },
    boneThickness: { min: 0.6, max: 1.6 },
    eyeGlowIntensity: { min: 0, max: 1.5 },
  },
  motion: {
    energy: { min: 0, max: 1 },
    bounce: { min: 0, max: 1 },
  },
} as const satisfies Record<string, Record<string, Range>>;
