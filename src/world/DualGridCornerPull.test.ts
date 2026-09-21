import { describe, it, expect } from 'vitest';
import { CORNER_DIRS, binaryCornerPullDirection, cornerPull } from './DualGridCornerPull';

describe('binaryCornerPullDirection', () => {
  it('returns null for empty (all zeros)', () => {
    expect(binaryCornerPullDirection([0, 0, 0, 0])).toBeNull();
  });
  it('returns null for full (all ones)', () => {
    expect(binaryCornerPullDirection([1, 1, 1, 1])).toBeNull();
  });
  it('returns null for edge (2 adjacent)', () => {
    expect(binaryCornerPullDirection([1, 1, 0, 0])).toBeNull();
  });
  it('returns null for diagonal (2 opposite)', () => {
    expect(binaryCornerPullDirection([1, 0, 1, 0])).toBeNull();
  });
  it('returns the lone "1" index for outer_corner (one 1, three 0s)', () => {
    expect(binaryCornerPullDirection([0, 1, 0, 0])).toBe(1);
  });
  it('returns the lone "0" index for inner_corner (one 0, three 1s)', () => {
    expect(binaryCornerPullDirection([1, 1, 0, 1])).toBe(2);
  });
});

describe('cornerPull', () => {
  it('is [0, 0] for a non-pulling config', () => {
    expect(cornerPull([0, 0, 0, 0], 0.5)).toEqual([0, 0]);
  });
  it('scales by amplitude in the direction of the lone corner', () => {
    // Lone "1" at index 1 (NE) -> CORNER_DIRS[1] = [1, -1].
    expect(cornerPull([0, 1, 0, 0], 0.5)).toEqual([0.5, -0.5]);
  });
  it('CORNER_DIRS has exactly 4 unit-length [NW,NE,SE,SW] directions', () => {
    expect(CORNER_DIRS).toEqual([[-1, -1], [1, -1], [1, 1], [-1, 1]]);
  });
});
