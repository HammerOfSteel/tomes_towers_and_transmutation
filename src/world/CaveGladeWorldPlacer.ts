/**
 * CaveGladeWorldPlacer — scatters cave and glade entrances across the live
 * WorldGrid (02-game-world-integration, CG-3 renderer wiring).
 *
 * Mirrors `DungeonPlacer.ts`'s placement algorithm (Poisson-disk candidate
 * points, world-unit spacing, tower clear-zone, grid-cell marking) rather
 * than reusing the Studio-facing `CaveGladePlacer.ts` (RealmData-shaped
 * pure module) directly — the two operate on different grids, though both
 * now share the same 10(+`mountain`)-value biome taxonomy (unified as of
 * the P0 realm/terrain rebuild and Phase 1 of the biome/terrain overhaul,
 * which added a real `mountain` BiomeId to both `RealmBiome` and
 * `WorldGrid.BiomeId`) — cave eligibility here checks `biome === 'mountain'`
 * directly rather than the old elevation-band proxy this module used before
 * `mountain` existed.
 *
 * Both modules share the same `CaveEntranceBiome` taxonomy (crystal/lava/
 * ice/fungal/ancient, from `CaveGladePlacer.ts`) so `CaveEntranceBuilder.ts`
 * works unmodified against either placement pass.
 */

import { mulberry32 }  from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import type { WorldGenConfig }           from './WorldGenConfig';
import type { WorldGrid }                from './WorldGrid';
import type { CaveEntry, GladeEntry }    from './WorldData';
import { CAVE_ENTRANCE_BIOMES }          from './CaveGladePlacer';

const T          = 2;    // world-units per tile (matches OverworldScene/DungeonPlacer)
const SPACING_WU = 24;   // minimum world-unit distance between cave/glade entrances
const FLAT_MULT  = 2.0;  // clear-zone around tower: FR × FLAT_MULT tiles

/** Cave-eligible: elevation 0 ("bog" — no real bog biome exists yet in the
 *  live taxonomy, so this stays an elevation-band substitute) OR the real
 *  `mountain` biome (Phase 1 of the biome/terrain overhaul added a genuine
 *  `mountain` BiomeId — this replaces the old `elevation >= 3` proxy for
 *  "highland/rocky", which is a strictly more accurate rocky-terrain check
 *  now that the biome itself exists, e.g. it no longer misfires on a
 *  merely-elevated non-rocky tile). */
function isCaveEligible(cell: { elevation: number; biome: string; feature: string; content: string }): boolean {
  return (cell.elevation === 0 || cell.biome === 'mountain')
    && cell.feature === 'none' && cell.content === 'empty';
}

/** Glade-eligible: forest biome, unchanged — 'forest' still exists in the
 *  widened taxonomy under the same name. */
function isGladeEligible(cell: { biome: string; feature: string; content: string }): boolean {
  return cell.biome === 'forest' && cell.feature === 'none' && cell.content === 'empty';
}

export interface CaveGladeWorldPlacement {
  caves:  CaveEntry[];
  glades: GladeEntry[];
}

/**
 * Places `config.caveCount` cave entrances (bog/highland/rocky tiles) and
 * `config.gladeCount` glade entrances (forest tiles), avoiding the tower
 * clear-zone and anything already occupying a tile (dungeons, settlements,
 * buildings, other cave/glade entrances). Marks placed tiles with
 * `content: 'cave_entrance' | 'glade_entrance'` so later passes (and each
 * other) steer clear of them, exactly like `DungeonPlacer`/`SettlementPlacer`.
 */
export function placeCavesAndGlades(
  grid:   WorldGrid,
  config: WorldGenConfig,
  seed:   number,
): CaveGladeWorldPlacement {
  const rand   = mulberry32(seed ^ 0xCA_5E_6C_AD);
  const GW     = grid.width;
  const GH     = grid.height;
  const GHW    = (GW - 1) / 2;
  const GHH    = (GH - 1) / 2;
  const FR     = Math.round(GHW * 0.28);
  const clearR = FR * FLAT_MULT;

  const W = GW * T;
  const H = GH * T;

  const pts = poissonDisk(W, H, SPACING_WU, rand);

  const caves:  CaveEntry[]  = [];
  const glades: GladeEntry[] = [];

  for (const [px, pz] of pts) {
    if (caves.length >= config.caveCount && glades.length >= config.gladeCount) break;

    const wx  = px - W / 2;
    const wz  = pz - H / 2;
    const col = Math.floor(wx / T + GHW);
    const row = Math.floor(wz / T + GHH);

    if (col < 1 || col >= GW - 1 || row < 1 || row >= GH - 1) continue;

    const dc = col - GHW, dr = row - GHH;
    const tR = Math.sqrt(dc * dc + dr * dr);
    if (tR < clearR) continue;

    const cell = grid.get(col, row);

    if (caves.length < config.caveCount && isCaveEligible(cell)) {
      const id        = caves.length + 1;
      const entrySeed = (seed ^ Math.imul(col + 1, 2654435761) ^ Math.imul(row + 1, 40503)) >>> 0;
      const biome     = CAVE_ENTRANCE_BIOMES[Math.floor(rand() * CAVE_ENTRANCE_BIOMES.length)]!;
      caves.push({ id, seed: entrySeed, biome, col, row, discovered: false });
      grid.set(col, row, { content: 'cave_entrance' });
      continue;
    }

    if (glades.length < config.gladeCount && isGladeEligible(cell)) {
      const id        = glades.length + 1;
      const entrySeed = (seed ^ Math.imul(col + 1, 2246822519) ^ Math.imul(row + 1, 3266489917)) >>> 0;
      glades.push({ id, seed: entrySeed, col, row, discovered: false });
      grid.set(col, row, { content: 'glade_entrance' });
    }
  }

  return { caves, glades };
}
