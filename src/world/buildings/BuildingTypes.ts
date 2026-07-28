/**
 * BuildingTypes — type identifiers and specs for every building that can
 * appear in a settlement. Used by BuildingGenerator and SettlementGenerator.
 *
 * `footprint` is derived directly from BuildingDNA.getFootprint() — the exact
 * same function BuildingBuilder.ts uses to size the rendered mesh — so the
 * settlement planner and the actual renderer always agree on a building's
 * real size. (Previously this table was hand-authored and stale, which is
 * why buildings used to overlap/clip through each other.)
 */

import { getFootprint, type BuildingKind, type BuildingSize } from './BuildingDNA';

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

/** World units per grid tile — must match OverworldScene.ts's `T` constant. */
const WORLD_UNITS_PER_TILE = 2;

/**
 * Which BuildingKind (new procedural-building system) and BuildingSize each
 * old BuildingType maps to. Single source of truth — also consumed by
 * BuildingTypeMap.ts's createSettlementBuildingDna() so the settlement
 * planner and the actual renderer always agree on a building's real kind/size.
 */
export const KIND_MAP: Record<BuildingType, BuildingKind> = {
  cottage:      'cottage',
  inn:          'inn',
  market_stall: 'market_stall',
  smithy:       'blacksmith',
  tavern:       'tavern',
  temple:       'chapel',
  city_hall:    'guild',
  guard_tower:  'watchtower',
  well:         'well',
  market_cross: 'market_stall',
};

export const SIZE_MAP: Record<BuildingType, BuildingSize> = {
  cottage:      'tiny',
  inn:          'small',
  market_stall: 'tiny',
  smithy:       'tiny',
  tavern:       'small',
  temple:       'medium',
  city_hall:    'large',
  guard_tower:  'tiny',
  well:         'tiny',
  market_cross: 'tiny',
};

export interface BuildingSpec {
  type:           BuildingType;
  /** Footprint in grid tiles [cols, rows] — derived from
   *  getFootprint(KIND_MAP[type], SIZE_MAP[type]), the exact footprint
   *  BuildingBuilder.ts uses to render the mesh. */
  footprint:      [cols: number, rows: number];
  minFloors:      number;
  maxFloors:      number;
  roofStyle:      RoofStyle;
  /** If true, pressing [E] at the door opens an interior generator. */
  allowsInterior: boolean;
}

/** Convert a BuildingType's real render footprint (world units) to grid tiles, rounded up. */
function _tileFootprint(type: BuildingType): [number, number] {
  const { w, d } = getFootprint(KIND_MAP[type], SIZE_MAP[type]);
  return [Math.ceil(w / WORLD_UNITS_PER_TILE), Math.ceil(d / WORLD_UNITS_PER_TILE)];
}

export const BUILDING_SPECS: Readonly<Record<BuildingType, BuildingSpec>> = {
  cottage:      { type: 'cottage',      footprint: _tileFootprint('cottage'),      minFloors: 1, maxFloors: 1, roofStyle: 'thatched_dome', allowsInterior: true  },
  inn:          { type: 'inn',          footprint: _tileFootprint('inn'),          minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  market_stall: { type: 'market_stall', footprint: _tileFootprint('market_stall'), minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
  smithy:       { type: 'smithy',       footprint: _tileFootprint('smithy'),       minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: true  },
  tavern:       { type: 'tavern',       footprint: _tileFootprint('tavern'),       minFloors: 2, maxFloors: 2, roofStyle: 'pointed',        allowsInterior: true  },
  temple:       { type: 'temple',       footprint: _tileFootprint('temple'),       minFloors: 2, maxFloors: 2, roofStyle: 'thatched_dome',  allowsInterior: true  },
  city_hall:    { type: 'city_hall',    footprint: _tileFootprint('city_hall'),    minFloors: 3, maxFloors: 3, roofStyle: 'spire',          allowsInterior: true  },
  guard_tower:  { type: 'guard_tower',  footprint: _tileFootprint('guard_tower'),  minFloors: 4, maxFloors: 5, roofStyle: 'flat_parapet',   allowsInterior: false },
  well:         { type: 'well',         footprint: _tileFootprint('well'),         minFloors: 1, maxFloors: 1, roofStyle: 'pointed',        allowsInterior: false },
  market_cross: { type: 'market_cross', footprint: _tileFootprint('market_cross'), minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet',   allowsInterior: false },
};
