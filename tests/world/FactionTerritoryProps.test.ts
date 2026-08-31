import { describe, it, expect } from 'vitest';
import { hasBlock, getMaterialKey, BLOCK_UNIT } from '@/world/buildings/BlockKit';
import {
  buildVulperiaWarrenMoundGrid, buildVulperiaBurrowHoleGrid, buildVulperiaDenMarkerGrid,
  buildUndeadGravestoneGrid, buildUndeadBonePileGrid, buildUndeadCrumblingMoundGrid,
} from '@/world/buildings/FactionTerritoryProps';

describe('vulperia territory props', () => {
  it('warren mound has a carved burrow-entrance gap at the front, ground level', () => {
    const grid = buildVulperiaWarrenMoundGrid(1);
    // Warren mound uses w=2.5,d=2,h=1.2 internally (bw=5, bd=4) -- see
    // buildVulperiaWarrenMoundGrid's own implementation for these exact
    // dimensions, mirrored here only to locate the front-centre cell.
    // cx uses the SAME (bw-1)/2 formula buildVulperiaDenMoundGrid()
    // itself uses internally for its centre column (NOT Math.round(bw/2),
    // which gives the wrong column for odd bw — e.g. bw=5 gives 3 instead
    // of the true centre 2, landing on the facade frame post instead of
    // the carved notch).
    const bw = Math.max(3, Math.round(2.5 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(2 / BLOCK_UNIT));
    const cx = Math.round((bw - 1) / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
  });

  it('burrow-hole cluster is grounded and non-empty', () => {
    // Uses the burrow-hole variant (facade: false) rather than the warren
    // mound (facade: true) for this check specifically to avoid ambiguity
    // with the carved doorway notch — at the warren mound's small
    // dimensions the notch can consume a column's entire height, which
    // this "every occupied column has a block at by=0" check isn't
    // designed to reason about. The doorway-gap property itself is
    // covered by the dedicated test above.
    const grid = buildVulperiaBurrowHoleGrid(2);
    expect(grid.cells.size).toBeGreaterThan(0);
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      expect(hasBlock(grid, bx!, 0, bz!)).toBe(true);
    }
  });

  it('burrow-hole cluster is smaller (fewer blocks) than the warren mound', () => {
    const mound = buildVulperiaWarrenMoundGrid(3);
    const hole = buildVulperiaBurrowHoleGrid(3);
    expect(hole.cells.size).toBeLessThan(mound.cells.size);
    expect(hole.cells.size).toBeGreaterThan(0);
  });

  it('den marker is a distinct shape: a narrow vertical stack topped by a wider "woven" cap, using bark material', () => {
    const grid = buildVulperiaDenMarkerGrid();
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('bark');
    // Top layer (by=2) should be wider than a single column -- at least 3 blocks.
    let topLayerCount = 0;
    for (const k of grid.cells.keys()) {
      const [, by] = k.split(',').map(Number);
      if (by === 2) topLayerCount++;
    }
    expect(topLayerCount).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same seed', () => {
    const a = buildVulperiaWarrenMoundGrid(42);
    const b = buildVulperiaWarrenMoundGrid(42);
    expect([...a.cells.entries()]).toEqual([...b.cells.entries()]);
  });
});

describe('undead territory props', () => {
  it('gravestone is a vertical slab: taller than it is wide', () => {
    const grid = buildUndeadGravestoneGrid();
    let maxBy = -Infinity, minBy = Infinity;
    const xs = new Set<number>(), zs = new Set<number>();
    for (const k of grid.cells.keys()) {
      const [bx, by, bz] = k.split(',').map(Number);
      maxBy = Math.max(maxBy, by!); minBy = Math.min(minBy, by!);
      xs.add(bx!); zs.add(bz!);
    }
    const height = maxBy - minBy + 1;
    const footprint = Math.max(xs.size, zs.size);
    expect(height).toBeGreaterThan(footprint);
  });

  it('gravestone uses the ashstone material', () => {
    const grid = buildUndeadGravestoneGrid();
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('ashstone');
  });

  it('bone-pile marker is low and irregular: shorter than the gravestone, more than 1 block footprint', () => {
    const pile = buildUndeadBonePileGrid(1);
    const grave = buildUndeadGravestoneGrid();
    let pileMaxBy = -Infinity, graveMaxBy = -Infinity;
    const footprint = new Set<string>();
    for (const k of pile.cells.keys()) {
      const [bx, by, bz] = k.split(',').map(Number);
      pileMaxBy = Math.max(pileMaxBy, by!);
      footprint.add(`${bx},${bz}`);
    }
    for (const k of grave.cells.keys()) {
      const [, by] = k.split(',').map(Number);
      graveMaxBy = Math.max(graveMaxBy, by!);
    }
    expect(pileMaxBy).toBeLessThan(graveMaxBy);
    expect(footprint.size).toBeGreaterThan(1);
  });

  it('crumbling burial mound shares the warren mound\'s silhouette family (grounded, dome-shaped) but is a different material', () => {
    const grid = buildUndeadCrumblingMoundGrid(1);
    expect(grid.cells.size).toBeGreaterThan(0);
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      expect(hasBlock(grid, bx!, 0, bz!)).toBe(true); // grounded, like the vulperia mound
    }
    expect(getMaterialKey(grid, 0, 0, 0)).not.toBe('earth'); // not vulperia's material
  });
});
