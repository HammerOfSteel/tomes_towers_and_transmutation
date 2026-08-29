/**
 * FactionBlockProfiles.ts — Phase 2e of the settlement visual fidelity plan
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §2e.2+).
 *
 * Per-faction *shape-profile* functions: pure occupancy-grid builders that
 * decide which `BlockKit` cells are filled (and with which palette
 * material) for a given footprint/height/seed. This is the one piece that
 * actually varies per faction/building — `BlockKit.ts`'s meshing/chamfer
 * engine is completely shared and faction-agnostic.
 *
 * Vulperia (§2e.3) is implemented first as the proof-of-concept: a
 * grounded heightfield "hill" (column heights fall off from centre to the
 * footprint edge, each column a stack of unit blocks — not a deformed
 * sphere), with an optional carved rectangular facade/doorway notch left
 * open in the front rows, framed by the un-carved "post" columns either
 * side of it (which keep their normal earth/grass material near the base,
 * but get promoted to a dedicated `facade` material in the frame region
 * directly around the notch so the entrance still reads as "built", the
 * single highest-impact lesson from the Phase 2d v2 vulperia fix).
 */

import { createNoise2D } from '@/core/SimplexNoise';
import { mulberry32 } from '@/core/prng';
import { BLOCK_UNIT, createBlockGrid, setBlock, hasBlock, type BlockGrid } from './BlockKit';

export interface DwarvenHallOptions {
  /** Number of stepped tiers (default 3). */
  tiers?: number;
  /** How many blocks each tier insets from the one below (default 2). */
  insetStep?: number;
  /** Carve a rectangular doorway/facade notch into the base tier's front (+Z) face. */
  facade?: boolean;
  /** Fraction of the base footprint width the notch spans (default 0.34). */
  facadeWidthFrac?: number;
  /** Fraction of the base tier's height the notch rises (default 0.6). */
  facadeHeightFrac?: number;
}

/**
 * Dwarven guild-hall occupancy grid: a stepped rectangular tower — NOT a
 * dome — built from `opts.tiers` full-rectangle tiers, each one inset by
 * `insetStep` blocks per side from the tier below it (a real ziggurat
 * step, not a tapered cone), so the silhouette reads as precise cut-stone
 * masonry, the deliberate opposite of vulperia's organic mound. Every
 * tier's 4 corner columns are tagged with the `'buttress'` material
 * (instead of `'stone'`) so callers can pass a `suppressChamfer` predicate
 * keyed on that material to `meshBlockGrid()` — dwarven architecture
 * should read as *intentionally* hard-edged and monumental at its load-
 * bearing corners, unlike vulperia's uniformly-softened hill. An optional
 * facade notch carves a doorway into the base tier's front face, framed
 * by `'facade'`-material jamb blocks (same "keep the frame, carve the
 * gap" technique as vulperia's den mound).
 */
/**
 * Number of `BLOCK_UNIT` cubes tall a dwarven hall of continuous height `h`
 * actually resolves to once quantized to the block grid. Exported so
 * callers that attach height-dependent props (banner, chimney, etc.) can
 * position them flush with the tower's *real* constructed roofline instead
 * of the raw, pre-quantization `h` — using `h` directly leaves props
 * floating in a gap above (or sunk below) the actual top face whenever
 * rounding to the nearest block doesn't land exactly on `h`.
 */
export function dwarvenBlocksTall(h: number): number {
  return Math.max(3, Math.round(h / BLOCK_UNIT));
}

/**
 * World-space Y of the topmost rendered face of a dwarven hall built with
 * height `h`. Each block is centred at `by * BLOCK_UNIT` and extends
 * `BLOCK_UNIT / 2` further in every direction (see `blockGeometry()` in
 * `BlockKit.ts`), so the actual roof surface sits half a block *below*
 * `dwarvenBlocksTall(h) * BLOCK_UNIT` — using that naive product (instead
 * of this helper) is what left the villa's banner/chimney floating above
 * the true roofline.
 */
export function dwarvenRoofTopY(h: number): number {
  return (dwarvenBlocksTall(h) - 1) * BLOCK_UNIT + BLOCK_UNIT / 2;
}

interface DwarvenTierPlan {
  bw: number; bd: number; bh: number;
  /** The last tier actually built (before any early "stepped to nothing" break). */
  topXMin: number; topXMax: number; topZMin: number; topZMax: number;
}

/**
 * Computes the block-grid tier layout for a dwarven hall — shared by
 * `buildDwarvenHallGrid()` (which fills it) and `dwarvenTopTierExtents()`
 * (which callers use to place roofline props safely within the topmost,
 * inset tier's actual footprint, not the base footprint).
 */
function planDwarvenTiers(w: number, d: number, h: number, opts: DwarvenHallOptions): DwarvenTierPlan {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = dwarvenBlocksTall(h);
  const tiers = Math.max(1, opts.tiers ?? 3);
  const insetStep = Math.max(1, opts.insetStep ?? 2);
  const refDim = Math.max(bw, bd);
  const insetStepX = Math.max(1, Math.round((insetStep * bw) / refDim));
  const insetStepZ = Math.max(1, Math.round((insetStep * bd) / refDim));

  let topXMin = 0, topXMax = bw, topZMin = 0, topZMax = bd;
  for (let t = 0; t < tiers; t++) {
    const insetX = t * insetStepX, insetZ = t * insetStepZ;
    const xMin = insetX, xMax = bw - insetX;
    const zMin = insetZ, zMax = bd - insetZ;
    if (xMax - xMin < 2 || zMax - zMin < 2) break; // tower has stepped to nothing
    topXMin = xMin; topXMax = xMax; topZMin = zMin; topZMax = zMax;
  }
  return { bw, bd, bh, topXMin, topXMax, topZMin, topZMax };
}

/**
 * The topmost tier's real (post-inset) horizontal half-extents, in world
 * units and already relative to the hall's centred local origin — i.e. the
 * safe X/Z range a roofline prop (banner, chimney, etc.) can be placed
 * within and still land on solid roof rather than floating in open air
 * beyond the narrower top tier's edge. `margin` (default 1 block) pulls
 * the usable range in slightly from the true edge so props don't clip
 * through the parapet.
 */
export function dwarvenTopTierExtents(
  w: number, d: number, h: number, opts: DwarvenHallOptions = {}, margin = BLOCK_UNIT,
): { halfW: number; halfD: number } {
  const plan = planDwarvenTiers(w, d, h, opts);
  const centerXOffset = ((plan.bw - 1) / 2) * BLOCK_UNIT;
  const centerZOffset = ((plan.bd - 1) / 2) * BLOCK_UNIT;
  const rightEdge = (plan.topXMax - 1) * BLOCK_UNIT + BLOCK_UNIT / 2 - centerXOffset;
  const farEdge = (plan.topZMax - 1) * BLOCK_UNIT + BLOCK_UNIT / 2 - centerZOffset;
  return {
    halfW: Math.max(0, rightEdge - margin),
    halfD: Math.max(0, farEdge - margin),
  };
}

export function buildDwarvenHallGrid(
  seed: number, w: number, d: number, h: number,
  opts: DwarvenHallOptions = {},
): BlockGrid {
  const grid = createBlockGrid();
  const plan = planDwarvenTiers(w, d, h, opts);
  const { bw, bd, bh } = plan;
  const tiers = Math.max(1, opts.tiers ?? 3);
  const insetStep = Math.max(1, opts.insetStep ?? 2);
  // Scale each axis's per-tier inset proportionally to that axis's own
  // block count (relative to whichever axis is larger), rather than
  // subtracting the same fixed block count from both. A fixed inset applied
  // to a footprint that's much shallower than it is wide (e.g. a 14x10-block
  // villa) would shrink the short axis by a far larger *fraction* each tier
  // than the long axis — by the top tier the short axis collapses to a
  // near-zero-depth slab (reading as a thin flat card, not a solid stepped
  // block), while the long axis is still comfortably wide. Scaling by each
  // axis's share of the larger dimension keeps every tier's aspect ratio
  // close to the base footprint's, so upper tiers stay proportionally solid.
  const refDim = Math.max(bw, bd);
  const insetStepX = Math.max(1, Math.round((insetStep * bw) / refDim));
  const insetStepZ = Math.max(1, Math.round((insetStep * bd) / refDim));
  const r = mulberry32(seed);

  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.34))) : 0;
  const tierH = Math.max(1, Math.round(bh / tiers));

  for (let t = 0; t < tiers; t++) {
    const insetX = t * insetStepX, insetZ = t * insetStepZ;
    const xMin = insetX, xMax = bw - insetX;
    const zMin = insetZ, zMax = bd - insetZ;
    if (xMax - xMin < 2 || zMax - zMin < 2) break; // tower has stepped to nothing
    const byMin = t * tierH;
    const byMax = t === tiers - 1 ? bh : byMin + tierH;

    for (let bx = xMin; bx < xMax; bx++) {
      for (let bz = zMin; bz < zMax; bz++) {
        const isCorner = (bx === xMin || bx === xMax - 1) && (bz === zMin || bz === zMax - 1);
        for (let by = byMin; by < byMax; by++) {
          setBlock(grid, bx, by, bz, isCorner ? 'buttress' : 'stone');
        }
      }
    }
  }

  if (opts.facade) {
    const cx = Math.round(bw / 2);
    const notchXMin = cx - Math.round(notchWidth / 2);
    const notchXMax = notchXMin + notchWidth;
    const frameXMin = notchXMin - 1, frameXMax = notchXMax + 1;
    const notchHeight = Math.max(2, Math.round(tierH * (opts.facadeHeightFrac ?? 0.6)));
    const frontZ = bd - 1;
    for (let bx = frameXMin; bx < frameXMax; bx++) {
      const inNotchX = bx >= notchXMin && bx < notchXMax;
      for (let by = 0; by < notchHeight; by++) {
        if (inNotchX) {
          grid.cells.delete(`${bx},${by},${frontZ}`); // carve the doorway
        } else if (hasBlock(grid, bx, by, frontZ)) {
          setBlock(grid, bx, by, frontZ, 'facade'); // promote jamb posts
        }
      }
    }
  }

  // Weathering: a handful of individual stone blocks (never the
  // load-bearing 'buttress' corners, and never a ground-level block, to
  // keep every column grounded) chipped away by centuries of age —
  // ancient dwarven stonework should read as "worn but proud," not a
  // perfectly identical prefab across every seed. Deterministic per seed.
  const stoneCells = [...grid.cells.entries()].filter(([k, m]) => {
    if (m !== 'stone') return false;
    const by = Number(k.split(',')[1]);
    return by > 0;
  });
  const chipCount = Math.min(stoneCells.length, 2 + Math.floor(r() * 3));
  for (let i = 0; i < chipCount; i++) {
    const idx = Math.floor(r() * stoneCells.length);
    const [chipKey] = stoneCells[idx] ?? [];
    if (chipKey) grid.cells.delete(chipKey);
  }

  return grid;
}

export interface DenMoundOptions {
  /** Carve a rectangular doorway/facade notch into the front (+Z) face. */
  facade?: boolean;
  /** Fraction of the footprint width the notch spans (default 0.42). */
  facadeWidthFrac?: number;
  /** Fraction of the mound height the notch rises (default 0.55). */
  facadeHeightFrac?: number;
  /** Irregularity of the dome silhouette (default 0.22). */
  jitter?: number;
}

/**
 * Vulperia den mound occupancy grid: a grounded heightfield hill (dome
 * falloff + simplex jitter per column, NOT a deformed sphere), earth
 * blocks below and grass-cap blocks on the top ~30% of each column, with
 * an optional carved facade/doorway notch at the front, framed by
 * `'facade'`-material post/lintel blocks.
 */
export function buildVulperiaDenMoundGrid(
  seed: number, w: number, d: number, h: number,
  opts: DenMoundOptions = {},
): BlockGrid {
  const grid = createBlockGrid();
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = Math.max(2, Math.round(h / BLOCK_UNIT));
  const noise2D = createNoise2D(seed);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const jitterAmt = opts.jitter ?? 0.22;

  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.42))) : 0;
  const notchHeight = opts.facade ? Math.max(2, Math.round(bh * (opts.facadeHeightFrac ?? 0.55))) : 0;
  const notchDepth = 2; // how many front rows get carved/framed
  const notchXMin = Math.round(cx - notchWidth / 2);
  const notchXMax = notchXMin + notchWidth;
  const frameXMin = notchXMin - 1;
  const frameXMax = notchXMax + 1;

  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const dx = (bx - cx) / maxR, dz = (bz - cz) / maxR;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.0) continue; // outside the rounded footprint -> hill silhouette, not a filled rectangle

      const domeFalloff = Math.cos(Math.min(1, dist) * Math.PI / 2); // 1 at centre, 0 at rim
      const n = noise2D(bx * 0.35, bz * 0.35);
      const jitter = 1 + n * jitterAmt;
      let colHeight = Math.round(bh * domeFalloff * jitter);
      colHeight = Math.max(1, Math.min(bh, colHeight));

      const inNotchX = bx >= notchXMin && bx < notchXMax;
      const inFrameX = bx >= frameXMin && bx < frameXMax;
      const inFrontRows = bz >= bd - notchDepth;

      const topStart = colHeight - Math.max(1, Math.round(colHeight * 0.3));
      for (let by = 0; by < colHeight; by++) {
        if (opts.facade && inNotchX && inFrontRows && by < notchHeight) continue; // carved doorway/facade recess
        const isFrameBlock = opts.facade && inFrameX && inFrontRows && by < notchHeight + 1;
        const isTop = by >= topStart;
        setBlock(grid, bx, by, bz, isFrameBlock ? 'facade' : (isTop ? 'grass' : 'earth'));
      }
    }
  }

  return grid;
}
