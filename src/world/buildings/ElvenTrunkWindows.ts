/**
 * ElvenTrunkWindows.ts — carved window openings for the elven living-tree home
 * (`buildElvenVilla()` in FactionBuildingVariants.ts). Extends the exact same
 * occupancy-carving technique already proven on the trunk's front doorway (a genuine
 * removed-block notch, not a separate mesh or a flat material recolor) to smaller
 * window openings placed at several angles around the trunk's circumference, one band
 * per floor. See docs/superpowers/specs/2026-09-03-elven-treehouse-home-design.md.
 */

import { mulberry32 } from '@/core/prng';
import { hasBlock, clearBlock, setBlock, type BlockGrid, BLOCK_UNIT } from './BlockKit';
import { elvenTrunkRadiusFracAt, elvenTrunkBlocksTall } from './FactionBlockProfiles';

/** Picks how many window openings to carve for one floor band (2, 3, or 4, evenly
 *  weighted, re-rolled per floor so a single building's floors don't all match). */
export function pickWindowCount(seed: number, floorIndex: number): number {
  const rand = mulberry32((seed ^ (0xC0FF33 + floorIndex * 0x1000)) >>> 0);
  return 2 + Math.floor(rand() * 3);
}

export interface TrunkWindowOptions {
  canopyStartFrac?: number;
  waistFrac?: number;
}

const DEFAULT_CANOPY_START_FRAC = 0.6;
const DEFAULT_WAIST_FRAC = 0.38;

/**
 * Carves window openings into an already-built trunk grid (called as a post-pass,
 * after `buildElvenTrunkGrid()` returns, from `addBlockElvenTrunk()`). One floor band
 * per `floors`, evenly spaced within the trunk phase (`[0, canopyStartFrac]` of total
 * height); each band gets 2-4 window angles around the trunk's circumference (skipping
 * the doorway's own +Z-facing angle on the ground floor, so windows never overlap the
 * entrance).
 */
export function carveTrunkWindows(
  grid: BlockGrid, w: number, d: number, h: number, floors: number, seed: number,
  opts: TrunkWindowOptions = {},
): void {
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  const bh = elvenTrunkBlocksTall(h);
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz) + 0.5;
  const canopyStartFrac = opts.canopyStartFrac ?? DEFAULT_CANOPY_START_FRAC;
  const waistFrac = opts.waistFrac ?? DEFAULT_WAIST_FRAC;
  const canopyStartBy = Math.round(bh * canopyStartFrac);
  const DOOR_ANGLE = Math.PI / 2; // matches the door's own +Z-facing convention

  for (let floorIdx = 0; floorIdx < floors; floorIdx++) {
    const centerFrac = ((floorIdx + 0.5) / floors) * canopyStartFrac;
    const centerBy = Math.round(bh * centerFrac);
    if (centerBy < 2 || centerBy >= canopyStartBy - 1) continue; // stay clear of root flare & neck
    const windowCount = pickWindowCount(seed, floorIdx);
    const angleRand = mulberry32((seed ^ (0xF00D + floorIdx * 0x777)) >>> 0);
    for (let wIdx = 0; wIdx < windowCount; wIdx++) {
      const baseAngle = (wIdx / windowCount) * Math.PI * 2;
      const gap = (Math.PI * 2) / windowCount;
      const angle = baseAngle + (angleRand() - 0.5) * gap * 0.4;
      if (floorIdx === 0) {
        let diff = Math.abs(angle - DOOR_ANGLE);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.5) continue; // too close to the doorway, skip this window
      }
      carveOneWindow(grid, bw, bd, bh, cx, cz, maxR, canopyStartFrac, waistFrac, centerBy, angle);
    }
  }
}

function carveOneWindow(
  grid: BlockGrid, bw: number, bd: number, bh: number,
  cx: number, cz: number, maxR: number,
  canopyStartFrac: number, waistFrac: number,
  centerBy: number, angle: number,
): void {
  const halfHeight = 1; // window spans centerBy-1 .. centerBy+1 (3 rows tall)
  const halfWidthAngle = 0.35; // radians (~20deg half-width)
  const frameMargin = 0.15; // extra radians around the notch that become window_frame
  const notchDepth = 1; // shallower than the door's notchDepth=2 -- windows are smaller features

  for (let by = centerBy - halfHeight; by <= centerBy + halfHeight; by++) {
    if (by < 0 || by >= bh) continue;
    const t = bh > 1 ? by / (bh - 1) : 0;
    const radiusFrac = elvenTrunkRadiusFracAt(t, canopyStartFrac, waistFrac);
    const surfaceR = radiusFrac * maxR;
    const heightFracLocal = (by - (centerBy - halfHeight)) / (2 * halfHeight);
    const widthScale = heightFracLocal < 0.5 ? 1 : Math.max(0, 1 - (heightFracLocal - 0.5) * 2);
    const thisHalfWidthAngle = halfWidthAngle * widthScale;
    if (thisHalfWidthAngle <= 0) continue;

    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const dx = bx - cx, dz = bz - cz;
        const dist = Math.hypot(dx, dz);
        const dNorm = dist / maxR;
        if (dNorm > radiusFrac + 0.05) continue;
        const depthFromSurface = surfaceR - dist;
        if (depthFromSurface < 0 || depthFromSurface > notchDepth) continue;
        let angleDiff = Math.abs(Math.atan2(dz, dx) - angle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        if (angleDiff > thisHalfWidthAngle + frameMargin) continue;
        if (!hasBlock(grid, bx, by, bz)) continue; // only carve into actual built wall
        if (angleDiff <= thisHalfWidthAngle) {
          clearBlock(grid, bx, by, bz); // genuine open notch, matching the door's technique
        } else {
          setBlock(grid, bx, by, bz, 'window_frame');
        }
      }
    }
  }
}
