# Trampled-Grass Trail Design Spec

Status: approved autonomously (user requested this feature, was present for initial
scoping — confirmed player-only scope via `ask_user` — then unavailable for the
detailed design; standing authorization to proceed with documented rationale, per this
session's established precedent). User should review this spec when available.

## 1. Problem / Motivation

The user asked for the grass (just shipped in `src/world/GrassField.ts`) to visibly react
to the player walking through it — not just a cosmetic shader, but something that "leaves a
little faint trail behind of stepped-on grass," citing prior art from Godot games.

## 2. Research (real prior art, not reinvented)

Before designing, I looked for concrete, shipped implementations of this exact effect in
Godot rather than inventing a new technique. Found two real families:

1. **Instant proximity-only bend** — [godotshaders.com's "Atlas grass shader with wind sway
   and trampling"](https://godotshaders.com/shader/grass-shader-with-atlas-texture-wind-sway-trampling-effect/)
   (also mirrored verbatim in the public `TheChuan1503/machine-party` GitHub repo), and the
   open-source `2Retr0/GodotGrass` repo. Both compute a distance from the player/camera to
   each blade every frame and flatten the blade (`VERTEX.y *= someDistanceBasedFactor`) and
   reduce/zero its wind sway when close. **No persistence** — a blade springs back the
   instant the player is no longer nearby. This is what the linked
   `p54XKUrAvBg` YouTube tutorial ("3D Interactive Grass... Godot 4.3") also demonstrates,
   per its title.
2. **Persistent decaying "trample map"** — found in two other real Godot projects
   (`lite_terrain`'s `trample_map` sampler, explicitly commented "fed by grass.gd through a
   SubViewport"; and `pear-pudding-godot`'s `grass_blades.gdshader`, which documents a
   "Persistent trample map (sliding window centred near the player)"). A small render-texture
   accumulates footprint stamps and decays over several seconds; the grass shader samples it
   to flatten recently-walked blades, with the SAME `VERTEX.y *= (1 - crushAmount)` flattening
   formula as family 1, just driven by a decaying stored value instead of instantaneous
   distance. One of these files literally comments: *"Pushed-aside blades also lie down, so
   the trail reads as trampled rather than as grass leaning outwards at full height."*

The user's explicit ask ("leaves a trail behind," not just "reacts to standing on it") maps
to family 2. This spec adapts family 2's technique, keeping the same core flattening formula
validated by two independent real implementations, but replaces the GPU render-target/
SubViewport mechanism with a CPU-side equivalent (see §3 for why).

## 3. Why not a literal GPU render-target

The Godot examples render into their trample texture via a `SubViewport` + orthographic
`Camera3D` — a real extra GPU render pass every frame. This project's automated tests run
under `vitest` with `environment: 'jsdom'` (confirmed via `vitest.config.ts`) — there is no
real WebGL context available, and no existing test anywhere in this codebase constructs a
`THREE.WebGLRenderer` (confirmed via search — only browser entry-point files like `main.ts`
do). `OverworldScene` also does not currently hold a renderer reference at all.

Building a literal render-to-texture pass would (a) require threading a
`THREE.WebGLRenderer` into `OverworldScene` for the first time, and (b) be completely
unexercisable by the automated test suite — every bit of its logic (decay timing, stamp
placement, recentering) would only ever be checked manually. Given this feature's tunables
(decay rate, stamp radius, recenter threshold) are exactly the kind of thing worth unit
testing precisely, this spec instead does the accumulation on the CPU in a plain
`Float32Array` grid, and feeds the *result* to the GPU via a `THREE.DataTexture` — mutate the
backing array, set `.needsUpdate = true`, and let the next ordinary frame's
`renderer.render(scene, camera)` pick up the change automatically. This is the exact same
"mutate a typed array + dirty flag" pattern `GrassField` already uses for its own instanced
attribute buffers (`_positionRotation`/`_scaleAndVariation`), so it fits this codebase's
established conventions and needs zero renderer plumbing.

## 4. Design

### 4.1 Pure logic (fully unit-tested, no THREE/WebGL dependency)

New file `src/world/GrassTrample.ts` exports:

- `TRAMPLE_MAP_WORLD_SIZE = 48` — world units per side of the tracked square window.
  Matches the grass system's own full placement-window width (`2 * GRASS_RADIUS`), so the
  trample grid always covers everywhere grass can actually be rendered.
- `TRAMPLE_MAP_RESOLUTION = 64` — cells per side (→ 0.75 WU/cell). Fine enough for a
  ~0.9 WU-radius soft stamp to read as a smooth blob, coarse enough that a full-grid decay
  pass (4096 cells) is trivially cheap every frame.
- `TRAMPLE_STAMP_RADIUS = 0.9` — world units, soft-edged falloff.
- `TRAMPLE_DECAY_HALF_LIFE_S = 2.0` — seconds. A footprint is ~12.5% intensity after 3
  half-lives (~6s) — reads as a "little faint trail," not a lasting scar, per the user's own
  phrasing.
- `TRAMPLE_RECENTER_THRESHOLD_WU = 12` — recenter the tracked window once the player has
  moved this far from the window's current center.
- `decayFactor(dt: number, halfLifeS: number): number` — the multiplicative factor to apply
  to every cell this frame (`Math.pow(0.5, dt / halfLifeS)`).
- `worldToTrampleCell(worldX, worldZ, centerX, centerZ, worldSize, resolution): {col, row} | null`
  — maps a world position into the grid's cell space; `null` if outside the current window.
- `stampInto(grid: Float32Array, resolution: number, cellWorldSize: number, centerCol: number, centerRow: number, stampRadiusWU: number): void`
  — writes a soft radial blob via `Math.max(existing, newValue)` (clamped to 1) so overlapping
  footsteps don't runaway-accumulate past full intensity.
- `shouldRecenter(dx: number, dz: number, threshold: number): boolean` — pure distance gate
  (mirrors this session's own `shouldPlaceBrushPoint` pattern from the editor paint-mode work).
- `shiftGrid(grid: Float32Array, resolution: number, shiftCols: number, shiftRows: number): Float32Array`
  — returns a new grid with the old content copied at the shifted offset (revealed edges start
  at 0), used when recentering so already-decaying trail data isn't discarded outright.

### 4.2 `TrampleMap` class (thin THREE.js wrapper, manually verified)

Also in `GrassTrample.ts`:

- Owns the "true" `Float32Array` grid (0..1 per cell) and a `Uint8Array`-backed
  `THREE.DataTexture` (`RGBAFormat`/`UnsignedByteType` — the most universally-supported format,
  avoiding any float-texture extension risk for what's a minor visual-polish feature; the
  trample value is written into the `.r` channel, sampled as `.r` in the shader).
- `update(playerX: number, playerZ: number, dt: number): void` — called once per frame from
  `OverworldScene`: decays the grid, recenters (shifting data) if the player has wandered far
  enough, stamps the player's current position, converts the float grid to the texture's
  backing `Uint8Array`, and flags `.needsUpdate = true`.
- `getCenter(): { x: number, z: number }`, `readonly texture: THREE.DataTexture`,
  `readonly worldSize = TRAMPLE_MAP_WORLD_SIZE`, `dispose(): void`.

### 4.3 Grass shader integration

`OverworldScene` owns exactly ONE shared `TrampleMap` (not one per biome — the player walks
across biome boundaries and the trail must read continuously). `GrassField`'s constructor
gains an **optional** 4th parameter `trampleMap?: TrampleMap` (defaults to `undefined` so the
existing 3-arg test call sites in `GrassField.test.ts` keep working unchanged — when absent,
the material's trample sampler is wired to a tiny always-black 1×1 fallback texture, i.e. a
harmless no-op).

In the vertex shader: sample the trample map ONCE per blade using the blade's planted root
position (`aPositionRotation.xyz` — NOT the wind-swayed per-vertex position, so a blade
doesn't visually "un-flatten" partway up itself from wind jitter), with an explicit bounds
check (in case the blade sits outside the current trample window):

```glsl
uniform sampler2D uTrampleMap;
uniform vec2      uTrampleCenter;
uniform float     uTrampleWorldSize;
...
vec2 trampleUV = (aPositionRotation.xz - uTrampleCenter) / uTrampleWorldSize + 0.5;
float crush = 0.0;
if (trampleUV.x >= 0.0 && trampleUV.x <= 1.0 && trampleUV.y >= 0.0 && trampleUV.y <= 1.0) {
  crush = texture2D(uTrampleMap, trampleUV).r;
}
```

Then, after the existing tilt/rotation math produces `rotated` (the blade's local offset from
its root, before adding `aPositionRotation.xyz`):

```glsl
rotated.y *= (1.0 - crush); // flatten toward the ground — verified pattern, see §2
```

And the existing wind offset is scaled down proportionally so a flattened blade doesn't sway:

```glsl
vec2 windOffsetXZ = computeWind(worldPos, heightFactor) * (1.0 - crush);
```

### 4.4 `OverworldScene` wiring

- One `TrampleMap` field, constructed alongside the 5 `GrassField`s.
- `update()` (already called every frame with the player's position) calls
  `this._trampleMap.update(pos.x, pos.z, dt)` once, and each `GrassField.update()` call (which
  already runs every frame) additionally refreshes its material's `uTrampleCenter` uniform from
  `this._trampleMap.getCenter()` — mirroring exactly how `uFadeCenter` is already refreshed
  every call today.
- `dispose()` disposes the shared `TrampleMap`.

## 5. Testing

- Unit tests for every pure function in §4.1: `decayFactor` (half-life math, `dt=halfLife`
  gives exactly 0.5), `worldToTrampleCell` (in/out of bounds, exact center), `stampInto`
  (center cell reaches ~1.0, falls off with distance, `Math.max` never exceeds 1 across
  overlapping stamps), `shouldRecenter` (boundary at exactly the threshold), `shiftGrid`
  (content moves to the expected offset, revealed cells are 0, a full-grid-sized shift zeros
  everything).
- `TrampleMap` class: light construction/no-throw smoke tests only (matches
  `AmbientCreature`'s testing split) — actually verifying the shader-visible flattening
  requires a real browser, done manually (teleport into grass, walk through it, screenshot
  before/during/after to confirm blades flatten then spring back over a few seconds, and that
  wind sway is visibly reduced on trampled blades).
- Re-run the existing `GrassField.test.ts`/`OverworldScene` regression suites to confirm the
  optional 4th constructor param and new uniforms don't break anything already passing.

## 6. Non-goals (explicitly deferred)

- Ambient wildlife / enemies leaving trails (scoped to player-only for v1 per this session's
  `ask_user` answer — can extend `TrampleMap.update()` to accept multiple positions later if
  it looks good).
- Sideways "push-aside" bending (one reference implementation does this in addition to
  flattening) — skipped for v1 to keep the trample data 1-channel (intensity only, no stored
  push direction) and the formula simpler; pure vertical flatten already reads as "trampled"
  per the cited reference's own description.
- Any change to `ChunkManager.ts`, terrain, or non-grass scatter.
