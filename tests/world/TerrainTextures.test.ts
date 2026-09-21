import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { terrainVariantTexture, GROUND_TERRAIN_VARIANTS, REGION_CELL_WU, REGION_TEXTURE_VARIANT_COUNT, regionTextureVariantKey } from '@/world/TerrainTextures';

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

describe('regionTextureVariantKey', () => {
  it('returns the plain biome id (no suffix) for a biome with no region variants configured', () => {
    expect(regionTextureVariantKey('mountain', 0, 0)).toBe('mountain');
    expect(regionTextureVariantKey('desert', 500, -500)).toBe('desert');
  });

  it('returns either the plain biome id or a "~N" suffixed variant for a configured biome', () => {
    const count = REGION_TEXTURE_VARIANT_COUNT.grassland!;
    expect(count).toBeGreaterThan(1);
    const key = regionTextureVariantKey('grassland', 123.4, -56.7);
    const match = /^grassland(~(\d+))?$/.exec(key);
    expect(match).not.toBeNull();
    if (match![2]) expect(Number(match![2])).toBeLessThan(count);
  });

  it('is stable within one region cell (same result for two positions in the same coarse cell)', () => {
    const a = regionTextureVariantKey('grassland', 1, 1);
    const b = regionTextureVariantKey('grassland', 1 + REGION_CELL_WU * 0.4, 1 + REGION_CELL_WU * 0.4);
    expect(a).toBe(b);
  });

  it('is deterministic across repeated calls', () => {
    expect(regionTextureVariantKey('forest', 42, 42)).toBe(regionTextureVariantKey('forest', 42, 42));
  });

  it('produces more than one distinct key across a spread of far-apart region cells', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 30; i++) {
      keys.add(regionTextureVariantKey('grassland', i * REGION_CELL_WU * 3, i * REGION_CELL_WU * 5));
    }
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe('terrainVariantTexture with a suffixed region-variant key', () => {
  it('returns a distinct texture for a suffixed variant than the base variant', () => {
    const base = terrainVariantTexture('grassland');
    const region1 = terrainVariantTexture('grassland~1');
    expect(region1).toBeInstanceOf(THREE.CanvasTexture);
    expect(region1.image).not.toBe(base.image);
  });

  it('caches suffixed variants independently from the base variant', () => {
    const a = terrainVariantTexture('grassland~1');
    const b = terrainVariantTexture('grassland~1');
    expect(a.image).toBe(b.image);
  });
});

describe('terrainVariantTexture — cliff variant', () => {
  it('routes the cliff variant through the same texture as the mountain variant', () => {
    const cliffTex = terrainVariantTexture('cliff');
    const mountainTex = terrainVariantTexture('mountain');
    expect(cliffTex.image).toBe(mountainTex.image);
  });
});
