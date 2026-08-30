import { describe, it, expect } from 'vitest';
import { classifyTileShape, type RampShape, type Diagonal } from '@/world/TerrainKit';

// All 16 combinations of [sw, nw, ne, se], with the shape+diagonal every
// combination must classify to. Order: sw, nw, ne, se.
const CASES: Array<{ corners: [boolean, boolean, boolean, boolean]; shape: RampShape; diagonal: Diagonal }> = [
  { corners: [false, false, false, false], shape: 'flat',         diagonal: 'sw-ne' },
  { corners: [true,  false, false, false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, true,  false, false], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [false, false, true,  false], shape: 'single-corner', diagonal: 'sw-ne' },
  { corners: [false, false, false, true ], shape: 'single-corner', diagonal: 'nw-se' },
  { corners: [true,  true,  false, false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  false, true,  false], shape: 'saddle',        diagonal: 'sw-ne' },
  { corners: [true,  false, false, true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  true,  false], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [false, true,  false, true ], shape: 'saddle',        diagonal: 'nw-se' },
  { corners: [false, false, true,  true ], shape: 'edge',          diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  false], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [true,  true,  false, true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  false, true,  true ], shape: 'outer-corner',  diagonal: 'nw-se' },
  { corners: [false, true,  true,  true ], shape: 'outer-corner',  diagonal: 'sw-ne' },
  { corners: [true,  true,  true,  true ], shape: 'all-four-down', diagonal: 'sw-ne' },
];

describe('classifyTileShape', () => {
  it('classifies all 16 corner-low combinations to the correct shape and diagonal', () => {
    for (const { corners, shape, diagonal } of CASES) {
      const result = classifyTileShape(corners);
      expect(result.shape, `corners=${JSON.stringify(corners)}`).toBe(shape);
      expect(result.diagonal, `corners=${JSON.stringify(corners)}`).toBe(diagonal);
    }
  });

  it('is a pure function (same input always produces the same output)', () => {
    const a = classifyTileShape([true, false, true, false]);
    const b = classifyTileShape([true, false, true, false]);
    expect(a).toEqual(b);
  });
});
