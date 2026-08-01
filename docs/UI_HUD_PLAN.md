# UI & HUD Improvement Plan — Tomes, Towers & Transmutation

> **Workflow:** commit per finished task · git push per finished phase
> Last updated: 2026-07-16

---

## Status Legend
- ⬜ not started
- 🔄 in progress
- ✅ done
- ❌ blocked

---

## Audit Summary

### Systems broken (fix first)
| # | Issue | Root cause |
|---|---|---|
| 1 | NPC talk never triggers | `overworld.update(dt, **false**, cam)` — interact key hardcoded `false` |
| 2 | Exterior `[E]` prompt never shows near NPCs | Prompt chain skips NPC proximity entirely |
| 3 | Crafted potions/equipment tokens disappear | `onCraft` only increments a counter — no consumable store |
| 4 | Equipment token stat bonuses never apply | No equip-slot system to receive the token |

### Systems with data but no UI
| System | Backend | UI |
|---|---|---|
| Party/Followers | `PartyManager` + live HP on each `SlimeEnemy` | ❌ none |
| Active buffs/timed effects | battle_hymn aura, potion durations | ❌ none |
| Potion quick-use | potions stored in `ConsumableInventory` (after A2) | ❌ none |
| Weather state | `WeatherSystem` FSM | ❌ no HUD icon |
| Story quest progress | `StoryRunner` acts/beats | ❌ mixed visually with procedural quests |
| Spell cooldowns on action bar | `SpellSystem` per-spell timer | ❌ CSS `.hud-slot-cd` element never written |
| Hybrid spells | `SpellForge` blended spells | ❌ not shown in SpellBook |
| Talent modifiers totals | `ProgressionSystem.talentModifiers` | ❌ no summary in StatPanel |

---

## Phase A — Fix What's Broken

### A1: NPC Interact Fix
**Files:** `src/main.ts`, `src/scene/OverworldScene.ts`

- [ ] Pass `input.state.interact && !anyPanelOpen` to `overworld.update()` instead of `false`
- [ ] Add NPC proximity check to the exterior prompt chain (before resource node check)
  - calls `overworld.nearestNPC(playerPos, 3.0)` → if truthy show `[E] Talk to {name}`
- [ ] Add `nearestNPC(pos, radius)` method to `OverworldScene.ts`

**Status:** ⬜

---

### A2: Consumable Inventory + Equipment Tokens
**Files:** `src/core/ConsumableInventory.ts` (new), `src/main.ts`, `src/interactables/CraftingUI.ts`

- [ ] Create `ConsumableInventory.ts` — `Map<string, number>` for potion stacks + `Set<string>` for equipped tokens (max 3 slots)
- [ ] `EquipmentSlots` class: 3 slots, `equip(tokenId)` applies stat delta to `ProgressionSystem`, `unequip` reverses
- [ ] Wire `onCraft` in `main.ts` to push potion/token results into `ConsumableInventory`
- [ ] `usePotion(id)` method: applies effect (heal, buff), decrements count, fires `onUse` callback
- [ ] Hotkeys `[Z]` = use heal minor, `[X]` = use heal major in overworld/dungeon tick

**Status:** ⬜

---

## Phase B — Shared HUD Design System

**Files:** `src/ui/hudTheme.ts` (new), all UI files

- [ ] Create `src/ui/hudTheme.ts` — injects one `<style>` tag with CSS custom properties:
  - `--hud-bg`, `--hud-surface`, `--hud-border`, `--hud-border-warm`, `--hud-gold`, `--hud-text`, `--hud-muted`, `--hud-danger`, `--hud-info`, `--hud-success`
  - Shared component classes: `.hud-panel`, `.hud-title`, `.hud-title-sm`, `.hud-row`, `.hud-bar-track`, `.hud-bar-fill`, `.hud-pill`, `.hud-kbd`, `.hud-close-hint`, `.hud-divider`, `.hud-section-header`
  - Shared animations: `@keyframes hudFadeIn`, `@keyframes hudSlideUp`, `@keyframes hudPulse`
- [ ] Refactor `QuestLog.ts` to use `.hud-panel` + token variables (remove ~100 lines of duplicate CSS)
- [ ] Refactor `MerchantUI.ts` to use `.hud-panel` + tokens (remove raw inline styles)
- [ ] Refactor `QuestBoardUI.ts` to use `.hud-panel` + tokens
- [ ] Refactor `PauseMenu.ts` to use tokens (minimal — it already looks good)
- [ ] Call `injectHudTheme()` once in `main.ts` before any UI is created

**Status:** ⬜

---

## Phase C — HUD Overhaul

### C1: Main HUD Redesign
**Files:** `src/ui/HUD.ts`

New layout:
- **Top-left card** — compact: `[Lv 12]` badge + HP bar + XP hairline below
- **Bottom-centre action bar** — 4 spell slots with glowing active border + number `[1]–[4]`
- **Bottom-left resource strip** — gold/ore/timber/essence as icon + number chips
- **Bottom-right potion quick-slots** — `[Z]` heal minor, `[X]` heal major with count badge; greyed when empty
- **Top-right party strip** — up to 5 compact HP chips for party members (added in C3)

- [ ] Redesign top-left HP/XP card (compact, parchment card using `.hud-panel`)
- [ ] Redesign action bar — wider slots, glow on active, slot icon area (emoji glyph for now)
- [ ] Resource strip icons instead of emoji text labels
- [ ] Add potion quick-slots `[Z]`/`[X]` with count badges
- [ ] Add `setConsumables(data)` method to HUD for potion counts
- [ ] Weather icon widget (bottom of top-left card): ☀️ 🌥 🌧 ⛈ — updated by `WeatherSystem`
- [ ] Wire weather → `hud.setWeather(state)` in main.ts

**Status:** ⬜

---

### C2: Spell Slot Cooldown Sweep
**Files:** `src/ui/HUD.ts`, `src/main.ts`

- [ ] Add `updateCooldowns(progresses: number[])` to HUD — sets `--cd-pct` CSS var on each slot
- [ ] CSS `conic-gradient` arc overlay on slot that fills as cooldown clears (0% = full dark overlay, 100% = clear)
- [ ] Call `hud.updateCooldowns(spells.getCooldownProgresses())` each frame in game tick
- [ ] Verify `SpellSystem` exposes `getCooldownProgress(id): number` — add if missing

**Status:** ⬜

---

### C3: Party Strip + Active Buffs Bar
**Files:** `src/ui/HUD.ts`, `src/ui/BuffBar.ts` (new), `src/main.ts`

- [ ] Create `src/ui/BuffBar.ts` — horizontal pill strip, top-right below party
  - `addBuff(id, label, color, durationMs)` → auto-removes pill when expired
  - Each pill shows label + countdown seconds
- [ ] HUD top-right party strip: `setParty(members: Array<{name: string, hp: number, maxHp: number, species: string}>)`
  - Up to 5 compact chips, each with a coloured HP bar
  - Removed/dead members fade out
- [ ] Wire `party.members` → `hud.setParty()` each second in overworld/dungeon tick
- [ ] Wire `BuffBar` callbacks from `usePotion()` and `battle_hymn` cast

**Status:** ⬜

---

## Phase D — Panel Polish

### D1: StatPanel Redesign
**Files:** `src/ui/StatPanel.ts`

- [ ] Two-column layout: stats (left) + talent/equipment summary (right)
- [ ] Stat bars (proportional fill 0–20) instead of text-only descriptions
- [ ] Show base value + bonus from equipment/talents separately: `12 +3`
- [ ] Talent column: active nodes count per branch (`Conductor 2/5`, `Pyromancer 1/5`)
- [ ] Equipment column: list 3 token slots with equipped item names (or `— empty —`)
- [ ] Gold stat-point counter `⭐ 3 stat points` prominently at top

**Status:** ⬜

---

### D2: SpellBook Upgrade + Hybrid Spells
**Files:** `src/ui/SpellBook.ts`, `src/ui/SpellForge.ts`

- [ ] Spell cards: icon glyph area (large emoji or canvas icon), name, description, cooldown info, school tag
- [ ] `[Equipped]` badge on spells currently in action bar slots
- [ ] Click-to-assign: click a spell → action bar slot picker appears (1/2/3/4) → assigns
- [ ] Add `Forged Spells` section at bottom — shows hybrid spells from SpellForge
  - Each hybrid shows ingredient lineage: `Flame Dart × Nova Burst → Inferno Pulse`
- [ ] Ensure hybrid spell IDs are registered in `SPELL_LABEL` + `SPELL_DESC` on forge

**Status:** ⬜

---

### D3: CraftingUI Result Inventory
**Files:** `src/interactables/CraftingUI.ts`

- [ ] Add `My Bag` panel below recipe list: shows all held potions with counts
- [ ] Each item row has a `▶ Use` button (calls `ConsumableInventory.usePotion()`)
- [ ] Equipment token section: 3 equip slot UI — drag or click to equip/unequip tokens
- [ ] Refresh bag on every open + after every craft

**Status:** ⬜

---

### D4: MerchantUI Tabs + Potions
**Files:** `src/ui/MerchantUI.ts`

- [ ] Tab bar: `Resources` | `Potions` | `Sell`
- [ ] Potions tab: heal minor (25g), heal major (60g), swiftness (40g) — buy → adds to ConsumableInventory
- [ ] Sell tab: sell resources at 50% rate (existing logic, moved to tab)
- [ ] Use shared `.hud-panel` theme from Phase B

**Status:** ⬜

---

## Phase E — Quest & Story UX

### E1: QuestLog Visual Split
**Files:** `src/ui/QuestLog.ts`

- [x] Section header `◆ YOUR STORY` (gold, full-width) for quests with `[Story]` prefix
- [x] Story quest items: warm amber bg, act badge `Act II · 1/3`, species icon (🦊 👤 💀 🫧)
- [x] Section header `◆ WORLD QUESTS` for procedural/board quests
- [x] Completed quests collapse to a `▸ Completed (3)` toggle at bottom

**Status:** ✅

---

### E2: Persistent Objective Tracker
**Files:** `src/ui/ObjectiveTracker.ts` (new), `src/main.ts`

- [x] Small HUD element (bottom-right, above potion bar): current story beat objective only
- [x] Format: `◆ Defeat enemies · 2 / 3` with a thin progress bar
- [x] Updates when StoryRunner fires `onBeatProgress` callback (add callback to StoryRunner)
- [x] Disappears after beat completes with a brief ✓ flash animation
- [x] Click opens QuestLog

**Status:** ✅

---

### E3: Quest Accept Modal
**Files:** `src/ui/QuestAcceptModal.ts` (new), `src/world/NPCEntity.ts`, `src/main.ts`

- [x] Small modal: quest title, description (2 lines), reward `XP +150  Gold +25`
- [x] `[Accept]` (adds to log) / `[Decline]` (dismiss) buttons
- [x] NPC passes quest to modal instead of silently adding to log
- [x] `OverworldScene.onQuestGiven` now fires modal, not direct `questLog.addQuest()`

**Status:** ✅

---

## Phase F — NPC Dialogue & Interaction Polish

### F1: NPC Dialogue Uses Shared Theme
**Files:** `src/world/NPCEntity.ts`

- [x] Replace raw `div` `_showDialogue()` with `.hud-panel` parchment style
- [x] Show NPC role under name: `Mira · Merchant`
- [x] If merchant/innkeeper role: show `[E] Open Shop` button inside dialogue panel
- [x] If quest-giver with unseen quest: show `[!] Quest Available` badge in label above NPC

**Status:** ✅

---

### F2: DialogueOverlay Wired to NPCs
**Files:** `src/ui/DialogueOverlay.ts`, `src/world/NPCEntity.ts`, `src/main.ts`

- [x] Audit `DialogueOverlay.ts` (377 lines) — understand its current interface
- [x] Replace `_showDialogue()` in NPCEntity with `DialogueOverlay.open(name, role, lines[])`
- [x] Multiple lines with `[Continue →]` progression instead of one text dump
- [x] `[E]` continues dialogue, `[Esc]` closes

**Status:** ✅

---

## Commit & Push Schedule

| Event | Action |
|---|---|
| Each task `[ ]` → `[x]` | `git commit -m "task(ui): ..."` |
| Phase A complete | `git push` |
| Phase B complete | `git push` |
| Phase C complete | `git push` |
| Phase D complete | `git push` |
| Phase E complete | `git push` |
| Phase F complete | `git push` |

---

## Key Files Reference

| Area | Files |
|---|---|
| Main game loop | `src/main.ts` |
| HUD | `src/ui/HUD.ts` |
| SpellBook | `src/ui/SpellBook.ts` |
| SpellForge | `src/ui/SpellForge.ts` |
| StatPanel | `src/ui/StatPanel.ts` |
| QuestLog | `src/ui/QuestLog.ts` |
| CraftingUI | `src/interactables/CraftingUI.ts` |
| CraftingRecipes | `src/interactables/CraftingRecipes.ts` |
| MerchantUI | `src/ui/MerchantUI.ts` |
| QuestBoardUI | `src/ui/QuestBoardUI.ts` |
| NPC entity | `src/world/NPCEntity.ts` |
| OverworldScene | `src/scene/OverworldScene.ts` |
| Inventory | `src/core/Inventory.ts` |
| Progression | `src/progression/ProgressionSystem.ts` |
| PartyManager | `src/combat/PartyManager.ts` |
| SpellSystem | `src/combat/SpellSystem.ts` |
| StoryRunner | `src/world/StoryRunner.ts` |
| DialogueOverlay | `src/ui/DialogueOverlay.ts` |
| DO NOT TOUCH | `src/ui/MainMenu.ts`, `src/ui/FloatingDialogue3D.ts` |
