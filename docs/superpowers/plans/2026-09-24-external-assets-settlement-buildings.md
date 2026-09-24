# Implementation Plan — External Assets Sub-task 2: Settlement Buildings + Building Interiors

**Parent initiative:** 3D Asset Integration (step 3 — wiring real Quaternius
assets into existing procedural placement/construction systems)
**Sub-task:** 2 of 5, per
`docs/asset-integration/2026-09-23-wiring-design-spec.md` §7 suggested order
(1. Monsters+Animals ✅ done · **2. Settlement Buildings + Building
Interiors** · 3. Dungeons · 4. Towers · 5. Nature Props)
**Reuses (no new research/design needed):**
`docs/asset-integration/2026-09-23-wiring-research.md` §3,
`docs/asset-integration/2026-09-23-wiring-design-spec.md` §2 (architecture),
§3 (settings toggle — already fully implemented in Sub-task 1), §4.2
(settlement buildings + interiors design details)

## Global Constraints

- **No invented textures/colors.** Every real-asset material comes from the
  Quaternius pack as-is (already imported/verified in step 2 + this
  session's remediation). If a building or interior-prop model has a known
  texture gap, flag it in the human playtest gate — do not patch with a
  guessed color.
- **No placement/layout changes.** `SettlementRenderer.ts`'s building
  siting, road layout, ward logic, and `PropPlacer.decorateRoom()`'s prop
  positions/counts are untouched. The resolver only swaps *what mesh* is
  used for a building/prop the existing systems already decided to place.
- **Hard fallback rule (design-spec §2, Hard rule #2):** every resolver
  falls through to the existing unmodified procedural builder whenever (a)
  `isCategoryEnabled('settlement-buildings' | 'building-interiors')` is
  false, or (b) it's true but no real-asset mapping exists for this
  specific `(faction, buildingKind)` / `propKind`. This must hold
  permanently, not just during development.
- **Async-load / sync-placement pattern (established in Sub-task 1's
  `AmbientCreature._loadRealAsset()`):** `buildBuilding(dna)` and
  `buildProp(dna)` stay **fully synchronous** and unchanged in their public
  contract — every existing call site (showroom, building-creator dev tool,
  `OverworldScene`, `EntityRegistry`, `SettlementRenderer`,
  `SceneManager`'s prop decoration) keeps working exactly as today,
  building the procedural mesh immediately. A real asset — which must load
  async via `loadQuatAsset()` (GLTF/OBJ + textures) — is swapped in
  **in-place** afterwards, once loaded, only at the two call sites that
  matter for this sub-task (`SettlementRenderer.renderSettlementPlan()` and
  `PropPlacer.decorateRoom()`). This avoids making `buildBuilding`/
  `buildProp` async (which would ripple into ~10 call sites, most of which
  are dev tools that don't need real-asset swap-in) while still getting
  real assets into the live game world.
- **Initial asset pool (per user's explicit prior clarification):** use
  `medieval_village_pack/buildings` (10 whole-building monolithic models:
  Bell Tower, Blacksmith, House 1-4, Inn, Mill, Sawmill, Stable) as the real
  asset pool for **every** faction, including non-human ones — don't block
  on a perfect style match. `modular_fantasy_village/medieval_village_megakit`
  (176 kit-of-parts pieces: walls, floors, doors, overhangs, balconies) is
  **not** used this sub-task — assembling it requires a wall/roof/floor
  layout engine comparable to `TerrainGeometryBuilder`/dungeon blueprint
  assembly, which is a materially bigger lift than a whole-building swap and
  is out of scope here. Flag it as a candidate for a future sub-task/follow-
  up in the plan's final doc-update task, not attempted now.
- **Interior props:** `fantasy_props/*` and `medieval_village_pack` prop
  entries supply real models for `PropPlacer`'s existing `PropKind` set
  (`chest, barrel, crate, pillar, statue, lantern, rug, bookshelf, table,
  chair, cauldron`). Exact per-kind mapping is decided in Task 1/3 by
  grepping the manifest for matching names — some kinds (e.g. `cauldron`,
  `rug`) may have no real-asset match; those stay procedural per the hard
  fallback rule, and that's expected, not a bug.
- **Interiors stay decoupled from exteriors (per research doc's proposed
  default, adopted here since the user did not flag it as a blocker):**
  swapping a building's exterior to a real asset does **not** force or
  change which interior-generation path runs. `generateInterior()`
  (`InteriorGenerator.ts:698`) is untouched; only the prop-dressing step
  (`PropPlacer.decorateRoom()`) gets a resolver.
- Follow `writing-plans`/`executing-plans` conventions: bite-sized steps,
  verify after each task, commit after each task.

## File Structure

```
src/world/buildings/QuatBuildingAdapter.ts   [NEW] faction × buildingKind →
                                              real building manifest lookup +
                                              async loader + scale/pivot fit
src/world/buildings/BuildingBuilder.ts       [MODIFIED] buildBuilding() gains
                                              an internal hook so a caller can
                                              request a post-build async swap
src/scene/SettlementRenderer.ts              [MODIFIED] renderSettlementPlan()
                                              fires the async swap per building
src/levels/InteriorPropAdapter.ts            [NEW] propKind → real interior
                                              prop manifest lookup + loader
src/prop-creator/builder.ts                  [MODIFIED] BuiltProp gains an
                                              internal hook for async swap
src/levels/PropPlacer.ts                     [MODIFIED] decorateRoom() fires
                                              the async swap per placed prop
src/ui/SettlementLabPanel.ts                 [MODIFIED] "Real assets" toggle
                                              (buildings + interiors) for
                                              side-by-side dev QA
src/scene/SettlementLabScene.ts              [MODIFIED] wires the panel toggle
                                              through to renderSettlementPlan
docs/asset-integration/2026-09-22-quaternius-asset-inventory.md
                                              [MODIFIED] mark buildings/
                                              interior-props sections as wired
                                              (not just imported); note
                                              megakit deferred
```

## Task 1: `QuatBuildingAdapter.ts` — faction × buildingKind → real building lookup + loader

**Step 1.** Grep `QUAT_MODELS` for the 10 `medieval_village_pack/buildings/*`
entries (already confirmed present: `Bell_Tower`, `Blacksmith`, `House_1..4`,
`Inn`, `Mill`, `Sawmill`, `Stable`) and read each one's on-disk bounding info
if available (or compute at runtime like `AmbientCreature` does via
`THREE.Box3`).

**Step 2.** Build a static lookup table keyed on `BuildingKind` (not
per-faction — the same 10 models serve every faction per the Global
Constraints note; per-faction variation stays purely in
`FACTION_BUILDING_VARIANTS`'s procedural path when no real mapping exists):

```ts
// src/world/buildings/QuatBuildingAdapter.ts
export const BUILDING_KIND_TO_QUAT_MODEL: Partial<Record<BuildingKind, string>> = {
  house:       'medieval_village_pack/buildings/House_1', // rotate 1-4 by dna.seed
  inn:         'medieval_village_pack/buildings/Inn',
  tavern:      'medieval_village_pack/buildings/Inn',      // no dedicated tavern model
  blacksmith:  'medieval_village_pack/buildings/Blacksmith',
  watchtower:  'medieval_village_pack/buildings/Bell_Tower',
  tower:       'medieval_village_pack/buildings/Bell_Tower',
  barn:        'medieval_village_pack/buildings/Stable',
  // shop, guild, chapel, cottage, villa, terraced, apothecary, market_stall,
  // gate, tent, well, ruin: no reasonable monolithic match in this 10-model
  // pack — stay procedural (hard fallback rule). Revisit if/when the
  // megakit or another building pack is wired in a future sub-task.
};
```

Use `House_1..4` rotation (pick by `dna.seed % 4`) so repeated houses in a
settlement aren't all visually identical.

**Step 3.** Write the async loader/fitter, mirroring
`AmbientCreature._loadRealAsset()`'s scale-to-target-height + re-pivot-to-
ground pattern, but fit to the building's **footprint** (`getFootprint()`)
instead of a target height alone — scale non-uniformly only if necessary to
avoid distorting the model; prefer uniform scale-to-footprint-width and
accept some depth mismatch (note this as a known cosmetic limitation, not a
texture/color invention issue, so it does not violate the no-invention
rule):

```ts
export async function loadRealBuildingExterior(
  buildingKind: BuildingKind, seed: number,
): Promise<THREE.Object3D | null> {
  const modelId = pickQuatBuildingModelId(buildingKind, seed); // handles House_1..4 rotation
  if (!modelId) return null;
  const quatDef = QUAT_MODELS.find(m => m.id === modelId);
  if (!quatDef) return null;
  try {
    const loaded = await loadQuatAsset(quatDef);
    // ...scale-to-footprint + ground-pivot fit, same Box3 technique as
    // AmbientCreature._loadRealAsset()...
    return loaded.scene;
  } catch {
    return null; // load failure — caller keeps the procedural building
  }
}
```

**Step 4.** Verify: write a quick Node/vitest unit test
(`src/world/buildings/__tests__/QuatBuildingAdapter.test.ts`) asserting
`pickQuatBuildingModelId('house', 0)` through `pickQuatBuildingModelId('house', 3)`
cycle through all 4 `House_N` ids deterministically, and that an unmapped
kind (e.g. `'well'`) returns `null`.

**Commit:** "Add QuatBuildingAdapter: faction-agnostic building-kind → real Quaternius model lookup"

## Task 2: Wire the resolver into `SettlementRenderer.renderSettlementPlan()`

**Step 1.** In `BuildingBuilder.ts`, add an optional field to
`BuildingInstance` (do not change `buildBuilding`'s signature or behavior):

```ts
export interface BuildingInstance {
  exteriorGroup: THREE.Group;
  bounds: { halfWidth: number; halfDepth: number; height: number };
  dna: BuildingDNA;
  dispose(): void;
}
```

(No change needed here — `exteriorGroup` is already a mutable `THREE.Group`
that callers can swap children on directly; no new field required.)

**Step 2.** In `SettlementRenderer.ts`'s `renderSettlementPlan()`, after the
existing `buildBuilding(dna)` call and `mergeGroupMeshesByMaterial(grp)`
(keep both exactly as-is — this is the guaranteed procedural fallback that
renders immediately), add:

```ts
if (isCategoryEnabled('settlement-buildings')) {
  void loadRealBuildingExterior(dna.buildingKind, dna.seed).then(realGroup => {
    if (!realGroup) return; // no mapping or load failure — keep procedural
    if (grp.parent === null) return; // building was removed/scene torn down
      // before the load resolved (settlement swap, dev-room exit, etc.)
    while (grp.children.length) grp.remove(grp.children[0]!);
    grp.add(realGroup);
    grp.userData['usingRealAsset'] = true;
  });
}
```

Guard with `grp.parent === null` (mirrors `this._disposed` check in
`AmbientCreature`) since settlements can be regenerated/torn down while the
async load is in flight.

**Step 3.** Verify via Playwright: load the overworld (or Settlement Lab —
whichever is faster to reach), screenshot a settlement with the toggle on,
confirm at least one house/inn/blacksmith/tower now shows the real
Quaternius mesh instead of the procedural kit-of-parts building.

**Commit:** "Wire real-building swap-in into SettlementRenderer.renderSettlementPlan()"

## Task 3: `InteriorPropAdapter.ts` — propKind → real interior prop lookup + loader

**Step 1.** Grep `QUAT_MODELS` for `fantasy_props/*` and
`medieval_village_pack/*` entries whose names plausibly match each
`PropKind` (`chest, barrel, crate, pillar, statue, lantern, rug, bookshelf,
table, chair, cauldron`) — e.g. search for `Barrel`, `Crate`, `Chest`,
`Table`, `Chair`, `Bookshelf`, `Lantern`, `Statue`, `Pillar`. Record actual
matches found (do not assume — verify each one exists in the manifest by
exact grep, the same discipline used for the Sub-task 1 remediation this
session).

**Step 2.** Build the lookup + loader, same shape as
`QuatBuildingAdapter.ts` but keyed on `PropKind` and fit to
`dna.size` (uniform scale) instead of a building footprint:

```ts
// src/levels/InteriorPropAdapter.ts
export const PROP_KIND_TO_QUAT_MODEL: Partial<Record<PropKind, string[]>> = {
  // one or more candidate model ids per kind — populate from Step 1's
  // verified grep results only, e.g.:
  barrel: ['fantasy_props/fantasy_props_megakit/Barrel'],
  crate:  ['fantasy_props/fantasy_props_megakit/Crate_1', 'fantasy_props/fantasy_props_megakit/Crate_2'],
  // ...
  // kinds with no verified match are simply omitted — hard fallback rule
  // sends them through the procedural path automatically.
};

export async function loadRealProp(propKind: PropKind, seed: number): Promise<THREE.Object3D | null> { /* ... */ }
```

**Step 3.** In `prop-creator/builder.ts`, `BuiltProp` already exposes
`root`/`collision`/`light`/`dna` — no interface change needed; the swap
happens the same way as buildings, by mutating `built.root`'s children
in-place from the caller.

**Step 4.** In `PropPlacer.ts`'s `decorateRoom()`, after
`const built = buildProp(dna); ... placed.push(...)`, add the same
fire-and-forget swap:

```ts
if (isCategoryEnabled('building-interiors')) {
  void loadRealProp(dna.propKind, dna.seed).then(realGroup => {
    if (!realGroup) return;
    if (built.root.parent === null) return; // room already unloaded
    while (built.root.children.length) built.root.remove(built.root.children[0]!);
    realGroup.scale.multiplyScalar(dna.size);
    built.root.add(realGroup);
  });
}
```

Note `built.root.parent` check covers the exact race `SceneManager.ts`'s
comment already documents (room swap invalidating in-flight
`decorateRoom()` promises) — this hook is even more exposed to it since it
resolves later, after `decorateRoom()` itself already returned.

**Step 5.** Verify: unit test for `PROP_KIND_TO_QUAT_MODEL` lookup
(mapped kind returns a valid `QUAT_MODELS` id; unmapped kind returns
`undefined`/empty). Playwright: load a library/alchemy/dungeon room via
the dev sandbox, screenshot before/after toggling `building-interiors` off,
confirm mapped kinds (e.g. barrel, crate) show real meshes when on and the
existing procedural prop when off.

**Commit:** "Wire real-asset swap-in into PropPlacer.decorateRoom() for interior props"

## Task 4: Settlement Lab dev-room real-vs-procedural toggle

**Step 1.** In `src/ui/SettlementLabPanel.ts`, add a checkbox row next to
the existing seed input / faction select / randomize+regenerate buttons:
"Real assets (buildings)" — bound to `isCategoryEnabled('settlement-buildings')`
initial state, calling `saveExternalAssetConfig()` with the toggled value on
change (same read/write functions the Settings-menu checkboxes already use
— no new state model).

**Step 2.** In `SettlementLabScene.ts`, no special-casing is needed beyond
what Task 2 already added to `SettlementRenderer.ts` — since the resolver
reads `isCategoryEnabled('settlement-buildings')` directly at call time,
flipping the panel checkbox and clicking the existing "Regenerate" button
already exercises both paths. Confirm this by inspecting
`SettlementLabScene.ts`'s regenerate handler calls `renderSettlementPlan`
fresh each time (it does, per `POC_KIND_OVERRIDE_BY_FACTION` usage at
line ~339-360).

**Step 3.** Verify via Playwright: open Settlement Lab
(`localhost:5173/overworld-studio.html` → Settlement Lab dev room),
toggle the new checkbox off, regenerate, screenshot (expect all-procedural
buildings); toggle on, regenerate, screenshot (expect real
house/inn/blacksmith/tower meshes mixed in per the lookup table).

**Commit:** "Add real-assets toggle to Settlement Lab dev panel"

## Task 5: Automated tests + full verification pass

**Step 1.** Run the full existing test suite (`npm test` or project's test
command) to confirm no regressions from the `BuildingBuilder.ts`/
`PropPlacer.ts` touch points (both files keep their existing exported
function signatures unchanged, so this should be a no-op risk, but verify).

**Step 2.** Run the two new unit test files from Tasks 1 and 3.

**Step 3.** Full Playwright pass covering: Settlement Lab toggle on/off per
faction (spot-check at least 3 factions, including one non-human faction
per the "use medieval pack even without a style match" clarification), a
tower/dungeon room's interior props on/off, and the Settings menu's
existing "Settlement Buildings"/"Building Interiors" checkboxes (confirm
they now have a real effect — Sub-task 1 built the UI/config plumbing but
nothing consumed these two categories until this sub-task).

**Step 4.** Update
`docs/asset-integration/2026-09-22-quaternius-asset-inventory.md`: mark the
`medieval_village_pack/buildings` and `fantasy_props`/relevant
`medieval_village_pack` prop entries as "wired" (not just "imported"), and
add a note that `modular_fantasy_village/medieval_village_megakit` (176
pieces) remains unwired — candidate for a future sub-task, not attempted
here.

**Commit:** "Sub-task 2 verification pass + inventory doc update"

## Human Playtest Gate (required before Sub-task 3 starts)

Ask the user to playtest:
- Settlement Lab: toggle real assets on/off per faction, confirm
  houses/inns/blacksmiths/towers render correctly (textures, no invented
  colors, reasonable scale/footprint fit) when on, and identical-to-today
  procedural buildings when off.
- A tower or dungeon room: confirm interior props (barrels, crates, etc.)
  swap to real assets when the "Building Interiors" category is on, and
  fall back cleanly for any unmapped `PropKind`.
- Flag anything that looks wrong (scale, rotation, missing texture,
  floating/clipping) — per this session's hard rule, any texture gap gets
  flagged, not patched with a guess, unless the user explicitly asks for a
  proper texture-sourcing pass.

**Do not start Sub-task 3 (Dungeons) until the user confirms.**
