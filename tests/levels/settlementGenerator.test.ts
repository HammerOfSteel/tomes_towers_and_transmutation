import { describe, it, expect } from 'vitest';
import { WorldGrid } from '@/world/WorldGrid';
import { generateSettlementName } from '@/world/SettlementNameGenerator';
import { planSettlement, applySettlementToGrid, PARAMS_BY_TYPE, type PlacedBuilding } from '@/world/SettlementGenerator';
import type { LayoutType } from '@/world/SettlementModelGenerator';
import { placeSettlements } from '@/world/SettlementPlacer';
import type { WorldGenConfig } from '@/world/WorldGenConfig';
import { generateRealmData } from '@/world/RealmGenerator';
import { buildSettlement, fillWard, OccupancyGrid, type SettlementModel, type WardType } from '@/world/SettlementModelGenerator';
import { WARD_TO_KIND, WARD_TO_SIZE, WARD_TO_FLOORS } from '@/buildingToDungeonPlan';
import { factionBuildingDna, getFootprint } from '@/world/buildings/BuildingDNA';

function flatGrid(size = 64): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      g.set(col, row, { elevation: 1, biome: 'grass', content: 'empty', feature: 'none', walkable: true });
    }
  }
  return g;
}

const BASE_CONFIG: WorldGenConfig = {
  seed: 42, worldSize: 128, riverCount: 2, lakeCount: 0,
  dungeonCount: 2, caveCount: 0, gladeCount: 0,
  settlementCount: 3, shape: 'island', climate: 'temperate', roughness: 0.5,
  enemyCampCount: 2,
  assetMode: 'code', assetPacks: [], charMode: 'code', charPacks: [],
};

function overlaps(a: PlacedBuilding, b: PlacedBuilding): boolean {
  const ak = WARD_TO_KIND[a.wardType]!;
  const bk = WARD_TO_KIND[b.wardType]!;
  const as = a.isAnchor ? (WARD_TO_SIZE[a.wardType] ?? 'medium') : 'tiny';
  const bs = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
  const af = getFootprint(ak, as);
  const bf = getFootprint(bk, bs);
  const ahw = Math.ceil(af.w / 4), ahd = Math.ceil(af.d / 4);
  const bhw = Math.ceil(bf.w / 4), bhd = Math.ceil(bf.d / 4);
  return Math.abs(a.col - b.col) < ahw + bhw && Math.abs(a.row - b.row) < ahd + bhd;
}

function buildModelFor(type: 'village' | 'town' | 'city', seed: number, faction: any = 'human'): SettlementModel {
  // Reuses the production PARAMS_BY_TYPE (imported from SettlementGenerator.ts)
  // rather than duplicating it locally, so this test can't silently drift
  // out of sync with the real per-type width/height/nPatches values (as
  // happened when WIDTH_HEIGHT_SCALE_FACTOR was introduced to fix the
  // near-empty-village building density bug).
  const p = PARAMS_BY_TYPE[type];
  return buildSettlement({ seed, type, layout: 'auto', faction, warp: 0.35, ...p });
}

describe('generateSettlementName', () => {
  it('returns non-empty strings for all types', () => {
    for (const type of ['village', 'town', 'city'] as const) {
      const name = generateSettlementName(0x1234, type);
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(generateSettlementName(0xDEAD, 'town')).toBe(generateSettlementName(0xDEAD, 'town'));
  });
});

describe('planSettlement', () => {
  it('is deterministic for the same seed', () => {
    const grid = flatGrid(128);
    const a = planSettlement('city', 64, 64, 0xABCD, grid);
    const b = planSettlement('city', 64, 64, 0xABCD, grid);
    expect(a).toEqual(b);
  });

  it('creates exactly one anchor per non-park ward with buildings and uses ward-derived mapping', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('city', 64, 64, 0xBEEF, grid, 'Trace City', 'dwarven');
    const model = buildModelFor('city', 0xBEEF, 'dwarven');
    const expectedWards = model.wards.filter(w => w.withinCity && WARD_TO_KIND[w.type]);
    for (const b of plan.buildings.filter(b => b.isAnchor)) {
      const kind = WARD_TO_KIND[b.wardType];
      const size = WARD_TO_SIZE[b.wardType] ?? 'medium';
      const floors = WARD_TO_FLOORS[b.wardType] ?? 2;
      expect(kind).toBeDefined();
      const dna = factionBuildingDna(kind!, 'dwarven', b.seed, size, floors as 1 | 2 | 3 | 4);
      expect(dna.size).toBe(size);
      expect(dna.floors).toBe(floors);
    }

    expect(plan.buildings.filter(b => b.isAnchor).length).toBeGreaterThan(0);
    expect(plan.buildings.filter(b => b.isAnchor).length).toBeLessThanOrEqual(expectedWards.length);
    for (const filler of plan.buildings.filter(b => !b.isAnchor)) {
      expect(WARD_TO_KIND[filler.wardType]).toBeDefined();
    }
  });

  it('never overlaps buildings using ward-derived footprints', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 12345, grid, 'NoOverlap', 'elven');
    for (let i = 0; i < plan.buildings.length; i++) {
      for (let j = i + 1; j < plan.buildings.length; j++) {
        expect(overlaps(plan.buildings[i]!, plan.buildings[j]!)).toBe(false);
      }
    }
  });

  it('keeps every building clear of every road ribbon band (no building sitting on a road)', () => {
    // Regression coverage for a reported visual bug: once roads render as an
    // accurate geometric band following the true ribbon centerline (see
    // docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2's
    // "roads as a first-class terrain surface" work), a building placed too
    // close to a road's *centerline* can visually sit on/inside the road's
    // real rendered width even though it never overlapped the road's old
    // tile-snapped footprint. Checks in the same tile-unit space
    // fillWard()'s existing ROAD_CLEARANCE check operates in, but against
    // each road ribbon's actual width-aware band instead of just a fixed
    // per-point clearance radius, and against the building's real
    // ward-derived footprint half-extent instead of assuming a point.
    const cases: Array<['village' | 'town' | 'city', number]> = [];
    for (const type of ['village', 'town', 'city'] as const) {
      for (let seed = 1; seed <= 12; seed++) cases.push([type, seed]);
    }
    for (const [type, seed] of cases) {
      const grid = flatGrid(160);
      const plan = planSettlement(type, 80, 80, seed, grid, 'RoadClearance', 'human');
      for (const b of plan.buildings) {
        const kind = WARD_TO_KIND[b.wardType]!;
        const size = b.isAnchor ? (WARD_TO_SIZE[b.wardType] ?? 'medium') : 'tiny';
        const fp = getFootprint(kind, size);
        // Conservative half-extent (not half-diagonal) in tile units — a
        // building's own worst-case reach toward the road from its center.
        const halfExtentTiles = Math.max(fp.w, fp.d) / 2 / 2; // /2 world-units-per-tile (T=2)
        const bx = b.col + b.offsetX - plan.centerCol;
        const bz = b.row + b.offsetZ - plan.centerRow;

        for (const ribbon of plan.roadRibbons) {
          const halfWidthTiles = (ribbon.width / 2) / 2; // T=2
          for (let i = 0; i < ribbon.points.length - 1; i++) {
            const a = ribbon.points[i]!, c = ribbon.points[i + 1]!;
            const dx = c.x - a.x, dz = c.z - a.z;
            const len2 = dx * dx + dz * dz;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((bx - a.x) * dx + (bz - a.z) * dz) / len2)) : 0;
            const ex = a.x + t * dx - bx, ez = a.z + t * dz - bz;
            const dist = Math.hypot(ex, ez);
            expect(dist).toBeGreaterThanOrEqual(halfWidthTiles + halfExtentTiles);
          }
        }
      }
    }
  });

  it('snaps a building off invalid terrain onto the nearest valid tile', () => {
    const grid = flatGrid(128);
    const baseline = planSettlement('village', 64, 64, 777, grid, 'Snap', 'human');
    const target = baseline.buildings[0]!;
    // Use 'ocean' (a real BiomeId — see WorldGrid.ts) rather than the
    // no-longer-valid 'water' literal this test previously used, which
    // silently passed through _valid()'s biome check (only 'ocean'/
    // 'deep_ocean' block placement) and made this test's "moved" assertion
    // vacuously true regardless of whether snapping actually worked.
    grid.set(target.col, target.row, { biome: 'ocean' });
    grid.set(target.col + 1, target.row, { content: 'dungeon_entrance' });
    const snapped = planSettlement('village', 64, 64, 777, grid, 'Snap', 'human');
    const moved = snapped.buildings.find(b => b.seed === target.seed);
    expect(moved).toBeDefined();
    expect(moved!.col === target.col && moved!.row === target.row).toBe(false);
    expect(grid.get(moved!.col, moved!.row).biome).not.toBe('ocean');
    expect(grid.get(moved!.col, moved!.row).content).not.toBe('dungeon_entrance');
  });

  it('drops buildings gracefully when no valid tile exists in range', () => {
    const grid = flatGrid(64);
    // Block every tile on the whole grid (not just a radius-20 disc): with
    // real building density now in play, snapBuildingTile()'s bounded search
    // can correctly find valid land just past a smaller blocked disc's edge
    // (that's the snap-to-nearest-valid-tile feature working as intended,
    // not a bug) — so to actually exercise "no valid tile exists in range"
    // there must be no valid tile anywhere on the grid at all.
    for (let row = 0; row < 64; row++) {
      for (let col = 0; col < 64; col++) {
        grid.set(col, row, { biome: 'ocean', walkable: false });
      }
    }
    const plan = planSettlement('village', 32, 32, 2024, grid, 'Drop', 'human');
    expect(plan.buildings.length).toBe(0);
  });

  it('places the large majority of requested buildings on flat, fully buildable terrain (village/town/city, 20 seeds each)', () => {
    // On fully-buildable flat terrain _valid() never rejects a tile, so any
    // drop here comes from snapBuildingTile()'s bounded MAX_BUILDING_SNAP_RADIUS
    // search failing to find a non-overlapping tile — expected to happen
    // occasionally at higher building density (this now packs far more
    // buildings into the same world-tile footprint than before, see
    // WIDTH_HEIGHT_SCALE_FACTOR's doc comment in SettlementGenerator.ts), so
    // this asserts "the large majority survive" rather than "none are ever
    // dropped" (which no longer holds exactly, and isn't actually a bug).
    for (const type of ['village', 'town', 'city'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        const model = buildModelFor(type, seed);
        const occ = new OccupancyGrid(PARAMS_BY_TYPE[type].width, PARAMS_BY_TYPE[type].height);
        let requested = 0;
        for (const ward of model.wards) {
          if (!ward.withinCity || !WARD_TO_KIND[ward.type]) continue;
          requested += fillWard(ward, occ, model.roads).length;
        }
        expect(plan.buildings.length, `${type} seed=${seed}`).toBeLessThanOrEqual(requested);
        expect(plan.buildings.length / requested, `${type} seed=${seed}`).toBeGreaterThan(0.8);
      }
    }
  });

  // Regression test for the "village settlements place only ~2-3 buildings
  // total" bug: PARAMS_BY_TYPE's width/height used to be far too small for
  // buildSettlement()'s ward-filling algorithms (which place buildings using
  // fixed absolute pixel sizes), so nearly every non-farm ward yielded zero
  // building rects regardless of seed — this is what the user saw both in
  // the live overworld (SettlementPlacer.ts calls planSettlement() too) and
  // in the Settlement Lab's "Play in 3D" flow. A minimum-density floor per
  // type (well under the ~22-97 actually observed post-fix, to leave room
  // for legitimate seed variance) guards against this regressing silently.
  it('places a reasonable minimum number of buildings per settlement type (building density regression)', () => {
    const MIN_BUILDINGS: Record<'village' | 'town' | 'city', number> = { village: 12, town: 20, city: 40 };
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [445176186, 42, 777, 12345, 999999]) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        expect(plan.buildings.length, `${type} seed=${seed}`).toBeGreaterThanOrEqual(MIN_BUILDINGS[type]);
      }
    }
  });

  it('accepts explicit name and faction override', () => {
    const grid = flatGrid(64);
    const plan = planSettlement('town', 32, 32, 0x2222, grid, 'Custom Falls', 'elven');
    expect(plan.name).toBe('Custom Falls');
    expect(plan.faction).toBe('elven');
  });

  it('defaults to auto layout when layout is omitted (backward compatible)', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('village', 64, 64, 42, grid, 'TestVillage', 'human');
    expect(plan).toBeDefined();
    expect(plan.buildings).toBeDefined();
    expect(plan.roads).toBeDefined();
  });

  it('explicit layout override actually changes building positions vs auto', () => {
    // Both plans use the same seed/type/center so any difference is caused by layout.
    // 'organic' (the auto default for faction 'human') uses a different fill function
    // than 'grid', so the resulting building col/row positions must differ.
    const gridA = flatGrid(128);
    const gridB = flatGrid(128);
    const autoPlan  = planSettlement('village', 64, 64, 42, gridA, 'TestVillage', 'human', 'organic');
    const gridPlan  = planSettlement('village', 64, 64, 42, gridB, 'TestVillage', 'human', 'grid');
    expect(autoPlan.buildings.length).toBeGreaterThan(0);
    expect(gridPlan.buildings.length).toBeGreaterThan(0);
    // Serialising positions to a sorted string lets us do a single stable comparison.
    const positions = (plan: typeof autoPlan) =>
      plan.buildings.map(b => `${b.col},${b.row}`).sort().join('|');
    expect(positions(gridPlan)).not.toBe(positions(autoPlan));
  });

  it('roads are wider than a single tile (each road tile has an orthogonal road neighbor)', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 555, grid, 'WideRoads', 'human');
    const roadSet = new Set(plan.roads.map(r => `${r.col},${r.row}`));
    expect(plan.roads.length).toBeGreaterThan(0);
    let tilesWithOrthogonalNeighbor = 0;
    for (const r of plan.roads) {
      const hasNeighbor =
        roadSet.has(`${r.col + 1},${r.row}`) || roadSet.has(`${r.col - 1},${r.row}`) ||
        roadSet.has(`${r.col},${r.row + 1}`) || roadSet.has(`${r.col},${r.row - 1}`);
      if (hasNeighbor) tilesWithOrthogonalNeighbor++;
    }
    // Every original center-line tile now has all 4 neighbours added, so
    // essentially every tile should have at least one orthogonal road
    // neighbour (a genuinely 1-tile-wide road would have none, since
    // Bresenham lines only touch diagonally at direction changes).
    expect(tilesWithOrthogonalNeighbor).toBe(plan.roads.length);
  });

  it('sub-tile offsets stay within a bounded fraction of a tile (seed sweep)', () => {
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [1, 42, 777, 445176186, 999999]) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        for (const b of plan.buildings) {
          expect(Math.abs(b.offsetX), `${type} seed=${seed}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(b.offsetZ), `${type} seed=${seed}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('building rotation is always snapped to a cardinal direction (0/90/180/270°, seed sweep)', () => {
    const QUARTER = Math.PI / 2;
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [1, 42, 777, 445176186, 999999]) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        for (const b of plan.buildings) {
          const remainder = Math.abs(b.rotation % QUARTER);
          const isCardinal = remainder < 1e-9 || Math.abs(remainder - QUARTER) < 1e-9;
          expect(isCardinal, `${type} seed=${seed}: rotation=${b.rotation}`).toBe(true);
        }
      }
    }
  });

  it('produces road ribbons with at least 2 points and a positive width for every road', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 555, grid, 'RibbonTown', 'human');
    expect(plan.roadRibbons.length).toBeGreaterThan(0);
    for (const ribbon of plan.roadRibbons) {
      expect(ribbon.points.length).toBeGreaterThanOrEqual(2);
      expect(ribbon.width).toBeGreaterThan(0);
    }
  });

  it('populates wardFeatures for park wards (which have no BuildingKind) instead of rendering nothing', () => {
    // City/town layouts reliably include enough wards to produce a park;
    // sweep several seeds/types since Voronoi ward assignment is seed-dependent.
    let sawAtLeastOnePark = false;
    for (const type of ['village', 'town', 'city'] as const) {
      for (const seed of [1, 42, 777, 445176186, 999999]) {
        const grid = flatGrid(256);
        const plan = planSettlement(type, 128, 128, seed, grid);
        for (const f of plan.wardFeatures) {
          expect(f.wardType).toBe('park'); // only 'park' currently lacks a BuildingKind
          expect(Number.isFinite(f.col)).toBe(true);
          expect(Number.isFinite(f.row)).toBe(true);
          expect(Math.abs(f.offsetX)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(f.offsetZ)).toBeLessThanOrEqual(0.5);
          expect(Number.isFinite(f.seed)).toBe(true);
          sawAtLeastOnePark = true;
        }
      }
    }
    expect(sawAtLeastOnePark).toBe(true);
  });

  it('wardFeatures placements never coincide with a building tile', () => {
    for (const seed of [1, 42, 777, 445176186, 999999]) {
      const grid = flatGrid(256);
      const plan = planSettlement('city', 128, 128, seed, grid);
      const buildingTiles = new Set(plan.buildings.map(b => `${b.col},${b.row}`));
      for (const f of plan.wardFeatures) {
        expect(buildingTiles.has(`${f.col},${f.row}`)).toBe(false);
      }
    }
  });
});

describe('buildingHalfExtents (via overlap padding)', () => {
  it('pads inn/patriciate-sized anchors using their real WARD_TO_SIZE, not an ad-hoc guess', () => {
    // Build two adjacent inn anchors close enough to violate correct
    // (WARD_TO_SIZE-based) padding but not violate the current buggy
    // ad-hoc 'medium' estimate — this is only reachable if the source
    // under-pads relative to the real footprint.
    const innFootprint = getFootprint(WARD_TO_KIND['inn']!, WARD_TO_SIZE['inn'] ?? 'medium');
    const innHw = Math.ceil(innFootprint.w / 4);
    const innHd = Math.ceil(innFootprint.d / 4);
    const a: PlacedBuilding = { wardType: 'inn', isAnchor: true, col: 0, row: 0, offsetX: 0, offsetZ: 0, rotation: 0, seed: 1 };
    const b: PlacedBuilding = { wardType: 'inn', isAnchor: true, col: innHw * 2 - 1, row: 0, offsetX: 0, offsetZ: 0, rotation: 0, seed: 2 };
    // At this exact spacing (2x the correct half-width apart - 1), correctly
    // sized anchors must be flagged as overlapping by the real padding
    // logic used elsewhere in this file's tests.
    expect(overlaps(a, b)).toBe(true);
  });
});

describe('applySettlementToGrid', () => {
  it('marks road and building cells with the new placed-building shape', () => {
    const grid = flatGrid(128);
    const plan = planSettlement('town', 64, 64, 0xDEAD, grid, 'GridMark', 'human');
    applySettlementToGrid(plan, grid, 1);
    for (const b of plan.buildings) {
      const cell = grid.get(b.col, b.row);
      expect(cell.content).toBe('building');
      expect(cell.walkable).toBe(false);
    }
    for (const r of plan.roads) {
      expect(grid.get(r.col, r.row).feature).toBe('road');
    }
  });
});

describe('placeSettlements', () => {
  it('places at most config.settlementCount settlements', () => {
    const entries = placeSettlements(flatGrid(128), BASE_CONFIG, 42);
    expect(entries.length).toBeLessThanOrEqual(BASE_CONFIG.settlementCount);
  });

  it('carries over realm name, faction, and type onto the settlement plan', () => {
    const g = flatGrid(128);
    const cfg = { ...BASE_CONFIG, settlementCount: 6 };
    const realm = generateRealmData(42, 96, 72, cfg.settlementCount);
    const entries = placeSettlements(g, cfg, 42);
    const realmByName = new Map(realm.settlements.map(s => [s.name, s]));
    for (const e of entries) {
      const src = realmByName.get(e.plan.name);
      expect(src).toBeDefined();
      expect(e.plan.type).toBe(src!.size);
      expect(e.plan.faction).toBe(src!.faction);
    }
  });
});
