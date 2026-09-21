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

  it('rock-chunk variants stay watertight after vertex displacement (every edge shared by exactly 2 faces)', () => {
    // Regression test: an earlier version of displaceRockVertices() keyed its
    // per-vertex random scale off the array index rather than the vertex's
    // own position. PolyhedronGeometry (Dodecahedron/Icosahedron's base
    // class) is non-indexed, so a corner shared by several faces exists as
    // several separate position entries — displacing each by an
    // independently-drawn random amount tore those "same" corners apart,
    // producing visible cracks/black seam gaps in rendered rocks. A
    // watertight mesh's every interior edge is shared by exactly 2
    // triangles; this check fails immediately if displacement re-introduces
    // that per-index (rather than per-position) bug.
    const QUANT = 100; // coarser than production's displacement quantization — just needs to survive float rounding
    for (const geo of getPartVariantPool('rock-chunk')) {
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      const key = (i: number) => {
        v.fromBufferAttribute(pos, i);
        return `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)},${Math.round(v.z * QUANT)}`;
      };
      const edgeCounts = new Map<string, number>();
      for (let f = 0; f < pos.count; f += 3) {
        const k0 = key(f), k1 = key(f + 1), k2 = key(f + 2);
        for (const [a, b] of [[k0, k1], [k1, k2], [k2, k0]] as const) {
          const edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
          edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
        }
      }
      for (const count of edgeCounts.values()) {
        expect(count).toBe(2);
      }
    }
  });
});
