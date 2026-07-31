// @ts-ignore
import { Delaunay } from 'd3-delaunay';
import { chaikin } from '@/core/chaikin';
import type { SettlementFaction, Vec2 } from '@/overworld-studio';

export type WardType =
  | 'market' | 'church' | 'inn' | 'smithy' | 'craftsmen'
  | 'merchant' | 'patriciate' | 'slum' | 'gateward' | 'farm' | 'park';

export type SettlementType = 'village' | 'town' | 'city';

export type LayoutType =
  | 'auto'
  | 'organic'
  | 'grid'
  | 'linear'
  | 'radial'
  | 'terraced'
  | 'perimeter'
  | 'cluster';

export interface Ward {
  type: WardType;
  seed: Vec2;
  polygon: Vec2[];
  withinCity: boolean;
  center: Vec2;
  wardLayout: LayoutType;
}

export interface Road {
  points: Vec2[];
}

export interface SettlementModel {
  wards: Ward[];
  roads: Road[];
  wall?: Vec2[];
  gates: Vec2[];
  centre: Vec2;
  radius: number;
  seed: number;
  genTimeMs: number;
}

export interface GeneratorParams {
  seed: number;
  type: SettlementType;
  layout: LayoutType;
  faction: SettlementFaction;
  nPatches: number;
  warp: number;
  nGates: number;
  walled: boolean;
  hasCitadel: boolean;
  hasPlaza: boolean;
  width: number;
  height: number;
}

export interface BuildingRect {
  x: number;
  y: number;
  w: number;
  d: number;
  angle: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function dist(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.y - b.y); }
function centroid(pts: Vec2[]): Vec2 {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
           y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function rateMarket(w: Ward, centre: Vec2)    { return dist(w.seed, centre); }
function rateChurch(_w: Ward, _c: Vec2, i: number) { return i; }
function rateInn(w: Ward, centre: Vec2)       { return dist(w.seed, centre) * 0.6; }
function ratePatriciate(w: Ward, centre: Vec2){ return dist(w.seed, centre) * 0.35; }
function rateSlum(w: Ward, centre: Vec2)      { return -dist(w.seed, centre); }

type DistZone = 'inner' | 'mid' | 'outer';
type WeightedPalette = ReadonlyArray<[LayoutType, number]>;

const FACTION_LAYOUT_PREF: Partial<Record<SettlementFaction, LayoutType>> = {
  dwarven: 'grid', elven: 'radial', orcish: 'linear', vampire: 'perimeter', slime: 'cluster', fae: 'cluster', vulperia: 'cluster',
};

type WardPlacement = 'random' | 'central' | 'outer';
const FACTION_EXTRA_ASSIGNS: Partial<Record<SettlementFaction, Array<[WardType, number, WardPlacement]>>> = {
  undead: [['park', 0, 'random'], ['slum', 6, 'outer']],
  elven: [['park', 0, 'central']],
  dwarven: [['smithy', 0, 'central'], ['smithy', 10, 'random']],
  orcish: [['smithy', 0, 'random'], ['slum', 6, 'outer']],
  vampire: [['patriciate', 0, 'central'], ['slum', 6, 'outer']],
  slime: [['park', 0, 'central']],
  fae: [['park', 0, 'central'], ['park', 10, 'random']],
  vulperia: [['inn', 0, 'central']],
};

const ZONE_PALETTES: Record<SettlementType, Record<WardType, Record<DistZone, WeightedPalette>>> = {
  village: {
    market:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]}, church:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
    inn:{inner:[['organic',1]],mid:[['organic',.8],['linear',.2]],outer:[['linear',.6],['organic',.4]]}, smithy:{inner:[['organic',.7],['linear',.3]],mid:[['linear',.6],['organic',.4]],outer:[['linear',.7],['organic',.3]]},
    craftsmen:{inner:[['organic',1]],mid:[['organic',.7],['linear',.2],['terraced',.1]],outer:[['linear',.5],['organic',.35],['terraced',.15]]}, merchant:{inner:[['organic',1]],mid:[['organic',.8],['linear',.2]],outer:[['linear',.5],['organic',.5]]},
    patriciate:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]}, slum:{inner:[['terraced',.7],['organic',.3]],mid:[['terraced',.8],['linear',.2]],outer:[['terraced',1]]},
    gateward:{inner:[['linear',1]],mid:[['linear',1]],outer:[['linear',1]]}, farm:{inner:[['linear',1]],mid:[['linear',1]],outer:[['linear',1]]}, park:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
  },
  town: {
    market:{inner:[['organic',1]],mid:[['organic',.8],['perimeter',.2]],outer:[['organic',.7],['perimeter',.3]]}, church:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
    inn:{inner:[['organic',1]],mid:[['organic',.9],['linear',.1]],outer:[['organic',.8],['linear',.2]]}, smithy:{inner:[['organic',.6],['linear',.4]],mid:[['linear',.6],['organic',.4]],outer:[['linear',.5],['terraced',.3],['grid',.2]]},
    craftsmen:{inner:[['organic',1]],mid:[['organic',.5],['terraced',.4],['linear',.1]],outer:[['terraced',.5],['organic',.2],['linear',.2],['grid',.1]]}, merchant:{inner:[['organic',1]],mid:[['organic',.6],['terraced',.3],['grid',.1]],outer:[['terraced',.4],['organic',.3],['grid',.2],['linear',.1]]},
    patriciate:{inner:[['organic',1]],mid:[['organic',.5],['perimeter',.5]],outer:[['perimeter',.7],['organic',.3]]}, slum:{inner:[['terraced',.8],['organic',.2]],mid:[['terraced',1]],outer:[['terraced',1]]},
    gateward:{inner:[['linear',1]],mid:[['linear',1]],outer:[['linear',.7],['grid',.3]]}, farm:{inner:[['linear',1]],mid:[['linear',1]],outer:[['linear',1]]}, park:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
  },
  city: {
    market:{inner:[['perimeter',.7],['organic',.3]],mid:[['perimeter',1]],outer:[['perimeter',.7],['grid',.3]]}, church:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
    inn:{inner:[['organic',1]],mid:[['organic',.8],['terraced',.2]],outer:[['organic',.7],['terraced',.3]]}, smithy:{inner:[['organic',.5],['linear',.5]],mid:[['linear',.5],['terraced',.3],['grid',.2]],outer:[['terraced',.4],['grid',.35],['linear',.25]]},
    craftsmen:{inner:[['organic',1]],mid:[['organic',.4],['terraced',.4],['perimeter',.2]],outer:[['terraced',.45],['grid',.3],['organic',.15],['linear',.1]]}, merchant:{inner:[['organic',.7],['perimeter',.3]],mid:[['perimeter',.4],['terraced',.35],['grid',.25]],outer:[['grid',.35],['terraced',.35],['perimeter',.2],['organic',.1]]},
    patriciate:{inner:[['organic',.6],['perimeter',.4]],mid:[['perimeter',.75],['organic',.25]],outer:[['perimeter',.8],['organic',.2]]}, slum:{inner:[['terraced',.9],['organic',.1]],mid:[['terraced',1]],outer:[['terraced',1]]},
    gateward:{inner:[['linear',1]],mid:[['linear',.6],['terraced',.4]],outer:[['linear',.5],['grid',.3],['terraced',.2]]}, farm:{inner:[['linear',1]],mid:[['linear',1]],outer:[['linear',1]]}, park:{inner:[['organic',1]],mid:[['organic',1]],outer:[['organic',1]]},
  },
};

export function assignWardLayouts(wards: Ward[], centre: Vec2, radius: number, type: SettlementType, global: LayoutType): void {
  for (const ward of wards) {
    if (!ward.withinCity) { ward.wardLayout = 'linear'; continue; }
    if (global !== 'auto') { ward.wardLayout = global; continue; }
    const d = dist(ward.center, centre);
    const r = radius > 0 ? d / radius : 0;
    const zone: DistZone = r < 0.35 ? 'inner' : r < 0.65 ? 'mid' : 'outer';
    const palette = ZONE_PALETTES[type]?.[ward.type]?.[zone] ?? [['organic', 1]] as WeightedPalette;
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

export function buildSettlement(p: GeneratorParams): SettlementModel {
  const seeds = generateBaseSeeds(p);
  return buildFromSeeds(seeds, p);
}

export function generateBaseSeeds(p: GeneratorParams): Vec2[] {
  const rand = mulberry32(p.seed);
  const noise = (nx: number, ny: number) => {
    const r = mulberry32(Math.round((nx * 73856093 ^ ny * 19349663) >>> 0) ^ p.seed);
    return r() * 2 - 1;
  };
  const CX = p.width / 2, CY = p.height / 2;
  const R = Math.min(p.width, p.height) * 0.42;
  const sa = rand() * Math.PI * 2;
  const seeds: Vec2[] = [];
  for (let i = 0; i < p.nPatches * 8; i++) {
    const a = sa + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : R * 0.12 + i * (R * 0.018 + rand() * R * 0.012);
    const bx = CX + Math.cos(a) * r;
    const by = CY + Math.sin(a) * r;
    const ws = 0.006;
    seeds.push({
      x: bx + p.warp * R * 0.4 * noise(bx * ws, by * ws),
      y: by + p.warp * R * 0.4 * noise(bx * ws + 100, by * ws + 100),
    });
  }
  return seeds;
}

export function buildFromSeeds(seeds: Vec2[], p: GeneratorParams): SettlementModel {
  const t0 = performance.now();
  const rand = mulberry32(p.seed);
  const CX = p.width / 2, CY = p.height / 2;
  const R = Math.min(p.width, p.height) * 0.42;
  const delaunay = Delaunay.from(seeds, (s: Vec2) => s.x, (s: Vec2) => s.y);
  const voronoi = delaunay.voronoi([0, 0, p.width, p.height]);
  const polygons: Vec2[][] = [];
  for (let i = 0; i < seeds.length; i++) {
    const poly = voronoi.cellPolygon(i);
    polygons.push(poly ? poly.map(([x, y]: [number, number]) => ({ x, y })) : []);
  }
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < Math.min(4, p.nPatches); i++) {
      const poly = polygons[i];
      if (poly && poly.length) {
        const c = centroid(poly);
        seeds[i] = { x: lerp(seeds[i]!.x, c.x, 0.5), y: lerp(seeds[i]!.y, c.y, 0.5) };
      }
    }
  }
  const centre: Vec2 = { x: CX, y: CY };
  const sortedIdx = seeds.map((s, i) => ({ i, d: dist(s, centre) })).sort((a, b) => a.d - b.d).slice(0, p.nPatches).map(x => x.i);
  const wards: Ward[] = sortedIdx.map(si => ({
    type: 'craftsmen', seed: seeds[si]!, polygon: polygons[si] ?? [], withinCity: true,
    center: centroid(polygons[si] ?? [{ x: seeds[si]!.x, y: seeds[si]!.y }]), wardLayout: 'organic',
  }));
  for (let i = 0; i < seeds.length; i++) {
    if (sortedIdx.includes(i)) continue;
    if (dist(seeds[i]!, centre) > R * 1.5) continue;
    const poly = polygons[i] ?? [];
    wards.push({ type: 'farm', seed: seeds[i]!, polygon: poly, withinCity: false, center: centroid(poly.length ? poly : [seeds[i]!]), wardLayout: 'linear' });
  }
  const inner = wards.filter(w => w.withinCity);
  const unassigned = [...inner];
  const assign = (type: WardType, rateFn: (w: Ward) => number) => {
    if (!unassigned.length) return;
    const best = unassigned.reduce((a, b) => rateFn(a) < rateFn(b) ? a : b);
    best.type = type;
    unassigned.splice(unassigned.indexOf(best), 1);
  };
  if (p.hasPlaza) assign('market', w => rateMarket(w, centre));
  assign('church', w => rateChurch(w, centre, inner.indexOf(w)));
  assign('inn', w => rateInn(w, centre));
  assign('smithy', () => rand());
  if (p.nPatches >= 8) assign('patriciate', w => ratePatriciate(w, centre));
  if (p.nPatches >= 10) assign('merchant', () => rand());
  if (p.nPatches >= 12) assign('slum', w => rateSlum(w, centre));
  if (p.nPatches >= 16) assign('park', () => rand());
  const factionExtras = FACTION_EXTRA_ASSIGNS[p.faction];
  if (factionExtras) {
    for (const [type, minP, placement] of factionExtras) {
      if (p.nPatches >= minP && unassigned.length > 0) {
        const rateFn = placement === 'central' ? (w: Ward) => dist(w.seed, centre)
          : placement === 'outer' ? (w: Ward) => -dist(w.seed, centre)
          : () => rand();
        assign(type, rateFn);
      }
    }
  }
  const perimeterSeeds = [...inner].sort((a, b) => dist(b.seed, centre) - dist(a.seed, centre)).slice(0, p.nGates * 2);
  const gates: Vec2[] = [];
  const usedAngles: number[] = [];
  for (const w of perimeterSeeds) {
    if (gates.length >= p.nGates) break;
    const angle = Math.atan2(w.seed.y - CY, w.seed.x - CX);
    if (usedAngles.every(a => Math.abs(a - angle) > Math.PI * 0.4)) {
      gates.push({ x: CX + Math.cos(angle) * R * 0.95, y: CY + Math.sin(angle) * R * 0.95 });
      usedAngles.push(angle);
    }
  }
  const roads: Road[] = [];
  const marketWard = wards.find(w => w.type === 'market') ?? wards[0]!;
  const hub = marketWard.center;
  for (const gate of gates) {
    const angle = Math.atan2(hub.y - gate.y, hub.x - gate.x);
    const waypts = inner.filter(w => w.type !== 'market').map(w => ({
      w, d: dist(w.center, gate), align: Math.cos(Math.atan2(w.center.y - gate.y, w.center.x - gate.x) - angle),
    })).filter(x => x.align > 0.5 && x.d < dist(gate, hub)).sort((a, b) => a.d - b.d).slice(0, 2).map(x => x.w.center);
    roads.push({ points: chaikin([gate, ...waypts, hub], 3) });
  }
  let wall: Vec2[] | undefined;
  if (p.walled) wall = convexHullExpanded(inner.map(w => w.seed), centre, R * 0.05);
  const cityRadius = inner.reduce((r, w) => Math.max(r, dist(w.seed, centre)), 0);
  const effectiveLayout = p.layout === 'auto' && FACTION_LAYOUT_PREF[p.faction] ? FACTION_LAYOUT_PREF[p.faction]! : p.layout;
  assignWardLayouts(wards, centre, cityRadius, p.type, effectiveLayout);
  return { wards, roads, wall, gates, centre, radius: cityRadius, seed: p.seed, genTimeMs: performance.now() - t0 };
}

export function convexHullExpanded(pts: Vec2[], centre: Vec2, expand: number): Vec2[] {
  if (pts.length < 3) return pts;
  let start = pts.reduce((a, b) => a.x < b.x ? a : b);
  const hull: Vec2[] = [];
  let current = start;
  do {
    hull.push(current);
    let next = pts[0]!;
    for (const p of pts) {
      const cross = (next.x - current.x) * (p.y - current.y) - (next.y - current.y) * (p.x - current.x);
      if (next === current || cross > 0) next = p;
    }
    current = next;
  } while (current !== start && hull.length < pts.length + 1);
  return hull.map(p => {
    const dx = p.x - centre.x, dy = p.y - centre.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + dx / d * expand, y: p.y + dy / d * expand };
  });
}

export function dominantEdgeAngle(poly: Vec2[]): number {
  let max = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (d > max) { max = d; ang = Math.atan2(b.y - a.y, b.x - a.x); }
  }
  return ang;
}

export function minDistToEdge(pt: Vec2, poly: Vec2[]): number {
  let minD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
    const ex = a.x + t * dx - pt.x, ey = a.y + t * dy - pt.y;
    minD = Math.min(minD, Math.sqrt(ex * ex + ey * ey));
  }
  return minD;
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x, yi = poly[i]!.y, xj = poly[j]!.x, yj = poly[j]!.y;
    if (((yi > p.y) !== (yj > p.y)) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class OccupancyGrid {
  private readonly cells = new Set<number>();
  private readonly W: number;
  private static readonly CELL = 6;
  constructor(canvasW: number, canvasH: number) { this.W = Math.ceil(canvasW / OccupancyGrid.CELL) + 1; void canvasH; }
  private _key(gx: number, gy: number): number { return gx + gy * this.W; }
  blocked(cx: number, cy: number, bw: number, bh: number, angle: number): boolean {
    const C = OccupancyGrid.CELL;
    const hw = bw * 0.5 + 1, hh = bh * 0.5 + 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = Math.abs(cos * hw) + Math.abs(sin * hh);
    const dy = Math.abs(sin * hw) + Math.abs(cos * hh);
    const x0 = Math.floor((cx - dx) / C), x1 = Math.ceil((cx + dx) / C);
    const y0 = Math.floor((cy - dy) / C), y1 = Math.ceil((cy + dy) / C);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) if (this.cells.has(this._key(gx, gy))) return true;
    return false;
  }
  mark(cx: number, cy: number, bw: number, bh: number, angle: number): void {
    const C = OccupancyGrid.CELL;
    const hw = bw * 0.5, hh = bh * 0.5;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = Math.abs(cos * hw) + Math.abs(sin * hh);
    const dy = Math.abs(sin * hw) + Math.abs(cos * hh);
    const x0 = Math.floor((cx - dx) / C), x1 = Math.ceil((cx + dx) / C);
    const y0 = Math.floor((cy - dy) / C), y1 = Math.ceil((cy + dy) / C);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) this.cells.add(this._key(gx, gy));
  }
}

export function polygonPerimeter(poly: Vec2[]): number {
  let t = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    t += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return t;
}

export function samplePerimeter(poly: Vec2[], t: number): { x: number; y: number; angle: number } {
  const total = polygonPerimeter(poly);
  const target = ((t % 1) + 1) % 1 * total;
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= target) {
      const f = (target - acc) / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    acc += len;
  }
  const a = poly[poly.length - 1]!, b = poly[0]!;
  return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function minDistToRoads(pt: Vec2, roads: Road[]): number {
  let minD = Infinity;
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!, b = road.points[i + 1]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
      const ex = a.x + t * dx - pt.x, ey = a.y + t * dy - pt.y;
      minD = Math.min(minD, Math.sqrt(ex * ex + ey * ey));
    }
  }
  return minD;
}

const ROAD_CLEARANCE = 10;

function pushRect(out: BuildingRect[], occ: OccupancyGrid, x: number, y: number, w: number, d: number, angle: number): boolean {
  if (occ.blocked(x, y, w, d, angle)) return false;
  occ.mark(x, y, w, d, angle);
  out.push({ x, y, w, d, angle });
  return true;
}

export function fillWardOrganically(poly: Vec2[], wardType: WardType, wardSeed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const ALONG = wardType === 'slum' ? 14 : wardType === 'patriciate' ? 22 : wardType === 'craftsmen' ? 17 : 18;
  const DEPTH = wardType === 'slum' ? 11 : wardType === 'patriciate' ? 16 : wardType === 'craftsmen' ? 14 : 14;
  const BLDG_GAP = 3, STREET = 6, ROW_GAP = 3, MAX_ROWS = 3;
  const rand = mulberry32(wardSeed);
  const cent = centroid(poly);
  const perimeter = polygonPerimeter(poly);
  const nSamples = Math.max(4, Math.floor(perimeter / (ALONG + BLDG_GAP)));
  const wardDepth = Math.max(DEPTH, minDistToEdge(cent, poly) - STREET);
  const nRows = Math.min(MAX_ROWS, Math.max(1, Math.floor((wardDepth) / (DEPTH + ROW_GAP))));
  for (let row = 0; row < nRows; row++) {
    const insetDist = STREET + row * (DEPTH + ROW_GAP) + DEPTH * 0.5;
    const phaseOffset = row % 2 === 1 ? 0.5 / nSamples : 0;
    for (let si = 0; si < nSamples; si++) {
      const t = (si + phaseOffset) / nSamples;
      const { x: ex, y: ey, angle: edgeAngle } = samplePerimeter(poly, t);
      const inDx = cent.x - ex, inDy = cent.y - ey;
      const inLen = Math.hypot(inDx, inDy);
      if (inLen < 1) continue;
      const bx = ex + (inDx / inLen) * insetDist;
      const by = ey + (inDy / inLen) * insetDist;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (roads.length > 0 && minDistToRoads({ x: bx, y: by }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, bx, by, ALONG * (0.75 + rand() * 0.35), DEPTH * (0.75 + rand() * 0.35), edgeAngle + (rand() - 0.5) * 0.15);
    }
  }
  return out;
}

export function fillWardGrid(poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed);
  const BW = 16, BH = 13, GAP = 6, STREET = 5;
  const rot = poly.map(p => ({ x: p.x, y: p.y }));
  const minX = Math.min(...rot.map(p => p.x)), maxX = Math.max(...rot.map(p => p.x));
  const minY = Math.min(...rot.map(p => p.y)), maxY = Math.max(...rot.map(p => p.y));
  for (let ry = minY + STREET; ry + BH < maxY - STREET + 1; ry += BH + GAP) {
    for (let rx = minX + STREET; rx + BW < maxX - STREET + 1; rx += BW + GAP) {
      const wcx = rx + BW * 0.5, wcy = ry + BH * 0.5;
      if (!pointInPolygon({ x: wcx, y: wcy }, poly)) continue;
      if (minDistToEdge({ x: wcx, y: wcy }, poly) < STREET - 1) continue;
      if (roads.length > 0 && minDistToRoads({ x: wcx, y: wcy }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, wcx, wcy, BW * (0.82 + rand() * 0.2), BH * (0.82 + rand() * 0.2), 0);
    }
  }
  return out;
}

export function fillWardLinear(poly: Vec2[], _wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed), angle = dominantEdgeAngle(poly), cent = centroid(poly), perimeter = polygonPerimeter(poly);
  const ALONG = 18, DEPTH = 12, STREET = 5, GAP = 3;
  const nSamples = Math.max(4, Math.floor(perimeter / (ALONG + GAP)));
  for (const row of [0, 1]) {
    const insetDist = STREET + row * (perimeter * 0.22);
    for (let si = 0; si < nSamples; si++) {
      const { x: ex, y: ey } = samplePerimeter(poly, si / nSamples);
      const inDx = cent.x - ex, inDy = cent.y - ey; const inLen = Math.hypot(inDx, inDy); if (inLen < 1) continue;
      const bx = ex + (inDx / inLen) * insetDist, by = ey + (inDy / inLen) * insetDist;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (roads.length > 0 && minDistToRoads({ x: bx, y: by }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, bx, by, ALONG * (0.8 + rand() * 0.3), DEPTH * (0.8 + rand() * 0.25), angle + (rand() - 0.5) * 0.08);
    }
  }
  return out;
}

export function fillWardTerraced(poly: Vec2[], _wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed), angle = dominantEdgeAngle(poly), cos = Math.cos(-angle), sin = Math.sin(-angle), uncos = Math.cos(angle), unsin = Math.sin(angle);
  const rot = poly.map(p => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  const minX = Math.min(...rot.map(p => p.x)), maxX = Math.max(...rot.map(p => p.x));
  const minY = Math.min(...rot.map(p => p.y)), maxY = Math.max(...rot.map(p => p.y));
  const ROW_H = 13, STREET = 5, ROW_GAP = 6;
  for (let ry = minY + STREET; ry + ROW_H < maxY - STREET + 1; ry += ROW_H + ROW_GAP) {
    const rowCY = ry + ROW_H * 0.5; let rowMinX = maxX, rowMaxX = minX;
    for (let rx = minX; rx <= maxX; rx += 2) {
      const wcx = rx * uncos - rowCY * unsin, wcy = rx * unsin + rowCY * uncos;
      if (pointInPolygon({ x: wcx, y: wcy }, poly) && minDistToEdge({ x: wcx, y: wcy }, poly) >= STREET - 1 && (roads.length === 0 || minDistToRoads({ x: wcx, y: wcy }, roads) >= ROAD_CLEARANCE)) {
        rowMinX = Math.min(rowMinX, rx); rowMaxX = Math.max(rowMaxX, rx);
      }
    }
    if (rowMaxX <= rowMinX) continue;
    const rowLen = rowMaxX - rowMinX, houseW = 12 + rand() * 6, nHouses = Math.max(1, Math.floor(rowLen / houseW)), actualW = rowLen / nHouses;
    for (let h = 0; h < nHouses; h++) {
      const rcx = rowMinX + (h + 0.5) * actualW, rcy = rowCY, wcx = rcx * uncos - rcy * unsin, wcy = rcx * unsin + rcy * uncos;
      if (roads.length > 0 && minDistToRoads({ x: wcx, y: wcy }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, wcx, wcy, actualW - 0.5, ROW_H * (0.88 + rand() * 0.12), angle);
    }
  }
  return out;
}

export function fillWardPerimeter(poly: Vec2[], _wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed), DEPTH = 14, STREET = 5, ALONG = 16, GAP = 2.5, perimeter = polygonPerimeter(poly), nSamples = Math.max(4, Math.floor(perimeter / (ALONG + GAP))), cent = centroid(poly);
  for (let si = 0; si < nSamples; si++) {
    const { x: ex, y: ey, angle: edgeAngle } = samplePerimeter(poly, si / nSamples);
    const inDx = cent.x - ex, inDy = cent.y - ey; const inLen = Math.hypot(inDx, inDy); if (inLen < 1) continue;
    const bx = ex + (inDx / inLen) * (STREET + DEPTH * 0.5), by = ey + (inDy / inLen) * (STREET + DEPTH * 0.5);
    if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
    if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 1) continue;
    if (roads.length > 0 && minDistToRoads({ x: bx, y: by }, roads) < ROAD_CLEARANCE) continue;
    pushRect(out, occ, bx, by, ALONG * (0.8 + rand() * 0.3), DEPTH * (0.85 + rand() * 0.2), edgeAngle + (rand() - 0.5) * 0.1);
  }
  return out;
}

export function fillWardRadial(poly: Vec2[], _wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed), cent = centroid(poly), centInset = minDistToEdge(cent, poly), STREET = 5, DEPTH = 12, GAP = 3, ALONG = 15;
  for (let ring = 0; ring * (DEPTH + GAP) < centInset - STREET - DEPTH; ring++) {
    const r = STREET + ring * (DEPTH + GAP) + DEPTH * 0.5, circ = 2 * Math.PI * r, n = Math.max(3, Math.floor(circ / (ALONG + GAP)));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n, bx = cent.x + Math.cos(a) * r, by = cent.y + Math.sin(a) * r;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 2) continue;
      if (roads.length > 0 && minDistToRoads({ x: bx, y: by }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, bx, by, ALONG * (0.82 + rand() * 0.25), DEPTH * (0.82 + rand() * 0.25), a + Math.PI * 0.5 + (rand() - 0.5) * 0.12);
    }
  }
  return out;
}

export function fillWardClustered(poly: Vec2[], _wardType: WardType, seed: number, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const out: BuildingRect[] = [];
  if (poly.length < 3) return out;
  const rand = mulberry32(seed);
  const COURT_R = 7, ALONG = 12, DEPTH = 10, STREET = 5, CLUSTER_MIN_DIST = 28;
  const bbox = poly.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const clusterCentres: Vec2[] = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const candidate = { x: bbox.minX + rand() * (bbox.maxX - bbox.minX), y: bbox.minY + rand() * (bbox.maxY - bbox.minY) };
    if (!pointInPolygon(candidate, poly)) continue;
    if (minDistToEdge(candidate, poly) < STREET + DEPTH) continue;
    if (roads.length > 0 && minDistToRoads(candidate, roads) < ROAD_CLEARANCE + DEPTH) continue;
    if (clusterCentres.some(c => Math.hypot(c.x - candidate.x, c.y - candidate.y) < CLUSTER_MIN_DIST)) continue;
    clusterCentres.push(candidate);
  }
  for (const cc of clusterCentres) {
    const nBldg = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < nBldg; b++) {
      const a = (2 * Math.PI * b) / nBldg + rand() * 0.3, bx = cc.x + Math.cos(a) * COURT_R, by = cc.y + Math.sin(a) * COURT_R;
      if (!pointInPolygon({ x: bx, y: by }, poly)) continue;
      if (minDistToEdge({ x: bx, y: by }, poly) < STREET - 1) continue;
      if (roads.length > 0 && minDistToRoads({ x: bx, y: by }, roads) < ROAD_CLEARANCE) continue;
      pushRect(out, occ, bx, by, ALONG * (0.8 + rand() * 0.3), DEPTH * (0.8 + rand() * 0.3), a + (rand() - 0.5) * 0.2);
    }
  }
  return out;
}

export function fillWard(ward: Ward, occ: OccupancyGrid, roads: Road[] = []): BuildingRect[] {
  const wardSeed = Math.round(ward.center.x * 97 + ward.center.y * 53);
  switch (ward.wardLayout) {
    case 'grid': return fillWardGrid(ward.polygon, ward.type, wardSeed, occ, roads);
    case 'linear': return fillWardLinear(ward.polygon, ward.type, wardSeed, occ, roads);
    case 'terraced': return fillWardTerraced(ward.polygon, ward.type, wardSeed, occ, roads);
    case 'perimeter': return fillWardPerimeter(ward.polygon, ward.type, wardSeed, occ, roads);
    case 'radial': return fillWardRadial(ward.polygon, ward.type, wardSeed, occ, roads);
    case 'cluster': return fillWardClustered(ward.polygon, ward.type, wardSeed, occ, roads);
    default: return fillWardOrganically(ward.polygon, ward.type, wardSeed, occ, roads);
  }
}
/** Step 2: Build SettlementModel from existing (possibly user-warped) seeds. */
type WeightedPalette = ReadonlyArray<[LayoutType, number]>;

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


