import { describe, it, expect } from 'vitest';
import {
  LAND_BIOME_CORNER_PULL_WU, pluralityBiomeConfig, landBiomeCornerPull,
} from './LandBiomeCornerField';
import { WorldGrid } from './WorldGrid';
import type { BiomeId } from './WorldGrid';

describe('pluralityBiomeConfig', () => {
  it('marks the 3 matching corners 1 and the lone differing corner 0 (3-vs-1)', () => {
    // NW,NE,SW = grassland; SE = desert.
    expect(pluralityBiomeConfig(['grassland', 'grassland', 'desert', 'grassland']))
      .toEqual([1, 1, 0, 1]);
  });
  it('breaks a 2-vs-2 tie toward whichever biome sorts earlier in BiomeId order', () => {
    // grassland vs desert -> desert wins the tie (earlier in BIOME_ORDER).
    // NW,NE = grassland; SE,SW = desert (adjacent pair, "edge" pattern).
    expect(pluralityBiomeConfig(['grassland', 'grassland', 'desert', 'desert']))
      .toEqual([0, 0, 1, 1]);
  });
  it('breaks a 2-vs-2 diagonal tie the same way', () => {
    // NW,SE = grassland; NE,SW = desert (diagonal pattern).
    expect(pluralityBiomeConfig(['grassland', 'desert', 'grassland', 'desert']))
      .toEqual([0, 1, 0, 1]);
  });
  it('with 4 distinct biomes, plurality is whichever sorts earliest (all tied at count 1)', () => {
    // grassland, desert, forest, savanna -> desert sorts earliest.
    expect(pluralityBiomeConfig(['grassland', 'desert', 'forest', 'savanna']))
      .toEqual([0, 1, 0, 0]);
  });
});

/** Sets every tile in an all-grassland `size`x`size` grid to the given
 *  biome, except the listed [col, row] overrides. */
function makeBiomeGrid(size: number, overrides: Array<[number, number, BiomeId]>): WorldGrid {
  const wg = new WorldGrid(size, size);
  for (const [c, r, biome] of overrides) wg.set(c, r, { biome });
  return wg;
}

describe('landBiomeCornerPull', () => {
  it('is zero for an all-grassland vertex (full, same biome everywhere)', () => {
    const wg = makeBiomeGrid(5, []);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the lone differing biome tile (outer_corner pattern)', () => {
    // Vertex (2,2): NW=(1,1) is desert, NE=(2,1)/SE=(2,2)/SW=(1,2) grassland.
    const wg = makeBiomeGrid(5, [[1, 1, 'desert']]);
    const [dx, dz] = landBiomeCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
  });

  it('is zero at a vertex where any of the 4 tiles is water (scope guard: dry land only)', () => {
    // NW=(1,1) desert, NE=(2,1) ocean (water) -- should not pull, unlike
    // the all-dry outer_corner case above.
    const wg = makeBiomeGrid(5, [[1, 1, 'desert']]);
    wg.set(2, 1, { biome: 'ocean', waterDepth: 2.0 });
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a straight 2-biome border (edge pattern)', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert'], [2, 1, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('is zero for a checkerboard 2-biome vertex (diagonal pattern)', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert'], [2, 2, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual([0, 0]);
  });

  it('pulls toward the plurality-minority corner with 4 distinct biomes at one vertex', () => {
    // Vertex (2,2): NW=(1,1) grassland, NE=(2,1) desert, SE=(2,2) forest, SW=(1,2) savanna.
    // Plurality (earliest-sorting, all tied at count 1) is desert -> config
    // [0,1,0,0] -> outer_corner, minority index 1 (NE) -> pull toward NE = [1,-1] * amplitude.
    const wg = makeBiomeGrid(5, [[1, 1, 'grassland'], [2, 1, 'desert'], [2, 2, 'forest'], [1, 2, 'savanna']]);
    const [dx, dz] = landBiomeCornerPull(wg, 2, 2);
    expect(dx).toBeCloseTo(LAND_BIOME_CORNER_PULL_WU, 10);
    expect(dz).toBeCloseTo(-LAND_BIOME_CORNER_PULL_WU, 10);
  });

  it('is deterministic', () => {
    const wg = makeBiomeGrid(5, [[1, 1, 'desert']]);
    expect(landBiomeCornerPull(wg, 2, 2)).toEqual(landBiomeCornerPull(wg, 2, 2));
  });

  it('treats out-of-bounds tiles as default grassland (dry land), matching WorldGrid.get()\'s own default', () => {
    const wg = makeBiomeGrid(3, [[0, 0, 'desert']]);
    expect(() => landBiomeCornerPull(wg, 0, 0)).not.toThrow();
  });
});
