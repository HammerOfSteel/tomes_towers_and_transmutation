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
import { buildSettlement, fillWard, OccupancyGrid, type GeneratorParams, type LayoutType, type Road, type SettlementType as ModelSettlementType, type WardType, type Ward } from './SettlementModelGenerator';
import { WARD_TO_KIND, WARD_TO_SIZE } from '@/buildingToDungeonPlan';
import { getFootprint } from './buildings/BuildingDNA';

// ── Public types ───────────────────────────────────────────────────────────────

export type SettlementType = ModelSettlementType;

export interface PlacedBuilding {
  wardType: WardType;
  isAnchor: boolean;
  col: number;
  row: number;
  /**
   * Sub-tile continuous rendering offset, in fractional grid-tile units
   * (e.g. 0.3 means 0.3 of a tile's world width), on top of the tile-
   * quantized (col, row) position. Renderers multiply by their own
   * world-unit tile size: wx = (col - ghw + offsetX) * TILE_UNIT.
   *
   * fillWard() computes buildings with real spacing in continuous pixel
   * space, but (col, row) is a Math.round()-ed integer tile — that rounding
   * collapses the real spacing between nearby buildings once several of
   * them round to the same or adjacent tile. offsetX/offsetZ preserve the
   * fractional remainder the rounding discarded, so the renderer can place
   * buildings much closer to their true computed position instead of dead-
   * center on a coarse grid, without changing (col, row)'s meaning for any
   * existing grid-based logic (collision, walkability, applySettlementToGrid,
   * SettlementPlacer.ts spacing) — those all keep using (col, row) exactly
   * as before. See docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md.
   * Clamped to [-0.5, 0.5] so a building's rendered position can never
   * visually escape its own tile-plus-immediate-neighbor space.
   */
  offsetX: number;
  offsetZ: number;
  rotation: number;
  seed: number;
}

export interface RoadSegment {
  col: number;
  row: number;
}

/**
 * A continuous (non-grid-quantized) road centerline, in fractional grid-tile
 * units relative to the settlement center, for ribbon-mesh rendering.
 * Parallel to RoadSegment[] (which stays tile-quantized, for WorldGrid
 * `feature: 'road'` walkability bookkeeping) — this is purely a rendering-
 * layer addition.
 */
export interface RoadRibbon {
  /** Points along the ribbon's centerline, in fractional grid-tile units
   *  relative to the settlement center (same convention as a building's
   *  offsetX/offsetZ: wx = (point.x) * TILE_UNIT relative to center). */
  points: { x: number; z: number }[];
  /** World-unit ribbon width — wider for roads connecting anchor wards. */
  width: number;
}

export interface SettlementPlan {
  type:       SettlementType;
  name:       string;
  faction:    string;
  centerCol:  number;
  centerRow:  number;
  buildings:  PlacedBuilding[];
  roads:      RoadSegment[];
  roadRibbons: RoadRibbon[];
  /** Rough inhabitant count — drives NPC spawning in OW-6. */
  population: number;
  /** Non-building ward "feature" placements — e.g. a park ward's Sacred
   *  Grove/Slime Pool/Graveyard centerpiece (see WardFeaturePlacement doc
   *  comment and docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §4). */
  wardFeatures: WardFeaturePlacement[];
}

/**
 * A ward that has no BuildingKind mapping (WARD_TO_KIND[type] is falsy —
 * currently only 'park') gets a themed, faction-specific non-building
 * "feature cluster" here instead (a pond+goo-mound cluster for a slime
 * Slime Pool, a tree-ring+standing-stone cluster for an elven Sacred
 * Grove, etc. — see src/world/props/WardFeatureClusters.ts). Uses the same
 * sub-tile offset convention as PlacedBuilding (§3.1): wx = (col - ghw +
 * offsetX) * TILE_UNIT.
 */
export interface WardFeaturePlacement {
  wardType: WardType;
  col:      number;
  row:      number;
  offsetX:  number;
  offsetZ:  number;
  seed:     number;
}

// ── Entry point ───────────────────────────────────────────────────────────────

// buildSettlement()'s ward-filling algorithms (fillWardOrganically/Grid/etc.
// in SettlementModelGenerator.ts) place buildings using fixed *absolute*
// pixel sizes (roughly 14-22px along, 11-16px deep, plus 3-6px street/gap
// clearance — see fillWardOrganically's ALONG/DEPTH/STREET/BLDG_GAP
// constants). The previous PARAMS_BY_TYPE width/height below (320x240 for a
// village) gave each of a village's ~8 Voronoi wards only a sliver of pixel
// area — nowhere near enough room for even one building-sized rect once
// street clearance is subtracted, so almost every non-farm ward yielded
// zero buildings (a village settlement placed only ~2-3 buildings total,
// regardless of seed). WIDTH_HEIGHT_SCALE_FACTOR inflates the generator's
// working canvas so each ward has genuine room to pack multiple buildings,
// while SETTLEMENT_MODEL_SCALE is shrunk by the same factor so the final
// *world-tile* footprint (post grid-mapping below) stays the same as
// before — settlements don't get bigger on the map, they get properly
// filled in. See tests/levels/settlementGenerator.test.ts's "building
// density" tests for the seed sweep that caught this regression.
const WIDTH_HEIGHT_SCALE_FACTOR = 3;
const SETTLEMENT_MODEL_SCALE = 0.095 / WIDTH_HEIGHT_SCALE_FACTOR;
const DIRS8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
const MAX_BUILDING_SNAP_RADIUS = 12;

export const PARAMS_BY_TYPE: Record<SettlementType, Omit<GeneratorParams, 'seed' | 'type' | 'layout' | 'faction' | 'warp'>> = {
  village: { nPatches: 8, nGates: 2, walled: false, hasCitadel: false, hasPlaza: true, width: 320 * WIDTH_HEIGHT_SCALE_FACTOR, height: 240 * WIDTH_HEIGHT_SCALE_FACTOR },
  town: { nPatches: 12, nGates: 3, walled: false, hasCitadel: false, hasPlaza: true, width: 360 * WIDTH_HEIGHT_SCALE_FACTOR, height: 280 * WIDTH_HEIGHT_SCALE_FACTOR },
  city: { nPatches: 18, nGates: 4, walled: true, hasCitadel: true, hasPlaza: true, width: 420 * WIDTH_HEIGHT_SCALE_FACTOR, height: 320 * WIDTH_HEIGHT_SCALE_FACTOR },
};

export function planSettlement(
  type: SettlementType,
  centerCol: number,
  centerRow: number,
  seed: number,
  grid: WorldGrid,
  name?: string,
  faction?: string,
  layout?: LayoutType,
): SettlementPlan {
  const settlementName = name ?? generateSettlementName(seed, type);
  const planFaction = (faction ?? 'human') as SettlementFaction;
  const params = PARAMS_BY_TYPE[type];
  const model = buildSettlement({ seed, type, layout: layout ?? 'auto', faction: planFaction, warp: 0.35, ...params });
  const occ = new OccupancyGrid(params.width, params.height);
  const buildings: PlacedBuilding[] = [];
  const centreX = params.width / 2;
  const centreY = params.height / 2;

  const pendingFeatures: { wardType: WardType; exactCol: number; exactRow: number; seed: number }[] = [];

  for (const ward of model.wards) {
    if (!ward.withinCity) continue;
    if (!WARD_TO_KIND[ward.type]) {
      // No BuildingKind for this ward (currently only 'park') — place a
      // faction-themed non-building feature cluster at the ward's center
      // instead of skipping it entirely. See WardFeaturePlacement's doc
      // comment and plan §4.0a. Deferred to a second pass below (after
      // `buildings` is fully populated) so overlap-checking against
      // buildings from *every* ward works regardless of ward iteration
      // order, not just wards processed earlier in this loop.
      pendingFeatures.push({
        wardType: ward.type,
        exactCol: centerCol + (ward.center.x - centreX) * SETTLEMENT_MODEL_SCALE,
        exactRow: centerRow + (ward.center.y - centreY) * SETTLEMENT_MODEL_SCALE,
        seed: ((seed ^ (Math.round(ward.center.x) * 83492791 + Math.round(ward.center.y) * 47762903)) >>> 0),
      });
      continue;
    }
    const rects = fillWard(ward, occ, model.roads);
    if (rects.length === 0) continue;
    let anchor = rects[0]!;
    let best = Infinity;
    for (const rect of rects) {
      const d = Math.hypot(rect.x - ward.center.x, rect.y - ward.center.y);
      if (d < best) { best = d; anchor = rect; }
    }
    for (const rect of rects) {
      const exactCol = centerCol + (rect.x - centreX) * SETTLEMENT_MODEL_SCALE;
      const exactRow = centerRow + (rect.y - centreY) * SETTLEMENT_MODEL_SCALE;
      const mappedCol = Math.round(exactCol);
      const mappedRow = Math.round(exactRow);
      const snapped = snapBuildingTile(grid, buildings, mappedCol, mappedRow, ward.type, rect === anchor);
      if (!snapped) continue;
      // Sub-tile offset: only meaningful relative to the tile the building
      // actually landed on. If snapBuildingTile() had to move it elsewhere
      // to resolve a collision/invalid-terrain conflict, the original
      // fractional remainder no longer corresponds to anywhere near the new
      // tile, so fall back to 0 (render dead-center on the snapped tile)
      // rather than an offset that could point in a misleading direction.
      const moved = snapped.col !== mappedCol || snapped.row !== mappedRow;
      const offsetX = moved ? 0 : clamp(exactCol - mappedCol, -0.5, 0.5);
      const offsetZ = moved ? 0 : clamp(exactRow - mappedRow, -0.5, 0.5);
      buildings.push({
        wardType: ward.type,
        isAnchor: rect === anchor,
        col: snapped.col,
        row: snapped.row,
        offsetX,
        offsetZ,
        rotation: snapToCardinal(rect.angle),
        seed: ((seed ^ (Math.round(rect.x) * 73856093 + Math.round(rect.y) * 19349663)) >>> 0),
      });
    }
  }

  const wardFeatures: WardFeaturePlacement[] = [];
  for (const pf of pendingFeatures) {
    const mappedCol = Math.round(pf.exactCol);
    const mappedRow = Math.round(pf.exactRow);
    const snapped = snapFeatureTile(grid, buildings, mappedCol, mappedRow);
    if (!snapped) continue;
    const moved = snapped.col !== mappedCol || snapped.row !== mappedRow;
    wardFeatures.push({
      wardType: pf.wardType,
      col: snapped.col,
      row: snapped.row,
      offsetX: moved ? 0 : clamp(pf.exactCol - mappedCol, -0.5, 0.5),
      offsetZ: moved ? 0 : clamp(pf.exactRow - mappedRow, -0.5, 0.5),
      seed: pf.seed,
    });
  }

  const roads = rasterizeRoads(model.roads, centerCol, centerRow, centreX, centreY);
  const roadRibbons = buildRoadRibbons(model.roads, model.wards, centreX, centreY);
  const clearedBuildings = resolveRoadClearanceViolations(buildings, roadRibbons, grid, centerCol, centerRow);
  const rand = mulberry32(seed ^ 0xBADC0DE);
  const population = type === 'city' ? 55 + Math.floor(rand() * 30) : type === 'town' ? 25 + Math.floor(rand() * 26) : 8 + Math.floor(rand() * 9);
  return { type, name: settlementName, faction: planFaction, centerCol, centerRow, buildings: clearedBuildings, roads, roadRibbons, population, wardFeatures };
}

/**
 * Safety-net pass: fillWard()'s ward-filling strategies (SettlementModel-
 * Generator.ts) place buildings using an abstract model-space placement
 * grid that has no notion of a building's real, eventually-rendered
 * footprint (getFootprint(), resolved only here from WARD_TO_KIND/
 * WARD_TO_SIZE) or a road's real rendered width (RoadRibbon.width, also
 * only resolved here in buildRoadRibbons()) — so fillWard()'s internal
 * ROAD_CLEARANCE check (a flat, small distance from a building's *center*
 * to a road's centerline) can let a large building (e.g. a patriciate
 * ward's 7x5 'villa', a church ward's 4x8 'chapel') visually render on top
 * of a nearby road. This pass runs after both buildings and roadRibbons
 * have real data and, for any building whose real footprint still
 * intrudes into a road ribbon's real band, searches for the nearest tile
 * that is simultaneously valid terrain, clear of every other building,
 * *and* clear of every road ribbon (findRoadClearSpot() — a version of
 * snapBuildingTile()'s spiral search with road-clearance folded in as a
 * first-class constraint, since resolving against terrain/buildings alone
 * can walk a building right back onto a road it doesn't know exists). If
 * no such tile exists nearby, the building is dropped — mirroring the
 * existing "gracefully drops buildings when no valid tile exists"
 * tolerance already used elsewhere in this file. See "keeps every
 * building clear of every road ribbon band" in
 * tests/levels/settlementGenerator.test.ts.
 */
function resolveRoadClearanceViolations(
  buildings: PlacedBuilding[],
  roadRibbons: RoadRibbon[],
  grid: WorldGrid,
  centerCol: number,
  centerRow: number,
): PlacedBuilding[] {
  if (roadRibbons.length === 0) return buildings;
  const resolved: PlacedBuilding[] = [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]!;
    const kind = WARD_TO_KIND[b.wardType];
    if (!kind) { resolved.push(b); continue; }
    const size = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
    const fp = getFootprint(kind, size);
    const halfExtentTiles = Math.max(fp.w, fp.d) / 4; // world-units -> tile units (T=2), then half

    const bx = b.col - centerCol + b.offsetX;
    const bz = b.row - centerRow + b.offsetZ;
    const push = worstRoadPush(bx, bz, halfExtentTiles, roadRibbons);
    if (!push) { resolved.push(b); continue; }

    // The push direction gives a good starting candidate for the search
    // below (usually enough on its own), but correctness comes entirely
    // from findRoadClearSpot()'s explicit per-candidate road-clearance
    // check, not from this single push being exactly right.
    const startCol = Math.round(centerCol + bx + push.x * push.deficit);
    const startRow = Math.round(centerRow + bz + push.z * push.deficit);
    const otherBuildings = buildings.filter((_, idx) => idx !== i);
    const snapped = findRoadClearSpot(
      grid, otherBuildings, startCol, startRow, b.wardType, b.isAnchor,
      halfExtentTiles, roadRibbons, centerCol, centerRow,
    );
    if (!snapped) continue; // drop — no valid clear-of-road spot nearby
    resolved.push({ ...b, col: snapped.col, row: snapped.row, offsetX: 0, offsetZ: 0 });
  }
  return resolved;
}

/** Headroom (in tile units) added above a ribbon's own half-width when
 *  checking/resolving road-clearance violations, so a nudged building's
 *  edge doesn't land flush against the road surface. */
const ROAD_BAND_MARGIN_TILES = 0.1;

/**
 * Largest single road-clearance violation for a building centered at
 * (bx, bz) — coordinates in fractional tile units relative to the
 * settlement center, same frame as RoadRibbon.points — against every
 * segment of every ribbon. Returns null when already clear of all of
 * them. `x`/`z` is the unit push direction away from that worst
 * violation's nearest ribbon point (or the segment's normal, if the
 * building sits exactly on the centerline); `deficit` is how far to move
 * along it to just clear that one segment (a starting point for
 * findRoadClearSpot()'s search, not a guaranteed final answer, since
 * clearing one segment doesn't guarantee clearing every other ribbon).
 */
function worstRoadPush(
  bx: number, bz: number, halfExtentTiles: number, roadRibbons: RoadRibbon[],
): { x: number; z: number; deficit: number } | null {
  let worstDeficit = 0, pushX = 0, pushZ = 0;
  for (const ribbon of roadRibbons) {
    const halfWidthTiles = ribbon.width / 4;
    const need = halfWidthTiles + halfExtentTiles + ROAD_BAND_MARGIN_TILES;
    for (let p = 0; p < ribbon.points.length - 1; p++) {
      const a = ribbon.points[p]!, c = ribbon.points[p + 1]!;
      const dx = c.x - a.x, dz = c.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((bx - a.x) * dx + (bz - a.z) * dz) / len2)) : 0;
      const nx = a.x + t * dx, nz = a.z + t * dz;
      const ex = bx - nx, ez = bz - nz;
      const dist = Math.hypot(ex, ez);
      if (dist >= need) continue;
      const deficit = need - dist;
      if (deficit <= worstDeficit) continue;
      worstDeficit = deficit;
      if (dist < 1e-6) {
        const segLen = Math.hypot(dx, dz) || 1;
        pushX = -dz / segLen; pushZ = dx / segLen;
      } else {
        pushX = ex / dist; pushZ = ez / dist;
      }
    }
  }
  return worstDeficit > 0 ? { x: pushX, z: pushZ, deficit: worstDeficit } : null;
}

/** True when a building of the given half-extent centered at (bx, bz) —
 *  fractional tile units relative to the settlement center — clears every
 *  segment of every road ribbon by at least ROAD_BAND_MARGIN_TILES. */
function isClearOfAllRoads(bx: number, bz: number, halfExtentTiles: number, roadRibbons: RoadRibbon[]): boolean {
  for (const ribbon of roadRibbons) {
    const halfWidthTiles = ribbon.width / 4;
    const need = halfWidthTiles + halfExtentTiles + ROAD_BAND_MARGIN_TILES;
    for (let p = 0; p < ribbon.points.length - 1; p++) {
      const a = ribbon.points[p]!, c = ribbon.points[p + 1]!;
      const dx = c.x - a.x, dz = c.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((bx - a.x) * dx + (bz - a.z) * dz) / len2)) : 0;
      const nx = a.x + t * dx, nz = a.z + t * dz;
      if (Math.hypot(bx - nx, bz - nz) < need) return false;
    }
  }
  return true;
}

/**
 * Like snapBuildingTile() but with road-clearance folded in as a third,
 * equally first-class constraint alongside valid terrain and no building
 * overlap — a spiral search that only accepts a tile satisfying all three
 * simultaneously, so it can never "fix" an overlap by walking the building
 * back onto a road (which plain snapBuildingTile()'s search has no way to
 * know about).
 */
function findRoadClearSpot(
  grid: WorldGrid,
  placed: PlacedBuilding[],
  startCol: number,
  startRow: number,
  wardType: WardType,
  isAnchor: boolean,
  halfExtentTiles: number,
  roadRibbons: RoadRibbon[],
  centerCol: number,
  centerRow: number,
): { col: number; row: number } | null {
  const ok = (col: number, row: number) =>
    _valid(grid, col, row) &&
    _noOverlap(placed, col, row, wardType, isAnchor) &&
    isClearOfAllRoads(col - centerCol, row - centerRow, halfExtentTiles, roadRibbons);
  if (ok(startCol, startRow)) return { col: startCol, row: startRow };
  for (let r = 1; r <= MAX_BUILDING_SNAP_RADIUS; r++) {
    for (const [dr, dc] of DIRS8) {
      const nc = startCol + dc * r;
      const nr = startRow + dr * r;
      if (ok(nc, nr)) return { col: nc, row: nr };
    }
  }
  return null;
}

/** Round an angle (radians) to the nearest cardinal direction (0/90/180/270°). */
function snapToCardinal(radians: number): number {
  const QUARTER = Math.PI / 2;
  return Math.round(radians / QUARTER) * QUARTER;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Ward types considered settlement anchors — matches
 *  SettlementRoadMesh.ts's MAIN_ROAD_KINDS convention: a road ending at one
 *  of these wards renders as a wider "main street" instead of a narrow
 *  "alley". */
const MAIN_ROAD_WARD_TYPES: ReadonlySet<WardType> = new Set<WardType>([
  'market', 'church', 'inn', 'gateward',
]);
const MAIN_ROAD_WIDTH = 2;
const ALLEY_WIDTH = 1;

/**
 * Continuous (non-grid-quantized) road ribbons for visual rendering — a
 * parallel, un-rounded counterpart to rasterizeRoads(). See RoadRibbon's
 * doc comment: points are in fractional grid-tile units relative to the
 * settlement center, for the renderer to build a quad-strip ribbon mesh
 * from directly (no per-tile flat quads, no rounding-induced gaps).
 *
 * Width is picked per-road by checking which ward (if any) the road's far
 * endpoint terminates nearest to — Road itself carries no ward reference,
 * so this re-derives it geometrically rather than threading a new field
 * through buildSettlement()'s output.
 */
function buildRoadRibbons(roads: Road[], wards: Ward[], cx: number, cy: number): RoadRibbon[] {
  const out: RoadRibbon[] = [];
  for (const road of roads) {
    if (road.points.length < 2) continue;
    const points = road.points.map(p => ({
      x: (p.x - cx) * SETTLEMENT_MODEL_SCALE,
      z: (p.y - cy) * SETTLEMENT_MODEL_SCALE,
    }));
    const endpoint = road.points[road.points.length - 1]!;
    let nearestWard: Ward | null = null;
    let best = Infinity;
    for (const ward of wards) {
      if (!ward.withinCity) continue;
      const d = Math.hypot(ward.center.x - endpoint.x, ward.center.y - endpoint.y);
      if (d < best) { best = d; nearestWard = ward; }
    }
    const isMain = !!nearestWard && MAIN_ROAD_WARD_TYPES.has(nearestWard.type);
    out.push({ points, width: isMain ? MAIN_ROAD_WIDTH : ALLEY_WIDTH });
  }
  return out;
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
      if (cell.biome !== 'deep_ocean' && cell.biome !== 'ocean' && cell.feature !== 'river') {
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
      if (cell.biome !== 'deep_ocean' && cell.biome !== 'ocean' && cell.feature !== 'river') {
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
  if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
  if (cell.feature === 'river') return false;
  if (cell.content === 'dungeon_entrance') return false;
  if (cell.elevation < 1) return false;
  return true;
}

function buildingHalfExtents(b: Pick<PlacedBuilding, 'wardType' | 'isAnchor'>): { hw: number; hd: number } {
  const kind = WARD_TO_KIND[b.wardType]!;
  const resolvedSize = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
  const fp = getFootprint(kind, resolvedSize);
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

/** Ward feature clusters (park-ward Sacred Grove/Slime Pool/etc., see
 *  WardFeatureClusters.ts) span roughly 3 world units of radius — about
 *  1.5 tiles at TILE_UNIT=2 — so a fixed 2-tile clearance from any
 *  building keeps the cluster from visually overlapping a house. */
const FEATURE_CLEARANCE_TILES = 2;

function _featureNoOverlap(placed: PlacedBuilding[], col: number, row: number): boolean {
  for (const b of placed) {
    if (Math.abs(col - b.col) < FEATURE_CLEARANCE_TILES && Math.abs(row - b.row) < FEATURE_CLEARANCE_TILES) return false;
  }
  return true;
}

function snapFeatureTile(grid: WorldGrid, placed: PlacedBuilding[], col: number, row: number): { col: number; row: number } | null {
  if (_valid(grid, col, row) && _featureNoOverlap(placed, col, row)) return { col, row };
  for (let r = 1; r <= MAX_BUILDING_SNAP_RADIUS; r++) {
    for (const [dr, dc] of DIRS8) {
      const nc = col + dc * r;
      const nr = row + dr * r;
      if (_valid(grid, nc, nr) && _featureNoOverlap(placed, nc, nr)) return { col: nc, row: nr };
    }
  }
  return null;
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
  const addTile = (col: number, row: number) => out.set(`${col},${row}`, { col, row });
  // Bresenham line between two grid points — fills in every tile the segment crosses so
  // roads render as continuous connected paths instead of scattered dots when the source
  // Chaikin-smoothed points are sparser than the destination grid resolution.
  const bresenham = (c0: number, r0: number, c1: number, r1: number) => {
    let x0 = c0, y0 = r0;
    const dx = Math.abs(c1 - c0), sx = c0 < c1 ? 1 : -1;
    const dy = -Math.abs(r1 - r0), sy = r0 < r1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      addTile(x0, y0);
      if (x0 === c1 && y0 === r1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const toGrid = (p: { x: number; y: number }) => ({
    col: centerCol + Math.round((p.x - cx) * SETTLEMENT_MODEL_SCALE),
    row: centerRow + Math.round((p.y - cy) * SETTLEMENT_MODEL_SCALE),
  });
  for (const road of roads) {
    if (road.points.length === 0) continue;
    let prev = toGrid(road.points[0]!);
    addTile(prev.col, prev.row);
    for (let i = 1; i < road.points.length; i++) {
      const cur = toGrid(road.points[i]!);
      bresenham(prev.col, prev.row, cur.col, cur.row);
      prev = cur;
    }
  }
  // Widen the rasterized center-line into a real street: dilate every
  // center-line tile by its 4 orthogonal neighbours. model.roads[] are all
  // primary gate->hub arterials (no separate alley network exists in the
  // generator), so a uniform width for every road is the honest fix here.
  const centerLineTiles = [...out.values()];
  for (const { col, row } of centerLineTiles) {
    addTile(col + 1, row);
    addTile(col - 1, row);
    addTile(col, row + 1);
    addTile(col, row - 1);
  }
  return [...out.values()];
}

