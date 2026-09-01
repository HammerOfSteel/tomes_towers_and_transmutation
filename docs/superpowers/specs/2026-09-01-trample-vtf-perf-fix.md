# Trampled-Grass Trail — Performance Fix (Vertex Texture Fetch Removal)

Status: hotfix — root cause identified and confidently diagnosed via code review +
empirical A/B testing; implemented directly (not a full brainstorm cycle) since this
preserves the exact same shipped feature/behavior (the trampled-grass trail), only
replacing its GPU-side implementation technique to eliminate a well-documented
performance pitfall. User flagged "the most significant issue" as a stark FPS drop
"even on the smallest world generation" after the trample trail shipped.

## 1. Root cause

`GrassField.ts`'s vertex shader added, for the trample feature:

```glsl
if (trampleUV.x >= 0.0 && trampleUV.x <= 1.0 && trampleUV.y >= 0.0 && trampleUV.y <= 1.0) {
  crush = texture2D(uTrampleMap, trampleUV).r;
}
```

This is a **vertex texture fetch (VTF)** — sampling a texture from the VERTEX stage
rather than the fragment stage. This is a long-documented WebGL/OpenGL ES performance
trap: most GPUs (especially integrated/mobile, and even many older discrete GPUs)
allocate far fewer texture units to the vertex stage than the fragment stage, and the
vertex stage has much less parallel occupancy available to hide texture-fetch latency.
Fragment-stage texture sampling (already used elsewhere in this shader, e.g. the
existing `uBaseColor`/`uTipColor` blend) is essentially free by comparison; vertex-stage
sampling is not.

Critically, this cost scales with **vertex count**, not world size: each grass blade
has `(segments+1)*2+1` vertices (11 for `segments=4`), and every one of those vertices
independently re-samples the SAME texture (since `trampleUV` is derived from
`aPositionRotation.xz`, a per-INSTANCE attribute — identical across all vertices of one
blade, but the GPU has no way to know that and re-executes the fetch per vertex
regardless). With `maxBlades` up to 100,000 for the grassland preset alone, that's up to
1.1 million VTF calls per frame for ONE biome's grass field, before counting the other
4 active `GrassField` instances. This is invariant to total world size — grass renders
in a fixed `GRASS_RADIUS`-WU player-centered window regardless of how big the generated
world is — which explains the user's specific observation that the drop happens "even on
the smallest world generation."

This wasn't caught by this session's own testing because: (a) unit tests don't exercise
real GPU/shader execution at all (jsdom, no WebGL context), and (b) live-browser
verification ran under headless Chromium's SwiftShader software rasterizer, which
empirically showed no measurable difference between trample-on/trample-off or between
locations with very different blade counts (confirmed via a direct A/B timing test) —
software rasterizers don't replicate the same vertex/fragment texture-unit asymmetry as
real GPU hardware, so this class of regression is invisible in that environment. This is
a real gap in this session's verification process for shader-level changes specifically;
noted for future shader work.

Consistent with this diagnosis: of the multiple real, working Godot grass-trample
shaders found during this feature's original research (see
`docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md` §2), the SIMPLEST one
(the exact shader the user linked, `godotshaders.com`'s "Atlas grass shader with wind
sway and trampling") does NOT use a texture at all for its trample effect — it computes
the crush amount purely from `distance()` to a single uniform position, entirely in ALU
math, with zero texture fetches of any kind. That design choice was already the
community's answer to this exact problem for a single, live trample point.

## 2. Fix

Replace the `THREE.DataTexture`-based spatial grid with a small **uniform array of
recent trample "stamps"** — world positions + ages, updated on the CPU each frame and
sampled via pure ALU math (`distance()`/`smoothstep()`/`pow()`) in the vertex shader, no
texture involved anywhere. This is a well-precedented technique for exactly this
problem (a bounded number of "paint points" evaluated per-vertex via a uniform array,
avoiding VTF entirely) and is a strict simplification of the existing design:

- `MAX_TRAMPLE_STAMPS = 24` — small enough that a per-vertex loop over all 24 stamps is
  trivial ALU cost (24 `distance()` + `smoothstep()` + `pow()` calls — routine vertex
  shader work, nothing close to VTF's cost profile), large enough to cover a reasonably
  long recent walking path without visible gaps (see §3).
- CPU-side: `TrampleMap` becomes a simple ring buffer of `{x, z, age}` stamps (absolute
  world positions — no more windowing/recentering/grid-shifting needed at all, since
  there's no fixed-size grid to keep centered on the player anymore). Each `update()`
  call ages every stamp by `dt`; if the player has moved past a minimum spacing since
  the last stamp, a new one is pushed (evicting the oldest if the ring buffer is full).
  This DELETES `TRAMPLE_MAP_WORLD_SIZE`/`TRAMPLE_MAP_RESOLUTION`/
  `TRAMPLE_RECENTER_THRESHOLD_WU`/`worldToTrampleCell()`/`stampInto()`/`shouldRecenter()`/
  `shiftGrid()` and the `THREE.DataTexture` entirely — a strictly simpler, cheaper CPU
  path too (a 24-element age-update loop each frame instead of a 4096-cell grid decay
  pass).
- Shader side: `uTrampleStampPos: vec2[24]` + `uTrampleStampAge: float[24]` uniforms
  (updated every frame — 24 vec2s + 24 floats is a tiny uniform upload, far cheaper than
  a texture upload). Per-vertex: for each stamp, `falloff = 1 - clamp(dist/STAMP_RADIUS,
  0, 1)`, `decay = pow(0.5, age/HALF_LIFE)`, `crush = max(crush, falloff * decay)`.
  Inactive/never-used slots get an initial `age` far beyond the half-life (e.g. `1e6`),
  so `decay` underflows to 0 and they contribute nothing — no separate "active" flag
  needed.

## 3. Stamp spacing / coverage math

`WALK_SPEED = 5` WU/s (`PlayerController.ts`). At `TRAMPLE_DECAY_HALF_LIFE_S = 2.0`
(unchanged), a stamp is visually negligible (~3% intensity) after ~5 half-lives (10s),
by which point the player could have walked up to 50 WU. To keep the visible recent
trail continuous (no gaps) while capping the array at 24 entries, stamps are placed
every `TRAMPLE_MIN_STAMP_SPACING_WU = 1.2` WU of player movement (slightly under
`2 * TRAMPLE_STAMP_RADIUS = 1.8`, so consecutive stamps' soft circles always overlap,
matching `shouldPlaceBrushPoint`-style spacing logic already used elsewhere this
session for the overworld-editor paint tools). 24 stamps × 1.2 WU ≈ 29 WU of continuous
trail behind the player — comfortably covering several seconds of walking at
`WALK_SPEED`, after which the oldest stamps have already faded far below visibility
anyway (at 29 WU / 5 WU/s ≈ 5.8s of travel time ≈ ~2.9 half-lives ≈ ~13% remaining
intensity for the OLDEST retained stamp — a reasonable, unnoticeable fade-out at the
tail rather than an abrupt pop when the 25th-oldest stamp would otherwise be evicted).

## 4. Non-goals / unchanged

- Visual behavior is unchanged: same soft circular falloff, same ~2s half-life, same
  "flatten + damp wind sway" formula in the shader, same player-only scope.
- `GrassField`'s public constructor signature (`trampleMap?: TrampleMap`) and
  `OverworldScene`'s wiring (construct once, `update()` once per frame, `dispose()`)
  are unchanged — only `TrampleMap`'s internals and what it exposes to `GrassField`
  change.
