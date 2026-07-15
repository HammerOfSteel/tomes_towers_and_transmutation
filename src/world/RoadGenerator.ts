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
 *   4. 4-directional movement only — roads are always axis-aligned (no diagonals)
 *      to match the isometric grid aesthetic.
 *   5. Fall back to an L-shaped rectilinear path if A* cannot find a route.
 *
 * Returns a flat tile list (for grid marking and flat-tile rendering).
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
  /** Flat deduplicated tile list — used for WorldGrid marking and flat-tile rendering. */
  tiles:  RoadSegment[];
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

/** 4-directional moves only — keeps roads axis-aligned for the isometric grid aesthetic. */
const DIRS: [number, number, number][] = [
  [ 0,  1, 1.0],  [ 0, -1, 1.0],  [ 1,  0, 1.0],  [-1,  0, 1.0],
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
  // Manhattan distance — admissible and consistent for 4-directional movement
  return Math.abs(c2 - c1) + Math.abs(r2 - r1);
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

// ── L-shape fallback ────────────────────────────────────────────────────────────────

/**
 * Axis-aligned L-shaped path: horizontal leg first, then vertical.
 * Used as a fallback when A* cannot find a route.
 */
function _lShape(
  c1: number, r1: number,
  c2: number, r2: number,
): { col: number; row: number }[] {
  const pts: { col: number; row: number }[] = [];
  const cStep = c1 <= c2 ? 1 : -1;
  for (let c = c1; c !== c2 + cStep; c += cStep) pts.push({ col: c, row: r1 });
  const rStep = r1 <= r2 ? 1 : -1;
  for (let r = r1 + rStep; r !== r2 + rStep; r += rStep) pts.push({ col: c2, row: r });
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

// ── Public API ────────────────────────────────────────────────────────────────

export interface SettlementCentre {
  centerCol: number;
  centerRow: number;
}

/**
 * Build inter-settlement roads connecting all settlements on the WorldGrid.
 *
 * Returns the flat tile list (for grid marking and flat-tile rendering).
 */
export function buildInterSettlementRoads(
  settlements: { plan: SettlementCentre }[],
  grid: WorldGrid,
): InterRoadResult {
  if (settlements.length < 2) return { tiles: [] };

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

  for (const [ai, bi] of edges) {
    const a = centres[ai]!, b = centres[bi]!;
    const raw  = _aStar(grid, a.col, a.row, b.col, b.row);
    const full = raw.length > 1 ? raw : _lShape(a.col, a.row, b.col, b.row);

    // Full tile set for grid marking and flat-tile rendering
    for (const { col, row } of full) {
      if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) continue;
      const k = `${col},${row}`;
      if (!seen.has(k)) { seen.add(k); tiles.push({ col, row }); }
    }
  }

  return { tiles };
}

