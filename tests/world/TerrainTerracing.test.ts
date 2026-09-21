import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { terraceElevation } from '@/world/TerrainTerracing';

describe('terraceElevation', () => {
  it('terraces a 3-tile chain to at most 1-level steps between adjacent tiles', () => {
    const wg = new WorldGrid(3, 1);
    wg.set(0, 0, { elevation: 0 });
    wg.set(1, 0, { elevation: 0 });
    wg.set(2, 0, { elevation: 5 });

    terraceElevation(wg);

    expect(wg.get(2, 0).elevation).toBe(5); // the high tile is never lowered
    expect(wg.get(1, 0).elevation).toBe(4); // raised to within 1 of its high neighbor
    expect(wg.get(0, 0).elevation).toBe(3); // raised to within 1 of its (now-4) neighbor
  });

  it('terraces a diagonal 2-level jump, not just orthogonal ones', () => {
    // A 2x2 block where every orthogonal pair already differs by at most
    // 1 level (satisfies the pre-existing 4-neighbor invariant), but the
    // diagonal pair (0,0)/(1,1) differs by 2 — the exact scenario that
    // produces a black-crack hole at their shared corner in
    // TerrainGeometryBuilder.ts, since that corner is shared by all 4 of
    // these tiles. See docs/superpowers/specs/2026-09-23-terrain-seam-and-organic-polish-research.md §1.2.
    const wg = new WorldGrid(2, 2);
    wg.set(0, 0, { elevation: 2 }); // A
    wg.set(1, 0, { elevation: 1 }); // B
    wg.set(0, 1, { elevation: 1 }); // C
    wg.set(1, 1, { elevation: 0 }); // D

    terraceElevation(wg);

    // Orthogonal pairs were already fine and stay put.
    expect(wg.get(0, 0).elevation).toBe(2); // A never lowered
    expect(wg.get(1, 0).elevation).toBe(1); // B unchanged (within 1 of A and D)
    expect(wg.get(0, 1).elevation).toBe(1); // C unchanged (within 1 of A and D)
    // D must be raised so the A/D diagonal pair is within 1 level too.
    expect(wg.get(1, 1).elevation).toBe(1);
  });

  it('never lowers a tile, only raises its lower neighbor toward it', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 5 });
    wg.set(1, 0, { elevation: 0 });

    terraceElevation(wg);

    expect(wg.get(0, 0).elevation).toBe(5); // unchanged
    expect(wg.get(1, 0).elevation).toBe(4); // raised to within 1 level
  });

  it('does not raise or pull elevation across a water tile', () => {
    const wg = new WorldGrid(2, 1);
    wg.set(0, 0, { elevation: 0, biome: 'ocean', waterDepth: 1 });
    wg.set(1, 0, { elevation: 5 });

    terraceElevation(wg);

    expect(wg.get(0, 0).elevation).toBe(0); // ocean tile untouched
    expect(wg.get(1, 0).elevation).toBe(5); // land tile's only neighbor is water (excluded), so also untouched
  });

  it('converges to the same result regardless of a 2D grid with multiple peaks', () => {
    const wg = new WorldGrid(5, 1);
    wg.set(0, 0, { elevation: 0 });
    wg.set(1, 0, { elevation: 0 });
    wg.set(2, 0, { elevation: 7 });
    wg.set(3, 0, { elevation: 0 });
    wg.set(4, 0, { elevation: 0 });

    terraceElevation(wg);

    // The peak stays put; both sides step down by exactly 1 per tile
    // until they can't go any lower without violating the original value.
    expect(wg.get(2, 0).elevation).toBe(7);
    expect(wg.get(1, 0).elevation).toBe(6);
    expect(wg.get(3, 0).elevation).toBe(6);
    expect(wg.get(0, 0).elevation).toBe(5);
    expect(wg.get(4, 0).elevation).toBe(5);
  });
});
