// ── RelaxedMeshGrid — jittered-triangle -> quad -> relaxed-mesh generator ────
//
//  Phase 3 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): the Stålberg/Sylves "Townscaper
//  grid" technique -- tile a region with a jittered triangular lattice,
//  greedily pair triangles into quads, subdivide to guarantee an all-quad
//  mesh, then relax interior points toward their neighbours' average.
//  Produces an irregular, organic-looking all-quad mesh that still tiles
//  seamlessly with an adjacent region (boundary points are pinned).
//
//  Deliberately standalone and pure (no THREE.js/WorldGrid/settlement
//  dependency) -- see docs/superpowers/specs/2026-09-02-relaxed-mesh-grid-design.md
//  for why this ships as infrastructure only, with no live integration yet.

export interface RelaxedMeshPoint {
  x: number;
  z: number;
}

/** Max per-axis jitter applied to an interior lattice point, as a fraction
 *  of one unit-square edge length. Bounded well under 0.5 so a jittered
 *  point can never cross past its own unit square's original edge (which
 *  would risk inverted/self-intersecting triangles in the split step). */
export const JITTER_MAX = 0.3;

/** Deterministic pseudo-random unit value [0, 1) for an integer (a, b, salt)
 *  triple -- same bit-mixing hash convention already used throughout this
 *  codebase (see TerrainGeometryBuilder.ts's _subTileRoll/cornerHeightJitter). */
function _hash01(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Builds an (nx+1) x (nz+1) lattice of points over an nx x nz unit-square
 * region (row-major: index = j*(nx+1)+i). Every point NOT on the region's
 * outer boundary (i in {0,nx} or j in {0,nz}) gets a small deterministic
 * jitter in both axes, seeded by its own (i, j, seed) -- boundary points are
 * always exactly (i, j), never jittered, so adjacent regions built with the
 * same seed always agree along a shared boundary.
 */
export function _buildJitteredLattice(nx: number, nz: number, seed: number): RelaxedMeshPoint[] {
  const pts: RelaxedMeshPoint[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const isBoundary = i === 0 || i === nx || j === 0 || j === nz;
      if (isBoundary) {
        pts.push({ x: i, z: j });
      } else {
        const jx = (_hash01(i, j, seed * 2 + 1) * 2 - 1) * JITTER_MAX;
        const jz = (_hash01(i, j, seed * 2 + 2) * 2 - 1) * JITTER_MAX;
        pts.push({ x: i + jx, z: j + jz });
      }
    }
  }
  return pts;
}

/** Point index into a flat (nx+1)x(nz+1) lattice array (row-major). */
export function _pointIndex(i: number, j: number, nx: number): number {
  return j * (nx + 1) + i;
}

/**
 * Deterministic seeded choice of which diagonal splits unit square (i, j)
 * into 2 triangles: true = the NW-SE diagonal (corners (i,j)-(i+1,j+1)),
 * false = the NE-SW diagonal (corners (i+1,j)-(i,j+1)).
 */
export function _chooseDiagonal(i: number, j: number, seed: number): boolean {
  return _hash01(i, j, seed * 2 + 1000003) < 0.5;
}

/** The 4 cardinal sides of a unit square, used to identify which square-side
 *  edges a given triangle half owns (see design spec's derivation: NORTH is
 *  always owned by "half 0", SOUTH always by "half 1", regardless of
 *  diagonal choice; EAST/WEST swap between half 0/1 depending on which
 *  diagonal was chosen for that square). */
type Side = 'N' | 'S' | 'E' | 'W';
const OPPOSITE_SIDE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Corner point indices of unit square (i, j): NW, NE, SE, SW. */
function _squareCorners(i: number, j: number, nx: number): [number, number, number, number] {
  return [
    _pointIndex(i, j, nx),         // NW
    _pointIndex(i + 1, j, nx),     // NE
    _pointIndex(i + 1, j + 1, nx), // SE
    _pointIndex(i, j + 1, nx),     // SW
  ];
}

/** Which cardinal sides "half 0" and "half 1" of square (i,j) each own,
 *  and the 3 vertex indices of each half-triangle, given its diagonal
 *  choice. See design spec for the derivation. */
function _squareHalves(i: number, j: number, nx: number, diagAC: boolean): {
  half0: { verts: [number, number, number]; sides: [Side, Side] };
  half1: { verts: [number, number, number]; sides: [Side, Side] };
} {
  const [nw, ne, se, sw] = _squareCorners(i, j, nx);
  if (diagAC) {
    // Diagonal NW-SE. half0={NW,NE,SE} owns N+E; half1={NW,SE,SW} owns S+W.
    return {
      half0: { verts: [nw, ne, se], sides: ['N', 'E'] },
      half1: { verts: [nw, se, sw], sides: ['S', 'W'] },
    };
  }
  // Diagonal NE-SW. half0={NW,NE,SW} owns N+W; half1={NE,SE,SW} owns E+S.
  return {
    half0: { verts: [nw, ne, sw], sides: ['N', 'W'] },
    half1: { verts: [ne, se, sw], sides: ['E', 'S'] },
  };
}

/** The neighbouring square across `side` of square (i, j), and which side
 *  of that neighbour is the shared edge -- or null if (i, j) is already at
 *  the region's own outer boundary on that side. */
function _neighborAcross(
  i: number, j: number, side: Side, nx: number, nz: number,
): { ni: number; nj: number; nside: Side } | null {
  const [di, dj] = side === 'N' ? [0, -1] : side === 'S' ? [0, 1] : side === 'E' ? [1, 0] : [-1, 0];
  const ni = i + di, nj = j + dj;
  if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) return null;
  return { ni, nj, nside: OPPOSITE_SIDE[side] };
}

/** Unique id for one triangle half: `${i},${j},${half}` (half is 0 or 1). */
function _triId(i: number, j: number, half: 0 | 1): string {
  return `${i},${j},${half}`;
}

/**
 * Builds the full triangle set (2 per unit square, via _chooseDiagonal),
 * enumerates every adjacency edge exactly once (same-square diagonal edges,
 * plus cross-square side edges -- only emitted from each square's own E/S
 * sides, never its N/W sides, so a shared edge is never double-counted from
 * both squares' perspectives), shuffles that edge list (seeded), then
 * greedily matches: for each edge in shuffled order, if both its triangles
 * are still unmatched, merge them into a quad. Any triangle left unmatched
 * after every edge has been considered becomes its own 3-element "leftover"
 * entry (handled by the leftover-split step in `buildRawQuadMesh`).
 *
 * Design note: pairing is deliberately EDGE-based, not
 * triangle-tries-its-same-square-partner-first -- a triangle-first
 * approach would let nearly every square trivially re-pair into its own
 * original shape (since whichever of a square's 2 triangles is processed
 * first always finds its sibling unmatched), defeating the whole point of
 * the technique, which relies on cross-square pairing for genuine
 * irregularity. Shuffling the EDGE list instead gives same-square and
 * cross-square adjacencies equal, randomized priority.
 */
export function _buildQuadsFromTriangles(nx: number, nz: number, seed: number): number[][] {
  const halves = new Map<string, { verts: [number, number, number]; sides: [Side, Side] }>();
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const diagAC = _chooseDiagonal(i, j, seed);
      const { half0, half1 } = _squareHalves(i, j, nx, diagAC);
      halves.set(_triId(i, j, 0), half0);
      halves.set(_triId(i, j, 1), half1);
    }
  }

  const halfOwningSide = (ni: number, nj: number, nside: Side): 0 | 1 => {
    const h0 = halves.get(_triId(ni, nj, 0))!;
    return h0.sides.includes(nside) ? 0 : 1;
  };

  const edges: [string, string][] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      edges.push([_triId(i, j, 0), _triId(i, j, 1)]); // same-square diagonal edge
      for (const half of [0, 1] as const) {
        for (const side of halves.get(_triId(i, j, half))!.sides) {
          if (side !== 'E' && side !== 'S') continue; // only emit E/S to dedupe
          const nb = _neighborAcross(i, j, side, nx, nz);
          if (!nb) continue;
          edges.push([_triId(i, j, half), _triId(nb.ni, nb.nj, halfOwningSide(nb.ni, nb.nj, nb.nside))]);
        }
      }
    }
  }

  for (let k = edges.length - 1; k > 0; k--) {
    const r = Math.floor(_hash01(k, seed, 777) * (k + 1));
    [edges[k], edges[r]] = [edges[r]!, edges[k]!];
  }

  const matched = new Set<string>();
  const result: number[][] = [];
  for (const [idA, idB] of edges) {
    if (matched.has(idA) || matched.has(idB)) continue;
    matched.add(idA);
    matched.add(idB);
    const self = halves.get(idA)!, partner = halves.get(idB)!;
    const shared = self.verts.filter(v => partner.verts.includes(v));
    const uniqueSelf = self.verts.find(v => !partner.verts.includes(v))!;
    const uniquePartner = partner.verts.find(v => !self.verts.includes(v))!;
    result.push([uniqueSelf, shared[0]!, uniquePartner, shared[1]!]);
  }

  for (const [id, tri] of halves) {
    if (!matched.has(id)) result.push([...tri.verts]);
  }

  return result;
}

/** Shared cache so subdividing the same edge from either of its 2 adjacent
 *  quads' perspectives always reuses the identical new midpoint vertex --
 *  the load-bearing trick that keeps the final mesh's connectivity correct
 *  for relaxation (no duplicate coincident points at a shared edge). */
class _MidpointCache {
  private readonly cache = new Map<string, number>();
  constructor(private readonly points: RelaxedMeshPoint[]) {}

  private key(a: number, b: number): string {
    return a < b ? `${a},${b}` : `${b},${a}`;
  }

  /** Existing midpoint for edge (a,b), or a newly-appended one (pushed onto
   *  the shared `points` array) if this edge hasn't been split yet. */
  get(a: number, b: number): number {
    const k = this.key(a, b);
    const existing = this.cache.get(k);
    if (existing !== undefined) return existing;
    const pa = this.points[a]!, pb = this.points[b]!;
    const idx = this.points.length;
    this.points.push({ x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 });
    this.cache.set(k, idx);
    return idx;
  }
}

function _centroidOf(points: RelaxedMeshPoint[], verts: readonly number[]): number {
  let x = 0, z = 0;
  for (const v of verts) { x += points[v]!.x; z += points[v]!.z; }
  const idx = points.length;
  points.push({ x: x / verts.length, z: z / verts.length });
  return idx;
}

/**
 * Splits a leftover (unpaired) triangle [p0, p1, p2] into 3 quads via its
 * centroid and 3 edge midpoints (deduplicated via `mids`): each quad is
 * [original vertex, its next-edge midpoint, centroid, its previous-edge
 * midpoint], matching the triangle's own winding.
 */
function _splitLeftoverTriangle(points: RelaxedMeshPoint[], mids: _MidpointCache, tri: readonly [number, number, number]): number[][] {
  const [p0, p1, p2] = tri;
  const center = _centroidOf(points, tri);
  const m01 = mids.get(p0, p1), m12 = mids.get(p1, p2), m20 = mids.get(p2, p0);
  return [
    [p0, m01, center, m20],
    [p1, m12, center, m01],
    [p2, m20, center, m12],
  ];
}

/**
 * Subdivides one quad [q0,q1,q2,q3] into 4 sub-quads via its 4 edge
 * midpoints (deduplicated via `mids`) and a center point -- guarantees the
 * final mesh is uniformly quads regardless of whether the source quad came
 * from a successful triangle pairing or a leftover-triangle 3-way split.
 */
function _subdivideQuad(points: RelaxedMeshPoint[], mids: _MidpointCache, quad: readonly [number, number, number, number]): number[][] {
  const [q0, q1, q2, q3] = quad;
  const center = _centroidOf(points, quad);
  const m01 = mids.get(q0, q1), m12 = mids.get(q1, q2), m23 = mids.get(q2, q3), m30 = mids.get(q3, q0);
  return [
    [q0, m01, center, m30],
    [q1, m12, center, m01],
    [q2, m23, center, m12],
    [q3, m30, center, m23],
  ];
}

/**
 * Builds the final all-quad mesh (points + quads, every quad exactly 4
 * point indices) for an nx x nz region, before relaxation: jittered
 * lattice -> triangle pairing -> leftover 3-way split -> subdivide every
 * quad into 4.
 */
export function buildRawQuadMesh(nx: number, nz: number, seed: number): { points: RelaxedMeshPoint[]; quads: number[][] } {
  const points = _buildJitteredLattice(nx, nz, seed);
  const elements = _buildQuadsFromTriangles(nx, nz, seed);
  const mids = new _MidpointCache(points);

  // Stage 1: every element becomes a quad (pairing already did this for
  // 4-element entries; 3-element leftovers become 3 quads each).
  const stage1Quads: number[][] = [];
  for (const el of elements) {
    if (el.length === 4) {
      stage1Quads.push(el);
    } else {
      stage1Quads.push(..._splitLeftoverTriangle(points, mids, el as [number, number, number]));
    }
  }

  // Stage 2: subdivide every stage-1 quad into 4 (a fresh midpoint cache,
  // since stage 1's edges are a different edge set than stage 2's).
  const mids2 = new _MidpointCache(points);
  const finalQuads: number[][] = [];
  for (const q of stage1Quads) {
    finalQuads.push(..._subdivideQuad(points, mids2, q as [number, number, number, number]));
  }

  return { points, quads: finalQuads };
}

export interface RelaxedMeshResult {
  points: RelaxedMeshPoint[];
  quads: number[][];
}

/** Number of Laplacian relaxation iterations applied by default -- within
 *  the roadmap's own researched range (~10-12). */
const DEFAULT_RELAX_ITERATIONS = 10;

/**
 * Builds the full jittered-triangle -> quad -> relaxed-mesh grid for an
 * nx x nz region (see module header for the pipeline). `iterations`
 * (default `DEFAULT_RELAX_ITERATIONS`) controls how many Laplacian-
 * smoothing passes are applied; every ORIGINAL boundary lattice point
 * (i in {0,nx} or j in {0,nz}) is held fixed throughout, so the region's
 * overall footprint never shrinks/distorts and still tiles with an
 * adjacent region built from the same seed (see design spec's scope note
 * on what "tiling" means at this module's level vs. a caller's own
 * world-space placement).
 */
export function buildRelaxedMeshGrid(
  nx: number, nz: number, seed: number,
  iterations: number = DEFAULT_RELAX_ITERATIONS,
): RelaxedMeshResult {
  const { points, quads } = buildRawQuadMesh(nx, nz, seed);

  const pinned = new Set<number>();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      if (i === 0 || i === nx || j === 0 || j === nz) pinned.add(_pointIndex(i, j, nx));
    }
  }

  const neighbors: Set<number>[] = points.map(() => new Set<number>());
  for (const q of quads) {
    for (let k = 0; k < 4; k++) {
      const a = q[k]!, b = q[(k + 1) % 4]!;
      neighbors[a]!.add(b);
      neighbors[b]!.add(a);
    }
  }

  let current = points.map(p => ({ x: p.x, z: p.z }));
  for (let iter = 0; iter < iterations; iter++) {
    const next = current.map((p, idx) => {
      if (pinned.has(idx)) return p;
      const nbrs = neighbors[idx]!;
      if (nbrs.size === 0) return p;
      let sx = 0, sz = 0;
      for (const n of nbrs) { sx += current[n]!.x; sz += current[n]!.z; }
      const meanX = sx / nbrs.size, meanZ = sz / nbrs.size;
      return { x: p.x + (meanX - p.x) * 0.5, z: p.z + (meanZ - p.z) * 0.5 };
    });
    current = next;
  }

  return { points: current, quads };
}
