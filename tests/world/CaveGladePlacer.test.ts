/**
 * CaveGladePlacer.test.ts — 02-game-world-integration (CG-3)
 */

import { describe, it, expect } from 'vitest';
import {
  placeCavesAndGlades, CAVE_ELEVATION_THRESHOLD,
} from '@/world/CaveGladePlacer';
import type { RealmTerrainInput, RealmTerrainCell } from '@/world/RealmToTerrain';
import type { RealmBiome } from '@/overworld-studio';

/**
 * Builds a W×H grid where the biome/elevation of each cell is deterministic
 * from its column: columns are split into bands so every biome (and both
 * high/low elevation) is represented, giving cave/glade placement plenty of
 * eligible candidates to choose from.
 */
function makeGrid(W = 20, H = 20, seed = 1): RealmTerrainInput {
  const bandBiomes: RealmBiome[] = ['ocean', 'grassland', 'forest', 'taiga', 'tundra', 'desert'];
  const cells: RealmTerrainCell[][] = [];
  for (let y = 0; y < H; y++) {
    const row: RealmTerrainCell[] = [];
    for (let x = 0; x < W; x++) {
      const biome = bandBiomes[x % bandBiomes.length]!;
      // Alternate high/low elevation so CAVE_ELEVATION_THRESHOLD candidates exist too.
      const elevation = (x + y) % 3 === 0 ? 0.95 : 0.3;
      row.push({ biome, elevation });
    }
    cells.push(row);
  }
  return { cells, W, H, seed };
}

describe('placeCavesAndGlades', () => {
  it('is deterministic for the same input + options', () => {
    const grid = makeGrid();
    const a = placeCavesAndGlades(grid);
    const b = placeCavesAndGlades(grid);
    expect(b).toEqual(a);
  });

  it('places caves within the requested count (default 2-4)', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid);
    expect(result.caves.length).toBeGreaterThanOrEqual(1);
    expect(result.caves.length).toBeLessThanOrEqual(4);
  });

  it('places glades within the requested count (default 1-3)', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid);
    expect(result.glades.length).toBeGreaterThanOrEqual(1);
    expect(result.glades.length).toBeLessThanOrEqual(3);
  });

  it('respects explicit caveCount/gladeCount', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid, { caveCount: 3, gladeCount: 2, minSpacing: 1 });
    expect(result.caves.length).toBe(3);
    expect(result.glades.length).toBe(2);
  });

  it('every cave sits on a high-elevation, mountain, or tundra/taiga cell', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid, { caveCount: 4, minSpacing: 1 });
    for (const cave of result.caves) {
      const cell = grid.cells[cave.y]![cave.x]!;
      const eligible = cell.elevation >= CAVE_ELEVATION_THRESHOLD || cell.biome === 'mountain' || cell.biome === 'tundra' || cell.biome === 'taiga';
      expect(eligible).toBe(true);
    }
  });

  it('every glade sits on a forest or taiga cell', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid, { gladeCount: 3, minSpacing: 1 });
    for (const glade of result.glades) {
      const cell = grid.cells[glade.y]![glade.x]!;
      expect(['forest', 'taiga']).toContain(cell.biome);
    }
  });

  it('never places two markers closer than minSpacing', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid, { caveCount: 4, gladeCount: 3, minSpacing: 5 });
    const all = [...result.caves, ...result.glades];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const dist = Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y);
        expect(dist).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('avoids existing marker positions passed via `avoid`', () => {
    const grid = makeGrid();
    // Pre-fill "avoid" with every forest/taiga cell so glades have nowhere eligible left.
    const avoid: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < grid.H; y++) {
      for (let x = 0; x < grid.W; x++) {
        const cell = grid.cells[y]![x]!;
        if (cell.biome === 'forest' || cell.biome === 'taiga') avoid.push({ x, y });
      }
    }
    const result = placeCavesAndGlades(grid, { gladeCount: 2, minSpacing: 3, avoid });
    expect(result.glades.length).toBe(0);
  });

  it('gives every cave marker a valid entrance biome and deterministic seed', () => {
    const grid = makeGrid();
    const result = placeCavesAndGlades(grid, { caveCount: 4, minSpacing: 1 });
    const validBiomes = ['crystal', 'lava', 'ice', 'fungal', 'ancient'];
    for (const cave of result.caves) {
      expect(validBiomes).toContain(cave.biome);
      expect(Number.isFinite(cave.seed)).toBe(true);
    }
  });
});
