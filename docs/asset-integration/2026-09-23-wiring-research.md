# Wiring Real Assets Into Procedural Systems — Research

*Step 3 of the 3D Asset Integration initiative (per the
`research-driven-world-polish` skill's research → design notes → spec →
plan → implement → test → playtest-gate cycle). Covers how each existing
PURELY PROCEDURAL placement/construction system in this codebase works today,
and where a real-asset hand-off could be inserted WITHOUT redoing the
placement/layout logic itself — per the user's explicit instruction that the
existing systems keep deciding *where* and *how many*, and only *what mesh to
place* changes.*

*Research method: 5 parallel read-only codebase explorations (nature props,
dungeon/tower generation, settlement buildings, monster/animal spawning, and
the dev-menu/Overworld Studio structure), each independently grepping and
citing exact file/line locations. No files were modified during this pass.*

---

## 1. Nature props (trees / rocks / flowers / bushes)

### Current pipeline (purely procedural)

```
NaturePropManager.update(playerX, playerZ)                  [NaturePropField.ts:216-267]
  → selectNaturePropPlacements(wg, x, z, radius, seed, kind) [NaturePropField.ts:64-146]
      → generateChunkScatterCandidates(...)                 [NatureScatterPoints.ts:70-108]  (Poisson-disc)
      → isScatterAllowed(cell, kind)                         [ScatterRules.ts:26-47]  (occupied/water/settlement/elevation gate)
      → pickTreeArchetype(biome, wx, wz) / pickRockArchetype [NatureAssetDNA.ts:54-67]
      → assembleFromRecipe(recipe, rand) → AssembledPart[]  [NatureAssetRecipes.ts:196-250]
  → NaturePropField.rebuild()                                [NaturePropField.ts:166-188]
      → one THREE.InstancedMesh per (partType, variantIndex, materialKey)
```

**There is no single "give me a mesh for this placement" function.** The
pipeline is: Poisson-disc placement → archetype selection → recipe
expansion into typed *parts* → each part resolved to a shared procedural
`BufferGeometry`/`Material` pair → instanced. `NatureAssetBuilder.ts` is
*not* a mesh builder — it only makes procedural `CanvasTexture`s
(`makeMottledCanvasTexture`, `makeBarkCanvasTexture`,
`makeRockFacetCanvasTexture`, lines 49-171).

### Biome → archetype table (the existing "what fits which biome" seam)

```ts
// NatureAssetDNA.ts:38-50
const BIOME_TREE_ARCHETYPES: Record<BiomeId, readonly TreeArchetype[]> = {
  grassland: ['deciduous', 'sparse'],  forest: ['conifer', 'deciduous'],
  taiga: ['conifer'],                  tundra: ['sparse'],
  mountain: ['sparse'],                snow: ['sparse'],
  desert: ['cactus','cactus','cactus','joshuatree'],
  savanna: ['acacia'],                 beach: ['sparse'],
  ocean: ['sparse'],                   deep_ocean: ['sparse'],
};
```
Rocks are biome-independent (`pickRockArchetype(wx, wz)`, boulder/slab/cluster).
Bushes use a single recipe key (`'bush'`).

### Existing archetype/variant vocabulary vs. Quaternius names

No 1:1 mapping exists today. Rough correspondence found:

| Existing archetype | Plausible Quaternius asset |
|---|---|
| `conifer` | `Pine_Tree_1..5` |
| `deciduous` | `Maple_Tree_1..5`, `Normal_Tree_1..5`, `Birch_Tree_1..5` |
| `sparse` | `Dead_Tree_1..9`, thin `Birch` |
| `acacia` | no close match — nearest is a `Normal_Tree` variant |
| `cactus` (3 variants) | **no Quaternius equivalent in the imported packs** |
| `rock-boulder/slab/cluster` | `Rock_1..5` |
| `bush` | `Bush`, `Bush_Flowers`, `Bush_Large(_Flowers)`, `Bush_Small(_Flowers)` |
| *(no current type)* | `Flower_1..5(_Clump)`, `Petals_1..4`, `Plant_1/2`, `Plant_Flowers` — no existing placement category at all |
| *(no current type)* | `Grass_Large(_Extruded)`, `Grass_Small` — no existing placement category at all |

**Open design question this raises for the spec:** flowers/grass have no
existing scatter-kind (`'tree' | 'rock' | 'bush'` today) — introducing them
means either a new scatter kind or treating them as bush sub-variants.

### Real-asset integration constraint (the important one)

Nature props are rendered via **`InstancedMesh` batching**, one instance
buffer per `(partType, variantIndex, materialKey)` — this is a real,
load-bearing performance strategy, not incidental. A loaded Quaternius GLB
is a **multi-mesh `THREE.Group`**, which cannot be dropped into the current
per-part instancing scheme directly. Options (to be decided in the spec,
not here):

1. Clone one GLB group per placement (simplest, loses instancing — likely
   fine at current densities: order-of-magnitude "dozens to low hundreds"
   of trees/bushes and "dozens" of rocks live within the 48-unit
   `NATURE_PROP_RADIUS`, well under the 4000-instance safety ceiling, but
   *not* free — needs a real perf pass, not an assumption).
2. Extract GLB submeshes once and build our own `InstancedMesh` per
   compatible geometry/material submesh (preserves batching, more upfront
   work, breaks if a GLB's submesh count/shape varies per prop).
3. `THREE.BatchedMesh` or a custom multi-draw batching layer.
4. Mixed strategy: keep instancing for procedural, use cloned GLBs only
   for real-asset-enabled categories (simplest to ship first, worth
   flagging as the likely v1 choice — surfaced as a spec decision, not
   decided here).

No existing feature-flag/toggle convention exists specifically for nature
generation today (grep for `USE_`/`ENABLE_` inside `src/world/Nature*` found
nothing) — a new toggle here is genuinely new, not a reuse of an existing
pattern.

---

## 2. Dungeons and tower floors (modular kit pieces)

### Current pipeline (purely procedural)

```
generateDungeon(seed, floorCount, basePrints) → DungeonPlan     [DungeonGenerator.ts]
generateTower(seed) → DungeonPlan                                [TowerGenerator.ts:340-390]
  DungeonPlan = Map<string, Blueprint> + startRoomId + seed      [DungeonGenerator.ts:28-35]
  Blueprint = { tiles, doors, staircases, spawns, interactables,
                width, depth, cellSize, wallHeight, floor, floorType }
                                                                  [blueprint.ts:72-119]
SceneManager.loadDungeon(plan) → loadRoomImmediate(startRoomId)  [SceneManager.ts:190-215]
  → renderBlueprint(bp, physics, opts) → RenderedRoom            [BlueprintRenderer.ts:201]
      wall tiles  → BoxGeometry                                  [BlueprintRenderer.ts:268-290]
      pillars     → CylinderGeometry                             [BlueprintRenderer.ts:292-305]
      corners     → low-poly cylinders                           [BlueprintRenderer.ts:313-345]
      doors       → procedural door-frame boxes + trigger AABB   [BlueprintRenderer.ts:~350-620]
      stairs      → buildStaircase(): 7 procedural box steps      [BlueprintRenderer.ts:74-198]
  → decorateRoom(RoomDecorInput) → PropPlacer                     [PropPlacer.ts:80-145]
      → buildProp(dna) from prop-creator/builder (also procedural)
```

**Blueprint is the correct seam.** It's already an abstract, renderer-agnostic
tile/door/stair data model (cell coordinates + type + facing), built and
consumed independently of `renderBlueprint`. This means: **keep
`DungeonGenerator`/`TowerGenerator`/`Blueprint`/`SceneManager` transitions and
physics/trigger math entirely unchanged; only `renderBlueprint()` (and
`buildStaircase()`, and the door-frame branch inside it) needs a real-asset
alternative path.**

Modular dungeon kit pieces already map well onto this data model — the
Quaternius `modular_dungeons/obj_kit` pack's own subgroups (Arches/Doors/
Columns, Walls & Windows, Floors, Stairs/Traversal, Furniture & Containers,
Lighting & Decor) line up almost directly with `TileEntry`/`DoorEntry`/
`StaircaseEntry` types plus `PropPlacer`'s dressing categories.

**No existing modular-kit abstraction is reused today.** `ModularSet.ts` (the
building system's "vocabulary of reusable pieces") is explicitly
primitives-only per its own header comment, and `BlueprintRenderer.ts` does
not call into it — dungeon wall/floor/door construction is inlined directly
in the renderer. There is no `DungeonKit`/`DungeonMeshBuilder` today; this
would be new code, not a rewire of something existing (still fine — the
spec should build one *swappable provider* per tile/door/stair type, not
duplicate placement/layout logic).

**Interior dressing (furniture, containers, torches, decor) is also fully
procedural today** via `PropPlacer.decorateRoom()` → `buildProp(dna)`
(`@/prop-creator/builder`) — another clean swap point for
Furniture & Containers / Lighting & Decor Quaternius subgroups.

**No dev room exists for dungeon/tower preview.** `overworld-studio.ts`
has a 2D/diagrammatic dungeon-map preview (~line 1437-1990), and there's a
`DungeonEditor.ts` / `TowerFloorEditor.ts`, but no live 3D dungeon dev room
registered in `DevRoomHandoff.ts` (`DevRoomId` is currently only
`'water-lab' | 'settlement-lab' | 'overworld-lab'`). A `tower-lab`/
`dungeon-lab` entry would be new, matching Water Lab's precedent (a mode
inside `/index.html` via `?devroom=`, not a new standalone HTML page).

---

## 3. Settlement buildings (kit-of-parts generators)

### Current pipeline (purely procedural)

```
SettlementModelGenerator.ts: fillWard*() → PlacedBuilding rects   [SettlementGenerator.ts:280-311,585-592]
  WARD_TO_KIND resolves ward type → BuildingKind
SettlementRenderer.renderSettlementPlan()                          [SettlementRenderer.ts:125-153]
  → createSettlementBuildingDna(...)                                [BuildingTypeMap.ts:23-55]
      (maps studio faction string → runtime Faction, resolves
       WARD_TO_KIND, size/floors/seed; already accepts a dev/test
       buildingKind override at line 44)
  → buildBuilding(dna: BuildingDNA): BuildingInstance                [BuildingBuilder.ts:1611]
      1. getFactionBuildingVariant(faction, kind) — per-faction override [FactionBuildingVariants.ts:304-305,550]
      2. else KIND_BUILDERS[kind] generic procedural builder          [BuildingBuilder.ts:1591-1645]
      → returns { exteriorGroup, bounds, dna, dispose() }
```

**`buildBuilding(dna)` is the exact hand-off point** — settlement
layout/siting (which ward, which building rect, how many) is entirely
upstream and untouched; a real-asset resolver just needs to intercept before
or alongside `KIND_BUILDERS`/`FACTION_BUILDING_VARIANTS`, keyed on the same
`dna.faction` + `dna.buildingKind` (+ size/style) already computed.

### Faction/style vocabulary (existing, real, and reusable)

`BuildingKind` (`house, terraced, cottage, villa, shop, inn, tavern,
apothecary, market_stall, guild, chapel, tower, watchtower, blacksmith,
barn, well, gate, tent, ruin` — `BuildingDNA.ts:8-40`), `BuildingStyle`
(`thatched, stone, timber, arcane, nordic, tudor, gothic, elven, dwarven,
vampiric, nomadic, fae, orcish`), `Faction` (`human_rural, human_town,
human_noble, elven, dwarven, vampire, undead_common, draconic, celestial,
vulperia, slime, fae, orcish` — `BuildingDNA.ts:146-159`), and
`FACTION_PRESETS` mapping faction → default style/colors/condition
(`BuildingDNA.ts:154-180`). This is a rich existing vocabulary the real-asset
mapping table (faction → best-fit building pack, per the user's earlier
"don't block on a perfect match" clarification) can hang directly off of,
with no changes to the vocabulary itself.

### Exterior/interior split (confirmed, real, relevant to the "interiors"
asset category)

`buildBuilding(dna)` returns *only* `exteriorGroup` — it never calls
`generateInterior()`. Interiors are generated separately and lazily:

```ts
generateInterior(dna: BuildingDNA, floorIndex = 0): InteriorScene   [InteriorGenerator.ts:698]
  floorSeed = dna.seed ^ (floorIndex * 0x6B8B4567)                  [InteriorGenerator.ts:708-713]
  generatePlan({ ...dna, seed: floorSeed })                          [InteriorGenerator.ts:116]
```

This means a real-asset building swap needs an explicit policy question
(for the spec, not decided here): does a real exterior building still get a
fully-procedural interior (simplest — interiors stay untouched, matches "no
redoing what works"), or does swapping the exterior asset imply the
interior pack should also switch (e.g. `modern_type_buildings/interior_pack`
pairs with `city_pack`)? Given the user's "don't block on perfect fit"
stance, decoupling (procedural interior always, real exterior optional) is
the lower-risk default to propose.

### Existing dev room — the best integration/preview target

`SettlementLabScene.ts` already supports per-faction and per-building-kind
*forced* overrides (`POC_KIND_OVERRIDE_BY_FACTION`, `forceBuildingKind`
passed into `renderSettlementPlan`, lines 47-105 and 330-386) — this is
already registered as dev room `'settlement-lab'`
(`DevRoomHandoff.ts:20-77`). **This is the natural place to add a
real-vs-procedural building toggle for direct visual comparison**, since it
already has the faction/kind override machinery the toggle would sit next
to.

---

## 4. Monsters and animals

### The existing seam is already asset-capable — this is the best-understood category

```
RoomEncounterDef.enemies: EnemySpawnDef[] → { enemyId, count, spawnPattern } [RoomEncounterDef.ts:44-58]
SceneManager._spawnWave() creates enemy entity, assigns group.userData.enemyId [SceneManager.ts:790-854]
  → getEnemyModelDef(enemyId)                                        [EnemyLoader.ts:490-497]
      enemyId → ENEMY_MANIFEST entry → CharModelDef.id → CHAR_MODELS lookup
  → loadEnemyById() → CharacterLoader.loadCharModel()                [EnemyLoader.ts:164-180]
      (falls back to buildProceduralEnemyRig() if no CharModelDef found)
```

**`CharacterLoader.ts` already loads real rigged/animated GLB/FBX assets for
production characters today** — this is not purely procedural. `ENEMY_MANIFEST`
already contains entries pointing at Quaternius monster models copied into
the *character* manifest namespace, e.g. `monster_pack_animated/skeleton →
skeleton_archer`, `monster_pack_animated/bat → bat_swarm`,
`monster_pack_animated/slime → slime_cube`, `monster_pack_animated/dragon →
dragon_whelp` (`EnemyLoader.ts:280-303,363-371`). Several encounter IDs are
explicit TODO placeholders for not-yet-integrated packs (`imp`,
`spectral_knight` — `RoomEncounterDef.ts:200,213,313,335`), meaning **this
integration work was already anticipated and partially started** before this
initiative began.

**Key architectural fact:** `QuaterniusAssetLoader.ts` and
`CharacterLoader.ts` are structurally near-identical (same cache/pending-map/
clone/mixer pattern, deliberately per `QuaterniusAssetLoader.ts`'s own doc
comment) but operate on two different manifest types — `QuatModelDef` vs.
`CharModelDef`. **The lowest-risk integration path is an adapter that maps
a `QuatModelDef` into a `CharModelDef`-shaped entry** (or a resolver that
tries `CHAR_MODELS` first, then `QUAT_MODELS`), rather than building a
parallel spawn/loading system. This directly satisfies "existing systems
decide where/how many, hand off what mesh" — `_spawnWave()`/`RoomEncounterDef`
need zero changes; only manifest resolution changes.

### Biome fit

- **Animals**: a real, existing, directly reusable table —
  `AMBIENT_BIOME_RULES` (`AmbientWildlife.ts:72-80`): `forest/grassland/
  taiga → rabbit`, `mountain → goat`. Currently only 2 procedural species.
  Quaternius's 12 `ultimate_animated_animals` (Alpaca, Bull, Cow, Deer,
  Donkey, Fox, Horse, Horse White, Husky, Shiba Inu, Stag, Wolf) would
  extend this table directly — this is a data-only addition once the
  wildlife spawn path can resolve a `QuatModelDef` instead of only
  `CreatureDNA`/`buildCreature`.
- **Monsters**: **no existing per-biome monster table** — `ENEMY_MANIFEST`
  has `tier`/`species` but no `BiomeId` field, and `RoomEncounterDef` is
  organized by dungeon floor/pattern, not overworld biome. This is new
  metadata the spec needs to design (whether on `EnemyManifestEntry` or a
  separate registry), not a rewire of something existing.

### Dev-room / preview

No "Bestiary"/"Encounter Lab" dev room exists. `asset-lab.html` (already
wired into Overworld Studio's Dev Rooms menu, button `btn-devroom-asset-lab`)
is the only current live-preview surface for these models, and it is a pure
asset browser (no encounter/spawn simulation).

---

## 5. Dev-menu structure (for the "external assets" toggle requirement)

### Exact current Dev Rooms wiring

```html
<!-- overworld-studio.html:40-48 -->
<div class="section" id="dev-rooms-section">
  <div class="section-title">🧪 Dev Rooms</div>
  <button class="btn" id="btn-devroom-water-lab">🌊 Water Lab</button>
  <button class="btn" id="btn-devroom-asset-lab">🗿 Asset Lab</button>
</div>
```
- **Water Lab / Settlement Lab / Overworld Lab** are modes *inside*
  `/index.html`, launched via `?devroom=<id>` (query param preferred,
  `localStorage` kept as legacy fallback) — see
  `src/overworld-studio/DevRoomHandoff.ts`'s own header comment, which
  documents the exact 4-step pattern for adding a new one: (1) add to the
  `DevRoomId` union, (2) add a button in `overworld-studio.html`, (3) add a
  click handler in `overworld-studio.ts`, (4) add a boot-handoff branch in
  `main.ts`.
- **Asset Lab** is the one exception — a fully separate HTML entry
  (`asset-lab.html` / `src/asset-lab.ts`), opened via plain `window.open()`,
  no query-param handoff needed since it's a standalone Three.js app.

`DevRoomId` today: `'water-lab' | 'settlement-lab' | 'overworld-lab'`
(`DevRoomHandoff.ts:29`).

### Existing persisted dev-toggle convention

```ts
// DevPanel.ts:12,15-17
export const LS_DEV = 'ttt_dev_mode';
export function devModeEnabled(): boolean {
  return localStorage.getItem(LS_DEV) === 'true';
}
```
Read/write pairs like this recur throughout `MainMenu.ts` (dev-mode
checkbox at line 724, persisted at line 840) — the established convention
is a named `localStorage` string key holding `'true'`/`'false'`, gated
behind `ttt_dev_mode` for anything dev-only. `WorldGenConfig.ts` (lines
1-109) is the closest existing precedent for a *structured* (not just
boolean) persisted config object — `loadConfig()`/`saveConfig()` with
sensible defaults and missing-key fallback — a good template for a
multi-category flag set rather than 5 separate ad-hoc keys.

There is **no existing multi-category enable/disable `Record<Category,
boolean>` convention** apart from one structurally-similar-but-unrelated
example (`KIND_SOLID: Record<PropKind, boolean>` in
`src/prop-creator/types.ts:112`, a solidity lookup, not a feature flag).

### Recommendation for the "external assets" dev submenu (for the spec to decide, not final here)

Given the toggle is a *configuration panel*, not a 3D-preview lab, the
lowest-friction placement is a **new section inside `overworld-studio.html`**
(next to or below "Dev Rooms"), backed by a single structured `localStorage`
key (e.g. `ttt_external_assets_v1`) holding a `Record<AssetCategory,
boolean>`, read by whichever procedural systems gain a real-asset resolver
path (nature props, settlement buildings, dungeon kit pieces, monster/animal
spawn resolution). This avoids a second standalone HTML page (unlike Asset
Lab, this isn't itself a 3D view) and matches the existing "structured
config object in localStorage" precedent (`WorldGenConfig.ts`) rather than
inventing a new one. **This is a recommendation for the spec to confirm, not
a decision made in this research pass.**

---

## Cross-cutting themes across all 5 systems

1. **Every system already has a single, identifiable, narrow hand-off
   function or data seam** where placement/layout ends and mesh-building
   begins: `assembleFromRecipe()` (nature), `renderBlueprint()`/
   `buildStaircase()` (dungeon), `buildBuilding(dna)` (settlement),
   `getEnemyModelDef()`/manifest resolution (monsters/animals). None of
   these require touching the upstream placement/siting/layout logic.
2. **Monsters/animals are the most mature** — `CharacterLoader.ts` already
   loads real rigged assets in production, and `ENEMY_MANIFEST` already has
   some Quaternius entries wired in (apparently started before this
   initiative, then left with TODOs). This is likely the lowest-risk,
   fastest sub-task to implement first.
3. **Nature props are the highest-risk** on performance grounds — the only
   system relying on `InstancedMesh` batching as a hard architectural
   constraint that a naive "clone one GLB Group per placement" swap would
   silently violate at scale. This needs its own perf-conscious design
   decision in the spec, not an assumption.
4. **No existing multi-category feature-flag convention exists anywhere in
   this codebase** — the "external assets on/off per category" dev toggle
   is genuinely new UI/config, not a reuse of something already built. The
   closest useful precedent is `WorldGenConfig.ts`'s structured
   load/save-with-defaults pattern.
5. **Two genuinely new data gaps surfaced that don't exist in any current
   table and need explicit design decisions**: (a) no monster-biome-fit
   table exists anywhere (only animals have one), and (b) nature props have
   no placement category at all for flowers or grass (only tree/rock/bush
   exist as scatter kinds today).

## Sources

- Direct codebase exploration only (no external research needed for this
  step — the questions here are entirely "how does this specific codebase's
  existing machinery work", not "how do other games solve procedural
  placement", which was already covered by earlier phases of this project's
  other initiatives per this skill's own guidance to check existing
  half-built machinery first).
