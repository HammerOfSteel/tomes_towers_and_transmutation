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
  faction:    string;
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
  name?:     string,
  faction?:  string,
): SettlementPlan {
  const settlementName = name ?? generateSettlementName(seed, type);
  let plan: SettlementPlan;
  switch (type) {
    case 'village': plan = _planVillage(centerCol, centerRow, seed, grid, settlementName); break;
    case 'town':    plan = _planTown(centerCol, centerRow, seed, grid, settlementName); break;
    case 'city':    plan = _planCity(centerCol, centerRow, seed, grid, settlementName); break;
  }
  if (faction !== undefined) plan.faction = faction;
  return plan;
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
    const [fw, fd] = BUILDING_SPECS[focalType].footprint;
    const hw = Math.ceil(fw / 2);
    const hd = Math.ceil(fd / 2);
    let hitsRoad = false;
    for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
      for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
        if (roadSet.has(`${cc + dc},${cr + dr}`)) hitsRoad = true;
      }
    }
    if (!hitsRoad) {
      buildings.push({ type: focalType, col: cc, row: cr, rotation: 0, seed: (seed ^ 0x11) >>> 0 });
    }
  }

  // ── Building placement: 8 corner/arm plots, offsets sized to the largest
  //   building in the mix so no plot can overlap the ±4-tile cross paths
  //   regardless of how big the real BuildingDNA footprint turns out to be.
  //   Each entry: [col_offset, row_offset, rotation_y]
  const MIX: BuildingType[] = [
    'smithy', 'cottage', 'cottage', 'market_stall',
    'cottage', 'cottage', 'cottage', 'cottage',
  ];
  let maxHalf = 0;
  for (const t of MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const CLEARANCE = 2;                          // gap between road edge and building edge
  const cornerOff = VL + CLEARANCE + maxHalf;
  const midOff    = VL + CLEARANCE + maxHalf + 2; // midpoints sit slightly further out than corners
  // [dc, dr, rot]  rot=0 → door +Z(S)  rot=π → door −Z(N)
  //                rot=π/2 → door +X(E)  rot=−π/2 → door −X(W)
  const PLOTS: [number, number, number][] = [
    [-cornerOff, -cornerOff,  0],               // NW corner  — faces south
    [ cornerOff, -cornerOff,  0],               // NE corner  — faces south
    [-cornerOff,  cornerOff,  Math.PI],         // SW corner  — faces north
    [ cornerOff,  cornerOff,  Math.PI],         // SE corner  — faces north
    [-midOff,  0,  Math.PI / 2],                // W midpoint — faces east
    [ midOff,  0, -Math.PI / 2],                // E midpoint — faces west
    [ 0, -midOff,  0],                          // N midpoint — faces south (door toward centre)
    [ 0,  midOff,  Math.PI],                    // S midpoint — faces north (door toward centre)
  ];
  let mi = 0;
  for (let pi = 0; pi < PLOTS.length && mi < MIX.length; pi++) {
    const [dc, dr, rot] = PLOTS[pi]!;
    const col   = cc + dc;
    const row   = cr + dr;
    const btype = MIX[mi]!;
    if (roadSet.has(`${col},${row}`))                            continue;  // never on road
    if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 1)) continue;
    buildings.push({
      type:     btype, col, row,
      rotation: rot,
      seed:     (seed ^ (mi * 0x9E37)) >>> 0,
    });
    mi++;
  }

  const roads: RoadSegment[] = [];
  for (const key of roadSet) {
    const [c, r] = key.split(',').map(Number);
    roads.push({ col: c!, row: r! });
  }

  return { type: 'village', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
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

  const MIX: BuildingType[] = [
    'tavern', 'inn', 'smithy', 'market_stall', 'market_stall',
    'inn', 'cottage', 'cottage', 'cottage', 'cottage',
    'cottage', 'well', 'guard_tower', 'cottage',
    'cottage', 'market_stall', 'cottage',
  ];
  // Scale the original hand-tuned 4-tile step/setback so real (possibly much
  // larger) BuildingDNA footprints never overlap, while keeping the same
  // slot COUNT as the original hand-authored layout.
  let maxHalf = 0;
  for (const t of MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const scale   = Math.max(1, maxHalf / 2);
  const step    = Math.round(4 * scale);
  const setback = Math.round(4 * scale);
  const SL      = Math.round(8 * scale);

  // Main E-W street (3 tiles wide = 6 WU — feels like a real market high street)
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
    const [fw, fd] = BUILDING_SPECS['market_cross'].footprint;
    const hw = Math.ceil(fw / 2);
    const hd = Math.ceil(fd / 2);
    let hitsRoad = false;
    for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
      for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
        if (roadSet.has(`${cc + dc},${cr + dr}`)) hitsRoad = true;
      }
    }
    if (!hitsRoad) {
      buildings.push({ type: 'market_cross', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
    }
  }

  let mi = 0;

  // Buildings along E-W street — setback `setback` tiles from road centre, step every `step` tiles
  for (let n = -2; n <= 2; n++) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + n * step;
      const row = cr + side * setback;
      const btype = MIX[mi]!;
      const [fw, fd] = BUILDING_SPECS[btype].footprint;
      const hw = Math.ceil(fw / 2);
      const hd = Math.ceil(fd / 2);
      let hitsRoad = false;
      for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
        for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
          if (roadSet.has(`${col + dc},${row + dr}`)) hitsRoad = true;
        }
      }
      if (hitsRoad)                                                    continue;  // skip if overlaps road
      if (!_valid(grid, col, row) || !_noOverlap(buildings, col, row, btype, 2)) continue;
      buildings.push({
        type:     MIX[mi++],
        col, row,
        rotation: side < 0 ? 0 : Math.PI,
        seed:     (seed ^ (mi * 0x7A3B)) >>> 0,
      });
    }
  }

  // Buildings along N-S cross street — same setback, matching the original
  // 4-slot spacing pattern (offsets -6,-2,2,6 tiles when step was fixed at 4)
  const crossMultipliers = [-1.5, -0.5, 0.5, 1.5];
  for (const mult of crossMultipliers) {
    for (const side of [-1, 1]) {
      if (mi >= MIX.length) break;
      const col = cc + side * setback;
      const row = cr + Math.round(mult * step);
      const btype = MIX[mi]!;
      const [fw, fd] = BUILDING_SPECS[btype].footprint;
      const hw = Math.ceil(fw / 2);
      const hd = Math.ceil(fd / 2);
      let hitsRoad = false;
      for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
        for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
          if (roadSet.has(`${col + dc},${row + dr}`)) hitsRoad = true;
        }
      }
      if (hitsRoad)                                                    continue;  // skip if overlaps road
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

  return { type: 'town', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
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

  const QUADRANT_MIX: BuildingType[] = [
    'inn', 'tavern', 'smithy', 'market_stall', 'guard_tower',
    'market_stall', 'inn', 'well', 'cottage', 'cottage', 'cottage',
    'inn', 'smithy', 'market_stall', 'cottage', 'guard_tower',
    'cottage', 'cottage', 'market_stall', 'well', 'cottage',
  ];
  // Uniform grid step/clearance sized to the largest building in the mix —
  // simple and always overlap-free, if a little more generous than a tight
  // per-building pack.
  let maxHalf = 0;
  for (const t of QUADRANT_MIX) {
    const [fw, fd] = BUILDING_SPECS[t].footprint;
    maxHalf = Math.max(maxHalf, Math.ceil(fw / 2), Math.ceil(fd / 2));
  }
  const GAP        = 1;
  const gridStep   = maxHalf * 2 + GAP;
  const baseOffset = Math.max(6, maxHalf + 3);
  const SL         = baseOffset + 2 * gridStep + 4; // road extent scales with the quadrant grid

  // Grand boulevard grid — 3-tile-wide avenues creating distinct city blocks.
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
    const [fw, fd] = BUILDING_SPECS['city_hall'].footprint;
    const hw = Math.ceil(fw / 2);
    const hd = Math.ceil(fd / 2);
    let hitsRoad = false;
    for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
      for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
        if (roadSet.has(`${cc + dc},${cr + dr}`)) hitsRoad = true;
      }
    }
    if (!hitsRoad) {
      buildings.push({ type: 'city_hall', col: cc, row: cr, rotation: 0, seed: (seed ^ 0x01) >>> 0 });
    }
  }
  // Temple north of city hall with proper separation
  const templeOff = baseOffset + gridStep;
  if (_valid(grid, cc, cr - templeOff)) {
    const [fw, fd] = BUILDING_SPECS['temple'].footprint;
    const hw = Math.ceil(fw / 2);
    const hd = Math.ceil(fd / 2);
    let hitsRoad = false;
    for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
      for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
        if (roadSet.has(`${cc + dc},${cr - templeOff + dr}`)) hitsRoad = true;
      }
    }
    if (!hitsRoad) {
      buildings.push({ type: 'temple', col: cc, row: cr - templeOff, rotation: 0, seed: (seed ^ 0x02) >>> 0 });
    }
  }

  let mi = 0;

  // 4 quadrants: uniform grid spaced `gridStep` tiles apart, starting `baseOffset` tiles from centre
  for (const [qsc, qsr] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    for (let bi = 0; bi < 5; bi++) {
      if (mi >= QUADRANT_MIX.length) break;
      const col = cc + qsc * (baseOffset + (bi % 3) * gridStep);
      const row = cr + qsr * (baseOffset + Math.floor(bi / 3) * gridStep);
      const btype = QUADRANT_MIX[mi]!;
      // Check full AABB footprint for road overlap
      const [fw, fd] = BUILDING_SPECS[btype].footprint;
      const hw = Math.ceil(fw / 2);
      const hd = Math.ceil(fd / 2);
      let hitsRoad = false;
      for (let dc = -hw; dc <= hw && !hitsRoad; dc++) {
        for (let dr = -hd; dr <= hd && !hitsRoad; dr++) {
          if (roadSet.has(`${col + dc},${row + dr}`)) hitsRoad = true;
        }
      }
      if (hitsRoad)                                                    { mi++; continue; }  // skip if overlaps road
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

  return { type: 'city', name, faction: 'human', centerCol: cc, centerRow: cr, buildings, roads,
           population: 80 + Math.floor(rand() * 71) };
}
