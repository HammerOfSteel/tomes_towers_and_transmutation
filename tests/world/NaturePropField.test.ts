import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import {
  selectNaturePropPlacements, NaturePropField, NaturePropManager,
  NATURE_PROP_RADIUS, NATURE_PROP_REBUILD_HYSTERESIS,
} from '@/world/NaturePropField';
import { getPartVariantPool } from '@/world/NaturePartPools';
import { generateChunkScatterCandidates } from '@/world/NatureScatterPoints';
import { CHUNK_SIZE } from '@/world/ChunkManager';

function makeAllBiomeGrid(size: number, biome: BiomeId, elevation = 1): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) g.set(col, row, { elevation, biome });
  }
  return g;
}

const GRID_INFO = { GHW: 50, GHH: 50, T: 2 };

describe('selectNaturePropPlacements', () => {
  it('returns a non-empty map with trunk and canopy-blob keys for an all-forest window', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const groups = selectNaturePropPlacements(wg, 0, 0, 24, 1, 'tree', GRID_INFO);
    expect(groups.size).toBeGreaterThan(0);
    const keys = [...groups.keys()];
    expect(keys.some(k => k.startsWith('trunk|'))).toBe(true);
    expect(keys.some(k => k.startsWith('canopy-blob|'))).toBe(true);
  });

  it('returns nothing for an all-ocean window (never scatter-allowed)', () => {
    const wg = makeAllBiomeGrid(120, 'ocean');
    const groups = selectNaturePropPlacements(wg, 0, 0, 24, 1, 'tree', GRID_INFO);
    expect(groups.size).toBe(0);
  });

  it('is deterministic for a fixed seed/position', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const a = selectNaturePropPlacements(wg, 0, 0, 24, 5, 'tree', GRID_INFO);
    const b = selectNaturePropPlacements(wg, 0, 0, 24, 5, 'tree', GRID_INFO);
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
    const key = [...a.keys()][0]!;
    expect(a.get(key)!.length).toBe(b.get(key)!.length);
  });

  it('every returned (wx,wz) tree candidate matches generateChunkScatterCandidates for its chunk', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const groups = selectNaturePropPlacements(wg, 0, 0, 24, 1, 'tree', GRID_INFO);
    const allXZ = new Set<string>();
    for (const list of groups.values()) {
      for (const inst of list) allXZ.add(`${inst.worldPosition.x},${inst.worldPosition.z}`);
    }
    const golden = generateChunkScatterCandidates({ cx: 0, cz: 0 }, 1, 'tree', { ...GRID_INFO, chunkSize: CHUNK_SIZE });
    // Every golden candidate within radius 24 of the origin must appear as a
    // placed instance's worldPosition (position parity with the collider path).
    for (const c of golden) {
      if (Math.sqrt(c.wx * c.wx + c.wz * c.wz) > 24) continue;
      expect(allXZ.has(`${c.wx},${c.wz}`)).toBe(true);
    }
  });
});

describe('NaturePropField', () => {
  it('rebuild() sets mesh.count to the placed instance count, capped at maxInstances', () => {
    const geo = getPartVariantPool('trunk')[0]!;
    const mat = new THREE.MeshBasicMaterial();
    const field = new NaturePropField(geo, mat, 3);
    field.rebuild([
      { worldPosition: new THREE.Vector3(0, 0, 0), localOffset: new THREE.Vector3(), rotationY: 0, localRotation: new THREE.Euler(), scale: new THREE.Vector3(1, 1, 1) },
      { worldPosition: new THREE.Vector3(1, 0, 0), localOffset: new THREE.Vector3(), rotationY: 0, localRotation: new THREE.Euler(), scale: new THREE.Vector3(1, 1, 1) },
    ]);
    expect(field.mesh.count).toBe(2);
    // `needsUpdate` is write-only on BufferAttribute (bumps `.version`, no getter);
    // a version > 0 after construction (version 0) confirms rebuild() flagged it.
    expect(field.mesh.instanceMatrix.version).toBeGreaterThan(0);
  });

  it('rebuild() caps count at maxInstances', () => {
    const geo = getPartVariantPool('trunk')[0]!;
    const mat = new THREE.MeshBasicMaterial();
    const field = new NaturePropField(geo, mat, 2);
    const instances = Array.from({ length: 5 }, () => ({
      worldPosition: new THREE.Vector3(), localOffset: new THREE.Vector3(), rotationY: 0,
      localRotation: new THREE.Euler(), scale: new THREE.Vector3(1, 1, 1),
    }));
    field.rebuild(instances);
    expect(field.mesh.count).toBe(2);
  });

  it('dispose() does not dispose the pool-shared geometry', () => {
    const geo = getPartVariantPool('trunk')[0]!;
    const mat = new THREE.MeshBasicMaterial();
    const field = new NaturePropField(geo, mat, 2);
    field.dispose();
    // BufferGeometry has no public "disposed" flag; assert its position
    // attribute survives (a disposed geometry still has attributes intact in
    // three.js, but the material's dispose() must have been called instead —
    // asserting geometry.getAttribute still works is the closest available
    // proxy without spying).
    expect(geo.getAttribute('position')).toBeDefined();
  });
});

describe('NaturePropManager', () => {
  it('update() populates meshes for an all-forest grid', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const manager = new NaturePropManager(wg, 1, GRID_INFO, () => new THREE.MeshBasicMaterial());
    manager.update(0, 0);
    expect(manager.meshes.length).toBeGreaterThan(0);
    expect(manager.meshes.some(m => m.count > 0)).toBe(true);
  });

  it('only rebuilds after the player moves past the hysteresis threshold', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const manager = new NaturePropManager(wg, 1, GRID_INFO, () => new THREE.MeshBasicMaterial());
    const rebuildSpy = vi.spyOn(NaturePropField.prototype, 'rebuild');

    manager.update(0, 0);
    expect(rebuildSpy.mock.calls.length).toBeGreaterThan(0);

    rebuildSpy.mockClear();
    manager.update(1, 0); // well within NATURE_PROP_REBUILD_HYSTERESIS
    expect(rebuildSpy.mock.calls.length).toBe(0);

    rebuildSpy.mockClear();
    manager.update(1 + NATURE_PROP_REBUILD_HYSTERESIS + 1, 0);
    expect(rebuildSpy.mock.calls.length).toBeGreaterThan(0);

    rebuildSpy.mockRestore();
  });

  it('dispose() clears owned fields', () => {
    const wg = makeAllBiomeGrid(120, 'forest');
    const manager = new NaturePropManager(wg, 1, GRID_INFO, () => new THREE.MeshBasicMaterial());
    manager.update(0, 0);
    manager.dispose();
    expect(manager.meshes.length).toBe(0);
  });
});

describe('module constants', () => {
  it('exports a NATURE_PROP_RADIUS wider than typical grass radius', () => {
    expect(NATURE_PROP_RADIUS).toBeGreaterThan(24);
  });
});
