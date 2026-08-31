import { describe, it, expect } from 'vitest';
import { WorldGrid, type BiomeId } from '@/world/WorldGrid';
import { selectGrassPlacements, packGrassInstanceBuffers } from '@/world/GrassField';

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
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('returns placements for an all-grassland window', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('excludes cells with a road feature', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { feature: 'road' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes cells with non-empty content', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { content: 'tree' });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes water cells (waterDepth > 0)', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const { col: c0, row: r0 } = wg.worldToGrid(-24, -24);
    const { col: c1, row: r1 } = wg.worldToGrid(24, 24);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) wg.set(col, row, { waterDepth: 1.5 });
    }
    const placements = selectGrassPlacements(wg, 0, 0, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('excludes out-of-bounds candidate tiles despite WorldGrid.get()\'s grassland default fallback', () => {
    // A tiny 4x4 grid — a window centered far outside it (world (500,500)) must
    // produce 0 placements, even though .get() on out-of-bounds col/row returns
    // a default cell reporting biome: 'grassland'.
    const wg = makeAllBiomeGrid(4, 'grassland');
    const placements = selectGrassPlacements(wg, 500, 500, 24, 1);
    expect(placements.length).toBe(0);
  });

  it('is deterministic for a fixed seed', () => {
    const wg = makeAllBiomeGrid(40, 'grassland');
    const a = selectGrassPlacements(wg, 0, 0, 24, 7);
    const b = selectGrassPlacements(wg, 0, 0, 24, 7);
    expect(a).toEqual(b);
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
