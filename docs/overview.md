# TT&T — Docs Overview
> Master index of all design documents, system specs, and reference materials.
> **For task tracking:** see [TODO/TODO_OVERVIEW.md](../TODO/TODO_OVERVIEW.md)
> **For codebase architecture:** see [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 🎮 Game Design

| Doc | What it covers | Status |
|---|---|---|
| [GDD.md](GDD.md) | Core concept, game loop, 4 species, progression, narrative premise | ✅ Current |
| [STORY_DESIGN.md](STORY_DESIGN.md) | Full wizard lore, Stockholm arc, Arcanist Solmor design, 4-act structure | ✅ Current |
| [CHARACTER_DESIGN.md](CHARACTER_DESIGN.md) | All 7 species × subspecies, starting boons, stat tables, species passives | ✅ Current |
| [MAGIC_SYSTEM.md](MAGIC_SYSTEM.md) | Spell catalogue (12+), 6 elements, progression, shader design | ✅ Current |
| [WORLD_DESIGN.md](WORLD_DESIGN.md) | Tower structure, overworld zones, environment lore | ✅ Current |
| [ENEMY_DESIGN.md](ENEMY_DESIGN.md) | Enemy types, AI states, faction relationships, recruitment | ✅ Current |
| [FLOOR_DESIGN_PLAN.md](FLOOR_DESIGN_PLAN.md) | Per-floor visual design (B1–F9), textures, props, lighting | ✅ Shipped |
| [NEW_GAME.md](NEW_GAME.md) | Campfire intro design reference, dialogue script, wizard roster | ✅ Shipped (ref only) |

---

## ⚙️ System Specs

| Doc | What it covers | Status |
|---|---|---|
| [ART_DIRECTION.md](ART_DIRECTION.md) | Procedural art style guide, shader conventions, colour palette | ✅ Current |
| [BUILDINGS.md](BUILDINGS.md) | `BuildingDNA` catalog: all styles, features, faction variants | ✅ Current |
| [BLUEPRINT_SCHEMA.md](BLUEPRINT_SCHEMA.md) | `.ttt-level.json` format spec for room/overworld layouts | ✅ Current |
| [CREATURE_CREATOR_PLAN.md](CREATURE_CREATOR_PLAN.md) | Phases CC-1 to CC-X: sub-races, body morphing, clothing system | 🔲 In progress |
| [OVERWORLD_PLAN.md](OVERWORLD_PLAN.md) | Overworld architecture reference: zones, biomes, chunk system | ✅ Current |
| [UI_HUD_PLAN.md](UI_HUD_PLAN.md) | HUD design: health bar, spell glyphs, minimap, quest tracker | ✅ Mostly shipped |

---

## 🔬 Testing & Tools

| Doc | What it covers | Status |
|---|---|---|
| [TESTING_AND_TOOLS.md](TESTING_AND_TOOLS.md) | All test suites, `__game` API, AI agent workflow, CI commands | 🔲 Needs update |

---

## 🏷️ Princess Creator (sub-system)

| Doc | What it covers |
|---|---|
| [princess-creator/README.md](princess-creator/README.md) | Overview + quick start |
| [princess-creator/DNA_SCHEMA.md](princess-creator/DNA_SCHEMA.md) | DNA type definitions |
| [princess-creator/ARCHITECTURE.md](princess-creator/ARCHITECTURE.md) | Code architecture |
| [princess-creator/ANIMATIONS.md](princess-creator/ANIMATIONS.md) | Animation system |
| [princess-creator/PARTS_CATALOG.md](princess-creator/PARTS_CATALOG.md) | All body parts catalog |
| [princess-creator/SPECIES.md](princess-creator/SPECIES.md) | 21 species definitions |
| [princess-creator/UX_SPEC.md](princess-creator/UX_SPEC.md) | UI/UX spec |
| [princess-creator/INTEGRATION.md](princess-creator/INTEGRATION.md) | Game integration guide |
| [princess-creator/RESEARCH.md](princess-creator/RESEARCH.md) | Research notes |

---

## 📊 Progress & Reference

| Doc | What it covers | Status |
|---|---|---|
| [visual-progress.md](visual-progress.md) | Screenshot log and visual milestones | 🔲 Update when adding new visuals |
| [assets_index.md](assets_index.md) | Index of all asset packs (Kenney, Meshy, etc.) | ✅ |
| [research_village_generation.md](research_village_generation.md) | Settlement + overworld gen research (WFC, Poisson, rivers) | ✅ Reference |
| [3D_MODEL_PROMPTS.md](3D_MODEL_PROMPTS.md) | Prompts for generating 3D models (Meshy.ai etc.) | ✅ Reference |
| [gemini_feedback.md](gemini_feedback.md) | AI research feedback on procedural creature generation | ✅ Historical |
| [gemini_feedback_2.md](gemini_feedback_2.md) | AI research feedback on tile-based world gen | ✅ Historical |

---

## 🚀 Launch

| Doc | What it covers | Status |
|---|---|---|
| [fundraising_campaign.md](fundraising_campaign.md) | Kickstarter/itch.io campaign copy | 🔲 Draft |

---

## 📦 Asset Kits

| Doc | Location | What it covers |
|---|---|---|
| Asset Catalogue | [ASSET_KITS/ASSET_CATALOGUE.md](../ASSET_KITS/ASSET_CATALOGUE.md) | All licensed asset packs, formats, extraction status |

---

## Root-Level Docs (GitHub standards)

| Doc | Purpose |
|---|---|
| [README.md](../README.md) | Project overview, quick start, links |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Technical rules, module tree, data flow |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Branch strategy, commit conventions, test requirements |
| [TODO.md](../TODO.md) | Master guiding principles + art system decisions |
| [TODO/TODO_OVERVIEW.md](../TODO/TODO_OVERVIEW.md) | Structured task tracking across all phases |

---

## Archived / Superseded

Files in [`TODO/archive/`](../TODO/archive/) — kept for reference, not updated:
- `DEMO_RELEASE_TODO.md` — superseded by `TODO/` folder structure
- `CREATIVE_MODE_TODO.md` — superseded by `TODO/03-procedural-pipeline/PROC-D-creative-mode.md`
- `FEATURE_BOT_V1_TODO.md` — superseded by `TODO/07-testing/bot-testing.md`
- `ASSET_LEVEL_EDITOR_TODO.md` — all phases done ✅
- `ASSETS_TODO.md` — superseded by `TODO/01-overworld-studio/game-inventory.md`
- `asset_models_todo.md` — superseded by `TODO.md` (Playable Character Roster)
