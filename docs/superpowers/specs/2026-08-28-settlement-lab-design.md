# Settlement Lab — Design Spec

Status: drafted while the user was unavailable to answer clarifying
questions; the recommended approach below was applied and documented as an
explicit assumption per the autopilot working agreement. **Needs the user's
review before an implementation plan is written.**

## Context

The user asked for a "Settlement Lab" — a Water-Lab-style dev sandbox for
iterating on settlement generation (placement, sizing, roads, visual
polish), following the same rigor as `docs/superpowers/plans/
2026-08-03-water-lab-and-swim-mode.md`.

Two settlement-generation code paths exist in this codebase today
(recorded in `TODO/02-game-world-integration/STUDIO-LIVE-PARITY.md`):

- **Live path** (what the actual game uses): `SettlementPlacer.ts` sites
  settlements using realm data, then `SettlementGenerator.ts`'s
  `planSettlement()`/`applySettlementToGrid()` call
  `SettlementModelGenerator.ts`'s ward/Voronoi/Chaikin-road model to lay
  out buildings and roads on the `WorldGrid`, and `OverworldScene.ts`'s
  `_buildSettlements()` turns that plan into `THREE.Group`s (buildings via
  `buildBuilding()`, roads as instanced flat tiles, lamps, colliders).
- **Studio preview path** (`SettlementSpawner.ts`, concentric-ring model):
  confirmed by the parity doc to be **unused by the live game** — it only
  backs a 2D/dev-preview toggle (`_buildStudioSettlementPreview()` in
  `OverworldScene.ts`, itself a secondary/fallback feature, not the primary
  settlement pipeline).

**Decision (assumed, given the parity doc's explicit warning against
building on a path that's about to be/already was replaced): the lab must
exercise the live path — `planSettlement()` / `applySettlementToGrid()` /
`SettlementModelGenerator.ts` — not the unused Studio preview model.**
Anything tuned in the lab must be guaranteed identical to what appears in
the real overworld.

## Goal

A standalone dev-room (reachable the same way Water Lab is — a button in
Overworld Studio's Dev Rooms panel that opens the real game straight into
the room) that:

- Spawns exactly one settlement, built by the exact same code the live
  overworld uses, with no duplicate/parallel rendering logic.
- Lets the developer choose settlement type (village/town/city), faction,
  ward-layout variant (`LayoutType`: auto/organic/grid/linear/radial/
  terraced/perimeter/cluster), and seed, then regenerate on demand —
  without walking anywhere or waiting for full-world generation.
- Shows a live debug readout (building count, ward count, road-tile count,
  generation time, current draw-call-relevant mesh count) so layout/
  performance regressions are visible immediately, the same role
  `waterLabDebugEl` plays for swim state in `main.ts`.
- Lets the developer walk around the settlement with the real
  `PlayerController` to visually inspect scale, road continuity, and
  building placement, exactly like Water Lab lets you swim in the pool.

## Why extract a `SettlementRenderer` module (the core architecture decision)

`OverworldScene.ts`'s `_buildSettlements()` currently does plan→visuals
translation inline, reading `this._wg`, `this._GHW/_GHH`, and pushing into
`this._buildingGroups`/`this._roadMeshes`/`this._lampGroups`, and calling
`this._mergeGroupMeshesByMaterial()`/`this.registerBuildingCollider()`.
Building the lab by copy-pasting this logic would recreate exactly the
"two implementations quietly drift apart" failure mode the parity doc
documents for Studio vs. live settlements — except this time between live
and the very lab meant to guarantee parity with live.

**Decision: extract the plan→visuals step into a new, mostly-pure
`src/scene/SettlementRenderer.ts`** with a signature along the lines of:

```ts
export interface SettlementRenderContext {
  grid: WorldGrid;
  gridHalfWidth: number;   // GHW — world-origin offset
  gridHalfHeight: number;  // GHH
  tileSize: number;        // T
  stepHeight: number;      // SH
  mapFaction: (studioFaction: string) => Faction;
  mergeGroupMeshesByMaterial: (group: THREE.Group) => void;
  registerBuildingCollider: (dna: BuildingDNA, pos: THREE.Vector3, rotationY: number) => void;
  makeLampPost: () => { group: THREE.Group; light: THREE.PointLight };
}

export interface SettlementRenderResult {
  buildingGroups: THREE.Group[];
  buildingData: BuildingPlacementRecord[];   // anchors only, for fast-travel/interior lookup
  roadMesh: THREE.InstancedMesh | null;
  lampGroups: THREE.Group[];
  lampLights: THREE.PointLight[];
  boundary: { worldPos: THREE.Vector3; radius: number; name: string };
}

export function renderSettlementPlan(
  plan: SettlementPlan,
  ctx: SettlementRenderContext,
): SettlementRenderResult;
```

`OverworldScene._buildSettlements()` is refactored to call this once per
settlement entry and push the results into its existing member arrays —
behavior-preserving (verified by the existing chunk/scatter/collider
tests plus a new characterization test comparing before/after building
count, road-tile count, and collider count for a fixed seed). The lamp
callback/collider callback/merge callback are passed in as functions
rather than imported directly, because `_mergeGroupMeshesByMaterial()` and
`registerBuildingCollider()` are `OverworldScene` instance methods with no
free-function equivalent yet — passing them in avoids a second, larger
refactor of unrelated collider/material-pooling state out of the class.
`SettlementLabScene` supplies its own trivial versions of those three
callbacks (a local merge helper — reusing the *exact* `_mergeGroupMeshesByMaterial`
implementation, moved to a shared free function since it doesn't touch
`OverworldScene` state today; a simple `RAPIER` trimesh/cuboid collider
registrar; and a lamp-post builder reused from `OverworldScene` or
duplicated if trivial enough — see Open Question 1).

This is the one non-trivial refactor this feature requires; everything
else is new code in a new file.

## New file: `src/scene/SettlementLabScene.ts`

Modeled directly on `WaterLabScene.ts`'s shape (a class with
`enter()`/`exit()`/`update(dt)`, constructed once and reused,
`physics`/`player`/`scene` injected the same way):

1. **Synthetic ground**: a small flat `WorldGrid` (not the full realm
   generator) sized to comfortably fit a city layout —
   `PARAMS_BY_TYPE.city` is 420×320 world-model units at
   `SETTLEMENT_MODEL_SCALE = 0.095`, i.e. roughly a 40×30 tile footprint;
   round up to an 80×80 tile grid for margin. Every tile: flat elevation
   (e.g. level 2 of however many elevation steps `WorldGrid` uses),
   buildable biome (whatever `isScatterAllowed`/settlement-siting checks
   require to accept a tile — reuse the live overworld's grass/plains
   biome id), no water/roads/features pre-set. One real terrain mesh +
   trimesh collider built for it (reusing the terrain-mesh-building code
   `OverworldScene._loadTerrainChunk()` already has — the lab is small
   enough to be a single chunk-sized mesh, not a streamed multi-chunk
   grid, per Open Question 2).
2. **Generate**: call `planSettlement(type, centerCol, centerRow, seed,
   grid, name, faction)` directly (bypassing `SettlementPlacer`'s realm-
   assigned type/faction, since the lab needs direct control) then
   `applySettlementToGrid(plan, grid, id)`, then
   `renderSettlementPlan(plan, ctx)`, and add every returned group/mesh to
   `this.scene`.
3. **Regenerate**: tears down (dispose all groups/meshes/colliders/lights
   from the previous generation — mirroring `_unloadTerrainChunk()`'s
   generic Mesh-geometry-dispose traversal) and repeats step 2 with
   whatever the current control-panel values are.
4. **Spawn point**: player placed just outside the settlement boundary
   radius (from `SettlementRenderResult.boundary`), facing the centre.

## Dev control panel

A plain HTML overlay (same pattern as `waterLabDebugEl` in `main.ts` —
positioned `fixed`, toggled visible only while the lab scene is active),
containing:
- Seed: number input + "🎲 Randomize" button.
- Type: `village` / `town` / `city` dropdown.
- Faction: dropdown of the `Faction` values `factionBuildingDna()` supports.
- Ward layout: dropdown of `LayoutType` (`auto`/`organic`/`grid`/`linear`/
  `radial`/`terraced`/`perimeter`/`cluster`) — this is the exact
  degenerate-output surface the zero-buildings bug lived in
  (`fillWardRadial`/`fillWardClustered`), so being able to force any
  specific layout is the main point of the lab for that class of bug.
- "🔄 Regenerate" button (applies all of the above).
- Live readout (updated on each regenerate, not per-frame): building
  count, ward count, road-tile count, generation time (ms), and current
  scene mesh count broken down into individual-mesh vs. merged-batch-mesh
  counts (the same counters proven out in
  `OverworldScene.drawcall-batching.test.ts`), so a future settlement-
  visual change that regresses draw-call count is caught immediately in
  the lab instead of only being noticed in a full-overworld playtest.

## Launch wiring

Follows `DevRoomHandoff.ts`'s documented extension path exactly:
- Add `'settlement-lab'` to the `DevRoomId` union.
- `main.ts`'s dev-room boot handoff gets a `case 'settlement-lab'`
  analogous to the existing `'water-lab'` case.
- `overworld-studio.ts` gets a `#btn-devroom-settlement-lab` button next to
  the existing `#btn-devroom-water-lab` button in the Dev Rooms panel,
  wired the same way (`buildDevRoomLaunchUrl('/index.html', 'settlement-
  lab')` → `window.open(...)`).

## Testing

- `tests/scene/SettlementRenderer.test.ts`: given a fixed `SettlementPlan`
  + synthetic `WorldGrid`, asserts building-group count matches
  `plan.buildings.length` (minus any DNA-creation failures, matching
  `_buildSettlements()`'s existing `if (!dna) continue`), road mesh
  instance count matches deduplicated `plan.roads` tile count, collider
  registration is called once per building, and the boundary radius
  formula matches the existing SI-4 formula (farthest building + 4u
  margin) — this is a straight characterization/regression test for the
  extraction, not new behavior.
- `tests/scene/OverworldScene.settlement-renderer-parity.test.ts` (or
  folded into an existing settlement test): before/after the extraction,
  `_buildSettlements()` on a fixed seed/worldSize produces the same
  building count, road-tile count, and collider count as pre-refactor —
  guards against the extraction silently changing live behavior.
- `tests/e2e/settlement-lab.spec.ts`: mirrors `water-lab.spec.ts` —
  launches the lab, waits for buildings to appear, screenshots, exercises
  the regenerate button with a different type/faction/layout combination
  and re-screenshots.
- `tests/e2e/overworld-studio-settlement-lab-launch.spec.ts`: mirrors
  `overworld-studio-water-lab-launch.spec.ts` — Dev Rooms button opens the
  game straight into the lab.

## Explicitly out of scope for this pass

- Changing the live settlement algorithm itself (ward model, building mix,
  road style) — the lab is a test/iteration harness; algorithm changes are
  separate follow-up work once the lab makes them easy to evaluate.
- Multi-settlement layouts, inter-settlement roads, or NPC population in
  the lab (SI-3/P1-(3) is explicitly not-started per the parity doc and
  out of scope here) — one settlement, buildings + internal roads + lamps
  only.
- Asset-Library custom-building overrides (P2 in the parity doc) — unrelated.
- Any change to the realm-assigned type/faction siting logic
  (`SettlementPlacer.ts`) — the lab calls `planSettlement()` directly with
  explicit type/faction, sidestepping realm assignment entirely by design.

## Open questions for user review

1. **Lamp-post/collider helper duplication**: `_makeLampPost()` and
   `registerBuildingCollider()` are `OverworldScene` instance methods with
   non-trivial dependencies (`this._lampLights` bookkeeping, Rapier world
   handle). Assumed plan: extract `_makeLampPost()` to a free function
   (it doesn't appear to touch other instance state beyond returning a
   group+light for the caller to track) and pass `registerBuildingCollider`
   in as a context callback (as drafted above) rather than extracting it,
   since it's tightly coupled to `OverworldScene`'s physics-world/collider-
   registry members. **Please confirm this split is acceptable**, or say
   if you'd rather see the full collider registrar extracted too.
2. **Terrain approach for the lab's ground**: assumed a single small flat
   terrain mesh (not the chunked streaming system) since the lab is a
   fixed, bounded area — much simpler than reusing
   `_loadTerrainChunk()`'s per-chunk streaming machinery. **Please confirm**
   this is preferred over reusing the full chunk-streaming path (which
   would be more "real" but adds complexity with no benefit at this fixed,
   small scale).
3. **Faction list source**: assumed the dropdown uses whatever `Faction`
   values `factionBuildingDna()` / `_mapStudioFactionToRuntimeFaction()`
   support today (human_town/human_rural/human_noble, elven, dwarven,
   orcish, vampire, undead_common, vulperia, slime, fae) rather than the
   Studio's 9-value `SettlementFaction` — since the lab renders through
   the live building pipeline, which only understands runtime `Faction`
   values. **Please confirm.**
