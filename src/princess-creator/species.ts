// ── SPECIES_DEFS: the princess multiverse ────────────────────────────────────
//
//  Source of truth: the game's Character Design doc, distilled in
//  docs/princess-creator/SPECIES.md. Each species = one body tech + identity
//  presets + species-correct color pools + curated randomizer weights.
//  Design principles enforced here: silhouette-first (signature features are
//  defaults), and "colour communicates story" (skin/hair pools per species).

import type {
  SpeciesId, ClassId, Archetype, PrincessDNA, BodyDna, Palette,
  DressStyle, HairStyle, CrownId, EarId, TailId, BackId, EyeStyle, MouthStyle,
} from './types';

type W<T> = readonly (readonly [T, number])[];

export interface SpeciesRand {
  dress: W<DressStyle>;
  hair: W<HairStyle>;
  eyes: W<EyeStyle>;
  mouth: W<MouthStyle>;
  crown: W<CrownId>;
  ears: W<EarId>;
  tail: W<TailId>;
  back: W<BackId>;
}

export interface SpeciesDef {
  id: SpeciesId;
  label: string;
  icon: string;
  synth: Archetype;
  blurb: string;
  /** Stamp the species identity onto a base DNA (defaults + archetype swap). */
  apply(dna: PrincessDNA): void;
  /** Randomizer pins these near the preset (±8% of range) — silhouette lock. */
  lockBody?: Partial<BodyDna>;
  skinTones: string[];
  hairColors: string[];
  palettes: Palette[];
  rand: SpeciesRand;
  subtypes?: { id: string; label: string }[];
}

const pal = (id: string, label: string, colors: Palette['colors']): Palette => ({ id, label, colors });

// Shared pool fragments
const CROWN_ROYAL: W<CrownId> = [['tiara', 4], ['classic', 3], ['flower', 2], ['none', 1], ['halo', 1]];
const NO_EXTRAS: { ears: W<EarId>; tail: W<TailId> } = {
  ears: [['none', 1]],
  tail: [['none', 9], ['thin', 1]],
};
const MOUTH_SWEET: W<MouthStyle> = [['smile', 5], ['open', 2], ['pout', 2], ['cat', 1]];

export const SPECIES_DEFS: Record<SpeciesId, SpeciesDef> = {
  // ── 🧑 Human — the baseline everyone underestimates ──
  human: {
    id: 'human', label: 'Human', icon: '👑', synth: 'human',
    blurb: 'She looks like she belongs in a library. This is accurate while also being misleading.',
    apply(d) {
      d.archetype = 'human';
      d.aura = { style: 'none', intensity: 0.5 };
      d.hair = { style: 'bob', length: 1 };
      d.parts.crown = 'tiara';
      d.parts.back = 'bow';
      d.motion.idleStyle = 'sway';
    },
    skinTones: ['#ffdfc4', '#f0c8a0', '#c68863', '#8d5524', '#5a3825'],
    hairColors: ['#2f2a26', '#5a3825', '#8a3b1e', '#f2d16b', '#9a9a9a'],
    palettes: [
      pal('midnight-punk', 'Midnight Punk', { primary: '#39415f', secondary: '#221f2b', accent: '#5c6683', skin: '#ffdfc4', hair: '#f2d16b', eyes: '#4ea8de', metal: '#9aa1b5', glow: '#9fd8ff' }),
      pal('rose-gold', 'Rose & Gold', { primary: '#f7c6d9', secondary: '#fff3d6', accent: '#e8a33d', skin: '#ffe0c2', hair: '#f7d774', eyes: '#4ea8de', metal: '#f1c40f', glow: '#ffd9e8' }),
      pal('scholar-grey', 'Ink-Stained Scholar', { primary: '#8a8896', secondary: '#d8d5c8', accent: '#3d4a6b', skin: '#f0c8a0', hair: '#5a3825', eyes: '#5a7a52', metal: '#b5a642', glow: '#cfd8e8' }),
      pal('emerald-court', 'Emerald Court', { primary: '#2e6b4f', secondary: '#f2ead8', accent: '#c8a24a', skin: '#c68863', hair: '#2f2a26', eyes: '#3fae7c', metal: '#c8a24a', glow: '#baf5d2' }),
    ],
    rand: {
      dress: [['bell', 5], ['layered', 3], ['aline', 2], ['slim', 2], ['hex', 1]],
      hair: [['bob', 4], ['ponytail', 3], ['long', 3], ['bun', 2], ['braided', 2], ['pigtails', 2], ['none', 1]],
      eyes: [['sparkle', 4], ['round', 3], ['lash', 3], ['sleepy', 2], ['star', 1]],
      mouth: MOUTH_SWEET,
      crown: CROWN_ROYAL,
      ...NO_EXTRAS,
      back: [['bow', 4], ['none', 3], ['cape', 2], ['grimoire', 1]],
    },
  },

  // ── 🧝 Elf — unhurried, mildly amused, has seen this before ──
  elf: {
    id: 'elf', label: 'Elf', icon: '🧝', synth: 'human',
    blurb: '"I have seen this exact situation before and I know exactly how it ends."',
    apply(d) {
      d.archetype = 'human';
      d.aura = { style: 'none', intensity: 0.5 };
      d.body.height = 1.08; d.body.headSize = 0.95; d.body.chubbiness = 0.85;
      d.body.armLength = 1.1; d.body.legLength = 1.1;
      d.hair = { style: 'long', length: 1.2 };
      d.parts.ears = 'long'; d.parts.earSize = 1.0;
      d.parts.crown = 'tiara'; d.parts.back = 'none';
      d.face.eyeStyle = 'sleepy'; d.face.blush = 0.25;
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.4;
    },
    lockBody: { height: 1.08, headSize: 0.95, chubbiness: 0.85, armLength: 1.1, legLength: 1.1 },
    skinTones: ['#f2e8e4', '#cfd4dc', '#c9cfa8', '#e8d5a8'],
    hairColors: ['#cfd4dc', '#f4f2ee', '#e8d5a8', '#2e5c3f'],
    palettes: [
      pal('sylvan-sage', 'Sylvan Sage', { primary: '#7a8c6f', secondary: '#d8d5c8', accent: '#3f6b5c', skin: '#f2e8e4', hair: '#cfd4dc', eyes: '#7fa88f', metal: '#c0c8d8', glow: '#d6f2e0' }),
      pal('smoke-teal', 'Smoke & Teal', { primary: '#2e4a4f', secondary: '#b5bdc4', accent: '#c9cfa8', skin: '#cfd4dc', hair: '#f4f2ee', eyes: '#78b3a0', metal: '#9aa1b5', glow: '#baf5e0' }),
      pal('autumn-ceremony', 'Autumn Ceremony', { primary: '#6b4a3a', secondary: '#e8d5a8', accent: '#a85a2a', skin: '#e8d5a8', hair: '#2e5c3f', eyes: '#c9952a', metal: '#c8a24a', glow: '#f2dcb0' }),
    ],
    rand: {
      dress: [['layered', 4], ['aline', 3], ['bell', 2], ['slim', 2]],
      hair: [['long', 5], ['braided', 4], ['bun', 2], ['ponytail', 2]],
      eyes: [['sleepy', 4], ['lash', 3], ['sparkle', 2], ['round', 1]],
      mouth: [['smile', 4], ['pout', 3], ['none', 1]],
      crown: [['tiara', 6], ['flower', 2], ['none', 2], ['classic', 1]],
      ...NO_EXTRAS,
      back: [['none', 5], ['cape', 3], ['bow', 1], ['grimoire', 1]],
      ears: [['long', 1]],
    },
  },

  // ── ⭐ High Elf — she does not, technically, own the tower. Yet. ──
  high_elf: {
    id: 'high_elf', label: 'High Elf', icon: '⭐', synth: 'human',
    blurb: 'Already inconvenienced before she got here; has simply added this to the list.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 1.2; d.body.headSize = 0.9; d.body.chubbiness = 0.75;
      d.body.armLength = 1.15; d.body.legLength = 1.15; d.body.shoulderWidth = 0.9;
      d.hair = { style: 'long', length: 1.5 };
      d.parts.ears = 'long'; d.parts.earSize = 1.45;
      d.parts.crown = 'classic'; // an ACTUAL crown, hers by birthright
      d.parts.back = 'none';
      d.face.eyeStyle = 'lash'; d.face.blush = 0.15;
      d.aura = { style: 'motes', intensity: 0.5 };
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.3; d.motion.bounce = 0.25;
    },
    lockBody: { height: 1.2, headSize: 0.9, chubbiness: 0.75, armLength: 1.15, legLength: 1.15 },
    skinTones: ['#f7e9d4', '#eef2fa', '#f2ddc4'],
    hairColors: ['#f4f0e8', '#e8dcc0', '#1c1a22'],
    palettes: [
      pal('indigo-dawn', 'Indigo Dawn', { primary: '#2b3050', secondary: '#f2ead8', accent: '#c8a24a', skin: '#f7e9d4', hair: '#f4f0e8', eyes: '#7b9ede', metal: '#e8dcc0', glow: '#f2e8c0' }),
      pal('ivory-court', 'Ivory Court', { primary: '#f2ede2', secondary: '#d8c9e8', accent: '#b5952a', skin: '#eef2fa', hair: '#e8dcc0', eyes: '#9b6bc7', metal: '#c8a24a', glow: '#e8dcff' }),
      pal('four-century-star', 'Four-Century Star', { primary: '#1c1a2e', secondary: '#c9b8de', accent: '#e8c46e', skin: '#f2ddc4', hair: '#1c1a22', eyes: '#e8c46e', metal: '#c0c8d8', glow: '#fff3c4' }),
    ],
    rand: {
      dress: [['layered', 5], ['bell', 3], ['slim', 2]],
      hair: [['long', 7], ['bun', 3]], // always long — or an announcement
      eyes: [['lash', 4], ['sleepy', 3], ['star', 2], ['sparkle', 1]],
      mouth: [['smile', 3], ['pout', 4], ['none', 2]],
      crown: [['classic', 6], ['tiara', 3], ['halo', 1]],
      ...NO_EXTRAS,
      back: [['none', 5], ['cape', 4], ['grimoire', 1]],
      ears: [['long', 1]],
    },
  },

  // ── 🧚 Pixie — do not confuse "small" with "not a threat" ──
  pixie: {
    id: 'pixie', label: 'Pixie', icon: '🧚', synth: 'human',
    blurb: 'Has already thought of three ways to defeat you and is selecting the funniest.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 0.55; d.body.headSize = 1.45; d.body.chubbiness = 1.05;
      d.body.armLength = 0.95; d.body.legLength = 0.85;
      d.hair = { style: 'wild', length: 0.8 };
      d.parts.ears = 'long'; d.parts.earSize = 0.6;
      d.parts.back = 'wings_butterfly'; d.parts.backSize = 1.25;
      d.parts.crown = 'flower';
      d.face.eyeStyle = 'sparkle'; d.face.eyeSize = 1.2; d.face.blush = 0.6;
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'float'; d.motion.energy = 0.85; d.motion.bounce = 0.8;
    },
    lockBody: { height: 0.55, headSize: 1.45 },
    skinTones: ['#ffd9c4', '#f2b8a0', '#e8cfc0'],
    hairColors: ['#c9a0e8', '#f099c2', '#7fd4d4', '#f2b05e'],
    palettes: [
      pal('petal-storm', 'Petal Storm', { primary: '#f099c2', secondary: '#fdf7d8', accent: '#7fd4d4', skin: '#ffd9c4', hair: '#c9a0e8', eyes: '#4ea87f', metal: '#ffd166', glow: '#ffd1e8' }),
      pal('dawn-wing', 'Dawn Wing', { primary: '#f2b05e', secondary: '#ffe8f3', accent: '#e878ad', skin: '#f2b8a0', hair: '#f2b05e', eyes: '#4ea8de', metal: '#e8c46e', glow: '#ffe9b0' }),
      pal('aqua-mischief', 'Aqua Mischief', { primary: '#7fd4d4', secondary: '#eafbf7', accent: '#f099c2', skin: '#ffd9c4', hair: '#7fd4d4', eyes: '#2e7fa8', metal: '#c0c8d8', glow: '#aef7e8' }),
    ],
    rand: {
      dress: [['bell', 4], ['layered', 3], ['slim', 2], ['hex', 1]],
      hair: [['wild', 5], ['bob', 3], ['pigtails', 2], ['bun', 1]],
      eyes: [['sparkle', 5], ['star', 3], ['round', 2]],
      mouth: [['smile', 4], ['open', 3], ['cat', 2], ['fang', 1]],
      crown: [['flower', 5], ['none', 3], ['tiara', 1], ['halo', 1]],
      ears: [['long', 8], ['cat', 1], ['round', 1]],
      tail: [['none', 9], ['wisp', 1]],
      back: [['wings_butterfly', 8], ['wings', 2]], // wings are the silhouette
    },
    subtypes: undefined,
  },

  // ── 🌿 Fae — the forest's rules, brought indoors ──
  fae: {
    id: 'fae', label: 'Fae', icon: '🌿', synth: 'human',
    blurb: 'Plants move slightly toward her in every room. This is normal.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 0.85; d.body.headSize = 1.15; d.body.chubbiness = 0.85;
      d.hair = { style: 'long', length: 1.2 }; // interwoven with leaves (sprinkled)
      d.parts.ears = 'long'; d.parts.earSize = 0.8;
      d.parts.back = 'wings_leaf'; d.parts.backSize = 1.15;
      d.parts.crown = 'flower';
      d.face.eyeStyle = 'sparkle'; d.face.blush = 0.45;
      d.aura = { style: 'motes', intensity: 0.45 }; // green fireflies
      d.motion.idleStyle = 'float'; d.motion.energy = 0.55; d.motion.bounce = 0.5;
    },
    lockBody: { height: 0.85, headSize: 1.15 },
    skinTones: ['#cfe0c0', '#e8d5a8', '#b8d4b0', '#d9c9a8'],
    hairColors: ['#2e5c3f', '#c9952a', '#5a4632', '#cfd4dc'],
    palettes: [
      pal('forest-court', 'Forest Court', { primary: '#3d6b4a', secondary: '#d8e8c8', accent: '#c9952a', skin: '#cfe0c0', hair: '#2e5c3f', eyes: '#8ab84f', metal: '#b5952a', glow: '#c8f2a0' }),
      pal('autumn-glade', 'Autumn Glade', { primary: '#8a5a2a', secondary: '#f2e0c0', accent: '#c2452d', skin: '#e8d5a8', hair: '#c9952a', eyes: '#d9772f', metal: '#c8a24a', glow: '#ffd9a0' }),
      pal('moss-morning', 'Moss & Morning', { primary: '#5c7a5c', secondary: '#eaf2e0', accent: '#7a4a8a', skin: '#b8d4b0', hair: '#5a4632', eyes: '#7b5ea7', metal: '#c0c8d8', glow: '#d8f2e8' }),
    ],
    rand: {
      dress: [['layered', 5], ['bell', 2], ['aline', 2], ['slim', 1]], // leaf-hem energy
      hair: [['long', 4], ['braided', 3], ['wild', 2], ['bun', 1]],
      eyes: [['sparkle', 4], ['round', 2], ['star', 2], ['sleepy', 2]],
      mouth: MOUTH_SWEET,
      crown: [['flower', 6], ['none', 2], ['tiara', 1], ['halo', 1]],
      ears: [['long', 1]],
      tail: [['none', 8], ['wisp', 2]],
      back: [['wings_leaf', 7], ['wings_butterfly', 2], ['none', 1]],
    },
  },

  // ── 💀 Undead — returned; not interested in your opinion on the matter ──
  undead: {
    id: 'undead', label: 'Undead', icon: '🥀', synth: 'human',
    blurb: 'She refuses to wear grey. She is making decisions about what kind of undead she is.',
    apply(d) {
      d.archetype = 'human';
      d.hair = { style: 'long', length: 1.3 };
      d.parts.crown = 'tiara'; d.parts.crownTilt = 0.1;
      d.parts.back = 'none';
      d.face.eyeStyle = 'void'; d.face.blush = 0; d.face.mouth = 'pout';
      d.aura = { style: 'cold', intensity: 0.6 };
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.3; d.motion.bounce = 0.2;
    },
    skinTones: ['#dfe4ea', '#c8d2dc', '#e8e4f0', '#d4dce4'],
    hairColors: ['#f4f2ee', '#cfd4dc', '#9a9aa4'],
    palettes: [
      pal('haunting', 'The Haunting', { primary: '#26222e', secondary: '#4a4456', accent: '#7b6ba7', skin: '#dfe4ea', hair: '#f4f2ee', eyes: '#9fd8ff', metal: '#8a8f9c', glow: '#9fd8ff' }),
      pal('reclaimed-emerald', 'Reclaimed Emerald', { primary: '#1e4d3a', secondary: '#c8d2dc', accent: '#c8a24a', skin: '#c8d2dc', hair: '#cfd4dc', eyes: '#7fd4b8', metal: '#c8a24a', glow: '#baf5d2' }),
      pal('reclaimed-garnet', 'Reclaimed Garnet', { primary: '#5c1a2e', secondary: '#d4dce4', accent: '#8a2438', skin: '#e8e4f0', hair: '#9a9aa4', eyes: '#ff8a9a', metal: '#9aa1b5', glow: '#c4d4ff' }),
    ],
    rand: {
      dress: [['aline', 4], ['layered', 3], ['slim', 2], ['bell', 1]],
      hair: [['long', 5], ['wild', 3], ['bun', 2], ['bob', 1]],
      eyes: [['void', 4], ['sleepy', 3], ['glow', 2], ['lash', 1]],
      mouth: [['pout', 4], ['smile', 2], ['none', 3]],
      crown: [['tiara', 4], ['none', 3], ['crooked', 2], ['halo', 1]],
      ...NO_EXTRAS,
      back: [['none', 4], ['cape', 4], ['wings', 1], ['grimoire', 1]],
    },
  },

  // ── ✨ Celestial — "from the sky originally, currently in a tower, working on it" ──
  celestial: {
    id: 'celestial', label: 'Celestial', icon: '✨', synth: 'human',
    blurb: 'Slightly more real than the room she is standing in.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 1.15; d.body.chubbiness = 0.9;
      d.dress.puffSleeves = false; // the wings own that silhouette zone
      d.hair = { style: 'long', length: 1.2 };
      d.parts.ears = 'long'; d.parts.earSize = 0.7; // pointed, less sharply than elves
      d.parts.crown = 'halo';
      d.parts.back = 'wings_feather'; d.parts.backSize = 1.15;
      d.face.eyeStyle = 'star'; d.face.blush = 0.3;
      d.aura = { style: 'warm', intensity: 0.7 };
      d.motion.idleStyle = 'float'; d.motion.energy = 0.45;
    },
    lockBody: { height: 1.15 },
    skinTones: ['#f7e2c4', '#faf6ea', '#dce8f7'],
    hairColors: ['#f2e4c4', '#e8cfd4', '#2b3050'],
    palettes: [
      pal('divine-dawn', 'Divine Dawn', { primary: '#2b3050', secondary: '#f2e4c4', accent: '#e8c46e', skin: '#f7e2c4', hair: '#f2e4c4', eyes: '#e8c46e', metal: '#f1c40f', glow: '#fff3c4' }),
      pal('dawn-cream', 'Dawn Cream', { primary: '#faf6ea', secondary: '#e8cfd4', accent: '#c8a24a', skin: '#faf6ea', hair: '#e8cfd4', eyes: '#7b9ede', metal: '#c8a24a', glow: '#ffe9d0' }),
      pal('midnight-halo', 'Midnight Halo', { primary: '#1c1a2e', secondary: '#dce8f7', accent: '#e8c46e', skin: '#dce8f7', hair: '#2b3050', eyes: '#fff3c4', metal: '#e8dcc0', glow: '#fff8dc' }),
    ],
    rand: {
      dress: [['layered', 4], ['bell', 4], ['slim', 2]],
      hair: [['long', 8], ['braided', 2]],
      eyes: [['star', 4], ['sparkle', 3], ['lash', 2], ['glow', 1]],
      mouth: MOUTH_SWEET,
      crown: [['halo', 7], ['tiara', 2], ['classic', 1]],
      ...NO_EXTRAS,
      back: [['wings_feather', 6], ['none', 3], ['bow', 1]],
      ears: [['long', 6], ['none', 4]],
    },
  },

  // ── 🐉 Draconic — not going to apologise for the scales ──
  draconic: {
    id: 'draconic', label: 'Draconic', icon: '🐉', synth: 'human',
    blurb: 'The library stopped burning when she arrived. She has very deliberately not explained this.',
    apply(d) {
      d.archetype = 'human';
      d.body.chubbiness = 1.15; d.body.shoulderWidth = 1.15;
      d.hair = { style: 'braided', length: 1.1 };
      d.parts.ears = 'horn_small'; d.parts.earSize = 1.1;
      d.parts.crown = 'none'; // the horns ARE the crown
      d.parts.back = 'none';
      d.parts.tail = 'thin'; d.parts.tailSize = 0.8; // small one, her choice
      d.face.eyeStyle = 'slit'; d.face.blush = 0.2; d.face.mouth = 'fang';
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.55;
    },
    lockBody: { chubbiness: 1.15, shoulderWidth: 1.15 },
    skinTones: ['#a85a3a', '#8d6b4a', '#4a4a52', '#3d5c46'],
    hairColors: ['#221e26', '#6b2226', '#8a4a1e'],
    palettes: [
      pal('ember-scale', 'Ember Scale', { primary: '#b5522a', secondary: '#2e2a32', accent: '#e8a33d', skin: '#a85a3a', hair: '#221e26', eyes: '#f2b05e', metal: '#c8a24a', glow: '#ff8a5c' }),
      pal('terracotta-teal', 'Terracotta & Teal', { primary: '#2e6b6b', secondary: '#e8cfc0', accent: '#b5522a', skin: '#8d6b4a', hair: '#6b2226', eyes: '#7fd4d4', metal: '#b5952a', glow: '#aef7e8' }),
      pal('char-royal', 'Charcoal Royal', { primary: '#2e2a32', secondary: '#6b2226', accent: '#c8a24a', skin: '#4a4a52', hair: '#8a4a1e', eyes: '#ff8a5c', metal: '#8a8f9c', glow: '#ffb05e' }),
    ],
    rand: {
      dress: [['slim', 4], ['aline', 3], ['layered', 2], ['hex', 1]],
      hair: [['braided', 5], ['bob', 3], ['ponytail', 2], ['none', 1]],
      eyes: [['slit', 6], ['sleepy', 2], ['glow', 2]],
      mouth: [['fang', 5], ['smile', 3], ['pout', 2]],
      crown: [['none', 5], ['classic', 3], ['crooked', 2]],
      ears: [['horn_small', 6], ['horn_curved', 4]],
      tail: [['thin', 5], ['none', 4], ['fluffy', 1]],
      back: [['none', 6], ['cape', 3], ['wings', 1]],
    },
  },

  // ── 🍄 Gnome — arrived with nothing, currently has a filing system ──
  gnome: {
    id: 'gnome', label: 'Gnome', icon: '🍄', synth: 'human',
    blurb: 'Gnome hair is a structural achievement.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 0.7; d.body.headSize = 1.35; d.body.chubbiness = 1.2;
      d.hair = { style: 'afro', length: 1.3 };
      d.parts.ears = 'round'; d.parts.earSize = 0.9;
      d.parts.crown = 'none'; d.parts.back = 'none';
      d.parts.glasses = true; d.parts.handL = 'tome';
      d.face.eyeStyle = 'round'; d.face.blush = 0.55;
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'bob'; d.motion.energy = 0.7;
    },
    lockBody: { height: 0.7, headSize: 1.35, chubbiness: 1.2 },
    skinTones: ['#ffd9c4', '#f0c8a0', '#c68863', '#a8785a'],
    hairColors: ['#f4f2ee', '#cfd4dc', '#f2e8a0', '#d4c4e8'],
    palettes: [
      pal('hearth-apron', 'Hearth & Apron', { primary: '#6b4a3a', secondary: '#f2ead8', accent: '#b5522a', skin: '#ffd9c4', hair: '#f4f2ee', eyes: '#5a7a52', metal: '#b5952a', glow: '#ffe9b0' }),
      pal('lavender-workshop', 'Lavender Workshop', { primary: '#4a4456', secondary: '#d4c4e8', accent: '#e8a33d', skin: '#f0c8a0', hair: '#d4c4e8', eyes: '#7b5ea7', metal: '#c0c8d8', glow: '#e6ccff' }),
      pal('mustard-tinker', 'Mustard Tinker', { primary: '#b5952a', secondary: '#2e2a32', accent: '#3d5c8a', skin: '#c68863', hair: '#f2e8a0', eyes: '#4ea8de', metal: '#8a8f9c', glow: '#fff3b0' }),
    ],
    rand: {
      dress: [['aline', 4], ['bell', 3], ['layered', 3]],
      hair: [['afro', 5], ['bun', 4], ['wild', 3]],
      eyes: [['round', 5], ['sparkle', 3], ['sleepy', 1]],
      mouth: MOUTH_SWEET,
      crown: [['none', 6], ['flower', 3], ['tiara', 1]],
      ears: [['round', 1]],
      tail: [['none', 1]],
      back: [['none', 6], ['bow', 2], ['grimoire', 2]],
    },
  },

  // ── 👺 Goblin — has already assessed every exit in the room ──
  goblin: {
    id: 'goblin', label: 'Goblin', icon: '👺', synth: 'human',
    blurb: 'Underestimated by everyone, including herself. A tactical advantage.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 0.78; d.body.headSize = 1.3; d.body.chubbiness = 0.9;
      d.hair = { style: 'wild', length: 1 };
      d.parts.ears = 'long'; d.parts.earSize = 1.6; // wide goblin radar
      d.parts.crown = 'crooked'; d.parts.crownTilt = 0.2; // found it; hers now
      d.parts.back = 'none';
      d.face.eyeStyle = 'round'; d.face.eyeSize = 1.25; d.face.mouth = 'fang';
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'bob'; d.motion.energy = 0.85; d.motion.bounce = 0.7;
    },
    lockBody: { height: 0.78, headSize: 1.3 },
    skinTones: ['#7a8c4f', '#6b5a3a', '#8a9a7a', '#c9c95e'],
    hairColors: ['#2f2a26', '#221e26', '#a83a2a'],
    palettes: [
      pal('scrap-chic', 'Scrap Chic', { primary: '#6b5a3a', secondary: '#b5952a', accent: '#a83a2a', skin: '#7a8c4f', hair: '#2f2a26', eyes: '#c9c95e', metal: '#8a8f9c', glow: '#d4e85e' }),
      pal('bog-couture', 'Bog Couture', { primary: '#3d4a2e', secondary: '#8a9a7a', accent: '#c9952a', skin: '#8a9a7a', hair: '#221e26', eyes: '#f2b05e', metal: '#b5952a', glow: '#d6f2b0' }),
      pal('aggressive-red', 'Aggressively Red', { primary: '#8a2438', secondary: '#2e2a32', accent: '#e8a33d', skin: '#c9c95e', hair: '#a83a2a', eyes: '#ffd166', metal: '#c8a24a', glow: '#ff8a5c' }),
    ],
    rand: {
      dress: [['hex', 4], ['slim', 3], ['aline', 2], ['layered', 1]], // assembled, asymmetric energy
      hair: [['wild', 5], ['none', 2], ['pigtails', 2], ['bun', 1]],
      eyes: [['round', 5], ['sparkle', 2], ['slit', 2]],
      mouth: [['fang', 5], ['cat', 2], ['open', 2], ['smile', 1]],
      crown: [['crooked', 5], ['none', 4], ['classic', 1]],
      ears: [['long', 1]],
      tail: [['none', 9], ['thin', 1]],
      back: [['none', 7], ['cape', 2], ['bow', 1]],
    },
  },

  // ── 🦊 Foxling — several more plans running than she mentions ──
  foxling: {
    id: 'foxling', label: 'Foxling', icon: '🦊', synth: 'fox',
    blurb: 'Tails indicate power level. She keeps this information to herself.',
    apply(d) {
      d.archetype = 'fox';
      d.subtype = '1';
      d.body.chubbiness = 1.1; d.body.legLength = 0.95; d.body.hipWidth = 1.05;
      d.dress.style = 'hex'; d.dress.puffSleeves = false;
      d.hair = { style: 'none', length: 1 };
      d.parts.ears = 'fox'; d.parts.earSize = 1.2;
      d.parts.tail = 'fluffy'; d.parts.crown = 'classic'; d.parts.back = 'none';
      d.face.eyeStyle = 'button'; d.face.eyeTilt = 0.12; d.face.blush = 0.4; d.face.mouth = 'cat';
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'bob'; d.motion.energy = 0.65; d.motion.bounce = 0.55;
    },
    skinTones: ['#e8874a', '#f2a65a', '#e9edf4', '#4a3a52'],
    hairColors: ['#fce3c3', '#fbead1', '#ffffff', '#8a7a9a'],
    palettes: [
      pal('autumn-maple', 'Autumn Maple', { primary: '#ff8fb3', secondary: '#fff6ec', accent: '#ffd166', skin: '#e8874a', hair: '#fce3c3', eyes: '#3c2a1e', metal: '#f1c40f', glow: '#ffe9a8' }),
      pal('court-kitsune', 'Court Kitsune', { primary: '#8a2438', secondary: '#fbead1', accent: '#c8a24a', skin: '#f2a65a', hair: '#fbead1', eyes: '#d9772f', metal: '#c8a24a', glow: '#ffc48a' }),
      pal('arctic-snow', 'Arctic Snow', { primary: '#7fa8d9', secondary: '#ffffff', accent: '#b0c9e8', skin: '#e9edf4', hair: '#ffffff', eyes: '#78b3e0', metal: '#c0c8d8', glow: '#d6ecff' }),
      pal('dusk-shadow', 'Dusk Shadow', { primary: '#2b2438', secondary: '#8a7a9a', accent: '#d94f6c', skin: '#4a3a52', hair: '#8a7a9a', eyes: '#ffd166', metal: '#6e6580', glow: '#c48aff' }),
    ],
    rand: {
      dress: [['hex', 5], ['bell', 2], ['aline', 2], ['slim', 1], ['layered', 1]],
      hair: [['none', 4], ['ponytail', 3], ['braided', 2], ['bob', 1]], // kept back — the ears
      eyes: [['button', 4], ['round', 3], ['sparkle', 2], ['sleepy', 2], ['slit', 1]],
      mouth: [['cat', 5], ['smile', 3], ['fang', 2], ['open', 1]],
      crown: [['classic', 4], ['flower', 3], ['tiara', 2], ['none', 2]],
      ears: [['fox', 1]],
      tail: [['fluffy', 1]],
      back: [['none', 6], ['bow', 2], ['cape', 2]],
    },
    subtypes: [
      { id: '1', label: 'One-tail' },
      { id: '3', label: 'Three-tail' },
      { id: '9', label: 'Nine-tail' },
    ],
  },

  // ── 🔥 Ignis — the fireplace tried to explain; he filed it under anomalies ──
  ignis: {
    id: 'ignis', label: 'Ignis', icon: '🔥', synth: 'human',
    blurb: 'Warm to the touch. Not hot enough to damage; hot enough to make a point.',
    apply(d) {
      d.archetype = 'human';
      d.body.chubbiness = 0.95;
      d.hair = { style: 'wild', length: 1.1 }; // rendered as SHAPED FIRE
      d.parts.crown = 'none'; // the fire is the crown
      d.parts.back = 'none';
      d.parts.glasses = false;
      d.face.eyeStyle = 'glow'; d.face.blush = 0.25; d.face.mouth = 'smile';
      d.dress.style = 'slim'; d.dress.puffSleeves = false; // structured, not flowing
      d.dress.sash = true;
      d.aura = { style: 'ember', intensity: 0.65 };
      d.traits.eyeGlowIntensity = 0.9;
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.7;
    },
    skinTones: ['#b5622a', '#8a4a2a', '#4a3a3a', '#2e2a2e'],
    hairColors: ['#ff9a3d', '#ff5e2a', '#8ab4ff'], // flame tint (blue = "she will explain later")
    palettes: [
      pal('emberheart', 'Emberheart', { primary: '#2e2a32', secondary: '#4a3a3a', accent: '#c8a24a', skin: '#b5622a', hair: '#ff9a3d', eyes: '#ffd166', metal: '#c8a24a', glow: '#ff9a3d' }),
      pal('blue-core', 'Blue Core', { primary: '#1c1a2e', secondary: '#3d3654', accent: '#8a8f9c', skin: '#4a3a3a', hair: '#8ab4ff', eyes: '#c4e0ff', metal: '#9aa1b5', glow: '#8ab4ff' }),
      pal('obsidian-gold', 'Obsidian & Gold', { primary: '#26222e', secondary: '#c8a24a', accent: '#b5522a', skin: '#8a4a2a', hair: '#ff5e2a', eyes: '#ffb05e', metal: '#e8c46e', glow: '#ff7a3d' }),
    ],
    rand: {
      dress: [['slim', 5], ['aline', 3], ['layered', 1], ['hex', 1]],
      hair: [['wild', 4], ['long', 2], ['ponytail', 2], ['twintails', 1], ['bun', 1]], // all become fire
      eyes: [['glow', 5], ['slit', 2], ['star', 2], ['void', 1]],
      mouth: [['smile', 4], ['fang', 3], ['pout', 2]],
      crown: [['none', 6], ['crooked', 2], ['classic', 1], ['halo', 1]],
      ears: [['none', 7], ['horn_small', 2], ['horn_curved', 1]],
      tail: [['none', 7], ['wisp', 3]],
      back: [['none', 7], ['cape', 2], ['wings', 1]],
    },
  },

  // ── 👻 Specter — always partially elsewhere; the tower made it visible ──
  specter: {
    id: 'specter', label: 'Specter', icon: '👻', synth: 'human',
    blurb: 'Not undead — different. Things she can\'t quite put down stay with her.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 1.05; d.body.chubbiness = 0.8;
      d.hair = { style: 'long', length: 1.4 }; // fades into mist at the ends
      d.parts.crown = 'none';
      d.parts.back = 'none';
      d.parts.tail = 'wisp'; d.parts.tailSize = 1.1; // the trail
      d.parts.handL = 'tome'; // the book she can't put down
      d.face.eyeStyle = 'void'; d.face.blush = 0; d.face.mouth = 'none';
      d.dress.style = 'aline'; d.dress.length = 1.25; d.dress.trim = false;
      d.dress.puffSleeves = false;
      d.aura = { style: 'cold', intensity: 0.45 };
      d.motion.idleStyle = 'float'; d.motion.energy = 0.3; d.motion.bounce = 0.3;
    },
    lockBody: { height: 1.05, chubbiness: 0.8 },
    skinTones: ['#c8d2e0', '#b0bccf', '#dfe4ea'],
    hairColors: ['#f4f2ee', '#c4d4e8', '#b0c4d8'],
    palettes: [
      pal('grey-passage', 'The Grey Passage', { primary: '#8a94a8', secondary: '#c4ccd8', accent: '#5c6683', skin: '#c8d2e0', hair: '#f4f2ee', eyes: '#e8f2ff', metal: '#9aa1b5', glow: '#c4d4ff' }),
      pal('lavender-echo', 'Lavender Echo', { primary: '#7b6ba7', secondary: '#d8c9e8', accent: '#4a4456', skin: '#b0bccf', hair: '#c4d4e8', eyes: '#e6ccff', metal: '#8a8f9c', glow: '#c8b0ff' }),
      pal('candlelit-memory', 'Candlelit Memory', { primary: '#a89478', secondary: '#e8dcc0', accent: '#6b5a4a', skin: '#dfe4ea', hair: '#b0c4d8', eyes: '#ffe9b0', metal: '#c8a24a', glow: '#ffe0a8' }),
    ],
    rand: {
      dress: [['aline', 5], ['layered', 3], ['slim', 2]],
      hair: [['long', 6], ['wild', 2], ['bob', 1], ['bun', 1]], // all trail into mist
      eyes: [['void', 5], ['sleepy', 2], ['glow', 2], ['star', 1]],
      mouth: [['none', 4], ['pout', 3], ['smile', 2]],
      crown: [['none', 6], ['tiara', 2], ['halo', 2]],
      ...NO_EXTRAS,
      tail: [['wisp', 7], ['none', 3]],
      back: [['none', 7], ['cape', 2], ['grimoire', 1]],
    },
  },

  // ── 🌊 Naiad — the tower is technically quite damp if you know where to look ──
  naiad: {
    id: 'naiad', label: 'Naiad', icon: '🌊', synth: 'human',
    blurb: 'From still water originally. Adapts. Makes pearls; don\'t ask.',
    apply(d) {
      d.archetype = 'human';
      d.body.height = 1.1; d.body.chubbiness = 0.85; d.body.armLength = 1.08;
      d.hair = { style: 'long', length: 1.35 }; // always partially wet
      d.parts.ears = 'fin'; d.parts.earSize = 1.0;
      d.parts.crown = 'none'; d.parts.back = 'none';
      d.dress.style = 'layered'; d.dress.trim = true; d.dress.puffSleeves = false;
      d.face.eyeStyle = 'round'; d.face.blush = 0.3; d.face.mouth = 'smile';
      d.aura = { style: 'bubbles', intensity: 0.5 };
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.45; d.motion.bounce = 0.35;
    },
    lockBody: { height: 1.1, chubbiness: 0.85 },
    skinTones: ['#a8d4cf', '#8fc4c9', '#c4d2d8', '#b8dcd0'],
    hairColors: ['#1e5c5c', '#2e7a6b', '#1c2a3a', '#3d8a8a'],
    palettes: [
      pal('deep-current', 'Deep Current', { primary: '#1e5c6b', secondary: '#c8ece4', accent: '#3fbfae', skin: '#a8d4cf', hair: '#1e5c5c', eyes: '#2e9fbf', metal: '#e8ecf2', glow: '#aef7e8' }),
      pal('river-stone', 'River Stone', { primary: '#6b7a8a', secondary: '#e8ecf0', accent: '#8fc4c9', skin: '#c4d2d8', hair: '#1c2a3a', eyes: '#78b3e0', metal: '#c0c8d8', glow: '#d6ecff' }),
      pal('lagoon-dusk', 'Lagoon Dusk', { primary: '#14323d', secondary: '#3d8a8a', accent: '#5edcc4', skin: '#8fc4c9', hair: '#2e7a6b', eyes: '#5edcc4', metal: '#9aa1b5', glow: '#7ff2dc' }),
    ],
    rand: {
      dress: [['layered', 5], ['aline', 3], ['slim', 2]], // nothing constricting
      hair: [['long', 5], ['braided', 3], ['wild', 1], ['bun', 1]],
      eyes: [['round', 4], ['sparkle', 3], ['sleepy', 2], ['void', 1]],
      mouth: [['smile', 4], ['open', 3], ['pout', 2]],
      crown: [['none', 5], ['tiara', 2], ['flower', 2], ['halo', 1]],
      ears: [['fin', 1]],
      tail: [['none', 8], ['wisp', 2]],
      back: [['none', 8], ['bow', 1], ['cape', 1]],
    },
  },

  // ── 🌙 Moonborn — stronger at night; has stopped pretending otherwise ──
  moonborn: {
    id: 'moonborn', label: 'Moonborn', icon: '🌙', synth: 'human',
    blurb: 'Connected to lunar cycles in ways she considers a private matter.',
    apply(d) {
      d.archetype = 'human';
      d.subtype = 'crescent';
      d.body.height = 1.12; d.body.chubbiness = 0.85;
      d.hair = { style: 'long', length: 1.4 }; // silver-white from birth, straight
      d.parts.crown = 'crescent'; // natural growth, not jewellery
      d.parts.back = 'cape'; d.parts.backSize = 1.1; // the cloak that pools
      d.face.eyeStyle = 'round'; d.face.blush = 0.15; d.face.mouth = 'pout';
      d.dress.style = 'aline'; d.dress.length = 1.2; d.dress.trim = false;
      d.dress.puffSleeves = false;
      d.aura = { style: 'motes', intensity: 0.4 };
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.3; d.motion.bounce = 0.25;
    },
    lockBody: { height: 1.12, chubbiness: 0.85 },
    skinTones: ['#eef0f7', '#e4e8f2', '#f4f2f7'],
    hairColors: ['#f4f2ee', '#e8ecf7', '#d8dce8'],
    palettes: [
      pal('midnight-silver', 'Midnight & Silver', { primary: '#1c2038', secondary: '#c4ccd8', accent: '#8a94b5', skin: '#eef0f7', hair: '#f4f2ee', eyes: '#c4d4ff', metal: '#c0c8d8', glow: '#dce4ff' }),
      pal('violet-eclipse', 'Violet Eclipse', { primary: '#2a1c3d', secondary: '#9a8ab5', accent: '#5c4a8a', skin: '#e4e8f2', hair: '#e8ecf7', eyes: '#b98aff', metal: '#8a8f9c', glow: '#c8b0ff' }),
      pal('moonrise', 'Moonrise', { primary: '#3d4468', secondary: '#e8ecf7', accent: '#c9b8de', skin: '#f4f2f7', hair: '#d8dce8', eyes: '#9fb8e8', metal: '#e8ecf2', glow: '#eef2ff' }),
    ],
    rand: {
      dress: [['aline', 4], ['layered', 3], ['slim', 2], ['bell', 1]],
      hair: [['long', 7], ['braided', 2], ['bun', 1]], // long, always, straight
      eyes: [['round', 4], ['void', 3], ['star', 2], ['lash', 1]],
      mouth: [['pout', 4], ['smile', 3], ['none', 2]],
      crown: [['crescent', 8], ['halo', 1], ['none', 1]], // the moon is the point
      ...NO_EXTRAS,
      back: [['cape', 6], ['none', 3], ['grimoire', 1]],
    },
    subtypes: [
      { id: 'crescent', label: 'Crescent' },
      { id: 'full', label: 'Full' },
      { id: 'eclipse', label: 'Eclipse' },
    ],
  },

  // ── 🌺 Verdant — the forest helped her find the door; she is here on purpose ──
  verdant: {
    id: 'verdant', label: 'Verdant', icon: '🌺', synth: 'human',
    blurb: 'The staff came from somewhere specific.',
    apply(d) {
      d.archetype = 'human';
      d.body.chubbiness = 1.05; d.body.hipWidth = 1.1;
      d.hair = { style: 'afro', length: 1.15 }; // thick, textured, with growing things
      d.parts.crown = 'wreath'; // living, not woven
      d.parts.back = 'none';
      d.parts.handL = 'staff'; // a branch from somewhere specific
      d.dress.style = 'layered'; d.dress.trim = true; d.dress.sash = true;
      d.dress.puffSleeves = false;
      d.face.eyeStyle = 'sparkle'; d.face.blush = 0.5; d.face.mouth = 'smile';
      d.aura = { style: 'motes', intensity: 0.35 }; // drifting pollen
      d.motion.idleStyle = 'sway'; d.motion.energy = 0.5; d.motion.bounce = 0.45;
    },
    skinTones: ['#8a6b4a', '#6b4a32', '#5c7a4a', '#3d5c3d'],
    hairColors: ['#2e5c3f', '#3d2e22', '#8a3b1e', '#5a4632'],
    palettes: [
      pal('rootsong', 'Rootsong', { primary: '#4a5c32', secondary: '#d8cfa8', accent: '#c2452d', skin: '#8a6b4a', hair: '#2e5c3f', eyes: '#8ab84f', metal: '#b5952a', glow: '#c8f2a0' }),
      pal('bloom-meadow', 'Bloom Meadow', { primary: '#5c7a5c', secondary: '#f2e8d8', accent: '#e878ad', skin: '#6b4a32', hair: '#3d2e22', eyes: '#d9772f', metal: '#c8a24a', glow: '#ffd1e8' }),
      pal('autumn-harvest', 'Autumn Harvest', { primary: '#6b3d22', secondary: '#e8cfa0', accent: '#c9952a', skin: '#5c7a4a', hair: '#8a3b1e', eyes: '#ffd166', metal: '#8a6b3a', glow: '#ffe9a8' }),
    ],
    rand: {
      dress: [['layered', 5], ['bell', 2], ['aline', 2], ['hex', 1]],
      hair: [['afro', 4], ['braided', 3], ['wild', 2], ['long', 2]],
      eyes: [['sparkle', 4], ['round', 3], ['sleepy', 1], ['star', 1]],
      mouth: MOUTH_SWEET,
      crown: [['wreath', 7], ['flower', 2], ['none', 1]],
      ears: [['none', 7], ['long', 2], ['round', 1]],
      tail: [['none', 1]],
      back: [['none', 6], ['wings_leaf', 2], ['cape', 1], ['grimoire', 1]],
    },
  },

  // ── 🟢 Slime — absorbed a spellbook; retains information differently ──
  slime: {
    id: 'slime', label: 'Slime', icon: '💧', synth: 'slime',
    blurb: 'She can approximate a dress. She has developed opinions.',
    apply(d) {
      d.archetype = 'slime';
      d.body.height = 0.95; d.body.headSize = 1.1; d.body.chubbiness = 1.2;
      d.body.armLength = 0.9; d.body.legLength = 0.85; d.body.hipWidth = 1.15;
      d.dress.trim = false; d.dress.sash = false; d.dress.puffSleeves = false;
      d.hair = { style: 'twintails', length: 1 };
      d.parts.crown = 'halo'; d.parts.tail = 'wisp'; d.parts.back = 'none';
      d.face.eyeStyle = 'sparkle'; d.face.eyeSize = 1.15; d.face.blush = 0.35; d.face.mouth = 'open';
      d.aura = { style: 'none', intensity: 0.5 };
      d.motion.idleStyle = 'float'; d.motion.energy = 0.5; d.motion.bounce = 0.65;
    },
    skinTones: ['#5fd4c0', '#f099c2', '#f5d76e', '#7b5ea7'],
    hairColors: ['#7fe0cf', '#ffb7d9', '#f7e39a', '#9b7fd4'],
    palettes: [
      pal('mint-jelly', 'Mint Jelly', { primary: '#33b5a8', secondary: '#eafbf7', accent: '#3fbfae', skin: '#5fd4c0', hair: '#7fe0cf', eyes: '#1e4d46', metal: '#f1c40f', glow: '#aef7e8' }),
      pal('bubblegum-goo', 'Bubblegum Goo', { primary: '#e878ad', secondary: '#ffe8f3', accent: '#ff4f9a', skin: '#f099c2', hair: '#ffb7d9', eyes: '#5c2e44', metal: '#ffd166', glow: '#ffd1e8' }),
      pal('lemon-drop', 'Lemon Drop', { primary: '#e8c73d', secondary: '#fdf7d8', accent: '#f2a531', skin: '#f5d76e', hair: '#f7e39a', eyes: '#6b4f1d', metal: '#e8ecf2', glow: '#fff3b0' }),
      pal('void-goo', 'Void Goo', { primary: '#5c3fa8', secondary: '#c9b8e8', accent: '#9b6bc7', skin: '#7b5ea7', hair: '#9b7fd4', eyes: '#e8f2ff', metal: '#3d3654', glow: '#b98aff' }),
    ],
    rand: {
      dress: [['bell', 6], ['slim', 2], ['hex', 1], ['aline', 1]],
      hair: [['twintails', 5], ['bun', 2], ['none', 2], ['bob', 1]],
      eyes: [['sparkle', 4], ['round', 3], ['sleepy', 2], ['star', 2], ['void', 1]],
      mouth: [['open', 4], ['smile', 4], ['pout', 1], ['none', 1]],
      crown: [['halo', 4], ['classic', 2], ['tiara', 2], ['flower', 1], ['none', 2]],
      ears: [['none', 7], ['fox', 1], ['cat', 1], ['round', 1]],
      tail: [['wisp', 5], ['none', 4], ['thin', 1]],
      back: [['none', 6], ['bow', 2], ['wings_butterfly', 2]],
    },
  },

  // ── 💀 Skeleton — the bone princess (atelier original) ──
  skeleton: {
    id: 'skeleton', label: 'Skeleton', icon: '💀', synth: 'skeleton',
    blurb: 'Has seen several of these towers before. It was different last time.',
    apply(d) {
      d.archetype = 'skeleton';
      d.body.chubbiness = 0.85; d.body.armLength = 1.05; d.body.legLength = 1.05;
      d.body.shoulderWidth = 0.95; d.body.hipWidth = 0.9;
      d.dress.style = 'aline'; d.dress.puffSleeves = false;
      d.hair = { style: 'none', length: 1 };
      d.parts.crown = 'crooked'; d.parts.crownTilt = -0.22; d.parts.back = 'cape';
      d.face.eyeStyle = 'glow'; d.face.eyeSize = 1.05; d.face.blush = 0; d.face.mouth = 'teeth';
      d.aura = { style: 'cold', intensity: 0.35 };
      d.motion.idleStyle = 'rattle'; d.motion.energy = 0.5; d.motion.bounce = 0.4;
    },
    skinTones: ['#e8e8e4', '#e6e0d2', '#efe7d8', '#f2ede2'],
    hairColors: ['#e8e8e4', '#cfd4dc'],
    palettes: [
      pal('gothic-royal', 'Gothic Royal', { primary: '#3a0ca3', secondary: '#f72585', accent: '#7209b7', skin: '#e8e8e4', hair: '#e8e8e4', eyes: '#00ffff', metal: '#ffd700', glow: '#00ffff' }),
      pal('moonlit-bone', 'Moonlit Bone', { primary: '#2b3050', secondary: '#c9b8de', accent: '#7b6ba7', skin: '#e6e0d2', hair: '#e6e0d2', eyes: '#9b6bc7', metal: '#8a8f9c', glow: '#b98aff' }),
      pal('blood-royal', 'Blood Royal', { primary: '#5c1a2e', secondary: '#c8a24a', accent: '#8a2438', skin: '#efe7d8', hair: '#efe7d8', eyes: '#ff6b4a', metal: '#c8a24a', glow: '#ff8a5c' }),
      pal('porcelain-ghost', 'Porcelain Ghost', { primary: '#e6e0d2', secondary: '#9db4c0', accent: '#7a9aa8', skin: '#f2ede2', hair: '#f2ede2', eyes: '#7fd4b8', metal: '#b5bdc4', glow: '#baf5d2' }),
    ],
    rand: {
      dress: [['aline', 5], ['layered', 2], ['bell', 2], ['slim', 2], ['hex', 1]],
      hair: [['none', 6], ['long', 2], ['bob', 1], ['bun', 1]],
      eyes: [['glow', 5], ['void', 3], ['star', 1], ['round', 1]],
      mouth: [['teeth', 6], ['smile', 2], ['fang', 2], ['none', 1]],
      crown: [['crooked', 5], ['classic', 2], ['tiara', 1], ['halo', 1], ['none', 2]],
      ears: [['none', 9], ['fox', 1]],
      tail: [['none', 5], ['bone', 4], ['wisp', 1]],
      back: [['cape', 5], ['none', 3], ['wings', 1], ['bow', 1]],
    },
  },
};

export function speciesDef(id: SpeciesId): SpeciesDef {
  return SPECIES_DEFS[id];
}

export const PALETTES = Object.fromEntries(
  (Object.keys(SPECIES_DEFS) as SpeciesId[]).map((id) => [id, SPECIES_DEFS[id].palettes]),
) as Record<SpeciesId, Palette[]>;

export function defaultColors(species: SpeciesId): Palette['colors'] {
  return { ...SPECIES_DEFS[species].palettes[0].colors };
}

// ── Classes: outfit vocabulary presets (never locks — magic crayons) ────────

export interface ClassDef {
  id: ClassId;
  label: string;
  icon: string;
  blurb: string;
  apply(dna: PrincessDNA): void;
}

export const CLASS_DEFS: Record<ClassId, ClassDef> = {
  none: {
    id: 'none', label: 'Free', icon: '✦',
    blurb: 'No class vocabulary — the pure species look.',
    apply(d) {
      d.pclass = 'none';
    },
  },
  scholar: {
    id: 'scholar', label: 'Scholar', icon: '📖',
    blurb: 'She read first. Ink stains, glasses, one borrowed quill she never gave back.',
    apply(d) {
      d.pclass = 'scholar';
      d.parts.glasses = true;
      if (d.parts.handL === 'none') d.parts.handL = 'tome';
      d.dress.trim = true;
    },
  },
  mage: {
    id: 'mage', label: 'Mage', icon: '🔮',
    blurb: 'Cobalt robes stolen from floor four. The grimoire follows her now.',
    apply(d) {
      d.pclass = 'mage';
      d.dress.style = d.archetype === 'fox' ? 'hex' : 'layered';
      d.dress.sash = true;
      if (d.parts.handL === 'none' || d.parts.handL === 'tome') d.parts.handL = 'staff';
      if (d.parts.back === 'none') d.parts.back = 'grimoire';
    },
  },
  warrior: {
    id: 'warrior', label: 'Warrior', icon: '⚔️',
    blurb: 'Practical leather, sensible boots that have clearly seen worse.',
    apply(d) {
      d.pclass = 'warrior';
      d.dress.style = 'slim';
      d.dress.puffSleeves = false;
      d.dress.sash = true;
      d.dress.trim = false;
      d.parts.glasses = false;
      if (d.parts.back === 'none' || d.parts.back === 'bow') d.parts.back = 'cape';
    },
  },
};
