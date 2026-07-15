/**
 * ResourceNodePlacer — procedurally places ore veins, timber logs, and
 * essence blossoms across the overworld grid.
 *
 * Phase 7e: Resource Gathering & Economy
 *
 * Placement rules:
 *  - Ore veins:       near highland / mountain tiles (elevation ≥ 0.6)
 *  - Timber logs:     near forest / bog tiles
 *  - Essence blossoms: near water / wetland tiles
 *  - All types use Poisson-disk minimum separation to avoid clustering.
 *  - Nodes stay clear of the central tower radius (6 tiles) and of any
 *    settlement or dungeon tile.
 */

import type { WorldData } from './WorldData';
import { mulberry32 }     from '@/core/prng';

export type ResourceType = 'ore' | 'timber' | 'essence';

export interface ResourceNodeRecord {
  /** World-space X coordinate (centre of node). */
  wx: number;
  /** World-space Z coordinate (centre of node). */
  wz: number;
  type: ResourceType;
  /** Base resource yield before Cunning multiplier. 2 for ore, 3 for timber, 1 for essence. */
  baseYield: number;
  /** Unique index for respawn-timer tracking. */
  index: number;
}

/** Minimum squared WU distance between any two nodes of ANY type. */
const MIN_DIST_WU = 10;

/** WU around tower centre that stays clear of nodes. */
const TOWER_EXCLUSION_WU = 14;

// World-space tile size (must match terrain builder constant T = 2 WU/tile)
const T = 2;

function worldPos(col: number, row: number, gHalfW: number, gHalfH: number) {
  return { wx: (col - gHalfW) * T, wz: (row - gHalfH) * T };
}

interface Candidate {
  wx: number;
  wz: number;
  type: ResourceType;
}

export function placeResourceNodes(worldData: WorldData): ResourceNodeRecord[] {
  const { grid, config } = worldData;
  const W = grid.width;
  const H = grid.height;
  const gHalfW = (W - 1) / 2;
  const gHalfH = (H - 1) / 2;

  // Build settlement + dungeon exclusion set (col_row keys)
  const blockedKeys = new Set<string>();
  for (const d of worldData.dungeons) {
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        blockedKeys.add(`${d.col + dc}_${d.row + dr}`);
      }
    }
  }
  for (const s of worldData.settlements) {
    const sc = s.plan.centerCol;
      const sr = s.plan.centerRow;
    const radius = s.plan.type === 'city' ? 5 : s.plan.type === 'town' ? 4 : 3;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        blockedKeys.add(`${sc + dc}_${sr + dr}`);
      }
    }
  }

  // Collect type-biased candidate tiles
  const oreCandidates:     Candidate[] = [];
  const timberCandidates:  Candidate[] = [];
  const essenceCandidates: Candidate[] = [];

  for (let r = 2; r < H - 2; r++) {
    for (let c = 2; c < W - 2; c++) {
      if (blockedKeys.has(`${c}_${r}`)) continue;
      const cell = grid.get(c, r);
      if (!cell) continue;

      const { wx, wz } = worldPos(c, r, gHalfW, gHalfH);
      const distSq = wx * wx + wz * wz;
      if (distSq < TOWER_EXCLUSION_WU * TOWER_EXCLUSION_WU) continue;

      const biome = cell.biome as string;
      const elev  = ('elevation' in cell ? (cell as unknown as { elevation: number }).elevation : 0) ?? 0;

      if (elev >= 0.55 || biome === 'highlands' || biome === 'mountain') {
        oreCandidates.push({ wx, wz, type: 'ore' });
      }
      if (biome === 'forest' || biome === 'bog') {
        timberCandidates.push({ wx, wz, type: 'timber' });
      }
      if (biome === 'wetland' || biome === 'river' || biome === 'lake') {
        essenceCandidates.push({ wx, wz, type: 'essence' });
      }
    }
  }

  // Poisson-disk select from each candidate list
  const rand = mulberry32(config.seed ^ 0xBE_EF_CA_FE);
  const nodes: ResourceNodeRecord[] = [];
  let idx = 0;

  function selectNodes(
    candidates: Candidate[],
    wantCount:  number,
    baseYield:  number,
  ) {
    if (candidates.length === 0) return;
    // Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    let placed = 0;
    outer: for (const c of candidates) {
      if (placed >= wantCount) break;
      // Check min distance against already placed nodes
      for (const n of nodes) {
        const dx = n.wx - c.wx;
        const dz = n.wz - c.wz;
        if (dx * dx + dz * dz < MIN_DIST_WU * MIN_DIST_WU) continue outer;
      }
      nodes.push({ wx: c.wx, wz: c.wz, type: c.type, baseYield, index: idx++ });
      placed++;
    }
  }

  selectNodes(oreCandidates,     12, 2);
  selectNodes(timberCandidates,  10, 3);
  selectNodes(essenceCandidates,  8, 1);

  return nodes;
}
