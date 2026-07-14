/**
 * BuildingTypes — type identifiers and specs for every building that can
 * appear in a settlement.  Used by BuildingGenerator and SettlementGenerator.
 */

export type BuildingType =
  | 'cottage'       // small 1-room dwelling, thatched dome roof
  | 'inn'           // larger, 2 floors, pitched roof, hanging sign
  | 'market_stall'  // open-sided awning, vendor counter, 4 poles
  | 'smithy'        // rectangular, chimney, forge glow
  | 'tavern'        // wide 2-floor, pitched roof, barrel cluster
  | 'temple'        // circular columns, dome roof, emissive altar
  | 'city_hall'     // 3-floor, flat parapet + central spire
  | 'guard_tower'   // tall narrow cylinder + battlements
  | 'well'          // cylinder surround + mini pitched roof + bucket
  | 'market_cross'; // focal pillar + cross-arm + stone plinth

export type RoofStyle = 'thatched_dome' | 'pointed' | 'flat_parapet' | 'spire';

export interface BuildingSpec {
  type:           BuildingType;
  /** Footprint in grid tiles [cols × rows]. */
  footprint:      [cols: number, rows: number];
  minFloors:      number;
  maxFloors:      number;
  roofStyle:      RoofStyle;
  /** If true, pressing [E] at the door opens an interior generator. */
  allowsInterior: boolean;
}

export const BUILDING_SPECS: Readonly<Record<BuildingType, BuildingSpec>> = {
  cottage:      { type: 'cottage',      footprint: [2, 2],  minFloors: 1, maxFloors: 1, roofStyle: 'thatched_dome', allowsInterior: true  },
  inn:          { type: 'inn',          footprint: [3, 4],  minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  market_stall: { type: 'market_stall', footprint: [2, 2],  minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
  smithy:       { type: 'smithy',       footprint: [2, 2],  minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: true  },
  tavern:       { type: 'tavern',       footprint: [4, 3],  minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  temple:       { type: 'temple',       footprint: [4, 4],  minFloors: 2, maxFloors: 2, roofStyle: 'thatched_dome',  allowsInterior: true  },
  city_hall:    { type: 'city_hall',    footprint: [6, 4],  minFloors: 3, maxFloors: 3, roofStyle: 'spire',          allowsInterior: true  },
  guard_tower:  { type: 'guard_tower',  footprint: [2, 2],  minFloors: 4, maxFloors: 5, roofStyle: 'flat_parapet',   allowsInterior: false },
  well:         { type: 'well',         footprint: [1, 1],  minFloors: 1, maxFloors: 1, roofStyle: 'pointed',        allowsInterior: false },
  market_cross: { type: 'market_cross', footprint: [1, 1],  minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
};
