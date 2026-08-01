# Building Viewer Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tightly-coupled building preview (which bolted onto the tower's main.ts) with a fully isolated `building-viewer.html` entry point that reuses existing shared systems but has zero dependency on the tower game.

**Architecture:** New standalone page `building-viewer.html` → `src/building-viewer.ts`. Imports only the rendering/physics/input layer (SceneManager, BlueprintRenderer, WallOcclusionManager, PlayerController, CameraRig, LightingSystem, GameLoop). Reads `ttt_building_preview` from localStorage at startup. No tower systems, no story, no save, no enemies. Studio's "Play in 3D" points to `/building-viewer.html`. All `isBuildingRoom` pollution removed from `main.ts`.

**Tech Stack:** Three.js 0.170, Rapier (via PhysicsWorld), Vite 6, Vitest + Playwright

## Global Constraints

- Reuse existing working systems — do NOT reinvent SceneManager, BlueprintRenderer, WallOcclusionManager, PlayerController, CameraRig, LightingSystem, GameLoop, buildingToDungeonPlan
- Zero tower game code in building-viewer.ts — no generateTower, no StoryRunner, no MainMenu, no CharacterCreation, no combat, no save/load
- Same localStorage key: `ttt_building_preview`
- Same Blueprint/DungeonPlan format — no changes to data structures
- TDD: write E2E test before implementation, verify red then green
- Run `npx vitest run` + `curl http://localhost:5174/src/building-viewer.ts | grep ERROR` after every task to confirm no regressions

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `building-viewer.html` | **CREATE** | Minimal HTML shell — canvas + status div |
| `src/building-viewer.ts` | **CREATE** | Isolated entry: load plan → render rooms → player movement |
| `vite.config.ts` | **MODIFY** | Add `buildingViewer: path.resolve(__dirname, 'building-viewer.html')` to rollupOptions.input |
| `src/overworld-studio.ts` | **MODIFY** | Line 1945: `window.open('/building-viewer.html', '_blank')` |
| `src/main.ts` | **MODIFY** | Remove: previewBuilding, generateBuildingPreviewJson, getCurrentRoomId (from __game), auto-start block (lines ~1775–1805), all isBuildingRoom guards in onRoomLoaded |
| `tests/e2e/building-viewer.spec.ts` | **CREATE** | E2E tests for the new page |

---

## Task 1 — E2E test (red) for building-viewer.html

Write the tests BEFORE any implementation. They will fail because the page doesn't exist yet. That's the point.

- [ ] Create `tests/e2e/building-viewer.spec.ts`
- [ ] Test 1: `GET /building-viewer.html` returns 200
- [ ] Test 2: page with valid `ttt_building_preview` in localStorage shows a canvas and no JS errors
- [ ] Test 3: page without the key shows "No plan loaded" message, no crash
- [ ] Test 4: `window.__buildingViewerReady` is set true after plan loads
- [ ] Test 5: no `[PropPlacer]`, `[KayKit]`, `[StoryRunner]`, `[tower]` console logs appear
- [ ] Run `npx playwright test tests/e2e/building-viewer.spec.ts` — **confirm ALL fail** (page 404)
- [ ] Commit: `test(building-viewer): add failing E2E tests`

---

## Task 2 — HTML shell + vite config

- [ ] Create `building-viewer.html`:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
    <title>Building Viewer — TT&T</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#000; overflow:hidden; }
      #bv-canvas { display:block; width:100vw; height:100vh; }
      #bv-status {
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        color:#c8a96e; font-family:'IM Fell English',Georgia,serif;
        font-size:1.2rem; text-align:center; display:none;
      }
    </style>
  </head>
  <body>
    <canvas id="bv-canvas"></canvas>
    <div id="bv-status"></div>
    <script type="module" src="/src/building-viewer.ts"></script>
  </body>
  </html>
  ```
- [ ] In `vite.config.ts`, add to `rollupOptions.input`:
  ```ts
  buildingViewer: path.resolve(__dirname, 'building-viewer.html'),
  ```
- [ ] Run `npx vite build --mode development` — confirm it compiles (building-viewer.ts doesn't exist yet, so it will fail — that's expected; just confirm vite.config parses cleanly)
- [ ] Run the E2E tests — test 1 (`GET /building-viewer.html`) should now **pass**; others still fail
- [ ] Commit: `feat(building-viewer): add HTML shell and vite config entry`

---

## Task 3 — `src/building-viewer.ts` implementation

This is the core. Keep it under 300 lines. Import only what's needed.

**Allowed imports (reuse, don't reinvent):**
- `three`
- `@/core/GameLoop`
- `@/core/InputManager`
- `@/core/CameraRig`
- `@/physics/PhysicsWorld`
- `@/player/PlayerController`
- `@/levels/SceneManager`
- `@/rendering/LightingSystem`
- `@/rendering/WallOcclusionManager`
- `@/buildingToDungeonPlan` (type import only — plan comes from localStorage)
- `@/levels/DungeonGenerator` (type: DungeonPlan)
- `@/levels/blueprint` (type: Blueprint)

**Forbidden imports (zero coupling to tower):**
- `@/ui/MainMenu`
- `@/ui/CharacterCreation*`
- `@/levels/TowerGenerator`
- `@/levels/TowerFloorDef`
- `@/world/StoryRunner`
- `@/world/SolmorDialogueTree`
- `@/combat/*`
- `@/progression/*`
- Any save/load system

**Startup sequence in `building-viewer.ts`:**
```
1. Read localStorage.ttt_building_preview
   → absent: show #bv-status "No plan loaded. Open Overworld Studio, double-click a ward, and click 🎮 Play in 3D." and stop.
   → present: parse JSON → DungeonPlan

2. Init Three.js: scene, renderer (#bv-canvas), CameraRig

3. Init PhysicsWorld (Rapier WASM)

4. Init PlayerController (fly mode = true, godMode = true from start)

5. Init SceneManager(scene, physics, player)
   - Set onRoomLoaded: clearTorches + addTorchesForBlueprint + applyPreset('dungeon')
   - NO KayKit props, NO PropPlacer, NO story triggers

6. sceneManager.loadDungeon(plan) → loadRoomImmediate(plan.startRoomId)

7. Init WallOcclusionManager

8. gameLoop.onTick(dt => {
     physics.step(dt)
     player.update(input.state, dt)
     cameraRig.update(player.group.position)
     wallOccMgr.update(camera, player.group, sceneManager.currentRoomGroup)
     sceneManager.update(dt)
     renderer.render(scene, camera)
   })
9. gameLoop.start()

10. window.__buildingViewerReady = true  ← debug flag for tests
    console.log('[BuildingViewer] ✓ ready — room:', plan.startRoomId)
```

**Steps:**
- [ ] Create `src/building-viewer.ts` with the above structure
- [ ] Confirm TypeScript compiles: `npx tsc --noEmit 2>&1 | grep "building-viewer" | head -10`
- [ ] Confirm Vite serves it without errors: `curl -s http://localhost:5174/src/building-viewer.ts | grep -c ERROR`
- [ ] Run E2E tests — tests 2, 3, 4, 5 should now **pass**
- [ ] Commit: `feat(building-viewer): isolated entry point (~250 lines)`

---

## Task 4 — Wire Studio to the new page

- [ ] In `src/overworld-studio.ts` line 1945, change:
  ```ts
  window.open('/index.html', '_blank');
  ```
  to:
  ```ts
  window.open('/building-viewer.html', '_blank');
  ```
- [ ] Reload Studio in browser, double-click a ward, click "🎮 Play in 3D"
- [ ] **Visually confirm**: building room loads, NO props outside walls, NO tower story text
- [ ] Screenshot and save to `tests/e2e/screenshots/building-viewer-smoke.png`
- [ ] Commit: `feat(building-viewer): wire Studio Play in 3D button`

---

## Task 5 — Remove pollution from `main.ts`

Now that the building preview has its own entry point, remove all the code that was added to `main.ts` to support the old approach.

Find and remove:
- [ ] `import { buildingToDungeonPlan } from '@/buildingToDungeonPlan'` (top of file) — only needed if `generateBuildingPreviewJson` stays; remove both together
- [ ] `import type { BuildingKind, Faction, BuildingSize }` (top) — same
- [ ] The auto-start block `if (bpJson) { ... requestAnimationFrame(() => game.previewBuilding(bpJson)) }` (~lines 1775–1805)
- [ ] `previewBuilding`, `getCurrentRoomId`, `generateBuildingPreviewJson` from `window.__game` object
- [ ] All `isBuildingRoom` guards in `onRoomLoaded` (lines 210, 211, 240, 253) — revert to the clean pre-pollution version
- [ ] The `WallOcclusionManager` import and wiring can STAY — it helps tower rooms too
- [ ] Run `npx vitest run` — **all tests must still pass**
- [ ] Run `curl -s http://localhost:5174/src/main.ts | grep -c "isBuildingRoom"` — must return `0`
- [ ] Run `npx playwright test tests/e2e/startup.spec.ts tests/e2e/building-viewer.spec.ts` — all pass
- [ ] Commit: `refactor(main): remove building preview pollution`

---

## Task 6 — Final verification

Do NOT claim complete until every item below is confirmed with output:

- [ ] `npx vitest run` → output shows N passed, 0 failed (capture count)
- [ ] `npx playwright test tests/e2e/building-viewer.spec.ts tests/e2e/building-preview.spec.ts` → all pass (capture output)
- [ ] `curl -s http://localhost:5174/src/main.ts | grep "isBuildingRoom"` → empty output
- [ ] Manual: Studio → double-click Inn ward → "🎮 Play in 3D" → building room loads, no stray props, no tower text
- [ ] Manual: wall occlusion working (walk up to a wall, it hides)
- [ ] Commit: `feat(building-viewer): complete isolation — closes OW-D`
