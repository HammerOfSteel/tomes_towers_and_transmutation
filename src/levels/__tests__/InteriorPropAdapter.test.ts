import { describe, it, expect } from 'vitest';
import { pickQuatPropModelId, PROP_KIND_TO_QUAT_MODEL } from '../InteriorPropAdapter';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import type { PropKind } from '@/prop-creator/types';

const ALL_PROP_KINDS: readonly PropKind[] = [
  'chest', 'bookshelf', 'table', 'chair', 'cauldron', 'lantern',
  'pillar', 'rug', 'door', 'statue', 'barrel', 'crate',
];

describe('PROP_KIND_TO_QUAT_MODEL', () => {
  it('every mapped model id exists in QUAT_MODELS (no invented ids)', () => {
    const manifestIds = new Set(QUAT_MODELS.map(m => m.id));
    for (const [kind, ids] of Object.entries(PROP_KIND_TO_QUAT_MODEL)) {
      for (const id of ids!) {
        expect(manifestIds.has(id), `${kind} -> ${id} missing from manifest`).toBe(true);
      }
    }
  });

  it('rug has no mapping (no verified real-asset match found in inventory)', () => {
    expect(PROP_KIND_TO_QUAT_MODEL.rug).toBeUndefined();
  });

  it('every PropKind except rug has at least one mapped model', () => {
    for (const kind of ALL_PROP_KINDS) {
      if (kind === 'rug') continue;
      expect(PROP_KIND_TO_QUAT_MODEL[kind]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('pickQuatPropModelId', () => {
  it('returns null for an unmapped kind (rug)', () => {
    expect(pickQuatPropModelId('rug', 0)).toBeNull();
    expect(pickQuatPropModelId('rug', 42)).toBeNull();
  });

  it.each(ALL_PROP_KINDS.filter(k => k !== 'rug'))(
    'cycles %s deterministically through its variants by seed',
    (kind) => {
      const variants = PROP_KIND_TO_QUAT_MODEL[kind]!;
      const ids = variants.map((_, seed) => pickQuatPropModelId(kind, seed));
      expect(ids).toEqual(variants);
    },
  );

  it('wraps around for seeds beyond the variant count', () => {
    const variants = PROP_KIND_TO_QUAT_MODEL.chest!;
    expect(pickQuatPropModelId('chest', variants.length)).toBe(variants[0]);
    expect(pickQuatPropModelId('chest', variants.length + 1)).toBe(variants[1]);
  });

  it('is stable for negative seeds (no negative array index)', () => {
    const variants = PROP_KIND_TO_QUAT_MODEL.chest!;
    expect(pickQuatPropModelId('chest', -1)).toBe(variants[variants.length - 1]);
  });
});
