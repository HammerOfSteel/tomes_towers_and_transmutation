/**
 * WorldPackage.test.ts — OW-F4 / AL-4
 * World package validation + custom asset import round-trip.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetLibrary } from '@/overworld-studio/AssetLibrary';
import {
  isWorldPackage,
  summariseWorldPackage,
  importWorldPackage,
  WORLD_PACKAGE_KIND,
  WORLD_PACKAGE_VERSION,
} from '@/overworld-studio/WorldPackage';

const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
});

function makePackage(customAssets: unknown[] = []) {
  return {
    version: WORLD_PACKAGE_VERSION,
    kind: WORLD_PACKAGE_KIND,
    exportedAt: '2026-01-01T00:00:00.000Z',
    source: 'overworld-studio',
    seed: 1234,
    settlements: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    dungeons: [{ x: 5, y: 6 }],
    customAssets,
  };
}

function customRoomSnapshot(id: string) {
  return {
    id,
    type: 'room',
    name: `Custom ${id}`,
    seed: 99,
    createdAt: 1,
    tags: [`room:${id}`],
    isCustom: true,
    thumbnail: null,
    data: { id, width: 7, depth: 7 },
  };
}

describe('isWorldPackage', () => {
  it('accepts a valid v1 package', () => {
    expect(isWorldPackage(makePackage())).toBe(true);
  });

  it('rejects wrong kind, version, or shape', () => {
    expect(isWorldPackage({ ...makePackage(), kind: 'other' })).toBe(false);
    expect(isWorldPackage({ ...makePackage(), version: 99 })).toBe(false);
    expect(isWorldPackage({ ...makePackage(), seed: 'nope' })).toBe(false);
    expect(isWorldPackage(null)).toBe(false);
    expect(isWorldPackage([])).toBe(false);
  });
});

describe('summariseWorldPackage', () => {
  it('counts settlements, dungeons and custom assets', () => {
    const s = summariseWorldPackage(makePackage([customRoomSnapshot('r0')]));
    expect(s).toEqual({ seed: 1234, settlements: 2, dungeons: 1, customAssets: 1 });
  });

  it('tolerates missing arrays', () => {
    const s = summariseWorldPackage({ seed: 7 });
    expect(s).toEqual({ seed: 7, settlements: 0, dungeons: 0, customAssets: 0 });
  });
});

describe('importWorldPackage', () => {
  let lib: AssetLibrary;

  beforeEach(() => {
    Object.keys(_store).forEach(k => delete _store[k]);
    lib = new AssetLibrary('world_package_test_library');
  });

  it('restores custom assets into the library', () => {
    const result = importWorldPackage(
      makePackage([customRoomSnapshot('room_0'), customRoomSnapshot('room_1')]),
      lib,
    );

    expect(result.ok).toBe(true);
    expect(result.summary?.seed).toBe(1234);
    expect(result.imported).toHaveLength(2);
    expect(lib.size).toBe(2);
    // Imported entries are always custom and get fresh ids
    for (const entry of lib.getAll()) {
      expect(entry.isCustom).toBe(true);
      expect(entry.type).toBe('room');
    }
  });

  it('accepts a raw JSON string', () => {
    const result = importWorldPackage(
      JSON.stringify(makePackage([customRoomSnapshot('room_0')])),
      lib,
    );
    expect(result.ok).toBe(true);
    expect(lib.size).toBe(1);
  });

  it('rejects invalid JSON and non-packages without importing anything', () => {
    expect(importWorldPackage('{broken', lib).ok).toBe(false);
    expect(importWorldPackage({ hello: 'world' }, lib).ok).toBe(false);
    expect(importWorldPackage(null, lib).ok).toBe(false);
    expect(lib.size).toBe(0);
  });

  it('skips malformed custom asset snapshots but still succeeds', () => {
    const result = importWorldPackage(
      makePackage([customRoomSnapshot('room_0'), { nope: true }, null]),
      lib,
    );
    expect(result.ok).toBe(true);
    expect(result.imported).toHaveLength(1);
    expect(lib.size).toBe(1);
  });

  it('handles a package with no custom assets', () => {
    const result = importWorldPackage(makePackage(), lib);
    expect(result.ok).toBe(true);
    expect(result.imported).toHaveLength(0);
    expect(lib.size).toBe(0);
  });
});