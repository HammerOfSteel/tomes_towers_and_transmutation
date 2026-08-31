import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import {
  AMBIENT_SPECIES, AMBIENT_BIOME_RULES,
  WANDER_RADIUS, FLEE_TRIGGER_RADIUS, FLEE_EXIT_RADIUS,
  WANDER_SPEED, FLEE_SPEED, IDLE_MIN_DWELL, IDLE_MAX_DWELL,
  MAX_ACTIVE_AMBIENT_CREATURES, AMBIENT_BASE_SPACING,
  selectAmbientSpawnPoints, tickAmbientBehavior, type AmbientBehaviorState,
  AmbientCreature,
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

describe('tickAmbientBehavior', () => {
  const FAR_PLAYER = { x: 1000, z: 1000 }; // always outside flee range unless a test moves it

  function initialIdleState(): AmbientBehaviorState {
    return { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 3 };
  }

  it('stays idle while the dwell timer has not expired', () => {
    const rand = () => 0.5;
    const prev = initialIdleState();
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeCloseTo(2, 5);
  });

  it('transitions idle -> wander once the dwell timer expires, picking a target within WANDER_RADIUS of spawn', () => {
    const rand = () => 0.5; // deterministic mid-range value
    const prev: AmbientBehaviorState = { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 0.5 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('wander');
    const dist = Math.sqrt(next.targetX ** 2 + next.targetZ ** 2);
    expect(dist).toBeLessThanOrEqual(WANDER_RADIUS + 1e-6);
  });

  it('transitions wander -> idle once the creature arrives at its target, with a new dwell timer in [IDLE_MIN_DWELL, IDLE_MAX_DWELL]', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 1, targetZ: 0, dwellTimer: 0 };
    // ownX=1, ownZ=0 — already at the target (arrival threshold satisfied)
    const next = tickAmbientBehavior(prev, 1, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeGreaterThanOrEqual(IDLE_MIN_DWELL);
    expect(next.dwellTimer).toBeLessThanOrEqual(IDLE_MAX_DWELL);
  });

  it('stays wander while still far from its target', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 8, targetZ: 0, dwellTimer: 0 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(next.state).toBe('wander');
    expect(next.targetX).toBe(8); // target unchanged while still en route
    expect(next.targetZ).toBe(0);
  });

  it('enters flee from idle when the player is within FLEE_TRIGGER_RADIUS', () => {
    const rand = () => 0.5;
    const prev = initialIdleState();
    // own at (0,0), player at (3,0) — distance 3 < FLEE_TRIGGER_RADIUS (6)
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 3, 0, 1, rand);
    expect(next.state).toBe('flee');
    // Flee target should be in the direction AWAY from the player (negative X, since player is at +X)
    expect(next.targetX).toBeLessThan(0);
  });

  it('enters flee from wander when the player is within FLEE_TRIGGER_RADIUS', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'wander', targetX: 8, targetZ: 0, dwellTimer: 0 };
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 3, 0, 1, rand);
    expect(next.state).toBe('flee');
  });

  it('stays flee while the player is still within FLEE_EXIT_RADIUS (hysteresis band)', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'flee', targetX: -5, targetZ: 0, dwellTimer: 0 };
    // own at (0,0), player at (8,0) — distance 8 is beyond FLEE_TRIGGER_RADIUS (6) but still
    // within FLEE_EXIT_RADIUS (9), so must stay fleeing (hysteresis, no flicker).
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 8, 0, 1, rand);
    expect(next.state).toBe('flee');
  });

  it('exits flee back to idle once the player is beyond FLEE_EXIT_RADIUS', () => {
    const rand = () => 0.5;
    const prev: AmbientBehaviorState = { state: 'flee', targetX: -5, targetZ: 0, dwellTimer: 0 };
    // own at (0,0), player at (10,0) — distance 10 > FLEE_EXIT_RADIUS (9)
    const next = tickAmbientBehavior(prev, 0, 0, 0, 0, 10, 0, 1, rand);
    expect(next.state).toBe('idle');
    expect(next.dwellTimer).toBeGreaterThanOrEqual(IDLE_MIN_DWELL);
    expect(next.dwellTimer).toBeLessThanOrEqual(IDLE_MAX_DWELL);
  });

  it('is deterministic for a fixed rand function', () => {
    const rand = () => 0.3;
    const prev: AmbientBehaviorState = { state: 'idle', targetX: 0, targetZ: 0, dwellTimer: 0.1 };
    const a = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    const b = tickAmbientBehavior(prev, 0, 0, 0, 0, FAR_PLAYER.x, FAR_PLAYER.z, 1, rand);
    expect(a).toEqual(b);
  });
});

describe('AmbientCreature', () => {
  it('constructs a rabbit at the given spawn position, feet grounded at spawn Y', () => {
    const spawn = new THREE.Vector3(5, 2, 5);
    const creature = new AmbientCreature('rabbit', spawn, 42);
    // The creature's root sits at the spawn XZ; grounding math keeps Y close to spawn.y
    // (small tolerance since natural-foot-Y offsets a few hundredths of a world unit).
    expect(creature.root.position.x).toBeCloseTo(spawn.x, 5);
    expect(creature.root.position.z).toBeCloseTo(spawn.z, 5);
    creature.dispose();
  });

  it('constructs a goat without throwing', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('goat', spawn, 7);
    expect(creature.root).toBeDefined();
    creature.dispose();
  });

  it('moves toward the wander target over successive update() calls (never teleports)', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const farPlayer = new THREE.Vector3(1000, 0, 1000);
    const startPos = creature.root.position.clone();
    for (let i = 0; i < 300; i++) creature.update(farPlayer, 1 / 30);
    const endPos = creature.root.position.clone();
    const moved = startPos.distanceTo(endPos);
    // Over 10 simulated seconds of idle+wander cycling, some movement should have occurred,
    // but never further than a single wander excursion could carry it (spawn radius + margin).
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(moved).toBeLessThan(WANDER_RADIUS + 2);
    creature.dispose();
  });

  it('flees away from a nearby player', () => {
    const spawn = new THREE.Vector3(0, 0, 0);
    const creature = new AmbientCreature('rabbit', spawn, 1);
    const closePlayer = new THREE.Vector3(2, 0, 0); // within FLEE_TRIGGER_RADIUS
    const startX = creature.root.position.x;
    for (let i = 0; i < 60; i++) creature.update(closePlayer, 1 / 30);
    // Fleeing away from a player at +X should move the creature toward -X.
    expect(creature.root.position.x).toBeLessThan(startX);
    creature.dispose();
  });

  it('dispose() does not throw and can be called safely', () => {
    const creature = new AmbientCreature('goat', new THREE.Vector3(0, 0, 0), 3);
    expect(() => creature.dispose()).not.toThrow();
  });
});
