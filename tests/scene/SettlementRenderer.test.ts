import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  renderSettlementPlan,
  type SettlementRenderContext,
} from '../../src/scene/SettlementRenderer';
import { planSettlement } from '../../src/world/SettlementGenerator';
import { WorldGrid } from '../../src/world/WorldGrid';
import type { SettlementPlan, PlacedBuilding, RoadSegment } from '../../src/world/SettlementGenerator';
import { LEVEL_HEIGHT } from '../../src/world/WaterDepthConfig';
import * as BuildingTypeMap from '../../src/world/buildings/BuildingTypeMap';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** 51×51 flat world grid (all cells at elevation 1 so _valid() passes). */
function makeGrid(size = 51): WorldGrid {
  const wg = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      wg.set(col, row, { elevation: 1 });
    }
  }
  return wg;
}

/** Build a minimal context with jest-fn mocks. */
function makeCtx(): SettlementRenderContext {
  return {
    registerBuildingCollider: vi.fn(),
    mapFaction: vi.fn(() => 'human_town' as const),
  };
}

/** Centre of the 51×51 grid. */
const CENTRE = 25;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('renderSettlementPlan', () => {
  it('returns buildingGroups / buildingRecords for each valid building', () => {
    const wg = makeGrid();
    const plan = planSettlement('village', CENTRE, CENTRE, 7, wg);
    const ctx = makeCtx();

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    // At least one building must have been rendered.
    expect(result.buildingGroups.length).toBeGreaterThan(0);
    expect(result.buildingRecords.length).toBe(result.buildingGroups.length);
  });

  it('sets correct world-space positions on building groups', () => {
    const wg = makeGrid();
    const plan = planSettlement('village', CENTRE, CENTRE, 7, wg);
    const ctx = makeCtx();
    const GHW = CENTRE, GHH = CENTRE;
    const T = 2;

    const result = renderSettlementPlan(plan, wg, GHW, GHH, ctx);

    expect(result.buildingRecords.length).toBeGreaterThan(0);
    const rec = result.buildingRecords[0]!;

    // Find the original PlacedBuilding that corresponds to this record.
    const orig = plan.buildings.find(b => b.col === rec.col && b.row === rec.row);
    expect(orig).toBeDefined();

    const expectedX = (orig!.col - GHW + orig!.offsetX) * T;
    const expectedZ = (orig!.row - GHH + orig!.offsetZ) * T;
    const expectedY = wg.get(orig!.col, orig!.row).elevation * LEVEL_HEIGHT;
    expect(rec.pos.x).toBeCloseTo(expectedX);
    expect(rec.pos.y).toBeCloseTo(expectedY);
    expect(rec.pos.z).toBeCloseTo(expectedZ);
    expect(rec.rotationY).toBe(orig!.rotation);
  });

  it('registers a collider for each successfully-created building', () => {
    const wg = makeGrid();
    const plan = planSettlement('village', CENTRE, CENTRE, 7, wg);
    const ctx = makeCtx();

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    expect(ctx.registerBuildingCollider).toHaveBeenCalledTimes(result.buildingGroups.length);
  });

  it('skips buildings for which createSettlementBuildingDna returns falsy', () => {
    const wg = makeGrid();
    const ctx = makeCtx();
    // Explicitly force a null DNA result rather than relying on an implicit
    // gap in the ward→DNA mapping table (which could change independently).
    const dnaSpy = vi
      .spyOn(BuildingTypeMap, 'createSettlementBuildingDna')
      .mockReturnValue(null);
    const buildings: PlacedBuilding[] = [
      { wardType: 'market', isAnchor: false, col: CENTRE, row: CENTRE, offsetX: 0, offsetZ: 0, rotation: 0, seed: 1 },
    ];
    const minimalPlan: SettlementPlan = {
      type: 'village',
      name: 'Test',
      faction: 'human',
      centerCol: CENTRE,
      centerRow: CENTRE,
      buildings,
      roads: [],
      roadRibbons: [], wardFeatures: [],
      population: 0,
    };

    const result = renderSettlementPlan(minimalPlan, wg, CENTRE, CENTRE, ctx);

    // A falsy DNA result → no group produced, no collider registered.
    expect(result.buildingGroups.length).toBe(0);
    expect(ctx.registerBuildingCollider).not.toHaveBeenCalled();

    dnaSpy.mockRestore();
  });

  it('produces deduped roadTiles within a single settlement', () => {
    const wg = makeGrid();
    // Construct a plan with duplicate road entries.
    const roads: RoadSegment[] = [
      { col: 24, row: 24 },
      { col: 24, row: 24 }, // duplicate
      { col: 25, row: 25 },
      { col: 26, row: 26 },
      { col: 26, row: 26 }, // duplicate
    ];
    const plan: SettlementPlan = {
      type: 'village',
      name: 'Test',
      faction: 'human',
      centerCol: CENTRE,
      centerRow: CENTRE,
      buildings: [],
      roads,
      roadRibbons: [], wardFeatures: [],
      population: 0,
    };
    const ctx = makeCtx();

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    expect(result.roadTiles.length).toBe(3); // 5 entries → 3 unique
  });

  it('places lamp posts consistent with selectLampRoadTiles stride-4 behavior', () => {
    const wg = makeGrid();
    // Build a road list of length 10 — stride 4 gives indices 0,4,8 → 3 lamps.
    const roads: RoadSegment[] = Array.from({ length: 10 }, (_, i) => ({
      col: CENTRE + i,
      row: CENTRE,
    }));
    const plan: SettlementPlan = {
      type: 'village',
      name: 'Test',
      faction: 'human',
      centerCol: CENTRE,
      centerRow: CENTRE,
      buildings: [],
      roads,
      roadRibbons: [], wardFeatures: [],
      population: 0,
    };
    const ctx = makeCtx();

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    expect(result.lampGroups.length).toBe(3);
    expect(result.lampLights.length).toBe(3);
    // Each lamp group must contain at least one child (the PointLight).
    result.lampGroups.forEach(g => expect(g.children.length).toBeGreaterThan(0));
    // The parallel PointLight array entries must be PointLight instances.
    result.lampLights.forEach(l => expect(l).toBeInstanceOf(THREE.PointLight));
  });

  it('buildingRecords correctly marks anchor buildings', () => {
    const wg = makeGrid();
    const plan = planSettlement('village', CENTRE, CENTRE, 7, wg);
    const ctx = makeCtx();

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    // Every isAnchor in the record must match the original plan building.
    for (const rec of result.buildingRecords) {
      const orig = plan.buildings.find(b => b.col === rec.col && b.row === rec.row);
      expect(orig).toBeDefined();
      expect(rec.isAnchor).toBe(orig!.isAnchor);
    }
  });

  it('ctx.forceBuildingKind forces every building to that kind, regardless of ward mapping', () => {
    const wg = makeGrid();
    // A real city settlement has a mix of ward types (market/church/inn/
    // smithy/merchant/patriciate/slum/gateward/farm/...), each normally
    // mapping to a different BuildingKind via WARD_TO_KIND — a strong
    // check that the override really applies to every one of them, not
    // just a single ward type.
    const plan = planSettlement('city', CENTRE, CENTRE, 7, wg);
    const ctx: SettlementRenderContext = { ...makeCtx(), forceBuildingKind: 'watchtower' };

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    expect(result.buildingRecords.length).toBeGreaterThan(0);
    for (const rec of result.buildingRecords) {
      expect(rec.dna.buildingKind).toBe('watchtower');
    }
  });

  it('omitting forceBuildingKind preserves the normal per-ward BuildingKind mix', () => {
    const wg = makeGrid();
    const plan = planSettlement('city', CENTRE, CENTRE, 7, wg);
    const ctx = makeCtx(); // no forceBuildingKind

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    const kinds = new Set(result.buildingRecords.map(r => r.dna.buildingKind));
    // A city-sized settlement should produce more than one distinct kind
    // when no override is applied (the whole point of the regression
    // check above) — this seed/type is known to place a market, church,
    // merchant, etc. ward.
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('ctx.forceBuildingKind as a function is called per-building (building, index) and can selectively override only some buildings, leaving the rest on their natural ward-based kind', () => {
    const wg = makeGrid();
    const plan = planSettlement('city', CENTRE, CENTRE, 7, wg);
    // Force only the FIRST anchor building to 'watchtower'; every other
    // building returns undefined, falling through to WARD_TO_KIND — lets
    // a caller guarantee one showcase kind appears (e.g. a kind with no
    // WARD_TO_KIND entry at all, like 'watchtower') while still exercising
    // the settlement's normal variety for everything else.
    let anchorForced = false;
    const forceBuildingKind = vi.fn((b: PlacedBuilding, _index: number) => {
      if (b.isAnchor && !anchorForced) {
        anchorForced = true;
        return 'watchtower' as const;
      }
      return undefined;
    });
    const ctx: SettlementRenderContext = { ...makeCtx(), forceBuildingKind };

    const result = renderSettlementPlan(plan, wg, CENTRE, CENTRE, ctx);

    expect(forceBuildingKind).toHaveBeenCalled();
    // Every call must receive the exact PlacedBuilding + its own index.
    const [firstCallBuilding, firstCallIndex] = forceBuildingKind.mock.calls[0]!;
    expect(firstCallBuilding).toBe(plan.buildings[0]);
    expect(firstCallIndex).toBe(0);

    const kinds = new Set(result.buildingRecords.map(r => r.dna.buildingKind));
    expect(kinds.has('watchtower')).toBe(true);
    // Still more than one distinct kind overall (the un-overridden
    // buildings kept their natural ward-based variety).
    expect(kinds.size).toBeGreaterThan(1);
    // Exactly one building was actually forced to watchtower.
    const watchtowerCount = result.buildingRecords.filter(r => r.dna.buildingKind === 'watchtower').length;
    expect(watchtowerCount).toBe(1);
  });
});
