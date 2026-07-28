import { describe, it, expect } from 'vitest';
import { BUILDING_SPECS, type BuildingType } from '@/world/buildings/BuildingTypes';

// Expected tile footprints, hand-computed from BuildingDNA.getFootprint(KIND_MAP[type], SIZE_MAP[type])
// at WORLD_UNITS_PER_TILE=2 (ceil(worldUnits / 2)). These are the REAL render sizes — the whole
// point of this test is to catch BUILDING_SPECS drifting back to stale hand-authored numbers.
const EXPECTED_FOOTPRINT: Record<BuildingType, [number, number]> = {
  cottage:      [5, 4], // kind 'cottage' has a KIND_FOOTPRINT override: 9x7 WU
  inn:          [3, 3], // kind 'inn', size 'small': SIZE_FOOTPRINT.small = 6x5 WU
  market_stall: [3, 2], // kind 'market_stall' has a KIND_FOOTPRINT override: 6x3 WU
  smithy:       [5, 4], // kind 'blacksmith' has a KIND_FOOTPRINT override: 9x7 WU
  tavern:       [6, 5], // kind 'tavern' has a KIND_FOOTPRINT override: 12x9 WU
  temple:       [4, 7], // kind 'chapel' has a KIND_FOOTPRINT override: 7x14 WU
  city_hall:    [7, 5], // kind 'guild', size 'large': SIZE_FOOTPRINT.large = 13x10 WU
  guard_tower:  [2, 2], // kind 'watchtower' has a KIND_FOOTPRINT override: 3x3 WU
  well:         [2, 2], // kind 'well', size 'tiny': SIZE_FOOTPRINT.tiny = 4x4 WU
  market_cross: [3, 2], // kind 'market_stall' has a KIND_FOOTPRINT override: 6x3 WU
};

describe('BUILDING_SPECS footprints', () => {
  it('match the real BuildingDNA render footprint (tiles, T=2 WU/tile)', () => {
    for (const type of Object.keys(EXPECTED_FOOTPRINT) as BuildingType[]) {
      expect(BUILDING_SPECS[type].footprint).toEqual(EXPECTED_FOOTPRINT[type]);
    }
  });

  it('every BuildingType has a positive-area footprint', () => {
    for (const type of Object.keys(EXPECTED_FOOTPRINT) as BuildingType[]) {
      const [w, d] = BUILDING_SPECS[type].footprint;
      expect(w).toBeGreaterThan(0);
      expect(d).toBeGreaterThan(0);
    }
  });
});
