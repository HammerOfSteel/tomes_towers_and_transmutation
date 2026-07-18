/**
 * CreativeModeState.ts
 *
 * Single source of truth for all creative-mode flags.
 * Use CreativeMode.enter() / exit() to activate/deactivate.
 * Everything else reads from this module.
 *
 * Dev-build only — guarded by import.meta.env.DEV at call sites.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreativeState {
  active:         boolean;
  flyEnabled:     boolean;
  noClip:         boolean;
  godMode:        boolean;
  frozenEnemies:  boolean;
  speedTier:      0 | 1 | 2 | 3;   // 0=1× 1=3× 2=10× 3=50×
  currentSkin:    string | null;
  activeTool:     CreativeTool;
  hotbar:         Array<string | null>;  // 8 slots, asset path or null
  activeHotbarSlot: number;
  currentZone:    string;
}

export type CreativeTool = 'select' | 'place' | 'delete' | 'inspect';

export const SPEED_MULTIPLIERS: Readonly<[1, 3, 10, 50]> = [1, 3, 10, 50];

// ── Singleton state ───────────────────────────────────────────────────────────

const _state: CreativeState = {
  active:           false,
  flyEnabled:       true,
  noClip:           false,
  godMode:          true,
  frozenEnemies:    false,
  speedTier:        1,        // default 3×
  currentSkin:      null,
  activeTool:       'select',
  hotbar:           Array(8).fill(null) as Array<string | null>,
  activeHotbarSlot: 0,
  currentZone:      'Tower',
};

// ── Read API ──────────────────────────────────────────────────────────────────

export function getCreativeState(): Readonly<CreativeState> { return _state; }
export function isCreativeActive(): boolean                { return _state.active; }
export function getSpeedMultiplier(): number               { return SPEED_MULTIPLIERS[_state.speedTier]; }

// ── Write API ─────────────────────────────────────────────────────────────────

export function setCreativeActive(v: boolean): void       { _state.active = v; }
export function setFlyEnabled(v: boolean): void           { _state.flyEnabled = v; }
export function setNoClip(v: boolean): void               { _state.noClip = v; }
export function setGodMode(v: boolean): void              { _state.godMode = v; }
export function setFrozenEnemies(v: boolean): void        { _state.frozenEnemies = v; }
export function setCurrentZone(zone: string): void        { _state.currentZone = zone; }
export function setCurrentSkin(skin: string | null): void { _state.currentSkin = skin; }
export function setActiveTool(tool: CreativeTool): void   { _state.activeTool = tool; }
export function setActiveHotbarSlot(slot: number): void   { _state.activeHotbarSlot = Math.max(0, Math.min(7, slot)); }

export function setHotbarSlot(slot: number, assetPath: string | null): void {
  if (slot >= 0 && slot < 8) _state.hotbar[slot] = assetPath;
}

export function cycleSpeedUp(): void {
  _state.speedTier = ((_state.speedTier + 1) % 4) as CreativeState['speedTier'];
}
export function cycleSpeedDown(): void {
  _state.speedTier = ((_state.speedTier + 3) % 4) as CreativeState['speedTier'];
}
