/**
 * AssetLibrary.test.ts
 *
 * Unit tests for the AssetLibrary data model.
 * Written BEFORE the implementation (TDD red phase).
 *
 * Run: npx vitest run tests/overworld-studio/AssetLibrary.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetLibrary, type LibraryEntry } from '@/overworld-studio/AssetLibrary';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id:        overrides.id        ?? 'entry_001',
    type:      overrides.type      ?? 'building',
    name:      overrides.name      ?? 'Test Inn',
    seed:      overrides.seed      ?? 42,
    createdAt: overrides.createdAt ?? 1000,
    tags:      overrides.tags      ?? ['inn', 'human'],
    isCustom:  overrides.isCustom  ?? false,
    data:      overrides.data      ?? { rooms: {}, startRoomId: 'r0', seed: 42 },
    thumbnail: overrides.thumbnail ?? null,
  };
}

// Mock localStorage (not available in vitest Node environment)
const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
});

describe('AssetLibrary importEntry()', () => {
  it('imports a JSON-safe snapshot as a custom entry with a fresh id', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    const imported = lib.importEntry({
      id: 'external_settlement',
      type: 'settlement',
      name: 'Imported Settlement',
      seed: 321,
      createdAt: 1,
      tags: ['type:town'],
      isCustom: false,
      thumbnail: null,
      data: { wards: [{ id: 'w1' }] },
    });

    expect(imported).not.toBeNull();
    expect(imported?.id).not.toBe('external_settlement');
    expect(imported?.type).toBe('settlement');
    expect(imported?.name).toBe('Imported Settlement');
    expect(imported?.seed).toBe(321);
    expect(imported?.isCustom).toBe(true);
    expect(lib.size).toBe(1);
  });

  it('decodes Map-based payloads when importing exported snapshots', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    const imported = lib.importEntry({
      id: 'external_dungeon',
      type: 'dungeon',
      name: 'Imported Dungeon',
      seed: 99,
      createdAt: 1,
      tags: ['dtype:generic'],
      isCustom: true,
      thumbnail: null,
      data: {
        rooms: {
          __tttType: 'Map',
          entries: [['room_0', { id: 'room_0', width: 7 }]],
        },
        startRoomId: 'room_0',
        seed: 99,
      },
    });

    expect(imported).not.toBeNull();
    const rooms = (imported?.data as { rooms: Map<string, unknown> }).rooms;
    expect(rooms).toBeInstanceOf(Map);
    expect(rooms.get('room_0')).toEqual({ id: 'room_0', width: 7 });
  });

  it('rejects invalid snapshots', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    expect(lib.importEntry({ foo: 'bar' })).toBeNull();
    expect(lib.importEntry(null)).toBeNull();
    expect(lib.size).toBe(0);
  });
});

describe('AssetLibrary rename()', () => {
  it('renames an existing entry and marks it custom', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', name: 'Old Name', isCustom: false }));

    const updated = lib.rename('e1', 'New Name');

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('New Name');
    expect(updated?.isCustom).toBe(true);
    expect(lib.getAll()[0]?.name).toBe('New Name');
  });

  it('rejects empty rename values', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', name: 'Original' }));

    expect(lib.rename('e1', '   ')).toBeNull();
    expect(lib.getAll()[0]?.name).toBe('Original');
  });

  it('returns null when renaming a missing entry', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    expect(lib.rename('missing', 'Whatever')).toBeNull();
  });
});

describe('AssetLibrary pinToLocation() / unpinFromLocation()', () => {
  it('adds a type-prefixed location tag and marks the entry custom', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', type: 'room', tags: [], isCustom: false }));

    const updated = lib.pinToLocation('e1', 'dungeon-42/room-3');

    expect(updated).not.toBeNull();
    expect(updated?.tags).toContain('room:dungeon-42/room-3');
    expect(updated?.isCustom).toBe(true);
    expect(lib.getAll()[0]?.tags).toContain('room:dungeon-42/room-3');
  });

  it('is idempotent — pinning the same location twice does not duplicate the tag', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', type: 'dungeon', tags: [] }));

    lib.pinToLocation('e1', 'loc-1');
    const updated = lib.pinToLocation('e1', 'loc-1');

    expect(updated?.tags.filter(t => t === 'dungeon:loc-1')).toHaveLength(1);
  });

  it('trims whitespace and rejects empty location ids', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', tags: [] }));

    expect(lib.pinToLocation('e1', '   ')).toBeNull();
    expect(lib.getAll()[0]?.tags).toEqual([]);
  });

  it('returns null when pinning a missing entry', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    expect(lib.pinToLocation('missing', 'loc-1')).toBeNull();
  });

  it('unpinFromLocation removes only the matching tag', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', type: 'cave', tags: ['biome:stone'] }));
    lib.pinToLocation('e1', 'cave-7');

    const updated = lib.unpinFromLocation('e1', 'cave-7');

    expect(updated?.tags).not.toContain('cave:cave-7');
    expect(updated?.tags).toContain('biome:stone');
  });

  it('unpinFromLocation is a no-op when the tag is not present', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    lib.add(makeEntry({ id: 'e1', tags: ['inn', 'human'] }));

    const updated = lib.unpinFromLocation('e1', 'not-pinned');

    expect(updated?.tags).toEqual(['inn', 'human']);
  });

  it('unpinFromLocation returns null for a missing entry', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();
    expect(lib.unpinFromLocation('missing', 'loc-1')).toBeNull();
  });
});

describe('AssetLibrary duplicate()', () => {
  it('duplicates an entry with a fresh id, later createdAt, and copied data', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    const original: LibraryEntry = {
      id: 'settlement_1',
      type: 'settlement',
      name: 'Settlement #1',
      seed: 123,
      createdAt: 1000,
      tags: ['type:village', 'faction:human'],
      isCustom: false,
      data: { wards: [{ id: 'a' }], meta: { size: 12 } },
      thumbnail: 'data:image/png;base64,abc',
    };

    lib.add(original);
    const copy = lib.duplicate(original.id);

    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(original.id);
    expect(copy?.name).toBe('Settlement #1 Copy');
    expect(copy?.createdAt).toBeGreaterThanOrEqual(original.createdAt);
    expect(copy?.seed).toBe(original.seed);
    expect(copy?.type).toBe(original.type);
    expect(copy?.isCustom).toBe(true);
    expect(lib.size).toBe(2);

    const all = lib.getAll();
    expect(all.some(e => e.id === original.id)).toBe(true);
    expect(all.some(e => e.id === copy?.id)).toBe(true);

    const copiedData = copy?.data as { wards: Array<{ id: string }>; meta: { size: number } };
    expect(copiedData.meta.size).toBe(12);
    expect(copiedData.wards[0]?.id).toBe('a');
  });

  it('deep-copies encoded data structures like Map when duplicating', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    const rooms = new Map<string, unknown>([
      ['room_0', { id: 'room_0', width: 7 }],
    ]);

    lib.add({
      id: 'dungeon_1',
      type: 'dungeon',
      name: 'Dungeon #1',
      seed: 77,
      createdAt: 1000,
      tags: ['dtype:generic'],
      isCustom: false,
      data: { rooms, startRoomId: 'room_0' },
      thumbnail: null,
    });

    const copy = lib.duplicate('dungeon_1');
    expect(copy).not.toBeNull();

    const copiedRooms = (copy?.data as { rooms: Map<string, unknown> }).rooms;
    expect(copiedRooms).toBeInstanceOf(Map);
    expect(copiedRooms).not.toBe(rooms);
    expect(copiedRooms.get('room_0')).toEqual({ id: 'room_0', width: 7 });
  });

  it('returns null when duplicating a missing entry', () => {
    const lib = new AssetLibrary('ttt_asset_library_test');
    lib.clear();

    expect(lib.duplicate('missing')).toBeNull();
    expect(lib.size).toBe(0);
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AssetLibrary', () => {

  let lib: AssetLibrary;

  beforeEach(() => {
    // Fresh library + clear mock store each test
    Object.keys(_store).forEach(k => delete _store[k]);
    lib = new AssetLibrary('test_library');
  });

  it('starts empty', () => {
    expect(lib.getAll()).toHaveLength(0);
  });

  it('add() stores an entry and getAll() returns it', () => {
    lib.add(makeEntry({ id: 'e1', name: 'My Inn' }));
    const all = lib.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('My Inn');
  });

  it('add() with same id overwrites (upsert)', () => {
    lib.add(makeEntry({ id: 'e1', name: 'Old Name' }));
    lib.add(makeEntry({ id: 'e1', name: 'New Name' }));
    expect(lib.getAll()).toHaveLength(1);
    expect(lib.getAll()[0]?.name).toBe('New Name');
  });

  it('remove(id) deletes the entry', () => {
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    lib.remove('e1');
    const all = lib.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('e2');
  });

  it('remove() on non-existent id is a no-op', () => {
    lib.add(makeEntry({ id: 'e1' }));
    expect(() => lib.remove('does_not_exist')).not.toThrow();
    expect(lib.getAll()).toHaveLength(1);
  });

  it('getByType() returns only entries of that type', () => {
    lib.add(makeEntry({ id: 'b1', type: 'building' }));
    lib.add(makeEntry({ id: 'd1', type: 'dungeon' }));
    lib.add(makeEntry({ id: 'b2', type: 'building' }));
    lib.add(makeEntry({ id: 's1', type: 'settlement' }));
    lib.add(makeEntry({ id: 'r1', type: 'room', name: 'Room Layout 1' }));
    lib.add(makeEntry({ id: 'n1', type: 'npc', name: 'Aldric (merchant)' }));

    expect(lib.getByType('building')).toHaveLength(2);
    expect(lib.getByType('dungeon')).toHaveLength(1);
    expect(lib.getByType('settlement')).toHaveLength(1);
    expect(lib.getByType('room')).toHaveLength(1);
    expect(lib.getByType('npc')).toHaveLength(1);
    expect(lib.getByType('cave')).toHaveLength(0);
  });

  it('search() finds by name substring (case-insensitive)', () => {
    lib.add(makeEntry({ id: 'e1', name: 'The Grand Inn' }));
    lib.add(makeEntry({ id: 'e2', name: 'Orcish Forge' }));
    lib.add(makeEntry({ id: 'e3', name: 'Elven INN of Whispers' }));

    const results = lib.search('inn');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual(['e1', 'e3']);
  });

  it('search() with empty string returns all', () => {
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    expect(lib.search('')).toHaveLength(2);
  });

  it('clear() removes all entries', () => {
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    lib.clear();
    expect(lib.getAll()).toHaveLength(0);
  });

  it('toJSON() returns a plain JSON-serialisable object (no Maps/Sets)', () => {
    lib.add(makeEntry({ id: 'e1', data: { rooms: { r0: {} }, startRoomId: 'r0', seed: 1 } }));
    const json = lib.toJSON();
    // Must round-trip through JSON.stringify without throwing
    expect(() => JSON.stringify(json)).not.toThrow();
    const stringified = JSON.stringify(json);
    const parsed = JSON.parse(stringified);
    expect(parsed).toEqual(json);
  });

  it('fromJSON() restores entries from a serialised snapshot', () => {
    lib.add(makeEntry({ id: 'e1', name: 'Saved Inn' }));
    lib.add(makeEntry({ id: 'e2', name: 'Dark Dungeon', type: 'dungeon' }));
    const snapshot = lib.toJSON();

    const lib2 = new AssetLibrary('test_library_2');
    lib2.fromJSON(snapshot);
    expect(lib2.getAll()).toHaveLength(2);
    expect(lib2.getAll().find(e => e.id === 'e1')?.name).toBe('Saved Inn');
  });

  it('persists to localStorage on add()', () => {
    lib.add(makeEntry({ id: 'e1', name: 'Persisted' }));
    // A new instance should reload from localStorage
    const lib2 = new AssetLibrary('test_library');
    expect(lib2.getAll()).toHaveLength(1);
    expect(lib2.getAll()[0]?.name).toBe('Persisted');
  });

  it('persists to localStorage on remove()', () => {
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    lib.remove('e1');
    const lib2 = new AssetLibrary('test_library');
    expect(lib2.getAll()).toHaveLength(1);
    expect(lib2.getAll()[0]?.id).toBe('e2');
  });

  it('round-trips Map-based dungeon data through localStorage persistence', () => {
    const dungeonData = {
      startRoomId: 'r0',
      seed: 42,
      rooms: new Map([
        ['r0', { id: 'r0', floor: 0, width: 8, depth: 8 }],
        ['r1', { id: 'r1', floor: 1, width: 6, depth: 6 }],
      ]),
    };

    lib.add(makeEntry({
      id: 'd1',
      type: 'dungeon',
      name: 'Mapped Dungeon',
      data: dungeonData,
    }));

    const lib2 = new AssetLibrary('test_library');
    const restored = lib2.getAll()[0]?.data as any;

    expect(restored.rooms).toBeInstanceOf(Map);
    expect(restored.rooms.get('r0')?.id).toBe('r0');
    expect(restored.rooms.get('r1')?.floor).toBe(1);
  });

  it('exportEntry() returns a JSON-safe snapshot for Map-based data', () => {
    lib.add(makeEntry({
      id: 'd1',
      type: 'dungeon',
      data: {
        rooms: new Map([['r0', { id: 'r0' }]]),
        startRoomId: 'r0',
        seed: 7,
      },
    }));

    const exported = lib.exportEntry('d1') as any;
    expect(exported).toBeTruthy();
    expect(exported.data.rooms.__tttType).toBe('Map');
    expect(exported.data.rooms.entries[0][0]).toBe('r0');
    expect(() => JSON.stringify(exported)).not.toThrow();
  });

  it('getAll() returns entries sorted by createdAt descending (newest first)', () => {
    lib.add(makeEntry({ id: 'old', createdAt: 100 }));
    lib.add(makeEntry({ id: 'new', createdAt: 500 }));
    lib.add(makeEntry({ id: 'mid', createdAt: 300 }));
    const ids = lib.getAll().map(e => e.id);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('exportCustomEntries() returns only custom entries, oldest-first, JSON-safe', () => {
    lib.add(makeEntry({ id: 'proc', isCustom: false, createdAt: 100 }));
    lib.add(makeEntry({ id: 'custom_b', isCustom: true, createdAt: 400, type: 'room' }));
    lib.add(makeEntry({
      id: 'custom_a',
      isCustom: true,
      createdAt: 200,
      type: 'dungeon',
      data: { rooms: new Map([['r0', { id: 'r0' }]]), startRoomId: 'r0', seed: 3 },
    }));

    const exported = lib.exportCustomEntries();
    expect(exported.map(e => e.id)).toEqual(['custom_a', 'custom_b']);
    expect((exported[0]!.data as any).rooms.__tttType).toBe('Map');
    expect(() => JSON.stringify(exported)).not.toThrow();
  });

  it('exportCustomEntries() can be filtered by asset type', () => {
    lib.add(makeEntry({ id: 'c_room', isCustom: true, type: 'room', createdAt: 1 }));
    lib.add(makeEntry({ id: 'c_bldg', isCustom: true, type: 'building', createdAt: 2 }));
    lib.add(makeEntry({ id: 'p_room', isCustom: false, type: 'room', createdAt: 3 }));

    expect(lib.exportCustomEntries(['room']).map(e => e.id)).toEqual(['c_room']);
    expect(lib.exportCustomEntries(['room', 'building']).map(e => e.id)).toEqual(['c_room', 'c_bldg']);
    expect(lib.exportCustomEntries([]).map(e => e.id)).toEqual(['c_room', 'c_bldg']);
  });

  it('size getter returns entry count', () => {
    expect(lib.size).toBe(0);
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    expect(lib.size).toBe(2);
  });

});
