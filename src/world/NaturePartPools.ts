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

/** Applies a one-time, deterministic per-vertex outward displacement so this
 *  rock-chunk variant reads as distinctly faceted/irregular rather than a
 *  perfect dodecahedron/icosahedron — see research doc's "Kitbashing +
 *  vertex-displacement faceting" section. Mutates and returns `geo`. */
function displaceRockVertices(geo: THREE.BufferGeometry, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const scale = 1 + (rand() - 0.5) * 0.32;
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
