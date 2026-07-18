/**
 * Pure editor state logic — no DOM, no THREE.js dependencies.
 * Testable in isolation via Vitest.
 */
// ── Factory ────────────────────────────────────────────────────────────────────
export function createEditorState() {
    return {
        activeTab: 'assets',
        selectedAssetId: null,
        paramValues: {},
        mat1Preset: 'wood',
        mat1Params: {},
        mat2Preset: 'metal',
        mat2Params: {},
        floorItems: new Map(),
        currentFloor: 0,
        previewCount: 0,
    };
}
export function computeTabSwitchActions(_prevTab, _nextTab) {
    // Regardless of direction, always clear all 3D state on tab change
    return { clearPreview: true, removeTowerGrid: true, removeBuilding: true };
}
export function applyTabSwitch(state, tab) {
    return { ...state, activeTab: tab };
}
// ── Asset studio params ────────────────────────────────────────────────────────
/** Build a param-values map seeded with the defaults for a given asset's params. */
export function buildDefaultParamValues(params) {
    return Object.fromEntries(params.map(p => [p.id, p.default]));
}
/** Apply a single slider change and return updated paramValues. */
export function applyParamChange(paramValues, id, value) {
    return { ...paramValues, [id]: value };
}
/** Derive texture preset default params map. */
export function getPresetDefaultParams(presetId, presets) {
    const preset = presets.find(p => p.id === presetId);
    if (!preset)
        return {};
    return Object.fromEntries(preset.params.map(p => [p.id, p.default]));
}
// ── Tower floor state ──────────────────────────────────────────────────────────
/** Get items for a specific floor (never mutates state). */
export function getFloorItems(state, floor) {
    return [...(state.floorItems.get(floor) ?? [])];
}
/** Switch floors — persists current floor's items, loads new floor's items. */
export function switchFloor(state, newFloor) {
    // Items are already stored per-floor in the map; just update currentFloor.
    return { ...state, currentFloor: newFloor };
}
/** Toggle-place an item: add if no item at that cell, remove if already there. */
export function togglePlaceItem(state, floor, item) {
    const existing = state.floorItems.get(floor) ?? [];
    const existIdx = existing.findIndex(i => Math.abs(i.x - item.x) < 0.1 && Math.abs(i.z - item.z) < 0.1);
    let next;
    if (existIdx !== -1) {
        next = [...existing.slice(0, existIdx), ...existing.slice(existIdx + 1)];
    }
    else {
        next = [...existing, { ...item, floorIndex: floor }];
    }
    const newFloorItems = new Map(state.floorItems);
    newFloorItems.set(floor, next);
    return { ...state, floorItems: newFloorItems };
}
/** Clear all items on a specific floor. */
export function clearFloor(state, floor) {
    const newFloorItems = new Map(state.floorItems);
    newFloorItems.set(floor, []);
    return { ...state, floorItems: newFloorItems };
}
