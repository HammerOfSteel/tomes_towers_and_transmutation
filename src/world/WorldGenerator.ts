/**
 * WorldGenerator — builds a WorldGrid from a seed + WorldGenConfig.
 *
 * Extracted from OverworldScene._buildGrid() so that the grid can be
 * constructed externally (e.g. for minimap preview in MainMenu) and passed
 * to OverworldScene rather than rebuilt inside it.
 *
 * Parameterisation relative to GHW so the same algorithm produces coherent
 * terrain for any worldSize (128, 256, …).
 */

import { WorldGrid }           from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import type { WorldData }      from './WorldData';
import { createNoise2D, fbm }  from '@/core/SimplexNoise';
import { generateHydrology }   from './HydrologyGenerator';
import { placeDungeons }       from './DungeonPlacer';
import { placeSettlements }    from './SettlementPlacer';
import { buildInterSettlementRoads } from './RoadGenerator';

const MLV = 4;

/**
 * Build a WorldGrid with elevation (0–4) and biome data from seeded simplex
 * noise.  The algorithm matches the original OverworldScene._buildGrid with
 * distances parameterised to the grid size:
 *   – Flat zone  ≈ 28 % of half-width  (FR = 7 at GW = 51)
 *   – Rim bias starts at 80 % of half-width and spans 36 %
 */
export function buildWorldGrid(seed: number, config: WorldGenConfig): WorldGrid {
  const GW  = config.worldSize;
  const GH  = config.worldSize;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);    // flat zone radius in tiles

  // Rim bias: terrain rises steeply near the world edge (bowl effect).
  const rimStart = GHW * 0.80;
  const rimRange = GHW * 0.36;

  const noise = createNoise2D(seed ^ 0x5E_A1_9D_7B);
  const grid  = new WorldGrid(GW, GH);

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const dc  = col - GHW;
      const dr  = row - GHH;
      const tR  = Math.sqrt(dc * dc + dr * dr);

      const nx  = dc / GW;
      const nz  = dr / GH;
      const raw = (fbm(noise, nx * 3.8, nz * 3.8, 4) + 1) * 0.5;
      let level = Math.min(MLV, Math.floor(raw * (MLV + 1)));

      // Smooth flatness gradient around the tower site
      const flatness = Math.max(0, 1 - tR / FR);
      level = Math.round(level * (1 - flatness));

      // Rim elevation bias (bowl walls)
      const rimBias = Math.max(0, (tR - rimStart) / rimRange);
      level = Math.min(MLV, Math.round(level + rimBias * 1.8));

      const biomes = ['bog', 'grass', 'forest', 'highland', 'rocky'] as const;
      grid.set(col, row, {
        elevation: level,
        biome:     biomes[level],
      });
    }
  }

  // OW-2: carve rivers into the grid
  generateHydrology(grid, config, seed);

  return grid;
}

/**
 * Build a complete WorldData (grid + all entity placements) from a seed and
 * config.  main.ts and tests should call this instead of buildWorldGrid.
 */
export function buildWorldData(seed: number, config: WorldGenConfig): WorldData {
  const cfg         = { ...config, seed };
  const grid        = buildWorldGrid(seed, cfg);
  const dungeons    = placeDungeons(grid, cfg, seed);
  // placeSettlements calls applySettlementToGrid internally, so by the time
  // we build inter-settlement roads the grid already has settlement road tiles
  // marked — A* will cheaply reuse them.
  const settlements = placeSettlements(grid, cfg, seed);

  // Build terrain-aware inter-settlement roads (MST + A*).
  const interRoads = buildInterSettlementRoads(settlements, grid);

  // Mark inter-settlement road tiles on the grid so the overworld mesh picks them up.
  for (const r of interRoads) {
    const cell = grid.get(r.col, r.row);
    if (cell.feature === 'none' || cell.feature === 'road_dirt') {
      grid.set(r.col, r.row, { feature: 'road' });
    }
  }

  return { config: cfg, grid, dungeons, settlements, interRoads };
}

