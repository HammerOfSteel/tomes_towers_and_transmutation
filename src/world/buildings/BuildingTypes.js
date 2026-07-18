/**
 * BuildingTypes — type identifiers and specs for every building that can
 * appear in a settlement.  Used by BuildingGenerator and SettlementGenerator.
 */
export const BUILDING_SPECS = {
    cottage: { type: 'cottage', footprint: [2, 2], minFloors: 1, maxFloors: 1, roofStyle: 'thatched_dome', allowsInterior: true },
    inn: { type: 'inn', footprint: [3, 4], minFloors: 2, maxFloors: 2, roofStyle: 'pointed', allowsInterior: true },
    market_stall: { type: 'market_stall', footprint: [2, 2], minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet', allowsInterior: false },
    smithy: { type: 'smithy', footprint: [2, 2], minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet', allowsInterior: true },
    tavern: { type: 'tavern', footprint: [4, 3], minFloors: 2, maxFloors: 2, roofStyle: 'pointed', allowsInterior: true },
    temple: { type: 'temple', footprint: [4, 4], minFloors: 2, maxFloors: 2, roofStyle: 'thatched_dome', allowsInterior: true },
    city_hall: { type: 'city_hall', footprint: [6, 4], minFloors: 3, maxFloors: 3, roofStyle: 'spire', allowsInterior: true },
    guard_tower: { type: 'guard_tower', footprint: [2, 2], minFloors: 4, maxFloors: 5, roofStyle: 'flat_parapet', allowsInterior: false },
    well: { type: 'well', footprint: [1, 1], minFloors: 1, maxFloors: 1, roofStyle: 'pointed', allowsInterior: false },
    market_cross: { type: 'market_cross', footprint: [1, 1], minFloors: 1, maxFloors: 1, roofStyle: 'flat_parapet', allowsInterior: false },
};
