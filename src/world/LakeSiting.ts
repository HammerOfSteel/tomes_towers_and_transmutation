/**
 * LakeSiting — pure local-minima source selection + flood-fill basin
 * algorithm for lakes. See
 * docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §3.
 */

export interface LakeSite { col: number; row: number; }

/**
 * Flood-fill the connected same-elevation region starting at `source` — a
 * simple BFS over the 4 orthogonal neighbours, stopping at a different
 * elevation, a blocked tile, out-of-bounds, or the `maxSize` tile budget.
 */
export function floodFillBasin(
  source: LakeSite,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,
  maxSize: number,
): LakeSite[] {
  const level = elevationAt(source.col, source.row);
  const visited = new Set<number>([source.row * width + source.col]);
  const basin: LakeSite[] = [source];
  const queue: LakeSite[] = [source];
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

  while (queue.length > 0 && basin.length < maxSize) {
    const { col, row } = queue.shift()!;
    for (const [dc, dr] of DIRS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
      const key = nr * width + nc;
      if (visited.has(key)) continue;
      visited.add(key);
      if (isBlocked(nc, nr)) continue;
      if (elevationAt(nc, nr) !== level) continue;
      basin.push({ col: nc, row: nr });
      queue.push({ col: nc, row: nr });
      if (basin.length >= maxSize) break;
    }
  }

  return basin;
}

/**
 * Pick well-spaced lake source tiles from the set of local-minima
 * candidates (every one of a tile's up-to-8 neighbours has elevation >=
 * its own, and the tile itself is not already blocked).
 */
export function selectLakeSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isBlocked: (col: number, row: number) => boolean,
  minSpacing: number,
  count: number,
  rand: () => number,
): LakeSite[] {
  const DIRS8 = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ] as const;

  const candidates: LakeSite[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isBlocked(col, row)) continue;
      const level = elevationAt(col, row);
      let isMinimum = true;
      for (const [dc, dr] of DIRS8) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
        if (elevationAt(nc, nr) < level) { isMinimum = false; break; }
      }
      if (isMinimum) candidates.push({ col, row });
    }
  }

  if (candidates.length === 0) return [];

  // Fisher-Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const chosen: LakeSite[] = [];
  for (const s of candidates) {
    if (chosen.length >= count) break;
    const tooClose = chosen.some(c => Math.hypot(c.col - s.col, c.row - s.row) < minSpacing);
    if (!tooClose) chosen.push(s);
  }

  return chosen;
}
