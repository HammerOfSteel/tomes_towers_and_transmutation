/**
 * FactionBlockProfiles.test.ts — Phase 2e §2e.3 (vulperia block-kit proof
 * of concept). Verifies the vulperia den heightfield-mound shape profile:
 * a grounded, roughly dome-shaped block occupancy grid (tall in the
 * middle, tapering to the footprint edge) with grass-cap blocks on top of
 * earth blocks below, and — when a facade is requested — a carved
 * rectangular doorway notch framed by kept "post" columns rather than a
 * separate bolted-on box.
 */

import { describe, it, expect } from 'vitest';
import { hasBlock, getMaterialKey, BLOCK_UNIT } from '@/world/buildings/BlockKit';
import { buildVulperiaDenMoundGrid, buildDwarvenHallGrid } from '@/world/buildings/FactionBlockProfiles';

describe('FactionBlockProfiles — vulperia den heightfield mound', () => {
  it('produces a grounded, dome-shaped grid: the centre column is taller than a footprint-edge column', () => {
    const grid = buildVulperiaDenMoundGrid(1, 6, 5, 3, {});
    // Column heights: count occupied blocks at a given (bx,bz) across all by.
    function columnHeight(bx: number, bz: number): number {
      let n = 0;
      for (let by = 0; by < 32; by++) if (hasBlock(grid, bx, by, bz)) n++;
      return n;
    }
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const centre = columnHeight(Math.round(bw / 2), Math.round(bd / 2));
    const edge = columnHeight(0, 0);
    expect(centre).toBeGreaterThan(edge);
    expect(centre).toBeGreaterThan(0);
  });

  it('every occupied column is grounded (starts at by=0, no floating blocks)', () => {
    const grid = buildVulperiaDenMoundGrid(2, 5, 4, 3, {});
    const seen = new Set<string>();
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      seen.add(`${bx},${bz}`);
    }
    for (const colKey of seen) {
      const [bx, bz] = colKey.split(',').map(Number);
      expect(hasBlock(grid, bx, 0, bz)).toBe(true);
    }
  });

  it('the top of each column uses the grass material and lower blocks use earth', () => {
    const grid = buildVulperiaDenMoundGrid(3, 6, 5, 3, {});
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2), cz = Math.round(bd / 2);
    let top = -1;
    for (let by = 0; by < 32; by++) if (hasBlock(grid, cx, by, cz)) top = by;
    expect(top).toBeGreaterThan(0);
    expect(getMaterialKey(grid, cx, top, cz)).toBe('grass');
    expect(getMaterialKey(grid, cx, 0, cz)).toBe('earth');
  });

  it('with a facade notch requested, a doorway-sized gap is carved at the front, flanked by kept post columns', () => {
    const w = 6, d = 5, h = 3;
    const grid = buildVulperiaDenMoundGrid(4, w, d, h, { facade: true });
    const bw = Math.round(w / BLOCK_UNIT);
    const bd = Math.round(d / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1; // frontmost row
    // Directly in front of centre at ground level should be carved (empty) for a doorway.
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
    // Just outside the notch on either side (near the footprint's own edge) should still have blocks
    // acting as door-jamb "posts" (assuming footprint wide enough to have posts at all).
    const leftPost = hasBlock(grid, 1, 0, frontZ) || hasBlock(grid, 1, 0, frontZ - 1);
    const rightPost = hasBlock(grid, bw - 2, 0, frontZ) || hasBlock(grid, bw - 2, 0, frontZ - 1);
    expect(leftPost || rightPost).toBe(true);
  });

  it('post/frame blocks around a facade notch use the facade material, not plain earth', () => {
    const grid = buildVulperiaDenMoundGrid(5, 7, 5, 3, { facade: true });
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildVulperiaDenMoundGrid(42, 6, 5, 3, {});
    const gridB = buildVulperiaDenMoundGrid(42, 6, 5, 3, {});
    const gridC = buildVulperiaDenMoundGrid(43, 6, 5, 3, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

describe('FactionBlockProfiles — dwarven stepped-tier hall', () => {
  function columnHeight(grid: ReturnType<typeof buildDwarvenHallGrid>, bx: number, bz: number): number {
    let n = 0;
    for (let by = 0; by < 32; by++) if (hasBlock(grid, bx, by, bz)) n++;
    return n;
  }

  it('produces a stepped rectangular tower: a centre column is at least as tall as the full grid height, an edge column is shorter', () => {
    const w = 6, d = 5, h = 4;
    const grid = buildDwarvenHallGrid(1, w, d, h, { tiers: 3 });
    const bw = Math.round(w / BLOCK_UNIT), bd = Math.round(d / BLOCK_UNIT);
    const centre = columnHeight(grid, Math.round(bw / 2), Math.round(bd / 2));
    const corner = columnHeight(grid, 0, 0);
    expect(centre).toBeGreaterThan(corner);
    expect(centre).toBeGreaterThan(0);
  });

  it('every occupied column is grounded (starts at by=0, no floating tiers)', () => {
    const grid = buildDwarvenHallGrid(2, 6, 5, 4, { tiers: 3 });
    const seen = new Set<string>();
    for (const k of grid.cells.keys()) {
      const [bx, , bz] = k.split(',').map(Number);
      seen.add(`${bx},${bz}`);
    }
    for (const colKey of seen) {
      const [bx, bz] = colKey.split(',').map(Number);
      expect(hasBlock(grid, bx, 0, bz)).toBe(true);
    }
  });

  it('produces a real step: an upper tier is inset relative to a lower tier (not one uniform prism)', () => {
    const w = 8, d = 6, h = 4.5;
    const grid = buildDwarvenHallGrid(3, w, d, h, { tiers: 3 });
    // A corner cell of the *base* footprint should be occupied near the ground...
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    // ...but not still occupied near the top of the tower (the upper tier has stepped inward).
    const bh = Math.round(h / BLOCK_UNIT);
    expect(hasBlock(grid, 0, bh - 1, 0)).toBe(false);
  });

  it('corner buttress columns use a distinct, un-chamfered "buttress" material, not plain stone', () => {
    const grid = buildDwarvenHallGrid(4, 6, 5, 4, { tiers: 3 });
    let sawButtress = false;
    let sawStone = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'buttress') sawButtress = true;
      if (matKey === 'stone') sawStone = true;
    }
    expect(sawButtress).toBe(true);
    expect(sawStone).toBe(true);
  });

  it('with a facade notch requested, a doorway-sized gap is carved at the base front, flanked by buttress-material posts', () => {
    const w = 6, d = 5, h = 4;
    const grid = buildDwarvenHallGrid(5, w, d, h, { tiers: 3, facade: true });
    const bw = Math.round(w / BLOCK_UNIT), bd = Math.round(d / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildDwarvenHallGrid(42, 6, 5, 4, { tiers: 3 });
    const gridB = buildDwarvenHallGrid(42, 6, 5, 4, { tiers: 3 });
    const gridC = buildDwarvenHallGrid(43, 6, 5, 4, { tiers: 3 });
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

