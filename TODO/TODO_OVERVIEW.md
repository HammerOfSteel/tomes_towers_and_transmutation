# TT&T — TODO Overview

> Master index. All detailed tasks live in subfolders. Work top-to-bottom — each section depends on the ones before it.
> **Legend:** ✅ Done · 🔲 To Do · 🚧 In Progress · ⚠️ GAP (not yet tracked)

---

## Recommended Work Order

```
01 Overworld Studio        → design tools that generate world data
02 Game World Integration  → use that data to build the 3D playable world  ← DEPENDS ON 01
03 Procedural Pipeline     → builders & creator ecosystem  ← FEEDS 02 + UI tools
04 Characters              → species, enemies, NPCs  ← DEPENDS ON 03
05 Content                 → quests, story, lore  ← DEPENDS ON 04
06 Game Systems            → abilities, talents, tomes, alchemy, companions, defense, audio, saves  ← DEPENDS ON 04+05
07 Testing                 → lock down everything above
08 Polish & Release        → performance, UX, fundraising  ← LAST
```

> ⚠️ **Correction (2026-08 audit, see G15):** "05 depends on 04, 06 depends
> on 04+05" is not literally true — 05's quest/story content already
> references reward and event types (follower recruits, transmutation
> items, defense escalation) that only 06's systems can deliver, and those
> 06 systems are currently zero-code, design-only. In practice: **finalize
> data models/schemas for 06's systems (TRS, ATC, FCS, TDE, Save) before
> locking down 05's content**, so quest/story authoring doesn't reference
> reward types that don't exist yet. Full 06 implementation can still trail
> 05 — only the schemas need to come first.

---

## Section Index

### [01 — Overworld Studio](./01-overworld-studio/README.md)

Design tools (Overworld Studio web app) that produce world data consumed by the game.

| File                                                                                     | Topic                                                                     | Status |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| [OW-D Dwelling Layer](./01-overworld-studio/OW-D-dwelling-layer.md)                      | Floor plan renderer for houses                                            | ✅     |
| [OW-E Layer Navigation](./01-overworld-studio/OW-E-layer-navigation.md)                  | Click-through realm→city→dungeon                                          | ✅     |
| [OW-F4 Drill-Down Chain](./01-overworld-studio/OW-F4-drill-down-chain.md)                | Solar→Planet→Realm→City full chain                                        | ✅     |
| [Asset Library](./01-overworld-studio/asset-library.md)                                  | Browse & manage all generated assets                                      | 🚧     |
| [Game Inventory](./01-overworld-studio/game-inventory.md)                                | Master contract for procedural asset outputs needed from Overworld Studio | 🚧     |
| [Procedural Asset Designer](./01-overworld-studio/procedural-designer/asset-designer.md) | Visual designer for DNA-based entities                                    | ✅     |
| [Procedural Tile Designer](./01-overworld-studio/procedural-designer/tile-designer.md)   | Tile variant tool for biome/dungeon tiles                                 | ✅     |

**Shipped (OW-A thru OW-F4):** Realm Map, Dungeon tab, Cave tab, 3D Planet, Hex Planet, Planet DNA, Solar System, Dwelling Layer (building-viewer), Layer Navigation (breadcrumbs + drill-downs), Full Solar→Planet→Realm→City chain ✅

---

### [02 — Game World Integration](./02-game-world-integration/README.md)

Turn Overworld Studio output into the actual 3D playable world. **Depends on 01.**

| File                                                                            | Topic                                     | Status |
| ------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| [Realm Integration](./02-game-world-integration/realm-integration.md)           | Generate 3D terrain from realm map biomes | 🚧     |
| [Settlement Integration](./02-game-world-integration/settlement-integration.md) | Place generated settlements in 3D world (live pipeline already builds/roads/NPCs; boundary toast added, LOD still open; building placement is now footprint-aware and interiors route through `sceneManager.loadDungeon()` with real multi-floor staircases) | 🚧     |
| [Dungeon Integration](./02-game-world-integration/dungeon-integration.md)       | Dungeon entrances/exits on realm map (live enter/exit works; exit-position bug fixed; site-family metadata now live + shown in toast; quest/reward consumption still open) | 🚧     |
| [Cave Integration](./02-game-world-integration/cave-glade-integration.md)       | Cave & glade entrances on realm map — live wiring + minimap + persistence done, floor transition deferred | 🚧 In Progress |

> 🚧 **Realm Integration's core data-transform slices (RI-1 through RI-4) have shipped** — `src/world/RealmToTerrain.ts` maps realm cells to `TileDNA` placements with height smoothing and biome-transition flags, `src/world/RealmRiverMesh.ts` builds width-varying river ribbons, and `src/world/ChunkManager.ts` provides generic chunk load/unload streaming logic. All pure and unit-tested (34 new tests); wiring these into an actual `OverworldScene.ts` terrain renderer, plus settlement/dungeon/cave integration, are still open.

---

### [03 — Procedural Pipeline](./03-procedural-pipeline/README.md)

Every builder (NPC, Enemy, Building, Prop) serves two consumers: game runtime + designer UI.

| File                                                                           | Topic                                           | Status |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | ------ |
| [PROC-A Entity Registry](./03-procedural-pipeline/PROC-A-entity-registry.md)   | Central registry + base DNA types               | ✅     |
| [PROC-B Creator Tools](./03-procedural-pipeline/PROC-B-creator-tools.md)       | NPC/Enemy/Building/Prop atelier tools           | 🚧     |
| [PROC-C World Generation](./03-procedural-pipeline/PROC-C-world-generation.md) | Seeded placement plan for all entities          | 🔲     |
| [PROC-D Creative Mode](./03-procedural-pipeline/PROC-D-creative-mode.md)       | DevLab integration + custom blueprint overrides | 🔲     |
| [PROC-E Asset Retirement](./03-procedural-pipeline/PROC-E-asset-retirement.md) | Remove all GLB/external asset load paths        | 🔲     |
| [Environment Art System](./03-procedural-pipeline/environment-art-system.md)   | Phase 5: code-first vs Kenney toggle            | 🔲     |

---

### [04 — Characters](./04-characters/README.md)

Species, princess creator, enemies, NPCs. **Depends on 03 (builders).**

| File                                                              | Topic                                               | Status |
| ----------------------------------------------------------------- | --------------------------------------------------- | ------ |
| [Princess Creator](./04-characters/princess-creator.md)           | PC phases: defaults, library, game integration      | 🚧     |
| [New Species Expansion](./04-characters/new-species-expansion.md) | NS phases: Elf, Celestial, Draconic + all 21 mapped | 🚧     |
| [Enemy System](./04-characters/enemy-system.md)                   | B phases: roster, AI, encounter design              | 🚧     |

---

### [05 — Content](./05-content/README.md)

Quests, story arcs, lore. **Depends on 04 (characters must exist first).**

| File                                                   | Topic                                              | Status |
| ------------------------------------------------------ | -------------------------------------------------- | ------ |
| [Quests](./05-content/quests.md)                       | Phase C: 5×4 species quests + 5 general            | 🔲     |
| [Story Arcs](./05-content/story-arcs.md)               | Phase E1: Act I arcs all 4 species                 | 🚧     |
| [Solmor Encounters](./05-content/solmor-encounters.md) | Phase E2 + NS5: 3-stage dialogue for all 7 species | 🚧     |
| [Lore Books](./05-content/lore-books.md)               | All placed lore books across floors + overworld    | 🚧     |

---

### [06 — Game Systems](./06-game-systems/README.md)

Abilities, talents, tomes/research, alchemy/transmutation, companions, tower defense, audio, saves. **Depends on 04 + 05** for full gameplay integration.

| File                                                                                     | Topic                                                                            | Status |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| [Abilities & Talents](./06-game-systems/abilities-talents.md)                            | Phase D: full ability sets + talent trees                                        | 🚧     |
| [Tomes, Research & Spellcraft](./06-game-systems/tomes-research-spellcraft.md)           | Book taxonomy, personal library, school mastery, research bridge, spell mutation | ⚠️ GAP |
| [Alchemy, Transmutation & Crafting](./06-game-systems/alchemy-transmutation-crafting.md) | Reagents, refinement tiers, formulas, facility-gated crafting, instability       | ⚠️ GAP |
| [Follower & Companion System](./06-game-systems/follower-companion-system.md)            | Familiars, followers, recruited monsters, field/tower roles, recovery            | ⚠️ GAP |
| [Tower Defense & Domain Events](./06-game-systems/tower-defense-domain-events.md)        | Forecast, preparation, assault, consequences, doctrine, floor stakes             | ⚠️ GAP |
| [Audio System](./06-game-systems/audio.md)                                               | Full SFX + music pipeline                                                        | ⚠️ GAP |
| [Save System](./06-game-systems/save-system.md)                                          | Slots, cloud, versioned saves                                                    | ⚠️ GAP |

---

### [07 — Testing](./07-testing/README.md)

Lock everything in with tests. **Start after each section above is feature-complete.**

| File                                             | Topic                                  | Status |
| ------------------------------------------------ | -------------------------------------- | ------ |
| [Unit Tests](./07-testing/unit-tests.md)         | Phase F1: vitest coverage targets      | 🚧     |
| [E2E Playwright](./07-testing/e2e-playwright.md) | Phase F3: full flow automation         | 🚧     |
| [Performance](./07-testing/performance.md)       | Phase G1 + F4: 60fps targets, budgets  | 🔲     |
| [Bot Testing](./07-testing/bot-testing.md)       | GameBot B1-B6 done, NS8 + CI remaining | ✅/🔲  |

---

### [08 — Polish & Release](./08-polish-release/README.md)

Last pass. **Nothing here starts until 07 is green.**

| File                                                  | Topic                                       | Status |
| ----------------------------------------------------- | ------------------------------------------- | ------ |
| [UI/UX](./08-polish-release/ui-ux.md)                 | Phase G2: HUD, menus, feedback              | 🚧     |
| [Game Feel](./08-polish-release/game-feel.md)         | Phase G3: screen shake, hit stop, polish    | 🚧     |
| [Accessibility](./08-polish-release/accessibility.md) | Phase G4: gamepad, colour-blind, text scale | 🚧     |
| [Documentation](./08-polish-release/documentation.md) | Phase H1: update all .md docs               | 🔲     |
| [Fundraising](./08-polish-release/fundraising.md)     | Phase H2: campaign + itch.io/Steam          | 🔲     |
| [Milestones](./08-polish-release/milestones.md)       | M1–M5 delivery gates                        | 🔲     |

---

## ⚠️ Identified Gaps (missing from any existing TODO)

| #   | Gap                                                                                                                                                                 | Impact        | Where to fix                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| G1  | **Game World Integration** — realm terrain/river/chunking (RI-1 to RI-4), settlement spawning/roads/population/boundary/LOD (SI-1 to SI-6), dungeon entrance prop + site metadata (DI-1, DI-2, DI-2b), and cave/glade entrance props + realm placement (CG-1, CG-2, CG-3) data-transform/mesh/geometry slices all shipped as pure/tested modules; cave/glade entrances are now also fully wired into the live `OverworldScene.ts` (props render, discovery prompt + `[E]` toast, minimap icons, save persistence), the live settlement pipeline (already independently building/roads/NPCs) gained SI-4 boundary-crossing toasts, and the live dungeon pipeline (already working) had its exit-position bug fixed (DI-3) and site-family/reward-bias metadata wired live onto `DungeonEntry` + surfaced in the discovery toast (DI-2b) — **⚠️ audit (2026-08) found Studio and live game run separate, unrelated generators for realm/terrain and settlements (see [STUDIO-LIVE-PARITY.md](./02-game-world-integration/STUDIO-LIVE-PARITY.md)); quest/loot/elite-recruit consumption of that metadata (DI-4b), cave/glade floor scene transition (CG-4), and settlement LOD (SI-5) are now blocked-by-design pending the parity work's P0/P1/P3, not just "still needed"** | Blocking demo | `02-game-world-integration/`                               |
| G2  | **Asset Library UI** — partial; save/preview/export/import/rename/duplicate/delete exist for Studio asset types, but full creator/runtime coverage is still missing | Medium        | `01-overworld-studio/asset-library.md`                     |
| G3  | **Game Inventory** — stabilize the master contract of procedural asset outputs so phase-01 tools have a clear source of truth                                       | Medium        | `01-overworld-studio/game-inventory.md`                    |
| G5  | **Audio System** — referenced everywhere but has no phased plan                                                                                                     | High          | `06-game-systems/audio.md`                                 |
| G6  | **Save System** — basic save exists, no slots/versioning/cloud plan                                                                                                 | Medium        | `06-game-systems/save-system.md`                           |

| G8  | **Day/Night integration** — DayNightSystem exists but NPC schedules, weather, world events not planned                                                              | Low           | `06-game-systems/`                                         |
| G9  | **Performance budgets** — G1 says "60fps" but no per-system budget (triangles, draw calls, memory)                                                                  | Medium        | `07-testing/performance.md`                                |
| G10 | **Creature Creator expansion** — CC-1 to CC-6 phases (sub-races, clothing, body morphing)                                                                           | Medium        | `04-characters/creature-creator.md`                        |
| G11 | **Tomes / Research / Spellcraft** — book progression, library state, research bridge, spell mutation lacked a dedicated plan                                        | High          | `06-game-systems/tomes-research-spellcraft.md`             |
| G12 | **Alchemy / Transmutation / Crafting** — core material-conversion pillar lacked a phased production plan                                                            | High          | `06-game-systems/alchemy-transmutation-crafting.md`        |
| G13 | **Follower & Companion System** — quest rewards and recruits lacked a dedicated runtime/roster/assignment plan                                                      | High          | `06-game-systems/follower-companion-system.md`             |
| G14 | **Tower Defense / Domain Events** — companion-centered defense and tower pressure loop lacked a dedicated plan                                                      | High          | `06-game-systems/tower-defense-domain-events.md`           |
| G15 | **05 ↔ 06 circular dependency + false-done claims** — quests.md/story-arcs.md reference follower/alchemy/defense reward & event types that TRS/ATC/FCS/TDE (all zero-code, design-only) would need to deliver; also two claimed-done items don't exist in code: `customPrincess` toggle (princess-creator.md) and `survive_wave` beat type (story-arcs.md — silently auto-completes via a placeholder, `WaveManager` doesn't exist) | High          | `05-content/`, `06-game-systems/`                          |
| G16 | **Organic World Tiles** — terrain/shorelines, building corners, and settlement plot layout are all still fundamentally square-grid-typed (per-cell/per-tile, neighbour-smoothing bolted on after the fact — the just-shipped shoreline noise-wobble is the latest example). Research into Townscaper's dual-grid marching-squares + jittered-triangle relaxed-mesh technique is complete; a phased roadmap (Phase 0 shared case-table infra ✅ shipped, Phase 1 real dual-grid shorelines ✅ shipped, Phase 2 building corners ✅ chamfer classification shipped (kit-of-parts mesh-swap deferred, needs user check-in) **+ 2026-09-02 follow-up: BlockKit chamfer generalized to a true rounded arc, and rounded corner posts added to the human/generic default builder (previously zero corner treatment) — see `organic_world_tiles_todo.md`'s Phase 2 follow-up note**, Phase 3 organic settlement plots ✅ relaxed-mesh utility shipped (no live settlement integration yet, needs open questions resolved with the user) **+ 2026-09-02 investigation: found the settlement generator already uses independent organic techniques (jittered-Voronoi wards, an existing `fillWardOrganically()` layout, Chaikin-smoothed roads) — deferred again, now because it's no longer clearly missing rather than too risky, see roadmap doc's Phase 3 follow-up note**, Phase 4 dungeons ✅ wall-corner pilaster fix shipped (narrow scope; procedural dungeon generation deliberately not attempted), Phase 5 props ✅ lattice-deform utility shipped (no live prop integration yet)) is written; **all 6 phases (0-5) have shipped at least their core scope** — see `organic_world_tiles_todo.md`'s own status line for what's deferred and why. **+ 2026-09-02: Phase 6 added** — procedural race-by-race building construction, POC'd on an elven stone-tower kit (octagon ring-stack, real per-course block geometry measured against a cheap textured alternative, hybrid stone+living-tree decoration), wired into elven's watchtower/tower kinds. Found via live verification that watchtower/tower aren't currently reachable through the live settlement generator at all (no `WARD_TO_KIND` entry for either) — verified instead via the `showroom.html` dev tool. **+ 2026-09-02 follow-up: added a Settlement Lab "kind override" dev tool** (`SettlementLabPanel.ts`/`SettlementLabScene.ts`/`BuildingTypeMap.createSettlementBuildingDna`'s new optional `buildingKind` param/`SettlementRenderer`'s `forceBuildingKind`) so a settlement's buildings can all be forced to one chosen kind (e.g. faction `elven` + kind override `watchtower`) via Overworld Studio's Settlement tab → "Play in 3D" — this is what the user asked for to visually isolate/test the tower, and is meant to be reused for every future race/building-kind in this rollout; it does NOT make watchtower naturally spawn in a normal (non-overridden) settlement, that reachability gap is still open. **+ 2026-09-02 follow-up (2 rounds)**: (a) fixed a real bug where the Settlement Lab panel had zero CSS and rendered invisible below the fullscreen canvas (now `position:fixed`, verified visible/on-top live); replaced the "kind override" dropdown with an automatic per-faction map (`POC_KIND_OVERRIDE_BY_FACTION` in `SettlementLabScene.ts`) so picking faction=elven alone shows only watchtowers, no extra UI. (b) User feedback after seeing it live — "the only variation is the top and the height" — triggered a dedicated research pass (Townscaper technique, Godot addons, Three.js libraries) that found this repo's own `RelaxedMeshGrid.ts` (the exact Townscaper jitter+relax technique) was built but never wired to buildings; shipped 4 additive shape-variety techniques (per-vertex/per-floor coherent jitter, footprint drift/rotation, 4 named silhouette profiles tapering/tiered/leaning/waisted, all feeding existing mesh code) via new `StoneTowerSilhouette.ts` — live-verified via Playwright screenshots showing genuinely different tower silhouettes side-by-side (leaning/tapering/waisted), not a uniformly-scaled repeat; see `organic_world_tiles_todo.md`'s Phase 6 (6.4b/6.4c) for full detail and what's still needed to make it reachable in real, non-overridden play | Medium — art direction, not blocking | `organic_world_tiles_todo.md` (TODO root, cross-cuts 02 + 03) |

---

## Quick Reference: File → Phase Mapping

| Legacy Phase                            | New Location                                           |
| --------------------------------------- | ------------------------------------------------------ |
| OW-A/B/C/F1-F3                          | **DONE** ✅                                            |
| OW-D, OW-E, OW-F4                       | `01-overworld-studio/`                                 |
| PROC-A thru PROC-E                      | `03-procedural-pipeline/`                              |
| PC (Princess Creator)                   | `04-characters/princess-creator.md`                    |
| B (Enemy)                               | `04-characters/enemy-system.md`                        |
| C (Quests)                              | `05-content/quests.md`                                 |
| D (Abilities)                           | `06-game-systems/abilities-talents.md`                 |
| D+ (Tomes / Research / Spellcraft)      | `06-game-systems/tomes-research-spellcraft.md`         |
| D+ (Alchemy / Transmutation / Crafting) | `06-game-systems/alchemy-transmutation-crafting.md`    |
| D+ (Followers / Companions)             | `06-game-systems/follower-companion-system.md`         |
| D+ (Tower Defense / Domain Events)      | `06-game-systems/tower-defense-domain-events.md`       |
| E (Story + Solmor)                      | `05-content/story-arcs.md` + `solmor-encounters.md`    |
| NS (New Species)                        | `04-characters/new-species-expansion.md`               |
| F (Testing)                             | `07-testing/`                                          |
| G (Polish)                              | `08-polish-release/`                                   |
| H (Docs + Fundraising)                  | `08-polish-release/`                                   |
| Phase 5 (Environment Art)               | `03-procedural-pipeline/environment-art-system.md`     |
| Creative Mode (C1-C10)                  | `03-procedural-pipeline/PROC-D-creative-mode.md`       |
| Bot Testing (B1-B6)                     | `07-testing/bot-testing.md`                            |
| Level Editor (L0-L6)                    | **DONE** ✅ — see `archive/ASSET_LEVEL_EDITOR_TODO.md` |
| Creature Creator (CC-1 to CC-6)         | `04-characters/creature-creator.md`                    |
| Docs organization                       | `docs/overview.md` (master docs index)                 |
| Organic World Tiles (dual-grid/Townscaper) | `organic_world_tiles_todo.md` (cross-cuts 02 + 03)   |

---

## Source Files

- `TODO.md` (root) — master source of truth, guiding principles, art system decisions
- `TODO/archive/` — superseded files kept for reference only
