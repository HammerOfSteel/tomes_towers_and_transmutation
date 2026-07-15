/**
 * WorldData — top-level container that holds everything generated for a world:
 * the procedural config, the per-tile data grid, and all placed entity lists.
 *
 * Entity lists (dungeons, settlements, buildings) are populated by their
 * respective placement passes in WorldDataBuilder.  New phases add more lists
 * here without touching callers that only need the existing fields.
 */

import type { WorldGenConfig } from './WorldGenConfig';
import type { WorldGrid }      from './WorldGrid';
import type { DungeonType }    from './DungeonType';
import type { SettlementPlan, RoadSegment } from './SettlementGenerator';
import type { GridPath }        from './RoadGenerator';

// ── Entity record types ────────────────────────────────────────────────────────

export interface DungeonEntry {
  /** 1-based sequential ID; also stored in WorldGrid cell.dungeonId. */
  id:         number;
  /** Seed passed to generateDungeon().  Derived from world seed + id. */
  seed:       number;
  type:       DungeonType;
  col:        number;
  row:        number;
  name:       string;
  /** Number of corridor rooms to generate inside (from DungeonTypeConfig.roomCount). */
  floorCount: number;
  /** Becomes true when the player first approaches (OW-3b). */
  discovered: boolean;
}

// ── WorldData ──────────────────────────────────────────────────────────────────

export interface SettlementEntry {
  /** 1-based sequential ID. */
  id:   number;
  seed: number;
  plan: SettlementPlan;
}

export interface WorldData {
  config:      WorldGenConfig;
  grid:        WorldGrid;
  /** Placed dungeon entrances.  Populated by DungeonPlacer. */
  dungeons:    DungeonEntry[];
  /** Placed settlements (villages, towns, city).  Populated by SettlementPlacer. */
  settlements: SettlementEntry[];
  /** Road tiles connecting settlements across the overworld (A* routed). */
  interRoads:      RoadSegment[];
  /** Per-edge simplified paths for Catmull–Rom ribbon rendering. */
  interRoadPaths:  GridPath[];
}
