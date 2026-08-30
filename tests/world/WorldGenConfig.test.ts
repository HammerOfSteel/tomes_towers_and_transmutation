import { describe, it, expect, afterEach } from 'vitest';
import { DEFAULT_WORLD_GEN_CONFIG, loadWorldGenConfig } from '@/world/WorldGenConfig';
import type { WorldSize } from '@/world/WorldGenConfig';

describe('WorldGenConfig — 512 world-size tier', () => {
  it('accepts 512 as a valid WorldSize', () => {
    const size: WorldSize = 512;
    expect(size).toBe(512);
  });

  it('defaults to the larger 512 world size (foundation rebuild)', () => {
    expect(DEFAULT_WORLD_GEN_CONFIG.worldSize).toBe(512);
  });
});

describe('WorldGenConfig — shape/climate/roughness (Overworld Lab realm-tab parity)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('DEFAULT_WORLD_GEN_CONFIG has shape/climate/roughness matching generateRealmData defaults', () => {
    expect(DEFAULT_WORLD_GEN_CONFIG.shape).toBe('island');
    expect(DEFAULT_WORLD_GEN_CONFIG.climate).toBe('temperate');
    expect(DEFAULT_WORLD_GEN_CONFIG.roughness).toBe(0.5);
  });

  it('loadWorldGenConfig fills in shape/climate/roughness for a legacy saved config missing them', () => {
    localStorage.setItem('ttt_world_gen_config', JSON.stringify({ seed: 42, worldSize: 256 }));
    const cfg = loadWorldGenConfig();
    expect(cfg.seed).toBe(42);
    expect(cfg.shape).toBe('island');
    expect(cfg.climate).toBe('temperate');
    expect(cfg.roughness).toBe(0.5);
  });
});
