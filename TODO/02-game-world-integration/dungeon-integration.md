# Dungeon Integration
> 🚧 In Progress — Place dungeon entrances on the realm overworld map and wire up loading.

## Status: 🚧 In Progress — DI-1 (entrance prop builder) and DI-2/DI-2b (site metadata) shipped as pure/tested modules (`src/world/DungeonEntranceBuilder.ts`, `src/world/DungeonSiteMetadata.ts`); DI-3 (scene transition), DI-4/DI-4b (minimap + quest hooks), and DI-5 (integration tests) still pending.

## Goal
Dungeons generated in OW-B appear as entrance props at their realm map positions, carry meaningful **site-family identity**, and feed the title pillars through knowledge, materials, recruits, and defense intelligence. Walking up to the entrance and pressing E loads the dungeon.

## Tasks

### DI-1 — Dungeon Entrance Prop ✅ (procedural variants; tower_door unchanged)
- [x] `buildDungeonEntrance(faction, variant): BuiltDungeonEntrance` (`src/world/DungeonEntranceBuilder.ts`) — procedural stone arch/gate/cave-mouth prop matching faction, built from primitives (boxes/torus/icosahedron), same "no texture/GLB" style as `BuildingBuilder.ts`
- [x] Variants: `tower_door` stays the **existing** GLB asset (`/assets/castle/tower-square-mid-door.glb`, unchanged) — not rebuilt here; `dungeon_cave_mouth`, `ruin_arch`, `keep_gate` are new procedural variants this module provides
- [x] `entranceVariantForSiteFamily(siteFamily)` bridges DI-2b's 8 site families to one of these 3 variants (or `null` for `tower_floor`, meaning "use the existing tower door")
- [x] Interaction trigger zone: `isNearDungeonEntrance(pos, entrancePos, radius = DUNGEON_ENTRANCE_TRIGGER_RADIUS)` — pure 2 WU distance check, same pattern as `OverworldScene.nearTowerEntrance()`; the `[E] Enter Dungeon` HUD prompt itself is wired at the scene-integration step (with DI-3)
- [x] Unit tests: `tests/world/DungeonEntranceBuilder.test.ts` (33 tests) — every variant × every faction (27 combinations) builds a valid non-empty `THREE.Group` and disposes cleanly, site-family→variant mapping, trigger-radius boundary checks

### DI-2 — Realm Map Placement
- [x] `RealmData` dungeon markers enriched: `enrichDungeonMarker(realmSeed, {x, y})` (`src/world/DungeonSiteMetadata.ts`) derives a deterministic `DungeonSite` — seed, faction, site-family, reward-bias — from a bare marker, without modifying `overworld-studio.ts`'s existing marker-placement algorithm (spacing dungeons from settlements/each other) or its `dungeons: {x,y}[]` field shape
- [x] OW-A generator already places 2-4+ dungeon markers per realm, spaced from settlements and each other (pre-existing `generateRealmData` logic — unchanged)
- [ ] Dungeon entrance rendered at correct world position on terrain — needs DI-1's entrance prop + `OverworldScene.ts` wiring (same RI-1 terrain-height-sampling pattern as SI-1's buildings)

### DI-2b — Site-Family Identity & Reward Bias ✅
- [x] `DungeonSiteFamily` (all 8 spec values: `tower_floor`, `library_ruin`, `alchemy_vault`, `tomb_barrow`, `beast_lair`, `mine_works`, `observatory_ruin`, `surface_threat`) — seeded per-dungeon assignment via `enrichDungeonMarker`
- [x] `DungeonRewardBiasTag` (all 5 spec values) — fixed per site family via `SITE_FAMILY_PROFILES`
- [x] `schoolBias` field — provisional `ProvisionalSchool[]` (6 placeholder schools), explicitly flagged in the module header as a stand-in until `TODO/06-game-systems/tomes-research-spellcraft.md`'s TRS-1 finalizes the real school list
- [x] `likelyBookFamilies` / `likelyReagentFamilies` string-hint fields per site family, `eliteRecruitOpportunity` / `defenseIntelSource` boolean flags — all on `DungeonSite`
- [x] Deterministic and available to any consumer (runtime or content-seeding) via a pure `(realmSeed, marker) → DungeonSite` function — no coupling to scene loading
- [x] Unit tests: `tests/world/DungeonSiteMetadata.test.ts` (8 tests) — determinism per (seed, position), variation across positions/seeds, valid site-family + reward-bias shape across 50 seeds, elite-recruit-opportunity flag matches its site family, batch enrichment matches individual calls

### DI-3 — Scene Transition
- [ ] Enter → black fade → load `DungeonScene` with matching seed
- [ ] Exit → black fade → return to overworld at entrance position
- [ ] `SceneRouter.ts` (or existing `SceneManager`): handles dungeon ↔ overworld transition
- [ ] Player position and inventory preserved across transitions

### DI-4 — Dungeon Map Marker
- [ ] Dungeon entrance shows on `OWMinimap.ts` as ⚔ icon
- [ ] Discovered dungeons persist to save data
- [ ] Optional later marker differentiation by site family or intel value

### DI-4b — Quest / Candidate / Defense Hooks
- [ ] Support quest-tagged dungeon entrances (species arc, general quest, or faction quest destinations)
- [ ] Support candidate-archive-tagged sites for prior-candidate content
- [ ] Support defense-intel-producing sites whose completion improves tower forecasts or counters
- [ ] Support elite recruit opportunity tags so companion-focused players can route expeditions intentionally

### DI-5 — Tests
- [ ] Entrance triggers scene transition without error
- [ ] Return from dungeon places player at entrance position
- [ ] Site-family and reward-bias metadata persist through scene transition
- [ ] Quest-tagged and candidate-tagged sites serialize/deserialize correctly

## Dependencies
- Requires: OW-B dungeon generator ✅ (blueprint produced)
- Requires: RI-1 terrain mesh (entrance placed on terrain)
- Requires: `SceneRouter` or extension of `SceneManager`
