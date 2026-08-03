# Water Lab + Water Polish — Design

**Date:** 2026-08-03
**Branch:** `cline_work-05_overworld_polish`
**Trigger:** After Phase 5 (water system) merged to `main`, the user reported
the overworld water "still kind of off" and asked for an isolated,
low-cost test room to iterate on the water shader/feel, plus for the water
to actually be swimmable.

## Problem

1. **Hard to iterate on water in the overworld.** The overworld is an
   expensive scene to boot (procedural world gen, settlements, NPCs, trees,
   dungeons — visible in the console log spam from the last debugging
   session) and water tiles are scattered/hard to reach reliably. Every
   shader tweak currently requires a full overworld reload + manual
   navigation to a lake tile, which is slow and costs FPS while testing.
2. **Water doesn't yet feel swimmable.** Today `setSubmersion()` only shifts
   the visual rig down by a fixed 0.4 fraction while `isInWaterAt()` is
   true — there's no distinction between "wading" (shallow) and actually
   swimming (deep water, floating at the surface, different movement feel).
   There's also no swim movement mode — the player's normal walk/run physics
   apply even "underwater".

## Goals

- A dedicated, cheap-to-load **Water Lab** test room, reachable from the
  existing Dev Sandbox UI, containing a single flat pool of the animated
  water plus dry land at different elevations (shallow edge → deep centre)
  so all submersion depths can be tested without needing the overworld.
- Actual **swimmable** behavior: a distinct swim movement mode when the
  player is in deep-enough water (as opposed to just wading in ankle-deep
  water), with:
  - Reduced gravity / buoyancy-like floating at a shallow depth below the
    water surface (not sinking to the floor).
  - Swim-speed movement (slower than run, all 4 directions) instead of
    normal ground movement.
  - Exiting water restores normal gravity/movement immediately.
- No regression to the existing overworld wading visual (ankle-deep water
  still just offsets the rig, as today).
- Keep FPS cost of the lab minimal — no settlements/NPCs/trees, just a
  terrain-less flat pool + a small deep/shallow gradient.

## Non-goals (out of scope for this pass)

- Real buoyancy physics simulation (springs, drag forces) — a fixed "float
  height" approximation is enough per the original Phase 5 design doc.
- Splash particles / ripple decals.
- Underwater camera post-processing (fog tint, caustics) — may be a later
  polish pass once movement feel is validated.
- Diving/breath-meter mechanics.

## Design

### 1. Water Lab room

A new `generateWaterLab(): DungeonPlan` function (mirrors the existing
`generateSandboxArena()` pattern in `src/levels/SandboxArena.ts`), in a new
file `src/levels/WaterLab.ts`:

- A single open blueprint room, no walls except perimeter (matches
  `SandboxArena`'s 14×14 pattern, but wider — 24×24 — to give room for a
  visible depth gradient).
- Reuses the *existing* animated water `ShaderMaterial` factory. Since
  `_makeWaterMaterial()` currently lives as a private method on
  `OverworldScene`, it will be extracted into a small standalone exported
  function in a new `src/world/WaterMaterial.ts` module (pure function,
  no scene dependencies) so both `OverworldScene` and the new lab scene can
  construct identical materials without duplicating shader source. This is
  the one small refactor needed to support the lab — a natural
  extract-shared-function step, not a detour.
- A lightweight `WaterLabScene` class (new file
  `src/scene/WaterLabScene.ts`), modeled loosely on `OverworldScene`'s
  lifecycle (`enter()`/`exit()`/`update()`/`dispose()`) but drastically
  simpler:
  - Flat ground plane (single big `PlaneGeometry`, one material, one draw
    call) at y=0 representing "dry land" on one side.
  - A stepped pool: 3 flat terrain tiers (dry bank y=0 → shallow shelf
    y=-0.3 → deep floor y=-1.2) so the player can walk in and the water
    depth visibly increases towards the pool's centre.
  - One water quad mesh (same winding-fixed geometry approach as the fixed
    `OverworldScene._buildWaterMesh()`) covering the pool area at
    y = 0 (surface), animated via the shared material's `uTime` uniform.
  - Simple flat-plane physics colliders for the tiers (reuses
    `PhysicsWorld` the same way `SandboxArena` does) so the player can
    stand/walk on each tier; the deep floor collider sits below the water
    surface so the player can be "underwater" while still grounded, letting
    the existing capsule-controller logic keep working.
  - A minimal directional+ambient light rig (no skybox, no fog, matching
    the arena's flat `0x0a0a0f` fog if any is even needed) — kept as cheap
    as the existing `sandbox_arena` interior.

### 2. Reaching the lab

Add one new button to the existing Dev Sandbox UI (`src/ui/DevSandbox.ts`),
next to the existing "Return to Arena" / "Enter Overworld" buttons: **"Water
Lab"**. Wired through a new `onEnterWaterLab: () => void` callback in
`DevSandboxOptions`, implemented in `main.ts` alongside the existing
`onReturnToArena` / `onEnterOverworld` handlers — tears down whatever's
currently loaded (dungeon room or overworld) and loads the water lab plan +
scene, exactly mirroring how `onReturnToArena` and `onEnterOverworld` are
implemended today.

### 3. Swim mode (the actual gameplay fix)

Currently: `OverworldScene.update()` computes `isInWaterAt()` (a boolean)
and always calls `setSubmersion(inWater ? 0.4 : 0)`. This will change to a
graded, two-state model:

- **Wading** (existing behavior, unchanged): if the underlying grid cell
  is water/river but the *player is standing on shallow ground* (i.e. their
  physics Y is at or above a "shallow threshold" relative to the water
  surface), keep today's fixed `0.4` visual-only offset — no movement
  changes, matches current shoreline/river-crossing feel.
- **Swimming** (new): if the player's feet are more than a configurable
  `SWIM_DEPTH_THRESHOLD` (world units) below the local water surface Y
  (only reachable in the Water Lab's deep tier for now, since the overworld
  doesn't yet have floor depth variation under its water tiles — this is
  intentionally forward-compatible groundwork), switch the
  `PlayerController` into a swim mode:
  - `setSubmersion(1.0)` (near-full offset, floating look).
  - New `PlayerController.setSwimming(isSwimming: boolean)` method that:
    - Overrides normal gravity with a small constant sink/rise toward a
      "float depth" just below the surface (simple lerp toward target Y,
      not a physics force — consistent with the project's stated
      no-buoyancy-physics scope).
    - Clamps horizontal speed to a new `SWIM_SPEED` constant (slower than
      walk).
    - Disables jump input while swimming (jumping out of water instead
      triggers exit-detection on the next frame once depth is above
      threshold, same as normal ground-transition logic elsewhere in the
      class).
  - Exiting (depth threshold no longer met) calls `setSwimming(false)`,
    restoring normal gravity/movement immediately — matches goal #3.

This keeps the change additive: `isInWaterAt()` and the existing shallow
wading path are untouched, and the new swim path only activates where a
real depth reading crosses the threshold — which today only the Water Lab
provides, deliberately, since the overworld's water doesn't yet encode
floor depth. A future pass can extend `WorldGrid`/`WaterDetection` with a
depth value per water tile to bring real swimmable lakes to the overworld;
that is out of scope here (see Non-goals) but this design's
`setSwimming()` API is written to not need changes when that data becomes
available — only the caller (`OverworldScene.update()` vs
`WaterLabScene.update()`) needs to compute a real depth number and pass it
through.

## Testing

- Unit tests: `PlayerController.setSwimming()` — verify horizontal speed
  clamp, gravity override behavior (position moves toward float target
  over successive `update()` ticks), and that leaving swim mode restores
  normal gravity constants. Follows the existing
  `tests/player/PlayerControllerSubmersion.test.ts` pattern (real
  `PhysicsWorld` + `applyDNA`).
- Unit test for the extracted `WaterMaterial.ts` factory: returns a
  `ShaderMaterial` with a `uTime` uniform (mirrors existing coverage
  style — this project doesn't unit-test shader GLSL correctness, only
  wiring).
- `generateWaterLab()` — unit test mirroring any existing
  `SandboxArena`-style test if one exists (check first; if none exists for
  `SandboxArena` either, this doesn't need one beyond blueprint validation
  already run by `renderBlueprint`).
- Manual/Playwright visual verification: load Water Lab via the same
  `window.__game`-style dev hook pattern used throughout this session,
  screenshot standing on the shallow shelf (wading look) vs the deep floor
  (swim look, floating higher, animated), and confirm swim speed via two
  timestamped position samples.

## Open questions resolved by assumption (autopilot mode, no live user Q&A)

- **Room reachability**: via the existing Dev Sandbox panel (already the
  established "developer test room" entry point in this codebase) rather
  than a brand-new menu — reuses proven UI/plumbing, lowest risk.
- **Depth-based swim trigger threshold**: a fixed constant tuned by feel
  during implementation (no design doc dependency on exact numbers; will
  pick a value that reads clearly as "chest-deep vs standing" in the lab's
  3-tier pool and document the chosen constant in code comments).
