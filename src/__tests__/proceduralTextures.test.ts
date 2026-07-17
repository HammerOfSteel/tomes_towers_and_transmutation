/**
 * Tests for ProceduralTextures — TEXTURE_PRESETS catalogue and buildMaterial.
 *
 * BUG COVERAGE:
 *   Bug 7 – mat params seeded correctly so buildMaterial always produces a valid material
 *   General – ensures all 8 presets produce MeshStandardMaterial without throwing
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  TEXTURE_PRESETS,
  buildMaterial,
  buildEmissiveMaterial,
} from '@/rendering/ProceduralTextures';

// ── TEXTURE_PRESETS catalogue integrity ────────────────────────────────────────

describe('TEXTURE_PRESETS catalogue', () => {
  const EXPECTED_PRESET_IDS = [
    'plain', 'wood', 'stone', 'fabric', 'metal', 'marble', 'leather', 'painted',
  ];

  it('contains exactly the expected 8 presets', () => {
    expect(TEXTURE_PRESETS).toHaveLength(EXPECTED_PRESET_IDS.length);
  });

  it('every preset has a non-empty id', () => {
    for (const p of TEXTURE_PRESETS) {
      expect(p.id).toBeTruthy();
    }
  });

  it('every preset has all required fields', () => {
    for (const p of TEXTURE_PRESETS) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('emoji');
      expect(p).toHaveProperty('defaultColor');
      expect(p).toHaveProperty('defaultColor2');
      expect(p).toHaveProperty('params');
      expect(Array.isArray(p.params)).toBe(true);
    }
  });

  it('every preset param has id, label, min, max, step, default', () => {
    for (const p of TEXTURE_PRESETS) {
      for (const param of p.params) {
        expect(param).toHaveProperty('id');
        expect(param).toHaveProperty('label');
        expect(typeof param.min).toBe('number');
        expect(typeof param.max).toBe('number');
        expect(typeof param.step).toBe('number');
        expect(typeof param.default).toBe('number');
      }
    }
  });

  it('every param default is within [min, max]', () => {
    for (const p of TEXTURE_PRESETS) {
      for (const param of p.params) {
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it('all expected preset ids are present', () => {
    const ids = TEXTURE_PRESETS.map(p => p.id);
    for (const expected of EXPECTED_PRESET_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('no duplicate preset ids', () => {
    const ids = TEXTURE_PRESETS.map(p => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ── buildMaterial ──────────────────────────────────────────────────────────────

describe('buildMaterial', () => {
  it('returns a THREE.MeshStandardMaterial for every preset id', () => {
    for (const preset of TEXTURE_PRESETS) {
      const defaults = Object.fromEntries(preset.params.map(p => [p.id, p.default]));
      const mat = buildMaterial(preset.id, defaults, preset.defaultColor);
      expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      mat.dispose();
    }
  });

  it('works with an empty texParams object (uses fallbacks)', () => {
    const mat = buildMaterial('wood', {}, '#8b5e3c');
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    mat.dispose();
  });

  it('works for an unknown presetId (falls back to plain fill)', () => {
    const mat = buildMaterial('doesNotExist', {}, '#aabbcc');
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    mat.dispose();
  });

  it('sets roughness > 0 for stone preset', () => {
    const stone = TEXTURE_PRESETS.find(p => p.id === 'stone')!;
    const defaults = Object.fromEntries(stone.params.map(p => [p.id, p.default]));
    const mat = buildMaterial('stone', defaults, '#7a7a7a');
    expect(mat.roughness).toBeGreaterThan(0);
    mat.dispose();
  });

  it('sets high metalness for metal preset', () => {
    const metal = TEXTURE_PRESETS.find(p => p.id === 'metal')!;
    const defaults = Object.fromEntries(metal.params.map(p => [p.id, p.default]));
    const mat = buildMaterial('metal', defaults, '#8a8a8a');
    expect(mat.metalness).toBeGreaterThanOrEqual(0.75);
    mat.dispose();
  });

  it('is deterministic — same inputs produce same roughness/metalness', () => {
    const defaults = { scale: 2, grain_density: 0.5, grain_warp: 0.4, knot_count: 0.3, dark_bands: 0.3, polish: 0.1 };
    const mat1 = buildMaterial('wood', defaults, '#8b5e3c');
    const mat2 = buildMaterial('wood', defaults, '#8b5e3c');
    expect(mat1.roughness).toBe(mat2.roughness);
    expect(mat1.metalness).toBe(mat2.metalness);
    mat1.dispose(); mat2.dispose();
  });

  it('attaches a canvas texture as the map', () => {
    const mat = buildMaterial('fabric', {}, '#7a5a9a');
    expect(mat.map).toBeInstanceOf(THREE.CanvasTexture);
    mat.dispose();
  });
});

// ── buildEmissiveMaterial ──────────────────────────────────────────────────────

describe('buildEmissiveMaterial', () => {
  it('returns a THREE.MeshStandardMaterial', () => {
    const mat = buildEmissiveMaterial('#ff4400');
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    mat.dispose();
  });

  it('has a non-zero emissiveIntensity', () => {
    const mat = buildEmissiveMaterial('#ff4400');
    expect(mat.emissiveIntensity).toBeGreaterThan(0);
    mat.dispose();
  });

  it('respects a custom intensity', () => {
    const mat = buildEmissiveMaterial('#ff0000', 3.5);
    expect(mat.emissiveIntensity).toBe(3.5);
    mat.dispose();
  });

  it('has no texture map (emissive is clean)', () => {
    const mat = buildEmissiveMaterial('#00ff00');
    expect(mat.map).toBeNull();
    mat.dispose();
  });
});
