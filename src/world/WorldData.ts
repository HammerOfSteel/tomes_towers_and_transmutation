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
import type { WorldHistoryResult }          from './WorldHistory';
import type { ResourceNodeRecord }          from './ResourceNodePlacer';
import type { CaveEntranceBiome }           from './CaveGladePlacer';
import type { DungeonSiteFamily, DungeonRewardBiasTag } from './DungeonSiteMetadata';
import type { GridPath }                    from './RoadGenerator';


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
  /** DI-2b: deterministic site-family identity, derived from (world seed, col, row). */
  siteFamily: DungeonSiteFamily;
  /** DI-2b: reward-bias tags fixed per site family — hints for future loot/reward generation. */
  rewardBias: DungeonRewardBiasTag[];
  /** DI-2b: true if this site family can offer an elite companion recruit. */
  eliteRecruitOpportunity: boolean;
  /** DI-2b: true if clearing this site produces tower-defense intel. */
  defenseIntelSource: boolean;
}


// ── WorldData ──────────────────────────────────────────────────────────────────

export interface SettlementEntry {
  /** 1-based sequential ID. */
  id:   number;
  seed: number;
  plan: SettlementPlan;
}

export interface CaveEntry {
  /** 1-based sequential ID (own id space, independent of DungeonEntry ids). */
  id:      number;
  seed:    number;
  biome:   CaveEntranceBiome;
  col:     number;
  row:     number;
  /** Becomes true when the player first approaches (mirrors DungeonEntry.discovered). */
  discovered: boolean;
}

export interface GladeEntry {
  id:      number;
  seed:    number;
  col:     number;
  row:     number;
  discovered: boolean;
}

export interface WorldData {
  config:      WorldGenConfig;
  grid:        WorldGrid;
  /** Placed dungeon entrances.  Populated by DungeonPlacer. */
  dungeons:    DungeonEntry[];
  /** Placed settlements (villages, towns, city).  Populated by SettlementPlacer. */
  settlements: SettlementEntry[];
  /** Placed cave entrances on bog/highland/rocky terrain (CG-3). Populated by CaveGladeWorldPlacer. */
  caves:       CaveEntry[];
  /** Placed glade entrances on forest terrain (CG-3). Populated by CaveGladeWorldPlacer. */
  glades:      GladeEntry[];
  /** Road tiles connecting settlements across the overworld (A* routed). */
  interRoads:      RoadSegment[];
  /** Ordered, un-deduplicated per-edge paths for the same inter-settlement
   *  roads as `interRoads` — used to build a continuous (Chaikin-smoothed)
   *  world-space centerline for road sub-tile rendering, since `interRoads`
   *  itself is a deduplicated flat set with no path ordering preserved. */
  interRoadPaths:  GridPath[];
  /** World history simulation result (50-turn). Populated by WorldGenerator. */
  history?:        WorldHistoryResult;
  /** Harvestable resource nodes scattered across the overworld. Phase 7e. */
  resourceNodes:   ResourceNodeRecord[];
}
