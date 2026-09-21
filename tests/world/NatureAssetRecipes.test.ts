import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/core/prng';
import { ARCHETYPE_RECIPES, assembleFromRecipe } from '@/world/NatureAssetRecipes';

const ARCHETYPE_KEYS = [
  'conifer', 'deciduous', 'sparse', 'acacia', 'joshuatree',
  'cactus-saguaro', 'cactus-barrel', 'cactus-pricklypear',
  'rock-boulder', 'rock-slab', 'rock-cluster', 'bush',
] as const;

describe('ARCHETYPE_RECIPES', () => {
  it('has an entry for every expected archetype key', () => {
    for (const key of ARCHETYPE_KEYS) {
      expect(ARCHETYPE_RECIPES[key]).toBeDefined();
    }
  });
});

describe('assembleFromRecipe', () => {
  it('conifer produces 1 trunk + 2 canopy-blob parts', () => {
    const parts = assembleFromRecipe(ARCHETYPE_RECIPES.conifer!, mulberry32(1));
    expect(parts.filter(p => p.partType === 'trunk').length).toBe(1);
    expect(parts.filter(p => p.partType === 'canopy-blob').length).toBe(2);
    expect(parts.map(p => p.materialKey)).toContain('conifer-lower');
    expect(parts.map(p => p.materialKey)).toContain('conifer-upper');
  });

  it('deciduous produces 1 trunk + 3 canopy-blob parts arranged in a ring', () => {
    const parts = assembleFromRecipe(ARCHETYPE_RECIPES.deciduous!, mulberry32(2));
    const blobs = parts.filter(p => p.partType === 'canopy-blob');
    expect(blobs.length).toBe(3);
    const angles = blobs.map(p => Math.atan2(p.position.z, p.position.x));
    // 3 distinct angles spanning the ring, not all clustered at one point.
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(0.5);
  });

  it('is deterministic for a fixed seed', () => {
    const a = assembleFromRecipe(ARCHETYPE_RECIPES.acacia!, mulberry32(42));
    const b = assembleFromRecipe(ARCHETYPE_RECIPES.acacia!, mulberry32(42));
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.position.toArray()).toEqual(b[i]!.position.toArray());
      expect(a[i]!.scale.toArray()).toEqual(b[i]!.scale.toArray());
      expect(a[i]!.partType).toBe(b[i]!.partType);
      expect(a[i]!.materialKey).toBe(b[i]!.materialKey);
    }
  });

  it('every archetype assembles without throwing and produces at least 1 part', () => {
    for (const key of ARCHETYPE_KEYS) {
      const parts = assembleFromRecipe(ARCHETYPE_RECIPES[key]!, mulberry32(7));
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) {
        expect(['trunk', 'branch-arm', 'canopy-blob', 'rock-chunk']).toContain(p.partType);
        expect(p.variantIndex).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(p.scale.x)).toBe(true);
      }
    }
  });

  it('rock-cluster produces multiple rock-chunk parts in a ring', () => {
    const parts = assembleFromRecipe(ARCHETYPE_RECIPES['rock-cluster']!, mulberry32(3));
    expect(parts.filter(p => p.partType === 'rock-chunk').length).toBeGreaterThanOrEqual(2);
  });

  it('rock-boulder produces exactly 1 rock-chunk part', () => {
    const parts = assembleFromRecipe(ARCHETYPE_RECIPES['rock-boulder']!, mulberry32(3));
    expect(parts.length).toBe(1);
    expect(parts[0]!.partType).toBe('rock-chunk');
  });

  it('bush produces 2-4 canopy-blob parts', () => {
    const parts = assembleFromRecipe(ARCHETYPE_RECIPES.bush!, mulberry32(9));
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(4);
    for (const p of parts) expect(p.partType).toBe('canopy-blob');
  });

  it('joshuatree includes at least 1 branch-arm part for its side arms', () => {
    // Roll a few seeds since branch count is itself randomized.
    let sawArm = false;
    for (let seed = 0; seed < 10; seed++) {
      const parts = assembleFromRecipe(ARCHETYPE_RECIPES.joshuatree!, mulberry32(seed));
      if (parts.some(p => p.partType === 'branch-arm')) sawArm = true;
    }
    expect(sawArm).toBe(true);
  });

  it('variantIndex stays within the actual part pool size for each part type', () => {
    for (const key of ARCHETYPE_KEYS) {
      const parts = assembleFromRecipe(ARCHETYPE_RECIPES[key]!, mulberry32(11));
      for (const p of parts) {
        const max = p.partType === 'canopy-blob' || p.partType === 'rock-chunk' ? 6 : 4;
        expect(p.variantIndex).toBeLessThan(max);
      }
    }
  });
});
