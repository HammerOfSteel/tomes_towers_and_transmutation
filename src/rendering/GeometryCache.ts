/**
 * GeometryCache — Phase 7.5b
 *
 * Singleton cache for expensive procedural `BufferGeometry` objects.
 *
 * Usage:
 *   const geo = GeometryCache.get('round_box_2x2x2', () =>
 *     new RoundedBoxGeometry(2, 2, 2, 0.15, 3),
 *   );
 *
 * The builder is called exactly once per key; the resulting geometry is
 * reused (same reference) by every mesh that requests it.  This is safe
 * because Three.js geometries are read-only after construction — only
 * materials and transforms are per-instance.
 *
 * CSG results, lathe spires, and rounded furniture should all go through
 * this cache so their generation cost is paid once at level-load time.
 */

import type * as THREE from 'three';

// ── Well-known cache keys ─────────────────────────────────────────────────────
// Add an entry here when you want IDE autocomplete; the runtime also accepts
// ad-hoc string keys for one-off geometries.

export type WellKnownGeoKey =
  // Rounded boxes — format: rounded_box_WxHxD_r<radius>
  | `rounded_box_${number}x${number}x${number}_r${number}`
  // CSG results
  | 'prop_cauldron'
  | 'prop_goblet'
  | 'prop_arch'
  // Environment
  | 'sky_dome'
  | 'grass_blade';

export type GeoKey = WellKnownGeoKey | string;

// ── Internal map ─────────────────────────────────────────────────────────────

const _cache = new Map<GeoKey, THREE.BufferGeometry>();

// ── Public API ────────────────────────────────────────────────────────────────

export const GeometryCache = {
  /**
   * Returns the cached geometry for `key`.
   * If not yet cached, calls `buildFn()` once, stores the result, and
   * returns it.  Subsequent calls with the same key skip the builder.
   *
   * @param key      Unique identifier for this geometry variant.
   * @param buildFn  Factory called exactly once to produce the geometry.
   */
  get<T extends THREE.BufferGeometry = THREE.BufferGeometry>(
    key: GeoKey,
    buildFn: () => T,
  ): T {
    let geo = _cache.get(key);
    if (!geo) {
      geo = buildFn();
      _cache.set(key, geo);
    }
    return geo as T;
  },

  /**
   * Explicitly pre-warm a set of geometry keys.
   * Useful during a loading screen to move generation cost off the first frame.
   *
   * @param entries  Array of `[key, buildFn]` pairs.
   */
  preWarm(entries: Array<[GeoKey, () => THREE.BufferGeometry]>): void {
    for (const [key, fn] of entries) {
      if (!_cache.has(key)) _cache.set(key, fn());
    }
  },

  /** Returns true if a geometry is already cached. */
  has(key: GeoKey): boolean { return _cache.has(key); },

  /**
   * Dispose and remove a single cached geometry.
   * Call this when a level-specific geometry is no longer needed.
   */
  evict(key: GeoKey): void {
    const geo = _cache.get(key);
    if (geo) { geo.dispose(); _cache.delete(key); }
  },

  /**
   * Dispose all cached geometries (call on full scene teardown).
   */
  disposeAll(): void {
    for (const geo of _cache.values()) geo.dispose();
    _cache.clear();
  },

  /** Current number of cached entries (for diagnostics). */
  get size(): number { return _cache.size; },
} as const;
