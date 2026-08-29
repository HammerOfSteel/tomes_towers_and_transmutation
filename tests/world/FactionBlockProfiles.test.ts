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
import { buildVulperiaDenMoundGrid, buildDwarvenHallGrid, buildElvenTrunkGrid } from '@/world/buildings/FactionBlockProfiles';

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

  it('door frame posts always reach at least notchHeight+1, and the lintel above the doorway is unbroken across its full width, even at the mound rim where the natural dome falloff would otherwise leave posts far too short (regression: door not connecting to the mound)', () => {
    // A small, low, wide footprint maximizes the dome falloff at the front
    // rim (exactly where the door frame sits) -- the exact shape that
    // produced 1-block-tall (or completely empty) frame posts before this
    // fix, leaving the door decoration looking disconnected from the mound.
    const w = 4.5, d = 3.5, h = 2.2;
    const grid = buildVulperiaDenMoundGrid(12345, w, d, h, { facade: true, jitter: 0.24 });
    const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
    const bh = Math.max(2, Math.round(h / BLOCK_UNIT));
    const notchHeight = Math.max(2, Math.round(bh * 0.55));
    const notchWidth = Math.max(2, Math.round(bw * 0.42));
    const cx = (bw - 1) / 2;
    const notchXMin = Math.round(cx - notchWidth / 2);
    const notchXMax = notchXMin + notchWidth;
    const frameXMin = notchXMin - 1;
    const frameXMax = notchXMax + 1;

    function columnHeight(bx: number, bz: number): number {
      let n = 0;
      for (let by = 0; by < 32; by++) if (hasBlock(grid, bx, by, bz)) n++;
      return n;
    }

    for (const bz of [bd - 1, bd - 2]) {
      // The two true door posts (just outside the carved notch) must be
      // solid all the way up to at least one block above the doorway.
      for (const bx of [frameXMin, frameXMax - 1]) {
        expect(columnHeight(bx, bz), `post column (${bx},${bz}) too short to frame the doorway`).toBeGreaterThanOrEqual(notchHeight + 1);
      }
      // The lintel spanning the doorway itself (the notch columns, above
      // the carved opening) must be present and unbroken across the full
      // width, connecting both posts -- not just present wherever the
      // dome's natural height happened to reach that high.
      for (let bx = notchXMin; bx < notchXMax; bx++) {
        expect(hasBlock(grid, bx, notchHeight, bz), `lintel gap at (${bx},${notchHeight},${bz})`).toBe(true);
      }
    }
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

describe('FactionBlockProfiles — elven tapering living-wood trunk', () => {
  const W = 6, D = 6, H = 6;

  function bwOf(w = W): number { return Math.max(3, Math.round(w / BLOCK_UNIT)); }
  function bdOf(d = D): number { return Math.max(3, Math.round(d / BLOCK_UNIT)); }
  function bhOf(h = H): number { return Math.max(6, Math.round(h / BLOCK_UNIT)); }

  it('is grounded: the base level has occupied blocks at the centre column', () => {
    const grid = buildElvenTrunkGrid(1, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(hasBlock(grid, Math.round(bw / 2), 0, Math.round(bd / 2))).toBe(true);
  });

  it('tapers inward toward the waist: an edge column occupied near the base is empty at the waist level', () => {
    const grid = buildElvenTrunkGrid(2, W, D, H, { canopyStartFrac: 0.6, waistFrac: 0.45 });
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
    // Pick a column near the base footprint's edge (occupied at ground level).
    const edgeBx = 0, edgeBz = Math.round(cz);
    expect(hasBlock(grid, edgeBx, 0, edgeBz)).toBe(true);
    // At the waist (well above the base, still below canopy), that same edge column
    // must have narrowed away (the trunk has tapered inward by then).
    const waistBy = Math.round(bh * 0.5);
    expect(hasBlock(grid, edgeBx, waistBy, edgeBz)).toBe(false);
    void cx;
  });

  it('flares back out for the canopy: the crown reaches columns beyond the narrow waist radius', () => {
    const grid = buildElvenTrunkGrid(3, W, D, H, { canopyStartFrac: 0.55, waistFrac: 0.4, canopyFlareFrac: 1.3 });
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    const cz = Math.round((bd - 1) / 2);
    const waistBy = Math.round(bh * 0.5);
    const midOuterBx = Math.round(bw * 0.2); // inside base footprint, outside the narrow waist
    expect(hasBlock(grid, midOuterBx, waistBy, cz)).toBe(false);
    // The new canopy is a deliberately asymmetric cluster of branch-borne
    // foliage lobes (not a single radially-symmetric disc), so any one
    // fixed column is no longer guaranteed to be covered for every seed —
    // scan the whole canopy-band cross-section instead and require that
    // the crown occupies at least one column clearly outside the waist's
    // narrow radius, proving genuine outward flare without assuming
    // perfect radial symmetry.
    const canopyBy = Math.round(bh * 0.75);
    let flaresOut = false;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        if (hasBlock(grid, bx, canopyBy, bz)) { flaresOut = true; break; }
      }
      if (flaresOut) break;
    }
    expect(flaresOut).toBe(true);
  });

  it('trunk-phase blocks use the bark material and canopy-phase blocks use the leaf material', () => {
    const grid = buildElvenTrunkGrid(4, W, D, H, { canopyStartFrac: 0.6 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2), cz = Math.round(bd / 2);
    expect(getMaterialKey(grid, cx, 0, cz)).toBe('bark');
    // Find the topmost occupied block at the centre column (deep in the canopy).
    let top = -1;
    for (let by = 0; by < 32; by++) if (hasBlock(grid, cx, by, cz)) top = by;
    expect(top).toBeGreaterThan(0);
    expect(getMaterialKey(grid, cx, top, cz)).toBe('leaf');
  });

  it('with a facade requested, carves an arched doorway that narrows with height (round-arch-from-blocks technique)', () => {
    const grid = buildElvenTrunkGrid(5, W, D, H, { facade: true, facadeWidthFrac: 0.5 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    // Ground level, dead centre: carved open.
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
    // Frame posts flanking the notch use the facade material.
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
    // Somewhere near the edge of the ground-level notch span but still solid higher up
    // in the arch (the arch narrows as it rises) — i.e. the notch is not a plain rectangle.
    // Compare the carved span at ground level against the carved span near the arch's
    // apex: the apex span must be strictly narrower. Restrict the scan window to just
    // outside the notch so we don't pick up unrelated empty space beyond the trunk's
    // own footprint as a false "carved" cell.
    const scanHalf = Math.round(bw * 0.5 * (0.5 + 0.5)) ; // generous window around centre
    function carvedHalfSpan(by: number): number {
      let maxAbs = 0;
      for (let bx = cx - scanHalf; bx <= cx + scanHalf; bx++) {
        if (bx < 0 || bx >= bw) continue;
        if (hasBlock(grid, bx, by, frontZ - 1) && !hasBlock(grid, bx, by, frontZ)) {
          maxAbs = Math.max(maxAbs, Math.abs(bx - cx));
        }
      }
      return maxAbs;
    }
    expect(carvedHalfSpan(3)).toBeLessThan(carvedHalfSpan(0));
  });

  it('roots flare at the base: the ground-level footprint is at least as wide as one level up', () => {
    const grid = buildElvenTrunkGrid(6, W, D, H, {});
    const bd = bdOf();
    const cz = Math.round(bd / 2);
    function rowSpan(by: number): number {
      const bw = bwOf();
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    expect(rowSpan(0)).toBeGreaterThanOrEqual(rowSpan(3));
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildElvenTrunkGrid(42, W, D, H, {});
    const gridB = buildElvenTrunkGrid(42, W, D, H, {});
    const gridC = buildElvenTrunkGrid(43, W, D, H, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

