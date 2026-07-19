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

interface GeneratorParams {
  seed:          number;
  type:          SettlementType;
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

function setTool(name: ToolName) {
  activeTool = name;
  document.querySelectorAll<HTMLElement>('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tool-${name}`)?.classList.add('active');
  canvas.classList.remove('tool-warp');
  if (name === 'warp') canvas.classList.add('tool-warp');
}

function getParams(): GeneratorParams {
  const type = (document.querySelector('.pill.active') as HTMLElement)?.dataset.type as SettlementType ?? 'village';
  return {
    seed:       parseInt(seedInput.value) || Date.now(),
    type,
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

  const showLabels    = (document.getElementById('show-labels')    as HTMLInputElement).checked;
  const showBuildings = (document.getElementById('show-buildings') as HTMLInputElement).checked;
  drawSettlement(model, canvas, showLabels, showBuildings);

  genTimeEl.textContent = `${model.genTimeMs.toFixed(1)} ms  ·  ${model.wards.filter(w => w.withinCity).length} wards  ·  ${model.roads.length} roads`;
}

// ── Controls ──────────────────────────────────────────────────────────────────

// Settlement type pills
document.getElementById('type-pills')!.addEventListener('click', e => {
  const pill = (e.target as HTMLElement).closest('.pill') as HTMLElement | null;
  if (!pill) return;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  generate(false);
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
  }
});

// ── Tool button wiring ────────────────────────────────────────────────────────

document.getElementById('tool-select')!.addEventListener('click', () => setTool('select'));
document.getElementById('tool-warp')!.addEventListener('click',   () => setTool('warp'));
document.getElementById('tool-reset')!.addEventListener('click',  () => {
  persistentSeeds = null;  // force fresh seeds next generate
  generate(false);
});

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
  const showLabels    = (document.getElementById('show-labels')    as HTMLInputElement).checked;
  const showBuildings = (document.getElementById('show-buildings') as HTMLInputElement).checked;
  drawSettlement(model, canvas, showLabels, showBuildings);
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
