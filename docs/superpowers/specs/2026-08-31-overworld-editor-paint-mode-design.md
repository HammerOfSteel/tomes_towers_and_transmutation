# Overworld Editor — Paint Mode (Scatter Props) Design Spec

Status: approved autonomously (user unavailable at design time; standing
authorization to proceed with documented rationale, per this session's
established precedent). Scoped as the "world editor paint mode" item from
Phase 9's three-part stretch list (ambient creature spawns ✅, chunk-
manager LOD polish ✅, world editor paint mode — this document, the last
of the three).

## 1. Context

`src/editor/OverworldEditor.ts` is an existing, dev-mode-only in-game
toolbar (opened with `\`) for hand-placing overworld entities: enemy
camps, building entrances, and resource nodes. Every tool today is
single-click-only — one item per click. It has its own `OWLayoutItem`
union, colored disc markers, erase, and JSON export/import, all already
working. There is no automated test coverage for this file today (it's
DOM/canvas-event-driven UI code, consistent with this codebase's existing
pattern of leaving that class of code to manual verification while
extracting any genuinely pure logic into tested helper functions).

`OverworldScene.ts` already has two private single-object builder methods
used by its procedural chunk-scatter pipeline: `_makeTree(rand, biome, wx,
wz): THREE.Group` and `_makeRock(rand, wx, wz): THREE.Group` — both return
an unpositioned group the caller positions. These are directly reusable
for one-off editor-placed props without inventing a new rendering path.

Grass (`GrassField.ts`) is NOT reusable the same way — it's a chunk-radius
Poisson-disk system feeding one shared `THREE.InstancedMesh` per biome
preset, not designed for arbitrary one-off point insertion. Retrofitting
it for individual editor placements is real, separate work with no clear
payoff for a dev tool. **Grass painting is explicitly out of scope for
this pass** — deferred as a documented non-goal, not silently dropped.

## 2. Goal

Let a developer hold the mouse button and drag across the ground to
scatter multiple trees/rocks along the drag path in one continuous
gesture, instead of clicking once per tree/rock — the literal "paint"
motion the roadmap note (`environment-art-system.md` §5.6) describes,
scoped to the two prop kinds that already have a reusable single-object
builder.

## 3. Approach

**New layout item + tools.** Add to `OverworldEditor.ts`:
- `OWScatterProp` item: `{ kind: 'scatter_prop', wx: number, wz: number, propType: 'tree' | 'rock' }`, added to the `OWLayoutItem` union.
- Two new `OWToolKind` entries: `'paint_tree'` (hotkey `6`), `'paint_rock'` (hotkey `7`).
- `TOOL_COLOR`/`TOOL_LABEL`/`_markerColor()`/the tool-button panel list all
  get the two new entries, following the exact existing per-tool pattern
  (each still just gets a colored disc marker in the editor overlay —
  matching every other tool's existing visual fidelity; no special tree-
  or rock-shaped preview mesh while editing).

**Brush/drag placement.** A pure, unit-tested gate function decides
whether a new drag sample is far enough from the last placed point in the
current stroke to place another:

```ts
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

`OverworldEditor` tracks pointer-down state and a per-stroke
`_lastBrushPoint: { x: number; z: number } | null`. On `mousedown` with a
paint tool selected, it places immediately at the hit point and records it
as `_lastBrushPoint` (this is what makes a plain, non-dragged click still
place exactly one item, matching every other tool's existing single-click
behavior). On `mousemove` while the mouse button is held AND a paint tool
is active, it re-raycasts and calls `shouldPlaceBrushPoint()`; if true, it
places another item and updates `_lastBrushPoint`. On `mouseup`,
`_lastBrushPoint` resets to `null`, ending the stroke. `minSpacing = 3.0`
WU (comfortably wider than a tree/rock's own visual footprint, so a slow
drag doesn't stack overlapping props).

**Rendering real props on load.** `OverworldScene.applyEditorLayout()`
gets a new case:

```ts
case 'scatter_prop':
  this._spawnEditorScatterProp(item.wx, item.wz, item.propType);
  break;
```

`_spawnEditorScatterProp(wx, wz, propType)` mirrors the existing
`_spawnEditorCamp()`'s pattern exactly: derive a seeded `rand` from the
position (`mulberry32((Math.round(wx*100) ^ Math.round(wz*100)) >>> 0)`),
look up the cell via `this._wg.worldToGrid(wx, wz)` /`this._wg.get()` for
`elevation` and (for trees) `biome`, call `this._makeTree(rand, cell.biome,
wx, wz)` or `this._makeRock(rand, wx, wz)`, position it at `(wx, cell.
elevation * SH, wz)`, add it to `this.scene` when `this._isInScene`, and
push it onto a new `_editorScatterProps: THREE.Group[]` field (mirrors
`_enemies`'s bookkeeping style — no chunk-streaming lifecycle, since
`applyEditorLayout()` itself isn't wired into per-chunk load/unload, same
as the pre-existing `enemy_camp`/`resource_node` branches it sits next to).

## 4. Testing

- Unit tests for `shouldPlaceBrushPoint()`: null `lastPlaced` always true;
  exact boundary (`distance == minSpacing` → true); just under → false;
  well over → true; a zero-distance repeat (mouse not moved) → false.
- Manual verification only for the DOM/canvas wiring and the
  `applyEditorLayout()` rendering path (open dev overworld, press `\`,
  select paint_tree, drag across ground, confirm multiple trees appear
  along the path spaced ~3 WU apart; export JSON, re-import into a fresh
  editor instance, confirm the same items reappear) — consistent with
  this file's existing, already-established no-automated-DOM-test
  precedent.
- Existing `OverworldScene` regression suite re-run to confirm no
  unrelated breakage (this plan only adds one new `switch` case; every
  existing case/behavior is untouched).

## 5. Non-goals (explicitly deferred)

- Grass/prop-type painting beyond tree/rock (no reusable single-point
  placement primitive exists for `GrassField`'s instanced system).
- Terrain/biome tile painting (a much larger, separate project — would
  require live `WorldGrid` cell mutation + terrain-mesh regeneration; see
  the LOD design spec's sibling non-goals section for the same
  reasoning applied to a different subsystem).
- Wiring `applyEditorLayout()` into an actual live call site (it's already
  unwired/unused from anywhere in `main.ts` today — a pre-existing gap,
  not something this plan introduces or is responsible for closing).
- Undo/redo for brush strokes (existing single-click tools have no undo
  either beyond per-item erase — painted props get exactly the same
  one-at-a-time erase behavior already built for every other tool kind).
