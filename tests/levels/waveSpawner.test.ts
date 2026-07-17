import { describe, it, expect } from 'vitest';
import {
  validateEncounterDef,
  totalEnemyCount,
  type RoomEncounterDef,
  ENCOUNTER_POOLS,
  ENCOUNTER_POOL_F1,
  ENCOUNTER_POOL_F2,
} from '@/levels/RoomEncounterDef';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSwarm(overrides?: Partial<RoomEncounterDef>): RoomEncounterDef {
  return {
    id: 'test_swarm',
    pattern: 'swarm',
    tier: 1,
    enemies: [{ enemyId: 'imp', count: 4, spawnPattern: 'corners' }],
    waveCount: 3,
    reward: 'none',
    ...overrides,
  };
}

// ── validateEncounterDef ──────────────────────────────────────────────────────

describe('validateEncounterDef', () => {
  it('accepts a valid swarm encounter', () => {
    expect(validateEncounterDef(makeSwarm())).toHaveLength(0);
  });

  it('rejects waveCount < 1', () => {
    expect(validateEncounterDef(makeSwarm({ waveCount: 0 }))).toEqual(
      expect.arrayContaining([expect.stringContaining('waveCount')]),
    );
  });

  it('rejects waveKillThreshold < 1', () => {
    expect(validateEncounterDef(makeSwarm({ waveKillThreshold: 0 }))).toEqual(
      expect.arrayContaining([expect.stringContaining('waveKillThreshold')]),
    );
  });

  it('accepts waveKillThreshold on a swarm encounter', () => {
    expect(validateEncounterDef(makeSwarm({ waveKillThreshold: 2 }))).toHaveLength(0);
  });

  it('rejects missing id', () => {
    expect(validateEncounterDef(makeSwarm({ id: '' }))).toEqual(
      expect.arrayContaining([expect.stringContaining('id')]),
    );
  });

  it('rejects empty enemies array', () => {
    expect(validateEncounterDef(makeSwarm({ enemies: [] }))).toEqual(
      expect.arrayContaining([expect.stringContaining('at least one enemy group')]),
    );
  });
});

// ── totalEnemyCount ───────────────────────────────────────────────────────────

describe('totalEnemyCount', () => {
  it('is perWave count for a single wave', () => {
    const def = makeSwarm({ waveCount: 1, enemies: [{ enemyId: 'imp', count: 4, spawnPattern: 'corners' }] });
    expect(totalEnemyCount(def)).toBe(4);
  });

  it('multiplies by waveCount for swarm', () => {
    const def = makeSwarm({ waveCount: 3, enemies: [{ enemyId: 'imp', count: 4, spawnPattern: 'corners' }] });
    expect(totalEnemyCount(def)).toBe(12);
  });

  it('sums across multiple enemy groups per wave', () => {
    const def: RoomEncounterDef = {
      id: 'multi', pattern: 'elite', tier: 2,
      enemies: [
        { enemyId: 'golem', count: 1, spawnPattern: 'spread' },
        { enemyId: 'skeleton_warrior', count: 2, spawnPattern: 'spread' },
      ],
      reward: 'none',
    };
    expect(totalEnemyCount(def)).toBe(3);
  });
});

// ── ENCOUNTER_POOLS structure ─────────────────────────────────────────────────

describe('ENCOUNTER_POOLS — all pools validate', () => {
  for (const [floor, pool] of Object.entries(ENCOUNTER_POOLS)) {
    it(`floor ${floor} pool has no validation errors`, () => {
      for (const def of pool) {
        const errs = validateEncounterDef(def);
        expect(errs, `encounter "${def.id}" errors: ${errs.join(', ')}`).toHaveLength(0);
      }
    });
  }
});

describe('ENCOUNTER_POOL_F2 — swarm encounters have waveCount', () => {
  it('f2_swarm_imps has waveCount 3', () => {
    const swarm = ENCOUNTER_POOL_F2.find(d => d.id === 'f2_swarm_imps');
    expect(swarm).toBeDefined();
    expect(swarm?.waveCount).toBe(3);
    expect(swarm?.pattern).toBe('swarm');
  });
});

describe('ENCOUNTER_POOL_F1 — boss only on appropriate tier', () => {
  it('has no boss pattern', () => {
    for (const def of ENCOUNTER_POOL_F1) {
      expect(def.pattern).not.toBe('boss');
    }
  });

  it('all entries are tier 1', () => {
    for (const def of ENCOUNTER_POOL_F1) {
      expect(def.tier).toBe(1);
    }
  });
});
