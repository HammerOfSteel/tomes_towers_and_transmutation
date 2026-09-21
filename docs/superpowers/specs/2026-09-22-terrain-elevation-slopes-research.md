# Sub-task 1.3 research: real elevation (mountains/hills/valleys/slopes)

**Status:** research pass only, per `research-driven-world-polish` skill —
no design decisions are made here, only findings and open questions.
Precedes the design-notes/spec pass (`superpowers:brainstorming`).

**Scope reminder:** Overworld/Outdoor Polish Phase 1, sub-task 1.3. Follows
sub-task 1.1 (tile/subtile dual-grid variety, closed) and sub-task 1.2
(procedural nature-asset kit-of-parts, closed). Settlement/building
architecture is explicitly out of scope and untouched.

---

## 0. Required first step: reproduce the logged black-gap/fall-through issue

Per `2026-09-20-land-biome-dual-grid-borders-design.md` §9 (added at the
close of sub-task 1.2), this research pass must diagnose the reported
"black gaps between terrain tiles, player feels through the ground" issue
*before* designing new slope/incline geometry, since both problems touch
the same tile-boundary vertex-sharing machinery. This section is that
diagnosis (a read-only code investigation; live in-game reproduction with
concrete coordinates is still an open item — see §6).

### 0.1 What the code confirms is possible (real, code-level mechanisms)

**(a) Multiple independent top-surface emission paths, not one shared
"the border is this ordered polyline" contract.** `TerrainGeometryBuilder.ts`
has at least four different code paths for a tile's top surface:
flat/all-four-down tiles (`emitGroundSubTiles()` + corner pulls, lines
~1011-1023), edge ramps (explicitly zero pulls, ~1042-1058), and
single-corner/outer-corner/saddle ramps (raw grid positions, no corner
pulls at all, ~1068-1091). `_mergedCornerPull()` (~41-60) is a *global
suppression* mechanism bolted on afterward to stop a pulled flat tile
disagreeing with an unpulled ramp/road neighbor — i.e. the codebase already
tried to patch this exact class of bug once, with a compensating check
rather than a single shared boundary contract. A compensating suppression
is strictly weaker than "there is only one way to compute this vertex" —
any classification/road/ford path that `_cornerTouchesUnpulledTile()`
doesn't fully enumerate reopens the gap.

**(b) Ramp corner heights are locally clamped, not canonical.**
`_tileCornerLevels()` (~477-489) clamps the *raw* shared-corner elevation
into `[selfElevation - 1, selfElevation]` — i.e. it is deliberately
tile-relative. The same physical lattice point can and does carry a
different Y value depending on which of the (up to 4) tiles touching it is
asking, whenever a ramp is involved. This is fine (harmless, even correct)
when every touching tile's rendering path also reads the same clamp
consistently and corner-pull is uniformly suppressed at those corners —
but it means "same X/Z, different Y" is a live, intentional code path, so
any bug in the ramp/pull-suppression bookkeeping around it manifests as a
literal vertical crack (exactly what a "black gap" looks like from most
camera angles: no geometry between the two Y values, background/skybox or
mesh backface showing through).

**(c) Chunks are built fully independently, from a full shared `WorldGrid`
but with no explicit "canonical boundary vertex" pass.** `ChunkManager.ts`
is a pure streaming tracker (loads/unloads by coordinate) with zero
terrain-geometry or halo logic. Each chunk's geometry is built by
`buildTerrainGeometryData()` looping only over its own
`[colStart, colEnd) x [rowStart, rowEnd)` tile range
(`TerrainGeometryBuilder.ts:849-853`), reading neighbor cells directly out
of the one shared `WorldGrid` instance. Because every chunk reads the same
underlying grid, a naive re-derivation of the same shared corner *should*
land identically on both sides in principle — but there is no test that
proves two independently-built adjacent chunks agree vertex-for-vertex at
their shared edge, only tests that check within-chunk (or whole-grid,
single-build) corner agreement (see §0.3). This is the most likely
candidate for a chunk-seam-specific (as opposed to tile-seam-within-a-
chunk) version of the same bug class, and per §6 needs to be verified live
against real chunk-boundary coordinates, not just read from source.

**(d) Multi-level elevation drops render as flat, textureless, vertex-
colored vertical quads ("cliffs"), not slopes.** The SOUTH/NORTH/EAST/WEST
wall-face emission block (`TerrainGeometryBuilder.ts` ~1097-1193) draws a
vertical quad whenever a neighbor's physical height is below
`min(relevant two corners)`, using only a flat-shaded tint
(`tr*d, tg*d, tb*d` — a per-direction darkening multiplier, no texture,
no normal-mapped rock/strata detail). Ramp shapes (`TerrainKit.ts`) only
ever encode a **single elevation level's** worth of slope per tile
(`classifyTileShape()`'s `lowCorners` is "one level below," full stop) —
there is no multi-tile gradient/slope primitive at all today. Any elevation
difference of 2+ levels between tiles that isn't spread across enough ramp
tiles necessarily produces one or more of these flat vertical "cliff"
walls. This is very likely what the user is describing as "raised blocky
tiles ... out of place ... perhaps some slope instead of just a sharp
raise" and "at least have some texture for them" — a **design gap**
(missing slope primitive + missing wall texture), not a geometry-tearing
bug, and is squarely sub-task 1.3's job to fix.

**(e) Texture/material seams are a separate, position-preserving effect.**
`_subTileGroundVariant()` picks a ground-texture variant per sub-tile from
the tile's own variant plus its 4 neighbor variants
(`TerrainGeometryBuilder.ts:171-220`). This is deterministic given
identical inputs and does not move any vertex, but two adjacent tiles can
legitimately select different texture/color buffers right at the seam,
which can *read* as a dark line at certain lighting/view angles without
being a real geometric hole. The user's own most recent report ("Some
black still showing there, but I think those are rendering issues of the
texture from the angle rather than geometric issues") matches this
mechanism specifically, and should be treated as visually adjacent to but
distinct from (a)-(d) above.

**(f) The visual mesh and the Rapier collider are built from one shared
buffer, not two independently-built copies.** `OverworldScene.ts`
(~1401-1428) copies the exact `positions`/`indices` the geometry builder
produced (plus road/ground-variant buffers with corrected index offsets)
directly into the trimesh handed to Rapier — no separate collider-mesh
build, no post-build mutation found. This means: **whatever gap exists in
the rendered visual mesh is the same gap in the physics collider.** This is
good news for diagnosis (one bug class explains both the visual crack and
the "feels through the ground" report — there is no separate "collider
desync" failure mode to also hunt for) but bad news for severity (a purely
cosmetic-looking seam is not necessarily cosmetic-only).

### 0.2 What's already ruled out

- The corner-pull math itself (`shorelineCornerPull()`,
  `landBiomeCornerPull()`) is a pure function of absolute lattice
  coordinates — deterministic and symmetric regardless of which tile
  calls it first. Not a source of nondeterminism.
- `smoothedElevation()`/`realmToTerrain()` in `RealmToTerrain.ts` are
  deterministic for a complete grid — but this module is **not** in the
  live rendering path at all (see §0.4); it's a separate, still-unwired
  pipeline. Irrelevant to the live bug.
- No evidence of the collider being built from a stale/earlier snapshot
  than the final visual mesh.

### 0.3 Existing test coverage and its gap

`tests/world/TerrainGeometryBuilder.test.ts` already has: shared-jitter
agreement tests, shared sub-tile bump agreement tests, a "covered/
uncovered adjacent-corner equality" regression test (~1448+), and a
land-biome pulled-corner test (~1475+). All of these build geometry for
one contiguous grid region in a single call and diff results *within that
one build*. **None of them build two adjacent regions as two separate
`buildTerrainGeometryData()` calls (mimicking two independently-streamed
chunks) and assert the shared-edge vertices land on identical
positions/colors.** That is exactly the scenario `ChunkManager`'s
production code path exercises, and exactly the scenario current tests
don't cover. This is a concrete, fillable coverage gap for 1.3.

### 0.4 A confirmed dead end worth flagging so it isn't re-investigated

`RealmToTerrain.ts`/`RealmRiverMesh.ts` (RI-1/RI-3 in
`TODO/02-game-world-integration/realm-integration.md`) are a fully
separate terrain-generation pipeline that was built and unit-tested but
**never wired into the live `OverworldScene.ts`** — the live scene still
runs the older `WorldGenerator.ts` → `WorldGrid` → `TerrainGeometryBuilder`
pipeline exclusively (confirmed via `realm-integration.md`'s own status
line and via grep — `RealmToTerrain` has zero live-scene call sites).
`realmToWorldGrid()` (a *different*, actually-live function in
`RealmToWorldGrid.ts`) is what feeds `WorldGenerator.buildWorldGrid()`
today. Do not confuse the two — any elevation-smoothing logic living only
in `RealmToTerrain.ts` (e.g. its 8-neighbor averaging) is not currently
affecting what players see.

### 0.5 Diagnosis status

**Confirmed by static analysis: the family of bugs/gaps described exists in
the code for real, non-mysterious reasons** — (d) alone (missing
multi-level slope primitive) is enough to explain "blocky raised tiles",
and (a)-(c) together are enough to explain an intermittent true black
crack/gap at tile or chunk boundaries wherever ramp/pull-suppression
bookkeeping misses a case. **Not yet confirmed live:** exact reproduction
with concrete world/chunk/tile coordinates, and specifically whether the
sharpest remaining reports (post rock-mesh-tearing fix, post the two
follow-up terrain fixes already shipped this initiative) are (b)/(c)
geometric tile/chunk-seam gaps, or purely the (e) texture-angle artifact
the user's own most recent message already suspects. **Action required
before finalizing the 1.3 design spec:** a live repro pass (small +
mid-size realm, note tile/chunk coordinates of any remaining visible gap,
try walking directly into it to test the "feels through the ground"
claim) — this is called out as an explicit open item in §6, not silently
assumed either way.

---

## 1. What already exists in this codebase (don't rebuild it)

- **`TerrainKit.ts`** — pure ramp classifier (`classifyTileShape()`) +
  quad emitter (`buildQuadFace()`), already following the "pure geometry
  in/out, no engine coupling" pattern this project uses for `BlockKit.ts`
  (buildings). Already handles exactly 5 non-planar single-tile shapes
  (single-corner, edge, saddle, outer-corner, all-four-down) for a
  **single elevation level's worth of drop**. This is real, working,
  reusable machinery for the smallest unit of slope geometry — 1.3 should
  extend/compose it, not replace it.
- **Dual-grid corner-pull machinery** (`ShorelineCornerField.ts`,
  `LandBiomeCornerField.ts`, `_mergedCornerPull()`) — a working, tested,
  deterministic corner-jitter system for shoreline and land-biome-border
  organic edges (sub-task 1.1's output). The same "shared lattice corner,
  computed once, read by up to 4 tiles" pattern is exactly what a
  multi-level slope/elevation-edge system will also need, and this
  existing code is the closest local precedent for how to do it right
  (plus, per §0.1(a), the closest local precedent for how it can *still*
  go wrong via path proliferation).
- **`_rawCornerElevation()`/`_tileCornerLevels()`** — the existing (tile-
  relative, clamped-to-1-level) corner elevation derivation. A real
  multi-level slope needs a generalization of this, not a parallel
  reimplementation.
- **Wall-face emission block** (SOUTH/NORTH/EAST/WEST in
  `buildTerrainGeometryData()`) — already the right place to add
  slope-texture/strata treatment instead of a flat tint, and already
  correctly reuses `shorelineBoundaryPoints()` for shoreline-adjacent wall
  edges — a working precedent for "wall geometry follows the dual-grid
  boundary, not a straight tile-edge line" that a cliff/slope wall variant
  should mirror.
- **`ELEVATION_LEVELS` / 0-7 integer elevation already exists** end-to-end
  (`WorldGrid.ts`, `RealmToWorldGrid.ts`, `WorldGenerator.buildWorldGrid()`)
  — elevation data is not new; only *rendering* multi-level transitions as
  something other than steps is new. `WorldGenerator.buildWorldGrid()`
  already layers realm-noise elevation with a **forced-flat radius around
  the tower** (`FR = GHW * 0.28`) and a **rim elevation bias** (bowl walls
  rising from 80%-116% of half-width) — so today's elevation signal is
  structurally "flat center, gentle noise mid-ring, steep forced rim,"
  which is one concrete reason the world reads as "flat-land-oriented"
  even though the elevation field itself is far from empty: most of the
  playable area sits in the noise-only mid-ring where the *step height*
  is small and the *ramp coverage* is real, so any dramatic elevation only
  shows up at the deliberately-steep rim.
- **`physicalHeightWU()`/`WaterDepthConfig.ts`** — the existing shared
  depth-carving config used for rivers/oceans, already proven as a
  "shared between visual mesh and collider" pattern (per
  `realm-integration.md`'s RI-3 entry) — worth reusing the same
  config-sharing shape for whatever "how tall is one elevation level in
  world units, and how much do we round/snap a slope's intermediate
  heights" constant 1.3 introduces.
- **`RelaxedMeshGrid.ts`** — checked; this is the Townscaper-style
  jitter+relax utility used for settlement plot organic layout (per
  `organic_world_tiles_todo.md` Phase 3). Not obviously reusable for
  elevation/slope geometry (it operates on 2D plot boundaries, not height
  fields), but worth a second look during the design pass if a
  "region/biome-level elevation blueprint" direction (§3) needs organic
  region boundaries rather than grid-aligned ones.
- **`RealmToTerrain.ts`'s `smoothedElevation()`** — a working 8-neighbor
  elevation-averaging function, but (per §0.4) not in the live pipeline.
  Its *technique* (simple neighborhood averaging as a cheap smoothing
  pass) is a candidate worth citing, even though the code itself isn't
  wired up.

## 2. Named, citable techniques for modular multi-level slope terrain

- **Terracing / height-tier "steps with a ramp-strip between them"** —
  the standard fix for exactly this problem in tile/voxel terrain: instead
  of one big cliff face for an N-level drop, spread the drop across N
  ramp tiles (or N/2 with steeper individual ramps), each handled by the
  existing single-level `TerrainKit.ts` classification, stitched in
  sequence. This is the direct, minimal-new-code generalization of what's
  already there — a "staircase of existing ramp tiles" rather than a new
  geometry primitive. Named precedent: rice-paddy/hillside terracing is
  the real-world referent City-building and strategy games (Cities:
  Skylines' terraforming, Rimworld's z-level-free but still band-limited
  hills) commonly cite when describing this exact technique.
- **Marching-squares-style multi-level lookup ("marching cubes on a 2D
  height lattice")** — the natural generalization of the existing
  single-level 16-case (well, this project's already-reduced ~5-case)
  ramp table to more than 2 height bands: instead of a boolean "low
  corner" per corner, use an integer level per corner and either (a) emit
  one ramp quad per unit-level step the corner needs to drop (composable
  with the terracing idea above), or (b) a small fixed table of "how many
  levels does each corner differ by" shapes for 2-level and 3-level
  drops specifically (bounded, since single-tile drops beyond ~3 levels
  are rare/undesirable regardless). This is the technique family this
  project's own `TerrainKit.ts` and dual-grid corner-pull work are already
  instances of (Townscaper's public dev-log technique for marching-
  squares terrain is the originally-cited source for the shoreline work,
  per `organic_world_tiles_todo.md`), generalized from 2 height-bands to N.
- **Fractal/octave (fBm) noise for elevation, with domain warping for
  ridgelines** — the standard heightmap-generation technique (see
  Red Blob Games, "Making maps with noise functions" /
  "terrain-from-noise", a widely-cited reference implementation of
  layered-frequency Perlin/Simplex noise producing hills-and-valleys
  rather than uniform bumps) — directly relevant if the elevation *signal*
  itself (not just its rendering) needs more structure than today's
  single-octave realm-noise + forced flat-zone + rim-bias combination.
  Domain warping (perturbing the noise's own input coordinates with a
  second noise field) is the specific named technique for producing
  natural-looking ridgelines/valleys rather than "isotropic blobby hills,"
  and is worth citing explicitly if 1.3's design wants mountain *ranges*
  (elongated, directional) rather than isolated bumps.
- **Region/biome-level elevation blueprints (macro-shape before micro-
  noise)** — rather than deriving every tile's elevation independently
  from per-cell noise, first lay out a small number of named macro
  landforms (a mountain range's ridge spline, a valley's floor spline, a
  plateau's boundary polygon) at the whole-region/biome scale, then fill
  in per-tile elevation as a function of distance-to-spline/polygon plus a
  lower-amplitude local noise layer for texture. This is the generalization
  of what `WorldGenerator.buildWorldGrid()` already does for exactly one
  landform (the tower's forced-flat disc + the world's rim-bias annulus)
  — both are already literal instances of "macro shape function, not raw
  per-cell noise" — so extending this same idea to a *variable* number of
  interior landforms (not just the two hardcoded global ones) is a
  natural, code-precedented direction rather than a new paradigm. Named
  precedent for this general "macro landform first, noise second"
  approach: the "sketch-based"/"authored-then-fractal-detailed" terrain
  pipelines described for large open-world titles (e.g. No Man's Sky-style
  procedural planet generation layers coarse spherical macro-features
  before per-tile noise detail; Rimworld/Dwarf Fortress-style world-gen
  places named mountain-range/river features before per-tile height
  detail) — the specific citable mechanism is "distance-field-to-spline or
  distance-field-to-polygon elevation falloff," a standard technique in
  procedural terrain literature, not exotic.
- **Hydraulic/thermal erosion simulation** — a well-known technique
  (droplet-based hydraulic erosion, e.g. Hans Theobald Beyer's widely-
  cited 2015 "Implementation of a method for hydraulic erosion" write-up,
  and thermal erosion / talus-angle relaxation as its companion pass) for
  turning raw fractal noise into naturalistic valleys/ridgelines/scree
  slopes by simulating water/sediment transport over many iterations.
  **Flagged as likely out of scope for a first pass**: this is
  meaningfully more implementation and tuning effort than the other
  techniques above, is normally run on a continuous heightmap (not this
  project's discrete 0-7 integer elevation + tile-grid model) — folding
  it in later, if at all, would need its own scoping conversation. Noted
  here for completeness since it's the field's standard answer to "how do
  I make natural-looking terrain," not because it's being recommended for
  1.3 v1.
- **Cliff-face/strata texture treatment (distinct from grass/rock top
  textures)** — many voxel/tile terrain games (Minecraft-family clones,
  various tile-based JRPGs) give vertical cliff faces a visually distinct
  material (banded rock strata, different color per level, or a
  triplanar-projected rock texture that doesn't stretch on steep faces)
  rather than reusing the top-surface ground texture rotated 90°. This is
  the direct, low-effort fix for the currently-flat-tinted wall faces
  found in §0.1(d), and doesn't require any new geometry technique — it's
  purely a shading/texture-selection change to the existing wall-face
  emission code.

## 3. Open questions for the design/spec pass

These are explicitly **not decided here** — flagged for
`superpowers:brainstorming` and, where noted, likely needing the user's
direct call per the skill's "surface the choice, don't guess" rule:

1. **Terracing-of-existing-ramps vs. a new N-level ramp shape table vs.
   region-blueprint-driven elevation** (§2) — these are not mutually
   exclusive (a region blueprint could still render via terraced
   single-level ramps at the tile level), but the design spec needs to
   pick a primary technique and scope for a first version.
2. **How tall is "one elevation level" meant to feel, and how many levels
   should a "mountain" span?** Currently 0-7 integer levels exist but the
   realm-noise + flat-zone + rim-bias combination in
   `WorldGenerator.buildWorldGrid()` means most of the playable world
   barely uses that range today. This is squarely an art-direction/feel
   question for the user, not something to guess.
3. **Chunk-seam elevation continuity** — needs a decision on whether to
   (a) add a halo/neighbor-read contract to `ChunkManager`/
   `buildTerrainGeometryData()` so adjacent chunks provably agree on
   shared-edge vertices, or (b) add the missing cross-chunk-boundary
   regression test (§0.3) first and only add halo logic if that test
   actually catches a live disagreement. This affects perf/complexity
   trade-offs the user may want visibility into.
4. **Physics collider walkability on slopes** — a real multi-level slope
   ramp needs its walkability/step-height tolerance checked against
   `PlayerController`'s existing step-up logic (not audited this pass);
   flagging so the design/spec pass includes it rather than discovering a
   "can't climb the new hills" bug late.
5. **Whether/how the still-unconfirmed black-gap report (§0) is fully
   resolved by 1.3's slope work, or needs its own narrower fix first** —
   depends on the live repro pass's outcome (§6).

## 4. What this research pass deliberately did not do

- Did not write any design spec or implementation plan (per the skill —
  research is a separate, standalone step).
- Did not touch settlement/building code.
- Did not modify `TerrainGeometryBuilder.ts`, `TerrainKit.ts`,
  `WorldGenerator.ts`, or any other source file — this is a read-only
  investigation.
- Did not attempt hydraulic/thermal erosion simulation or any other
  heavyweight technique beyond citing it as a known-but-likely-out-of-
  scope option.

## 5. Sources consulted

- This codebase: `src/world/TerrainGeometryBuilder.ts`,
  `src/world/TerrainKit.ts`, `src/world/WorldGrid.ts`,
  `src/world/WorldGenerator.ts`, `src/world/RealmToWorldGrid.ts`,
  `src/world/RealmToTerrain.ts`, `src/world/ChunkManager.ts`,
  `src/world/ShorelineCornerField.ts`, `src/world/LandBiomeCornerField.ts`,
  `src/scene/OverworldScene.ts` (chunk build + collider assembly),
  `tests/world/TerrainGeometryBuilder.test.ts`.
- This repo's own docs: `docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md`,
  `docs/superpowers/specs/2026-09-02-dual-grid-shoreline-corners-design.md`,
  `docs/superpowers/specs/2026-09-02-shoreline-edge-smoothing-design.md`,
  `docs/superpowers/specs/2026-09-20-land-biome-dual-grid-borders-design.md`,
  `TODO/organic_world_tiles_todo.md`, `TODO/TODO_OVERVIEW.md` (G16),
  `TODO/02-game-world-integration/realm-integration.md`.
- External: Red Blob Games, "Making maps with noise functions"
  (redblobgames.com/maps/terrain-from-noise/) — fBm/octave noise,
  frequency/wavelength/gain terminology used in §2. General industry
  knowledge of terracing, marching-squares generalization, domain-warped
  ridgelines, region/macro-landform-first terrain pipelines, and
  hydraulic/thermal erosion (Beyer 2015-style droplet erosion) as
  established, named technique families — cited by name/description above
  rather than as unnamed vague "add more noise" gestures, per the skill's
  research-quality bar.
