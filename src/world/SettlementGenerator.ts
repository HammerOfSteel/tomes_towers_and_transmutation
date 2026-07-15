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

import { mulberry32 }                          from '@/core/prng';
import type { WorldGrid }                       from './WorldGrid';
import type { BuildingType }                    from './buildings/BuildingTypes';
import { BUILDING_SPECS }                       from './buildings/BuildingTypes';
import { generateSettlementName }               from './SettlementNameGenerator';

// ── Public types ───────────────────────────────────────────────────────────────

export type SettlementType = 'village' | 'town' | 'city';

export interface PlacedBuilding {
  type:     BuildingType;
  col:      number;
  row:      number;
  /** Y-axis rotation in radians (0 = front face +Z). */
  rotation: number;
  seed:     number;
}

export interface RoadSegment {
  col: number;
  row: number;
}

export interface SettlementPlan {
  type:       SettlementType;
  name:       string;
  centerCol:  number;
  centerRow:  number;
  buildings:  PlacedBuilding[];
  roads:      RoadSegment[];
  /** Rough inhabitant count — drives NPC spawning in OW-6. */
  population: number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function planSettlement(
  type:      SettlementType,
  centerCol: number,
  centerRow: number,
  seed:      number,
  grid:      WorldGrid,
): SettlementPlan {
  const name = generateSettlementName(seed, type);
  switch (type) {
    case 'village': return _planVillage(centerCol, centerRow, seed, grid, name);
    case 'town':    return _planTown(centerCol, centerRow, seed, grid, name);
    case 'city':    return _planCity(centerCol, centerRow, seed, grid, name);
  }
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

  // ── 2. Flatten terrain under each building footprint ──────────────────────
  //  Pick the tile's own elevation as the target so it stays within the
  //  1-2 range chosen by SettlementPlacer.  Skips water / river tiles.
  for (const b of plan.buildings) {
    const targetElev = grid.get(b.col, b.row).elevation;
    const [bw, bd]   = BUILDING_SPECS[b.type].footprint;
    const hw = Math.ceil(bw / 2);
    const hd = Math.ceil(bd / 2);
    for (let dc = -hw; dc <= hw; dc++) {
      for (let dr = -hd; dr <= hd; dr++) {
        const c = b.col + dc, r = b.row + dr;
        const cell = grid.get(c, r);
        if (cell.biome !== 'water' && cell.feature !== 'river') {
          grid.set(c, r, { elevation: targetElev });
        }
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
  if (cell.biome === 'water')                 return false;
  if (cell.feature === 'river')               return false;
  if (cell.content === 'dungeon_entrance')    return false;
  if (cell.elevation < 1)                     return false;  // no buildings on bog/level-0
  return true;
}

/**
 * True if the candidate building at (col, row) does NOT overlap any already-
 * placed building, accounting for each building's tile footprint + padding.
 *
 * footprint[0] = width tiles (along col axis)
 * footprint[1] = depth tiles (along row axis)
 */
function _noOverlap(
  placed:  PlacedBuilding[],
  col:     number,
  row:     number,
  type:    BuildingType,
  padding: number = 1,
): boolean {
  const [fw, fd] = BUILDING_SPECS[type].footprint;
  const hW = Math.ceil(fw / 2);
  const hD = Math.ceil(fd / 2);

  for (const b of placed) {
    const [bw, bd] = BUILDING_SPECS[b.type].footprint;
    const bhW = Math.ceil(bw / 2);
    const bhD = Math.ceil(bd / 2);
    // AABB overlap test with padding gap
    if (
      Math.abs(col - b.col) < hW  + bhW + padding &&
      Math.abs(row - b.row) < hD  + bhD + padding
    ) return false;
  }
  return true;
}

// ── Village ───────────────────────────────────────────────────────────────────

function _planVillage(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand = mulberry32(seed ^ 0xA5_B7_C3_D1);
  const GW   = grid.width, GH = grid.height;
  const buildings: PlacedBuilding[] = [];
  const roadSet   = new Set<string>();

  // ── Cross path: 1 tile wide, ±4 tiles from centre ──────────────────────────
  const VL = 4;
  for (let i = -VL; i <= VL; i++) {
    const c = cc + i; if (c >= 0 && c < GW) roadSet.add(`${c},${cr}`);
    const r = cr + i; if (r >= 0 && r < GH) roadSet.add(`${cc},${r}`);
  }
  // Short lane stubs at each arm end so corner buildings have road access
  for (const dc of [-VL, VL]) {
    for (let dr = 1; dr <= 3; dr++) {
      const c = cc + dc;
      if (c >= 0 && c < GW) {
        if (cr - dr >= 0)  roadSet.add(`${c},${cr - dr}`);
        if (cr + dr < GH)  roadSet.add(`${c},${cr + dr}`);
      }
    }
  }

  // ── Focal feature at centre ─────────────────────────────────────────────────
  const focalType: BuildingType = rand() < 0.6 ? 'well' : 'market_cross';
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: focalType, col: cc, row: cr, rotation: 0, seed: (seed ^ 0x11) >>> 0 });
  }

  // ── Building placement: 3-tile setback from cross paths ────────────────────
  const MIX: BuildingType[] = [
    'smithy', 'cottage', 'cottage', 'market_stall',
    'cottage', 'cottage', 'cottage', 'cottage',
  ];
  let mi = 0;

  // Along E-W path: north side (rotation=0, faces south), south side (rotation=π, faces north)
  for (const step of [-VL, 0, VL] as const) {
    for (const side of [-1, 1] as const) {
      if (mi >= MIX.length) break;
      const col   = cc + step;
      const row   = cr + side * 3;
      const btype = MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 1)) continue;
      buildings.push({
        type:     btype, col, row,
        rotation: side < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x9E37)) >>> 0,
      });
      mi++;
    }
    if (mi >= MIX.length) break;
  }

  // Along N-S path at centre row: west (rotation=π/2, faces east), east (rotation=-π/2, faces west)
  for (const side of [-1, 1] as const) {
    if (mi >= MIX.length) break;
    const col   = cc + side * 3;
    const btype = MIX[mi]!;
    if (!_valid(grid, col, cr) || !_noOverlap(buildings, col, cr, btype, 1)) continue;
    buildings.push({
      type:     btype, col, row: cr,
      rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      seed:     (seed ^ (mi * 0x9E37)) >>> 0,
    });
    mi++;
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c!, row: r! });
  }

  return { type: 'village', name, centerCol: cc, centerRow: cr, buildings, roads,
           population: 8 + Math.floor(rand() * 9) };
}

// ── Town ──────────────────────────────────────────────────────────────────────

function _planTown(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand  = mulberry32(seed ^ 0xB2_C4_D6_E8);
  const GW = grid.width, GH = grid.height;
  const buildings: PlacedBuilding[] = [];
  const roadSet = new Set<string>();

  // Main E-W street (3 tiles wide = 6 WU — feels like a real market high street)
  const SL = 8;
  for (let i = -SL; i <= SL; i++) {
    for (const dr of [-1, 0, 1]) {
      const c = cc + i, r = cr + dr;
      if (c >= 0 && c < GW && r >= 0 && r < GH) roadSet.add(`${c},${r}`);
    }
  }
  // N-S cross street (3 tiles wide)
  for (let i = -(SL - 2); i <= SL - 2; i++) {
    for (const dc of [-1, 0, 1]) {
      const c = cc + dc, r = cr + i;
      if (c >= 0 && c < GW && r >= 0 && r < GH) roadSet.add(`${c},${r}`);
    }
  }

  // Central market_cross
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: 'market_cross', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
  }

  const MIX: BuildingType[] = [
    'tavern', 'inn', 'smithy', 'market_stall', 'market_stall',
    'inn', 'cottage', 'cottage', 'cottage', 'cottage',
    'cottage', 'well', 'guard_tower', 'cottage',
    'cottage', 'market_stall', 'cottage',
  ];
  let mi = 0;

  // Buildings along E-W street — setback 4 tiles (from road centre), step every 4 tiles
  for (let step = -8; step <= 8; step += 4) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + step;
      const row = cr + side * 4;
      const btype = MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 2)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  // Buildings along N-S cross street — setback 4 tiles, step every 4 tiles
  for (let step = -6; step <= 6; step += 4) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + side * 4;
      const row = cr + step;
      const btype = MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 2)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c!, row: r! });
  }

  return { type: 'town', name, centerCol: cc, centerRow: cr, buildings, roads,
           population: 25 + Math.floor(rand() * 26) };
}

// ── City ──────────────────────────────────────────────────────────────────────

function _planCity(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand  = mulberry32(seed ^ 0xC3_D5_E7_F9);
  const GW = grid.width, GH = grid.height;
  const buildings: PlacedBuilding[] = [];
  const roadSet = new Set<string>();

  // Grand boulevard grid — 3-tile-wide avenues creating distinct city blocks.
  const SL = 12;
  // E-W main boulevard (3 tiles wide) + parallel avenues at ±4
  for (let i = -SL; i <= SL; i++) {
    for (const dr of [-1, 0, 1]) {
      const c = cc + i;
      if (c >= 0 && c < GW) {
        const r0 = cr + dr; if (r0 >= 0 && r0 < GH) roadSet.add(`${c},${r0}`);
        const r1 = cr + dr + 4; if (r1 >= 0 && r1 < GH) roadSet.add(`${c},${r1}`);
        const r2 = cr + dr - 4; if (r2 >= 0 && r2 < GH) roadSet.add(`${c},${r2}`);
      }
    }
  }
  // N-S main boulevard (3 tiles wide) + parallel avenues at ±4
  for (let i = -SL; i <= SL; i++) {
    for (const dc of [-1, 0, 1]) {
      const r = cr + i;
      if (r >= 0 && r < GH) {
        const c0 = cc + dc; if (c0 >= 0 && c0 < GW) roadSet.add(`${c0},${r}`);
        const c1 = cc + dc + 4; if (c1 >= 0 && c1 < GW) roadSet.add(`${c1},${r}`);
        const c2 = cc + dc - 4; if (c2 >= 0 && c2 < GW) roadSet.add(`${c2},${r}`);
      }
    }
  }

  // Central city_hall
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: 'city_hall', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
  }
  // Temple north of city hall with proper separation
  if (_valid(grid, cc, cr - 8)) {
    buildings.push({ type: 'temple', col: cc, row: cr - 8, rotation: 0, seed: (seed ^ 0x02) >>> 0 });
  }

  const QUADRANT_MIX: BuildingType[] = [
    'inn', 'tavern', 'smithy', 'market_stall', 'guard_tower',
    'market_stall', 'inn', 'well', 'cottage', 'cottage', 'cottage',
    'inn', 'smithy', 'market_stall', 'cottage', 'guard_tower',
    'cottage', 'cottage', 'market_stall', 'well', 'cottage',
  ];
  let mi = 0;

  // 4 quadrants: generous spacing — 6+ tiles from center, 4-tile step between buildings
  for (const [qsc, qsr] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    for (let bi = 0; bi < 5; bi++) {
      if (mi >= QUADRANT_MIX.length) break;
      const col = cc + qsc * (6 + (bi % 3) * 4);
      const row = cr + qsr * (6 + Math.floor(bi / 3) * 4);
      const btype = QUADRANT_MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype)) { mi++; continue; }
      buildings.push({
        type:     QUADRANT_MIX[mi++],
        col, row,
        rotation: qsr < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x5C3D)) >>> 0,
      });
    }
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c, row: r });
  }

  return { type: 'city', name, centerCol: cc, centerRow: cr, buildings, roads,
           population: 80 + Math.floor(rand() * 71) };
}
