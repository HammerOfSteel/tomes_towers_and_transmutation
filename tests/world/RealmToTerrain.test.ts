/**
 * RealmToTerrain.test.ts — 02-game-world-integration (RI-1, RI-2)
 */

import { describe, it, expect } from 'vitest';
import {
  BIOME_TILE_MAP, realmCellToTileDNA, realmToTerrain, realmDataToTerrain,
  TERRAIN_TILE_SIZE, TERRAIN_HEIGHT_SCALE,
  type RealmTerrainCell, type RealmTerrainInput,
} from '@/world/RealmToTerrain';
import type { RealmBiome } from '@/overworld-studio';
import { validateTileDNA } from '@/procedural/TileDNA';

const ALL_REALM_BIOMES: RealmBiome[] = [
  'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
  'grassland', 'forest', 'taiga', 'tundra', 'snow',
];

describe('BIOME_TILE_MAP', () => {
  it('covers every RealmBiome with a valid tile biome/variant', () => {
    for (const biome of ALL_REALM_BIOMES) {
      const mapping = BIOME_TILE_MAP[biome];
      expect(mapping).toBeDefined();
      expect(typeof mapping.biome).toBe('string');
      expect(typeof mapping.variant).toBe('string');
    }
  });

  it('every mapping produces a valid TileDNA', () => {
    for (const biome of ALL_REALM_BIOMES) {
      const dna = realmCellToTileDNA(biome, 42);
      expect(() => validateTileDNA(dna)).not.toThrow();
    }
  });
});

describe('realmCellToTileDNA', () => {
  it('is deterministic for the same biome + seed', () => {
    const a = realmCellToTileDNA('grassland', 7);
    const b = realmCellToTileDNA('grassland', 7);
    expect(a).toEqual(b);
  });

  it('uses TERRAIN_TILE_SIZE for dna.size', () => {
    const dna = realmCellToTileDNA('forest', 1);
    expect(dna.size).toBe(TERRAIN_TILE_SIZE);
  });

  it('defaults category to ground, honours override to transition', () => {
    expect(realmCellToTileDNA('grassland', 1).category).toBe('ground');
    expect(realmCellToTileDNA('grassland', 1, 'transition').category).toBe('transition');
  });
});

// ── Helpers to build a small synthetic realm grid ────────────────────────────

function makeGrid(biomeGrid: RealmBiome[][], elevationGrid?: number[][]): RealmTerrainCell[][] {
  return biomeGrid.map((row, y) =>
    row.map((biome, x) => ({ biome, elevation: elevationGrid?.[y]?.[x] ?? 0.5 })),
  );
}

describe('realmToTerrain', () => {
  it('produces one placement per cell with correct world position', () => {
    const cells = makeGrid([
      ['grassland', 'grassland'],
      ['grassland', 'grassland'],
    ]);
    const input: RealmTerrainInput = { cells, W: 2, H: 2, seed: 1 };
    const placements = realmToTerrain(input);

    expect(placements).toHaveLength(4);
    const p = placements.find(p => p.gridX === 1 && p.gridZ === 1)!;
    expect(p.worldX).toBe(1 * TERRAIN_TILE_SIZE);
    expect(p.worldZ).toBe(1 * TERRAIN_TILE_SIZE);
  });

  it('is fully deterministic for the same input', () => {
    const cells = makeGrid([
      ['grassland', 'desert', 'forest'],
      ['tundra', 'snow', 'ocean'],
    ]);
    const input: RealmTerrainInput = { cells, W: 3, H: 2, seed: 99 };
    expect(realmToTerrain(input)).toEqual(realmToTerrain(input));
  });

  it('smooths height by averaging with up to 8 neighbours', () => {
    // Center cell elevation 1.0, all 8 neighbours 0.0 → average should be 1/9.
    const elevationGrid = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const biomeGrid: RealmBiome[][] = [
      ['grassland', 'grassland', 'grassland'],
      ['grassland', 'grassland', 'grassland'],
      ['grassland', 'grassland', 'grassland'],
    ];
    const cells = makeGrid(biomeGrid, elevationGrid);
    const input: RealmTerrainInput = { cells, W: 3, H: 3, seed: 1 };
    const placements = realmToTerrain(input);
    const center = placements.find(p => p.gridX === 1 && p.gridZ === 1)!;
    expect(center.height).toBeCloseTo((1 / 9) * TERRAIN_HEIGHT_SCALE, 6);
  });

  it('flags isBiomeTransition true at a biome border, false inside a uniform region', () => {
    const cells = makeGrid([
      ['grassland', 'grassland', 'desert'],
      ['grassland', 'grassland', 'desert'],
      ['grassland', 'grassland', 'desert'],
    ]);
    const input: RealmTerrainInput = { cells, W: 3, H: 3, seed: 1 };
    const placements = realmToTerrain(input);

    const interior = placements.find(p => p.gridX === 0 && p.gridZ === 1)!;
    expect(interior.isBiomeTransition).toBe(false);

    const border = placements.find(p => p.gridX === 1 && p.gridZ === 1)!;
    expect(border.isBiomeTransition).toBe(true);
  });

  it('does not flag a transition between two realm biomes sharing the same tile biome', () => {
    // forest -> forest_floor/leaf_litter, taiga -> forest_floor/moss: same tile biome, different variant.
    const cells = makeGrid([
      ['forest', 'taiga'],
    ]);
    const input: RealmTerrainInput = { cells, W: 2, H: 1, seed: 1 };
    const placements = realmToTerrain(input);
    expect(placements.every(p => !p.isBiomeTransition)).toBe(true);
  });

  it('every placement carries a validly-shaped TileDNA', () => {
    const cells = makeGrid([['ocean', 'beach', 'grassland', 'snow']]);
    const input: RealmTerrainInput = { cells, W: 4, H: 1, seed: 5 };
    for (const p of realmToTerrain(input)) {
      expect(() => validateTileDNA(p.dna)).not.toThrow();
    }
  });
});

describe('realmDataToTerrain', () => {
  it('adapts a full RealmData shape (extra fields ignored)', () => {
    const cells = makeGrid([['grassland', 'grassland']]);
    const fakeRealmData = {
      cells, W: 2, H: 1, seed: 3,
      rivers: [], settlements: [], dungeons: [], towerX: 0, towerY: 0,
    } as unknown as import('@/overworld-studio').RealmData;

    const placements = realmDataToTerrain(fakeRealmData);
    expect(placements).toHaveLength(2);
  });
});
