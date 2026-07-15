/**
 * AssetLoader — thin, caching wrapper around GLTFLoader.
 *
 * Usage
 *   import { assetLoader } from '@/assets/AssetLoader';
 *   const tree = await assetLoader.load('/assets/nature/tree_default.glb');
 *   scene.add(tree);   // already a clone; safe to position/rotate/scale
 *
 * Design
 *   - One GLTFLoader instance shared for all requests.
 *   - First load per path fetches the file and caches the gltf.scene root.
 *   - Subsequent load() calls return a *deep clone* of the cached root so each
 *     caller gets its own Object3D hierarchy to transform independently.
 *   - In-flight deduplication: a second load() for the same path while the
 *     first is still fetching attaches to the same pending Promise.
 *   - castShadow / receiveShadow enabled on every Mesh in the loaded scene.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function enableShadows(root: THREE.Object3D): void {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow    = true;
      child.receiveShadow = true;
    }
  });
}

/**
 * Kenney asset packs ship with metallicFactor=1 on every material.
 * Without an IBL / environment map this renders as pure white in Three.js.
 * Clamp metalness to 0 so baseColorFactor shows correctly under scene lights.
 */
function fixMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      std.metalness = 0;
      std.roughness = Math.max(std.roughness, 0.6);
    }
  });
}

// ── AssetLoader class ─────────────────────────────────────────────────────────

export class AssetLoader {
  private readonly _loader  = new GLTFLoader();
  /** Fully-loaded scene roots, keyed by path. */
  private readonly _cache   = new Map<string, THREE.Group>();
  /** In-flight promises, keyed by path (removed when resolved). */
  private readonly _pending = new Map<string, Promise<THREE.Group>>();

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Load a GLB and return a *clone* of the root group.
   * Caches the original; subsequent calls return clones without network fetch.
   */
  load(path: string): Promise<THREE.Group> {
    const cached = this._cache.get(path);
    if (cached) return Promise.resolve(cached.clone());

    const inflight = this._pending.get(path);
    if (inflight) return inflight.then((g) => g.clone());

    const p = new Promise<THREE.Group>((resolve, reject) => {
      this._loader.load(
        path,
        (gltf) => {
          const root = gltf.scene as THREE.Group;
          enableShadows(root);
          fixMaterials(root);
          this._cache.set(path, root);
          this._pending.delete(path);
          resolve(root);
        },
        undefined,
        (err) => {
          this._pending.delete(path);
          reject(err);
        },
      );
    });

    this._pending.set(path, p);
    return p.then((g) => g.clone());
  }

  /**
   * Preload multiple paths in parallel.  Resolves when all are cached.
   * Errors on individual paths are caught and logged — they won't reject
   * the whole batch so the world still renders.
   */
  async preload(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map((p) =>
        this.load(p).catch((e) =>
          console.warn(`[AssetLoader] failed to preload "${p}":`, e),
        ),
      ),
    );
  }

  /**
   * Return a clone of a cached model without triggering a load.
   * Returns null if the path has not yet been loaded.
   */
  getClone(path: string): THREE.Group | null {
    const cached = this._cache.get(path);
    return cached ? cached.clone() : null;
  }

  /** True if the path is currently in the cache (fully loaded). */
  isCached(path: string): boolean {
    return this._cache.has(path);
  }

  /** Number of models currently in the cache. */
  get cacheSize(): number {
    return this._cache.size;
  }

  /**
   * Dispose all cached models and release GPU memory.
   * Call this on scene teardown or when switching world regions.
   */
  dispose(): void {
    for (const root of this._cache.values()) {
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
    }
    this._cache.clear();
    this._pending.clear();
  }
}

/** Shared singleton — use this instead of constructing your own instance. */
export const assetLoader = new AssetLoader();
