import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { saveExternalAssetConfig, DEFAULT_EXTERNAL_ASSET_CONFIG } from '@/world/ExternalAssetConfig';

// Mock the real GLTF-loading layer so no network/filesystem is hit — mirrors
// src/assets/__tests__/QuaterniusAssetLoader.test.ts's approach, but mocks
// one level higher (loadQuatAsset itself) since this adapter doesn't care
// about format dispatch, only about what loadQuatAsset returns.
const mockScene = () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return scene;
};

vi.mock('@/assets/QuaterniusAssetLoader', () => ({
  loadQuatAsset: vi.fn(async () => ({
    scene: mockScene(),
    mixer: null,
    clips: [],
    format: 'glb',
  })),
}));

vi.mock('@/enemy/EnemyLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/enemy/EnemyLoader')>();
  return {
    ...actual,
    loadEnemyById: vi.fn(async (_id: string, _spawnPos: THREE.Vector3) => ({
      group: new THREE.Group(),
      mixer: null,
      allClips: [],
      clips: { idle: null, walk: null, run: null, attack: null, death: null, hurt: null },
      normScale: 1,
      def: { id: 'fallback/def', packId: 'fallback', name: 'Fallback', path: '', format: 'glb', roles: ['enemy'], tags: [], animated: false },
    })),
  };
});

import { QUAT_ENEMY_MANIFEST, getQuatEnemyManifestEntry, resolveEnemyRig } from '@/enemy/QuatEnemyAdapter';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';
import { loadEnemyById } from '@/enemy/EnemyLoader';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('QUAT_ENEMY_MANIFEST — structural validity', () => {
  it('has at least 5 entries', () => {
    expect(QUAT_ENEMY_MANIFEST.length).toBeGreaterThanOrEqual(5);
  });

  it('all enemyIds are unique', () => {
    const ids = QUAT_ENEMY_MANIFEST.map(e => e.enemyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all quatModelId values resolve to a real QUAT_MODELS entry', () => {
    const missing: string[] = [];
    for (const entry of QUAT_ENEMY_MANIFEST) {
      if (!QUAT_MODELS.some(m => m.id === entry.quatModelId)) missing.push(entry.quatModelId);
    }
    expect(missing, `Missing QUAT_MODELS refs:\n${missing.join('\n')}`).toHaveLength(0);
  });

  it('includes the pre-existing "imp" TODO enemyId from RoomEncounterDef', () => {
    expect(getQuatEnemyManifestEntry('imp')).toBeDefined();
    expect(getQuatEnemyManifestEntry('imp')!.quatModelId).toBe('monsters/bestiary_dungeon_monsters/Imp');
  });
});

describe('resolveEnemyRig', () => {
  const spawnPos = new THREE.Vector3(1, 0, 2);

  it('falls back to loadEnemyById when the monsters category is OFF', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false } });
    await resolveEnemyRig('imp', spawnPos);
    expect(loadEnemyById).toHaveBeenCalledWith('imp', spawnPos);
    expect(loadQuatAsset).not.toHaveBeenCalled();
  });

  it('falls back to loadEnemyById when ON but no manifest mapping exists', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: true } });
    await resolveEnemyRig('__nonexistent_enemy__', spawnPos);
    expect(loadEnemyById).toHaveBeenCalledWith('__nonexistent_enemy__', spawnPos);
    expect(loadQuatAsset).not.toHaveBeenCalled();
  });

  it('uses the real asset when ON and a mapping exists', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: true } });
    const rig = await resolveEnemyRig('imp', spawnPos);
    expect(loadQuatAsset).toHaveBeenCalledTimes(1);
    expect(loadEnemyById).not.toHaveBeenCalled();
    expect(rig.group.position.x).toBeCloseTo(1);
    expect(rig.group.position.z).toBeCloseTo(2);
    expect(rig.def.id).toBe('monsters/bestiary_dungeon_monsters/Imp');
  });
});
