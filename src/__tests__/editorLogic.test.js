/**
 * Tests for pure editor state logic (no DOM, no THREE.js).
 * Covers: tab switching, floor-per-item state, param changes.
 *
 * BUG COVERAGE:
 *   Bug 1 – computeTabSwitchActions always clears scene
 *   Bug 2 – floor items isolated per floor (no cross-floor bleed)
 *   Bug 3 – applyParamChange produces updated values (slider plumbing)
 *   Bug 7 – getPresetDefaultParams seeds mat params from preset definition
 */
import { describe, it, expect } from 'vitest';
import { createEditorState, applyTabSwitch, computeTabSwitchActions, buildDefaultParamValues, applyParamChange, getPresetDefaultParams, getFloorItems, switchFloor, togglePlaceItem, clearFloor, } from '@/world-editor/editorLogic';
// ── Tab management ──────────────────────────────────────────────────────────────
describe('computeTabSwitchActions', () => {
    it('always returns clearPreview=true regardless of tabs', () => {
        const actions = computeTabSwitchActions('assets', 'buildings');
        expect(actions.clearPreview).toBe(true);
    });
    it('always returns removeTowerGrid=true so tower geometry never bleeds into other tabs', () => {
        const actions = computeTabSwitchActions('tower', 'assets');
        expect(actions.removeTowerGrid).toBe(true);
    });
    it('always returns removeBuilding=true so building preview never bleeds into other tabs', () => {
        const actions = computeTabSwitchActions('buildings', 'tower');
        expect(actions.removeBuilding).toBe(true);
    });
    it('clears scene even when switching to the same tab', () => {
        const actions = computeTabSwitchActions('assets', 'assets');
        expect(actions.clearPreview).toBe(true);
    });
});
describe('applyTabSwitch', () => {
    it('updates the activeTab field', () => {
        const state = createEditorState();
        const next = applyTabSwitch(state, 'buildings');
        expect(next.activeTab).toBe('buildings');
    });
    it('does not mutate the original state', () => {
        const state = createEditorState();
        applyTabSwitch(state, 'tower');
        expect(state.activeTab).toBe('assets');
    });
});
// ── Asset parameter management ──────────────────────────────────────────────────
describe('buildDefaultParamValues', () => {
    it('seeds all params with their default values', () => {
        const params = [
            { id: 'width', default: 1.5 },
            { id: 'height', default: 2.0 },
            { id: 'depth', default: 0.5 },
        ];
        const result = buildDefaultParamValues(params);
        expect(result).toEqual({ width: 1.5, height: 2.0, depth: 0.5 });
    });
    it('returns empty object for empty params list', () => {
        expect(buildDefaultParamValues([])).toEqual({});
    });
});
describe('applyParamChange', () => {
    it('updates the named param to the new value', () => {
        const base = { width: 1.5, height: 2.0 };
        const next = applyParamChange(base, 'width', 3.0);
        expect(next.width).toBe(3.0);
    });
    it('leaves other params unchanged', () => {
        const base = { width: 1.5, height: 2.0 };
        const next = applyParamChange(base, 'width', 3.0);
        expect(next.height).toBe(2.0);
    });
    it('does not mutate the original paramValues', () => {
        const base = { width: 1.5 };
        applyParamChange(base, 'width', 9.0);
        expect(base.width).toBe(1.5);
    });
    it('can add a new param key', () => {
        const base = {};
        const next = applyParamChange(base, 'newParam', 42);
        expect(next.newParam).toBe(42);
    });
});
// ── Texture preset default params ───────────────────────────────────────────────
describe('getPresetDefaultParams', () => {
    const fakePresets = [
        {
            id: 'wood',
            label: 'Wood',
            params: [
                { id: 'grainDensity', label: 'Grain', min: 0, max: 1, step: 0.01, default: 0.6 },
                { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01, default: 0.8 },
            ],
        },
        {
            id: 'stone',
            label: 'Stone',
            params: [
                { id: 'crackDensity', label: 'Cracks', min: 0, max: 1, step: 0.01, default: 0.4 },
            ],
        },
        { id: 'plain', label: 'Plain', params: [] },
    ];
    it('returns defaults for a known preset', () => {
        const result = getPresetDefaultParams('wood', fakePresets);
        expect(result).toEqual({ grainDensity: 0.6, roughness: 0.8 });
    });
    it('returns {} for an unknown preset id', () => {
        expect(getPresetDefaultParams('doesNotExist', fakePresets)).toEqual({});
    });
    it('returns {} for a preset with no params', () => {
        expect(getPresetDefaultParams('plain', fakePresets)).toEqual({});
    });
    it('each preset with params returns all of them', () => {
        const result = getPresetDefaultParams('stone', fakePresets);
        expect(result).toEqual({ crackDensity: 0.4 });
    });
});
// ── Tower floor isolation ───────────────────────────────────────────────────────
describe('getFloorItems / switchFloor / togglePlaceItem', () => {
    const makeItem = (x, z) => ({
        type: 'barrel', x, z, rotation: 0,
    });
    it('floor starts empty', () => {
        const state = createEditorState();
        expect(getFloorItems(state, 0)).toEqual([]);
        expect(getFloorItems(state, 3)).toEqual([]);
    });
    it('placing an item on floor 0 does not appear on floor 1', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 2));
        expect(getFloorItems(state, 0)).toHaveLength(1);
        expect(getFloorItems(state, 1)).toHaveLength(0);
    });
    it('switching floors preserves items on the previous floor', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 2));
        state = switchFloor(state, 1);
        // Floor 0 items still intact after switching to floor 1
        expect(getFloorItems(state, 0)).toHaveLength(1);
    });
    it('items on floor 1 do not appear on floor 0', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 1, makeItem(5, 5));
        expect(getFloorItems(state, 0)).toHaveLength(0);
        expect(getFloorItems(state, 1)).toHaveLength(1);
    });
    it('toggling the same cell removes the item', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 2));
        state = togglePlaceItem(state, 0, makeItem(1, 2));
        expect(getFloorItems(state, 0)).toHaveLength(0);
    });
    it('can place multiple items on multiple floors independently', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 1));
        state = togglePlaceItem(state, 0, makeItem(2, 2));
        state = togglePlaceItem(state, 1, makeItem(3, 3));
        state = togglePlaceItem(state, 3, makeItem(4, 4));
        state = togglePlaceItem(state, 3, makeItem(5, 5));
        state = togglePlaceItem(state, 3, makeItem(6, 6));
        expect(getFloorItems(state, 0)).toHaveLength(2);
        expect(getFloorItems(state, 1)).toHaveLength(1);
        expect(getFloorItems(state, 2)).toHaveLength(0);
        expect(getFloorItems(state, 3)).toHaveLength(3);
    });
    it('switchFloor updates currentFloor', () => {
        const state = createEditorState();
        const next = switchFloor(state, 4);
        expect(next.currentFloor).toBe(4);
    });
    it('switchFloor does not mutate the original state', () => {
        const state = createEditorState();
        switchFloor(state, 2);
        expect(state.currentFloor).toBe(0);
    });
    it('clearFloor removes all items on that floor only', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 1));
        state = togglePlaceItem(state, 1, makeItem(2, 2));
        state = clearFloor(state, 0);
        expect(getFloorItems(state, 0)).toHaveLength(0);
        expect(getFloorItems(state, 1)).toHaveLength(1);
    });
    it('getFloorItems returns a copy, not a live reference', () => {
        let state = createEditorState();
        state = togglePlaceItem(state, 0, makeItem(1, 1));
        const copy = getFloorItems(state, 0);
        copy.push({ type: 'crate', x: 9, z: 9, rotation: 0, floorIndex: 0 });
        // Original floor data should not have been mutated
        expect(getFloorItems(state, 0)).toHaveLength(1);
    });
});
// ── createEditorState defaults ──────────────────────────────────────────────────
describe('createEditorState', () => {
    it('starts on assets tab', () => {
        expect(createEditorState().activeTab).toBe('assets');
    });
    it('starts with no selected asset', () => {
        expect(createEditorState().selectedAssetId).toBeNull();
    });
    it('starts with empty paramValues', () => {
        expect(createEditorState().paramValues).toEqual({});
    });
    it('starts with mat1Preset = wood', () => {
        expect(createEditorState().mat1Preset).toBe('wood');
    });
    it('starts with empty mat1Params — BUG: must be seeded from preset defaults on init', () => {
        // This documents the expected post-fix state: mat params start empty and get
        // populated when a preset is first selected (via initMatPresetSelects).
        // The world-editor.ts fix is to call getPresetDefaultParams on init.
        expect(createEditorState().mat1Params).toEqual({});
    });
    it('starts on floor 0', () => {
        expect(createEditorState().currentFloor).toBe(0);
    });
});
