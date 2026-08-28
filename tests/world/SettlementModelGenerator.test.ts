import { describe, it, expect } from 'vitest';
import { fillWardRadial, fillWardClustered, OccupancyGrid } from '@/world/SettlementModelGenerator';
import type { Vec2 } from '@/overworld-studio';
import { buildWorldData } from '@/world/WorldGenerator';
import type { WorldGenConfig } from '@/world/WorldGenConfig';

/**
 * Regression coverage for the "settlements generate with zero buildings" bug.
 *
 * Root cause: fillWardRadial()'s ring loop and fillWardClustered()'s randomized
 * cluster search both had no guaranteed minimum output. For the small ward
 * polygons produced once a settlement is subdivided into many wards (the
 * common case at live worldgen scale), the radial ring condition
 * (ring*(DEPTH+GAP) < centInset-STREET-DEPTH) was false even at ring=0, and
 * the clustered search's 80 random attempts could all legitimately fail —
 * silently producing zero buildings for every ward using that layout, and
 * therefore for the whole settlement whenever its faction/layout selection
 * picked 'radial' or 'cluster'.
 */

// A modestly sized square ward polygon representative of a subdivided
// settlement patch (well under the old radial ring threshold of >17 units
// center-inset, and under the clustered layout's STREET+DEPTH=15 clearance).
function smallSquareWard(size = 24): Vec2[] {
  const h = size / 2;
  return [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }];
}

describe('fillWardRadial', () => {
  it('always places at least one building for a small ward, even with no roads nearby', () => {
    for (let seed = 0; seed < 20; seed++) {
      const occ = new OccupancyGrid(200, 200);
      const rects = fillWardRadial(smallSquareWard(24), 'craftsmen', seed, occ, []);
      expect(rects.length).toBeGreaterThan(0);
    }
  });
});

describe('fillWardClustered', () => {
  it('always places at least one building for a small ward, even with no roads nearby', () => {
    for (let seed = 0; seed < 20; seed++) {
      const occ = new OccupancyGrid(200, 200);
      const rects = fillWardClustered(smallSquareWard(24), 'craftsmen', seed, occ, []);
      expect(rects.length).toBeGreaterThan(0);
    }
  });
});

describe('live settlement generation (regression: zero-building settlements)', () => {
  it('never produces a settlement with zero planned buildings across a range of seeds', () => {
    const config: WorldGenConfig = {
      seed: 0, worldSize: 512, riverCount: 2, lakeCount: 0,
      dungeonCount: 2, caveCount: 0, gladeCount: 0,
      settlementCount: 6, enemyCampCount: 2,
      assetMode: 'code', assetPacks: [], charMode: 'code', charPacks: [],
    };
    for (let seed = 1; seed <= 6; seed++) {
      const worldData = buildWorldData(seed, { ...config, seed });
      for (const settlement of worldData.settlements) {
        expect(settlement.plan.buildings.length).toBeGreaterThan(0);
      }
    }
  }, 30000);
});
