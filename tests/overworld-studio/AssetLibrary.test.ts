/**
 * AssetLibrary.test.ts
 *
 * Unit tests for the AssetLibrary data model.
 * Written BEFORE the implementation (TDD red phase).
 *
 * Run: npx vitest run tests/overworld-studio/AssetLibrary.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetLibrary, type LibraryEntry, type AssetType } from '@/overworld-studio/AssetLibrary';

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

    expect(lib.getByType('building')).toHaveLength(2);
    expect(lib.getByType('dungeon')).toHaveLength(1);
    expect(lib.getByType('settlement')).toHaveLength(1);
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

  it('getAll() returns entries sorted by createdAt descending (newest first)', () => {
    lib.add(makeEntry({ id: 'old', createdAt: 100 }));
    lib.add(makeEntry({ id: 'new', createdAt: 500 }));
    lib.add(makeEntry({ id: 'mid', createdAt: 300 }));
    const ids = lib.getAll().map(e => e.id);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('size getter returns entry count', () => {
    expect(lib.size).toBe(0);
    lib.add(makeEntry({ id: 'e1' }));
    lib.add(makeEntry({ id: 'e2' }));
    expect(lib.size).toBe(2);
  });

});
