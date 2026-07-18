// ── DNA core invariants (see DNA_SCHEMA.md §3) ──────────────────────────────

import { describe, it, expect } from 'vitest';
import { ARCHETYPES, RANGES, type Range } from '../types';
import {
  defaultDna, sanitizeDna, dnaToShareCode, shareCodeToDna, cloneDna,
} from '../dna';
import { randomDna, mutateDna } from '../randomize';
import { mulberry32 } from '../rng';
import { generateName } from '../names';

describe('defaults', () => {
  it.each(ARCHETYPES)('defaultDna(%s) survives sanitize unchanged', (a) => {
    const d = defaultDna(a);
    expect(sanitizeDna(cloneDna(d))).toEqual(d);
  });
});

describe('share codes', () => {
  it.each(ARCHETYPES)('%s round-trips dna → code → dna', (a) => {
    const d = defaultDna(a);
    d.name = 'Tëst Prinzessin ✨';
    const code = dnaToShareCode(d);
    expect(code.startsWith('P1.')).toBe(true);
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
    expect(dna!.archetype).toBe('fox');
    expect(dna!.body.headSize).toBe(RANGES.body.headSize.max); // clamped
    expect(dna!.parts.ears).toBe('fox'); // archetype defaults filled in
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
    expect(sanitizeDna(42).v).toBe(1);
  });
});

function inRange(v: number, r: Range): boolean {
  return v >= r.min && v <= r.max;
}

describe('randomize', () => {
  it('is deterministic per seed', () => {
    expect(randomDna('fox', 1234)).toEqual(randomDna('fox', 1234));
    expect(randomDna('fox', 1234)).not.toEqual(randomDna('fox', 1235));
  });

  it.each(ARCHETYPES)('%s: 200 seeds all produce valid DNA', (a) => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = randomDna(a, seed);
      expect(sanitizeDna(cloneDna(d))).toEqual(d);
      expect(inRange(d.body.headSize, RANGES.body.headSize)).toBe(true);
      expect(inRange(d.face.eyeSize, RANGES.face.eyeSize)).toBe(true);
      expect(d.archetype).toBe(a);
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
