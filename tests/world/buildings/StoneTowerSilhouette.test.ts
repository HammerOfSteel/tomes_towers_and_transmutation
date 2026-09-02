/**
 * StoneTowerSilhouette.test.ts — per-floor jitter/relax/drift math and
 * seed-selected sub-archetype silhouette profiles for the elven
 * stone-tower kit. See docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-variety-design.md.
 */

import { describe, it, expect } from 'vitest';
import {
  OCTAGON_JITTER_MAX,
  buildFloorVertexScales,
  _buildRawFloorVertexScales,
  pickSilhouetteProfile,
  buildFloorTransforms,
  type SilhouetteProfile,
} from '@/world/buildings/StoneTowerSilhouette';

describe('buildFloorVertexScales', () => {
  it('every value is within 1 +/- OCTAGON_JITTER_MAX', () => {
    const scales = buildFloorVertexScales(12345, 5);
    for (const floor of scales) {
      expect(floor).toHaveLength(8);
      for (const v of floor) {
        expect(v).toBeGreaterThanOrEqual(1 - OCTAGON_JITTER_MAX);
        expect(v).toBeLessThanOrEqual(1 + OCTAGON_JITTER_MAX);
      }
    }
  });

  it('returns exactly floorCount arrays', () => {
    expect(buildFloorVertexScales(1, 4)).toHaveLength(4);
    expect(buildFloorVertexScales(1, 6)).toHaveLength(6);
  });

  it('is deterministic for the same seed and floorCount', () => {
    expect(buildFloorVertexScales(777, 5)).toEqual(buildFloorVertexScales(777, 5));
  });

  it('different seeds produce different values', () => {
    const a = buildFloorVertexScales(1, 5);
    const b = buildFloorVertexScales(2, 5);
    expect(a).not.toEqual(b);
  });

  it('relaxation reduces floor-to-floor variance per corner column vs. the raw (unrelaxed) jitter', () => {
    const seed = 424242;
    const floorCount = 6;
    const raw = _buildRawFloorVertexScales(seed, floorCount);
    const relaxed = buildFloorVertexScales(seed, floorCount);

    function varianceOfColumn(data: number[][], corner: number): number {
      const values = data.map(floor => floor[corner]!);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    }

    // Compare the total variance summed across all 8 corner columns —
    // relaxation (averaging each floor with its floor-neighbors) should
    // reduce the overall spread, even if a couple of individual columns
    // don't strictly decrease.
    let rawTotal = 0, relaxedTotal = 0;
    for (let corner = 0; corner < 8; corner++) {
      rawTotal += varianceOfColumn(raw, corner);
      relaxedTotal += varianceOfColumn(relaxed, corner);
    }
    expect(relaxedTotal).toBeLessThan(rawTotal);
  });

  it('handles a single floor without throwing (no neighbors to relax against)', () => {
    expect(() => buildFloorVertexScales(1, 1)).not.toThrow();
    expect(buildFloorVertexScales(1, 1)).toHaveLength(1);
  });
});

describe('pickSilhouetteProfile', () => {
  const ALL_PROFILES: SilhouetteProfile[] = ['tapering', 'tiered', 'leaning', 'waisted'];

  it('always returns one of the 4 known profile names', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(ALL_PROFILES).toContain(pickSilhouetteProfile(seed));
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickSilhouetteProfile(999)).toBe(pickSilhouetteProfile(999));
  });

  it('produces all 4 profiles across many seeds, with no single profile dominating more than ~50%', () => {
    const counts: Record<string, number> = { tapering: 0, tiered: 0, leaning: 0, waisted: 0 };
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      counts[pickSilhouetteProfile(seed)]!++;
    }
    for (const name of ALL_PROFILES) {
      expect(counts[name]).toBeGreaterThan(0);
      expect(counts[name]! / N).toBeLessThan(0.5);
    }
  });
});

describe('buildFloorTransforms', () => {
  const FLOORS = 5;

  it('returns exactly floorCount transforms for every profile', () => {
    for (const profile of ['tapering', 'tiered', 'leaning', 'waisted'] as SilhouetteProfile[]) {
      expect(buildFloorTransforms(profile, 1, FLOORS)).toHaveLength(FLOORS);
    }
  });

  it('is deterministic for the same profile/seed/floorCount', () => {
    expect(buildFloorTransforms('tapering', 55, FLOORS)).toEqual(buildFloorTransforms('tapering', 55, FLOORS));
  });

  it("tapering's radiusScale strictly decreases floor-to-floor (smooth continuous taper, no flat runs)", () => {
    const transforms = buildFloorTransforms('tapering', 42, FLOORS);
    for (let i = 1; i < transforms.length; i++) {
      expect(transforms[i]!.radiusScale).toBeLessThan(transforms[i - 1]!.radiusScale);
    }
  });

  it("tiered's radiusScale has at least one flat run (adjacent floors sharing an identical value) -- distinguishing it from tapering's smooth per-floor curve", () => {
    const transforms = buildFloorTransforms('tiered', 42, FLOORS);
    let hasFlatRun = false;
    for (let i = 1; i < transforms.length; i++) {
      if (transforms[i]!.radiusScale === transforms[i - 1]!.radiusScale) hasFlatRun = true;
    }
    expect(hasFlatRun).toBe(true);
  });

  it("leaning's final-floor drift magnitude is clearly larger than tapering's for the same seed/floorCount", () => {
    const seed = 4242;
    const leaning = buildFloorTransforms('leaning', seed, FLOORS);
    const tapering = buildFloorTransforms('tapering', seed, FLOORS);
    const leaningMag = Math.hypot(leaning[leaning.length - 1]!.offsetX, leaning[leaning.length - 1]!.offsetZ);
    const taperingMag = Math.hypot(tapering[tapering.length - 1]!.offsetX, tapering[tapering.length - 1]!.offsetZ);
    expect(leaningMag).toBeGreaterThan(taperingMag * 1.5);
  });

  it("waisted's radiusScale has a local minimum strictly before the last floor (tapers in, then flares back out)", () => {
    const transforms = buildFloorTransforms('waisted', 42, FLOORS);
    const radii = transforms.map(t => t.radiusScale);
    let minIdx = 0;
    for (let i = 1; i < radii.length; i++) {
      if (radii[i]! < radii[minIdx]!) minIdx = i;
    }
    expect(minIdx).toBeGreaterThan(0);
    expect(minIdx).toBeLessThan(radii.length - 1);
    // Confirm it genuinely flares back out afterward (radius increases after the minimum).
    expect(radii[radii.length - 1]!).toBeGreaterThan(radii[minIdx]!);
  });

  it('every profile keeps radiusScale positive for realistic floor counts (3-6)', () => {
    for (const profile of ['tapering', 'tiered', 'leaning', 'waisted'] as SilhouetteProfile[]) {
      for (let floors = 3; floors <= 6; floors++) {
        const transforms = buildFloorTransforms(profile, 123, floors);
        for (const t of transforms) {
          expect(t.radiusScale).toBeGreaterThan(0);
        }
      }
    }
  });
});
