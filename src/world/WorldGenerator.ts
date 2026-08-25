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
import { generateHydrology }   from './HydrologyGenerator';
import { placeDungeons }       from './DungeonPlacer';
import { placeSettlements }    from './SettlementPlacer';
import { placeCavesAndGlades } from './CaveGladeWorldPlacer';
import { buildInterSettlementRoads } from './RoadGenerator';
import { simulateWorldHistory }      from './WorldHistory';
import { placeResourceNodes }         from './ResourceNodePlacer';
import { generateRealmData }   from './RealmGenerator';
import { realmToWorldGrid }    from './RealmToWorldGrid';

const MLV = 4;

/**
 * Build a WorldGrid with elevation (0–4) and biome data sourced from the
 * same `generateRealmData()` realm generator Overworld Studio uses (P0
 * realm/terrain unification — see
 * TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md), resampled onto
 * this grid's shape via `realmToWorldGrid()`. The tower flat-zone/rim-bias
 * post-processing below matches the original OverworldScene._buildGrid
 * with distances parameterised to the grid size:
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

  // P0 — terrain is now sourced from the same realm generator Overworld
  // Studio uses, instead of an independent FBM-noise algorithm, so the
  // same seed produces recognizably the same land/water/mountain layout
  // in both places. See TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md.
  const realm = generateRealmData(seed);
  const grid  = realmToWorldGrid(realm, config.worldSize);

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const dc  = col - GHW;
      const dr  = row - GHH;
      const tR  = Math.sqrt(dc * dc + dr * dr);

      let level = grid.get(col, row).elevation;

      // Smooth flatness gradient around the tower site — kept as a
      // gameplay requirement (guaranteed buildable land at the tower)
      // independent of what the realm placed there.
      const flatness = Math.max(0, 1 - tR / FR);
      level = Math.round(level * (1 - flatness));

      // Rim elevation bias (bowl walls) — kept unchanged.
      const rimBias = Math.max(0, (tR - rimStart) / rimRange);
      level = Math.min(MLV, Math.round(level + rimBias * 1.8));

      grid.set(col, row, { elevation: level });
    }
  }

  // OW-2: carve rivers into the grid (unchanged — out of scope for P0,
  // see design spec's "Explicitly out of scope" section)
  generateHydrology(grid, config, seed);

  return grid;
}

/**
 * Mark tiles as road (or, for river tiles, as a ford) after
 * `buildInterSettlementRoads()` has produced a flat tile list.
 *
 * A road tile landing on a river cell becomes a `'river_ford'` — a shallow,
 * walkable crossing (`waterDepth: 0, walkable: true`) instead of deep water
 * — reusing the A* road-crossing data rather than a separate ford-siting
 * algorithm (RI-3). Plain `'none'`/`'road_dirt'` tiles are simply marked
 * `'road'`, unchanged from before.
 */
export function applyRoadFords(
  grid: WorldGrid,
  roadTiles: readonly { col: number; row: number }[],
): void {
  for (const r of roadTiles) {
    const cell = grid.get(r.col, r.row);
    if (cell.feature === 'none' || cell.feature === 'road_dirt') {
      grid.set(r.col, r.row, { feature: 'road' });
    } else if (cell.feature === 'river') {
      grid.set(r.col, r.row, { feature: 'river_ford', waterDepth: 0, walkable: true });
    }
  }
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
  // CG-3 — cave/glade entrances scattered after dungeons/settlements so they
  // steer clear of tiles those passes already claimed.
  const { caves, glades } = placeCavesAndGlades(grid, cfg, seed);

  // Build terrain-aware inter-settlement roads (MST + A* + DP simplification).
  const { tiles: interRoads } = buildInterSettlementRoads(settlements, grid);

  // Mark inter-settlement road tiles on the grid so the overworld mesh picks
  // them up (river crossings become fords instead of plain road — RI-3).
  applyRoadFords(grid, interRoads);


  const partial = { config: cfg, grid, dungeons, settlements, caves, glades, interRoads,
                    resourceNodes: [] as import('./ResourceNodePlacer').ResourceNodeRecord[],
                    history: simulateWorldHistory({ config: cfg, grid, dungeons, settlements, caves, glades, interRoads,
                      resourceNodes: [] }, seed) };
  partial.resourceNodes = placeResourceNodes(partial);
  return partial;
}

