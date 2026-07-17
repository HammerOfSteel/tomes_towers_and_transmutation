import { describe, it, expect } from 'vitest';
import {
  ENCOUNTER_POOLS,
  ENCOUNTER_POOL_F1, ENCOUNTER_POOL_F2, ENCOUNTER_POOL_F3,
  ENCOUNTER_POOL_F4, ENCOUNTER_POOL_F5, ENCOUNTER_POOL_F6,
  ENCOUNTER_POOL_F7, ENCOUNTER_POOL_F8, ENCOUNTER_POOL_F9,
  validateEncounterDef,
  totalEnemyCount,
  type RoomEncounterDef,
} from '@/levels/RoomEncounterDef';
import { TOWER_FLOOR_DEFS } from '@/levels/TowerFloorDef';

// ── Pools that have encounter defs (floors 1-9, skipping 3=safe room) ────────

const ALL_POOLS: { floorIndex: number; pool: readonly RoomEncounterDef[] }[] = [
  { floorIndex: 1, pool: ENCOUNTER_POOL_F1 },
  { floorIndex: 2, pool: ENCOUNTER_POOL_F2 },
  { floorIndex: 3, pool: ENCOUNTER_POOL_F3 },
  { floorIndex: 4, pool: ENCOUNTER_POOL_F4 },
  { floorIndex: 5, pool: ENCOUNTER_POOL_F5 },
  { floorIndex: 6, pool: ENCOUNTER_POOL_F6 },
  { floorIndex: 7, pool: ENCOUNTER_POOL_F7 },
  { floorIndex: 8, pool: ENCOUNTER_POOL_F8 },
  { floorIndex: 9, pool: ENCOUNTER_POOL_F9 },
];

// ── Structural validation ─────────────────────────────────────────────────────

describe('RoomEncounterDef — structural validation', () => {
  it('validateEncounterDef accepts a valid encounter', () => {
    const valid: RoomEncounterDef = {
      id: 'test_entry',
      pattern: 'entry',
      tier: 1,
      enemies: [{ enemyId: 'skeleton_warrior', count: 2 }],
      reward: 'none',
    };
    expect(validateEncounterDef(valid)).toHaveLength(0);
  });

  it('validateEncounterDef rejects empty enemy list', () => {
    const bad: RoomEncounterDef = {
      id: 'empty_enemies',
      pattern: 'entry',
      tier: 1,
      enemies: [],
    };
    expect(validateEncounterDef(bad).length).toBeGreaterThan(0);
  });

  it('validateEncounterDef rejects count < 1', () => {
    const bad: RoomEncounterDef = {
      id: 'zero_count',
      pattern: 'entry',
      tier: 1,
      enemies: [{ enemyId: 'skeleton_warrior', count: 0 }],
    };
    expect(validateEncounterDef(bad).length).toBeGreaterThan(0);
  });

  it('validateEncounterDef rejects waveCount < 1', () => {
    const bad: RoomEncounterDef = {
      id: 'bad_wave',
      pattern: 'swarm',
      tier: 1,
      enemies: [{ enemyId: 'imp', count: 4 }],
      waveCount: 0,
    };
    expect(validateEncounterDef(bad).length).toBeGreaterThan(0);
  });

  it('validateEncounterDef rejects waveKillThreshold > enemies per wave', () => {
    const bad: RoomEncounterDef = {
      id: 'bad_threshold',
      pattern: 'swarm',
      tier: 1,
      enemies: [{ enemyId: 'imp', count: 2 }],
      waveCount: 3,
      waveKillThreshold: 5, // > 2 enemies per wave
    };
    expect(validateEncounterDef(bad).length).toBeGreaterThan(0);
  });
});

// ── totalEnemyCount helper ────────────────────────────────────────────────────

describe('totalEnemyCount', () => {
  it('returns enemy count when no waves', () => {
    const def: RoomEncounterDef = {
      id: 'tc_1',
      pattern: 'entry',
      tier: 1,
      enemies: [
        { enemyId: 'skeleton_warrior', count: 2 },
        { enemyId: 'skeleton_minion',  count: 1 },
      ],
    };
    expect(totalEnemyCount(def)).toBe(3);
  });

  it('multiplies by waveCount when specified', () => {
    const def: RoomEncounterDef = {
      id: 'tc_2',
      pattern: 'swarm',
      tier: 1,
      enemies: [{ enemyId: 'imp', count: 4 }],
      waveCount: 3,
    };
    expect(totalEnemyCount(def)).toBe(12);
  });
});

// ── All pool encounters are structurally valid ────────────────────────────────

describe('ENCOUNTER_POOLS — all encounters pass validation', () => {
  for (const { floorIndex, pool } of ALL_POOLS) {
    it(`floor ${floorIndex}: all ${pool.length} encounters are valid`, () => {
      for (const def of pool) {
        const errors = validateEncounterDef(def);
        expect(errors, `floor ${floorIndex} / encounter "${def.id}": ${errors.join(', ')}`).toHaveLength(0);
      }
    });
  }
});

// ── IDs are unique within each pool ──────────────────────────────────────────

describe('ENCOUNTER_POOLS — encounter IDs are unique within each pool', () => {
  for (const { floorIndex, pool } of ALL_POOLS) {
    it(`floor ${floorIndex} has no duplicate encounter IDs`, () => {
      const ids = pool.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  }
});

// ── Wave sensibility ──────────────────────────────────────────────────────────

describe('ENCOUNTER_POOLS — swarm encounters have sensible wave counts', () => {
  for (const { floorIndex, pool } of ALL_POOLS) {
    for (const def of pool) {
      if (def.pattern === 'swarm') {
        it(`floor ${floorIndex} / "${def.id}": waveCount is 1–10`, () => {
          const wc = def.waveCount ?? 1;
          expect(wc).toBeGreaterThanOrEqual(1);
          expect(wc).toBeLessThanOrEqual(10);
        });
      }
    }
  }
});

// ── Boss encounters are on floor 9 only ──────────────────────────────────────

describe('ENCOUNTER_POOLS — boss encounters only appear on floor 9', () => {
  for (const { floorIndex, pool } of ALL_POOLS) {
    for (const def of pool) {
      if (def.pattern === 'boss') {
        it(`boss encounter "${def.id}" is on floor 9 (found on ${floorIndex})`, () => {
          expect(floorIndex).toBe(9);
        });
      }
    }
  }
});

// ── ENCOUNTER_POOLS map matches named exports ─────────────────────────────────

describe('ENCOUNTER_POOLS map', () => {
  it('covers all combat floors (1-2, 4-9)', () => {
    const floorNums = Object.keys(ENCOUNTER_POOLS).map(Number);
    expect(floorNums.sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it('every pool has at least 1 encounter', () => {
    for (const [floor, pool] of Object.entries(ENCOUNTER_POOLS)) {
      expect(pool.length, `floor ${floor} pool is empty`).toBeGreaterThan(0);
    }
  });
});

// ── TowerFloorDef wiring ──────────────────────────────────────────────────────

describe('TowerFloorDef.encounterPool wiring', () => {
  it('floors 1–2 and 4–9 have an encounterPool', () => {
    const combatFloors = [1, 2, 4, 5, 6, 7, 8, 9];
    for (const fi of combatFloors) {
      const def = TOWER_FLOOR_DEFS.find((d) => d.floorIndex === fi);
      expect(def?.encounterPool, `floor ${fi} should have encounterPool`).toBeDefined();
      expect(def!.encounterPool!.length).toBeGreaterThan(0);
    }
  });

  it('safe floors (-1, 0, 3) have no encounterPool', () => {
    const safeFloors = [-1, 0, 3];
    for (const fi of safeFloors) {
      const def = TOWER_FLOOR_DEFS.find((d) => d.floorIndex === fi);
      expect(def?.encounterPool, `floor ${fi} should not have encounterPool`).toBeUndefined();
    }
  });
});
