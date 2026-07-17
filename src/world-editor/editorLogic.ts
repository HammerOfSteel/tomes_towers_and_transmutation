/**
 * Pure editor state logic — no DOM, no THREE.js dependencies.
 * Testable in isolation via Vitest.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type TabName = 'assets' | 'tower' | 'buildings' | 'library';

export interface PlacedItem {
  type: string;
  x: number;
  z: number;
  rotation: number;
  floorIndex: number;
}

export interface TexParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface TexturePreset {
  id: string;
  label: string;
  params: TexParamDef[];
}

export interface EditorState {
  activeTab: TabName;
  selectedAssetId: string | null;
  paramValues: Record<string, number>;
  mat1Preset: string;
  mat1Params: Record<string, number>;
  mat2Preset: string;
  mat2Params: Record<string, number>;
  /** Per-floor placed items: floorIndex → items */
  floorItems: Map<number, PlacedItem[]>;
  currentFloor: number;
  /** Number of previews rendered (used to assert preview was triggered) */
  previewCount: number;
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createEditorState(): EditorState {
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

// ── Tab management ─────────────────────────────────────────────────────────────

/** Returns the cleanup actions needed when switching tabs (caller executes them). */
export interface TabSwitchActions {
  clearPreview: boolean;
  removeTowerGrid: boolean;
  removeBuilding: boolean;
}

export function computeTabSwitchActions(
  _prevTab: TabName,
  _nextTab: TabName,
): TabSwitchActions {
  // Regardless of direction, always clear all 3D state on tab change
  return { clearPreview: true, removeTowerGrid: true, removeBuilding: true };
}

export function applyTabSwitch(state: EditorState, tab: TabName): EditorState {
  return { ...state, activeTab: tab };
}

// ── Asset studio params ────────────────────────────────────────────────────────

/** Build a param-values map seeded with the defaults for a given asset's params. */
export function buildDefaultParamValues(
  params: Array<{ id: string; default: number }>,
): Record<string, number> {
  return Object.fromEntries(params.map(p => [p.id, p.default]));
}

/** Apply a single slider change and return updated paramValues. */
export function applyParamChange(
  paramValues: Record<string, number>,
  id: string,
  value: number,
): Record<string, number> {
  return { ...paramValues, [id]: value };
}

/** Derive texture preset default params map. */
export function getPresetDefaultParams(
  presetId: string,
  presets: TexturePreset[],
): Record<string, number> {
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return {};
  return Object.fromEntries(preset.params.map(p => [p.id, p.default]));
}

// ── Tower floor state ──────────────────────────────────────────────────────────

/** Get items for a specific floor (never mutates state). */
export function getFloorItems(state: EditorState, floor: number): PlacedItem[] {
  return [...(state.floorItems.get(floor) ?? [])];
}

/** Switch floors — persists current floor's items, loads new floor's items. */
export function switchFloor(state: EditorState, newFloor: number): EditorState {
  // Items are already stored per-floor in the map; just update currentFloor.
  return { ...state, currentFloor: newFloor };
}

/** Toggle-place an item: add if no item at that cell, remove if already there. */
export function togglePlaceItem(
  state: EditorState,
  floor: number,
  item: Omit<PlacedItem, 'floorIndex'>,
): EditorState {
  const existing = state.floorItems.get(floor) ?? [];
  const existIdx = existing.findIndex(
    i => Math.abs(i.x - item.x) < 0.1 && Math.abs(i.z - item.z) < 0.1,
  );

  let next: PlacedItem[];
  if (existIdx !== -1) {
    next = [...existing.slice(0, existIdx), ...existing.slice(existIdx + 1)];
  } else {
    next = [...existing, { ...item, floorIndex: floor }];
  }

  const newFloorItems = new Map(state.floorItems);
  newFloorItems.set(floor, next);
  return { ...state, floorItems: newFloorItems };
}

/** Clear all items on a specific floor. */
export function clearFloor(state: EditorState, floor: number): EditorState {
  const newFloorItems = new Map(state.floorItems);
  newFloorItems.set(floor, []);
  return { ...state, floorItems: newFloorItems };
}
