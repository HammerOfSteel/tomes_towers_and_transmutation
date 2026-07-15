/**
 * SpatialHash — uniform-grid spatial partitioning.
 *
 * Phase 7h Performance Pass.
 *
 * Replaces O(n²) distance sweeps in the follower-aggro and harvest-proximity
 * loops with O(1) bucket lookups and a small constant factor for the cells
 * that overlap the query radius.
 *
 * Generic over any object that exposes a world position.  The caller
 * supplies a `getPos` accessor so this file has zero imports from Three.js.
 *
 * Usage pattern (per-frame):
 *   1.  `hash.clear()`
 *   2.  For each entity: `hash.insert(entity)`
 *   3.  For queries:     `hash.queryRadius(pos, radius)`   ← returns Entity[]
 *
 * Cell size should be set to the **largest expected query radius** so every
 * query touches at most a 3×3 block of cells (9 lookups).
 */

/** Minimal position interface — caller provides X and Z coordinates. */
export interface HasWorldPos {
  worldX: number;
  worldZ: number;
}

export class SpatialHash<T extends HasWorldPos> {
  /** Size of each grid cell in world units. */
  readonly cellSize: number;

  private readonly _inv: number;        // 1 / cellSize
  private readonly _map = new Map<number, T[]>();

  constructor(cellSize: number) {
    if (cellSize <= 0) throw new RangeError('SpatialHash: cellSize must be > 0');
    this.cellSize = cellSize;
    this._inv = 1 / cellSize;
  }

  // ── Key ────────────────────────────────────────────────────────────────────

  /** Convert world coords to cell coords. */
  private _cell(wx: number, wz: number): [cx: number, cz: number] {
    return [Math.floor(wx * this._inv), Math.floor(wz * this._inv)];
  }

  /**
   * Pack (cx, cz) into a single number for fast Map lookup.
   * Supports cell coords in the range –16 384 to +16 383.
   */
  private _key(cx: number, cz: number): number {
    // Offset to keep values positive before bit-packing
    return ((cx + 16384) & 0x7fff) | (((cz + 16384) & 0x7fff) << 15);
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  /** Remove all entities. Call once per frame before re-inserting. */
  clear(): void {
    this._map.clear();
  }

  /** Insert an entity into the cell that contains its position. */
  insert(entity: T): void {
    const [cx, cz] = this._cell(entity.worldX, entity.worldZ);
    const k = this._key(cx, cz);
    let bucket = this._map.get(k);
    if (!bucket) { bucket = []; this._map.set(k, bucket); }
    bucket.push(entity);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  /**
   * Return all entities whose position is within `radius` WU of `(wx, wz)`.
   *
   * Visits every cell that overlaps the axis-aligned bounding square of the
   * circle, then filters by actual Euclidean distance.
   */
  queryRadius(wx: number, wz: number, radius: number): T[] {
    const r2 = radius * radius;
    const [minCx, minCz] = this._cell(wx - radius, wz - radius);
    const [maxCx, maxCz] = this._cell(wx + radius, wz + radius);

    const result: T[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this._map.get(this._key(cx, cz));
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.worldX - wx;
          const dz = e.worldZ - wz;
          if (dx * dx + dz * dz <= r2) result.push(e);
        }
      }
    }
    return result;
  }

  /**
   * Return the single nearest entity within `radius`, or `null`.
   * Avoids allocating a result array — useful for "nearest enemy" queries.
   */
  nearest(wx: number, wz: number, radius: number): T | null {
    const r2 = radius * radius;
    const [minCx, minCz] = this._cell(wx - radius, wz - radius);
    const [maxCx, maxCz] = this._cell(wx + radius, wz + radius);

    let best: T | null = null;
    let bestD2 = r2 + 1; // just outside range so first valid hit wins

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this._map.get(this._key(cx, cz));
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.worldX - wx;
          const dz = e.worldZ - wz;
          const d2 = dx * dx + dz * dz;
          if (d2 <= r2 && d2 < bestD2) { bestD2 = d2; best = e; }
        }
      }
    }
    return best;
  }

  /** Total number of entities currently stored. */
  get size(): number {
    let n = 0;
    for (const b of this._map.values()) n += b.length;
    return n;
  }
}
