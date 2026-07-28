# Dungeon Integration
> 🚧 In Progress — Place dungeon entrances on the realm overworld map and wire up loading.

## Status: 🚧 In Progress — DI-1 (entrance prop builder) and DI-2/DI-2b (site
metadata) shipped as pure/tested modules (`src/world/DungeonEntranceBuilder.ts`,
`src/world/DungeonSiteMetadata.ts`) against the Studio's `RealmData` shape.

**Discovered this session (same pattern as cave/glade/settlement audits):**
`OverworldScene.ts`/`main.ts` already have their own **separate, working**
live dungeon pipeline against `WorldData`'s `DungeonEntry` — entrance props
render, `[E]` loads a seeded `generateDungeon()` floor via `sceneManager`,
and exiting already returns the player to the overworld. DI-1/DI-2/DI-2b's
pure modules (site-family/reward-bias metadata, procedural entrance-prop
variants) are **not** wired into this live `DungeonEntry`/dungeon-generation
path — `DungeonEntry` has no `siteFamily`/`rewardBias` fields at all, and the
live dungeon entrance prop is a plain existing GLB (`tower-square-mid-door`),
not `DungeonEntranceBuilder.ts`'s procedural variants. That remains a real,
open gap (see DI-4b below) — distinct from DI-3, which turned out to already
mostly work.

**DI-3 fix this session:** the live exit path (`switchToExterior()` in
`main.ts`) always teleported the player to a **fixed position outside the
tower**, regardless of which entrance they used — so leaving a random world
dungeon dropped the player back at the tower instead of at the dungeon they
just left. Fixed: the world position of the dungeon entrance used to enter
is now captured (`_activeDungeonEntrancePos`) and consumed on exit; tower
entry (`switchToInterior()`) resets it so tower exits are unaffected.


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

### DI-3 — Scene Transition ✅ (live pipeline, no `SceneRouter`/`DungeonScene` needed)
- [x] Enter → `[E]` at a live `DungeonEntry` calls `generateDungeon(seed, floorCount)`
      and `sceneManager.loadDungeon(...)` (no black fade — same instant-cut
      pattern the tower/building entrances already use; a fade transition was
      never actually part of any of these paths, live or otherwise)
- [x] Exit → returns to the overworld **at the entrance position used to
      enter** (fixed this session — previously always teleported to a fixed
      spot outside the tower, losing the actual dungeon entrance location;
      see `_activeDungeonEntrancePos` in `main.ts`)
- [x] `SceneManager` (existing, not a new `SceneRouter`) already handles the
      dungeon ↔ overworld transition — `unloadCurrentRoom()` /
      `loadDungeon()` / `onExitTrigger`
- [x] Player position preserved (see exit fix above); inventory/progression
      state was never scene-scoped to begin with (lives on `party`/
      `progression` objects untouched by scene swaps), so nothing to fix there

### DI-4 — Dungeon Map Marker ✅ (icon + persistence); site-family differentiation not started
- [x] Dungeon entrance shows on `OWMinimap.ts` as a red dot + rim (pre-existing,
      confirmed still working — not literally the spec's ⚔ glyph, but the
      same established dot-marker visual language as settlements/caves/glades)
- [x] Discovered dungeons persist to save data — `DiscoveryTracker`'s
      `discoveredDungeons` set + `localStorage` (pre-existing, confirmed
      still working)
- [ ] Marker differentiation by site family or intel value — blocked on
      DI-4b below (no site-family data exists on the live `DungeonEntry` yet)

### DI-4b — Quest / Candidate / Defense Hooks ⚠️ Not started (real gap)
- [ ] Support quest-tagged dungeon entrances (species arc, general quest, or faction quest destinations)
- [ ] Support candidate-archive-tagged sites for prior-candidate content
- [ ] Support defense-intel-producing sites whose completion improves tower forecasts or counters
- [ ] Support elite recruit opportunity tags so companion-focused players can route expeditions intentionally
- Genuinely open: `DungeonSiteMetadata.ts`'s `enrichDungeonMarker()` (DI-2b)
  has never been called against the live `DungeonEntry` — it operates on the
  Studio's bare `{x,y}` marker shape. Wiring this in would mean extending
  `DungeonEntry`/`WorldGenerator.ts`'s dungeon-placement pass to also derive
  and store a `DungeonSite` per entry, then threading `siteFamily`/
  `rewardBias`/quest tags through to the quest log and reward-generation
  code — a larger, cross-cutting change (touches quest/reward systems, not
  just world-gen/rendering) deliberately left as a separate task.

### DI-5 — Tests ⚠️ Partially covered; no dedicated live-integration test file
- [x] Entrance triggers scene transition without error — exercised manually
      via the existing dungeon-entry code path (pre-existing, unchanged
      besides the entrance-position capture)
- [x] Return from dungeon places player at entrance position — fixed and
      manually verified this session (see DI-3)
- [ ] Site-family and reward-bias metadata persist through scene transition —
      blocked on DI-4b (no such metadata exists on live entries yet)
- [ ] Quest-tagged and candidate-tagged sites serialize/deserialize correctly —
      blocked on DI-4b for the same reason
- No dedicated test file added: `switchToExterior()`/`switchToInterior()` are
  large, DOM/THREE/game-loop-coupled functions in `main.ts` with no existing
  unit-test harness (consistent with the rest of `main.ts`, which has zero
  test coverage today) — the fix was verified via tsc/build/vitest baseline
  plus manual code review of both call sites that set/consume
  `_activeDungeonEntrancePos`.

## Dependencies
- Requires: OW-B dungeon generator ✅ (blueprint produced)
- Requires: RI-1 terrain mesh (entrance placed on terrain)
- Requires: `SceneRouter` or extension of `SceneManager`
