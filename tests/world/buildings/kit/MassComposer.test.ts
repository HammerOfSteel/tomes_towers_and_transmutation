import { describe, expect, it } from 'vitest';
import { composeMainAndWing } from '@/world/buildings/kit/MassComposer';

describe('MassComposer', () => {
  it('keeps the main mass footprint centered on the origin, matching a plain rectangle', () => {
    const { main } = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 3, depth: 2.5, height: 2.8, side: 'right' },
    });

    expect(main.height).toBe(4);
    expect(main.points).toHaveLength(4);
    const xs = main.points.map(p => p[0]);
    const zs = main.points.map(p => p[1]);
    expect(Math.max(...xs)).toBeCloseTo(3, 5);
    expect(Math.min(...xs)).toBeCloseTo(-3, 5);
    expect(Math.max(...zs)).toBeCloseTo(2.5, 5);
    expect(Math.min(...zs)).toBeCloseTo(-2.5, 5);
    expect(main.center).toEqual([0, 0]);
    expect(main.faces).toHaveLength(4);
  });

  it('attaches a right-side wing flush against the main mass, projecting outward with no overlap', () => {
    const { main, wing } = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 3, depth: 2.5, height: 2.8, side: 'right' },
    });

    const mainMaxX = Math.max(...main.points.map(p => p[0]));
    const wingMinX = Math.min(...wing.points.map(p => p[0]));
    expect(wingMinX).toBeCloseTo(mainMaxX, 5);
    expect(wing.height).toBe(2.8);
    expect(wing.center[0]).toBeGreaterThan(mainMaxX);
  });

  it('attaches a left-side wing flush against the main mass on the opposite side', () => {
    const { main, wing } = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 3, depth: 2.5, height: 2.8, side: 'left' },
    });

    const mainMinX = Math.min(...main.points.map(p => p[0]));
    const wingMaxX = Math.max(...wing.points.map(p => p[0]));
    expect(wingMaxX).toBeCloseTo(mainMinX, 5);
    expect(wing.center[0]).toBeLessThan(mainMinX);
  });

  it('attaches a front/back wing flush against the main mass along the depth axis (T-plan)', () => {
    const { main, wing } = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 2.4, depth: 2, height: 2.8, side: 'front' },
    });

    const mainMaxZ = Math.max(...main.points.map(p => p[1]));
    const wingMinZ = Math.min(...wing.points.map(p => p[1]));
    expect(wingMinZ).toBeCloseTo(mainMaxZ, 5);
  });

  it('defaults alongFraction to 0.5 (T-plan centered), and honours an explicit L-plan offset toward one corner', () => {
    const centered = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 3, depth: 2, height: 2.8, side: 'front' },
    });
    expect(centered.wing.center[0]).toBeCloseTo(0, 5);

    const offset = composeMainAndWing({
      mainWidth: 6,
      mainDepth: 5,
      mainHeight: 4,
      wing: { width: 3, depth: 2, height: 2.8, side: 'front', alongFraction: 0.15 },
    });
    expect(offset.wing.center[0]).toBeLessThan(0);
    const mainHalfW = 3;
    const wingHalfW = 1.5;
    expect(offset.wing.center[0]).toBeGreaterThanOrEqual(-(mainHalfW - wingHalfW) - 1e-6);
  });

  it('keeps every mass footprint finite and produces faces usable by buildWallSurfaceBlocks-style facesOverride', () => {
    const { main, wing } = composeMainAndWing({
      mainWidth: 7,
      mainDepth: 5,
      mainHeight: 5.8,
      wing: { width: 3.2, depth: 2.6, height: 3.0, side: 'back', alongFraction: 0.8 },
    });
    for (const mass of [main, wing]) {
      expect(mass.points.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))).toBe(true);
      for (const face of mass.faces) {
        expect(Number.isFinite(face.normalAngle)).toBe(true);
      }
    }
  });
});
