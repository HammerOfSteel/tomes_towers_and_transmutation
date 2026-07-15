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

/** Write road and building markers back to WorldGrid cells. */
export function applySettlementToGrid(plan: SettlementPlan, grid: WorldGrid): void {
  for (const road of plan.roads) {
    grid.set(road.col, road.row, { feature: 'road' });
  }
  for (let i = 0; i < plan.buildings.length; i++) {
    const b = plan.buildings[i];
    grid.set(b.col, b.row, {
      content:    'building',
      buildingId: i + 1,
      walkable:   false,
    });
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Bresenham line: returns all [col, row] pairs on the integer grid line. */
function _line(c1: number, r1: number, c2: number, r2: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = c1, y = r1;
  const dx = Math.abs(c2 - c1), dy = Math.abs(r2 - r1);
  const sx = c1 < c2 ? 1 : -1;
  const sy = r1 < r2 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    pts.push([x, y]);
    if (x === c2 && y === r2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
  return pts;
}

/** True if a tile is safe to build on (no water, no dungeon, within bounds). */
function _valid(grid: WorldGrid, col: number, row: number): boolean {
  if (col < 1 || col >= grid.width - 1 || row < 1 || row >= grid.height - 1) return false;
  const cell = grid.get(col, row);
  if (cell.biome === 'water')                 return false;
  if (cell.feature === 'river')               return false;
  if (cell.content === 'dungeon_entrance')    return false;
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

/** Build roads between center and each building, deduplicated via a Set. */
function _addSpokes(
  centerCol: number, centerRow: number,
  buildings: PlacedBuilding[],
  out: RoadSegment[],
): void {
  const seen = new Set<string>();
  for (const b of buildings) {
    for (const [c, r] of _line(centerCol, centerRow, b.col, b.row)) {
      const key = `${c},${r}`;
      if (!seen.has(key)) { seen.add(key); out.push({ col: c, row: r }); }
    }
  }
}

// ── Village ───────────────────────────────────────────────────────────────────

function _planVillage(
  cc: number, cr: number, seed: number, grid: WorldGrid, name: string,
): SettlementPlan {
  const rand  = mulberry32(seed ^ 0xA5_B7_C3_D1);
  const buildings: PlacedBuilding[] = [];
  const roads:     RoadSegment[]    = [];

  // Focal feature at center
  const focalType: BuildingType = rand() < 0.6 ? 'well' : 'market_cross';
  if (_valid(grid, cc, cr)) {
    buildings.push({ type: focalType, col: cc, row: cr, rotation: rand() * Math.PI * 2, seed: (seed ^ 0x11) >>> 0 });
  }

  // Ring of cottages / occasional smithy — generous radius so buildings don't crowd each other.
  // Ring radius 5-7 tiles (10-14 WU center-to-center) gives ~9-13 WU between adjacent cottages.
  const N   = 6 + Math.floor(rand() * 5);
  const MIX: BuildingType[] = ['smithy', 'cottage', 'cottage', 'inn', 'cottage', 'cottage', 'cottage', 'market_stall', 'cottage', 'cottage', 'cottage'];
  const baseR = 5 + Math.floor(rand() * 3);  // 5, 6, or 7 tiles

  for (let i = 0; i < N; i++) {
    const angle   = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const rJitter = (rand() - 0.5) * 1.2;  // slight radial variation for organic feel
    const R       = baseR + rJitter;
    const col     = Math.round(cc + Math.cos(angle) * R);
    const row     = Math.round(cr + Math.sin(angle) * R);
    if (!_valid(grid, col, row)) continue;
    buildings.push({
      type:     MIX[i % MIX.length] ?? 'cottage',
      col, row,
      rotation: angle + Math.PI + (rand() - 0.5) * 0.35,
      seed:     (seed ^ ((i + 1) * 0x9E37)) >>> 0,
    });
  }

  // Spoke roads from center to each building
  _addSpokes(cc, cr, buildings, roads);

  // Ring road connecting buildings in a circuit (village lane)
  const roadSet = new Set<string>(roads.map(r => `${r.col},${r.row}`));
  const bldgs   = buildings.slice(1); // skip focal feature
  for (let i = 0; i < bldgs.length; i++) {
    const a = bldgs[i]!, b = bldgs[(i + 1) % bldgs.length]!;
    for (const [c, r] of _line(a.col, a.row, b.col, b.row)) {
      const key = `${c},${r}`;
      if (!roadSet.has(key)) { roadSet.add(key); roads.push({ col: c, row: r }); }
    }
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

  // Buildings along E-W street — setback 3 tiles, spaced every 3 steps
  // (was 2-tile setback + 2-step spacing which caused crowding)
  for (let step = -7; step <= 7; step += 3) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + step;
      const row = cr + side * 3;
      const btype = MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  // Buildings along N-S cross street — setback 3 tiles, spaced every 3 steps
  for (let step = -5; step <= 5; step += 3) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + side * 3;
      const row = cr + step;
      const btype = MIX[mi]!;
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype)) continue;
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
        rotation: (rand() - 0.5) * 0.4,
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
