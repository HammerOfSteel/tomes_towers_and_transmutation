import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import {
  selectGrassPlacements, packGrassInstanceBuffers,
  createGrassBladeGeometry, createGrassMaterial,
  GrassField, REBUILD_HYSTERESIS, GRASS_PRESETS,
} from '@/world/GrassField';

function makeAllBiomeGrid(size: number, biome: BiomeId): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome });
  }
  return g;
}

describe('selectGrassPlacements', () => {
  it('returns 0 placements for a window with no grassland cells', () => {
    const wg = makeAllBiomeGrid(40, 'desert');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('returns placements for an all-grassland window', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('excludes cells with a road feature', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { feature: 'road' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes cells with non-empty content', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { content: 'tree' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes water cells (waterDepth > 0)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { waterDepth: 1.5 });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('excludes out-of-bounds candidate tiles despite WorldGrid.get()\'s grassland default fallback', () => {
    // A tiny 4x4 grid — a window centered far outside it (world (500,500)) must
    // produce 0 placements, even though .get() on out-of-bounds col/row returns
    // a default cell reporting biome: 'grassland'.
    const wg = makeAllBiomeGrid(4, 'grassland');
    const placements = selectGrassPlacements(wg, 500, 500, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const a = selectGrassPlacements(wg, 0, 0, 24, 7, 'grassland', 35);
    const b = selectGrassPlacements(wg, 0, 0, 24, 7, 'grassland', 35);
    expect(a).toEqual(b);
  });

  it('filters by the given biome — an all-savanna grid produces 0 placements when queried for grassland', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'grassland', 35);
    expect(placements.length).toBe(0);
  });

  it('filters by the given biome — an all-savanna grid produces placements when queried for savanna', () => {
    const wg = makeAllBiomeGrid(40, 'savanna');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1, 'savanna', 15);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('never cross-bleeds between any two of the 5 grass-bearing biomes (full N×N isolation matrix)', () => {
    const biomes = ['grassland', 'savanna', 'tundra', 'forest', 'taiga'] as const;
    for (const gridBiome of biomes) {
      const wg = makeAllBiomeGrid(40, gridBiome);
      for (const queryBiome of biomes) {
        const placements = selectGrassPlacements(wg, 0, 0, 24, 1, queryBiome, 20);
        if (queryBiome === gridBiome) {
          expect(placements.length).toBeGreaterThan(0);
        } else {
          expect(placements.length).toBe(0);
        }
      }
    }
  });
});

describe('packGrassInstanceBuffers', () => {
  it('packs N placements into Float32Arrays of length N*4, at the expected offsets', () => {
    const placements = [
      { x: 1, y: 2, z: 3, rotation: 0.5, scaleX: 0.8, scaleY: 0.9, tilt: 0.1, colorVar: 0.4 },
      { x: 4, y: 5, z: 6, rotation: 1.5, scaleX: 1.1, scaleY: 1.2, tilt: -0.1, colorVar: 0.7 },
    ];
    const { positionRotation, scaleAndVariation } = packGrassInstanceBuffers(placements);
    expect(positionRotation.length).toBe(8);
    expect(scaleAndVariation.length).toBe(8);
    expect(positionRotation[0]).toBe(1);
    expect(positionRotation[1]).toBe(2);
    expect(positionRotation[2]).toBe(3);
    expect(positionRotation[3]).toBe(0.5);
    expect(scaleAndVariation[4]).toBeCloseTo(1.1, 5);
    expect(scaleAndVariation[7]).toBeCloseTo(0.7, 5);
  });

  it('returns empty arrays for an empty placements list', () => {
    const { positionRotation, scaleAndVariation } = packGrassInstanceBuffers([]);
    expect(positionRotation.length).toBe(0);
    expect(scaleAndVariation.length).toBe(0);
  });
});

describe('createGrassBladeGeometry', () => {
  it('produces the expected vertex and index counts for the default tuning', () => {
    const geo = createGrassBladeGeometry(GRASS_PRESETS.grassland);
    // (segments+1)*2 cross-section verts + 1 tip vertex = 5*2+1 = 11
    expect(geo.attributes.position.count).toBe(11);
    // segments*6 (2 tris per cross-section pair) + 3 (tip triangle) = 4*6+3 = 27
    expect(geo.index).not.toBeNull();
    expect(geo.index!.count).toBe(27);
  });

  it('computes vertex normals (non-zero normal attribute)', () => {
    const geo = createGrassBladeGeometry(GRASS_PRESETS.grassland);
    expect(geo.attributes.normal).toBeDefined();
  });
});

describe('createGrassMaterial', () => {
  it('declares the custom instanced attributes and wind uniforms in the vertex shader', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
    expect(mat.vertexShader).toContain('aPositionRotation');
    expect(mat.vertexShader).toContain('aScaleVariation');
    expect(mat.vertexShader).toContain('uWindTime');
    expect(mat.vertexShader).toContain('uFadeStart');
    expect(mat.vertexShader).toContain('uFadeCenter');
  });

  it('computes the distance fade from uFadeCenter (a world XZ position), not from cameraPosition', () => {
    // Regression test: the fade used to measure distance from the actual camera, but this
    // game's isometric camera sits at a large fixed offset (~28 WU, see CameraRig.ts's
    // ISO_OFFSET) from the player — so grass right at the player's feet was always beyond
    // FADE_END and got fully discarded, while only a narrow sliver of blades (in the one
    // direction that happened to reduce camera distance) ever rendered. The fade must be
    // computed from a world-space center (the player's position, passed in via uFadeCenter)
    // instead.
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
    expect(mat.vertexShader).not.toContain('distance(cameraPosition, worldPos)');
    expect(mat.vertexShader).toMatch(/distance\(\s*worldPos\.xz\s*,\s*uFadeCenter\s*\)/);
  });

  it('declares the color/shading uniforms in the fragment shader', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
    expect(mat.fragmentShader).toContain('uBaseColor');
    expect(mat.fragmentShader).toContain('uTipColor');
    expect(mat.fragmentShader).toContain('uSssStrength');
  });

  it('has sensible default uniform values', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.grassland);
    expect(mat.uniforms.uWindTime.value).toBe(0);
    expect(mat.uniforms.uDryAmount.value).toBe(0);
    expect(mat.transparent).toBe(true);
    expect((mat.uniforms.uFadeCenter.value as THREE.Vector2).x).toBe(0);
    expect((mat.uniforms.uFadeCenter.value as THREE.Vector2).y).toBe(0);
  });

  it('reflects the given preset\'s colors, not always the grassland defaults', () => {
    const mat = createGrassMaterial(GRASS_PRESETS.savanna);
    const baseColor = mat.uniforms.uBaseColor.value as THREE.Color;
    const expected = new THREE.Color(GRASS_PRESETS.savanna.baseColor);
    expect(baseColor.getHex()).toBe(expected.getHex());
    expect(mat.uniforms.uDryAmount.value).toBe(GRASS_PRESETS.savanna.dryAmount);
    expect(mat.uniforms.uWindBase.value).toBe(GRASS_PRESETS.savanna.windBase);
  });
});

describe('GrassField', () => {
  function makeAllGrasslandGrid(size = 40): WorldGrid {
    const g = new WorldGrid(size, size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) g.set(col, row, { elevation: 1, biome: 'grassland' });
    }
    return g;
  }

  it('places no blades before the first update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    expect(field.mesh.count).toBe(0);
  });

  it('places blades on the first update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    field.update(0, 0);
    expect(field.mesh.count).toBeGreaterThan(0);
  });

  it('does not rebuild when the player moves less than REBUILD_HYSTERESIS', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    field.update(0, 0);
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(0);
    field.update(1, 1); // well under REBUILD_HYSTERESIS
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(0); // unchanged
  });

  it('rebuilds once the player moves past REBUILD_HYSTERESIS', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    field.update(0, 0);
    field.update(REBUILD_HYSTERESIS + 1, 0);
    expect((field as unknown as { _lastBuildX: number })._lastBuildX).toBe(REBUILD_HYSTERESIS + 1);
  });

  it('updates the fade-center uniform to the current player position on every update() call, even when the instance buffer does not rebuild (regression: fade must track the player continuously, not just at rebuild boundaries, or grass fades out near the player between rebuilds)', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    const material = (field as unknown as { _material: THREE.ShaderMaterial })._material;

    field.update(0, 0);
    expect((material.uniforms.uFadeCenter.value as THREE.Vector2).x).toBe(0);
    expect((material.uniforms.uFadeCenter.value as THREE.Vector2).y).toBe(0);

    // Move less than REBUILD_HYSTERESIS — instance buffer does NOT rebuild, but the fade
    // center must still update every frame so the fade radius tracks the player smoothly.
    field.update(2, 3);
    expect((material.uniforms.uFadeCenter.value as THREE.Vector2).x).toBe(2);
    expect((material.uniforms.uFadeCenter.value as THREE.Vector2).y).toBe(3);
  });

  it('tickWind() advances the wind time uniform without needing an update() call', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    const material = (field as unknown as { _material: THREE.ShaderMaterial })._material;
    expect(material.uniforms.uWindTime.value).toBe(0);
    field.tickWind(0.5);
    expect(material.uniforms.uWindTime.value).toBeCloseTo(0.5);
  });

  it('dispose() disposes the mesh geometry and material', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.grassland);
    const geoDisposeSpy = vi.spyOn(field.mesh.geometry, 'dispose');
    const material = (field as unknown as { _material: THREE.ShaderMaterial })._material;
    const matDisposeSpy = vi.spyOn(material, 'dispose');
    field.dispose();
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('places blades using a non-grassland preset (tundra) on an all-tundra grid', () => {
    const wg = makeAllBiomeGrid(40, 'tundra');
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    field.update(0, 0);
    expect(field.mesh.count).toBeGreaterThan(0);
  });

  it('does NOT place blades using the tundra preset on an all-grassland grid (no cross-biome bleed)', () => {
    const wg = makeAllGrasslandGrid();
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    field.update(0, 0);
    expect(field.mesh.count).toBe(0);
  });

  it('exposes the constructor-supplied preset as a public readonly field', () => {
    const wg = makeAllBiomeGrid(40, 'tundra');
    const field = new GrassField(wg, 42, GRASS_PRESETS.tundra);
    expect(field.preset.biome).toBe('tundra');
    expect(field.preset.maxBlades).toBe(GRASS_PRESETS.tundra.maxBlades);
  });
});

describe('GRASS_PRESETS', () => {
  const EXPECTED_BIOMES = ['grassland', 'savanna', 'tundra', 'forest', 'taiga'] as const;

  it('has exactly the 5 expected biome keys', () => {
    expect(Object.keys(GRASS_PRESETS).sort()).toEqual([...EXPECTED_BIOMES].sort());
  });

  it('each preset\'s biome field matches its own key', () => {
    for (const key of EXPECTED_BIOMES) {
      expect(GRASS_PRESETS[key].biome).toBe(key);
    }
  });

  it('each preset has a positive density and maxBlades', () => {
    for (const key of EXPECTED_BIOMES) {
      expect(GRASS_PRESETS[key].densityPerUnit2).toBeGreaterThan(0);
      expect(GRASS_PRESETS[key].maxBlades).toBeGreaterThan(0);
    }
  });

  it('maxBlades for the 4 new biomes follows ceil(2304 * density * 1.25) rounded up to the ' +
     'nearest 1000 (grassland is unchanged from batch 1 and intentionally excluded from this ' +
     'formula check — see the next test)', () => {
    for (const key of ['savanna', 'tundra', 'forest', 'taiga'] as const) {
      const density = GRASS_PRESETS[key].densityPerUnit2;
      const expected = Math.ceil((2304 * density * 1.25) / 1000) * 1000;
      expect(GRASS_PRESETS[key].maxBlades).toBe(expected);
    }
  });

  it('grassland maxBlades remains 100_000 (unchanged from batch 1)', () => {
    expect(GRASS_PRESETS.grassland.maxBlades).toBe(100_000);
  });
});
