/**
 * towerVersioning.test.ts
 *
 * Tests for the pure tower version-control logic.
 * No DOM, no THREE.js — all state is injected.
 */
import { describe, it, expect } from 'vitest';
import { TOWER_VERSION_KEY, TOWER_VERSION_MAX, GRID_CX, gridToWorld, worldToGrid, loadVersions, saveVersions, createVersion, restoreVersion, deleteVersion, } from '@/world-editor/towerVersioning';
// ── Fake storage ──────────────────────────────────────────────────────────────
function makeStorage(initial = {}) {
    const store = { ...initial };
    return {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = v; },
    };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function makeItem(type = 'barrel', x = 0, z = 0) {
    return { type: type, x, z, rotation: 0 };
}
function makeFloorMap(floors) {
    return new Map(Object.entries(floors).map(([k, v]) => [parseInt(k), v]));
}
// ── Coordinate helpers ─────────────────────────────────────────────────────────
describe('gridToWorld / worldToGrid', () => {
    it('centre cell (8) maps to world 0', () => {
        expect(gridToWorld(GRID_CX)).toBe(0);
    });
    it('cell 0 maps to world -8', () => {
        expect(gridToWorld(0)).toBe(-8);
    });
    it('cell 16 maps to world +8', () => {
        expect(gridToWorld(16)).toBe(8);
    });
    it('worldToGrid is inverse of gridToWorld for integer cells', () => {
        for (let g = 0; g <= 16; g++) {
            expect(worldToGrid(gridToWorld(g))).toBe(g);
        }
    });
    it('gridToWorld → worldToGrid round-trip for scatter entry x=4, z=11', () => {
        expect(worldToGrid(gridToWorld(4))).toBe(4);
        expect(worldToGrid(gridToWorld(11))).toBe(11);
    });
});
// ── loadVersions / saveVersions ───────────────────────────────────────────────
describe('loadVersions', () => {
    it('returns empty array when storage is empty', () => {
        const storage = makeStorage();
        expect(loadVersions(storage)).toEqual([]);
    });
    it('returns empty array when stored JSON is corrupt', () => {
        const storage = makeStorage({ [TOWER_VERSION_KEY]: 'not-json{{' });
        expect(loadVersions(storage)).toEqual([]);
    });
    it('returns parsed versions when storage has valid data', () => {
        const versions = [
            { version: 1, label: 'v1', savedAt: 1000, floors: { 0: [] } },
        ];
        const storage = makeStorage({ [TOWER_VERSION_KEY]: JSON.stringify(versions) });
        expect(loadVersions(storage)).toEqual(versions);
    });
});
describe('saveVersions', () => {
    it('persists versions so loadVersions can read them back', () => {
        const storage = makeStorage();
        const versions = [
            { version: 1, label: 'test', savedAt: 999, floors: {} },
        ];
        saveVersions(storage, versions);
        expect(loadVersions(storage)).toEqual(versions);
    });
});
// ── createVersion ─────────────────────────────────────────────────────────────
describe('createVersion', () => {
    it('creates version 1 when no previous versions exist', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [makeItem()] });
        const v = createVersion(storage, floors);
        expect(v.version).toBe(1);
    });
    it('increments version number from previous', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        createVersion(storage, floors, 'first');
        const v2 = createVersion(storage, floors, 'second');
        expect(v2.version).toBe(2);
    });
    it('uses provided label', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        const v = createVersion(storage, floors, 'My checkpoint');
        expect(v.label).toBe('My checkpoint');
    });
    it('auto-generates label when none provided', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        const v = createVersion(storage, floors);
        expect(v.label).toBe('Save #1');
    });
    it('auto-generates label when empty string provided', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        const v = createVersion(storage, floors, '   ');
        expect(v.label).toBe('Save #1');
    });
    it('deep-copies floor items so later mutations do not affect the snapshot', () => {
        const storage = makeStorage();
        const items = [makeItem('barrel', 1, 2)];
        const floors = makeFloorMap({ 0: items });
        createVersion(storage, floors, 'snap');
        // Mutate after save
        items.push(makeItem('chest', 5, 5));
        const loaded = loadVersions(storage);
        expect(loaded[0].floors[0]).toHaveLength(1); // snapshot is unaffected
    });
    it('snapshots all floors', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({
            '-1': [makeItem('cauldron', 0, 0)],
            '0': [makeItem('barrel', 1, 1)],
            '1': [makeItem('chest', 2, 2)],
        });
        const v = createVersion(storage, floors);
        expect(Object.keys(v.floors)).toHaveLength(3);
    });
    it('persists version to storage immediately', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        createVersion(storage, floors, 'persist');
        expect(loadVersions(storage)).toHaveLength(1);
    });
    it(`caps stored versions at ${TOWER_VERSION_MAX}`, () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        for (let i = 0; i < TOWER_VERSION_MAX + 5; i++) {
            createVersion(storage, floors);
        }
        const stored = loadVersions(storage);
        expect(stored).toHaveLength(TOWER_VERSION_MAX);
    });
    it('drops oldest versions when cap is exceeded', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        for (let i = 0; i < TOWER_VERSION_MAX + 2; i++) {
            createVersion(storage, floors, `v${i + 1}`);
        }
        const stored = loadVersions(storage);
        // Oldest (v1, v2) should have been dropped; newest retained
        expect(stored[0].label).toBe('v3');
        expect(stored[stored.length - 1].label).toBe(`v${TOWER_VERSION_MAX + 2}`);
    });
    it('savedAt is a recent timestamp', () => {
        const before = Date.now();
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        const v = createVersion(storage, floors);
        const after = Date.now();
        expect(v.savedAt).toBeGreaterThanOrEqual(before);
        expect(v.savedAt).toBeLessThanOrEqual(after);
    });
});
// ── restoreVersion ─────────────────────────────────────────────────────────────
describe('restoreVersion', () => {
    it('populates the floor map from the version snapshot', () => {
        const version = {
            version: 1, label: 'snap', savedAt: 0,
            floors: {
                0: [makeItem('barrel', 1, 2)],
                1: [makeItem('chest', 3, 4), makeItem('crate', 5, 6)],
            },
        };
        const floorItems = new Map();
        restoreVersion(version, floorItems);
        expect(floorItems.size).toBe(2);
        expect(floorItems.get(0)).toHaveLength(1);
        expect(floorItems.get(1)).toHaveLength(2);
        expect(floorItems.get(0)[0].x).toBe(1);
    });
    it('clears existing items before restoring', () => {
        const version = {
            version: 1, label: 's', savedAt: 0,
            floors: { 0: [makeItem()] },
        };
        const floorItems = new Map();
        floorItems.set(99, [makeItem('crate', 9, 9)]);
        restoreVersion(version, floorItems);
        expect(floorItems.has(99)).toBe(false);
        expect(floorItems.has(0)).toBe(true);
    });
    it('deep-copies items so later mutations do not corrupt the version', () => {
        const origItem = makeItem('barrel', 1, 1);
        const version = {
            version: 1, label: 's', savedAt: 0,
            floors: { 0: [origItem] },
        };
        const floorItems = new Map();
        restoreVersion(version, floorItems);
        // Mutate the restored item
        floorItems.get(0)[0].x = 999;
        // Original version data unchanged
        expect(version.floors[0][0].x).toBe(1);
    });
    it('returns the number of floors restored', () => {
        const version = {
            version: 1, label: 's', savedAt: 0,
            floors: { '-1': [], '0': [], '1': [] },
        };
        const count = restoreVersion(version, new Map());
        expect(count).toBe(3);
    });
    it('handles a version with no floors without error', () => {
        const version = { version: 1, label: 's', savedAt: 0, floors: {} };
        const floorItems = new Map();
        const count = restoreVersion(version, floorItems);
        expect(count).toBe(0);
        expect(floorItems.size).toBe(0);
    });
});
// ── deleteVersion ─────────────────────────────────────────────────────────────
describe('deleteVersion', () => {
    it('removes the version with the given number', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        createVersion(storage, floors, 'a');
        createVersion(storage, floors, 'b');
        createVersion(storage, floors, 'c');
        const deleted = deleteVersion(storage, 2);
        expect(deleted).toBe(true);
        const remaining = loadVersions(storage);
        expect(remaining).toHaveLength(2);
        expect(remaining.find(v => v.label === 'b')).toBeUndefined();
    });
    it('returns false when version number not found', () => {
        const storage = makeStorage();
        expect(deleteVersion(storage, 99)).toBe(false);
    });
    it('does not affect other versions when one is deleted', () => {
        const storage = makeStorage();
        const floors = makeFloorMap({ 0: [] });
        createVersion(storage, floors, 'keep-1');
        createVersion(storage, floors, 'remove');
        createVersion(storage, floors, 'keep-3');
        deleteVersion(storage, 2);
        const remaining = loadVersions(storage);
        const labels = remaining.map(v => v.label);
        expect(labels).toContain('keep-1');
        expect(labels).toContain('keep-3');
        expect(labels).not.toContain('remove');
    });
});
