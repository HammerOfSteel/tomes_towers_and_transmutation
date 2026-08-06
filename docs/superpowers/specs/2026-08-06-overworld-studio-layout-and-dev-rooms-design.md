# Overworld Studio — Sidebar Layout Rework + Dev Rooms (Phase 1) — Design

**Date:** 2026-08-06
**Branch:** `terrygoleman-water-lab-polish-continuation`
**Trigger:** After completing the Water Lab + swim mode work, the user
tried to play-test it and found the only path in is: enable dev mode via
`localStorage`, load into a game, press `Insert`, open the Dev Sandbox
panel, click "🌊 Water Lab". Too much friction for something they'll want
to jump into repeatedly while iterating. Separately, the user reported
that Overworld Studio's (`overworld-studio.html`) left sidebar currently
needs horizontal scrolling to see all of its controls.

This is **Phase 1** of a two-phase effort. Phase 2 (a settings panel with
layout and light/dark theme options) is a separate follow-on spec, built
on top of the component foundation laid down here.

## Problem

1. **Overworld Studio's sidebar horizontal-scrolls.** The sidebar is a
   fixed `220px`-wide flex column (`overworld-studio.html`). The "Street
   Layout" pill row (`#layout-pills`, 8 buttons: Auto, Organic, Terrace,
   Grid, Perim., Cluster, Linear, Radial) is the *only* multi-item pill row
   in the file missing the `.pill-row--wrap` modifier that every other
   pill row uses. Because the sidebar sets `overflow-y: auto` without an
   explicit `overflow-x`, the browser computes `overflow-x: auto` too (per
   the CSS overflow spec), so the unwrapped row forces the *entire*
   sidebar into horizontal-scroll — not just that one row.
2. **No quick way to reach the Water Lab (or future dev/test rooms).**
   Water Lab is presently only reachable via the in-game Dev Sandbox panel,
   which itself requires dev mode + a running game + several clicks. There
   is no entry point from Overworld Studio, the tool where a lot of this
   iteration work already happens.
3. **The sidebar's styling doesn't scale.** It's a single hand-rolled
   `<style>` block of CSS variables and ad-hoc classes. The user wants a
   cleaner, component-based structure — using Tailwind/daisyui, which this
   repo already has installed and already uses for `model-review.html` —
   so that a Phase 2 settings panel (layout switcher, light/dark themes)
   can be built on solid ground instead of bolted onto brittle hand-rolled
   CSS.

## Goals

- Fix the sidebar overflow bug so no part of Overworld Studio ever needs
  horizontal scrolling.
- Rebuild the sidebar's HTML/CSS on Tailwind + daisyui (mirroring the
  existing `model-review.html` / `model-review.css` pattern in this repo),
  using daisyui semantic tokens so Phase 2 theming is a `data-theme`
  attribute change, not a rewrite.
- Add a persistent **"🧪 Dev Rooms"** section to the sidebar, visible above
  the Settlement/Dungeon/Cave/Realm/Solar tabs regardless of which tab is
  active, containing a **"🌊 Water Lab"** button that opens the actual game
  in a new tab and drops the player straight into the Water Lab — no main
  menu, no character creation, no manual Insert-key/Dev-Sandbox detour.
- Structure the Dev Rooms section and its launch mechanism so adding a
  second/third dev room later is trivial (one button + one `case`, no
  structural change).
- Widen the sidebar slightly (`220px` → `288px`, Tailwind `w-72`) for
  breathing room now that content is denser.

## Non-goals (out of scope for this pass)

- The settings button, 3 layout options, and 3 light/dark themes — that's
  Phase 2, built on top of this phase's Tailwind/daisyui foundation.
- Splitting the ~4500-line `src/overworld-studio.ts` event-wiring code into
  per-panel modules. This pass only touches HTML/CSS structure; all
  existing `id`/`class`/`data-*` hooks that the TS file's
  `querySelector`/`addEventListener` calls depend on are preserved
  unchanged.
- A drag-resizable sidebar.
- Collapsible/accordion sections — sections stay always-expanded, matching
  today's behavior, just restyled.
- Any change to the actual settlement/dungeon/cave/realm/solar generation
  logic, canvas rendering, or map toolbar.

## Design

### 1. Tailwind/daisyui wiring

Follows the exact precedent already in this repo (`model-review.html` +
`src/model-review.css`):

- New `src/overworld-studio.css`:
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  @layer components {
    .pill { @apply btn btn-xs rounded-full ...; }
    .pill.active { @apply bg-primary text-primary-content border-primary; }
    .studio-tab.active { @apply text-primary border-primary; }
    /* etc. — one @apply rule per existing JS-toggled class */
  }
  ```
  All class names the TypeScript file currently toggles via
  `classList.add/remove/toggle` (`.pill`, `.active`, `.studio-tab`,
  `.tool-btn`, `.section`, …) are kept as-is; only their *implementation*
  moves from hardcoded CSS-variable colors to Tailwind/daisyui utilities
  and semantic tokens (`base-100`, `base-content`, `primary`, …).
- `import './overworld-studio.css';` added to the top of
  `src/overworld-studio.ts`; the inline `<style>` block is removed from
  `overworld-studio.html`.
- `tailwind.config.cjs` `content` array gains `'./overworld-studio.html'`
  and `'./src/overworld-studio.ts'`.
- daisyui theme stays `night` (matches today's dark look) — no theme
  switching logic yet, that's Phase 2.

### 2. Sidebar structure changes

- Sidebar container: `w-72` (288px) instead of the old fixed `220px`,
  `overflow-y-auto overflow-x-hidden` set explicitly (belt-and-suspenders
  against the overflow-computation issue recurring).
- **Root-cause fix:** add `pill-row--wrap` to `#layout-pills` (the missing
  modifier). Also audit every `.pill-row` in the file to confirm all
  others already wrap correctly or are short enough not to need it (they
  are — verified: `type-pills` (3), `dungeon-type-pills` (2),
  `cave-type-pills` (2), `realm-view-pills` (3), `realm-climate-pills` (3)
  all fit comfortably in the new 288px width without wrapping).
- New markup block, placed in the sidebar **above** `#studio-tabs` (so it
  renders regardless of which studio mode tab is active):
  ```html
  <div class="section" id="dev-rooms-section">
    <div class="section-title">🧪 Dev Rooms</div>
    <div class="flex flex-col gap-1" id="dev-room-buttons">
      <button class="btn btn-sm justify-start" id="btn-devroom-water-lab">
        🌊 Water Lab
      </button>
    </div>
  </div>
  ```
  Adding a future dev room is: one more `<button id="btn-devroom-...">` in
  this block, plus one more `case` in the `main.ts` switch described below.

### 3. Water Lab launch handoff

Generalizes the existing "settlement preview" localStorage handoff
(`OVERWORLD_SETTLEMENT_PREVIEW_KEY` → `window.open('/index.html')` →
boot-time pickup in `main.ts`) into a reusable "dev room" mechanism:

- New `src/overworld-studio/DevRoomHandoff.ts`:
  ```ts
  export const DEV_ROOM_LAUNCH_KEY = 'ttt_dev_room_launch';
  export type DevRoomId = 'water-lab';
  ```
- In `src/overworld-studio.ts`, the Water Lab button handler:
  ```ts
  document.getElementById('btn-devroom-water-lab')?.addEventListener('click', () => {
    localStorage.setItem(DEV_ROOM_LAUNCH_KEY, 'water-lab' satisfies DevRoomId);
    window.open('/index.html', '_blank');
  });
  ```
- In `src/main.ts`:
  - Read `const _pendingDevRoom = localStorage.getItem(DEV_ROOM_LAUNCH_KEY) as DevRoomId | null;`
    at the same point `_pendingOverworldPreview` is read (before
    `mainMenu.show()`).
  - Extract today's inline `onEnterWaterLab: () => { ... }` (currently
    defined as a `DevSandboxOptions` callback in `_startDevPanelInGame()`)
    into a named `function enterWaterLab(): void { ... }` declared in the
    same scope, so it can be called both as the Dev Sandbox button's
    callback *and* directly from the boot handoff below. No behavior
    change — same body, just given a name and reused.
  - In the deferred handoff block at the end of `main()` (alongside the
    existing `_pendingOverworldPreview` handling), add:
    ```ts
    if (_pendingDevRoom === 'water-lab') {
      (window as any).__tttDevRoomStage = 'starting-game';
      mainMenu.hide();
      _startDevPanelInGame();       // boots sandbox arena + Dev Sandbox UI + physics/player
      (window as any).__tttDevRoomStage = 'entering-water-lab';
      enterWaterLab();
      (window as any).__tttDevRoomStage = 'booted';
      (window as any).__tttDevRoomBooted = true;
      localStorage.removeItem(DEV_ROOM_LAUNCH_KEY);
    }
    ```
    wrapped in the same try/catch + `__tttDevRoomError` pattern the
    settlement-preview handoff already uses, for consistent debuggability.

### 4. Testing

- **New e2e spec** `tests/e2e/overworld-studio-water-lab-launch.spec.ts`,
  mirroring `overworld-studio-overworld-preview.spec.ts`: open the studio,
  click `#btn-devroom-water-lab`, wait for the popup window, poll
  `window.__tttDevRoomStage` / `__tttDevRoomBooted` / `__game.getGameMode()`
  until it reports `'waterlab'`, assert no error and a bounded timeout.
- **Existing e2e specs** (`overworld-studio-asset-library.spec.ts`,
  `overworld-studio-layer-navigation.spec.ts`,
  `overworld-studio-world-package-export.spec.ts`,
  `overworld-studio-overworld-preview.spec.ts`) must keep passing
  unchanged — they only depend on `.studio-tab[data-mode=...]` and button
  `id`s, both of which are preserved verbatim through the restructure.
- **Manual visual check:** confirm no horizontal scrollbar appears in the
  sidebar across all 5 studio tabs, and that the Dev Rooms section stays
  visible when switching tabs.
- No unit-test-level logic changes — this is a CSS/HTML restructure plus
  one small, testable extraction (`enterWaterLab()`) in `main.ts`.

## Open questions / risks

- None outstanding — all prior open questions (scope of "components",
  button placement/behavior, phasing) were resolved during brainstorming.
