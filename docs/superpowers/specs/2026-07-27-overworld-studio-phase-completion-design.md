# 01 — Overworld Studio Phase Completion Design

## Goal

Finish the remaining `01-overworld-studio` work in a sequence that matches current dependencies, preserves the already-shipped drill-down/navigation work, and lands useful vertical slices one at a time.

## Current confirmed state

### Already shipped
- OW-E Layer Navigation
- OW-F4 Drill-Down Chain, except export-chain follow-up
- Core Asset Library for current Studio asset types:
  - save
  - preview
  - export
  - import
  - rename
  - duplicate
  - delete

### Remaining 01-overworld-studio scope
1. **Asset Library** — expand from current Studio-only management into broader creator/runtime coverage
2. **Game Inventory** — treat as the master content contract for what generators must eventually produce
3. **Procedural Asset Designer** — new DNA-based creator surfaces for NPC/building/enemy/prop
4. **Procedural Tile Designer** — new tile DNA, registry, preview, and export workflow

### Important dependency facts
- `02-game-world-integration` depends on `01-overworld-studio`
- Asset Designer depends on `PROC-B`
- Tile Designer feeds terrain/world integration and should define stable tile DNA before downstream runtime use
- Current Overworld Studio already contains the main host surface in `src/overworld-studio.ts`
- Existing stale `.js` artifacts exist beside some `.ts` files, so new work should avoid relying on ambiguous extension resolution

---

## Problem framing

The remaining work is not one feature. It is a small cluster of related subprojects with two different kinds of output:

1. **Planning/spec output**
   - `game-inventory.md`
   - the remaining untracked phase definitions

2. **Studio feature output**
   - Asset Library expansion
   - creator/designer tools
   - tile design infrastructure

If these are done in the wrong order, later tools will be built without a stable content contract. If they are done in only planning order, the phase stalls without shipping usable Studio functionality.

---

## Approaches

### Approach A — Strict document-first
Order:
1. Finish `game-inventory.md` as canonical scope
2. Formalize Tile Designer spec
3. Formalize Asset Designer spec
4. Return to implementation afterward

**Pros**
- Lowest ambiguity
- Best long-term alignment with downstream phases
- Easier to avoid rework

**Cons**
- Slowest path to visible Studio features
- Risks spending too long in planning while key tools remain absent

### Approach B — Strict feature-first
Order:
1. Keep expanding Asset Library
2. Build Asset Designer pages
3. Build Tile Designer
4. Clean docs later

**Pros**
- Fastest visible progress
- Maximizes runnable UI output

**Cons**
- Highest rework risk
- Likely to drift from inventory/spec needs
- Harder to keep later integration coherent

### Approach C — Hybrid contract-first vertical slices **(recommended)**
Order:
1. Stabilize `Game Inventory` as the content contract for Overworld Studio outputs
2. Finish **Asset Library** as the shared persistence/management backbone
3. Build **Procedural Asset Designer** in narrow vertical slices that use the library
4. Build **Procedural Tile Designer** after the asset-designer pattern is proven

**Pros**
- Balances planning and shipping
- Reduces rework by setting the contract before expanding tools
- Uses Asset Library as shared infrastructure for all later Studio creators
- Keeps each slice small and testable

**Cons**
- Requires discipline to keep slices narrow
- Slightly slower than pure feature-first in the short term

---

## Recommendation

Use **Approach C**.

The next `01-overworld-studio` work should not jump straight into all designer tools. The shared backbone is now clearly the Asset Library plus a stable content contract. That means:

1. **Game Inventory** becomes the source of truth for what 01 must output.
2. **Asset Library** becomes the shared storage and management system for all future generators.
3. **Asset Designer** should start with the narrowest viable creator surface that can save into the library.
4. **Tile Designer** should come last inside phase 01 because it introduces new DNA and registry primitives that are best designed after the general creator pattern is proven.

---

## Ordered subprojects

## Subproject 1 — Game Inventory stabilization
### Purpose
Turn `TODO/01-overworld-studio/game-inventory.md` from a gap document into the canonical contract for what Overworld Studio generators produce.

### Scope
- Normalize the file as a design contract, not just a wishlist
- Mark which outputs are:
  - already generated in Studio
  - planned in Studio
  - downstream runtime-only
- Add explicit mapping from each remaining generator tool to required output shape

### Success criteria
- The file can be used to decide whether a new Studio generator belongs in phase 01
- Asset Designer and Tile Designer scope can be derived from it without guesswork

### Why first
Without this, later creator tools risk exposing controls for content the game has not even committed to needing.

---

## Subproject 2 — Asset Library completion for phase 01
### Purpose
Finish the Asset Library as the reusable persistence layer for all Studio creators.

### Remaining target scope
- Creator-ready entry coverage beyond current studio types
- Stronger type/category structure for future entries like:
  - creature
  - npc
  - terrain/tile
  - prop
- Runtime/export bridge groundwork for later world-package use
- Better doc/task alignment for what “phase complete” means

### Suggested implementation slices
1. **Library type-system expansion**
2. **Metadata/tag normalization**
3. **Runtime/export bridge for world package prep**
4. **Cross-tool save contract for future creators**

### Success criteria
- Any future Studio creator can save a typed library entry without inventing ad hoc storage rules
- Export/import format is stable enough for downstream world integration

### Why second
Every later creator tool wants “Save to Library”. This is the common backbone.

---

## Subproject 3 — Procedural Asset Designer foundation
### Purpose
Establish one reusable creator pattern for DNA-based assets.

### Scope boundary
Do **not** build all entity creators at once.

Start with the narrowest path that proves the pattern:
1. Building creator shell or NPC creator shell
2. Shared creator page structure:
   - type selector
   - DNA controls
   - preview panel
   - save to library
3. Minimal serialized DNA contract

### Recommended first slice
**Building Creator shell** over NPC Creator.

### Why Building first
- Closest to existing Overworld Studio and building/dwelling work
- Reuses existing building and floor-plan concepts
- Lower dependency surface than full NPC species/role rigs

### Success criteria
- One creator page exists
- It renders a minimal preview
- It saves a typed library entry through the shared Asset Library path

---

## Subproject 4 — Procedural Asset Designer expansion
### Purpose
Extend the proven creator shell to the other entity families.

### Order
1. Building creator refinement
2. Enemy mode inside `creature-lab`
3. NPC creator
4. Prop creator integration

### Success criteria
- Each creator uses the same persistence contract
- No creator invents a one-off save/export format

---

## Subproject 5 — Procedural Tile Designer
### Purpose
Add a dedicated tile DNA and tile-registry workflow for terrain, settlement, dungeon, and cave tiles.

### Scope
- `TileDNA`
- tile category/biome/variant model
- preview tool
- exportable tile-library entries
- `TileRegistry` contract

### Why after asset-designer foundation
Tile Designer is a stronger abstraction problem than the first creator shell. It benefits from reusing:
- the save-to-library flow
- the preview/editor pattern
- the export conventions already proven by earlier creators

### Success criteria
- Tile variants can be previewed and saved in a structured way
- Downstream world integration can consume a stable tile contract

---

## Out of scope for 01 completion
These should not be silently absorbed into this phase:
- full `02-game-world-integration`
- complete runtime NPC controllers/spawners
- full enemy roster content completion
- all content rows from `game-inventory.md`
- world package ZIP importer on the game side

Phase 01 should produce **tools and contracts**, not complete the whole game.

---

## Validation strategy

Each subproject should end with:
1. focused unit coverage for new data contracts
2. focused Playwright coverage for the specific Studio workflow
3. TODO/spec updates reflecting shipped behavior
4. no ambiguous `.js`/`.ts` resolution regressions

Recommended guardrail:
- Prefer explicit extension-priority config where alias imports might touch stale compiled artifacts

---

## Proposed execution order for immediate work

1. **Game Inventory stabilization**
2. **Asset Library phase-completion definition + next implementation slice**
3. **Building Creator shell**
4. **Asset Designer expansion**
5. **Tile Designer foundation**

---

## Immediate next subproject

**Next subproject: Game Inventory stabilization**

### Reason
It is currently marked as a gap but is supposed to define what the remaining Overworld Studio tools must produce. Stabilizing it first reduces ambiguity for every later tool and keeps the remaining `01-overworld-studio` work ordered around a clear contract.