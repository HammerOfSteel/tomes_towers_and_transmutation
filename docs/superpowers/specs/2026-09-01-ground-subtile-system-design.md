# Design: Ground Sub-Tile System — Height Bumps + Micro-Variant Patches

Status: approved for implementation
Roadmap: `docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md` (extends Phase 4a's
ground-texture-variety work; supersedes that pass's "texture-only, no new geometry" scope
decision at the user's explicit request, now that FPS is not a blocking concern)

## 1. Problem statement / why go further than texture-only

Phase 4a shipped real per-biome textures via world-space-projected UV with zero new geometry.
That was deliberately conservative on performance. Revisiting with the constraint lifted:
**subdividing a already-planar tile into more triangles provides zero additional texture
variety by itself** — GPU texture sampling already interpolates the same continuous
world-space-UV texture identically per-fragment regardless of triangle count. For literal
sub-tile *geometry* to earn its cost, it must do one of two genuinely new things that texture
sampling alone cannot: (a) vary actual surface **height** per sub-tile (a real bump, not just a
texture that looks bumpy), or (b) let **different sub-tiles use different materials** (a
discrete texture swap, not a blend). This design does both, confirmed with the user before
writing this spec.

## 2. Scope boundary: flat/edge tiles only, ramp shapes unchanged

`swY`/`nwY`/`neY`/`seY` (the tile's 4 corner heights, already computed identically for every
shape by the existing ramp-classification code) make **flat** and **edge** shapes exactly planar
today — bilinear interpolation of these 4 values is mathematically exact for them, zero
approximation risk. The rare non-planar ramp shapes (single-corner/outer-corner/saddle, ~6% of
tiles per Phase 2's own measured frequency) use TerrainKit's explicit 2-triangle diagonal-split
geometry — genuinely non-planar, and bilinear-interpolating them would be an *approximation*,
not exact.

**Decision (confirmed with user):** this pass's sub-tile/bump/micro-patch treatment applies only
to flat and edge shapes. Ramp shapes keep their exact current (post-Phase-4a) behavior
unchanged — still texture-routed into `groundGeometry[variant]`, still a single 2-triangle
non-planar surface, no subdivision/bump/micro-patch. This keeps 100% of this pass's new code
additive rather than modifying Phase 2's already-shipped ramp system. Water/uncovered-biome
tiles (ocean, river, lake, ford, any future uncovered biome) are similarly untouched — they stay
on the plain single-quad, untextured base-buffer path exactly as today; only tiles with a real
`_groundTextureVariant()` (the same check Phase 4a already uses) get the new treatment.

## 3. Architecture

### 3.1 Sub-tile grid

Each eligible tile (flat/edge shape + covered biome) subdivides into a 4×4 grid of sub-tiles —
same `N=4` convention roads already established (`RoadPathSampler.ts`'s `roadSubdivisions`
default), for consistency rather than introducing a new magic number. Each sub-tile is one quad
(2 triangles via the existing `addGroundFace()` 4-vertex path).

### 3.2 Height: bilinear interpolation + seamless bump jitter

For sub-tile grid position `(sx, sz)` within `[0, 4)`, its 4 corners sit at fractional tile-local
positions `u ∈ {sx/4, (sx+1)/4}`, `w ∈ {sz/4, (sz+1)/4}`. Height at any `(u, w)`:

```
bilinearY(u, w) = swY*(1-u)*(1-w) + seY*u*(1-w) + nwY*(1-u)*w + neY*u*w
```

(Identical formula already used for road sub-tile jitter interpolation in
`TerrainGeometryBuilder.ts` — just fed the tile's real ramp corner heights instead of the small
±0.03 WU jitter values, and exact for flat/edge shapes since those are already planar.)

On top of this, a new **seamless per-lattice-point bump** — a small height offset that depends
only on the sub-tile corner's absolute world lattice position, so two tiles sharing a sub-lattice
point (adjacent tiles' shared edge, or adjacent sub-tiles within one tile) always compute the
identical value there and never show a seam:

```ts
const SUBTILE_BUMP_MAX = 0.06; // WU — small enough to read as surface roughness, not a step

function subTileBumpJitter(latticeX: number, latticeZ: number): number {
  // Same bit-mixing hash technique as cornerHeightJitter(), but keyed by
  // fractional sub-lattice coordinates (scaled to integers first, same
  // convention as NatureAssetDNA.ts's hashIndex()) instead of whole-tile
  // integer corners — this is what gives finer-than-tile-corner
  // resolution while staying exactly deterministic/seamless.
}
```

Final sub-tile corner height = `bilinearY(u, w)` (using the tile's raw `swY`/`nwY`/`neY`/`seY`,
**not** the old jitter-added `swY + jSW` style values) `+ subTileBumpJitter(worldX, worldZ)`,
evaluated uniformly across the whole `(N+1)×(N+1)` sub-lattice **including the tile's own 4 real
corners**. Since `subTileBumpJitter()` is a pure function of absolute world position (same
technique as `cornerHeightJitter()`), any two quads that reference the same world lattice point
— whether adjacent sub-tiles within one tile, or adjacent tiles sharing a real corner — always
compute the identical value there, so this stays seamless everywhere without needing a special
case at tile boundaries.

**This replaces (does not layer with) the old per-tile-corner `cornerHeightJitter()` call for
tiles that get sub-tile treatment** — the new bump operates at strictly finer resolution (25
lattice points per tile vs. 4 shared corners) and serves the exact same "seamless small height
variation" purpose, so keeping both would just be two independent random offsets compounding for
no added expressiveness. Tiles that don't get sub-tile treatment (ramp shapes, water/uncovered
biomes) keep using `cornerHeightJitter()` exactly as before — this pass touches nothing about
how those tiles compute height.

**Collider inclusion:** since `groundGeometry`'s buffers already feed directly into the physics
collider merge (Phase 4a's Task 4), baking the bump directly into these same position values
means the collider automatically gets the bump too, for free — no separate collider-specific
code, consistent with this project's established "collider and visual mesh share one buffer"
principle. `SUBTILE_BUMP_MAX = 0.06` WU is double the existing per-tile corner jitter's
already-proven-unobtrusive `CORNER_JITTER_MAX = 0.03` WU — large enough to read as visible
surface roughness, while still far smaller than a real elevation step (`SH ≈ 0.55` WU per level),
so it should not cause noticeable movement jankiness. Tunable during implementation if
playtesting says otherwise.

**Walls are unaffected.** Wall-anchoring logic (Phase 2 Task 5) keeps comparing against the
tile's original `swY`/`nwY`/`neY`/`seY` (pre-bump) — bump is a pure surface-detail addition that
never changes whether a wall is needed or how tall it is.

### 3.3 Per-sub-tile variant selection: border dithering + micro-patches

Each sub-tile independently resolves which texture variant to render with, in priority order:

1. **Border dithering.** For each of the tile's 4 orthogonal neighbors whose
   `_groundTextureVariant()` differs from this tile's own, compute a pull toward that neighbor's
   variant for sub-tiles near the shared edge: pull probability ramps from 0 at the tile's center
   sub-row/column to a chosen max (~45%) at the sub-row/column immediately touching that edge.
   Checked independently per direction in a fixed order (S, N, E, W) — the first direction whose
   deterministic per-sub-tile hash roll succeeds wins; this is a reasoned simplification for
   corner cases (diagonal biome intersections) that still produces a natural, organically
   stippled transition rather than a hard tile-edge cut, without needing true multi-texture
   blending.
2. **Micro-patch swap.** If no border pull won, roll a small fixed probability (~6%) per
   sub-tile (deterministic hash, not literal randomness) to swap to a "micro-patch" variant if
   the tile's own biome has one mapped:

   ```ts
   const MICRO_PATCH_VARIANTS: Partial<Record<BiomeId, readonly string[]>> = {
     grassland: ['river_bank'], // occasional bare dirt patch
     forest:    ['mountain'],   // occasional mossy rock outcrop
     savanna:   ['desert'],     // occasional dry sandy patch
     taiga:     ['mountain'],   // occasional rocky outcrop
     tundra:    ['snow'],       // occasional frost patch
     // desert/snow/mountain/beach/river_bank: no micro-patch — already
     // read as fairly uniform, no obviously-different "occasional patch"
     // material makes sense for them without new content.
   };
   ```

   Reuses the 10 textures already shipped in Phase 4a — no new content authored.
3. **Otherwise:** the tile's own `ownVariant`, unchanged.

All rolls use deterministic hashes of the sub-tile's own absolute world position (not
`Math.random()`), so the same world always looks the same, matching every other procedural system
in this codebase.

### 3.4 Testing strategy

This is a larger test migration than Phase 4a's, since **every** existing flat/edge-shape test
using a covered biome (which includes the common default-`'grassland'` fixture pattern) will now
see many small sub-tile quads instead of one big quad. Approach:

- Extend the `totalPositionsLength()`/`totalIndicesLength()`/`allNormals()` test helpers
  (already added in Phase 4a) — since sub-tiles still route into the same `groundGeometry`
  buffers, these "total across buffers" helpers continue to work; only the *exact* per-shape
  counts change (1 quad → 16 quads for a covered flat/edge tile), and those specific assertions
  get updated to `16 * 4 * 3` / `16 * 6` instead of `4 * 3` / `6`.
- New `tests/world/TerrainGeometryBuilder.test.ts` cases: (a) a flat covered-biome tile produces
  16 sub-tile quads with seamless shared corner heights between adjacent sub-tiles (no gaps —
  check adjacent sub-tile shared-edge Y values match exactly); (b) bump jitter is deterministic
  and bounded within `±SUBTILE_BUMP_MAX`; (c) two adjacent tiles sharing a sub-lattice point at
  their shared edge get the identical bump value (cross-tile seamlessness, mirroring
  `cornerHeightJitter`'s own existing seam test); (d) a tile bordering a differently-textured
  neighbor shows some sub-tiles routed into the neighbor's variant buffer, concentrated near that
  shared edge; (e) a biome with a micro-patch mapping shows occasional sub-tiles in the
  micro-patch variant's buffer, at roughly the expected low rate over many tiles; (f) ramp
  shapes are provably unaffected (still exactly 1 shape's worth of geometry, in the same
  buffer/format as before this pass).
- Perf check: honest before/after chunk-build-time comparison (same worktree-diff methodology as
  every prior phase) — this pass is expected to show a **real, larger** measured cost this time
  (subdividing ~94% of tiles into 16x the quad count is a substantial geometry increase), reported
  without downplaying, matching this project's established honesty precedent. The user has
  explicitly accepted this tradeoff.
- Manual/live verification: generate a world, visually confirm ground reads as less blocky/more
  organic with visible micro-terrain roughness and softer biome-border transitions; confirm
  physics still feels normal (no jankiness from the bump); same Playwright + dev-server fallback
  discipline as every prior phase if browser automation is unavailable.

## 4. Non-goals / explicitly deferred

- Ramp-shaped tiles (single-corner/outer-corner/saddle) — explicitly excluded from this pass
  (§2), kept exactly as Phase 4a shipped them.
- True shader-based multi-texture blending at borders (this design uses discrete per-sub-tile
  variant switching/dithering instead — simpler, reuses existing infrastructure, no new shader
  work).
- Diagonal (corner-only) biome adjacency handling beyond the fixed S/N/E/W priority order's
  natural (if imperfect) coverage.
- Any change to wall rendering, road sub-tiles, or water-tile rendering.
