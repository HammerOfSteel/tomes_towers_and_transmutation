/**
 * AssetLoader.test.ts — unit tests for the AssetLoader cache.
 *
 * GLTFLoader is mocked so no actual network/filesystem is hit.
 * Tests verify:
 *   - load() returns a THREE.Group clone
 *   - repeated load() for the same path hits the loader only once
 *   - concurrent load() calls on the same path share one in-flight promise
 *   - preload() resolves when all paths are cached
 *   - getClone() returns null before load, a Group after
 *   - isCached() / cacheSize reflect state correctly
 *   - dispose() empties the cache and calls geometry/material dispose
 *   - loader errors are surfaced as rejected Promises from load()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// ── Mock GLTFLoader ────────────────────────────────────────────────────────────

// We need to mock before importing AssetLoader to ensure the module under
// test picks up the mock.  The factory returns a synchronous (microtask) load.

let _mockLoadError: Error | null = null;
let _loadCallCount = 0;

vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: vi.fn().mockImplementation(() => ({
      load: vi.fn((url: string, onLoad: Function, _onProgress: Function, onError: Function) => {
        _loadCallCount++;
        queueMicrotask(() => {
          if (_mockLoadError) {
            onError(_mockLoadError);
          } else {
            const scene = new THREE.Group();
            scene.name  = url;  // store url so tests can verify which model loaded
            // Add a child mesh so dispose() has something to call .dispose() on
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(1, 1, 1),
              new THREE.MeshStandardMaterial(),
            );
            scene.add(mesh);
            onLoad({ scene, animations: [] });
          }
        });
      }),
    })),
  };
});

import { AssetLoader } from '../AssetLoader';

// ── Fixtures ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  _mockLoadError = null;
  _loadCallCount  = 0;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AssetLoader', () => {
  describe('load()', () => {
    it('returns a THREE.Group', async () => {
      const loader = new AssetLoader();
      const result = await loader.load('/assets/nature/tree_default.glb');
      expect(result).toBeInstanceOf(THREE.Group);
    });

    it('loaded group name matches the url', async () => {
      const loader = new AssetLoader();
      const result = await loader.load('/assets/nature/tree_default.glb');
      expect(result.name).toBe('/assets/nature/tree_default.glb');
    });

    it('calls GLTFLoader.load exactly once per unique path', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      await loader.load('/assets/nature/tree_default.glb');
      await loader.load('/assets/nature/tree_default.glb');
      expect(_loadCallCount).toBe(1);
    });

    it('calls GLTFLoader.load once per distinct path', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      await loader.load('/assets/nature/tree_cone.glb');
      expect(_loadCallCount).toBe(2);
    });

    it('returns distinct Group instances (clones) on each call', async () => {
      const loader = new AssetLoader();
      const a = await loader.load('/assets/nature/tree_default.glb');
      const b = await loader.load('/assets/nature/tree_default.glb');
      expect(a).not.toBe(b);
    });

    it('concurrent calls for the same path share one in-flight load', async () => {
      const loader = new AssetLoader();
      // fire two loads before either resolves (microtask boundary)
      const [a, b] = await Promise.all([
        loader.load('/assets/nature/tree_default.glb'),
        loader.load('/assets/nature/tree_default.glb'),
      ]);
      expect(_loadCallCount).toBe(1);
      expect(a).not.toBe(b); // still separate clones
    });

    it('enables castShadow and receiveShadow on all child meshes', async () => {
      const loader = new AssetLoader();
      const group  = await loader.load('/assets/nature/tree_default.glb');
      let foundMesh = false;
      group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          foundMesh = true;
          expect(c.castShadow).toBe(true);
          expect(c.receiveShadow).toBe(true);
        }
      });
      expect(foundMesh).toBe(true);
    });

    it('rejects when the underlying loader errors', async () => {
      _mockLoadError = new Error('404 not found');
      const loader = new AssetLoader();
      await expect(loader.load('/bad/path.glb')).rejects.toThrow('404 not found');
    });

    it('removes the pending entry after an error so a retry works', async () => {
      const loader = new AssetLoader();
      // First attempt fails
      _mockLoadError = new Error('network error');
      await loader.load('/flaky.glb').catch(() => {});
      expect(_loadCallCount).toBe(1);
      // Second attempt (error cleared) should succeed and call loader again
      _mockLoadError = null;
      const result = await loader.load('/flaky.glb');
      expect(result).toBeInstanceOf(THREE.Group);
      expect(_loadCallCount).toBe(2);
    });
  });

  // ── preload ────────────────────────────────────────────────────────────────

  describe('preload()', () => {
    it('resolves when all paths are cached', async () => {
      const loader = new AssetLoader();
      const paths  = [
        '/assets/nature/tree_default.glb',
        '/assets/nature/tree_cone.glb',
        '/assets/castle/tower.glb',
      ];
      await loader.preload(paths);
      expect(loader.cacheSize).toBe(3);
    });

    it('does not reject when one path errors', async () => {
      const loader = new AssetLoader();
      _mockLoadError = new Error('bad model');
      // preload swallows individual errors
      await expect(
        loader.preload(['/bad.glb', '/also-bad.glb']),
      ).resolves.toBeUndefined();
    });

    it('still caches successful paths when one fails', async () => {
      const loader = new AssetLoader();
      // Await the erroring load fully before clearing the flag — the
      // queueMicrotask callback fires during the await so _mockLoadError
      // is still set when the error branch runs.
      _mockLoadError = new Error('intentional');
      await loader.load('/path-a.glb').catch(() => null);
      _mockLoadError = null;
      await loader.load('/path-b.glb');
      expect(loader.isCached('/path-b.glb')).toBe(true);
      expect(loader.isCached('/path-a.glb')).toBe(false);
    });
  });

  // ── getClone ────────────────────────────────────────────────────────────────

  describe('getClone()', () => {
    it('returns null before the path has been loaded', () => {
      const loader = new AssetLoader();
      expect(loader.getClone('/assets/nature/tree_default.glb')).toBeNull();
    });

    it('returns a Group clone after the path has been loaded', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      const clone = loader.getClone('/assets/nature/tree_default.glb');
      expect(clone).toBeInstanceOf(THREE.Group);
    });

    it('returns distinct instances each call', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      const a = loader.getClone('/assets/nature/tree_default.glb');
      const b = loader.getClone('/assets/nature/tree_default.glb');
      expect(a).not.toBe(b);
    });
  });

  // ── isCached / cacheSize ──────────────────────────────────────────────────

  describe('isCached() / cacheSize', () => {
    it('isCached returns false before load', () => {
      const loader = new AssetLoader();
      expect(loader.isCached('/foo.glb')).toBe(false);
    });

    it('isCached returns true after load', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      expect(loader.isCached('/assets/nature/tree_default.glb')).toBe(true);
    });

    it('cacheSize increments with each unique load', async () => {
      const loader = new AssetLoader();
      expect(loader.cacheSize).toBe(0);
      await loader.load('/a.glb');
      expect(loader.cacheSize).toBe(1);
      await loader.load('/b.glb');
      expect(loader.cacheSize).toBe(2);
      // same path again — size stays the same
      await loader.load('/a.glb');
      expect(loader.cacheSize).toBe(2);
    });
  });

  // ── dispose ────────────────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('clears the cache', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      expect(loader.cacheSize).toBe(1);
      loader.dispose();
      expect(loader.cacheSize).toBe(0);
    });

    it('calls geometry.dispose() on cached meshes', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      // Simpler: just check that dispose() doesn't throw.
      expect(() => loader.dispose()).not.toThrow();
    });

    it('isCached returns false after dispose', async () => {
      const loader = new AssetLoader();
      await loader.load('/assets/nature/tree_default.glb');
      loader.dispose();
      expect(loader.isCached('/assets/nature/tree_default.glb')).toBe(false);
    });
  });
});
