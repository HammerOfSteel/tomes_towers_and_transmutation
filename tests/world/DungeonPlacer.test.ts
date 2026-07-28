/**
 * DungeonPlacer.test.ts — 02-game-world-integration (DI-2b live wiring)
 *
 * Focused on the DI-2b site-metadata enrichment added this session to
 * placeDungeons(); general placement/spacing behavior is already exercised
 * indirectly via WorldGen/WorldGenerator consumers.
 */

import { describe, it, expect } from 'vitest';
import { buildWorldGrid } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import { placeDungeons } from '@/world/DungeonPlacer';

const SEED = 0xBEEF_0001;

function freshGrid() {
  return buildWorldGrid(SEED, { ...DEFAULT_WORLD_GEN_CONFIG, seed: SEED });
}

const VALID_SITE_FAMILIES = [
  'tower_floor', 'library_ruin', 'alchemy_vault', 'tomb_barrow',
  'beast_lair', 'mine_works', 'observatory_ruin', 'surface_threat',
];

describe('placeDungeons — DI-2b site metadata', () => {
  it('assigns a valid siteFamily/rewardBias to every placed dungeon', () => {
    const grid = freshGrid();
    const dungeons = placeDungeons(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    expect(dungeons.length).toBeGreaterThan(0);
    for (const d of dungeons) {
      expect(VALID_SITE_FAMILIES).toContain(d.siteFamily);
      expect(Array.isArray(d.rewardBias)).toBe(true);
      expect(typeof d.eliteRecruitOpportunity).toBe('boolean');
      expect(typeof d.defenseIntelSource).toBe('boolean');
    }
  });

  it('is deterministic — same seed/grid produces the same site metadata', () => {
    const gridA = freshGrid();
    const gridB = freshGrid();
    const a = placeDungeons(gridA, DEFAULT_WORLD_GEN_CONFIG, SEED);
    const b = placeDungeons(gridB, DEFAULT_WORLD_GEN_CONFIG, SEED);
    expect(a.map(d => ({ col: d.col, row: d.row, siteFamily: d.siteFamily, rewardBias: d.rewardBias })))
      .toEqual(b.map(d => ({ col: d.col, row: d.row, siteFamily: d.siteFamily, rewardBias: d.rewardBias })));
  });

  it('derives siteFamily solely from (seed, col, row) — matches enrichDungeonMarker directly', async () => {
    const { enrichDungeonMarker } = await import('@/world/DungeonSiteMetadata');
    const grid = freshGrid();
    const dungeons = placeDungeons(grid, DEFAULT_WORLD_GEN_CONFIG, SEED);
    for (const d of dungeons) {
      const site = enrichDungeonMarker(SEED, { x: d.col, y: d.row });
      expect(d.siteFamily).toBe(site.siteFamily);
      expect(d.rewardBias).toEqual(site.rewardBias);
      expect(d.eliteRecruitOpportunity).toBe(site.eliteRecruitOpportunity);
      expect(d.defenseIntelSource).toBe(site.defenseIntelSource);
    }
  });
});
