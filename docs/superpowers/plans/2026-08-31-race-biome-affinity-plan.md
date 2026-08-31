# Race/Faction Biome Affinity (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bias (not hard-gate) which faction spawns at a given settlement site based on the
cell's biome — an elven settlement noticeably favors forest/taiga, a dwarven one favors
mountain/tundra, etc. — instead of today's fully-uniform random faction pick.

**Architecture:** A new `BIOME_AFFINITY` table + `pickFaction(biome, rand)` weighted-random
helper in `RealmGenerator.ts` (module-scope, replacing the settlement loop's uniform pick), an
expanded settlement-eligible biome set (adds `tundra`/`mountain`), and a narrowly-scoped
elevation-gate relaxation in `SettlementPlacer.ts` so mountain-biome settlements — which are only
ever generated at a high elevation level — can actually be sited live, not just in
`generateRealmData()`'s own preview data.

**Tech Stack:** TypeScript, Vitest, the existing seeded `mulberry32`/`rand()` RNG pattern already
used throughout `RealmGenerator.ts`.

## Global Constraints

- Every faction must remain reachable on every settlement-eligible biome — this is a *bias*, not
  a hard rule. No weight may ever be literally zero.
- `classifyBiome()` and the settlement *size* (village/town/city) classification logic are
  untouched.
- The elevation-gate relaxation in `SettlementPlacer.ts` must be scoped to `mountain`-biome cells
  only — every other biome's existing `[1, 2]` elevation-gate behavior stays byte-identical.
- Dungeons/caves/glades get no faction concept in this pass (confirmed faction-agnostic today —
  out of scope, see design spec §2).
- `generateRealmData()` must stay fully deterministic for a given seed (existing tests already
  assert this — must keep passing unmodified).

---

## Task 1: `BIOME_AFFINITY` table + `pickFaction()` weighted-random helper

**Files:**
- Modify: `src/world/RealmGenerator.ts`
- Test: `tests/world/RealmGenerator.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained). Uses the existing `SettlementFaction`,
  `RealmBiome` types already imported in `RealmGenerator.ts`.
- Produces: `export function pickFaction(biome: RealmBiome, rand: () => number): SettlementFaction`,
  consumed by Task 2's edit to `generateRealmData()`'s settlement loop.

- [ ] **Step 1: Write the failing tests**

Add to `tests/world/RealmGenerator.test.ts` (add `pickFaction` to the existing import line from
`@/world/RealmGenerator`):

```ts
describe('pickFaction', () => {
  it('is deterministic for the same rand sequence', () => {
    const a = pickFaction('taiga', mulberry32(111));
    const b = pickFaction('taiga', mulberry32(111));
    expect(a).toBe(b);
  });

  it('picks the affinity faction for a single-affinity biome noticeably more often than uniform chance (~11%)', () => {
    const rand = mulberry32(222);
    let elvenCount = 0;
    const TRIALS = 2000;
    for (let i = 0; i < TRIALS; i++) {
      if (pickFaction('taiga', rand) === 'elven') elvenCount++;
    }
    // Uniform baseline over 9 factions is ~11%; the weighted design (5x boost,
    // only elven has taiga affinity) expects roughly 5/13 ≈ 38% — assert well
    // above baseline with margin for RNG noise, not the exact expected value.
    expect(elvenCount / TRIALS).toBeGreaterThan(0.25);
  });

  it('still picks a non-affinity faction sometimes (bias, not a hard rule)', () => {
    const rand = mulberry32(333);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickFaction('taiga', rand));
    expect(seen.size).toBeGreaterThan(1); // not exclusively elven
  });

  it('never returns a faction outside the known 9-faction set', () => {
    const rand = mulberry32(444);
    const valid = new Set(['human','elven','dwarven','orcish','vampire','undead','vulperia','slime','fae']);
    for (let i = 0; i < 200; i++) {
      expect(valid.has(pickFaction('grassland', rand))).toBe(true);
    }
  });
});
```

Also add `import { mulberry32 } from '@/core/prng';` to the test file if it isn't already
imported (check the existing import block first — it likely isn't, since no other test in this
file constructs its own RNG stream).

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "pickFaction"
```

Expected: FAIL — `pickFaction is not a function` (not yet exported).

- [ ] **Step 3: Implement in `src/world/RealmGenerator.ts`**

Find the existing `FACTIONS` declaration, currently *inside* `generateRealmData()`'s function
body:

```ts
  const FACTIONS: SettlementFaction[] = ['human','elven','dwarven','orcish','vulperia','slime','vampire','undead','fae'];
```

Delete that line from inside `generateRealmData()` (Task 2 will remove its remaining local
usage), and add this at module scope instead — right after the `_domainWarp()` function
definition (which currently sits just above `export function generateRealmData(...)`):

```ts
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
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "pickFaction"
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run the full `RealmGenerator.test.ts` file, confirm nothing else broke**

```bash
npx vitest run tests/world/RealmGenerator.test.ts
```

Expected: all pass. `generateRealmData()`'s own settlement loop still references the now-deleted
local `FACTIONS` at this point in Task 1 (it hasn't been rewired to `pickFaction()` yet) — since
`FACTIONS` now exists at module scope with the identical name/type/values, the existing
`FACTIONS[Math.floor(rand() * FACTIONS.length)]` line keeps compiling and behaving exactly as
before (this task is purely additive until Task 2 rewires it).

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm the error count is still 144**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

- [ ] **Step 7: Commit**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts
git commit -m "feat: add BIOME_AFFINITY table + pickFaction weighted-random helper"
```

---

## Task 2: Wire `pickFaction()` into the settlement loop + expand `VALID` biomes

**Files:**
- Modify: `src/world/RealmGenerator.ts`
- Test: `tests/world/RealmGenerator.test.ts`

**Interfaces:**
- Consumes: `pickFaction(biome, rand)` from Task 1.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing statistical wiring test**

Add to `tests/world/RealmGenerator.test.ts`:

```ts
describe('generateRealmData — race/faction biome affinity (Phase 5)', () => {
  it('sites settlements on mountain and tundra biomes too (previously excluded)', () => {
    const seenBiomes = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const realm = generateRealmData(seed, 96, 72, 12, 'island', 'temperate', 0.5);
      for (const s of realm.settlements) seenBiomes.add(realm.cells[s.y]![s.x]!.biome);
    }
    expect(seenBiomes.has('mountain') || seenBiomes.has('tundra')).toBe(true);
  });

  it('biases taiga-sited settlements toward elven, noticeably above uniform chance (~11%)', () => {
    const taigaFactions: string[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const realm = generateRealmData(seed, 96, 72, 12, 'island', 'temperate', 0.5);
      for (const s of realm.settlements) {
        if (realm.cells[s.y]![s.x]!.biome === 'taiga') taigaFactions.push(s.faction);
      }
    }
    // Needs a large-enough sample for the proportion check to be meaningful —
    // if this floor isn't met in practice, raise the seed loop count above
    // (taiga is a narrower biome than grassland/forest, so it needs more
    // world samples to accumulate enough sited settlements).
    expect(taigaFactions.length).toBeGreaterThan(19);
    const elvenRatio = taigaFactions.filter(f => f === 'elven').length / taigaFactions.length;
    expect(elvenRatio).toBeGreaterThan(0.20); // well above the ~11% (1/9) uniform baseline
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "race/faction biome affinity"
```

Expected: FAIL — mountain/tundra never appear (still excluded from `VALID`), and the elven ratio
sits near the uniform ~11% baseline (still using the uniform pick).

- [ ] **Step 3: Wire the change into `generateRealmData()`**

Find:

```ts
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
```

Replace with:

```ts
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
```

(Note `FACTIONS` is no longer declared here — it now lives at module scope from Task 1.)

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/world/RealmGenerator.test.ts -t "race/faction biome affinity"
```

Expected: PASS. If the "large-enough sample" assertion (`taigaFactions.length > 19`) fails
because too few taiga-sited settlements were observed, raise the seed loop's upper bound (e.g.
from 200 to 400) and re-run — this is a legitimate calibration step for a statistical test, not a
sign of a bug.

- [ ] **Step 5: Run the full `RealmGenerator` test files, confirm everything passes**

```bash
npx vitest run tests/world/RealmGenerator.test.ts tests/world/RealmGenerator.perf.test.ts
```

Expected: all pass, including the pre-existing determinism/settlement/tower/dungeon tests and the
3-second 512×512 perf budget (weighted-pick is O(1) per settlement, negligible perf impact).

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 7: Commit**

```bash
git add src/world/RealmGenerator.ts tests/world/RealmGenerator.test.ts
git commit -m "feat: bias settlement faction assignment by biome, expand eligible biomes"
```

---

## Task 3: `SettlementPlacer.ts` mountain-biome elevation-gate relaxation

**Files:**
- Modify: `src/world/SettlementPlacer.ts`
- Test: `tests/levels/settlementGenerator.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (independent, live-game-side fix for the same-named
  constraint discussed in the design spec §2).
- Produces: nothing for later tasks — this is the final task in this plan.

- [ ] **Step 1: Write the failing tests**

Add to `tests/levels/settlementGenerator.test.ts`. First add this helper function right after the
existing `flatGrid()` helper (around line 21):

```ts
function biomeGrid(size: number, biome: BiomeId, elevation: number): WorldGrid {
  const g = new WorldGrid(size, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      g.set(col, row, { elevation, biome, content: 'empty', feature: 'none', walkable: true });
    }
  }
  return g;
}
```

Add `import type { BiomeId } from '@/world/WorldGrid';` to the top of the file (alongside the
existing `import { WorldGrid } from '@/world/WorldGrid';` line).

Then add a new `describe` block at the end of the file, after the existing `describe('placeSettlements', ...)` block:

```ts
describe('placeSettlements — race/faction biome affinity (Phase 5)', () => {
  it('can site a settlement on mountain-biome terrain at the mountain elevation band (5-6)', () => {
    const g = biomeGrid(128, 'mountain', 5);
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('still rejects mountain-biome terrain outside its own elevation band (even under the new gate)', () => {
    const g = biomeGrid(128, 'mountain', 3); // valid biome, wrong elevation
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBe(0);
  });

  it('can site a settlement on tundra-biome terrain within the existing elevation band (1-2)', () => {
    const g = biomeGrid(128, 'tundra', 1);
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('keeps every non-mountain biome at the original elevation gate (1-2) — regression', () => {
    const g = biomeGrid(128, 'grassland', 3); // outside [1,2] — must still be rejected exactly as before
    const entries = placeSettlements(g, BASE_CONFIG, 42);
    expect(entries.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests, confirm the expected failure**

```bash
npx vitest run tests/levels/settlementGenerator.test.ts -t "race/faction biome affinity"
```

Expected: FAIL only on the first test ("can site a settlement on mountain-biome terrain at the
mountain elevation band (5-6)") — `entries.length` is `0` because the current elevation gate only
accepts levels `[1, 2]`, rejecting the whole uniformly-mountain-at-elevation-5 grid outright. The
other 3 tests already pass at this point and should stay passing after Step 3's change too: `biomeGrid()`
builds a WorldGrid directly (independent of what biome `generateRealmData()`'s own internal realm
simulation would have picked for that position), so "tundra at elevation 1" already satisfies the
pre-existing `[1, 2]` band with no code change needed, and both "wrong elevation" regression cases
(mountain at 3, grassland at 3) are rejected by the `[1, 2]`-or-`[5, 6]` gate either way.

- [ ] **Step 3: Implement the elevation-gate relaxation in `src/world/SettlementPlacer.ts`**

Find:

```ts
    const cell = grid.get(col, row);
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
    if (cell.feature === 'river')                  return false;
    if (cell.elevation < 1 || cell.elevation > 2)  return false;
    if (cell.content !== 'empty')                  return false;
    return true;
```

Replace with:

```ts
    const cell = grid.get(col, row);
    if (cell.biome === 'deep_ocean' || cell.biome === 'ocean') return false;
    if (cell.feature === 'river')                  return false;
    // Elevation gate is biome-conditional: 'mountain' is only ever
    // classified at a high elevation (RealmGenerator.ts's classifyBiome()
    // requires elev > 0.70, quantizing to level 5 or 6 — see
    // RealmToWorldGrid.ts's quantizeElevation()), so the original [1,2]
    // band would silently reject every mountain-biome cell. Every other
    // biome keeps the exact original [1,2] gate, unchanged (Phase 5, see
    // docs/superpowers/specs/2026-08-31-race-biome-affinity-design.md §5).
    const elevOk = cell.biome === 'mountain'
      ? (cell.elevation >= 5 && cell.elevation <= 6)
      : (cell.elevation >= 1 && cell.elevation <= 2);
    if (!elevOk)                                    return false;
    if (cell.content !== 'empty')                  return false;
    return true;
```

- [ ] **Step 4: Run the tests, confirm they pass**

```bash
npx vitest run tests/levels/settlementGenerator.test.ts -t "race/faction biome affinity"
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run the full `settlementGenerator.test.ts` file, confirm nothing else broke**

```bash
npx vitest run tests/levels/settlementGenerator.test.ts
```

Expected: all pass, including the pre-existing `placeSettlements` tests (which use the unrelated
`flatGrid()` helper at `elevation: 1` — squarely inside the unchanged `[1, 2]` band for every
non-mountain biome, so unaffected by this change).

- [ ] **Step 6: Run `npx tsc --noEmit`, confirm the error count is still 144**

- [ ] **Step 7: Run the full project test suite**

```bash
npx vitest run
```

Expected: the same pre-existing baseline failures documented in
`docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (main.startup.smoke.test.ts×3,
enemyLoader.test.ts×3, towerGenerator.test.ts×2, talentSystem.test.ts×3, WaterMaterial.test.ts×1
— 12 total), zero new failures. Re-run any suspicious failure in isolation before concluding it's
a real regression (this project's documented sandbox-contention flakes are
`OverworldScene.chunk-scatter-alignment.test.ts` and `tests/world/ResourceNodePlacer.test.ts` —
both pass cleanly in isolation). Also watch for a legitimate settlement-count/composition
snapshot shift in `tests/scene/OverworldScene.settlement-parity.test.ts` (seed 1) — the same
category of expected shift documented inline in that test's own comments (this phase changes
which biomes/factions can be sited, which can perturb the exact settlement list for a given
seed); if it fails, update its snapshot with `npx vitest run tests/scene/OverworldScene.settlement-parity.test.ts -u`
and add a dated note to that test's comment block matching its established pattern (see how the
Phase 4 domain-warp plan's Task 2 documented its own snapshot shift for the exact wording style).

- [ ] **Step 8: Update the roadmap doc**

In `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md`'s Phase 5 section, replace the
`- [ ]` checkboxes with a "✅ DONE" status write-up (matching the style of Phases 3/4/7/8's
write-ups already in that file): what shipped (`BIOME_AFFINITY`/`pickFaction()`, the expanded
`VALID` biome set, the `SettlementPlacer.ts` elevation-gate relaxation), the explicit note that
dungeon/cave affinity was confirmed out of scope (faction-agnostic today), and the actual
test/perf/tsc results from steps 5–7 above.

- [ ] **Step 9: Commit and push to `main`**

```bash
git add src/world/SettlementPlacer.ts tests/levels/settlementGenerator.test.ts docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md
git commit -m "feat: relax mountain-biome elevation gate in SettlementPlacer (Phase 5)"
git push origin HEAD:main
```
