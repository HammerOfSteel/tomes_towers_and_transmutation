/**
 * CreativeModeState.ts
 *
 * Single source of truth for all creative-mode flags.
 * Use CreativeMode.enter() / exit() to activate/deactivate.
 * Everything else reads from this module.
 *
 * Dev-build only — guarded by import.meta.env.DEV at call sites.
 */
export const SPEED_MULTIPLIERS = [1, 3, 10, 50];
// ── Singleton state ───────────────────────────────────────────────────────────
const _state = {
    active: false,
    flyEnabled: true,
    noClip: false,
    godMode: true,
    frozenEnemies: false,
    speedTier: 1,
    currentSkin: null,
    activeTool: 'select',
    hotbar: Array(8).fill(null),
    activeHotbarSlot: 0,
    currentZone: 'Tower',
    gridSnap: true,
    codeFirstAssets: false,
};
// ── Read API ──────────────────────────────────────────────────────────────────
export function getCreativeState() { return _state; }
export function isCreativeActive() { return _state.active; }
export function getSpeedMultiplier() { return SPEED_MULTIPLIERS[_state.speedTier]; }
// ── Write API ─────────────────────────────────────────────────────────────────
export function setCreativeActive(v) { _state.active = v; }
export function setFlyEnabled(v) { _state.flyEnabled = v; }
export function setNoClip(v) { _state.noClip = v; }
export function setGridSnap(v) { _state.gridSnap = v; }
export function setCodeFirstAssets(v) { _state.codeFirstAssets = v; }
export function setGodMode(v) { _state.godMode = v; }
export function setFrozenEnemies(v) { _state.frozenEnemies = v; }
export function setCurrentZone(zone) { _state.currentZone = zone; }
export function setCurrentSkin(skin) { _state.currentSkin = skin; }
export function setActiveTool(tool) { _state.activeTool = tool; }
export function setActiveHotbarSlot(slot) { _state.activeHotbarSlot = Math.max(0, Math.min(7, slot)); }
export function setHotbarSlot(slot, assetPath) {
    if (slot >= 0 && slot < 8)
        _state.hotbar[slot] = assetPath;
}
export function cycleSpeedUp() {
    _state.speedTier = ((_state.speedTier + 1) % 4);
}
export function cycleSpeedDown() {
    _state.speedTier = ((_state.speedTier + 3) % 4);
}
