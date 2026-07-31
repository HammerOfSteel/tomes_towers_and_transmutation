/**
 * SettlementGenerator — plans building layouts and road networks for a single
 * settlement, given a center tile position on the WorldGrid.
 *
 * Stages:
 *   1. Choose building mix for the settlement type.
 *   2. Place buildings in a type-appropriate spatial pattern (ring, street, grid).
 *   3. Generate road segments (Bresenham lines connecting center to each building).
 *   4. Return a SettlementPlan carrying all placement data.
 *   5. applySettlementToGrid() writes the plan back to the WorldGrid.
 *
 * No Three.js here — pure grid data.  OverworldScene reads the plan and
 * instantiates THREE.Groups.
 */

import { mulberry32 } from '@/core/prng';
import type { SettlementFaction } from '@/overworld-studio';
import { generateSettlementName } from './SettlementNameGenerator';
import type { WorldGrid } from './WorldGrid';
import { buildSettlement, fillWard, OccupancyGrid, type GeneratorParams, type Road, type SettlementType as ModelSettlementType, type WardType } from './SettlementModelGenerator';
import { WARD_TO_KIND } from '@/buildingToDungeonPlan';
import { getFootprint } from './buildings/BuildingDNA';

// ── Public types ───────────────────────────────────────────────────────────────

export type SettlementType = ModelSettlementType;

export interface PlacedBuilding {
  wardType: WardType;
  isAnchor: boolean;
  col: number;
  row: number;
  rotation: number;
  seed: number;
}

export interface RoadSegment {
  col: number;
  row: number;
}

export interface SettlementPlan {
  type:       SettlementType;
  name:       string;
  faction:    string;
  centerCol:  number;
  centerRow:  number;
  buildings:  PlacedBuilding[];
  roads:      RoadSegment[];
  /** Rough inhabitant count — drives NPC spawning in OW-6. */
  population: number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

const SETTLEMENT_MODEL_SCALE = 0.095;
const DIRS8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
const MAX_BUILDING_SNAP_RADIUS = 12;

const PARAMS_BY_TYPE: Record<SettlementType, Omit<GeneratorParams, 'seed' | 'type' | 'layout' | 'faction' | 'warp'>> = {
  village: { nPatches: 8, nGates: 2, walled: false, hasCitadel: false, hasPlaza: true, width: 320, height: 240 },
  town: { nPatches: 12, nGates: 3, walled: false, hasCitadel: false, hasPlaza: true, width: 360, height: 280 },
  city: { nPatches: 18, nGates: 4, walled: true, hasCitadel: true, hasPlaza: true, width: 420, height: 320 },
};

export function planSettlement(
  type: SettlementType,
  centerCol: number,
  centerRow: number,
  seed: number,
  grid: WorldGrid,
  name?: string,
  faction?: string,
): SettlementPlan {
  const settlementName = name ?? generateSettlementName(seed, type);
  const planFaction = (faction ?? 'human') as SettlementFaction;
  const params = PARAMS_BY_TYPE[type];
  const model = buildSettlement({ seed, type, layout: 'auto', faction: planFaction, warp: 0.35, ...params });
  const occ = new OccupancyGrid(params.width, params.height);
  const buildings: PlacedBuilding[] = [];
  const centreX = params.width / 2;
  const centreY = params.height / 2;

  for (const ward of model.wards) {
    if (!ward.withinCity || !WARD_TO_KIND[ward.type]) continue;
    const rects = fillWard(ward, occ, model.roads);
    if (rects.length === 0) continue;
    let anchor = rects[0]!;
    let best = Infinity;
    for (const rect of rects) {
      const d = Math.hypot(rect.x - ward.center.x, rect.y - ward.center.y);
      if (d < best) { best = d; anchor = rect; }
    }
    for (const rect of rects) {
      const mappedCol = centerCol + Math.round((rect.x - centreX) * SETTLEMENT_MODEL_SCALE);
      const mappedRow = centerRow + Math.round((rect.y - centreY) * SETTLEMENT_MODEL_SCALE);
      const snapped = snapBuildingTile(grid, buildings, mappedCol, mappedRow, ward.type, rect === anchor);
      if (!snapped) continue;
      buildings.push({ wardType: ward.type, isAnchor: rect === anchor, col: snapped.col, row: snapped.row, rotation: rect.angle, seed: ((seed ^ (Math.round(rect.x) * 73856093 + Math.round(rect.y) * 19349663)) >>> 0) });
    }
  }

  const roads = rasterizeRoads(model.roads, centerCol, centerRow, centreX, centreY);
  const rand = mulberry32(seed ^ 0xBADC0DE);
  const population = type === 'city' ? 55 + Math.floor(rand() * 30) : type === 'town' ? 25 + Math.floor(rand() * 26) : 8 + Math.floor(rand() * 9);
  return { type, name: settlementName, faction: planFaction, centerCol, centerRow, buildings, roads, population };
}

/**
 * Write settlement data back to WorldGrid.
 *
 * Pipeline:
 *   1. Mark the settlement outskirts zone so tree/rock spawners skip it.
 *   2. Flatten terrain under each building's footprint to prevent buildings
 *      straddling elevation steps.
 *   3. Mark road tiles (feature: 'road').
 *   4. Mark building tiles (content: 'building').
 */
export function applySettlementToGrid(
  plan: SettlementPlan,
  grid: WorldGrid,
  id:   number,
): void {
  const GW = grid.width, GH = grid.height;
  const cc = plan.centerCol, cr = plan.centerRow;

  // ── 1. Mark outskirts zone (prevents nature spawning inside settlement) ────
  const zoneR = plan.type === 'city' ? 16 : plan.type === 'town' ? 12 : 8;
  for (let dc = -zoneR; dc <= zoneR; dc++) {
    for (let dr = -zoneR; dr <= zoneR; dr++) {
      if (dc * dc + dr * dr > zoneR * zoneR) continue;
      const c = cc + dc, r = cr + dr;
      if (c >= 0 && c < GW && r >= 0 && r < GH) {
        grid.set(c, r, { settlementId: id });
      }
    }
  }

  // ── 2. Flatten inner zone to a consistent elevation plateau ────────────────
  //   Find the modal elevation of all non-water/river tiles inside the inner
  //   radius, then snap everything to it.  This gives buildings + roads a
  //   seamless flat ground plane and removes height-step seams in the pavement.
  const innerR  = Math.round(zoneR * 0.60);
  const elevMap = new Map<number, number>();
  for (let dc = -innerR; dc <= innerR; dc++) {
    for (let dr = -innerR; dr <= innerR; dr++) {
      if (dc * dc + dr * dr > innerR * innerR) continue;
      const cell = grid.get(cc + dc, cr + dr);
      if (cell.biome !== 'water' && cell.feature !== 'river') {
        elevMap.set(cell.elevation, (elevMap.get(cell.elevation) ?? 0) + 1);
      }
    }
  }
  let targetElev = grid.get(cc, cr).elevation;
  let bestCount  = 0;
  for (const [elev, count] of elevMap) {
    if (count > bestCount) { bestCount = count; targetElev = elev; }
  }
  for (let dc = -innerR; dc <= innerR; dc++) {
    for (let dr = -innerR; dr <= innerR; dr++) {
      if (dc * dc + dr * dr > innerR * innerR) continue;
      const c = cc + dc, r = cr + dr;
      const cell = grid.get(c, r);
      if (cell.biome !== 'water' && cell.feature !== 'river') {
        grid.set(c, r, { elevation: targetElev });
      }
    }
  }

  // ── 3. Mark road tiles ────────────────────────────────────────────────────
  for (const road of plan.roads) {
    grid.set(road.col, road.row, { feature: 'road', settlementId: id });
  }

  // ── 4. Mark building tiles ────────────────────────────────────────────────
  for (let i = 0; i < plan.buildings.length; i++) {
    const b = plan.buildings[i]!;
    grid.set(b.col, b.row, {
      content:      'building',
      buildingId:   i + 1,
      settlementId: id,
      walkable:     false,
    });
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** True if a tile is safe to build on (no water, no dungeon, within bounds). */
function _valid(grid: WorldGrid, col: number, row: number): boolean {
  if (col < 1 || col >= grid.width - 1 || row < 1 || row >= grid.height - 1) return false;
  const cell = grid.get(col, row);
  if (cell.biome === 'water') return false;
  if (cell.feature === 'river') return false;
  if (cell.content === 'dungeon_entrance') return false;
  if (cell.elevation < 1) return false;
  return true;
}

function buildingHalfExtents(b: Pick<PlacedBuilding, 'wardType' | 'isAnchor'>): { hw: number; hd: number } {
  const kind = WARD_TO_KIND[b.wardType]!;
  const size = b.isAnchor ? (b.wardType in { park:1 } ? 'medium' : undefined) : 'tiny';
  const resolvedSize = size ?? (b.wardType === 'patriciate' ? 'large' : b.wardType === 'church' ? 'medium' : 'medium');
  const fp = getFootprint(kind, resolvedSize as any);
  return { hw: Math.ceil(fp.w / 4), hd: Math.ceil(fp.d / 4) };
}

function _noOverlap(placed: PlacedBuilding[], col: number, row: number, wardType: WardType, isAnchor: boolean, padding = 1): boolean {
  const cur = buildingHalfExtents({ wardType, isAnchor });
  for (const b of placed) {
    const other = buildingHalfExtents(b);
    if (Math.abs(col - b.col) < cur.hw + other.hw + padding && Math.abs(row - b.row) < cur.hd + other.hd + padding) return false;
  }
  return true;
}

function snapBuildingTile(grid: WorldGrid, placed: PlacedBuilding[], col: number, row: number, wardType: WardType, isAnchor: boolean): { col: number; row: number } | null {
  if (_valid(grid, col, row) && _noOverlap(placed, col, row, wardType, isAnchor)) return { col, row };
  for (let r = 1; r <= MAX_BUILDING_SNAP_RADIUS; r++) {
    for (const [dr, dc] of DIRS8) {
      const nc = col + dc * r;
      const nr = row + dr * r;
      if (_valid(grid, nc, nr) && _noOverlap(placed, nc, nr, wardType, isAnchor)) return { col: nc, row: nr };
    }
  }
  return null;
}

function rasterizeRoads(roads: Road[], centerCol: number, centerRow: number, cx: number, cy: number): RoadSegment[] {
  const out = new Map<string, RoadSegment>();
  for (const road of roads) {
    for (const p of road.points) {
      const col = centerCol + Math.round((p.x - cx) * SETTLEMENT_MODEL_SCALE);
      const row = centerRow + Math.round((p.y - cy) * SETTLEMENT_MODEL_SCALE);
      out.set(`${col},${row}`, { col, row });
    }
  }
  return [...out.values()];
}

