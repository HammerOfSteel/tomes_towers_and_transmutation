// tests/world/DualGridCaseTable.test.ts
//
//  Unit tests for buildDualGridCaseTable() — Phase 0 of the "organic world
//  tiles" roadmap (TODO/organic_world_tiles_todo.md). Verifies the
//  rotation-canonical dual-grid case table this whole initiative rests on:
//  for `states` values per corner over 4 corners, group all raw configs by
//  their lexicographically-smallest rotation, yielding a small set of
//  canonical tiles + a {rawConfig -> {tile, steps}} lookup.

import { describe, it, expect } from 'vitest';
import { buildDualGridCaseTable, rotateMask } from '@/world/DualGridCaseTable';

describe('buildDualGridCaseTable', () => {
  it('produces exactly 6 canonical tiles for 2 states (the well-known dual-grid result)', () => {
    const table = buildDualGridCaseTable(2);
    expect(table.tiles).toHaveLength(6);
  });

  it('every one of the 16 raw 2-state configs is present in the mapping', () => {
    const table = buildDualGridCaseTable(2);
    expect(Object.keys(table.mapping)).toHaveLength(16);
  });

  it('every mapping entry references a valid tile index and a rotation step in [0,3]', () => {
    const table = buildDualGridCaseTable(2);
    for (const { tile, steps } of Object.values(table.mapping)) {
      expect(tile).toBeGreaterThanOrEqual(0);
      expect(tile).toBeLessThan(table.tiles.length);
      expect(steps).toBeGreaterThanOrEqual(0);
      expect(steps).toBeLessThanOrEqual(3);
    }
  });

  it('rotating a canonical tile mask by its recorded steps reproduces the exact raw config (round-trip)', () => {
    const table = buildDualGridCaseTable(2);
    for (const [key, { tile, steps }] of Object.entries(table.mapping)) {
      const rawConfig = key.split(',').map(Number);
      let mask = table.tiles[tile]!.mask;
      for (let i = 0; i < steps; i++) mask = rotateMask(mask);
      expect(mask).toEqual(rawConfig);
    }
  });

  it('every canonical tile\'s configCount sums to exactly 16 (accounting invariant)', () => {
    const table = buildDualGridCaseTable(2);
    const total = table.tiles.reduce((sum, t) => sum + t.configCount, 0);
    expect(total).toBe(16);
  });

  it('includes exactly one all-empty (0,0,0,0) and one all-full (1,1,1,1) canonical tile', () => {
    const table = buildDualGridCaseTable(2);
    const empty = table.tiles.filter(t => t.mask.every(v => v === 0));
    const full = table.tiles.filter(t => t.mask.every(v => v === 1));
    expect(empty).toHaveLength(1);
    expect(full).toHaveLength(1);
    // The all-empty and all-full configs are rotation-invariant, so exactly
    // 1 of the 16 raw configs maps to each.
    expect(empty[0]!.configCount).toBe(1);
    expect(full[0]!.configCount).toBe(1);
  });

  it('labels every binary-case tile with one of the 6 expected topological names', () => {
    const table = buildDualGridCaseTable(2);
    const labels = table.tiles.map(t => t.label).sort();
    expect(labels).toEqual(['diagonal', 'edge', 'empty', 'full', 'inner_corner', 'outer_corner']);
  });

  it('is deterministic — building the table twice yields identical results', () => {
    const a = buildDualGridCaseTable(2);
    const b = buildDualGridCaseTable(2);
    expect(a).toEqual(b);
  });

  it('supports 3 states (e.g. water/beach/land corner typing) without throwing, yielding 3^4=81 configs', () => {
    const table = buildDualGridCaseTable(3);
    expect(Object.keys(table.mapping)).toHaveLength(81);
    const total = table.tiles.reduce((sum, t) => sum + t.configCount, 0);
    expect(total).toBe(81);
    // 3-state tiles aren't given topology-name labels (only the binary case is).
    for (const t of table.tiles) expect(t.label).toBe('');
  });
});

describe('rotateMask', () => {
  it('cyclically shifts a 4-corner mask by one position', () => {
    expect(rotateMask([1, 0, 0, 0])).toEqual([0, 1, 0, 0]);
    expect(rotateMask([0, 1, 0, 0])).toEqual([0, 0, 1, 0]);
  });

  it('4 rotations return to the original mask', () => {
    const original = [1, 0, 1, 0];
    let mask = original;
    for (let i = 0; i < 4; i++) mask = rotateMask(mask);
    expect(mask).toEqual(original);
  });
});
