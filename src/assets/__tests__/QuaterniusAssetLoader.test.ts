/**
 * QuaterniusAssetLoader.test.ts — unit tests for the Quaternius asset loader.
 *
 * Mirrors src/assets/__tests__/AssetLoader.test.ts's mock-loader pattern,
 * extended to cover all four formats this loader supports (gltf/glb via
 * GLTFLoader, fbx via FBXLoader, obj via OBJLoader+MTLLoader). All four
 * three.js loaders are mocked so no actual network/filesystem is hit.
 *
 * Tests verify:
 *   - loadQuatAsset() dispatches to the correct loader per QuatFormat
 *   - repeated loads of the same path hit the underlying loader only once
 *   - concurrent loads of the same path share one in-flight promise
 *   - each call returns a distinct scene clone
 *   - a mixer is created iff the model has clips (gltf/glb/fbx with anims);
 *     obj never produces a mixer
 *   - preloadQuatAssets() resolves even when one asset errors
 *   - disposeQuatAsset()/clearQuatCache() reset the cache so a reload re-hits
 *     the underlying loader
 *   - loader errors are surfaced as rejected Promises
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { QuatModelDef } from '../quaterniusManifest';

// ── Mock state (shared across all mocked loaders) ────────────────────────────

let _mockLoadError: Error | null = null;
let _gltfLoadCalls = 0;
let _fbxLoadCalls  = 0;
let _objLoadCalls  = 0;
let _mtlLoadCalls  = 0;
let _mtlShouldError = false; // simulate "no sibling .mtl found"

function _makeGroupWithMesh(name: string): THREE.Group {
  const scene = new THREE.Group();
  scene.name  = name;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return scene;
}

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: vi.fn().mockImplementation(() => ({
    load: vi.fn((url: string, onLoad: Function, _onProgress: Function, onError: Function) => {
      _gltfLoadCalls++;
      queueMicrotask(() => {
        if (_mockLoadError) return onError(_mockLoadError);
        const scene = _makeGroupWithMesh(url);
        // .anim.gltf / .anim.glb paths simulate an animated model for tests
        const animations = /anim/i.test(url) ? [new THREE.AnimationClip('Idle', 1, [])] : [];
        onLoad({ scene, animations });
      });
    }),
  })),
}));

vi.mock('three/addons/loaders/FBXLoader.js', () => ({
  FBXLoader: vi.fn().mockImplementation(() => ({
    load: vi.fn((url: string, onLoad: Function, _onProgress: Function, onError: Function) => {
      _fbxLoadCalls++;
      queueMicrotask(() => {
        if (_mockLoadError) return onError(_mockLoadError);
        const group = _makeGroupWithMesh(url) as unknown as THREE.Group & { animations: THREE.AnimationClip[] };
        group.animations = /anim/i.test(url) ? [new THREE.AnimationClip('Idle', 1, [])] : [];
        onLoad(group);
      });
    }),
  })),
}));

vi.mock('three/addons/loaders/OBJLoader.js', () => ({
  OBJLoader: vi.fn().mockImplementation(() => ({
    setMaterials: vi.fn(),
    load: vi.fn((url: string, onLoad: Function, _onProgress: Function, onError: Function) => {
      _objLoadCalls++;
      queueMicrotask(() => {
        if (_mockLoadError) return onError(_mockLoadError);
        onLoad(_makeGroupWithMesh(url));
      });
    }),
  })),
}));

vi.mock('three/addons/loaders/MTLLoader.js', () => ({
  MTLLoader: vi.fn().mockImplementation(() => ({
    load: vi.fn((_url: string, onLoad: Function, _onProgress: Function, onError: Function) => {
      _mtlLoadCalls++;
      queueMicrotask(() => {
        if (_mtlShouldError) return onError(new Error('no .mtl found'));
        onLoad({ preload: vi.fn() });
      });
    }),
  })),
}));

import {
  loadQuatAsset,
  preloadQuatAssets,
  disposeQuatAsset,
  clearQuatCache,
} from '../QuaterniusAssetLoader';

// ── Fixtures ───────────────────────────────────────────────────────────────────

function def(path: string, format: QuatModelDef['format'], animated = false): QuatModelDef {
  return {
    id: path, packId: 'test/pack', category: 'animals', name: 'Test', path, format, animated,
  };
}

beforeEach(() => {
  _mockLoadError   = null;
  _mtlShouldError  = false;
  _gltfLoadCalls = _fbxLoadCalls = _objLoadCalls = _mtlLoadCalls = 0;
  clearQuatCache();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('QuaterniusAssetLoader', () => {
  describe('format dispatch', () => {
    it('loads .gltf via GLTFLoader', async () => {
      const result = await loadQuatAsset(def('/assets/quaternius/animals/Fox.gltf', 'gltf'));
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_gltfLoadCalls).toBe(1);
      expect(result.format).toBe('gltf');
    });

    it('loads .glb via GLTFLoader', async () => {
      const result = await loadQuatAsset(def('/assets/quaternius/monsters/Golem.glb', 'glb'));
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_gltfLoadCalls).toBe(1);
    });

    it('loads .fbx via FBXLoader', async () => {
      const result = await loadQuatAsset(def('/assets/quaternius/monsters/Bat.fbx', 'fbx'));
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_fbxLoadCalls).toBe(1);
      expect(_gltfLoadCalls).toBe(0);
    });

    it('loads .obj via OBJLoader + sibling MTL via MTLLoader', async () => {
      const result = await loadQuatAsset(def('/assets/quaternius/modular_dungeons/obj_kit/Trapdoor.obj', 'obj'));
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_objLoadCalls).toBe(1);
      expect(_mtlLoadCalls).toBe(1);
    });

    it('falls back to OBJ with no materials when the sibling .mtl 404s', async () => {
      _mtlShouldError = true;
      const result = await loadQuatAsset(def('/assets/quaternius/modular_dungeons/obj_kit/NoMtl.obj', 'obj'));
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_objLoadCalls).toBe(1);
    });
  });

  describe('caching', () => {
    it('hits the underlying loader once per unique path', async () => {
      const d = def('/assets/quaternius/animals/Fox.gltf', 'gltf');
      await loadQuatAsset(d);
      await loadQuatAsset(d);
      await loadQuatAsset(d);
      expect(_gltfLoadCalls).toBe(1);
    });

    it('returns distinct scene clones on each call', async () => {
      const d = def('/assets/quaternius/animals/Fox.gltf', 'gltf');
      const a = await loadQuatAsset(d);
      const b = await loadQuatAsset(d);
      expect(a.scene).not.toBe(b.scene);
    });

    it('concurrent loads of the same path share one in-flight load', async () => {
      const d = def('/assets/quaternius/animals/Fox.gltf', 'gltf');
      const [a, b] = await Promise.all([loadQuatAsset(d), loadQuatAsset(d)]);
      expect(_gltfLoadCalls).toBe(1);
      expect(a.scene).not.toBe(b.scene);
    });

    it('enables castShadow/receiveShadow on all child meshes', async () => {
      const d = def('/assets/quaternius/animals/Fox.gltf', 'gltf');
      const { scene } = await loadQuatAsset(d);
      let foundMesh = false;
      scene.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          foundMesh = true;
          expect(c.castShadow).toBe(true);
          expect(c.receiveShadow).toBe(true);
        }
      });
      expect(foundMesh).toBe(true);
    });
  });

  describe('animation clips / mixer', () => {
    it('creates a mixer when the model has clips (gltf)', async () => {
      const { mixer, clips } = await loadQuatAsset(def('/anim/Fox.gltf', 'gltf'));
      expect(clips.length).toBe(1);
      expect(mixer).not.toBeNull();
    });

    it('creates a mixer when the model has clips (fbx)', async () => {
      const { mixer, clips } = await loadQuatAsset(def('/anim/Bat.fbx', 'fbx'));
      expect(clips.length).toBe(1);
      expect(mixer).not.toBeNull();
    });

    it('mixer is null when the model has no clips', async () => {
      const { mixer, clips } = await loadQuatAsset(def('/static/Apple.fbx', 'fbx'));
      expect(clips.length).toBe(0);
      expect(mixer).toBeNull();
    });

    it('OBJ models never have clips or a mixer', async () => {
      const { mixer, clips } = await loadQuatAsset(def('/anim/Trapdoor.obj', 'obj'));
      expect(clips.length).toBe(0);
      expect(mixer).toBeNull();
    });
  });

  describe('preloadQuatAssets()', () => {
    it('resolves when all paths are cached', async () => {
      await preloadQuatAssets([
        def('/a.gltf', 'gltf'),
        def('/b.fbx', 'fbx'),
        def('/c.obj', 'obj'),
      ]);
      expect(_gltfLoadCalls).toBe(1);
      expect(_fbxLoadCalls).toBe(1);
      expect(_objLoadCalls).toBe(1);
    });

    it('does not reject when one path errors', async () => {
      _mockLoadError = new Error('bad model');
      await expect(preloadQuatAssets([def('/bad.gltf', 'gltf')])).resolves.toBeUndefined();
    });
  });

  describe('disposeQuatAsset() / clearQuatCache()', () => {
    it('disposeQuatAsset forces a reload on the next call', async () => {
      const d = def('/reload.gltf', 'gltf');
      await loadQuatAsset(d);
      disposeQuatAsset(d.path);
      await loadQuatAsset(d);
      expect(_gltfLoadCalls).toBe(2);
    });

    it('clearQuatCache resets all cached paths', async () => {
      await loadQuatAsset(def('/x.gltf', 'gltf'));
      await loadQuatAsset(def('/y.fbx', 'fbx'));
      clearQuatCache();
      await loadQuatAsset(def('/x.gltf', 'gltf'));
      expect(_gltfLoadCalls).toBe(2);
    });
  });

  describe('error handling', () => {
    it('rejects when the underlying loader errors (gltf)', async () => {
      _mockLoadError = new Error('404 not found');
      await expect(loadQuatAsset(def('/bad.gltf', 'gltf'))).rejects.toThrow('404 not found');
    });

    it('rejects when the underlying loader errors (fbx)', async () => {
      _mockLoadError = new Error('network error');
      await expect(loadQuatAsset(def('/bad.fbx', 'fbx'))).rejects.toThrow('network error');
    });

    it('removes the pending entry after an error so a retry works', async () => {
      const d = def('/flaky.gltf', 'gltf');
      _mockLoadError = new Error('flaky');
      await loadQuatAsset(d).catch(() => {});
      expect(_gltfLoadCalls).toBe(1);
      _mockLoadError = null;
      const result = await loadQuatAsset(d);
      expect(result.scene).toBeInstanceOf(THREE.Group);
      expect(_gltfLoadCalls).toBe(2);
    });
  });
});
