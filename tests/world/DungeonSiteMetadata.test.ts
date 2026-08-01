/**
 * DungeonSiteMetadata.test.ts — 02-game-world-integration (DI-2, DI-2b)
 */

import { describe, it, expect } from 'vitest';
import {
  enrichDungeonMarker, enrichDungeonMarkers, PROVISIONAL_SCHOOLS,
  type DungeonSiteFamily,
} from '@/world/DungeonSiteMetadata';

describe('enrichDungeonMarker', () => {
  it('is deterministic for a given realm seed + marker position', () => {
    const a = enrichDungeonMarker(42, { x: 10, y: 20 });
    const b = enrichDungeonMarker(42, { x: 10, y: 20 });
    expect(b).toEqual(a);
  });

  it('produces different sites for different positions under the same realm seed', () => {
    const a = enrichDungeonMarker(42, { x: 1, y: 1 });
    const b = enrichDungeonMarker(42, { x: 99, y: 5 });
    expect(a).not.toEqual(b);
  });

  it('produces different sites for the same position under a different realm seed', () => {
    const a = enrichDungeonMarker(1, { x: 10, y: 10 });
    const b = enrichDungeonMarker(2, { x: 10, y: 10 });
    expect(a.seed).not.toBe(b.seed);
  });

  it('preserves the marker position', () => {
    const site = enrichDungeonMarker(7, { x: 3, y: 8 });
    expect(site.x).toBe(3);
    expect(site.y).toBe(8);
  });

  it('always assigns a valid site family with matching reward-bias metadata', () => {
    const validFamilies: DungeonSiteFamily[] = [
      'tower_floor', 'library_ruin', 'alchemy_vault', 'tomb_barrow',
      'beast_lair', 'mine_works', 'observatory_ruin', 'surface_threat',
    ];
    for (let seed = 0; seed < 50; seed++) {
      const site = enrichDungeonMarker(seed, { x: seed, y: seed * 2 });
      expect(validFamilies).toContain(site.siteFamily);
      expect(Array.isArray(site.rewardBias)).toBe(true);
      expect(Array.isArray(site.likelyBookFamilies)).toBe(true);
      expect(Array.isArray(site.likelyReagentFamilies)).toBe(true);
      for (const school of site.schoolBias) {
        expect(PROVISIONAL_SCHOOLS).toContain(school);
      }
    }
  });

  it('tomb_barrow and beast_lair and surface_threat are elite recruit opportunities', () => {
    // Find a seed that yields each family and check the flag matches the profile.
    const seen = new Set<DungeonSiteFamily>();
    for (let seed = 0; seed < 200 && seen.size < 8; seed++) {
      const site = enrichDungeonMarker(seed, { x: seed, y: 0 });
      seen.add(site.siteFamily);
      if (['tomb_barrow', 'beast_lair', 'surface_threat'].includes(site.siteFamily)) {
        expect(site.eliteRecruitOpportunity).toBe(true);
      } else {
        expect(site.eliteRecruitOpportunity).toBe(false);
      }
    }
  });
});

describe('enrichDungeonMarkers', () => {
  it('enriches every marker in order', () => {
    const markers = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    const sites = enrichDungeonMarkers(42, markers);
    expect(sites.length).toBe(3);
    expect(sites.map(s => ({ x: s.x, y: s.y }))).toEqual(markers);
  });

  it('matches enrichDungeonMarker called individually', () => {
    const markers = [{ x: 5, y: 6 }, { x: 7, y: 8 }];
    const batch = enrichDungeonMarkers(99, markers);
    const individual = markers.map(m => enrichDungeonMarker(99, m));
    expect(batch).toEqual(individual);
  });
});
