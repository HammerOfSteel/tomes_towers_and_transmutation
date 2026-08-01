# Water System — Implementation Plan (Phase 5)

**Spec:** `docs/superpowers/specs/2026-08-01-water-system-design.md`

## Task 1 — `isInWaterAt` pure helper + test

- Write `tests/world/WaterDetection.test.ts`: given a small mocked `WorldGrid`-like object exposing
  `worldToGrid` and `get`, assert `isInWaterAt` returns true for `feature === 'river'` and
  `biome === 'water'` cells, false otherwise (including out-of-range coordinates clamped by
  `worldToGrid`).
- Implement `src/world/WaterDetection.ts` exporting `isInWaterAt(wg, x, z): boolean`.
- Run `vitest run tests/world/WaterDetection.test.ts` → confirm pass.

## Task 2 — Animated water shader material

- In `OverworldScene.ts`, add a new private field `_waterMaterial: THREE.ShaderMaterial | null` and
  a `_waterTimeUniform` reference (or read `_waterMaterial.uniforms.uTime` directly).
- Write the vertex/fragment shader strings (small, inline template literals, matching the design doc
  section 1). Vertex shader needs `uTime` uniform; fragment shader needs `uTime` + reads
  `vWorldPosition`/`vNormal` varyings for the fresnel-ish rim term.
- Replace `_buildWaterMesh()`'s `MeshLambertMaterial` construction with the new `ShaderMaterial`,
  keeping `transparent: true, depthWrite: false`. Store the material on `_waterMaterial` for the
  time-uniform update in Task 3. Geometry stays untouched (still one merged quad batch).
- Verify `npx tsc --noEmit` unchanged from the 136-line baseline (or update the recorded baseline
  count if new file adds zero errors, confirmed by diff of the error list, not just line count).

## Task 3 — Time-uniform wiring

- In `OverworldScene.update(dt)`, add `if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;`
  near the top alongside the existing `_skyT += dt` pattern.
- Ensure `dispose()` still disposes `_waterMesh.material` (already does via the generic
  `THREE.Material` cast — no change needed, but confirm the new `ShaderMaterial` disposes cleanly).

## Task 4 — Player submersion

- Add `setSubmersion(depthFraction: number)` to `PlayerController` (`src/player/PlayerController.ts`):
  track a `_submersionOffset` field; on call, compute the target Y offset and apply it as a delta to
  whichever visual child is currently active (`_creatureRig.root`, `_princessInstance.root`, or the
  GLB `scene`), same pattern as the existing per-rig foot-offset assignments in `attachCreatureRig`
  / `attachPrincess` / `loadModel`. Store the base foot-offset separately so repeated calls don't
  compound (recompute from the stored base each time, don't add deltas cumulatively).
- Write `tests/player/PlayerControllerSubmersion.test.ts` (or extend an existing PlayerController
  test file if one exists — check first) asserting: calling `setSubmersion(0.4)` shifts the active
  visual child's local Y down relative to its base offset, and `setSubmersion(0)` restores it exactly
  (no drift after multiple calls).
- Wire `OverworldScene.update()`: after computing `pos`, call
  `const inWater = isInWaterAt(this._wg, pos.x, pos.z); this.player.setSubmersion(inWater ? 0.4 : 0);`.
- Run the new test file + `npx tsc --noEmit` baseline check.

## Task 5 — Full regression + visual verification

- `vitest run` — expect prior baseline (2180 passed) + new water/submersion tests, same 8
  pre-existing failures, no new failures.
- `npx playwright test tests/e2e/exterior.test.ts` — given this session's established finding that
  the shared machine is under heavy load (causing generic Playwright screenshot/font-load timeouts
  unrelated to code), run with `--retries=2`; accept if all tests eventually pass (retries permitted,
  per this session's documented flakiness investigation — do not chase 0% flakiness on this loaded
  machine).
- `npm run doctor` — expect clean.
- Live visual verification: start a dev server on a free port, force a river/water tile position
  (reuse a settlement or the known river-tile grid logic — a fixed test seed's water tile position,
  found via `__game` debug helpers or a quick grid scan), teleport player there, screenshot, confirm
  (a) the water surface shows visible shimmer/ripple banding (may need 2 screenshots a few seconds
  apart to show the animation progressing, or just confirm the two-tone/rim shading look is present
  since static screenshots can't show motion) and (b) the player capsule appears partially sunk
  relative to a screenshot taken on dry land at the same zoom/angle.
- Clean up: delete throwaway verification script, kill dev server, remove any git worktrees created.
- Commit each task separately (matching the project's established one-commit-per-task convention
  from Phases 1-4), push to `origin/cline_work-04_overworld_feel`, mark `phase5-water-system` done
  in the SQL todos table.

## Task 6 — Branch completion

- Once Phase 5 fully lands, per the user's original branch-completion instruction: this branch
  (`cline_work-04_overworld_feel`) has completed its full scope (5 phases). Use the
  `finishing-a-development-branch` skill to merge back into `main` (this branch's base), matching the
  workflow already used for `cline_work-03_building_layout` → `main` in the prior session.
