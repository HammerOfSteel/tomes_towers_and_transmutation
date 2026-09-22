/**
 * QuaterniusAssetLoader — caching loader for the imported Quaternius asset
 * packs (animals, monsters, fantasy props, buildings, modular dungeon/
 * village kit pieces).
 *
 * Mirrors src/characters/CharacterLoader.ts's cache/clone/pending-map
 * pattern, extended to support all four formats these packs ship in:
 *   - gltf  → GLTFLoader (embedded or sibling-.bin buffer; embedded or
 *             same-directory PNG textures)
 *   - glb   → GLTFLoader (fully self-contained binary)
 *   - fbx   → FBXLoader (three.js's native loader already handles rigged/
 *             animated FBX in production — see CharacterLoader.ts)
 *   - obj   → OBJLoader + MTLLoader (materials loaded from the sibling .mtl
 *             file with the same stem, per the OBJ/MTL convention; no
 *             texture maps in the current modular_dungeons pack — flat
 *             vertex-colour materials only)
 *
 * Returns a `LoadedQuatAsset` containing a *clone* of the model scene (safe
 * to add to any THREE.Scene), a pre-wired AnimationMixer (null if the model
 * has no clips), and the available AnimationClip[] — same shape contract as
 * LoadedChar so dev-UI code can share the preview/playback logic.
 */

import * as THREE                    from 'three';
import { GLTFLoader }                 from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader }                   from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader }                   from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader }                   from 'three/addons/loaders/MTLLoader.js';
import { clone as skeletonClone }     from 'three/addons/utils/SkeletonUtils.js';
import type { QuatModelDef, QuatFormat } from '@/assets/quaterniusManifest';

// ── Public types ─────────────────────────────────────────────────────────────

export interface LoadedQuatAsset {
  /** Clone of the model scene — each call returns a distinct object. */
  scene:  THREE.Group;
  /**
   * AnimationMixer wired to `scene`. Null when the model has no clips.
   * Call `mixer.update(dt)` in your render loop.
   */
  mixer:  THREE.AnimationMixer | null;
  /** Available animation clips. Shared instances — do not mutate. */
  clips:  THREE.AnimationClip[];
  format: QuatFormat;
}

// ── Internal caches ───────────────────────────────────────────────────────────

interface _CacheEntry {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

const _cache   = new Map<string, _CacheEntry>();
const _pending = new Map<string, Promise<_CacheEntry>>();

const _gltfLoader = new GLTFLoader();
const _fbxLoader  = new FBXLoader();
const _mtlLoader  = new MTLLoader();

// ── Raw per-format loaders (cache the originals, not clones) ────────────────

function _loadGLTF(path: string): Promise<_CacheEntry> {
  const cached = _cache.get(path);
  if (cached) return Promise.resolve(cached);

  const inflight = _pending.get(path);
  if (inflight) return inflight;

  const p = new Promise<_CacheEntry>((resolve, reject) => {
    _gltfLoader.load(
      path,
      (gltf) => {
        const entry: _CacheEntry = {
          scene: gltf.scene as THREE.Group,
          clips: gltf.animations ?? [],
        };
        _cache.set(path, entry);
        _pending.delete(path);
        resolve(entry);
      },
      undefined,
      (err) => {
        _pending.delete(path);
        reject(new Error(`QuaterniusAssetLoader: glTF/GLB load failed "${path}" — ${String(err)}`));
      },
    );
  });

  _pending.set(path, p);
  return p;
}

function _loadFBX(path: string): Promise<_CacheEntry> {
  const cached = _cache.get(path);
  if (cached) return Promise.resolve(cached);

  const inflight = _pending.get(path);
  if (inflight) return inflight;

  const p = new Promise<_CacheEntry>((resolve, reject) => {
    _fbxLoader.load(
      path,
      (group) => {
        const clips = (group as unknown as { animations?: THREE.AnimationClip[] })
          .animations ?? [];
        const entry: _CacheEntry = { scene: group, clips };
        _cache.set(path, entry);
        _pending.delete(path);
        resolve(entry);
      },
      undefined,
      (err) => {
        _pending.delete(path);
        reject(new Error(`QuaterniusAssetLoader: FBX load failed "${path}" — ${String(err)}`));
      },
    );
  });

  _pending.set(path, p);
  return p;
}

/**
 * OBJ + sibling MTL (same stem, same directory — the standard OBJ/MTL
 * convention). Falls back to loading the OBJ with default materials if no
 * .mtl is found (some props may end up textureless if a pack omits one).
 */
function _loadOBJ(path: string): Promise<_CacheEntry> {
  const cached = _cache.get(path);
  if (cached) return Promise.resolve(cached);

  const inflight = _pending.get(path);
  if (inflight) return inflight;

  const mtlPath = path.replace(/\.obj$/i, '.mtl');

  const p = new Promise<_CacheEntry>((resolve, reject) => {
    const loadObjWithMaterials = (materials?: MTLLoader.MaterialCreator) => {
      const loader = new OBJLoader();
      if (materials) {
        materials.preload();
        loader.setMaterials(materials);
      }
      loader.load(
        path,
        (group) => {
          const entry: _CacheEntry = { scene: group, clips: [] }; // OBJ never carries animation
          _cache.set(path, entry);
          _pending.delete(path);
          resolve(entry);
        },
        undefined,
        (err) => {
          _pending.delete(path);
          reject(new Error(`QuaterniusAssetLoader: OBJ load failed "${path}" — ${String(err)}`));
        },
      );
    };

    _mtlLoader.load(
      mtlPath,
      (materials) => loadObjWithMaterials(materials),
      undefined,
      () => loadObjWithMaterials(undefined), // no .mtl — load OBJ with default material
    );
  });

  _pending.set(path, p);
  return p;
}

function _loadRaw(path: string, format: QuatFormat): Promise<_CacheEntry> {
  if (format === 'obj') return _loadOBJ(path);
  if (format === 'fbx') return _loadFBX(path);
  return _loadGLTF(path); // gltf and glb both go through GLTFLoader
}

// ── Shadow helper (mirrors CharacterLoader) ──────────────────────────────────

function _enableShadows(root: THREE.Object3D): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow    = true;
      child.receiveShadow = true;
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load a Quaternius asset and return a `LoadedQuatAsset` ready for use.
 * Each call returns a distinct scene clone and a fresh `AnimationMixer` so
 * multiple instances of the same model can be placed/animated independently.
 */
export async function loadQuatAsset(def: QuatModelDef): Promise<LoadedQuatAsset> {
  const entry = await _loadRaw(def.path, def.format);

  // SkeletonUtils.clone preserves skinned-mesh bone references; it also
  // works correctly for non-skinned meshes (OBJ/static FBX), so it's safe
  // to use unconditionally here, same as CharacterLoader.
  const clonedScene = skeletonClone(entry.scene) as THREE.Group;
  _enableShadows(clonedScene);

  const clips = entry.clips;
  const mixer = clips.length > 0 ? new THREE.AnimationMixer(clonedScene) : null;

  return { scene: clonedScene, mixer, clips, format: def.format };
}

/**
 * Preload a list of model paths in parallel so they are warm in the cache
 * before `loadQuatAsset` is called. Individual failures are caught + logged.
 */
export async function preloadQuatAssets(defs: QuatModelDef[]): Promise<void> {
  await Promise.all(
    defs.map((def) =>
      loadQuatAsset(def).catch((err) =>
        console.warn(`[QuaterniusAssetLoader] preload failed for "${def.id}":`, err),
      ),
    ),
  );
}

/** Remove a model from the internal caches (e.g. when switching scenes). */
export function disposeQuatAsset(path: string): void {
  _cache.delete(path);
}

/** Clear all cached model data. */
export function clearQuatCache(): void {
  _cache.clear();
  _pending.clear();
}
