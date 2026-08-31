import { describe, it, expect } from 'vitest';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
  selectAmbientSpawnPoints,
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

function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
  }
  return g;
}

describe('selectAmbientSpawnPoints', () => {
  // A 100x100 WU window (vs. AMBIENT_BASE_SPACING=40) reliably yields ~6-7 Poisson-disk
  // candidates (confirmed via direct measurement) — comfortably more than the 1 candidate a
  // 40x40 window (equal to the spacing itself) would yield, avoiding a fragile single-candidate
  // test margin.
  it('returns spawn points on an all-forest chunk, all species rabbit', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.species).toBe('rabbit');
  });

  it('returns spawn points on an all-mountain chunk, all species goat', () => {
    const wg = makeAllBiomeGrid(100, 'mountain');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.species).toBe('goat');
  });

  it('returns 0 spawn points on a biome with no ambient-wildlife rule (desert)', () => {
    const wg = makeAllBiomeGrid(100, 'desert');
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBe(0);
  });

  it('excludes water/road/content/settlement cells (delegates to isScatterAllowed)', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const { col: c0, row: r0 } = wg.worldToGrid(-50, -50);
    const { col: c1, row: r1 } = wg.worldToGrid(50, 50);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { waterDepth: 1.5 });
    }
    const points = selectAmbientSpawnPoints(wg, -50, -50, 100, 1);
    expect(points.length).toBe(0);
  });

  it('taiga produces noticeably fewer spawn points than forest for the same chunk size/seed (density rule applied)', () => {
    // Uses a much larger area (400x400 WU, ~70 Poisson-disk candidates at AMBIENT_BASE_SPACING)
    // than the other tests in this block — with only a handful of candidates (as the smaller
    // 100x100 windows above produce), a probabilistic keepProbability comparison could
    // occasionally flake; at ~70 candidates the law of large numbers makes forest's
    // keepProbability=1.0 clearly and reliably exceed taiga's keepProbability=0.327.
    const forestGrid = makeAllBiomeGrid(450, 'forest');
    const taigaGrid = makeAllBiomeGrid(450, 'taiga');
    const forestPoints = selectAmbientSpawnPoints(forestGrid, -200, -200, 400, 5);
    const taigaPoints = selectAmbientSpawnPoints(taigaGrid, -200, -200, 400, 5);
    expect(forestPoints.length).toBeGreaterThan(20);
    expect(taigaPoints.length).toBeLessThan(forestPoints.length);
  });

  it('is deterministic for a fixed seed', () => {
    const wg = makeAllBiomeGrid(100, 'forest');
    const a = selectAmbientSpawnPoints(wg, -20, -20, 40, 3);
    const b = selectAmbientSpawnPoints(wg, -20, -20, 40, 3);
    expect(a).toEqual(b);
  });
});
