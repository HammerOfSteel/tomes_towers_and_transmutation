/**
 * customRoomOverrides.test.ts — AL-4
 * Asset Library room layouts override generated dungeon rooms.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateDungeon } from '@/levels/DungeonGenerator';
import { readCustomRoomOverrides } from '@/levels/customRoomOverrides';
import type { Blueprint } from '@/levels/blueprint';

const SEED = 0x1234_5678;
const KEY = 'ttt_asset_library';

function makeLayout(id: string, width: number, depth: number): Blueprint {
  return {
    id,
    version: 1,
    width,
    depth,
    cellSize: 2,
    wallHeight: 3,
    tiles: [{ x: 0, z: 0, type: 'pillar' }],
    doors: [],
    staircases: [],
    spawns: [],
    interactables: [{ x: 1, z: 1, type: 'chest' }],
    floor: 0,
    floorType: 'wood',
  };
}

function writeLibrary(entries: unknown[]): void {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, entries }));
}

describe('custom room overrides', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('returns an empty map when the library is empty', () => {
    expect(readCustomRoomOverrides().size).toBe(0);
  });

  it('replaces a generated room layout when footprint matches', () => {
    const baseline = generateDungeon(SEED, 2);
    const target = baseline.rooms.get(baseline.startRoomId)!;

    writeLibrary([{
      id: 'library_room_1',
      type: 'room',
      name: 'Custom Start',
      seed: SEED,
      createdAt: 1,
      tags: [`room:${baseline.startRoomId}`, 'source:dungeon'],
      isCustom: true,
      thumbnail: null,
      data: makeLayout('custom_start', target.width, target.depth),
    }]);

    const plan = generateDungeon(SEED, 2);
    const room = plan.rooms.get(plan.startRoomId)!;

    expect(room.id).toBe(plan.startRoomId);
    expect(room.floorType).toBe('wood');
    expect(room.interactables).toHaveLength(1);
    expect(room.interactables[0].type).toBe('chest');
    // Door wiring preserved from the generator
    expect(room.doors.map(d => d.targetId)).toEqual(target.doors.map(d => d.targetId));
  });

  it('ignores overrides with a mismatched footprint', () => {
    const baseline = generateDungeon(SEED, 2);
    const target = baseline.rooms.get(baseline.startRoomId)!;

    writeLibrary([{
      id: 'library_room_2',
      type: 'room',
      name: 'Wrong Size',
      seed: SEED,
      createdAt: 1,
      tags: [`room:${baseline.startRoomId}`],
      isCustom: true,
      thumbnail: null,
      data: makeLayout('too_big', target.width + 3, target.depth + 3),
    }]);

    const plan = generateDungeon(SEED, 2);
    expect(plan.rooms.get(plan.startRoomId)!.floorType).toBe(target.floorType);
  });

  it('ignores non-custom and malformed entries', () => {
    const baseline = generateDungeon(SEED, 2);

    writeLibrary([
      {
        id: 'library_room_3',
        type: 'room',
        name: 'Not Custom',
        seed: SEED,
        createdAt: 1,
        tags: [`room:${baseline.startRoomId}`],
        isCustom: false,
        thumbnail: null,
        data: makeLayout('not_custom', 4, 4),
      },
      {
        id: 'library_room_4',
        type: 'room',
        name: 'Broken',
        seed: SEED,
        createdAt: 1,
        tags: [`room:${baseline.startRoomId}`],
        isCustom: true,
        thumbnail: null,
        data: { id: 'broken', version: 99, width: 'x' },
      },
    ]);

    expect(readCustomRoomOverrides().size).toBe(0);
    expect(() => generateDungeon(SEED, 2)).not.toThrow();
  });

  it('survives corrupt library JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readCustomRoomOverrides().size).toBe(0);
    expect(() => generateDungeon(SEED, 2)).not.toThrow();
  });
});