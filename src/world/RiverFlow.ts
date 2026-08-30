/**
 * RiverFlow — pure, grid-shape-agnostic river source-selection and
 * downhill-walk algorithm, shared by `HydrologyGenerator.ts` (live,
 * wraps WorldGrid) and `RealmGenerator.ts` (Studio preview, wraps
 * RealmData.cells). See
 * docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §2.
 */

export interface RiverFlowSource { col: number; row: number; }

const DEFAULT_MAX_STEPS = 512;

/**
 * Pick well-spaced river source tiles from the set of candidates meeting
 * a minimum elevation and minimum distance from grid center.
 */
export function selectRiverSources(
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  sourceMinLevel: number,
  sourceMinRadius: number,
  sourceMinSpacing: number,
  count: number,
  rand: () => number,
): RiverFlowSource[] {
  const GHW = (width - 1) / 2;
  const GHH = (height - 1) / 2;

  const candidates: RiverFlowSource[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const dc = col - GHW, dr = row - GHH;
      const tR = Math.sqrt(dc * dc + dr * dr);
      if (tR >= sourceMinRadius && elevationAt(col, row) >= sourceMinLevel) {
        candidates.push({ col, row });
      }
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

  const chosen: RiverFlowSource[] = [];
  for (const s of candidates) {
    if (chosen.length >= count) break;
    const tooClose = chosen.some(c => Math.hypot(c.col - s.col, c.row - s.row) < sourceMinSpacing);
    if (!tooClose) chosen.push(s);
  }

  return chosen;
}

/**
 * Walk a single river downhill from `source`, preferring the lowest
 * `elevation*100 + distToCenter*0.5`-scored orthogonal neighbor at each
 * step. Terminates once within `terminateRadius` of grid center, once the
 * current tile's elevation hits 0, once no unvisited/non-river neighbor
 * remains, or after `maxSteps` (safety cap).
 */
export function flowDownhill(
  source: RiverFlowSource,
  width: number, height: number,
  elevationAt: (col: number, row: number) => number,
  isRiver: (col: number, row: number) => boolean,
  terminateRadius: number,
  maxSteps: number = DEFAULT_MAX_STEPS,
): RiverFlowSource[] {
  const GHW = (width - 1) / 2;
  const GHH = (height - 1) / 2;
  const visited = new Set<number>();
  const path: RiverFlowSource[] = [source];
  visited.add(source.row * width + source.col);

  let current = source;

  for (let step = 0; step < maxSteps; step++) {
    const { col, row } = current;
    const dc = col - GHW, dr = row - GHH;
    const tR = Math.sqrt(dc * dc + dr * dr);

    // Terminate at flat zone boundary
    if (tR < terminateRadius) break;

    // Terminate if already at bog level
    if (elevationAt(col, row) === 0) break;

    // Gather valid unvisited orthogonal neighbours
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
    const neighbours: { col: number; row: number; score: number }[] = [];

    for (const [dc2, dr2] of DIRS) {
      const nc = col + dc2;
      const nr = row + dr2;
      if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
      if (visited.has(nr * width + nc)) continue;
      if (isRiver(nc, nr)) continue; // don't cross another river

      // Score: prefer low elevation, break ties by proximity to centre
      const distToCenter = Math.sqrt((nc - GHW) ** 2 + (nr - GHH) ** 2);
      neighbours.push({
        col: nc, row: nr,
        score: elevationAt(nc, nr) * 100 + distToCenter * 0.5,
      });
    }

    if (neighbours.length === 0) break;

    // Pick the best-scoring neighbour (lowest score = most downhill + most central)
    neighbours.sort((a, b) => a.score - b.score);
    const next = neighbours[0]!;

    path.push({ col: next.col, row: next.row });
    visited.add(next.row * width + next.col);
    current = next;
  }

  return path;
}
