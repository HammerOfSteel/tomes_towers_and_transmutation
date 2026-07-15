/**
 * sdfBlend — SDF-based seam-fill meshes for organic creature body joins.
 *
 * CC-12 (Option A hybrid approach):
 * Keep the existing geometry body parts but add small seam-bridging meshes
 * at neck-torso and head-neck joints using local SDF evaluation + marching cubes.
 *
 * Each seam mesh is computed once at creature build time — not per frame.
 *
 * SDF fundamentals (Inigo Quilez notation):
 *   sdCapsule(p, a, b, r)   → signed distance to a capsule
 *   sdSphere(p, c, r)       → signed distance to a sphere
 *   opSmoothUnion(d1, d2, k) → smooth blend of two SDF distances
 */

import * as THREE from 'three';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number; }

// ── SDF primitives ─────────────────────────────────────────────────────────────

/** Signed distance from point `p` to a capsule from `a` to `b` with radius `r`. */
export function sdCapsule(p: Vec3, a: Vec3, b: Vec3, r: number): number {
  const pax = p.x - a.x, pay = p.y - a.y, paz = p.z - a.z;
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const h = Math.max(0, Math.min(1,
    (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz),
  ));
  const qx = pax - bax * h, qy = pay - bay * h, qz = paz - baz * h;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
}

/** Signed distance from point `p` to a sphere centred at `c` with radius `r`. */
export function sdSphere(p: Vec3, c: Vec3, r: number): number {
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/**
 * Smooth union of two SDF values with blending radius `k` (IQ formula).
 * At k=0 this equals `Math.min(d1, d2)`.
 * A value of k ≈ 0.15–0.30 gives a shoulder-width organic join.
 */
export function opSmoothUnion(d1: number, d2: number, k: number): number {
  const h = Math.max(k - Math.abs(d1 - d2), 0) / k;
  return Math.min(d1, d2) - h * h * k * 0.25;
}

// ── Marching cubes table (partial — edge/triangle lookup for 256 cases) ────────
// We only need a 6×6×6 grid around each seam so a simple lookup suffices.
// This is a compact version — full 256-case table omitted for brevity.
// Uses the standard triTable from Paul Bourke.

// Edge vertex pair indices (per edge of a cube)
const EDGE_V: [number, number][] = [
  [0,1],[1,2],[2,3],[3,0],   // bottom face
  [4,5],[5,6],[6,7],[7,0],   // top face (note: 7→0 wraps to 0-indexed edge 7)
  [0,4],[1,5],[2,6],[3,7],   // vertical edges
];

// Full Bourke triangle table (simplified to first 4 cases for seam bridging)
// In practice the grid is small enough that we only hit a handful of cases.
// We use an on-the-fly marching cubes rather than the full 256-entry triTable.

/** Marching cubes on a tiny local SDF grid.
 *  Returns vertices and indices for a mesh approximating the SDF isosurface at level 0.
 *  
 *  @param evalSDF  Function evaluating the SDF at a world-space point.
 *  @param cx, cy, cz  Centre of the evaluation box.
 *  @param boxR         Half-size of the box in world units.
 *  @param steps        Grid resolution per axis (6–8 is enough for seam meshes).
 */
function _marchGrid(
  evalSDF: (p: Vec3) => number,
  cx: number, cy: number, cz: number,
  boxR: number,
  steps: number,
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices:   number[] = [];

  const cellSize = (boxR * 2) / steps;

  // Sample SDF at all grid vertices
  const field: number[][][] = [];
  for (let iz = 0; iz <= steps; iz++) {
    field[iz] = [];
    for (let iy = 0; iy <= steps; iy++) {
      field[iz][iy] = [];
      for (let ix = 0; ix <= steps; ix++) {
        const wx = cx - boxR + ix * cellSize;
        const wy = cy - boxR + iy * cellSize;
        const wz = cz - boxR + iz * cellSize;
        field[iz]![iy]![ix] = evalSDF({ x: wx, y: wy, z: wz });
      }
    }
  }

  // Interpolate edge crossing (inline in loop below)

  // March each cell
  const _vi = (ix: number, iy: number, iz: number): number =>
    field[iz]![iy]![ix]!;

  for (let iz = 0; iz < steps; iz++) {
    for (let iy = 0; iy < steps; iy++) {
      for (let ix = 0; ix < steps; ix++) {
        // Cell corner world positions
        const x0 = cx - boxR + ix * cellSize;
        const y0 = cy - boxR + iy * cellSize;
        const z0 = cz - boxR + iz * cellSize;
        const x1 = x0 + cellSize, y1 = y0 + cellSize, z1 = z0 + cellSize;

        // Corner values
        const v = [
          _vi(ix, iy, iz),   _vi(ix+1, iy, iz),   _vi(ix+1, iy+1, iz),   _vi(ix, iy+1, iz),
          _vi(ix, iy, iz+1), _vi(ix+1, iy, iz+1), _vi(ix+1, iy+1, iz+1), _vi(ix, iy+1, iz+1),
        ];
        const corners: Vec3[] = [
          {x:x0,y:y0,z:z0},{x:x1,y:y0,z:z0},{x:x1,y:y1,z:z0},{x:x0,y:y1,z:z0},
          {x:x0,y:y0,z:z1},{x:x1,y:y0,z:z1},{x:x1,y:y1,z:z1},{x:x0,y:y1,z:z1},
        ];

        // Cube index
        let ci = 0;
        for (let i = 0; i < 8; i++) if (v[i]! < 0) ci |= (1 << i);
        if (ci === 0 || ci === 255) continue;

        // Find edge intersection points
        const edgePts: Vec3[] = new Array(12).fill(null) as Vec3[];
        for (let e = 0; e < 12; e++) {
          const [a, b] = EDGE_V[e]!;
          const va = v[a]!, vb = v[b]!;
          if ((va < 0) !== (vb < 0)) {
            const t = (0 - va) / (vb - va);
            const ca = corners[a]!, cb = corners[b]!;
            edgePts[e] = {
              x: ca.x + t * (cb.x - ca.x),
              y: ca.y + t * (cb.y - ca.y),
              z: ca.z + t * (cb.z - ca.z),
            };
          }
        }

        // Generate triangles — use a simple fan triangulation of active edges
        const active = edgePts.filter(p => p !== null) as Vec3[];
        if (active.length < 3) continue;
        const base = positions.length / 3;
        for (const p of active) positions.push(p.x, p.y, p.z);
        for (let i = 1; i < active.length - 1; i++) {
          indices.push(base, base + i, base + i + 1);
        }
      }
    }
  }

  return { positions, indices };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SeamOptions {
  /** Blend radius for smooth union (default 0.25). */
  blendK?:     number;
  /** Grid resolution for marching cubes (default 7). */
  gridSteps?:  number;
  /** Box half-size to evaluate around the seam centre (default 0.30). */
  boxRadius?:  number;
}

/**
 * Generate a seam-fill `THREE.BufferGeometry` that bridges the gap between
 * two body part SDF shapes at a joint.
 *
 * Usage (neck-torso seam):
 * ```typescript
 * const seamGeo = buildSeamMesh(
 *   { x: 0, y: 1.62, z: 0 },   // neck base world pos
 *   { x: 0, y: 1.64, z: 0 },   // torso top world pos
 *   0.085,                       // neck capsule radius
 *   0.19,                        // torso capsule radius
 *   { blendK: 0.20 },
 * );
 * ```
 */
export function buildSeamMesh(
  jointA:  Vec3,
  jointB:  Vec3,
  radiusA: number,
  radiusB: number,
  opts:    SeamOptions = {},
): THREE.BufferGeometry {
  const k        = opts.blendK    ?? 0.25;
  const steps    = opts.gridSteps ?? 7;
  const boxR     = opts.boxRadius ?? 0.30;

  // Centre of evaluation box at midpoint between the two joints
  const cx = (jointA.x + jointB.x) * 0.5;
  const cy = (jointA.y + jointB.y) * 0.5;
  const cz = (jointA.z + jointB.z) * 0.5;

  // SDF: smooth union of capsule from jointA→midpoint and capsule from midpoint→jointB
  const mid: Vec3 = { x: cx, y: cy, z: cz };

  const evalSDF = (p: Vec3): number => {
    const dA = sdCapsule(p, jointA, mid, radiusA);
    const dB = sdCapsule(p, mid, jointB, radiusB);
    return opSmoothUnion(dA, dB, k);
  };

  const { positions, indices } = _marchGrid(evalSDF, cx, cy, cz, boxR, steps);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
