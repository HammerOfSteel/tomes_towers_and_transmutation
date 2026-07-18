// ── DNA core invariants (see DNA_SCHEMA.md §3) ──────────────────────────────

import { describe, it, expect } from 'vitest';
import { SPECIES_IDS, RANGES, type Range } from '../types';
import {
  defaultDna, sanitizeDna, dnaToShareCode, shareCodeToDna, cloneDna,
} from '../dna';
import { randomDna, mutateDna } from '../randomize';
import { mulberry32 } from '../rng';
import { generateName } from '../names';

describe('defaults', () => {
  it.each(SPECIES_IDS)('defaultDna(%s) survives sanitize unchanged', (a) => {
    const d = defaultDna(a);
    expect(sanitizeDna(cloneDna(d))).toEqual(d);
  });
});

describe('share codes', () => {
  it.each(SPECIES_IDS)('%s round-trips dna → code → dna', (a) => {
    const d = defaultDna(a);
    d.name = 'Tëst Prinzessin ✨';
    const code = dnaToShareCode(d);
    expect(code.startsWith('P2.')).toBe(true);
    expect(shareCodeToDna(code)).toEqual(d);
  });

  it('rejects garbage', () => {
    expect(shareCodeToDna('')).toBeNull();
    expect(shareCodeToDna('hello')).toBeNull();
    expect(shareCodeToDna('P1.%%%not-base64%%%')).toBeNull();
    expect(shareCodeToDna('P99.eyJ9')).toBeNull(); // future version
  });

  it('tolerates truncated-but-decodable payloads via sanitize', () => {
    const partial = { archetype: 'fox', body: { headSize: 99 } };
    const b64 = Buffer.from(JSON.stringify(partial), 'utf8').toString('base64url');
    const dna = shareCodeToDna(`P1.${b64}`);
    expect(dna).not.toBeNull();
    expect(dna!.species).toBe('foxling');   // v1 archetype → v2 species
    expect(dna!.archetype).toBe('fox');
    expect(dna!.body.headSize).toBe(RANGES.body.headSize.max); // clamped
    expect(dna!.parts.ears).toBe('fox'); // species defaults filled in
  });

  it('migrates full v1 codes: archetype→species, species knobs→traits', () => {
    const v1 = {
      v: 1, name: 'Old Fox', seed: 7, archetype: 'fox',
      body: { height: 1, headSize: 1.2, chubbiness: 1.1, armLength: 1, legLength: 0.95, shoulderWidth: 1, hipWidth: 1.05 },
      dress: { style: 'hex', flare: 1.1, length: 1, trim: true, sash: false, puffSleeves: false },
      face: { eyeStyle: 'button', eyeSize: 1, eyeSpacing: 1, eyeTilt: 0.12, blush: 0.4, mouth: 'cat' },
      hair: { style: 'none', length: 1 },
      parts: { crown: 'classic', crownTilt: 0, ears: 'fox', earSize: 1.2, tail: 'fluffy', tailSize: 1, back: 'none', handL: 'none', handR: 'none' },
      colors: { primary: '#ff8fb3', secondary: '#fff6ec', accent: '#ffd166', skin: '#e8874a', hair: '#fce3c3', eyes: '#3c2a1e', metal: '#f1c40f', glow: '#ffe9a8' },
      species: { snoutLength: 1.4, fluff: 1.8, wobble: 0.5, translucency: 0.6, coreGlow: 0.35, boneThickness: 1, eyeGlowIntensity: 1 },
      motion: { energy: 0.65, bounce: 0.55, idleStyle: 'bob' },
    };
    const b64 = Buffer.from(JSON.stringify(v1), 'utf8').toString('base64url');
    const dna = shareCodeToDna(`P1.${b64}`);
    expect(dna).not.toBeNull();
    expect(dna!.v).toBe(2);
    expect(dna!.species).toBe('foxling');
    expect(dna!.subtype).toBe('1');           // kitsune default subtype
    expect(dna!.pclass).toBe('none');
    expect(dna!.traits.snoutLength).toBeCloseTo(1.4); // v1 species obj → traits
    expect(dna!.traits.fluff).toBeCloseTo(1.8);
    expect(dna!.body.headSize).toBeCloseTo(1.2);
    expect(dna!.colors.primary).toBe('#ff8fb3');
  });
});

describe('sanitize', () => {
  it('clamps numerics and falls back on bad enums/colors', () => {
    const d = defaultDna('human');
    const raw = cloneDna(d) as unknown as Record<string, never> & ReturnType<typeof defaultDna>;
    raw.body.chubbiness = -50;
    raw.face.eyeStyle = 'laser' as never;
    raw.colors.primary = 'not-a-color';
    const clean = sanitizeDna(raw);
    expect(clean.body.chubbiness).toBe(RANGES.body.chubbiness.min);
    expect(clean.face.eyeStyle).toBe(d.face.eyeStyle);
    expect(clean.colors.primary).toBe(d.colors.primary);
  });

  it('handles non-object input', () => {
    expect(sanitizeDna(null).archetype).toBe('human');
    expect(sanitizeDna(42).v).toBe(2);
  });
});

function inRange(v: number, r: Range): boolean {
  return v >= r.min && v <= r.max;
}

describe('randomize', () => {
  it('is deterministic per seed', () => {
    expect(randomDna('foxling', 1234)).toEqual(randomDna('foxling', 1234));
    expect(randomDna('foxling', 1234)).not.toEqual(randomDna('foxling', 1235));
  });

  it.each(SPECIES_IDS)('%s: 200 seeds all produce valid DNA', (a) => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = randomDna(a, seed);
      expect(sanitizeDna(cloneDna(d))).toEqual(d);
      expect(inRange(d.body.headSize, RANGES.body.headSize)).toBe(true);
      expect(inRange(d.face.eyeSize, RANGES.face.eyeSize)).toBe(true);
      expect(d.species).toBe(a);
      expect(d.name.length).toBeGreaterThan(0);
    }
  });

  it('mutate nudges without invalidating', () => {
    const base = defaultDna('slime');
    for (let seed = 1; seed <= 100; seed++) {
      const m = mutateDna(base, seed);
      expect(sanitizeDna(cloneDna(m))).toEqual(m);
      expect(m.archetype).toBe('slime');
    }
  });
});

describe('names', () => {
  it('is deterministic and bounded', () => {
    const a = generateName(mulberry32(7), 'human');
    const b = generateName(mulberry32(7), 'human');
    expect(a).toBe(b);
    for (let s = 0; s < 50; s++) {
      const n = generateName(mulberry32(s), 'skeleton');
      expect(n.length).toBeGreaterThan(1);
      expect(n.length).toBeLessThanOrEqual(24);
    }
  });
});
