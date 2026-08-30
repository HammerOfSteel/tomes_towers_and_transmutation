import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { roadVariantTexture, GENERIC_ROAD_VARIANT } from '@/world/RoadTextures';

describe('roadVariantTexture', () => {
  it('returns a CanvasTexture for every known faction variant', () => {
    for (const variant of ['vulperia', 'dwarven', 'elven', 'orcish', 'undead', 'vampire', 'fae']) {
      expect(roadVariantTexture(variant)).toBeInstanceOf(THREE.CanvasTexture);
    }
  });

  it('returns a CanvasTexture for the generic open-road variant', () => {
    expect(roadVariantTexture(GENERIC_ROAD_VARIANT)).toBeInstanceOf(THREE.CanvasTexture);
  });

  it('falls back to a valid texture for unrecognized variants (human, slime, unknown)', () => {
    for (const variant of ['human', 'slime', 'totally-unknown-variant']) {
      expect(roadVariantTexture(variant)).toBeInstanceOf(THREE.CanvasTexture);
    }
  });

  it('caches and returns the same texture instance for repeated calls with the same variant', () => {
    const a = roadVariantTexture('dwarven');
    const b = roadVariantTexture('dwarven');
    expect(a).toBe(b);
  });

  it('gives different factions visually distinct (different canvas source) textures', () => {
    const dwarven = roadVariantTexture('dwarven');
    const vulperia = roadVariantTexture('vulperia');
    expect(dwarven.image).not.toBe(vulperia.image);
  });

  it('sets RepeatWrapping on every texture (tileable across many sub-tiles)', () => {
    const tex = roadVariantTexture('orcish');
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
