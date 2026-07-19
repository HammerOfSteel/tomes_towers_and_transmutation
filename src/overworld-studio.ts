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
  | 'organic'       // Voronoi-based, irregular — current default
  | 'grid'          // Orthogonal streets, rectangular blocks (Roman, American)
  | 'linear'        // One main road, buildings either side (Welsh valley, Strassendorf)
  | 'radial'        // Streets radiate from central hub (Baroque, Paris)
  | 'terraced'      // Parallel rows of row-houses (Welsh/English industrial)
  | 'perimeter'     // Buildings around block edge with hollow courtyard (Barcelona)
  ;

interface GeneratorParams {
  seed:          number;
  type:          SettlementType;
  layout:        LayoutType;
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
  }));

  // Add outer farm patches for context
  for (let i = 0; i < seeds.length; i++) {
    if (sortedIdx.includes(i)) continue;
    if (dist(seeds[i]!, centre) > R * 1.5) continue;
    const poly = polygons[i] ?? [];
    wards.push({ type: 'farm', seed: seeds[i]!, polygon: poly,
                 withinCity: false, center: centroid(poly.length ? poly : [seeds[i]!]) });
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

/** Draw a flat building rectangle (shadow then fill). */
function drawBldg(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, bw: number, bh: number,
  rot: number, fill: string,
): void {
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

/**
 * Lightweight occupancy grid — 6px cells.
 * Mark building footprints; reject new buildings that would overlap.
 */
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

// ── Building layout strategies per LayoutType ────────────────────────────────

/**
 * Grid layout: buildings arranged in tight orthogonal rows aligned to the
 * canvas axes (or a fixed dominant angle). Like Roman castra, American blocks.
 */
function fillWardGrid(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[], wardType: WardType, seed: number, occ: OccupancyGrid,
): void {
  if (poly.length < 3) return;
  const rand = mulberry32(seed);
  const col = wardType === 'church' ? CARTO.bldg_dk : CARTO.bldg;
  const BW = 16, BH = 13, GAP = 3, STREET = 5;
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
  const ROW_H = 13, STREET = 5, ROW_GAP = 4;

  for (let ry = minY + STREET; ry + ROW_H < maxY - STREET + 1; ry += ROW_H + ROW_GAP) {
    const rowCY  = ry + ROW_H * 0.5;
    // Find left/right extents of the polygon at this row
    let rowMinX = maxX, rowMaxX = minX;
    for (let rx = minX; rx <= maxX; rx += 2) {
      const wcx = rx * uncos - rowCY * unsin, wcy = rx * unsin + rowCY * uncos;
      if (pointInPolygon({ x: wcx, y: wcy }, poly) &&
          minDistToEdge({ x: wcx, y: wcy }, poly) >= STREET - 1) {
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
      const aw = ALONG * (0.82 + rand() * 0.25), dh = DEPTH * (0.82 + rand() * 0.25);
      const fa = a + Math.PI * 0.5 + (rand() - 0.5) * 0.12;  // tangent to ring
      if (occ.blocked(bx, by, aw, dh, fa)) continue;
      occ.mark(bx, by, aw, dh, fa);
      drawBldg(ctx, bx, by, aw, dh, fa, col);
    }
  }
}

/** Dispatch to the correct fill strategy based on layout type. */
function fillWard(
  ctx: CanvasRenderingContext2D,
  ward: Ward, layout: LayoutType, occ: OccupancyGrid,
): void {
  const wardSeed = Math.round(ward.center.x * 97 + ward.center.y * 53);
  switch (layout) {
    case 'grid':      return fillWardGrid     (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'linear':    return fillWardLinear   (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'terraced':  return fillWardTerraced (ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'perimeter': return fillWardPerimeter(ctx, ward.polygon, ward.type, wardSeed, occ);
    case 'radial':    return fillWardRadial   (ctx, ward.polygon, ward.type, wardSeed, occ);
    default:          return fillWardOrganically(ctx, ward.polygon, ward.type, wardSeed, occ);
  }
}

export function drawSettlement2D5(
  model: SettlementModel,
  canvas: HTMLCanvasElement,
  showLabels = true,
  layout: LayoutType = 'organic',
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

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

    fillWard(ctx, ward, layout, occ);
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
      ctx.fillText(WARD_LABELS[ward.type].toUpperCase(), ward.center.x, ward.center.y);
    }
  }
}

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
let viewMode: ViewMode = (sessionStorage.getItem('ow-view') as ViewMode) ?? 'flat';

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
  document.getElementById('view-flat')?.classList.toggle('active', mode === 'flat');
  document.getElementById('view-iso' )?.classList.toggle('active', mode === 'iso');
  redraw();
}

function redraw() {
  if (!currentModel) return;
  const showLabels    = (document.getElementById('show-labels')    as HTMLInputElement).checked;
  const showBuildings = (document.getElementById('show-buildings') as HTMLInputElement).checked;
  const layoutParam = (document.querySelector('#layout-pills .pill.active') as HTMLElement)?.dataset.layout as LayoutType ?? 'organic';
  if (viewMode === 'iso') drawSettlement2D5(currentModel, canvas, showLabels, layoutParam);
  else                    drawSettlement(currentModel, canvas, showLabels, showBuildings);
}

function getParams(): GeneratorParams {
  const type = (document.querySelector('#type-pills .pill.active') as HTMLElement)?.dataset.type as SettlementType ?? 'village';
  const layout = (document.querySelector('#layout-pills .pill.active') as HTMLElement)?.dataset.layout as LayoutType ?? 'organic';
  return {
    seed:       parseInt(seedInput.value) || Date.now(),
    type,
    layout,
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
  generate();
});
document.getElementById('btn-gen')!.addEventListener('click', () => generate(false));

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
    case '1': setView('flat'); break;
    case '2': setView('iso');  break;
  }
});

// ── Tool button wiring ────────────────────────────────────────────────────────

document.getElementById('tool-select')!.addEventListener('click', () => setTool('select'));
document.getElementById('tool-warp')!.addEventListener('click',   () => setTool('warp'));
document.getElementById('tool-reset')!.addEventListener('click',  () => {
  persistentSeeds = null;
  generate(false);
});
document.getElementById('view-flat')!.addEventListener('click', () => setView('flat'));
document.getElementById('view-iso')! .addEventListener('click', () => setView('iso'));

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

// ── Initial generation ────────────────────────────────────────────────────────

generate();
