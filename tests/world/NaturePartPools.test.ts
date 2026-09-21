import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getPartVariantPool, _resetPartVariantPoolsForTest } from '@/world/NaturePartPools';

describe('getPartVariantPool', () => {
  it('returns 4 trunk variants', () => {
    expect(getPartVariantPool('trunk').length).toBe(4);
  });

  it('returns 4 branch-arm variants', () => {
    expect(getPartVariantPool('branch-arm').length).toBe(4);
  });

  it('returns 6 canopy-blob variants', () => {
    expect(getPartVariantPool('canopy-blob').length).toBe(6);
  });

  it('returns 6 rock-chunk variants', () => {
    expect(getPartVariantPool('rock-chunk').length).toBe(6);
  });

  it('every variant has non-degenerate geometry', () => {
    for (const partType of ['trunk', 'branch-arm', 'canopy-blob', 'rock-chunk'] as const) {
      for (const geo of getPartVariantPool(partType)) {
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        expect(pos.count).toBeGreaterThan(0);
      }
    }
  });

  it('caches: repeated calls return the same array/geometry instances', () => {
    const a = getPartVariantPool('rock-chunk');
    const b = getPartVariantPool('rock-chunk');
    expect(a).toBe(b);
    expect(a[0]).toBe(b[0]);
  });

  it('rock-chunk variants have distinct vertex displacement (not a shared no-op)', () => {
    const pool = getPartVariantPool('rock-chunk');
    const pos0 = (pool[0]!.getAttribute('position') as THREE.BufferAttribute).array;
    const pos1 = (pool[1]!.getAttribute('position') as THREE.BufferAttribute).array;
    expect(Array.from(pos0)).not.toEqual(Array.from(pos1));
  });

  it('is deterministic across a fresh cache (same seeds every process)', () => {
    _resetPartVariantPoolsForTest();
    const first = getPartVariantPool('trunk');
    const firstPositions = Array.from((first[0]!.getAttribute('position') as THREE.BufferAttribute).array);
    _resetPartVariantPoolsForTest();
    const second = getPartVariantPool('trunk');
    const secondPositions = Array.from((second[0]!.getAttribute('position') as THREE.BufferAttribute).array);
    expect(firstPositions).toEqual(secondPositions);
  });
});
