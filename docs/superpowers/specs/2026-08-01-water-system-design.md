# Water System — Design (Phase 5)

**Branch:** `cline_work-04_overworld_feel`
**Depends on:** phases 1-4 (all done, pushed at `946819c`).

## Problem

`OverworldScene._buildWaterMesh()` currently emits one flat, static, semi-transparent quad per
river/water tile (`MeshLambertMaterial`, fixed color `0x3a6aaa`, `opacity 0.78`). It doesn't move,
has no shoreline treatment, and the player walks across it exactly like dry ground — no visual or
gameplay acknowledgement of being in water. User wants a Zelda: Link's Awakening (Switch remake)
quality look — bright, gently animated, slightly stylized water — plus Mario 64-style partial/full
player submersion when standing in it.

## Constraints (carried over from project conventions)

- Zero external texture/model assets — everything procedural (materials, shaders, canvas textures).
- Must stay inside the existing `THREE.Mesh` + `BufferGeometry` merged-batch pattern already used
  for water (one draw call for all water tiles) for performance; no per-tile mesh explosion.
- Must not break the existing `enter()/exit()/dispose()` lifecycle wiring already in place for
  `_waterMesh` (add/remove/dispose calls at lines ~284, 328, 345, 408-410).
- No physics/buoyancy simulation — this is a visual + simple state-flag feature, not a fluid sim.

## Design

### 1. Animated water shader (replaces flat `MeshLambertMaterial`)

Replace the material with a custom `THREE.ShaderMaterial`:
- Vertex shader: small per-vertex sinusoidal Y-displacement driven by a `uTime` uniform and each
  vertex's world X/Z (two overlapping sine waves at different frequencies/directions to avoid an
  obviously uniform ripple — mimics gentle wind-driven water).
- Fragment shader: two-tone color blend (deeper base blue-teal + lighter "foam/highlight" blue)
  driven by a scrolling procedural noise pattern (cheap analytic sine/fract-based pseudo-noise, no
  texture lookups) for a stylized "shimmer" look, plus a fixed rim-brightening term biased by
  `dot(normal, viewDir)` (cheap fresnel-ish highlight) to catch edges/reflections like the Zelda
  remake's toony water.
- Keep `transparent: true`, `depthWrite: false` (existing z-fighting mitigation) and add
  `side: THREE.DoubleSide` is NOT needed (water is always viewed from above).
- Update the material's `uTime` uniform once per frame from `OverworldScene.update(dt)`.

### 2. Player submersion feel

- Add a per-frame water-depth check in `OverworldScene.update()`: sample the world cell under the
  player's position (`this._wg.worldToGrid` — already used elsewhere in this file for river-edge
  detection) each frame; if `cell.feature === 'river' || cell.biome === 'water'`, the player is
  "in water".
- Depth tiers (kept simple, no elevation-based depth model needed): always treat any water tile as
  one uniform "wading" depth for now (a future phase could vary by tile elevation deltas) —
  submerge the player's visual rig vertically by a fixed offset so ~40% of the character capsule
  sinks below the animated water plane's mean Y (mirrors "half-submerged" Zelda/Mario 64 wading,
  the modest scope explicitly agreed as sufficient — full swim locomotion/state machine is out of
  scope for this phase, matching the decomposition doc's "without requiring a full buoyancy-physics
  simulation" scope note).
- Implementation: expose a new `setSubmersion(depthFraction: number)` method on `PlayerController`
  that shifts the visual rig group (`_creatureRig.root` / princess `root` / GLB `scene`, whichever
  is active) down by `depthFraction * (CAPSULE_HALF_HEIGHT*2)` on top of its existing foot-offset
  math, without touching `this.group.position` (which stays the authoritative physics/gameplay
  position — only the child visual is offset, exactly like the existing squash/stretch pattern
  already used on `bodyMesh`). Reset to 0 offset when leaving water.
- `OverworldScene.update()` calls `this.player.setSubmersion(inWater ? 0.4 : 0)` each frame (a cheap
  binary/instant "in or out" rather than gradual interpolation, keeping this phase's scope small —
  interpolated depth easing could be added later without API changes since the setter already takes
  a fraction).

### 3. Testing approach

- Pure/testable unit: extract the water-tile detection into a small pure helper (mirrors the
  `nearRiverDir` inline logic already in this file) — `isInWaterAt(wg, x, z): boolean` — so it can
  be unit tested without a full `OverworldScene`/WebGL context.
- `PlayerController.setSubmersion()` is a plain numeric field + group Y-offset mutation — testable
  by constructing a controller in the existing test harness (mirrors other `PlayerController` unit
  tests already in the repo) and asserting the visual child's local Y position changes.
- Shader code itself is not unit-testable (GLSL) — verified via live Playwright screenshot at a
  known river tile, same pattern used for lamp verification in Phase 4.

## Out of scope

- Buoyancy physics, swim locomotion/move-speed changes, splash particles, underwater camera/fog
  effects, variable water depth by elevation, waterfalls/rivers-as-flow-direction visuals. These are
  natural follow-ups but were not requested and would meaningfully grow this phase's scope.
