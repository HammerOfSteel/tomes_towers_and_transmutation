import { describe, it, expect } from 'vitest';
import { selectLampRoadTiles } from '@/world/LampPlacement';

describe('selectLampRoadTiles', () => {
  it('returns every Nth road tile starting from index 0', () => {
    const roads = Array.from({ length: 10 }, (_, i) => ({ col: i, row: 0 }));
    const result = selectLampRoadTiles(roads, 4);
    expect(result).toEqual([{ col: 0, row: 0 }, { col: 4, row: 0 }, { col: 8, row: 0 }]);
  });

  it('returns an empty array for an empty input', () => {
    expect(selectLampRoadTiles([], 4)).toEqual([]);
  });

  it('returns just the first tile when stride exceeds array length', () => {
    const roads = [{ col: 1, row: 2 }, { col: 3, row: 4 }];
    expect(selectLampRoadTiles(roads, 10)).toEqual([{ col: 1, row: 2 }]);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const roads = Array.from({ length: 17 }, (_, i) => ({ col: i, row: i * 2 }));
    expect(selectLampRoadTiles(roads, 4)).toEqual(selectLampRoadTiles(roads, 4));
  });

  it('throws for a non-positive stride', () => {
    expect(() => selectLampRoadTiles([{ col: 0, row: 0 }], 0)).toThrow();
  });
});
