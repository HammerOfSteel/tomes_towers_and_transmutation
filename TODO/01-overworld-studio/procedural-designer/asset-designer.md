# Procedural Asset Designer
> Visual designer UI for DNA-based entity creation (NPC, Building, Enemy, Prop).
> Same concept as `princess-creator.html` — but for all entity types.
> References PROC-B for implementation details.

## Status: 🚧 NPC/Building/Enemy designers shipped as standalone pages; Prop Designer still missing

## Note on Enemy Designer surface
The original plan called for extending `creature-lab.html` (a Three.js geometry
debug viewer wired into e2e visual-regression tests, see `window.__lab` API
consumed by `tests/e2e/creature-visual.test.ts` etc.) with an enemy mode.
Mutating that shared test harness risked breaking existing coverage, so the
Enemy Designer instead shipped as its own standalone `enemy-creator.html` page
— consistent with the NPC/Building designers' established pattern (own HTML
page + own `main.ts` DOM-wiring entry + Vite build entry).


## Principle
One designer pattern, multiple entity types:
```
[Type selector] [DNA sliders/pickers] [Live 3D preview] [Save to Library]
```

## Per-Entity Designer

### NPC Designer (`npc-creator.html`) 🚧
- [x] Pure state-management layer shipped (`src/npc-creator/creatorState.ts`) — `npc-creator.html` itself is DOM wiring only from here; all logic is unit-tested independent of the page
- [x] Species picker list (`NPC_CREATOR_SPECIES`) for current supported game species: human / undead / vulperia / slime / elf / celestial / draconic
- [x] Role picker list (`NPC_CREATOR_ROLES`) matches current `NpcRole` source contract: merchant / elder / quest_giver / scholar / guard / innkeeper / mysterious
- [x] Appearance setters (`setBodyPreset`, `setColor`, `setHat`, `setTool`, `setBadge`, `setPersonality`, `setName`) layer on top of the existing `NpcDNA` contract; `setSpecies`/`setRole` rebuild role/species-driven defaults while preserving name/personality
- [x] `rerollDialogue` — re-seeds `dialogue_seed` only, keeping appearance fixed (dialogue variety without a new look)
- [x] Save UI target wired to the existing NPC gallery/share-code persistence (`saveToGallery`/`loadFromShareCode`, reusing `gallery.ts`'s `addToNpcGallery`/`npcDnaToShareCode`/`shareCodeToNpcDna`)
- [x] Standalone `npc-creator.html` DOM page shipped (`src/npc-creator/main.ts`) — species/role/personality/body-preset chip pickers, 5-slot color pickers, live Three.js preview via `buildNpc(dna)` (OrbitControls + rebuild-on-change with stale-rebuild guarding), gallery list with delete, registered as a Vite build entry (`npcCreator` in `vite.config.ts`), confirmed clean `tsc --noEmit` + `vite build`
- [ ] Broader Asset Library integration (saving straight to `AssetLibrary` type=`npc` instead of/alongside the NPC gallery) — deferred

### Building Designer (`building-creator.html`) 🚧
- [x] Pure state-management layer shipped (`src/world/buildings/buildingCreatorState.ts`), mirroring `npc-creator/creatorState.ts`'s architecture — zero DOM/Three.js deps, fully unit-tested
- [x] Archetype selector (`BUILDING_CREATOR_KINDS`) — all 19 `BuildingKind`s from `BuildingDNA.ts` (house/terraced/cottage/villa/shop/inn/tavern/apothecary/market_stall/guild/chapel/tower/watchtower/blacksmith/barn/well/gate/tent/ruin)
- [x] Faction style selector (`BUILDING_CREATOR_FACTIONS`) — all 13 factions from `FACTION_PRESETS` (human_rural/human_town/human_noble/elven/dwarven/vampire/undead_common/draconic/celestial/vulperia/slime/fae/orcish); `setFaction` rebuilds style/colors/condition while preserving kind/size/seed
- [x] Size selector (`BUILDING_CREATOR_SIZES`: tiny/small/medium/large) via `setSize`
- [x] Additional controls beyond the minimum slice: `setFloors`, `setTerrace`, `setRotation`, `toggleFeature` (bay_window/jetty/battlements/buttress/awning/balcony), `setColor` (per-slot wall/roof/trim/door), `setName`
- [x] `toLibraryPayload` — maps state → `AssetLibrary` type=`building` shaped payload (name/seed/tags/data), ready for `assetLibrary.add()`
- [x] Standalone `building-creator.html` DOM page shipped (`src/world/buildings/main.ts`) — archetype/faction/size/floors chip pickers, feature toggles, rotation slider, 4-slot color pickers, live Three.js preview via the existing synchronous `buildBuilding(dna)` pipeline (OrbitControls), Save wired directly to `AssetLibrary` type=`building` (via `toLibraryPayload`), gallery list with delete, registered as a Vite build entry (`buildingCreator` in `vite.config.ts`), confirmed clean `tsc --noEmit` + `vite build`
- [ ] Floor plan 2D canvas preview — deferred

### Enemy Designer (`enemy-creator.html`) ✅
- [x] `EnemyDNA`/`buildEnemy(dna)`/`getDefaultEnemyDna` groundwork already existed (`src/enemy-creator/`, PROC-B2) — discovered during this pass, previously untracked in this doc
- [x] Pure state-management layer shipped (`src/enemy-creator/creatorState.ts`), mirroring the NPC/Building creator state pattern — zero DOM/Three.js deps, fully unit-tested
- [x] Species picker (`ENEMY_CREATOR_SPECIES`, same 7 species as NPC Designer), combat role picker (`ENEMY_CREATOR_ROLES`: melee/ranged/caster/support/tank/swarm), tier picker (`ENEMY_CREATOR_TIERS`: 1–4, 4=boss), movement/"weapon-feel" picker (`ENEMY_CREATOR_MOVEMENTS`: patrol/charge/circle/ambush/swarm)
- [x] `setSpecies`/`setCombatRole`/`setTier` each rebuild the appropriate default sub-tree (stats/movement/palette) from `getDefaultEnemyDna` while preserving the other axes + name; `setIsBoss`, `setColor`, `setAttackRange`, `setAggroRange`, `setBaseHp`, `setBaseDmg` for direct stat tuning
- [x] `toLibraryPayload` — maps state → library-ready payload (name/seed/tags incl. `role:`/`tier:`/`species:`/`boss`, data)
- [x] `AssetLibrary.AssetType` extended to accept `'enemy'` (`src/overworld-studio/AssetLibrary.ts`); Overworld Studio Library panel type-pills + placeholder icon updated to match (`overworld-studio.html`, `src/overworld-studio.ts`)
- [x] Standalone `enemy-creator.html` DOM page shipped (`src/enemy-creator/main.ts`) — species/role/tier/movement chip pickers, boss toggle, HP/damage/attack-range/aggro-range sliders, 3-slot color pickers, live Three.js preview via the existing async `buildEnemy(dna)` pipeline (OrbitControls + rebuild-on-change with stale-rebuild guarding, mirroring `npc-creator/main.ts`'s token pattern since `buildEnemy` is async), Save wired directly to `AssetLibrary` type=`enemy` (via `toLibraryPayload`), gallery list with delete, registered as a Vite build entry (`enemyCreator` in `vite.config.ts`), confirmed clean `tsc --noEmit` + `vite build`

### Prop Designer 🔲
- Category: furniture/decoration/container/interactive
- Material/colour
- Scale
- Interaction type (none/lootable/readable/usable)
- Save → AssetLibrary

## Dependencies
- Requires: PROC-A entity registry ✅
- Requires: individual `build*()` functions per type
- Feeds: Asset Library (`asset-library.md`)
