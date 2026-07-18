// ── Curated randomizer & mutator ─────────────────────────────────────────────
//
//  "Curated randomness beats pure randomness" (Hytale lesson): pools are
//  weighted per archetype so shuffled princesses look designed, and numeric
//  sliders are mid-biased so extremes are rare spice, not the norm.

import type { Archetype, PrincessDNA, Range } from './types';
import { RANGES, EYE_STYLES, MOUTH_STYLES } from './types';
import type { Rng } from './rng';
import { mulberry32, randFloatMid, pick, pickWeighted, chance } from './rng';
import { defaultDna, sanitizeDna, cloneDna } from './dna';
import { PALETTES } from './palettes';
import { generateName } from './names';

type W<T> = readonly (readonly [T, number])[];

// Weighted pools per archetype. Signature looks get heavy weights; comedy
// options (bone ears on a fox…) get token weights so 🎲 occasionally winks.
const POOLS = {
  human: {
    dress: [['bell', 5], ['layered', 3], ['aline', 2], ['slim', 2], ['hex', 1]] as W<PrincessDNA['dress']['style']>,
    hair: [['bob', 4], ['pigtails', 3], ['long', 3], ['bun', 2], ['twintails', 2], ['none', 1]] as W<PrincessDNA['hair']['style']>,
    eyes: [['sparkle', 4], ['round', 3], ['lash', 3], ['sleepy', 2], ['star', 1], ['button', 1]] as W<PrincessDNA['face']['eyeStyle']>,
    mouth: [['smile', 5], ['open', 2], ['pout', 2], ['cat', 1]] as W<PrincessDNA['face']['mouth']>,
    crown: [['tiara', 4], ['classic', 3], ['flower', 2], ['none', 1], ['halo', 1]] as W<PrincessDNA['parts']['crown']>,
    ears: [['none', 8], ['cat', 1], ['round', 1]] as W<PrincessDNA['parts']['ears']>,
    tail: [['none', 9], ['thin', 1]] as W<PrincessDNA['parts']['tail']>,
    back: [['bow', 4], ['none', 3], ['cape', 2], ['wings', 1]] as W<PrincessDNA['parts']['back']>,
  },
  fox: {
    dress: [['hex', 5], ['bell', 2], ['aline', 2], ['slim', 1], ['layered', 1]] as W<PrincessDNA['dress']['style']>,
    hair: [['none', 5], ['bob', 2], ['bun', 1], ['long', 1]] as W<PrincessDNA['hair']['style']>,
    eyes: [['button', 4], ['round', 3], ['sparkle', 2], ['sleepy', 2], ['star', 1]] as W<PrincessDNA['face']['eyeStyle']>,
    mouth: [['cat', 5], ['smile', 3], ['fang', 2], ['open', 1]] as W<PrincessDNA['face']['mouth']>,
    crown: [['classic', 4], ['flower', 3], ['tiara', 2], ['none', 2], ['crooked', 1]] as W<PrincessDNA['parts']['crown']>,
    ears: [['fox', 8], ['cat', 2], ['long', 1]] as W<PrincessDNA['parts']['ears']>,
    tail: [['fluffy', 7], ['thin', 2], ['wisp', 1]] as W<PrincessDNA['parts']['tail']>,
    back: [['none', 5], ['bow', 2], ['cape', 2], ['wings', 1]] as W<PrincessDNA['parts']['back']>,
  },
  slime: {
    dress: [['bell', 6], ['slim', 2], ['hex', 1], ['aline', 1], ['layered', 1]] as W<PrincessDNA['dress']['style']>,
    hair: [['twintails', 5], ['bun', 2], ['none', 2], ['bob', 1]] as W<PrincessDNA['hair']['style']>,
    eyes: [['sparkle', 4], ['round', 3], ['sleepy', 2], ['star', 2], ['void', 1]] as W<PrincessDNA['face']['eyeStyle']>,
    mouth: [['open', 4], ['smile', 4], ['pout', 1], ['none', 1]] as W<PrincessDNA['face']['mouth']>,
    crown: [['halo', 4], ['classic', 2], ['tiara', 2], ['flower', 1], ['none', 2]] as W<PrincessDNA['parts']['crown']>,
    ears: [['none', 7], ['fox', 1], ['cat', 1], ['round', 1]] as W<PrincessDNA['parts']['ears']>,
    tail: [['wisp', 5], ['none', 4], ['thin', 1]] as W<PrincessDNA['parts']['tail']>,
    back: [['none', 6], ['bow', 2], ['wings', 2]] as W<PrincessDNA['parts']['back']>,
  },
  skeleton: {
    dress: [['aline', 5], ['layered', 2], ['bell', 2], ['slim', 2], ['hex', 1]] as W<PrincessDNA['dress']['style']>,
    hair: [['none', 6], ['long', 2], ['bob', 1], ['bun', 1]] as W<PrincessDNA['hair']['style']>,
    eyes: [['glow', 5], ['void', 3], ['star', 1], ['round', 1]] as W<PrincessDNA['face']['eyeStyle']>,
    mouth: [['teeth', 6], ['smile', 2], ['fang', 2], ['none', 1]] as W<PrincessDNA['face']['mouth']>,
    crown: [['crooked', 5], ['classic', 2], ['tiara', 1], ['halo', 1], ['none', 2]] as W<PrincessDNA['parts']['crown']>,
    ears: [['none', 9], ['fox', 1]] as W<PrincessDNA['parts']['ears']>,
    tail: [['none', 5], ['bone', 4], ['wisp', 1]] as W<PrincessDNA['parts']['tail']>,
    back: [['cape', 5], ['none', 3], ['wings', 1], ['bow', 1]] as W<PrincessDNA['parts']['back']>,
  },
} as const;

const HAND_POOL: W<PrincessDNA['parts']['handL']> =
  [['none', 6], ['wand', 2], ['tome', 2], ['staff', 1], ['fan', 1]];

function mid(rng: Rng, r: Range): number {
  return randFloatMid(rng, r.min, r.max);
}

/** Full random princess for an archetype. Deterministic per seed. */
export function randomDna(archetype: Archetype, seed: number): PrincessDNA {
  const rng = mulberry32(seed);
  const d = defaultDna(archetype);
  const pool = POOLS[archetype];
  const palette = pick(rng, PALETTES[archetype]);

  const dna: PrincessDNA = {
    ...d,
    name: generateName(rng, archetype),
    seed,
    body: {
      height: mid(rng, RANGES.body.height),
      headSize: mid(rng, RANGES.body.headSize),
      chubbiness: mid(rng, RANGES.body.chubbiness),
      armLength: mid(rng, RANGES.body.armLength),
      legLength: mid(rng, RANGES.body.legLength),
      shoulderWidth: mid(rng, RANGES.body.shoulderWidth),
      hipWidth: mid(rng, RANGES.body.hipWidth),
    },
    dress: {
      style: pickWeighted(rng, pool.dress),
      flare: mid(rng, RANGES.dress.flare),
      length: mid(rng, RANGES.dress.length),
      trim: chance(rng, 0.7),
      sash: chance(rng, 0.6),
      puffSleeves: archetype === 'human' ? chance(rng, 0.6) : chance(rng, 0.25),
    },
    face: {
      eyeStyle: pickWeighted(rng, pool.eyes),
      eyeSize: mid(rng, RANGES.face.eyeSize),
      eyeSpacing: mid(rng, RANGES.face.eyeSpacing),
      eyeTilt: mid(rng, RANGES.face.eyeTilt),
      blush: archetype === 'skeleton' ? (chance(rng, 0.2) ? 0.4 : 0) : mid(rng, RANGES.face.blush),
      mouth: pickWeighted(rng, pool.mouth),
    },
    hair: {
      style: pickWeighted(rng, pool.hair),
      length: mid(rng, RANGES.hair.length),
    },
    parts: {
      crown: pickWeighted(rng, pool.crown),
      crownTilt: archetype === 'skeleton' ? -0.25 + rng() * 0.1 : (chance(rng, 0.25) ? mid(rng, RANGES.parts.crownTilt) : 0),
      ears: pickWeighted(rng, pool.ears),
      earSize: mid(rng, RANGES.parts.earSize),
      tail: pickWeighted(rng, pool.tail),
      tailSize: mid(rng, RANGES.parts.tailSize),
      back: pickWeighted(rng, pool.back),
      handL: pickWeighted(rng, HAND_POOL),
      handR: chance(rng, 0.75) ? 'none' : pickWeighted(rng, HAND_POOL),
    },
    colors: { ...palette.colors },
    species: {
      snoutLength: mid(rng, RANGES.species.snoutLength),
      fluff: mid(rng, RANGES.species.fluff),
      wobble: mid(rng, RANGES.species.wobble),
      translucency: mid(rng, RANGES.species.translucency),
      coreGlow: mid(rng, RANGES.species.coreGlow),
      boneThickness: mid(rng, RANGES.species.boneThickness),
      eyeGlowIntensity: mid(rng, RANGES.species.eyeGlowIntensity),
    },
    motion: {
      energy: mid(rng, RANGES.motion.energy),
      bounce: mid(rng, RANGES.motion.bounce),
      idleStyle: d.motion.idleStyle,
    },
  };
  return sanitizeDna(dna);
}

const MUTABLE_NUM_PATHS: readonly (readonly [keyof typeof RANGES, string])[] = [
  ['body', 'headSize'], ['body', 'chubbiness'], ['body', 'armLength'],
  ['body', 'legLength'], ['body', 'hipWidth'], ['dress', 'flare'],
  ['dress', 'length'], ['face', 'eyeSize'], ['face', 'eyeSpacing'],
  ['face', 'blush'], ['hair', 'length'], ['parts', 'earSize'],
  ['parts', 'tailSize'], ['species', 'fluff'], ['species', 'wobble'],
  ['species', 'snoutLength'], ['motion', 'energy'], ['motion', 'bounce'],
];

/** Nudge 2–4 numeric fields ±15% of their range, occasionally reroll one chip. */
export function mutateDna(dna: PrincessDNA, seed: number): PrincessDNA {
  const rng = mulberry32(seed);
  const out = cloneDna(dna);
  out.seed = seed;
  const count = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const [section, key] = pick(rng, MUTABLE_NUM_PATHS);
    const range = (RANGES[section] as Record<string, Range>)[key];
    const target = out[section] as unknown as Record<string, number>;
    const span = (range.max - range.min) * 0.15;
    target[key] = target[key] + (rng() * 2 - 1) * span;
  }
  if (chance(rng, 0.35)) out.face.eyeStyle = pick(rng, EYE_STYLES);
  if (chance(rng, 0.25)) out.face.mouth = pick(rng, MOUTH_STYLES);
  return sanitizeDna(out);
}
