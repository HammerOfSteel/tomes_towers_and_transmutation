/**
 * NaturePartPools.ts — small, fixed libraries of distinct BufferGeometry
 * variants per nature-asset part-type, built once and cached lazily
 * (mirrors OverworldScene's `_pooledMaterial()`'s existing lazy-cache
 * convention, now for geometry instead of materials).
 *
 * Part of sub-task 1.2 (procedural nature-asset kit-of-parts) — see
 * docs/superpowers/specs/2026-09-21-procedural-nature-asset-kit-design.md §3.1
 * and docs/superpowers/plans/2026-09-21-procedural-nature-asset-kit.md Task 1.
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

export type PartType = 'trunk' | 'branch-arm' | 'canopy-blob' | 'rock-chunk';

/** Variant counts per part-type — trunk/branch-arm/canopy-blob variety comes from
 *  varying proportions (radius/height ratio, taper, radial segment count) baked
 *  into distinct geometries; rock-chunk variety additionally bakes a one-time
 *  vertex-displacement noise pass (see `displaceRockVertices()`) so no two
 *  rock-chunk variants share a silhouette. */
const VARIANT_COUNTS: Record<PartType, number> = {
  trunk: 4, 'branch-arm': 4, 'canopy-blob': 6, 'rock-chunk': 6,
};

function buildTrunkVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0001 + index);
  const taper = 0.55 + rand() * 0.35;      // top-radius / base-radius ratio
  const radialSegs = 5 + Math.floor(rand() * 3); // 5..7
  // Unit height/radius=1 cylinder; callers scale to the archetype's own trunkH/trunkR.
  return new THREE.CylinderGeometry(taper, 1, 1, radialSegs);
}

function buildBranchArmVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0100 + index);
  const taper = 0.5 + rand() * 0.4;
  const radialSegs = 5 + Math.floor(rand() * 2); // 5..6
  return new THREE.CylinderGeometry(taper, 1, 1, radialSegs);
}

function buildCanopyBlobVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0200 + index);
  const detail = rand() < 0.3 ? 1 : 0; // occasional smoother blob among the low-poly ones
  return new THREE.IcosahedronGeometry(1, detail);
}

/** Cheap deterministic hash → [0, 1) for a quantized 3D position. Used so every
 *  vertex-copy sharing the same original corner position gets the SAME
 *  pseudo-random displacement scale below (see `displaceRockVertices()`). */
function hashPosition(qx: number, qy: number, qz: number, seed: number): number {
  let h = (seed ^ 0x9E37_79B9) >>> 0;
  h = Math.imul(h ^ qx, 0x85EB_CA6B);
  h = Math.imul(h ^ qy, 0xC2B2_AE35);
  h = Math.imul(h ^ qz, 0x27D4_EB2F);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 0xFFFF_FFFF;
}

/** Applies a one-time, deterministic per-vertex outward displacement so this
 *  rock-chunk variant reads as distinctly faceted/irregular rather than a
 *  perfect dodecahedron/icosahedron — see research doc's "Kitbashing +
 *  vertex-displacement faceting" section. Mutates and returns `geo`.
 *
 *  IMPORTANT: `PolyhedronGeometry` (Dodecahedron/Icosahedron's base class)
 *  is NON-indexed — each face stores its own 3 vertex copies, so a shared
 *  corner between adjacent faces exists as multiple separate entries in
 *  `position` at the same coordinates. Displacing each entry by an
 *  independently-drawn random scale (as an earlier version of this function
 *  did, keying purely off array index) moves those "same" corners apart by
 *  different amounts, tearing the mesh open at every edge/corner — visible
 *  as black seam gaps and cracked-looking rock silhouettes. Keying the scale
 *  off the vertex's own (quantized) position instead, rather than its index
 *  in the array, guarantees every copy of the same corner gets an identical
 *  displacement, so faces stay watertight while the silhouette is still
 *  irregular/faceted. */
function displaceRockVertices(geo: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const QUANT = 1000; // quantize to 3 decimal places before hashing
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const qx = Math.round(v.x * QUANT);
    const qy = Math.round(v.y * QUANT);
    const qz = Math.round(v.z * QUANT);
    const scale = 1 + (hashPosition(qx, qy, qz, seed) - 0.5) * 0.32;
    v.multiplyScalar(scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildRockChunkVariant(index: number): THREE.BufferGeometry {
  const rand = mulberry32(0x7A17_0300 + index);
  const shape = rand();
  const base = shape < 0.5
    ? new THREE.DodecahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0);
  return displaceRockVertices(base, 0x7A17_0400 + index);
}

const BUILDERS: Record<PartType, (index: number) => THREE.BufferGeometry> = {
  trunk: buildTrunkVariant,
  'branch-arm': buildBranchArmVariant,
  'canopy-blob': buildCanopyBlobVariant,
  'rock-chunk': buildRockChunkVariant,
};

const _cache = new Map<PartType, THREE.BufferGeometry[]>();

/** Lazily builds and caches all variants for `partType`, returning the same array
 *  (and same geometry instances) on every call — never rebuilds or disposes them
 *  mid-session (mirrors `_pooledMaterial()`'s "cache for the process lifetime"
 *  convention; `OverworldScene.dispose()` owns disposing these, same as it already
 *  disposes pooled materials). */
export function getPartVariantPool(partType: PartType): THREE.BufferGeometry[] {
  let pool = _cache.get(partType);
  if (!pool) {
    const count = VARIANT_COUNTS[partType];
    pool = Array.from({ length: count }, (_, i) => BUILDERS[partType](i));
    _cache.set(partType, pool);
  }
  return pool;
}

/** Test-only reset — clears the module-level cache (disposing every cached
 *  geometry first) so tests can verify determinism/rebuild behavior without
 *  leaking geometry across cases. Not called from production code. */
export function _resetPartVariantPoolsForTest(): void {
  for (const pool of _cache.values()) for (const g of pool) g.dispose();
  _cache.clear();
}
