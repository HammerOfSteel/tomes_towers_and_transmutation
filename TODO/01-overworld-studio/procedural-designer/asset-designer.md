# Procedural Asset Designer
> Visual designer UI for DNA-based entity creation (NPC, Building, Enemy, Prop).
> Same concept as `princess-creator.html` — but for all entity types.
> References PROC-B for implementation details.

## Status: 🚧 Referenced in PROC-B; NPC creator groundwork exists, but standalone designer surfaces are still missing

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
- [ ] Standalone `building-creator.html` DOM page + live Three.js preview via the existing synchronous `buildBuilding(dna)` pipeline (`src/world/buildings/BuildingBuilder.ts`) — still needs to be built (same pattern as `npc-creator.html`)
- [ ] Floor plan 2D canvas preview — deferred

### Enemy Designer (inside `creature-lab.html`) 🔲
- Extend existing creature-lab with enemy-specific controls
- Species, combat role, tier, weapon type
- Behaviour profile: patrol/aggressive/ranged/boss
- Visual: colours, armour, size
- Save → AssetLibrary

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
