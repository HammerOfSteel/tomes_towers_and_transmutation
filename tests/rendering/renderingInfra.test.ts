/**
 * Phase 7.5b — Rendering infrastructure tests
 * MaterialLibrary, GeometryCache, RoundedBoxGeometry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialLibrary } from '@/rendering/MaterialLibrary';
import { GeometryCache } from '@/rendering/GeometryCache';
import * as THREE from 'three';

// ── MaterialLibrary ───────────────────────────────────────────────────────────

describe('MaterialLibrary', () => {
  beforeEach(() => {
    MaterialLibrary.disposeAll();
  });

  it('returns a material for every defined key', () => {
    const keys = [
      'stone_wall', 'stone_floor', 'wood_plank', 'wood_dark', 'moss',
      'slime_body', 'slime_eye', 'player_body', 'player_robe',
      'torch_metal', 'torch_flame', 'cauldron_iron', 'rune_emissive', 'sky_gradient',
    ] as const;
    for (const key of keys) {
      const mat = MaterialLibrary.get(key);
      expect(mat).toBeDefined();
      expect(mat).toBeInstanceOf(THREE.Material);
    }
  });

  it('returns the same instance on repeated calls (caching)', () => {
    const a = MaterialLibrary.get('stone_wall');
    const b = MaterialLibrary.get('stone_wall');
    expect(a).toBe(b);
  });

  it('returns different instances for different keys', () => {
    const a = MaterialLibrary.get('stone_wall');
    const b = MaterialLibrary.get('stone_floor');
    expect(a).not.toBe(b);
  });

  it('clone() returns a distinct object with the same type', () => {
    const original = MaterialLibrary.get('stone_wall');
    const cloned   = MaterialLibrary.clone('stone_wall');
    expect(cloned).not.toBe(original);
    expect(cloned).toBeInstanceOf(original.constructor as typeof THREE.Material);
  });

  it('size increases as new materials are requested', () => {
    expect(MaterialLibrary.size).toBe(0);
    MaterialLibrary.get('wood_plank');
    MaterialLibrary.get('moss');
    expect(MaterialLibrary.size).toBe(2);
  });

  it('disposeAll clears the cache', () => {
    MaterialLibrary.get('slime_body');
    expect(MaterialLibrary.size).toBeGreaterThan(0);
    MaterialLibrary.disposeAll();
    expect(MaterialLibrary.size).toBe(0);
  });

  it('standard materials have roughness/metalness set', () => {
    const stone = MaterialLibrary.get<THREE.MeshStandardMaterial>('stone_wall');
    expect(stone.roughness).toBeGreaterThan(0);
    expect((stone as THREE.MeshStandardMaterial).metalness).toBeDefined();
  });

  it('torch_flame has an emissive colour', () => {
    const flame = MaterialLibrary.get<THREE.MeshLambertMaterial>('torch_flame');
    // emissiveIntensity > 0 means the emissive colour is active
    expect(flame.emissiveIntensity).toBeGreaterThan(0);
  });
});

// ── GeometryCache ─────────────────────────────────────────────────────────────

describe('GeometryCache', () => {
  beforeEach(() => {
    GeometryCache.disposeAll();
  });

  it('calls the builder exactly once per key', () => {
    let callCount = 0;
    const build = () => { callCount++; return new THREE.BoxGeometry(1, 1, 1); };

    GeometryCache.get('test_box', build);
    GeometryCache.get('test_box', build);
    GeometryCache.get('test_box', build);

    expect(callCount).toBe(1);
  });

  it('returns the same geometry reference for the same key', () => {
    const build = () => new THREE.BoxGeometry(1, 1, 1);
    const a = GeometryCache.get('test_ref', build);
    const b = GeometryCache.get('test_ref', build);
    expect(a).toBe(b);
  });

  it('different keys produce different geometries', () => {
    const a = GeometryCache.get('geo_a', () => new THREE.BoxGeometry(1, 1, 1));
    const b = GeometryCache.get('geo_b', () => new THREE.BoxGeometry(2, 2, 2));
    expect(a).not.toBe(b);
  });

  it('has() returns false before first access and true after', () => {
    expect(GeometryCache.has('my_geo')).toBe(false);
    GeometryCache.get('my_geo', () => new THREE.SphereGeometry(1));
    expect(GeometryCache.has('my_geo')).toBe(true);
  });

  it('evict() removes the entry from the cache', () => {
    GeometryCache.get('evict_me', () => new THREE.BoxGeometry(1, 1, 1));
    expect(GeometryCache.has('evict_me')).toBe(true);
    GeometryCache.evict('evict_me');
    expect(GeometryCache.has('evict_me')).toBe(false);
  });

  it('size grows with each new key', () => {
    expect(GeometryCache.size).toBe(0);
    GeometryCache.get('s1', () => new THREE.BoxGeometry(1, 1, 1));
    GeometryCache.get('s2', () => new THREE.BoxGeometry(2, 2, 2));
    expect(GeometryCache.size).toBe(2);
  });

  it('disposeAll clears the cache', () => {
    GeometryCache.get('clr', () => new THREE.BoxGeometry(1, 1, 1));
    GeometryCache.disposeAll();
    expect(GeometryCache.size).toBe(0);
    expect(GeometryCache.has('clr')).toBe(false);
  });

  it('preWarm builds all supplied geometries at once', () => {
    let aBuilt = false, bBuilt = false;
    GeometryCache.preWarm([
      ['pw_a', () => { aBuilt = true; return new THREE.BoxGeometry(1, 1, 1); }],
      ['pw_b', () => { bBuilt = true; return new THREE.BoxGeometry(2, 2, 2); }],
    ]);
    expect(aBuilt).toBe(true);
    expect(bBuilt).toBe(true);
    expect(GeometryCache.size).toBe(2);
  });
});

// ── RoundedBoxGeometry ────────────────────────────────────────────────────────

describe('RoundedBoxGeometry', () => {
  // Lazy import avoids JSDOM WebGL issues at module level
  async function makeGeo(w=1, h=1, d=1, r=0.1, segs=2) {
    const { RoundedBoxGeometry } = await import('@/rendering/RoundedBoxGeometry');
    return new RoundedBoxGeometry(w, h, d, r, segs);
  }

  it('creates a geometry with position/normal/uv attributes', async () => {
    const geo = await makeGeo();
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('normal')).toBeDefined();
    expect(geo.getAttribute('uv')).toBeDefined();
  });

  it('has an index buffer', async () => {
    const geo = await makeGeo();
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBeGreaterThan(0);
  });

  it('produces more vertices with higher bevelSegments', async () => {
    const low  = await makeGeo(1, 1, 1, 0.1, 1);
    const high = await makeGeo(1, 1, 1, 0.1, 4);
    expect(high.getAttribute('position').count).toBeGreaterThan(
      low.getAttribute('position').count,
    );
  });

  it('bounding sphere radius is approximately half the diagonal', async () => {
    const geo = await makeGeo(2, 2, 2, 0.1, 2);
    geo.computeBoundingSphere();
    const expected = Math.sqrt(3) * 1; // half-diagonal of a 2×2×2 box ≈ 1.732
    expect(geo.boundingSphere!.radius).toBeCloseTo(expected, 0);
  });

  it('clamps bevelRadius to prevent non-convex output', async () => {
    // bevelRadius larger than half the box should not throw
    const geo = await makeGeo(1, 1, 1, 5.0, 2);
    expect(geo.getAttribute('position').count).toBeGreaterThan(0);
  });
});
