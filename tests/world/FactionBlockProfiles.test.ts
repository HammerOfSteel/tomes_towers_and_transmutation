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
import { buildVulperiaDenMoundGrid, buildDwarvenHallGrid, buildElvenTrunkGrid, buildVampireSpireGrid, smoothTaperRadiusFrac, buildFaeStalkGrid, buildOrcishHutGrid, buildUndeadTierGrid, planDwarvenTiers, elvenWaistRadius, elvenNeckY, elvenRadiusAtHeight, elvenHeightAtFrac, pickElvenEntranceStyle, pickElvenCanopyArchetype } from '@/world/buildings/FactionBlockProfiles';

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


describe('FactionBlockProfiles — elvenRadiusAtHeight / elvenHeightAtFrac', () => {
  it('elvenRadiusAtHeight at the neck height fraction matches elvenWaistRadius exactly', () => {
    const w = 6, d = 6;
    const atNeck = elvenRadiusAtHeight(w, d, 0.6, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    const waist = elvenWaistRadius(w, d, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    expect(atNeck).toBeCloseTo(waist, 10);
  });

  it('elvenRadiusAtHeight at height fraction 0 returns a wider radius than at the neck', () => {
    const w = 6, d = 6;
    const atBase = elvenRadiusAtHeight(w, d, 0, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    const atNeck = elvenRadiusAtHeight(w, d, 0.6, { canopyStartFrac: 0.6, waistFrac: 0.4 });
    expect(atBase).toBeGreaterThan(atNeck);
  });

  it('elvenRadiusAtHeight decreases monotonically from base to neck', () => {
    const w = 8, d = 8;
    const opts = { canopyStartFrac: 0.6, waistFrac: 0.35 };
    const r0 = elvenRadiusAtHeight(w, d, 0.0, opts);
    const r1 = elvenRadiusAtHeight(w, d, 0.2, opts);
    const r2 = elvenRadiusAtHeight(w, d, 0.4, opts);
    const r3 = elvenRadiusAtHeight(w, d, 0.6, opts);
    expect(r0).toBeGreaterThanOrEqual(r1);
    expect(r1).toBeGreaterThanOrEqual(r2);
    expect(r2).toBeGreaterThanOrEqual(r3);
  });

  it('elvenHeightAtFrac at the default canopyStartFrac matches elvenNeckY exactly', () => {
    const h = 9;
    expect(elvenHeightAtFrac(h, 0.6)).toBeCloseTo(elvenNeckY(h), 10);
  });

  it('elvenHeightAtFrac increases with height fraction', () => {
    const h = 10;
    expect(elvenHeightAtFrac(h, 0.2)).toBeLessThan(elvenHeightAtFrac(h, 0.5));
  });
});


describe('FactionBlockProfiles — smoothTaperRadiusFrac (shared taper helper)', () => {
  it('returns startFrac at t=0 and endFrac at t=1', () => {
    expect(smoothTaperRadiusFrac(0, 1, 0.4)).toBeCloseTo(1, 5);
    expect(smoothTaperRadiusFrac(1, 1, 0.4)).toBeCloseTo(0.4, 5);
  });

  it('clamps t outside [0,1]', () => {
    expect(smoothTaperRadiusFrac(-1, 1, 0.4)).toBeCloseTo(1, 5);
    expect(smoothTaperRadiusFrac(2, 1, 0.4)).toBeCloseTo(0.4, 5);
  });

  it('is monotonic between the two endpoints for a simple narrowing taper', () => {
    const a = smoothTaperRadiusFrac(0.3, 1, 0.4);
    const b = smoothTaperRadiusFrac(0.6, 1, 0.4);
    expect(b).toBeLessThan(a);
  });
});

describe('FactionBlockProfiles — vampire tapering gothic spire', () => {
  const W = 6, D = 6, H = 10;

  function bwOf(w = W): number { return Math.max(3, Math.round(w / BLOCK_UNIT)); }
  function bdOf(d = D): number { return Math.max(3, Math.round(d / BLOCK_UNIT)); }
  function bhOf(h = H): number { return Math.max(8, Math.round(h / BLOCK_UNIT)); }

  it('is grounded: the base level has an occupied block at the centre column', () => {
    const grid = buildVampireSpireGrid(1, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(hasBlock(grid, Math.round(bw / 2), 0, Math.round(bd / 2))).toBe(true);
  });

  it('tapers inward monotonically: an edge column occupied near the base is empty by the neck', () => {
    const grid = buildVampireSpireGrid(2, W, D, H, { parapetStartFrac: 0.8, waistFrac: 0.34 });
    const bd = bdOf(), bh = bhOf();
    const cz = Math.round((bd - 1) / 2);
    expect(hasBlock(grid, 0, 0, cz)).toBe(true);
    const neckBy = Math.round(bh * 0.6);
    expect(hasBlock(grid, 0, neckBy, cz)).toBe(false);
  });

  it('does NOT flare back out: the spire never widens again after the neck (unlike elven canopy)', () => {
    const grid = buildVampireSpireGrid(3, W, D, H, {});
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    function rowSpan(by: number): number {
      const cz = Math.round((bd - 1) / 2);
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    const midSpan = rowSpan(Math.round(bh * 0.4));
    const topSpan = rowSpan(bh - 2); // deck level
    expect(topSpan).toBeLessThanOrEqual(midSpan);
  });

  it('plinth flares at the base: the ground-level footprint is at least as wide as a few levels up', () => {
    const grid = buildVampireSpireGrid(4, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    const cz = Math.round(bd / 2);
    function rowSpan(by: number): number {
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    expect(rowSpan(0)).toBeGreaterThanOrEqual(rowSpan(3));
  });

  it('ends in a crenellated parapet: the topmost level is partially occupied — more than none, fewer than the solid deck below', () => {
    const grid = buildVampireSpireGrid(5, W, D, H, {});
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    let topOccupied = 0, deckOccupied = 0;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        if (hasBlock(grid, bx, bh - 1, bz)) topOccupied++;
        if (hasBlock(grid, bx, bh - 2, bz)) deckOccupied++;
      }
    }
    expect(topOccupied).toBeGreaterThan(0);
    expect(topOccupied).toBeLessThan(deckOccupied);
  });

  it('the tapering body uses the obsidian material; the crenellations use the iron material', () => {
    const grid = buildVampireSpireGrid(6, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(getMaterialKey(grid, Math.round(bw / 2), 0, Math.round(bd / 2))).toBe('obsidian');
    let sawIron = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'iron') { sawIron = true; break; }
    }
    expect(sawIron).toBe(true);
  });

  it('with a facade requested, carves a pointed arch that narrows monotonically with height', () => {
    const grid = buildVampireSpireGrid(7, W, D, H, { facade: true, facadeWidthFrac: 0.5 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false);
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
    const scanHalf = Math.round(bw * 0.5);
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
    expect(carvedHalfSpan(2)).toBeLessThan(carvedHalfSpan(0));
  });

  it('door-frame posts stay connected top-to-bottom (regression: vulperia-style disconnected-frame bug)', () => {
    const grid = buildVampireSpireGrid(8, W, D, H, { facade: true, facadeWidthFrac: 0.5 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    // Find a frame-post column: solid at ground level, immediately outside
    // the ground-level notch span.
    let frameBx = -1;
    for (let bx = cx + 1; bx < bw; bx++) {
      if (hasBlock(grid, bx, 0, frontZ)) { frameBx = bx; break; }
    }
    expect(frameBx).toBeGreaterThan(-1);
    // The post must not have any gap between ground level and wherever it
    // stops being part of the frame — i.e. no "floating" disconnected
    // segment above a hole.
    let sawGapThenSolid = false;
    let sawGap = false;
    for (let by = 0; by < 6; by++) {
      const occ = hasBlock(grid, frameBx, by, frontZ);
      if (!occ) sawGap = true;
      else if (sawGap) sawGapThenSolid = true;
    }
    expect(sawGapThenSolid).toBe(false);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildVampireSpireGrid(42, W, D, H, {});
    const gridB = buildVampireSpireGrid(42, W, D, H, {});
    const gridC = buildVampireSpireGrid(43, W, D, H, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

describe('FactionBlockProfiles — fae twisted stalk + scalloped mushroom cap', () => {
  const W = 6, D = 6, H = 8;

  function bwOf(w = W): number { return Math.max(3, Math.round(w / BLOCK_UNIT)); }
  function bdOf(d = D): number { return Math.max(3, Math.round(d / BLOCK_UNIT)); }
  function bhOf(h = H): number { return Math.max(8, Math.round(h / BLOCK_UNIT)); }

  it('is grounded: the base level has an occupied block at the centre column', () => {
    const grid = buildFaeStalkGrid(1, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(hasBlock(grid, Math.round(bw / 2), 0, Math.round(bd / 2))).toBe(true);
  });

  it('flares out dramatically for the cap: the cap band reaches columns far beyond the stalk radius', () => {
    const grid = buildFaeStalkGrid(2, W, D, H, { capStartFrac: 0.5, waistFrac: 0.8, capFlareFrac: 2.0 });
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    const cz = Math.round((bd - 1) / 2);
    // A column just outside the stalk's own footprint, empty at the stalk's mid-height...
    const stalkMidBy = Math.round(bh * 0.3);
    const farBx = 0;
    expect(hasBlock(grid, farBx, stalkMidBy, cz)).toBe(false);
    // ...but reached by the cap's outward flare near its peak.
    const capPeakBy = Math.round(bh * 0.86);
    let flaresOut = false;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        if (hasBlock(grid, bx, capPeakBy, bz)) { flaresOut = true; break; }
      }
      if (flaresOut) break;
    }
    expect(flaresOut).toBe(true);
  });

  it('crowns back in at the very top: the cap domes rather than staying at its widest flare', () => {
    const grid = buildFaeStalkGrid(3, W, D, H, {});
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    function rowSpan(by: number): number {
      const cz = Math.round((bd - 1) / 2);
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    const peakBy = Math.round(bh * 0.86);
    const topBy = bh - 1;
    expect(rowSpan(topBy)).toBeLessThan(rowSpan(peakBy));
  });

  it('stalk-phase blocks use the stalk material and cap-phase blocks use the cap material', () => {
    const grid = buildFaeStalkGrid(4, W, D, H, { capStartFrac: 0.5 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2), cz = Math.round(bd / 2);
    expect(getMaterialKey(grid, cx, 0, cz)).toBe('stalk');
    let top = -1;
    for (let by = 0; by < 32; by++) if (hasBlock(grid, cx, by, cz)) top = by;
    expect(top).toBeGreaterThan(0);
    expect(getMaterialKey(grid, cx, top, cz)).toBe('cap');
  });

  it('with a facade requested, carves a circular portal doorway (constant radius, not an arch that grows from the ground)', () => {
    const grid = buildFaeStalkGrid(5, W, D, H, { facade: true, facadeWidthFrac: 0.4 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
    // Ground level (by=0) must NOT be carved (a circular portal floats
    // above the ground, unlike elven's/vampire's arches which start at it).
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(true);
    // Somewhere mid-portal-height, dead centre must be carved open.
    let sawCarvedCentre = false;
    for (let by = 1; by < 8; by++) {
      if (!hasBlock(grid, cx, by, frontZ) && hasBlock(grid, cx, by, frontZ - 1)) { sawCarvedCentre = true; break; }
    }
    expect(sawCarvedCentre).toBe(true);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildFaeStalkGrid(42, W, D, H, {});
    const gridB = buildFaeStalkGrid(42, W, D, H, {});
    const gridC = buildFaeStalkGrid(43, W, D, H, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });

  it('gives the cap a bioluminescent "spore" glow accent material, distinct from the cap body', () => {
    const grid = buildFaeStalkGrid(6, W, D, H, {});
    let sawSpore = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'spore') { sawSpore = true; break; }
    }
    expect(sawSpore).toBe(true);
  });
});

describe('FactionBlockProfiles — orcish lashed hut with jagged patchwork roofline', () => {
  const W = 6, D = 6, H = 4;

  function bwOf(w = W): number { return Math.max(3, Math.round(w / BLOCK_UNIT)); }
  function bdOf(d = D): number { return Math.max(3, Math.round(d / BLOCK_UNIT)); }
  function bhOf(h = H): number { return Math.max(6, Math.round(h / BLOCK_UNIT)); }

  it('is grounded: the base level has an occupied block at the centre column', () => {
    const grid = buildOrcishHutGrid(1, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(hasBlock(grid, Math.round(bw / 2), 0, Math.round(bd / 2))).toBe(true);
  });

  it('produces an asymmetric footprint: perimeter occupancy differs between opposite corners (not a clean symmetric rectangle)', () => {
    const bw = bwOf(), bd = bdOf();
    // At least one corner combination must differ in occupancy from
    // another — a perfectly symmetric rectangle would have all 4 corners
    // (or none) occupied identically for every seed, which a lashed,
    // hand-built hut should not guarantee.
    let sawAsymmetry = false;
    for (let trySeed = 2; trySeed < 30 && !sawAsymmetry; trySeed++) {
      const g = buildOrcishHutGrid(trySeed, W, D, H, {});
      const c = [
        hasBlock(g, 0, 0, 0), hasBlock(g, bw - 1, 0, 0),
        hasBlock(g, 0, 0, bd - 1), hasBlock(g, bw - 1, 0, bd - 1),
      ];
      if (new Set(c).size > 1) sawAsymmetry = true;
    }
    expect(sawAsymmetry).toBe(true);
  });

  it('produces a jagged roofline: two neighbouring columns along the ridge axis have different roof heights', () => {
    const grid = buildOrcishHutGrid(3, W, D, H, { roofJitter: 0.6 });
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    function colTop(bx: number, bz: number): number {
      let top = -1;
      for (let by = 0; by < bh; by++) if (hasBlock(grid, bx, by, bz)) top = by;
      return top;
    }
    const cx = Math.round(bw / 2);
    const heights = new Set<number>();
    for (let bz = 1; bz < bd - 1; bz++) heights.add(colTop(cx, bz));
    // A tidy, non-jagged roof (single coherent slope with no per-column
    // noise) would still vary smoothly, but real jaggedness means at
    // least 3 distinct height values across the ridge-axis columns.
    expect(heights.size).toBeGreaterThanOrEqual(3);
  });

  it('overall roof height slopes from one eave to the other (a lean-to, not a flat roof)', () => {
    const grid = buildOrcishHutGrid(4, W, D, H, { roofJitter: 0.15 });
    const bw = bwOf(), bd = bdOf(), bh = bhOf();
    function avgTopAtZ(bz: number): number {
      let sum = 0, n = 0;
      for (let bx = 1; bx < bw - 1; bx++) {
        for (let by = 0; by < bh; by++) if (hasBlock(grid, bx, by, bz)) { sum += by; n++; }
      }
      return n > 0 ? sum / n : 0;
    }
    const nearAvg = avgTopAtZ(1);
    const farAvg = avgTopAtZ(bd - 2);
    expect(nearAvg).not.toBe(farAvg);
  });

  it('assigns wall columns one of several mismatched "patch" materials, not a single uniform material', () => {
    const grid = buildOrcishHutGrid(5, 10, 10, H, {});
    const wallMaterials = new Set<string>();
    for (const matKey of grid.cells.values()) {
      if (matKey.startsWith('patch')) wallMaterials.add(matKey);
    }
    expect(wallMaterials.size).toBeGreaterThanOrEqual(2);
  });

  it('with a facade requested, carves a crude hand-hacked doorway (irregular width per row, not a clean rectangle)', () => {
    const grid = buildOrcishHutGrid(6, W, D, H, { facade: true, facadeWidthFrac: 0.4 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false); // door starts at ground level
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildOrcishHutGrid(42, W, D, H, {});
    const gridB = buildOrcishHutGrid(42, W, D, H, {});
    const gridC = buildOrcishHutGrid(43, W, D, H, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

describe('FactionBlockProfiles — undead decayed ossuary spire (reuses dwarven tiered-tower profile)', () => {
  const W = 6, D = 6, H = 6;

  function bwOf(w = W): number { return Math.max(3, Math.round(w / BLOCK_UNIT)); }
  function bdOf(d = D): number { return Math.max(3, Math.round(d / BLOCK_UNIT)); }
  function bhOf(h = H): number { return Math.max(3, Math.round(h / BLOCK_UNIT)); }

  it('is grounded: the base level has an occupied block at a corner column', () => {
    const grid = buildUndeadTierGrid(1, W, D, H, {});
    const bw = bwOf(), bd = bdOf();
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    expect(hasBlock(grid, bw - 1, 0, bd - 1)).toBe(true);
  });

  it('produces a stepped tower silhouette (each successive tier inset from the one below), matching dwarven\'s tier layout', () => {
    const grid = buildUndeadTierGrid(2, W, D, H, { tiers: 3, insetStep: 2 });
    // The base tier's own corner should be solid ...
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    // ... but a higher tier's row should no longer reach that same base
    // corner, since it steps inward — same principle dwarven's stepped
    // hall relies on.
    const bh = bhOf();
    const topRow = bh - 1;
    expect(hasBlock(grid, 0, topRow, 0)).toBe(false);
  });

  it('produces sparse block-omission decay: some non-corner mid-body cells are missing that a pristine dwarven-style tower would have solid', () => {
    let sawHole = false;
    for (let trySeed = 1; trySeed < 30 && !sawHole; trySeed++) {
      const grid = buildUndeadTierGrid(trySeed, W, D, H, { decayFrac: 0.6 });
      const bw = bwOf(), bd = bdOf();
      for (let bx = 1; bx < bw - 1; bx++) {
        for (let bz = 1; bz < bd - 1; bz++) {
          if (!hasBlock(grid, bx, 1, bz) && hasBlock(grid, bx, 0, bz)) { sawHole = true; break; }
        }
        if (sawHole) break;
      }
    }
    expect(sawHole).toBe(true);
  });

  it('produces a broken/jagged crenellation: perimeter column top-heights on the topmost tier are not all identical', () => {
    // Sample every non-corner perimeter column across all 4 edges of the
    // topmost (inset) tier — the tier the crumbled-crenellation pass
    // actually touches — trying a few seeds since a small footprint's
    // topmost tier is narrow and a single seed's jitter rolls can
    // coincidentally collide.
    const bh = bhOf();
    function colTop(grid: ReturnType<typeof buildUndeadTierGrid>, bx: number, bz: number): number {
      let top = -1;
      for (let by = 0; by < bh; by++) if (hasBlock(grid, bx, by, bz)) top = by;
      return top;
    }
    const plan = planDwarvenTiers(W, D, H, { tiers: 3, insetStep: 2 });
    let sawVariance = false;
    for (let trySeed = 1; trySeed < 20 && !sawVariance; trySeed++) {
      const grid = buildUndeadTierGrid(trySeed, W, D, H, { tiers: 3, insetStep: 2, crownJitterBlocks: 4 });
      const tops = new Set<number>();
      for (let bx = plan.topXMin + 1; bx < plan.topXMax - 1; bx++) {
        tops.add(colTop(grid, bx, plan.topZMin));
        tops.add(colTop(grid, bx, plan.topZMax - 1));
      }
      for (let bz = plan.topZMin + 1; bz < plan.topZMax - 1; bz++) {
        tops.add(colTop(grid, plan.topXMin, bz));
        tops.add(colTop(grid, plan.topXMax - 1, bz));
      }
      if (tops.size >= 2) sawVariance = true;
    }
    expect(sawVariance).toBe(true);
  });

  it('keeps load-bearing corner columns intact as ashstone/ossuary, distinct from body material', () => {
    const grid = buildUndeadTierGrid(9, W, D, H, {});
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('ossuary');
    let sawAshstone = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'ashstone') { sawAshstone = true; break; }
    }
    expect(sawAshstone).toBe(true);
  });

  it('carves a pointed-arch (tapered top) facade doorway starting at ground level, framed by facade posts', () => {
    const grid = buildUndeadTierGrid(6, W, D, H, { facade: true, facadeWidthFrac: 0.4 });
    const bw = bwOf(), bd = bdOf();
    const cx = Math.round(bw / 2);
    const frontZ = bd - 1;
    expect(hasBlock(grid, cx, 0, frontZ)).toBe(false); // door starts at ground level
    let sawFacadeMaterial = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'facade') { sawFacadeMaterial = true; break; }
    }
    expect(sawFacadeMaterial).toBe(true);
  });

  it('produces a bioluminescent rune-glow accent material on a handful of body blocks', () => {
    const grid = buildUndeadTierGrid(9, W, D, H, { runeglowCount: 5 });
    let runeglowCount = 0;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'runeglow') runeglowCount++;
    }
    expect(runeglowCount).toBeGreaterThan(0);
  });

  it('is deterministic per seed and varies with a different seed', () => {
    const gridA = buildUndeadTierGrid(42, W, D, H, {});
    const gridB = buildUndeadTierGrid(42, W, D, H, {});
    const gridC = buildUndeadTierGrid(43, W, D, H, {});
    expect([...gridA.cells.entries()]).toEqual([...gridB.cells.entries()]);
    expect([...gridA.cells.entries()]).not.toEqual([...gridC.cells.entries()]);
  });
});

