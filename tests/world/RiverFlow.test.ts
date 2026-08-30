import { describe, it, expect } from 'vitest';
import { flowDownhill, selectRiverSources } from '@/world/RiverFlow';

describe('flowDownhill', () => {
  it('walks toward the lowest-scoring neighbor', () => {
    // 3x3 grid, elevation drops to 0 at (2,1) so the walk terminates there
    // deterministically (elevation-0 termination) after one downhill step;
    // center at (1,1) so terminateRadius=0 never triggers early.
    const elev = [
      [5, 5, 5],
      [5, 4, 0],
      [5, 5, 5],
    ];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const path = flowDownhill({ col: 1, row: 1 }, 3, 3, elevationAt, () => false, 0, 10);
    expect(path[0]).toEqual({ col: 1, row: 1 });
    expect(path[path.length - 1]).toEqual({ col: 2, row: 1 });
  });

  it('terminates once within terminateRadius of grid center', () => {
    const elevationAt = () => 5; // flat — would otherwise run to maxSteps
    const path = flowDownhill({ col: 0, row: 2 }, 5, 5, elevationAt, () => false, 3, 50);
    expect(path.length).toBeLessThan(50);
  });

  it('terminates when current elevation is 0', () => {
    const elev = [[0, 3], [3, 3]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const path = flowDownhill({ col: 0, row: 0 }, 2, 2, elevationAt, () => false, 0, 10);
    expect(path).toEqual([{ col: 0, row: 0 }]);
  });

  it('never steps onto an isRiver tile', () => {
    const elev = [[5, 4], [4, 3]];
    const elevationAt = (c: number, r: number) => elev[r]![c]!;
    const isRiver = (c: number, r: number) => c === 1 && r === 0; // block the (1,0) neighbor
    const path = flowDownhill({ col: 0, row: 0 }, 2, 2, elevationAt, isRiver, 0, 10);
    expect(path.some(p => p.col === 1 && p.row === 0)).toBe(false);
  });

  it('respects the maxSteps cap', () => {
    const elevationAt = () => 5; // flat, no natural termination
    const path = flowDownhill({ col: 0, row: 0 }, 20, 20, elevationAt, () => false, 0, 3);
    expect(path.length).toBeLessThanOrEqual(4); // source + up to 3 steps
  });
});

describe('selectRiverSources', () => {
  const flatHighRim = (w: number, h: number) => (c: number, r: number) => {
    const ghw = (w - 1) / 2, ghh = (h - 1) / 2;
    const dist = Math.sqrt((c - ghw) ** 2 + (r - ghh) ** 2);
    return dist > ghw * 0.7 ? 5 : 1; // rim is high, interior is low
  };

  it('only returns tiles meeting min level and min radius', () => {
    const elevationAt = flatHighRim(11, 11);
    const rand = () => 0.5;
    const sources = selectRiverSources(11, 11, elevationAt, 3, 3, 0, 10, rand);
    for (const s of sources) {
      expect(elevationAt(s.col, s.row)).toBeGreaterThanOrEqual(3);
    }
  });

  it('never returns more than count', () => {
    const elevationAt = flatHighRim(21, 21);
    const rand = () => 0.5;
    const sources = selectRiverSources(21, 21, elevationAt, 3, 3, 0, 2, rand);
    expect(sources.length).toBeLessThanOrEqual(2);
  });

  it('enforces minimum spacing between chosen sources', () => {
    const elevationAt = flatHighRim(21, 21);
    const rand = () => 0.5;
    const sources = selectRiverSources(21, 21, elevationAt, 3, 3, 5, 10, rand);
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const d = Math.hypot(sources[i]!.col - sources[j]!.col, sources[i]!.row - sources[j]!.row);
        expect(d).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('returns empty array when no candidates qualify', () => {
    const elevationAt = () => 0;
    const sources = selectRiverSources(5, 5, elevationAt, 3, 0, 0, 5, () => 0.5);
    expect(sources).toEqual([]);
  });
});
