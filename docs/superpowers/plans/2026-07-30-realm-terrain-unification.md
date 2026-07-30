# Realm/Terrain Unification (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live game's overworld terrain (elevation + biome layout) generated from the same `generateRealmData()` realm algorithm Overworld Studio uses, instead of `buildWorldGrid()`'s independent FBM-noise algorithm — so the same seed produces recognizably the same land/water/mountain layout in both places.

**Architecture:** Extract `generateRealmData()` (currently DOM-coupled inside `overworld-studio.ts`) into a new pure module `src/world/RealmGenerator.ts`. Add a new pure converter `src/world/RealmToWorldGrid.ts` that resamples a `RealmData` onto a `WorldGrid` (nearest-neighbor, with a biome-mapping table and elevation quantization). Swap `buildWorldGrid()`'s internals to call these two pieces instead of running raw FBM noise, keeping its existing tower flat-zone/rim-bias post-processing and external signature unchanged so every downstream caller (`buildWorldData`, `main.ts`, `BlueprintLayer.ts`, `DungeonPlacer`, `SettlementPlacer`, `CaveGladeWorldPlacer`, `HydrologyGenerator`) needs zero changes.

**Tech Stack:** TypeScript, Vitest for unit tests, existing `mulberry32` PRNG (`@/core/prng`), existing Simplex noise (`@/core/SimplexNoise`).

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-07-30-realm-terrain-unification-design.md` — read it before starting if anything here is ambiguous.
- Scope is elevation + biome terrain layout ONLY. Do not touch river generation (`HydrologyGenerator.ts` stays as-is), settlement/dungeon/cave placement algorithms (`SettlementPlacer.ts`, `DungeonPlacer.ts`, `CaveGladeWorldPlacer.ts` stay as-is), or attempt full 10-value biome taxonomy fidelity.
- `buildWorldGrid(seed, config)`'s external signature and `WorldGrid` return type must not change — every downstream caller depends on this staying stable.
- `@/core/prng`'s `mulberry32` is verified byte-for-byte identical in output to the local `mulberry32` currently defined inside `overworld-studio.ts` (both are the standard mulberry32 algorithm; the local version's extra leading `s |= 0` is a no-op given how `s` is reassigned each call) — reuse it, do not duplicate.
- Run `npx vitest run` and `npx tsc --noEmit` after each task; do not proceed to the next task if either shows new failures/errors beyond the pre-existing baseline. Check the current baseline with a clean-tree run before Task 1 if unsure.

---

### Task 1: Extract `chaikin` into a shared pure module

`generateRealmData()` (being extracted in Task 2) uses a local `chaikin()` corner-cutting helper that's also used elsewhere in `overworld-studio.ts` (settlement road smoothing). Extract it first so Task 2 can import it cleanly from both places without duplication.

**Files:**
- Create: `src/core/chaikin.ts`
- Modify: `src/overworld-studio.ts:1-45` (add import), `src/overworld-studio.ts:257-272` (remove local `chaikin` function, keep local `lerp` — it's still used elsewhere at line 431)
- Test: `tests/core/chaikin.test.ts`

**Interfaces:**
- Produces: `chaikin(pts: {x:number,y:number}[], passes?: number): {x:number,y:number}[]` — exported from `src/core/chaikin.ts`, used by both `overworld-studio.ts` and (in Task 2) `src/world/RealmGenerator.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/core/chaikin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { chaikin } from '@/core/chaikin';

describe('chaikin', () => {
  it('returns the same start and end points after smoothing', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const out = chaikin(pts, 3);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('produces more points with each pass (corner cutting subdivides)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const onePass = chaikin(pts, 1);
    const twoPass = chaikin(pts, 2);
    expect(onePass.length).toBeGreaterThan(pts.length);
    expect(twoPass.length).toBeGreaterThan(onePass.length);
  });

  it('is deterministic for the same input', () => {
    const pts = [{ x: 1, y: 2 }, { x: 5, y: 8 }, { x: 9, y: 3 }, { x: 2, y: 7 }];
    expect(chaikin(pts, 3)).toEqual(chaikin(pts, 3));
  });

  it('defaults to 3 passes when passes is omitted', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(chaikin(pts)).toEqual(chaikin(pts, 3));
  });

  it('handles a 2-point input without throwing', () => {
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 4 }];
    expect(() => chaikin(pts, 2)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/chaikin.test.ts`
Expected: FAIL — `Cannot find module '@/core/chaikin'` (module doesn't exist yet).

- [ ] **Step 3: Create `src/core/chaikin.ts`**

```typescript
/**
 * chaikin.ts — Chaikin corner-cutting curve smoothing.
 *
 * Extracted from `overworld-studio.ts` (used there for settlement road
 * smoothing) so `src/world/RealmGenerator.ts` can share the identical
 * implementation for river-path smoothing without duplicating it.
 */

export interface Point2 { x: number; y: number; }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Chaikin corner-cutting — each pass replaces every edge with two points
 *  at the 25%/75% marks, rounding corners. 3 passes gives smooth curves. */
export function chaikin(pts: Point2[], passes = 3): Point2[] {
  let p = pts;
  for (let pass = 0; pass < passes; pass++) {
    const out: Point2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      out.push({ x: lerp(a.x, b.x, 0.25), y: lerp(a.y, b.y, 0.25) });
      out.push({ x: lerp(a.x, b.x, 0.75), y: lerp(a.y, b.y, 0.75) });
    }
    out.push(p[p.length - 1]!);
    p = out;
  }
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/chaikin.test.ts`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Update `overworld-studio.ts` to use the shared module**

In `src/overworld-studio.ts`, find the import block near the top (around line 25, after `import { createNoise2D } from '@/core/SimplexNoise';`) and add:

```typescript
import { chaikin } from '@/core/chaikin';
```

Then find and remove the local `chaikin` function definition (currently at approximately lines 259-272):

```typescript
/** Chaikin corner-cutting — 3 passes gives smooth road curves */
function chaikin(pts: Vec2[], passes = 3): Vec2[] {
  let p = pts;
  for (let pass = 0; pass < passes; pass++) {
    const out: Vec2[] = [p[0]!];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i]!, b = p[i + 1]!;
      out.push({ x: lerp(a.x, b.x, 0.25), y: lerp(a.y, b.y, 0.25) });
      out.push({ x: lerp(a.x, b.x, 0.75), y: lerp(a.y, b.y, 0.75) });
    }
    out.push(p[p.length - 1]!);
    p = out;
  }
  return p;
}
```

Delete that whole block. Keep the `lerp` function above it (still used elsewhere in the file at line ~431) and the `dist`/`centroid` functions untouched.

- [ ] **Step 6: Verify no regressions**

Run: `npx tsc --noEmit` — expect the same error count as the pre-existing baseline (no new errors; `chaikin`'s call sites in `overworld-studio.ts` are unchanged in signature, `Vec2` and `Point2` are structurally identical `{x:number,y:number}` shapes so TypeScript's structural typing accepts the import without changes at call sites).
Run: `npx vitest run` — expect the same pass count as the pre-existing baseline plus the 5 new chaikin tests.

- [ ] **Step 7: Commit**

```bash
git add src/core/chaikin.ts tests/core/chaikin.test.ts src/overworld-studio.ts
git commit -m "refactor: extract chaikin corner-cutting into src/core/chaikin.ts"
```

---

### Task 2: Extract `generateRealmData()` into a pure `RealmGenerator.ts` module

**Files:**
- Create: `src/world/RealmGenerator.ts`
- Modify: `src/overworld-studio.ts` (remove the moved code, add imports)
- Test: `tests/world/RealmGenerator.test.ts`

**Interfaces:**
- Consumes: `chaikin(pts, passes?)` from Task 1's `src/core/chaikin.ts`; `mulberry32(seed)` from `@/core/prng`; `createNoise2D(seed)` from `@/core/SimplexNoise`; types `RealmData, RealmCell, RealmBiome, RealmRiver, RealmSettlement, SettlementFaction, Vec2` (all already exported from `src/overworld-studio.ts`, imported here via `import type` only — zero runtime coupling, same pattern already used by `src/world/RealmToTerrain.ts`).
- Produces: `generateRealmData(seed, W?, H?, nSettlements?, shape?, climate?, roughness?): RealmData`, and the exported types `RealmShape`, `RealmClimate` — both consumed by Task 3 (`RealmToWorldGrid.ts` doesn't need these types directly, but Task 4's `WorldGenerator.ts` calls `generateRealmData`) and re-exported from `overworld-studio.ts` for its own UI code to keep using.

- [ ] **Step 1: Write the failing test**

Create `tests/world/RealmGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateRealmData } from '@/world/RealmGenerator';

describe('generateRealmData', () => {
  it('is deterministic for the same seed', () => {
    const a = generateRealmData(12345);
    const b = generateRealmData(12345);
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = generateRealmData(1);
    const b = generateRealmData(2);
    expect(a.cells).not.toEqual(b.cells);
  });

  it('produces a cells grid matching the requested W x H', () => {
    const realm = generateRealmData(42, 40, 30);
    expect(realm.W).toBe(40);
    expect(realm.H).toBe(30);
    expect(realm.cells.length).toBe(30);
    expect(realm.cells[0]!.length).toBe(40);
  });

  it('every cell has a valid elevation, moisture, and biome', () => {
    const realm = generateRealmData(7, 30, 20);
    const validBiomes = new Set([
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ]);
    for (const row of realm.cells) {
      for (const cell of row) {
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(1);
        expect(cell.moisture).toBeGreaterThanOrEqual(0);
        expect(validBiomes.has(cell.biome)).toBe(true);
      }
    }
  });

  it('places the requested number of settlements (or fewer if land is scarce)', () => {
    const realm = generateRealmData(99, 60, 45, 5);
    expect(realm.settlements.length).toBeLessThanOrEqual(5);
    expect(realm.settlements.length).toBeGreaterThan(0);
  });

  it('places the tower on non-ocean land', () => {
    const realm = generateRealmData(55, 50, 40);
    const towerCell = realm.cells[realm.towerY]![realm.towerX]!;
    expect(towerCell.biome).not.toBe('ocean');
    expect(towerCell.biome).not.toBe('deep_ocean');
  });

  it('places at least one dungeon marker for a reasonably sized realm', () => {
    const realm = generateRealmData(8, 60, 45);
    expect(realm.dungeons.length).toBeGreaterThan(0);
  });

  it('records the seed it was generated with', () => {
    const realm = generateRealmData(777);
    expect(realm.seed).toBe(777);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/RealmGenerator.test.ts`
Expected: FAIL — `Cannot find module '@/world/RealmGenerator'`.

- [ ] **Step 3: Create `src/world/RealmGenerator.ts`**

```typescript
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
```

Note: `rand2` is declared but was already unused in the original code (pre-existing, not introduced by this extraction) — leave it exactly as-is; do not "clean it up" as that's out of scope for a pure move.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/RealmGenerator.test.ts`
Expected: PASS (8/8 tests)

- [ ] **Step 5: Update `overworld-studio.ts` to import from the new module**

In `src/overworld-studio.ts`, add near the top import block (after the `chaikin` import added in Task 1):

```typescript
import { generateRealmData, type RealmShape, type RealmClimate } from '@/world/RealmGenerator';
```

Then remove the following from their old locations:

1. The local type declarations (currently at approximately lines 3528-3529):
```typescript
type RealmShape   = 'island' | 'continents' | 'archipelago' | 'pangaea';
type RealmClimate = 'tropical' | 'temperate' | 'arctic';
```
Delete these two lines only — keep `export type RealmBiome = ...` and `export interface RealmCell`/`RealmRiver` immediately around them untouched.

2. The entire block from `const NAME_PRE = [...]` through the closing `}` of `generateRealmData` (currently at approximately lines 3568-3777) — this is the exact block moved into `RealmGenerator.ts` in Step 3 above (NAME_PRE, NAME_SUFF, `realmName`, `classifyBiome`, `fbmR`, `generateRealmData`). Delete the whole block; the import added above replaces it.

- [ ] **Step 6: Verify no regressions**

Run: `npx tsc --noEmit` — expect the same error count as the Task 1 baseline (the one call site at the old line ~4572, `currentRealmData = generateRealmData(seed, W, H, nS, shape, climate, roughness);`, keeps working unchanged since the imported function has an identical signature).
Run: `npx vitest run` — expect the same pass count as the Task 1 baseline plus the 8 new `RealmGenerator` tests.

- [ ] **Step 7: Commit**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts src/overworld-studio.ts
git commit -m "refactor: extract generateRealmData into pure src/world/RealmGenerator.ts"
```

---

### Task 3: Build the `RealmToWorldGrid` converter

**Files:**
- Create: `src/world/RealmToWorldGrid.ts`
- Test: `tests/world/RealmToWorldGrid.test.ts`

**Interfaces:**
- Consumes: `RealmData` (type-only import from `@/overworld-studio`), `WorldGrid`/`BiomeId` from `./WorldGrid`, `WorldSize` from `./WorldGenConfig`.
- Produces: `realmToWorldGrid(realm: RealmData, worldSize: WorldSize): WorldGrid` — consumed by Task 4's modified `buildWorldGrid()`.

- [ ] **Step 1: Write the failing test**

Create `tests/world/RealmToWorldGrid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { realmToWorldGrid } from '@/world/RealmToWorldGrid';
import { generateRealmData } from '@/world/RealmGenerator';
import type { RealmData, RealmCell } from '@/overworld-studio';

function fakeRealm(cells: RealmCell[][]): RealmData {
  return {
    cells, W: cells[0]!.length, H: cells.length,
    rivers: [], settlements: [], dungeons: [],
    towerX: 0, towerY: 0, seed: 1,
  };
}

describe('realmToWorldGrid', () => {
  it('maps every RealmBiome to a valid WorldGrid BiomeId', () => {
    const biomes: RealmCell['biome'][] = [
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
    ];
    const validWorldBiomes = new Set(['bog', 'grass', 'forest', 'highland', 'rocky', 'water']);
    const cells = [biomes.map(biome => ({ elevation: 0.5, moisture: 0.5, biome }))];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    for (let col = 0; col < 128; col++) {
      expect(validWorldBiomes.has(grid.get(col, 0).biome)).toBe(true);
    }
  });

  it('maps ocean biomes to water (not bog) so existing water-avoidance logic works', () => {
    const cells = [[
      { elevation: 0.1, moisture: 0.5, biome: 'deep_ocean' as const },
      { elevation: 0.2, moisture: 0.5, biome: 'ocean' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 128);
    expect(grid.get(0, 0).biome).toBe('water');
    expect(grid.get(64, 0).biome).toBe('water');
  });

  it('maps forest and taiga to forest', () => {
    const cells = [[
      { elevation: 0.5, moisture: 0.5, biome: 'forest' as const },
      { elevation: 0.5, moisture: 0.5, biome: 'taiga' as const },
    ]];
    const grid = realmToWorldGrid(fakeRealm(cells), 128);
    expect(grid.get(0, 0).biome).toBe('forest');
    expect(grid.get(127, 0).biome).toBe('forest');
  });

  it('quantizes elevation 0..1 into 0..4 discrete levels', () => {
    const cells = [[
      { elevation: 0.0,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.25, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.5,  moisture: 0.5, biome: 'grassland' as const },
      { elevation: 0.75, moisture: 0.5, biome: 'grassland' as const },
      { elevation: 1.0,  moisture: 0.5, biome: 'grassland' as const },
    ]];
    const realm = fakeRealm(cells);
    const grid = realmToWorldGrid(realm, 5);
    expect(grid.get(0, 0).elevation).toBe(0);
    expect(grid.get(1, 0).elevation).toBe(1);
    expect(grid.get(2, 0).elevation).toBe(2);
    expect(grid.get(3, 0).elevation).toBe(3);
    expect(grid.get(4, 0).elevation).toBe(4); // 1.0 * 5 = 5, clamped to 4
  });

  it('is deterministic — same realm produces same grid twice', () => {
    const realm = generateRealmData(321, 40, 30);
    const a = realmToWorldGrid(realm, 128);
    const b = realmToWorldGrid(realm, 128);
    for (let row = 0; row < 128; row++) {
      for (let col = 0; col < 128; col++) {
        expect(a.get(col, row)).toEqual(b.get(col, row));
      }
    }
  });

  it('produces a grid of exactly worldSize x worldSize regardless of realm dimensions', () => {
    const realm = generateRealmData(9, 96, 72);
    const grid256 = realmToWorldGrid(realm, 256);
    expect(grid256.width).toBe(256);
    expect(grid256.height).toBe(256);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: FAIL — `Cannot find module '@/world/RealmToWorldGrid'`.

- [ ] **Step 3: Create `src/world/RealmToWorldGrid.ts`**

```typescript
/**
 * RealmToWorldGrid.ts — resamples a Studio-generated RealmData onto the
 * live game's WorldGrid shape (P0 of the Studio<->live-game parity work,
 * see TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md).
 *
 * Deliberately keeps WorldGrid's existing 6-value BiomeId taxonomy and
 * 0-4 elevation levels unchanged (Approach 2 from the design spec) so
 * every downstream consumer (DungeonPlacer, SettlementPlacer,
 * CaveGladeWorldPlacer, HydrologyGenerator, RoadGenerator,
 * TerrainGeometryBuilder) needs zero changes — only the *source* of
 * biome/elevation per cell changes, from independent FBM noise to a
 * resampled-and-mapped realm map.
 *
 * Resampling is nearest-neighbor: realm dimensions (96x72 by default)
 * essentially never match `worldSize` (128 or 256, always square), so
 * some stretching is unavoidable and acceptable for this slice.
 */

import { WorldGrid, type BiomeId } from './WorldGrid';
import type { WorldSize } from './WorldGenConfig';
import type { RealmData, RealmBiome } from '@/overworld-studio';

/**
 * Realm's 10-value biome taxonomy collapsed onto WorldGrid's 6-value
 * BiomeId. Oceans map to 'water' (not 'bog') because 'water' already
 * exists in BiomeId and is actively checked by DungeonPlacer.ts,
 * SettlementPlacer.ts, RoadGenerator.ts, SettlementGenerator.ts, and
 * TerrainGeometryBuilder.ts to avoid placing things in the ocean / render
 * it differently — today's FBM generator never produces 'water', so this
 * mapping makes those existing checks actually take effect for the first
 * time rather than silently never triggering.
 */
const REALM_BIOME_TO_WORLD_BIOME: Record<RealmBiome, BiomeId> = {
  deep_ocean: 'water',
  ocean:      'water',
  beach:      'grass',
  desert:     'grass',
  savanna:    'grass',
  grassland:  'grass',
  forest:     'forest',
  taiga:      'forest',
  tundra:     'highland',
  snow:       'rocky',
};

/** Quantize a continuous 0..1 realm elevation into WorldGrid's 0-4 levels. */
function quantizeElevation(elevation: number): number {
  return Math.max(0, Math.min(4, Math.floor(elevation * 5)));
}

/** Nearest-neighbor sample of a realm cell for a target WorldGrid position. */
function sampleRealmCell(realm: RealmData, col: number, row: number, worldSize: number) {
  const realmW = Math.max(1, realm.W);
  const realmH = Math.max(1, realm.H);
  const rx = Math.min(realmW - 1, Math.floor((col / worldSize) * realmW));
  const ry = Math.min(realmH - 1, Math.floor((row / worldSize) * realmH));
  return realm.cells[ry]![rx]!;
}

export function realmToWorldGrid(realm: RealmData, worldSize: WorldSize): WorldGrid {
  const grid = new WorldGrid(worldSize, worldSize);
  for (let row = 0; row < worldSize; row++) {
    for (let col = 0; col < worldSize; col++) {
      const cell = sampleRealmCell(realm, col, row, worldSize);
      grid.set(col, row, {
        elevation: quantizeElevation(cell.elevation),
        biome:     REALM_BIOME_TO_WORLD_BIOME[cell.biome],
      });
    }
  }
  return grid;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/RealmToWorldGrid.test.ts`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Verify no regressions**

Run: `npx tsc --noEmit` — expect the same error count as the Task 2 baseline (this is a new, self-contained file with no existing callers yet).
Run: `npx vitest run` — expect the same pass count as the Task 2 baseline plus the 6 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/world/RealmToWorldGrid.ts tests/world/RealmToWorldGrid.test.ts
git commit -m "feat: add RealmToWorldGrid converter (realm cells -> WorldGrid biome/elevation)"
```

---

### Task 4: Wire `buildWorldGrid()` to generate terrain from realm data

**Files:**
- Modify: `src/world/WorldGenerator.ts:1-77` (imports + `buildWorldGrid` body)
- Test: `tests/world/WorldGenerator.test.ts` (new)

**Interfaces:**
- Consumes: `generateRealmData` from Task 2's `@/world/RealmGenerator`, `realmToWorldGrid` from Task 3's `@/world/RealmToWorldGrid`.
- Produces: `buildWorldGrid(seed: number, config: WorldGenConfig): WorldGrid` — signature and return type unchanged from before this task, so `buildWorldData()` (same file), `main.ts`, and `src/editor/BlueprintLayer.ts` need zero changes.

- [ ] **Step 1: Write the failing test**

Create `tests/world/WorldGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWorldGrid } from '@/world/WorldGenerator';
import { generateRealmData } from '@/world/RealmGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

describe('buildWorldGrid — realm-sourced terrain (P0)', () => {
  it('is deterministic for the same seed', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 500 };
    const a = buildWorldGrid(500, cfg);
    const b = buildWorldGrid(500, cfg);
    for (let row = 0; row < cfg.worldSize; row++) {
      for (let col = 0; col < cfg.worldSize; col++) {
        expect(a.get(col, row)).toEqual(b.get(col, row));
      }
    }
  });

  it('produces a grid sized to config.worldSize', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 1, worldSize: 256 as const };
    const grid = buildWorldGrid(1, cfg);
    expect(grid.width).toBe(256);
    expect(grid.height).toBe(256);
  });

  it('produces at least some water tiles for a large-enough world (realm always has ocean)', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 2 };
    const grid = buildWorldGrid(2, cfg);
    let waterCount = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        if (grid.get(col, row).biome === 'water') waterCount++;
      }
    }
    expect(waterCount).toBeGreaterThan(0);
  });

  it('keeps the tower flat-zone: elevation is low near grid center regardless of realm data', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 3 };
    const grid = buildWorldGrid(3, cfg);
    const center = Math.floor(cfg.worldSize / 2);
    expect(grid.get(center, center).elevation).toBeLessThanOrEqual(1);
  });

  it('every produced cell has a valid elevation 0-4 and BiomeId', () => {
    const cfg = { ...DEFAULT_WORLD_GEN_CONFIG, seed: 4, worldSize: 128 as const };
    const grid = buildWorldGrid(4, cfg);
    const validBiomes = new Set(['bog', 'grass', 'forest', 'highland', 'rocky', 'water']);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const cell = grid.get(col, row);
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(4);
        expect(validBiomes.has(cell.biome)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WorldGenerator.test.ts`
Expected: FAIL on the water-tiles test (`waterCount` will be 0 — today's FBM generator never produces `'water'`) and the flat-zone test may or may not already pass by coincidence; the water-tiles failure is the meaningful RED signal that terrain isn't realm-sourced yet.

- [ ] **Step 3: Modify `buildWorldGrid()` in `src/world/WorldGenerator.ts`**

Replace the imports at the top of the file:

```typescript
import { WorldGrid }           from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import type { WorldData }      from './WorldData';
import { createNoise2D, fbm }  from '@/core/SimplexNoise';
import { generateHydrology }   from './HydrologyGenerator';
import { placeDungeons }       from './DungeonPlacer';
import { placeSettlements }    from './SettlementPlacer';
import { placeCavesAndGlades } from './CaveGladeWorldPlacer';
import { buildInterSettlementRoads } from './RoadGenerator';
import { simulateWorldHistory }      from './WorldHistory';
import { placeResourceNodes }         from './ResourceNodePlacer';
```

with:

```typescript
import { WorldGrid }           from './WorldGrid';
import type { WorldGenConfig } from './WorldGenConfig';
import type { WorldData }      from './WorldData';
import { generateHydrology }   from './HydrologyGenerator';
import { placeDungeons }       from './DungeonPlacer';
import { placeSettlements }    from './SettlementPlacer';
import { placeCavesAndGlades } from './CaveGladeWorldPlacer';
import { buildInterSettlementRoads } from './RoadGenerator';
import { simulateWorldHistory }      from './WorldHistory';
import { placeResourceNodes }         from './ResourceNodePlacer';
import { generateRealmData }   from './RealmGenerator';
import { realmToWorldGrid }    from './RealmToWorldGrid';
```

(`createNoise2D`/`fbm` are no longer used directly in this file after this change — they were only used by the FBM loop being replaced.)

Replace the entire `buildWorldGrid` function body:

```typescript
export function buildWorldGrid(seed: number, config: WorldGenConfig): WorldGrid {
  const GW  = config.worldSize;
  const GH  = config.worldSize;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);    // flat zone radius in tiles

  // Rim bias: terrain rises steeply near the world edge (bowl effect).
  const rimStart = GHW * 0.80;
  const rimRange = GHW * 0.36;

  const noise = createNoise2D(seed ^ 0x5E_A1_9D_7B);
  const grid  = new WorldGrid(GW, GH);

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const dc  = col - GHW;
      const dr  = row - GHH;
      const tR  = Math.sqrt(dc * dc + dr * dr);

      const nx  = dc / GW;
      const nz  = dr / GH;
      const raw = (fbm(noise, nx * 3.8, nz * 3.8, 4) + 1) * 0.5;
      let level = Math.min(MLV, Math.floor(raw * (MLV + 1)));

      // Smooth flatness gradient around the tower site
      const flatness = Math.max(0, 1 - tR / FR);
      level = Math.round(level * (1 - flatness));

      // Rim elevation bias (bowl walls)
      const rimBias = Math.max(0, (tR - rimStart) / rimRange);
      level = Math.min(MLV, Math.round(level + rimBias * 1.8));

      const biomes = ['bog', 'grass', 'forest', 'highland', 'rocky'] as const;
      grid.set(col, row, {
        elevation: level,
        biome:     biomes[level],
      });
    }
  }

  // OW-2: carve rivers into the grid
  generateHydrology(grid, config, seed);

  return grid;
}
```

with:

```typescript
export function buildWorldGrid(seed: number, config: WorldGenConfig): WorldGrid {
  const GW  = config.worldSize;
  const GH  = config.worldSize;
  const GHW = (GW - 1) / 2;
  const GHH = (GH - 1) / 2;
  const FR  = Math.round(GHW * 0.28);    // flat zone radius in tiles

  // Rim bias: terrain rises steeply near the world edge (bowl effect).
  const rimStart = GHW * 0.80;
  const rimRange = GHW * 0.36;

  // P0 — terrain is now sourced from the same realm generator Overworld
  // Studio uses, instead of an independent FBM-noise algorithm, so the
  // same seed produces recognizably the same land/water/mountain layout
  // in both places. See TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md.
  const realm = generateRealmData(seed);
  const grid  = realmToWorldGrid(realm, config.worldSize);

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const dc  = col - GHW;
      const dr  = row - GHH;
      const tR  = Math.sqrt(dc * dc + dr * dr);

      let level = grid.get(col, row).elevation;

      // Smooth flatness gradient around the tower site — kept as a
      // gameplay requirement (guaranteed buildable land at the tower)
      // independent of what the realm placed there.
      const flatness = Math.max(0, 1 - tR / FR);
      level = Math.round(level * (1 - flatness));

      // Rim elevation bias (bowl walls) — kept unchanged.
      const rimBias = Math.max(0, (tR - rimStart) / rimRange);
      level = Math.min(MLV, Math.round(level + rimBias * 1.8));

      grid.set(col, row, { elevation: level });
    }
  }

  // OW-2: carve rivers into the grid (unchanged — out of scope for P0,
  // see design spec's "Explicitly out of scope" section)
  generateHydrology(grid, config, seed);

  return grid;
}
```

Note the tower flat-zone/rim-bias post-processing loop now only patches `elevation` (via `grid.set(col, row, { elevation: level })`, a partial patch — `WorldGrid.set()` is `Partial<WorldCell>`-based per its existing API) and leaves `biome` exactly as `realmToWorldGrid` set it, since biome shouldn't change just because the tower flattened the terrain height at that spot.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WorldGenerator.test.ts`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Run the full regression suite**

Run: `npx vitest run`
Expected: same pass count as the Task 3 baseline plus the 5 new `WorldGenerator.test.ts` tests, and in particular:
- `tests/world/DungeonPlacer.test.ts` — still passes (biome eligibility checks now see realm-derived biomes, including real `'water'` cells for the first time, but the test only checks determinism/structural validity, not exact placements)
- `tests/world/CaveGladeWorldPlacer.test.ts` — still passes (same reasoning)
- `tests/scene/overworld.startup.smoke.test.ts` — still passes (only checks the module imports without throwing)

If either `DungeonPlacer.test.ts` or `CaveGladeWorldPlacer.test.ts` fails, read the failure carefully — it most likely means a fixed/hardcoded test config now produces zero eligible placement cells because the realm-derived terrain doesn't have enough non-water land at that test's seed/worldSize. If so, do NOT change `DungeonPlacer.ts`/`CaveGladeWorldPlacer.ts` (out of scope) — instead check whether the test's WorldGrid is built via a small worldSize where nearest-neighbor resampling from a 96x72 realm could plausibly produce an all-water or all-land result, and report this back rather than silently patching over it.

Run: `npx tsc --noEmit`
Expected: same error count as the Task 3 baseline (no new errors — `buildWorldGrid`'s signature is unchanged).

- [ ] **Step 6: Manual live verification**

Run the dev server (`npm run dev` or the project's existing dev script) and:
1. Open Overworld Studio, generate a realm with a specific seed (note it), observe the land/water/mountain layout in the realm preview.
2. Start a new game with that same seed (via the world-gen seed setting) and enter the overworld.
3. Confirm the overworld terrain's land/water/mountain layout visually corresponds to the Studio preview (not pixel-identical, given nearest-neighbor resampling and the tower flat-zone override, but recognizably the same coastline/mountain shapes — e.g. if Studio showed a large ocean in the northeast quadrant, the live game should show water in the same relative area).
4. Confirm the game is still playable: player can walk around, settlements/dungeons still appear (their placement algorithm is unchanged from before this plan).

- [ ] **Step 7: Commit**

```bash
git add src/world/WorldGenerator.ts tests/world/WorldGenerator.test.ts
git commit -m "feat: buildWorldGrid sources terrain from generateRealmData (P0 realm/terrain unification)"
```

- [ ] **Step 8: Update the TODO doc**

In `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`, update the P0 section to note it's shipped:

Find:
```markdown
### P0 — Realm/Terrain unification (foundation, blocks P1 and P3)
Live game loads an actual Studio-exported realm (a WG-5-style world
package) instead of running `WorldGenerator.ts`'s independent algorithm.
This is the highest-risk, highest-priority piece: nothing placed on top of
terrain (settlements, caves, dungeons) can be trusted to match Studio
preview until this lands.
```

Replace with:
```markdown
### P0 — Realm/Terrain unification ✅ (elevation + biome layout only)
`buildWorldGrid()` now calls the same `generateRealmData()` Overworld
Studio uses (extracted to `src/world/RealmGenerator.ts`), resampled onto
`WorldGrid` via `src/world/RealmToWorldGrid.ts`. Elevation + biome layout
now matches Studio's realm preview for a given seed. Still separate,
tracked as follow-ups: river rasterization (`HydrologyGenerator.ts` still
runs its own independent river algorithm) and full 10-value biome fidelity
(currently collapsed to `WorldGrid`'s 6-value `BiomeId`). P1 and P3 can now
proceed — they build on this slice's realm-derived terrain.
```

- [ ] **Step 9: Commit the TODO update**

```bash
git add TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md
git commit -m "docs: mark P0 realm/terrain unification as shipped"
```
