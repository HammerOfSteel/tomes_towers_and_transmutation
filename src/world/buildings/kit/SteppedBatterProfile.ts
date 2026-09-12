import { octagonFaces, rectangleFaces, rectanglePoints, type OctagonFace } from '../StoneTowerShape';

/**
 * SteppedBatterProfile.ts — dwarven massing kit module. Produces per-tier
 * footprint face/point lists that batter (widen) at the base and step
 * inward tier-by-tier, so a caller can feed each tier into
 * `buildWallSurfaceBlocks({ facesOverride })` / `buildPlinthCourses()` to get
 * a genuinely stepped-in silhouette (real geometry break per storey, not a
 * flat texture change) — used for dwarven watchtower tiers and the
 * battered ground storey of houses/villas.
 */
export interface BatterTier {
  halfW: number;
  halfD: number;
  height: number;
  y: number;
  faces: OctagonFace[];
  points: [number, number][];
}

export interface OctagonBatterTier {
  radius: number;
  height: number;
  y: number;
  faces: OctagonFace[];
}

export interface BatterProfileOptions {
  /** Fractional outward batter applied to the ground tier only. Default 0.08. */
  baseBatterFrac?: number;
  /** Fractional inward step applied to each tier above the first. Default 0.10. */
  insetPerTierFrac?: number;
}

export function makeBatteredRectangleTiers(
  baseHalfW: number,
  baseHalfD: number,
  tierHeights: number[],
  options: BatterProfileOptions = {},
): BatterTier[] {
  const baseBatterFrac = options.baseBatterFrac ?? 0.08;
  const insetPerTierFrac = options.insetPerTierFrac ?? 0.10;

  const tiers: BatterTier[] = [];
  let halfW = baseHalfW * (1 + baseBatterFrac);
  let halfD = baseHalfD * (1 + baseBatterFrac);
  let y = 0;

  for (let index = 0; index < tierHeights.length; index++) {
    const height = tierHeights[index]!;
    if (index > 0) {
      halfW *= 1 - insetPerTierFrac;
      halfD *= 1 - insetPerTierFrac;
    }
    tiers.push({
      halfW,
      halfD,
      height,
      y,
      faces: rectangleFaces(halfW, halfD),
      points: rectanglePoints(halfW, halfD),
    });
    y += height;
  }

  return tiers;
}

export function makeSteppedOctagonTiers(
  baseRadius: number,
  tierHeights: number[],
  options: BatterProfileOptions = {},
): OctagonBatterTier[] {
  const baseBatterFrac = options.baseBatterFrac ?? 0.08;
  const insetPerTierFrac = options.insetPerTierFrac ?? 0.10;

  const tiers: OctagonBatterTier[] = [];
  let radius = baseRadius * (1 + baseBatterFrac);
  let y = 0;

  for (let index = 0; index < tierHeights.length; index++) {
    const height = tierHeights[index]!;
    if (index > 0) {
      radius *= 1 - insetPerTierFrac;
    }
    tiers.push({
      radius,
      height,
      y,
      faces: octagonFaces(radius),
    });
    y += height;
  }

  return tiers;
}
