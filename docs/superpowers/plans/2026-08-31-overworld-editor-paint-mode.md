# Overworld Editor Paint Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the dev-mode-only Overworld Editor (`src/editor/OverworldEditor.ts`,
opened with `\`) paint trees/rocks by click-and-drag instead of only
single-click placement, and render those painted props as real geometry
when a saved layout is applied to a live scene.

**Architecture:** A new tiny pure module (`src/editor/BrushPainting.ts`)
decides, given the last-placed brush point and a new candidate point,
whether the drag has moved far enough to place another prop — fully
unit-testable, no DOM/THREE dependency. `OverworldEditor.ts` tracks
pointer-down state and calls this gate function from its existing
mousemove handler to drive continuous placement, reusing 100% of its
existing marker/erase/export/import machinery via two new tool kinds. `OverworldScene.applyEditorLayout()` gets one new `switch` case that
spawns real tree/rock geometry using the two single-object builder
methods (`_makeTree()`/`_makeRock()`) it already has for procedural chunk
scatter.

**Tech Stack:** TypeScript, Vitest (Task 1 only — Tasks 2-3 touch
DOM/canvas-event and THREE-scene code that this codebase already leaves to
manual verification, consistent with `OverworldEditor.ts` having zero
existing automated tests today).

## Global Constraints

- `PAINT_BRUSH_SPACING_WU = 3.0` — minimum world-unit distance between two
  brush-placed props in the same drag stroke (design spec §3: "comfortably
  wider than a tree/rock's own visual footprint, so a slow drag doesn't
  stack overlapping props").
- Grass painting, terrain/biome tile painting, and wiring
  `applyEditorLayout()` into an actual live call site are all explicitly
  OUT of scope (design spec §5) — do not add them.
- No changes to any existing tool's (`enemy_camp`/`building_entrance`/
  `resource_ore`/`resource_timber`/`resource_essence`/`erase`) behavior.

---

### Task 1: `shouldPlaceBrushPoint()` — pure brush-spacing gate function

**Files:**
- Create: `src/editor/BrushPainting.ts`
- Create: `tests/editor/BrushPainting.test.ts`

**Interfaces:**
- Consumes: nothing new (plain objects/numbers in, boolean out).
- Produces: `shouldPlaceBrushPoint(lastPlaced: {x: number; z: number} |
  null, candidate: {x: number; z: number}, minSpacing: number): boolean`.
  Consumed by Task 2's `OverworldEditor.ts` drag-handling code.

- [ ] **Step 1: Write the failing test**

Create `tests/editor/BrushPainting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldPlaceBrushPoint } from '@/editor/BrushPainting';

describe('shouldPlaceBrushPoint', () => {
  it('always places the first point of a stroke (lastPlaced is null)', () => {
    expect(shouldPlaceBrushPoint(null, { x: 5, z: 5 }, 3)).toBe(true);
  });

  it('does not place a second point at the exact same spot (zero-distance repeat)', () => {
    const p = { x: 10, z: 10 };
    expect(shouldPlaceBrushPoint(p, { x: 10, z: 10 }, 3)).toBe(false);
  });

  it('does not place a point just under the minimum spacing', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 2.9, z: 0 }; // distance 2.9 < minSpacing 3
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(false);
  });

  it('places a point exactly at the minimum spacing (boundary is inclusive)', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 3, z: 0 }; // distance exactly 3
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(true);
  });

  it('places a point well past the minimum spacing', () => {
    const lastPlaced = { x: 0, z: 0 };
    const candidate = { x: 100, z: 100 };
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(true);
  });

  it('measures distance diagonally (x and z both contribute), not axis-aligned only', () => {
    const lastPlaced = { x: 0, z: 0 };
    // distance = sqrt(2*2 + 2*2) = sqrt(8) ≈ 2.83 < 3 — must be false even
    // though each individual axis delta (2) is less than minSpacing (3).
    const candidate = { x: 2, z: 2 };
    expect(shouldPlaceBrushPoint(lastPlaced, candidate, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/editor/BrushPainting.test.ts`
Expected: FAIL — `src/editor/BrushPainting.ts` does not exist yet (import
error).

- [ ] **Step 3: Implement the pure function**

Create `src/editor/BrushPainting.ts`:

```ts
/**
 * BrushPainting.ts — pure brush-stroke spacing logic for OverworldEditor's
 * paint tools (paint_tree / paint_rock). No DOM/THREE dependency, so it's
 * fully unit-testable independent of the canvas-event wiring that consumes
 * it. See docs/superpowers/specs/2026-08-31-overworld-editor-paint-mode-
 * design.md §3.
 */

/**
 * Decide whether a new drag sample is far enough from the last point
 * placed in the current brush stroke to place another prop there.
 * `lastPlaced === null` means this is the first point of a new stroke
 * (e.g. right after mousedown), which always places.
 */
export function shouldPlaceBrushPoint(
  lastPlaced: { x: number; z: number } | null,
  candidate: { x: number; z: number },
  minSpacing: number,
): boolean {
  if (!lastPlaced) return true;
  const dx = candidate.x - lastPlaced.x;
  const dz = candidate.z - lastPlaced.z;
  return dx * dx + dz * dz >= minSpacing * minSpacing;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/editor/BrushPainting.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144 (this project's steady baseline throughout this whole
session — confirm the count before this task matches and doesn't change).

- [ ] **Step 6: Commit**

```bash
git add src/editor/BrushPainting.ts tests/editor/BrushPainting.test.ts
git commit -m "feat: add pure brush-spacing gate function for editor paint mode

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Wire paint_tree/paint_rock brush tools into `OverworldEditor.ts`

**Files:**
- Modify: `src/editor/OverworldEditor.ts`

**Interfaces:**
- Consumes: `shouldPlaceBrushPoint()` (Task 1).
- Produces: `OWScatterProp` type (`{ kind: 'scatter_prop'; wx: number; wz:
  number; propType: 'tree' | 'rock' }`), added to the `OWLayoutItem`
  union. `OWToolKind` gains `'paint_tree' | 'paint_rock'`. Consumed by
  Task 3's `OverworldScene.applyEditorLayout()`.

This task has no new automated tests — `OverworldEditor.ts` is
DOM/canvas-event-driven UI code with zero existing test coverage today
(confirmed: no file references it under `tests/`), so this task follows
that same established precedent. Verification is manual (bundled into
Task 3's final ship step, where the full flow — paint, export, reload,
render — can be checked end-to-end).

- [ ] **Step 1: Add the `OWScatterProp` type to the `OWLayoutItem` union**

In `src/editor/OverworldEditor.ts`, find:

```ts
export type OWToolKind =
  | 'enemy_camp'
  | 'building_entrance'
  | 'resource_ore'
  | 'resource_timber'
  | 'resource_essence'
  | 'erase';
```

Change to:

```ts
export type OWToolKind =
  | 'enemy_camp'
  | 'building_entrance'
  | 'resource_ore'
  | 'resource_timber'
  | 'resource_essence'
  | 'paint_tree'
  | 'paint_rock'
  | 'erase';
```

Find:

```ts
export interface OWResourceNode {
  kind: 'resource_node';
  wx: number;
  wz: number;
  type: 'ore' | 'timber' | 'essence';
}

export type OWLayoutItem = OWEnemyCamp | OWBuildingEntrance | OWResourceNode;
```

Change to:

```ts
export interface OWResourceNode {
  kind: 'resource_node';
  wx: number;
  wz: number;
  type: 'ore' | 'timber' | 'essence';
}

/**
 * A single brush-painted scatter prop (tree or rock). Painted via
 * click-drag with the paint_tree/paint_rock tools — see BrushPainting.ts
 * for the spacing logic that decides how many of these a single drag
 * stroke produces.
 */
export interface OWScatterProp {
  kind: 'scatter_prop';
  wx: number;
  wz: number;
  propType: 'tree' | 'rock';
}

export type OWLayoutItem = OWEnemyCamp | OWBuildingEntrance | OWResourceNode | OWScatterProp;
```

- [ ] **Step 2: Add the import + visual/label/hotkey table entries**

Find:

```ts
import * as THREE from 'three';
```

Change to:

```ts
import * as THREE from 'three';
import { shouldPlaceBrushPoint } from '@/editor/BrushPainting';
```

Find:

```ts
const TOOL_COLOR: Record<OWToolKind, number> = {
  enemy_camp:         0xff3333,
  building_entrance:  0x33ddff,
  resource_ore:       0xffaa22,
  resource_timber:    0x44bb44,
  resource_essence:   0xcc66ff,
  erase:              0xff2200,
};
```

Change to:

```ts
const TOOL_COLOR: Record<OWToolKind, number> = {
  enemy_camp:         0xff3333,
  building_entrance:  0x33ddff,
  resource_ore:       0xffaa22,
  resource_timber:    0x44bb44,
  resource_essence:   0xcc66ff,
  paint_tree:         0x2f9e44,
  paint_rock:         0x8a8a8a,
  erase:              0xff2200,
};
```

Find:

```ts
const TOOL_LABEL: Record<OWToolKind, string> = {
  enemy_camp:         'Enemy Camp',
  building_entrance:  'Building Entrance',
  resource_ore:       'Resource: Ore',
  resource_timber:    'Resource: Timber',
  resource_essence:   'Resource: Essence',
  erase:              'Erase',
};
```

Change to:

```ts
const TOOL_LABEL: Record<OWToolKind, string> = {
  enemy_camp:         'Enemy Camp',
  building_entrance:  'Building Entrance',
  resource_ore:       'Resource: Ore',
  resource_timber:    'Resource: Timber',
  resource_essence:   'Resource: Essence',
  paint_tree:         'Paint: Trees',
  paint_rock:         'Paint: Rocks',
  erase:              'Erase',
};
```

Find:

```ts
const HOTKEYS: Partial<Record<string, OWToolKind>> = {
  '1': 'enemy_camp',
  '2': 'building_entrance',
  '3': 'resource_ore',
  '4': 'resource_timber',
  '5': 'resource_essence',
  'e': 'erase',
  'E': 'erase',
};
```

Change to:

```ts
const HOTKEYS: Partial<Record<string, OWToolKind>> = {
  '1': 'enemy_camp',
  '2': 'building_entrance',
  '3': 'resource_ore',
  '4': 'resource_timber',
  '5': 'resource_essence',
  '6': 'paint_tree',
  '7': 'paint_rock',
  'e': 'erase',
  'E': 'erase',
};
```

Find:

```ts
const MARKER_RADIUS = 1.2;
const ERASE_RADIUS  = 4.0;
```

Change to:

```ts
const MARKER_RADIUS = 1.2;
const ERASE_RADIUS  = 4.0;
const PAINT_BRUSH_SPACING_WU = 3.0;
```

- [ ] **Step 3: Track brush-stroke state**

Find:

```ts
  // Raycaster
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2(-9999, -9999);
```

Change to:

```ts
  // Raycaster
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2(-9999, -9999);

  // Brush-stroke state (paint_tree / paint_rock tools only)
  private _isPointerDown = false;
  private _lastBrushPoint: { x: number; z: number } | null = null;
```

- [ ] **Step 4: Track pointer-down/up and drive brush placement from mousemove**

Find:

```ts
    // Canvas event listeners (only active when editor is open)
    this._canvas.addEventListener('click',       this._onClick);
    this._canvas.addEventListener('contextmenu', this._onRightClick);
    this._canvas.addEventListener('mousemove',   this._onMouseMove);
```

Change to:

```ts
    // Canvas event listeners (only active when editor is open)
    this._canvas.addEventListener('click',       this._onClick);
    this._canvas.addEventListener('contextmenu', this._onRightClick);
    this._canvas.addEventListener('mousemove',   this._onMouseMove);
    this._canvas.addEventListener('mousedown',   this._onPointerDown);
    this._canvas.addEventListener('mouseup',     this._onPointerUp);
```

Find:

```ts
  private readonly _onMouseMove = (e: MouseEvent): void => {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
  };
```

Change to:

```ts
  private readonly _onMouseMove = (e: MouseEvent): void => {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );

    if (!this._active || !this._isPointerDown) return;
    if (this._tool !== 'paint_tree' && this._tool !== 'paint_rock') return;
    const hit = this._raycast();
    if (!hit) return;
    const candidate = { x: hit.x, z: hit.z };
    if (shouldPlaceBrushPoint(this._lastBrushPoint, candidate, PAINT_BRUSH_SPACING_WU)) {
      this._placeItem(hit.x, hit.z);
      this._lastBrushPoint = candidate;
    }
  };

  private readonly _onPointerDown = (_e: MouseEvent): void => {
    this._isPointerDown = true;
    if (!this._active) return;
    if (this._tool !== 'paint_tree' && this._tool !== 'paint_rock') return;
    // Place the first point of the stroke immediately, so a plain click
    // (mousedown + mouseup with no drag in between) still places exactly
    // one item — matching every other tool's existing single-click
    // behavior.
    const hit = this._raycast();
    if (!hit) return;
    this._placeItem(hit.x, hit.z);
    this._lastBrushPoint = { x: hit.x, z: hit.z };
  };

  private readonly _onPointerUp = (_e: MouseEvent): void => {
    this._isPointerDown = false;
    this._lastBrushPoint = null;
  };
```

- [ ] **Step 5: Prevent the existing `click` handler from double-placing for paint tools**

The existing `_onClick` handler already fires a browser `click` event after
`mousedown`+`mouseup` on the same element, which would place a SECOND item
on top of the one `_onPointerDown` already placed for paint tools. Find:

```ts
  private readonly _onClick = (_e: MouseEvent): void => {
    if (!this._active) return;
    const hit = this._raycast();
    if (!hit) return;

    if (this._tool === 'erase') {
      this._eraseNearest(hit);
      return;
    }
    this._placeItem(hit.x, hit.z);
  };
```

Change to:

```ts
  private readonly _onClick = (_e: MouseEvent): void => {
    if (!this._active) return;
    // paint_tree/paint_rock placement is handled entirely by
    // _onPointerDown/_onMouseMove (so drag-painting works) — skip here to
    // avoid placing a duplicate item on the plain-click case.
    if (this._tool === 'paint_tree' || this._tool === 'paint_rock') return;
    const hit = this._raycast();
    if (!hit) return;

    if (this._tool === 'erase') {
      this._eraseNearest(hit);
      return;
    }
    this._placeItem(hit.x, hit.z);
  };
```

- [ ] **Step 6: Handle the new tool kinds in `_placeItem()` and `_markerColor()`**

Find:

```ts
      case 'resource_essence':
        item = { kind: 'resource_node', wx, wz, type: 'essence' };
        break;
      default:
        return;
    }
```

Change to:

```ts
      case 'resource_essence':
        item = { kind: 'resource_node', wx, wz, type: 'essence' };
        break;
      case 'paint_tree':
        item = { kind: 'scatter_prop', wx, wz, propType: 'tree' };
        break;
      case 'paint_rock':
        item = { kind: 'scatter_prop', wx, wz, propType: 'rock' };
        break;
      default:
        return;
    }
```

Find:

```ts
  private _markerColor(item: OWLayoutItem): number {
    if (item.kind === 'enemy_camp')        return TOOL_COLOR.enemy_camp;
    if (item.kind === 'building_entrance') return TOOL_COLOR.building_entrance;
    if (item.kind === 'resource_node') {
      if (item.type === 'ore')     return TOOL_COLOR.resource_ore;
      if (item.type === 'timber')  return TOOL_COLOR.resource_timber;
      return TOOL_COLOR.resource_essence;
    }
    return 0xffffff;
  }
```

Change to:

```ts
  private _markerColor(item: OWLayoutItem): number {
    if (item.kind === 'enemy_camp')        return TOOL_COLOR.enemy_camp;
    if (item.kind === 'building_entrance') return TOOL_COLOR.building_entrance;
    if (item.kind === 'resource_node') {
      if (item.type === 'ore')     return TOOL_COLOR.resource_ore;
      if (item.type === 'timber')  return TOOL_COLOR.resource_timber;
      return TOOL_COLOR.resource_essence;
    }
    if (item.kind === 'scatter_prop') {
      return item.propType === 'tree' ? TOOL_COLOR.paint_tree : TOOL_COLOR.paint_rock;
    }
    return 0xffffff;
  }
```

- [ ] **Step 7: Update the status line and tool-button panel**

Find:

```ts
  private _refreshStatus(): void {
    const camps     = this._items.filter(i => i.kind === 'enemy_camp').length;
    const buildings = this._items.filter(i => i.kind === 'building_entrance').length;
    const nodes     = this._items.filter(i => i.kind === 'resource_node').length;
    this._statusEl.textContent =
      `Camps: ${camps}  Entrances: ${buildings}  Nodes: ${nodes}`;
  }
```

Change to:

```ts
  private _refreshStatus(): void {
    const camps     = this._items.filter(i => i.kind === 'enemy_camp').length;
    const buildings = this._items.filter(i => i.kind === 'building_entrance').length;
    const nodes     = this._items.filter(i => i.kind === 'resource_node').length;
    const props     = this._items.filter(i => i.kind === 'scatter_prop').length;
    this._statusEl.textContent =
      `Camps: ${camps}  Entrances: ${buildings}  Nodes: ${nodes}  Props: ${props}`;
  }
```

Find:

```ts
    const tools: OWToolKind[] = [
      'enemy_camp', 'building_entrance',
      'resource_ore', 'resource_timber', 'resource_essence',
      'erase',
    ];
    const hotkeys = ['1', '2', '3', '4', '5', 'E'];
```

Change to:

```ts
    const tools: OWToolKind[] = [
      'enemy_camp', 'building_entrance',
      'resource_ore', 'resource_timber', 'resource_essence',
      'paint_tree', 'paint_rock',
      'erase',
    ];
    const hotkeys = ['1', '2', '3', '4', '5', '6', '7', 'E'];
```

Find:

```ts
    statusEl.textContent = 'Camps: 0  Entrances: 0  Nodes: 0';
```

Change to:

```ts
    statusEl.textContent = 'Camps: 0  Entrances: 0  Nodes: 0  Props: 0';
```

Find:

```ts
    help.innerHTML =
      'Left-click: place &nbsp; Right-click: erase<br>' +
      'Press <b style="color:#aaa">\\</b> to close editor';
```

Change to:

```ts
    help.innerHTML =
      'Left-click: place &nbsp; Right-click: erase<br>' +
      'Paint tools: click-drag to scatter<br>' +
      'Press <b style="color:#aaa">\\</b> to close editor';
```

- [ ] **Step 8: Tear down the new listeners in `dispose()`**

Find:

```ts
    this._canvas.removeEventListener('click',       this._onClick);
    this._canvas.removeEventListener('contextmenu', this._onRightClick);
    this._canvas.removeEventListener('mousemove',   this._onMouseMove);
```

Change to:

```ts
    this._canvas.removeEventListener('click',       this._onClick);
    this._canvas.removeEventListener('contextmenu', this._onRightClick);
    this._canvas.removeEventListener('mousemove',   this._onMouseMove);
    this._canvas.removeEventListener('mousedown',   this._onPointerDown);
    this._canvas.removeEventListener('mouseup',     this._onPointerUp);
```

- [ ] **Step 9: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 10: Run the full existing test suite (confirm no regression)**

Run: `npx vitest run tests/editor/`
Expected: PASS — the existing `EditorGrid.test.ts`/`editor-tab-switch.test.ts`
(unrelated to `OverworldEditor.ts`) plus Task 1's new
`BrushPainting.test.ts`, all green.

- [ ] **Step 11: Commit**

```bash
git add src/editor/OverworldEditor.ts
git commit -m "feat: add click-drag paint_tree/paint_rock brush tools to OverworldEditor

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Render painted props in `OverworldScene.applyEditorLayout()` + ship

**Files:**
- Modify: `src/scene/OverworldScene.ts`
- Modify: `docs/visual-progress.md`

**Interfaces:**
- Consumes: `OWScatterProp` (Task 2), `_makeTree(rand: () => number,
  biome: BiomeId, wx: number, wz: number): THREE.Group`, `_makeRock(rand:
  () => number, wx: number, wz: number): THREE.Group` (both pre-existing
  private methods, already used by the procedural chunk-scatter builder
  at `src/scene/OverworldScene.ts:1495` / `:1514`).
- Produces: nothing new for later tasks — this is the final task.

- [ ] **Step 1: Add the `_editorScatterProps` field**

In `src/scene/OverworldScene.ts`, find:

```ts
  private readonly _enemies:        SlimeEnemy[]  = [];
```

Change to:

```ts
  private readonly _enemies:        SlimeEnemy[]  = [];
  /** Trees/rocks placed via the dev-only OverworldEditor's paint_tree/
   *  paint_rock tools (applyEditorLayout()'s 'scatter_prop' case) — no
   *  chunk-streaming lifecycle, mirrors the existing editor-placed
   *  enemy_camp/resource_node bookkeeping style exactly. */
  private readonly _editorScatterProps: THREE.Group[] = [];
```

- [ ] **Step 2: Add the `scatter_prop` case to `applyEditorLayout()`**

Find:

```ts
  applyEditorLayout(layout: import('@/editor/OverworldEditor').OWLayout): void {
    for (const item of layout.items) {
      switch (item.kind) {
        case 'enemy_camp':
          this._spawnEditorCamp(item.wx, item.wz, item.count);
          break;
        case 'building_entrance':
          this.buildingEntrances.push({
            type:     'greenhouse',           // default type; extend OWLayout schema to add type later
            position: new THREE.Vector3(item.wx, 0, item.wz),
            label:    item.label,
          });
          break;
        case 'resource_node':
          this._addEditorResourceNode(item.wx, item.wz, item.type);
          break;
      }
    }
  }
```

Change to:

```ts
  applyEditorLayout(layout: import('@/editor/OverworldEditor').OWLayout): void {
    for (const item of layout.items) {
      switch (item.kind) {
        case 'enemy_camp':
          this._spawnEditorCamp(item.wx, item.wz, item.count);
          break;
        case 'building_entrance':
          this.buildingEntrances.push({
            type:     'greenhouse',           // default type; extend OWLayout schema to add type later
            position: new THREE.Vector3(item.wx, 0, item.wz),
            label:    item.label,
          });
          break;
        case 'resource_node':
          this._addEditorResourceNode(item.wx, item.wz, item.type);
          break;
        case 'scatter_prop':
          this._spawnEditorScatterProp(item.wx, item.wz, item.propType);
          break;
      }
    }
  }

  /**
   * Spawn a single real tree/rock at (wx, wz), painted via the dev-only
   * OverworldEditor's paint_tree/paint_rock tools. Reuses the same
   * single-object builders (_makeTree/_makeRock) and elevation-aware
   * positioning convention as the procedural chunk-scatter builder
   * (_buildChunkScatter()) — a seeded rand keyed off position, matching
   * _spawnEditorCamp()'s existing pattern, so re-applying the same layout
   * always reproduces the same tree/rock variant deterministically.
   */
  private _spawnEditorScatterProp(wx: number, wz: number, propType: 'tree' | 'rock'): void {
    const rand = mulberry32(
      (Math.round(wx * 100) ^ Math.round(wz * 100)) >>> 0,
    );
    const { col, row } = this._wg.worldToGrid(wx, wz);
    const cell = this._wg.get(col, row);

    const grp = propType === 'tree'
      ? this._makeTree(rand, cell.biome, wx, wz)
      : this._makeRock(rand, wx, wz);
    grp.position.set(wx, cell.elevation * SH, wz);
    if (propType === 'tree') grp.rotation.y = rand() * Math.PI * 2;

    this._editorScatterProps.push(grp);
    if (this._isInScene) this.scene.add(grp);
  }
```

- [ ] **Step 3: Check `tsc` baseline is unchanged**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 4: Run the OverworldScene regression suite**

Run: `npx vitest run tests/scene/OverworldScene.chunk-scatter-alignment.test.ts tests/scene/OverworldScene.settlement-parity.test.ts tests/scene/OverworldScene.drawcall-batching.test.ts tests/scene/OverworldScene.chunk-terrain-alignment.test.ts tests/scene/OverworldScene.chunk-collider-streaming.test.ts`
Expected: PASS (this task only adds one new `switch` case and one new
private method — no existing behavior touched).

- [ ] **Step 5: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat: render painted editor scatter props as real tree/rock geometry

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

- [ ] **Step 6: Manual verification**

Kill any stray dev-server process squatting on port 5174 first (`ps aux |
grep -i vite | grep -v grep`, `kill <pid>` if one shows up pointing at a
different directory than this worktree). Then:

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

In a browser at `http://127.0.0.1:5174`, enable dev mode, enter the
overworld, press `\` to open the editor, select "Paint: Trees" (hotkey
`6`), click-drag across open ground, and confirm multiple green disc
markers appear spaced out along the drag path (not one solid smear).
Switch to "Paint: Rocks" (`7`) and repeat. Click "Export JSON", note where
it saves, then click "Clear All", then "Import JSON" and re-select the
same file — confirm the same markers reappear at the same positions. Stop
the manually-started dev server when done
(`ps aux | grep -i vite`, `kill <pid>`).

Because `applyEditorLayout()` is not currently wired into any live
call site in `main.ts` (a pre-existing gap, out of scope for this plan —
see design spec §5), there is no in-game path today to see the ACTUAL
tree/rock geometry (`_spawnEditorScatterProp()`) render from a saved
layout during normal play. Verify that code path instead via a short,
disposable scratch vitest file (delete it immediately after confirming it
passes — it is throwaway manual-verification tooling, not a permanent
regression test, mirroring how `OverworldScene.drawcall-batching.test.ts`
already constructs a full `OverworldScene` directly for this exact kind of
check).

Create `tests/scene/_scratch-paint-verify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { OverworldScene } from '@/scene/OverworldScene';
import { buildWorldData } from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';

describe('scratch: applyEditorLayout scatter_prop', () => {
  it('spawns real tree/rock groups into the scene', async () => {
    const physics = new PhysicsWorld();
    await physics.init();
    const player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    const scene = new THREE.Scene();
    const worldData = buildWorldData(1, { ...DEFAULT_WORLD_GEN_CONFIG, worldSize: 512 });
    const overworld = new OverworldScene(scene, physics, player, worldData);
    overworld.enter();
    const beforeCount = scene.children.length;
    overworld.applyEditorLayout({
      version: 1,
      items: [
        { kind: 'scatter_prop', wx: 10, wz: 10, propType: 'tree' },
        { kind: 'scatter_prop', wx: 20, wz: 10, propType: 'rock' },
      ],
    });
    expect(scene.children.length).toBe(beforeCount + 2);
  }, 60000);
});
```

Run: `npx vitest run tests/scene/_scratch-paint-verify.test.ts`
Expected: PASS. Once confirmed, delete this scratch file — it is
throwaway manual-verification tooling, not a permanent regression test
(the plan's Step 4 regression suite already covers everything this task
is responsible for keeping green).

```bash
rm tests/scene/_scratch-paint-verify.test.ts
```

- [ ] **Step 7: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: the same pre-existing baseline failures established throughout
this session (`main.startup.smoke.test.ts`×3, `enemyLoader.test.ts`×3,
`towerGenerator.test.ts`×2, `talentSystem.test.ts`×3,
`WaterMaterial.test.ts`×1 — 12 total), plus Task 1's new
`BrushPainting.test.ts` tests passing, and zero NEW failures. If
`ResourceNodePlacer.test.ts` or `OverworldScene.chunk-scatter-
alignment.test.ts` fail, re-run each in isolation first (documented
sandbox-contention flakes in this shared environment) before treating
either as a real regression. Stop any concurrently-running dev
server/browser process first — this project has observed spurious extra
failures under concurrent CPU load that don't reproduce in isolation.

- [ ] **Step 8: Final `tsc` check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 144.

- [ ] **Step 9: Update the visual-progress log**

Open `docs/visual-progress.md`. Add a new section after the "Ambient
Wildlife — Phase 9 Batch 1" section (which itself already got a LOD
sentence appended in the ambient-wildlife-lod plan):

```markdown

## Overworld Editor — Paint Mode (Dev Tool)

The dev-only Overworld Editor (`\` to open, dev mode only) can now paint
trees and rocks by click-and-drag instead of single-click-only placement
— select "Paint: Trees" (`6`) or "Paint: Rocks" (`7`) and drag across the
ground. Not player-facing. See
`docs/superpowers/specs/2026-08-31-overworld-editor-paint-mode-design.md`.
```

- [ ] **Step 10: Commit and push**

```bash
git add docs/visual-progress.md
git commit -m "docs: note overworld editor paint mode in visual-progress log

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
git push origin HEAD:main
```
