/**
 * customLocationOverrides.test.ts — AL-4
 * Asset Library dungeon/cave entries override placed overworld entrances.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readCustomLocationOverrides,
  applyCustomLocationOverrides,
} from '@/world/customLocationOverrides';
import type { DungeonEntry } from '@/world/WorldData';

const KEY = 'ttt_asset_library';

function entry(id: number): DungeonEntry {
  return {
    id,
    seed: 1000 + id,
    type: 'cave',
    col: 10 + id,
    row: 20 + id,
    name: `Generated ${id}`,
    floorCount: 3,
    discovered: false,
    siteFamily: 'beast_lair',
    rewardBias: ['beast_capture_opportunity'],
    eliteRecruitOpportunity: true,
    defenseIntelSource: false,
  };
}

function writeLibrary(entries: unknown[]): void {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, entries }));
}

describe('custom location overrides', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('returns nothing when the library is empty', () => {
    expect(readCustomLocationOverrides().size).toBe(0);
    const dungeons = [entry(1)];
    expect(applyCustomLocationOverrides(dungeons)).toEqual([]);
    expect(dungeons[0].name).toBe('Generated 1');
  });

  it('overrides name/type/seed/floorCount by tag', () => {
    writeLibrary([{
      id: 'library_dungeon_1',
      type: 'dungeon',
      name: 'Hand-authored Crypt',
      seed: 7,
      createdAt: 1,
      tags: ['dungeon:2'],
      isCustom: true,
      thumbnail: null,
      data: { name: 'The Sunken Crypt', type: 'crypt', seed: 999, floorCount: 8 },
    }]);

    const dungeons = [entry(1), entry(2)];
    expect(applyCustomLocationOverrides(dungeons)).toEqual([2]);

    expect(dungeons[1].name).toBe('The Sunken Crypt');
    expect(dungeons[1].type).toBe('crypt');
    expect(dungeons[1].seed).toBe(999);
    expect(dungeons[1].floorCount).toBe(8);
    // Placement untouched
    expect(dungeons[1].col).toBe(12);
    expect(dungeons[1].row).toBe(22);
    // Other entries untouched
    expect(dungeons[0].name).toBe('Generated 1');
  });

  it('resolves the target via data.dungeonId and a cave-typed entry', () => {
    writeLibrary([{
      id: 'library_cave_1',
      type: 'cave',
      name: 'Custom Cave',
      seed: 5,
      createdAt: 1,
      tags: [],
      isCustom: true,
      thumbnail: null,
      data: { dungeonId: 1, name: 'Whisper Hollow' },
    }]);

    const dungeons = [entry(1)];
    expect(applyCustomLocationOverrides(dungeons)).toEqual([1]);
    expect(dungeons[0].name).toBe('Whisper Hollow');
    // Untouched fields keep generated values
    expect(dungeons[0].type).toBe('cave');
    expect(dungeons[0].floorCount).toBe(3);
  });

  it('ignores non-custom, untargeted, and invalid-field entries', () => {
    writeLibrary([
      {
        id: 'a', type: 'dungeon', name: 'Not custom', seed: 1, createdAt: 1,
        tags: ['dungeon:1'], isCustom: false, thumbnail: null,
        data: { name: 'Should not apply' },
      },
      {
        id: 'b', type: 'dungeon', name: 'No target', seed: 1, createdAt: 1,
        tags: [], isCustom: true, thumbnail: null,
        data: { name: 'Orphan' },
      },
      {
        id: 'c', type: 'dungeon', name: 'Bad fields', seed: 1, createdAt: 1,
        tags: ['dungeon:1'], isCustom: true, thumbnail: null,
        data: { name: '   ', type: 'not-a-type', floorCount: -4 },
      },
    ]);

    expect(readCustomLocationOverrides().size).toBe(0);
    const dungeons = [entry(1)];
    expect(applyCustomLocationOverrides(dungeons)).toEqual([]);
    expect(dungeons[0].name).toBe('Generated 1');
  });

  it('survives corrupt library JSON', () => {
    localStorage.setItem(KEY, 'not-json{');
    expect(readCustomLocationOverrides().size).toBe(0);
    expect(() => applyCustomLocationOverrides([entry(1)])).not.toThrow();
  });
});