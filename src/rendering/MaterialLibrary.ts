/**
 * MaterialLibrary — Phase 7.5b
 *
 * Singleton cache for Three.js materials.  All game code calls
 * `MaterialLibrary.get(name)` instead of constructing materials inline.
 * The same material instance is reused across all meshes that share it,
 * which reduces GPU state changes and lets us update colours/properties
 * centrally (e.g. swapping from Lambert to Standard in one place).
 *
 * Adding a new material:
 *   1. Add its key to `MaterialName`.
 *   2. Add its build function to the `_builders` map.
 *   3. Call `MaterialLibrary.get('your_key')` wherever the material is used.
 */

import * as THREE from 'three';
import { makeStoneTexture, makeWoodGrainTexture } from '@/rendering/ProceduralTextures';

// ── Named material keys ───────────────────────────────────────────────────────

export type MaterialName =
  // World / terrain
  | 'stone_wall'
  | 'stone_floor'
  | 'wood_plank'
  | 'wood_dark'
  | 'moss'
  // Creatures / characters
  | 'slime_body'
  | 'slime_eye'
  | 'player_body'
  | 'player_robe'
  // Props / UI
  | 'torch_metal'
  | 'torch_flame'
  | 'cauldron_iron'
  | 'rune_emissive'
  // Sky / environment
  | 'sky_gradient';

// ── Internal map ─────────────────────────────────────────────────────────────

const _cache = new Map<MaterialName, THREE.Material>();

type Builder = () => THREE.Material;

/** Lazy builders — called exactly once per key, result is cached. */
const _builders: Record<MaterialName, Builder> = {

  // ── World ────────────────────────────────────────────────────────────────

  stone_wall: () => new THREE.MeshStandardMaterial({
    map: makeStoneTexture(42),
    color: 0xb0a090,   // tint applied on top of texture
    roughness: 0.9,
    metalness: 0.04,
  }),

  stone_floor: () => new THREE.MeshStandardMaterial({
    map: makeStoneTexture(17),
    color: 0x909080,
    roughness: 0.95,
    metalness: 0.02,
  }),

  wood_plank: () => new THREE.MeshStandardMaterial({
    map: makeWoodGrainTexture(7),
    color: 0xd4a060,
    roughness: 0.75,
    metalness: 0.0,
  }),

  wood_dark: () => new THREE.MeshStandardMaterial({
    map: makeWoodGrainTexture(31),
    color: 0x8c5a30,
    roughness: 0.82,
    metalness: 0.0,
  }),

  moss: () => new THREE.MeshLambertMaterial({
    color: 0x4a7c3f,
    transparent: true,
    opacity: 0.72,
  }),

  // ── Creatures ────────────────────────────────────────────────────────────

  slime_body: () => new THREE.MeshLambertMaterial({ color: 0x44bb55 }),

  slime_eye: () => new THREE.MeshLambertMaterial({ color: 0x101010 }),

  player_body: () => new THREE.MeshLambertMaterial({ color: 0xe8c88a }),

  player_robe: () => new THREE.MeshLambertMaterial({ color: 0x3355aa }),

  // ── Props ────────────────────────────────────────────────────────────────

  torch_metal: () => new THREE.MeshStandardMaterial({
    color: 0x5a4433,
    roughness: 0.8,
    metalness: 0.3,
  }),

  torch_flame: () => new THREE.MeshLambertMaterial({
    color: 0xff6600,
    emissive: new THREE.Color(0xff3300),
    emissiveIntensity: 0.8,
  }),

  cauldron_iron: () => new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.7,
    metalness: 0.6,
  }),

  rune_emissive: () => new THREE.MeshLambertMaterial({
    color: 0x220044,
    emissive: new THREE.Color(0x9900ff),
    emissiveIntensity: 1.2,
  }),

  // ── Sky ──────────────────────────────────────────────────────────────────

  sky_gradient: () => new THREE.MeshBasicMaterial({
    color: 0x2a3a5c,
    side: THREE.BackSide,
    fog: false,
  }),
};

// ── Public API ────────────────────────────────────────────────────────────────

export const MaterialLibrary = {
  /**
   * Returns the cached material for `name`, building it on first access.
   * The returned instance is shared — do not mutate it unless you intend
   * the change to apply to every mesh using this material.
   */
  get<T extends THREE.Material = THREE.Material>(name: MaterialName): T {
    let mat = _cache.get(name);
    if (!mat) {
      mat = _builders[name]();
      _cache.set(name, mat);
    }
    return mat as T;
  },

  /**
   * Returns a *clone* of the named material so the caller can modify it
   * without affecting the shared cache entry.  Use sparingly — clones
   * increase draw calls.
   */
  clone<T extends THREE.Material = THREE.Material>(name: MaterialName): T {
    return MaterialLibrary.get<T>(name).clone() as T;
  },

  /**
   * Dispose all cached materials (call on scene teardown).
   */
  disposeAll(): void {
    for (const mat of _cache.values()) mat.dispose();
    _cache.clear();
  },

  /** Current number of cached entries (for diagnostics). */
  get size(): number { return _cache.size; },
} as const;
