// ── Bridson's Poisson-Disk Sampling ──────────────────────────────────────────
//
//  Generates a set of 2-D points inside a rectangle such that no two points are
//  closer than `minDist`.  The algorithm is O(n) and produces a dense packing.
//
//  The `rand` parameter makes the result fully deterministic given the same seed.

/**
 * Bridson's Poisson-disk sampling.
 *
 * @param width   Width of the sampling area (origin at 0)
 * @param height  Height of the sampling area (origin at 0)
 * @param minDist Minimum distance between any two output points
 * @param rand    Seeded random function `() => [0, 1)`
 * @returns       Array of `[x, y]` pairs; all within `[0, width] × [0, height]`
 */
export function poissonDisk(
  width: number,
  height: number,
  minDist: number,
  rand: () => number,
): [number, number][] {
  const cellSize = minDist / Math.SQRT2;
  const cols     = Math.ceil(width  / cellSize) + 1;
  const rows     = Math.ceil(height / cellSize) + 1;

  // Background grid: stores point index (-1 = empty)
  const grid   = new Int32Array(cols * rows).fill(-1);
  const active: number[] = [];
  const points: [number, number][] = [];

  function gridKey(x: number, y: number): number {
    return Math.floor(y / cellSize) * cols + Math.floor(x / cellSize);
  }

  function addPoint(x: number, y: number): void {
    const idx = points.length;
    points.push([x, y]);
    active.push(idx);
    grid[gridKey(x, y)] = idx;
  }

  // Seed point near centre
  addPoint(
    width  * 0.5 + (rand() - 0.5) * minDist,
    height * 0.5 + (rand() - 0.5) * minDist,
  );

  while (active.length > 0) {
    const ai = Math.floor(rand() * active.length);
    const [px, py] = points[active[ai]];
    let placed = false;

    for (let k = 0; k < 30; k++) {
      const angle = rand() * Math.PI * 2;
      const dist  = minDist * (1.0 + rand()); // random distance in [minDist, 2*minDist]
      const nx    = px + Math.cos(angle) * dist;
      const ny    = py + Math.sin(angle) * dist;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const cx = Math.floor(nx / cellSize);
      const ry = Math.floor(ny / cellSize);
      let tooClose = false;

      // Check 5×5 neighbourhood in the grid
      outer: for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r2 = ry + dr;
          const c2 = cx + dc;
          if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) continue;
          const pi = grid[r2 * cols + c2];
          if (pi < 0) continue;
          const [qx, qy] = points[pi];
          if ((nx - qx) ** 2 + (ny - qy) ** 2 < minDist * minDist) {
            tooClose = true;
            break outer;
          }
        }
      }

      if (!tooClose) { addPoint(nx, ny); placed = true; break; }
    }

    if (!placed) active.splice(ai, 1);
  }

  return points;
}
