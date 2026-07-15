/**
 * QuestDef — data schema for procedurally generated world quests.
 *
 * Quests reference actual world locations (dungeons, settlements, grid cells)
 * so they feel grounded in the generated world rather than generic.
 *
 * Quest generation and completion checking live here.
 * Reward delivery calls ProgressionSystem / Inventory from the call site.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type QuestType =
  | 'clear_dungeon'
  | 'deliver_item'
  | 'escort_npc'
  | 'find_location'
  | 'investigate';

export interface QuestTarget {
  type:  'dungeon' | 'settlement' | 'grid_cell';
  id:    number;
  col:   number;
  row:   number;
  label: string;  // display name for the quest log
}

export interface QuestReward {
  gold: number;
  xp:   number;
}

export interface QuestDef {
  id:          string;   // unique: `${giverNpcName}_${type}_${targetId}`
  title:       string;
  type:        QuestType;
  giverName:   string;
  target:      QuestTarget;
  reward:      QuestReward;
  description: string;
  completed:   boolean;
  /** Whether the target location has been reached / task fulfilled. */
  fulfilled:   boolean;
}

// ── Quest generation ──────────────────────────────────────────────────────────

import type { DungeonEntry, SettlementEntry } from './WorldData';
import type { HistoryEvent }                  from './WorldHistory';

export interface QuestContext {
  npcName:    string;
  npcRole:    'guard' | 'merchant' | 'scholar' | string;
  settlement: SettlementEntry;
  /** All dungeons from WorldData */
  dungeons:   DungeonEntry[];
  /** History events near the NPC (60-tile radius) */
  nearbyEvents?: HistoryEvent[];
}

export function generateQuest(ctx: QuestContext, _seed: number): QuestDef | null {
  const { npcName, npcRole, settlement, dungeons, nearbyEvents } = ctx;
  const { plan } = settlement;

  if (npcRole === 'guard' || npcRole === 'blacksmith') {
    // Guard/blacksmith → clear nearest dungeon
    const nearest = _nearestDungeon(dungeons, plan.centerCol, plan.centerRow);
    if (!nearest) return null;
    return {
      id:          `${npcName}_clear_${nearest.id}`,
      title:       `Clear ${nearest.name}`,
      type:        'clear_dungeon',
      giverName:   npcName,
      target:      { type: 'dungeon', id: nearest.id, col: nearest.col, row: nearest.row, label: nearest.name },
      reward:      { gold: 40 + nearest.floorCount * 15, xp: 80 + nearest.floorCount * 30 },
      description: `${npcName} needs someone to clear the threats from ${nearest.name}.`,
      completed:   false,
      fulfilled:   false,
    };
  }

  if (npcRole === 'merchant' || npcRole === 'innkeeper') {
    // Merchant → visit nearest other settlement (deliver goods)
    const target = _nearestOtherSettlement(ctx.settlement, ctx as unknown as { settlements?: SettlementEntry[] });
    if (!target) return null;
    return {
      id:          `${npcName}_deliver_${target.id}`,
      title:       `Deliver to ${target.plan.name}`,
      type:        'deliver_item',
      giverName:   npcName,
      target:      { type: 'settlement', id: target.id, col: target.plan.centerCol, row: target.plan.centerRow, label: target.plan.name },
      reward:      { gold: 25, xp: 40 },
      description: `${npcName} asks you to deliver a parcel to ${target.plan.name}.`,
      completed:   false,
      fulfilled:   false,
    };
  }

  if (npcRole === 'scholar' || npcRole === 'citizen') {
    // Scholar → investigate nearest magical anomaly
    const anomaly = nearbyEvents?.find(e => e.type === 'magical_anomaly');
    if (!anomaly) return null;
    return {
      id:          `${npcName}_investigate_${anomaly.col}_${anomaly.row}`,
      title:       `Investigate the Anomaly`,
      type:        'investigate',
      giverName:   npcName,
      target:      { type: 'grid_cell', id: 0, col: anomaly.col, row: anomaly.row, label: 'Anomaly Site' },
      reward:      { gold: 15, xp: 60 },
      description: `${npcName} sensed strange magic nearby. Investigate the site to the ${_dir(anomaly.col - plan.centerCol, anomaly.row - plan.centerRow)}.`,
      completed:   false,
      fulfilled:   false,
    };
  }

  return null;
}

// ── Completion check ──────────────────────────────────────────────────────────

/**
 * Returns true when the player's grid position satisfies the quest target.
 * Call this each frame once a quest is active.
 */
export function checkQuestFulfillment(
  quest:      QuestDef,
  playerCol:  number,
  playerRow:  number,
  clearedDungeonIds: Set<number>,
): boolean {
  const { target } = quest;
  switch (quest.type) {
    case 'clear_dungeon':
      return clearedDungeonIds.has(target.id);
    case 'deliver_item':
    case 'find_location':
    case 'investigate': {
      const dc = playerCol - target.col;
      const dr = playerRow - target.row;
      return dc * dc + dr * dr <= 4 * 4;  // within 4 tiles of target
    }
    default:
      return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _nearestDungeon(dungeons: DungeonEntry[], col: number, row: number): DungeonEntry | null {
  let best: DungeonEntry | null = null;
  let bestD2 = Infinity;
  for (const d of dungeons) {
    const dc = d.col - col, dr = d.row - row;
    const d2 = dc * dc + dr * dr;
    if (d2 < bestD2) { bestD2 = d2; best = d; }
  }
  return best;
}

function _nearestOtherSettlement(
  home: SettlementEntry,
  ctx:  { settlements?: SettlementEntry[] },
): SettlementEntry | null {
  if (!ctx.settlements) return null;
  let best: SettlementEntry | null = null;
  let bestD2 = Infinity;
  const { centerCol: cc, centerRow: cr } = home.plan;
  for (const s of ctx.settlements) {
    if (s.id === home.id) continue;
    const dc = s.plan.centerCol - cc, dr = s.plan.centerRow - cr;
    const d2 = dc * dc + dr * dr;
    if (d2 < bestD2) { bestD2 = d2; best = s; }
  }
  return best;
}

function _dir(dc: number, dr: number): string {
  if (Math.abs(dr) > Math.abs(dc)) return dr < 0 ? 'north' : 'south';
  return dc < 0 ? 'west' : 'east';
}
