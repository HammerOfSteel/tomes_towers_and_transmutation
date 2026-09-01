# Grass Biome-Boundary Blending Design Spec

Status: approved autonomously (user gave direct feedback requesting this, then said
"work autonomously and make good decisions" when asked to pick a blending-scope option
— chose the recommended option: blend color AND fade density across a transition band
at every biome boundary). User should review this spec when available.

## 1. Problem

User feedback (with screenshot) after the grass-height/trample work shipped:

> "the very stark difference in light color of the grass between biomes... doesn't
> look very coherent and its also odd that it just stops growing so directly on the
> edges of a biome like this in the screenshot which doesnt fit with the transition
> between bioems we are going for."

Investigated via `debugCellAt()` sampling across the screenshot's visible boundary:
confirmed the orange ground next to the green grassland patch is `beach` biome, with a
thin `savanna` strip sandwiched directly between them (only ~2 WU wide at the sampled
line). So the underlying biome map is already using the organic, noise-warped boundaries
from the existing `_domainWarp()` system (`RealmGenerator.ts`) — the boundaries
themselves aren't blocky/grid-aligned. The problem is specifically that **grass
placement and color are a hard, binary per-cell decision** (`cell.biome === presetBiome`
→ full density, full preset color; anything else → nothing), so crossing from one
grass-bearing biome into an adjacent one (e.g. lush green `grassland` into dry yellow
`savanna`) reads as an abrupt wall instead of a gradient — exactly what "biome
transitions" are supposed to avoid.

## 2. Approach

Add a small, cheap **edge-proximity signal** computed once per grass placement
candidate (during `selectGrassPlacements()`, which already looks up one `WorldGrid`
cell per candidate — `WorldGrid.get()` is an O(1) typed-array-backed lookup, so a
handful of extra neighbor lookups per already-matched candidate is cheap and, crucially,
this only runs when `GrassField` rebuilds its instance buffer — gated by
`REBUILD_HYSTERESIS = 8` WU of player movement, not every frame, unlike the vertex-
shader work fixed in the same session's VTF perf fix).

**`computeEdgeBlend(wg, x, z, biome, bandWidthWU)`**: samples 8 neighbor points around
`(x, z)` at `bandWidthWU` distance (N/S/E/W/NE/NW/SE/SW), counts how many resolve to a
DIFFERENT biome than `biome` (out-of-grid-bounds samples are skipped, not counted, so
the map's outer edge never falsely reads as a "biome transition"), and returns
`differentCount / 8` — a 0 (fully interior, all 8 neighbors match) to 1 (surrounded by
other biomes, e.g. a thin sliver or a corner) signal. `bandWidthWU = 2.5` (~1 tile) —
modest, so only the outermost ring of each biome's footprint is affected; most of a
biome's interior stays fully saturated.

This single 0..1 `edgeBlend` value drives BOTH requested effects:

1. **Density fade** ("stops growing so directly"): in `selectGrassPlacements()`, a
   candidate with `edgeBlend > 0` is kept only with probability `1 - edgeBlend * 0.85`
   (never fully to 0 — a thin residual chance keeps a few sparse blades right at the
   seam rather than a perfectly clean second cutoff line, which would just move the
   "stark edge" problem inward by 2.5 WU instead of solving it). This uses the
   placement function's own already-seeded `rand()` — fully deterministic per seed,
   consistent with every other placement decision in this codebase.

2. **Color blend** ("stark difference... doesn't look coherent"): every `GrassPreset`
   already defines a `dryColor`/`dryAmount` pair used by the existing fragment shader to
   tint blades toward a dry/stressed look — and **`dryColor` is already the identical
   hex value (`0xc4a84b`) across all 5 presets** (a pre-existing, apparently
   deliberate convention). Passing `edgeBlend` as a new per-instance attribute and using
   `effectiveDryAmount = max(uDryAmount, aEdgeBlend)` in the existing color-mix formula
   means blades from BOTH sides of any boundary trend toward that SAME shared warm tone
   as they approach the seam — grassland's green and savanna's yellow both soften
   toward the same in-between color right at their shared edge, without the shader ever
   needing to know which *specific* neighboring biome/preset is on the other side. This
   reuses 100% of the existing dry-tint mixing code — only the value fed into it
   changes from a flat per-material uniform to `max(uniform, per-instance)`.

## 3. Why not exact cross-biome color matching

A more "precise" version would look up the SPECIFIC neighboring biome and blend exactly
toward ITS preset's exact base/tip colors. Rejected for this pass: it requires baking a
second, variable target color per instance (2 more vec3/vec4 attributes, doubling the
per-instance data most blades never even use, since only edge blades need it), needs a
biome→preset lookup table covering every possible neighbor (including non-grass
biomes, which have no preset to blend toward at all — beach/desert/mountain/ocean would
need a separate fallback anyway), and is a much larger change for a marginal visual
improvement over the shared-dry-tint approach, which already directly targets the exact
symptom described (colors "not coherent") using infrastructure that already exists.
Flagged as a possible future refinement, not built now.

## 4. Data flow / signature changes

- `computeEdgeBlend()`: new pure function in `GrassField.ts` (small enough to keep
  alongside `selectGrassPlacements()`, its only caller — no new file needed).
- `selectGrassPlacements()`: computes `edgeBlend` per kept candidate (after the
  existing biome/`isScatterAllowed` checks, before pushing the placement), applies the
  density-fade probability check, and adds `edgeBlend: number` to the returned
  `GrassPlacement` object.
- `packGrassInstanceBuffers()`: gains a third output array (or extends
  `scaleAndVariation`'s packing) — **adds a new instance attribute
  `aEdgeBlend: Float32Array` (1 component per blade)** rather than repurposing an
  existing `aScaleVariation` channel (all 4 of `scaleX/scaleY/tilt/colorVar` are already
  used for unrelated per-blade variety and shouldn't be sacrificed).
- `createGrassBladeGeometry()`/`GrassField` constructor: registers the new
  `aEdgeBlend` `THREE.InstancedBufferAttribute` alongside the existing two.
- Fragment shader: `uDryAmount` mixing becomes `max(uDryAmount, vEdgeBlend)` (a new
  varying, passed through from the vertex shader's `aEdgeBlend` attribute — no new
  uniform, no texture, no VTF risk of any kind, consistent with the same session's just-
  shipped perf fix).

## 5. Testing

- Unit tests for `computeEdgeBlend()`: fully interior (all 8 neighbors match → 0),
  fully surrounded by a different biome (→ 1), a mix (partial count → expected
  fraction), out-of-bounds neighbors correctly skipped/not counted (test near a grid
  edge), deterministic for fixed inputs.
- `selectGrassPlacements()`: extend existing tests to confirm interior placements
  (far from any boundary) are unaffected (same behavior as before this change), and add
  a new test asserting boundary-adjacent placements are thinned (fewer kept than an
  identical all-one-biome control window with no neighbors of a different biome).
- `packGrassInstanceBuffers()`: extend existing tests to assert the new `aEdgeBlend`
  array has the same length as placements and carries each placement's `edgeBlend`
  value through unchanged.
- Manual visual verification (screenshot before/after at a real grassland/savanna
  boundary) — same established pattern as every other shader-visible change this
  session, since jsdom/vitest cannot render real GLSL.

## 6. Non-goals

- Exact per-neighbor-biome color targeting (§3).
- Blending applied to non-grass biome edges beyond the density fade (e.g. no attempt to
  make beach/desert "grow" fake transitional grass — those biomes simply have no
  preset and are correctly never touched by this system at all, unchanged).
- Any change to the underlying `classifyBiome()`/`_domainWarp()` terrain-biome
  assignment itself — this only changes how GRASS reacts to boundaries that already
  exist, not where those boundaries are drawn.
