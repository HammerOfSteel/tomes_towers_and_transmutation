# Disable Indoor Wall Occlusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop indoor rooms from hiding walls/pillars (dollhouse cutaway + legacy dynamic wall occlusion) so every wall, pillar, and doorframe always renders, everywhere, with no flicker and no "invisible wall you can't tell is solid" confusion.

**Architecture:** Remove the call sites that invoke `DollhouseCutaway.ts` and `WallOcclusionManager.ts` in the four places they're wired up (`src/main.ts`, `src/building-viewer.ts`, `src/levels/BlueprintRenderer.ts`, `src/world/buildings/InteriorGenerator.ts`). The modules and their existing test suites are left in the repo untouched — only the code that *calls* them is deleted. No new modules, no new tests (this is a removal, not new behavior) — existing unit tests continue to pass unchanged, and the fix is verified by manual/e2e visual check.

**Tech Stack:** TypeScript, Three.js, Vitest (existing test suites, unchanged), Playwright e2e (existing suite, used for manual verification pass).

## Global Constraints

- Do **not** delete `src/rendering/DollhouseCutaway.ts`, `src/rendering/WallOcclusionManager.ts`, or their test files — only remove call sites.
- Do **not** touch `src/rendering/OcclusionManager.ts` (outdoor fade system) — out of scope.
- Do **not** touch the ceiling-removal logic in `InteriorGenerator.ts` — unrelated to this change.
- No new toggle/config flag — this is an unconditional removal, not a feature switch.

---

### Task 1: Remove `WallOcclusionManager` from the main game (`src/main.ts`)

**Files:**
- Modify: `src/main.ts:83` (import), `src/main.ts:186` (instantiation), `src/main.ts:190` (reset call), `src/main.ts:2951-2955` (update call)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is a pure removal. No other task depends on this one.

- [ ] **Step 1: Remove the import**

In `src/main.ts`, delete line 83:

```ts
import { WallOcclusionManager } from '@/rendering/WallOcclusionManager';
```

- [ ] **Step 2: Remove the instantiation**

Around line 186, delete:

```ts
  // Must be constructed BEFORE sceneManager.onRoomLoaded is assigned below,
  // because loadDungeon() can fire onRoomLoaded synchronously during main().
  const _wallOccMgr = new WallOcclusionManager();
```

(Delete both the instantiation line and its preceding comment block — the comment only makes sense in the context of the removed variable.)

- [ ] **Step 3: Remove the reset-on-room-change call**

Inside `sceneManager.onRoomLoaded = (bp, _s) => { ... }` (starts around what is now line ~185 after Step 2's deletion), delete:

```ts
    // Reset wall occlusion on every room change (new room = new walls)
    _wallOccMgr.reset();
```

- [ ] **Step 4: Remove the per-frame update call**

Find this block (around line 2951, exact line number will have shifted after Steps 1-3):

```ts
    // Per-wall occlusion: hides individual wall meshes between camera and player.
    // Only active in interior mode — no cost when in overworld.
    if (gameMode === 'interior') {
      _wallOccMgr.update(cameraRig.camera, player.group, sceneManager.currentRoomGroup);
    }
```

Delete the whole block, including both comment lines and the `if` statement. Leave the surrounding lines (the `_occlusionMgr?.update(...)` call above it and `composer.render(dt);` below it) untouched.

- [ ] **Step 5: Verify no remaining references**

Run: `grep -n "_wallOccMgr\|WallOcclusionManager" src/main.ts`
Expected: no output (empty result).

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no new errors (specifically, no "unused import" or "cannot find name '_wallOccMgr'" errors related to this file).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "fix: remove WallOcclusionManager call sites from main game loop

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Remove `WallOcclusionManager` from the building preview tool (`src/building-viewer.ts`)

**Files:**
- Modify: `src/building-viewer.ts:30` (import), `src/building-viewer.ts:136` (instantiation), `src/building-viewer.ts:144` (reset call), `src/building-viewer.ts:187` (update call)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Remove the import**

Delete line 30:

```ts
import { WallOcclusionManager } from '@/rendering/WallOcclusionManager';
```

- [ ] **Step 2: Remove the instantiation**

Around line 135-136, delete:

```ts
  // ── 10. Wall occlusion ────────────────────────────────────────────────────────
  const wallOccMgr = new WallOcclusionManager();
```

- [ ] **Step 3: Remove the reset call**

Inside `sceneManager.onRoomLoaded = (bp: Blueprint) => { ... }` (around line 144), delete:

```ts
    wallOccMgr.reset();
```

Leave the rest of that callback (floor-physics-body replacement logic) untouched.

- [ ] **Step 4: Remove the per-frame update call**

Around line 187, delete:

```ts
    wallOccMgr.update(cameraRig.camera, player.group, sceneManager.currentRoomGroup);
```

- [ ] **Step 5: Verify no remaining references**

Run: `grep -n "wallOccMgr\|WallOcclusionManager" src/building-viewer.ts`
Expected: no output.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors related to `src/building-viewer.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/building-viewer.ts
git commit -m "fix: remove WallOcclusionManager call sites from building preview tool

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Remove `DollhouseCutaway` call from `BlueprintRenderer.ts`

**Files:**
- Modify: `src/levels/BlueprintRenderer.ts:5` (import), `src/levels/BlueprintRenderer.ts:663` (call)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Remove the import**

Delete line 5:

```ts
import { applyDollhouseCut } from '@/rendering/DollhouseCutaway';
```

- [ ] **Step 2: Remove the call**

Around line 663, delete:

```ts
    applyDollhouseCut(mesh, roomCenterXZ);
```

If this line is the only statement in its enclosing block/conditional, view the surrounding 5 lines before deleting to confirm you're not leaving an empty `if` block — if the block becomes empty, remove the now-pointless `if` wrapper too, but leave any other logic in that block (e.g. mesh tagging) untouched.

- [ ] **Step 3: Verify no remaining references**

Run: `grep -n "applyDollhouseCut\|DollhouseCutaway" src/levels/BlueprintRenderer.ts`
Expected: no output.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors related to `src/levels/BlueprintRenderer.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/levels/BlueprintRenderer.ts
git commit -m "fix: remove dollhouse-cutaway call site from BlueprintRenderer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Remove `DollhouseCutaway` call from `InteriorGenerator.ts`

**Files:**
- Modify: `src/world/buildings/InteriorGenerator.ts:21` (import), `src/world/buildings/InteriorGenerator.ts:545` (call)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

- [ ] **Step 1: Remove the import**

Delete line 21:

```ts
import { applyDollhouseCut } from '@/rendering/DollhouseCutaway';
```

- [ ] **Step 2: Remove the call**

Around line 545, delete:

```ts
    applyDollhouseCut(mesh, roomCenterXZ);
```

Same caveat as Task 3 Step 2: check the surrounding block; if it becomes empty after removing this line, remove the empty wrapper, but do **not** touch the ceiling-removal logic elsewhere in this file — that is intentionally unrelated and stays as-is.

- [ ] **Step 3: Verify no remaining references**

Run: `grep -n "applyDollhouseCut\|DollhouseCutaway" src/world/buildings/InteriorGenerator.ts`
Expected: no output.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors related to `src/world/buildings/InteriorGenerator.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/world/buildings/InteriorGenerator.ts
git commit -m "fix: remove dollhouse-cutaway call site from InteriorGenerator

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Full regression pass and verification

**Files:**
- None modified — this task only runs existing suites and a manual check.

**Interfaces:**
- Consumes: the four call-site removals from Tasks 1-4.
- Produces: verification that the removal is complete and regression-free.

- [ ] **Step 1: Run the full unit test suite**

Run: `npx vitest run`
Expected: all tests pass, including the pre-existing (untouched) `DollhouseCutaway` and `WallOcclusionManager` test suites — they test the modules' internal behavior directly, not the call sites we removed, so they must still pass unchanged.

- [ ] **Step 2: Full project type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Confirm zero remaining call sites repo-wide**

Run: `grep -rn "WallOcclusionManager\|DollhouseCutaway" src/ --include="*.ts" | grep -v "src/rendering/WallOcclusionManager.ts\|src/rendering/DollhouseCutaway.ts"`
Expected: no output (the only remaining references are the module definition files themselves, which we intentionally keep).

- [ ] **Step 4: Manual/e2e visual check**

Start the dev server: `npm run dev` (or use an existing Playwright e2e spec that walks into a building/dungeon interior, if one exists — check `tests/e2e/` for a spec that loads an interior room).

Verify:
- Walking into any building or dungeon interior room shows all four walls, all pillars, and all doorframes fully rendered at all times.
- No flicker when walking near walls or pillars.
- No console errors/warnings mentioning "wall occlusion" or "dollhouse".

- [ ] **Step 5: Commit the checkpoint (if any stray changes)**

If Steps 1-4 required no code changes (expected), there is nothing to commit here — this task is verification-only. If a type error surfaced and required a small fix during this pass, commit it with a message describing exactly what broke and why, then re-run Steps 1-2 to confirm green.
