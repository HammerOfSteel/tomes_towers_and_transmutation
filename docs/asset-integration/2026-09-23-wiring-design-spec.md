# Wiring Real Assets Into Procedural Systems — Design Spec

*Step 3 of the 3D Asset Integration initiative (per the
`research-driven-world-polish` skill). Research for this spec is at
`docs/asset-integration/2026-09-23-wiring-research.md` — read that first for
exact existing file/function citations this spec builds on.*

*Scope: this spec covers the WIRING architecture and the Settings toggle
only. It does not contain a phased task breakdown — that is produced next,
by the `writing-plans` skill, as step 4's implementation plan(s), each
sub-task going through its own implement → test → human-playtest-gate
cycle per the parent skill's requirement that sub-tasks never run in
parallel or skip the gate.*

---

## 1. Goal

Let each of the 5 already-working procedural placement/construction systems
(nature props, settlement buildings + interiors, dungeons, towers, monster
& animal spawning) optionally hand off "what mesh to place" to a real,
imported Quaternius asset — while the systems that decide *where* and *how
many* stay completely unchanged. This must be reversible per-category via a
Settings toggle, defaulting to "real assets on" once shipped, with instant
fallback to today's pure-procedural behavior when a category is off or when
no real asset exists for a specific archetype/kind.

## 2. Architecture: the asset-resolver pattern

Each of the 5 systems already has one narrow, identifiable seam where
placement/layout ends and mesh construction begins (established in
research §1-4). At each seam we add a small **asset-resolver module** — not
a rewrite of the surrounding system — with this shape:

```ts
function resolveX(existingProceduralInput): THREE.Object3D {
  if (!isCategoryEnabled('<category>')) return buildProcedural(existingProceduralInput);
  const realAsset = lookupRealAsset(existingProceduralInput); // keyed on the SAME
                                                               // archetype/kind/faction
                                                               // the procedural system
                                                               // already computed
  if (!realAsset) return buildProcedural(existingProceduralInput); // no mapping for
                                                                    // this specific kind
  return buildFromRealAsset(realAsset, existingProceduralInput);
}
```

**Hard rule, non-negotiable per the user's original scope:** no resolver
ever touches placement, siting, count, spacing, or layout logic. Each
resolver's only inputs are values the existing procedural system *already
computed* (archetype, biome, faction, buildingKind, tile type, etc.) —
never new placement math.

**Hard rule #2:** every resolver falls through to the existing, unmodified
procedural builder whenever (a) its category toggle is off, or (b) the
toggle is on but no real asset is mapped for this specific archetype/kind
(e.g. `cactus`/`acacia` trees, or a monster tier with no matching model).
This was explicitly confirmed by the user and keeps today's behavior as a
guaranteed safety net in every system, permanently — not just during
development.

### Per-system resolver placement

| System | Resolver sits at | Keyed on |
|---|---|---|
| Nature props | `assembleFromRecipe()` seam in `NaturePropField.ts` (new resolver module, e.g. `NatureAssetResolver.ts`) | tree archetype / rock archetype / `'bush'` (+ new flower/grass kinds) |
| Settlement buildings | inside `buildBuilding(dna)`, checked before `FACTION_BUILDING_VARIANTS`/`KIND_BUILDERS` (`BuildingBuilder.ts:1611`) | `(dna.faction, dna.buildingKind)` |
| Building interiors | inside `PropPlacer.decorateRoom()`'s `buildProp(dna)` call | prop kind (crate/table/bookshelf/etc.) |
| Dungeons (non-tower) | inside `renderBlueprint()` + `buildStaircase()` (`BlueprintRenderer.ts`) | `TileEntry.type` / `DoorEntry` / `StaircaseEntry` |
| Towers | inside `renderBlueprint()`, walls only — floor `PlaneGeometry` stays procedural | wall `TileEntry` cells only |
| Monsters | `getEnemyModelDef()` resolution chain (`EnemyLoader.ts`) | `enemyId` → manifest → (new) real-asset-aware lookup |
| Animals | `AmbientWildlife.ts` spawn/build path | species (extended `AMBIENT_BIOME_RULES`) |

## 3. Settings toggle

A new **"External Assets"** section appears in the Settings menu
(`MainMenu.ts`), visible only when Dev Mode is on (`devModeEnabled()`,
matching the existing `ttt_dev_mode`-gated pattern). It contains:

- One master **"All"** toggle.
- Six individual toggles: **Nature Props, Animals, Monsters, Settlement
  Buildings, Building Interiors, Dungeons/Towers**.
- All six default to **ON** the first time Dev Mode is enabled (real assets
  are the intended eventual default; Dev Mode exists so a developer can
  switch specific categories off to isolate/compare/debug, not so real
  assets start opt-in).

State is one structured localStorage key:

```ts
// New file: src/world/ExternalAssetConfig.ts (follows WorldGenConfig.ts's
// load/save-with-defaults convention, not five separate ad-hoc keys)
export type AssetCategory =
  | 'nature-props' | 'animals' | 'monsters'
  | 'settlement-buildings' | 'building-interiors' | 'dungeons-towers';

export interface ExternalAssetConfig {
  enabled: Record<AssetCategory, boolean>; // all default true
}

export function loadExternalAssetConfig(): ExternalAssetConfig;
export function saveExternalAssetConfig(cfg: ExternalAssetConfig): void;
export function isCategoryEnabled(cat: AssetCategory): boolean; // convenience read
```

`localStorage` key: `ttt_external_assets_v1`. Every resolver module calls
`isCategoryEnabled(cat)` directly — no prop-drilling, matching how
`devModeEnabled()` is read anywhere in the codebase today.

The master "All" toggle is a UI convenience only (sets all six on
click) — there is no separate "all" flag in the persisted config; it's
purely derived/recomputed from the six category values each render.

## 4. Per-system design details

### 4.1 Monsters and animals (build first — lowest risk, already partially wired)

- New adapter converts a `QuatModelDef` into a `CharModelDef`-shaped entry
  so the existing `ENEMY_MANIFEST → getEnemyModelDef() → CharacterLoader`
  chain can resolve real Quaternius monster models without any change to
  `_spawnWave()` or `RoomEncounterDef`. This completes the TODO placeholders
  already visible in `RoomEncounterDef.ts` (`imp`, `spectral_knight`, etc.)
  as part of the same pass.
- New **biome-to-monster fit table** (there is no existing one — this is
  new metadata, not a rewire) added parallel to `AMBIENT_BIOME_RULES`,
  living alongside the manifest (e.g. a `biome` field added to
  `EnemyManifestEntry`, or a separate `MONSTER_BIOME_RULES` registry —
  final shape decided in the implementation plan, not here).
- `AMBIENT_BIOME_RULES` (`AmbientWildlife.ts:72-80`) extended with the 12
  `ultimate_animated_animals` (Alpaca, Bull, Cow, Deer, Donkey, Fox, Horse,
  Horse White, Husky, Shiba Inu, Stag, Wolf), each assigned a biome per a
  reasonable fit (not required to be perfect, consistent with the earlier
  faction-fit precedent the user already approved for buildings).
- Wildlife's `buildCreature`/`CreatureDNA` procedural path becomes the
  fallback exactly like `buildProceduralEnemyRig()` already is for enemies.

### 4.2 Settlement buildings + building interiors

- Real-asset building lookup table keyed on `(faction, buildingKind)`,
  checked inside `buildBuilding(dna)` before `getFactionBuildingVariant()`
  and before the generic `KIND_BUILDERS` fallback. Uses
  `medieval_village_pack`/`modular_fantasy_village` as the initial pool for
  every faction per the user's earlier explicit clarification (no blocking
  on a perfect faction/style match).
- **Interiors are a separate toggle and stay decoupled from exteriors**:
  `InteriorGenerator.generatePlan()`/room layout is untouched regardless of
  the Building Interiors toggle. Only the furniture/prop-dressing step
  (`PropPlacer.decorateRoom()` → `buildProp(dna)`) gets a resolver that
  swaps individual procedural props (crates, tables, bookshelves, barrels,
  etc.) for matching real Quaternius interior-prop assets when available.
- Settlement Lab (`SettlementLabScene.ts`) gets a new dev toggle,
  alongside its existing `forceBuildingKind`/faction override controls,
  to force real-vs-procedural rendering side by side for the same
  building for QA.

### 4.3 Dungeons (non-tower) — full modular kit swap

- Per the user's explicit direction this turn: dungeons get the deepest
  swap of any category. `renderBlueprint()` and `buildStaircase()`
  (`BlueprintRenderer.ts`) gain a resolver that sources **walls, floors,
  doors, stairs, and arches** from `modular_dungeons/obj_kit` (the
  non-sci-fi modular dungeon pack) instead of building `BoxGeometry`/
  `CylinderGeometry`/`PlaneGeometry` primitives — because these Quaternius
  pieces are purpose-built to be assembled this way and are expected to
  look substantially better than the procedural boxes. `Blueprint`'s
  `TileEntry`/`DoorEntry`/`StaircaseEntry` data model requires no changes;
  only the renderer's interpretation of each entry changes.
- Furniture & Containers / Lighting & Decor Quaternius subgroups feed the
  same `PropPlacer.decorateRoom()` resolver used for building interiors
  (§4.2) — one shared prop-resolver, reused, not duplicated per subsystem.

### 4.4 Towers — walls swap, floors stay procedural

- Per the user's explicit direction this turn: unlike standard dungeons,
  tower floors (`TowerGenerator.ts`'s circular-chamber floor tiles) **stay
  procedural** — only **wall** `TileEntry` cells get swapped to real
  modular dungeon-kit wall pieces, chosen/oriented to produce the rounder,
  more tower-like look the user wants. This is a narrower resolver than
  the full-dungeon one in §4.3 (walls only), reusing the same underlying
  `modular_dungeons/obj_kit` wall-piece assets.
- `overworld-studio.ts`'s existing dungeon/tower map preview area gets a
  small live on/off toggle so a given seed's dungeon or tower can be
  compared procedural-vs-real without leaving the Studio.

### 4.5 Nature props — full submesh-extraction instancing (highest engineering effort, done last)

Per the user's explicit choice this turn (Option B — "do it right the
first time"), nature props get real instancing, not per-placement clones:

- A new module (e.g. `NatureRealAssetPools.ts`, parallel to the existing
  `NaturePartPools.ts`) loads each real-asset GLB **once**, extracts its
  submeshes (geometry + material pairs), and builds one shared
  `THREE.InstancedMesh` per unique submesh — mirroring the existing
  `(partType, variantIndex, materialKey)` grouping strategy in
  `NaturePropField.ts`, just with real geometry/materials as the source
  instead of procedural ones.
- `assembleFromRecipe()`'s output (`AssembledPart[]`) is unchanged in
  shape; the resolver only changes which pool (`NaturePartPools` vs.
  `NatureRealAssetPools`) each part resolves against, keyed by the same
  archetype/rock-type strings already used today (`conifer`, `rock-
  boulder`, `bush`, etc.).
- **New scatter kinds required for flowers and grass** — these have no
  placement category today (only `'tree' | 'rock' | 'bush'` exist). A
  `'flower'` and `'grass'` scatter kind are added to `ScatterRules.ts`/
  `NatureScatterPoints.ts`/`NaturePropField.ts`, with their own Poisson
  density constants (flowers/grass are expected to be denser and smaller
  than bushes) and their own biome-fit table analogous to
  `BIOME_TREE_ARCHETYPES`. These are **purely-real-asset kinds** — there
  is no procedural equivalent to fall back to when this category is off,
  so when Nature Props is toggled off, flowers/grass simply do not spawn
  (same as if they didn't exist, matching pre-initiative behavior).
- Archetypes with no real-asset equivalent (`cactus` variants, `acacia`)
  keep using `NaturePartPools` forever, even with the category toggle on,
  per the general fallback rule in §2.

## 5. Verification/dev surfaces (per system)

- **Monsters/Animals:** `asset-lab.html` (existing) for individual model
  QA; live in-game testing via the Settings toggle (spawn encounters/
  wildlife with the category on vs off).
- **Settlement Buildings/Interiors:** Settlement Lab gets a new
  real-vs-procedural force toggle next to its existing faction/kind
  overrides.
- **Dungeons/Towers:** a small live toggle added to `overworld-studio.ts`'s
  existing dungeon/tower preview area (no new dev room/page).
- **Nature Props:** Asset Lab for individual model QA; live in-game
  testing via the Settings toggle; a Playwright screenshot pass comparing
  instanced real-asset density vs. today's procedural density is expected
  as part of this sub-task's automated tests, given the identified perf
  risk.

## 6. Testing approach (per sub-task, applied in step 4's plan)

- Unit tests for each new resolver's fallback logic (toggle off → calls
  procedural builder; toggle on + no mapping → calls procedural builder;
  toggle on + mapping exists → calls real-asset builder) — pure logic,
  mockable, following this project's established unit-test norm.
- Unit tests for the new biome-to-monster and extended biome-to-animal
  tables (every biome resolves to at least one species/monster).
- Playwright smoke screenshots for each subsystem once implemented,
  toggling the category on/off and confirming no console errors and
  visually-plausible output (established pattern from step 2's bug-fixing
  work).
- Human playtest gate after **each** sub-task (per category, per the
  suggested order in §7) before the next sub-task's research/design even
  starts — no chaining across sub-tasks without a checkpoint.

## 7. Suggested sub-task order for step 4's plan

Per the user's explicit choice, ordered by risk/maturity (lowest risk /
most already-wired first):

1. Monsters + Animals (already partially wired; adapter + biome tables)
2. Settlement Buildings + Building Interiors (single well-understood seam)
3. Dungeons (non-tower) — full modular kit swap
4. Towers — walls-only swap
5. Nature Props — new instancing infrastructure + new flower/grass scatter
   kinds (highest engineering effort, done last)

This order is a recommendation for step 4's plan to structure sub-tasks
around — each sub-task still gets its own full research → design → spec →
plan → implement → test → playtest-gate cycle per the parent skill; this
spec does not itself contain per-sub-task task breakdowns.

## 8. Explicitly out of scope for this spec

- Exact real-asset-to-archetype mapping tables (which specific Quaternius
  model file maps to `conifer` vs `deciduous`, etc.) — these are
  implementation-plan-level detail, decided per sub-task using the
  existing inventory doc.
- The `modular_dungeons` sci-fi kit and `modern_type_buildings` packs
  remain out of scope for this wiring pass (they were already imported per
  the user's "import everything" directive but have no natural fit in any
  of the 5 systems above — a future faction/theme could use them, but
  that's a new decision, not part of this spec).
- Blender-based nature_props export completion is a separate, already
  tracked open item in the inventory doc — not blocking this spec.
