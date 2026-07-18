// ── DNA core: defaults, validation, migration, share codes ──────────────────
//
//  Share code format:  P1.<base64url(JSON.stringify(dna))>
//  Decoding is forgiving: unknown fields dropped, missing fields defaulted,
//  numerics clamped. See docs/princess-creator/DNA_SCHEMA.md.

import type {
  Archetype, PrincessDNA, ColorsDna, Range,
} from './types';
import {
  ARCHETYPES, RANGES, DRESS_STYLES, EYE_STYLES, MOUTH_STYLES, HAIR_STYLES,
  CROWN_IDS, EAR_IDS, TAIL_IDS, BACK_IDS, HAND_ITEM_IDS, IDLE_STYLES,
} from './types';
import { defaultColors } from './palettes';

export const DNA_VERSION = 1;
const CODE_PREFIX = /^P(\d+)\./;

// ── Defaults ─────────────────────────────────────────────────────────────────

const BASE_BODY = {
  height: 1, headSize: 1, chubbiness: 1, armLength: 1, legLength: 1,
  shoulderWidth: 1, hipWidth: 1,
};

const BASE_SPECIES = {
  snoutLength: 1, fluff: 1.2, wobble: 0.5, translucency: 0.6,
  coreGlow: 0.35, boneThickness: 1, eyeGlowIntensity: 1,
};

export function defaultDna(archetype: Archetype): PrincessDNA {
  const colors: ColorsDna = defaultColors(archetype);
  const base: PrincessDNA = {
    v: 1,
    name: 'Amelie',
    seed: 1,
    archetype,
    body: { ...BASE_BODY },
    dress: { style: 'bell', flare: 1, length: 1, trim: true, sash: true, puffSleeves: true },
    face: { eyeStyle: 'sparkle', eyeSize: 1, eyeSpacing: 1, eyeTilt: 0.08, blush: 0.5, mouth: 'smile' },
    hair: { style: 'bob', length: 1 },
    parts: {
      crown: 'tiara', crownTilt: 0, ears: 'none', earSize: 1.1,
      tail: 'none', tailSize: 1, back: 'bow', handL: 'none', handR: 'none',
    },
    colors,
    species: { ...BASE_SPECIES },
    motion: { energy: 0.55, bounce: 0.5, idleStyle: 'sway' },
  };

  switch (archetype) {
    case 'human':
      return base;
    case 'fox':
      return {
        ...base,
        name: 'Maribel',
        body: { ...BASE_BODY, chubbiness: 1.1, legLength: 0.95, hipWidth: 1.05 },
        dress: { ...base.dress, style: 'hex', flare: 1.1, puffSleeves: false },
        face: { ...base.face, eyeStyle: 'button', eyeTilt: 0.12, blush: 0.4, mouth: 'cat' },
        hair: { style: 'none', length: 1 },
        parts: { ...base.parts, crown: 'classic', ears: 'fox', earSize: 1.2, tail: 'fluffy', back: 'none' },
        motion: { energy: 0.65, bounce: 0.55, idleStyle: 'bob' },
      };
    case 'slime':
      return {
        ...base,
        name: 'Blobette',
        body: { ...BASE_BODY, height: 0.95, headSize: 1.1, chubbiness: 1.2, armLength: 0.9, legLength: 0.85, hipWidth: 1.15 },
        dress: { ...base.dress, style: 'bell', trim: false, sash: false, puffSleeves: false },
        face: { ...base.face, eyeStyle: 'sparkle', eyeSize: 1.15, blush: 0.35, mouth: 'open' },
        hair: { style: 'twintails', length: 1 },
        parts: { ...base.parts, crown: 'halo', back: 'none', tail: 'wisp' },
        motion: { energy: 0.5, bounce: 0.65, idleStyle: 'float' },
      };
    case 'skeleton':
      return {
        ...base,
        name: 'Mortica',
        body: { ...BASE_BODY, chubbiness: 0.85, armLength: 1.05, legLength: 1.05, shoulderWidth: 0.95, hipWidth: 0.9 },
        dress: { ...base.dress, style: 'aline', puffSleeves: false },
        face: { ...base.face, eyeStyle: 'glow', eyeSize: 1.05, blush: 0, mouth: 'teeth' },
        hair: { style: 'none', length: 1 },
        parts: { ...base.parts, crown: 'crooked', crownTilt: -0.22, back: 'cape', tail: 'none' },
        motion: { energy: 0.5, bounce: 0.4, idleStyle: 'rattle' },
      };
  }
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
 * Sanitize arbitrary input into a valid PrincessDNA: unknown enum values and
 * malformed colors fall back to archetype defaults, numerics are clamped.
 */
export function sanitizeDna(raw: unknown): PrincessDNA {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as DeepPartial<PrincessDNA>;
  const archetype = oneOf(r.archetype, ARCHETYPES, 'human');
  const d = defaultDna(archetype);
  const rb = r.body ?? {}, rd = r.dress ?? {}, rf = r.face ?? {}, rh = r.hair ?? {};
  const rp = r.parts ?? {}, rc = r.colors ?? {}, rs = r.species ?? {}, rm = r.motion ?? {};

  return {
    v: 1,
    name: typeof r.name === 'string' ? r.name.slice(0, 24) : d.name,
    seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? r.seed >>> 0 : d.seed,
    archetype,
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
      ears: oneOf(rp.ears, EAR_IDS, d.parts.ears),
      earSize: clampNum(rp.earSize, RANGES.parts.earSize, d.parts.earSize),
      tail: oneOf(rp.tail, TAIL_IDS, d.parts.tail),
      tailSize: clampNum(rp.tailSize, RANGES.parts.tailSize, d.parts.tailSize),
      back: oneOf(rp.back, BACK_IDS, d.parts.back),
      handL: oneOf(rp.handL, HAND_ITEM_IDS, d.parts.handL),
      handR: oneOf(rp.handR, HAND_ITEM_IDS, d.parts.handR),
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
    species: {
      snoutLength: clampNum(rs.snoutLength, RANGES.species.snoutLength, d.species.snoutLength),
      fluff: clampNum(rs.fluff, RANGES.species.fluff, d.species.fluff),
      wobble: clampNum(rs.wobble, RANGES.species.wobble, d.species.wobble),
      translucency: clampNum(rs.translucency, RANGES.species.translucency, d.species.translucency),
      coreGlow: clampNum(rs.coreGlow, RANGES.species.coreGlow, d.species.coreGlow),
      boneThickness: clampNum(rs.boneThickness, RANGES.species.boneThickness, d.species.boneThickness),
      eyeGlowIntensity: clampNum(rs.eyeGlowIntensity, RANGES.species.eyeGlowIntensity, d.species.eyeGlowIntensity),
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

/** Version migrations. v1 is current; future versions chain pure upgrades here. */
function migrate(raw: unknown, fromVersion: number): unknown {
  // e.g. when v2 lands:
  //   let data = raw;
  //   if (fromVersion < 2) data = migrateV1toV2(data);
  //   return data;
  void fromVersion;
  return raw;
}
