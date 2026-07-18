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
import { makeStoneTexture, makeWoodGrainTexture, makeFloorPlanksTexture, makeAlchemyStoneTexture, makeHeraldStoneTexture, makeDampStoneTexture, makeScorchedStoneTexture, makeSealedStoneTexture, makeCelestialStoneTexture, makeGrassTexture } from '@/rendering/ProceduralTextures';
// ── Internal map ─────────────────────────────────────────────────────────────
const _cache = new Map();
/** Lazy builders — called exactly once per key, result is cached. */
const _builders = {
    // ── World ────────────────────────────────────────────────────────────────
    stone_wall: () => new THREE.MeshStandardMaterial({
        map: makeStoneTexture(42),
        color: 0xb0a090, // tint applied on top of texture
        roughness: 0.9,
        metalness: 0.04,
    }),
    stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeStoneTexture(17),
        color: 0x909080,
        roughness: 0.95,
        metalness: 0.02,
    }),
    alchemy_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeAlchemyStoneTexture(13),
        color: 0xc09070, // warm amber overtone
        roughness: 0.90,
        metalness: 0.03,
    }),
    herald_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeHeraldStoneTexture(31),
        color: 0xa09080, // cool-warm grey
        roughness: 0.88,
        metalness: 0.04,
    }),
    damp_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeDampStoneTexture(55),
        color: 0x708060, // dark green-grey
        roughness: 0.95,
        metalness: 0.02,
    }),
    scorched_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeScorchedStoneTexture(71),
        color: 0x402018, // dark char-brown
        roughness: 0.98,
        metalness: 0.04,
    }),
    sealed_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeSealedStoneTexture(89),
        color: 0x5060a0, // cold blue-grey
        roughness: 0.92,
        metalness: 0.06,
    }),
    celestial_stone_floor: () => new THREE.MeshStandardMaterial({
        map: makeCelestialStoneTexture(97),
        color: 0x1a1a2a, // near-black with blue tint
        roughness: 0.85,
        metalness: 0.08,
    }),
    grass_floor: () => new THREE.MeshStandardMaterial({
        map: makeGrassTexture(61),
        color: 0x3a6828, // saturated green
        roughness: 0.98,
        metalness: 0.0,
    }),
    wood_plank: () => new THREE.MeshStandardMaterial({
        map: makeFloorPlanksTexture(77),
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
    get(name) {
        let mat = _cache.get(name);
        if (!mat) {
            mat = _builders[name]();
            _cache.set(name, mat);
        }
        return mat;
    },
    /**
     * Returns a *clone* of the named material so the caller can modify it
     * without affecting the shared cache entry.  Use sparingly — clones
     * increase draw calls.
     */
    clone(name) {
        return MaterialLibrary.get(name).clone();
    },
    /**
     * Dispose all cached materials (call on scene teardown).
     */
    disposeAll() {
        for (const mat of _cache.values())
            mat.dispose();
        _cache.clear();
    },
    /** Current number of cached entries (for diagnostics). */
    get size() { return _cache.size; },
};
