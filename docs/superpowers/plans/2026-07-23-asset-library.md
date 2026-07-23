# Asset Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browsable, persistent Asset Library panel to Overworld Studio where generated buildings, dungeons, and settlements can be saved, named, previewed, and exported — forming the bridge between the Studio's generators and the game runtime.

**Architecture:** `AssetLibrary.ts` — pure data/persistence class (no UI). Library panel added to Overworld Studio sidebar as a collapsible section. "Save to Library" buttons injected into existing generator controls. Thumbnails rendered on a hidden off-screen canvas using the existing `drawDungeonFloorPlan` / `drawSettlement` functions.

**Tech Stack:** TypeScript, localStorage, Canvas 2D (thumbnails), Vite

## Global Constraints

- MVP scope: **buildings**, **dungeons**, **settlements** only — NPCs/enemies/props deferred to PROC-B
- No new npm packages
- Library data is JSON-serialisable (no Map/Set/class instances) — same constraint as `ttt_building_preview`
- `AssetLibrary` must be importable by both `overworld-studio.ts` AND future game runtime code
- After every file change: `curl -s http://localhost:5175/src/overworld-studio.ts | grep -c "ERROR\|Unexpected"` must return `0`
- After task completion: `npx vitest run tests/overworld-studio/` must pass

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/overworld-studio/AssetLibrary.ts` | **CREATE** | Data model, CRUD, localStorage persistence |
| `tests/overworld-studio/AssetLibrary.test.ts` | **CREATE** | Unit tests (RED first) |
| `overworld-studio.html` | **MODIFY** | Add Library panel HTML to sidebar |
| `src/overworld-studio.ts` | **MODIFY** | Library UI wiring, Save buttons, thumbnail rendering, preview |

---

## Task 1 — Unit tests (RED phase)

Write tests before any implementation.

- [ ] Create `tests/overworld-studio/AssetLibrary.test.ts`
- [ ] Test: `add()` stores an entry and `getAll()` returns it
- [ ] Test: `add()` with same id is idempotent (upsert)
- [ ] Test: `remove(id)` deletes the entry
- [ ] Test: `getByType('building')` returns only building entries
- [ ] Test: `search('inn')` matches by name substring (case-insensitive)
- [ ] Test: `toJSON()` produces a JSON-serialisable object (no Maps/Sets)
- [ ] Test: `fromJSON(json)` round-trips correctly
- [ ] Test: `clear()` empties the library
- [ ] Run `npx vitest run tests/overworld-studio/AssetLibrary.test.ts` — **confirm ALL fail** (file doesn't exist yet)
- [ ] Commit: `test(asset-library): add failing unit tests`

---

## Task 2 — `AssetLibrary.ts` data model

- [ ] Create `src/overworld-studio/AssetLibrary.ts`:

```typescript
export type AssetType = 'building' | 'dungeon' | 'settlement' | 'cave';

export interface LibraryEntry {
  id:        string;          // uuid-style, e.g. "bldg_1690000000_inn_f0"
  type:      AssetType;
  name:      string;          // user-editable label
  seed:      number;
  createdAt: number;          // Date.now()
  tags:      string[];        // e.g. ["inn", "human", "large"]
  isCustom:  boolean;         // true = overrides procedural default
  data:      unknown;         // serialised generator output (JSON-safe)
  thumbnail: string | null;   // data:image/png;base64,... or null
}

export class AssetLibrary {
  private readonly _key: string;
  private _entries: LibraryEntry[];

  constructor(storageKey = 'ttt_asset_library') { ... }

  add(entry: LibraryEntry): void { ... }        // upsert by id
  remove(id: string): void { ... }
  getAll(): readonly LibraryEntry[] { ... }
  getByType(type: AssetType): LibraryEntry[] { ... }
  search(query: string): LibraryEntry[] { ... } // name match, case-insensitive
  clear(): void { ... }
  toJSON(): object { ... }
  fromJSON(json: unknown): void { ... }
  private _save(): void { ... }                 // write to localStorage
  private _load(): void { ... }                 // read from localStorage on init
}

export const assetLibrary = new AssetLibrary(); // module singleton
```

- [ ] Implement all methods
- [ ] Run `npx vitest run tests/overworld-studio/AssetLibrary.test.ts` — **all pass**
- [ ] Build check: `curl -s http://localhost:5175/src/overworld-studio.ts | grep -c "ERROR"` returns `0`
- [ ] Commit: `feat(asset-library): AssetLibrary data model + localStorage`

---

## Task 3 — Library panel HTML

- [ ] In `overworld-studio.html`, add a `<div id="library-panel">` section to the sidebar (below solar-controls):

```html
<!-- ── Asset Library ──────────────────────────────────────── -->
<div id="library-panel" style="display:none">
  <div class="section">
    <div class="section-title">📚 Saved Assets</div>
    <div class="pill-row" id="library-type-pills">
      <button class="pill active" data-ltype="all">All</button>
      <button class="pill" data-ltype="building">🏠 Buildings</button>
      <button class="pill" data-ltype="dungeon">⚔ Dungeons</button>
      <button class="pill" data-ltype="settlement">🏙 Settlements</button>
      <button class="pill" data-ltype="cave">🌿 Caves</button>
    </div>
    <input type="text" id="library-search" placeholder="Search..." style="width:100%;margin:4px 0;padding:4px 6px;background:#1a1610;border:1px solid #3a3028;color:#c8a96e;border-radius:3px;font-size:11px"/>
    <div id="library-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;max-height:320px;overflow-y:auto;margin-top:4px"></div>
    <div id="library-empty" style="color:var(--muted);font-size:11px;text-align:center;padding:16px 0">No saved assets yet.<br>Use "Save to Library" on any generated view.</div>
  </div>
  <div class="section" id="library-preview-section" style="display:none">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span id="library-preview-name" style="font-size:12px;color:#e8d0a0"></span>
      <div style="display:flex;gap:4px">
        <button class="btn" id="btn-library-export" title="Export JSON">⬇</button>
        <button class="btn" id="btn-library-delete" title="Delete" style="color:#c05050">✕</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] Add "📚 Library" visibility toggle: in the Studio tabs, add a toggle button (NOT a full tab — the library overlays the sidebar without replacing the canvas)
- [ ] Add `<button id="btn-library-toggle">` to the header area
- [ ] Build check: `curl -s http://localhost:5175/src/overworld-studio.ts | grep -c "ERROR"` returns `0`
- [ ] Commit: `feat(asset-library): library panel HTML`

---

## Task 4 — Library UI wiring + Save buttons

- [ ] Import `assetLibrary` and `AssetLibrary` types in `overworld-studio.ts`
- [ ] Wire `#library-type-pills` click → filter grid
- [ ] Wire `#library-search` input → filter grid
- [ ] `renderLibraryGrid()` function: clears `#library-grid`, creates a card per matching entry with thumbnail
- [ ] `btn-library-toggle` click → show/hide `#library-panel`, update button active state
- [ ] `btn-library-export` click → `JSON.stringify(entry.data)` download
- [ ] `btn-library-delete` click → `assetLibrary.remove(selectedId)`, re-render grid

**Save buttons (inject into existing controls):**
- [ ] Settlement controls: add `<button id="btn-save-settlement">💾 Save to Library</button>` — calls `saveCurrentSettlement()`
- [ ] Dungeon controls: add `<button id="btn-save-dungeon">💾 Save to Library</button>` — calls `saveCurrentDungeon()`
- [ ] Cave controls: add `<button id="btn-save-cave">💾 Save to Library</button>` — calls `saveCurrentCave()`
- [ ] Building modal: add `<button id="btn-save-building">💾 Save to Library</button>` — calls `saveCurrentBuilding()`

**Save functions (in `overworld-studio.ts`):**
```typescript
function saveCurrentSettlement(): void {
  if (!currentModel) return;
  const entry = {
    id: `settlement_${Date.now()}_${seedInput.value}`,
    type: 'settlement' as const,
    name: `Settlement (seed ${seedInput.value})`,
    seed: parseInt(seedInput.value) || 0,
    createdAt: Date.now(),
    tags: [],
    isCustom: false,
    data: /* JSON-safe snapshot of currentModel */,
    thumbnail: /* render offscreen canvas → toDataURL */,
  };
  assetLibrary.add(entry);
  renderLibraryGrid();
}
// similar for dungeon, cave, building
```

- [ ] Build check after each save function
- [ ] Commit: `feat(asset-library): save buttons + library UI wiring`

---

## Task 5 — Thumbnails

Thumbnails are 80×80 PNG data URLs rendered using the existing draw functions on a hidden offscreen canvas.

- [ ] Create hidden `<canvas id="library-thumb-canvas" width="80" height="80">` (display:none)
- [ ] `renderThumbnail(type, data): string` function:
  - `'settlement'`: calls `drawSettlement(model, thumbCanvas)` → `thumbCanvas.toDataURL()`
  - `'dungeon'`: calls `drawDungeonFloorPlan(plan, thumbCanvas)` → `toDataURL()`
  - `'cave'`: calls `drawCaveGlade(data, thumbCanvas)` → `toDataURL()`
  - `'building'`: calls `drawDungeonFloorPlan(plan, thumbCanvas)` → `toDataURL()`
- [ ] Wire thumbnail into each save function
- [ ] Build check + vitest run
- [ ] Commit: `feat(asset-library): thumbnails via offscreen canvas`

---

## Task 6 — Final verification

Do NOT claim complete until all items are confirmed with actual output:

- [ ] `npx vitest run tests/overworld-studio/AssetLibrary.test.ts` → all pass (show count)
- [ ] `curl -s http://localhost:5175/src/overworld-studio.ts | grep -c "ERROR\|Unexpected"` → `0`
- [ ] Manual: Settlement tab → generate → click "Save to Library" → 📚 panel shows thumbnail + entry
- [ ] Manual: Dungeon tab → generate → save → appears in library
- [ ] Manual: Library search by name works
- [ ] Manual: Delete removes entry from grid
- [ ] Manual: Export downloads valid JSON
- [ ] Commit: `feat(asset-library): AL-1 + AL-2 + AL-3 complete`
