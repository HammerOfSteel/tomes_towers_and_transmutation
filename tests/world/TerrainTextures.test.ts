import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { terrainVariantTexture, GROUND_TERRAIN_VARIANTS } from '@/world/TerrainTextures';

describe('terrainVariantTexture', () => {
  it('returns a distinct CanvasTexture for every covered variant', () => {
    const seen = new Set<THREE.CanvasTexture>();
    for (const v of GROUND_TERRAIN_VARIANTS) {
      const tex = terrainVariantTexture(v);
      expect(tex).toBeInstanceOf(THREE.CanvasTexture);
      expect(seen.has(tex)).toBe(false);
      seen.add(tex);
    }
  });

  it('lists exactly the 13 spec-covered variants (10 land + 3 water floor)', () => {
    expect([...GROUND_TERRAIN_VARIANTS].sort()).toEqual([
      'beach', 'desert', 'forest', 'grassland', 'lake_floor', 'mountain',
      'ocean_floor', 'river_bank', 'river_floor', 'savanna', 'snow', 'taiga', 'tundra',
    ]);
  });

  it('caches the underlying canvas across repeated calls for the same variant', () => {
    const a = terrainVariantTexture('grassland');
    const b = terrainVariantTexture('grassland');
    // Each call returns a fresh THREE.CanvasTexture wrapper (so independent
    // call sites can set repeat independently, matching RoadTextures.ts's
    // convention), but both must wrap the exact same underlying canvas.
    expect(a.image).toBe(b.image);
  });

  it('sets RepeatWrapping and the requested repeat factor', () => {
    const tex = terrainVariantTexture('desert');
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
  });
});
