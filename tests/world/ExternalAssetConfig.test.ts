import { describe, it, expect, beforeEach } from 'vitest';
import {
  type AssetCategory,
  DEFAULT_EXTERNAL_ASSET_CONFIG,
  loadExternalAssetConfig,
  saveExternalAssetConfig,
  isCategoryEnabled,
} from '@/world/ExternalAssetConfig';

const ALL_CATEGORIES: AssetCategory[] = [
  'nature-props', 'animals', 'monsters',
  'settlement-buildings', 'building-interiors', 'dungeons-towers',
];

beforeEach(() => {
  localStorage.clear();
});

describe('DEFAULT_EXTERNAL_ASSET_CONFIG', () => {
  it('has all 6 categories defaulting to true', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(DEFAULT_EXTERNAL_ASSET_CONFIG.enabled[cat]).toBe(true);
    }
  });
});

describe('loadExternalAssetConfig', () => {
  it('returns the defaults when localStorage is empty', () => {
    const cfg = loadExternalAssetConfig();
    expect(cfg).toEqual(DEFAULT_EXTERNAL_ASSET_CONFIG);
  });

  it('fills missing keys with defaults when localStorage has a partial config', () => {
    localStorage.setItem('ttt_external_assets_v1', JSON.stringify({ enabled: { monsters: false } }));
    const cfg = loadExternalAssetConfig();
    expect(cfg.enabled.monsters).toBe(false);
    expect(cfg.enabled.animals).toBe(true); // untouched key falls back to default
  });

  it('returns defaults when localStorage holds invalid JSON', () => {
    localStorage.setItem('ttt_external_assets_v1', '{not valid json');
    const cfg = loadExternalAssetConfig();
    expect(cfg).toEqual(DEFAULT_EXTERNAL_ASSET_CONFIG);
  });
});

describe('saveExternalAssetConfig', () => {
  it('persists a config that loadExternalAssetConfig can read back', () => {
    const cfg = { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false, animals: false } };
    saveExternalAssetConfig(cfg);
    const reloaded = loadExternalAssetConfig();
    expect(reloaded.enabled.monsters).toBe(false);
    expect(reloaded.enabled.animals).toBe(false);
    expect(reloaded.enabled['dungeons-towers']).toBe(true);
  });
});

describe('isCategoryEnabled', () => {
  it('reads the persisted value for a given category', () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false } });
    expect(isCategoryEnabled('monsters')).toBe(false);
    expect(isCategoryEnabled('animals')).toBe(true);
  });

  it('defaults to true when localStorage is empty', () => {
    expect(isCategoryEnabled('nature-props')).toBe(true);
  });
});
