# Overworld Lab Implementation Plan
> "Play in 3D" for the Overworld Studio Realm tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "🎮 Play in 3D" button to Overworld Studio's Realm tab, mirroring
the Settlement tab's existing button, so a designer can click it and get the
*real, live game* booted directly into the exterior overworld using the exact
realm configuration (seed, shape, climate, roughness, size, settlement count)
currently previewed in the Realm tab — instead of the live game's own
independently-seeded default world.

**Architecture — deliberately NOT a repeat of Settlement Lab's pattern.**
Settlement Lab needed a bespoke, isolated `SettlementLabScene` because the live
`OverworldScene` has no way to render one arbitrary settlement in isolation —
a settlement only exists embedded in a whole generated world. Realm/terrain
preview has the opposite problem: the "whole generated world" *is* the thing
being previewed, so an isolated lab would just be reinventing `OverworldScene`
badly. Instead, this plan wires the Realm tab's config knobs into the exact
same `WorldGenConfig` → `buildWorldData()` → `OverworldScene` pipeline the
live game already uses for its normal "new game" world, and boots straight to
`switchToExterior()` — reusing terrain, physics, settlements, rivers,
dungeons, caves/glades, minimap, and weather 100% as-is. This is a smaller
diff than Settlement Lab and is exactly what
`TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`'s "Overworld Studio
becomes the single source of truth" mandate calls for.

**Known, deliberate approximation (documented, not a bug):** the live world
grid is always square (`WorldGenConfig.worldSize`: 128/256/512 — see
`WorldGenerator.ts:39-40`'s `GW = GH = config.worldSize`), while the Studio's
Realm tab can generate non-square realms (e.g. 96×72 at the "M" size preset).
This plan picks the closest square `WorldSize` to the realm's configured size
and passes the same seed/shape/climate/roughness/settlementCount through, so
the live world is the *same kind* of realm (same shape family, climate,
roughness, settlement count) but will not be a pixel-identical resample of
the non-square Studio preview. Full arbitrary-aspect-ratio parity is a larger
change tracked as a follow-up in the companion
`2026-08-30-biome-terrain-overhaul.md` plan, not blocking this feature.

**Tech Stack:** TypeScript, Vitest for unit tests, Playwright for the e2e
launch-flow smoke test. No new dependencies.

## Global Constraints

- Reuse the existing live `OverworldScene`/`buildWorldData()`/`switchToExterior()`
  pipeline exactly as-is. Do not build a new Scene class.
- The lab launch must NEVER permanently overwrite the player's own saved
  `WorldGenConfig` (`localStorage` key `ttt_world_gen_config`) — a one-off
  config override, not a persisted write.
- New `WorldGenConfig` fields (`shape`/`climate`/`roughness`) must be additive
  and backward-compatible — `loadWorldGenConfig()`'s existing
  `{ ...DEFAULT_WORLD_GEN_CONFIG, ...parsed }` merge already guarantees this,
  but confirm with a test against a config object missing the new fields.
- Follow TDD: write the failing test first for every code step, per project
  norm.
- No unverified completion claims — every task ends with a real test run
  whose output is shown, and the final task requires a Playwright launch
  smoke test before being marked done.

---

### Task 1: Add `shape`/`climate`/`roughness` to `WorldGenConfig` and thread them (plus the already-existing but ignored `settlementCount`) into `generateRealmData()`

**Files:**
- Modify: `src/world/WorldGenConfig.ts`
- Modify: `src/world/WorldGenerator.ts:52` (the `generateRealmData(...)` call inside `buildWorldGrid()`)
- Test: `tests/world/WorldGenConfig.test.ts`, `tests/world/WorldGenerator.test.ts`

**Interfaces:**
- `WorldGenConfig` gains: `shape: RealmShape`, `climate: RealmClimate`, `roughness: number` (import `RealmShape`/`RealmClimate` as `import type` from `@/world/RealmGenerator` — zero runtime coupling, matches the existing `import type { RealmData } from '@/overworld-studio'` pattern already used elsewhere in `src/world/`).
- `DEFAULT_WORLD_GEN_CONFIG` gains `shape: 'island'`, `climate: 'temperate'`, `roughness: 0.5` — matching `generateRealmData()`'s own current defaults exactly, so existing worlds generated before this change look identical.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/world/WorldGenConfig.test.ts — add to existing file
it('DEFAULT_WORLD_GEN_CONFIG has shape/climate/roughness matching generateRealmData defaults', () => {
  expect(DEFAULT_WORLD_GEN_CONFIG.shape).toBe('island');
  expect(DEFAULT_WORLD_GEN_CONFIG.climate).toBe('temperate');
  expect(DEFAULT_WORLD_GEN_CONFIG.roughness).toBe(0.5);
});

it('loadWorldGenConfig fills in shape/climate/roughness for a legacy saved config missing them', () => {
  localStorage.setItem('ttt_world_gen_config', JSON.stringify({ seed: 42, worldSize: 256 }));
  const cfg = loadWorldGenConfig();
  expect(cfg.seed).toBe(42);
  expect(cfg.shape).toBe('island');
  expect(cfg.climate).toBe('temperate');
  expect(cfg.roughness).toBe(0.5);
});
```

```typescript
// tests/world/WorldGenerator.test.ts — add to existing describe block
it('buildWorldGrid honors config.shape/climate/roughness/settlementCount (not hardcoded defaults)', () => {
  const seed = 777;
  const baseCfg = { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 128 as const, seed };
  const islandGrid = buildWorldGrid(seed, { ...baseCfg, shape: 'island' });
  const pangaeaGrid = buildWorldGrid(seed, { ...baseCfg, shape: 'pangaea' });
  // Same seed, different shape → measurably different ocean tile count
  // (island biases strongly toward ocean at the edges; pangaea does not).
  const oceanCount = (g: WorldGrid) => {
    let n = 0;
    for (let r = 0; r < 128; r++) for (let c = 0; c < 128; c++) {
      if (g.get(c, r).biome === 'ocean' || g.get(c, r).biome === 'deep_ocean') n++;
    }
    return n;
  };
  expect(oceanCount(islandGrid)).not.toBe(oceanCount(pangaeaGrid));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/world/WorldGenConfig.test.ts tests/world/WorldGenerator.test.ts`
Expected: FAIL — `shape`/`climate`/`roughness` don't exist on the config type/object yet, and the shape-variance test fails because `buildWorldGrid()` currently ignores `config.shape` entirely.

- [ ] **Step 3: Add the fields**

In `src/world/WorldGenConfig.ts`, add near the top:
```typescript
import type { RealmShape, RealmClimate } from './RealmGenerator';
```
Add to the `WorldGenConfig` interface (after `settlementCount`):
```typescript
  /** Realm landmass shape (Studio Realm tab parity — see RealmGenerator.ts). */
  shape:      RealmShape;
  /** Realm climate bias (Studio Realm tab parity). */
  climate:    RealmClimate;
  /** Terrain roughness 0-1 (Studio Realm tab parity). */
  roughness:  number;
```
Add to `DEFAULT_WORLD_GEN_CONFIG`:
```typescript
  shape:      'island',
  climate:    'temperate',
  roughness:  0.5,
```

- [ ] **Step 4: Thread the fields into `buildWorldGrid()`**

In `src/world/WorldGenerator.ts`, replace line 52:
```typescript
  const realm = generateRealmData(seed, config.worldSize, config.worldSize);
```
with:
```typescript
  const realm = generateRealmData(
    seed, config.worldSize, config.worldSize,
    config.settlementCount, config.shape, config.climate, config.roughness,
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/world/WorldGenConfig.test.ts tests/world/WorldGenerator.test.ts`
Expected: PASS

- [ ] **Step 6: Run the broader `tests/world/` suite for regressions**

Run: `npx vitest run tests/world/`
Expected: PASS, same count as baseline plus the new tests (settlement count downstream of `placeSettlements` may shift slightly now that `config.settlementCount` is actually honored instead of the old hardcoded `nSettlements=6` default — if any test hardcodes an assumed settlement count from the old ignored-config behavior, fix that test's expectation to match the now-correctly-wired config value, since the old behavior was the bug).

- [ ] **Step 7: `tsc --noEmit` baseline check**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: same error count as pre-existing baseline (record the baseline count first if not already known this session).

- [ ] **Step 8: Commit**

```bash
git add src/world/WorldGenConfig.ts src/world/WorldGenerator.ts tests/world/WorldGenConfig.test.ts tests/world/WorldGenerator.test.ts
git commit -m "feat(world): thread shape/climate/roughness/settlementCount into live realm generation"
```

---

### Task 2: Add an optional one-shot `configOverride` param to `_makeOverworld()`/`switchToExterior()` in `main.ts`

**Files:**
- Modify: `src/main.ts` (`_makeOverworld` ~line 353, `switchToExterior` ~line 397)

**Interfaces:**
- `function _makeOverworld(seed: number, configOverride?: Partial<WorldGenConfig>): OverworldScene` — when provided, the override is merged on top of the freshly-loaded persisted config (`{ ...loadWorldGenConfig(), ...configOverride, seed }`) WITHOUT calling `saveWorldGenConfig()` — so the player's own saved settings on disk are never touched.
- `function switchToExterior(configOverride?: Partial<WorldGenConfig>): void` — threads the same override through to `_makeOverworld()`. Only has an effect the first time `overworld` is constructed (matches the existing "build once, `enter()` on repeat visits" behavior below it — an override on a *second* call when `overworld` already exists is a no-op, exactly like the existing `if (!overworld)` guard already implies for `_makeOverworld`'s `seed` argument).

This is a pure additive change — no existing call site passes a second argument, so nothing about current behavior changes.

- [ ] **Step 1: Write the failing test**

`main.ts`'s closures aren't unit-testable in isolation (no existing test file exercises them directly — confirmed no `tests/main.test.ts` covering `_makeOverworld`/`switchToExterior`). This step is instead covered by Task 6's Playwright e2e test, which is the existing project convention for `main.ts`-level boot-flow behavior (mirrors how `enterWaterLab`/`enterSettlementLab` have no unit tests either, only e2e coverage). Skip to Step 2.

- [ ] **Step 2: Make the change**

```typescript
function _makeOverworld(seed: number, configOverride?: Partial<WorldGenConfig>): OverworldScene {
  console.log('[_makeOverworld] START seed=' + seed);
  // Always re-read so changes made in the Settings modal are picked up —
  // configOverride (Overworld Lab launch) layers on top WITHOUT persisting,
  // so the player's saved settings on disk are never touched.
  worldGenConfig = { ...loadWorldGenConfig(), ...configOverride };
  const cfg       = { ...worldGenConfig, seed };
  ...
```

```typescript
function switchToExterior(configOverride?: Partial<WorldGenConfig>): void {
  console.log('[switchToExterior] START gameMode=' + gameMode + ' overworld=' + !!overworld);
  sceneManager.unloadCurrentRoom();
  console.log('[switchToExterior] dungeon unloaded');
  if (!overworld) {
    console.log('[switchToExterior] creating overworld...');
    overworld = _makeOverworld(currentSeed, configOverride);
    console.log('[switchToExterior] overworld created');
  }
  ...
```

(Leave every other line in both functions untouched — this is a two-line signature change plus threading, not a rewrite.)

- [ ] **Step 3: Run the existing scene/main-adjacent suites to confirm no regression**

Run: `npx vitest run tests/scene/ tests/world/`
Expected: PASS, same counts as before this task (no test currently calls these functions with a second argument, so behavior for all existing callers is unchanged).

- [ ] **Step 4: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: same baseline count.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: allow switchToExterior() to accept a one-shot, non-persisted WorldGenConfig override"
```

---

### Task 3: Extend `DevRoomHandoff.ts` with `'overworld-lab'` + `OverworldLabLaunchParams`

**Files:**
- Modify: `src/overworld-studio/DevRoomHandoff.ts`
- Test: `tests/overworld-studio/DevRoomHandoff.test.ts`

**Interfaces:**
```typescript
export type DevRoomId = 'water-lab' | 'settlement-lab' | 'overworld-lab';

export interface OverworldLabLaunchParams {
  seed:            number;
  worldSize:       128 | 256 | 512;
  shape:           string;   // RealmShape, kept as string here to avoid importing RealmGenerator.ts's types into this DOM-adjacent module
  climate:         string;   // RealmClimate
  roughness:       number;
  settlementCount: number;
}

export function buildOverworldLabLaunchUrl(page: string, params: OverworldLabLaunchParams): string;
export function readPendingOverworldLabParams(): OverworldLabLaunchParams | null;
```
`readPendingDevRoom()`'s `validIds` array and `clearPendingDevRoom()`'s cleared-param list both need the new `ol_*` params added, following the exact existing `sl_*` pattern.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/overworld-studio/DevRoomHandoff.test.ts — add new describe block
describe('DevRoomHandoff — "Play in 3D" overworld-lab launch with carried-over realm params', () => {
  const SAMPLE: OverworldLabLaunchParams = {
    seed: 4242, worldSize: 256, shape: 'archipelago', climate: 'arctic',
    roughness: 0.73, settlementCount: 9,
  };

  it('buildOverworldLabLaunchUrl encodes devroom=overworld-lab plus all ol_* params', () => {
    const url = buildOverworldLabLaunchUrl('/index.html', SAMPLE);
    expect(url).toContain(`${DEV_ROOM_LAUNCH_PARAM}=overworld-lab`);
    expect(url).toContain('ol_seed=4242');
    expect(url).toContain('ol_worldsize=256');
    expect(url).toContain('ol_shape=archipelago');
    expect(url).toContain('ol_climate=arctic');
    expect(url).toContain('ol_roughness=0.73');
    expect(url).toContain('ol_settlements=9');
  });

  it('readPendingOverworldLabParams round-trips the exact params through the URL', () => {
    setLocation(buildOverworldLabLaunchUrl('/index.html', SAMPLE));
    expect(readPendingDevRoom()).toBe('overworld-lab');
    expect(readPendingOverworldLabParams()).toEqual(SAMPLE);
  });

  it('clearPendingDevRoom removes the ol_* params along with devroom', () => {
    setLocation(buildOverworldLabLaunchUrl('/index.html', SAMPLE));
    clearPendingDevRoom();
    expect(readPendingDevRoom()).toBeNull();
    expect(readPendingOverworldLabParams()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('readPendingOverworldLabParams returns null if seed is missing/non-numeric', () => {
    setLocation('/index.html?devroom=overworld-lab&ol_worldsize=256&ol_shape=island&ol_climate=temperate&ol_roughness=0.5&ol_settlements=6');
    expect(readPendingOverworldLabParams()).toBeNull();
  });

  it('readPendingOverworldLabParams falls back to null (not a crash) for a non-128/256/512 ol_worldsize', () => {
    setLocation('/index.html?devroom=overworld-lab&ol_seed=1&ol_worldsize=999&ol_shape=island&ol_climate=temperate&ol_roughness=0.5&ol_settlements=6');
    expect(readPendingOverworldLabParams()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/overworld-studio/DevRoomHandoff.test.ts`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement in `DevRoomHandoff.ts`**

Add `'overworld-lab'` to `DevRoomId`. Add the `OverworldLabLaunchParams` interface. Add param name constants (`OL_SEED_PARAM='ol_seed'`, `OL_WORLDSIZE_PARAM='ol_worldsize'`, `OL_SHAPE_PARAM='ol_shape'`, `OL_CLIMATE_PARAM='ol_climate'`, `OL_ROUGHNESS_PARAM='ol_roughness'`, `OL_SETTLEMENTS_PARAM='ol_settlements'`). Add `buildOverworldLabLaunchUrl()` mirroring `buildSettlementLabLaunchUrl()`'s structure exactly. Add `readPendingOverworldLabParams()` mirroring `readPendingSettlementLabParams()`, with an added validation step: `worldSize` must parse to exactly `128`, `256`, or `512` (reject/return `null` otherwise, per the last test above — this guards against a stale/tampered URL silently constructing an invalid `WorldGenConfig`). Update `readPendingDevRoom()`'s `validIds` array to include `'overworld-lab'`. Update `clearPendingDevRoom()`'s param-clearing loop to also strip the `ol_*` params.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/overworld-studio/DevRoomHandoff.test.ts`
Expected: PASS (all tests, old + new)

- [ ] **Step 5: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: baseline count.

- [ ] **Step 6: Commit**

```bash
git add src/overworld-studio/DevRoomHandoff.ts tests/overworld-studio/DevRoomHandoff.test.ts
git commit -m "feat: add overworld-lab devroom + launch-param handoff"
```

---

### Task 4: Add `enterOverworldLab()` to `main.ts` + wire the devroom boot handoff

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the closure function** (placed next to `enterSettlementLab`, ~line 1047)

```typescript
/** Jump straight into the live exterior overworld using a Studio-Realm-tab-
 *  carried-over WorldGenConfig override (Overworld Lab "Play in 3D"), instead
 *  of the player's own saved world settings. Never persists the override —
 *  see switchToExterior()'s configOverride parameter. */
function enterOverworldLab(params?: OverworldLabConfigOverride): void {
  gameMode = 'interior'; // ensure a clean base state before switching, mirrors enterSettlementLab
  switchToExterior(params);
}
```
(Define a small local type alias `type OverworldLabConfigOverride = Partial<WorldGenConfig> & { seed: number };` near the top of the file, next to the existing `RegenParams` import, OR inline the shape — match whichever is more consistent with how `RegenParams` is currently declared/imported for Settlement Lab.)

- [ ] **Step 2: Wire the devroom boot handoff** (~line 3425, alongside the existing `else if (_pendingDevRoom === 'settlement-lab')` branch)

```typescript
} else if (_pendingDevRoom === 'overworld-lab') {
  try {
    (window as any).__tttDevRoomStage = 'detected';
    mainMenu.hide();
    (window as any).__tttDevRoomStage = 'starting-game';
    _startDevPanelInGame();
    (window as any).__tttDevRoomStage = 'entering-overworld-lab';
    const olParams = readPendingOverworldLabParams();
    enterOverworldLab(olParams ? {
      seed: olParams.seed,
      worldSize: olParams.worldSize,
      shape: olParams.shape as RealmShape,
      climate: olParams.climate as RealmClimate,
      roughness: olParams.roughness,
      settlementCount: olParams.settlementCount,
    } : { seed: Math.floor(Math.random() * 0xFFFF_FFFF) });
    (window as any).__tttDevRoomStage = 'booted';
    (window as any).__tttDevRoomBooted = true;
    clearPendingDevRoom();
  } catch (e) {
    (window as any).__tttDevRoomStage = 'error';
    (window as any).__tttDevRoomError = String(e);
    console.error('[dev-room] boot failed:', e);
  }
}
```
Add `readPendingOverworldLabParams` to the existing `import { readPendingDevRoom, clearPendingDevRoom, readPendingSettlementLabParams } from '@/overworld-studio/DevRoomHandoff';` line. Add `import type { RealmShape, RealmClimate } from '@/world/RealmGenerator';` if not already present transitively.

- [ ] **Step 3: Expose the test hook** (next to `enterSettlementLab` in the `window.__game` object, ~line 1874)

```typescript
/** Jump straight into the Overworld Lab launch flow (for e2e tests). */
enterOverworldLab: (params?: OverworldLabConfigOverride) => enterOverworldLab(params),
```

- [ ] **Step 4: Manual smoke check via dev server**

Run: `npx vite --port 5322 --strictPort &` then open
`http://localhost:5322/index.html?devroom=overworld-lab&ol_seed=123&ol_worldsize=128&ol_shape=archipelago&ol_climate=arctic&ol_roughness=0.7&ol_settlements=8`
in a headless Playwright check (see Task 6) — confirms no console errors and `window.__game.getGameMode() === 'exterior'`.

- [ ] **Step 5: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: baseline count.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire overworld-lab devroom boot handoff (Play in 3D for Realm tab)"
```

---

### Task 5: Add the "🎮 Play in 3D" button to the Realm tab

**Files:**
- Modify: `overworld-studio.html` (button element, ~line 300-306, in the realm-controls "Export" section, right above `btn-save-realm`)
- Modify: `src/overworld-studio.ts` (click handler, next to the existing `btn-play-in-3d-lab` handler ~line 4437)

- [ ] **Step 1: Add the button markup**

In `overworld-studio.html`, inside `#realm-controls`'s "Export" section:
```html
<button class="btn" id="btn-play-in-3d-realm" style="width:100%">🎮 Play in 3D</button>
<button class="btn" id="btn-realm-png" style="width:100%">📷 PNG</button>
```
(Placed first/most-prominent in the Export section, matching how the Settlement tab's equivalent button is the primary action there.)

- [ ] **Step 2: Wire the click handler** in `src/overworld-studio.ts`, next to the existing `btn-preview-overworld`/`btn-play-in-3d-lab` handlers:

```typescript
document.getElementById('btn-play-in-3d-realm')?.addEventListener('click', () => {
  if (!currentRealmData) { alert('Generate a realm first.'); return; }
  const seed = parseInt(seedInput.value) || Date.now();
  const size = parseInt((document.getElementById('realm-size') as HTMLInputElement)?.value ?? '2');
  // Map the Studio's 1-5 realm-size preset to the closest square live WorldSize
  // (128/256/512) — see plan doc's "Known, deliberate approximation" note.
  const REALM_SIZE_TO_WORLD_SIZE: Record<number, 128 | 256 | 512> = { 1: 128, 2: 128, 3: 256, 4: 256, 5: 512 };
  const worldSize = REALM_SIZE_TO_WORLD_SIZE[size] ?? 128;
  const nS       = parseInt((document.getElementById('realm-settlements') as HTMLInputElement)?.value ?? '6');
  const shape    = (document.querySelector('#realm-shape-pills .pill.active') as HTMLElement)?.dataset.shape ?? 'island';
  const climate  = (document.querySelector('#realm-climate-pills .pill.active') as HTMLElement)?.dataset.climate ?? 'temperate';
  const roughness = parseFloat((document.getElementById('realm-roughness') as HTMLInputElement)?.value ?? '50') / 100;
  _showToast(`✓ Opening Overworld Lab for realm seed ${seed}`);
  window.open(buildOverworldLabLaunchUrl('/index.html', {
    seed, worldSize, shape, climate, roughness, settlementCount: nS,
  }), '_blank');
});
```
Add `buildOverworldLabLaunchUrl` to the existing `DevRoomHandoff` import line in `overworld-studio.ts`.

- [ ] **Step 3: Manual UI check**

Run the studio locally, generate a realm, click "🎮 Play in 3D", confirm a new tab opens with the URL containing all `ol_*` params and `devroom=overworld-lab`.

- [ ] **Step 4: `tsc --noEmit`**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: baseline count.

- [ ] **Step 5: Commit**

```bash
git add overworld-studio.html src/overworld-studio.ts
git commit -m "feat(studio): add Play in 3D button to Realm tab"
```

---

### Task 6: Playwright e2e launch-flow smoke test

**Files:**
- Create (throwaway during dev, or permanent if the project's e2e convention keeps dev-room smoke tests long-term — check `tests/e2e/` for an existing permanent `settlement-lab` launch spec and mirror whichever convention it uses): `tests/e2e/overworld-lab-launch.spec.ts`

- [ ] **Step 1: Check for precedent** — `grep -rl "settlement-lab" tests/e2e/*.spec.ts` to see if there's a permanent (not `_tmp_`) e2e spec for the Settlement Lab launch flow; if so, mirror its exact structure/location for this new spec instead of inventing a new pattern.

- [ ] **Step 2: Write the test**

```typescript
import { test, expect } from '@playwright/test';

test('overworld-lab devroom launch boots exterior overworld with carried-over realm config', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/index.html?devroom=overworld-lab&ol_seed=555&ol_worldsize=128&ol_shape=continents&ol_climate=tropical&ol_roughness=0.6&ol_settlements=10');
  await page.waitForFunction(() => (window as any).__game?.getGameMode?.() === 'exterior', { timeout: 20000 });

  const mode = await page.evaluate(() => (window as any).__game.getGameMode());
  expect(mode).toBe('exterior');
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/e2e/overworld-lab-launch.spec.ts`
Expected: PASS, no console/page errors.

- [ ] **Step 4: Clean up** any throwaway dev-server/report artifacts per project convention (kill dedicated dev server if one was started for this test run, remove `test-results`/`playwright-report` if generated).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/overworld-lab-launch.spec.ts
git commit -m "test(e2e): add overworld-lab devroom launch smoke test"
```

---

### Task 7: Full regression suite + plan doc completion writeup

- [ ] **Step 1:** Run: `npx vitest run` (or the project's standard full-suite command) — confirm no new failures vs. established baseline.
- [ ] **Step 2:** Run: `npx tsc --noEmit` — confirm baseline error count.
- [ ] **Step 3:** Manual Playwright screenshot of the booted Overworld Lab world (a couple of different `shape`/`climate` combinations) to visually confirm terrain/settlements/rivers render correctly, no regressions vs. normal "New Game" boot.
- [ ] **Step 4:** Append a "Status: DONE" section to the top of this doc summarizing what shipped, test counts, and any deviations from plan (following the project's established convention, see `2026-08-29-settlement-visual-fidelity.md` phase writeups for format).
- [ ] **Step 5:** Mark the corresponding SQL todo `done`.
