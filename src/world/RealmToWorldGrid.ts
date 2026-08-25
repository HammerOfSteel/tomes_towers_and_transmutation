/**
 * RealmToWorldGrid.ts — resamples a Studio-generated RealmData onto the
 * live game's WorldGrid shape (P0 of the Studio<->live-game parity work,
 * see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md).
 *
 * Deliberately keeps WorldGrid's existing 6-value BiomeId taxonomy and
 * 0-4 elevation levels unchanged (Approach 2 from the design spec) so
 * every downstream consumer (DungeonPlacer, SettlementPlacer,
 * CaveGladeWorldPlacer, HydrologyGenerator, RoadGenerator,
 * TerrainGeometryBuilder) needs zero changes — only the *source* of
 * biome/elevation per cell changes, from independent FBM noise to a
 * resampled-and-mapped realm map.
 *
 * Resampling is nearest-neighbor: realm dimensions (96x72 by default)
 * essentially never match `worldSize` (128 or 256, always square), so
 * some stretching is unavoidable and acceptable for this slice.
 */

import { WorldGrid, type BiomeId } from './WorldGrid';
import type { WorldSize } from './WorldGenConfig';
import type { RealmData, RealmBiome } from '@/overworld-studio';
import { OCEAN_SHALLOW_DEPTH_WU, OCEAN_DEEP_DEPTH_WU } from './WaterDepthConfig';

/**
 * Realm's 10-value biome taxonomy collapsed onto WorldGrid's 6-value
 * BiomeId. Oceans map to 'water' (not 'bog') because 'water' already
 * exists in BiomeId and is actively checked by DungeonPlacer.ts,
 * SettlementPlacer.ts, RoadGenerator.ts, SettlementGenerator.ts, and
 * TerrainGeometryBuilder.ts to avoid placing things in the ocean / render
 * it differently — today's FBM generator never produces 'water', so this
 * mapping makes those existing checks actually take effect for the first
 * time rather than silently never triggering.
 */
const REALM_BIOME_TO_WORLD_BIOME: Record<RealmBiome, BiomeId> = {
  deep_ocean: 'water',
  ocean:      'water',
  beach:      'grass',
  desert:     'grass',
  savanna:    'grass',
  grassland:  'grass',
  forest:     'forest',
  taiga:      'forest',
  tundra:     'highland',
  snow:       'rocky',
};

/** Quantize a continuous 0..1 realm elevation into WorldGrid's 0-4 levels. */
function quantizeElevation(elevation: number): number {
  return Math.max(0, Math.min(4, Math.floor(elevation * 5)));
}

/** Nearest-neighbor sample of a realm cell for a target WorldGrid position. */
function sampleRealmCell(realm: RealmData, col: number, row: number, worldSize: number) {
  const realmW = Math.max(1, realm.W);
  const realmH = Math.max(1, realm.H);
  const rx = Math.min(realmW - 1, Math.floor((col / worldSize) * realmW));
  const ry = Math.min(realmH - 1, Math.floor((row / worldSize) * realmH));
  return realm.cells[ry]![rx]!;
}

export function realmToWorldGrid(realm: RealmData, worldSize: number): WorldGrid {
  const grid = new WorldGrid(worldSize as WorldSize, worldSize as WorldSize);
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = sampleRealmCell(realm, col, row, worldSize);
      const biome = REALM_BIOME_TO_WORLD_BIOME[cell.biome];
      // Ocean-rim water tiles get a real carved depth (RI-3) so they're
      // physically swimmable, not just cosmetically tinted — matching
      // river tiles' HydrologyGenerator.ts treatment.
      const isWater = biome === 'water';
      grid.set(col, row, {
        elevation:  quantizeElevation(cell.elevation),
        biome,
        waterDepth: isWater ? OCEAN_DEEP_DEPTH_WU : 0,
        walkable:   !isWater,
      });
    }
  }
  return grid;
}
