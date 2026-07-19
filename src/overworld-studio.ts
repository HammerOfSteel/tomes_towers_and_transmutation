/**
 * overworld-studio.ts — Overworld Settlement Generator Studio
 *
 * Architecture (Azgaar FMG 4-layer pattern):
 *   State     : SettlementModel (JSON-serialisable)
 *   Generator : buildSettlement(params) → SettlementModel
 *   Editor    : sliders/pills/click mutate params → trigger re-generate
 *   Renderer  : drawSettlement(model, canvas) — pure Canvas 2D, no side effects
 *
 * Algorithm (Watabou TownGeneratorOS pattern):
 *   1. Spiral-distribute seed points
 *   2. Build Voronoi (d3-delaunay)
 *   3. Lloyd relax central cells × 2
 *   4. Apply Simplex warp to seed points
 *   5. Assign ward types by rateLocation()
 *   6. Build street graph from Voronoi edges
 *   7. Chaikin-smooth all road polylines
 *   8. Render to Canvas 2D
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Delaunay } from 'd3-delaunay';
// @ts-expect-error no declaration file — import works fine at runtime
import { createNoise2D } from '@/core/SimplexNoise';
import { generateDungeon } from '@/levels/DungeonGenerator';
import type { DungeonPlan } from '@/levels/DungeonGenerator';
import { generateTower } from '@/levels/TowerGenerator';
import type { Blueprint } from '@/levels/blueprint';
import { PlanetRenderer, buildDayTexture, buildNightTexture, buildSpecularTexture, buildCloudTexture } from './planet-renderer';
import { HexPlanetRenderer } from './hex-planet-renderer';
import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WardType =
  | 'market' | 'church' | 'inn' | 'smithy' | 'craftsmen'
  | 'merchant' | 'patriciate' | 'slum' | 'gateward' | 'farm' | 'park';

export type SettlementType = 'village' | 'town' | 'city';

interface Vec2 { x: number; y: number; }

interface Ward {
  type:      WardType;
  seed:      Vec2;
  polygon:   Vec2[];         // Voronoi cell polygon
  withinCity: boolean;
  center:    Vec2;
  /** Layout strategy assigned during generation (per mixing rules). */
  wardLayout: LayoutType;
}

interface Road {
  points: Vec2[];            // after Chaikin smoothing
}

export interface SettlementModel {
  wards:      Ward[];
  roads:      Road[];
  wall?:      Vec2[];        // wall polygon if walled
  gates:      Vec2[];
  centre:     Vec2;
  radius:     number;
  seed:       number;
  genTimeMs:  number;
}

export type LayoutType =
  | 'auto'       // smart mixing based on settlement type + ward position (default)
  | 'organic'    // Voronoi-based, irregular — current default
  | 'grid'       // Orthogonal streets, rectangular blocks (Roman, American)
  | 'linear'     // One main road, buildings either side (Welsh valley, Strassendorf)
  | 'radial'     // Streets radiate from central hub (Baroque, Paris)
  | 'terraced'   // Parallel rows of row-houses (Welsh/English industrial)
  | 'perimeter'  // Buildings around block edge with hollow courtyard (Barcelona)
  | 'cluster'    // Small groups around shared courtyards (Islamic medina, hosh, campo)
  ;

interface GeneratorParams {
  seed:          number;
  type:          SettlementType;
  layout:        LayoutType;
  faction:       SettlementFaction;
  nPatches:      number;   // number of Voronoi cells
  warp:          number;   // 0–1 Simplex noise displacement
  nGates:        number;   // number of road entrances
  walled:        boolean;
  hasCitadel:    boolean;
  hasPlaza:      boolean;
  width:         number;   // canvas width in world-space units
  height:        number;
}

// ── Ward colour palette ───────────────────────────────────────────────────────

export const WARD_COLORS: Record<WardType, string> = {
  market:     '#f5c842',
  church:     '#d4e8ff',
  inn:        '#e8b86a',
  smithy:     '#c04030',
  craftsmen:  '#7a8a6a',
  merchant:   '#6a9a8a',
  patriciate: '#9a8ac8',
  slum:       '#5a5248',
  gateward:   '#a09060',
  farm:       '#4a6a38',
  park:       '#3a7a48',
};

const WARD_LABELS: Record<WardType, string> = {
  market: 'Market', church: 'Church', inn: 'Inn', smithy: 'Smithy',
  craftsmen: 'Craftsmen', merchant: 'Merchant', patriciate: 'Patriciate',
  slum: 'Slum', gateward: 'Gate', farm: 'Farm', park: 'Park',
};

// ── Faction system ────────────────────────────────────────────────────────────

export type SettlementFaction =
  'human' | 'elven' | 'dwarven' | 'orcish' |
  'vampire' | 'undead' | 'vulperia' | 'slime' | 'fae';

/** Ward display names per faction — what "church" is called in an elven village, etc. */
const FACTION_WARD_NAMES: Partial<Record<SettlementFaction, Partial<Record<WardType, string>>>> = {
  undead: {
    church: 'Bone Shrine',   park: 'Graveyard',     market: 'Wraith Bazaar',
    patriciate: 'Lich Tower', craftsmen: 'Bonecrafters', slum: 'Shambling Dead',
    inn: 'Carrion Inn',       merchant: 'Specter Trade',  farm: 'Bone Fields',
    smithy: 'Death Forge',    gateward: 'Crypt Gate',
  },
  elven: {
    church: 'Ancient Shrine', park: 'Sacred Grove',  market: 'Moonlit Exchange',
    patriciate: "Elder's Hall", craftsmen: 'Artisan Quarter', slum: 'Outcast Wood',
    inn: 'Wayhouse',          merchant: 'Trade Post',      farm: 'Moon Garden',
    smithy: 'Elven Workshop', gateward: 'Forest Gate',
  },
  dwarven: {
    church: 'Stone Temple',  park: 'Mushroom Hall',  market: 'Trade Vault',
    patriciate: 'Guild Hall', craftsmen: 'Forge Quarter', slum: "Miner's Row",
    inn: "Traveler's Vault", merchant: 'Merchant Vault', farm: 'Mushroom Farm',
    smithy: 'Great Forge',   gateward: 'Iron Gate',
  },
  orcish: {
    church: 'War Shrine',    park: 'Pit Arena',      market: 'Loot Pile',
    patriciate: 'Warlord Hall', craftsmen: 'Weapon Works', slum: 'Slave Pens',
    inn: 'Mead Hall',        merchant: 'War Merchant',   farm: 'Slave Farm',
    smithy: 'Armory',        gateward: 'Warband Camp',
  },
  vampire: {
    church: 'Blood Chapel',  park: 'Moon Courtyard', market: 'Blood Market',
    patriciate: "Count's Tower", craftsmen: 'Servant Quarter', slum: 'Thrall Quarter',
    inn: 'Blood House',      merchant: 'Coven House',    farm: 'Blood Garden',
    smithy: 'Torture Chamber', gateward: 'Castle Gate',
  },
  vulperia: {
    church: "Den Mother's Hall", park: 'Burrow Commons', market: 'Night Market',
    patriciate: 'Fox Den',   craftsmen: "Tinker's Row",  slum: 'Poor Burrows',
    inn: "Wanderer's Den",   merchant: 'Merchant Den',   farm: 'Fox Garden',
    smithy: "Tinkerer's Shop", gateward: 'Burrow Gate',
  },
  slime: {
    church: 'Pulse Pool',    park: 'Slime Pool',     market: 'Goo Stall',
    patriciate: 'Elder Blob', craftsmen: 'Ooze Workshop', slum: 'Puddle Quarter',
    inn: 'Sludge Tavern',    merchant: 'Trade Blob',     farm: 'Spore Garden',
    smithy: 'Slime Forge',   gateward: 'Ooze Gate',
  },
  fae: {
    church: 'Faerie Ring',   park: 'Enchanted Glade', market: 'Twilight Market',
    patriciate: 'Fae Court', craftsmen: 'Craft Hollow',  slum: "Waif's Glen",
    inn: 'Dream Lodge',      merchant: 'Moonlit Market', farm: 'Petal Farm',
    smithy: 'Glamour Forge', gateward: 'Veil Gate',
  },
};

/** Canvas building/map colors per faction. */
interface FactionPalette { bldg: string; bldg_dk: string; bg: string; road: string; field: string; }
const FACTION_PALETTE: Record<SettlementFaction, FactionPalette> = {
  human:    { bldg: '#9a9288', bldg_dk: '#2a2520', bg: '#ddd8c8', road: '#b8b0a0', field: '#cac2ae' },
  elven:    { bldg: '#a0b888', bldg_dk: '#2a5020', bg: '#d4e0cc', road: '#8fae80', field: '#b8cfa8' },
  dwarven:  { bldg: '#9a8870', bldg_dk: '#3a2810', bg: '#cec4b0', road: '#a89070', field: '#b8a888' },
  orcish:   { bldg: '#7a8060', bldg_dk: '#283018', bg: '#c8ccb0', road: '#88907a', field: '#aaae90' },
  vampire:  { bldg: '#786080', bldg_dk: '#180828', bg: '#c0b8cc', road: '#806880', field: '#aaa0b8' },
  undead:   { bldg: '#787068', bldg_dk: '#201810', bg: '#c4bcb0', road: '#8a8278', field: '#a89e92' },
  vulperia: { bldg: '#c09060', bldg_dk: '#4a2808', bg: '#ddd0b4', road: '#c0a060', field: '#caac7a' },
  slime:    { bldg: '#70cc88', bldg_dk: '#186030', bg: '#c4e8ce', road: '#80b890', field: '#aad8b8' },
  fae:      { bldg: '#c0a0c8', bldg_dk: '#4a2870', bg: '#e0d4e8', road: '#b080c0', field: '#cdb8d8' },
};

/**
 * Preferred layout per faction — used when global layout is 'auto'.
 * Dwarven packs tight grids; elves radiate from a grove; orcs march in lines.
 */
const FACTION_LAYOUT_PREF: Partial<Record<SettlementFaction, LayoutType>> = {
  dwarven:  'grid',
  elven:    'radial',
  orcish:   'linear',
  vampire:  'perimeter',
  slime:    'cluster',
  fae:      'cluster',
  vulperia: 'cluster',
};

/**
 * Extra ward assignments injected after the standard ones — gives each
 * faction its cultural flavour without removing the base settlement logic.
 * Each entry: [wardType, minPatches to trigger, placement style].
 */
type WardPlacement = 'random' | 'central' | 'outer';
const FACTION_EXTRA_ASSIGNS: Partial<Record<SettlementFaction, Array<[WardType, number, WardPlacement]>>> = {
  undead:   [['park', 0, 'random'], ['slum', 6, 'outer']],
  elven:    [['park', 0, 'central']],
  dwarven:  [['smithy', 0, 'central'], ['smithy', 10, 'random']],
  orcish:   [['smithy', 0, 'random'], ['slum', 6, 'outer']],
  vampire:  [['patriciate', 0, 'central'], ['slum', 6, 'outer']],
  slime:    [['park', 0, 'central']],
  fae:      [['park', 0, 'central'], ['park', 10, 'random']],
  vulperia: [['inn', 0, 'central']],
};

/** Look up the faction-flavoured display name for a ward type. */
function factionWardLabel(faction: SettlementFaction, type: WardType): string {
  return FACTION_WARD_NAMES[faction]?.[type] ?? WARD_LABELS[type];
}

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

function dist(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.y - b.y); }
function centroid(pts: Vec2[]): Vec2 {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
           y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Chaikin corner-cutting — 3 passes gives smooth road curves */
function chaikin(pts: Vec2[], passes = 3): Vec2[] {
  let p = pts;
  for (let pass = 0; pass < passes; pass++) {
    const out: Vec2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      out.push({ x: lerp(a.x, b.x, 0.25), y: lerp(a.y, b.y, 0.25) });
      out.push({ x: lerp(a.x, b.x, 0.75), y: lerp(a.y, b.y, 0.75) });
    }
    out.push(p[p.length - 1]!);
    p = out;
  }
  return p;
}

// ── Ward rater functions ──────────────────────────────────────────────────────

function rateMarket(w: Ward, centre: Vec2)    { return dist(w.seed, centre); }
function rateChurch(_w: Ward, _c: Vec2, i: number) { return i; }  // low index = central
function rateInn(w: Ward, centre: Vec2)       { return dist(w.seed, centre) * 0.6; }
function ratePatriciate(w: Ward, centre: Vec2){ return dist(w.seed, centre) * 0.35; }
function rateSlum(w: Ward, centre: Vec2)      { return -dist(w.seed, centre); }
// ── Core generator ────────────────────────────────────────────────────────────

export function buildSettlement(p: GeneratorParams): SettlementModel {
  const seeds = generateBaseSeeds(p);
  return buildFromSeeds(seeds, p);
}

/** Step 1: Generate seed points (spiral + Simplex warp). Returns mutable Vec2[]. */
export function generateBaseSeeds(p: GeneratorParams): Vec2[] {
  const rand = mulberry32(p.seed);
  const noise = (nx: number, ny: number) => {
    const r = mulberry32(Math.round((nx * 73856093 ^ ny * 19349663) >>> 0) ^ p.seed);
    return r() * 2 - 1;
  };

  const CX = p.width / 2, CY = p.height / 2;
  const R  = Math.min(p.width, p.height) * 0.42;
  const sa = rand() * Math.PI * 2;

  const seeds: Vec2[] = [];
  for (let i = 0; i < p.nPatches * 8; i++) {
    const a = sa + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : R * 0.12 + i * (R * 0.018 + rand() * R * 0.012);
    const WARP_SCALE = 0.006;
    const bx = CX + Math.cos(a) * r;
    const by = CY + Math.sin(a) * r;
    seeds.push({
      x: bx + p.warp * R * 0.4 * noise(bx * WARP_SCALE, by * WARP_SCALE),
      y: by + p.warp * R * 0.4 * noise(bx * WARP_SCALE + 100, by * WARP_SCALE + 100),
    });
  }
  return seeds;
}

/** Step 2: Build SettlementModel from existing (possibly user-warped) seeds. */
type WeightedPalette = ReadonlyArray<[LayoutType, number]>;

// prettier-ignore
const ZONE_PALETTES: Record<SettlementType, Record<WardType, Record<DistZone, WeightedPalette>>> = {
  // ── Village — organic dominant, linear fringes, never grid ────────────────
  village: {
    market:     { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
    church:     { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
    inn:        { inner: [['organic',1]],                                         mid: [['organic',.8], ['linear',.2]],                                 outer: [['linear',.6],  ['organic',.4]] },
    smithy:     { inner: [['organic',.7], ['linear',.3]],                         mid: [['linear',.6],  ['organic',.4]],                                outer: [['linear',.7],  ['organic',.3]] },
    craftsmen:  { inner: [['organic',1]],                                         mid: [['organic',.7], ['linear',.2],  ['terraced',.1]],               outer: [['linear',.5],  ['organic',.35], ['terraced',.15]] },
    merchant:   { inner: [['organic',1]],                                         mid: [['organic',.8], ['linear',.2]],                                 outer: [['linear',.5],  ['organic',.5]] },
    patriciate: { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
    slum:       { inner: [['terraced',.7], ['organic',.3]],                       mid: [['terraced',.8], ['linear',.2]],                                outer: [['terraced',1]] },
    gateward:   { inner: [['linear',1]],                                          mid: [['linear',1]],                                                  outer: [['linear',1]] },
    farm:       { inner: [['linear',1]],                                          mid: [['linear',1]],                                                  outer: [['linear',1]] },
    park:       { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
  },

  // ── Town — organic core, terraced expansion, grid only outer commercial ──
  town: {
    market:     { inner: [['organic',1]],                                         mid: [['organic',.8], ['perimeter',.2]],                              outer: [['organic',.7], ['perimeter',.3]] },
    church:     { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
    inn:        { inner: [['organic',1]],                                         mid: [['organic',.9], ['linear',.1]],                                 outer: [['organic',.8], ['linear',.2]] },
    smithy:     { inner: [['organic',.6], ['linear',.4]],                         mid: [['linear',.6],  ['organic',.4]],                                outer: [['linear',.5],  ['terraced',.3], ['grid',.2]] },
    craftsmen:  { inner: [['organic',1]],                                         mid: [['organic',.5], ['terraced',.4], ['linear',.1]],                outer: [['terraced',.5], ['organic',.2], ['linear',.2], ['grid',.1]] },
    merchant:   { inner: [['organic',1]],                                         mid: [['organic',.6], ['terraced',.3], ['grid',.1]],                  outer: [['terraced',.4], ['organic',.3], ['grid',.2], ['linear',.1]] },
    patriciate: { inner: [['organic',1]],                                         mid: [['organic',.5], ['perimeter',.5]],                              outer: [['perimeter',.7], ['organic',.3]] },
    slum:       { inner: [['terraced',.8], ['organic',.2]],                       mid: [['terraced',1]],                                                outer: [['terraced',1]] },
    gateward:   { inner: [['linear',1]],                                          mid: [['linear',1]],                                                  outer: [['linear',.7], ['grid',.3]] },
    farm:       { inner: [['linear',1]],                                          mid: [['linear',1]],                                                  outer: [['linear',1]] },
    park:       { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
  },

  // ── City — organic core, perimeter/terraced mid, varied outer ────────────
  city: {
    market:     { inner: [['perimeter',.7], ['organic',.3]],                      mid: [['perimeter',1]],                                               outer: [['perimeter',.7], ['grid',.3]] },
    church:     { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
    inn:        { inner: [['organic',1]],                                         mid: [['organic',.8], ['terraced',.2]],                               outer: [['organic',.7], ['terraced',.3]] },
    smithy:     { inner: [['organic',.5], ['linear',.5]],                         mid: [['linear',.5],  ['terraced',.3], ['grid',.2]],                  outer: [['terraced',.4], ['grid',.35], ['linear',.25]] },
    craftsmen:  { inner: [['organic',1]],                                         mid: [['organic',.4], ['terraced',.4], ['perimeter',.2]],             outer: [['terraced',.45], ['grid',.3], ['organic',.15], ['linear',.1]] },
    merchant:   { inner: [['organic',.7], ['perimeter',.3]],                      mid: [['perimeter',.4], ['terraced',.35], ['grid',.25]],              outer: [['grid',.35], ['terraced',.35], ['perimeter',.2], ['organic',.1]] },
    patriciate: { inner: [['organic',.6], ['perimeter',.4]],                      mid: [['perimeter',.75], ['organic',.25]],                            outer: [['perimeter',.8], ['organic',.2]] },
    slum:       { inner: [['terraced',.9], ['organic',.1]],                       mid: [['terraced',1]],                                                outer: [['terraced',1]] },
    gateward:   { inner: [['linear',1]],                                          mid: [['linear',.6],  ['terraced',.4]],                               outer: [['linear',.5],  ['grid',.3], ['terraced',.2]] },
    farm:       { inner: [['linear',1]],                                          mid: [['linear',1]],                                                  outer: [['linear',1]] },
    park:       { inner: [['organic',1]],                                         mid: [['organic',1]],                                                 outer: [['organic',1]] },
  },
};


export function assignWardLayouts(
  wards:    Ward[],
  centre:   Vec2,
  radius:   number,
  type:     SettlementType,
  global:   LayoutType,
): void {
  for (const ward of wards) {
    if (!ward.withinCity) { ward.wardLayout = 'linear'; continue; }

    if (global !== 'auto') {
      ward.wardLayout = global;
      continue;
    }

    // Auto mode: look up base layout from zone table
    const d    = dist(ward.center, centre);
    const r    = radius > 0 ? d / radius : 0;
    const zone: DistZone = r < 0.35 ? 'inner' : r < 0.65 ? 'mid' : 'outer';
    const palette = ZONE_PALETTES[type]?.[ward.type]?.[zone] ?? [['organic', 1]] as WeightedPalette;

    // DNA mutation: seeded per-ward so every settlement feels unique
    const wardRand = mulberry32((Math.round(ward.seed.x * 7919) ^ Math.round(ward.seed.y * 31337)) >>> 0);
    const roll = wardRand();
    let accum = 0;
    let chosen: LayoutType = palette[0]![0];
    for (const [layout, weight] of palette) {
      accum += weight;
      if (roll < accum) { chosen = layout; break; }
    }
    ward.wardLayout = chosen;
  }
}

/**
 * Grid layout: buildings arranged in tight orthogonal rows aligned to the
 * canvas axes (or a fixed dominant angle). Like Roman castra, American blocks.
 */

export function buildFromSeeds(seeds: Vec2[], p: GeneratorParams): SettlementModel {
  const t0   = performance.now();
  const rand = mulberry32(p.seed);
  const CX   = p.width / 2, CY = p.height / 2;
  const R    = Math.min(p.width, p.height) * 0.42;

  const delaunay = Delaunay.from(seeds, (s: Vec2) => s.x, (s: Vec2) => s.y);
  const voronoi   = delaunay.voronoi([0, 0, p.width, p.height]);

  // 4. Extract cell polygons
  const polygons: Vec2[][] = [];
  for (let i = 0; i < seeds.length; i++) {
    const poly = voronoi.cellPolygon(i);
    if (poly) polygons.push(poly.map(([x, y]: [number, number]) => ({ x, y })));
    else polygons.push([]);
  }

  // 5. Lloyd relax central N cells × 2 iterations
  // (simplified: move central seeds toward centroid)
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < Math.min(4, p.nPatches); i++) {
      const poly = polygons[i];
      if (poly && poly.length) {
        const c = centroid(poly);
        seeds[i] = { x: lerp(seeds[i]!.x, c.x, 0.5), y: lerp(seeds[i]!.y, c.y, 0.5) };
      }
    }
  }

  // 6. Pick inner city patches (first nPatches seeds are sorted by distance from centre)
  const centre: Vec2 = { x: CX, y: CY };
  const sortedIdx = seeds
    .map((s, i) => ({ i, d: dist(s, centre) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, p.nPatches)
    .map(x => x.i);

  // 7. Create Ward objects
  const wards: Ward[] = sortedIdx.map((si, _rank) => ({
    type:       'craftsmen' as WardType,
    seed:       seeds[si]!,
    polygon:    polygons[si] ?? [],
    withinCity: true,
    center:     centroid(polygons[si] ?? [{ x: seeds[si]!.x, y: seeds[si]!.y }]),
    wardLayout: 'organic' as LayoutType,
  }));

  // Add outer farm patches for context
  for (let i = 0; i < seeds.length; i++) {
    if (sortedIdx.includes(i)) continue;
    if (dist(seeds[i]!, centre) > R * 1.5) continue;
    const poly = polygons[i] ?? [];
    wards.push({ type: 'farm', seed: seeds[i]!, polygon: poly,
                 withinCity: false, center: centroid(poly.length ? poly : [seeds[i]!]),
                 wardLayout: 'linear' as LayoutType });
  }

  // 8. Assign ward types to inner city patches
  const inner = wards.filter(w => w.withinCity);
  const unassigned = [...inner];

  const assign = (type: WardType, rateFn: (w: Ward) => number) => {
    if (!unassigned.length) return;
    const best = unassigned.reduce((a, b) => rateFn(a) < rateFn(b) ? a : b);
    best.type = type;
    unassigned.splice(unassigned.indexOf(best), 1);
  };

  if (p.hasPlaza) assign('market',    w => rateMarket(w, centre));
  assign('church',    w => rateChurch(w, centre, inner.indexOf(w)));
  assign('inn',       w => rateInn(w, centre));
  assign('smithy',    () => rand());
  if (p.nPatches >= 8)  assign('patriciate', w => ratePatriciate(w, centre));
  if (p.nPatches >= 10) assign('merchant',   () => rand());
  if (p.nPatches >= 12) assign('slum',       w => rateSlum(w, centre));
  if (p.nPatches >= 16) assign('park',       () => rand());

  // Faction extra assigns — cultural flavour on top of standard types
  const factionExtras = FACTION_EXTRA_ASSIGNS[p.faction];
  if (factionExtras) {
    for (const [type, minP, placement] of factionExtras) {
      if (p.nPatches >= minP && unassigned.length > 0) {
        const rateFn = placement === 'central' ? (w: Ward) => dist(w.seed, centre)
                     : placement === 'outer'   ? (w: Ward) => -dist(w.seed, centre)
                     : () => rand();
        assign(type, rateFn);
      }
    }
  }
  // rest stay 'craftsmen'

  // 9. Gate points — distribute around the city perimeter
  const perimeterSeeds = inner.sort((a, b) => dist(b.seed, centre) - dist(a.seed, centre))
    .slice(0, p.nGates * 2);
  const gates: Vec2[] = [];
  const usedAngles: number[] = [];
  for (const w of perimeterSeeds) {
    if (gates.length >= p.nGates) break;
    const angle = Math.atan2(w.seed.y - CY, w.seed.x - CX);
    if (usedAngles.every(a => Math.abs(a - angle) > Math.PI * 0.4)) {
      const gx = CX + Math.cos(angle) * R * 0.95;
      const gy = CY + Math.sin(angle) * R * 0.95;
      gates.push({ x: gx, y: gy });
      usedAngles.push(angle);
    }
  }

  // 10. Build roads: each gate → centre via Voronoi edge graph (simplified: straight then Chaikin)
  const roads: Road[] = [];
  const marketWard = wards.find(w => w.type === 'market') ?? wards[0]!;
  const hub = marketWard.center;

  for (const gate of gates) {
    // Build a path: gate → intermediate waypoints → hub
    // Waypoints: pick the 2 closest inner ward centres that lie between gate and hub
    const angle = Math.atan2(hub.y - gate.y, hub.x - gate.x);
    const waypts = inner
      .filter(w => w.type !== 'market')
      .map(w => ({
        w,
        d:     dist(w.center, gate),
        align: Math.cos(Math.atan2(w.center.y - gate.y, w.center.x - gate.x) - angle),
      }))
      .filter(x => x.align > 0.5 && x.d < dist(gate, hub))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map(x => x.w.center);

    const rawPts: Vec2[] = [gate, ...waypts, hub];
    roads.push({ points: chaikin(rawPts, 3) });
  }

  // Optional wall polygon
  let wall: Vec2[] | undefined;
  if (p.walled) {
    // Convex hull of inner ward seeds, slightly expanded
    const hullPts = inner.map(w => w.seed);
    wall = convexHullExpanded(hullPts, centre, R * 0.05);
  }

  const cityRadius = inner.reduce((r, w) => Math.max(r, dist(w.seed, centre)), 0);

  // 11. Assign per-ward layout types — faction overrides layout when auto
  const factionLayoutPref = FACTION_LAYOUT_PREF[p.faction];
  const effectiveLayout = p.layout === 'auto' && factionLayoutPref ? factionLayoutPref : p.layout;
  assignWardLayouts(wards, centre, cityRadius, p.type, effectiveLayout);

  return {
    wards, roads, wall, gates, centre,
    radius:    cityRadius,
    seed:      p.seed,
    genTimeMs: performance.now() - t0,
  };
}

// ── Convex hull (gift-wrapping) ───────────────────────────────────────────────

function convexHullExpanded(pts: Vec2[], centre: Vec2, expand: number): Vec2[] {
  if (pts.length < 3) return pts;
  // Find leftmost point
  let start = pts.reduce((a, b) => a.x < b.x ? a : b);
  const hull: Vec2[] = [];
  let current = start;
  do {
    hull.push(current);
    let next = pts[0]!;
    for (const p of pts) {
      const cross = (next.x - current.x) * (p.y - current.y)
                  - (next.y - current.y) * (p.x - current.x);
      if (next === current || cross > 0) next = p;
    }
    current = next;
  } while (current !== start && hull.length < pts.length + 1);

  // Expand outward from centre
  return hull.map(p => {
    const dx = p.x - centre.x, dy = p.y - centre.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / d * expand, y: p.y + dy / d * expand };
  });
}

// ── 2.5D cartographic renderer ─────────────────────────────────────────────
// Inspired by Watabou's city-generator: cream background, grey buildings,
// streets visible as negative space between ward polygons, subtle 2px shadow.
// Building lots are grid-filled aligned to the dominant ward edge direction.

// ── Colour palette ────────────────────────────────────────────────────────────

const CARTO = {
  bg:       '#ddd8c8',   // cream background (streets + fields)
  field:    '#cac2ae',   // slightly darker for farms
  city_gnd: '#d4cebb',   // city ground between wards
  bldg:     '#9a9288',   // generic building grey
  bldg_dk:  '#2a2520',   // church / citadel
  bldg_mkt: '#b0a890',   // market area
  shadow:   'rgba(0,0,0,0.28)',
  road_dk:  '#b8b0a0',
  road_lt:  '#ccc4b4',
  wall:     '#6a6258',
  water:    '#8aacbe',
  label:    'rgba(40,35,28,0.85)',
};

/** Angle of the longest polygon edge — dominant street direction. */
function dominantEdgeAngle(poly: Vec2[]): number {
  let max = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i+1) % poly.length]!;
    const d = (b.x-a.x)**2 + (b.y-a.y)**2;
    if (d > max) { max = d; ang = Math.atan2(b.y-a.y, b.x-a.x); }
  }
  return ang;
}

/** Minimum distance from pt to any edge of poly. */
function minDistToEdge(pt: Vec2, poly: Vec2[]): number {
  let minD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i+1) % poly.length]!;
    const dx = b.x-a.x, dy = b.y-a.y, len2 = dx*dx+dy*dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((pt.x-a.x)*dx+(pt.y-a.y)*dy)/len2));
    const ex = a.x+t*dx-pt.x, ey = a.y+t*dy-pt.y;
    minD = Math.min(minD, Math.sqrt(ex*ex+ey*ey));
  }
  return minD;
}

/** Draw a flat building rectangle (shadow then fill). Skips if too close to a road. */
function drawBldg(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, bw: number, bh: number,
  rot: number, fill: string,
): void {
  // Road-building separation is handled implicitly by ward polygon setback —
  // roads run between wards so the STREET gap naturally creates the clearance.
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const hw = bw/2, hh = bh/2;
  const pts: [number,number][] = [
    [cx + cos*-hw - sin*-hh, cy + sin*-hw + cos*-hh],
    [cx + cos* hw - sin*-hh, cy + sin* hw + cos*-hh],
    [cx + cos* hw - sin* hh, cy + sin* hw + cos* hh],
    [cx + cos*-hw - sin* hh, cy + sin*-hw + cos* hh],
  ];
  // Shadow (offset upper-right)
  const SX = 2, SY = -2;
  ctx.beginPath();
  pts.forEach(([x,y], i) => i ? ctx.lineTo(x+SX, y+SY) : ctx.moveTo(x+SX, y+SY));
  ctx.closePath();
  ctx.fillStyle = CARTO.shadow;
  ctx.fill();
  // Building face
  ctx.beginPath();
  pts.forEach(([x,y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ── Organic building layout helpers ──────────────────────────────────────────
class OccupancyGrid {
  private readonly cells = new Set<number>();
  private readonly W: number;
  private static readonly CELL = 6;

  constructor(canvasW: number, canvasH: number) {
    this.W = Math.ceil(canvasW / OccupancyGrid.CELL) + 1;
    void canvasH;
  }

  private _key(gx: number, gy: number): number { return gx + gy * this.W; }

  /** Returns true if the rotated rect would touch any occupied cell. */
  blocked(cx: number, cy: number, bw: number, bh: number, angle: number): boolean {
    const C = OccupancyGrid.CELL;
    const hw = bw * 0.5 + 1, hh = bh * 0.5 + 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    // Axis-aligned bounding box of the rotated rect
    const dx = Math.abs(cos * hw) + Math.abs(sin * hh);
    const dy = Math.abs(sin * hw) + Math.abs(cos * hh);
    const x0 = Math.floor((cx - dx) / C), x1 = Math.ceil((cx + dx) / C);
    const y0 = Math.floor((cy - dy) / C), y1 = Math.ceil((cy + dy) / C);
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++)
        if (this.cells.has(this._key(gx, gy))) return true;
    return false;
  }

  /** Mark the rotated rect as occupied. */
  mark(cx: number, cy: number, bw: number, bh: number, angle: number): void {
    const C = OccupancyGrid.CELL;
    const hw = bw * 0.5, hh = bh * 0.5;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = Math.abs(cos * hw) + Math.abs(sin * hh);
    const dy = Math.abs(sin * hw) + Math.abs(cos * hh);
    const x0 = Math.floor((cx - dx) / C), x1 = Math.ceil((cx + dx) / C);
    const y0 = Math.floor((cy - dy) / C), y1 = Math.ceil((cy + dy) / C);
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++)
        this.cells.add(this._key(gx, gy));
  }
}

/** Total perimeter length of a polygon. */
function polygonPerimeter(poly: Vec2[]): number {
  let t = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i+1) % poly.length]!;
    t += Math.hypot(b.x-a.x, b.y-a.y);
  }
  return t;
}

/** Sample a point and tangent angle at normalised parameter t along the perimeter. */
function samplePerimeter(poly: Vec2[], t: number): { x: number; y: number; angle: number } {
  const total = polygonPerimeter(poly);
  const target = ((t % 1) + 1) % 1 * total;
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i+1) % poly.length]!;
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (acc + len >= target) {
      const f = (target - acc) / len;
      return { x: a.x+(b.x-a.x)*f, y: a.y+(b.y-a.y)*f, angle: Math.atan2(b.y-a.y, b.x-a.x) };
    }
    acc += len;
  }
  const a = poly[poly.length-1]!, b = poly[0]!;
  return { x: a.x, y: a.y, angle: Math.atan2(b.y-a.y, b.x-a.x) };
}

/**
 * Organic building fill — samples points along the ward polygon perimeter,
 * pushes each building inward toward the centroid, and orients it to the
 * local street edge direction.  Multiple rows fan inward.
 *
 * This produces medieval-looking rows of buildings that curve with the street.
 */
function fillWardOrganically(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[],
  wardType: WardType,
  wardSeed: number,
  occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;

  // Building footprint (along-street × depth into block)
  const ALONG = wardType === 'slum'       ? 14
              : wardType === 'patriciate' ? 22
              : wardType === 'craftsmen'  ? 17
              : 18;
  const DEPTH = wardType === 'slum'       ? 11
              : wardType === 'patriciate' ? 16
              : wardType === 'craftsmen'  ? 14
              : 14;
  const BLDG_GAP  = 3;    // gap between buildings in the same row
  const STREET    = 6;    // setback from ward polygon edge → visible street
  const ROW_GAP   = 3;    // gap between rows of buildings
  const MAX_ROWS  = 3;    // max rows per ward (prevents overcrowding small wards)

  const col = wardType === 'gateward' ? CARTO.bldg_dk
            : wardType === 'merchant' ? '#908878' : CARTO.bldg;

  const rand = mulberry32(wardSeed);
  const cent = centroid(poly);
  const perimeter = polygonPerimeter(poly);

  // Number of buildings that fit along the perimeter at this step
  const step = ALONG + BLDG_GAP;
  const nSamples = Math.max(4, Math.floor(perimeter / step));

  // Estimate ward "depth" = min distance from centroid to any edge
  const centInset = minDistToEdge(cent, poly);
  const wardDepth = Math.max(DEPTH, centInset - STREET);

  const nRows = Math.min(MAX_ROWS, Math.max(1, Math.floor((wardDepth) / (DEPTH + ROW_GAP))));

  for (let row = 0; row < nRows; row++) {
    const insetDist = STREET + row * (DEPTH + ROW_GAP) + DEPTH * 0.5;

    // Phase-offset each row so buildings stagger (brick-pattern feel)
    const phaseOffset = row % 2 === 1 ? 0.5 / nSamples : 0;

    for (let si = 0; si < nSamples; si++) {
      const t = (si + phaseOffset) / nSamples;
      const { x: ex, y: ey, angle: edgeAngle } = samplePerimeter(poly, t);

      // Inward direction: from this edge point toward centroid
      const inDx = cent.x - ex, inDy = cent.y - ey;
      const inLen = Math.hypot(inDx, inDy);
      if (inLen < 1) continue;
      const nx = inDx / inLen, ny = inDy / inLen;

      const bx = ex + nx * insetDist;
      const by = ey + ny * insetDist;

      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (_activeRoads.length > 0 && minDistToRoads({ x: bx, y: by }, _activeRoads) < ROAD_CLEARANCE) continue;

      // Slight size + angle variation (seeded)
      const aw    = ALONG * (0.75 + rand() * 0.35);
      const dh    = DEPTH * (0.75 + rand() * 0.35);
      const jitter = (rand() - 0.5) * 0.15;
      const finalAngle = edgeAngle + jitter;
      if (occ.blocked(bx, by, aw, dh, finalAngle)) continue;
      occ.mark(bx, by, aw, dh, finalAngle);
      drawBldg(ctx, bx, by, aw, dh, finalAngle, col);
    }
  }
}

// ── Ward layout mixing rules + DNA mutation ─────────────────────────────────
//
// Weighted palettes: each entry is [LayoutType, probability].  Weights sum to 1.
// DNA mutation is baked in — different ward seeds produce natural variety.
//
// Weighted palettes: each entry is [LayoutType, probability].  Weights sum to 1.
// DNA mutation is baked in — different ward seeds produce natural variety.
//
// Key philosophy (from research):
//   inner always organic (first growth, historic core)
//   mid = planned expansion character (depends heavily on ward type)
//   outer = organic reduced, terraced/grid grows — but NOT dominated by pure grid
//   Slum always terraced; church always organic; gateward always linear
//
// Village: mostly organic + linear edges — never grid
// Town:    organic core → terraced expansion — grid only in outer commercial
// City:    organic core → perimeter/terraced mid → varied outer (terraced dominates)

type DistZone = 'inner' | 'mid' | 'outer';

// ── Road-clearance helpers ────────────────────────────────────────────────────

/** Minimum distance from point to any road segment in the model. */
function minDistToRoads(pt: Vec2, roads: Road[]): number {
  let minD = Infinity;
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!, b = road.points[i + 1]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x-a.x)*dx + (pt.y-a.y)*dy) / len2)) : 0;
      const ex = a.x + t*dx - pt.x, ey = a.y + t*dy - pt.y;
      minD = Math.min(minD, Math.sqrt(ex*ex + ey*ey));
    }
  }
  return minD;
}

/** Active roads — set once per drawSettlement2D5 call so all fill fns can see them. */
let _activeRoads: Road[] = [];
/** Buildings must be at least this far from any road centre-line. */
const ROAD_CLEARANCE = 10; // buildings must be at least this far from any road centre-line

function fillWardGrid(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const BW = 16, BH = 13, GAP = 6, STREET = 5;
  // Fixed axis: all buildings axis-aligned (grid)
  const angle = 0;
  const cos = 1, sin = 0, uncos = 1, unsin = 0;
  const rot = poly.map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  const minX = Math.min(...rot.map(p => p.x)), maxX = Math.max(...rot.map(p => p.x));
  const minY = Math.min(...rot.map(p => p.y)), maxY = Math.max(...rot.map(p => p.y));
  for (let ry = minY + STREET; ry + BH < maxY - STREET + 1; ry += BH + GAP) {
    for (let rx = minX + STREET; rx + BW < maxX - STREET + 1; rx += BW + GAP) {
      const rcx = rx + BW * 0.5, rcy = ry + BH * 0.5;
      const wcx = rcx * uncos - rcy * unsin, wcy = rcx * unsin + rcy * uncos;
      if (!pointInPolygon({ x: wcx, y: wcy }, poly)) continue;
      if (minDistToEdge({ x: wcx, y: wcy }, poly) < STREET - 1) continue;
      if (_activeRoads.length > 0 && minDistToRoads({ x: wcx, y: wcy }, _activeRoads) < ROAD_CLEARANCE) continue;
      const aw = BW * (0.82 + rand() * 0.2), dh = BH * (0.82 + rand() * 0.2);
      if (occ.blocked(wcx, wcy, aw, dh, angle)) continue;
      occ.mark(wcx, wcy, aw, dh, angle);
      drawBldg(ctx, wcx, wcy, aw, dh, angle, col);
    }
  }
}

/**
 * Linear layout: all buildings squeezed into two rows flanking the main road.
 * Classic Welsh valley / Strassendorf — creates very readable ribbon feel.
 */
function fillWardLinear(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col  = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const angle = dominantEdgeAngle(poly);
  const cent  = centroid(poly);
  const perimeter = polygonPerimeter(poly);
  const ALONG = 18, DEPTH = 12, STREET = 5, GAP = 3;
  const nSamples = Math.max(4, Math.floor(perimeter / (ALONG + GAP)));

  // Only two rows — front and back flanking the main axis
  for (const row of [0, 1]) {
    const insetDist = STREET + row * (perimeter * 0.22); // front vs back
    for (let si = 0; si < nSamples; si++) {
      const t = si / nSamples;
      const { x: ex, y: ey } = samplePerimeter(poly, t);
      const inDx = cent.x - ex, inDy = cent.y - ey;
      const inLen = Math.hypot(inDx, inDy);
      if (inLen < 1) continue;
      const nx = inDx / inLen, ny = inDy / inLen;
      const bx = ex + nx * insetDist, by = ey + ny * insetDist;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (_activeRoads.length > 0 && minDistToRoads({ x: bx, y: by }, _activeRoads) < ROAD_CLEARANCE) continue;
      const aw = ALONG * (0.8 + rand() * 0.3), dh = DEPTH * (0.8 + rand() * 0.25);
      const jitter = (rand() - 0.5) * 0.08;
      const fa = angle + jitter;
      if (occ.blocked(bx, by, aw, dh, fa)) continue;
      occ.mark(bx, by, aw, dh, fa);
      drawBldg(ctx, bx, by, aw, dh, fa, col);
    }
  }
}

/**
 * Terraced rows: parallel continuous strips running across the ward.
 * Each strip is a single long building (no gaps between individual houses).
 * Very Welsh/English — valleys, Victorian, Georgian.
 */
function fillWardTerraced(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col   = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const angle = dominantEdgeAngle(poly);
  const cos   = Math.cos(-angle), sin = Math.sin(-angle);
  const uncos = Math.cos(angle),  unsin = Math.sin(angle);
  const rot   = poly.map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  const minX  = Math.min(...rot.map(p => p.x)), maxX = Math.max(...rot.map(p => p.x));
  const minY  = Math.min(...rot.map(p => p.y)), maxY = Math.max(...rot.map(p => p.y));
  const ROW_H = 13, STREET = 5, ROW_GAP = 6;

  for (let ry = minY + STREET; ry + ROW_H < maxY - STREET + 1; ry += ROW_H + ROW_GAP) {
    const rowCY  = ry + ROW_H * 0.5;
    // Find left/right extents of the polygon at this row
    let rowMinX = maxX, rowMaxX = minX;
    for (let rx = minX; rx <= maxX; rx += 2) {
      const wcx = rx * uncos - rowCY * unsin, wcy = rx * unsin + rowCY * uncos;
      if (pointInPolygon({ x: wcx, y: wcy }, poly) &&
          minDistToEdge({ x: wcx, y: wcy }, poly) >= STREET - 1 &&
          (_activeRoads.length === 0 || minDistToRoads({ x: wcx, y: wcy }, _activeRoads) >= ROAD_CLEARANCE)) {
        rowMinX = Math.min(rowMinX, rx);
        rowMaxX = Math.max(rowMaxX, rx);
      }
    }
    if (rowMaxX <= rowMinX) continue;

    // Divide the row into terraced house units
    const rowLen    = rowMaxX - rowMinX;
    const houseW    = 12 + rand() * 6;  // each terrace unit width
    const nHouses   = Math.max(1, Math.floor(rowLen / houseW));
    const actualW   = rowLen / nHouses;

    for (let h = 0; h < nHouses; h++) {
      const rcx   = rowMinX + (h + 0.5) * actualW;
      const rcy   = rowCY;
      const wcx   = rcx * uncos - rcy * unsin;
      const wcy   = rcx * unsin + rcy * uncos;
      const bw    = actualW - 0.5;  // tiny gap = party walls implied
      const bh    = ROW_H * (0.88 + rand() * 0.12);
      if (_activeRoads.length > 0 && minDistToRoads({ x: wcx, y: wcy }, _activeRoads) < ROAD_CLEARANCE) continue;
      if (occ.blocked(wcx, wcy, bw, bh, angle)) continue;
      occ.mark(wcx, wcy, bw, bh, angle);
      drawBldg(ctx, wcx, wcy, bw, bh, angle, col);
    }
  }
}

/**
 * Perimeter block: buildings line the edge of the ward, leaving a hollow
 * courtyard centre — Barcelona Eixample, Vienna, Helsinki.
 */
function fillWardPerimeter(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const DEPTH  = 14, STREET = 5, ALONG = 16, GAP = 2.5;
  const perimeter = polygonPerimeter(poly);
  const nSamples  = Math.max(4, Math.floor(perimeter / (ALONG + GAP)));
  const cent      = centroid(poly);

  // One ring of buildings just inside the perimeter
  for (let si = 0; si < nSamples; si++) {
    const t  = si / nSamples;
    const { x: ex, y: ey, angle: edgeAngle } = samplePerimeter(poly, t);
    const inDx = cent.x - ex, inDy = cent.y - ey;
    const inLen = Math.hypot(inDx, inDy);
    if (inLen < 1) continue;
    const nx = inDx / inLen, ny = inDy / inLen;
    const inset = STREET + DEPTH * 0.5;
    const bx = ex + nx * inset, by = ey + ny * inset;
    if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
    if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 1) continue;
    if (_activeRoads.length > 0 && minDistToRoads({ x: bx, y: by }, _activeRoads) < ROAD_CLEARANCE) continue;
    const aw = ALONG * (0.8 + rand() * 0.3), dh = DEPTH * (0.85 + rand() * 0.2);
    const jitter = (rand() - 0.5) * 0.1;
    const fa = edgeAngle + jitter;
    if (occ.blocked(bx, by, aw, dh, fa)) continue;
    occ.mark(bx, by, aw, dh, fa);
    drawBldg(ctx, bx, by, aw, dh, fa, col);
  }

  // Hollow courtyard: render as lighter fill
  const shrunkPoly = poly.map(p => {
    const dx = cent.x - p.x, dy = cent.y - p.y;
    const d  = Math.hypot(dx, dy);
    const s  = (STREET + DEPTH + 4) / d;
    return { x: p.x + dx * s, y: p.y + dy * s };
  });
  if (shrunkPoly.length > 2) {
    ctx.beginPath();
    shrunkPoly.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y));
    ctx.closePath();
    ctx.fillStyle = '#ccc4b4';
    ctx.fill();
  }
}

/**
 * Radial layout: buildings placed in concentric arcs around the ward centre.
 * Like the rings around a plaza, or Baroque rond-point arrangement.
 */
function fillWardRadial(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col  = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const cent = centroid(poly);
  const centInset = minDistToEdge(cent, poly);
  const STREET = 5, DEPTH = 12, GAP = 3, ALONG = 15;

  for (let ring = 0; ring * (DEPTH + GAP) < centInset - STREET - DEPTH; ring++) {
    const r   = STREET + ring * (DEPTH + GAP) + DEPTH * 0.5;
    const circ = 2 * Math.PI * r;
    const n    = Math.max(3, Math.floor(circ / (ALONG + GAP)));
    for (let i = 0; i < n; i++) {
      const a  = (2 * Math.PI * i) / n;
      const bx = cent.x + Math.cos(a) * r;
      const by = cent.y + Math.sin(a) * r;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (_activeRoads.length > 0 && minDistToRoads({ x: bx, y: by }, _activeRoads) < ROAD_CLEARANCE) continue;
      const aw = ALONG * (0.82 + rand() * 0.25), dh = DEPTH * (0.82 + rand() * 0.25);
      const fa = a + Math.PI * 0.5 + (rand() - 0.5) * 0.12;  // tangent to ring
      if (occ.blocked(bx, by, aw, dh, fa)) continue;
      occ.mark(bx, by, aw, dh, fa);
      drawBldg(ctx, bx, by, aw, dh, fa, col);
    }
  }
}

/**
 * Cluster layout: Islamic medina / hosh / Venetian campo style.
 * Poisson-disk cluster centres are scattered inside the ward. Around each
 * centre, 3–5 buildings are arranged facing inward toward a tiny shared
 * courtyard. The gap between clusters IS the circulation path.
 */
function fillWardClustered(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col  = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const cent = centroid(poly);

  const COURT_R  = 7;   // courtyard radius (buildings orbit this distance from cluster centre)
  const ALONG    = 12;  // building length along the court arc
  const DEPTH    = 10;  // building depth (radially outward)
  const STREET   = 5;   // setback from ward boundary
  const CLUSTER_MIN_DIST = 28; // Poisson-disk minimum distance between cluster centres

  // Place cluster centres using a simple rejection-based Poisson-disk
  const clusterCentres: Vec2[] = [];
  const warmupIter = 80;
  for (let attempt = 0; attempt < warmupIter; attempt++) {
    // Sample a point inside the polygon's bounding box
    const bbox = poly.reduce(
      (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
                   minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const cx = bbox.minX + rand() * (bbox.maxX - bbox.minX);
    const cy = bbox.minY + rand() * (bbox.maxY - bbox.minY);
    const candidate: Vec2 = { x: cx, y: cy };
    if (!pointInPolygon(candidate, poly)) continue;
    if (minDistToEdge(candidate, poly) < STREET + DEPTH) continue;
    if (_activeRoads.length > 0 && minDistToRoads(candidate, _activeRoads) < ROAD_CLEARANCE + DEPTH) continue;
    if (clusterCentres.some(c => Math.hypot(c.x - cx, c.y - cy) < CLUSTER_MIN_DIST)) continue;
    clusterCentres.push(candidate);
  }

  // For each cluster centre, place 3–5 buildings radially around it
  for (const cc of clusterCentres) {
    const nBldg = 3 + Math.floor(rand() * 3);  // 3–5 buildings per cluster
    for (let b = 0; b < nBldg; b++) {
      const a = (2 * Math.PI * b) / nBldg + rand() * 0.3;
      const bx = cc.x + Math.cos(a) * COURT_R;
      const by = cc.y + Math.sin(a) * COURT_R;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 1) continue;
      if (_activeRoads.length > 0 && minDistToRoads({ x: bx, y: by }, _activeRoads) < ROAD_CLEARANCE) continue;
      const aw = ALONG * (0.8 + rand() * 0.3);
      const dh = DEPTH * (0.8 + rand() * 0.3);
      const fa = a + (rand() - 0.5) * 0.2;  // tangent to court + small jitter
      if (occ.blocked(bx, by, aw, dh, fa)) continue;
      occ.mark(bx, by, aw, dh, fa);
      drawBldg(ctx, bx, by, aw, dh, fa, col);
    }
  }
}

/** Dispatch to the correct fill strategy using ward's assigned layout. */
function fillWard(
  ctx: CanvasRenderingContext2D,
  ward: Ward, occ: OccupancyGrid,
): void {
  const wardSeed = Math.round(ward.center.x * 97 + ward.center.y * 53);
  const layout = ward.wardLayout;
  switch (layout) {
    case 'grid':      return fillWardGrid     (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'linear':    return fillWardLinear   (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'terraced':  return fillWardTerraced (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'perimeter': return fillWardPerimeter(ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'radial':    return fillWardRadial   (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'cluster':   return fillWardClustered(ctx, ward.polygon, ward.type, wardSeed, occ);
    default:          return fillWardOrganically(ctx, ward.polygon, ward.type, wardSeed, occ);
  }
}

export function drawSettlement2D5(
  model: SettlementModel,
  canvas: HTMLCanvasElement,
  showLabels = true,
  layout: LayoutType = 'organic',
  faction: SettlementFaction = 'human',
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Apply faction palette (mutates CARTO — each draw resets it)
  const pal = FACTION_PALETTE[faction];
  CARTO.bldg    = pal.bldg;
  CARTO.bldg_dk = pal.bldg_dk;
  CARTO.bg      = pal.bg;
  CARTO.road_dk = pal.road;
  CARTO.field   = pal.field;

  // Set active roads so drawBldg can check road clearance
  _activeRoads = model.roads;

  // ── Background ───────────────────────────────────────────────────────────────
  ctx.fillStyle = CARTO.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(0,0,0,0.045)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // ── Fields (outer wards) — hachure fill ─────────────────────────────────────
  for (const ward of model.wards) {
    if (ward.withinCity || !ward.polygon.length) continue;
    ctx.beginPath();
    ward.polygon.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = CARTO.field;
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(80,70,50,0.12)'; ctx.lineWidth = 0.8;
    for (let x = -H; x < W+H; x += 10) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Roads ─────────────────────────────────────────────────────────────────────
  for (let ri = 0; ri < model.roads.length; ri++) {
    const road = model.roads[ri]!;
    if (road.points.length < 2) continue;
    const main = ri === 0;
    ctx.beginPath();
    road.points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.strokeStyle = CARTO.road_dk;
    ctx.lineWidth   = main ? 5 : 3.5;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = CARTO.road_lt;
    ctx.lineWidth   = main ? 3 : 2;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ── Buildings (painter order: low Y last = in front) ─────────────────────────
  const occ = new OccupancyGrid(W, H);
  const sorted = model.wards.filter(w => w.withinCity)
    .sort((a,b) => a.center.y - b.center.y);

  for (const ward of sorted) {
    if (!ward.polygon.length) continue;

    if (ward.type === 'church') {
      // Prominent church: large footprint + spire cross
      const cx = ward.center.x, cy = ward.center.y;
      const churchAngle = dominantEdgeAngle(ward.polygon);
      occ.mark(cx, cy, 20, 28, churchAngle);
      drawBldg(ctx, cx, cy, 20, 28, churchAngle, CARTO.bldg_dk);
      // Spire (smaller, offset via 2px shadow so it reads as taller)
      drawBldg(ctx, cx-1, cy-3, 7, 7, 0, '#1a1512');
      // Cross at apex
      ctx.strokeStyle = '#0a0a08'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx-5,cy-7); ctx.lineTo(cx+5,cy-7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy-11); ctx.lineTo(cx,cy-4); ctx.stroke();
      continue;
    }

    if (ward.type === 'market') {
      // Open market square: light fill + perimeter stalls
      ctx.beginPath();
      ward.polygon.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = '#ccc4b4';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1; ctx.stroke();
      // Small stalls along edges
      for (let i = 0; i < ward.polygon.length; i++) {
        const a = ward.polygon[i]!, b = ward.polygon[(i+1)%ward.polygon.length]!;
        const ang = Math.atan2(b.y-a.y, b.x-a.x);
        const len = Math.hypot(b.x-a.x, b.y-a.y);
        for (let t = 0.1; t < 0.9; t += 12/len) {
          const sx = a.x+(b.x-a.x)*t, sy = a.y+(b.y-a.y)*t;
          if (minDistToEdge({x:sx,y:sy}, ward.polygon) < 3) continue;
          if (occ.blocked(sx, sy, 6, 8, ang)) continue;
          occ.mark(sx, sy, 6, 8, ang);
          drawBldg(ctx, sx, sy, 6, 8, ang, CARTO.bldg_mkt);
        }
      }
      // Well/fountain
      ctx.beginPath();
      ctx.arc(ward.center.x, ward.center.y, 4, 0, Math.PI*2);
      ctx.fillStyle = CARTO.water; ctx.fill();
      ctx.strokeStyle = CARTO.bldg_dk; ctx.lineWidth = 1; ctx.stroke();
      continue;
    }

    if (ward.type === 'park') {
      ctx.beginPath();
      ward.polygon.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = '#b8c8a0'; ctx.fill();
      ctx.strokeStyle = '#8aaa70'; ctx.lineWidth = 1; ctx.stroke();
      continue;
    }

    fillWard(ctx, ward, occ);
  }

  // ── Wall ─────────────────────────────────────────────────────────────────────
  if (model.wall && model.wall.length > 2) {
    const wall = model.wall;
    ctx.beginPath();
    wall.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle = CARTO.wall; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#8a8070';  ctx.lineWidth = 2; ctx.stroke();
    // Towers at corners
    for (let i = 0; i < wall.length; i += Math.max(1, Math.floor(wall.length/8))) {
      const p = wall[i]!;
      ctx.fillStyle = CARTO.wall;
      ctx.fillRect(p.x-4, p.y-4, 8, 8);
      ctx.strokeStyle = '#6a6258'; ctx.lineWidth = 1; ctx.strokeRect(p.x-4, p.y-4, 8, 8);
    }
    // Gates
    for (const gate of model.gates) {
      ctx.beginPath(); ctx.arc(gate.x, gate.y, 5, 0, Math.PI*2);
      ctx.fillStyle = CARTO.bg; ctx.fill();
      ctx.strokeStyle = CARTO.wall; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // ── Labels ───────────────────────────────────────────────────────────────────
  if (showLabels) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '9px Georgia, "Times New Roman", serif';
    for (const ward of model.wards) {
      if (!ward.withinCity) continue;
      ctx.fillStyle = CARTO.label;
      ctx.fillText(factionWardLabel(faction, ward.type).toUpperCase(), ward.center.x, ward.center.y);
    }
  }
}

// ── Canvas 2D Renderer ────────────────────────────────────────────────────────

// ── Canvas 2D Renderer ────────────────────────────────────────────────────────

export function drawSettlement(
  model:        SettlementModel,
  canvas:       HTMLCanvasElement,
  showLabels    = true,
  showBuildings = true,
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0c0e11';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.5;
  const GRID = 40;
  for (let x = 0; x < W; x += GRID) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += GRID) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Farm patches (outside city)
  for (const ward of model.wards) {
    if (ward.withinCity || !ward.polygon.length) continue;
    ctx.beginPath();
    ctx.moveTo(ward.polygon[0]!.x, ward.polygon[0]!.y);
    for (let i = 1; i < ward.polygon.length; i++) ctx.lineTo(ward.polygon[i]!.x, ward.polygon[i]!.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40,58,30,0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,80,40,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // City ward polygons
  for (const ward of model.wards) {
    if (!ward.withinCity || !ward.polygon.length) continue;
    const col = WARD_COLORS[ward.type];
    ctx.beginPath();
    ctx.moveTo(ward.polygon[0]!.x, ward.polygon[0]!.y);
    for (let i = 1; i < ward.polygon.length; i++) ctx.lineTo(ward.polygon[i]!.x, ward.polygon[i]!.y);
    ctx.closePath();

    // Fill with colour + transparency
    ctx.fillStyle = col + '28';
    ctx.fill();

    // Border
    ctx.strokeStyle = col + '88';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Wall polygon
  if (model.wall && model.wall.length) {
    ctx.beginPath();
    ctx.moveTo(model.wall[0]!.x, model.wall[0]!.y);
    for (let i = 1; i < model.wall.length; i++) ctx.lineTo(model.wall[i]!.x, model.wall[i]!.y);
    ctx.closePath();
    ctx.strokeStyle = '#b09060';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Roads — draw with width variation (main road = wider)
  for (let ri = 0; ri < model.roads.length; ri++) {
    const road = model.roads[ri]!;
    if (road.points.length < 2) continue;
    const isMain = ri === 0;

    // Shadow / dirt under-road
    ctx.beginPath();
    ctx.moveTo(road.points[0]!.x, road.points[0]!.y);
    for (let i = 1; i < road.points.length; i++) ctx.lineTo(road.points[i]!.x, road.points[i]!.y);
    ctx.strokeStyle = 'rgba(60,50,35,0.8)';
    ctx.lineWidth   = isMain ? 5.5 : 3.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // Road surface
    ctx.beginPath();
    ctx.moveTo(road.points[0]!.x, road.points[0]!.y);
    for (let i = 1; i < road.points.length; i++) ctx.lineTo(road.points[i]!.x, road.points[i]!.y);
    ctx.strokeStyle = isMain ? '#b09870' : '#9a8860';
    ctx.lineWidth   = isMain ? 3 : 2;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Building footprints (small rectangles near ward centres)
  if (showBuildings) {
    for (const ward of model.wards) {
      if (!ward.withinCity) continue;
      const col = WARD_COLORS[ward.type];
      const cx = ward.center.x, cy = ward.center.y;

      const count = ward.type === 'market' ? 4
                  : ward.type === 'craftsmen' ? 3
                  : ward.type === 'slum' ? 5 : 2;

      const rand2 = mulberry32(Math.round(cx * 100 + cy));
      for (let b = 0; b < count; b++) {
        const angle = rand2() * Math.PI * 2;
        const r     = 4 + rand2() * 8;
        const bx    = cx + Math.cos(angle) * r;
        const by    = cy + Math.sin(angle) * r;
        const bw    = 4 + rand2() * 6;
        const bh    = 4 + rand2() * 5;
        const rot   = rand2() * Math.PI * 2;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(rot);
        ctx.fillStyle = col + 'cc';
        ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.strokeStyle = col;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    }
  }

  // Gate markers
  for (const gate of model.gates) {
    ctx.beginPath();
    ctx.arc(gate.x, gate.y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = '#b09060';
    ctx.fill();
    ctx.strokeStyle = '#d4b880';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  // Centre dot
  ctx.beginPath();
  ctx.arc(model.centre.x, model.centre.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff44';
  ctx.fill();

  // Ward labels
  if (showLabels) {
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '9px monospace';
    for (const ward of model.wards) {
      if (!ward.withinCity) continue;
      const col = WARD_COLORS[ward.type];
      ctx.fillStyle = col;
      ctx.fillText(WARD_LABELS[ward.type], ward.center.x, ward.center.y);
    }
  }
}

// ── Application bootstrap ─────────────────────────────────────────────────────

const canvas    = document.getElementById('map-canvas')    as HTMLCanvasElement;
const overlay   = document.getElementById('overlay-canvas') as HTMLCanvasElement;
const genTimeEl = document.getElementById('gen-time')!;
const hoverEl   = document.getElementById('hover-info')!;
const seedInput = document.getElementById('seed-input') as HTMLInputElement;

function resize() {
  const wrap = canvas.parentElement!;
  canvas.width  = overlay.width  = wrap.clientWidth;
  canvas.height = overlay.height = wrap.clientHeight;
}
resize();
window.addEventListener('resize', () => {
  resize();
  if (planetRenderer) {
    const wrap = planet3dCanvas.parentElement!;
    planetRenderer.resize(wrap.clientWidth, wrap.clientHeight);
  }
  if (hexPlanetRenderer) {
    const wrap = planet3dCanvas.parentElement!;
    hexPlanetRenderer.resize(wrap.clientWidth, wrap.clientHeight);
  }
  generate();
});

// ── State ─────────────────────────────────────────────────────────────────────

let currentModel: SettlementModel | null = null;
let persistentSeeds: Vec2[] | null = null;   // mutable seeds for interactive warp
let lastParams: GeneratorParams | null = null;

// ── Active tool ───────────────────────────────────────────────────────────────

type ToolName = 'select' | 'warp';
let activeTool: ToolName = 'select';
type ViewMode = 'flat' | 'iso';
let viewMode: ViewMode = (sessionStorage.getItem('ow-view') as ViewMode) ?? 'iso';

function setTool(name: ToolName) {
  activeTool = name;
  document.querySelectorAll<HTMLElement>('.tool-btn[id^="tool-"]').forEach(b => b.classList.remove('active'));
  document.getElementById(`tool-${name}`)?.classList.add('active');
  canvas.classList.remove('tool-warp');
  if (name === 'warp') canvas.classList.add('tool-warp');
}

function setView(mode: ViewMode) {
  viewMode = mode;
  sessionStorage.setItem('ow-view', mode);
  redraw();  // always 2.5D
}

function redraw() {
  if (studioMode === 'dungeon') { redrawDungeon(); return; }
  if (studioMode === 'cave')    { redrawCave();    return; }
  if (studioMode === 'realm')   { redrawRealm();   return; }
  if (!currentModel) return;
  const showLabels    = (document.getElementById('show-labels')    as HTMLInputElement).checked;
  const showBuildings = (document.getElementById('show-buildings') as HTMLInputElement).checked;
  const layoutParam = (document.querySelector('#layout-pills .pill.active') as HTMLElement)?.dataset.layout as LayoutType ?? 'organic';
  const faction     = (document.querySelector('#faction-pills .pill.active') as HTMLElement)?.dataset.faction as SettlementFaction ?? 'human';
  if (viewMode === 'iso') drawSettlement2D5(currentModel, canvas, showLabels, layoutParam, faction);
  else                    drawSettlement(currentModel, canvas, showLabels, showBuildings);
}

function getParams(): GeneratorParams {
  const type    = (document.querySelector('#type-pills .pill.active')    as HTMLElement)?.dataset.type    as SettlementType    ?? 'village';
  const layout  = (document.querySelector('#layout-pills .pill.active')  as HTMLElement)?.dataset.layout  as LayoutType        ?? 'organic';
  const faction = (document.querySelector('#faction-pills .pill.active') as HTMLElement)?.dataset.faction as SettlementFaction  ?? 'human';
  return {
    seed:       parseInt(seedInput.value) || Date.now(),
    type,
    layout,
    faction,
    nPatches:   parseInt((document.getElementById('patches') as HTMLInputElement).value),
    warp:       parseFloat((document.getElementById('warp')    as HTMLInputElement).value),
    nGates:     parseInt((document.getElementById('roads')   as HTMLInputElement).value),
    walled:     (document.getElementById('walls') as HTMLInputElement).checked,
    hasCitadel: (document.getElementById('citadel') as HTMLInputElement).checked,
    hasPlaza:   (document.getElementById('plaza')   as HTMLInputElement).checked,
    width:      canvas.width,
    height:     canvas.height,
  };
}

function generate(keepSeeds = false) {
  const params = getParams();
  lastParams = params;
  if (!keepSeeds || !persistentSeeds) {
    persistentSeeds = generateBaseSeeds(params);
  }
  const model = buildFromSeeds(persistentSeeds, params);
  currentModel = model;
  redraw();
  genTimeEl.textContent = `${model.genTimeMs.toFixed(1)} ms  ·  ${model.wards.filter(w => w.withinCity).length} wards  ·  ${model.roads.length} roads`;
}

// ── Controls ──────────────────────────────────────────────────────────────────

// Settlement type pills
document.getElementById('type-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#type-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  generate(false);
});

document.getElementById('layout-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#layout-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  generate(true);  // keep seeds when switching layout style
});

document.getElementById('faction-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#faction-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  generate(false);  // regen — faction changes ward assignments
});

// Sliders — live update with value display
for (const [id, valId] of [['patches', 'patches-val'], ['warp', 'warp-val'], ['roads', 'roads-val']] as const) {
  const input = document.getElementById(id) as HTMLInputElement;
  const valEl = document.getElementById(valId)!;
  const resetOn = id === 'patches';
  input.addEventListener('input', () => { valEl.textContent = input.value; generate(!resetOn); });
}

// Checkboxes
for (const id of ['show-labels', 'show-buildings']) {
  document.getElementById(id)!.addEventListener('change', () => generate(true));
}
for (const id of ['walls', 'citadel', 'plaza']) {
  document.getElementById(id)!.addEventListener('change', () => generate(true));
}

// Buttons
document.getElementById('btn-roll')!.addEventListener('click', () => {
  seedInput.value = (Math.random() * 0xFFFF_FFFF >>> 0).toString();
  currentDungeonPlan = null;
  currentCaveData    = null;
  currentRealmData   = null;
  if (studioMode === 'cave')         generateCaveView();
  else if (studioMode === 'dungeon') generateDungeonView();
  else if (studioMode === 'realm')   generateRealmView();
  else generate();
});
document.getElementById('btn-gen')!.addEventListener('click', () => {
  currentDungeonPlan = null;
  currentCaveData    = null;
  currentRealmData   = null;
  if (studioMode === 'cave')         generateCaveView();
  else if (studioMode === 'dungeon') generateDungeonView();
  else if (studioMode === 'realm')   generateRealmView();
  else generate(false);
});

// Export PNG
document.getElementById('btn-png')!.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `settlement-${seedInput.value}.png`;
  a.href = canvas.toDataURL();
  a.click();
});

// Export JSON
document.getElementById('btn-json')!.addEventListener('click', () => {
  if (!currentModel) return;
  const blob = new Blob([JSON.stringify(currentModel, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.download = `settlement-${seedInput.value}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      seedInput.value = (Math.random() * 0xFFFF_FFFF >>> 0).toString();
      generate();
      break;
    case 'Enter': generate(); break;
    case '+': case '=': {
      const el = document.getElementById('patches') as HTMLInputElement;
      el.value = String(Math.min(40, parseInt(el.value) + 1));
      document.getElementById('patches-val')!.textContent = el.value;
      generate(); break;
    }
    case '-': {
      const el = document.getElementById('patches') as HTMLInputElement;
      el.value = String(Math.max(4, parseInt(el.value) - 1));
      document.getElementById('patches-val')!.textContent = el.value;
      generate(); break;
    }
    case 'w': case 'W': {
      const el = document.getElementById('walls') as HTMLInputElement;
      el.checked = !el.checked;
      generate(true); break;  // keep seeds when toggling walls
    }
    case 's': case 'S': setTool('select'); break;
    case 'd': case 'D': setTool('warp');   break;
    case 'r': case 'R': persistentSeeds = null; generate(false); break;

  }
});

// ── Tool button wiring ────────────────────────────────────────────────────────

document.getElementById('tool-select')!.addEventListener('click', () => setTool('select'));
document.getElementById('tool-warp')!.addEventListener('click',   () => setTool('warp'));
document.getElementById('tool-reset')!.addEventListener('click',  () => {
  persistentSeeds = null;
  generate(false);
});
// 2.5D only — no flat view button

// ── Interactive warp interaction ──────────────────────────────────────────────
// Left-drag in warp mode: push nearby Voronoi seeds with smooth quadratic falloff.
// The influence radius = 22% of the canvas short side.
// Strength scales linearly with drag speed but is capped to prevent explosion.

let warpDragging = false;
let warpPrevX = 0, warpPrevY = 0;
const WARP_RADIUS_FRAC = 0.22;  // fraction of min(W,H)

function canvasXY(e: PointerEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * (canvas.width  / rect.width),
    (e.clientY - rect.top)  * (canvas.height / rect.height),
  ];
}

canvas.addEventListener('pointerdown', e => {
  if (activeTool !== 'warp' || e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  warpDragging = true;
  [warpPrevX, warpPrevY] = canvasXY(e);
});

canvas.addEventListener('pointermove', e => {
  if (!warpDragging || activeTool !== 'warp' || !persistentSeeds || !lastParams) return;

  const [mx, my] = canvasXY(e);
  const WARP_R = Math.min(canvas.width, canvas.height) * WARP_RADIUS_FRAC;

  // Drag delta capped to prevent too-large single-frame jumps
  const dx = Math.max(-30, Math.min(30, (mx - warpPrevX) * 0.8));
  const dy = Math.max(-30, Math.min(30, (my - warpPrevY) * 0.8));
  warpPrevX = mx; warpPrevY = my;

  // Push seeds within radius (quadratic falloff: smooth at edge, strong at centre)
  for (const seed of persistentSeeds) {
    const d = Math.hypot(seed.x - mx, seed.y - my);
    if (d < WARP_R) {
      const t = d / WARP_R;
      const strength = (1 - t * t);  // quadratic: 1 at centre, 0 at edge
      seed.x += dx * strength;
      seed.y += dy * strength;
    }
  }

  // Rebuild Voronoi instantly (2–5ms)
  const model = buildFromSeeds(persistentSeeds, lastParams);
  currentModel = model;
  redraw();
  genTimeEl.textContent = `${model.genTimeMs.toFixed(1)} ms  ·  ${model.wards.filter(w => w.withinCity).length} wards`;

  // Draw warp influence circle on overlay
  const octx = overlay.getContext('2d')!;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  // Outer ring
  octx.beginPath();
  octx.arc(mx, my, WARP_R, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(124, 106, 245, 0.45)';
  octx.lineWidth = 1.5;
  octx.setLineDash([5, 4]);
  octx.stroke();
  octx.setLineDash([]);
  // Inner strength core (25% radius)
  octx.beginPath();
  octx.arc(mx, my, WARP_R * 0.25, 0, Math.PI * 2);
  octx.fillStyle = 'rgba(124, 106, 245, 0.12)';
  octx.fill();
  // Centre crosshair
  octx.strokeStyle = 'rgba(124, 106, 245, 0.7)';
  octx.lineWidth = 1;
  for (const [ax, ay, bx, by] of [[mx-6,my,mx+6,my],[mx,my-6,mx,my+6]] as const) {
    octx.beginPath(); octx.moveTo(ax, ay); octx.lineTo(bx, by); octx.stroke();
  }
});

canvas.addEventListener('pointerup', () => {
  warpDragging = false;
  canvas.classList.remove('dragging');
  overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
});
canvas.addEventListener('pointercancel', () => {
  warpDragging = false;
  canvas.classList.remove('dragging');
});

// Show warp radius preview on hover when warp tool active (not dragging)
canvas.addEventListener('pointermove', e => {
  if (activeTool !== 'warp' || warpDragging) return;
  const [mx, my] = canvasXY(e);
  const WARP_R = Math.min(canvas.width, canvas.height) * WARP_RADIUS_FRAC;
  const octx = overlay.getContext('2d')!;
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.beginPath();
  octx.arc(mx, my, WARP_R, 0, Math.PI * 2);
  octx.strokeStyle = 'rgba(124, 106, 245, 0.25)';
  octx.lineWidth = 1;
  octx.setLineDash([4, 4]);
  octx.stroke();
  octx.setLineDash([]);
});

// ── Ward hover inspection ─────────────────────────────────────────────────────

canvas.addEventListener('mousemove', e => {
  if (studioMode !== 'settlement') return;
  if (!currentModel) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);

  // Find the ward whose polygon contains the mouse
  let found: Ward | null = null;
  for (const ward of currentModel.wards) {
    if (!ward.withinCity || !ward.polygon.length) continue;
    if (pointInPolygon({ x: mx, y: my }, ward.polygon)) { found = ward; break; }
  }

  if (found) {
    hoverEl.textContent = `${WARD_LABELS[found.type]} ward  ·  (${found.seed.x.toFixed(0)}, ${found.seed.y.toFixed(0)})`;
    // Highlight
    const octx = overlay.getContext('2d')!;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (found.polygon.length) {
      octx.beginPath();
      octx.moveTo(found.polygon[0]!.x, found.polygon[0]!.y);
      for (let i = 1; i < found.polygon.length; i++) octx.lineTo(found.polygon[i]!.x, found.polygon[i]!.y);
      octx.closePath();
      octx.strokeStyle = WARD_COLORS[found.type];
      octx.lineWidth = 2;
      octx.stroke();
    }
  } else {
    hoverEl.textContent = 'hover a ward to inspect';
    overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
  }
});
canvas.addEventListener('mouseleave', () => {
  if (studioMode !== 'settlement') return;
  hoverEl.textContent = 'hover a ward to inspect';
  overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
});

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y, xj = poly[j]!.x, yj = poly[j]!.y;
    if (((yi > p.y) !== (yj > p.y)) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── Ward legend ───────────────────────────────────────────────────────────────

const legendEl = document.getElementById('ward-legend')!;
for (const [type, col] of Object.entries(WARD_COLORS)) {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = `<div class="swatch" style="background:${col}"></div><span>${WARD_LABELS[type as WardType]}</span>`;
  legendEl.appendChild(row);
}

// ── Dungeon Floor Plan Renderer (OW-B) ───────────────────────────────────────

/** Dungeon canvas color palette — ink-map on parchment style. */
// ── Rich Procedural Floor Plan Generator (OW-B) ──────────────────────────────
//
// Creates a branching multi-room dungeon entirely in-memory (no JSON blueprints).
// Each room is a Blueprint built from scratch: perimeter walls, typed content,
// doors wired to neighbours.  Used by the Overworld Studio dungeon tab only —
// the game's DungeonGenerator is unchanged.

type RoomCategory = 'entry' | 'library' | 'barracks' | 'armory' | 'treasure' | 'ritual' | 'boss' | 'corridor';

interface RichRoomDef {
  id:   string;
  cat:  RoomCategory;
  col:  number;   // virtual grid column (1 slot per room)
  row:  number;
  w:    number;   // cell width
  d:    number;   // cell depth
  connections: Array<{ dir: 'N'|'S'|'E'|'W'; toId: string }>;
}

const ROOM_SIZES: Record<RoomCategory, [number, number][]> = {
  entry:    [[7,7],[7,9]],
  library:  [[9,9],[9,7],[11,9]],
  barracks: [[9,7],[11,7],[9,9]],
  armory:   [[7,7],[7,9]],
  treasure: [[5,7],[7,7],[7,5]],
  ritual:   [[9,9],[11,11]],
  boss:     [[13,13],[11,13],[13,11]],
  corridor: [[3,7],[7,3]],
};

const ROOM_FLOOR_TYPE: Record<RoomCategory, import('@/levels/blueprint').FloorType> = {
  entry:    'stone_herald',
  library:  'wood',
  barracks: 'stone',
  armory:   'stone_scorched',
  treasure: 'stone',
  ritual:   'stone_alchemy',
  boss:     'stone_damp',
  corridor: 'stone',
};

/** Floor display color per floor type. */
const FLOOR_TYPE_COLOR: Partial<Record<string, string>> = {
  stone:          '#d0c8b8',
  stone_herald:   '#d8d4c4',
  stone_alchemy:  '#ccc4d4',   // slight lavender
  stone_scorched: '#d0b8a8',   // warm terracotta
  stone_damp:     '#b8c4b8',   // cool green-grey
  stone_celestial:'#c4d0e0',   // pale blue
  wood:           '#d4c0a0',   // warm tan
  grass:          '#c4d0b0',
  dirt:           '#c8b898',
};

const ROOM_INTERACTABLES: Record<RoomCategory, import('@/levels/blueprint').InteractableType[]> = {
  entry:    ['lectern', 'candelabra'],
  library:  ['bookshelf', 'bookshelf', 'lectern', 'reading_table'],
  barracks: ['bunk', 'bunk', 'mess_table'],
  armory:   ['anvil', 'weapon_stand', 'weapon_stand'],
  treasure: ['chest', 'chest', 'candelabra'],
  ritual:   ['containment_ring', 'cauldron', 'candelabra'],
  boss:     ['quest_board'],
  corridor: [],
};

const ROOM_SPAWN_COUNTS: Record<RoomCategory, number> = {
  entry: 0, library: 1, barracks: 3, armory: 2, treasure: 1, ritual: 2, boss: 5, corridor: 0,
};

/** Build wall tiles for a W×D room (perimeter only) with optional corner pillars. */
function buildRoomTiles(w: number, d: number): import('@/levels/blueprint').TileEntry[] {
  const tiles: import('@/levels/blueprint').TileEntry[] = [];
  for (let x = 0; x < w; x++) {
    tiles.push({ x, z: 0,   type: 'wall' });
    tiles.push({ x, z: d-1, type: 'wall' });
  }
  for (let z = 1; z < d-1; z++) {
    tiles.push({ x: 0,   z, type: 'wall' });
    tiles.push({ x: w-1, z, type: 'wall' });
  }
  // Corner pillars for larger rooms
  if (w >= 9 && d >= 9) {
    const ip = 2;
    for (const [px, pz] of [[ip,ip],[w-1-ip,ip],[ip,d-1-ip],[w-1-ip,d-1-ip]] as [number,number][]) {
      tiles.push({ x: px, z: pz, type: 'pillar' });
    }
  }
  return tiles;
}

/** Remove a wall tile at (tx, tz) from a tile list (for door placement). */
function openWallAt(tiles: import('@/levels/blueprint').TileEntry[], tx: number, tz: number): void {
  const idx = tiles.findIndex(t => t.x === tx && t.z === tz);
  if (idx !== -1) tiles.splice(idx, 1);
}

/** Door position for a direction on a room of size w×d. */
function doorPos(dir: 'N'|'S'|'E'|'W', w: number, d: number): {x:number,z:number,facing:import('@/levels/blueprint').DoorFacing} {
  switch (dir) {
    case 'N': return { x: Math.floor(w/2), z: 0,   facing: 'north' };
    case 'S': return { x: Math.floor(w/2), z: d-1, facing: 'south' };
    case 'E': return { x: w-1, z: Math.floor(d/2), facing: 'east'  };
    case 'W': return { x: 0,   z: Math.floor(d/2), facing: 'west'  };
  }
}

/** Scatter N interactables pseudo-randomly inside a room (interior cells only). */
function placeInteractables(
  types: import('@/levels/blueprint').InteractableType[],
  w: number, d: number, rand: ()=>number,
): import('@/levels/blueprint').InteractableEntry[] {
  const result: import('@/levels/blueprint').InteractableEntry[] = [];
  const used = new Set<string>();
  for (const type of types) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 1 + Math.floor(rand() * (w - 2));
      const z = 1 + Math.floor(rand() * (d - 2));
      const key = `${x},${z}`;
      if (used.has(key)) continue;
      used.add(key);
      result.push({ x, z, type });
      break;
    }
  }
  return result;
}

/** Scatter N enemy spawns inside a room. */
function placeSpawns(count: number, w: number, d: number, rand: ()=>number): import('@/levels/blueprint').SpawnEntry[] {
  const result: import('@/levels/blueprint').SpawnEntry[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = 2 + Math.floor(rand() * (w - 4));
      const z = 2 + Math.floor(rand() * (d - 4));
      const key = `${x},${z}`;
      if (used.has(key)) continue;
      used.add(key);
      result.push({ x, z, type: 'slime' });
      break;
    }
  }
  return result;
}

const CATEGORY_SEQ: RoomCategory[] = ['library','barracks','armory','ritual','treasure','library','barracks'];

/**
 * Generate a branching dungeon floor plan with typed rooms.
 * Returns a DungeonPlan compatible with drawDungeonFloorPlan().
 */
export function generateRichFloorPlan(seed: number, complexity: number): DungeonPlan {
  const rand = mulberry32(seed);
  const occupied = new Set<string>();
  const defs: RichRoomDef[] = [];
  let idx = 0;

  function tryPlace(cat: RoomCategory, col: number, row: number): RichRoomDef | null {
    const key = `${col},${row}`;
    if (occupied.has(key)) return null;
    const sizes = ROOM_SIZES[cat];
    const [w, d] = sizes[Math.floor(rand() * sizes.length)]!;
    const def: RichRoomDef = { id: `room_${idx++}`, cat, col, row, w, d, connections: [] };
    occupied.add(key);
    defs.push(def);
    return def;
  }

  // Start room
  const entry = tryPlace('entry', 0, 0)!;

  // BFS expansion
  const queue: RichRoomDef[] = [entry];
  const targetRooms = 4 + Math.floor(complexity * 1.2);
  const DIRS: Array<['N'|'S'|'E'|'W', number, number]> = [['N',0,-1],['S',0,1],['E',1,0],['W',-1,0]];

  let catIdx = 0;
  while (queue.length && defs.length < targetRooms) {
    const parent = queue[Math.floor(rand() * Math.min(queue.length, 3))]!;
    const branches = 1 + Math.floor(rand() * 2);
    const shuffledDirs = [...DIRS].sort(() => rand() - 0.5);
    let added = 0;
    for (const [dir, dc, dr] of shuffledDirs) {
      if (added >= branches || defs.length >= targetRooms) break;
      // Skip dir if parent already has a connection that way
      if (parent.connections.some(c => c.dir === dir)) continue;
      const nc = parent.col + dc, nr = parent.row + dr;
      const cat: RoomCategory = defs.length >= targetRooms - 1 ? 'boss'
                               : CATEGORY_SEQ[catIdx % CATEGORY_SEQ.length]!;
      const child = tryPlace(cat, nc, nr);
      if (!child) continue;
      const opp: Record<string, 'N'|'S'|'E'|'W'> = {N:'S',S:'N',E:'W',W:'E'};
      parent.connections.push({ dir, toId: child.id });
      child.connections.push({ dir: opp[dir]!, toId: parent.id });
      queue.push(child);
      catIdx++;
      added++;
    }
    queue.splice(queue.indexOf(parent), 1);
  }

  // Always add a boss room connected to the furthest room from entry
  if (defs.length >= 3) {
    const furthest = defs.reduce((a, b) =>
      Math.abs(b.col) + Math.abs(b.row) > Math.abs(a.col) + Math.abs(a.row) ? b : a);
    const bossDir = DIRS.find(([dir]) => !furthest.connections.some(c => c.dir === dir));
    if (bossDir) {
      const [dir, dc, dr] = bossDir;
      const nc = furthest.col + dc, nr = furthest.row + dr;
      const boss = tryPlace('boss', nc, nr);
      if (boss) {
        const opp: Record<string, 'N'|'S'|'E'|'W'> = {N:'S',S:'N',E:'W',W:'E'};
        furthest.connections.push({ dir, toId: boss.id });
        boss.connections.push({ dir: opp[dir]!, toId: furthest.id });
      }
    }
  }

  // Build Blueprint map
  const rooms = new Map<string, Blueprint>();
  for (const def of defs) {
    const { id, cat, w, d, connections } = def;
    const tiles = buildRoomTiles(w, d);
    const doors: import('@/levels/blueprint').DoorEntry[] = [];

    for (const conn of connections) {
      const dp = doorPos(conn.dir, w, d);
      openWallAt(tiles, dp.x, dp.z);
      doors.push({ x: dp.x, z: dp.z, facing: dp.facing, targetId: conn.toId });
    }

    const bp: Blueprint = {
      id, version: 1 as const,
      width: w, depth: d,
      cellSize: 2, wallHeight: 3,
      tiles, doors,
      staircases: [],
      spawns:          cat === 'corridor' ? [] : placeSpawns(ROOM_SPAWN_COUNTS[cat], w, d, rand),
      interactables:   cat === 'corridor' ? [] : placeInteractables(ROOM_INTERACTABLES[cat], w, d, rand),
      floor: 0,
      floorType: ROOM_FLOOR_TYPE[cat],
    };
    rooms.set(id, bp);
  }

  return { rooms, startRoomId: 'room_0', seed };
}

// ── Rich name labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<RoomCategory, string> = {
  entry: 'Entry', library: 'Library', barracks: 'Barracks', armory: 'Armory',
  treasure: 'Treasure', ritual: 'Ritual Chamber', boss: 'Boss Chamber', corridor: '',
};

function guessRoomLabel(id: string, floorType?: string): string {
  if (id.includes('cell_start'))   return 'Cell';
  if (id.includes('library_large'))return 'Grand Library';
  if (id.includes('library'))      return 'Library';
  if (id.includes('corridor'))     return '';
  if (id.includes('chamber'))      return 'Chamber';
  if (id.includes('boss'))         return 'Boss';
  if (floorType === 'stone_alchemy') return 'Ritual';
  if (floorType === 'stone_scorched') return 'Forge';
  if (floorType === 'wood')          return 'Library';
  return '';
}

const DMAP = {
  bg:          '#e4dece',   // parchment background
  floor:       '#d0c8b8',   // room floor (slightly darker than bg)
  wall:        '#3a3028',   // thick ink walls
  pillar:      '#2a2018',   // darker pillars
  door:        '#a06828',   // warm amber door gap
  door_exit:   '#d08030',   // brighter amber for exterior exits
  stair_up:    '#4870c0',   // blue stair up
  stair_dn:    '#c07040',   // orange stair down
  spawn:       '#c03020',   // red enemy spawn
  interactable:'#506090',   // blue-grey interactable
  corridor:    '#c8c0b0',   // corridor connection line
  label:       'rgba(58,48,40,0.75)',
  start_mark:  '#40a060',   // green for start room
};

/** Interactable single-character symbols — legible at 7px. */
const DMAP_SYMBOLS: Partial<Record<string, string>> = {
  bookshelf: '≡', lectern: '♦', cauldron: '◎', telescope: '○',
  forge: '⊓', quest_board: '□', chest: '▪', candelabra: '·',
  anvil: '⊓', workbench_key: '⚿', locked_door: '⊠',
  bed: '═', wardrobe: '▫', writing_desk: '▭', bunk: '║', mess_table: '▬',
  reading_table: '▭', globe: '○', map_table: '▭', weapon_stand: '↑',
  plant_pot: '✿', raised_planter: '⊟', containment_ring: '⊕', astrolabe: '✦',
  banner: '|', rug: '▬',
};

interface RoomPos { px: number; py: number; }

/**
 * Draw a single dungeon floor plan from a DungeonPlan on a canvas.
 * Lays rooms out via BFS from startRoom, aligning door cells between rooms.
 */
export function drawDungeonFloorPlan(
  plan: DungeonPlan,
  canvas: HTMLCanvasElement,
  floorFilter?: number,   // if set, only draw rooms with blueprint.floor === floorFilter
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;

  // Clear
  ctx.fillStyle = DMAP.bg;
  ctx.fillRect(0, 0, W, H);

  const CELL = 9;   // pixels per grid cell
  const GAP  = 14;  // pixel gap between rooms

  // Filter rooms by floor if requested (tower mode)
  const rooms = floorFilter !== undefined
    ? new Map([...plan.rooms].filter(([, bp]) => bp.floor === floorFilter))
    : plan.rooms;

  if (rooms.size === 0) {
    ctx.fillStyle = DMAP.label;
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('No rooms on this floor', W / 2, H / 2);
    return;
  }

  // BFS layout: assign top-left canvas position to each room
  const positions = new Map<string, RoomPos>();
  const startId = rooms.has(plan.startRoomId) ? plan.startRoomId : rooms.keys().next().value!;
  positions.set(startId, { px: 0, py: 0 });

  const visited = new Set([startId]);
  const queue   = [startId];

  while (queue.length) {
    const rid   = queue.shift()!;
    const room  = rooms.get(rid);
    if (!room) continue;
    const pos   = positions.get(rid)!;

    for (const door of room.doors) {
      if (!door.targetId || visited.has(door.targetId)) continue;
      if (!rooms.has(door.targetId)) continue;
      visited.add(door.targetId);
      queue.push(door.targetId);

      const target = rooms.get(door.targetId)!;
      // Find the reciprocal door in the target room
      const oppDoor = target.doors.find(d => d.targetId === rid);
      const ox = oppDoor?.x ?? 0;
      const oz = oppDoor?.z ?? 0;

      let npx: number, npy: number;
      switch (door.facing) {
        case 'north':
          npx = pos.px + (door.x - ox) * CELL;
          npy = pos.py - target.depth * CELL - GAP;
          break;
        case 'south':
          npx = pos.px + (door.x - ox) * CELL;
          npy = pos.py + room.depth * CELL + GAP;
          break;
        case 'east':
          npx = pos.px + room.width * CELL + GAP;
          npy = pos.py + (door.z - oz) * CELL;
          break;
        case 'west':
          npx = pos.px - target.width * CELL - GAP;
          npy = pos.py + (door.z - oz) * CELL;
          break;
      }
      positions.set(door.targetId, { px: npx!, py: npy! });
    }

    // Follow staircases too (tower mode)
    for (const stair of room.staircases) {
      if (!stair.targetId || visited.has(stair.targetId)) continue;
      if (!rooms.has(stair.targetId)) continue;
      // Don't follow inter-floor stairs in BFS — just mark as seen
      visited.add(stair.targetId);
    }
  }

  // Compute bounding box and centre on canvas
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [rid, pos] of positions) {
    const room = rooms.get(rid)!;
    minX = Math.min(minX, pos.px);
    minY = Math.min(minY, pos.py);
    maxX = Math.max(maxX, pos.px + room.width * CELL);
    maxY = Math.max(maxY, pos.py + room.depth * CELL);
  }

  const PAD = 24;
  const totalW = maxX - minX, totalH = maxY - minY;
  const offX   = (W - totalW) / 2 - minX;
  const offY   = (H - totalH) / 2 - minY;

  // ── Draw corridor lines between connected doors ─────────────────────────
  ctx.strokeStyle = DMAP.corridor;
  ctx.lineWidth   = CELL - 2;
  ctx.lineCap     = 'round';
  for (const [rid, pos] of positions) {
    const room = rooms.get(rid)!;
    for (const door of room.doors) {
      if (!door.targetId || !positions.has(door.targetId)) continue;
      if (!rooms.has(door.targetId)) continue;
      const ax = offX + pos.px + door.x * CELL + CELL / 2;
      const ay = offY + pos.py + door.z * CELL + CELL / 2;
      const tpos  = positions.get(door.targetId)!;
      const troom = rooms.get(door.targetId)!;
      const oppDoor = troom.doors.find(d => d.targetId === rid);
      if (!oppDoor) continue;
      const bx = offX + tpos.px + oppDoor.x * CELL + CELL / 2;
      const by = offY + tpos.py + oppDoor.z * CELL + CELL / 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  }
  void PAD;

  // ── Draw each room ───────────────────────────────────────────────────────
  for (const [rid, pos] of positions) {
    const room = rooms.get(rid)!;
    const ox   = offX + pos.px;
    const oy   = offY + pos.py;
    const rw   = room.width  * CELL;
    const rd   = room.depth  * CELL;

    // Floor fill — color-coded by room type
    const floorCol = rid === startId
      ? '#d0e8d4'   // green entry
      : (FLOOR_TYPE_COLOR[room.floorType ?? 'stone'] ?? DMAP.floor);
    ctx.fillStyle = floorCol;
    ctx.fillRect(ox, oy, rw, rd);

    // Subtle drop shadow for depth
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur  = 4;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillRect(ox, oy, rw, rd);  // shadow pass
    ctx.restore();

    // Build wall/pillar lookup
    const wallSet = new Set(room.tiles.map(t => `${t.x},${t.z}`));

    // Draw wall and pillar cells
    for (const tile of room.tiles) {
      ctx.fillStyle = tile.type === 'pillar' ? DMAP.pillar : DMAP.wall;
      ctx.fillRect(ox + tile.x * CELL, oy + tile.z * CELL, CELL, CELL);
    }

    // Fill cells NOT in tiles and not floor as wall (implicit solid border)
    // (walls are already explicit in tile entries — this handles edge cells)

    // Draw room border (thin outline)
    ctx.strokeStyle = DMAP.wall;
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(ox + 0.5, oy + 0.5, rw - 1, rd - 1);

    // Draw doors
    for (const door of room.doors) {
      const isExit = !door.targetId;
      const doorCol = isExit ? DMAP.door_exit : DMAP.door;
      // Erase wall cell at door position (draw floor color)
      ctx.fillStyle = floorCol;
      ctx.fillRect(ox + door.x * CELL, oy + door.z * CELL, CELL, CELL);
      // Draw door dot
      ctx.fillStyle = doorCol;
      const dcx = ox + door.x * CELL + CELL / 2;
      const dcy = oy + door.z * CELL + CELL / 2;
      ctx.beginPath(); ctx.arc(dcx, dcy, CELL * 0.3, 0, Math.PI * 2); ctx.fill();
      // If exit door — draw small arrowhead indicating direction
      if (isExit) {
        ctx.strokeStyle = DMAP.door_exit;
        ctx.lineWidth   = 1.5;
        const [ax, ay] = {
          north: [dcx, dcy - CELL * 0.55],
          south: [dcx, dcy + CELL * 0.55],
          east:  [dcx + CELL * 0.55, dcy],
          west:  [dcx - CELL * 0.55, dcy],
        }[door.facing] as [number, number];
        ctx.beginPath(); ctx.moveTo(dcx, dcy); ctx.lineTo(ax, ay); ctx.stroke();
      }
    }

    // Draw staircases
    for (const stair of room.staircases) {
      const sx = ox + stair.x * CELL + CELL / 2;
      const sy = oy + stair.z * CELL + CELL / 2;
      // Clear wall tile if it exists
      if (wallSet.has(`${stair.x},${stair.z}`)) {
        ctx.fillStyle = DMAP.floor;
        ctx.fillRect(ox + stair.x * CELL, oy + stair.z * CELL, CELL, CELL);
      }
      ctx.fillStyle  = stair.direction === 'up' ? DMAP.stair_up : DMAP.stair_dn;
      ctx.font       = `bold ${CELL + 1}px sans-serif`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stair.direction === 'up' ? '↑' : '↓', sx, sy);
    }

    // Draw interactables
    ctx.font      = `${CELL - 1}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of room.interactables) {
      const ix = ox + item.x * CELL + CELL / 2;
      const iy = oy + item.z * CELL + CELL / 2;
      // Draw a small colored square under the symbol
      ctx.fillStyle = DMAP.interactable + '55';
      ctx.fillRect(ox + item.x * CELL + 1, oy + item.z * CELL + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = DMAP.interactable;
      ctx.fillText(DMAP_SYMBOLS[item.type] ?? '◆', ix, iy);
    }

    // Draw spawns
    for (const spawn of room.spawns) {
      const spx = ox + spawn.x * CELL + CELL / 2;
      const spy = oy + spawn.z * CELL + CELL / 2;
      ctx.fillStyle = DMAP.spawn;
      ctx.beginPath(); ctx.arc(spx, spy, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
    }

    // Room label — human-readable name centred in room
    const label = guessRoomLabel(room.id, room.floorType);
    if (label) {
      ctx.fillStyle    = 'rgba(58,48,40,0.55)';
      ctx.font         = `bold ${Math.min(8, Math.floor(rw / label.length * 1.2))}px Georgia, serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.toUpperCase(), ox + rw / 2, oy + rd / 2);
    }
  }

  // Title
  ctx.fillStyle    = DMAP.label;
  ctx.font         = '10px Georgia, serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Dungeon · seed ${plan.seed} · ${rooms.size} room${rooms.size !== 1 ? 's' : ''}`, W / 2, H - 6);
}

// ── Studio mode state ─────────────────────────────────────────────────────────

type StudioMode = 'settlement' | 'dungeon' | 'cave' | 'realm';
let studioMode: StudioMode = 'settlement';
let currentDungeonPlan: DungeonPlan | null = null;

function generateDungeonView() {
  const seed       = parseInt(seedInput.value) || Date.now();
  const dtype      = (document.querySelector('#dungeon-type-pills .pill.active') as HTMLElement)?.dataset.dtype ?? 'generic';
  const complexity = parseInt((document.getElementById('dfloors') as HTMLInputElement).value);
  try {
    if (dtype === 'tower') {
      currentDungeonPlan = generateTower(seed);
    } else {
      // Use the rich procedural generator for the visual floor plan
      currentDungeonPlan = generateRichFloorPlan(seed, complexity);
    }
  } catch (e) {
    console.error('Dungeon generation failed:', e);
    return;
  }
  redrawDungeon();
  const rooms = currentDungeonPlan.rooms;
  genTimeEl.textContent = `${rooms.size} rooms  ·  seed ${seed}`;
}

function redrawDungeon() {
  if (!currentDungeonPlan) return;
  const dtype = (document.querySelector('#dungeon-type-pills .pill.active') as HTMLElement)?.dataset.dtype ?? 'generic';
  let floorFilter: number | undefined;
  if (dtype === 'tower') {
    floorFilter = parseInt((document.getElementById('dfloor') as HTMLInputElement).value);
  }
  drawDungeonFloorPlan(currentDungeonPlan, canvas, floorFilter);
}

// ── Cave / Glade Generator & Renderer (OW-C) ──────────────────────────────────

type CaveType = 'cave' | 'glade';
type CaveBiome  = 'stone'|'coastal'|'volcanic'|'desert'|'verdant'|'frozen';
type GladeBiome = 'forest'|'autumn'|'blossom'|'wetland'|'tundra';

interface CaveFeature { x: number; y: number; kind: 'water'|'mineral'|'spawn'|'treasure'|'tree'|'flower'|'mushroom'; }

interface CaveData {
  grid: boolean[][];
  W: number; H: number;
  seed: number;
  type: CaveType;
  biome: string;     // CaveBiome | GladeBiome
  features: CaveFeature[];
}

// ── Biome palette definitions ─────────────────────────────────────────────────

interface BiomePal {
  bg: string; wall: string; wall2: string;
  floor: string; floor2: string; water: string;
  mineral: string; spawn: string; treasure: string;
  tree: string; flower: string; mushroom: string;
  label: string; border: string;
  name: string;
}

const CAVE_BIOMES: Record<CaveBiome, BiomePal> = {
  stone:   { bg:'#16120c', wall:'#221c14', wall2:'#201a12', floor:'#3e3830', floor2:'#46403a', water:'#2040a0', mineral:'#909888', spawn:'#c03020', treasure:'#e0b030', tree:'#0',  flower:'#0',  mushroom:'#0',  label:'rgba(200,190,170,0.7)', border:'#3a3028', name:'Stone Cave' },
  coastal: { bg:'#060e1e', wall:'#0e1e38', wall2:'#101c34', floor:'#1e3858', floor2:'#24406a', water:'#1040d0', mineral:'#78c0d0', spawn:'#e04040', treasure:'#f0d060', tree:'#0',  flower:'#60c0c0', mushroom:'#0', label:'rgba(160,200,230,0.8)', border:'#183060', name:'Coastal Cave' },
  volcanic:{ bg:'#0e0404', wall:'#2a0c08', wall2:'#320e08', floor:'#4a1c10', floor2:'#5a2018', water:'#e04000', mineral:'#d08040', spawn:'#ff4020', treasure:'#ffb030', tree:'#0',  flower:'#0',  mushroom:'#0',  label:'rgba(220,170,130,0.8)', border:'#602010', name:'Volcanic Cave' },
  desert:  { bg:'#180e04', wall:'#3a3020', wall2:'#342c1c', floor:'#6a5830', floor2:'#7a6a3a', water:'#1868a0', mineral:'#c8b880', spawn:'#e04020', treasure:'#ffe060', tree:'#0',  flower:'#0',  mushroom:'#d0a020', label:'rgba(220,210,170,0.8)', border:'#605030', name:'Desert Cave' },
  verdant: { bg:'#040e04', wall:'#0e2210', wall2:'#102814', floor:'#204820', floor2:'#285c28', water:'#204880', mineral:'#78d050', spawn:'#c03020', treasure:'#e0c030', tree:'#0',  flower:'#e040a0', mushroom:'#c84020', label:'rgba(160,220,140,0.8)', border:'#205020', name:'Verdant Cave' },
  frozen:  { bg:'#080c18', wall:'#182038', wall2:'#1c2840', floor:'#304870', floor2:'#38587c', water:'#60c0f0', mineral:'#a8d8f8', spawn:'#d03040', treasure:'#e0f0ff', tree:'#0',  flower:'#0',  mushroom:'#0',  label:'rgba(160,200,240,0.8)', border:'#203870', name:'Ice Cave' },
};

const GLADE_BIOMES: Record<GladeBiome, BiomePal> = {
  forest:  { bg:'#040c04', wall:'#1a3010', wall2:'#203818', floor:'#4a7830', floor2:'#5a9038', water:'#2860a0', mineral:'#80b040', spawn:'#c03020', treasure:'#e0c030', tree:'#1a3010', flower:'#d85080', mushroom:'#c84020', label:'rgba(170,220,140,0.8)', border:'#2a5018', name:'Forest Glade' },
  autumn:  { bg:'#100804', wall:'#3a1e0a', wall2:'#4a2810', floor:'#8a5828', floor2:'#9a6830', water:'#3050a0', mineral:'#c89030', spawn:'#c03020', treasure:'#ffe040', tree:'#6a2808', flower:'#e05020', mushroom:'#803020', label:'rgba(230,190,140,0.8)', border:'#6a3010', name:'Autumn Glade' },
  blossom: { bg:'#140808', wall:'#3c1428', wall2:'#481830', floor:'#a87898', floor2:'#b888a8', water:'#4868a0', mineral:'#e890b0', spawn:'#c03020', treasure:'#ffe0f0', tree:'#4a1028', flower:'#f040a0', mushroom:'#d05080', label:'rgba(240,190,220,0.8)', border:'#701840', name:'Blossom Glade' },
  wetland: { bg:'#040c08', wall:'#0e2818', wall2:'#122c1c', floor:'#305030', floor2:'#386038', water:'#1a6050', mineral:'#60c890', spawn:'#c03020', treasure:'#c8f080', tree:'#0e2818', flower:'#50d080', mushroom:'#408040', label:'rgba(150,220,180,0.8)', border:'#185030', name:'Wetland Glade' },
  tundra:  { bg:'#0c1018', wall:'#283848', wall2:'#30404e', floor:'#505e70', floor2:'#5c6a7c', water:'#90cce8', mineral:'#c0d8e8', spawn:'#d03040', treasure:'#d8f0ff', tree:'#283848', flower:'#b0d0c8', mushroom:'#8090a8', label:'rgba(180,210,230,0.8)', border:'#304860', name:'Tundra Glade' },
};

/** Get the active palette from cave data. */
function getBiomePal(data: CaveData): BiomePal {
  if (data.type === 'cave') return CAVE_BIOMES[data.biome as CaveBiome] ?? CAVE_BIOMES.stone;
  return GLADE_BIOMES[data.biome as GladeBiome] ?? GLADE_BIOMES.forest;
}

/**
 * 5-step cellular automata cave generation.
 * Rule: a cell is floor if ≥ 5 of its 8 neighbours are floor.
 * Border is always wall.
 */
// ── Biome structural parameters + labels ─────────────────────────────────────

/** CA rule overrides per cave biome (applied on top of user density slider). */
const BIOME_CA: Record<CaveBiome, { fillOffset: number; iter: number; survive: number; birth: number }> = {
  stone:    { fillOffset:  0.00, iter: 5, survive: 5, birth: 5 },
  coastal:  { fillOffset: -0.08, iter: 4, survive: 4, birth: 5 },
  volcanic: { fillOffset: +0.07, iter: 6, survive: 5, birth: 6 },
  desert:   { fillOffset: -0.14, iter: 3, survive: 4, birth: 4 },
  verdant:  { fillOffset: -0.04, iter: 7, survive: 5, birth: 4 },
  frozen:   { fillOffset: +0.04, iter: 5, survive: 5, birth: 5 },
};

const CAVE_FEAT_LABELS: Record<CaveBiome, Partial<Record<CaveFeature['kind'], string>>> = {
  stone:    { water:'Underground Lake', mineral:'Ore Vein',    spawn:'Cave Beast',    treasure:'Treasure Cache', mushroom:'Fungus' },
  coastal:  { water:'Tidal Pool',       mineral:'Coral',        spawn:'Sea Creature',  treasure:'Sunken Cache',   flower:'Anemone' },
  volcanic: { water:'Lava River',       mineral:'Obsidian',     spawn:'Fire Imp',      treasure:'Dragon Hoard' },
  desert:   { water:'Hidden Oasis',     mineral:'Sandstone',    spawn:'Scorpion',      treasure:'Buried Relic' },
  verdant:  { water:'Glowing Pool',     mineral:'Cave Moss',    spawn:'Cave Toad',     treasure:'Crystal Cache',  mushroom:'Giant Mushroom' },
  frozen:   { water:'Frozen Lake',      mineral:'Ice Crystal',  spawn:'Frost Beast',   treasure:'Frozen Relic' },
};

const GLADE_FEAT_LABELS: Record<GladeBiome, Partial<Record<CaveFeature['kind'], string>>> = {
  forest:  { water:'Forest Pool', tree:'Oak',          flower:'Wildflower',    mushroom:'Toadstool',   spawn:'Forest Beast' },
  autumn:  { water:'Autumn Pool', tree:'Oak',           flower:'Fallen Leaf',   mushroom:'Bracket Fungus',spawn:'Forest Spirit' },
  blossom: { water:'Petal Pool',  tree:'Cherry Tree',   flower:'Cherry Blossom',mushroom:'Pink Cap',    spawn:'Sprite' },
  wetland: { water:'Marsh Pool',  tree:'Willow',        flower:'Lily Pad',      mushroom:'Swamp Shroom',spawn:'Marsh Creature' },
  tundra:  { water:'Ice Melt',    tree:'Pine',          flower:'Frost Flower',  mushroom:'Frost Cap',   spawn:'Tundra Beast' },
};

function generateCaveData(
  seed: number,
  type: CaveType,
  biome: string = type === 'cave' ? 'stone' : 'forest',
  size: number = 2,
  density: number = 0.47,
): CaveData {
  const SIZES: Record<number, [number, number]> = { 1: [52, 40], 2: [72, 54], 3: [92, 68] };
  const [W, H] = SIZES[size] ?? SIZES[2]!;
  const rand = mulberry32(seed);
  let grid: boolean[][];

  if (type === 'cave') {
    const ca = BIOME_CA[biome as CaveBiome] ?? BIOME_CA.stone;
    const fill = Math.min(0.65, Math.max(0.25, density + ca.fillOffset));
    grid = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        if (x < 2 || y < 2 || x > W - 3 || y > H - 3) return false;
        return rand() > fill;
      }),
    );
    for (let iter = 0; iter < ca.iter; iter++) {
      grid = grid.map((row, y) =>
        row.map((_, x) => {
          if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]?.[x + dx]) n++;
          return n >= ca.survive;
        }),
      );
    }
    // Desert: extra wind-erosion pass = wider passages
    if (biome === 'desert') {
      grid = grid.map((row, y) =>
        row.map((_, x) => {
          if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]?.[x + dx]) n++;
          return n >= 3;
        }),
      );
    }
    // Flood-fill: keep only the largest connected region
    const visited = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
    let bestCells: Array<[number, number]> = [];
    for (let sy = 1; sy < H - 1; sy++) {
      for (let sx = 1; sx < W - 1; sx++) {
        if (!grid[sy]![sx] || visited[sy]![sx]) continue;
        const region: Array<[number, number]> = [];
        const q: Array<[number, number]> = [[sx, sy]];
        while (q.length) {
          const [cx, cy] = q.pop()!;
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          if (visited[cy]![cx] || !grid[cy]![cx]) continue;
          visited[cy]![cx] = true;
          region.push([cx, cy]);
          q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
        }
        if (region.length > bestCells.length) bestCells = region;
      }
    }
    const mainSet = new Set(bestCells.map(([x, y]) => `${x},${y}`));
    grid = grid.map((row, y) => row.map((v, x) => v && mainSet.has(`${x},${y}`)));
    // Desert: scatter rock pillar islands in open areas
    if (biome === 'desert') {
      const nPillars = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < nPillars; p++) {
        const px = 5 + Math.floor(rand() * (W - 10));
        const py = 5 + Math.floor(rand() * (H - 10));
        const r  = 1 + Math.floor(rand() * 2);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (dx*dx + dy*dy <= r*r + 1 && py+dy >= 1 && py+dy < H-1 && px+dx >= 1 && px+dx < W-1)
              grid[py+dy]![px+dx] = false;
      }
    }
  } else {
    // Organic glade: ellipse clearing with noisy CA-smoothed edge
    const cx = W / 2, cy = H / 2;
    const rx = W * (0.20 + rand() * 0.08);
    const ry = H * (0.22 + rand() * 0.08);
    grid = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const jitter = Math.sin(x * 0.8) * 0.18 + Math.cos(y * 0.9) * 0.14 + (rand() - 0.5) * 0.2;
        return dist + jitter < 1.0;
      }),
    );
    for (let iter = 0; iter < 3; iter++) {
      grid = grid.map((row, y) =>
        row.map((_, x) => {
          if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]?.[x + dx]) n++;
          return n >= 4;
        }),
      );
    }
    const numBranch = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < numBranch; b++) {
      const angle = rand() * Math.PI * 2;
      const dist  = rx * (0.8 + rand() * 0.5);
      const brx = cx + Math.cos(angle) * dist;
      const bry = cy + Math.sin(angle) * dist;
      const brR = rx * (0.3 + rand() * 0.3);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const ddx = x - brx, ddy = y - bry;
          if (ddx*ddx + ddy*ddy < brR*brR) grid[y]![x] = true;
        }
      const steps = 12;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(cx + (brx - cx) * t);
        const py = Math.round(cy + (bry - cy) * t);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (py+dy >= 0 && py+dy < H && px+dx >= 0 && px+dx < W)
              grid[py+dy]![px+dx] = true;
      }
    }
  }

  // ── Scatter features ──────────────────────────────────────────────────────
  const features: CaveFeature[] = [];
  const floorCells: Array<[number, number]> = [];
  const edgeCells:  Array<[number, number]> = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!grid[y]![x]) continue;
      floorCells.push([x, y]);
      let isEdge = false;
      for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
        if (!grid[y+dy]?.[x+dx]) { isEdge = true; break; }
      if (isEdge) edgeCells.push([x, y]);
    }
  }
  const shuffled = (arr: Array<[number,number]>) => [...arr].sort(() => rand() - 0.5);

  if (type === 'cave') {
    const b = biome as CaveBiome;
    if (b === 'coastal') {
      // Sea floods bottom 35% — continuous water floor
      const seaLine = Math.floor(H * 0.65);
      for (let y = seaLine; y < H; y++)
        for (let x = 0; x < W; x++)
          if (grid[y]?.[x]) features.push({ x, y, kind: 'water' });
      for (const [x, y] of shuffled(edgeCells.filter(([,ey]) => ey < seaLine)).slice(0, 14))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(edgeCells.filter(([,ey]) => ey < seaLine)).slice(0, 6))
        features.push({ x, y, kind: 'flower' });
      for (const [x, y] of shuffled(floorCells).slice(0, 4))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 1))
        features.push({ x, y, kind: 'treasure' });
    } else if (b === 'volcanic') {
      // 1-2 lava rivers: diagonal strips crossing the cave
      const nRivers = 1 + Math.floor(rand() * 2);
      for (let r = 0; r < nRivers; r++) {
        const sy = 4 + Math.floor(rand() * (H - 8));
        const drift = Math.floor((rand() - 0.5) * H * 0.4);
        for (let x = 1; x < W - 1; x++) {
          const y = Math.round(sy + drift * x / (W - 2));
          for (let dy = -1; dy <= 1; dy++) {
            const ty = y + dy;
            if (ty >= 1 && ty < H - 1 && grid[ty]?.[x])
              features.push({ x, y: ty, kind: 'water' });
          }
        }
      }
      for (const [x, y] of shuffled(edgeCells).slice(0, 16 + Math.floor(rand() * 8)))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(floorCells).slice(0, 5 + Math.floor(rand() * 5)))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 1))
        features.push({ x, y, kind: 'treasure' });
    } else if (b === 'desert') {
      // Single rare oasis
      const [ox, oy] = shuffled(floorCells)[0] ?? [W/2|0, H/2|0];
      const or = 1 + Math.floor(rand() * 2);
      for (let dy = -or; dy <= or; dy++)
        for (let dx = -or; dx <= or; dx++)
          if (dx*dx+dy*dy <= or*or && grid[oy+dy]?.[ox+dx])
            features.push({ x: ox+dx, y: oy+dy, kind: 'water' });
      for (const [x, y] of shuffled(edgeCells).slice(0, 18 + Math.floor(rand() * 8)))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(floorCells).slice(0, 6 + Math.floor(rand() * 4)))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 2))
        features.push({ x, y, kind: 'treasure' });
    } else if (b === 'verdant') {
      // Winding bioluminescent cave streams
      const nStreams = 1 + Math.floor(rand() * 2);
      for (let s = 0; s < nStreams; s++) {
        const [sx, sy] = floorCells[Math.floor(rand() * floorCells.length)] ?? [W/2|0, H/2|0];
        let [wx, wy] = [sx, sy];
        for (let step = 0; step < 24; step++) {
          if (grid[wy]?.[wx]) features.push({ x: wx, y: wy, kind: 'water' });
          const DXDY: [number,number][] = [[1,0],[-1,0],[0,1],[0,-1]];
          const [ndx, ndy] = DXDY[Math.floor(rand() * 4)]!;
          const nx = wx + ndx, ny = wy + ndy;
          if (nx >= 1 && nx < W-1 && ny >= 1 && ny < H-1 && grid[ny]?.[nx]) { wx = nx; wy = ny; }
        }
      }
      for (const [x, y] of shuffled(edgeCells).slice(0, 20))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(floorCells).slice(0, 18))
        features.push({ x, y, kind: 'mushroom' });
      for (const [x, y] of shuffled(floorCells).slice(0, 5))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 2))
        features.push({ x, y, kind: 'treasure' });
    } else if (b === 'frozen') {
      // Large central frozen lake
      const [lx, ly] = shuffled(floorCells)[Math.floor(floorCells.length * 0.5)] ?? [W/2|0, H/2|0];
      const lr = 4 + Math.floor(rand() * 4);
      for (let dy = -lr; dy <= lr; dy++)
        for (let dx = -lr; dx <= lr; dx++)
          if (dx*dx+dy*dy <= lr*lr && grid[ly+dy]?.[lx+dx])
            features.push({ x: lx+dx, y: ly+dy, kind: 'water' });
      for (const [x, y] of shuffled(edgeCells).slice(0, 14))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(floorCells).slice(0, 4))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 1))
        features.push({ x, y, kind: 'treasure' });
    } else {
      // Stone (default)
      const lakeSeeds = shuffled(floorCells).slice(0, 2 + Math.floor(rand() * 2));
      for (const [sx, sy] of lakeSeeds) {
        const r = 2 + Math.floor(rand() * 3);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (dx*dx+dy*dy <= r*r && grid[sy+dy]?.[sx+dx])
              features.push({ x: sx+dx, y: sy+dy, kind: 'water' });
      }
      for (const [x, y] of shuffled(edgeCells).slice(0, 12 + Math.floor(rand() * 10)))
        features.push({ x, y, kind: 'mineral' });
      for (const [x, y] of shuffled(floorCells).slice(0, 4 + Math.floor(rand() * 5)))
        features.push({ x, y, kind: 'spawn' });
      for (const [x, y] of shuffled(floorCells).slice(0, 1 + Math.floor(rand() * 2)))
        features.push({ x, y, kind: 'treasure' });
      for (const [x, y] of shuffled(floorCells).slice(0, 6))
        features.push({ x, y, kind: 'mushroom' });
    }
  } else {
    // Glade features
    const [pw, ph] = floorCells[Math.floor(rand() * floorCells.length)] ?? [W/2|0, H/2|0];
    const pr = 2 + Math.floor(rand() * 3);
    for (let dy = -pr; dy <= pr; dy++)
      for (let dx = -pr; dx <= pr; dx++)
        if (dx*dx+dy*dy <= pr*pr && grid[(ph+dy)]?.[(pw+dx)])
          features.push({ x: pw+dx, y: ph+dy, kind: 'water' });
    const flowerRatio = biome === 'blossom' ? 0.5 : biome === 'wetland' ? 0.2 : 0.3;
    for (const [x, y] of shuffled(floorCells).slice(0, 20 + Math.floor(rand() * 10)))
      features.push({ x, y, kind: rand() < flowerRatio ? 'flower' : rand() < 0.3 ? 'mushroom' : 'flower' });
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (grid[y]![x]) continue;
        let adjFloor = false;
        for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
          if (grid[y+dy]?.[x+dx]) { adjFloor = true; break; }
        if (adjFloor && rand() > 0.45) features.push({ x, y, kind: 'tree' });
      }
    for (const [x, y] of shuffled(floorCells).slice(0, 2))
      features.push({ x, y, kind: 'spawn' });
  }

  return { grid, W, H, seed, type, biome, features };
}

/**
 * Render a cave or glade map on a canvas.
 */
export function drawCaveGlade(data: CaveData, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { grid, W, H, type, features, seed } = data;
  const biome = data.biome;
  const pal = getBiomePal(data);

  const CELL = Math.min(Math.floor((canvas.width  - 8) / W),
                        Math.floor((canvas.height - 8) / H));
  const offX = Math.floor((canvas.width  - W * CELL) / 2);
  const offY = Math.floor((canvas.height - H * CELL) / 2);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const featureMap = new Map<string, CaveFeature>();
  for (const f of features) featureMap.set(`${f.x},${f.y}`, f);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const feat  = featureMap.get(`${x},${y}`);
      const floor = grid[y]![x];
      const cx = offX + x * CELL, cy = offY + y * CELL;
      if (feat?.kind === 'water') {
        ctx.fillStyle = pal.water;
      } else if (!floor) {
        // Wall — two-tone texture
        ctx.fillStyle = (Math.sin(x * 3.1 + y * 2.3) > 0.1) ? pal.wall : pal.wall2;
      } else {
        ctx.fillStyle = (x + y) % 2 === 0 ? pal.floor : pal.floor2;
      }
      ctx.fillRect(cx, cy, CELL, CELL);
    }
  }

  const SZ = Math.max(4, CELL - 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const feat of features) {
    if (feat.kind === 'water') continue;
    const cx = offX + feat.x * CELL + CELL / 2;
    const cy = offY + feat.y * CELL + CELL / 2;
    switch (feat.kind) {
      case 'mineral':
        ctx.fillStyle = pal.mineral;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      case 'spawn':
        ctx.fillStyle = pal.spawn;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      case 'treasure':
        ctx.fillStyle = pal.treasure;
        ctx.font = `bold ${SZ + 1}px sans-serif`;
        ctx.fillText('★', cx, cy);
        ctx.font = `${SZ}px sans-serif`;
        break;
      case 'tree':
        ctx.fillStyle = pal.tree;
        ctx.beginPath();
        ctx.moveTo(cx, cy - CELL * 0.42);
        ctx.lineTo(cx + CELL * 0.38, cy + CELL * 0.38);
        ctx.lineTo(cx - CELL * 0.38, cy + CELL * 0.38);
        ctx.closePath(); ctx.fill();
        break;
      case 'flower':
        ctx.fillStyle = pal.flower;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.25, 0, Math.PI * 2); ctx.fill();
        break;
      case 'mushroom':
        ctx.fillStyle = pal.mushroom;
        ctx.beginPath(); ctx.arc(cx, cy - CELL * 0.08, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(offX, offY, W * CELL, H * CELL);

  // ── On-canvas legend ───────────────────────────────────────────────────────
  const featLabels = type === 'cave'
    ? (CAVE_FEAT_LABELS[biome as CaveBiome] ?? {})
    : (GLADE_FEAT_LABELS[biome as GladeBiome] ?? {});

  // Build legend entries from features actually present
  const seenKinds = new Set(features.map(f => f.kind));
  type LegendEntry = { color: string; symbol: string; label: string };
  const legendEntries: LegendEntry[] = [];

  const kindMeta: Partial<Record<CaveFeature['kind'], { color: ()=>string; symbol: string }>> = {
    water:    { color: () => pal.water,    symbol: '■' },
    mineral:  { color: () => pal.mineral,  symbol: '●' },
    spawn:    { color: () => pal.spawn,    symbol: '●' },
    treasure: { color: () => pal.treasure, symbol: '★' },
    mushroom: { color: () => pal.mushroom, symbol: '●' },
    flower:   { color: () => pal.flower,   symbol: '●' },
    tree:     { color: () => pal.tree,     symbol: '▲' },
  };

  for (const [kind, label] of Object.entries(featLabels) as Array<[CaveFeature['kind'], string]>) {
    if (!label || !seenKinds.has(kind)) continue;
    const meta = kindMeta[kind];
    if (!meta) continue;
    legendEntries.push({ color: meta.color(), symbol: meta.symbol, label });
  }

  if (legendEntries.length > 0) {
    const LH = 13, LW = 118;
    const LX = offX + 5;
    const LY = offY + H * CELL - LH * legendEntries.length - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(LX - 2, LY - 3, LW, LH * legendEntries.length + 6);
    ctx.textBaseline = 'middle';
    for (let i = 0; i < legendEntries.length; i++) {
      const e = legendEntries[i]!;
      const ly = LY + i * LH + LH * 0.5;
      ctx.fillStyle = e.color;
      ctx.font = `${Math.max(6, CELL)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(e.symbol, LX + 6, ly);
      ctx.fillStyle = 'rgba(240,235,220,0.92)';
      ctx.font = '7px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText(e.label, LX + 14, ly);
    }
  }

  ctx.fillStyle = pal.label;
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${pal.name}  ·  seed ${seed}`, canvas.width / 2, canvas.height - 4);
}

// ── Cave mode state ───────────────────────────────────────────────────────────

let currentCaveData: CaveData | null = null;

function getCaveParams(): { type: CaveType; biome: string; size: number; density: number } {
  const type    = (document.querySelector('#cave-type-pills .pill.active')  as HTMLElement)?.dataset.ctype  as CaveType ?? 'cave';
  const biome   = type === 'cave'
    ? ((document.querySelector('#cave-biome-pills .pill.active')  as HTMLElement)?.dataset.biome  ?? 'stone')
    : ((document.querySelector('#glade-biome-pills .pill.active') as HTMLElement)?.dataset.gbiome ?? 'forest');
  const size    = parseInt((document.getElementById('cave-size')    as HTMLInputElement)?.value    ?? '2');
  const density = parseInt((document.getElementById('cave-density') as HTMLInputElement)?.value ?? '47') / 100;
  return { type, biome, size, density };
}

function generateCaveView() {
  const seed = parseInt(seedInput.value) || Date.now();
  const { type, biome, size, density } = getCaveParams();
  currentCaveData = generateCaveData(seed, type, biome, size, density);
  drawCaveGlade(currentCaveData, canvas);
  const floors = currentCaveData.grid.flat().filter(Boolean).length;
  genTimeEl.textContent = `${(CAVE_BIOMES[biome as CaveBiome] ?? GLADE_BIOMES[biome as GladeBiome])?.name ?? biome}  ·  ${floors} open cells  ·  seed ${seed}`;
}

function redrawCave() { if (currentCaveData) drawCaveGlade(currentCaveData, canvas); }

// ── OW-A: Realm / Macro World Generator ──────────────────────────────────────

type RealmBiome =
  | 'deep_ocean' | 'ocean' | 'beach'
  | 'desert' | 'savanna' | 'grassland' | 'forest' | 'taiga' | 'tundra' | 'snow';

type RealmShape   = 'island' | 'continents' | 'archipelago' | 'pangaea';
type RealmClimate = 'tropical' | 'temperate' | 'arctic';

interface RealmCell { elevation: number; moisture: number; biome: RealmBiome; }
interface RealmRiver { points: Vec2[]; }

interface RealmSettlement {
  x: number; y: number;
  name: string;
  size: 'village' | 'town' | 'city';
  faction: SettlementFaction;
}

export interface RealmData {
  cells: RealmCell[][];
  W: number; H: number;
  rivers: RealmRiver[];
  settlements: RealmSettlement[];
  towerX: number; towerY: number;
  seed: number;
}

const REALM_BIOME_COLOR: Record<RealmBiome, string> = {
  deep_ocean: '#304880', ocean: '#4060b0', beach: '#d4c880',
  desert: '#d8b060', savanna: '#a8c050', grassland: '#60a038',
  forest: '#2a7030', taiga: '#386858', tundra: '#708090', snow: '#c8d8e4',
};

const REALM_BIOME_LABEL: Record<RealmBiome, string> = {
  deep_ocean:'Deep Ocean', ocean:'Ocean', beach:'Coastline',
  desert:'Desert', savanna:'Savanna', grassland:'Grassland',
  forest:'Forest', taiga:'Taiga', tundra:'Tundra', snow:'Snowfield',
};

const SETTLEMENT_SIZE_COLOR: Record<'village'|'town'|'city', string> = {
  village: '#d8c090', town: '#e8a848', city: '#e05828',
};

const NAME_PRE  = ['Alder','Bright','Cedar','Dark','Elder','Fern','Grey','Haven','Iron','Jade','Loch','Marsh','North','Oak','Pine','Stone','Thorn','White','Wood','Yew'];
const NAME_SUFF = ['bury','dale','fall','ford','gate','haven','holm','keep','mere','moor','port','reach','stead','vale','well','wood','field','cross','bridge','cliff'];

function realmName(rand: () => number): string {
  return NAME_PRE[Math.floor(rand() * NAME_PRE.length)]! + NAME_SUFF[Math.floor(rand() * NAME_SUFF.length)]!;
}

function classifyBiome(elev: number, moist: number, temp: number): RealmBiome {
  if (elev < 0.28) return 'deep_ocean';
  if (elev < 0.35) return 'ocean';
  if (elev < 0.40) return 'beach';
  if (elev > 0.85) return 'snow';
  if (temp < 0.15) return 'tundra';
  if (temp < 0.30) return 'taiga';
  if (moist < 0.25) return 'desert';
  if (moist < 0.45 && temp > 0.60) return 'savanna';
  if (moist < 0.50) return 'grassland';
  if (temp < 0.55) return 'taiga';
  return 'forest';
}

function fbmR(noise: (x: number, y: number) => number, x: number, y: number, oct: number, scale = 1): number {
  let v = 0, amp = 0.5, freq = scale, max = 0;
  for (let i = 0; i < oct; i++) { v += noise(x*freq, y*freq)*amp; max += amp; amp *= 0.5; freq *= 2.0; }
  return (v / max + 1) / 2;
}

export function generateRealmData(seed: number, W = 96, H = 72, nSettlements = 6, shape: RealmShape = 'island', climate: RealmClimate = 'temperate', roughness: number = 0.5): RealmData {
  const rand  = mulberry32(seed);
  const rand2 = mulberry32(seed ^ 0xDEADBEEF);
  const rand3 = mulberry32(seed ^ 0xC0FFEE);
  const rand4 = mulberry32(seed ^ 0xF00DBABE);

  const noiseE = createNoise2D(seed);
  const noiseM = createNoise2D(seed ^ 0xDEADBEEF);
  const noiseT = createNoise2D(seed ^ 0xC0FFEE);
  const noiseR = createNoise2D(seed ^ 0xBADF00D);   // ridge/continent noise

  // ── Continent mask per world shape ──────────────────────────────────────────
  type MaskFn = (nx: number, ny: number) => number;
  let mask: MaskFn;

  if (shape === 'island') {
    mask = (nx, ny) => Math.min(nx, 1-nx, ny, 1-ny) * 4.2;

  } else if (shape === 'continents') {
    const nC = 2 + Math.floor(rand() * 2);
    const C = Array.from({ length: nC }, () => ({
      cx: 0.12 + rand() * 0.76,  cy: 0.12 + rand() * 0.76,
      rx: 0.14 + rand() * 0.20,  ry: 0.10 + rand() * 0.16,
      rot: rand() * Math.PI,
    }));
    mask = (nx, ny) => {
      let v = 0;
      for (const c of C) {
        const dx = nx - c.cx, dy = ny - c.cy;
        const rx = dx * Math.cos(c.rot) + dy * Math.sin(c.rot);
        const ry = -dx * Math.sin(c.rot) + dy * Math.cos(c.rot);
        const d  = Math.sqrt((rx/c.rx)**2 + (ry/c.ry)**2);
        v = Math.max(v, Math.max(0, 1.1 - d));
      }
      return v;
    };

  } else if (shape === 'archipelago') {
    const nI = 12 + Math.floor(rand() * 10);
    const islands = Array.from({ length: nI }, () => ({
      cx: 0.04 + rand() * 0.92,  cy: 0.04 + rand() * 0.92,
      r:  0.025 + rand() * 0.06,
    }));
    mask = (nx, ny) => {
      let v = 0;
      for (const isl of islands) {
        const d = Math.hypot((nx-isl.cx)/isl.r, (ny-isl.cy)/isl.r);
        v = Math.max(v, Math.max(0, 1 - d));
      }
      return v;
    };

  } else {
    // Pangaea: one huge central landmass
    mask = (nx, ny) => {
      const dx = nx - 0.5, dy = ny - 0.5;
      const jitter = Math.sin(nx * 8) * 0.06 + Math.cos(ny * 7) * 0.05;
      return Math.max(0, 1 - Math.sqrt(dx*dx*1.5 + dy*dy*1.2) * 1.3 + jitter);
    };
  }

  // ── Terrain roughness → noise params ────────────────────────────────────────
  const oct   = 4 + Math.round(roughness * 2);   // 4-6 octaves
  const scale = 1.8 + roughness * 1.2;            // 1.8-3.0

  // ── Climate → temperature offset ─────────────────────────────────────────────
  const climateBias = climate === 'tropical' ? 0.30 : climate === 'arctic' ? -0.30 : 0;

  // ── Build cell grid ──────────────────────────────────────────────────────────
  const cells: RealmCell[][] = Array.from({ length: H }, (_, cy) =>
    Array.from({ length: W }, (_, cx) => {
      const nx = cx / W, ny = cy / H;

      // Elevation: continent mask + fBm noise
      const mVal   = Math.min(1, mask(nx, ny));
      const noise  = fbmR(noiseE, nx, ny, oct, scale);
      const ridge  = Math.abs(fbmR(noiseR, nx*1.3, ny*1.3, 3, 3.0) - 0.5) * 2;
      const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

      // Moisture
      const moist  = fbmR(noiseM, nx+5, ny+5, 3, 1.8);

      // Temperature: latitude + elevation + climate bias + noise jitter
      const latT   = 1 - Math.abs(ny - 0.5) * 1.5;
      const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0;
      const tNoise = fbmR(noiseT, nx+10, ny+10, 2, 1.2) * 0.12;
      const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

      return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
    }),
  );

  // ── Rivers ───────────────────────────────────────────────────────────────────
  const rivers: RealmRiver[] = [];
  const DIRS8: [number,number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
  let riverCount = 0;
  const maxRivers = 4 + Math.floor(roughness * 8);

  for (let y = 2; y < H-2 && riverCount < maxRivers; y++) {
    for (let x = 2; x < W-2 && riverCount < maxRivers; x++) {
      const c = cells[y]![x]!;
      if (c.elevation > 0.68 && c.biome !== 'deep_ocean' && c.biome !== 'ocean' && c.biome !== 'snow' && rand4() > 0.965) {
        const pts: Vec2[] = [{ x: x+0.5, y: y+0.5 }];
        let [cx, cy2] = [x, y];
        const visited = new Set<string>();
        for (let step = 0; step < 220; step++) {
          const key = `${cx},${cy2}`;
          if (visited.has(key)) break;
          visited.add(key);
          const b = cells[cy2]![cx]!.biome;
          if (b === 'ocean' || b === 'deep_ocean') break;
          const curE = cells[cy2]![cx]!.elevation;
          let lowestE = curE - 0.0005, nx2 = cx, ny2 = cy2;
          for (const [dy, dx] of DIRS8) {
            const ney = cy2+dy, nex = cx+dx;
            if (ney < 0||ney >= H||nex < 0||nex >= W) continue;
            const e = cells[ney]![nex]!.elevation;
            if (e < lowestE) { lowestE = e; nx2 = nex; ny2 = ney; }
          }
          if (nx2 === cx && ny2 === cy2) break;
          cx = nx2; cy2 = ny2;
          pts.push({ x: cx+0.5, y: cy2+0.5 });
        }
        if (pts.length >= 6) { rivers.push({ points: chaikin(pts, 2) }); riverCount++; }
      }
    }
  }

  // ── Settlements ──────────────────────────────────────────────────────────────
  const VALID = new Set<RealmBiome>(['grassland','forest','savanna','taiga','desert']);
  const validCells: Vec2[] = [];
  for (let y = 4; y < H-4; y++) for (let x = 4; x < W-4; x++)
    if (VALID.has(cells[y]![x]!.biome)) validCells.push({ x, y });

  const sv = [...validCells].sort(() => rand() - 0.5);
  const settlements: RealmSettlement[] = [];
  const MIN_DIST = Math.floor(Math.min(W,H) / (nSettlements + 2));
  const FACTIONS: SettlementFaction[] = ['human','elven','dwarven','orcish','vulperia','slime','vampire','undead','fae'];

  for (const cell of sv) {
    if (settlements.length >= nSettlements) break;
    const td = Math.hypot(cell.x - W/2, cell.y - H/2);
    if (td < MIN_DIST * 0.5) continue;
    if (settlements.every(s => Math.hypot(s.x-cell.x, s.y-cell.y) >= MIN_DIST)) {
      const b = cells[cell.y]![cell.x]!.biome;
      const sz: 'village'|'town'|'city' = td > MIN_DIST*2.5 && (b==='forest'||b==='grassland') ? 'city'
                                        : td > MIN_DIST*1.2 ? 'town' : 'village';
      const faction = FACTIONS[Math.floor(rand() * FACTIONS.length)]!;
      settlements.push({ x: cell.x, y: cell.y, name: realmName(rand), size: sz, faction });
    }
  }

  // Tower at map centre (nudge to land)
  let [towerX, towerY] = [Math.floor(W/2), Math.floor(H/2)];
  for (let r = 0; r < 14; r++) {
    const b = cells[towerY]![towerX]!.biome;
    if (b !== 'ocean' && b !== 'deep_ocean') break;
    for (const [dy, dx] of DIRS8) {
      const ty = towerY+dy*Math.ceil(r/2), tx = towerX+dx*Math.ceil(r/2);
      if (ty >= 0&&ty < H&&tx >= 0&&tx < W) {
        const tb = cells[ty]![tx]!.biome;
        if (tb !== 'ocean' && tb !== 'deep_ocean') { towerX = tx; towerY = ty; break; }
      }
    }
  }

  return { cells, W, H, rivers, settlements, towerX, towerY, seed };
}

export function drawRealm(data: RealmData, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { cells, W, H, rivers, settlements, towerX, towerY, seed } = data;
  const CELL = Math.max(2, Math.min(
    Math.floor((canvas.width  - 4) / W),
    Math.floor((canvas.height - 4) / H)
  ));
  const offX = Math.floor((canvas.width  - W*CELL) / 2);
  const offY = Math.floor((canvas.height - H*CELL) / 2);

  // Background (outer ocean)
  ctx.fillStyle = '#1a2840'; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ── Biome cells with ocean depth shading ──────────────────────────────────
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = cells[y]![x]!;
      if (c.biome === 'deep_ocean') {
        // Depth gradient: deeper = darker
        const depth = Math.max(0, 1 - c.elevation / 0.28);
        const r = Math.round(20 + (1-depth)*20),  g = Math.round(32 + (1-depth)*28),  b = Math.round(70 + (1-depth)*30);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else if (c.biome === 'ocean') {
        const t = Math.max(0, 1 - (c.elevation - 0.28) / 0.07);
        const r = Math.round(50 + t*15),  g = Math.round(80 + t*15),  b = Math.round(160 + t*20);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        ctx.fillStyle = REALM_BIOME_COLOR[c.biome];
      }
      ctx.fillRect(offX+x*CELL, offY+y*CELL, CELL, CELL);
    }
  }

  // ── Elevation shading on land (mountain height gradient) ──────────────────
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = cells[y]![x]!;
      if (c.biome === 'ocean' || c.biome === 'deep_ocean') continue;
      if (c.elevation > 0.60) {
        const t = (c.elevation - 0.60) / 0.40;
        ctx.fillStyle = `rgba(255,255,255,${t * 0.32})`;
        ctx.fillRect(offX+x*CELL, offY+y*CELL, CELL, CELL);
      }
      // Subtle terrain shadow (south face slightly darker)
      if (c.elevation > 0.45 && y > 0) {
        const above = cells[y-1]![x]!.elevation;
        if (above > c.elevation + 0.04) {
          ctx.fillStyle = `rgba(0,0,0,0.12)`;
          ctx.fillRect(offX+x*CELL, offY+y*CELL, CELL, CELL);
        }
      }
    }
  }

  // ── Contour lines ─────────────────────────────────────────────────────────
  if (CELL >= 3) {
    for (const [level, alpha] of [[0.50, 0.12],[0.62, 0.16],[0.74, 0.22],[0.85, 0.28]] as [number,number][]) {
      ctx.strokeStyle = `rgba(70,55,35,${alpha})`;
      ctx.lineWidth = 0.5;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = cells[y]![x]!.elevation;
        const eR = cells[y]?.[x+1]?.elevation ?? e;
        const eD = cells[y+1]?.[x]?.elevation ?? e;
        if ((e >= level) !== (eR >= level)) {
          ctx.beginPath(); ctx.moveTo(offX+(x+1)*CELL, offY+y*CELL); ctx.lineTo(offX+(x+1)*CELL, offY+(y+1)*CELL); ctx.stroke();
        }
        if ((e >= level) !== (eD >= level)) {
          ctx.beginPath(); ctx.moveTo(offX+x*CELL, offY+(y+1)*CELL); ctx.lineTo(offX+(x+1)*CELL, offY+(y+1)*CELL); ctx.stroke();
        }
      }
    }
  }

  // ── Forest stipple ────────────────────────────────────────────────────────
  if (CELL >= 3) {
    ctx.fillStyle = 'rgba(20,50,20,0.42)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (cells[y]![x]!.biome === 'forest' && (x*3 + y*7) % 5 === 0) {
        ctx.beginPath(); ctx.arc(offX+x*CELL+CELL/2, offY+y*CELL+CELL/2, CELL*0.22, 0, Math.PI*2); ctx.fill();
      }
  }

  // ── Mountain △ symbols (only when cells are large enough) ─────────────────
  if (CELL >= 5) {
    ctx.font = `${CELL+1}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = cells[y]![x]!;
      if (c.elevation > 0.78 && c.biome !== 'ocean' && c.biome !== 'deep_ocean') {
        ctx.fillStyle = c.elevation > 0.88 ? 'rgba(240,240,255,0.7)' : 'rgba(60,50,35,0.6)';
        ctx.fillText('△', offX+x*CELL+CELL/2, offY+y*CELL+CELL/2);
      }
    }
  }

  // ── Coastline border ───────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(20,30,80,0.45)'; ctx.lineWidth = 0.7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const isO = cells[y]![x]!.biome === 'ocean' || cells[y]![x]!.biome === 'deep_ocean';
    for (const [dy, dx] of [[0,1],[1,0]] as [number,number][]) {
      const ny2=y+dy, nx2=x+dx;
      if (ny2>=H||nx2>=W) continue;
      const nO = cells[ny2]![nx2]!.biome === 'ocean' || cells[ny2]![nx2]!.biome === 'deep_ocean';
      if (isO!==nO) {
        ctx.beginPath();
        if (dx===1) { ctx.moveTo(offX+(x+1)*CELL, offY+y*CELL); ctx.lineTo(offX+(x+1)*CELL, offY+(y+1)*CELL); }
        else        { ctx.moveTo(offX+x*CELL, offY+(y+1)*CELL); ctx.lineTo(offX+(x+1)*CELL, offY+(y+1)*CELL); }
        ctx.stroke();
      }
    }
  }

  // ── Settlement roads ───────────────────────────────────────────────────────
  if (settlements.length > 1) {
    ctx.strokeStyle = 'rgba(170,140,70,0.55)'; ctx.lineWidth = 0.8; ctx.setLineDash([2,3]);
    for (let i = 0; i < settlements.length; i++) {
      for (let j = i+1; j < settlements.length; j++) {
        const d = Math.hypot(settlements[i].x - settlements[j].x, settlements[i].y - settlements[j].y);
        if (d < W / 3.5) {
          ctx.beginPath();
          ctx.moveTo(offX+(settlements[i].x+0.5)*CELL, offY+(settlements[i].y+0.5)*CELL);
          ctx.lineTo(offX+(settlements[j].x+0.5)*CELL, offY+(settlements[j].y+0.5)*CELL);
          ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
  }

  // ── Rivers ────────────────────────────────────────────────────────────────
  ctx.lineCap='round'; ctx.lineJoin='round';
  for (let ri = 0; ri < rivers.length; ri++) {
    const river = rivers[ri]!;
    if (river.points.length < 2) continue;
    // Rivers get slightly wider downstream
    const w = Math.max(0.8, Math.min(2.5, CELL * 0.4 + ri * 0.1));
    ctx.strokeStyle = '#6090d8'; ctx.lineWidth = w;
    ctx.beginPath();
    river.points.forEach((p, i) => {
      const px = offX+p.x*CELL, py = offY+p.y*CELL;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    });
    ctx.stroke();
  }

  // ── Tower ─────────────────────────────────────────────────────────────────
  const tx = offX+(towerX+0.5)*CELL, ty2 = offY+(towerY+0.5)*CELL;
  const tr = Math.max(3, CELL*1.4);
  // Glow
  ctx.strokeStyle = 'rgba(240,200,30,0.3)'; ctx.lineWidth = 4;
  ctx.beginPath(); for (let i=0;i<6;i++) { const a=(i/6)*Math.PI*2-Math.PI/6; i===0?ctx.moveTo(tx+tr*1.5*Math.cos(a),ty2+tr*1.5*Math.sin(a)):ctx.lineTo(tx+tr*1.5*Math.cos(a),ty2+tr*1.5*Math.sin(a)); } ctx.closePath(); ctx.stroke();
  // Hex ring
  ctx.strokeStyle = '#f0d020'; ctx.lineWidth = 1.5;
  ctx.beginPath(); for (let i=0;i<6;i++) { const a=(i/6)*Math.PI*2-Math.PI/6; i===0?ctx.moveTo(tx+tr*Math.cos(a),ty2+tr*Math.sin(a)):ctx.lineTo(tx+tr*Math.cos(a),ty2+tr*Math.sin(a)); } ctx.closePath(); ctx.stroke();
  ctx.fillStyle='#f0d020'; ctx.font=`${Math.max(6,CELL)}px sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⬡',tx,ty2);

  // ── Settlements ───────────────────────────────────────────────────────────
  const dotR = Math.max(2, CELL*0.75);
  ctx.font = `${Math.max(7,Math.min(10,CELL+2))}px Georgia, serif`; ctx.textBaseline='top';
  for (const s of settlements) {
    const sx=offX+(s.x+0.5)*CELL, sy=offY+(s.y+0.5)*CELL;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(sx,sy,dotR+1.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=SETTLEMENT_SIZE_COLOR[s.size]; ctx.beginPath(); ctx.arc(sx,sy,dotR,0,Math.PI*2); ctx.fill();
    // White ring for cities
    if (s.size === 'city') { ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(sx,sy,dotR+0.5,0,Math.PI*2); ctx.stroke(); }
    ctx.fillStyle='rgba(240,230,200,0.95)'; ctx.textAlign='center'; ctx.fillText(s.name,sx,sy+dotR+1);
  }

  // ── Compass rose ───────────────────────────────────────────────────────────
  const cr = Math.max(8, CELL * 2.5);
  const crx = offX + W*CELL - cr - 8, cry = offY + H*CELL - cr - 8;
  ctx.save(); ctx.translate(crx, cry);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(0, 0, cr*1.1, 0, Math.PI*2); ctx.fill();
  // N petal
  ctx.fillStyle = '#d8c888';
  ctx.beginPath(); ctx.moveTo(0,-cr); ctx.lineTo(cr*0.28,0); ctx.lineTo(0,cr*0.38); ctx.closePath(); ctx.fill();
  // S petal
  ctx.fillStyle = '#6a6050';
  ctx.beginPath(); ctx.moveTo(0,cr); ctx.lineTo(-cr*0.28,0); ctx.lineTo(0,-cr*0.38); ctx.closePath(); ctx.fill();
  // E/W bars
  ctx.strokeStyle = '#d8c888'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-cr*0.7,0); ctx.lineTo(cr*0.7,0); ctx.stroke();
  // N label
  ctx.fillStyle='#d8c888'; ctx.font=`bold ${Math.max(6,cr*0.5)}px Georgia,serif`;
  ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText('N',0,-cr-2);
  ctx.restore();

  // ── Frame ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle='#8a7a58'; ctx.lineWidth=2;
  ctx.strokeRect(offX, offY, W*CELL, H*CELL);
  // Inner thin frame
  ctx.strokeStyle='rgba(140,120,80,0.4)'; ctx.lineWidth=0.8;
  ctx.strokeRect(offX+3, offY+3, W*CELL-6, H*CELL-6);

  // ── Biome legend ──────────────────────────────────────────────────────────
  const present = new Set(data.cells.flat().map(c=>c.biome));
  const lbs = (['ocean','beach','desert','savanna','grassland','forest','taiga','tundra','snow'] as RealmBiome[]).filter(b=>present.has(b));
  const LH=11, LX=offX+5, LY=offY+5;
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(LX-2, LY-2, 86, LH*lbs.length+4);
  lbs.forEach((b, i) => {
    ctx.fillStyle=REALM_BIOME_COLOR[b]; ctx.fillRect(LX, LY+i*LH+2, 8, 7);
    ctx.fillStyle='rgba(240,235,220,0.92)'; ctx.font='7px Georgia, serif';
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.fillText(REALM_BIOME_LABEL[b], LX+11, LY+i*LH+2);
  });

  // ── Settlement size key ───────────────────────────────────────────────────
  const KX=offX+W*CELL-68, KY=offY+5;
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(KX-2, KY-2, 68, 40);
  let ki=0;
  for (const [sz, lab] of [['village','Village'],['town','Town'],['city','City']] as Array<['village'|'town'|'city', string]>) {
    ctx.fillStyle=SETTLEMENT_SIZE_COLOR[sz]; ctx.beginPath(); ctx.arc(KX+5, KY+5+ki*12, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(240,235,220,0.92)'; ctx.font='7px Georgia, serif';
    ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(lab, KX+11, KY+5+ki*12);
    ki++;
  }

  // ── Title ─────────────────────────────────────────────────────────────────
  ctx.fillStyle='rgba(220,210,180,0.75)'; ctx.font='10px Georgia, serif';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText(`Realm  ·  seed ${seed}  ·  ${settlements.length} settlements`, canvas.width/2, canvas.height-4);
}

// ── Realm mode state ──────────────────────────────────────────────────────────

// ── Planet view renderer (OW-A v2 — per-pixel orthographic projection) ─────────
//
// Each canvas pixel is mapped to a sphere surface point via orthographic projection:
//   dx,dy = normalised screen offset from planet centre
//   dz = sqrt(1 - dx² - dy²)   (sphere surface normal Z component)
//   lon = atan2(dx, dz) + lonOffset
//   lat = asin(dy)
//   → sample biome grid at (lon, lat)
//
// All shading (diffuse, specular, atmosphere limb, terminator) is computed per pixel.
// Clouds, stars, and city lights are baked into the same ImageData loop.
// Total cost: ~5–30 ms for a 600×600 canvas. No WebGL required.

/** Value-noise cloud texture (256×128), precomputed once per seed. */
function buildCloudGrid(W: number, H: number, seed: number): Float32Array {
  const tex = new Float32Array(W * H);
  const rand = mulberry32(seed ^ 0x514C100D);

  // Two octave value noise
  for (let oct = 0; oct < 2; oct++) {
    const freq = oct === 0 ? 6 : 14;
    const amp  = oct === 0 ? 0.65 : 0.35;
    const GW = freq + 2, GH = Math.floor(freq * H / W) + 2;
    const grid = new Float32Array(GW * GH);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const gx = x / W * freq, gy = y / H * (freq * H / W);
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = gx - ix, fy = gy - iy;
        const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
        const gi = (ix % GW + GW) % GW, gj = (iy % GH + GH) % GH;
        const v00 = grid[gj*GW + gi] ?? 0;
        const v10 = grid[gj*GW + ((gi+1)%GW)] ?? 0;
        const v01 = grid[((gj+1)%GH)*GW + gi] ?? 0;
        const v11 = grid[((gj+1)%GH)*GW + ((gi+1)%GW)] ?? 0;
        tex[y*W + x] += amp * (v00*(1-ux)*(1-uy) + v10*ux*(1-uy) + v01*(1-ux)*uy + v11*ux*uy);
      }
    }
  }
  return tex;
}

const PLANET_BIOME_RGB: Record<RealmBiome, readonly [number,number,number]> = {
  deep_ocean: [18,  38, 88],
  ocean:      [32,  62, 148],
  beach:      [198, 182, 105],
  desert:     [208, 148, 55],
  savanna:    [135, 158, 45],
  grassland:  [50,  128, 38],
  forest:     [25,  88, 28],
  taiga:      [40,  88, 65],
  tundra:     [88,  108, 125],
  snow:       [218, 235, 248],
};

export function drawRealmPlanet(data: RealmData, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { cells, W, H, rivers: _rivers, settlements, towerX, towerY, seed } = data;
  void _rivers;
  const CW = canvas.width, CH = canvas.height;
  const planetR = Math.min(CW, CH) * 0.43;
  const pcx = Math.floor(CW / 2), pcy = Math.floor(CH / 2);

  // Seeded sun direction (longitude angle, elevation)
  const sunLon  = ((seed * 0.00137) % 1) * Math.PI * 2;
  const sunElev = 0.35 + ((seed ^ 0x7F2A) & 0xFF) / 0xFF * 0.25;
  const sunX    =  Math.cos(sunElev) * Math.sin(sunLon);
  const sunY    = -Math.sin(sunElev);
  const sunZ    =  Math.cos(sunElev) * Math.cos(sunLon);

  // Centre view on the tower (tower appears at front of planet)
  const towerLon = (towerX / W) * Math.PI * 2 - Math.PI;
  const towerLat = (towerY / H - 0.5) * Math.PI;
  const lonOffset = -towerLon;
  const latOffset = -towerLat * 0.5;   // partial tilt toward tower

  // Precompute cloud texture (256×128) — fast value noise
  const CLOUD_W = 256, CLOUD_H = 128;
  const cloudTex = buildCloudGrid(CLOUD_W, CLOUD_H, seed);

  // Build image per-pixel using ImageData
  const imgData = ctx.createImageData(CW, CH);
  const px = imgData.data;

  const invR = 1 / planetR;
  const TWO_PI = Math.PI * 2;

  for (let sy = 0; sy < CH; sy++) {
    const dy = (sy - pcy) * invR;
    const dy2 = dy * dy;

    for (let sx = 0; sx < CW; sx++) {
      const base = (sy * CW + sx) << 2;
      const dx = (sx - pcx) * invR;
      const r2 = dx * dx + dy2;

      // ── Star field + deep space ─────────────────────────────────────────────
      if (r2 > 1.12) {
        // Simple hash-based stars — no extra pass needed
        const sh = Math.sin(sx * 4127.1 + sy * 2931.7 + seed * 0.0001);
        const sv = sh - Math.floor(sh);
        if (sv > 0.9968) {
          const b = Math.round(((sv - 0.9968) / 0.0032) * 255);
          px[base] = b; px[base+1] = b; px[base+2] = b + Math.round(b * 0.15);
        } else {
          px[base] = 3; px[base+1] = 4; px[base+2] = 10;
        }
        px[base+3] = 255;
        continue;
      }

      // ── Atmosphere corona (just outside planet) ─────────────────────────────
      if (r2 > 1.0) {
        const t   = (r2 - 1.0) / 0.12;
        const atm = Math.pow(Math.max(0, 1 - t), 2.5) * 0.6;
        px[base]   = Math.round(atm * 60  + 3);
        px[base+1] = Math.round(atm * 130 + 4);
        px[base+2] = Math.round(atm * 255 + 10);
        px[base+3] = 255;
        continue;
      }

      // ── On planet surface ──────────────────────────────────────────────────
      const dz      = Math.sqrt(Math.max(0, 1 - r2));
      const nrm_x   = dx, nrm_y = dy, nrm_z = dz;

      // Diffuse lighting
      const nDotL   = nrm_x * sunX + nrm_y * sunY + nrm_z * sunZ;
      const diffuse = Math.max(0, nDotL);
      const ambient = 0.10;
      const light   = ambient + diffuse * (1 - ambient);

      // Soft terminator (smooth day/night line)
      const termMix = Math.min(1, Math.max(0, nDotL * 6 + 0.8));

      // Sphere surface → lon / lat via orthographic projection
      const lon = Math.atan2(nrm_x, nrm_z) + lonOffset;
      const lat = Math.asin(Math.max(-1, Math.min(1, nrm_y + latOffset * dz)));

      // Normalised UV [0,1]
      const u = ((lon / TWO_PI % 1) + 1) % 1;
      const v = lat / Math.PI + 0.5;

      // Sample biome grid
      const gx = Math.max(0, Math.min(W-1, Math.floor(u * W)));
      const gy = Math.max(0, Math.min(H-1, Math.floor(v * H)));
      const cell   = cells[gy]![gx]!;
      const biome  = cell.biome;
      const [br, bg, bb] = PLANET_BIOME_RGB[biome];

      // Elevation brightness boost for mountains
      const elev   = cell.elevation;
      const eBoost = elev > 0.65 ? (elev - 0.65) / 0.35 * 0.28 : 0;

      // Cloud layer
      const cu   = Math.floor(u * CLOUD_W);
      const cv   = Math.floor(v * CLOUD_H);
      const cVal = cloudTex[cv * CLOUD_W + cu] ?? 0;
      const cMix = cVal > 0.52 ? Math.pow((cVal - 0.52) / 0.48, 1.8) * 0.72 : 0;

      // Polar ice caps (latitude-based)
      const absLat = Math.abs(lat);
      const iceMix = absLat > 1.28 ? Math.pow((absLat - 1.28) / 0.29, 1.5) : 0;

      // Ocean specular (Phong)
      let specBright = 0;
      if (biome === 'ocean' || biome === 'deep_ocean') {
        const rdz = 2 * nDotL * nrm_z - sunZ;
        specBright = Math.pow(Math.max(0, rdz), 40) * 0.55 * diffuse;
      }

      // City lights on night side
      let cityR = 0, cityG = 0, cityB = 0;
      if (diffuse < 0.08) {
        for (const s of settlements) {
          const sU  = s.x / W;
          const sLon2 = (sU * TWO_PI - Math.PI) + lonOffset;
          const sV  = s.y / H;
          const sLat2 = (sV - 0.5) * Math.PI + latOffset;
          const scLat = Math.cos(sLat2), ssLat = Math.sin(sLat2);
          const sdx = scLat * Math.sin(sLon2);
          const sdy = ssLat;
          const sdz = scLat * Math.cos(sLon2);
          const dot = nrm_x*sdx + nrm_y*sdy + nrm_z*sdz;
          if (dot > 0.978) {
            const str = ((dot - 0.978) / 0.022) * (1 - diffuse * 12) * 1.2;
            const glow = s.size === 'city' ? 1.4 : s.size === 'town' ? 1.0 : 0.65;
            cityR += str * glow * 255;
            cityG += str * glow * 170;
            cityB += str * glow * 30;
          }
        }
      }

      // Atmosphere limb (blue tint at sphere edge where dz ≈ 0)
      const limbAtm = Math.pow(1 - dz, 3.2) * 0.40;

      // Compose terrain → clouds → ice
      let tr = br * (1 + eBoost);
      let tg = bg * (1 + eBoost);
      let tb = bb * (1 + eBoost);

      // Blend clouds
      tr = tr * (1 - cMix) + 228 * cMix;
      tg = tg * (1 - cMix) + 234 * cMix;
      tb = tb * (1 - cMix) + 242 * cMix;

      // Blend polar ice
      tr = tr * (1 - iceMix) + 230 * iceMix;
      tg = tg * (1 - iceMix) + 242 * iceMix;
      tb = tb * (1 - iceMix) + 252 * iceMix;

      // Apply lighting
      tr = tr * light + specBright * 200 + cityR;
      tg = tg * light + specBright * 210 + cityG;
      tb = tb * light + specBright * 240 + cityB;

      // Night side darkening with faint star-shine tint
      tr = tr * termMix + (ambient * 0.6) * (1 - termMix) * br;
      tg = tg * termMix + (ambient * 0.6) * (1 - termMix) * bg;
      tb = tb * termMix + (ambient * 0.6) * (1 - termMix) * bb;

      // Atmosphere limb tint (blue at edges)
      tr = tr * (1 - limbAtm) + 65  * limbAtm;
      tg = tg * (1 - limbAtm) + 148 * limbAtm;
      tb = tb * (1 - limbAtm) + 255 * limbAtm;

      px[base]   = Math.max(0, Math.min(255, Math.round(tr)));
      px[base+1] = Math.max(0, Math.min(255, Math.round(tg)));
      px[base+2] = Math.max(0, Math.min(255, Math.round(tb)));
      px[base+3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // ── Post: atmosphere outer glow drawn over ImageData ──────────────────────
  const atmGrad = ctx.createRadialGradient(pcx, pcy, planetR * 0.90, pcx, pcy, planetR * 1.14);
  atmGrad.addColorStop(0,    'rgba(70,150,255,0)');
  atmGrad.addColorStop(0.35, 'rgba(70,150,255,0.28)');
  atmGrad.addColorStop(0.70, 'rgba(40,110,230,0.10)');
  atmGrad.addColorStop(1,    'rgba(15,70,200,0)');
  ctx.fillStyle = atmGrad;
  ctx.beginPath(); ctx.arc(pcx, pcy, planetR * 1.14, 0, Math.PI * 2); ctx.fill();

  // Specular bloom (top-left shine)
  const bloom = ctx.createRadialGradient(pcx - planetR*0.25, pcy - planetR*0.28, 0, pcx, pcy, planetR);
  bloom.addColorStop(0,   'rgba(255,255,255,0.10)');
  bloom.addColorStop(0.4, 'rgba(255,255,255,0.03)');
  bloom.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath(); ctx.arc(pcx, pcy, planetR, 0, Math.PI * 2); ctx.fill();

  // Tower ⬡ marker (visible on day side)
  const tLon = (towerX / W) * Math.PI * 2 - Math.PI + lonOffset;
  const tLat = (towerY / H - 0.5) * Math.PI + latOffset;
  const tDz  = Math.cos(tLat) * Math.cos(tLon);
  if (tDz > 0.15) {  // on visible hemisphere
    const tSx = pcx + Math.round(Math.cos(tLat) * Math.sin(tLon) * planetR);
    const tSy = pcy + Math.round(Math.sin(tLat) * planetR);
    const tr2  = Math.max(4, Math.floor(planetR * 0.025));
    ctx.strokeStyle = `rgba(240,210,30,${0.6 + tDz * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      if (i === 0) ctx.moveTo(tSx + tr2*Math.cos(a), tSy + tr2*Math.sin(a));
      else         ctx.lineTo(tSx + tr2*Math.cos(a), tSy + tr2*Math.sin(a));
    }
    ctx.closePath(); ctx.stroke();
  }

  // Caption
  ctx.fillStyle = 'rgba(155,185,220,0.65)';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`seed ${seed}  ·  ${W}×${H}  ·  ${settlements.length} settlements`, CW/2, CH-4);
}


type RealmViewMode = 'map' | 'planet' | 'hex';
let realmViewMode: RealmViewMode = 'map';

let currentRealmData: RealmData | null = null;

// Lazily-created Three.js planet renderer (only when first needed)
let planetRenderer: PlanetRenderer | null = null;
let hexPlanetRenderer: HexPlanetRenderer | null = null;

const planet3dCanvas = document.getElementById('planet-3d-canvas') as HTMLCanvasElement;

function getPlanetRenderer(): PlanetRenderer {
  if (!planetRenderer) {
    planetRenderer = new PlanetRenderer(planet3dCanvas);
    const wrap = planet3dCanvas.parentElement!;
    planetRenderer.resize(wrap.clientWidth, wrap.clientHeight);
  }
  return planetRenderer;
}

function getHexPlanetRenderer(): HexPlanetRenderer {
  if (!hexPlanetRenderer) {
    hexPlanetRenderer = new HexPlanetRenderer(planet3dCanvas);
    const wrap = planet3dCanvas.parentElement!;
    hexPlanetRenderer.resize(wrap.clientWidth, wrap.clientHeight);
  }
  return hexPlanetRenderer;
}

function showPlanetCanvas(show: boolean): void {
  planet3dCanvas.style.display = show ? '' : 'none';
  canvas.style.display         = show ? 'none' : '';
  overlay.style.display        = show ? 'none' : '';
  const layerCtrl = document.getElementById('planet-layer-controls');
  if (layerCtrl) layerCtrl.style.display = show ? '' : 'none';
}

function redrawRealm(): void {
  if (!currentRealmData) return;
  if (realmViewMode === 'planet') {
    showPlanetCanvas(true);
    if (hexPlanetRenderer) hexPlanetRenderer.stop();
    const pr  = getPlanetRenderer();
    const d   = currentRealmData;

    // Build textures from realm data
    const dayTex   = buildDayTexture(d.cells, d.W, d.H);
    const nightTex = buildNightTexture(d.settlements.map(s => ({ x: s.x, y: s.y, size: s.size })), d.W, d.H);
    const specTex  = buildSpecularTexture(d.cells, d.W, d.H);
    const cloudTex = buildCloudTexture(d.seed);

    // Sun direction — bias toward front of planet so day side faces camera
    const sunLon  = ((d.seed * 0.00137) % 1) * Math.PI * 2;
    const sunElev = 0.35 + ((d.seed ^ 0x7F2A) & 0xFF) / 0xFF * 0.25;
    const sunDir  = new THREE.Vector3(
      Math.cos(sunElev) * Math.sin(sunLon) * 0.6,   // reduced X/Z so Z stays positive
      -Math.sin(sunElev) * 0.4,
      Math.cos(sunElev) * Math.cos(sunLon) * 0.6 + 0.6,  // bias toward +Z (camera dir)
    ).normalize();

    // Atmosphere colour from climate / dominant biome
    const atmColor = new THREE.Color(0xd0e8ff);   // soft haze, not vivid blue

    pr.loadPlanet({
      day: dayTex, night: nightTex, specular: specTex, cloud: cloudTex,
      sunDirection: sunDir, atmosphereColor: atmColor, seed: d.seed,
      settlements: d.settlements.map(s => ({ x: s.x, y: s.y, name: s.name, size: s.size })),
      W: d.W, H: d.H,
    });
    // Apply current toggle states
    const showClouds = (document.getElementById('planet-show-clouds') as HTMLInputElement)?.checked ?? true;
    const showAtmos  = (document.getElementById('planet-show-atmos')  as HTMLInputElement)?.checked ?? true;
    pr.setVisible('clouds',     showClouds);
    pr.setVisible('atmosphere', showAtmos);
    pr.start();
  } else if (realmViewMode === 'hex') {
    showPlanetCanvas(true);
    if (planetRenderer) planetRenderer.stop();
    const hr = getHexPlanetRenderer();
    const d  = currentRealmData;
    const sunLon  = ((d.seed * 0.00137) % 1) * Math.PI * 2;
    const sunElev = 0.35 + ((d.seed ^ 0x7F2A) & 0xFF) / 0xFF * 0.25;
    const sunDir  = new THREE.Vector3(
      Math.cos(sunElev) * Math.sin(sunLon) * 0.6,
      -Math.sin(sunElev) * 0.4,
      Math.cos(sunElev) * Math.cos(sunLon) * 0.6 + 0.6,
    ).normalize();
    // Derive subdivision from realm Size slider: S=6, M=8, L=12, XL=16, Planet=20
    const SIZE_TO_SUB: Record<number, number> = { 1: 6, 2: 8, 3: 12, 4: 16, 5: 24 };
    const realmSize   = parseInt((document.getElementById('realm-size') as HTMLInputElement)?.value ?? '2');
    const roughness   = parseFloat((document.getElementById('realm-roughness') as HTMLInputElement)?.value ?? '50') / 100;
    const subdivisions = SIZE_TO_SUB[realmSize] ?? 8;
    const tileCount   = 10 * subdivisions * subdivisions + 2;
    // Update tile display
    const hexSubVal = document.getElementById('hex-sub-val');
    if (hexSubVal) hexSubVal.textContent = `${tileCount} (sub ${subdivisions})`;
    hr.loadPlanet({
      seed: d.seed,
      subdivisions,
      roughness,
      sunDirection: sunDir,
      atmosphereColor: new THREE.Color(0xd0e8ff),
      settlements: d.settlements.map(s => ({ x: s.x, y: s.y, name: s.name, size: s.size })),
      W: d.W, H: d.H,
    });
    // Apply layer toggles
    const showAtmos = (document.getElementById('planet-show-atmos') as HTMLInputElement)?.checked ?? true;
    hr.setVisible('atmosphere', showAtmos);
    hr.setAutoRotate((document.getElementById('planet-auto-rotate') as HTMLInputElement)?.checked ?? true);
    hr.start();
  } else {
    showPlanetCanvas(false);
    if (planetRenderer) planetRenderer.stop();
    if (hexPlanetRenderer) hexPlanetRenderer.stop();
    drawRealm(currentRealmData, canvas);
  }
}

function generateRealmView(): void {
  const seed = parseInt(seedInput.value) || Date.now();
  const size     = parseInt((document.getElementById('realm-size')         as HTMLInputElement)?.value ?? '2');
  const nS       = parseInt((document.getElementById('realm-settlements')  as HTMLInputElement)?.value ?? '6');
  const shape    = (document.querySelector('#realm-shape-pills .pill.active') as HTMLElement)?.dataset.shape as RealmShape ?? 'island';
  const climate  = (document.querySelector('#realm-climate-pills .pill.active') as HTMLElement)?.dataset.climate as RealmClimate ?? 'temperate';
  const roughness = parseFloat((document.getElementById('realm-roughness') as HTMLInputElement)?.value ?? '50') / 100;
  const REALM_SIZES: Record<number, [number,number]> = {1:[64,48],2:[96,72],3:[160,120],4:[220,164],5:[300,225]};
  const [W, H] = REALM_SIZES[size] ?? REALM_SIZES[2]!;
  const t0 = performance.now();
  currentRealmData = generateRealmData(seed, W, H, nS, shape, climate, roughness);
  redrawRealm();
  const ms = (performance.now()-t0).toFixed(1);
  genTimeEl.textContent = `Realm  ·  ${W}×${H}  ·  ${currentRealmData.settlements.length} settlements  ·  ${currentRealmData.rivers.length} rivers  ·  ${ms} ms`;
}


// ── Studio mode tab switching ─────────────────────────────────────────────────

document.getElementById('studio-tabs')!.addEventListener('click', e => {
  const tab = (e.target as HTMLElement).closest('.studio-tab') as HTMLElement | null;
  if (!tab) return;
  const mode = tab.dataset.mode as StudioMode;
  if (mode === studioMode) return;
  studioMode = mode;
  document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById('settlement-controls')!.style.display = mode === 'settlement' ? '' : 'none';
  document.getElementById('dungeon-controls')!.style.display    = mode === 'dungeon'    ? '' : 'none';
  document.getElementById('cave-controls')!.style.display       = mode === 'cave'       ? '' : 'none';
  document.getElementById('realm-controls')!.style.display      = mode === 'realm'      ? '' : 'none';
  (document.querySelector('.map-toolbar') as HTMLElement).style.visibility = mode === 'settlement' ? '' : 'hidden';
  // Stop 3D planet loop when leaving realm tab
  if (mode !== 'realm' && planetRenderer) {
    planetRenderer.stop();
    showPlanetCanvas(false);
  }
  if (mode !== 'realm' && hexPlanetRenderer) {
    hexPlanetRenderer.stop();
  }
  if (mode === 'dungeon') {
    overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
    hoverEl.textContent = '';
    if (!currentDungeonPlan) generateDungeonView();
    else redrawDungeon();
  } else if (mode === 'cave') {
    overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
    hoverEl.textContent = '';
    if (!currentCaveData) generateCaveView();
    else redrawCave();
  } else if (mode === 'realm') {
    overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
    hoverEl.textContent = '';
    if (!currentRealmData) generateRealmView();
    else redrawRealm();
  } else {
    redraw();
  }
});

// ── Dungeon controls event wiring ─────────────────────────────────────────────

document.getElementById('dungeon-type-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#dungeon-type-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  const isTower = pill.dataset.dtype === 'tower';
  (document.getElementById('tower-floor-row') as HTMLElement).style.display = isTower ? '' : 'none';
  generateDungeonView();
});

document.getElementById('dfloors')!.addEventListener('input', () => {
  (document.getElementById('dfloors-val') as HTMLElement).textContent =
    (document.getElementById('dfloors') as HTMLInputElement).value;
  generateDungeonView();
});

document.getElementById('dfloor')?.addEventListener('input', () => {
  const v = (document.getElementById('dfloor') as HTMLInputElement).value;
  (document.getElementById('dfloor-val') as HTMLElement).textContent = v;
  redrawDungeon();
});

document.getElementById('btn-dungeon-png')?.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `dungeon-${seedInput.value}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ── Cave controls event wiring ────────────────────────────────────────────────

document.getElementById('cave-type-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#cave-type-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  const isCave = pill.dataset.ctype === 'cave';
  document.getElementById('cave-biome-section')!.style.display  = isCave ? '' : 'none';
  document.getElementById('glade-biome-section')!.style.display = isCave ? 'none' : '';
  document.getElementById('cave-density-row')!.style.display    = isCave ? '' : 'none';
  currentCaveData = null;
  generateCaveView();
});

for (const id of ['cave-biome-pills', 'glade-biome-pills'] as const) {
  document.getElementById(id)!.addEventListener('click', e => {
    const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
    if (!pill) return;
    document.querySelectorAll(`#${id} .pill`).forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentCaveData = null;
    generateCaveView();
  });
}

const CAVE_SIZES = ['', 'S', 'M', 'L'];
document.getElementById('cave-size')!.addEventListener('input', () => {
  const v = parseInt((document.getElementById('cave-size') as HTMLInputElement).value);
  (document.getElementById('cave-size-val') as HTMLElement).textContent = CAVE_SIZES[v] ?? 'M';
  currentCaveData = null;
  generateCaveView();
});

document.getElementById('cave-density')!.addEventListener('input', () => {
  const v = (document.getElementById('cave-density') as HTMLInputElement).value;
  (document.getElementById('cave-density-val') as HTMLElement).textContent = (parseInt(v) / 100).toFixed(2);
  currentCaveData = null;
  generateCaveView();
});

document.getElementById('btn-cave-png')?.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `cave-${seedInput.value}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ── Planet layer toggles ──────────────────────────────────────────────────────

document.getElementById('planet-show-clouds')?.addEventListener('change', e => {
  planetRenderer?.setVisible('clouds', (e.target as HTMLInputElement).checked);
});
document.getElementById('planet-show-atmos')?.addEventListener('change', e => {
  const v = (e.target as HTMLInputElement).checked;
  planetRenderer?.setVisible('atmosphere', v);
  hexPlanetRenderer?.setVisible('atmosphere', v);
});
document.getElementById('planet-auto-rotate')?.addEventListener('change', e => {
  const v = (e.target as HTMLInputElement).checked;
  planetRenderer?.setAutoRotate(v);
  hexPlanetRenderer?.setAutoRotate(v);
});
document.getElementById('hex-show-edges')?.addEventListener('change', e => {
  hexPlanetRenderer?.setEdgeLines((e.target as HTMLInputElement).checked);
});

// HEX_TILE_COUNTS kept for reference; actual count derived from realm Size slider
const HEX_TILE_COUNTS: Record<number, number> = {6:362,8:642,12:1442,16:2562,20:4002};
void HEX_TILE_COUNTS;

// ── Realm controls event wiring ───────────────────────────────────────────────

document.getElementById('realm-view-pills')?.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('#realm-view-pills .pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  realmViewMode = pill.dataset.view as RealmViewMode ?? 'map';
  // Show hex-specific controls
  const isHex = realmViewMode === 'hex';
  const hexSubRow = document.getElementById('hex-subdivision-row');
  const edgeRow   = document.getElementById('edge-toggle-row');
  const cloudRow  = document.getElementById('cloud-toggle-row');
  if (hexSubRow)  hexSubRow.style.display  = isHex ? '' : 'none';
  if (edgeRow)    edgeRow.style.display    = isHex ? '' : 'none';
  if (cloudRow)   cloudRow.style.display   = isHex ? 'none' : '';  // no cloud in hex mode
  // Don't null currentRealmData — hex renderer uses seed+settlements from it
  redrawRealm();
});

for (const id of ['realm-shape-pills', 'realm-climate-pills'] as const) {
  document.getElementById(id)?.addEventListener('click', e => {
    const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
    if (!pill) return;
    document.querySelectorAll(`#${id} .pill`).forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentRealmData = null; generateRealmView();
  });
}

const REALM_SIZE_LABELS = ['','S','M','L','XL','Planet'];
document.getElementById('realm-size')?.addEventListener('input', () => {
  const v = parseInt((document.getElementById('realm-size') as HTMLInputElement).value);
  (document.getElementById('realm-size-val') as HTMLElement).textContent = REALM_SIZE_LABELS[v] ?? 'M';
  currentRealmData = null;
  // Update hex tile display immediately
  const SUB = [0,6,8,12,16,24][v] ?? 8;
  const hexSubVal = document.getElementById('hex-sub-val');
  if (hexSubVal) hexSubVal.textContent = `${10*SUB*SUB+2} (sub ${SUB})`;
  generateRealmView();
});

document.getElementById('realm-settlements')?.addEventListener('input', () => {
  const v = (document.getElementById('realm-settlements') as HTMLInputElement).value;
  (document.getElementById('realm-settlements-val') as HTMLElement).textContent = v;
  currentRealmData = null; generateRealmView();
});

document.getElementById('realm-roughness')?.addEventListener('input', () => {
  const v = Math.round(parseFloat((document.getElementById('realm-roughness') as HTMLInputElement).value));
  (document.getElementById('realm-roughness-val') as HTMLElement).textContent = ['Flat','Gentle','Moderate','Rugged','Wild'][Math.round(v/25)] ?? 'Moderate';
  currentRealmData = null;
  generateRealmView();  // regenerates both realm map + hex planet
});

document.getElementById('btn-realm-png')?.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `realm-${seedInput.value}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ── Initial generation ────────────────────────────────────────────────────────

generate();
