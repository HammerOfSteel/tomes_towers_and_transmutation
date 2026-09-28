# Implementation Plan — External Assets Sub-task 3: Dungeons (non-tower)

**Parent initiative:** 3D Asset Integration (step 3 — wiring real Quaternius
assets into existing procedural placement/construction systems)
**Sub-task:** 3 of 5, per
`docs/asset-integration/2026-09-23-wiring-design-spec.md` §7 suggested order
(1. Monsters+Animals ✅ · 2. Settlement Buildings + Interiors ✅ ·
**3. Dungeons (non-tower)** · 4. Towers · 5. Nature Props)
**Reuses (no new design pass needed — architecture pre-decided):**
`docs/asset-integration/2026-09-23-wiring-design-spec.md` §4.3 (dungeons —
full modular kit swap), §2 (resolver architecture), §3 (settings toggle —
already implemented, `'dungeons-towers'` category exists and defaults
`true`).
**New research this sub-task:**
`docs/asset-integration/2026-09-26-dungeons-research.md` — full
`modular_dungeons/obj_kit` catalog + measured piece dimensions + grid-fit
analysis. Read this before starting Task 1; it drives every scale decision
below.

## Global Constraints

- **No invented textures/colors/geometry.** Every real-asset piece comes
  from `modular_dungeons/obj_kit` as-is. If a piece has a texture gap,
  flag it at the human playtest gate rather than patching with a guessed
  material.
- **No topology/layout changes.** `DungeonGenerator.ts` (room graph) and
  `Blueprint`'s data model (`TileEntry`/`DoorEntry`/`StaircaseEntry`) are
  **not modified** — confirmed unnecessary in the research doc. Only
  `BlueprintRenderer.ts`'s interpretation of that data changes.
- **Hard fallback rule (design-spec §2, Hard rule #2 — the incident-log
  rule):** the resolver falls through to the existing unmodified
  procedural geometry whenever (a) `isCategoryEnabled('dungeons-towers')`
  is false, or (b) a specific tile/door/stair configuration has no clean
  real-asset mapping. **Never render both the procedural box AND the real
  piece for the same cell.** This is the rule the settlement-building
  regression violated — re-verify explicitly in Task 5's tests, not just
  assumed from code review.
- **Scale correction is derived arithmetically, not guessed.** Per the
  research doc §3: X/Z scale is always ≈1.0 (kit pieces are natively ~2m,
  matching every shipped blueprint's `cellSize: 2`). Y (height) scale for
  walls/columns is `wallHeight / 2.0` (native wall height is 2.0m), computed
  **per room** from that room's own `Blueprint.wallHeight` — never a single
  hardcoded constant applied to every room, and never a value reverse-
  engineered from a screenshot. Verify this arithmetic empirically (Task 5)
  before considering it done, exactly as the research doc's §4 requires.
- **Floors are a new per-cell loop, not a swap of the existing single
  `PlaneGeometry`.** Confirmed in the research doc — size this properly in
  Task 2, don't treat it as trivial.
- **Stairs stack multiple kit pieces per staircase**, sized from
  `wallHeight`, not a fixed count. See Task 3.
- **Scope for this pass, per research doc §5.4:** use only `Wall` /
  `Wall_Half` / `Floor_Standard` / `Doors_GothicArch` / `Doors_RoundArch` /
  `Stairs` / `Stairs_2` / `Column_Round`. Skip broken/overgrown/hole wall
  variants, `Wall_ArchGothic`/`Wall_ArchRound` combo pieces, and the
  ambiguous `Rail_*`/`Curve_*`/`BridgeSection`/`Cart` pieces — defer to a
  follow-up once the base swap is verified correct in practice (same "base
  pattern before variety" order used for buildings).
- **Wall corner pilasters stay procedural** (research doc §5.1 — no real
  kit piece maps cleanly onto the existing rounded-corner accent; keep
  `findWallCornerPilasterPoints()`'s cylinder as-is).
- **Wall-top per-floor-theme decorations stay procedural, unchanged**
  (research doc §5.2 — same Y-position math continues to apply, only the
  wall mesh underneath it changes).
- **Furniture/decor/lighting props reuse the existing `PropPlacer`
  resolver from Sub-task 2** — no new resolver, only an extended manifest
  list (research doc §5.3).
- Follow `writing-plans`/`executing-plans` conventions: bite-sized steps,
  verify after each task, commit after each task.

## File Structure

```
src/levels/QuatDungeonAdapter.ts     [NEW] tile/door/stair → real dungeon-kit
                                      manifest lookup + async loader +
                                      per-room scale-factor computation
src/levels/BlueprintRenderer.ts      [MODIFIED] renderBlueprint() gains a
                                      resolver call for walls + a new
                                      per-cell floor loop + door-piece
                                      placement; buildStaircase() gains a
                                      resolver call for stacked stair pieces
src/world/ExternalAssetConfig.ts     [NO CHANGE] 'dungeons-towers' category
                                      already exists and defaults true
src/ui/SettlementLabPanel.ts or      [MODIFIED] add a dungeon real-vs-
overworld-studio.ts (whichever       procedural toggle to the existing dev
already previews dungeons — verify   dungeon/tower map preview area
in Task 4, don't assume the file)
docs/asset-integration/2026-09-22-quaternius-asset-inventory.md
                                      [MODIFIED] mark modular_dungeons/obj_kit
                                      section as wired (not just imported)
```

## Task 1: `QuatDungeonAdapter.ts` — tile/door/stair → real kit piece lookup + loader

**Step 1.** Create `src/levels/QuatDungeonAdapter.ts`. Export a small,
explicit set of manifest IDs actually used this pass (per Global
Constraints scope list):

```ts
export const DUNGEON_KIT = {
  wall:        'modular_dungeons/obj_kit/Wall',
  wallHalf:    'modular_dungeons/obj_kit/Wall_Half',
  floor:       'modular_dungeons/obj_kit/Floor_Standard',
  doorGothic:  'modular_dungeons/obj_kit/Doors_GothicArch',
  doorRound:   'modular_dungeons/obj_kit/Doors_RoundArch',
  stairsShort: 'modular_dungeons/obj_kit/Stairs',
  stairsTall:  'modular_dungeons/obj_kit/Stairs_2',
  column:      'modular_dungeons/obj_kit/Column_Round',
} as const;
```

**Step 2.** Export `NATIVE_WALL_HEIGHT = 2.0` and `NATIVE_CELL = 2.0`
(documented as measured constants from the research doc, with a comment
pointing at the doc + the date measured — mirror how
`DOOR_SCALE_CORRECTION` is documented in `QuatBuildingAdapter.ts`, but note
this one is derived, not guessed).

**Step 3.** Export `computeWallScale(bp: Blueprint): { x: number; y: number; z: number }`
returning `{ x: bp.cellSize / NATIVE_CELL, y: bp.wallHeight / NATIVE_WALL_HEIGHT, z: bp.cellSize / NATIVE_CELL }`.

**Step 4.** Export `async function loadDungeonPiece(id: string): Promise<THREE.Object3D>`
using `loadQuatAsset()` + manifest lookup (mirror
`QuatBuildingAdapter.loadRealBuildingExterior()`'s pattern: find the
`QuatModelDef` via `QUAT_MODELS.find(m => m.id === id)`, throw a clear error
if missing so a broken manifest reference fails loudly in dev, never
silently falls back). Return the **unscaled** loaded object — scaling is
the caller's job per-tile (different tiles may need different X/Z rotation
but the same Y-scale for a given room).

**Step 5.** Write a quick standalone script or reuse
`src/scale-lab.ts`-style test to load each of the 8 `DUNGEON_KIT` ids once
and confirm no load errors (textures resolve, no missing-material console
warnings) before moving to Task 2 — catches import problems early, cheaper
than debugging them inside `BlueprintRenderer.ts`'s more complex context.

**Verify:** `npx tsc --noEmit` passes. Manual `node`/Playwright smoke test
loads all 8 pieces with no console errors.

**Commit:** "Add QuatDungeonAdapter with measured dungeon-kit scale constants"

## Task 2: Walls + floors — resolver wired into `renderBlueprint()`

**Step 1.** In `BlueprintRenderer.ts`, near the top of `renderBlueprint()`,
compute `const wallScale = isCategoryEnabled('dungeons-towers') ? computeWallScale(bp) : null;`
and kick off `Promise.all` loads of `DUNGEON_KIT.wall` / `.wallHalp` /
`.floor` (real pieces are loaded once per room-render call, not once per
tile — clone via `SkeletonUtils.clone`/`object.clone()` per placement,
following the same "load once, clone many" pattern already used for
building/prop resolvers).

**Step 2.** Replace the wall-tile loop's `BoxGeometry` branch: when the
real pieces loaded successfully AND the category is enabled, clone the
`Wall` piece, apply `mesh.scale.set(wallScale.x, wallScale.y, wallScale.z)`,
position/rotate exactly as the existing box was positioned (same `wx`/`tH/2`
/`wz`/`rotation.y` math — only the mesh source changes), set
`mesh.userData.isWall = true` (WallOcclusionManager depends on this flag —
**must** carry it over, this is an easy regression to introduce
silently). On failure to load or category disabled, fall through to the
existing `BoxGeometry` code completely unchanged (hard fallback rule) —
**never build both**.

**Step 3.** Add the new per-cell floor loop: iterate every `(x, z)` cell in
`[0, width) × [0, depth)` NOT present in `bp.tiles` as a `wall`/`pillar`
(floor is implicit for unlisted cells, per `blueprint.ts`'s doc comment),
and NOT a door cell (door cells still get a floor — only wall/pillar tiles
are structural). Skip this new loop and keep the single large
`PlaneGeometry` when real assets are off/unavailable. When on, place one
cloned `Floor_Standard` per cell, scaled by `wallScale.x`/`wallScale.z`
only (floors don't scale in Y — thickness is a modelling detail, not a
gameplay-relevant dimension), keeping the existing physics
`createStaticBox` floor collider unchanged (one big collider is fine even
with many small visual floor tiles — no player-facing behavior difference).

**Step 4.** Pillars (`tile.type === 'pillar'`): swap the
`CylinderGeometry` for `DUNGEON_KIT.column`, scaled by
`wallScale.y` on Y only (`Column_Round`'s native diameter, ~0.66m, is
already a reasonable pillar width at 1.0× X/Z — don't also scale X/Z by
`wallScale.x`, that would only be correct if the column's native diameter
were calibrated to `cellSize`, which the research doc doesn't claim; keep
X/Z at 1.0 the same way the procedural cylinder's radius constants were
independent of `cellSize`).

**Step 5.** Doors: replace the `postA`/`postB`/`lintelMesh` frame-building
code with a single cloned `Doors_GothicArch` (or `Doors_RoundArch` — pick
one consistently, e.g. always Gothic for this pass, only one variant to
avoid over-scoping) placed at native scale (no `wallScale` — research doc
confirms doors are freestanding inserts, not wall replacements), centred on
the door cell's world position, rotated to match `isNS`/facing exactly like
the existing frame code oriented its posts. Keep the existing
`doorTriggers.push(...)` trigger-AABB logic completely unchanged — the
trigger volume is gameplay logic, independent of which mesh renders.

**Verify:** `npx tsc --noEmit`. Load a shipped blueprint (e.g.
`cell_start.json`, `wallHeight: 3`) via the existing dungeon dev-preview
tooling (locate in Task 4) with the toggle ON and OFF; confirm ON shows
real walls/floors/doors/columns only, OFF shows the exact prior procedural
look with zero change (regression check).

**Commit:** "Wire real dungeon-kit walls/floors/doors/columns into renderBlueprint()"

## Task 3: Stairs — stacked real pieces in `buildStaircase()`

**Step 1.** Compute `const stepCount = Math.max(2, Math.ceil(wallHeight / DUNGEON_KIT_STAIR_RISE))`
where `DUNGEON_KIT_STAIR_RISE` is the measured rise of one `Stairs_2` piece
(~1.78m, from the research doc — define as a named constant next to
`NATIVE_WALL_HEIGHT` in `QuatDungeonAdapter.ts`, not a magic number inline).

**Step 2.** When real assets are enabled and load successfully, place
`stepCount` cloned `Stairs_2` pieces stacked along the approach axis
(`ax`/`az` unit vector already computed from `stair.facing`) AND stacked in
Y (each piece's Y offset = previous piece's rise), landing at the same
total rise (`wallHeight`) and the same X/Z span (`STAIR_SPAN`) as the
existing 7-step procedural version — reuse the existing `ax`/`az`/`wx`/`wz`
math, only change what mesh is placed at each of the `stepCount` positions.
Keep the existing per-step Rapier collider creation and the existing
up/down glow-color logic (`STAIR_UP_GLOW`/`STAIR_DOWN_GLOW`) — these are
gameplay/visual-feedback concerns independent of the mesh swap; render them
as small emissive markers positioned near the final piece exactly as today.
On failure/category-off, fall through to the complete existing 7-step
procedural code, unchanged.

**Step 3.** `doorTriggers.push({...})` for the staircase trigger — verify
this logic (already present) is untouched and still fires with the new
mesh geometry (trigger AABB is independent of visual mesh, but re-check the
`cx`/`cz`/`hx`/`hz` values still make sense against the new stacked-piece
footprint — the research doc's `Stairs_2` footprint measured 2.15×2.02m,
close enough to the procedural version's `STAIR_SPAN`/`stepW` that no
change is expected, but confirm, don't assume).

**Verify:** `npx tsc --noEmit`. Toggle real-assets ON/OFF in dev preview for
a blueprint with a staircase (check `src/levels/blueprints/*.json` for one
with a `staircases` entry); confirm both look complete (reach full
`wallHeight`) and the trigger still works (walking onto it transitions
floors) in both modes.

**Commit:** "Wire real dungeon-kit stairs into buildStaircase()"

## Task 4: Dev preview real-vs-procedural toggle

**Correction found during plan review:** `wiring-design-spec.md` §4.4
assumed an existing "dungeon/tower map preview area" inside
`overworld-studio.ts` that could get a toggle. That file's dungeon preview
is actually a **2D top-down ink-map canvas** (`drawDungeonFloorPlan()`) —
it never calls `renderBlueprint()` and can't show real-asset 3D scale at
all. The real 3D preview surface is a **separate page**,
`building-viewer.ts`/`building-viewer.html`, which reads a `DungeonPlan`
handed off via `localStorage` from the Studio's "Building Preview" flow and
calls `sceneManager.loadDungeon(plan)` (a `main.ts`-local closure that
ultimately calls `renderBlueprint()` per room) — this is the correct place
for the toggle.

**Step 1.** Add a small on/off checkbox to `building-viewer.ts`'s UI,
wired to force `isCategoryEnabled('dungeons-towers')`'s effective value for
that page's `loadDungeon`/`renderBlueprint` calls only (same override-
toggle pattern used in `SettlementLabPanel.ts`/`SettlementLabScene.ts` for
Sub-task 2 — reuse that exact mechanism, don't invent a new one).

**Step 2.** Re-check the toggle re-renders the currently-loaded room
in-place (matches `building-viewer.ts`'s existing reload-on-change pattern,
if any — otherwise a full `loadDungeon(plan)` re-call is acceptable since
this is a dev-only tool, not a perf-sensitive path).

**Verify:** Toggle flips the previewed room between the two looks live,
with no full page reload required.

**Commit:** "Add dungeon real-vs-procedural toggle to dev preview"

## Task 5: Automated tests + full verification pass

**Step 1.** Unit test `computeWallScale()` for a few `(cellSize, wallHeight)`
combinations against the shipped blueprint JSON values (2/3 and 2/4) —
pure function, no rendering needed.

**Step 2.** Unit/integration test (or a documented manual Playwright script,
following this session's `loadQuatAsset()` + `Box3` technique) that renders
`cell_start.json` with the category ON and asserts: (a) no procedural
`BoxGeometry`/`CylinderGeometry` wall/pillar mesh exists in the group
alongside a real one for the same tile (the literal hard-rule check — count
meshes per tile-key, assert exactly one), (b) every wall mesh's world-space
bounding-box height ≈ `bp.wallHeight` (± small tolerance) — the same
empirical height-verification technique used for the building fix,
preventing a repeat of "looked calibrated on paper, wrong in practice".

**Step 3.** Re-run with the category OFF; assert the rendered result is
pixel-for-pixel/mesh-for-mesh identical to running the same blueprint before
this sub-task's changes (regression safety net) — e.g. snapshot the mesh
count and geometry types per tile-key and diff against a pre-change capture.

**Step 4.** `npx tsc --noEmit` full pass. Run any existing `DungeonGenerator`/
`BlueprintRenderer` test suite if one exists (grep for `*.test.ts` under
`src/levels/`) — confirm zero regressions.

**Step 5.** Update `docs/asset-integration/2026-09-22-quaternius-asset-
inventory.md`'s `modular_dungeons/obj_kit` section: mark it "wired" (not
just imported), link to this plan + the research doc.

**Commit:** "Add dungeon real-asset resolver tests + inventory doc update"

## Human Playtest Gate (required before Sub-task 4 — Towers — starts)

Per the `research-driven-world-polish` skill's mandatory cycle, present to
the user (via the dev-preview toggle from Task 4, or in-game via an actual
dungeon floor):

- A dungeon room with real assets ON: walls, floor, columns, a door, and a
  staircase, all real-asset, at the empirically-verified `wallHeight`-
  matched scale (not a guessed multiplier).
- The same room with real assets OFF: confirm it looks identical to the
  pre-sub-task-3 procedural version (no regression).
- Explicitly ask: does wall/door/stair/column scale look proportionally
  correct relative to the player character (reuse
  `getPlayerVisualBounds()`/`getBuildingScaleDebug()`-style live measurement
  if a screenshot isn't practical, per this session's black-headless-
  screenshot issue — investigate/fix that before relying on screenshots for
  this gate, or use the numeric measurement path as a fallback and say so
  explicitly)? Do NOT proceed to Sub-task 4 (Towers) without explicit
  user approval, even if the numeric measurements look correct on paper —
  this is exactly the category of claim that turned out wrong for building
  doors.
