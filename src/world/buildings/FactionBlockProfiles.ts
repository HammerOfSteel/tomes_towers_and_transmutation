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

/**
 * Smoothstep-eased taper: interpolates from `startFrac` (at `t=0`) to
 * `endFrac` (at `t=1`) with a *zero-derivative* landing at `t=1`, so
 * whatever shape gets grafted on top of the tapered surface (elven's
 * canopy, vampire's parapet deck) meets it without a visible kink/collar
 * — the single biggest cause of early taper-profile attempts reading as a
 * "flying-saucer" cap instead of a real tapering trunk/spire. `t` outside
 * `[0,1]` is clamped. Shared by `buildElvenTrunkGrid()`'s trunk-to-canopy
 * taper and `buildVampireSpireGrid()`'s spire-to-parapet taper — the one
 * piece of the "tapering vertical silhouette" technique that's genuinely
 * identical between the two, rather than merely similar in spirit.
 */
export function smoothTaperRadiusFrac(t: number, startFrac: number, endFrac: number): number {
  const u = Math.max(0, Math.min(1, t));
  const eased = u * u * (3 - 2 * u); // smoothstep
  return startFrac + (endFrac - startFrac) * eased;
}

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
      const inFrameX = opts.facade && bx >= frameXMin && bx < frameXMax;
      const inFrontRows = bz >= bd - notchDepth;
      const isFacadeColumn = inFrameX && inFrontRows;

      const dx = (bx - cx) / maxR, dz = (bz - cz) / maxR;
      const dist = Math.hypot(dx, dz);
      // The rounded-footprint cutoff would normally skip columns this far
      // out, but a facade column (door frame post or notch/lintel column)
      // sits deliberately right at the mound's front rim -- exactly where
      // the dome silhouette is thinnest -- so it must never be skipped
      // here, or the door loses its post/lintel entirely on that side.
      if (dist > 1.0 && !isFacadeColumn) continue; // outside the rounded footprint -> hill silhouette, not a filled rectangle

      const domeFalloff = Math.cos(Math.min(1, dist) * Math.PI / 2); // 1 at centre, 0 at rim
      const n = noise2D(bx * 0.35, bz * 0.35);
      const jitter = 1 + n * jitterAmt;
      let colHeight = Math.round(bh * domeFalloff * jitter);
      colHeight = Math.max(1, Math.min(bh, colHeight));
      // A facade column (door post or notch/lintel column) must always be
      // tall enough to fully border the doorway opening (one block above
      // the notch, for a connecting lintel), regardless of where it lands
      // on the mound's natural dome falloff. The notch sits at the very
      // front rim, exactly where the dome silhouette is shortest, so
      // without this floor a post could end up only 1 block tall -- far
      // short of framing a `notchHeight`-tall doorway -- leaving the door
      // decoration looking disconnected/floating with nothing solid built
      // around it. This was the root cause of the reported "door doesn't
      // connect to the mound" bug.
      if (isFacadeColumn) colHeight = Math.max(colHeight, notchHeight + 1);

      const inNotchX = bx >= notchXMin && bx < notchXMax;

      const topStart = colHeight - Math.max(1, Math.round(colHeight * 0.3));
      for (let by = 0; by < colHeight; by++) {
        if (opts.facade && inNotchX && inFrontRows && by < notchHeight) continue; // carved doorway/facade recess
        const isFrameBlock = inFrameX && inFrontRows && by < notchHeight + 1;
        const isTop = by >= topStart;
        setBlock(grid, bx, by, bz, isFrameBlock ? 'facade' : (isTop ? 'grass' : 'earth'));
      }
    }
  }

  return grid;
}

/** Shared default so `buildElvenTrunkGrid()` and `elvenWaistRadius()` never drift apart. */
const ELVEN_DEFAULT_WAIST_FRAC = 0.38;

export interface ElvenTrunkOptions {
  /** Fraction (0-1) of total height where the trunk transitions into the canopy (default 0.6). */
  canopyStartFrac?: number;
  /** Radius fraction (of the base radius) at the trunk's narrowest "waist" point (default 0.38 — a distinctly slender trunk, not half the base width, so the canopy silhouette reads as sitting on a proper trunk rather than a stubby neck). */
  waistFrac?: number;
  /** Radius fraction (of the base radius) at the canopy's widest bulge (default 1.35). */
  canopyFlareFrac?: number;
  /** Radius fraction at the very base (root flare), tapering to normal within ~2 levels (default 1.15). */
  rootFlareFrac?: number;
  /** Carve an arched doorway/facade notch into the trunk's front (+Z) face. */
  facade?: boolean;
  /** Fraction of the base footprint width the notch spans at its widest, ground row (default 0.32). */
  facadeWidthFrac?: number;
  /**
   * Fraction of the trunk-phase height the arch rises (default ~0.36, i.e.
   * a human-scale ~2 world-unit-tall doorway). Kept modest by design: the
   * trunk radius shrinks with height, so a fixed-Z-depth door frame taller
   * than this would outrun the (narrowing) trunk surface behind it and
   * read as a disconnected floating post rather than a doorway carved into
   * the trunk — the actual value used is additionally auto-clamped for
   * safety against whatever `waistFrac`/`canopyStartFrac` are in effect.
   */
  facadeHeightFrac?: number;
  /** Bark-surface radius irregularity, applied per vertical "rib" (default 0.1). */
  jitter?: number;
}

/**
 * Number of `BLOCK_UNIT` levels tall an elven trunk of continuous height `h`
 * resolves to. Mirrors `dwarvenBlocksTall()` — exported so callers placing
 * height-dependent props can work in the same quantized space as the grid.
 */
export function elvenTrunkBlocksTall(h: number): number {
  return Math.max(6, Math.round(h / BLOCK_UNIT));
}

/**
 * World-space Y (matching the trunk mesh's own centring convention — see
 * `elvenCanopyTopY()` in FactionBuildingVariants.ts) of the trunk's actual
 * "neck": the level where the taper stops and the canopy ellipsoid
 * begins. Callers placing a balcony/platform ring flush against the trunk
 * (not floating above or sunk into it) should anchor at this height, not
 * an arbitrary fraction of the total trunk height.
 */
export function elvenNeckY(h: number, canopyStartFrac = 0.6): number {
  const bh = elvenTrunkBlocksTall(h);
  const canopyStartBy = Math.round(bh * canopyStartFrac);
  return canopyStartBy * BLOCK_UNIT + BLOCK_UNIT / 2;
}

/**
 * World-unit radius of the trunk's actual constructed surface at the neck
 * (where the taper stops and the canopy begins) — i.e. `waistFrac` of the
 * base radius, converted out of the normalized (÷maxR) space
 * `buildElvenTrunkGrid()` works in and into real world units. Callers
 * sizing a balcony/platform ring should use this (plus a small overhang)
 * so the ring sits flush against the trunk's real surface instead of
 * floating at an arbitrary, possibly much wider or narrower, radius.
 */
export function elvenWaistRadius(w: number, d: number, opts: ElvenTrunkOptions = {}): number {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const waistFrac = opts.waistFrac ?? ELVEN_DEFAULT_WAIST_FRAC;
  return waistFrac * maxR * BLOCK_UNIT;
}

/**
 * Elven living-tree occupancy grid: the heightfield technique run
 * "inside-out" — instead of a per-column stack height (vulperia's mound),
 * every horizontal *level* gets its own radius, narrowing from the base
 * through a "waist" partway up the trunk, then flaring back out into a
 * wider canopy band near the top (a real tapering-then-bulging tree
 * silhouette, not a smooth deformed cylinder-plus-sphere-cluster). A slight
 * root flare widens the very base, and an optional facade notch carves an
 * arched doorway whose width narrows with height following a circular arc
 * — a genuine "round arch," built entirely from block occupancy rather
 * than a separate curved mesh.
 */
export function buildElvenTrunkGrid(
  seed: number, w: number, d: number, h: number,
  opts: ElvenTrunkOptions = {},
): BlockGrid {
  const grid = createBlockGrid();
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = elvenTrunkBlocksTall(h);
  const noise2D = createNoise2D(seed);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const jitterAmt = opts.jitter ?? 0.18;

  const canopyStartFrac = opts.canopyStartFrac ?? 0.6;
  const waistFrac = opts.waistFrac ?? ELVEN_DEFAULT_WAIST_FRAC;
  const rootFlareFrac = opts.rootFlareFrac ?? 1.15;
  // Clamp the canopy flare so it can never exceed the grid's own diagonal
  // reach — otherwise the widest canopy cross-section would include every
  // corner cell (dNorm never exceeds the clamp), filling the entire bw x bd
  // rectangle with zero rounding and reading as a flat slab instead of a
  // bulging crown. `cornerDist` is the normalized distance to the grid's
  // farthest corner; keeping the flare a little under it guarantees the
  // canopy's corners stay excluded (rounded) at every level.
  const cornerDist = Math.hypot(cx, cz) / maxR;
  const canopyFlareFrac = Math.min(opts.canopyFlareFrac ?? 1.2, cornerDist * 0.85);

  /**
   * Trunk-phase radius (as a fraction of the base radius) at normalized
   * height `t` (0..1, trunk-only range). Eases from 1.0 (base) down to
   * `waistFrac` with a *zero-derivative* landing (smoothstep) so the
   * canopy ellipsoid grafted on top (see below) meets it without a visible
   * kink/collar — the single biggest cause of the old profile reading as
   * a flying-saucer "mushroom cap" instead of a tree crown.
   */
  function trunkRadiusFracAt(t: number): number {
    const u = canopyStartFrac > 0 ? t / canopyStartFrac : 1;
    return smoothTaperRadiusFrac(u, 1, waistFrac);
  }

  const canopyStartBy = Math.round(bh * canopyStartFrac);
  // Canopy modelled as a small central crown cap plus several DISTINCTLY
  // SEPARATED satellite foliage lobes, each reached by its own visible
  // branch — not one single wide ellipsoid disc (always axi-symmetric,
  // reads as a "mushroom cap"), and not lobes packed so tightly against
  // the trunk that they visually fuse into one undifferentiated mass
  // either (the earlier attempt's failure mode: branches existed in code
  // but were entirely swallowed by overlapping leaf lobes, so they added
  // no visible geometry). Real trees — and stylized tree references from
  // Zelda: Wind Waker's toon foliage to Minecraft's oak canopy — read as
  // *recognizably a tree* specifically because you can see individual
  // rounded foliage clumps held apart from the trunk by branches, not
  // because the clumps are perfectly smooth or perfectly round.
  const canopyRadiusY = Math.max(1, bh - 1 - canopyStartBy);
  const lobeRng = mulberry32(seed ^ 0x9E37_79B9);
  // Central crown cap: modest size, sits right above the neck — reads as
  // the core of the canopy, not the whole silhouette.
  const mainRxz = canopyFlareFrac * maxR * 0.34;
  const mainRy = canopyRadiusY * 0.4;
  interface CanopyLobe { cx: number; cy: number; cz: number; rxz: number; ry: number }
  const lobes: CanopyLobe[] = [
    { cx, cy: canopyStartBy + mainRy * 0.7, cz, rxz: mainRxz, ry: mainRy },
  ];
  const numSatellites = 3 + Math.floor(lobeRng() * 2); // 3-4 satellite foliage masses
  interface BranchSeg { ax: number; ay: number; az: number; bx: number; by: number; bz: number; }
  const branches: BranchSeg[] = [];
  for (let i = 0; i < numSatellites; i++) {
    const ang = (i / numSatellites) * Math.PI * 2 + lobeRng() * 0.8;
    // Real separation from the trunk axis: far enough out that, after the
    // central cap's own radius is subtracted, there's genuine empty space
    // between the cap and each satellite — that gap is what makes the
    // connecting branch visible instead of swallowed.
    const offsetFrac = 0.95 + lobeRng() * 0.45;
    const satRxz = mainRxz * (0.62 + lobeRng() * 0.3);
    const satRy = mainRy * (0.75 + lobeRng() * 0.4);
    // Vary height broadly across the canopy's vertical range so the
    // satellites sit at different levels (asymmetric, layered crown)
    // rather than all lined up in one flat ring at the same height.
    const heightFrac = 0.25 + lobeRng() * 0.65;
    const satCy = canopyStartBy + canopyRadiusY * heightFrac;
    const lobeCx = cx + Math.cos(ang) * offsetFrac * maxR;
    const lobeCz = cz + Math.sin(ang) * offsetFrac * maxR;
    lobes.push({ cx: lobeCx, cy: satCy, cz: lobeCz, rxz: satRxz, ry: satRy });
    // Branch: starts low on the upper trunk/neck (varied per branch, some
    // originating a little below the neck like a real limb splitting off
    // the trunk itself) and climbs out to the satellite's own centre —
    // the only connective tissue between trunk and this foliage mass, so
    // it reads as a genuine branch bridging real empty space.
    const branchStartBy = canopyStartBy - Math.round(lobeRng() * 3);
    branches.push({ ax: cx, ay: branchStartBy, az: cz, bx: lobeCx, by: satCy, bz: lobeCz });
  }
  /** Shortest distance from point p to line segment a-b, all in raw column-index units; also returns the segment parameter t (0=a, 1=b) for radius tapering. */
  function distToSegment(px: number, py: number, pz: number, seg: BranchSeg): { dist: number; t: number } {
    const abx = seg.bx - seg.ax, aby = seg.by - seg.ay, abz = seg.bz - seg.az;
    const apx = px - seg.ax, apy = py - seg.ay, apz = pz - seg.az;
    const abLenSq = abx * abx + aby * aby + abz * abz;
    const t = abLenSq > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq)) : 0;
    const cxp = seg.ax + abx * t, cyp = seg.ay + aby * t, czp = seg.az + abz * t;
    return { dist: Math.hypot(px - cxp, py - cyp, pz - czp), t };
  }
  /**
   * Branch thickness at parameter `segT` (0 at the trunk end, 1 at the
   * lobe end) — tapered thicker-at-trunk, thinner-at-tip like a real limb,
   * in raw (unnormalized) column-index units.
   */
  function branchRadiusAt(segT: number): number {
    return maxR * (0.22 - 0.09 * segT);
  }
  // Generous early-exit radius (in the same ÷maxR normalized units as
  // dNorm) accounting for the furthest any satellite lobe can reach from
  // the trunk axis, so the per-column scan below doesn't clip any lobe
  // short. Computed from the actual lobe set rather than guessed, so it
  // stays correct if the lobe sizing/offset tuning above changes again.
  let canopyReachNorm = 0;
  for (const lobe of lobes) {
    const offCx = (lobe.cx - cx) / maxR, offCz = (lobe.cz - cz) / maxR;
    const reach = Math.hypot(offCx, offCz) + lobe.rxz / maxR;
    if (reach > canopyReachNorm) canopyReachNorm = reach;
  }

  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.32))) : 0;
  const requestedNotchHeight = opts.facade ? Math.max(3, Math.round(canopyStartBy * (opts.facadeHeightFrac ?? 0.36))) : 0;
  // The doorway/frame is carved into the trunk's fixed front footprint rows
  // (bz >= bd - notchDepth), but the trunk itself tapers inward with height.
  // Once the taper has narrowed enough that the trunk's own radius no
  // longer reaches that fixed Z depth, the frame posts would stick out
  // past the (already-receded) trunk surface behind them — reading as a
  // thin vertical pillar floating disconnected in front of the trunk,
  // rather than a doorway built into it (this was a real, confirmed bug,
  // not just a rendering illusion). Clamp the notch height to stop
  // *before* that happens: find the tallest row at which the trunk still
  // comfortably covers the frame post's worst-case (outermost) corner,
  // with a safety margin against the per-cell jitter noise.
  const notchDepth = 2;
  const frameCornerDx = (notchWidth / 2 + 1) / maxR;
  const frameCornerDz = (bd - 1 - cz) / maxR;
  const frameCornerDist = Math.hypot(frameCornerDx, frameCornerDz);
  let notchHeight = requestedNotchHeight;
  if (opts.facade) {
    notchHeight = requestedNotchHeight;
    for (let by = 0; by < requestedNotchHeight; by++) {
      const t = bh > 1 ? by / (bh - 1) : 0;
      if (trunkRadiusFracAt(t) < frameCornerDist * 1.08) { notchHeight = Math.max(2, by); break; }
    }
  }
  const notchCx = Math.round(bw / 2);

  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const dx = (bx - cx) / maxR, dz = (bz - cz) / maxR;
      const dNorm = Math.hypot(dx, dz);
      if (dNorm > Math.max(1.5, canopyReachNorm)) continue; // hard cutoff, avoids scanning far outside any possible radius

      for (let by = 0; by < bh; by++) {
        const inCanopy = by >= canopyStartBy;
        // Organic surface roughening: noise that varies with BOTH column
        // position and height, so the bark/leaf boundary reads as a
        // mottled, hand-carved surface rather than either static vertical
        // "ribs" (noise fixed per column) or perfectly concentric rings
        // (no per-level variation at all).
        const n = noise2D(bx * 0.42 + by * 0.11, bz * 0.42 - by * 0.09);

        if (!inCanopy) {
          const t = bh > 1 ? by / (bh - 1) : 0;
          let radiusFrac = trunkRadiusFracAt(t) * (1 + n * jitterAmt);
          if (by <= 1) {
            // Root flare: widen the base 2 levels, tapering to the normal
            // trunk radius by by=2 — baked directly into the occupancy
            // silhouette instead of bolted-on cylinder "root" props.
            const flareBlend = by === 0 ? 1 : 0.5;
            radiusFrac = Math.max(radiusFrac, rootFlareFrac * flareBlend + radiusFrac * (1 - flareBlend));
          }
          if (dNorm > radiusFrac) continue;

          let material = 'bark';
          if (opts.facade && by < notchHeight && bz >= bd - notchDepth) {
            // Arch narrows with height following a circular arc — a
            // genuine round-top archway built from occupancy, not a
            // separate curved mesh. `frac` is how far up the arch this
            // row is; the notch's half-width shrinks toward 0 as frac -> 1.
            const frac = by / notchHeight;
            const halfWidthHere = Math.max(0, Math.round((notchWidth / 2) * Math.sqrt(Math.max(0, 1 - frac * frac))));
            const inNotchX = Math.abs(bx - notchCx) < halfWidthHere;
            const inFrameX = Math.abs(bx - notchCx) < halfWidthHere + 1;
            if (inNotchX) continue; // carved doorway
            if (inFrameX) material = 'facade'; // kept jamb post, promoted material
          }
          setBlock(grid, bx, by, bz, material);
        } else {
          // Multi-lobe crown test: distance to the *nearest* lobe's own
          // ellipsoid centre/radii, roughened by the same organic noise so
          // each lobe's boundary is a lumpy, hand-grown mass rather than a
          // smooth dome — occupied if any lobe covers this cell.
          let best = Infinity;
          for (const lobe of lobes) {
            const ddx = (bx - lobe.cx) / lobe.rxz;
            const ddy = (by - lobe.cy) / lobe.ry;
            const ddz = (bz - lobe.cz) / lobe.rxz;
            const dist = Math.hypot(ddx, ddy, ddz);
            if (dist < best) best = dist;
          }
          if (best <= 1 + n * (jitterAmt * 1.3)) {
            setBlock(grid, bx, by, bz, 'leaf');
            continue;
          }
          // Not inside any leaf lobe — check whether this cell sits on one
          // of the branch connectors reaching out to a satellite lobe; if
          // so, occupy it as bark so the satellite visibly grows out of a
          // branch instead of floating detached in open space.
          let onBranch = false;
          for (const seg of branches) {
            const { dist, t } = distToSegment(bx, by, bz, seg);
            if (dist <= branchRadiusAt(t)) { onBranch = true; break; }
          }
          if (onBranch) setBlock(grid, bx, by, bz, 'bark');
        }
      }
    }
  }

  // Moonlit belt: reclassify the outward-facing surface ring right at the
  // trunk/canopy transition to a pale "moonstone" accent material — a
  // decorative band grown into the silhouette rather than a bolted-on ring.
  for (const [k, matKey] of [...grid.cells.entries()]) {
    if (matKey !== 'bark') continue;
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    if (Math.abs(by - canopyStartBy) > 0) continue;
    const exposed = !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1);
    if (exposed) grid.cells.set(k, 'moonstone');
  }

  // Firefly/moonberry glow accents: a handful of canopy-surface blocks
  // (exposed on at least one side, so the glow reads from outside)
  // reclassified to the 'glow' material — deterministic per seed, always
  // an existing solid block (never a separately floating prop).
  const r = mulberry32(seed ^ 0xE1F3_ACC1);
  const canopySurface = [...grid.cells.entries()].filter(([k, matKey]) => {
    if (matKey !== 'leaf') return false;
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    return !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1)
      || !hasBlock(grid, bx, by + 1, bz);
  });
  const glowCount = Math.min(canopySurface.length, 3 + Math.floor(r() * 3));
  for (let i = 0; i < glowCount; i++) {
    const idx = Math.floor(r() * canopySurface.length);
    const [glowKey] = canopySurface[idx] ?? [];
    if (glowKey) grid.cells.set(glowKey, 'glow');
  }

  return grid;
}

// ── Vampire: tapering gothic spire ──────────────────────────────────────────

export interface VampireSpireOptions {
  /**
   * Fraction (0-1) of total height where the tapering body stops
   * narrowing and the flat crenellated parapet deck begins (default 0.82
   * — a tall spire with a proportionally small deck, the opposite ratio
   * from a squat dwarven tower).
   */
  parapetStartFrac?: number;
  /** Radius fraction (of the base radius) at the spire's narrowest point, just below the deck (default 0.34 — gaunt and needle-narrow). */
  waistFrac?: number;
  /** Radius fraction at the very base (plinth flare), tapering to normal within ~2 levels (default 1.12). */
  plinthFlareFrac?: number;
  /** Carve a pointed gothic-arch doorway/facade notch into the front (+Z) face. */
  facade?: boolean;
  /** Fraction of the base footprint width the notch spans at its widest, ground row (default 0.34). */
  facadeWidthFrac?: number;
  /** Fraction of the pre-parapet height the pointed arch rises (default 0.4, auto-clamped for safety — see `buildElvenTrunkGrid()`'s identical technique). */
  facadeHeightFrac?: number;
  /** Surface irregularity per column (default 0.05 — obsidian reads as cut, precise stone, deliberately far less organic noise than vulperia's earth or elven's bark). */
  jitter?: number;
}

/** Number of `BLOCK_UNIT` levels tall a vampire spire of continuous height `h` resolves to. Mirrors `elvenTrunkBlocksTall()`/`dwarvenBlocksTall()`. */
export function vampireSpireBlocksTall(h: number): number {
  return Math.max(8, Math.round(h / BLOCK_UNIT));
}

/** World-space Y of the topmost crenellation ring (the spire's true built roofline) — for flush-mounted banner/weathervane props. */
export function vampireSpireTopY(h: number): number {
  const bh = vampireSpireBlocksTall(h);
  return (bh - 1) * BLOCK_UNIT + BLOCK_UNIT / 2;
}

/** World-unit radius of the parapet deck's actual constructed surface (the flat neck below the crenellations) — for props (gargoyles, balconies) that should sit flush against the real surface instead of an arbitrary radius. Mirrors `elvenWaistRadius()`. */
export function vampireSpireDeckRadius(w: number, d: number, opts: VampireSpireOptions = {}): number {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const waistFrac = opts.waistFrac ?? 0.34;
  return waistFrac * maxR * BLOCK_UNIT;
}

/**
 * Vampire gothic-spire occupancy grid: a tall, gaunt tower that tapers
 * monotonically from its (slightly flared) plinth up to a narrow neck
 * using the same `smoothTaperRadiusFrac()` technique as
 * `buildElvenTrunkGrid()`'s trunk-to-canopy taper (run here as a single
 * one-way taper with no flare-back-out), then holds a flat parapet deck
 * for a short run before ending in an alternating merlon/gap crenellation
 * ring built entirely from block occupancy — a real battlement, not a
 * bolted-on cone or box roof. An optional pointed (linear, not round)
 * gothic-arch doorway carves into the front face using the same
 * "clamp the arch height so it never outruns the receding taper surface"
 * safety technique the elven trunk uses.
 */
export function buildVampireSpireGrid(
  seed: number, w: number, d: number, h: number,
  opts: VampireSpireOptions = {},
): BlockGrid {
  const grid = createBlockGrid();
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = vampireSpireBlocksTall(h);
  const noise2D = createNoise2D(seed);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const jitterAmt = opts.jitter ?? 0.05;

  const parapetStartFrac = opts.parapetStartFrac ?? 0.82;
  const waistFrac = opts.waistFrac ?? 0.34;
  const plinthFlareFrac = opts.plinthFlareFrac ?? 1.12;

  let parapetStartBy = Math.round(bh * parapetStartFrac);
  const deckTopBy = bh - 2;   // solid flat roof deck (last fully-filled disc)
  const merlonBy = bh - 1;    // topmost level: alternating merlons only
  parapetStartBy = Math.max(1, Math.min(parapetStartBy, deckTopBy - 1));

  /** Un-jittered taper radius fraction at level `by` (monotonic 1 -> waistFrac, then held flat through the deck). */
  function taperFracAt(by: number): number {
    const cappedBy = Math.min(by, parapetStartBy);
    const t = bh > 1 ? cappedBy / (bh - 1) : 0;
    const u = parapetStartFrac > 0 ? t / parapetStartFrac : 1;
    return smoothTaperRadiusFrac(u, 1, waistFrac);
  }

  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.34))) : 0;
  const requestedNotchHeight = opts.facade ? Math.max(3, Math.round(parapetStartBy * (opts.facadeHeightFrac ?? 0.4))) : 0;
  const notchDepth = 2;
  const notchCx = Math.round(bw / 2);
  // Same safety clamp as buildElvenTrunkGrid(): stop the arch before the
  // taper narrows past the frame post's own corner, so the post is never
  // left floating in front of a surface that's already receded behind it.
  const frameCornerDx = (notchWidth / 2 + 1) / maxR;
  const frameCornerDz = (bd - 1 - cz) / maxR;
  const frameCornerDist = Math.hypot(frameCornerDx, frameCornerDz);
  let notchHeight = requestedNotchHeight;
  if (opts.facade) {
    for (let by = 0; by < requestedNotchHeight; by++) {
      if (taperFracAt(by) < frameCornerDist * 1.08) { notchHeight = Math.max(2, by); break; }
    }
  }

  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const dx = (bx - cx) / maxR, dz = (bz - cz) / maxR;
      const dNorm = Math.hypot(dx, dz);
      if (dNorm > 1.5) continue; // hard cutoff well outside any possible radius

      for (let by = 0; by <= deckTopBy; by++) {
        const n = noise2D(bx * 0.5 + by * 0.05, bz * 0.5 - by * 0.05);
        let radiusFrac = taperFracAt(by) * (1 + n * jitterAmt);
        if (by <= 1) {
          // Plinth flare: widen the base 2 levels, same technique as the
          // elven trunk's root flare, baked into the occupancy silhouette.
          const flareBlend = by === 0 ? 1 : 0.5;
          radiusFrac = Math.max(radiusFrac, plinthFlareFrac * flareBlend + radiusFrac * (1 - flareBlend));
        }
        if (dNorm > radiusFrac) continue;

        let material = 'obsidian';
        if (opts.facade && by < notchHeight && bz >= bd - notchDepth) {
          // Pointed gothic arch: half-width tapers LINEARLY (not the
          // elven doorway's sqrt round-arch curve) so the apex comes to a
          // genuine point — the deliberate silhouette difference between
          // vampire's gothic arch and elven's round arch.
          const frac = by / notchHeight;
          const halfWidthHere = Math.max(0, Math.round((notchWidth / 2) * (1 - frac)));
          const inNotchX = Math.abs(bx - notchCx) < halfWidthHere;
          const inFrameX = Math.abs(bx - notchCx) < halfWidthHere + 1;
          if (inNotchX) continue; // carved doorway
          if (inFrameX) material = 'facade'; // kept jamb post, promoted material
        }
        setBlock(grid, bx, by, bz, material);
      }
    }
  }

  // Crenellated parapet: find the deck's own exposed perimeter ring (the
  // boundary cells of the solid disc at deckTopBy), order them by angle
  // around the tower's own axis, and raise every OTHER one by a single
  // block into an 'iron' merlon at merlonBy — a genuine alternating
  // merlon/gap battlement built from occupancy, not a bolted-on ring mesh.
  const ring: Array<{ bx: number; bz: number }> = [];
  for (const [k, matKey] of grid.cells) {
    if (matKey === 'facade') continue; // door lintel shouldn't sprout a merlon
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    if (by !== deckTopBy) continue;
    const exposed = !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1);
    if (exposed) ring.push({ bx, bz });
  }
  ring.sort((a, b) => Math.atan2(a.bz - cz, a.bx - cx) - Math.atan2(b.bz - cz, b.bx - cx));
  for (let i = 0; i < ring.length; i++) {
    if (i % 2 === 0) setBlock(grid, ring[i]!.bx, merlonBy, ring[i]!.bz, 'iron');
  }

  // Coping band: reclassify the exposed surface ring right at the
  // taper-to-deck transition to the 'iron' material — a decorative band
  // grown into the silhouette, mirroring the elven trunk's "moonlit belt."
  for (const [k, matKey] of [...grid.cells.entries()]) {
    if (matKey !== 'obsidian') continue;
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    if (by !== parapetStartBy) continue;
    const exposed = !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1);
    if (exposed) grid.cells.set(k, 'iron');
  }

  // Lit gothic windows: a handful of upper-body surface blocks (never the
  // plinth) reclassified to the 'bloodglow' accent material — deterministic
  // per seed, mirroring the elven canopy's firefly-glow accents.
  const r = mulberry32(seed ^ 0xB100D_1234);
  const upperSurface = [...grid.cells.entries()].filter(([k, matKey]) => {
    if (matKey !== 'obsidian') return false;
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    if (by < 2 || by >= parapetStartBy) return false;
    return !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1);
  });
  const glowCount = Math.min(upperSurface.length, 2 + Math.floor(r() * 3));
  for (let i = 0; i < glowCount; i++) {
    const idx = Math.floor(r() * upperSurface.length);
    const [glowKey] = upperSurface[idx] ?? [];
    if (glowKey) grid.cells.set(glowKey, 'bloodglow');
  }

  return grid;
}

// ── Fae: twisted toadstool stalk + scalloped mushroom cap ───────────────────

export interface FaeStalkOptions {
  /** Fraction (0-1) of total height where the stalk ends and the cap begins flaring outward (default 0.55). */
  capStartFrac?: number;
  /** Fraction of total height where the cap's outward flare peaks, before crowning back in for a domed top (default 0.86). */
  capPeakFrac?: number;
  /** Stalk's own mild taper amount at its narrowest, just below the cap (default 0.8 — a gentle gnarled waist, not a dramatic taper). */
  waistFrac?: number;
  /** Cap radius fraction at its widest (of the base radius) — mushroom caps oversail the stalk dramatically (default 2.1). */
  capFlareFrac?: number;
  /** Radius fraction the very top few levels crown back down to, forming a domed cap-top rather than a flat plateau (default 0.6). */
  domeFrac?: number;
  /** Carve a circular whimsical portal doorway into the front (+Z) face, entirely within the stalk phase. */
  facade?: boolean;
  /** Portal diameter as a fraction of the stalk's own height range (default 0.4). */
  facadeWidthFrac?: number;
  /** Surface irregularity per column; boosted specifically at the cap's rim level for a wavy, scalloped edge (default 0.09). */
  jitter?: number;
}

/** Number of `BLOCK_UNIT` levels tall a fae stalk+cap of continuous height `h` resolves to. Mirrors `elvenTrunkBlocksTall()`/`vampireSpireBlocksTall()`. */
export function faeStalkBlocksTall(h: number): number {
  return Math.max(8, Math.round(h / BLOCK_UNIT));
}

/** World-space Y of the cap's domed crown (the true built roofline) — for flush-mounted firefly/spore props. */
export function faeCapTopY(h: number): number {
  const bh = faeStalkBlocksTall(h);
  return (bh - 1) * BLOCK_UNIT + BLOCK_UNIT / 2;
}

/** World-unit radius of the cap's actual constructed rim (its widest built ring) — for petal/gill props that should sit flush against the real surface instead of an arbitrary radius. Mirrors `elvenWaistRadius()`/`vampireSpireDeckRadius()`. */
export function faeCapRimRadius(w: number, d: number, opts: FaeStalkOptions = {}): number {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const cornerDist = Math.hypot(cx, cz) / maxR;
  const capFlareFrac = Math.min(opts.capFlareFrac ?? 2.1, cornerDist * 0.92);
  return capFlareFrac * maxR * BLOCK_UNIT;
}

/**
 * Fae toadstool occupancy grid: a mildly-tapering stalk (reusing
 * `smoothTaperRadiusFrac()`, the same shared helper the elven trunk and
 * vampire spire use) that flares dramatically outward into a broad
 * mushroom-cap disc, then crowns back down into a domed cap-top — a real
 * continuous mushroom silhouette carved from block occupancy (the "reuses
 * taper+flare" technique from the rollout todo), not a smooth cylinder
 * stalk topped with a separate scalloped-sphere primitive. The cap's rim
 * level gets amplified per-column noise for a genuinely wavy, irregular
 * scalloped edge, and a handful of upper cap-surface blocks are
 * reclassified to a bioluminescent 'spore' accent material — the block
 * equivalent of the old primitive version's glowing wart bumps. An optional
 * circular "portal" doorway (constant-radius hole, not an arch that grows
 * from the ground) carves into the stalk, safely confined to the
 * near-constant-radius stalk phase so it can never outrun the cap's flare.
 */
export function buildFaeStalkGrid(
  seed: number, w: number, d: number, h: number,
  opts: FaeStalkOptions = {},
): BlockGrid {
  const grid = createBlockGrid();
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = faeStalkBlocksTall(h);
  const noise2D = createNoise2D(seed);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const jitterAmt = opts.jitter ?? 0.09;

  const capStartFrac = opts.capStartFrac ?? 0.55;
  const capPeakFrac = Math.max(capStartFrac + 0.05, opts.capPeakFrac ?? 0.86);
  const waistFrac = opts.waistFrac ?? 0.8;
  const domeFrac = opts.domeFrac ?? 0.6;
  // Same corner-reach clamp technique as the elven canopy: keep the cap's
  // flare a little under the grid's own diagonal reach so its corners stay
  // rounded (excluded) at every level instead of filling into a flat slab.
  const cornerDist = Math.hypot(cx, cz) / maxR;
  const capFlareFrac = Math.min(opts.capFlareFrac ?? 2.1, cornerDist * 0.92);

  const capStartBy = Math.round(bh * capStartFrac);
  const capPeakBy = Math.round(bh * capPeakFrac);

  /** Un-jittered radius fraction at level `by`: stalk taper, then cap flare-out, then dome crown-in. */
  function radiusFracAt(by: number): number {
    const t = bh > 1 ? by / (bh - 1) : 0;
    if (t <= capStartFrac) {
      const u = capStartFrac > 0 ? t / capStartFrac : 1;
      return smoothTaperRadiusFrac(u, 1, waistFrac);
    }
    if (t <= capPeakFrac) {
      const u = (t - capStartFrac) / (capPeakFrac - capStartFrac);
      return smoothTaperRadiusFrac(u, waistFrac, capFlareFrac);
    }
    const u = capPeakFrac < 1 ? (t - capPeakFrac) / (1 - capPeakFrac) : 1;
    return smoothTaperRadiusFrac(u, capFlareFrac, domeFrac);
  }

  const notchWidth = opts.facade ? Math.max(2, Math.round(bw * (opts.facadeWidthFrac ?? 0.4))) : 0;
  let notchRadius = notchWidth / 2;
  const notchCy = Math.max(notchRadius + 1, Math.round(capStartBy * 0.5));
  // Safety clamp (same spirit as the elven trunk's/vampire spire's
  // frame-corner clamp): the portal's frame must stay entirely within the
  // stalk's near-constant-radius phase, well clear of where the cap begins
  // flaring, so the frame ring can never poke out past a stalk surface
  // that's already receded/expanded behind it.
  const maxNotchTop = capStartBy - 2;
  if (opts.facade && notchCy + notchRadius + 1 > maxNotchTop) {
    notchRadius = Math.max(1, maxNotchTop - notchCy - 1);
  }
  const notchCx = Math.round(bw / 2);
  const notchDepth = 2;

  for (let bx = 0; bx < bw; bx++) {
    for (let bz = 0; bz < bd; bz++) {
      const dx = (bx - cx) / maxR, dz = (bz - cz) / maxR;
      const dNorm = Math.hypot(dx, dz);
      if (dNorm > capFlareFrac + 0.5) continue; // hard cutoff well outside any possible radius

      for (let by = 0; by < bh; by++) {
        // Rim-boosted noise: near the cap's widest ring the amplitude is
        // amplified so the perimeter reads as a genuinely wavy, scalloped
        // toadstool edge rather than a smooth circular disc.
        const distToPeak = Math.abs(by - capPeakBy) / Math.max(1, bh * 0.12);
        const rimBoost = 1 + Math.max(0, 1 - distToPeak) * 1.6;
        const n = noise2D(bx * 0.55 + by * 0.08, bz * 0.55 - by * 0.06);
        const radiusFrac = radiusFracAt(by) * (1 + n * jitterAmt * rimBoost);
        if (dNorm > radiusFrac) continue;

        const inCap = by >= capStartBy;
        let material = inCap ? 'cap' : 'stalk';

        if (opts.facade && !inCap && bz >= bd - notchDepth) {
          // Circular whimsical portal: a constant-radius hole (not an arch
          // that grows from the ground) — carved entirely within the
          // near-constant-radius stalk phase, so it can never outrun the
          // cap's dramatic flare above it.
          const dyToCentre = by - notchCy;
          const inNotch = Math.abs(bx - notchCx) * Math.abs(bx - notchCx) + dyToCentre * dyToCentre < notchRadius * notchRadius;
          const inFrame = Math.abs(bx - notchCx) * Math.abs(bx - notchCx) + dyToCentre * dyToCentre < (notchRadius + 1) * (notchRadius + 1);
          if (inNotch) continue; // carved doorway
          if (inFrame) material = 'facade'; // kept jamb ring, promoted material
        }
        setBlock(grid, bx, by, bz, material);
      }
    }
  }

  // Bioluminescent spore accents: a handful of exposed upper-cap-surface
  // blocks reclassified to the 'spore' glow material — deterministic per
  // seed, the block-built equivalent of the old primitive version's raised
  // glowing wart bumps.
  const r = mulberry32(seed ^ 0xFA_E0_ACC0);
  const capSurface = [...grid.cells.entries()].filter(([k, matKey]) => {
    if (matKey !== 'cap') return false;
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    if (by < capStartBy) return false;
    return !hasBlock(grid, bx + 1, by, bz) || !hasBlock(grid, bx - 1, by, bz)
      || !hasBlock(grid, bx, by, bz + 1) || !hasBlock(grid, bx, by, bz - 1)
      || !hasBlock(grid, bx, by + 1, bz);
  });
  const sporeCount = Math.min(capSurface.length, 3 + Math.floor(r() * 4));
  for (let i = 0; i < sporeCount; i++) {
    const idx = Math.floor(r() * capSurface.length);
    const [sporeKey] = capSurface[idx] ?? [];
    if (sporeKey) grid.cells.set(sporeKey, 'spore');
  }

  return grid;
}
