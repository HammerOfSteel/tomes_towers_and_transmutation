// ── Curated randomizer & mutator (species-driven) ────────────────────────────
//
//  "Curated randomness beats pure randomness" (Hytale lesson): every pool is
//  weighted per species (SPECIES_DEFS.rand), silhouette-critical proportions
//  are pinned near the species preset (lockBody ± 8%), palettes come from the
//  species set, and skin/hair tones swap within species-correct pools so the
//  result always reads as "designed" — colour communicates story.

import type { PrincessDNA, SpeciesId, ClassId, Range, BodyDna } from './types';
import { RANGES, EYE_STYLES, MOUTH_STYLES } from './types';
import type { Rng } from './rng';
import { mulberry32, randFloatMid, pick, pickWeighted, chance } from './rng';
import { defaultDna, sanitizeDna, cloneDna } from './dna';
import { SPECIES_DEFS, CLASS_DEFS } from './species';
import { generateName } from './names';

type W<T> = readonly (readonly [T, number])[];

const HAND_POOL: W<PrincessDNA['parts']['handL']> =
  [['none', 6], ['wand', 2], ['tome', 2], ['staff', 1], ['fan', 1]];

const CLASS_POOL: W<ClassId> = [['none', 4], ['scholar', 2], ['mage', 2], ['warrior', 2]];

const SUBTYPE_WEIGHTS = [5, 3, 2];

function mid(rng: Rng, r: Range): number {
  return randFloatMid(rng, r.min, r.max);
}

/** Locked keys sample near the species preset; free keys roam mid-biased. */
function sampleBody(rng: Rng, species: SpeciesId): BodyDna {
  const lock = SPECIES_DEFS[species].lockBody ?? {};
  const out = {} as BodyDna;
  for (const key of Object.keys(RANGES.body) as Array<keyof BodyDna>) {
    const range = RANGES.body[key];
    const pinned = lock[key];
    out[key] = pinned !== undefined
      ? pinned + (rng() * 2 - 1) * (range.max - range.min) * 0.08
      : mid(rng, range);
  }
  return out;
}

/** Full random princess of a species. Deterministic per seed. */
export function randomDna(species: SpeciesId, seed: number): PrincessDNA {
  const rng = mulberry32(seed);
  const def = SPECIES_DEFS[species];
  const dna = cloneDna(defaultDna(species));

  dna.seed = seed;
  dna.name = generateName(rng, def.synth);
  dna.body = sampleBody(rng, species);

  dna.dress.style = pickWeighted(rng, def.rand.dress);
  dna.dress.flare = mid(rng, RANGES.dress.flare);
  dna.dress.length = mid(rng, RANGES.dress.length);
  dna.dress.trim = chance(rng, 0.7);
  dna.dress.sash = chance(rng, 0.6);
  dna.dress.puffSleeves = species === 'human' ? chance(rng, 0.6) : chance(rng, 0.2);

  dna.face.eyeStyle = pickWeighted(rng, def.rand.eyes);
  dna.face.eyeSize = mid(rng, RANGES.face.eyeSize);
  dna.face.eyeSpacing = mid(rng, RANGES.face.eyeSpacing);
  dna.face.eyeTilt = mid(rng, RANGES.face.eyeTilt);
  dna.face.blush = species === 'skeleton' || species === 'undead'
    ? (chance(rng, 0.2) ? 0.4 : 0)
    : mid(rng, RANGES.face.blush);
  dna.face.mouth = pickWeighted(rng, def.rand.mouth);

  dna.hair.style = pickWeighted(rng, def.rand.hair);
  dna.hair.length = mid(rng, RANGES.hair.length);

  dna.parts.crown = pickWeighted(rng, def.rand.crown);
  dna.parts.crownTilt = species === 'skeleton' || species === 'goblin'
    ? -0.25 + rng() * 0.35
    : (chance(rng, 0.25) ? mid(rng, RANGES.parts.crownTilt) : 0);
  dna.parts.crownSize = mid(rng, RANGES.parts.crownSize);
  dna.parts.ears = pickWeighted(rng, def.rand.ears);
  dna.parts.earSize = mid(rng, RANGES.parts.earSize);
  dna.parts.tail = pickWeighted(rng, def.rand.tail);
  dna.parts.tailSize = mid(rng, RANGES.parts.tailSize);
  dna.parts.back = pickWeighted(rng, def.rand.back);
  dna.parts.backSize = mid(rng, RANGES.parts.backSize);
  dna.parts.handL = pickWeighted(rng, HAND_POOL);
  dna.parts.handR = chance(rng, 0.75) ? 'none' : pickWeighted(rng, HAND_POOL);
  dna.parts.handSize = mid(rng, RANGES.parts.handSize);
  dna.parts.glasses = chance(rng, species === 'gnome' ? 0.75 : 0.12);

  if (def.subtypes) {
    dna.subtype = pickWeighted(
      rng,
      def.subtypes.map((s, i) => [s.id, SUBTYPE_WEIGHTS[i] ?? 1] as const),
    );
  }

  dna.aura.intensity = mid(rng, RANGES.aura.intensity);

  dna.traits.snoutLength = mid(rng, RANGES.traits.snoutLength);
  dna.traits.fluff = mid(rng, RANGES.traits.fluff);
  dna.traits.wobble = mid(rng, RANGES.traits.wobble);
  dna.traits.translucency = mid(rng, RANGES.traits.translucency);
  dna.traits.coreGlow = mid(rng, RANGES.traits.coreGlow);
  dna.traits.boneThickness = mid(rng, RANGES.traits.boneThickness);
  dna.traits.eyeGlowIntensity = mid(rng, RANGES.traits.eyeGlowIntensity);

  dna.motion.energy = mid(rng, RANGES.motion.energy);
  dna.motion.bounce = mid(rng, RANGES.motion.bounce);

  // Palette first, then species-correct skin/hair swaps for extra variety.
  dna.colors = { ...pick(rng, def.palettes).colors };
  if (chance(rng, 0.55)) dna.colors.skin = pick(rng, def.skinTones);
  if (chance(rng, 0.55)) dna.colors.hair = pick(rng, def.hairColors);

  // Class vocabulary applies LAST so its outfit patch stays coherent.
  const rolledClass = pickWeighted(rng, CLASS_POOL);
  CLASS_DEFS[rolledClass].apply(dna);

  return sanitizeDna(dna);
}

const MUTABLE_NUM_PATHS: readonly (readonly [keyof typeof RANGES, string])[] = [
  ['body', 'headSize'], ['body', 'chubbiness'], ['body', 'armLength'],
  ['body', 'legLength'], ['body', 'hipWidth'], ['dress', 'flare'],
  ['dress', 'length'], ['face', 'eyeSize'], ['face', 'eyeSpacing'],
  ['face', 'blush'], ['hair', 'length'], ['parts', 'earSize'],
  ['parts', 'tailSize'], ['parts', 'crownSize'], ['aura', 'intensity'],
  ['traits', 'fluff'], ['traits', 'wobble'], ['traits', 'snoutLength'],
  ['motion', 'energy'], ['motion', 'bounce'],
];

/** Nudge 2–4 numeric fields ±15% of their range, occasionally reroll a chip. */
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
