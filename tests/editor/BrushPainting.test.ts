import { describe, it, expect } from 'vitest';
import { shouldPlaceBrushPoint } from '@/editor/BrushPainting';

describe('shouldPlaceBrushPoint', () => {
  it('always places the first point of a stroke (lastPlaced is null)', () => {
    expect(shouldPlaceBrushPoint(null, { x: 5, z: 5 }, 3)).toBe(true);
  });

  it('does not place a second point at the exact same spot (zero-distance repeat)', () => {
    const p = { x: 10, z: 10 };
    expect(shouldPlaceBrushPoint(p, { x: 10, z: 10 }, 3)).toBe(false);
  });

  it('does not place a point just under the minimum spacing', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 2.9, z: 0 }; // distance 2.9 < minSpacing 3
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(false);
  });

  it('places a point exactly at the minimum spacing (boundary is inclusive)', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 3, z: 0 }; // distance exactly 3
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(true);
  });

  it('places a point well past the minimum spacing', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 100, z: 100 };
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(true);
  });

  it('measures distance diagonally (x and z both contribute), not axis-aligned only', () => {
    const lastPlaced = { x: 0, z: 0 };
    // distance = sqrt(2*2 + 2*2) = sqrt(8) ≈ 2.83 < 3 — must be false even
    // though each individual axis delta (2) is less than minSpacing (3).
    const candidate = { x: 2, z: 2 };
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(false);
  });
});
