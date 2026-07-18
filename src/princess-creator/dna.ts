// ── DNA core v2: defaults, validation, migration, share codes ───────────────
//
//  Share code format:  P<version>.<base64url(JSON.stringify(dna))>
//  v1 codes (4 archetypes) migrate to v2 (species/class/subtype/aura/traits)
//  on import. Decoding is forgiving: unknown fields dropped, missing fields
//  defaulted, numerics clamped. See docs/princess-creator/DNA_SCHEMA.md.

import type { PrincessDNA, SpeciesId, Range } from './types';
import {
  SPECIES_IDS, CLASS_IDS, AURA_STYLES, RANGES,
  DRESS_STYLES, EYE_STYLES, MOUTH_STYLES, HAIR_STYLES,
  CROWN_IDS, EAR_IDS, TAIL_IDS, BACK_IDS, HAND_ITEM_IDS, IDLE_STYLES,
} from './types';
import { SPECIES_DEFS, defaultColors } from './species';

export const DNA_VERSION = 2;
const CODE_PREFIX = /^P(\d+)\./;

const NAME_DEFAULTS: Record<SpeciesId, string> = {
  human: 'Amelie', elf: 'Sylvael', high_elf: 'Aurelienne', pixie: 'Pip',
  undead: 'Morwen', celestial: 'Seraphel', draconic: 'Emberlyn',
  gnome: 'Podkin', goblin: 'Snikret', foxling: 'Maribel',
  ignis: 'Cindra', specter: 'Vesper', fae: 'Briarwyn',
  naiad: 'Nerissa', moonborn: 'Selenne', verdant: 'Rowana',
  slime: 'Blobette', skeleton: 'Mortica',
};

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Neutral chibi base — species defs stamp identity on top of this. */
function baseDna(): PrincessDNA {
  return {
    v: 2,
    name: 'Amelie',
    seed: 1,
    species: 'human',
    archetype: 'human',
    pclass: 'none',
    subtype: '',
    aura: { style: 'none', intensity: 0.5 },
    body: {
      height: 1, headSize: 1, chubbiness: 1, armLength: 1, legLength: 1,
      shoulderWidth: 1, hipWidth: 1,
    },
    dress: { style: 'bell', flare: 1, length: 1, trim: true, sash: true, puffSleeves: true },
    face: { eyeStyle: 'sparkle', eyeSize: 1, eyeSpacing: 1, eyeTilt: 0.08, blush: 0.5, mouth: 'smile' },
    hair: { style: 'bob', length: 1 },
    parts: {
      crown: 'tiara', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1.1,
      tail: 'none', tailSize: 1, back: 'bow', backSize: 1,
      handL: 'none', handR: 'none', handSize: 1, glasses: false,
    },
    colors: defaultColors('human'),
    traits: {
      snoutLength: 1, fluff: 1.2, wobble: 0.5, translucency: 0.6,
      coreGlow: 0.35, boneThickness: 1, eyeGlowIntensity: 1,
    },
    motion: { energy: 0.55, bounce: 0.5, idleStyle: 'sway' },
  };
}

/** Species default WITHOUT sanitize recursion (sanitize calls this). */
function speciesBase(species: SpeciesId): PrincessDNA {
  const dna = baseDna();
  dna.species = species;
  dna.name = NAME_DEFAULTS[species];
  dna.colors = defaultColors(species);
  SPECIES_DEFS[species].apply(dna);
  return dna;
}

export function defaultDna(species: SpeciesId): PrincessDNA {
  return sanitizeDna(speciesBase(species));
}

export function cloneDna(dna: PrincessDNA): PrincessDNA {
  return JSON.parse(JSON.stringify(dna)) as PrincessDNA;
}

// ── Validation / clamping ────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clampNum(v: unknown, range: Range, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : fallback;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Sanitize arbitrary input into valid v2 DNA. `species` is authoritative:
 * `archetype` is always re-derived from the species def, and `subtype` must
 * be one of the species' declared subtypes (or '').
 */
export function sanitizeDna(raw: unknown): PrincessDNA {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as DeepPartial<PrincessDNA>;
  const species = oneOf(r.species, SPECIES_IDS, 'human');
  const def = SPECIES_DEFS[species];
  const d = speciesBase(species);
  const rb = r.body ?? {}, rd = r.dress ?? {}, rf = r.face ?? {}, rh = r.hair ?? {};
  const rp = r.parts ?? {}, rc = r.colors ?? {}, rt = r.traits ?? {}, rm = r.motion ?? {};
  const ra = r.aura ?? {};

  const subtypeIds = def.subtypes?.map((s) => s.id) ?? [];

  return {
    v: 2,
    name: typeof r.name === 'string' ? r.name.slice(0, 24) : d.name,
    seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? r.seed >>> 0 : d.seed,
    species,
    archetype: def.synth,
    pclass: oneOf(r.pclass, CLASS_IDS, 'none'),
    subtype: subtypeIds.length > 0 ? oneOf(r.subtype, subtypeIds, d.subtype) : '',
    aura: {
      style: oneOf(ra.style, AURA_STYLES, d.aura.style),
      intensity: clampNum(ra.intensity, RANGES.aura.intensity, d.aura.intensity),
    },
    body: {
      height: clampNum(rb.height, RANGES.body.height, d.body.height),
      headSize: clampNum(rb.headSize, RANGES.body.headSize, d.body.headSize),
      chubbiness: clampNum(rb.chubbiness, RANGES.body.chubbiness, d.body.chubbiness),
      armLength: clampNum(rb.armLength, RANGES.body.armLength, d.body.armLength),
      legLength: clampNum(rb.legLength, RANGES.body.legLength, d.body.legLength),
      shoulderWidth: clampNum(rb.shoulderWidth, RANGES.body.shoulderWidth, d.body.shoulderWidth),
      hipWidth: clampNum(rb.hipWidth, RANGES.body.hipWidth, d.body.hipWidth),
    },
    dress: {
      style: oneOf(rd.style, DRESS_STYLES, d.dress.style),
      flare: clampNum(rd.flare, RANGES.dress.flare, d.dress.flare),
      length: clampNum(rd.length, RANGES.dress.length, d.dress.length),
      trim: bool(rd.trim, d.dress.trim),
      sash: bool(rd.sash, d.dress.sash),
      puffSleeves: bool(rd.puffSleeves, d.dress.puffSleeves),
    },
    face: {
      eyeStyle: oneOf(rf.eyeStyle, EYE_STYLES, d.face.eyeStyle),
      eyeSize: clampNum(rf.eyeSize, RANGES.face.eyeSize, d.face.eyeSize),
      eyeSpacing: clampNum(rf.eyeSpacing, RANGES.face.eyeSpacing, d.face.eyeSpacing),
      eyeTilt: clampNum(rf.eyeTilt, RANGES.face.eyeTilt, d.face.eyeTilt),
      blush: clampNum(rf.blush, RANGES.face.blush, d.face.blush),
      mouth: oneOf(rf.mouth, MOUTH_STYLES, d.face.mouth),
    },
    hair: {
      style: oneOf(rh.style, HAIR_STYLES, d.hair.style),
      length: clampNum(rh.length, RANGES.hair.length, d.hair.length),
    },
    parts: {
      crown: oneOf(rp.crown, CROWN_IDS, d.parts.crown),
      crownTilt: clampNum(rp.crownTilt, RANGES.parts.crownTilt, d.parts.crownTilt),
      crownSize: clampNum(rp.crownSize, RANGES.parts.crownSize, d.parts.crownSize),
      ears: oneOf(rp.ears, EAR_IDS, d.parts.ears),
      earSize: clampNum(rp.earSize, RANGES.parts.earSize, d.parts.earSize),
      tail: oneOf(rp.tail, TAIL_IDS, d.parts.tail),
      tailSize: clampNum(rp.tailSize, RANGES.parts.tailSize, d.parts.tailSize),
      back: oneOf(rp.back, BACK_IDS, d.parts.back),
      backSize: clampNum(rp.backSize, RANGES.parts.backSize, d.parts.backSize),
      handL: oneOf(rp.handL, HAND_ITEM_IDS, d.parts.handL),
      handR: oneOf(rp.handR, HAND_ITEM_IDS, d.parts.handR),
      handSize: clampNum(rp.handSize, RANGES.parts.handSize, d.parts.handSize),
      glasses: bool(rp.glasses, d.parts.glasses),
    },
    colors: {
      primary: hex(rc.primary, d.colors.primary),
      secondary: hex(rc.secondary, d.colors.secondary),
      accent: hex(rc.accent, d.colors.accent),
      skin: hex(rc.skin, d.colors.skin),
      hair: hex(rc.hair, d.colors.hair),
      eyes: hex(rc.eyes, d.colors.eyes),
      metal: hex(rc.metal, d.colors.metal),
      glow: hex(rc.glow, d.colors.glow),
    },
    traits: {
      snoutLength: clampNum(rt.snoutLength, RANGES.traits.snoutLength, d.traits.snoutLength),
      fluff: clampNum(rt.fluff, RANGES.traits.fluff, d.traits.fluff),
      wobble: clampNum(rt.wobble, RANGES.traits.wobble, d.traits.wobble),
      translucency: clampNum(rt.translucency, RANGES.traits.translucency, d.traits.translucency),
      coreGlow: clampNum(rt.coreGlow, RANGES.traits.coreGlow, d.traits.coreGlow),
      boneThickness: clampNum(rt.boneThickness, RANGES.traits.boneThickness, d.traits.boneThickness),
      eyeGlowIntensity: clampNum(rt.eyeGlowIntensity, RANGES.traits.eyeGlowIntensity, d.traits.eyeGlowIntensity),
    },
    motion: {
      energy: clampNum(rm.energy, RANGES.motion.energy, d.motion.energy),
      bounce: clampNum(rm.bounce, RANGES.motion.bounce, d.motion.bounce),
      idleStyle: oneOf(rm.idleStyle, IDLE_STYLES, d.motion.idleStyle),
    },
  };
}

// ── Share codes ──────────────────────────────────────────────────────────────

function toBase64Url(s: string): string {
  const b64 = typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return typeof atob === 'function'
    ? decodeURIComponent(escape(atob(padded)))
    : Buffer.from(padded, 'base64').toString('utf8');
}

export function dnaToShareCode(dna: PrincessDNA): string {
  return `P${DNA_VERSION}.${toBase64Url(JSON.stringify(dna))}`;
}

/** Import a raw DNA object (e.g. a dropped .princess.json) with migrations. */
export function dnaFromRaw(raw: unknown): PrincessDNA {
  const v = typeof raw === 'object' && raw !== null &&
    typeof (raw as { v?: unknown }).v === 'number'
    ? (raw as { v: number }).v
    : 1;
  return sanitizeDna(migrate(raw, Math.min(Math.max(1, v), DNA_VERSION)));
}

/** Parse a share code. Returns null for garbage; migrates + sanitizes valid ones. */
export function shareCodeToDna(code: string): PrincessDNA | null {
  const trimmed = code.trim();
  const m = CODE_PREFIX.exec(trimmed);
  if (!m) return null;
  const version = parseInt(m[1], 10);
  if (!Number.isFinite(version) || version < 1 || version > DNA_VERSION) return null;
  try {
    const json = fromBase64Url(trimmed.slice(m[0].length));
    const raw: unknown = JSON.parse(json);
    return sanitizeDna(migrate(raw, version));
  } catch {
    return null;
  }
}

// ── Migrations ───────────────────────────────────────────────────────────────

const V1_ARCHETYPE_TO_SPECIES: Record<string, SpeciesId> = {
  human: 'human', fox: 'foxling', slime: 'slime', skeleton: 'skeleton',
};

/** Pure version upgrades; sanitize handles field-level repair afterwards. */
function migrate(raw: unknown, fromVersion: number): unknown {
  let data = raw;
  if (fromVersion < 2) data = migrateV1toV2(data);
  return data;
}

function migrateV1toV2(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const v1 = raw as Record<string, unknown>;
  const archetype = typeof v1.archetype === 'string' ? v1.archetype : 'human';
  const species = V1_ARCHETYPE_TO_SPECIES[archetype] ?? 'human';
  return {
    ...v1,
    v: 2,
    species,
    pclass: 'none',
    subtype: species === 'foxling' ? '1' : '',
    // v1 kept the signature knobs in a field named `species` — now `traits`.
    traits: typeof v1.species === 'object' && v1.species !== null ? v1.species : undefined,
    aura: undefined, // species default fills in
  };
}
