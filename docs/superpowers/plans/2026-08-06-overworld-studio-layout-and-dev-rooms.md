# Overworld Studio Layout + Dev Rooms (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Overworld Studio's horizontal-scrolling sidebar by rebuilding its
styling on the repo's existing Tailwind + daisyui stack, and add a "Dev
Rooms" section with a one-click Water Lab launcher that boots the actual
game straight into the Water Lab scene.

**Architecture:** Overworld Studio (`overworld-studio.html` +
`src/overworld-studio.ts`) is a framework-free page. Its sidebar's inline
`<style>` block gets replaced by a Tailwind/daisyui-authored stylesheet
(`src/overworld-studio.css`, imported from the `.ts` entry point), following
the exact precedent already used by `model-review.html` /
`src/model-review.css` in this repo. All existing `id`/`class`/`data-*`
hooks that `overworld-studio.ts`'s event listeners depend on are preserved
verbatim — only the CSS implementation and a couple of small HTML additions
change. A new "Dev Rooms" section (persistent across all studio tabs) gets
a "🌊 Water Lab" button that generalizes the existing settlement-preview
localStorage handoff pattern to boot the main game directly into the Water
Lab, bypassing the main menu/character creation.

**Tech Stack:** TypeScript, Vite, Tailwind CSS 3.4 + daisyui (already
installed, already used by `model-review.html`), Playwright for e2e tests.

## Global Constraints

- Every `id`, `class`, and `data-*` attribute that `src/overworld-studio.ts`
  currently reads via `document.getElementById` / `querySelector` /
  `closest('.studio-tab')` / `dataset.*` must be preserved unchanged — no
  functional TypeScript wiring is being touched in this plan.
- No change to settlement/dungeon/cave/realm/solar generation logic, canvas
  rendering, or the map toolbar.
- No drag-resizable sidebar, no collapsible/accordion sections, no settings
  button/theme switcher — those are out of scope (Phase 2).
- daisyui theme stays `night` (matches today's dark look) — no theme
  switching logic in this phase.
- Existing e2e specs (`overworld-studio-asset-library.spec.ts`,
  `overworld-studio-layer-navigation.spec.ts`,
  `overworld-studio-world-package-export.spec.ts`,
  `overworld-studio-overworld-preview.spec.ts`) must keep passing unchanged.

---

### Task 1: Wire Tailwind/daisyui into Overworld Studio + fix sidebar overflow

**Files:**
- Create: `src/overworld-studio.css`
- Modify: `tailwind.config.cjs`
- Modify: `overworld-studio.html:1-223` (head + sidebar opening)
- Modify: `src/overworld-studio.ts:20-21` (add CSS import after existing imports)
- Test: `tests/e2e/overworld-studio-sidebar-layout.spec.ts` (new)

**Interfaces:**
- Consumes: nothing new (pure styling change).
- Produces: nothing consumed by later tasks — Task 2 only adds new markup
  inside the already-widened `.sidebar`, it doesn't depend on any new
  export from this task.

- [ ] **Step 1: Write the failing sidebar-overflow e2e test**

Create `tests/e2e/overworld-studio-sidebar-layout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const STUDIO_TABS = ['settlement', 'dungeon', 'cave', 'realm', 'solar'] as const;

test('sidebar never needs horizontal scrolling in any studio tab', async ({ page }) => {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });

  for (const mode of STUDIO_TABS) {
    await page.click(`.studio-tab[data-mode="${mode}"]`);
    await page.waitForTimeout(200);
    const overflow = await page
      .locator('.sidebar')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(
      overflow,
      `sidebar overflows horizontally in "${mode}" tab by ${overflow}px`,
    ).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/overworld-studio-sidebar-layout.spec.ts`
Expected: FAIL — the `settlement` tab's `#layout-pills` row (8 buttons,
missing the `pill-row--wrap` modifier every other multi-item pill row has)
overflows the 220px sidebar, and because `.sidebar` only sets
`overflow-y: auto` (leaving `overflow-x` to compute to `auto` per the CSS
overflow spec), the *entire* sidebar horizontal-scrolls.

- [ ] **Step 3: Create `src/overworld-studio.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
  }
}

/* ── JS-driven states + structural classes (kept as selectors so the ─────
   existing overworld-studio.ts event-wiring — classList.add/remove/toggle
   on .pill, .active, .studio-tab, .tool-btn, etc. — needs zero changes) ── */
@layer components {
  /* ── Header ── */
  header {
    @apply flex items-center gap-3 px-4 py-2 bg-base-200 border-b border-base-300 flex-shrink-0;
  }
  header h1 { @apply text-sm font-bold text-primary tracking-widest; }
  header .sep { @apply text-base-300; }

  .seed-row { @apply flex items-center gap-1.5 ml-auto; }
  .seed-row label { @apply text-base-content/40 text-[11px]; }
  #seed-input {
    @apply w-[100px] bg-base-100 border border-base-300 text-base-content px-[7px] py-[3px] rounded text-[11px];
    font-family: 'Fira Mono', 'Consolas', monospace;
  }
  .btn {
    @apply bg-base-200 border border-base-300 text-base-content px-2.5 py-1 rounded cursor-pointer text-xs transition-colors;
  }
  .btn:hover { @apply border-primary text-primary; }
  .btn.primary { @apply bg-primary text-primary-content border-primary; }
  .btn.primary:hover { @apply opacity-85; }

  /* ── Main layout ── */
  .workspace { @apply flex flex-1 overflow-hidden; }

  /* ── Canvas area ── */
  .canvas-wrap { @apply flex-1 relative overflow-hidden bg-base-100; }
  #map-canvas { @apply absolute inset-0 w-full h-full cursor-default; }
  #map-canvas.tool-warp { @apply cursor-crosshair; }
  #map-canvas.tool-warp.dragging { @apply cursor-grabbing; }
  #overlay-canvas { @apply absolute inset-0 w-full h-full pointer-events-none; }

  .map-toolbar { @apply absolute top-2.5 left-2.5 z-10 flex gap-1; }
  .tool-btn {
    @apply w-8 h-8 rounded-md bg-base-200/90 border border-base-300 text-base-content/40 cursor-pointer text-sm flex items-center justify-center transition-all backdrop-blur-sm;
  }
  .tool-btn:hover { @apply border-primary text-primary; }
  .tool-btn.active { @apply bg-primary border-primary text-primary-content; }
  .gen-time {
    @apply absolute bottom-2 left-3 text-[10px] text-base-content/40 pointer-events-none;
    font-family: 'Fira Mono', 'Consolas', monospace;
  }

  /* ── Sidebar ── */
  .sidebar {
    @apply w-72 bg-base-200 border-l border-base-300 flex flex-col overflow-y-auto overflow-x-hidden flex-shrink-0;
  }
  .section { @apply px-3 py-2.5 border-b border-base-300; }
  .section-title { @apply text-[9px] tracking-widest uppercase text-base-content/40 mb-2; }

  /* ── Studio mode tabs ── */
  .studio-tabs { @apply flex border-b border-base-300 flex-shrink-0; }
  .studio-tab {
    @apply flex-1 py-1.5 px-1 text-[11px] font-semibold tracking-wide cursor-pointer border-0 bg-transparent text-base-content/40 border-b-2 border-transparent transition-colors -mb-px;
  }
  .studio-tab:hover { @apply text-base-content; }
  .studio-tab.active { @apply text-primary border-primary; }

  /* ── Planet settlement labels (CSS2DRenderer) ── */
  .planet-label { @apply pointer-events-none; }

  /* ── Pills ── */
  .pill-row { @apply flex flex-nowrap gap-1; }
  .pill-row--wrap { @apply flex-wrap; }
  .pill {
    @apply py-[3px] px-2 rounded-full cursor-pointer text-[11px] border border-base-300 bg-transparent text-base-content transition-colors;
  }
  .pill:hover { @apply border-primary; }
  .pill.active { @apply bg-primary border-primary text-primary-content; }

  /* ── Sliders ── */
  .slider-row { @apply flex flex-col gap-1 mb-2; }
  .slider-label { @apply flex justify-between text-[11px] text-base-content/40; }
  input[type=range] { @apply w-full h-3.5 accent-[hsl(var(--p))]; }

  /* ── Ward legend ── */
  .legend-row { @apply flex items-center gap-1.5 mb-1 text-[11px]; }
  .swatch { @apply w-3 h-3 rounded-sm flex-shrink-0; }

  /* ── Status bar ── */
  footer {
    @apply px-3 py-1 bg-base-200 border-t border-base-300 text-[10px] text-base-content/40 flex gap-4 flex-shrink-0;
  }
  footer span { font-family: 'Fira Mono', 'Consolas', monospace; }
  .status-key { @apply text-base-300; }
}
```

- [ ] **Step 4: Update `tailwind.config.cjs` content globs**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './model-review.html',
    './src/model-review.ts',
    './src/editor/**/*.ts',
    './overworld-studio.html',
    './src/overworld-studio.ts',
  ],
  theme: { extend: {} },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['night'],
    logs: false,
  },
}
```

- [ ] **Step 5: Rewrite `overworld-studio.html`'s `<head>` and opening body tags**

Replace lines 1–183 (everything from `<!DOCTYPE html>` through `<body>`) with:

```html
<!DOCTYPE html>
<html lang="en" data-theme="night">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Overworld Studio — TT&T</title>
</head>
<body class="bg-base-100 text-base-content text-[13px] h-screen flex flex-col overflow-hidden">
```

This removes the entire hand-rolled `<style>` block (CSS variables, header,
sidebar, pill, tab, slider, footer rules) — all of it now lives in
`src/overworld-studio.css`, imported via the TypeScript entry point (Step
7), exactly like `model-review.html` does with `model-review.css`.

- [ ] **Step 6: Widen the sidebar and fix the `layout-pills` overflow bug**

In the `<aside class="sidebar">` block, find:

```html
        <div class="pill-row" id="layout-pills">
```

Replace with:

```html
        <div class="pill-row pill-row--wrap" id="layout-pills">
```

(The `.sidebar` class itself already got its `w-72` width and
`overflow-x-hidden` from the new CSS file in Step 3 — no further HTML
change needed for the width fix.)

- [ ] **Step 7: Import the new stylesheet from the TypeScript entry point**

In `src/overworld-studio.ts`, after the last import (the
`SettlementPreviewPayload` import block), add:

```ts
import './overworld-studio.css';
```

- [ ] **Step 8: Run the sidebar-overflow test to verify it passes**

Run: `npx playwright test tests/e2e/overworld-studio-sidebar-layout.spec.ts`
Expected: PASS for all 5 tabs.

- [ ] **Step 9: Run the existing Overworld Studio e2e regression suite**

Run: `npx playwright test tests/e2e/overworld-studio-asset-library.spec.ts tests/e2e/overworld-studio-layer-navigation.spec.ts tests/e2e/overworld-studio-world-package-export.spec.ts tests/e2e/overworld-studio-overworld-preview.spec.ts`
Expected: All existing tests PASS unchanged (they only depend on
`.studio-tab[data-mode=...]` and button `id`s, both preserved).

- [ ] **Step 10: Run the production build to confirm no compile/bundle errors**

Run: `npm run build`
Expected: Succeeds (`tsc` + `vite build`) with no new errors.

- [ ] **Step 11: Commit**

```bash
git add src/overworld-studio.css tailwind.config.cjs overworld-studio.html src/overworld-studio.ts tests/e2e/overworld-studio-sidebar-layout.spec.ts
git commit -m "feat(overworld-studio): rebuild sidebar on Tailwind/daisyui, fix overflow bug"
```

---

### Task 2: Add "Dev Rooms" section + Water Lab launch handoff module

**Files:**
- Create: `src/overworld-studio/DevRoomHandoff.ts`
- Modify: `overworld-studio.html` (insert Dev Rooms section markup)
- Modify: `src/overworld-studio.ts` (import handoff module + wire button click)

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `DEV_ROOM_LAUNCH_KEY: string` (localStorage key name) and
  `type DevRoomId = 'water-lab'` from `src/overworld-studio/DevRoomHandoff.ts`
  — Task 3 imports both of these in `src/main.ts`.

- [ ] **Step 1: Create `src/overworld-studio/DevRoomHandoff.ts`**

```ts
/**
 * DevRoomHandoff — generalizes the "open the real game straight into a
 * specific dev/test room" pattern used by the Water Lab quick-launch
 * button in Overworld Studio. Adding a future dev room is: one more
 * DevRoomId union member, one more button in the Dev Rooms section, and
 * one more `case` in main.ts's boot handoff.
 */
export const DEV_ROOM_LAUNCH_KEY = 'ttt_dev_room_launch';

export type DevRoomId = 'water-lab';
```

- [ ] **Step 2: Insert the "Dev Rooms" section markup**

In `overworld-studio.html`, find the studio mode tabs opening block:

```html
      <!-- ── Studio mode tabs ─────────────────────────────────────── -->
      <div class="studio-tabs" id="studio-tabs">
```

Replace with (adding the new section immediately above it, so it renders
above the tabs and stays visible regardless of which tab is active — the
existing tab-switching code in `overworld-studio.ts` only toggles
`#settlement-controls` / `#dungeon-controls` / `#cave-controls` /
`#realm-controls` / `#solar-controls`, none of which wrap this new block):

```html
      <!-- ── Dev Rooms (always visible, independent of studio tab) ──── -->
      <div class="section" id="dev-rooms-section">
        <div class="section-title">🧪 Dev Rooms</div>
        <div class="flex flex-col gap-1.5">
          <button class="btn" id="btn-devroom-water-lab" style="width:100%">🌊 Water Lab</button>
        </div>
      </div>

      <!-- ── Studio mode tabs ─────────────────────────────────────── -->
      <div class="studio-tabs" id="studio-tabs">
```

- [ ] **Step 3: Wire the Water Lab button in `src/overworld-studio.ts`**

Add the import near the other `./overworld-studio/*` imports at the top of
the file:

```ts
import { DEV_ROOM_LAUNCH_KEY, type DevRoomId } from './overworld-studio/DevRoomHandoff';
```

Then, directly after the existing `btn-preview-overworld` click handler
(the block ending `window.open('/index.html', '_blank'); });`), add:

```ts
document.getElementById('btn-devroom-water-lab')?.addEventListener('click', () => {
  localStorage.setItem(DEV_ROOM_LAUNCH_KEY, 'water-lab' satisfies DevRoomId);
  _showToast('✓ Opening Water Lab');
  window.open('/index.html', '_blank');
});
```

- [ ] **Step 4: Run the existing Overworld Studio e2e regression suite**

Run: `npx playwright test tests/e2e/overworld-studio-asset-library.spec.ts tests/e2e/overworld-studio-layer-navigation.spec.ts tests/e2e/overworld-studio-world-package-export.spec.ts tests/e2e/overworld-studio-overworld-preview.spec.ts tests/e2e/overworld-studio-sidebar-layout.spec.ts`
Expected: All PASS — the new section doesn't interfere with tab switching
or the sidebar-overflow check (it's a short single-button section).

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: Succeeds with no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/overworld-studio/DevRoomHandoff.ts overworld-studio.html src/overworld-studio.ts
git commit -m "feat(overworld-studio): add Dev Rooms section with Water Lab launcher"
```

---

### Task 3: Wire the Water Lab boot handoff in `src/main.ts`

**Files:**
- Modify: `src/main.ts:85` (add import)
- Modify: `src/main.ts:977` (extract `enterWaterLab` as a named function)
- Modify: `src/main.ts:1240-1254` (reference the extracted function)
- Modify: `src/main.ts:1556` (read the pending dev-room key)
- Modify: `src/main.ts:3037-3054` (deferred boot handoff)

**Interfaces:**
- Consumes: `DEV_ROOM_LAUNCH_KEY`, `type DevRoomId` from
  `@/overworld-studio/DevRoomHandoff` (Task 2).
- Produces: `function enterWaterLab(): void` — a named function in
  `main()`'s closure scope, referenced both by the Dev Sandbox's
  `onEnterWaterLab` option and by this task's boot handoff. Nothing outside
  this task consumes it.

- [ ] **Step 1: Add the import**

In `src/main.ts`, after the existing:

```ts
import { OVERWORLD_SETTLEMENT_PREVIEW_KEY } from '@/overworld-studio/SettlementPreviewPayload';
```

add:

```ts
import { DEV_ROOM_LAUNCH_KEY, type DevRoomId } from '@/overworld-studio/DevRoomHandoff';
```

- [ ] **Step 2: Extract `enterWaterLab` as a named function**

Find the comment block just before `function _startDevPanelInGame(): void {`
(around line 970-977):

```ts
  // ── Sandbox mode helpers ──────────────────────────────────────────────────
  // NOTE: the main-menu "Dev Lab" button now links directly to Overworld
  // Studio (see onDevLab above). The in-game Dev Panel (Spell Lab / Enemy
  // Lab / Creature Creator / Cheats) previously reached via a launcher modal
  // here is preserved and now opened with the Insert key while in dev mode
  // (see the keydown handler below), so no functionality is lost.

  function _startDevPanelInGame(): void {
```

Insert a new named function between the comment block and
`_startDevPanelInGame`:

```ts
  // ── Sandbox mode helpers ──────────────────────────────────────────────────
  // NOTE: the main-menu "Dev Lab" button now links directly to Overworld
  // Studio (see onDevLab above). The in-game Dev Panel (Spell Lab / Enemy
  // Lab / Creature Creator / Cheats) previously reached via a launcher modal
  // here is preserved and now opened with the Insert key while in dev mode
  // (see the keydown handler below), so no functionality is lost.

  /**
   * Enters the Water Lab test room. Used both as the Dev Sandbox's
   * "🌊 Water Lab" button callback and by the Overworld Studio dev-room
   * boot handoff (see the deferred handoff block near the end of main()).
   */
  function enterWaterLab(): void {
    if (gameMode === 'waterlab') return; // already there — no-op
    // Tear down whatever's currently active (overworld or dungeon room)
    if (gameMode === 'exterior') {
      overworld?.exit();
      gameMode = 'interior';
    }
    sceneManager.unloadCurrentRoom();
    if (!waterLab) waterLab = new WaterLabScene(scene, physics, player);
    waterLab.enter();
    gameMode = 'waterlab';
    player.teleport(new THREE.Vector3(-9, 1.5, 0)); // spawn on the dry bank
    scene.fog = null;
    _sandboxUi?.setLocation('lab');
  }

  function _startDevPanelInGame(): void {
```

- [ ] **Step 3: Replace the inline `onEnterWaterLab` callback with a reference to the extracted function**

Find, inside the `DevSandbox` options object passed to
`new DevSandbox({...})`:

```ts
      onEnterWaterLab: () => {
        if (gameMode === 'waterlab') return; // already there — no-op
        // Tear down whatever's currently active (overworld or dungeon room)
        if (gameMode === 'exterior') {
          overworld?.exit();
          gameMode = 'interior';
        }
        sceneManager.unloadCurrentRoom();
        if (!waterLab) waterLab = new WaterLabScene(scene, physics, player);
        waterLab.enter();
        gameMode = 'waterlab';
        player.teleport(new THREE.Vector3(-9, 1.5, 0)); // spawn on the dry bank
        scene.fog = null;
        _sandboxUi?.setLocation('lab');
      },
```

Replace with:

```ts
      onEnterWaterLab: enterWaterLab,
```

- [ ] **Step 4: Read the pending dev-room key at boot**

Find:

```ts
  const _pendingOverworldPreview = localStorage.getItem(OVERWORLD_SETTLEMENT_PREVIEW_KEY);
  mainMenu.show();
```

Replace with:

```ts
  const _pendingOverworldPreview = localStorage.getItem(OVERWORLD_SETTLEMENT_PREVIEW_KEY);
  const _pendingDevRoom = localStorage.getItem(DEV_ROOM_LAUNCH_KEY) as DevRoomId | null;
  mainMenu.show();
```

- [ ] **Step 5: Add the deferred dev-room boot handoff**

Find the existing deferred settlement-preview handoff near the end of
`main()`:

```ts
  // ── Deferred Overworld Studio settlement preview handoff ─────────────────
  if (_pendingOverworldPreview) {
    try {
      (window as any).__tttOverworldPreviewStage = 'detected';
      mainMenu.hide();
      (window as any).__tttOverworldPreviewStage = 'starting-game';
      startGame();
      (window as any).__tttOverworldPreviewStage = 'switching-exterior';
      switchToExterior();
      (window as any).__tttOverworldPreviewStage = 'booted';
      (window as any).__tttOverworldPreviewBooted = true;
      localStorage.removeItem(OVERWORLD_SETTLEMENT_PREVIEW_KEY);
    } catch (e) {
      (window as any).__tttOverworldPreviewStage = 'error';
      (window as any).__tttOverworldPreviewError = String(e);
      console.error('[overworld-preview] boot failed:', e);
    }
  }
}
```

Replace with (adding the new block right after it, still inside `main()`,
before the closing `}`):

```ts
  // ── Deferred Overworld Studio settlement preview handoff ─────────────────
  if (_pendingOverworldPreview) {
    try {
      (window as any).__tttOverworldPreviewStage = 'detected';
      mainMenu.hide();
      (window as any).__tttOverworldPreviewStage = 'starting-game';
      startGame();
      (window as any).__tttOverworldPreviewStage = 'switching-exterior';
      switchToExterior();
      (window as any).__tttOverworldPreviewStage = 'booted';
      (window as any).__tttOverworldPreviewBooted = true;
      localStorage.removeItem(OVERWORLD_SETTLEMENT_PREVIEW_KEY);
    } catch (e) {
      (window as any).__tttOverworldPreviewStage = 'error';
      (window as any).__tttOverworldPreviewError = String(e);
      console.error('[overworld-preview] boot failed:', e);
    }
  }

  // ── Deferred Overworld Studio dev-room boot handoff ───────────────────────
  // Set by the "🧪 Dev Rooms" section in Overworld Studio (see
  // src/overworld-studio/DevRoomHandoff.ts) — opens this page in a new tab
  // and asks it to boot straight into a specific dev/test room, skipping
  // the main menu and character creation entirely.
  if (_pendingDevRoom === 'water-lab') {
    try {
      (window as any).__tttDevRoomStage = 'detected';
      mainMenu.hide();
      (window as any).__tttDevRoomStage = 'starting-game';
      _startDevPanelInGame();
      (window as any).__tttDevRoomStage = 'entering-water-lab';
      enterWaterLab();
      (window as any).__tttDevRoomStage = 'booted';
      (window as any).__tttDevRoomBooted = true;
      localStorage.removeItem(DEV_ROOM_LAUNCH_KEY);
    } catch (e) {
      (window as any).__tttDevRoomStage = 'error';
      (window as any).__tttDevRoomError = String(e);
      console.error('[dev-room] boot failed:', e);
    }
  }
}
```

- [ ] **Step 6: Run the full Vitest suite to check for regressions**

Run: `npm test`
Expected: Same pass/fail counts as before this task (this is a pure
extraction/wiring change — `enterWaterLab()`'s body is byte-identical to
the old inline callback, just given a name and called from one more place).

- [ ] **Step 7: Run tsc to check for type errors**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 8: Manually verify the boot handoff**

Run: `npm run dev` in one terminal, then in a browser:
1. Open `http://localhost:5174/overworld-studio.html`.
2. Open the browser console and run:
   `localStorage.setItem('ttt_dev_room_launch', 'water-lab')`
3. Navigate to `http://localhost:5174/index.html`.
4. Confirm the game boots straight into the Water Lab (no main menu, no
   character creation) and the player spawns on the dry bank able to walk
   into and swim in the basin.
5. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire Overworld Studio Water Lab boot handoff"
```

---

### Task 4: Add end-to-end test for the full Water Lab launch flow

**Files:**
- Create: `tests/e2e/overworld-studio-water-lab-launch.spec.ts`

**Interfaces:**
- Consumes: `__tttDevRoomStage`, `__tttDevRoomBooted`, `__tttDevRoomError`
  window hooks and `window.__game.getGameMode()` (all from Task 3);
  `#btn-devroom-water-lab` (from Task 2).
- Produces: nothing consumed elsewhere — this is the final regression test
  for the feature.

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/overworld-studio-water-lab-launch.spec.ts`, mirroring the
existing `overworld-studio-overworld-preview.spec.ts` pattern:

```ts
import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('Dev Rooms "Water Lab" button boots the game straight into the Water Lab', async ({ page, context }) => {
  const studioConsole = attachFullConsoleCapture(page);
  await openStudio(page);

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#btn-devroom-water-lab'),
  ]);

  const popupConsole = attachFullConsoleCapture(popup);
  await popup.waitForURL(/\/index\.html(?:$|\?)/, { timeout: 20_000 });
  await popup.waitForLoadState('domcontentloaded');

  let state: {
    stage: string | null;
    error: string | null;
    booted: boolean;
    mode: string | null;
    hasGameHook: boolean;
  } | null = null;

  for (let i = 0; i < 30; i++) {
    state = await popup.evaluate(() => ({
      stage: (window as any).__tttDevRoomStage ?? null,
      error: (window as any).__tttDevRoomError ?? null,
      booted: (window as any).__tttDevRoomBooted ?? false,
      mode: (window as any).__game?.getGameMode?.() ?? null,
      hasGameHook: !!(window as any).__game,
    }));
    if (state.error) break;
    if (state.mode === 'waterlab') break;
    await popup.waitForTimeout(2000);
  }

  expect(state, 'Popup state was never captured').toBeTruthy();
  expect(state?.error, `Dev room popup reported boot error: ${JSON.stringify(state, null, 2)}`).toBeFalsy();
  expect(state?.booted, `Dev room popup never marked booted: ${JSON.stringify(state, null, 2)}`).toBe(true);
  expect(state?.mode, `Dev room popup never reached waterlab: ${JSON.stringify(state, null, 2)}`).toBe('waterlab');

  const studioErrors = studioConsole.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(studioErrors, `Unexpected Studio console/page errors:\n${studioConsole.all.join('\n')}`).toHaveLength(0);

  const popupErrors = popupConsole.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(popupErrors, `Unexpected game console/page errors:\n${popupConsole.all.join('\n')}`).toHaveLength(0);
});
```

- [ ] **Step 2: Run the new test**

Run: `npx playwright test tests/e2e/overworld-studio-water-lab-launch.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run the full Overworld Studio + Water Lab e2e regression suite**

Run: `npx playwright test tests/e2e/overworld-studio-asset-library.spec.ts tests/e2e/overworld-studio-layer-navigation.spec.ts tests/e2e/overworld-studio-world-package-export.spec.ts tests/e2e/overworld-studio-overworld-preview.spec.ts tests/e2e/overworld-studio-sidebar-layout.spec.ts tests/e2e/overworld-studio-water-lab-launch.spec.ts tests/e2e/water-lab.spec.ts`
Expected: All PASS.

- [ ] **Step 4: Run the full Vitest suite one final time**

Run: `npm test`
Expected: Same baseline pass/fail counts as before this plan started (no
unit-test-level logic changed anywhere in this plan).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/overworld-studio-water-lab-launch.spec.ts
git commit -m "test: add e2e coverage for Overworld Studio Water Lab launch handoff"
```

## Self-Review Notes

- **Spec coverage:** Sidebar overflow fix ✓ (Task 1), Tailwind/daisyui
  foundation with semantic tokens for Phase 2 theming ✓ (Task 1), wider
  sidebar ✓ (Task 1, via `.sidebar`'s `w-72`), persistent "Dev Rooms"
  section ✓ (Task 2), one-click Water Lab launch bypassing main
  menu/character creation ✓ (Tasks 2–3), extensible mechanism for future
  dev rooms ✓ (`DevRoomId` union + one `case`-style `if` in the boot
  handoff), e2e coverage for both the bug fix and the new feature ✓ (Tasks
  1 and 4), no changes to generation logic/TS event-wiring architecture ✓
  (only `overworld-studio.ts` additions are two new listeners, no existing
  code touched).
- **Type consistency:** `DevRoomId` is defined once in
  `DevRoomHandoff.ts` (Task 2) and imported identically in both
  `overworld-studio.ts` (Task 2) and `main.ts` (Task 3) — no divergence.
  `enterWaterLab(): void` matches `DevSandboxOptions.onEnterWaterLab: () =>
  void` exactly (verified against `src/ui/DevSandbox.ts:37`).
- **No placeholders:** every step shows complete, copy-pasteable code;
  no "add validation" or "similar to Task N" shortcuts.
