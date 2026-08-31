import { describe, it, expect } from 'vitest';
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
} from '@/world/AmbientWildlife';

describe('AMBIENT_SPECIES', () => {
  it('has exactly rabbit and goat', () => {
    expect(Object.keys(AMBIENT_SPECIES).sort()).toEqual(['goat', 'rabbit']);
  });

  it('each species def\'s species field matches its own key', () => {
    expect(AMBIENT_SPECIES.rabbit.species).toBe('rabbit');
    expect(AMBIENT_SPECIES.goat.species).toBe('goat');
  });

  it('rabbit DNA is a small, non-threatening quadruped (not the raw angry-monster default)', () => {
    const dna = AMBIENT_SPECIES.rabbit.dna;
    expect(dna.archetype).toBe('quadruped');
    expect(dna.proportions.global).toBeLessThan(1.0);
    expect(dna.face.type).toBe('cute');
    expect(dna.face.mouthType).toBe('none');
    expect(dna.colors.emissiveIntensity).toBe(0);
  });

  it('goat DNA is a mid-size, non-threatening quadruped', () => {
    const dna = AMBIENT_SPECIES.goat.dna;
    expect(dna.archetype).toBe('quadruped');
    expect(dna.proportions.global).toBeGreaterThan(AMBIENT_SPECIES.rabbit.dna.proportions.global);
    expect(dna.proportions.global).toBeLessThan(1.0);
    expect(dna.face.type).toBe('blank');
    expect(dna.colors.emissiveIntensity).toBe(0);
  });
});

describe('AMBIENT_BIOME_RULES', () => {
  it('maps forest/grassland/taiga to rabbit and mountain to goat', () => {
    expect(AMBIENT_BIOME_RULES.forest?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.grassland?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.taiga?.species).toBe('rabbit');
    expect(AMBIENT_BIOME_RULES.mountain?.species).toBe('goat');
  });

  it('has no rule for biomes with no assigned wildlife this batch', () => {
    expect(AMBIENT_BIOME_RULES.savanna).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.tundra).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.desert).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.beach).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.snow).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.ocean).toBeUndefined();
    expect(AMBIENT_BIOME_RULES.deep_ocean).toBeUndefined();
  });

  it('forest/grassland have full keepProbability (1.0); taiga and mountain are sparser', () => {
    expect(AMBIENT_BIOME_RULES.forest?.keepProbability).toBe(1.0);
    expect(AMBIENT_BIOME_RULES.grassland?.keepProbability).toBe(1.0);
    expect(AMBIENT_BIOME_RULES.taiga?.keepProbability).toBeCloseTo(0.327, 2);
    expect(AMBIENT_BIOME_RULES.mountain?.keepProbability).toBeCloseTo(0.529, 2);
  });
});

describe('behavior/spawn tunables', () => {
  it('have the exact values from the design spec', () => {
    expect(WANDER_RADIUS).toBe(8);
    expect(FLEE_TRIGGER_RADIUS).toBe(6);
    expect(FLEE_EXIT_RADIUS).toBe(9); // 1.5x FLEE_TRIGGER_RADIUS
    expect(IDLE_MIN_DWELL).toBe(2);
    expect(IDLE_MAX_DWELL).toBe(5);
    expect(MAX_ACTIVE_AMBIENT_CREATURES).toBe(24);
    expect(AMBIENT_BASE_SPACING).toBe(40);
    expect(WANDER_SPEED).toBeGreaterThan(0);
    expect(FLEE_SPEED).toBeGreaterThan(WANDER_SPEED); // fleeing must be faster than wandering
  });
});
