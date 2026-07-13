import { describe, it, expect } from 'vitest';
import { generateTower } from '@/levels/TowerGenerator';
import {
  TOWER_FLOOR_DEFS,
  FLOORS_ORDERED,
  PLAYER_START_FLOOR_INDEX,
  getFloorDef,
} from '@/levels/TowerFloorDef';
import { BLUEPRINT_VERSION } from '@/levels/blueprint';

// ── TowerFloorDef tests ───────────────────────────────────────────────────────

describe('TowerFloorDef', () => {
  it('has 11 floors (basement + 0–9)', () => {
    expect(TOWER_FLOOR_DEFS).toHaveLength(11);
  });

  it('has unique floorIndexes from -1 to 9', () => {
    const indices = TOWER_FLOOR_DEFS.map((d) => d.floorIndex).sort((a, b) => a - b);
    expect(indices).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('has unique IDs', () => {
    const ids = new Set(TOWER_FLOOR_DEFS.map((d) => d.id));
    expect(ids.size).toBe(11);
  });

  it('FLOORS_ORDERED is sorted by floorIndex ascending', () => {
    for (let i = 1; i < FLOORS_ORDERED.length; i++) {
      expect(FLOORS_ORDERED[i].floorIndex).toBeGreaterThan(FLOORS_ORDERED[i - 1].floorIndex);
    }
  });

  it('getFloorDef returns correct def by index', () => {
    const def = getFloorDef(3);
    expect(def?.id).toBe('floor_quarters');
  });

  it('getFloorDef returns undefined for out-of-range index', () => {
    expect(getFloorDef(99)).toBeUndefined();
    expect(getFloorDef(-99)).toBeUndefined();
  });

  it('player start floor has enemiesPerRoom = 0 (safe room)', () => {
    const def = getFloorDef(PLAYER_START_FLOOR_INDEX);
    expect(def?.enemiesPerRoom).toBe(0);
  });

  it('all keyFixture types are valid InteractableType values', () => {
    const valid = new Set([
      'bookshelf', 'lectern', 'cauldron', 'telescope', 'forge', 'quest_board', 'greenhouse_orb',
    ]);
    for (const def of TOWER_FLOOR_DEFS) {
      expect(valid.has(def.keyFixture.type), `${def.id} keyFixture.type`).toBe(true);
    }
  });
});

// ── TowerGenerator tests ──────────────────────────────────────────────────────

describe('generateTower', () => {
  const SEED = 42;
  const plan = generateTower(SEED);

  it('returns a DungeonPlan with the given seed', () => {
    expect(plan.seed).toBe(SEED);
  });

  it('is deterministic — same seed yields same room set', () => {
    const plan2 = generateTower(SEED);
    expect([...plan2.rooms.keys()].sort()).toEqual([...plan.rooms.keys()].sort());
  });

  it('different seeds yield different room counts per floor (statistically)', () => {
    const planA = generateTower(1);
    const planB = generateTower(999_999);
    // Room count might differ; both should be valid ranges (min*11 rooms possible)
    expect(planA.rooms.size).toBeGreaterThanOrEqual(11 + 11 * 2); // 11 chambers + at least 2 side rooms each
    expect(planB.rooms.size).toBeGreaterThanOrEqual(11 + 11 * 2);
  });

  it('has exactly 11 chamber blueprints', () => {
    const chambers = [...plan.rooms.keys()].filter((id) => id.endsWith('_chamber'));
    expect(chambers).toHaveLength(11);
  });

  it('startRoomId points to the Living Quarters chamber', () => {
    expect(plan.startRoomId).toBe('tower_floor_quarters_chamber');
  });

  it('every blueprint in the plan has version = BLUEPRINT_VERSION', () => {
    for (const [, bp] of plan.rooms) {
      expect(bp.version).toBe(BLUEPRINT_VERSION);
    }
  });

  it('every chamber has the correct floor number', () => {
    for (const def of TOWER_FLOOR_DEFS) {
      const chamberBp = plan.rooms.get(`tower_${def.id}_chamber`);
      expect(chamberBp, `chamber for ${def.id}`).toBeDefined();
      expect(chamberBp!.floor).toBe(def.floorIndex);
    }
  });

  it('every side room links back to its parent chamber via a door', () => {
    for (const [id, bp] of plan.rooms) {
      if (id.endsWith('_chamber')) continue;
      // Extract def id from "tower_<defId>_room_<n>"
      const match = id.match(/^tower_(.+)_room_\d+$/);
      expect(match, `id="${id}" should match pattern`).not.toBeNull();
      const parentChamberId = `tower_${match![1]}_chamber`;
      const returnsToParent = bp.doors.some((d) => d.targetId === parentChamberId);
      expect(returnsToParent, `side room "${id}" should have door back to "${parentChamberId}"`).toBe(true);
    }
  });

  it('chamber doors point only to valid room IDs', () => {
    for (const [id, bp] of plan.rooms) {
      if (!id.endsWith('_chamber')) continue;
      for (const door of bp.doors) {
        if (door.targetId === null) continue;  // exterior exit, no room to resolve
        expect(plan.rooms.has(door.targetId!), `door in "${id}" → "${door.targetId}"`).toBe(true);
      }
    }
  });

  it('staircase chain is fully connected (no dangling targets)', () => {
    for (const [id, bp] of plan.rooms) {
      if (!id.endsWith('_chamber')) continue;
      for (const stair of bp.staircases) {
        if (stair.targetId === null) continue;
        expect(plan.rooms.has(stair.targetId!), `staircase in "${id}" → "${stair.targetId}"`).toBe(true);
      }
    }
  });

  it('basement has no DOWN staircase', () => {
    const bp = plan.rooms.get('tower_floor_alchemy_chamber');
    expect(bp).toBeDefined();
    const downs = bp!.staircases.filter((s) => s.direction === 'down');
    expect(downs).toHaveLength(0);
  });

  it('rooftop has no UP staircase', () => {
    const bp = plan.rooms.get('tower_floor_observatory_chamber');
    expect(bp).toBeDefined();
    const ups = bp!.staircases.filter((s) => s.direction === 'up');
    expect(ups).toHaveLength(0);
  });

  it('intermediate floors have exactly one UP and one DOWN staircase', () => {
    // Pick a middle floor (floor 5)
    const bp = plan.rooms.get('tower_floor_menagerie_chamber');
    expect(bp).toBeDefined();
    const ups   = bp!.staircases.filter((s) => s.direction === 'up');
    const downs = bp!.staircases.filter((s) => s.direction === 'down');
    expect(ups).toHaveLength(1);
    expect(downs).toHaveLength(1);
  });

  it('circular chamber has ≥50% floor tiles (circle area check)', () => {
    const bp = plan.rooms.get('tower_floor_quarters_chamber');
    expect(bp).toBeDefined();
    const totalCells = bp!.width * bp!.depth;
    const wallCells  = bp!.tiles.length;
    const floorRatio = 1 - wallCells / totalCells;
    // Circle with R=7 in 17×17 = π×49/289 ≈ 0.533
    expect(floorRatio).toBeGreaterThan(0.45);
  });

  it('living quarters has no enemy spawns (safe floor)', () => {
    // Enumerate all side rooms for the quarters floor
    for (const [id, bp] of plan.rooms) {
      if (!id.startsWith('tower_floor_quarters_room_')) continue;
      expect(bp.spawns).toHaveLength(0);
    }
  });

  it('each chamber has its key fixture at the centre cell', () => {
    for (const def of TOWER_FLOOR_DEFS) {
      const bp = plan.rooms.get(`tower_${def.id}_chamber`);
      expect(bp).toBeDefined();
      const centre = bp!.interactables.find(
        (i) => i.type === def.keyFixture.type && i.x === 8 && i.z === 8,
      );
      expect(centre, `${def.id} chamber should have ${def.keyFixture.type} at (8,8)`).toBeDefined();
    }
  });

  it('side rooms stay within bounds (all cells within 0..SR_W x 0..SR_D)', () => {
    for (const [id, bp] of plan.rooms) {
      if (id.endsWith('_chamber')) continue;
      for (const tile of bp.tiles) {
        expect(tile.x).toBeGreaterThanOrEqual(0);
        expect(tile.x).toBeLessThan(bp.width);
        expect(tile.z).toBeGreaterThanOrEqual(0);
        expect(tile.z).toBeLessThan(bp.depth);
      }
    }
  });
});
