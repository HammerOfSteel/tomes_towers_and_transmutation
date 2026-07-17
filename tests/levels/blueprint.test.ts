import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  validateBlueprint,
  parseBlueprint,
  serializeBlueprint,
  BlueprintError,
  isInsideTrigger,
  doorSpawnPosition,
  cellToWorld,
  type Blueprint,
} from '@/levels/blueprint';
import { renderBlueprint } from '@/levels/BlueprintRenderer';

// ── Fixtures ──────────────────────────────────────────────────────────────

const VALID_BP: Blueprint = {
  id: 'test_room',
  version: 1,
  width: 3,
  depth: 3,
  cellSize: 2,
  wallHeight: 3,
  floor: 0,
  tiles: [
    { x: 0, z: 0, type: 'wall' },
    { x: 1, z: 0, type: 'wall' },
    { x: 2, z: 0, type: 'wall' },
    { x: 0, z: 2, type: 'wall' },
    { x: 2, z: 2, type: 'wall' },
  ],
  doors: [{ x: 1, z: 2, facing: 'south', targetId: 'other_room' }],
  staircases: [],
  spawns: [{ x: 1, z: 1, type: 'slime' }],
  interactables: [{ x: 0, z: 1, type: 'bookshelf', content: 'Test book' }],
};

// ── Schema validation ─────────────────────────────────────────────────────

describe('validateBlueprint', () => {
  it('accepts a valid blueprint', () => {
    expect(() => validateBlueprint(VALID_BP)).not.toThrow();
    const bp = validateBlueprint(VALID_BP);
    expect(bp.id).toBe('test_room');
    expect(bp.tiles).toHaveLength(5);
  });

  it('throws on non-object input', () => {
    expect(() => validateBlueprint(null)).toThrow(BlueprintError);
    expect(() => validateBlueprint('string')).toThrow(BlueprintError);
    expect(() => validateBlueprint(42)).toThrow(BlueprintError);
  });

  it('throws on wrong version', () => {
    expect(() => validateBlueprint({ ...VALID_BP, version: 2 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, version: 0 })).toThrow(BlueprintError);
  });

  it('throws on missing id', () => {
    expect(() => validateBlueprint({ ...VALID_BP, id: '' })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, id: 123 })).toThrow(BlueprintError);
  });

  it('throws on non-positive or non-integer dimensions', () => {
    expect(() => validateBlueprint({ ...VALID_BP, width: 0 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, depth: -1 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, cellSize: 0 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, wallHeight: -3 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, width: 1.5 })).toThrow(BlueprintError);
  });

  it('throws on unknown tile type', () => {
    expect(() =>
      validateBlueprint({ ...VALID_BP, tiles: [{ x: 0, z: 0, type: 'door' }] }),
    ).toThrow(BlueprintError);
  });

  it('throws on invalid door facing', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        doors: [{ x: 1, z: 2, facing: 'up', targetId: null }],
      }),
    ).toThrow(BlueprintError);
  });

  it('throws on door targetId that is not string or null', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        doors: [{ x: 1, z: 2, facing: 'south', targetId: 42 }],
      }),
    ).toThrow(BlueprintError);
  });

  it('throws on unknown spawn type', () => {
    expect(() =>
      validateBlueprint({ ...VALID_BP, spawns: [{ x: 1, z: 1, type: 'dragon' }] }),
    ).toThrow(BlueprintError);
  });

  it('throws on unknown interactable type', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        interactables: [{ x: 0, z: 1, type: 'dragon_egg' }],
      }),
    ).toThrow(BlueprintError);
  });

  it('throws on non-integer floor', () => {
    expect(() => validateBlueprint({ ...VALID_BP, floor: 1.5 })).toThrow(BlueprintError);
    expect(() => validateBlueprint({ ...VALID_BP, floor: 'ground' })).toThrow(BlueprintError);
  });

  it('accepts negative floor numbers (basements)', () => {
    expect(() => validateBlueprint({ ...VALID_BP, floor: -1 })).not.toThrow();
  });

  it('throws on invalid staircase facing', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        staircases: [{ x: 1, z: 1, facing: 'up', direction: 'up', targetId: null }],
      }),
    ).toThrow(BlueprintError);
  });

  it('throws on invalid staircase direction', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        staircases: [{ x: 1, z: 1, facing: 'north', direction: 'sideways', targetId: null }],
      }),
    ).toThrow(BlueprintError);
  });

  it('accepts a valid staircase entry', () => {
    expect(() =>
      validateBlueprint({
        ...VALID_BP,
        staircases: [{ x: 1, z: 0, facing: 'north', direction: 'up', targetId: 'floor_2' }],
      }),
    ).not.toThrow();
  });

  it('includes descriptive info in error message', () => {
    try {
      validateBlueprint({ ...VALID_BP, version: 99 });
    } catch (e) {
      expect(e).toBeInstanceOf(BlueprintError);
      expect((e as Error).message).toContain('test_room');
      expect((e as Error).message).toContain('version');
    }
  });
});

// ── Round-trip serialization ──────────────────────────────────────────────

describe('serializeBlueprint / parseBlueprint', () => {
  it('round-trips a blueprint unchanged', () => {
    const json = serializeBlueprint(VALID_BP);
    const parsed = parseBlueprint(json);
    expect(parsed).toEqual(VALID_BP);
  });

  it('produces valid JSON', () => {
    const json = serializeBlueprint(VALID_BP);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBlueprint('{not valid json')).toThrow(BlueprintError);
  });

  it('throws when JSON parses but fails validation', () => {
    const broken = JSON.stringify({ ...VALID_BP, version: 0 });
    expect(() => parseBlueprint(broken)).toThrow(BlueprintError);
  });
});

// ── Renderer accuracy ─────────────────────────────────────────────────────

/** Minimal PhysicsWorld mock — records calls, returns stub bodies. */
function makeMockPhysics() {
  const bodies: object[] = [];
  return {
    createStaticBox: vi.fn((_pos: THREE.Vector3, _half: THREE.Vector3) => {
      const body = { __id: bodies.length };
      bodies.push(body);
      return body;
    }),
    rapierWorld: {
      removeRigidBody: vi.fn(),
    },
    bodies,
  };
}

describe('renderBlueprint', () => {
  it('returns a group with at least one mesh', () => {
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);
    expect(room.group).toBeInstanceOf(THREE.Group);
    expect(room.group.children.length).toBeGreaterThan(0);
  });

  it('creates one door trigger per door entry', () => {
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);
    expect(room.doorTriggers).toHaveLength(VALID_BP.doors.length);
  });

  it('places a wall mesh at the correct world-space X/Z', () => {
    // VALID_BP has a wall at grid (0,0) in a 3×3 room with cellSize=2
    // Expected world position: x = (0+0.5)*2 - (3*2)/2 = 1 - 3 = -2
    //                          z = (0+0.5)*2 - (3*2)/2 = 1 - 3 = -2
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);

    const wallMeshes = room.group.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.BoxGeometry,
    );
    const positions = wallMeshes.map((m) => ({ x: m.position.x, z: m.position.z }));
    expect(positions).toContainEqual({ x: -2, z: -2 });
  });

  it('creates a static physics body for each wall tile', () => {
    const physics = makeMockPhysics();
    renderBlueprint(VALID_BP, physics as never);
    // 5 wall tiles + 1 floor + 1 interactable (bookshelf) = 7 bodies
    expect(physics.createStaticBox).toHaveBeenCalledTimes(7);
  });

  it('dispose() removes all rigid bodies from the physics world', () => {
    const physics = makeMockPhysics();
    const room = renderBlueprint(VALID_BP, physics as never);
    room.dispose();
    expect(physics.rapierWorld.removeRigidBody).toHaveBeenCalledTimes(physics.bodies.length);
  });
});

// ── Door trigger detection ────────────────────────────────────────────────

describe('isInsideTrigger', () => {
  const center = { x: 0, z: -5 };
  const half = { x: 0.8, z: 0.9 };

  it('detects a player at the trigger centre', () => {
    expect(isInsideTrigger(0, -5, center, half)).toBe(true);
  });

  it('detects a player within the half-extents', () => {
    expect(isInsideTrigger(0.5, -5.5, center, half)).toBe(true);
  });

  it('rejects a player outside the X extent', () => {
    expect(isInsideTrigger(1.5, -5, center, half)).toBe(false);
  });

  it('rejects a player outside the Z extent', () => {
    expect(isInsideTrigger(0, -6.5, center, half)).toBe(false);
  });

  it('accepts a player clearly within the boundary', () => {
    expect(isInsideTrigger(0.7, -5, center, half)).toBe(true);  // just inside X
    expect(isInsideTrigger(0, -4.5, center, half)).toBe(true);  // clearly inside Z
  });
});

// ── Coordinate helpers ────────────────────────────────────────────────────

describe('cellToWorld', () => {
  it('maps centre cell of a 3×3 room to origin', () => {
    const pos = cellToWorld(1, 1, VALID_BP);
    expect(pos.x).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(0);
  });

  it('maps cell (0,0) of a 3×3 room to (-2, -2)', () => {
    const pos = cellToWorld(0, 0, VALID_BP);
    expect(pos.x).toBeCloseTo(-2);
    expect(pos.z).toBeCloseTo(-2);
  });
});

describe('doorSpawnPosition', () => {
  it('insets south-facing door northward (decreasing z)', () => {
    const door = VALID_BP.doors[0]; // facing south at (1, 2)
    const sp = doorSpawnPosition(door, VALID_BP);
    // door cell world z = (2+0.5)*2 - 3 = 2
    // inset north: z - 2 = 0
    expect(sp.z).toBeCloseTo(0);
  });

  it('insets north-facing door southward (increasing z)', () => {
    const northDoor = { x: 1, z: 0, facing: 'north' as const, targetId: null };
    const sp = doorSpawnPosition(northDoor, VALID_BP);
    // door cell world z = (0+0.5)*2 - 3 = -2
    // inset south: z + 2 = 0
    expect(sp.z).toBeCloseTo(0);
  });
});
