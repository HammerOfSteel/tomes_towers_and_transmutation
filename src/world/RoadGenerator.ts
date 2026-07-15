/**
 * RoadGenerator — connects settlements across the overworld with terrain-aware
 * inter-settlement roads.
 *
 * Algorithm:
 *   1. Build a Minimum Spanning Tree (Prim's) on the settlement centres so every
 *      settlement is reachable.
 *   2. Add a few extra short connections to create loops.
 *   3. For each edge, run A* pathfinding on the WorldGrid with a terrain-aware
 *      cost function that avoids water, prefers valleys, penalises steep slopes,
 *      and cheaply re-uses existing road tiles.
 *   4. Apply Douglas–Peucker simplification to remove zigzag staircase artefacts
 *      from the 8-directional A* output — the simplified waypoint list is what
 *      gets stored for Catmull–Rom ribbon rendering.
 *   5. Fall back to Bresenham straight line if A* cannot find a path.
 *
 * Returns both a flat tile list (for grid marking / minimap) and the per-edge
 * simplified paths (for smooth ribbon mesh rendering in OverworldScene).
 */

import type { WorldGrid }    from './WorldGrid';
import type { RoadSegment }  from './SettlementGenerator';

// ── Public types ──────────────────────────────────────────────────────────────

/** One waypoint in a road path. */
export type GridPt = { col: number; row: number };

/** A simplified road path (one per road edge between settlements). */
export type GridPath = GridPt[];

/** Return value of buildInterSettlementRoads. */
export interface InterRoadResult {
  /** Flat deduplicated tile list — used for WorldGrid marking and minimap. */
  tiles:  RoadSegment[];
  /** One simplified path per road edge — used for Catmull–Rom ribbon rendering. */
  paths:  GridPath[];
}

// ── Min-heap priority queue ───────────────────────────────────────────────────

class MinHeap {
  private _d: [number, number][] = []; // [fScore, gridKey]

  push(f: number, k: number): void {
    this._d.push([f, k]);
    let i = this._d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._d[p]![0] <= this._d[i]![0]) break;
      [this._d[p], this._d[i]] = [this._d[i]!, this._d[p]!];
      i = p;
    }
  }

  pop(): [number, number] | undefined {
    if (this._d.length === 0) return undefined;
    const top  = this._d[0]!;
    const last = this._d.pop()!;
    if (this._d.length > 0) {
      this._d[0] = last;
      let i = 0;
      for (;;) {
        let m = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < this._d.length && this._d[l]![0] < this._d[m]![0]) m = l;
        if (r < this._d.length && this._d[r]![0] < this._d[m]![0]) m = r;
        if (m === i) break;
        [this._d[m], this._d[i]] = [this._d[i]!, this._d[m]!];
        i = m;
      }
    }
    return top;
  }

  get size(): number { return this._d.length; }
}

// ── A* pathfinding ────────────────────────────────────────────────────────────

/** 8-directional moves: [dCol, dRow, baseCost] */
const DIRS: [number, number, number][] = [
  [ 0,  1, 1.0],  [ 0, -1, 1.0],  [ 1,  0, 1.0],  [-1,  0, 1.0],
  [ 1,  1, 1.414], [ 1, -1, 1.414], [-1,  1, 1.414], [-1, -1, 1.414],
];

/** Terrain-aware movement cost from (fc, fr) to (tc, tr). */
function _moveCost(
  grid:  WorldGrid,
  fc: number, fr: number,
  tc: number, tr: number,
  base:  number,
): number {
  if (tc < 0 || tc >= grid.width || tr < 0 || tr >= grid.height) return Infinity;
  const cell = grid.get(tc, tr);

  // Never cross water (lakes/sea)
  if (cell.biome === 'water') return Infinity;

  // Existing roads are cheap (promotes reuse / road merging)
  if (cell.feature === 'road') return base * 0.25;

  // Rivers are possible but expensive (bridge cost)
  if (cell.feature === 'river') return base + 35;

  // Slope penalty: model that road builders prefer gentle gradients
  const elFrom = grid.get(fc, fr).elevation;
  const elTo   = cell.elevation;
  const slope  = Math.abs(elTo - elFrom) * 14.0;

  // Light penalty for rocky/highland biome (harder terrain)
  const terrainPenalty = (cell.biome === 'rocky' || cell.biome === 'highland') ? 2.0 : 0;

  return base + slope + terrainPenalty;
}

function _heuristic(c1: number, r1: number, c2: number, r2: number): number {
  return Math.sqrt((c2 - c1) ** 2 + (r2 - r1) ** 2);
}

/**
 * A* between two grid positions.
 * Returns the path as [{col, row}] from start to end (inclusive).
 * Returns [] if no path is found within the iteration budget.
 */
function _aStar(
  grid:   WorldGrid,
  startC: number, startR: number,
  endC:   number, endR:   number,
): { col: number; row: number }[] {
  const W = grid.width;
  const key = (c: number, r: number) => r * W + c;

  const endKey  = key(endC, endR);
  const gScore  = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const heap    = new MinHeap();

  const startKey = key(startC, startR);
  gScore.set(startKey, 0);
  heap.push(_heuristic(startC, startR, endC, endR), startKey);

  // Safety: limit iterations to avoid hanging on very large / obstacle-heavy grids
  const MAX_ITER = grid.width * grid.height;
  let iter = 0;

  while (heap.size > 0 && iter++ < MAX_ITER) {
    const [, curKey] = heap.pop()!;

    if (curKey === endKey) {
      // Reconstruct path
      const path: { col: number; row: number }[] = [];
      let k: number | undefined = endKey;
      while (k !== undefined) {
        path.unshift({ col: k % W, row: Math.floor(k / W) });
        k = cameFrom.get(k);
      }
      return path;
    }

    const curC = curKey % W;
    const curR = Math.floor(curKey / W);
    const curG = gScore.get(curKey) ?? Infinity;

    for (const [dc, dr, baseCost] of DIRS) {
      const nc = curC + dc, nr = curR + dr;
      const cost = _moveCost(grid, curC, curR, nc, nr, baseCost);
      if (!isFinite(cost)) continue;

      const tentative = curG + cost;
      const nKey = key(nc, nr);

      if (tentative < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentative);
        cameFrom.set(nKey, curKey);
        heap.push(tentative + _heuristic(nc, nr, endC, endR), nKey);
      }
    }
  }

  return []; // no path found
}

// ── Bresenham fallback ────────────────────────────────────────────────────────

function _bresenham(
  c1: number, r1: number,
  c2: number, r2: number,
): { col: number; row: number }[] {
  const pts: { col: number; row: number }[] = [];
  let x = c1, y = r1;
  const dx = Math.abs(c2 - c1), dy = Math.abs(r2 - r1);
  const sx = c1 < c2 ? 1 : -1, sy = r1 < r2 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    pts.push({ col: x, row: y });
    if (x === c2 && y === r2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
  return pts;
}

// ── MST (Prim's algorithm) ────────────────────────────────────────────────────

type Centre = { col: number; row: number };

/**
 * Prim's MST on settlement centres.
 * Returns a list of [indexA, indexB] pairs to connect.
 */
function _buildMST(centres: Centre[]): [number, number][] {
  const N = centres.length;
  if (N < 2) return [];

  const inTree = new Set<number>([0]);
  const edges: [number, number][] = [];

  while (inTree.size < N) {
    let bestD = Infinity, bestA = -1, bestB = -1;
    for (const a of inTree) {
      for (let b = 0; b < N; b++) {
        if (inTree.has(b)) continue;
        const da = centres[a]!, db = centres[b]!;
        const d = (da.col - db.col) ** 2 + (da.row - db.row) ** 2;
        if (d < bestD) { bestD = d; bestA = a; bestB = b; }
      }
    }
    if (bestA < 0) break;
    inTree.add(bestB);
    edges.push([bestA, bestB]);
  }

  return edges;
}

/**
 * Add extra connections (shortest non-MST edges) to introduce road loops.
 * Without loops the map feels completely linear (no alternate routes).
 */
function _addLoopEdges(
  centres: Centre[],
  mstEdges: [number, number][],
  count: number,
): [number, number][] {
  const N = centres.length;
  if (N < 3) return [];

  const inMST = new Set(mstEdges.map(([a, b]) => `${Math.min(a, b)}_${Math.max(a, b)}`));
  const candidates: [number, number, number][] = [];

  for (let a = 0; a < N; a++) {
    for (let b = a + 1; b < N; b++) {
      if (inMST.has(`${a}_${b}`)) continue;
      const da = centres[a]!, db = centres[b]!;
      const d = (da.col - db.col) ** 2 + (da.row - db.row) ** 2;
      candidates.push([d, a, b]);
    }
  }

  candidates.sort((x, y) => x[0] - y[0]);
  return candidates.slice(0, count).map(([, a, b]) => [a, b] as [number, number]);
}

// ── Douglas–Peucker path simplification ──────────────────────────────────────

/**
 * Perpendicular distance from point `pt` to the line segment [a, b] in grid
 * space.  Used by the DP simplification below.
 */
function _perpDist(pt: GridPt, a: GridPt, b: GridPt): number {
  const dx = b.col - a.col, dz = b.row - a.row;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(pt.col - a.col, pt.row - a.row);
  const t = Math.max(0, Math.min(1, ((pt.col - a.col) * dx + (pt.row - a.row) * dz) / len2));
  return Math.hypot(pt.col - a.col - t * dx, pt.row - a.row - t * dz);
}

/**
 * Douglas–Peucker polyline simplification.
 * `eps` ≈ 2.5 tiles removes the 8-directional staircase while preserving turns.
 */
function _dpSimplify(path: GridPath, eps = 2.5): GridPath {
  if (path.length <= 2) return path;
  let maxD = 0, idx = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const d = _perpDist(path[i]!, path[0]!, path[path.length - 1]!);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const L = _dpSimplify(path.slice(0, idx + 1), eps);
    const R = _dpSimplify(path.slice(idx),         eps);
    return [...L.slice(0, -1), ...R];
  }
  return [path[0]!, path[path.length - 1]!];
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SettlementCentre {
  centerCol: number;
  centerRow: number;
}

/**
 * Build inter-settlement roads connecting all settlements on the WorldGrid.
 *
 * Returns both the full tile list (for grid marking) and the simplified
 * per-edge paths (for smooth ribbon rendering in OverworldScene).
 */
export function buildInterSettlementRoads(
  settlements: { plan: SettlementCentre }[],
  grid: WorldGrid,
): InterRoadResult {
  if (settlements.length < 2) return { tiles: [], paths: [] };

  const centres: Centre[] = settlements.map(s => ({
    col: s.plan.centerCol,
    row: s.plan.centerRow,
  }));

  // Connectivity: MST + a few loop edges (≈40 % extra)
  const mst   = _buildMST(centres);
  const loops = _addLoopEdges(centres, mst, Math.max(1, Math.floor(settlements.length * 0.4)));
  const edges = [...mst, ...loops];

  const seen   = new Set<string>();
  const tiles: RoadSegment[] = [];
  const paths:  GridPath[]   = [];

  for (const [ai, bi] of edges) {
    const a = centres[ai]!, b = centres[bi]!;
    const raw = _aStar(grid, a.col, a.row, b.col, b.row);
    const full = raw.length > 1 ? raw : _bresenham(a.col, a.row, b.col, b.row);

    // Simplified path for ribbon rendering
    const simple = _dpSimplify(full);
    paths.push(simple);

    // Full tile set for grid marking
    for (const { col, row } of full) {
      if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) continue;
      const k = `${col},${row}`;
      if (!seen.has(k)) { seen.add(k); tiles.push({ col, row }); }
    }
  }

  return { tiles, paths };
}

