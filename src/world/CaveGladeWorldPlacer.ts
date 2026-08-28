/**
 * CaveGladeWorldPlacer — scatters cave and glade entrances across the live
 * WorldGrid (02-game-world-integration, CG-3 renderer wiring).
 *
 * Mirrors `DungeonPlacer.ts`'s placement algorithm (Poisson-disk candidate
 * points, world-unit spacing, tower clear-zone, grid-cell marking) rather
 * than reusing the Studio-facing `CaveGladePlacer.ts` (RealmData-shaped
 * pure module) directly — the two operate on different grids:
 *   - `CaveGladePlacer.ts` works on `RealmTerrainInput`/`RealmBiome` (the
 *     Overworld Studio's realm-map preview data, which has no
 *     mountain/bog biome, hence its elevation-threshold deviation).
 *   - This module works on the live `WorldGrid`/`BiomeId`, which *does*
 *     have `bog`/`highland`/`rocky` biomes already — so cave placement
 *     here matches the original TODO spec exactly, no deviation needed.
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

/** Cave-eligible: elevation 0 (was "bog") or elevation 3-4 (was
 *  "highland/rocky") — the elevation bands the old biome names
 *  approximated. Elevation is unchanged by the biome-taxonomy rebuild
 *  (docs/superpowers/specs/2026-08-28-overworld-foundation-rebuild-design.md),
 *  so this stays a correct, low-risk substitution rather than an invented
 *  biome-name mapping. */
function isCaveEligible(cell: { elevation: number; feature: string; content: string }): boolean {
  return (cell.elevation === 0 || cell.elevation >= 3)
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
