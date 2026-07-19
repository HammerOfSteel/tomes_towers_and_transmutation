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
window.addEventListener('resize', () => { resize(); generate(); });

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
  if (studioMode === 'cave')    generateCaveView();
  else if (studioMode === 'dungeon') generateDungeonView();
  else generate();
});
document.getElementById('btn-gen')!.addEventListener('click', () => {
  currentDungeonPlan = null;
  currentCaveData    = null;
  if (studioMode === 'cave')    generateCaveView();
  else if (studioMode === 'dungeon') generateDungeonView();
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

type StudioMode = 'settlement' | 'dungeon' | 'cave';
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

interface CaveFeature { x: number; y: number; kind: 'water'|'mineral'|'spawn'|'treasure'|'tree'|'flower'|'mushroom'; }

interface CaveData {
  grid: boolean[][];   // true = passable (floor / clearing), false = solid (wall / forest)
  W: number; H: number;
  seed: number;
  type: CaveType;
  features: CaveFeature[];
}

const CAVE_PAL = {
  wall:     '#221c14',   // deep rock
  floor:    '#3e3830',   // worn stone
  floor2:   '#46403a',   // slightly lighter stone
  water:    '#2040a0',   // underground lake
  mineral:  '#909888',   // pale ore vein dot
  spawn:    '#c03020',
  treasure: '#e0b030',
  bg:       '#16120c',
};
const GLADE_PAL = {
  wall:     '#1e3818',   // dense forest
  wall2:    '#2a4e22',   // mid forest
  floor:    '#5a8a3a',   // clearing grass
  floor2:   '#6ea046',   // bright grass
  water:    '#3870b8',
  tree:     '#1e3818',
  flower:   '#d85080',
  mushroom: '#c84020',
  bg:       '#18300f',
};

/**
 * 5-step cellular automata cave generation.
 * Rule: a cell is floor if ≥ 5 of its 8 neighbours are floor.
 * Border is always wall.
 */
function generateCaveData(seed: number, type: CaveType, W = 72, H = 54): CaveData {
  const rand = mulberry32(seed);

  let grid: boolean[][];

  if (type === 'cave') {
    // --- Cellular automata cave ---
    const FILL = 0.47;
    grid = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        if (x < 2 || y < 2 || x > W - 3 || y > H - 3) return false;
        return rand() > FILL;
      }),
    );

    for (let iter = 0; iter < 5; iter++) {
      grid = grid.map((row, y) =>
        row.map((_, x) => {
          if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]?.[x + dx]) n++;
          return n >= 5;
        }),
      );
    }

    // Flood-fill to keep only the largest cave region
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
    // Wipe non-main-region floor cells
    const mainSet = new Set(bestCells.map(([x, y]) => `${x},${y}`));
    grid = grid.map((row, y) => row.map((v, x) => v && mainSet.has(`${x},${y}`)));

  } else {
    // --- Organic glade: ellipse clearing with noisy edge ---
    const cx = W / 2, cy = H / 2;
    const rx = W * 0.38 + (rand() - 0.5) * W * 0.08;
    const ry = H * 0.38 + (rand() - 0.5) * H * 0.08;
    grid = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const jitter = (rand() - 0.5) * 0.28;
        return dist + jitter < 1.0;
      }),
    );
    // Smooth the glade edge (2 rounds of CA)
    for (let iter = 0; iter < 2; iter++) {
      grid = grid.map((row, y) =>
        row.map((_, x) => {
          if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return false;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (grid[y + dy]?.[x + dx]) n++;
          return n >= 5;
        }),
      );
    }
  }

  // --- Scatter features ---
  const features: CaveFeature[] = [];
  const floorCells: Array<[number, number]> = [];
  const edgeCells:  Array<[number, number]> = [];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!grid[y]![x]) continue;
      floorCells.push([x, y]);
      // Edge cell = floor cell adjacent to a wall
      let isEdge = false;
      for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
        if (!grid[y + dy]?.[x + dx]) { isEdge = true; break; }
      if (isEdge) edgeCells.push([x, y]);
    }
  }

  const shuffled = (arr: Array<[number,number]>) => [...arr].sort(() => rand() - 0.5);

  if (type === 'cave') {
    // Underground lake: cluster of water cells
    const lakeSeeds = shuffled(floorCells).slice(0, 2 + Math.floor(rand() * 2));
    for (const [sx, sy] of lakeSeeds) {
      const r = 2 + Math.floor(rand() * 3);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (dx*dx+dy*dy <= r*r && grid[sy+dy]?.[sx+dx])
            features.push({ x: sx+dx, y: sy+dy, kind: 'water' });
    }
    // Mineral veins (edge cells)
    for (const [x, y] of shuffled(edgeCells).slice(0, 12 + Math.floor(rand() * 10)))
      features.push({ x, y, kind: 'mineral' });
    // Enemy spawns
    for (const [x, y] of shuffled(floorCells).slice(0, 4 + Math.floor(rand() * 5)))
      features.push({ x, y, kind: 'spawn' });
    // Treasure
    for (const [x, y] of shuffled(floorCells).slice(0, 1 + Math.floor(rand() * 2)))
      features.push({ x, y, kind: 'treasure' });
  } else {
    // Glade water pool
    const [pw, ph] = floorCells[Math.floor(rand() * floorCells.length)] ?? [W/2|0, H/2|0];
    const pr = 2 + Math.floor(rand() * 3);
    for (let dy = -pr; dy <= pr; dy++)
      for (let dx = -pr; dx <= pr; dx++)
        if (dx*dx+dy*dy <= pr*pr && grid[(ph+dy)]?.[(pw+dx)])
          features.push({ x: pw+dx, y: ph+dy, kind: 'water' });
    // Flowers scattered in clearing
    for (const [x, y] of shuffled(floorCells).slice(0, 18 + Math.floor(rand() * 12)))
      features.push({ x, y, kind: rand() > 0.4 ? 'flower' : 'mushroom' });
    // Trees at forest edge (wall cells adjacent to floor)
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (grid[y]![x]) continue;
        let adjFloor = false;
        for (const [dy, dx] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][])
          if (grid[y+dy]?.[x+dx]) { adjFloor = true; break; }
        if (adjFloor && rand() > 0.55) features.push({ x, y, kind: 'tree' });
      }
  }

  return { grid, W, H, seed, type, features };
}

/**
 * Render a cave or glade map on a canvas. Cell-based rendering with
 * organic appearance from the CA-generated grid.
 */
export function drawCaveGlade(data: CaveData, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const { grid, W, H, type, features, seed } = data;

  const CELL = Math.min(Math.floor((canvas.width  - 8) / W),
                        Math.floor((canvas.height - 8) / H));
  const offX = Math.floor((canvas.width  - W * CELL) / 2);
  const offY = Math.floor((canvas.height - H * CELL) / 2);

  const pal = type === 'cave' ? CAVE_PAL : GLADE_PAL;

  // Background
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Feature lookup for fast O(1) per cell
  const featureMap = new Map<string, CaveFeature>();
  for (const f of features) featureMap.set(`${f.x},${f.y}`, f);

  // Draw cells
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const key = `${x},${y}`;
      const feat = featureMap.get(key);
      const floor = grid[y]![x];
      const cx = offX + x * CELL, cy = offY + y * CELL;

      if (feat?.kind === 'water') {
        ctx.fillStyle = pal.water;
      } else if (!floor) {
        // Wall / forest — vary shade based on position for texture
        ctx.fillStyle = type === 'glade'
          ? (Math.sin(x * 3.7 + y * 2.1) > 0 ? GLADE_PAL.wall : GLADE_PAL.wall2)
          : CAVE_PAL.wall;
      } else {
        // Floor — slight noise for texture
        ctx.fillStyle = (x + y) % 2 === 0 ? pal.floor : pal.floor2;
      }
      ctx.fillRect(cx, cy, CELL, CELL);
    }
  }

  // Draw feature symbols over floor
  const SZ = Math.max(4, CELL - 1);
  ctx.font = `${SZ}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const feat of features) {
    if (feat.kind === 'water') continue;   // water already drawn as fill
    const cx = offX + feat.x * CELL + CELL / 2;
    const cy = offY + feat.y * CELL + CELL / 2;
    switch (feat.kind) {
      case 'mineral':
        ctx.fillStyle = CAVE_PAL.mineral;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      case 'spawn':
        ctx.fillStyle = CAVE_PAL.spawn;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
      case 'treasure':
        ctx.fillStyle = CAVE_PAL.treasure;
        ctx.font = `bold ${SZ + 1}px sans-serif`;
        ctx.fillText('★', cx, cy);
        ctx.font = `${SZ}px sans-serif`;
        break;
      case 'tree':
        ctx.fillStyle = GLADE_PAL.tree;
        ctx.beginPath();
        ctx.moveTo(cx, cy - CELL * 0.4);
        ctx.lineTo(cx + CELL * 0.35, cy + CELL * 0.35);
        ctx.lineTo(cx - CELL * 0.35, cy + CELL * 0.35);
        ctx.closePath(); ctx.fill();
        break;
      case 'flower':
        ctx.fillStyle = GLADE_PAL.flower;
        ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.25, 0, Math.PI * 2); ctx.fill();
        break;
      case 'mushroom':
        ctx.fillStyle = GLADE_PAL.mushroom;
        ctx.beginPath(); ctx.arc(cx, cy - CELL * 0.1, CELL * 0.28, 0, Math.PI * 2); ctx.fill();
        break;
    }
  }

  // Cartographic border
  ctx.strokeStyle = type === 'cave' ? '#3a3028' : '#3a6020';
  ctx.lineWidth = 2;
  ctx.strokeRect(offX, offY, W * CELL, H * CELL);

  // Title
  const title = type === 'cave' ? 'Cave System' : 'Forest Glade';
  ctx.fillStyle = type === 'cave' ? 'rgba(200,190,170,0.7)' : 'rgba(180,210,140,0.8)';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${title}  ·  seed ${seed}`, canvas.width / 2, canvas.height - 4);
}

// ── Cave mode state ───────────────────────────────────────────────────────────

let currentCaveData: CaveData | null = null;

function generateCaveView() {
  const seed = parseInt(seedInput.value) || Date.now();
  const ctype = (document.querySelector('#cave-type-pills .pill.active') as HTMLElement)?.dataset.ctype as CaveType ?? 'cave';
  currentCaveData = generateCaveData(seed, ctype);
  ctx2d(canvas, currentCaveData);
  const floors = currentCaveData.grid.flat().filter(Boolean).length;
  genTimeEl.textContent = `${ctype}  ·  ${floors} open cells  ·  seed ${seed}`;
}

function ctx2d(c: HTMLCanvasElement, data: CaveData) { drawCaveGlade(data, c); }

function redrawCave() { if (currentCaveData) drawCaveGlade(currentCaveData, canvas); }

// ── Ward legend ───────────────────────────────────────────────────────────────
// (declared earlier in file — this is the duplicate, remove it)

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
  (document.querySelector('.map-toolbar') as HTMLElement).style.visibility = mode === 'settlement' ? '' : 'hidden';
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
  currentCaveData = null;
  generateCaveView();
});

document.getElementById('btn-cave-png')?.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `cave-${seedInput.value}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// ── Initial generation ────────────────────────────────────────────────────────

generate();
