/**
 * CharacterLoader — caching loader for GLB and FBX character models.
 *
 * Returns a `LoadedChar` containing:
 *   - a *clone* of the model scene (safe to add to any Three.js scene)
 *   - an `AnimationMixer` pre-wired to that clone (null if no clips)
 *   - all available `AnimationClip[]` for that character
 *
 * KayKit models (those with `def.animRig` set) have their animation clips
 * sourced from the shared Rig_Medium GLBs and normalised via
 * AnimationRetargeter before being attached to the mixer.
 *
 * Raw scenes are cached so the network/disk is only hit once per path;
 * every `loadCharModel()` call returns a fresh clone + a fresh mixer.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { prepareKayKitClips } from '@/characters/AnimationRetargeter';
const _cache = new Map();
const _pending = new Map();
const _gltfLoader = new GLTFLoader();
const _fbxLoader = new FBXLoader();
// ── Raw loaders (return & cache the originals) ───────────────────────────────
function _loadGLB(path) {
    const cached = _cache.get(path);
    if (cached)
        return Promise.resolve(cached);
    const inflight = _pending.get(path);
    if (inflight)
        return inflight;
    const p = new Promise((resolve, reject) => {
        _gltfLoader.load(path, (gltf) => {
            const entry = {
                scene: gltf.scene,
                clips: gltf.animations ?? [],
            };
            _cache.set(path, entry);
            _pending.delete(path);
            resolve(entry);
        }, undefined, (err) => {
            _pending.delete(path);
            reject(new Error(`CharacterLoader: GLB load failed "${path}" — ${String(err)}`));
        });
    });
    _pending.set(path, p);
    return p;
}
function _loadFBX(path) {
    const cached = _cache.get(path);
    if (cached)
        return Promise.resolve(cached);
    const inflight = _pending.get(path);
    if (inflight)
        return inflight;
    const p = new Promise((resolve, reject) => {
        _fbxLoader.load(path, (group) => {
            // FBXLoader attaches clips to the group object directly
            const clips = group
                .animations ?? [];
            const entry = { scene: group, clips };
            _cache.set(path, entry);
            _pending.delete(path);
            resolve(entry);
        }, undefined, (err) => {
            _pending.delete(path);
            reject(new Error(`CharacterLoader: FBX load failed "${path}" — ${String(err)}`));
        });
    });
    _pending.set(path, p);
    return p;
}
// ── Shadow + material helpers (mirrors AssetLoader) ──────────────────────────
function _enableShadows(root) {
    root.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Load a character model and return a `LoadedChar` ready for use.
 *
 * Each call returns a distinct scene clone and a fresh `AnimationMixer` so
 * multiple instances of the same model can be animated independently.
 *
 * For KayKit GLB models (def.animRig set): loads the shared animation rig
 * GLB(s), normalises track names, and attaches those clips to the mixer
 * instead of the model's (empty) embedded clips.
 */
export async function loadCharModel(def) {
    // ── 1. Load raw model ─────────────────────────────────────────────────────
    const isGlb = def.format === 'glb';
    const entry = await (isGlb ? _loadGLB(def.path) : _loadFBX(def.path));
    // ── 2. Clone scene (SkeletonUtils.clone preserves skinned-mesh bone refs) ─
    const clonedScene = skeletonClone(entry.scene);
    _enableShadows(clonedScene);
    // ── 2b. Axis-up correction for FBX packs with Z-up geometry ──────────────
    // animal_plushies FBX files declare Y-up in their metadata but the actual
    // vertex geometry is Z-up, so we must apply the correction manually.
    // adventure / fantasy_heroes FBX files have a proper UpAxis=Z entry that
    // FBXLoader reads and corrects automatically — do NOT rotate those or the
    // model ends up double-rotated (flat on the ground).
    const Z_UP_PACKS = new Set(['animal_plushies']);
    if (Z_UP_PACKS.has(def.packId)) {
        clonedScene.rotation.x = -Math.PI / 2;
        clonedScene.updateMatrix();
    }
    // ── 3. Resolve animation clips ────────────────────────────────────────────
    let clips = [];
    if (def.animRig) {
        // KayKit path: load rig GLBs and normalise their clips
        const [generalEntry, movementEntry] = await Promise.all([
            _loadGLB(def.animRig),
            def.animRigB ? _loadGLB(def.animRigB) : Promise.resolve({ scene: new THREE.Group(), clips: [] }),
        ]);
        clips = prepareKayKitClips([
            ...generalEntry.clips,
            ...movementEntry.clips,
        ]);
    }
    else {
        // Use whatever clips are embedded in the model itself
        clips = entry.clips;
    }
    // ── 4. Create AnimationMixer on the clone ─────────────────────────────────
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(clonedScene) : null;
    return { scene: clonedScene, mixer, clips, format: def.format };
}
/**
 * Preload a list of model paths in parallel so they are warm in the cache
 * before `loadCharModel` is called.  Individual failures are caught + logged.
 */
export async function preloadCharModels(defs) {
    await Promise.all(defs.map((def) => loadCharModel(def).catch((err) => console.warn(`[CharacterLoader] preload failed for "${def.id}":`, err))));
}
/** Remove a model from the internal caches (e.g. when switching scenes). */
export function disposeCharModel(path) {
    _cache.delete(path);
}
/** Clear all cached model data. */
export function clearCharCache() {
    _cache.clear();
    _pending.clear();
}
/**
 * Return the axis-aligned bounding box of a character model in THREE.js world
 * units.  Uses the ORIGINAL (non-cloned) cached scene, which Three.js's GLTF
 * loader initialises with correct world matrices — giving accurate bounds even
 * for models whose skeleton bone-matrices encode the character's real scale
 * (e.g. Meshy AI exports with small bind-pose geometry but large bone offsets).
 *
 * The GLB is loaded (and cached) as a side effect, so this is cheap to call
 * immediately after loadCharModel.
 */
export async function getCharModelBounds(def) {
    const isGlb = def.format === 'glb';
    const entry = await (isGlb ? _loadGLB(def.path) : _loadFBX(def.path));
    // Update world matrices on the original scene so skinned mesh bounds are
    // computed using the correct bone hierarchy.
    entry.scene.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(entry.scene);
}
