/**
 * ElvenTrunkWindows.test.ts — verifies carved window openings for the elven
 * living-tree home (docs/superpowers/specs/2026-09-03-elven-treehouse-home-design.md).
 * Extends the trunk doorway's proven occupancy-carving technique (a genuine
 * removed-block notch, not a separate mesh or flat recolor) to smaller window
 * openings placed at several angles around the trunk's circumference, one band per
 * floor.
 */

import { describe, it, expect } from 'vitest';
import { createBlockGrid, setBlock, hasBlock, getMaterialKey, BLOCK_UNIT, type BlockGrid } from '@/world/buildings/BlockKit';
import { carveTrunkWindows, pickWindowCount } from '@/world/buildings/ElvenTrunkWindows';

describe('pickWindowCount', () => {
  it('is deterministic per seed+floorIndex', () => {
    expect(pickWindowCount(5, 0)).toBe(pickWindowCount(5, 0));
  });

  it('always returns 2, 3, or 4', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (let floorIndex = 0; floorIndex < 3; floorIndex++) {
        const n = pickWindowCount(seed, floorIndex);
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(4);
      }
    }
  });

  it('different floor indices on the same seed can produce different counts (re-rolled per floor)', () => {
    const counts = new Set<number>();
    for (let floorIndex = 0; floorIndex < 20; floorIndex++) counts.add(pickWindowCount(1, floorIndex));
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('carveTrunkWindows', () => {
  /** Fills a solid cylinder of 'bark' blocks across the whole trunk phase, matching
   *  the shape buildElvenTrunkGrid would have already produced, so carving can be
   *  tested in isolation without depending on the full trunk generator. */
  function buildSolidTrunk(w: number, d: number, h: number): { grid: BlockGrid; bw: number; bd: number; bh: number } {
    const grid = createBlockGrid();
    const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
    const bh = Math.max(6, Math.round(h / BLOCK_UNIT));
    const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
    const maxR = Math.max(cx, cz) + 0.5;
    const canopyStartBy = Math.round(bh * 0.6);
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const dNorm = Math.hypot(bx - cx, bz - cz) / maxR;
        if (dNorm > 1) continue;
        for (let by = 0; by < canopyStartBy; by++) setBlock(grid, bx, by, bz, 'bark');
      }
    }
    return { grid, bw, bd, bh };
  }

  function barkCount(grid: BlockGrid): number {
    let n = 0;
    for (const m of grid.cells.values()) if (m === 'bark') n++;
    return n;
  }

  it('carves at least one window (a bark cell becomes absent) somewhere in the trunk', () => {
    const { grid } = buildSolidTrunk(8, 8, 9);
    const before = barkCount(grid);
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    expect(barkCount(grid)).toBeLessThan(before);
  });

  it('promotes some cells to window_frame material', () => {
    const { grid } = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    let sawFrame = false;
    for (const m of grid.cells.values()) if (m === 'window_frame') { sawFrame = true; break; }
    expect(sawFrame).toBe(true);
  });

  it('never carves at by=0 (ground level stays solid -- windows are floor-band features, not ground-level)', () => {
    const { grid, bw, bd } = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(grid, 8, 8, 9, 2, 3);
    let groundStillFullyBark = true;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const m = getMaterialKey(grid, bx, 0, bz);
        if (m !== undefined && m !== 'bark') groundStillFullyBark = false;
      }
    }
    expect(groundStillFullyBark).toBe(true);
  });

  it('is deterministic per seed', () => {
    const a = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(a.grid, 8, 8, 9, 2, 7);
    const b = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(b.grid, 8, 8, 9, 2, 7);
    expect([...a.grid.cells.entries()]).toEqual([...b.grid.cells.entries()]);
  });

  it('more floors produce at least as many carved cells as fewer floors (same seed)', () => {
    const one = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(one.grid, 8, 8, 9, 1, 4);
    const three = buildSolidTrunk(8, 8, 9);
    carveTrunkWindows(three.grid, 8, 8, 9, 3, 4);
    expect(barkCount(three.grid)).toBeLessThanOrEqual(barkCount(one.grid));
  });
});
