// ── CreatureDNA ─────────────────────────────────────────────────────────────────
//
//  Single source of truth for generating any creature or player character.
//  A DNA object serialises to Base64 for save files, clipboard, and the lab.

export type Archetype  = 'biped' | 'quadruped' | 'amoeba' | 'avian' | 'serpent';
export type SubRace    =
  | 'none'                                        // non-biped / unknown
  | 'human' | 'elf' | 'high_elf'
  | 'goblin' | 'orc' | 'troll'
  | 'pixie' | 'fae' | 'gnome'
  | 'undead' | 'draconic' | 'celestial';
export type EarShape   = 'none' | 'round' | 'pointed' | 'large';
export type HeadStyle  = 'normal' | 'large' | 'small' | 'elongated';
export type OutfitTopId  = 'none' | 'tunic' | 'robe_top' | 'armor_chest' | 'wrap';
export type OutfitLegsId = 'none' | 'trousers' | 'skirt' | 'shorts' | 'loincloth' | 'robe_skirt';
export type OutfitOverId = 'none' | 'robe_full' | 'cape' | 'cloak';
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
  subRace:   SubRace;
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
    shoulderWidth:  number;
    hipWidth:       number;
    bellySize:      number;
    neckThickness:  number;
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
  outfit: {
    top:  OutfitTopId;
    legs: OutfitLegsId;
    over: OutfitOverId;
  };
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PLAYER_DNA: CreatureDNA = {
  archetype: 'biped',
  subRace:   'human',
  colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04 },
  proportions: {
    global: 1.0, torso: [1, 1, 1], headSize: 1.0,
    limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
    tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
    shoulderWidth: 1.0, hipWidth: 1.0, bellySize: 0.0, neckThickness: 1.0,
  },
  face: { type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral' },
  material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
  props: [],
  outfit: { top: 'none', legs: 'none', over: 'none' },
};

// ── Sub-race definitions ──────────────────────────────────────────────────────

export interface SubRaceDef {
  label:      string;
  icon:       string;
  hint:       string;
  earShape:   EarShape;
  headStyle:  HeadStyle;
  proportions?: Partial<CreatureDNA['proportions']>;
  colors?:     Partial<CreatureDNA['colors']>;
  face?:       Partial<CreatureDNA['face']>;
  props?:      PropId[];
}

export const SUBRACE_DEFS: Record<SubRace, SubRaceDef> = {
  none:      { label: 'Unknown',   icon: '?',  hint: 'Indeterminate form.',
               earShape: 'round',   headStyle: 'normal' },
  human:     { label: 'Human',     icon: '👤', hint: 'Versatile and adaptable.',
               earShape: 'round',   headStyle: 'normal' },
  elf:       { label: 'Elf',       icon: '🧝', hint: 'Slender, long-lived, and sharp of ear.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { limbLength: 1.15, global: 0.95, headSize: 0.92, neckLength: 1.1 },
               colors:      { primary: 0xd8e0c8 },
               face:        { type: 'cute', mouthType: 'smile' } },
  high_elf:  { label: 'High Elf',  icon: '⭐', hint: 'Ancient bloodline, luminous bearing.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { limbLength: 1.2, global: 1.0, headSize: 0.88, neckLength: 1.2 },
               colors:      { primary: 0xe8f0e0, emissive: 0xc0e0ff, emissiveIntensity: 0.06 },
               face:        { type: 'cute', mouthType: 'smile' } },
  goblin:    { label: 'Goblin',    icon: '👺', hint: 'Short, clever, and mischievous.',
               earShape: 'large',   headStyle: 'large',
               proportions: { global: 0.78, headSize: 1.35, limbLength: 0.88, limbWidth: 0.85 },
               colors:      { primary: 0x88a050 },
               face:        { type: 'angry', mouthType: 'fangs' } },
  orc:       { label: 'Orc',       icon: '💪', hint: 'Broad, strong, and battle-forged.',
               earShape: 'round',   headStyle: 'normal',
               proportions: { global: 1.08, limbWidth: 1.3, headSize: 1.05 },
               colors:      { primary: 0x708050 },
               face:        { type: 'angry', mouthType: 'fangs' } },
  troll:     { label: 'Troll',     icon: '🧌', hint: 'Massive and regenerative.',
               earShape: 'large',   headStyle: 'large',
               proportions: { global: 1.3, headSize: 1.4, limbWidth: 1.45, limbLength: 1.05 },
               colors:      { primary: 0x6a7060 },
               face:        { type: 'angry', mouthType: 'frown' } },
  pixie:     { label: 'Pixie',     icon: '🧚', hint: 'Tiny, fast, and full of tricks.',
               earShape: 'pointed', headStyle: 'large',
               proportions: { global: 0.52, headSize: 1.5, limbLength: 0.9 },
               colors:      { primary: 0xf0d0ff, emissive: 0xe080ff, emissiveIntensity: 0.12 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['wings_bat'] },
  fae:       { label: 'Fae',       icon: '🌿', hint: 'Nature-bound, mercurial, and enchanting.',
               earShape: 'pointed', headStyle: 'large',
               proportions: { global: 0.72, headSize: 1.25, limbLength: 1.05 },
               colors:      { primary: 0xa0d880, emissive: 0x60ff80, emissiveIntensity: 0.1 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['wings_bat', 'aura'] },
  gnome:     { label: 'Gnome',     icon: '🍄', hint: 'Inventive, stout, and surprising.',
               earShape: 'round',   headStyle: 'large',
               proportions: { global: 0.72, headSize: 1.3, limbLength: 0.85 },
               colors:      { primary: 0xf0c890 } },
  undead:    { label: 'Undead',    icon: '💀', hint: 'Returned from beyond — cold and tireless.',
               earShape: 'none',    headStyle: 'normal',
               colors:      { primary: 0xc0b8a8, secondary: 0x302820 },
               face:        { type: 'skull', mouthType: 'fangs' },
               props:       ['aura'] },
  draconic:  { label: 'Draconic',  icon: '🐉', hint: 'Dragon-blooded. Scales, fire, and pride.',
               earShape: 'none',    headStyle: 'normal',
               colors:      { primary: 0x904020, secondary: 0x602010, emissive: 0xff4000, emissiveIntensity: 0.08 },
               face:        { type: 'angry', mouthType: 'fangs' },
               props:       ['horns_small'] },
  celestial: { label: 'Celestial', icon: '✨', hint: 'Descended from starlight. Radiant and serene.',
               earShape: 'pointed', headStyle: 'elongated',
               proportions: { global: 1.0, limbLength: 1.1, headSize: 0.9 },
               colors:      { primary: 0xfff0d8, secondary: 0xd0c0f0, emissive: 0xffd080, emissiveIntensity: 0.12 },
               face:        { type: 'cute', mouthType: 'smile' },
               props:       ['aura', 'crown'] },
};

/** Subraces available when archetype === 'biped'. */
export const BIPED_SUBRACES: SubRace[] = [
  'human', 'elf', 'high_elf', 'goblin', 'orc', 'troll',
  'pixie', 'fae', 'gnome', 'undead', 'draconic', 'celestial',
];

export const ARCHETYPE_DEFAULTS: Partial<Record<Archetype, Partial<CreatureDNA>>> = {
  quadruped: {
    colors: { primary: 0x6a9a5a, secondary: 0x3a5a2a, emissive: 0x204010, emissiveIntensity: 0.02 },
    proportions: { global: 1.0, torso: [1.4, 0.85, 1.8], headSize: 0.85, limbLength: 0.95, limbWidth: 0.9, neckLength: 1.4, tailLength: 1.2, wingSpan: 1.5, segmentCount: 4, shoulderWidth: 1.1, hipWidth: 1.0, bellySize: 0.0, neckThickness: 1.1 },
    face: { type: 'angry', eyeColor: 0xff4000, mouthType: 'fangs', expression: 'angry' },
    props: [],
  },
  amoeba: {
    colors: { primary: 0x40c0a0, secondary: 0x20a080, emissive: 0x40ffd0, emissiveIntensity: 0.18 },
    proportions: { global: 1.0, torso: [1.3, 1.3, 1.3], headSize: 1.6, limbLength: 0.3, limbWidth: 1.5, neckLength: 0.3, tailLength: 0, wingSpan: 0.5, segmentCount: 6, shoulderWidth: 1.0, hipWidth: 1.0, bellySize: 0.0, neckThickness: 0.7 },
    face: { type: 'cyclops', eyeColor: 0xff8800, mouthType: 'none', expression: 'neutral' },
    props: ['aura'],
  },
  avian: {
    colors: { primary: 0xe8c060, secondary: 0xa87020, emissive: 0xffe080, emissiveIntensity: 0.06 },
    proportions: { global: 0.85, torso: [0.85, 1.1, 0.7], headSize: 0.75, limbLength: 0.7, limbWidth: 0.7, neckLength: 1.6, tailLength: 0.9, wingSpan: 2.2, segmentCount: 3, shoulderWidth: 0.9, hipWidth: 0.85, bellySize: 0.0, neckThickness: 0.8 },
    face: { type: 'cute', eyeColor: 0x1a3060, mouthType: 'beak', expression: 'neutral' },
    props: [],
  },
  serpent: {
    colors: { primary: 0x506020, secondary: 0x304010, emissive: 0x60a020, emissiveIntensity: 0.08 },
    proportions: { global: 1.0, torso: [0.5, 0.5, 0.5], headSize: 1.1, limbLength: 0.4, limbWidth: 0.6, neckLength: 0.5, tailLength: 1.8, wingSpan: 0.5, segmentCount: 9, shoulderWidth: 0.8, hipWidth: 0.8, bellySize: 0.0, neckThickness: 0.9 },
    face: { type: 'angry', eyeColor: 0xff2000, mouthType: 'fangs', expression: 'angry' },
    props: ['tail_long'],
  },
};

export function dnaForArchetype(arch: Archetype): CreatureDNA {
  const base = cloneDNA(DEFAULT_PLAYER_DNA);
  base.archetype = arch;
  // Non-biped archetypes have no sub-race.
  if (arch !== 'biped') base.subRace = 'none';
  const over = ARCHETYPE_DEFAULTS[arch];
  if (!over) return base;
  if (over.colors)      Object.assign(base.colors,      over.colors);
  if (over.proportions) Object.assign(base.proportions, over.proportions);
  if (over.face)        Object.assign(base.face,        over.face);
  if (over.props !== undefined) base.props = [...over.props];
  return base;
}

/** Apply a sub-race's defaults on top of an existing DNA (biped only). */
export function dnaForSubRace(subRace: SubRace, base: CreatureDNA): CreatureDNA {
  const dna = cloneDNA(base);
  dna.subRace = subRace;
  if (subRace === 'none') return dna;
  const def = SUBRACE_DEFS[subRace];
  if (def.proportions) Object.assign(dna.proportions, def.proportions);
  if (def.colors)      Object.assign(dna.colors,      def.colors);
  if (def.face)        Object.assign(dna.face,        def.face);
  if (def.props !== undefined) dna.props = [...def.props];
  return dna;
}

// ── Serialisation ─────────────────────────────────────────────────────────────

export function dnaToBase64(dna: CreatureDNA): string { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64: string): CreatureDNA {
  const dna = JSON.parse(atob(b64)) as CreatureDNA;
  // Backwards-compat: old saves have no subRace field.
  if (dna.subRace === undefined) dna.subRace = dna.archetype === 'biped' ? 'human' : 'none';
  // Backwards-compat: old saves have no outfit field.
  if (!(dna as any).outfit) (dna as any).outfit = { top: 'none', legs: 'none', over: 'none' };
  // Migrate legacy 'robe' prop → outfit.over = 'robe_full'.
  const _ri = (dna.props as string[]).indexOf('robe');
  if (_ri >= 0) { dna.props.splice(_ri, 1); if (dna.outfit.over === 'none') dna.outfit.over = 'robe_full'; }
  // Backwards-compat: CC-3 morph fields.
  const _pp = dna.proportions as any;
  if (_pp.shoulderWidth === undefined) _pp.shoulderWidth = 1.0;
  if (_pp.hipWidth      === undefined) _pp.hipWidth      = 1.0;
  if (_pp.bellySize     === undefined) _pp.bellySize     = 0.0;
  if (_pp.neckThickness === undefined) _pp.neckThickness = 1.0;
  return dna;
}
export function cloneDNA(dna: CreatureDNA): CreatureDNA { return JSON.parse(JSON.stringify(dna)) as CreatureDNA; }
export function numToHex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }
export function hexToNum(s: string): number { return parseInt(s.replace('#', ''), 16); }
