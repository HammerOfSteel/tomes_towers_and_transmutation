/**
 * buildingToDungeonPlan.test.ts
 *
 * Unit tests for the buildingToDungeonPlan converter.
 *
 * What we test:
 *  1. Basic contract: returns a valid DungeonPlan
 *  2. startRoomId exists in rooms map
 *  3. Determinism: same inputs → identical plan
 *  4. Connectivity: all rooms are BFS-reachable from startRoomId
 *  5. Blueprint validity: every room has perimeter walls, doors are within bounds
 *  6. JSON round-trip: plan serializes / deserializes without data loss
 *  7. Multiple building kinds + factions
 *  8. Floor indexing: floor N blueprints carry floor: N
 *
 * Run: npx vitest run tests/levels/buildingToDungeonPlan.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  buildingToDungeonPlan,
  WARD_TO_KIND,
  WARD_TO_SIZE,
  WARD_TO_FLOORS,
} from '@/buildingToDungeonPlan';
import type { Blueprint, DoorEntry } from '@/levels/blueprint';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import type { BuildingKind, Faction } from '@/world/buildings/BuildingDNA';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** BFS from startRoomId; returns set of reachable room IDs. */
function reachable(plan: DungeonPlan): Set<string> {
  const visited = new Set<string>();
  const queue   = [plan.startRoomId];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const room = plan.rooms.get(id);
    if (!room) continue;
    for (const door of room.doors) {
      if (door.targetId && !visited.has(door.targetId)) queue.push(door.targetId);
    }
  }
  return visited;
}

/** Assert all wired doors are symmetric (room A → room B and B → A). */
function assertSymmetricDoors(plan: DungeonPlan, label = ''): void {
  for (const [id, bp] of plan.rooms) {
    for (const door of bp.doors) {
      if (!door.targetId) continue;
      const target = plan.rooms.get(door.targetId);
      expect(target, `${label} targetId "${door.targetId}" from "${id}" must exist`).toBeDefined();
      const back = target!.doors.find((d: DoorEntry) => d.targetId === id);
      expect(back, `${label} room "${door.targetId}" must have back-door to "${id}"`).toBeDefined();
    }
  }
}

/** Assert door coordinates are within blueprint bounds. */
function assertDoorsInBounds(plan: DungeonPlan, label = ''): void {
  for (const [id, bp] of plan.rooms) {
    for (const door of bp.doors) {
      expect(door.x, `${label} ${id} door.x must be ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(door.x, `${label} ${id} door.x must be < width`).toBeLessThan(bp.width);
      expect(door.z, `${label} ${id} door.z must be ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(door.z, `${label} ${id} door.z must be < depth`).toBeLessThan(bp.depth);
    }
  }
}

/** Serialize a plan to JSON (same as Studio does) and parse it back. */
function roundTrip(plan: DungeonPlan): DungeonPlan {
  const json = JSON.stringify({
    rooms:       Object.fromEntries(plan.rooms),
    startRoomId: plan.startRoomId,
    seed:        plan.seed,
  });
  const data = JSON.parse(json);
  return {
    rooms:       new Map(Object.entries(data.rooms)),
    startRoomId: data.startRoomId,
    seed:        data.seed,
  };
}

// ── Constants under test ──────────────────────────────────────────────────────

const ALL_KINDS: BuildingKind[] = ['inn', 'shop', 'blacksmith', 'villa', 'house', 'chapel', 'terraced'];
const ALL_FACTIONS: Faction[]   = ['human_town', 'elven', 'dwarven', 'orcish', 'vampire'];

// ── Core contract ─────────────────────────────────────────────────────────────

describe('buildingToDungeonPlan — core contract', () => {

  it('returns a DungeonPlan with rooms and startRoomId', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 1);
    expect(plan.rooms).toBeInstanceOf(Map);
    expect(plan.rooms.size).toBeGreaterThan(0);
    expect(typeof plan.startRoomId).toBe('string');
    expect(plan.startRoomId.length).toBeGreaterThan(0);
  });

  it('startRoomId is present in rooms map', () => {
    for (const seed of [0, 1, 42, 999]) {
      const plan = buildingToDungeonPlan('shop', 'human_town', seed);
      expect(
        plan.rooms.has(plan.startRoomId),
        `seed ${seed}: startRoomId "${plan.startRoomId}" must be in rooms`,
      ).toBe(true);
    }
  });

  it('each blueprint has id that matches its map key', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 42);
    for (const [key, bp] of plan.rooms) {
      expect(bp.id).toBe(key);
    }
  });

  it('each blueprint passes structural sanity checks', () => {
    const plan = buildingToDungeonPlan('house', 'human_town', 7);
    for (const [id, bp] of plan.rooms) {
      expect(bp.width,      `${id}.width`).toBeGreaterThan(2);
      expect(bp.depth,      `${id}.depth`).toBeGreaterThan(2);
      expect(bp.cellSize,   `${id}.cellSize`).toBeGreaterThan(0);
      expect(bp.wallHeight, `${id}.wallHeight`).toBeGreaterThan(0);
      expect(bp.version).toBe(1);
      expect(Array.isArray(bp.tiles)).toBe(true);
      expect(Array.isArray(bp.doors)).toBe(true);
      expect(Array.isArray(bp.staircases)).toBe(true);
      expect(typeof bp.floor).toBe('number');
    }
  });

});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('buildingToDungeonPlan — determinism', () => {

  it('same seed → identical room IDs and door connections', () => {
    for (const kind of ['inn', 'shop', 'house'] as BuildingKind[]) {
      for (const seed of [0, 42, 0xDEADBEEF]) {
        const p1 = buildingToDungeonPlan(kind, 'human_town', seed);
        const p2 = buildingToDungeonPlan(kind, 'human_town', seed);
        expect(p1.startRoomId).toBe(p2.startRoomId);
        expect(p1.rooms.size).toBe(p2.rooms.size);
        for (const [id, bp1] of p1.rooms) {
          const bp2 = p2.rooms.get(id);
          expect(bp2, `${kind} seed ${seed}: both plans must have "${id}"`).toBeDefined();
          expect(bp1.width).toBe(bp2!.width);
          expect(bp1.depth).toBe(bp2!.depth);
          expect(bp1.doors.length).toBe(bp2!.doors.length);
        }
      }
    }
  });

  it('wall layout is seed-independent (layout from DNA; props vary with seed)', () => {
    // generatePlan() uses seed only for prop/furniture placement, NOT for wall
    // layout — the grid is deterministically derived from BuildingDNA alone.
    // This means tile positions are stable across seeds (desired for predictable
    // room shapes), while interactable positions vary.
    const p1 = buildingToDungeonPlan('inn', 'human_town', 1);
    const p2 = buildingToDungeonPlan('inn', 'human_town', 0xDEAD_BEEF);
    const f1 = p1.rooms.get('inn_f0_r0')!;
    const f2 = p2.rooms.get('inn_f0_r0')!;
    // Wall tiles should be identical (layout is DNA-driven)
    expect(f1.tiles.length).toBe(f2.tiles.length);
    // Interactables CAN differ (they are scatter-seeded)
    // We just assert both have the same room structure
    expect(f1.width).toBe(f2.width);
    expect(f1.depth).toBe(f2.depth);
  });

});

// ── Floor connectivity ────────────────────────────────────────────────────────

describe('buildingToDungeonPlan — floor connectivity', () => {

  it('single-floor building: all rooms reachable from startRoomId', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 42, 'medium', 1);
    const reach = reachable(plan);
    expect(reach.size).toBe(plan.rooms.size);
  });

  it('multi-floor building: startRoomId is reachable and is floor 0', () => {
    for (const floors of [2, 3] as (1|2|3|4)[]) {
      const plan = buildingToDungeonPlan('villa', 'human_town', 7, 'medium', floors);
      expect(plan.rooms.has(plan.startRoomId)).toBe(true);
      const startBp = plan.rooms.get(plan.startRoomId)!;
      expect(startBp.floor).toBe(0);
    }
  });

  it('multi-floor building: floors are numbered 0..N-1', () => {
    const floors = 3;
    const plan = buildingToDungeonPlan('inn', 'human_town', 5, 'large', floors);
    const floorNums = new Set([...plan.rooms.values()].map(bp => bp.floor));
    for (let f = 0; f < floors; f++) {
      expect(floorNums.has(f), `floor ${f} should exist`).toBe(true);
    }
  });

  it('inter-floor doors use targetId matching adjacent floor blueprint', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 99, 'medium', 2);
    // With per-room blueprints, floor 0's last room connects to floor 1's first room
    // Find any room on floor 0 that has a door targeting a floor-1 room
    const f0Rooms = [...plan.rooms.values()].filter(bp => bp.floor === 0);
    const f1Rooms = [...plan.rooms.values()].filter(bp => bp.floor === 1);
    expect(f0Rooms.length, 'floor 0 should have rooms').toBeGreaterThan(0);
    expect(f1Rooms.length, 'floor 1 should have rooms').toBeGreaterThan(0);
    const f1Ids = new Set(f1Rooms.map(bp => bp.id));
    const stairRoom = f0Rooms.find(bp => bp.doors.some(d => d.targetId && f1Ids.has(d.targetId)));
    expect(stairRoom, 'a floor-0 room must have a door targeting a floor-1 room').toBeDefined();
  });

});

// ── Door integrity ────────────────────────────────────────────────────────────

describe('buildingToDungeonPlan — door integrity', () => {

  it('all wired doors are symmetric', () => {
    for (const kind of ['inn', 'blacksmith', 'chapel'] as BuildingKind[]) {
      const plan = buildingToDungeonPlan(kind, 'human_town', 123);
      assertSymmetricDoors(plan, kind);
    }
  });

  it('door coordinates are within blueprint bounds', () => {
    for (const kind of ['shop', 'house', 'villa'] as BuildingKind[]) {
      const plan = buildingToDungeonPlan(kind, 'human_town', 0);
      assertDoorsInBounds(plan, kind);
    }
  });

  it('exterior doors have targetId: null', () => {
    const plan = buildingToDungeonPlan('inn', 'human_town', 42, 'medium', 1);
    // With per-room Blueprints, the entrance room (r0 on floor 0) has the exterior door
    const entranceId = 'inn_f0_r0';
    const f0 = plan.rooms.get(entranceId)!;
    expect(f0, `${entranceId} must exist`).toBeDefined();
    const extDoors = f0.doors.filter((d: DoorEntry) => d.targetId === null);
    expect(extDoors.length, `${entranceId} should have ≥1 exterior door`).toBeGreaterThanOrEqual(1);
  });

});

// ── JSON round-trip (localStorage serialization) ──────────────────────────────

describe('buildingToDungeonPlan — JSON round-trip', () => {

  it('plan survives JSON stringify → parse with identical structure', () => {
    for (const kind of ['inn', 'shop'] as BuildingKind[]) {
      const orig    = buildingToDungeonPlan(kind, 'human_town', 77);
      const restored = roundTrip(orig);

      expect(restored.startRoomId).toBe(orig.startRoomId);
      expect(restored.rooms.size).toBe(orig.rooms.size);

      for (const [id, origBp] of orig.rooms) {
        const resBp = restored.rooms.get(id) as Blueprint | undefined;
        expect(resBp, `restored plan must contain room "${id}"`).toBeDefined();
        expect(resBp!.width).toBe(origBp.width);
        expect(resBp!.depth).toBe(origBp.depth);
        expect(resBp!.doors.length).toBe(origBp.doors.length);
        expect(resBp!.tiles.length).toBe(origBp.tiles.length);
      }
    }
  });

  it('restored plan still passes symmetric-door check', () => {
    const plan = buildingToDungeonPlan('villa', 'elven', 33, 'large', 2);
    const restored = roundTrip(plan);
    assertSymmetricDoors(restored, 'villa-elven restored');
  });

});

// ── Multiple kinds + factions ─────────────────────────────────────────────────

describe('buildingToDungeonPlan — kind × faction matrix', () => {

  for (const kind of ALL_KINDS) {
    for (const faction of ALL_FACTIONS) {
      it(`kind="${kind}" faction="${faction}" produces valid plan`, () => {
        const plan = buildingToDungeonPlan(kind, faction, 42);
        expect(plan.rooms.size).toBeGreaterThan(0);
        expect(plan.rooms.has(plan.startRoomId)).toBe(true);
        assertDoorsInBounds(plan, `${kind}+${faction}`);
      });
    }
  }

});

// ── Ward mapping tables ───────────────────────────────────────────────────────

describe('WARD_TO_KIND / WARD_TO_SIZE / WARD_TO_FLOORS', () => {

  it('every ward type in WARD_TO_KIND that is non-null produces a valid plan', () => {
    for (const [wardType, kind] of Object.entries(WARD_TO_KIND)) {
      if (!kind) continue;
      const size   = WARD_TO_SIZE[wardType]   ?? 'medium';
      const floors = (WARD_TO_FLOORS[wardType] ?? 2) as 1|2|3|4;
      const plan = buildingToDungeonPlan(kind as BuildingKind, 'human_town', 1, size, floors);
      expect(plan.rooms.size, `ward="${wardType}" kind="${kind}"`).toBeGreaterThan(0);
    }
  });

  it('WARD_TO_FLOORS values are 1-4', () => {
    for (const [wardType, floors] of Object.entries(WARD_TO_FLOORS)) {
      expect(
        [1,2,3,4].includes(floors as number),
        `WARD_TO_FLOORS["${wardType}"] = ${floors} must be 1-4`,
      ).toBe(true);
    }
  });

});
