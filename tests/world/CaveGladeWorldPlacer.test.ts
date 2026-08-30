/**
 * CaveGladeWorldPlacer.test.ts — 02-game-world-integration (CG-3 renderer wiring)
 */

import { describe, it, expect } from 'vitest';
import { buildWorldGrid } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { placeCavesAndGlades } from '@/world/CaveGladeWorldPlacer';

const SEED = 0xC0FF_EE01;

function freshGrid() {
  return buildWorldGrid(SEED, { ...DEFAULT_WORLD_GEN_CONFIG, seed: SEED });
}

describe('placeCavesAndGlades (live WorldGrid)', () => {
  it('is deterministic for the same grid/config/seed', () => {
    const gridA = freshGrid();
    const gridB = freshGrid();
    const a = placeCavesAndGlades(gridA, DEFAULT_WORLD_GEN_CONFIG, SEED);
    const b = placeCavesAndGlades(gridB, DEFAULT_WORLD_GEN_CONFIG, SEED);
    expect(a).toEqual(b);
  });

  it('places at most config.caveCount caves and config.gladeCount glades', () => {
    const grid = freshGrid();
    const { caves, glades } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    expect(caves.length).toBeLessThanOrEqual(DEFAULT_WORLD_GEN_CONFIG.caveCount);
    expect(glades.length).toBeLessThanOrEqual(DEFAULT_WORLD_GEN_CONFIG.gladeCount);
  });

  it('every cave sits on a low (0) elevation tile or a mountain-biome tile', () => {
    const grid = freshGrid();
    const { caves } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    for (const cave of caves) {
      const cell = grid.get(cave.col, cave.row);
      expect(cell.elevation === 0 || cell.biome === 'mountain').toBe(true);
    }
  });

  it('every glade sits on a forest tile', () => {
    const grid = freshGrid();
    const { glades } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    for (const glade of glades) {
      const cell = grid.get(glade.col, glade.row);
      expect(cell.biome).toBe('forest');
    }
  });

  it('marks placed tiles with cave_entrance / glade_entrance content', () => {
    const grid = freshGrid();
    const { caves, glades } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    for (const cave of caves)  expect(grid.get(cave.col, cave.row).content).toBe('cave_entrance');
    for (const glade of glades) expect(grid.get(glade.col, glade.row).content).toBe('glade_entrance');
  });

  it('never places a cave/glade on the same tile twice', () => {
    const grid = freshGrid();
    const { caves, glades } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    const keys = [...caves, ...glades].map(e => `${e.col}:${e.row}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('assigns every cave entry a valid CaveEntranceBiome and starts undiscovered', () => {
    const grid = freshGrid();
    const { caves, glades } = placeCavesAndGlades(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    const validBiomes = ['crystal', 'lava', 'ice', 'fungal', 'ancient'];
    for (const cave of caves) {
      expect(validBiomes).toContain(cave.biome);
      expect(cave.discovered).toBe(false);
      expect(Number.isFinite(cave.seed)).toBe(true);
    }
    for (const glade of glades) {
      expect(glade.discovered).toBe(false);
      expect(Number.isFinite(glade.seed)).toBe(true);
    }
  });

  it('respects a caveCount/gladeCount of 0', () => {
    const grid = freshGrid();
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, caveCount: 0, gladeCount: 0 };
    const { caves, glades } = placeCavesAndGlades(grid, cfg, SEED);
    expect(caves).toHaveLength(0);
    expect(glades).toHaveLength(0);
  });
});
