// tests/levels/greenhouseGenerator.test.ts

import { describe, it, expect } from 'vitest';
import { generateGreenhouse } from '@/levels/GreenhouseGenerator';

describe('generateGreenhouse', () => {
  it('returns a DungeonPlan with the greenhouse_interior room', () => {
    const plan = generateGreenhouse(12345);
    expect(plan.startRoomId).toBe('greenhouse_interior');
    expect(plan.rooms.has('greenhouse_interior')).toBe(true);
  });

  it('room has correct dimensions (11×11)', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    expect(room.width).toBe(11);
    expect(room.depth).toBe(11);
  });

  it('room has a south exit door with targetId null', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const exitDoor = room.doors.find(d => d.facing === 'south' && d.targetId === null);
    expect(exitDoor).toBeDefined();
  });

  it('has exactly one greenhouse_orb interactable at the centre', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const orbs = room.interactables.filter(i => i.type === 'greenhouse_orb');
    expect(orbs.length).toBe(1);
    expect(orbs[0].x).toBe(5);
    expect(orbs[0].z).toBe(5);
  });

  it('has two lectern interactables', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const lecterns = room.interactables.filter(i => i.type === 'lectern');
    expect(lecterns.length).toBe(2);
  });

  it('has exactly 3 slime spawns', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const slimes = room.spawns.filter(s => s.type === 'slime');
    expect(slimes.length).toBe(3);
  });

  it('all slime spawns are within the circular floor area', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const CX = 5, CZ = 5, R2 = 16;
    for (const spawn of room.spawns) {
      const dx = spawn.x - CX;
      const dz = spawn.z - CZ;
      expect(dx * dx + dz * dz).toBeLessThanOrEqual(R2);
    }
  });

  it('centre cell (5,5) is NOT listed as a wall tile', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const centreWall = room.tiles.find(t => t.x === 5 && t.z === 5 && t.type === 'wall');
    expect(centreWall).toBeUndefined();
  });

  it('corner cells are wall tiles (outside circle)', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    const cornerWall = room.tiles.find(t => t.x === 0 && t.z === 0 && t.type === 'wall');
    expect(cornerWall).toBeDefined();
  });

  it('has grass floorType', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    expect(room.floorType).toBe('grass');
  });

  it('has no staircases', () => {
    const room = generateGreenhouse(0).rooms.get('greenhouse_interior')!;
    expect(room.staircases.length).toBe(0);
  });

  it('is deterministic — same seed gives identical plans', () => {
    const a = generateGreenhouse(9999);
    const b = generateGreenhouse(9999);
    const ra = a.rooms.get('greenhouse_interior')!;
    const rb = b.rooms.get('greenhouse_interior')!;
    expect(ra.tiles.length).toBe(rb.tiles.length);
    expect(ra.spawns.length).toBe(rb.spawns.length);
  });
});
