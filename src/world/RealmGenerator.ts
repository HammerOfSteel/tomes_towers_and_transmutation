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
 * same pattern already used by `RealmToTerrain.ts` and `RealmRiverMesh.ts`.
 */

import { mulberry32 }    from '@/core/prng';
import { createNoise2D } from '@/core/SimplexNoise';
import { chaikin }       from '@/core/chaikin';
import type {
  RealmData, RealmCell, RealmBiome, RealmRiver, RealmSettlement,
  SettlementFaction, Vec2,
} from '@/overworld-studio';

export type RealmShape   = 'island' | 'continents' | 'archipelago' | 'pangaea';
export type RealmClimate = 'tropical' | 'temperate' | 'arctic';

const NAME_PRE  = ['Alder','Bright','Cedar','Dark','Elder','Fern','Grey','Haven','Iron','Jade','Loch','Marsh','North','Oak','Pine','Stone','Thorn','White','Wood','Yew'];
const NAME_SUFF = ['bury','dale','fall','ford','gate','haven','holm','keep','mere','moor','port','reach','stead','vale','well','wood','field','cross','bridge','cliff'];

function realmName(rand: () => number): string {
  return NAME_PRE[Math.floor(rand() * NAME_PRE.length)]! + NAME_SUFF[Math.floor(rand() * NAME_SUFF.length)]!;
}

function classifyBiome(elev: number, moist: number, temp: number): RealmBiome {
  if (elev < 0.28) return 'deep_ocean';
  if (elev < 0.35) return 'ocean';
  if (elev < 0.40) return 'beach';
  if (elev > 0.85) return 'snow';
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

export function generateRealmData(seed: number, W = 96, H = 72, nSettlements = 6, shape: RealmShape = 'island', climate: RealmClimate = 'temperate', roughness: number = 0.5): RealmData {
  const rand  = mulberry32(seed);
  const rand2 = mulberry32(seed ^ 0xDEADBEEF);
  const rand3 = mulberry32(seed ^ 0xC0FFEE);
  const rand4 = mulberry32(seed ^ 0xF00DBABE);

  const noiseE = createNoise2D(seed);
  const noiseM = createNoise2D(seed ^ 0xDEADBEEF);
  const noiseT = createNoise2D(seed ^ 0xC0FFEE);
  const noiseR = createNoise2D(seed ^ 0xBADF00D);   // ridge/continent noise

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

      // Elevation: continent mask + fBm noise
      const mVal   = Math.min(1, mask(nx, ny));
      const noise  = fbmR(noiseE, nx, ny, oct, scale);
      const ridge  = Math.abs(fbmR(noiseR, nx*1.3, ny*1.3, 3, 3.0) - 0.5) * 2;
      const elev   = Math.min(1, mVal * (noise * 0.75 + ridge * 0.25 * roughness + 0.2));

      // Moisture
      const moist  = fbmR(noiseM, nx+5, ny+5, 3, 1.8);

      // Temperature: latitude + elevation + climate bias + noise jitter
      const latT   = 1 - Math.abs(ny - 0.5) * 1.5;
      const elvT   = 1 - Math.max(0, elev - 0.4) * 2.0;
      const tNoise = fbmR(noiseT, nx+10, ny+10, 2, 1.2) * 0.12;
      const temp   = Math.max(0, Math.min(1, latT*0.65 + elvT*0.35 + tNoise + climateBias));

      return { elevation: elev, moisture: moist, biome: classifyBiome(elev, moist, temp) };
    }),
  );

  // ── Rivers ───────────────────────────────────────────────────────────────────
  const rivers: RealmRiver[] = [];
  const DIRS8: [number,number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]];
  let riverCount = 0;
  const maxRivers = 4 + Math.floor(roughness * 8);

  for (let y = 2; y < H-2 && riverCount < maxRivers; y++) {
    for (let x = 2; x < W-2 && riverCount < maxRivers; x++) {
      const c = cells[y]![x]!;
      if (c.elevation > 0.68 && c.biome !== 'deep_ocean' && c.biome !== 'ocean' && c.biome !== 'snow' && rand4() > 0.965) {
        const pts: Vec2[] = [{ x: x+0.5, y: y+0.5 }];
        let [cx, cy2] = [x, y];
        const visited = new Set<string>();
        for (let step = 0; step < 220; step++) {
          const key = `${cx},${cy2}`;
          if (visited.has(key)) break;
          visited.add(key);
          const b = cells[cy2]![cx]!.biome;
          if (b === 'ocean' || b === 'deep_ocean') break;
          const curE = cells[cy2]![cx]!.elevation;
          let lowestE = curE - 0.0005, nx2 = cx, ny2 = cy2;
          for (const [dy, dx] of DIRS8) {
            const ney = cy2+dy, nex = cx+dx;
            if (ney < 0||ney >= H||nex < 0||nex >= W) continue;
            const e = cells[ney]![nex]!.elevation;
            if (e < lowestE) { lowestE = e; nx2 = nex; ny2 = ney; }
          }
          if (nx2 === cx && ny2 === cy2) break;
          cx = nx2; cy2 = ny2;
          pts.push({ x: cx+0.5, y: cy2+0.5 });
        }
        if (pts.length >= 6) { rivers.push({ points: chaikin(pts, 2) }); riverCount++; }
      }
    }
  }

  // ── Settlements ──────────────────────────────────────────────────────────────
  const VALID = new Set<RealmBiome>(['grassland','forest','savanna','taiga','desert']);
  const validCells: Vec2[] = [];
  for (let y = 4; y < H-4; y++) for (let x = 4; x < W-4; x++)
    if (VALID.has(cells[y]![x]!.biome)) validCells.push({ x, y });

  const sv = [...validCells].sort(() => rand() - 0.5);
  const settlements: RealmSettlement[] = [];
  const MIN_DIST = Math.floor(Math.min(W,H) / (nSettlements + 2));
  const FACTIONS: SettlementFaction[] = ['human','elven','dwarven','orcish','vulperia','slime','vampire','undead','fae'];

  for (const cell of sv) {
    if (settlements.length >= nSettlements) break;
    const td = Math.hypot(cell.x - W/2, cell.y - H/2);
    if (td < MIN_DIST * 0.5) continue;
    if (settlements.every(s => Math.hypot(s.x-cell.x, s.y-cell.y) >= MIN_DIST)) {
      const b = cells[cell.y]![cell.x]!.biome;
      const sz: 'village'|'town'|'city' = td > MIN_DIST*2.5 && (b==='forest'||b==='grassland') ? 'city'
                                        : td > MIN_DIST*1.2 ? 'town' : 'village';
      const faction = FACTIONS[Math.floor(rand() * FACTIONS.length)]!;
      settlements.push({ x: cell.x, y: cell.y, name: realmName(rand), size: sz, faction });
    }
  }

  // Tower at map centre (nudge to land)
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
  const DUNGEON_BIOMES = new Set<RealmBiome>(['grassland','forest','taiga','desert','savanna','tundra','snow']);
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

  return { cells, W, H, rivers, settlements, dungeons, towerX, towerY, seed };
}
