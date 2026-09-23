/**
 * ExternalAssetConfig — per-category on/off toggles for whether procedural
 * placement/construction systems hand off "what mesh to place" to a real,
 * imported Quaternius asset instead of their existing procedural builder.
 *
 * Mirrors WorldGenConfig.ts's load/save-with-defaults pattern: one
 * structured localStorage key holding the whole config, missing keys
 * filled from defaults on load. See
 * docs/asset-integration/2026-09-23-wiring-design-spec.md §3.
 *
 * All 6 categories default to `true` (real assets ON) — Dev Mode (which
 * gates the Settings UI for these toggles) exists so a developer can turn
 * individual categories OFF to isolate/compare/debug, not so real assets
 * start opt-in. Every resolver elsewhere in the codebase must still fall
 * through to its existing procedural/asset builder whenever a toggle here
 * is false, or when true but no real-asset mapping exists for a specific
 * kind (see spec §2's "Hard rule #2" — this file only stores the flags,
 * it does not enforce the fallback; each resolver enforces its own).
 */

export type AssetCategory =
  | 'nature-props'
  | 'animals'
  | 'monsters'
  | 'settlement-buildings'
  | 'building-interiors'
  | 'dungeons-towers';

export interface ExternalAssetConfig {
  enabled: Record<AssetCategory, boolean>;
}

export const DEFAULT_EXTERNAL_ASSET_CONFIG: Readonly<ExternalAssetConfig> = {
  enabled: {
    'nature-props':          true,
    'animals':               true,
    'monsters':              true,
    'settlement-buildings':  true,
    'building-interiors':    true,
    'dungeons-towers':       true,
  },
};

const LS_KEY = 'ttt_external_assets_v1';

/** Load config from localStorage, filling missing keys with defaults. */
export function loadExternalAssetConfig(): ExternalAssetConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled } };
    const parsed = JSON.parse(raw) as Partial<ExternalAssetConfig>;
    return {
      enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, ...(parsed.enabled ?? {}) },
    };
  } catch {
    return { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled } };
  }
}

/** Persist config to localStorage. */
export function saveExternalAssetConfig(cfg: ExternalAssetConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** Convenience read for a single category — used by every resolver. */
export function isCategoryEnabled(cat: AssetCategory): boolean {
  return loadExternalAssetConfig().enabled[cat];
}
