/**
 * BlockKit.ts — Phase 2e of the settlement visual fidelity plan
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §2e.1).
 *
 * Shared modular sub-tile "block-kit" engine: buildings/props are
 * constructed from small grid-aligned unit blocks (`BLOCK_UNIT` = 1/8 of
 * the overworld's own 4 WU terrain tile, so block geometry is always an
 * integer subdivision of the terrain grid) rather than one large primitive
 * deformed with noise. Organic softness comes from *which small blocks get
 * their edges rounded*, decided by a marching-squares-style occupancy test
 * (the same family of technique that makes Townscaper's grid-based
 * buildings read as organic, and that terrain/wall auto-tiling ("blob
 * tilesets") has used for decades) — not from bending a continuous mesh.
 *
 * Core rule: a block's vertical edge (where two side faces meet) is
 * chamfered if and only if BOTH of the two orthogonal neighbour cells that
 * meet at that edge are empty. A cell buried in a flat wall run therefore
 * stays a sharp, deliberately-built-looking cube; a cell at the tip of a
 * silhouette (an isolated column, or the outer corner of a stepped tier)
 * gets its exposed corner(s) softened. This lets one shared engine produce
 * very different aesthetic outcomes per faction purely from the occupancy
 * pattern + palette it's given (organic mound, crisp monumental tower,
 * jagged crenellations, decayed ruin) — see FactionBlockProfiles.ts.
 */

import * as THREE from 'three';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import { buildDualGridCaseTable } from '@/world/DualGridCaseTable';

// ── Grid unit ─────────────────────────────────────────────────────────────────

/** World units per block edge. Exactly 1/8 of TERRAIN_TILE_SIZE (4 WU). */
export const BLOCK_UNIT = 0.5;

// ── Occupancy grid ────────────────────────────────────────────────────────────

export interface BlockGrid {
  /** key = `${bx},${by},${bz}` (integer block coords) -> materialKey string. */
  cells: Map<string, string>;
}

export function createBlockGrid(): BlockGrid {
  return { cells: new Map() };
}

function key(bx: number, by: number, bz: number): string {
  return `${bx},${by},${bz}`;
}

export function setBlock(grid: BlockGrid, bx: number, by: number, bz: number, materialKey: string): void {
  grid.cells.set(key(bx, by, bz), materialKey);
}

export function hasBlock(grid: BlockGrid, bx: number, by: number, bz: number): boolean {
  return grid.cells.has(key(bx, by, bz));
}

export function getMaterialKey(grid: BlockGrid, bx: number, by: number, bz: number): string | undefined {
  return grid.cells.get(key(bx, by, bz));
}

// ── Corner / face classification ─────────────────────────────────────────────

export type CornerId = 'NW' | 'NE' | 'SE' | 'SW';
export interface ChamferFlags { NW: boolean; NE: boolean; SE: boolean; SW: boolean }
export interface FaceVisibility { N: boolean; S: boolean; E: boolean; W: boolean; U: boolean; D: boolean }

// Convention: N = -Z, S = +Z, E = +X, W = -X, U = +Y, D = -Y.
const DIRS = {
  N: [0, 0, -1], S: [0, 0, 1], E: [1, 0, 0], W: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0],
} as const;

/** Built once at module load — pure data, shared with ShorelineCornerField.ts's
 *  own identical pattern (see docs/superpowers/specs/2026-09-02-dual-grid-case-table-usage.md). */
const _chamferCaseTable = buildDualGridCaseTable(2);

/** A cell is always occupied when getChamferFlags() is asked about it (the
 *  function's own contract — see its doc comment) — this constant avoids a
 *  redundant hasBlock() self-lookup at every one of the 4 corners below. */
const SELF_OCCUPIED = 1;

/**
 * Which of a cell's 4 vertical edges should be chamfered, based on the full
 * dual-grid classification of the vertex at that corner: the corner's own
 * diagonal neighbour, its two orthogonal neighbours, and the cell itself
 * (always occupied) — chamfer iff that 4-cell configuration is exactly the
 * dual-grid `outer_corner` shape (a genuinely isolated tip), never the
 * `diagonal`/saddle shape (two cells touching only at a shared point, where
 * chamfering would visually pull them apart) that a naive two-neighbour
 * check can't distinguish from it. See
 * docs/superpowers/specs/2026-09-02-blockkit-dualgrid-chamfer-design.md for
 * the full derivation (including why `edge`/`inner_corner`/`full` never
 * need to chamfer either, matching this rule's `outer_corner`-only test).
 * `suppressChamfer`, when it returns true for this cell, forces every edge
 * sharp regardless of neighbours (used by e.g. dwarven "monumental" cells
 * that should read as deliberately hard-edged masonry) — checked first,
 * independent of the case-table classification below.
 */
export function getChamferFlags(
  grid: BlockGrid,
  bx: number, by: number, bz: number,
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean,
): ChamferFlags {
  if (suppressChamfer?.(bx, by, bz)) {
    return { NW: false, NE: false, SE: false, SW: false };
  }
  const occ = (c: number, r: number): number => (hasBlock(grid, c, by, r) ? 1 : 0);
  const isOuterCorner = (config: number[]): boolean => {
    const found = _chamferCaseTable.mapping[config.join(',')];
    if (!found) return false;
    return _chamferCaseTable.tiles[found.tile]!.label === 'outer_corner';
  };
  // Each corner's [NW, NE, SE, SW] vertex config: the self cell always sits
  // diagonally opposite that corner's own diagonal neighbour, and adjacent
  // to both of that corner's orthogonal neighbours (see design spec).
  const nw = isOuterCorner([occ(bx - 1, bz - 1), occ(bx, bz - 1), SELF_OCCUPIED, occ(bx - 1, bz)]);
  const ne = isOuterCorner([occ(bx, bz - 1), occ(bx + 1, bz - 1), occ(bx + 1, bz), SELF_OCCUPIED]);
  const se = isOuterCorner([SELF_OCCUPIED, occ(bx + 1, bz), occ(bx + 1, bz + 1), occ(bx, bz + 1)]);
  const sw = isOuterCorner([occ(bx - 1, bz), SELF_OCCUPIED, occ(bx, bz + 1), occ(bx - 1, bz + 1)]);
  return { NW: nw, NE: ne, SE: se, SW: sw };
}

/** Standard voxel face culling: a face is visible iff its neighbour is empty. */
export function getFaceVisibility(grid: BlockGrid, bx: number, by: number, bz: number): FaceVisibility {
  return {
    N: !hasBlock(grid, bx + DIRS.N[0], by + DIRS.N[1], bz + DIRS.N[2]),
    S: !hasBlock(grid, bx + DIRS.S[0], by + DIRS.S[1], bz + DIRS.S[2]),
    E: !hasBlock(grid, bx + DIRS.E[0], by + DIRS.E[1], bz + DIRS.E[2]),
    W: !hasBlock(grid, bx + DIRS.W[0], by + DIRS.W[1], bz + DIRS.W[2]),
    U: !hasBlock(grid, bx + DIRS.U[0], by + DIRS.U[1], bz + DIRS.U[2]),
    D: !hasBlock(grid, bx + DIRS.D[0], by + DIRS.D[1], bz + DIRS.D[2]),
  };
}

// ── Outline polygon (2D horizontal cross-section) ───────────────────────────
// Corners are visited clockwise (viewed from above): NW -> NE -> SE -> SW.
// A sharp corner contributes 1 point; a chamfered corner contributes 2
// (pulled back by `r` along each of its adjacent edges), so the outline is
// a 4..8 point convex polygon depending on how many corners are chamfered.

const OUTGOING_EDGE: Record<CornerId, keyof FaceVisibility> = { NW: 'N', NE: 'E', SE: 'S', SW: 'W' };

/** Per-corner arc center (inset by `r` from the true corner along both axes,
 * matching the existing chamfer's inset convention) and the 90° sweep
 * (in standard math radians, x = cx + r*cos(angle), z = cz + r*sin(angle))
 * between the corner's two existing flat-chamfer tangent points. */
const CORNER_ARC: Record<CornerId, (s: number, r: number) => { cx: number; cz: number; startAngle: number; endAngle: number }> = {
  NW: (s, r) => ({ cx: -s + r, cz: -s + r, startAngle: Math.PI,       endAngle: Math.PI * 1.5 }),
  NE: (s, r) => ({ cx:  s - r, cz: -s + r, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2   }),
  SE: (s, r) => ({ cx:  s - r, cz:  s - r, startAngle: 0,             endAngle: Math.PI * 0.5 }),
  SW: (s, r) => ({ cx: -s + r, cz:  s - r, startAngle: Math.PI * 0.5, endAngle: Math.PI       }),
};

/**
 * A sharp corner contributes 1 point. A chamfered corner contributes
 * `segments + 1` points sampled along the 90° arc between the two tangent
 * points a flat chamfer would use (see `CORNER_ARC`) — `segments = 1`
 * samples just the two endpoints, exactly reproducing the original flat
 * 2-point diagonal cut; `segments > 1` adds intermediate points along the
 * arc, producing a genuinely rounded (not just beveled) corner.
 */
function cornerPoints(corner: CornerId, s: number, r: number, chamfered: boolean, segments: number): [number, number][] {
  if (!chamfered) {
    switch (corner) {
      case 'NW': return [[-s, -s]];
      case 'NE': return [[s, -s]];
      case 'SE': return [[s, s]];
      case 'SW': return [[-s, s]];
    }
  }
  const { cx, cz, startAngle, endAngle } = CORNER_ARC[corner](s, r);
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    pts.push([cx + r * Math.cos(angle), cz + r * Math.sin(angle)]);
  }
  return pts;
}

/** One outline point per element; `edgeTag[i]` names the segment from `points[i]` to `points[(i+1)%n]`. */
export interface BlockOutline extends Array<[number, number]> {}

interface OutlinePoint { p: [number, number]; tagToNext: string }

function buildOutlinePoints(flags: ChamferFlags, s: number, r: number, segments: number = 1): OutlinePoint[] {
  const CORNERS: CornerId[] = ['NW', 'NE', 'SE', 'SW'];
  const out: OutlinePoint[] = [];
  for (const corner of CORNERS) {
    const chamfered = flags[corner];
    const pts = cornerPoints(corner, s, Math.min(r, s * 0.98), chamfered, segments);
    for (let i = 0; i < pts.length; i++) {
      const isLast = i === pts.length - 1;
      // Every internal arc-to-arc segment (not the corner's final edge to
      // the next corner) is always visible regardless of face culling —
      // same as the original 2-point diagonal's `_diag` tag — so
      // blockGeometry()'s `tag.endsWith('_diag')` check needs no changes.
      out.push({ p: pts[i]!, tagToNext: isLast ? OUTGOING_EDGE[corner] : `${corner}_diag` });
    }
  }
  return out;
}

/** Public: just the ordered `[x,z]` outline points (for direct unit testing of the corner algorithm). */
export function buildBlockOutline(flags: ChamferFlags, s: number, r: number, segments: number = 1): [number, number][] {
  return buildOutlinePoints(flags, s, r, segments).map(pt => pt.p);
}

// ── Single-block geometry ─────────────────────────────────────────────────────

export interface BlockGeometryOptions {
  chamferRadius?: number;   // world units, default 0.16 * BLOCK_UNIT
  topBevel?: boolean;       // roofline-cell bevel (frustum-shaped cap)
  topBevelInset?: number;   // world units, default 0.12 * BLOCK_UNIT
  topBevelDrop?: number;    // world units, default 0.12 * BLOCK_UNIT
  /**
   * This block's integer grid coordinates, used only to project a
   * world-space UV (see `pushSideQuad`/`pushFanCap`) so palette textures
   * read as continuous material across many blocks instead of an
   * identical stamped swatch per cube. Defaults to the origin, which is
   * still valid (every block just samples the same local UV window) —
   * callers that don't care about cross-block texture continuity (e.g.
   * direct unit tests) can omit it.
   */
  blockCoord?: [number, number, number];
}

function scaleTowardCenter(pts: [number, number][], factor: number): [number, number][] {
  return pts.map(([x, z]) => [x * factor, z * factor]);
}

/**
 * Texture tiling period, in world units, for the world-space-projected UV
 * generated below (see `blockGeometry()`'s module-level doc for why this
 * projection exists). Chosen so a tile spans several blocks
 * (`BLOCK_UNIT` = 0.5 WU each) rather than exactly one — a 1:1 mapping
 * would make every block sample an *identical* texture swatch, which reads
 * as an obviously-repeating checkerboard once merged across a whole
 * building; spanning multiple blocks per tile lets a palette texture look
 * like continuous material (grain, mortar lines, hide mottling, ...)
 * running across the structure instead of a stamped, per-cube decal.
 */
const UV_TILE_WU = 1.5;

/** Fan-triangulate a convex polygon (assumed wound consistently) at a fixed Y, non-indexed (flat shading). */
function pushFanCap(
  positions: number[], normals: number[], uvs: number[],
  pts: [number, number][], y: number, normalY: 1 | -1,
  worldOx: number, worldOz: number,
): void {
  if (pts.length < 3) return;
  // The outline is wound clockwise as viewed from above (see the module-level
  // comment above buildOutlinePoints()). THREE.js treats a triangle as
  // front-facing when its vertices appear counter-clockwise *from the
  // direction its normal points* — so an upward-facing (+Y) triangle needs
  // its vertices to read counter-clockwise when viewed from above, which
  // means reversing the (clockwise) outline order to (p0, pB, pA); a
  // downward-facing (-Y) triangle is viewed from below, where the same
  // clockwise-from-above sequence already reads counter-clockwise, so it
  // keeps the outline's own order (p0, pA, pB).
  const winding = normalY === 1 ? -1 : 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[0]!, pA = pts[i]!, pB = pts[i + 1]!;
    const tri = winding === 1 ? [p0, pA, pB] : [p0, pB, pA];
    for (const [x, z] of tri) {
      positions.push(x, y, z);
      normals.push(0, normalY, 0);
      // Planar top-down projection: world X/Z directly, scaled to the
      // shared tiling period so cap faces line up with side-wall UVs.
      uvs.push((worldOx + x) / UV_TILE_WU, (worldOz + z) / UV_TILE_WU);
    }
  }
}

/** Emit one quad (2 triangles) between two vertical edges of the outline at a given y-span, non-indexed. */
function pushSideQuad(
  positions: number[], normals: number[], uvs: number[],
  p1: [number, number], p2: [number, number],
  yBottom: number, yTop: number,
  worldOx: number, worldOy: number, worldOz: number,
): void {
  const [x1, z1] = p1, [x2, z2] = p2;
  // Outward normal: perpendicular to the (p1->p2) edge, pointing away from origin.
  const ex = x2 - x1, ez = z2 - z1;
  let nx = ez, nz = -ex;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  // Ensure the normal points outward (away from the block centre), not inward.
  const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
  if (nx * midX + nz * midZ < 0) { nx = -nx; nz = -nz; }

  const a: [number, number, number] = [x1, yBottom, z1];
  const b: [number, number, number] = [x2, yBottom, z2];
  const c: [number, number, number] = [x2, yTop, z2];
  const d: [number, number, number] = [x1, yTop, z1];
  // UV: tangential world-space coordinate (projection of world XZ onto the
  // face's own in-plane tangent, perpendicular to its outward normal) for
  // "u", world Y for "v" — a standard world-space planar wall mapping so
  // texture grain/mortar lines run continuously along a wall instead of
  // restarting at every block, while still varying face-to-face for
  // differently-oriented walls (each face uses its own normal/tangent).
  const tx = -nz, tz = nx;
  const uvOf = (x: number, y: number, z: number): [number, number] => [
    ((worldOx + x) * tx + (worldOz + z) * tz) / UV_TILE_WU,
    (worldOy + y) / UV_TILE_WU,
  ];
  const uvA = uvOf(a[0], a[1], a[2]);
  const uvB = uvOf(b[0], b[1], b[2]);
  const uvC = uvOf(c[0], c[1], c[2]);
  const uvD = uvOf(d[0], d[1], d[2]);
  // Reversed from the naive (a,b,c)/(a,c,d) strip order: THREE.js treats a
  // triangle as front-facing when its vertices read counter-clockwise as
  // viewed from the direction its normal points (the outward direction
  // computed above), and the naive order reads clockwise from outside —
  // producing a wall whose front face points *inward*, invisible from
  // outside and only visible from inside the building (the reported
  // "front of the building is see-through" bug). Swapping each triangle's
  // last two vertices reverses the winding without changing the quad shape.
  const triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
    [a, c, b], [a, d, c],
  ];
  const uvTriangles: Array<[[number, number], [number, number], [number, number]]> = [
    [uvA, uvC, uvB], [uvA, uvD, uvC],
  ];
  for (let t = 0; t < triangles.length; t++) {
    const tri = triangles[t]!, uvTri = uvTriangles[t]!;
    for (let i = 0; i < 3; i++) {
      const v = tri[i]!;
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, 0, nz);
      const uv = uvTri[i]!;
      uvs.push(uv[0], uv[1]);
    }
  }
}

/**
 * Build one block's geometry (non-indexed, flat-shaded) from its chamfer
 * flags + face visibility. Culled faces contribute nothing (voxel face
 * culling); a `topBevel`-flagged roofline cell gets a frustum-shaped collar
 * (scaled-in top cap connected by a sloped band) instead of a flat cap.
 */
export function blockGeometry(
  flags: ChamferFlags,
  faces: FaceVisibility,
  opts: BlockGeometryOptions = {},
): THREE.BufferGeometry {
  const s = BLOCK_UNIT / 2;
  const r = opts.chamferRadius ?? 0.16 * BLOCK_UNIT;
  const inset = opts.topBevelInset ?? 0.12 * BLOCK_UNIT;
  const drop = opts.topBevelDrop ?? 0.12 * BLOCK_UNIT;
  const [bx, by, bz] = opts.blockCoord ?? [0, 0, 0];
  const worldOx = bx * BLOCK_UNIT, worldOy = by * BLOCK_UNIT, worldOz = bz * BLOCK_UNIT;

  const outline = buildOutlinePoints(flags, s, r);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const n = outline.length;
  const wallTop = opts.topBevel && faces.U ? s - drop : s;

  for (let i = 0; i < n; i++) {
    const cur = outline[i]!;
    const next = outline[(i + 1) % n]!;
    const tag = cur.tagToNext;
    const visible = tag.endsWith('_diag') ? true : faces[tag as keyof FaceVisibility];
    if (!visible) continue;
    pushSideQuad(positions, normals, uvs, cur.p, next.p, -s, wallTop, worldOx, worldOy, worldOz);
  }

  if (faces.U) {
    if (opts.topBevel) {
      const outlinePts = outline.map(o => o.p);
      const scale = Math.max(0.05, 1 - inset / s);
      const insetPts = scaleTowardCenter(outlinePts, scale);
      // Sloped collar band connecting the (shrunken-height) wall top
      // (outer ring, at `wallTop`) to the inset cap (inner ring, at `s`).
      for (let i = 0; i < n; i++) {
        const outerA = outlinePts[i]!, outerB = outlinePts[(i + 1) % n]!;
        const innerA = insetPts[i]!, innerB = insetPts[(i + 1) % n]!;
        // Quad: outerA(wallTop) - outerB(wallTop) - innerB(s) - innerA(s)
        const a: [number, number, number] = [outerA[0], wallTop, outerA[1]];
        const b: [number, number, number] = [outerB[0], wallTop, outerB[1]];
        const c: [number, number, number] = [innerB[0], s, innerB[1]];
        const d: [number, number, number] = [innerA[0], s, innerA[1]];
        const ex = outerB[0] - outerA[0], ez = outerB[1] - outerA[1];
        let nx = ez, nz = -ex;
        const len = Math.hypot(nx, nz) || 1;
        nx /= len; nz /= len;
        const midX = (outerA[0] + outerB[0]) / 2, midZ = (outerA[1] + outerB[1]) / 2;
        if (nx * midX + nz * midZ < 0) { nx = -nx; nz = -nz; }
        // Same tangential world-space UV projection as pushSideQuad().
        const tx = -nz, tz = nx;
        const uvOf = (x: number, y: number, z: number): [number, number] => [
          ((worldOx + x) * tx + (worldOz + z) * tz) / UV_TILE_WU,
          (worldOy + y) / UV_TILE_WU,
        ];
        const uvA = uvOf(a[0], a[1], a[2]);
        const uvB = uvOf(b[0], b[1], b[2]);
        const uvC = uvOf(c[0], c[1], c[2]);
        const uvD = uvOf(d[0], d[1], d[2]);
        // Reversed winding — see pushSideQuad()'s comment for why the naive
        // (a,b,c)/(a,c,d) order produces an inward-facing front face.
        const triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
          [a, c, b], [a, d, c],
        ];
        const uvTriangles: Array<[[number, number], [number, number], [number, number]]> = [
          [uvA, uvC, uvB], [uvA, uvD, uvC],
        ];
        for (let t = 0; t < triangles.length; t++) {
          const tri = triangles[t]!, uvTri = uvTriangles[t]!;
          for (let i2 = 0; i2 < 3; i2++) {
            const v = tri[i2]!;
            positions.push(v[0], v[1], v[2]);
            normals.push(nx, 0.3, nz);
            const uv = uvTri[i2]!;
            uvs.push(uv[0], uv[1]);
          }
        }
      }
      pushFanCap(positions, normals, uvs, insetPts, s, 1, worldOx, worldOz);
    } else {
      pushFanCap(positions, normals, uvs, outline.map(o => o.p), s, 1, worldOx, worldOz);
    }
  }
  if (faces.D) {
    pushFanCap(positions, normals, uvs, outline.map(o => o.p), -s, -1, worldOx, worldOz);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// ── Full grid meshing ─────────────────────────────────────────────────────────

export interface MeshBlockGridOptions {
  chamferRadius?: number;
  topBevel?: boolean;
  topBevelInset?: number;
  topBevelDrop?: number;
  suppressChamfer?: (bx: number, by: number, bz: number) => boolean;
  suppressTopBevel?: (bx: number, by: number, bz: number) => boolean;
}

/**
 * Mesh an entire `BlockGrid` into a `THREE.Group`. Builds one mesh per
 * occupied cell (simple, easy to reason about/test) then merges by
 * material via the existing `mergeGroupMeshesByMaterial` utility (already
 * used by the scatter/decor systems) so a whole building/prop still costs
 * one draw call per distinct palette material, not one per block.
 */
export function meshBlockGrid(
  grid: BlockGrid,
  palette: Record<string, THREE.Material>,
  opts: MeshBlockGridOptions = {},
): THREE.Group {
  const group = new THREE.Group();
  const topBevelDefault = opts.topBevel ?? true;

  for (const [k, materialKey] of grid.cells) {
    const [bx, by, bz] = k.split(',').map(Number) as [number, number, number];
    const faces = getFaceVisibility(grid, bx, by, bz);
    if (!faces.N && !faces.S && !faces.E && !faces.W && !faces.U && !faces.D) continue; // fully buried
    const flags = getChamferFlags(grid, bx, by, bz, opts.suppressChamfer);
    const useTopBevel = topBevelDefault && !(opts.suppressTopBevel?.(bx, by, bz));
    const geo = blockGeometry(flags, faces, {
      chamferRadius: opts.chamferRadius,
      topBevel: useTopBevel,
      topBevelInset: opts.topBevelInset,
      topBevelDrop: opts.topBevelDrop,
      blockCoord: [bx, by, bz],
    });
    if (geo.attributes.position.count === 0) continue;
    const mat = palette[materialKey] ?? palette[Object.keys(palette)[0] ?? ''];
    if (!mat) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx * BLOCK_UNIT, by * BLOCK_UNIT, bz * BLOCK_UNIT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  mergeGroupMeshesByMaterial(group);
  return group;
}
