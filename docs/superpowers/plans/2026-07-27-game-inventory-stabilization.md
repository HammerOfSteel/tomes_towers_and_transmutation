# Game Inventory Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `TODO/01-overworld-studio/game-inventory.md` into the canonical phase-01 content contract for Overworld Studio generator outputs, then align the phase docs that reference it.

**Architecture:** This is a documentation-first slice with narrow, testable outputs. The work stays inside phase-01 planning/docs, defines what each Overworld Studio generator is expected to output, and updates the phase index files so later Asset Library and designer-tool implementation can consume one clear contract.

**Tech Stack:** Markdown, ripgrep, git, existing TODO/spec documentation structure

## Global Constraints

- Treat phase 01 as **tools and contracts only**; do not absorb `02-game-world-integration` runtime implementation into this slice.
- Preserve the already-shipped OW-E and OW-F4 status; this slice only clarifies remaining scope.
- Keep the output centered on **Overworld Studio generator contracts**, not full game-content completion.
- Align terminology with existing files: `Asset Library`, `Game Inventory`, `Procedural Asset Designer`, `Procedural Tile Designer`.
- Keep future creator work compatible with the existing Asset Library save/export model.
- Update every touched TODO/spec file so status text is internally consistent after the slice lands.

---

## File Structure

- **Modify:** `TODO/01-overworld-studio/game-inventory.md`
  - Canonical content contract for what Overworld Studio generators produce now, next, and later.
- **Modify:** `TODO/01-overworld-studio/README.md`
  - Phase-01 index summary; must stop treating Game Inventory as an untracked gap once stabilized.
- **Modify:** `TODO/TODO_OVERVIEW.md`
  - Master status index; must reflect the new role/status of Game Inventory in phase 01.
- **Reference only:** `docs/superpowers/specs/2026-07-27-overworld-studio-phase-completion-design.md`
  - Source of truth for ordering: Game Inventory first, then Asset Library, then creator tools.

---

### Task 1: Reframe `game-inventory.md` as a phase-01 contract

**Files:**
- Modify: `TODO/01-overworld-studio/game-inventory.md`

**Interfaces:**
- Consumes: current `Game Asset Inventory` headings and generator tables
- Produces:
  - a new `Phase 01 Contract` section in `TODO/01-overworld-studio/game-inventory.md`
  - a new document framing that distinguishes Studio outputs from broader game-content aspirations

- [ ] **Step 1: Write the failing check**

Run:
```bash
rg -n "Phase 01 Contract|Studio Output Contract|Out of Scope for 01" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
(no matches)
```

- [ ] **Step 2: Add the new contract framing**

Insert this block after the introductory “How to use this file” section:

```md
## Phase 01 Contract

This file is the **content contract** for the remaining `01-overworld-studio` work.

For each asset family, classify it as one of:
- **Studio Now** — already generated or managed by an existing Overworld Studio tool
- **Studio Next** — must gain a Studio creator/generator surface in phase 01
- **Runtime Later** — important game content, but not part of the current phase-01 implementation slice

Phase 01 is complete when the required **Studio Now** and **Studio Next** contracts are explicit and can drive:
- Asset Library expansion
- Procedural Asset Designer work
- Procedural Tile Designer work

## Studio Output Contract

Every phase-01 generator entry should make these outputs explicit:
- **Generator surface** — which Studio page/tab owns the flow
- **Primary output** — the model/DNA/blueprint the tool generates
- **Library path** — whether the output saves to `AssetLibrary`
- **Runtime dependency** — whether downstream phases consume it later
```

- [ ] **Step 3: Re-run the check**

Run:
```bash
rg -n "Phase 01 Contract|Studio Output Contract|Out of Scope for 01" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
TODO/01-overworld-studio/game-inventory.md:<line>:## Phase 01 Contract
TODO/01-overworld-studio/game-inventory.md:<line>:## Studio Output Contract
```

- [ ] **Step 4: Commit**

```bash
git add -- TODO/01-overworld-studio/game-inventory.md
git commit -m "docs: reframe game inventory as phase-01 contract"
```

---

### Task 2: Normalize world-structure and generator-coverage tables around Studio ownership

**Files:**
- Modify: `TODO/01-overworld-studio/game-inventory.md`

**Interfaces:**
- Consumes:
  - `## 1 · WORLD STRUCTURE (top-down scope)`
  - `## 12 · GENERATOR TOOL COVERAGE MAP`
- Produces:
  - explicit ownership/status columns for phase-01 tooling
  - clear separation between “already in Studio”, “planned in Studio”, and “not a phase-01 generator target”

- [ ] **Step 1: Write the failing check**

Run:
```bash
rg -n "Studio Now|Studio Next|Runtime Later|Library type" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
(no matches)
```

- [ ] **Step 2: Rewrite the world-structure table with contract-oriented columns**

Replace the existing section table under `## 1 · WORLD STRUCTURE (top-down scope)` with:

```md
| Level | Generator surface | Primary output | Phase 01 status | Library path | Notes |
|---|---|---|---|---|---|
| Solar System | `solar-controls` | solar system data | Studio Now | Not yet saved | 1–4 planets, star type, asteroid belts |
| Planet | `solar-controls` + planet click | planet DNA / selected planet state | Studio Now | Not yet saved | Type: terrestrial / ocean / desert / ice / lava / gas giant |
| Realm (continent slice) | `realm-controls` | realm geography model | Studio Now | Not yet saved | Climate, shape, roughness, settlement count |
| Settlement (city/village/hamlet) | `settlement-controls` | `SettlementModel` | Studio Now | `AssetLibrary` type=`settlement` | Ward layout, faction, size |
| Building (ward/building blueprint) | building modal + `building-viewer` | building blueprint / floor plan | Studio Next | `AssetLibrary` type=`building` | Per ward, per floor |
| Room (dungeon room graph) | `dungeon-controls` | `DungeonPlan` / room graph | Studio Now | `AssetLibrary` type=`dungeon` | Room type, connections, props |
| Cave / Glade | `cave-controls` | cave biome layout | Studio Now | `AssetLibrary` type=`cave` | Biome, density, size |
| Dungeon entrance | embedded in realm | deterministic realm marker | Studio Now | Not saved directly | Leads to `dungeon-controls` output |
```

- [ ] **Step 3: Rewrite the generator coverage map with explicit library/output rules**

Replace the current `## 12 · GENERATOR TOOL COVERAGE MAP` table with:

```md
| Generator surface | Produces | Phase 01 status | Saves to library | Library type | Downstream consumer |
|---|---|---|---|---|---|
| `settlement-controls` | settlement ward layout + building footprints | Studio Now | Yes | `settlement` | `02-game-world-integration` |
| `building-viewer` / future `building-creator.html` | building blueprint + floor plan | Studio Next | Yes | `building` | OW-D + settlement integration |
| `dungeon-controls` | dungeon floor plan + room graph | Studio Now | Yes | `dungeon` | dungeon integration |
| `cave-controls` | cave/glade map + biome placement data | Studio Now | Yes | `cave` | cave/glade integration |
| `realm-controls` | realm geography + markers | Studio Now | Not yet | none yet | realm integration |
| `solar-controls` | solar system + planet selection state | Studio Now | Not yet | none yet | realm/planet drill-down |
| future `npc-creator.html` | NPC DNA/profile + preview | Studio Next | Yes | `npc` | settlement/NPC runtime |
| future enemy mode in `creature-lab.html` | enemy DNA/profile + preview | Studio Next | Yes | `creature` or `enemy` (decide in Asset Library slice) | enemy runtime |
| future tile designer | tile DNA + preview variants | Studio Next | Yes | `terrain` or `tile` (decide in Asset Library slice) | realm/dungeon/cave rendering |
| spell VFX sandbox | spell preview only | Runtime Later | No | none | ability/VFX runtime |
```

- [ ] **Step 4: Re-run the check**

Run:
```bash
rg -n "Studio Now|Studio Next|Runtime Later|Library type" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
TODO/01-overworld-studio/game-inventory.md:<line>:| Level | Generator surface | Primary output | Phase 01 status | Library path | Notes |
TODO/01-overworld-studio/game-inventory.md:<line>:| Generator surface | Produces | Phase 01 status | Saves to library | Library type | Downstream consumer |
```

- [ ] **Step 5: Commit**

```bash
git add -- TODO/01-overworld-studio/game-inventory.md
git commit -m "docs: align game inventory with studio generator ownership"
```

---

### Task 3: Add explicit scope gates for Asset Designer and Tile Designer

**Files:**
- Modify: `TODO/01-overworld-studio/game-inventory.md`

**Interfaces:**
- Consumes:
  - `## 12 · GENERATOR TOOL COVERAGE MAP`
  - current creator-related notes under sections 6, 8, 11, and 14
- Produces:
  - a new section describing the minimum phase-01 creator outputs
  - a stable handoff from Game Inventory to Asset Designer and Tile Designer work

- [ ] **Step 1: Write the failing check**

Run:
```bash
rg -n "Minimum Phase-01 Creator Targets|Building Creator first slice|Tile Designer first slice" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
(no matches)
```

- [ ] **Step 2: Add minimum creator-target definitions**

Insert this section after `## 12 · GENERATOR TOOL COVERAGE MAP` and before `## 13 · CONTENT COMPLETION GATE (per game phase)`:

```md
## 12b · Minimum Phase-01 Creator Targets

These are the minimum creator slices required to finish `01-overworld-studio` without pulling full runtime implementation into this phase.

### Building Creator first slice
Required output:
- building archetype selector
- faction style selector
- size selector
- live preview
- save to `AssetLibrary`

Deferred from first slice:
- full runtime collider work
- complete archetype roster
- full faction-decoration parity

### NPC Creator first slice
Required output:
- species selector
- role selector
- appearance controls
- preview card or simple 3D preview
- save to `AssetLibrary`

Deferred from first slice:
- full `NpcController.ts`
- full settlement runtime spawning

### Enemy Creator first slice
Required output:
- enemy mode inside `creature-lab.html`
- tier / role / weapon controls
- preview metadata
- save to `AssetLibrary`

Deferred from first slice:
- complete enemy roster content completion

### Tile Designer first slice
Required output:
- `TileDNA` contract
- category / biome / variant controls
- preview surface
- save/export path

Deferred from first slice:
- full runtime tile-placement integration
- exhaustive biome tile-set completion
```

- [ ] **Step 3: Re-run the check**

Run:
```bash
rg -n "Minimum Phase-01 Creator Targets|Building Creator first slice|Tile Designer first slice" TODO/01-overworld-studio/game-inventory.md
```

Expected:
```text
TODO/01-overworld-studio/game-inventory.md:<line>:## 12b · Minimum Phase-01 Creator Targets
TODO/01-overworld-studio/game-inventory.md:<line>:### Building Creator first slice
TODO/01-overworld-studio/game-inventory.md:<line>:### Tile Designer first slice
```

- [ ] **Step 4: Commit**

```bash
git add -- TODO/01-overworld-studio/game-inventory.md
git commit -m "docs: define minimum phase-01 creator targets"
```

---

### Task 4: Align the phase indexes with the stabilized Game Inventory contract

**Files:**
- Modify: `TODO/01-overworld-studio/README.md`
- Modify: `TODO/TODO_OVERVIEW.md`

**Interfaces:**
- Consumes:
  - the stabilized `TODO/01-overworld-studio/game-inventory.md`
- Produces:
  - updated phase status/index copy that no longer treats Game Inventory as an untracked gap
  - consistent wording between the phase README and master overview

- [ ] **Step 1: Write the failing check**

Run:
```bash
rg -n "Game Inventory.*⚠️ new|Game Inventory.*⚠️ GAP|G3 \\| \\*\\*Game Inventory" TODO/01-overworld-studio/README.md TODO/TODO_OVERVIEW.md
```

Expected:
```text
TODO/01-overworld-studio/README.md:<line>:- [Game Inventory](./game-inventory.md) ⚠️ new
TODO/TODO_OVERVIEW.md:<line>| [Game Inventory](./01-overworld-studio/game-inventory.md) | Inventory of all procedural asset types needed | ⚠️ GAP |
TODO/TODO_OVERVIEW.md:<line>| G3 | **Game Inventory** — no master list of what procedural assets actually need to exist for a complete game world | Medium | `01-overworld-studio/game-inventory.md` |
```

- [ ] **Step 2: Update the phase README entry**

Change the `Game Inventory` line in `TODO/01-overworld-studio/README.md` to:

```md
- [Game Inventory](./game-inventory.md) 🚧
```

- [ ] **Step 3: Update the master overview index row and gap wording**

In `TODO/TODO_OVERVIEW.md`, make these exact replacements:

```md
| [Game Inventory](./01-overworld-studio/game-inventory.md) | Master contract for procedural asset outputs needed from Overworld Studio | 🚧 |
```

```md
| G3 | **Game Inventory** — stabilize the master contract of procedural asset outputs so phase-01 tools have a clear source of truth | Medium | `01-overworld-studio/game-inventory.md` |
```

- [ ] **Step 4: Re-run the check**

Run:
```bash
rg -n "Game Inventory.*🚧|G3 \\| \\*\\*Game Inventory.*stabilize the master contract" TODO/01-overworld-studio/README.md TODO/TODO_OVERVIEW.md
```

Expected:
```text
TODO/01-overworld-studio/README.md:<line>:- [Game Inventory](./game-inventory.md) 🚧
TODO/TODO_OVERVIEW.md:<line>| [Game Inventory](./01-overworld-studio/game-inventory.md) | Master contract for procedural asset outputs needed from Overworld Studio | 🚧 |
TODO/TODO_OVERVIEW.md:<line>| G3 | **Game Inventory** — stabilize the master contract of procedural asset outputs so phase-01 tools have a clear source of truth | Medium | `01-overworld-studio/game-inventory.md` |
```

- [ ] **Step 5: Run final validation**

Run:
```bash
npx prettier --check TODO/01-overworld-studio/game-inventory.md TODO/01-overworld-studio/README.md TODO/TODO_OVERVIEW.md
```

Expected:
```text
Checking formatting...
All matched files use Prettier code style!
```

- [ ] **Step 6: Commit**

```bash
git add -- TODO/01-overworld-studio/game-inventory.md TODO/01-overworld-studio/README.md TODO/TODO_OVERVIEW.md
git commit -m "docs: stabilize phase-01 game inventory contract"
```

---

## Self-Review

### Spec coverage
- Game Inventory becomes the canonical contract: covered by Tasks 1–3
- Phase index alignment after stabilization: covered by Task 4
- No accidental pull-in of full runtime implementation: enforced by Global Constraints and creator “first slice” scope gates

### Placeholder scan
- No `TBD`, `TODO`, `implement later`, or “similar to Task N” placeholders were left in the task steps.
- All commands, markdown snippets, and commit messages are explicit.

### Type and naming consistency
- Uses one consistent status vocabulary:
  - `Studio Now`
  - `Studio Next`
  - `Runtime Later`
- Uses one consistent library/save vocabulary:
  - `AssetLibrary`
  - `Library type`
  - “save to library”
- Uses one consistent first-slice terminology for creator tools:
  - `Building Creator first slice`
  - `NPC Creator first slice`
  - `Enemy Creator first slice`
  - `Tile Designer first slice`