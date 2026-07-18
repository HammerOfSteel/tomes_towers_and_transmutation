/**
 * BuildingDNA.ts — PROC-C1a
 * Data model for a procedural building.
 */

import type { ProceduralDNA } from '@/procedural/ProceduralDNA';

export type BuildingKind =
  // Residential
  | 'house'        // standard house, 1-3 floors
  | 'terraced'     // row house, narrow, shared side walls, jetty overhang
  | 'cottage'      // low wide, very steep thatched roof
  | 'villa'        // grand symmetrical manor, Georgian proportions
  // Commercial / Social
  | 'shop'         // narrow commercial, large ground-floor display windows
  | 'inn'          // wide, tudor, bay windows, hanging sign
  | 'tavern'       // larger inn, stable arch, multiple chimneys
  | 'apothecary'   // narrow, tall, oriel window 2nd floor
  | 'market_stall' // open front, canvas awning, counter
  // Civic / Religious
  | 'guild'        // civic hall, hipped roof, arched windows
  | 'chapel'       // long nave, gothic pointed windows, bell tower
  // Military / Utility
  | 'tower'        // general tower
  | 'watchtower'   // tall narrow, battlements, arrow slits
  | 'blacksmith'   // wide open forge, massive chimney, no front wall
  | 'barn'         // agricultural, wide, gambrel or gabled
  // Infrastructure / Misc
  | 'well'
  | 'gate'
  | 'tent'         // fabric structure, conical or ridge roof
  | 'ruin';

export type BuildingSize      = 'tiny' | 'small' | 'medium' | 'large';
export type BuildingStyle     = 'thatched' | 'stone' | 'timber' | 'arcane' | 'nordic' | 'tudor' | 'gothic'
                               | 'elven' | 'dwarven' | 'vampiric' | 'nomadic' | 'fae' | 'orcish';
export type BuildingCondition = 'pristine' | 'weathered' | 'damaged' | 'ruined';

/**
 * Which sides share a wall with a neighbour (terraced housing).
 * Affects: no side windows on shared sides, wall thickness.
 */
export type TerraceSide = 'none' | 'left' | 'right' | 'both';

export type InteriorLayout =
  | 'single_room'    // house / shop: one open space
  | 'divided'        // inn / guild: hallway + side rooms
  | 'open_hall'      // barn / guild hall
  | 'none';          // well / gate / ruin — no interior

export interface BuildingColors {
  walls:  string;
  roof:   string;
  trim:   string;
  door:   string;
}

export interface BuildingDNA extends ProceduralDNA {
  readonly kind:  'building';
  buildingKind:   BuildingKind;
  size:           BuildingSize;
  floors:         1 | 2 | 3 | 4;
  style:          BuildingStyle;
  condition:      BuildingCondition;
  hasInterior:    boolean;
  interiorLayout: InteriorLayout;
  colors:         BuildingColors;
  rotation:       number;
  /** Terraced house: which sides are party walls (no windows/details). */
  terrace:        TerraceSide;
  /**
   * Optional feature overrides.
   * bay_window: projecting 3-light window on front
   * jetty: upper floors overhang lower by ~0.4m (Tudor/medieval)
   * battlements: crenellated parapet at top
   * buttress: side buttresses (gothic/chapel)
   * awning: fabric canopy over entrance
   */
  features: Array<'bay_window' | 'jetty' | 'battlements' | 'buttress' | 'awning' | 'balcony'>;
}

// ── Size → footprint in world units ──────────────────────────────────────────

export const SIZE_FOOTPRINT: Record<BuildingSize, { w: number; d: number }> = {
  tiny:   { w: 4,  d: 4  },
  small:  { w: 6,  d: 5  },
  medium: { w: 9,  d: 7  },
  large:  { w: 13, d: 10 },
};

/** Footprint overrides per building kind (when default size table isn't right). */
export const KIND_FOOTPRINT: Partial<Record<BuildingKind, { w: number; d: number }>> = {
  terraced:     { w: 5,  d: 7  },   // narrow row house
  cottage:      { w: 9,  d: 7  },   // wide single-storey
  villa:        { w: 12, d: 9  },   // grand symmetrical
  tavern:       { w: 12, d: 9  },   // wide frontage
  apothecary:   { w: 5,  d: 6  },   // narrow and tall
  watchtower:   { w: 3,  d: 3  },   // very narrow
  blacksmith:   { w: 9,  d: 7  },   // wide open forge
  tent:         { w: 5,  d: 5  },   // round-ish
  market_stall: { w: 6,  d: 3  },   // shallow open front
  chapel:       { w: 7,  d: 14 },   // long nave
};

/** Combine size footprint with kind override. */
export function getFootprint(kind: BuildingKind, size: BuildingSize): { w: number; d: number } {
  return KIND_FOOTPRINT[kind] ?? SIZE_FOOTPRINT[size];
}

export const FLOOR_HEIGHT = 3.2;   // world units per floor

// ── Style → palette ───────────────────────────────────────────────────────────

export const STYLE_COLORS: Record<BuildingStyle, BuildingColors> = {
  thatched: { walls: '#c8b88a', roof: '#8b7040', trim: '#6a4a28', door: '#5a3a18' },
  stone:    { walls: '#9a9090', roof: '#5a5050', trim: '#3a3030', door: '#4a3828' },
  timber:   { walls: '#d8c8a0', roof: '#7a5838', trim: '#5a3820', door: '#4a2818' },
  arcane:   { walls: '#4a3870', roof: '#2a1850', trim: '#8060c0', door: '#6040a0' },
  nordic:   { walls: '#6a5840', roof: '#3a2818', trim: '#4a3020', door: '#2a1810' },
  tudor:    { walls: '#e8e0c8', roof: '#282820', trim: '#3a2010', door: '#2a1810' },
  gothic:   { walls: '#8a8888', roof: '#303030', trim: '#5a5858', door: '#3a3030' },
  elven:    { walls: '#c8d8b0', roof: '#8a9870', trim: '#f0f0e8', door: '#6a8a50' },
  dwarven:  { walls: '#706860', roof: '#404040', trim: '#2a2020', door: '#1a1818' },
  vampiric: { walls: '#2a2030', roof: '#1a1020', trim: '#4a3050', door: '#8a2020' },
  nomadic:  { walls: '#c8b890', roof: '#a89060', trim: '#7a6040', door: '#6a5030' },
  fae:      { walls: '#c8a8d0', roof: '#a080b0', trim: '#f0d8f8', door: '#9060a8' },
  orcish:   { walls: '#6a5838', roof: '#3a2818', trim: '#8a6840', door: '#2a1810' },
};

// ── Faction type ──────────────────────────────────────────────────────────────

export type Faction =
  | 'human_rural' | 'human_town' | 'human_noble'
  | 'elven' | 'dwarven' | 'vampire' | 'undead_common'
  | 'draconic' | 'celestial' | 'vulperia' | 'slime' | 'fae' | 'orcish';

// ── Faction → default style + color overrides ─────────────────────────────────

export interface FactionPreset {
  style:     BuildingStyle;
  colors:    BuildingColors;
  condition: BuildingCondition;
}

export const FACTION_PRESETS: Record<Faction, FactionPreset> = {
  human_rural:   { style: 'thatched', colors: STYLE_COLORS['thatched'],  condition: 'weathered' },
  human_town:    { style: 'timber',   colors: STYLE_COLORS['timber'],    condition: 'weathered' },
  human_noble:   { style: 'tudor',    colors: STYLE_COLORS['tudor'],     condition: 'pristine' },
  elven:         { style: 'elven',    colors: STYLE_COLORS['elven'],     condition: 'pristine' },
  dwarven:       { style: 'dwarven',  colors: STYLE_COLORS['dwarven'],   condition: 'pristine' },
  vampire:       { style: 'vampiric', colors: STYLE_COLORS['vampiric'],  condition: 'weathered' },
  undead_common: { style: 'stone',    colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' }, condition: 'ruined' },
  draconic:      { style: 'dwarven',  colors: { walls: '#5a2010', roof: '#3a1008', trim: '#c84000', door: '#2a1008' }, condition: 'pristine' },
  celestial:     { style: 'arcane',   colors: { walls: '#e8f0ff', roof: '#a0b0d0', trim: '#c0d0f0', door: '#8090c0' }, condition: 'pristine' },
  vulperia:      { style: 'timber',   colors: { walls: '#d4a060', roof: '#8a5020', trim: '#c88030', door: '#6a3810' }, condition: 'weathered' },
  slime:         { style: 'nomadic',  colors: { walls: '#aaffcc', roof: '#66ffaa', trim: '#22ff88', door: '#00cc66' }, condition: 'pristine' },
  fae:           { style: 'fae',      colors: STYLE_COLORS['fae'],       condition: 'pristine' },
  orcish:        { style: 'orcish',   colors: STYLE_COLORS['orcish'],    condition: 'damaged' },
};

/**
 * Create a BuildingDNA for a given faction + kind combo.
 * Applies faction colors/style; caller provides seed, size, floors.
 */
export function factionBuildingDna(
  kind:    BuildingKind,
  faction: Faction,
  seed:    number,
  size:    BuildingSize = 'medium',
  floors:  1 | 2 | 3 | 4 = 2,
): BuildingDNA {
  const preset = FACTION_PRESETS[faction];
  return {
    v:              1,
    kind:           'building',
    name:           `${faction} ${kind}`,
    seed,
    buildingKind:   kind,
    size,
    floors,
    style:          preset.style,
    condition:      preset.condition,
    hasInterior:    true,
    interiorLayout: 'single_room',
    colors:         preset.colors,
    rotation:       0,
    terrace:        'none',
    features:       [],
  };
}
