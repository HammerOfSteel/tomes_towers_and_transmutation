import { describe, it, expect } from 'vitest';
import { floodFillBasin, selectLakeSources } from '@/world/LakeSiting';

describe('floodFillBasin', () => {
  it('fills a connected same-elevation region', () => {
    const elev = [
      [3, 2, 2, 3],
      [3, 2, 2, 3],
      [3, 3, 3, 3],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const basin = floodFillBasin({ col: 1, row: 0 }, 4, 3, elevationAt, () => false, 100);
    const keys = new Set(basin.map(p => `${p.col},${p.row}`));
    expect(keys).toEqual(new Set(['1,0', '2,0', '1,1', '2,1']));
  });

  it('does not cross into a blocked tile', () => {
    const elevationAt = () => 2;
    const isBlocked = (c: number, _r: number) => c === 2;
    const basin = floodFillBasin({ col: 0, row: 0 }, 4, 1, elevationAt, isBlocked, 100);
    expect(basin.some(p => p.col === 2)).toBe(false);
    expect(basin.some(p => p.col === 3)).toBe(false); // unreachable past the block
  });

  it('respects maxSize', () => {
    const elevationAt = () => 2; // fully flat 10x10 — would fill 100 tiles unbounded
    const basin = floodFillBasin({ col: 5, row: 5 }, 10, 10, elevationAt, () => false, 5);
    expect(basin.length).toBeLessThanOrEqual(5);
  });

  it('returns a single tile when fully isolated', () => {
    const elev = [[1, 9], [9, 9]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const basin = floodFillBasin({ col: 0, row: 0 }, 2, 2, elevationAt, () => false, 100);
    expect(basin).toEqual([{ col: 0, row: 0 }]);
  });
});

describe('selectLakeSources', () => {
  it('only returns local minima', () => {
    const elev = [
      [5, 5, 5],
      [5, 1, 5],
      [5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const sources = selectLakeSources(3, 3, elevationAt, () => false, 0, 5, () => 0.5);
    expect(sources).toEqual([{ col: 1, row: 1 }]);
  });

  it('excludes blocked tiles even if a local minimum', () => {
    const elev = [[5, 5], [5, 1]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const isBlocked = (c: number, r: number) => c === 1 && r === 1;
    const sources = selectLakeSources(2, 2, elevationAt, isBlocked, 0, 5, () => 0.5);
    expect(sources).toEqual([]);
  });

  it('respects count and minSpacing', () => {
    const elev = [
      [1, 5, 5, 5, 1],
      [5, 5, 5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const sources = selectLakeSources(5, 2, elevationAt, () => false, 3, 5, () => 0.5);
    expect(sources.length).toBeLessThanOrEqual(2);
    if (sources.length === 2) {
      const d = Math.hypot(sources[0]!.col - sources[1]!.col, sources[0]!.row - sources[1]!.row);
      expect(d).toBeGreaterThanOrEqual(3);
    }
  });
});
