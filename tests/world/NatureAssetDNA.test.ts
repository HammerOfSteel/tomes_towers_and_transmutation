import { describe, it, expect } from 'vitest';
import {
  hashIndex,
  pickTreeArchetype,
  pickRockArchetype,
  type TreeArchetype,
  type RockArchetype,
} from '@/world/NatureAssetDNA';
import type { BiomeId } from '@/world/WorldGrid';

describe('hashIndex', () => {
  it('is deterministic for the same inputs', () => {
    expect(hashIndex(12.5, -7.25, 3)).toBe(hashIndex(12.5, -7.25, 3));
  });

  it('stays within [0, count)', () => {
    for (let i = -30; i < 30; i++) {
      for (let j = -30; j < 30; j++) {
        const v = hashIndex(i * 1.37, j * 2.11, 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(3);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('produces more than one distinct value across many inputs', () => {
    const values = new Set<number>();
    for (let i = -30; i < 30; i++) {
      values.add(hashIndex(i * 1.37, i * -2.11, 3));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('pickTreeArchetype', () => {
  it('is deterministic for the same biome and position', () => {
    for (let i = -20; i < 20; i++) {
      const a = pickTreeArchetype('forest', i * 3.3, -i * 1.9);
      expect(a).toBe(pickTreeArchetype('forest', i * 3.3, -i * 1.9));
    }
  });

  it('only ever picks from a biome\'s own allowed archetype set', () => {
    const allowed: Record<string, TreeArchetype[]> = {
      grassland: ['deciduous', 'sparse'],
      forest: ['conifer', 'deciduous'],
      taiga: ['conifer'],
      tundra: ['sparse'],
      mountain: ['sparse'],
      snow: ['sparse'],
      desert: ['cactus', 'joshuatree'],
      savanna: ['acacia'],
    };
    for (const [biome, set] of Object.entries(allowed)) {
      for (let i = -15; i < 15; i++) {
        const a = pickTreeArchetype(biome as BiomeId, i * 2.7, -i * 4.1);
        expect(set, `biome ${biome} produced unexpected archetype ${a}`).toContain(a);
      }
    }
  });

  it('produces more than one distinct archetype across many positions for a mixed biome', () => {
    const seen = new Set<TreeArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickTreeArchetype('forest', i * 3.3, -i * 1.9));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('desert is mostly cactus with occasional joshuatree (both appear, cactus more often)', () => {
    const counts: Record<string, number> = { cactus: 0, joshuatree: 0 };
    for (let i = -40; i < 40; i++) {
      const a = pickTreeArchetype('desert', i * 2.7, -i * 4.1);
      counts[a] = (counts[a] ?? 0) + 1;
    }
    expect(counts.cactus).toBeGreaterThan(0);
    expect(counts.joshuatree).toBeGreaterThan(0);
    expect(counts.cactus).toBeGreaterThan(counts.joshuatree); // "sparse" trees, cactus dominates
  });

  it('always picks the single allowed archetype for a uniform biome', () => {
    for (let i = -20; i < 20; i++) {
      expect(pickTreeArchetype('taiga', i * 3.3, -i * 1.9)).toBe('conifer');
      expect(pickTreeArchetype('savanna', i * 3.3, -i * 1.9)).toBe('acacia');
    }
  });

  it('a different biome at the same position can yield a different archetype', () => {
    // Same coordinates, biomes whose sets don't overlap at all.
    expect(pickTreeArchetype('taiga', 5, 5)).toBe('conifer');
    expect(pickTreeArchetype('savanna', 5, 5)).toBe('acacia');
  });
});

describe('pickRockArchetype', () => {
  it('is deterministic and always one of the 3 known archetypes', () => {
    const known: RockArchetype[] = ['boulder', 'slab', 'cluster'];
    for (let i = -20; i < 20; i++) {
      const a = pickRockArchetype(i * 2.2, i * 4.4);
      expect(a).toBe(pickRockArchetype(i * 2.2, i * 4.4));
      expect(known).toContain(a);
    }
  });

  it('produces more than one distinct archetype across many positions', () => {
    const seen = new Set<RockArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickRockArchetype(i * 2.2, i * 4.4));
    expect(seen.size).toBeGreaterThan(1);
  });
});
