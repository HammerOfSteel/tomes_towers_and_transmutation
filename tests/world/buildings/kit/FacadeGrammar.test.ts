import { describe, expect, it } from 'vitest';

async function loadFacadeGrammar() {
  return import('../../../../src/world/buildings/kit/FacadeGrammar');
}

function sumBayWidths(layout: { bays: Array<{ width: number }> }): number {
  return layout.bays.reduce((sum, bay) => sum + bay.width, 0);
}

function endOfLastBay(layout: { bays: Array<{ x: number; width: number }> }): number {
  const lastBay = layout.bays.at(-1);
  return lastBay ? lastBay.x + lastBay.width : 0;
}

function specialRepeatIndex(layout: { bays: Array<{ kind: string; special?: boolean }> }): number {
  return layout.bays.filter(bay => bay.kind === 'repeat').findIndex(bay => bay.special);
}

describe('layoutFacade', () => {
  it('fills both 7.3 and 9.1 facade widths exactly with fixed modules unchanged and filler absorbing the remainder', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [
          { id: 'window-plain', weight: 3 },
          { id: 'window-arched', weight: 1 },
        ],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    const narrow = layoutFacade(7.3, spec, 123);
    const wide = layoutFacade(9.1, spec, 123);

    for (const [layout, totalWidth, expectedRepeatCount, expectedFillerWidth] of [
      [narrow, 7.3, 6, 0.1],
      [wide, 9.1, 7, 0.9],
    ] as const) {
      expect(sumBayWidths(layout)).toBeCloseTo(totalWidth, 10);
      expect(endOfLastBay(layout)).toBeCloseTo(totalWidth, 10);

      const door = layout.bays.find(bay => bay.kind === 'fixed');
      expect(door?.id).toBe('door');
      expect(door?.width).toBe(1.2);

      const windows = layout.bays.filter(bay => bay.kind === 'repeat');
      expect(windows).toHaveLength(expectedRepeatCount);
      expect(windows.every(bay => bay.width === 1.0)).toBe(true);

      const filler = layout.bays.find(bay => bay.kind === 'float');
      expect(filler?.id).toBe('filler');
      expect(filler?.width).toBeCloseTo(expectedFillerWidth, 10);
      expect(filler?.width).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic for the same seed and can vary weighted repeat picks and special-bay placement for a different seed', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [
          { id: 'window-common', weight: 4 },
          { id: 'window-rare', weight: 1 },
        ],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    const layoutA = layoutFacade(7.3, spec, 77);
    const layoutB = layoutFacade(7.3, spec, 77);
    const layoutC = layoutFacade(7.3, spec, 78);

    expect(layoutA).toEqual(layoutB);
    expect(layoutC).not.toEqual(layoutA);
  });

  it('scales relative bay widths proportionally with total facade width', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      { kind: 'relative', fraction: 0.2 },
      { kind: 'float', id: 'filler' },
    ] as const;

    const narrow = layoutFacade(7.3, spec, 123);
    const wide = layoutFacade(9.1, spec, 123);

    expect(narrow.bays.find(bay => bay.kind === 'relative')).toMatchObject({
      id: 'relative-0',
      kind: 'relative',
      width: 7.3 * 0.2,
    });
    expect(wide.bays.find(bay => bay.kind === 'relative')).toMatchObject({
      id: 'relative-0',
      kind: 'relative',
      width: 9.1 * 0.2,
    });
  });

  it('fills exactly with fixed, relative, repeat, and float segments at multiple facade widths', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [{ id: 'window', weight: 1 }],
      },
      { kind: 'relative', id: 'pier', fraction: 0.2 },
      { kind: 'float', id: 'filler' },
    ] as const;

    for (const totalWidth of [7.3, 9.1]) {
      const layout = layoutFacade(totalWidth, spec, 5);
      const relative = layout.bays.find(bay => bay.kind === 'relative');

      expect(sumBayWidths(layout)).toBeCloseTo(totalWidth, 10);
      expect(endOfLastBay(layout)).toBeCloseTo(totalWidth, 10);
      expect(relative?.id).toBe('pier');
      expect(relative?.width).toBeCloseTo(totalWidth * 0.2, 10);
    }
  });

  it('marks exactly one repeat bay as special when repeat bays are placed', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [
          { id: 'window-common', weight: 3 },
          { id: 'window-rare', weight: 1 },
        ],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    const layout = layoutFacade(6.4, spec, 9);
    const repeatBays = layout.bays.filter(bay => bay.kind === 'repeat');
    const specialBays = repeatBays.filter(bay => bay.special);

    expect(repeatBays.length).toBeGreaterThan(0);
    expect(specialBays).toHaveLength(1);
    expect(layoutFacade(6.4, spec, 9)).toEqual(layout);
  });

  it('pins the exact special repeat bay for known seeds and varies it across seeds', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [
          { id: 'window-common', weight: 3 },
          { id: 'window-rare', weight: 1 },
        ],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    expect(specialRepeatIndex(layoutFacade(6.4, spec, 0))).toBe(4);
    expect(specialRepeatIndex(layoutFacade(6.4, spec, 1))).toBe(0);
    expect(specialRepeatIndex(layoutFacade(6.4, spec, 7))).toBe(1);
  });

  it('does not mark a special bay when no repeat instances are placed', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        max: 0,
        candidates: [{ id: 'window', weight: 1 }],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    const layout = layoutFacade(2.0, spec, 9);

    expect(layout.bays.some(bay => bay.special)).toBe(false);
    expect(layout.bays.filter(bay => bay.kind === 'repeat')).toHaveLength(0);
    expect(sumBayWidths(layout)).toBeCloseTo(2.0, 10);
  });

  it('supports exact-fit layouts with zero repeats and zero-width float filler', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        max: 0,
        candidates: [{ id: 'window', weight: 1 }],
      },
      { kind: 'relative', id: 'pier', fraction: 0.7 },
      { kind: 'float', id: 'filler' },
    ] as const;

    const layout = layoutFacade(4.0, spec, 3);
    const filler = layout.bays.find(bay => bay.kind === 'float');

    expect(layout.bays.filter(bay => bay.kind === 'repeat')).toHaveLength(0);
    expect(filler?.width).toBe(0);
    expect(sumBayWidths(layout)).toBeCloseTo(4.0, 10);
    expect(endOfLastBay(layout)).toBeCloseTo(4.0, 10);
  });

  it('biases weighted repeat candidates toward higher weights across many seeds', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      {
        kind: 'repeat',
        width: 1.0,
        candidates: [
          { id: 'window-common', weight: 5 },
          { id: 'window-rare', weight: 1 },
        ],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    let commonCount = 0;
    let rareCount = 0;

    for (let seed = 0; seed < 300; seed++) {
      const layout = layoutFacade(5.2, spec, seed);
      for (const bay of layout.bays.filter(b => b.kind === 'repeat')) {
        if (bay.id === 'window-common') commonCount++;
        if (bay.id === 'window-rare') rareCount++;
      }
    }

    expect(commonCount).toBeGreaterThan(rareCount * 2);
  });

  it('does not reject valid large facades just because cumulative floating-point error drifts slightly', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      { kind: 'repeat', id: 'slit-window', width: 0.1 },
      { kind: 'float', id: 'filler' },
    ] as const;

    const layout = layoutFacade(10000.05, spec, 42);
    expect(sumBayWidths(layout)).toBeCloseTo(10000.05, 6);
    expect(endOfLastBay(layout)).toBeCloseTo(10000.05, 6);
  });

  it('throws a clear error when fixed widths plus minimum repeat widths cannot fit within the facade', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      {
        kind: 'repeat',
        width: 1.0,
        min: 2,
        candidates: [{ id: 'window', weight: 1 }],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    expect(() => layoutFacade(3.0, spec, 5)).toThrowError(/minimum required facade width/i);
  });

  it('throws the same overflow error when fixed, relative, and minimum repeat widths cannot fit', async () => {
    const { layoutFacade } = await loadFacadeGrammar();
    const spec = [
      { kind: 'fixed', id: 'door', width: 1.2 },
      { kind: 'relative', id: 'pier', fraction: 0.5 },
      {
        kind: 'repeat',
        width: 1.0,
        min: 2,
        candidates: [{ id: 'window', weight: 1 }],
      },
      { kind: 'float', id: 'filler' },
    ] as const;

    expect(() => layoutFacade(4.0, spec, 5)).toThrowError(/minimum required facade width/i);
  });
});
