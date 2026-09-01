import { describe, it, expect } from 'vitest';
import {
  decayFactor, worldToTrampleCell, stampInto, shouldRecenter, shiftGrid,
} from '@/world/GrassTrample';

describe('decayFactor', () => {
  it('returns exactly 0.5 when dt equals the half-life', () => {
    expect(decayFactor(2.0, 2.0)).toBeCloseTo(0.5, 10);
  });

  it('returns 1 when dt is 0 (no decay yet)', () => {
    expect(decayFactor(0, 2.0)).toBe(1);
  });

  it('returns 0.125 after 3 half-lives', () => {
    expect(decayFactor(6.0, 2.0)).toBeCloseTo(0.125, 10);
  });
});

describe('worldToTrampleCell', () => {
  const worldSize = 48;
  const resolution = 64; // cellSize = 0.75

  it('maps the exact center of the window to the middle cell', () => {
    const cell = worldToTrampleCell(0, 0, 0, 0, worldSize, resolution);
    expect(cell).toEqual({ col: 32, row: 32 });
  });

  it('maps the left/top edge of the window to cell 0', () => {
    const cell = worldToTrampleCell(-24, -24, 0, 0, worldSize, resolution);
    expect(cell).toEqual({ col: 0, row: 0 });
  });

  it('returns null exactly at the right/bottom edge (half-open window)', () => {
    const cell = worldToTrampleCell(24, 24, 0, 0, worldSize, resolution);
    expect(cell).toBeNull();
  });

  it('returns null for a position far outside the window', () => {
    const cell = worldToTrampleCell(1000, 1000, 0, 0, worldSize, resolution);
    expect(cell).toBeNull();
  });

  it('maps relative to a non-zero center', () => {
    const cell = worldToTrampleCell(100, 100, 100, 100, worldSize, resolution);
    expect(cell).toEqual({ col: 32, row: 32 });
  });
});

describe('stampInto', () => {
  it('sets the center cell to full intensity (~1)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    expect(grid[2 * resolution + 2]).toBeCloseTo(1, 5);
  });

  it('falls off linearly with distance from the stamp center', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    // One cell to the right: distance 1, intensity = 1 - 1/1.5 = 0.3333...
    expect(grid[2 * resolution + 3]).toBeCloseTo(1 / 3, 5);
  });

  it('leaves cells beyond the stamp radius untouched (exactly 0)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    // Two cells straight down: distance 2 > radius 1.5 — must stay untouched.
    expect(grid[4 * resolution + 2]).toBe(0);
  });

  it('never reduces an existing higher value (uses max, not overwrite/add)', () => {
    const resolution = 5;
    const grid = new Float32Array(resolution * resolution);
    grid[2 * resolution + 2] = 1;
    stampInto(grid, resolution, 1, 2, 2, 1.5);
    expect(grid[2 * resolution + 2]).toBe(1); // not doubled, not reduced
  });
});

describe('shouldRecenter', () => {
  it('is false when exactly at the threshold (strictly-greater boundary)', () => {
    expect(shouldRecenter(12, 0, 12)).toBe(false);
  });

  it('is true just past the threshold', () => {
    expect(shouldRecenter(12.001, 0, 12)).toBe(true);
  });

  it('is false when well within the threshold', () => {
    expect(shouldRecenter(0, 0, 12)).toBe(false);
  });

  it('measures distance diagonally (dx and dz both contribute)', () => {
    // sqrt(9^2 + 9^2) = 12.73 > 12
    expect(shouldRecenter(9, 9, 12)).toBe(true);
  });
});

describe('shiftGrid', () => {
  // 3x3 grid: row0=[1,2,3], row1=[4,5,6], row2=[7,8,9]
  const makeGrid = () => new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it('shifts columns: result[row][col] = old[row][col + shiftCols], revealed edge is 0', () => {
    const result = shiftGrid(makeGrid(), 3, 1, 0);
    expect(Array.from(result)).toEqual([2, 3, 0, 5, 6, 0, 8, 9, 0]);
  });

  it('shifts rows: result[row][col] = old[row + shiftRows][col], revealed edge is 0', () => {
    const result = shiftGrid(makeGrid(), 3, 0, 1);
    expect(Array.from(result)).toEqual([4, 5, 6, 7, 8, 9, 0, 0, 0]);
  });

  it('a shift larger than the grid zeroes everything out', () => {
    const result = shiftGrid(makeGrid(), 3, 10, 10);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('a zero shift returns the grid unchanged', () => {
    const result = shiftGrid(makeGrid(), 3, 0, 0);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
