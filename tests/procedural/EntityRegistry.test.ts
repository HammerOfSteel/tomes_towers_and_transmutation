/**
 * EntityRegistry.test.ts — PROC-A6
 * EntityRegistry resolves all known kinds without error.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveBuilder,
  registeredKinds,
  registerBuilder,
  buildEntity,
} from '@/procedural/EntityRegistry';
import type { ProceduralDNA, EntityKind } from '@/procedural/ProceduralDNA';
import { encodeShareCode, decodeShareCode, kindFromShareCode, SHARE_CODE_PREFIX } from '@/procedural/ProceduralDNA';

// ── A6: registry resolves all kinds ──────────────────────────────────────────

describe('EntityRegistry', () => {
  it('registeredKinds() returns all 5 entity kinds', () => {
    const kinds = registeredKinds();
    expect(kinds).toContain('princess');
    expect(kinds).toContain('npc');
    expect(kinds).toContain('enemy');
    expect(kinds).toContain('prop');
    expect(kinds).toContain('building');
    expect(kinds).toHaveLength(5);
  });

  it('resolveBuilder returns a function for every kind', async () => {
    for (const kind of registeredKinds()) {
      const fn = await resolveBuilder(kind as EntityKind);
      expect(typeof fn).toBe('function');
    }
  });

  it('registerBuilder overwrites an existing entry', async () => {
    const stub = vi.fn().mockReturnValue({
      root: {} as any, dna: {} as any,
      update: () => {}, dispose: () => {},
    });
    registerBuilder('npc', stub);
    const fn = await resolveBuilder('npc');
    const dna: ProceduralDNA = { v: 1, kind: 'npc', name: 'test', seed: 1 };
    fn(dna);
    expect(stub).toHaveBeenCalledWith(dna);
    // reset stub so other tests are unaffected
    registerBuilder('npc', stub);
  });

  it('resolveBuilder throws for unknown kind', async () => {
    await expect(resolveBuilder('unknown' as EntityKind)).rejects.toThrow('[EntityRegistry]');
  });
});

// ── A4 (share codes): encode / decode round-trip for every kind ───────────────

describe('Share code system', () => {
  const SAMPLE_DNAS: ProceduralDNA[] = [
    { v: 1, kind: 'princess', name: 'Maribel',  seed: 3001 },
    { v: 1, kind: 'npc',      name: 'Innkeeper', seed: 5001 },
    { v: 1, kind: 'enemy',    name: 'Skulker',   seed: 7001 },
    { v: 1, kind: 'prop',     name: 'Chest',     seed: 9001 },
    { v: 1, kind: 'building', name: 'Inn',       seed: 2001 },
  ];

  for (const dna of SAMPLE_DNAS) {
    it(`${dna.kind}: encode → decode round-trip`, () => {
      const code    = encodeShareCode(dna);
      const decoded = decodeShareCode(code);
      expect(decoded).not.toBeNull();
      expect(decoded!.kind).toBe(dna.kind);
      expect(decoded!.name).toBe(dna.name);
      expect(decoded!.seed).toBe(dna.seed);
    });

    it(`${dna.kind}: code starts with correct prefix`, () => {
      const code   = encodeShareCode(dna);
      const prefix = SHARE_CODE_PREFIX[dna.kind];
      expect(code.startsWith(prefix)).toBe(true);
    });

    it(`${dna.kind}: kindFromShareCode detects kind`, () => {
      const code = encodeShareCode(dna);
      expect(kindFromShareCode(code)).toBe(dna.kind);
    });
  }

  it('decodeShareCode returns null for garbage input', () => {
    expect(decodeShareCode('garbage')).toBeNull();
    expect(decodeShareCode('')).toBeNull();
    expect(decodeShareCode('XX.notvalid')).toBeNull();
  });

  it('decodeShareCode returns null for truncated code', () => {
    const code = encodeShareCode({ v: 1, kind: 'npc', name: 'Test', seed: 1 });
    expect(decodeShareCode(code.slice(0, 5))).toBeNull();
  });
});
