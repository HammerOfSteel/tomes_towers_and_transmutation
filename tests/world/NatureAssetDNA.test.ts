import { describe, it, expect } from 'vitest';
import {
  hashIndex,
  pickTreeArchetype,
  pickRockArchetype,
  type TreeArchetype,
  type RockArchetype,
} from '@/world/NatureAssetDNA';

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
  it('is deterministic and always one of the 3 known archetypes', () => {
    const known: TreeArchetype[] = ['conifer', 'deciduous', 'sparse'];
    for (let i = -20; i < 20; i++) {
      const a = pickTreeArchetype(i * 3.3, -i * 1.9);
      expect(a).toBe(pickTreeArchetype(i * 3.3, -i * 1.9));
      expect(known).toContain(a);
    }
  });

  it('produces more than one distinct archetype across many positions', () => {
    const seen = new Set<TreeArchetype>();
    for (let i = -20; i < 20; i++) seen.add(pickTreeArchetype(i * 3.3, -i * 1.9));
    expect(seen.size).toBeGreaterThan(1);
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
