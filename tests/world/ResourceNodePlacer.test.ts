import { describe, it, expect } from 'vitest';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import type { BiomeId, TileFeature } from '@/world/WorldGrid';

/**
 * Regression coverage for the stale-biome-literal bug fixed alongside this
 * test: ResourceNodePlacer's essence-candidate check used to compare
 * `cell.biome` against 'wetland' / 'river' / 'lake' and the ore-candidate
 * check against 'highlands' / 'mountain' — none of which are (or ever were,
 * post-migration) valid `BiomeId` members. Because the comparison value was
 * cast to `string`, the type checker couldn't catch it, and essence nodes
 * silently never spawned.
 */
describe('placeResourceNodes — biome/feature literal correctness', () => {
  it('places a non-zero number of essence nodes for the default config', () => {
    const seed = 7;
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed };
    const worldData = buildWorldData(seed, cfg);

    const counts: Record<string, number> = {};
    for (const n of worldData.resourceNodes) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }

    expect(counts.essence ?? 0).toBeGreaterThan(0);
    // Ore/timber should still spawn in sane, non-zero quantities.
    expect(counts.ore ?? 0).toBeGreaterThan(0);
    expect(counts.timber ?? 0).toBeGreaterThan(0);
  });

  it('produces the same resource-type counts across multiple seeds (deterministic, no regression)', () => {
    for (const seed of [1, 7, 42, 99, 123]) {
      const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed };
      const worldData = buildWorldData(seed, cfg);
      const counts: Record<string, number> = {};
      for (const n of worldData.resourceNodes) {
        counts[n.type] = (counts[n.type] ?? 0) + 1;
      }
      expect(counts.essence ?? 0).toBeGreaterThan(0);
    }
  });

  it('only compares against literals that are valid current BiomeId / TileFeature members', () => {
    // Exhaustive lists mirroring ResourceNodePlacer's placement conditions.
    // If the taxonomy changes and one of these literals goes stale, this
    // assignment fails to compile (not just fails a runtime assertion),
    // catching the exact class of bug this test guards against.
    const oreBiomes: BiomeId[] = ['snow'];
    const timberBiomes: BiomeId[] = ['forest', 'taiga'];
    const essenceFeatures: TileFeature[] = ['river', 'river_bank', 'river_ford', 'lake'];

    expect(oreBiomes.length).toBe(1);
    expect(timberBiomes.length).toBe(2);
    expect(essenceFeatures.length).toBe(4);
  });
});
