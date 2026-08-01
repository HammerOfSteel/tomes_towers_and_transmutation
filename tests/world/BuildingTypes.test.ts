import { describe, it, expect } from 'vitest';
import { BUILDING_SPECS, type BuildingType } from '@/world/buildings/BuildingTypes';

// Expected tile footprints, hand-computed from BuildingDNA.getFootprint(KIND_MAP[type], SIZE_MAP[type])
// at WORLD_UNITS_PER_TILE=2 (ceil(worldUnits / 2)). These are the REAL render sizes — the whole
// point of this test is to catch BUILDING_SPECS drifting back to stale hand-authored numbers.
const EXPECTED_FOOTPRINT: Record<BuildingType, [number, number]> = {
  cottage:      [3, 2], // kind 'cottage' has a KIND_FOOTPRINT override: 5x4 WU
  inn:          [2, 2], // kind 'inn', size 'small': SIZE_FOOTPRINT.small = 4x3 WU
  market_stall: [2, 1], // kind 'market_stall' has a KIND_FOOTPRINT override: 4x2 WU
  smithy:       [3, 2], // kind 'blacksmith' has a KIND_FOOTPRINT override: 5x4 WU
  tavern:       [4, 3], // kind 'tavern' has a KIND_FOOTPRINT override: 7x5 WU
  temple:       [2, 4], // kind 'chapel' has a KIND_FOOTPRINT override: 4x8 WU
  city_hall:    [4, 3], // kind 'guild', size 'large': SIZE_FOOTPRINT.large = 7x5 WU
  guard_tower:  [1, 1], // kind 'watchtower' has a KIND_FOOTPRINT override: 2x2 WU
  well:         [2, 2], // kind 'well', size 'tiny': SIZE_FOOTPRINT.tiny = 3x3 WU
  market_cross: [2, 1], // kind 'market_stall' has a KIND_FOOTPRINT override: 4x2 WU
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
