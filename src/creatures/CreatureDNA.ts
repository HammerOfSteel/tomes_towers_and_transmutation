// ── CreatureDNA ─────────────────────────────────────────────────────────────────
//
//  Single source of truth for generating any creature or player character.
//  A DNA object serialises to Base64 for save files, clipboard, and the lab.

export type Archetype  = 'biped' | 'quadruped' | 'amoeba' | 'avian' | 'serpent';
export type FaceType   = 'cute' | 'angry' | 'cyclops' | 'blank' | 'skull' | 'compound';
export type MouthType  = 'smile' | 'frown' | 'beak' | 'fangs' | 'none';
export type Expression = 'neutral' | 'happy' | 'angry' | 'scared';
export type PropId     =
  | 'horns_small' | 'horns_large'
  | 'tail_stub'   | 'tail_long'
  | 'wings_bat'
  | 'crown'
  | 'robe'
  | 'armor_light'
  | 'aura';

export interface CreatureDNA {
  archetype: Archetype;
  colors: {
    primary:           number;
    secondary:         number;
    emissive:          number;
    emissiveIntensity: number;
  };
  proportions: {
    global:       number;
    torso:        [number, number, number];
    headSize:     number;
    limbLength:   number;
    limbWidth:    number;
    neckLength:   number;
    tailLength:   number;
    wingSpan:     number;
    segmentCount: number;
  };
  face: {
    type:       FaceType;
    eyeColor:   number;
    mouthType:  MouthType;
    expression: Expression;
  };
  material: {
    roughness:          number;
    metalness:          number;
    clearcoat:          number;
    clearcoatRoughness: number;
  };
  props: PropId[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PLAYER_DNA: CreatureDNA = {
  archetype: 'biped',
  colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04 },
  proportions: {
    global: 1.0, torso: [1, 1, 1], headSize: 1.0,
    limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
    tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
  },
  face: { type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  props: ['robe'],
};

export const ARCHETYPE_DEFAULTS: Partial<Record<Archetype, Partial<CreatureDNA>>> = {
  quadruped: {
    colors: { primary: 0x6a9a5a, secondary: 0x3a5a2a, emissive: 0x204010, emissiveIntensity: 0.02 },
    proportions: { global: 1.0, torso: [1.4, 0.85, 1.8], headSize: 0.85, limbLength: 0.95, limbWidth: 0.9, neckLength: 1.4, tailLength: 1.2, wingSpan: 1.5, segmentCount: 4 },
    face: { type: 'angry', eyeColor: 0xff4000, mouthType: 'fangs', expression: 'angry' },
    props: [],
  },
  amoeba: {
    colors: { primary: 0x40c0a0, secondary: 0x20a080, emissive: 0x40ffd0, emissiveIntensity: 0.18 },
    proportions: { global: 1.0, torso: [1.3, 1.3, 1.3], headSize: 1.6, limbLength: 0.3, limbWidth: 1.5, neckLength: 0.3, tailLength: 0, wingSpan: 0.5, segmentCount: 6 },
    face: { type: 'cyclops', eyeColor: 0xff8800, mouthType: 'none', expression: 'neutral' },
    props: ['aura'],
  },
  avian: {
    colors: { primary: 0xe8c060, secondary: 0xa87020, emissive: 0xffe080, emissiveIntensity: 0.06 },
    proportions: { global: 0.85, torso: [0.85, 1.1, 0.7], headSize: 0.75, limbLength: 0.7, limbWidth: 0.7, neckLength: 1.6, tailLength: 0.9, wingSpan: 2.2, segmentCount: 3 },
    face: { type: 'cute', eyeColor: 0x1a3060, mouthType: 'beak', expression: 'neutral' },
    props: [],
  },
  serpent: {
    colors: { primary: 0x506020, secondary: 0x304010, emissive: 0x60a020, emissiveIntensity: 0.08 },
    proportions: { global: 1.0, torso: [0.5, 0.5, 0.5], headSize: 1.1, limbLength: 0.4, limbWidth: 0.6, neckLength: 0.5, tailLength: 1.8, wingSpan: 0.5, segmentCount: 9 },
    face: { type: 'angry', eyeColor: 0xff2000, mouthType: 'fangs', expression: 'angry' },
    props: ['tail_long'],
  },
};

export function dnaForArchetype(arch: Archetype): CreatureDNA {
  const base = cloneDNA(DEFAULT_PLAYER_DNA);
  base.archetype = arch;
  const over = ARCHETYPE_DEFAULTS[arch];
  if (!over) return base;
  if (over.colors)      Object.assign(base.colors,      over.colors);
  if (over.proportions) Object.assign(base.proportions, over.proportions);
  if (over.face)        Object.assign(base.face,        over.face);
  if (over.props !== undefined) base.props = [...over.props];
  return base;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

export function dnaToBase64(dna: CreatureDNA): string { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64: string): CreatureDNA  { return JSON.parse(atob(b64)) as CreatureDNA; }
export function cloneDNA(dna: CreatureDNA): CreatureDNA { return JSON.parse(JSON.stringify(dna)) as CreatureDNA; }
export function numToHex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }
export function hexToNum(s: string): number { return parseInt(s.replace('#', ''), 16); }
