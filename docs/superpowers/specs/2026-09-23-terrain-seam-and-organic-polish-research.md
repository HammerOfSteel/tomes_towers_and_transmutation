# Research: terrain seam/crack fix + organic tile geometry & textures

**Phase**: Overworld/Outdoor Polish, Phase 2 ("post-elevation polish")
**Sub-tasks covered by this research pass**: 2.1 (seamless, organic tile/
sub-tile geometry) and 2.2 (organic, less-blocky textures). Per the
`research-driven-world-polish` skill, both get their own design
notes/spec/plan/implement/test/playtest cycle — this doc is the shared
research base for both, since the root causes and applicable technique
families overlap heavily.

**Trigger**: user playtested the merged sub-task 1.3 (real elevation) and
reported (a) black wedge-shaped cracks/holes at slope and terrace-step
boundaries that are walkable-through (a real collision hole, not just a
shading artifact), more pronounced than before elevation landed, and (b)
ground tiles/sub-tiles and their textures read as "blocky, square, pixel
art" rather than organic — explicitly *not* about the nature-asset kit
(trees/rocks), which the user likes and wants to keep extending.

---

## 1. Root cause of the black cracks (diagnosed, not guessed)

This is a real, reproducible structural bug, not a vague "add more
smoothing" problem — tracing it down matters more than any external
technique research, so it's covered first.

### 1.1 The dual-grid principle this project already knows and already violates elsewhere

`TODO/organic_world_tiles_todo.md`'s "Research summary" (written for the
shoreline/settlement work, months before elevation existed) names the
exact failure mode at play here, just for a different feature:

> "The reason a grid always looks blocky … is structural: a normal tilemap
> stores information **at the center of a cell**, so the boundary between
> two differently-typed cells is *by definition* a straight line along the
> cell edge... The **dual grid**... fixes this by... **type corners, not
> cells**."

The corollary that doc doesn't spell out (because it wasn't needed for
shorelines) but matters here: **if two different cells that share a corner
each independently compute "what is this corner's value" instead of
looking it up from one shared, authoritative source, they can disagree —
and a disagreement at a shared vertex is not a texture-seam, it's a literal
hole in the mesh.**

### 1.2 Where elevation code does exactly that

`TerrainGeometryBuilder.ts`'s `_tileCornerLevels()` computes a tile's 4
corner elevations by calling `_rawCornerElevation()` (the true min
elevation of the up-to-4 physical tiles sharing that corner — correctly
shared/symmetric) and then **clamping the result to `[selfElevation - 1,
selfElevation]`**:

```ts
const clamp = (raw: number) => Math.max(selfElevation - 1, Math.min(selfElevation, raw));
```

This clamp exists because `TerrainKit.ts`'s `classifyTileShape()` (the
ramp-shape classifier) only understands a **single-level** drop per
corner — a deliberate, documented simplification from the 1.3 design spec.
`TerrainTerracing.ts`'s `terraceElevation()` was supposed to guarantee that
simplification always holds, by repeatedly raising any tile whose
**orthogonal** (`NEIGHBOR_OFFSETS_4` — N/S/E/W only) neighbor is more than
1 level higher.

**The gap: terracing only constrains orthogonally-adjacent pairs, not
diagonally-adjacent pairs.** A corner is shared by 4 tiles arranged in a
2×2 block — two orthogonal pairs plus **one diagonal pair**. It is
straightforward (and common in practice, not a rare edge case) for a fully
terraced grid to still contain a 2×2 block like:

```
A(row0,col0)=E+2   B(row0,col1)=E+1
C(row1,col0)=E+1   D(row1,col1)=E
```

Every orthogonal pair here differs by exactly 1 (satisfies terracing), but
the **diagonal pair A/D differs by 2**. All four tiles share one corner —
the corner sitting between them. `_rawCornerElevation` correctly computes
that shared corner's true value as `E` (D's elevation, the true minimum).
But then:

- Tile **A** (elevation `E+2`) clamps: `max(E+1, min(E+2, E)) = E+1`.
- Tile **D** (elevation `E`) clamps: `max(E-1, min(E, E)) = E`.
- Tiles **B/C** (elevation `E+1`) clamp: `max(E, min(E+1, E)) = E`.

**A renders that shared corner one full elevation step higher than
B/C/D do.** Three of the four tiles agree (at height `E`); the fourth
(the diagonally-opposite one, exactly at the "outer corner" of the 2-level
jump) renders its own vertex for the same physical point a full step
higher. That is a real, unavoidable vertical gap in the mesh at that
point — explaining both the visible black wedge (looking through the gap
into empty space/skybox behind the terrain) and the "I can feel through
the ground there" report (the physics collider is built from this exact
same buffer per this file's own header comment, so the collision mesh has
the identical hole).

**Why this is "more pronounced" post-1.3 specifically**: before real
elevation (1.3), the vast majority of tiles were flat (elevation 0), so
2-level diagonal jumps were rare-to-nonexistent. Once real elevation +
terracing started producing genuine hills/mountains, every place a
staircase changes direction or a ridge has a mountain tile diagonally
adjacent to a valley tile 2+ levels down produces one of these 2×2 blocks
— which is common precisely at the interesting terrain (slopes near
towers/mountains), matching where the user's screenshots show the cracks.

### 1.3 The fix is a natural extension of the existing pattern, not a rewrite

`TerrainTerracing.ts` already documents (in its own header) that it exists
so "no multi-level cliff drop can exist" for the ramp classifier's sake —
it just used the wrong neighbor set. Extending `NEIGHBOR_OFFSETS_4` to
also cover the 4 diagonal offsets (`[1,1],[1,-1],[-1,1],[-1,-1]`, i.e. a
full 8-neighbor/Moore terracing pass) closes the gap directly: after that,
no two tiles sharing a corner (orthogonal *or* diagonal) can differ by
more than 1 level, so `_rawCornerElevation`'s true shared value can never
fall outside any contributing tile's own `[self-1, self]` clamp range —
the clamp becomes a no-op for every real corner, and all tiles touching a
corner agree on its height by construction. This is the direct dual-grid
lesson from §1.1 applied here: **make the corner's value computed once
and trusted by every tile that touches it**, rather than each tile
re-deriving and potentially disagreeing.

This is a small, targeted, already-scoped fix, not new machinery — exactly
the kind of "closed-form corner-consistency fix" pattern already proven
out by 1.3's own boundary-hardening work (`_mergedCornerPull`'s existing
"never let two tiles disagree on a shared vertex" discipline, just not yet
extended to the diagonal case for elevation specifically).

### 1.4 A second, related class of hole worth checking: `_cornerTouchesUnpulledTile`

Separately, ramp/road/water corner-pull suppression (`_mergedCornerPull`)
already has its own "don't disagree at a shared vertex" logic for
biome/shoreline pulls. Whether *this* logic interacts correctly with the
now-more-common ramp tiles at slope/terrace boundaries (e.g. a ramp tile
next to a pulled biome-boundary tile) should be spot-checked as part of
sub-task 2.1's implementation — not a new root cause discovered this pass,
but a plausible second contributor given how much more ramp geometry now
exists post-1.3, and worth a regression test either way.

---

## 2. Making tile/sub-tile geometry read as organic, not square (sub-task 2.1, part 2)

The user was explicit: soften the **hard right-angle edges at slope/
terrace transitions** — "it's okay for things to have more gentle edges
and curves... same goes for textures." This is a distinct ask from the
crack bug (which must be fixed with *exact* geometric agreement, not
"softened") — the crack fix must stay hard/precise; the *shape* of the
now-crack-free terrain can then be softened on top.

### 2.1 What already exists in this codebase (checked first, per skill)

- **`ShorelineWobble.ts` / `ShorelineCornerField.ts`**: already perturb
  shoreline-adjacent corner vertices in a shared, boundary-consistent way
  to break up hard water/land edges — i.e. this project already has a
  working "pull a shared corner off-grid without creating a seam"
  primitive. The same *mechanism* (perturb a corner, but compute the
  perturbation as a pure function of the corner's own lattice position so
  every tile touching it agrees) is directly reusable for softening ramp/
  terrace-step corners, once §1's exactness bug is fixed underneath it.
- **`cornerHeightJitter()` / `subTileBumpJitter()`** (`TerrainGeometryBuilder.ts`):
  already give every shared grid-corner and sub-tile lattice point a small,
  deterministic, seam-safe Y jitter — the existing "organic bump" texture
  for flat ground. Ramp tiles are explicitly excluded from this today (see
  `getTerrainHeightAt()`'s doc comment) — extending jitter to ramp corners
  (with the same "never move a shared corner differently for two tiles"
  discipline) is a promising low-risk way to break up the currently
  perfectly-flat/perfectly-planar ramp faces without new machinery.
- **`TerrainKit.ts`'s `buildQuadFace()`**: already supports arbitrary
  per-corner world positions for non-planar tiles (single-corner/outer-
  corner/saddle) — any corner-rounding technique below can reuse this
  exact function unchanged; it doesn't assume axis-aligned or
  grid-snapped corners.

### 2.2 Named techniques for softening a stepped/grid terrain (external)

- **Chamfering/beveling hard edges** — the standard low-poly-terrain
  technique (used throughout the "voxel/low-poly" indie-terrain space,
  e.g. *Cube World*-style terrain write-ups) for turning a 90° step edge
  into 2 shorter angled faces (a "step + small ramp lip") — cheap (one
  extra edge loop) and keeps flat-shaded low-poly faceting, which matches
  what the user said they like about the current low-poly/"RuneScape"-ish
  read of the trees/rocks. This is different from smoothing normals
  (which would fight the faceted look the user explicitly likes) — it's
  literal added bevel geometry at the step edge.
- **Corner rounding via inset + lift** — insetting a tile's 4 corners
  slightly toward its center and adding a thin fillet strip along each
  edge (a discrete approximation of rounding a extruded prism's edges) is
  a well-known technique for turning "extruded grid cell" terrain into
  "rounded block" terrain without any smooth/organic-shader trickery —
  directly addresses the "not so square" complaint at the sub-tile level,
  independent of the elevation-crack fix.
- **Dual-grid corner-typing itself, applied to ramp *shape*** (not just
  elevation value): the same 6-canonical-shape dual-grid collapse this
  project already researched and partly implemented for shorelines
  (`TerrainKit.ts`'s `RampShape` union is *already* a hand-rolled analogue
  of exactly this — `flat/single-corner/edge/saddle/outer-corner` maps
  directly onto the dual-grid's `empty/outer_corner/edge/diagonal/
  inner_corner`) — meaning the ramp system is *already* dual-grid-shaped
  in spirit; it just doesn't yet get the "diagonal case renders as a
  curved/chamfered sector, not a stair-step" treatment §1 of the
  `organic_world_tiles_todo.md` research calls out as the whole point of
  doing this. Adding a rounded/chamfered variant mesh for the `saddle` and
  `outer-corner` shapes specifically (the two shapes a stair-step reads
  most sharply as square) is the most direct application of prior-art
  research this project has already paid for.
- **Marching-squares-style transition tiles** (Paul Bourke's classic
  algorithm, widely cited in terrain/tilemap literature) — generalizes the
  above into a full lookup table of edge-interpolated boundary shapes;
  likely more machinery than needed here given the ramp classifier already
  exists and works, but worth naming since it's the formal generalization
  of "chamfer the corner cases."

### 2.3 Performance note (carried over from user's own feedback)

The user separately noted FPS was "pretty slow" on a middle-size world
(unrelated bug report, deferred, but relevant context for scoping this
work): any geometry-softening technique chosen for 2.1 should budget for
per-tile triangle-count growth (bevels/insets add edges) and prefer
reusing the existing flat-shaded/no-extra-material approach over anything
that would add a new shader pass or per-vertex smoothing that defeats
static batching. This should be an explicit constraint carried into the
2.1 design spec, not solved here.

---

## 3. Organic, less-blocky textures (sub-task 2.2)

### 3.1 Why the current textures read as "pixel art"/blocky

`TerrainTextures.ts`'s canvas generators (`_buildBeachCanvas()`,
`_buildDesertCanvas()`, etc.) already draw organic-looking per-canvas
detail (ellipses, jittered pixels, wandering strokes) — the blocky read
isn't the individual canvas content, it's two structural facts:
1. **Every tile face gets exactly one variant texture with a hard cut at
   the tile boundary** — `emitGroundSubTiles`/wall faces select a single
   `terrainVariantTexture(variant, ...)` per face; there is no blending
   between two adjacent tiles of different biome variants, so a grass tile
   next to a sand tile is a perfectly straight seam between two different
   flat patterns — exactly the "cell-edge-aligned" blockiness `organic_world_tiles_todo.md`
   already diagnosed for shape, just for *texture* instead.
2. **`GROUND_UV_TILE_WU = 2.5`** ties the texture's visible tiling period
   very close to a single tile's own footprint, so each tile reads as "one
   stamped square of pattern" rather than continuous ground detail, despite
   the existing per-tile UV-rotation ("hex-bombing-lite", already in
   `_tileUvRotation()`) which only rotates, it doesn't break up the
   underlying per-tile stamp boundary itself.

### 3.2 Named techniques (external + already-cited)

- **Height/slope-based texture blending** (a.k.a. "splat blending") — the
  standard AAA/indie terrain-texturing technique (well documented for
  engines like Unity/Unreal terrain systems and covered in general terrain-
  rendering literature) of blending 2+ base textures per pixel using a
  weight derived from local terrain data (height, slope, or a **noise
  mask**) instead of a hard per-tile cut. For this project's canvas-texture
  approach, the direct analogue is: at tile-boundary UV space, blend
  between the two neighboring tiles' canvases using a soft-edged noise
  mask (not a hard 50/50 split) so the seam dissolves into an irregular,
  organic boundary instead of a straight line — same underlying "type the
  corner/edge, not the cell" idea as §1/§2, applied to texture alpha
  instead of geometry.
- **Domain-warped fBM noise for organic pattern shapes** — Iñigo Quílez's
  well-known ["Warping" article](https://iquilezles.org/articles/warp/)
  (technique in wide use since Ken Perlin's original 1985 marble-texture
  demo) — feeding a noise function's own output back in as a coordinate
  offset (`f(p + h(p))`) turns straight/regular noise bands into organic,
  blob-like, non-repeating shapes. This project already has a working hash-
  based value-noise primitive (`cornerHeightJitter`/`_regionHash`'s bit-
  mixing hash, and `_jitterPixels`) that can be layered into a cheap fBM
  (sum a few octaves of the same hash at increasing frequency/decreasing
  amplitude) and then domain-warped per this technique — no new library
  needed, since the "hand-rolled hash noise, no external asset" pattern is
  already this codebase's established convention and is sufficient for
  fBM (a simplex/Perlin-quality gradient noise isn't required for this
  use — value noise + a couple of octaves already reads as organic at the
  canvas resolutions in play, per the existing beach/desert canvases).
- **Cellular/Worley noise for blob-shaped detail** — an alternative/
  complementary organic-shape primitive (distance-to-nearest-feature-point,
  producing cell-like or blob patterns rather than smooth bands) — useful
  specifically for breaking up the current "stroke/ellipse scattered on a
  flat fill" look into more continuous, less obviously-stamped ground
  cover patterns (moss patches, rock cracks, sand ripples) without needing
  new geometry.

### 3.3 What's already half-built here too

- `_tileUvRotation()` is a genuine (if partial) "hex-bombing" — full
  hex-bombing (irregular hexagonal resampling to hide any periodicity) is
  more machinery than warranted here; the existing rotation-only version
  is the right complexity level to build on rather than replace.
- `GROUND_TERRAIN_VARIANTS` + `REGION_TEXTURE_VARIANT_COUNT`'s region-scale
  variant selection is itself a (coarse) already-working example of
  "blend/vary across a boundary that isn't the tile edge" — any per-tile
  texture-boundary blending work in 2.2 should follow the same "hash of
  world position, not per-tile RNG" discipline this code already
  establishes, so results stay deterministic/seam-safe across chunk
  reloads.

---

## 4. Libraries/frameworks considered

Per the user's explicit constraint (no external texture/model assets, but
libraries/algorithms for technique are fine) and this project's established
dependency-light, hand-rolled, engine-neutral preference (reaffirmed by
every prior sub-task's research doc):

- **`simplex-noise` (npm)** — considered for higher-quality gradient noise
  for the domain-warped texture work in §3.2. **Not recommended**: the
  existing hash-based value-noise primitives already in this codebase
  (used successfully for jitter/bump/region-variant selection across every
  prior sub-task) are sufficient quality for canvas-resolution procedural
  textures: a real dependency is only worth adding when the alternative is
  "substantial reinvented complexity" per the skill's own guidance, and a
  few octaves of the existing hash function is not that.
- **No mesh-relaxation/geometry library considered necessary** — the
  crack fix (§1) is a targeted logic fix to existing code, and the
  chamfer/bevel/inset techniques (§2.2) are straightforward additional
  vertex emission in the existing hand-rolled `TerrainKit.ts`/
  `TerrainGeometryBuilder.ts` pattern, not something a general mesh library
  would meaningfully simplify given this project's very specific
  grid+ramp-shape data model.
- **Conclusion: no new dependencies recommended for either sub-task.**
  This itself directly answers the user's proposed "phase 3" (research
  libraries) — the research concludes the existing hand-rolled approach
  remains the right one; documenting *why*, with the specific alternative
  considered and rejected, satisfies that phase's intent without adding
  dependency risk.

---

## 5. Summary / handoff to design notes

- **Sub-task 2.1** (this doc's §1 + §2): (a) extend `TerrainTerracing.ts`'s
  neighbor set to 8-neighbor (Moore) so no two corner-sharing tiles can
  disagree on a shared corner's elevation — this is the actual black-crack
  fix, verifiable with a targeted regression test asserting no two tiles
  sharing a corner ever compute differing world-Y for it; (b) on top of a
  now-crack-free base, apply a chosen corner-softening technique (chamfer/
  bevel or corner-inset, likely starting with the ramp `saddle`/
  `outer-corner` shapes since those read most "stair-steppy") to address
  the organic-geometry ask, budgeted against the user's separate FPS
  concern.
- **Sub-task 2.2**: soft-edged, noise-masked blending across ground-tile
  texture boundaries plus domain-warped fBM (built from existing hash
  primitives) inside the canvas generators themselves, to break up both
  the hard tile-to-tile seam and the "stamped square" look within a single
  tile's own texture.
- Both sub-tasks' open design choices (exact chamfer geometry, blend-mask
  strength/radius, whether to touch nature-asset textures at all — user
  said explicitly not the focus) should go through `brainstorming` next,
  per the process skill, before any plan is written.

---

## 6. Addendum (2026-09-24): second, distinct crack cause found on playtest

The 8-neighbor terracing fix (§1/§2) shipped and the playtest gate for
sub-task 2.1 was re-run. Result: the originally-reported large wedge-shaped
holes at dramatic slopes were gone on a fresh seed, confirming that fix
worked — but the user found a **second, previously-unreported, more
widespread defect**: thin diagonal black hairline cracks at the edges of
most tiles, including on largely flat/gently-rolling terrain with no
dramatic elevation jump (screenshots showed this on open desert/hill
ground and beside a forest road). This pattern is structurally different
from the diagonal-corner bug (which requires a genuine ≥2-level jump) and
required fresh root-cause investigation, per this skill's "playtest
feedback contradicts an assumption → revise design/research, not just the
code" guidance.

### Root cause: wall-top edge vs. top-face corner jitter mismatch

`TerrainGeometryBuilder.ts`'s top face (both the plain quad and the
subdivided `emitGroundSubTiles()` path) adds a small per-corner bump —
`subTileBumpJitter(worldX, worldZ)`, keyed by absolute world position,
range `±SUBTILE_BUMP_MAX` (0.06 WU) — to every rendered corner, to break up
the flat/pixel-art look (this is itself part of the organic-look work).
The 4 vertical wall blocks (N/S/E/W), however, anchored their top edge to
the tile's **raw, un-jittered** ramp-corner height (`Math.min(nwY, neY)`
etc.) while the top face right next to them rendered the jittered value —
a real, if small, vertical gap between the wall and the ground at every
wall in the world (independent of ramps: this affected the pre-existing
flat "raised tile between two flat tiles" case too, just usually too small
to notice before elevation/ramp geometry made walls far more common).
Magnitude (up to ~0.06 WU, versus the earlier bug's full elevation-level
gap) matches the "small hairline" (vs. the earlier "wedge") visual
distinction the user drew between the two reports.

**Fix**: give the wall's own top edge the exact same jittered per-corner
height as the top face's corresponding corner (`nwY + jNW`, `neY + jNE`,
etc.), and the wall's bottom edge the same jitter value applied to the
neighbor's flat physical height (matching the neighbor's own rendered
corner, under the existing assumption that walls are only drawn where the
far side is reached at its own flat height — already documented in the
surrounding code comments). This closes the gap to the last bit of
floating-point precision rather than merely shrinking it. The
wall-emission threshold check was updated in lockstep to compare
jittered-vs-jittered (not raw-vs-jittered), since comparing a jittered
wall-top against a raw neighbor height would spuriously fire a
zero-height wall between two tiles at the exact same elevation whenever
that shared jitter happened to be positive.

No new design-spec/plan cycle was run for this fix — it is a strict
continuation of sub-task 2.1's original scope ("eliminate ALL crack/hole
geometry... so it doesn't appear anywhere at all"), not a new class of
work, and the fix is a small, mechanically-verified correction (regression
tests assert every wall vertex exactly matches the top face's
corresponding jittered corner, plus a guard against the new
zero-height-wall pitfall). Sub-task 2.1 remains open pending this second
playtest.
