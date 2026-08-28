/**
 * SettlementPlacer — sites settlements using positions from the same realm
 * generator Overworld Studio uses (P1 sub-project 1: settlement siting
 * unification — see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md
 * and docs/superpowers/specs/2026-07-30-settlement-siting-unification-design.md).
 *
 * Placement strategy:
 *   1. Call generateRealmData(seed, 96, 72, config.settlementCount) to get
 *      realm.settlements — the same positions/names/types/factions Studio's
 *      realm-map preview shows for this seed.
 *   2. Map each realm settlement's (x, y) onto this WorldGrid's (col, row)
 *      using the grid's scale factor relative to the realm's 96x72 shape.
 *   3. If the mapped tile is invalid (water/wrong elevation/tower flat
 *      zone/rim/occupied), search outward in expanding 8-direction rings
 *      for the nearest valid tile (snap) — same nudge pattern
 *      RealmGenerator.ts uses for its own tower-placement search.
 *   4. Enforce minimum tile-distance between settlements, processed in
 *      city -> town -> village priority order. Drop a settlement if no
 *      valid, sufficiently-spaced tile can be found.
 *   5. Call planSettlement() + applySettlementToGrid() for each, passing
 *      the realm's name/faction through so live and Studio agree on both.
 */

import type { WorldGrid }      from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import { planSettlement, applySettlementToGrid } from './SettlementGenerator';
import type { SettlementPlan, SettlementType }   from './SettlementGenerator';
import { generateRealmData }   from './RealmGenerator';

// Minimum tile-distance between any two settlement centers.
const MIN_DIST_CITY    = 35;
const MIN_DIST_TOWN    = 22;
const MIN_DIST_VILLAGE = 14;

const MIN_DIST_BY_TYPE: Record<SettlementType, number> = {
  city:    MIN_DIST_CITY,
  town:    MIN_DIST_TOWN,
  village: MIN_DIST_VILLAGE,
};

// Placement/min-distance check priority: city first, then town, then village.
const PRIORITY_BY_TYPE: Record<SettlementType, number> = { city: 0, town: 1, village: 2 };

// 8-directional nudge offsets — same pattern RealmGenerator.ts uses for its
// own tower-placement search.
const DIRS8: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];

// Bounded number of times to retry snapping after excluding a too-close
// candidate tile, before giving up and dropping the settlement.
const MAX_SNAP_RETRIES = 8;

export interface SettlementEntry {
  id:   number;
  seed: number;
  plan: SettlementPlan;
}

export function placeSettlements(
  grid:   WorldGrid,
  config: WorldGenConfig,
  seed:   number,
): SettlementEntry[] {
  const GW  = grid.width;
  const GH  = grid.height;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);

  // Habitable annulus: outside 2xFR (tower area) and inside 0.82xGHW (before rim).
  const innerR = FR * 2.0;
  const outerR = GHW * 0.82;

  // Bounded ring-search radius: enough to cross the whole grid in the worst case.
  const maxSnapRadius = Math.ceil(Math.max(GHW, GHH));

  const realm = generateRealmData(seed, 96, 72, config.settlementCount);

  function realmToGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x * GW) / realm.W),
      row: Math.floor((y * GH) / realm.H),
    };
  }

  function isValidTile(col: number, row: number, occupied: Set<string>): boolean {
    if (col < 2 || col >= GW - 2 || row < 2 || row >= GH - 2) return false;
    if (occupied.has(`${col},${row}`)) return false;

    const dc = col - GHW, dr = row - GHH;
    const tR = Math.sqrt(dc * dc + dr * dr);
    if (tR < innerR || tR > outerR) return false;

    const cell = grid.get(col, row);
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
    if (cell.feature === 'river')                  return false;
    if (cell.elevation < 1 || cell.elevation > 2)  return false;
    if (cell.content !== 'empty')                  return false;
    return true;
  }

  function snapToValidTile(col: number, row: number, occupied: Set<string>): { col: number; row: number } | null {
    if (isValidTile(col, row, occupied)) return { col, row };
    for (let r = 1; r <= maxSnapRadius; r++) {
      for (const [dr, dc] of DIRS8) {
        const nc = col + dc * r;
        const nr = row + dr * r;
        if (isValidTile(nc, nr, occupied)) return { col: nc, row: nr };
      }
    }
    return null;
  }

  function tooCloseToPlaced(
    col: number, row: number, minDist: number,
    placements: Array<{ col: number; row: number }>,
  ): boolean {
    for (const p of placements) {
      const dc = col - p.col, dr = row - p.row;
      if (Math.sqrt(dc * dc + dr * dr) < minDist) return true;
    }
    return false;
  }

  const ordered = [...realm.settlements].sort(
    (a, b) => PRIORITY_BY_TYPE[a.size] - PRIORITY_BY_TYPE[b.size],
  );

  const placements: Array<{ col: number; row: number }> = [];
  const entries: SettlementEntry[] = [];
  const occupied = new Set<string>();

  for (const s of ordered) {
    const raw     = realmToGrid(s.x, s.y);
    const minDist = MIN_DIST_BY_TYPE[s.size];

    let candidate = snapToValidTile(raw.col, raw.row, occupied);
    // If the nearest valid tile is too close to an already-placed
    // settlement, exclude it and search again, up to a bounded retry count.
    for (
      let attempt = 0;
      attempt < MAX_SNAP_RETRIES && candidate && tooCloseToPlaced(candidate.col, candidate.row, minDist, placements);
      attempt++
    ) {
      occupied.add(`${candidate.col},${candidate.row}`);
      candidate = snapToValidTile(raw.col, raw.row, occupied);
    }
    if (!candidate || tooCloseToPlaced(candidate.col, candidate.row, minDist, placements)) {
      continue; // drop — no valid, sufficiently-spaced tile found
    }

    const id    = entries.length + 1;
    const eSeed = (seed ^ (id * 0x9E37_79B9)) >>> 0;
    const plan  = planSettlement(s.size, candidate.col, candidate.row, eSeed, grid, s.name, s.faction);
    applySettlementToGrid(plan, grid, id);

    placements.push({ col: candidate.col, row: candidate.row });
    occupied.add(`${candidate.col},${candidate.row}`);
    entries.push({ id, seed: eSeed, plan });
  }

  return entries;
}
