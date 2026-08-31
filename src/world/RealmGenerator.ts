/**
 * RealmGenerator.ts — pure realm-map generation, extracted from
 * `overworld-studio.ts` so the live game can call the exact same
 * generator Overworld Studio uses (P0 of the Studio<->live-game parity
 * work — see `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`).
 *
 * `RealmData`/`RealmCell`/`RealmBiome`/`RealmRiver`/`RealmSettlement`/
 * `SettlementFaction`/`Vec2` still live in `overworld-studio.ts` (the
 * Studio page, which wires up DOM elements at module scope — unsafe to
 * import at runtime from game code). This file only takes `import type
 * {...}` from it (erased at compile time, zero runtime coupling), the
 * same pattern already used by `RealmToTerrain.ts`.
 */

import { mulberry32 }    from '@/core/prng';
import { createNoise2D } from '@/core/SimplexNoise';
import { chaikin }       from '@/core/chaikin';
import { selectRiverSources, flowDownhill } from './RiverFlow';
import { selectLakeSources, floodFillBasin } from './LakeSiting';
import type {
  RealmData, RealmCell, RealmBiome, RealmRiver, RealmLake, RealmSettlement,
  SettlementFaction, Vec2,
} from '@/overworld-studio';

export type RealmShape   = 'island' | 'continents' | 'archipelago' | 'pangaea';
export type RealmClimate = 'tropical' | 'temperate' | 'arctic';

const NAME_PRE  = ['Alder','Bright','Cedar','Dark','Elder','Fern','Grey','Haven','Iron','Jade','Loch','Marsh','North','Oak','Pine','Stone','Thorn','White','Wood','Yew'];
const NAME_SUFF = ['bury','dale','fall','ford','gate','haven','holm','keep','mere','moor','port','reach','stead','vale','well','wood','field','cross','bridge','cliff'];

function realmName(rand: () => number): string {
  return NAME_PRE[Math.floor(rand() * NAME_PRE.length)]! + NAME_SUFF[Math.floor(rand() * NAME_SUFF.length)]!;
}

export function classifyBiome(elev: number, moist: number, temp: number): RealmBiome {
  if (elev < 0.28) return 'deep_ocean';
  if (elev < 0.35) return 'ocean';
  if (elev < 0.40) return 'beach';
  if (elev > 0.85) return 'snow';
  // Rocky mountain slopes below the snowcap — reads as bare rock regardless
  // of climate/moisture (real alpine zones are rugged whether temperate or
  // arctic), so this check sits ahead of the temperature/moisture branches
  // below rather than being folded into them.
  if (elev > 0.70) return 'mountain';
  if (temp < 0.15) return 'tundra';
  if (temp < 0.30) return 'taiga';
  if (moist < 0.25) return 'desert';
  if (moist < 0.45 && temp > 0.60) return 'savanna';
  if (moist < 0.50) return 'grassland';
  if (temp < 0.55) return 'taiga';
  return 'forest';
}

function fbmR(noise: (x: number, y: number) => number, x: number, y: number, oct: number, scale = 1): number {
  let v = 0, amp = 0.5, freq = scale, max = 0;
  for (let i = 0; i < oct; i++) { v += noise(x*freq, y*freq)*amp; max += amp; amp *= 0.5; freq *= 2.0; }
  return (v / max + 1) / 2;
}

/** Broad, low-frequency displacement applied to a biome-sampling coordinate
 *  before every noise lookup that feeds classifyBiome() — makes noise-
 *  contour-shaped biome borders (coastlines, treelines, climate-zone
 *  edges) read as organically wobbly instead of a perfect iso-contour.
 *  Pure function of (nx, ny, roughness) plus the caller-supplied seeded
 *  noiseW field — exported for direct unit testing (same pattern as
 *  TerrainGeometryBuilder.ts's subTileBumpJitter/_subTileGroundVariant).
 *  See docs/superpowers/specs/2026-08-31-organic-biome-transitions-design.md §3. */
export function _domainWarp(
  nx: number, ny: number, roughness: number,
  noiseW: (x: number, y: number) => number,
): { wx: number; wy: number } {
  const WARP_FREQ = 0.6; // well below the elevation noise's own scale (1.8–3.0) — broad, sweeping wobble, not speckle
  const warpAmount = 0.03 + roughness * 0.05; // 0.03–0.08, scales with the existing roughness knob
  const dx = noiseW(nx * WARP_FREQ, ny * WARP_FREQ) * warpAmount;
  // Offset sample point (not a different noise field) decorrelates dy from
  // dx using the same single noiseW field — same "+offset for decorrelation"
  // convention already used below for moisture (nx+5,ny+5) and temperature
  // (nx+10,ny+10) sampling.
  const dy = noiseW(nx * WARP_FREQ + 31.7, ny * WARP_FREQ + 47.3) * warpAmount;
  return { wx: nx + dx, wy: ny + dy };
}

const FACTIONS: SettlementFaction[] = ['human','elven','dwarven','orcish','vulperia','slime','vampire','undead','fae'];

/** Each faction's preferred settlement biomes — used by pickFaction() to bias
 *  (not hard-gate) which faction spawns at a given site. Every settlement-
 *  eligible biome has at least 2 factions with affinity, so none is
 *  "orphaned." See docs/superpowers/specs/2026-08-31-race-biome-affinity-design.md §3. */
const BIOME_AFFINITY: Record<SettlementFaction, readonly RealmBiome[]> = {
  elven:    ['forest', 'taiga'],
  dwarven:  ['mountain', 'tundra'],
  vulperia: ['grassland', 'savanna'],
  vampire:  ['forest', 'mountain'],
  undead:   ['tundra', 'mountain', 'desert'],
  fae:      ['forest', 'grassland'],
  orcish:   ['savanna', 'desert'],
  slime:    ['grassland', 'forest'],
  human:    ['grassland', 'forest'],
};

/** Weight multiplier applied to a faction whose BIOME_AFFINITY includes the
 *  candidate cell's biome, relative to every other faction's baseline
 *  weight of 1. Tunable via playtesting — not fixed in stone (see design
 *  spec §7). */
const AFFINITY_WEIGHT = 5;

/** Weighted-random faction pick for a settlement candidate cell's biome —
 *  every faction has a baseline weight of 1, boosted to AFFINITY_WEIGHT for
 *  any faction whose BIOME_AFFINITY includes this biome. A bias, not a hard
 *  rule: every faction stays reachable on every biome. Exported for direct
 *  unit testing (same pattern as this file's own _domainWarp). */
export function pickFaction(biome: RealmBiome, rand: () => number): SettlementFaction {
  const weights = FACTIONS.map(f => BIOME_AFFINITY[f].includes(biome) ? AFFINITY_WEIGHT : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < FACTIONS.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return FACTIONS[i]!;
  }
  return FACTIONS[FACTIONS.length - 1]!; // floating-point fallback, never hit in practice
}

export function generateRealmData(seed: number, W = 96, H = 72, nSettlements = 6, shape: RealmShape = 'island', climate: RealmClimate = 'temperate', roughness: number = 0.5): RealmData {
  const rand  = mulberry32(seed);
  const rand2 = mulberry32(seed ^ 0xDEADBEEF);
  const rand3 = mulberry32(seed ^ 0xC0FFEE);
  const rand4 = mulberry32(seed ^ 0xF00DBABE);

  const noiseE = createNoise2D(seed);
  const noiseM = createNoise2D(seed ^ 0xDEADBEEF);
  const noiseT = createNoise2D(seed ^ 0xC0FFEE);
  const noiseR = createNoise2D(seed ^ 0xBADF00D);   // ridge/continent noise
  const noiseW = createNoise2D(seed ^ 0xFEEDFACE);  // domain-warp field (Phase 4)

  // ── Continent mask per world shape ──────────────────────────────────────────
  type MaskFn = (nx: number, ny: number) => number;
  let mask: MaskFn;

  if (shape === 'island') {
    mask = (nx, ny) => Math.min(nx, 1-nx, ny, 1-ny) * 4.2;

  } else if (shape === 'continents') {
    const nC = 2 + Math.floor(rand() * 2);
    const C = Array.from({ length: nC }, () => ({
      cx: 0.12 + rand() * 0.76,  cy: 0.12 + rand() * 0.76,
      rx: 0.14 + rand() * 0.20,  ry: 0.10 + rand() * 0.16,
      rot: rand() * Math.PI,
    }));
    mask = (nx, ny) => {
      let v = 0;
      for (const c of C) {
        const dx = nx - c.cx, dy = ny - c.cy;
        const rx = dx * Math.cos(c.rot) + dy * Math.sin(c.rot);
        const ry = -dx * Math.sin(c.rot) + dy * Math.cos(c.rot);
        const d  = Math.sqrt((rx/c.rx)**2 + (ry/c.ry)**2);
        v = Math.max(v, Math.max(0, 1.1 - d));
      }
      return v;
    };

  } else if (shape === 'archipelago') {
    const nI = 12 + Math.floor(rand() * 10);
    const islands = Array.from({ length: nI }, () => ({
      cx: 0.04 + rand() * 0.92,  cy: 0.04 + rand() * 0.92,
      r:  0.025 + rand() * 0.06,
    }));
    mask = (nx, ny) => {
      let v = 0;
      for (const isl of islands) {
        const d = Math.hypot((nx-isl.cx)/isl.r, (ny-isl.cy)/isl.r);
        v = Math.max(v, Math.max(0, 1 - d));
      }
      return v;
    };

  } else {
    // Pangaea: one huge central landmass
    mask = (nx, ny) => {
      const dx = nx - 0.5, dy = ny - 0.5;
      const jitter = Math.sin(nx * 8) * 0.06 + Math.cos(ny * 7) * 0.05;
      return Math.max(0, 1 - Math.sqrt(dx*dx*1.5 + dy*dy*1.2) * 1.3 + jitter);
    };
  }

  // ── Terrain roughness → noise params ────────────────────────────────────────
  const oct   = 4 + Math.round(roughness * 2);   // 4-6 octaves
  const scale = 1.8 + roughness * 1.2;            // 1.8-3.0

  // ── Climate → temperature offset ─────────────────────────────────────────────
  const climateBias = climate === 'tropical' ? 0.30 : climate === 'arctic' ? -0.30 : 0;

  // ── Build cell grid ──────────────────────────────────────────────────────────
  const cells: RealmCell[][] = Array.from({ length: H }, (_, cy) =>
    Array.from({ length: W }, (_, cx) => {
      const nx = cx / W, ny = cy / H;
      const { wx, wy } = _domainWarp(nx, ny, roughness, noiseW);

      // Elevation: continent mask + fBm noise — sampled at the warped
      // coordinate so coastlines/mountain edges read as organically
      // wobbly instead of a perfect noise-contour (Phase 4). mVal is
      // explicitly clamped to >= 0 (not just <= 1 as before): unwarped
      // nx/ny were always in [0,1) by construction, so the 'island'
      // shape's mask (Math.min(nx, 1-nx, ny, 1-ny) * 4.2) could never go
      // negative — but a warped (wx, wy) can land slightly outside [0,1]
      // near map edges, and Math.min there directly returns that negative
      // value, which would otherwise propagate into a slightly negative
      // elevation.
      const mVal   = Math.max(0, Math.min(1, mask(wx, wy)));
      const noise  = fbmR(noiseE, wx, wy, oct, scale);
      const ridge  = Math.abs(fbmR(noiseR, wx*1.3, wy*1.3, 3, 3.0) - 0.5) * 2;
      const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

      // Moisture — also sampled at the warped coordinate.
      const moist  = fbmR(noiseM, wx+5, wy+5, 3, 1.8);

      // Temperature: latitude keeps the TRUE (unwarped) ny — it
      // represents the cell's real map position for climate banding, not
      // a noise-sample target, so warping it would be physically
      // meaningless. elvT is derived from the already-warped elev, so it
      // inherits the organic wobble; tNoise is sampled at the warped coordinate.
      const latT   = 1 - Math.abs(ny - 0.5) * 1.5;
      const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0;
      const tNoise = fbmR(noiseT, wx+10, wy+10, 2, 1.2) * 0.12;
      const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

      return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
    }),
  );

  // ── Rivers (Phase 3: same algorithm as the live game's HydrologyGenerator,
  // via the shared RiverFlow.ts module — see
  // docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md §2) ──
  const claimedRiver = new Set<string>();
  // A tile this walk must never step onto: already-claimed river tiles, or
  // open water (ocean/deep_ocean) — RealmCell has no discrete elevation-0
  // "bog level" the way WorldGrid does (elevation here is a continuous
  // 0-1 float, essentially never exactly 0), so an explicit ocean-biome
  // check is this preview's real river-termination condition.
  const isBlocked = (col: number, row: number): boolean => {
    if (claimedRiver.has(`${col},${row}`)) return true;
    const b = cells[row]![col]!.biome;
    return b === 'ocean' || b === 'deep_ocean';
  };
  const realElevationAt = (col: number, row: number) => cells[row]![col]!.elevation;
  // Snow-capped peaks never source a river (matches the old inline block's
  // `c.biome !== 'snow'` source exclusion) — kept separate from
  // realElevationAt so this only affects source *selection*, not the
  // downhill walk's own neighbour scoring.
  const sourceElevationAt = (col: number, row: number) => {
    const c = cells[row]![col]!;
    return c.biome === 'snow' ? -1 : c.elevation;
  };

  const riverSources = selectRiverSources(
    W, H, sourceElevationAt,
    0.68, // sourceMinLevel — matches the old inline block's elevation threshold
    0,    // sourceMinRadius — Studio's realm shapes (island/continents/archipelago/
          // pangaea) don't guarantee a high-elevation outer rim the way the live
          // game's post-processed bowl terrain does, so no radius filter here
    Math.min(W, H) * 0.10, // sourceMinSpacing
    4 + Math.floor(roughness * 8), // count — matches the old maxRivers heuristic
    rand4,
  );

  const rivers: RealmRiver[] = [];
  for (const source of riverSources) {
    const path = flowDownhill(source, W, H, realElevationAt, isBlocked, 0);
    if (path.length < 6) continue; // matches the old ">= 6 points" quality gate
    for (const p of path) claimedRiver.add(`${p.col},${p.row}`);
    const pts: Vec2[] = path.map(p => ({ x: p.col + 0.5, y: p.row + 0.5 }));
    rivers.push({ points: chaikin(pts, 2) });
  }

  // ── Lakes (Phase 3: independent local-minima siting, see design spec §3) ──
  const lakeSources = selectLakeSources(
    W, H, realElevationAt, isBlocked, Math.min(W, H) * 0.10, 2, rand4,
  );
  const lakes: RealmLake[] = [];
  const claimedLake = new Set<string>();
  for (const source of lakeSources) {
    if (claimedLake.has(`${source.col},${source.row}`)) continue;
    const basin = floodFillBasin(
      source, W, H, realElevationAt,
      (c, r) => isBlocked(c, r) || claimedLake.has(`${c},${r}`),
      40,
    );
    for (const p of basin) claimedLake.add(`${p.col},${p.row}`);
    lakes.push({ cells: basin.map(p => ({ x: p.col + 0.5, y: p.row + 0.5 })) });
  }

  // ── Settlements ──────────────────────────────────────────────────────────────
  const VALID = new Set<RealmBiome>(['grassland','forest','savanna','taiga','desert','tundra','mountain']);
  const validCells: Vec2[] = [];
  for (let y = 4; y < H-4; y++) for (let x = 4; x < W-4; x++)
    if (VALID.has(cells[y]![x]!.biome)) validCells.push({ x, y });

  const sv = [...validCells].sort(() => rand() - 0.5);
  const settlements: RealmSettlement[] = [];
  const MIN_DIST = Math.floor(Math.min(W,H) / (nSettlements + 2));

  for (const cell of sv) {
    if (settlements.length >= nSettlements) break;
    const td = Math.hypot(cell.x - W/2, cell.y - H/2);
    if (td < MIN_DIST * 0.5) continue;
    if (settlements.every(s => Math.hypot(s.x-cell.x, s.y-cell.y) >= MIN_DIST)) {
      const b = cells[cell.y]![cell.x]!.biome;
      const sz: 'village'|'town'|'city' = td > MIN_DIST*2.5 && (b==='forest'||b==='grassland') ? 'city'
                                        : td > MIN_DIST*1.2 ? 'town' : 'village';
      // Biased (not hard-gated) by the cell's biome — Phase 5, see
      // docs/superpowers/specs/2026-08-31-race-biome-affinity-design.md.
      const faction = pickFaction(b, rand);
      settlements.push({ x: cell.x, y: cell.y, name: realmName(rand), size: sz, faction });
    }
  }

  // Tower at map centre (nudge to land)
  const DIRS8: [number,number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
  let [towerX, towerY] = [Math.floor(W/2), Math.floor(H/2)];
  for (let r = 0; r < 14; r++) {
    const b = cells[towerY]![towerX]!.biome;
    if (b !== 'ocean' && b !== 'deep_ocean') break;
    for (const [dy, dx] of DIRS8) {
      const ty = towerY+dy*Math.ceil(r/2), tx = towerX+dx*Math.ceil(r/2);
      if (ty >= 0&&ty < H&&tx >= 0&&tx < W) {
        const tb = cells[ty]![tx]!.biome;
        if (tb !== 'ocean' && tb !== 'deep_ocean') { towerX = tx; towerY = ty; break; }
      }
    }
  }

  // ── Dungeons ─────────────────────────────────────────────────────────────────
  const DUNGEON_BIOMES = new Set<RealmBiome>(['grassland','forest','taiga','desert','savanna','tundra','snow','mountain']);
  const nDungeons = 3 + Math.floor(rand() * 4);
  const dungeons: { x: number; y: number }[] = [];
  const dungeonCands = [...validCells].filter(c =>
    DUNGEON_BIOMES.has(cells[c.y]![c.x]!.biome) &&
    Math.hypot(c.x - towerX, c.y - towerY) > MIN_DIST,
  ).sort(() => rand3() - 0.5);
  for (const cell of dungeonCands) {
    if (dungeons.length >= nDungeons) break;
    const farFromSettlements = settlements.every(s => Math.hypot(s.x - cell.x, s.y - cell.y) > MIN_DIST * 0.6);
    const farFromOtherDungeons = dungeons.every(d => Math.hypot(d.x - cell.x, d.y - cell.y) > MIN_DIST * 0.5);
    if (farFromSettlements && farFromOtherDungeons) dungeons.push({ x: cell.x, y: cell.y });
  }

  return { cells, W, H, rivers, lakes, settlements, dungeons, towerX, towerY, seed };
}
