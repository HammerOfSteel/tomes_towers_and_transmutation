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
06 Game Systems            → abilities, talents, audio, saves  ← DEPENDS ON 04+05
07 Testing                 → lock down everything above
08 Polish & Release        → performance, UX, fundraising  ← LAST
```

---

## Section Index

### [01 — Overworld Studio](./01-overworld-studio/README.md)
Design tools (Overworld Studio web app) that produce world data consumed by the game.

| File | Topic | Status |
|---|---|---|
| [OW-D Dwelling Layer](./01-overworld-studio/OW-D-dwelling-layer.md) | Floor plan renderer for houses | 🔲 |
| [OW-E Layer Navigation](./01-overworld-studio/OW-E-layer-navigation.md) | Click-through realm→city→dungeon | 🔲 |
| [OW-F4 Drill-Down Chain](./01-overworld-studio/OW-F4-drill-down-chain.md) | Solar→Planet→Realm→City full chain | 🔲 |
| [Asset Library](./01-overworld-studio/asset-library.md) | Browse & manage all generated assets | ⚠️ GAP |
| [Game Inventory](./01-overworld-studio/game-inventory.md) | Inventory of all procedural asset types needed | ⚠️ GAP |
| [Procedural Asset Designer](./01-overworld-studio/procedural-designer/asset-designer.md) | Visual designer for DNA-based entities | 🔲 |
| [Procedural Tile Designer](./01-overworld-studio/procedural-designer/tile-designer.md) | Tile variant tool for biome/dungeon tiles | ⚠️ GAP |

**Shipped (OW-A thru OW-F3):** Realm Map, Dungeon tab, Cave tab, 3D Planet, Hex Planet, Planet DNA, Solar System ✅

---

### [02 — Game World Integration](./02-game-world-integration/README.md)
Turn Overworld Studio output into the actual 3D playable world. **Depends on 01.**

| File | Topic | Status |
|---|---|---|
| [Realm Integration](./02-game-world-integration/realm-integration.md) | Generate 3D terrain from realm map biomes | ⚠️ GAP |
| [Settlement Integration](./02-game-world-integration/settlement-integration.md) | Place generated settlements in 3D world | ⚠️ GAP |
| [Dungeon Integration](./02-game-world-integration/dungeon-integration.md) | Dungeon entrances/exits on realm map | ⚠️ GAP |
| [Cave Integration](./02-game-world-integration/cave-glade-integration.md) | Cave & glade entrances on realm map | ⚠️ GAP |

> ⚠️ **This entire section is a planning gap.** The studio generates beautiful maps but there is no task list for wiring that output into the 3D overworld.

---

### [03 — Procedural Pipeline](./03-procedural-pipeline/README.md)
Every builder (NPC, Enemy, Building, Prop) serves two consumers: game runtime + designer UI.

| File | Topic | Status |
|---|---|---|
| [PROC-A Entity Registry](./03-procedural-pipeline/PROC-A-entity-registry.md) | Central registry + base DNA types | ✅ |
| [PROC-B Creator Tools](./03-procedural-pipeline/PROC-B-creator-tools.md) | NPC/Enemy/Building/Prop atelier tools | 🚧 |
| [PROC-C World Generation](./03-procedural-pipeline/PROC-C-world-generation.md) | Seeded placement plan for all entities | 🔲 |
| [PROC-D Creative Mode](./03-procedural-pipeline/PROC-D-creative-mode.md) | DevLab integration + custom blueprint overrides | 🔲 |
| [PROC-E Asset Retirement](./03-procedural-pipeline/PROC-E-asset-retirement.md) | Remove all GLB/external asset load paths | 🔲 |
| [Environment Art System](./03-procedural-pipeline/environment-art-system.md) | Phase 5: code-first vs Kenney toggle | 🔲 |

---

### [04 — Characters](./04-characters/README.md)
Species, princess creator, enemies, NPCs. **Depends on 03 (builders).**

| File | Topic | Status |
|---|---|---|
| [Princess Creator](./04-characters/princess-creator.md) | PC phases: defaults, library, game integration | 🚧 |
| [New Species Expansion](./04-characters/new-species-expansion.md) | NS phases: Elf, Celestial, Draconic + all 21 mapped | 🚧 |
| [Enemy System](./04-characters/enemy-system.md) | B phases: roster, AI, encounter design | 🚧 |

---

### [05 — Content](./05-content/README.md)
Quests, story arcs, lore. **Depends on 04 (characters must exist first).**

| File | Topic | Status |
|---|---|---|
| [Quests](./05-content/quests.md) | Phase C: 5×4 species quests + 5 general | 🔲 |
| [Story Arcs](./05-content/story-arcs.md) | Phase E1: Act I arcs all 4 species | 🚧 |
| [Solmor Encounters](./05-content/solmor-encounters.md) | Phase E2 + NS5: 3-stage dialogue for all 7 species | 🚧 |
| [Lore Books](./05-content/lore-books.md) | All placed lore books across floors + overworld | 🚧 |

---

### [06 — Game Systems](./06-game-systems/README.md)
Abilities, talents, audio, saves. **Depends on 04 (characters must be defined).**

| File | Topic | Status |
|---|---|---|
| [Abilities & Talents](./06-game-systems/abilities-talents.md) | Phase D: full ability sets + talent trees | 🚧 |
| [Audio System](./06-game-systems/audio.md) | Full SFX + music pipeline | ⚠️ GAP |
| [Save System](./06-game-systems/save-system.md) | Slots, cloud, versioned saves | ⚠️ GAP |

---

### [07 — Testing](./07-testing/README.md)
Lock everything in with tests. **Start after each section above is feature-complete.**

| File | Topic | Status |
|---|---|---|
| [Unit Tests](./07-testing/unit-tests.md) | Phase F1: vitest coverage targets | 🚧 |
| [E2E Playwright](./07-testing/e2e-playwright.md) | Phase F3: full flow automation | 🚧 |
| [Performance](./07-testing/performance.md) | Phase G1 + F4: 60fps targets, budgets | 🔲 |

---

### [08 — Polish & Release](./08-polish-release/README.md)
Last pass. **Nothing here starts until 07 is green.**

| File | Topic | Status |
|---|---|---|
| [UI/UX](./08-polish-release/ui-ux.md) | Phase G2: HUD, menus, feedback | 🚧 |
| [Game Feel](./08-polish-release/game-feel.md) | Phase G3: screen shake, hit stop, polish | 🚧 |
| [Accessibility](./08-polish-release/accessibility.md) | Phase G4: gamepad, colour-blind, text scale | 🚧 |
| [Documentation](./08-polish-release/documentation.md) | Phase H1: update all .md docs | 🔲 |
| [Fundraising](./08-polish-release/fundraising.md) | Phase H2: campaign + itch.io/Steam | 🔲 |
| [Milestones](./08-polish-release/milestones.md) | M1–M5 delivery gates | 🔲 |

---

## ⚠️ Identified Gaps (missing from any existing TODO)

| # | Gap | Impact | Where to fix |
|---|---|---|---|
| G1 | **Game World Integration** — no plan for how realm map → 3D playable world | Blocking demo | `02-game-world-integration/` |
| G2 | **Asset Library UI** — no browsable gallery for all generated entity types | Medium | `01-overworld-studio/asset-library.md` |
| G3 | **Game Inventory** — no master list of what procedural assets actually need to exist for a complete game world | Medium | `01-overworld-studio/game-inventory.md` |
| G4 | **Procedural Tile Designer** — tiles (floor, wall, terrain) have no dedicated design/variant tool | Medium | `01-overworld-studio/procedural-designer/tile-designer.md` |
| G5 | **Audio System** — referenced everywhere but has no phased plan | High | `06-game-systems/audio.md` |
| G6 | **Save System** — basic save exists, no slots/versioning/cloud plan | Medium | `06-game-systems/save-system.md` |
| G7 | **OW-D/E detail** — Dwelling layer and layer navigation have almost no task breakdown | Medium | `01-overworld-studio/OW-D/E` files |
| G8 | **Day/Night integration** — DayNightSystem exists but NPC schedules, weather, world events not planned | Low | `06-game-systems/` |
| G9 | **Performance budgets** — G1 says "60fps" but no per-system budget (triangles, draw calls, memory) | Medium | `07-testing/performance.md` |

---

## Quick Reference: File → Phase Mapping

| Legacy Phase | New Location |
|---|---|
| OW-A/B/C/F1-F3 | **DONE** ✅ |
| OW-D, OW-E, OW-F4 | `01-overworld-studio/` |
| PROC-A thru PROC-E | `03-procedural-pipeline/` |
| PC (Princess Creator) | `04-characters/princess-creator.md` |
| B (Enemy) | `04-characters/enemy-system.md` |
| C (Quests) | `05-content/quests.md` |
| D (Abilities) | `06-game-systems/abilities-talents.md` |
| E (Story + Solmor) | `05-content/story-arcs.md` + `solmor-encounters.md` |
| NS (New Species) | `04-characters/new-species-expansion.md` |
| F (Testing) | `07-testing/` |
| G (Polish) | `08-polish-release/` |
| H (Docs + Fundraising) | `08-polish-release/` |
| Phase 5 (Environment Art) | `03-procedural-pipeline/environment-art-system.md` |
| Creative Mode (C1-C10) | `03-procedural-pipeline/PROC-D-creative-mode.md` |
| Bot Testing (B1-B6) | `07-testing/bot-testing.md` |
| Level Editor (L0-L6) | **DONE** ✅ — see `archive/ASSET_LEVEL_EDITOR_TODO.md` |

---

## Source Files
- `TODO.md` (root) — master source of truth, guiding principles, art system decisions
- `TODO/archive/` — superseded files kept for reference only
