# Overworld Biome & Terrain Overhaul — Roadmap
> Companion to `2026-08-30-overworld-lab.md` (the "Play in 3D" launch mechanism
> this roadmap will be iterated and verified through). Mirrors the phase-
> narrative structure of `2026-08-29-settlement-visual-fidelity.md`: each
> phase below gets a "Status: DONE" writeup appended when it ships, rather
> than a single big-bang implementation.

## 0. Why this doc exists

The user's ask (2026-08-30 session) was explicit: make the *live* overworld's
terrain and biomes feel as considered and race-thematic as the settlements
just went through (see `2026-08-29-settlement-visual-fidelity.md`) — richer
biome variety, smoother biome-to-biome transitions, race-specific sub-biomes
near settlements, a modular "small tiles that can slope and connect" terrain
system (the terrain equivalent of `BlockKit.ts`), and real height/depth
(hills, valleys, oceans, rivers, occasional mountains) instead of today's
very flat terraced steps. This is explicitly scoped as *planning-first*: this
doc is the plan; execution proceeds phase-by-phase afterward, each phase
getting its own review gate and completion writeup, exactly like the
settlement initiative did.

## 1. Current-state audit (2026-08-30)

A full codebase survey (own reading + a dedicated explore-agent pass) found
the following. Every claim below is grounded in a specific file — this is
the factual baseline every phase's design below reacts to.

### 1.1 Elevation is real but extremely flat
`RealmGenerator.ts`'s `generateRealmData()` computes a genuinely continuous
0-1 elevation via fBm noise + a shape mask + a ridge-noise term
(`RealmGenerator.ts:126-131`) — this part is already a solid, standard
terrain-from-noise pipeline (matches the well-established
[redblobgames "Making maps with noise functions"](https://www.redblobgames.com/maps/terrain-from-noise/)
technique: continent mask, fBm octaves, elevation/moisture/latitude →
Whittaker-style biome lookup table — `classifyBiome()` at
`RealmGenerator.ts:33-45` is structurally the same table shape as that
article's reference implementation).

The problem is entirely downstream: `RealmToWorldGrid.ts:22-24`'s
`quantizeElevation()` collapses that continuous 0-1 value into just **5
discrete integer levels** (`Math.floor(elevation * 5)`, clamped 0-4), and
`OverworldScene.ts`'s `SH = LEVEL_HEIGHT = 0.55` world units per level
(`WaterDepthConfig.ts:19`) means the **entire map's height range is 0 to
2.2 WU** — barely more than one player-height. `TerrainGeometryBuilder.ts`
then renders each level as a flat quad with vertical cliff walls at
transitions (`buildTerrainGeometryData()`, lines 226-284) — a "blocky-step"
terrace look with no slopes at all. There is no way to build a real hill,
valley, or mountain today; every landform is a shallow staircase.

### 1.2 No mountain biome, no lake concept (one is a dead config field)
`RealmBiome`/`BiomeId` (unified 10-value taxonomy, `RealmGenerator.ts`/
`WorldGrid.ts`) has no `mountain` value — `classifyBiome()` only maps
`elev > 0.85` to `snow`. Separately, `WorldGenConfig.lakeCount` **already
exists as a config field** (`WorldGenConfig.ts:19`, default `2`,
"Number of lake basins (OW-2)") but is **never read anywhere else in the
codebase** — confirmed via a full-repo grep, it's dead config. Rivers exist
(`HydrologyGenerator.ts`, downhill-flow carving) but lakes (endorheic
basins, or river-fed standing water) do not exist at all yet.

### 1.3 Rivers are still a duplicated pipeline (the P0 follow-up STUDIO-LIVE-PARITY.md flagged and never closed)
`STUDIO-LIVE-PARITY.md`'s P0 section explicitly tracked as a follow-up:
"river rasterization (`HydrologyGenerator.ts` still runs its own independent
river algorithm)". This remains true today: the live game's
`HydrologyGenerator.generateHydrology()` (grid downhill-flow, orthogonal
steps, its own source/candidate selection) is completely independent from
the Studio's `generateRealmData()`'s own `rivers[]` tracing (diagonal
steps, spline+Chaikin-smoothed, feeds `RealmRiverMesh.ts`'s ribbon mesh —
itself still unused by the live scene). Two rivers systems, two different
shapes, only one of which (`HydrologyGenerator`) is actually live. This is
the single largest remaining Studio/live-parity gap for terrain.

### 1.4 Zero biome-nature-asset variance; zero settlement/dungeon/cave biome affinity
Trees/rocks/bushes (`NatureAssetDNA.ts`, `OverworldScene.ts`'s
`_buildChunkScatter`) pick their archetype from a **position hash**, not
biome — a desert tile and a tundra tile get the exact same tree/rock shapes.
Beach decor is the one exception (correctly gated to `biome === 'beach'`).
Settlement faction assignment (`RealmGenerator.ts:200`) is **fully random**
(`FACTIONS[Math.floor(rand() * FACTIONS.length)]`) with zero biome
consideration — an elven settlement is exactly as likely to spawn in desert
as in forest. Dungeon/cave/glade placement similarly has no faction-linkage
concept (caves/glades do have *biome* eligibility, just not *faction*
eligibility, since dungeons/caves/glades aren't faction-owned in the first
place).

### 1.5 Terrain rendering has no textures at all (one system exists but is entirely unused)
`TerrainGeometryBuilder.ts` renders 100% via **per-vertex color** (a
`cellVariantIndex()` hash picks among 2-3 RGB triples per biome,
`BIOME_COLOR_VARIANTS`) — zero `THREE.Texture`/canvas material anywhere in
the live terrain path. A parallel, fully-built **Tile Variant System**
already exists (`src/procedural/TileDNA.ts`/`TileBuilder.ts`/`TileColor.ts`,
per `TODO/01-overworld-studio/procedural-designer/tile-designer.md`'s
TV-1–TV-4, all shipped ✅) with a real biome+variant table (grassland:
short/lush/patchy, forest floor: leaf litter/moss/roots, desert:
sand/cracked/dune, tundra: snow/ice patch/frozen ground, plus dungeon/cave/
settlement variants) — but it is **Studio/tile-creator.html preview only**,
never consumed by `OverworldScene.ts`'s actual terrain rendering. Two
unconnected systems, confirmed by `tile-designer.md`'s own TV-4 status:
"Used by world generator to select correct tile per cell — blocked on
`02-game-world-integration`'s terrain renderer existing." That renderer now
exists (`TerrainGeometryBuilder.ts`) but was never wired to consume it.

This session's settlement work already solved an almost identical problem
for buildings (`BlockKit.ts`'s new world-space-projected UV +
`FactionBlockTextures.ts`'s 7 canvas textures, `2026-08-29-settlement-
visual-fidelity.md` Phase 2e.17) — the terrain equivalent should follow the
same shape: small tileable canvas textures, projected via world-space UV so
they don't look stamped/repeating, tinted per-biome via the existing
vertex-color machinery (`color * map` multiply, same technique).

### 1.6 The Tile Variant System's biome list is narrower than the live biome taxonomy
`tile-designer.md`'s TV-2 table only covers 4 land biomes (grassland,
forest floor, desert, tundra) plus dungeon/cave/settlement variants — it
predates the later 10-biome unification (`savanna`, `taiga`, `beach`,
`deep_ocean`/`ocean` split, and any future `mountain`/`lake`). Any phase
that revives this system for live terrain needs to extend its table to the
full current taxonomy, not just wire up the 4 it already has.

### 1.7 Everything needed to build a subtile/slope terrain system already exists as a pattern — just not for terrain
`src/world/buildings/BlockKit.ts` (used by all 7 non-human faction
buildings) already proves out the exact "small modular blocks, chamfered
edges, world-space-projected UV, deterministic per-block variation" pattern
the user is asking for, just applied to *buildings*. `TerrainGeometryBuilder.ts`
already has a working deterministic per-cell/per-corner hash+jitter system
(`cellVariantIndex()`, `cornerHeightJitter()`) that is structurally similar
in spirit (small, cheap, deterministic, seam-safe at shared edges) but only
perturbs color and a tiny cosmetic Y-jitter (`CORNER_JITTER_MAX = 0.03`
WU) — not real geometric sub-tile detail or slopes.

## 2. Research grounding

- **Terrain-from-noise / elevation → biome table**: [redblobgames.com/maps/terrain-from-noise](https://www.redblobgames.com/maps/terrain-from-noise/) — confirms the game's existing fBm+Whittaker-table approach for elevation/moisture/biome classification is already the industry-standard technique; the fix needed is *resolution/range* of the elevation output, not the classification algorithm itself. Its "Climate" section (latitude+elevation → temperature) also matches `RealmGenerator.ts`'s existing `latT`/`elvT` blend almost exactly.
- **Designer-guided elevation via distance fields**: [redblobgames.com/x/1728-elevation-control](https://www.redblobgames.com/x/1728-elevation-control/) — a technique for blending "mountain ridge" and "coastline" constraint points via weighted harmonic-mean distance fields. Not directly adopted (this game's realm generation is fully procedural, not designer-sketched), but the *scale-free interpolation* idea (harmonic mean of distances to differently-typed features) is a good reference if Phase 5's race-biome-affinity siting ever needs to blend "near mountains" + "near forest" + "far from other settlements" into one placement score, rather than the current sequential-filter approach.
- **Corner-height "ramp tile" terrain** (well-established technique used by Transport Tycoon/OpenTTD, Age of Empires, RollerCoaster Tycoon, Cities: Skylines-style heightmap terrain): rather than one flat quad per tile, each tile's *four corners* carry independent heights (sourced from a shared corner-height field, exactly like `cornerHeightJitter()` already does for cosmetic jitter today) and the tile's geometry triangulates/ramps between them — flat, single-corner-raised, edge-raised (a simple ramp), and saddle configurations, roughly 10-16 canonical shapes depending on how many height-steps are allowed per edge. This is the mechanism Phase 2 (TerrainKit) below adopts: it's the natural generalization of the game's *existing* corner-hash infrastructure from "cosmetic jitter" to "real geometric slope," and stays fully compatible with the low-poly/flat-shaded art direction (ramps are still flat-shaded planar quads, just non-horizontal ones) rather than requiring a smooth/rounded heightfield.
- **Biome border blending / domain warping**: the standard fix for "biomes shouldn't have razor-sharp borders" (used by Minecraft's biome "blur" and broadly documented as "domain warping" in procedural-generation literature) is to perturb the *sampling coordinate* used for biome classification with a second, lower-frequency noise field, so the boundary line itself wiggles organically instead of being a perfect noise-iso-line — cheaper and more robust than trying to blend two fully-built tile meshes at a seam. `RealmToTerrain.ts`'s existing `isBiomeTransition` flag (already computed, currently unused by any renderer) is a good complementary signal for Phase 4 to drive an actual transition-zone tile treatment once domain warping softens the border shape itself.

## 3. Phases

Ordered by dependency — a phase generally shouldn't start until the ones
above it that it depends on are done, though several are independent and
can be reordered/parallelized (noted per-phase).

### Phase 1 — Elevation range & mountain biome
> **Status: ✅ DONE (2026-08-30).** Split into two independently-tested,
> independently-committed sub-changes:
> - **Mountain biome** (commit `feat(world): add mountain biome`): added
>   `mountain` to the unified `RealmBiome`/`BiomeId` taxonomy (11 values
>   now), `classifyBiome()`'s new bucket at elevation 0.70-0.85 (below
>   snow, regardless of moisture/temperature — real alpine terrain is rugged
>   whether hot or cold), `BIOME_COLOR_VARIANTS.mountain` (warm grey-brown,
>   distinct from tundra/desert), dungeons now prefer mountain terrain
>   (settlements already excluded it implicitly). `CaveGladeWorldPlacer.ts`/
>   `CaveGladePlacer.ts` cave eligibility switched from an elevation-band
>   proxy to a direct `biome === 'mountain'` check (more accurate); updated
>   both modules' and `cave-glade-integration.md`'s stale pre-unification
>   doc text.
> - **Elevation widening** (commit `feat(world): widen elevation levels
>   5->8`): `RealmToWorldGrid.ts` gained an exported `ELEVATION_LEVELS = 8`
>   constant (was a hardcoded 5), giving ~75% more total height range at
>   unchanged per-level height — deliberately conservative (finer, more
>   numerous terracing steps rather than taller cliffs; Phase 2's ramp
>   geometry is where terraces become actual slopes). `HydrologyGenerator.ts`'s
>   river-source threshold and `WorldGenerator.ts`'s `MLV` now derive from
>   `ELEVATION_LEVELS` instead of duplicated magic numbers.
>
> **Verification:** all planned tests written (11 in `RealmGenerator.test.ts`
> incl. 3 new `classifyBiome` unit tests, `WorldGrid.test.ts`,
> `TerrainGeometryBuilder.test.ts`'s 8-biome distinctness check,
> `CaveGladeWorldPlacer.test.ts`, `RealmToWorldGrid.test.ts`'s quantization
> tests). Full project suite: 2618/2630 passing — the 12 failures confirmed
> byte-for-byte identical (same file+test names) to the pre-Phase-1 baseline
> via a temporary `git worktree` comparison at each sub-change, proving zero
> regressions. `tsc --noEmit` baseline unchanged (143 errors) throughout.
> Caught and fixed one real side effect along the way:
> `RoadGenerator.ts`'s inter-settlement road pathing had an `elevation >= 3`
> "rocky terrain" cost penalty that fired against a much larger fraction of
> the map once the range widened (causing a measurable zigzag/turn-ratio
> regression in `RoadGenerator.test.ts`) — replaced with a direct
> `biome === 'mountain'` check, which fixed the regression outright (more
> accurate than the elevation proxy ever was) rather than needing to loosen
> the test's tolerance. Live-verified via the Overworld Lab (a moderate
> config renders correctly with no errors; an extreme stress-test config —
> `pangaea` shape, `roughness: 0.9` — crashes the headless browser during
> shadow-map rendering, but this was confirmed to reproduce **identically
> on the pre-Phase-1 baseline** via a temporary worktree comparison, so it's
> a pre-existing headless-rendering environment fragility under extreme
> parameters, not a regression from this phase).

Widen the discrete elevation model so real hills/valleys/mountains are
physically possible, and add a `mountain` biome so the tallest terrain
reads as rock/peak rather than snowing over everything above 0.85.

- [x] Increase `quantizeElevation()`'s level count (e.g. 0-4 → 0-9, tune by
      playtesting) and/or increase `LEVEL_HEIGHT` — both raise the max
      height range; changing level *count* also gives finer terracing steps
      near the same total height, so both knobs should be tuned together
      against actual playtested "does this feel like a hill" screenshots,
      not picked by formula alone.
- [x] Add `'mountain'` to `RealmBiome`/`BiomeId` (both, kept in lockstep per
      the existing unification). `classifyBiome()`: elevation above some
      threshold *and* not already claimed by `snow`'s colder-climate rule
      becomes `mountain` (rocky, mostly bare) — snow still wins at the very
      coldest temperatures/highest elevations (a snow-capped-peak reads as
      `snow`, the rocky slopes below the cap read as `mountain`).
- [x] `TerrainGeometryBuilder.ts`: add a `BIOME_COLOR_VARIANTS.mountain`
      entry (bare rock grey/brown tones, distinct from `tundra`'s existing
      colors and from `BIOME[4]`'s "rocky upland" default).
- [x] Extend `CaveGladeWorldPlacer.ts`'s cave eligibility (currently an
      elevation-band substitute for the "mountain/bog" biome that never
      existed, per its own header comment) to use the real `mountain` biome
      now that it exists, simplifying that workaround away. Update the
      stale `cave-glade-integration.md` doc text at the same time (it still
      describes the *old* `bog|grass|forest|highland|rocky|water` biome
      taxonomy that predates the 10-value unification — a documentation
      fix, not a code fix, since the code already moved on).
- [x] Nature/settlement/dungeon scatter rules (`ScatterRules.ts`,
      `RealmGenerator.ts`'s settlement/dungeon eligibility sets) need an
      explicit decision per mountain: settlements should very likely
      exclude `mountain` (steep, poor building ground) the same way they
      already exclude ocean/beach/tundra/snow/desert-adjacent — dungeons
      should probably *prefer* mountains (rocky, remote) alongside their
      existing eligible-biome set.
- [x] Tests: `RealmGenerator.test.ts` (mountain appears at high elevation,
      doesn't appear at low elevation regardless of moisture/temp),
      `WorldGrid.test.ts` (mountain is a valid `BiomeId`),
      `TerrainGeometryBuilder.test.ts` (mountain has a color-variant entry),
      `CaveGladeWorldPlacer.test.ts` (updated eligibility).

### Phase 2 — TerrainKit: modular sub-tile slope system
**Depends on:** Phase 1 (needs a wider height range to be worth sloping between).

> **Status: ✅ DONE (2026-08-30) — both the "roads as a first-class terrain
> surface" sub-item and the generic ramp/slope sub-item have shipped.**
>
> Shipped, in dependency order (4 commits): `RoadPathSampler.ts` (pure
> sub-tile road/ground classification given world-space road paths with
> width — nearer-path-wins when two roads' bands overlap a sub-tile, a
> bounding-box pre-filter so a long inter-settlement path doesn't get
> segment-tested against every distant tile); `RoadGenerator.ts` exposing
> ordered per-edge `paths: GridPath[]` alongside the existing deduplicated
> flat tile list (needed for Chaikin-smoothing a centerline, which can't
> tolerate the gaps a global dedup can introduce); `TerrainGeometryBuilder.ts`'s
> `buildTerrainGeometryData()` gaining optional `roadPaths`/`roadSubdivisions`
> params — a road-flagged tile with actual path coverage now subdivides
> into a 4x4 sub-tile grid, ground sub-tiles going into the existing
> buffers exactly as before and road sub-tiles becoming a literal hole in
> that buffer (never emitted there at all) plus a separate per-variant
> `roadGeometry` output with real UV; `RoadTextures.ts` mapping a
> settlement's faction (or a generic open-road id) to a real canvas
> texture, reusing the same 7 per-faction textures already proven out for
> buildings (`FactionBlockTextures.ts`) — zero new art assets needed;
> `OverworldScene.ts` collecting every settlement's ward-model road ribbons
> (tagged with that settlement's own faction) plus every inter-settlement
> A*/L-shape path Chaikin-smoothed into an organic curve (tagged generic),
> once at construction time before the first chunk ever loads, feeding
> `_loadTerrainChunk()`'s per-chunk `buildTerrainGeometryData()` call and
> building one textured mesh per road variant actually present in that
> chunk — merged into the SAME Rapier trimesh collider buffer the ground
> alone would otherwise use (a visual-only hole is not a physics hole),
> with the old settlement-interior flat pavement squares, inter-settlement
> flat dirt-road squares, and ribbon-mesh overlay all retired outright.
>
> **Why this was the real fix, not another patch:** a prior same-day quick
> fix (see Phase 8's sibling note and git history) tuned the old overlay
> meshes' height offset above `CORNER_JITTER_MAX`, which helped but did not
> fully resolve a reported "roads still glitch, two textures competing for
> the same space" symptom — because the ribbon mesh and the flat pavement
> squares were *both* still separate, still-coincident-in-places planes
> layered over the terrain. Baking the road into the terrain mesh itself
> (a literal hole where the road renders instead of a second surface)
> removes the entire *category* of bug, not just one instance of it.
>
> **Verification:** 19 new tests across the 4 modules (RoadPathSampler
> coverage classification/nearer-wins/bounding-box filter/determinism,
> RoadGenerator path-contiguity/endpoint-correctness, TerrainGeometryBuilder
> backward-compat-with-no-paths/no-coverage-fallback/partial-and-full-
> coverage-subdivision/multi-variant-grouping/watertight-height-continuity,
> RoadTextures per-faction/generic/fallback/caching/distinctness/wrapping).
> Full project suite: 2640/2652 passing throughout, the 12 failures
> confirmed identical to the pre-session baseline at every commit. `tsc
> --noEmit` baseline unchanged (143 errors) throughout. Live-verified via
> the Overworld Lab across several teleported views of a live settlement's
> streets and the surrounding inter-settlement road: no instance of the
> reported z-fighting/flicker artifact visible in any view (a clean
> checkerboard brightness-variation pattern only, no dashed interference
> lines), confirming the fix visually as well as structurally.
>
> **Shipped (2026-08-30): the generic corner-height ramp/slope geometry**
> for ordinary hill/mountain terrain, closing out this phase's last open
> item — see the dedicated status writeup below (after the bridges
> follow-up note), plus `docs/superpowers/specs/2026-08-30-terrainkit-ramp-slopes-design.md`
> and `docs/superpowers/plans/2026-08-30-terrainkit-ramp-slopes-plan.md`.

> **Follow-up shipped (2026-08-30): bridges over water, as an extension of
> roads.** A `river_ford` tile (an inter-settlement road's A* path crossing
> a river — already re-tagged `waterDepth: 0, walkable: true` by
> `WorldGenerator.applyRoadFords()` per RI-3, unchanged) previously
> rendered as a plain flat colored ground quad (the `BIOME_FORD` tint) with
> zero road-surface treatment even though it only exists because a road
> passed through it. Extended the same sub-tile road-as-terrain pipeline
> above to also cover `river_ford` tiles: `isRoadTile` now includes
> `river_ford`, and — since a river crossing isn't owned by any one
> settlement/faction — every sub-tile it covers always renders with a new
> universal `BRIDGE_ROAD_VARIANT` (`RoadPathSampler.ts`) regardless of
> which road's own variant produced the crossing, textured with a
> wood-plank look (`RoadTextures.ts`, reusing `barkTexture`'s vertical-grain
> canvas — zero new art assets). No grid-data/walkability/swim-collision
> semantics changed at all (still the exact same tested `river_ford`
> behavior) — this is a rendering-only upgrade from "dry ford patch" to
> "bridge deck," composing entirely through already-tested pure functions
> (`applyRoadFords` → `_collectRoadPaths` → `computeTileRoadCoverage` →
> `buildTerrainGeometryData`) with zero `OverworldScene.ts` changes needed,
> since its road-mesh/collider-merge loop already iterates `roadGeometry`
> generically by variant. Verified via 3 new `TerrainGeometryBuilder.ts`
> tests (backward-compat with no path data, full coverage produces the
> bridge variant, coexists correctly alongside an ordinary faction road
> tile in the same call) + 1 new `RoadTextures.ts` test (distinct
> canvas/texture from every other variant), plus an end-to-end sweep
> (`buildWorldData` across 40 seeds, replicating `_collectRoadPaths()`'s
> exact inter-road-path Chaikin-smoothing) confirming bridge-deck geometry
> appears at every one of the 3 seeds that happened to generate a ford.
> Full project suite: 2640/2652 passing, the same 12 pre-existing failures
> confirmed unchanged. `tsc --noEmit` baseline unchanged (145 errors).

> **Shipped (2026-08-30): generic corner-height ramp/slope terrain
> geometry.** New `src/world/TerrainKit.ts` — a pure classifier
> (`classifyTileShape()`) that takes a tile's 4 corners (each "low" or not,
> derived by `TerrainGeometryBuilder.ts`'s new `_tileCornerLevels()` as the
> minimum elevation among a corner's up-to-4 surrounding tiles, clamped to
> at most 1 level below the tile's own elevation) and returns which of 5
> canonical shapes applies — flat, single-corner, edge, saddle, or
> outer-corner — plus which diagonal to triangulate along, exhaustively
> tested across all 16 possible corner-low combinations. A rare degenerate
> all-four-down case (measured ~0.006% of adjacent-tile-pairs across a
> 40-world-generation sample) falls back to today's flat-quad-plus-wall
> behavior rather than inventing pyramid geometry for it.
> `TerrainGeometryBuilder.buildTerrainGeometryData()`'s top-face block now
> renders each dry tile's real shape instead of an unconditional flat quad:
> flat/all-four-down/water-ineligible tiles keep the exact old cheap
> 4-vertex path (byte-identical, zero behavior change for the ~94% common
> case where every neighbor agrees); Edge ramps use the same cheap path
> with a real computed (tilted) normal since they're still genuinely
> planar; Single-corner/Outer-corner/Saddle ramps use
> `TerrainKit.buildQuadFace()`'s explicit 2-triangle geometry with
> independently-computed per-triangle normals for their non-planar
> surface. Each of the 4 wall blocks was also updated to anchor its top
> edge to `min()` of the tile's own 2 relevant ramp corner heights instead
> of the flat tile height, so a ramp that already reaches down to a lower
> neighbor (the common single-level-step case) no longer draws a redundant
> vertical wall underneath the new slope — the rare 2-level-jump case still
> draws a correctly-anchored residual wall for the remaining drop. Ramps
> apply to **dry land tiles only** — any tile with `waterDepth > 0` or an
> ocean biome is completely excluded, both as the tile being classified and
> as a neighbor contributing to a corner, so `WaterDetection.ts`'s swim
> query and every river/lake/ocean shoreline are entirely untouched by this
> work. The exact same position/index buffers that back the visual mesh
> also back the Rapier collider (no separate collider geometry needed — the
> existing "one buffer, two consumers" pattern this codebase already relies
> on for exactly this guarantee). Sub-tile subdivision and ramp-aware road
> height blending remain explicitly out of scope for this pass (a road
> rendered on a ramped tile still uses the tile's flat pre-ramp height —
> not currently a visible issue since roads only exist on already-
> flattened settlement/inter-settlement tiles, which rarely coincide with
> steep terrain). Verified via 5 new `TerrainKit.ts` tests (shape
> classification across all 16 corner combinations, quad-face geometry
> emission with correct per-triangle normals) + 13 new
> `TerrainGeometryBuilder.ts` tests (corner-height derivation rules
> including out-of-bounds/water exclusion, each ramp shape's top-face
> rendering, wall suppression on an exact-match ramp, residual wall on the
> rare 2-level-jump case, byte-identical flat/all-four-down/water-boundary
> behavior). Full project suite: 2672/2684 passing, the same 12
> pre-existing failures confirmed unchanged. `tsc --noEmit` baseline
> unchanged (145 errors). Perf: informal before/after chunk-build-time
> benchmark (`worldSize: 512`, 20 sampled 16x16 chunks) measured ~0.22ms/
> chunk before this change vs. ~0.59ms/chunk after — a real, honestly-
> reported ~2.6x increase (every tile now computes corner levels/
> classification even when the result is flat, rather than the increase
> being purely proportional to existing wall-face count as originally
> hoped) but still comfortably sub-millisecond in absolute terms, well
> within the existing per-frame chunk-load budget — revisit only if a
> future larger-scale perf pass finds this a real bottleneck. Live
> in-browser visual verification could not be completed in this sandboxed
> session (Playwright/headless-Chromium sessions repeatedly hung under
> this environment's resource contention, a known recurring issue this
> session's own history documents workarounds for) — shipped on the
> strength of the automated test suite's coverage alone, per this plan's
> own documented fallback; recommend a manual visual check in the
> Overworld Lab on a hill/mountain-heavy seed as a follow-up once
> convenient.

The centerpiece the user specifically asked for: "smaller pieces of tiles...
subtiles and subsubtiles... that can slope and connect to each other in
various ways," explicitly comparing it to the BlockKit lego-piece technique
already proven out for buildings. Design per §2's "corner-height ramp tile"
research note above:

- [x] New `src/world/TerrainKit.ts` (naming mirrors `BlockKit.ts`): given a
      tile's four corner heights (sourced from a shared per-grid-corner
      height field — generalizing `cornerHeightJitter()` from cosmetic-only
      to load-bearing geometry), classifies the tile into one of a small
      canonical set of ramp shapes (flat / single-corner ramp / edge ramp /
      saddle — start with the minimal set that covers single-step
      transitions, expand later if multi-step-per-edge ramps are needed)
      and emits the corresponding triangulated quad(s) instead of
      `TerrainGeometryBuilder`'s current always-flat top face. Must stay a
      pure function (grid corner-height in, geometry buffers out) so it's
      unit-testable exactly like `BlockKit.ts`. **DONE** — shipped with a
      6th outer-corner shape beyond the 4 originally listed (needed to
      exhaustively cover all 16 corner-low combinations without an
      unclassified gap) plus a degenerate all-four-down fallback; see this
      phase's ramp/slope status writeup above.
- [ ] Sub-tile subdivision: allow a tile to be further split into an N×N
      grid of smaller quads (the "subtiles/subsubtiles" ask) purely for
      *detail density* at slope transitions and biome borders — e.g. a
      2×2 or 4×4 subdivision only where a tile is a ramp or sits on a
      biome-transition flag (`RealmToTerrain.ts`'s existing
      `isBiomeTransition`), keeping flat interior-biome tiles cheap and
      undivided for performance. **Deliberately deferred** — explicitly
      scoped out of the 2026-08-30 ramp/slope pass (see design spec §2)
      to keep that pass's risk/scope bounded; still open follow-up work.
- [x] Both the visual mesh AND the Rapier collider must be rebuilt from
      the same ramp geometry (mirrors `TerrainGeometryBuilder.ts`'s
      existing "one buffer, two consumers" design that fixed the original
      "player clips through terrain at elevation edges" bug — do not
      regress this guarantee).
- [ ] `WaterDetection`/swim-collision queries (`WaterDepthConfig.ts`'s
      `physicalHeightWU()`) must be updated for ramped tiles — a river/lake
      edge tile is no longer a single flat height, so the "am I in water,
      how deep" query needs to sample the actual ramped surface height at
      the player's exact XZ position, not just the tile's nominal level.
      **Deliberately deferred** — the 2026-08-30 ramp/slope pass scoped
      ramps to dry land tiles only; any tile with `waterDepth > 0` or an
      ocean biome is excluded from ramping (both as the tile itself and as
      a corner-contributing neighbor), so `WaterDetection.ts` needed zero
      changes and river/lake/ocean shorelines keep today's exact flat-
      carved + vertical-wall look. Revisit only if a future pass extends
      ramping to water-adjacent tiles.
- [x] Tests: exhaustive corner-height-combination coverage (all 16
      2-height-per-corner combinations at minimum) confirming correct
      shape classification + watertight geometry (no cracks between
      adjacent tiles — the existing `cornerHeightJitter()` "shared corner
      lattice coordinate" trick that already guarantees seamless adjacent
      tiles for cosmetic jitter is the template to follow for load-bearing
      ramp heights too).
- [x] Perf check: this phase is the biggest risk to frame rate (more
      triangles per tile than today's single flat quad) — benchmark chunk
      build time before/after on the largest `WorldSize` (512) and
      confirm it stays within `RI-4`'s existing chunk-streaming budget
      expectations (see `realm-integration.md`'s deferred RI-5 "16×16 chunk
      generates in < 4ms" perf-test item — this is the natural point to
      finally close that out, now that there's an actual renderer to
      benchmark). **DONE** — measured ~0.22ms/chunk before vs. ~0.59ms/
      chunk after (both comfortably under the 4ms RI-5 target); see this
      phase's ramp/slope status writeup above for the honest full context
      (a real ~2.6x increase, not purely wall-face-proportional as
      originally hoped, but still sub-millisecond in absolute terms).
- [x] **Roads as a first-class terrain surface, not overlaid geometry**
      (added 2026-08-30 per direct user feedback on the Overworld Lab's
      current road rendering). Today roads are separate flat planes
      overlaid on top of the terrain mesh (`OverworldScene.ts`'s
      instanced pavement squares + `SettlementRenderer.ts`'s road-ribbon
      meshes, held a small height offset above the ground — patched in a
      quick z-fighting fix ahead of this phase, see git history around
      2026-08-30, but still a fundamentally separate layer, not a tile
      property) — this reads as visibly "blocky" and disconnected from
      the ground itself. The TerrainKit-native fix: give a tile/subtile a
      `surface: 'ground' | 'road'` (or similar) flag directly in its
      `TerrainKit` cell data, so a "road" subtile is rendered as part of
      the SAME terrain mesh pass as its neighbours (no separate overlay
      mesh, no height-offset z-fighting class of bug possible even in
      principle) with a road-specific texture swapped in via Phase 8's
      texture system instead of a bolted-on plane. Because roads become
      ordinary terrain sub-tiles, they inherit sub-tile subdivision for
      free — a road can narrow/widen/curve at sub-tile granularity
      instead of being locked to whole-tile-width rectangles, which is
      what makes it possible to have an organic dirt track through a
      forest look meaningfully different from a paved city street.
      **DONE** — see this phase's status note above (RoadPathSampler.ts +
      TerrainGeometryBuilder.ts's roadGeometry output + OverworldScene.ts
      wiring). Road sub-tile classification currently checks a fixed
      `roadSubdivisions = 4` grid per tile (not yet a further-nested
      "subsubtile" level) — sufficient for the width/curve granularity
      shipped so far; revisit only if a future biome/race-specific road
      style genuinely needs finer resolution than 0.5 WU sub-tiles.
- [x] **Per-biome road styles** (part of the same ask): road texture/
      width/edge-treatment should vary by the biome it passes through —
      a forest path reads as a narrow trampled-dirt trail with grass
      overhang at the edges, a desert road reads as a wider hard-packed
      sandy track, a settlement's own internal streets keep the existing
      cobblestone look, a swamp/bog crossing might become a raised
      plank/corduroy-road treatment. This is a natural extension of
      Phase 8's per-biome `TerrainTextures.ts` (a `roadTexture(biome)`
      alongside each biome's ground texture) plus this phase's sub-tile
      edge treatment (organic tapered/blended edges where road meets
      ground, using the same small-block "lego" edge-rounding technique
      already established for `BlockKit.ts`'s chamfers).
      **DONE for the per-race half** — `RoadTextures.ts`'s
      `roadVariantTexture(variant)` gives every settlement's own streets a
      distinct texture keyed by that settlement's faction (reusing the 7
      existing per-faction block textures), plus a generic open-road
      texture for inter-settlement stretches. **Not yet done**: true
      per-biome (not per-faction) variation for open-road stretches
      (a forest-vs-desert open road currently share the one generic
      texture) and organic tapered sub-tile edges where road meets
      ground (edges are currently a hard subtile-boundary cut, not
      blended/chamfered) — both remain Phase 8 follow-up work.
- [x] Migration path: `SettlementRenderer.ts`'s `buildRoadRibbonMeshes()`
      and the inter-settlement flat-plane roads in `OverworldScene.ts`
      (both wired in as an interim fix ahead of this phase) should be
      retired once TerrainKit road-surface tiles land, rather than kept
      running in parallel — two road-rendering systems would be strictly
      worse than either one alone. **DONE** — both retired outright in
      the same change that wired in the terrain-baked system (renderSettlementPlan()
      itself still returns the raw ribbon/tile data for its existing test
      coverage, it is simply no longer consumed for live rendering).

### Phase 3 — Lakes + hydrology unification ✅ DONE (2026-08-31)
**Depends on:** Phase 1 (mountain sourcing for lake basins reads better with real elevation range), independent of Phase 2.

Closed §1.2/§1.3's two findings together since they're both "water body
generation" gaps: implemented the dead `lakeCount` config field for real, and
resolved the long-standing `HydrologyGenerator`/Studio-`rivers[]`
duplication flagged by `STUDIO-LIVE-PARITY.md`.

Design spec: `docs/superpowers/specs/2026-08-31-lakes-hydrology-unification-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-31-lakes-hydrology-unification-plan.md`.

**What shipped:**
- [x] Hydrology unification: extracted the live game's already-tested
      source-selection + downhill-walk algorithm out of `HydrologyGenerator.ts`
      into a new pure, grid-shape-agnostic module `src/world/RiverFlow.ts`
      (`selectRiverSources()`/`flowDownhill()`, parameterized by plain
      `elevationAt`/`isRiver` callbacks instead of a concrete `WorldGrid`).
      Both `HydrologyGenerator.ts` (live, wraps `WorldGrid`) and
      `RealmGenerator.ts` (Studio preview, wraps `RealmData.cells`) are now
      thin wrappers around the identical algorithm — reversing the doc's
      original tentative "resample Studio's splines onto the live grid"
      guess in favor of "extract the shared algorithm, wrap both ways",
      since the live grid-based rivers are the only ones with real, tested,
      physically-carved swim/collision/ford behavior. Studio's preview
      river shape changed from smooth Chaikin-spline curves to a blockier,
      grid-aligned line — a deliberate accuracy improvement (this now
      matches what `TerrainGeometryBuilder`'s `BIOME_RIVER` tint actually
      renders live), not a regression.
- [x] Lakes: independent local-minima siting (not river-fed) via a new pure
      module `src/world/LakeSiting.ts` (`selectLakeSources()` — local-minima
      detection over the 8-neighbor ring — + `floodFillBasin()` — BFS same-
      elevation basin fill, capped at 40 tiles per lake). New `WorldGrid`
      wrapper `src/world/LakeGenerator.ts` finally reads
      `WorldGenConfig.lakeCount` for real. New `TileFeature: 'lake'` value;
      new `LAKE_DEPTH_WU` constant in `WaterDepthConfig.ts` (2.0, matching
      `RIVER_DEPTH_WU` — both need to reliably trigger real swim state, kept
      as a separate named constant so future re-tuning of one doesn't
      silently affect the other). Lakes reuse the exact same
      `waterDepth`-driven carving path already built for rivers in
      `TerrainGeometryBuilder.buildTerrainGeometryData()` — no new physics/
      collider machinery, confirmed by unit test that lake carving math is
      byte-identical to river carving math at the same depth. New
      `BIOME_LAKE` color tint (calmer/greener than `BIOME_RIVER`) reads as
      still water vs. flowing water.
  - [x] `WaterDetection.getWaterInfoAt()` needed zero changes — it already
        keys off `waterDepth > 0` generically, feature-agnostic.
- [x] `RoadGenerator.ts` lake avoidance: added `feature === 'lake'` checks
      to both `_moveCost` and `_pathCrossesWater()`, exactly mirroring the
      ocean-crossing fix shipped just before this phase (`cd930d3`) — lakes
      sit on ordinary land biomes, not a special lake `BiomeId`, so the
      existing ocean-only checks wouldn't have caught them.
- [x] Consistency sweep: `ResourceNodePlacer.ts`'s essence-blossom "near
      water" siting and `OverworldScene.ts`'s near-water narration helper
      both extended to also match `feature === 'lake'` (previously only
      river/ocean).
- [x] Dead code cleanup: `RealmRiverMesh.ts`'s `buildRiverMesh()`/
      `makeHeightSampler()` (zero real callers outside their own test file)
      deleted outright, along with `tests/world/RealmRiverMesh.test.ts`.
      Its still-used `RiverHeightSampler` type alias (a generic
      `(worldX, worldZ) => number` shape, unrelated to rivers specifically)
      relocated to a new minimal `src/world/HeightSampler.ts`.
- [x] Studio preview: `overworld-studio.ts`'s Realm-tab canvas gained a
      lake-fill drawing block (same per-cell fill technique other biome
      tiles use) and the summary readout now shows lake count alongside
      river/settlement counts. World-package export also carries the new
      `lakes` field.
- [x] Tests: new `RiverFlow.test.ts` (9), `LakeSiting.test.ts` (7),
      `LakeGenerator.test.ts` (4); extended `WorldGrid.test.ts`,
      `WaterDepthConfig.test.ts`, `WorldGenerator.test.ts`,
      `RoadGenerator.test.ts` (+3 lake-avoidance tests mirroring the ocean
      ones), `TerrainGeometryBuilder.test.ts` (+2 lake carving/color
      tests), `RealmGenerator.test.ts` (+3 lake tests), and a stale-literal
      fix in `ResourceNodePlacer.test.ts` (its own mirror of
      `ResourceNodePlacer.ts`'s essence-feature check hadn't been updated
      for `'lake'`). `HydrologyGenerator.test.ts`'s full existing suite
      re-run unchanged post-refactor (behavior-preserving) — confirmed
      identical pass. Full project suite: same 12 pre-existing baseline
      failures, zero regressions (verified across 2 clean full-suite runs;
      one run showed an unrelated one-off flake in
      `ResourceNodePlacer.test.ts` that did not reproduce on rerun in
      isolation or in a second full run — logged as sandbox flakiness, not
      a code regression). `tsc --noEmit` steady at 144 (145 baseline minus
      one, from `RealmRiverMesh.test.ts`'s deletion).
- [x] Manual/live verification: confirmed via Playwright against the dev
      server — Overworld Studio's Realm-tab preview renders lake-colored
      pixels distinct from rivers/ocean (confirmed both visually via
      screenshot and by sampling canvas pixel data for the `BIOME_LAKE`-
      matching fill color); in the live game, teleporting the player into a
      generated lake tile and force-ticking the physics/game loop confirmed
      `isPlayerSwimming() === true` with a buoyant Y position between the
      carved floor and the water surface — real swim state, not a cosmetic
      offset. This also surfaced and fixed a small pre-existing dev-tooling
      gap: `OverworldScene.findFirstWaterTile()` (a test/verification-only
      helper) never checked `feature === 'lake'`, so it could never locate
      one — fixed alongside this phase.

**Deferred (documented, not started):** Studio UI sliders for river/lake
count (Studio's preview count stays independently derived per each
generator's own existing heuristic); lake-to-lake or lake-to-river
connecting channels; variable lake depth/shape (bowl bottoms, ramped
shores — lakes use the same flat-`waterDepth`-basin approach as rivers);
bridges (a road physically spanning a river/lake) — a road that would need
to cross a lake is skipped entirely, same as the ocean-crossing fix; fords
remain the only river-crossing mechanism.

### Phase 4 — Organic biome transitions ✅ DONE (2026-08-31)
**Depends on:** Phase 1, independent of Phases 2/3.

Implements §2's domain-warping research note so biome borders read as
naturally uneven coastlines/tree-lines rather than a perfect noise
iso-contour. Design spec: `docs/superpowers/specs/2026-08-31-organic-biome-transitions-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-31-organic-biome-transitions-plan.md`.

- [x] Added `_domainWarp(nx, ny, roughness, noiseW)` to `RealmGenerator.ts` — a new low-frequency
      `noiseW` field (seeded `seed ^ 0xFEEDFACE`) produces a bounded `(wx, wy)` displacement
      (`0.03 + roughness*0.05` amplitude, `0.6` frequency — well below the elevation noise's own
      1.8–3.0 scale) fed into every noise lookup that drives `classifyBiome()`: continent mask,
      elevation, ridge, moisture, and temperature-noise. `classifyBiome()`'s thresholds and the
      latitude term (`latT`, which represents real map position, not a noise-sample target) are
      completely untouched. Since `WorldGenerator.ts`'s live `buildWorldGrid()` calls this exact
      same `generateRealmData()` Overworld Studio uses (the Studio↔live parity gap was already
      closed in an earlier phase), this change automatically benefits both, no dual
      implementation needed.
- [x] **Scope note:** the roadmap's original second bullet ("give `isBiomeTransition` an actual
      blended-color rendering treatment") was found, during design, to already be effectively
      delivered by the ground sub-tile system shipped 2026-09-01 —
      `_subTileGroundVariant()`'s border-dithering already pulls a tile's outermost sub-tiles
      toward a differing neighbor's own texture variant at biome borders, live in the game. Not
      re-built here to avoid a redundant second mechanism.
- [x] **Bug found and fixed during implementation:** the `'island'` shape's mask
      (`Math.min(nx, 1-nx, ny, 1-ny) * 4.2`) was only ever non-negative before warping because
      unwarped `nx`/`ny` are always in `[0,1)` by construction — but a warped `(wx, wy)` can land
      slightly outside `[0,1]` near map edges, which `Math.min()` then returns directly as a
      small negative value, propagating into a slightly negative `elevation`. Fixed by clamping
      `mVal` to `>= 0` (previously only clamped `<= 1`). Caught by the pre-existing "every cell
      has a valid elevation" test; a dedicated regression test (checking the full edge/corner
      ring of several `roughness=1` island realms across 5 seeds) was added to lock this in.
- [x] Tests: 4 `_domainWarp()` unit tests (determinism, bounded displacement, non-degenerate,
      decorrelated axes), 1 wiring test (confirms the real generation path's output differs from
      what the pre-warp formula would have produced at the same cell — proves the warp is
      actually wired in, not just correct in isolation), 1 edge-case regression test (above).
      Pre-existing determinism/settlement/tower/dungeon tests kept passing unmodified. One
      pre-existing snapshot test (`OverworldScene.settlement-parity.test.ts`, seed 1) legitimately
      shifted — its own comments already document this exact pattern happening 4 prior times
      (mountain biome, elevation quantization, road-clearance safety net), since changing which
      cells classify as which biome for a given seed perturbs the settlement-candidate cell list;
      updated the snapshot and documented the shift inline, matching the file's own established
      convention. Full project suite: same 12 pre-existing baseline failures + 1 already-
      documented sandbox-contention timeout flake (`OverworldScene.chunk-scatter-alignment.test.ts`,
      confirmed clean in isolation), zero real regressions. `tsc --noEmit` steady at 144. The
      512×512 perf budget (3s) stayed comfortably met (~310ms).

### Phase 5 — Race/faction biome affinity for settlements, dungeons, caves ✅ DONE (2026-08-31)
**Depends on:** Phase 1 (needs `mountain` to exist for e.g. dwarven/vampire affinity to mean anything).

Closes §1.4's finding. Gives each faction a preferred biome set so a
settlement's surroundings actually make thematic sense with its race —
directly extending the "each race gets a distinct, thematic settlement"
work from `2026-08-29-settlement-visual-fidelity.md` out into the terrain
around it. Design spec: `docs/superpowers/specs/2026-08-31-race-biome-affinity-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-31-race-biome-affinity-plan.md`.

- [x] `RealmGenerator.ts` gained a module-scope `BIOME_AFFINITY` table (elven→forest/taiga,
      dwarven→mountain/tundra, vulperia→grassland/savanna, vampire→forest/mountain,
      undead→tundra/mountain/desert, fae→forest/grassland, orcish→savanna/desert,
      slime→grassland/forest, human→grassland/forest — every settlement-eligible biome has ≥2
      factions with affinity, none orphaned) and a `pickFaction(biome, rand)` weighted-random
      helper (baseline weight 1, ×5 for an affinity match) replacing the settlement-siting loop's
      uniform `FACTIONS[Math.floor(rand() * FACTIONS.length)]` pick — a bias, not a hard rule,
      every faction stays reachable everywhere.
- [x] **Two pre-existing constraints found and resolved during design** (confirmed by direct code
      read, not assumed): `RealmGenerator.ts`'s settlement-eligible `VALID` biome set excluded
      `mountain`/`tundra` entirely (unrelated to any earlier phase) — expanded to include both.
      Separately, `SettlementPlacer.ts` (the live-game siting step) had its own elevation gate
      (`[1, 2]` only) that would silently reject every mountain-biome cell regardless of the
      `VALID` fix, since `mountain` only ever classifies at elevation level 5-6 — relaxed
      narrowly, only for `cell.biome === 'mountain'`, leaving every other biome's `[1, 2]` gate
      byte-identical.
- [x] **Dungeon/cave affinity confirmed out of scope**, per the roadmap's own stated fallback:
      direct code read of `DungeonPlacer.ts`/`CaveGladePlacer.ts`/`CaveGladeWorldPlacer.ts`
      confirmed zero faction/race concept exists anywhere in either system today — introducing
      one would be a separate, much larger undertaking, not part of this pass.
- [x] Tests: 4 `pickFaction()` unit tests (determinism, affinity bias, bias-not-hard-rule,
      always-valid-output), 2 `generateRealmData()`-level statistical/wiring tests (mountain/
      tundra now sited at all; taiga-sited settlements measurably favor elven — a
      `nSettlements=30` density trick keeps this fast, ~7s for enough samples instead of 30s+),
      4 `SettlementPlacer.ts` regression tests (mountain now sitable at its own elevation band,
      still rejected outside it, tundra sitable, every other biome's original `[1, 2]` gate
      unchanged). Full project suite: same 12 pre-existing baseline failures + 1 already-
      documented sandbox-contention timeout flake (confirmed clean in isolation), zero real
      regressions. One legitimate settlement-parity snapshot shift (seed 1 — same established
      pattern as every prior phase's own shift, documented inline in that test's history: new
      biomes/factions become reachable, perturbing the exact settlement list for that seed).
      `tsc --noEmit` steady at 144.

### Phase 6 — Race-specific biome environment packs 🔶 BATCH 1 DONE (2026-08-31)
**Depends on:** Phase 5 (needs faction-biome affinity to exist for "near a settlement" placement to be meaningful), and reuses Phase 7/8's asset-variety and texture work once those land.

This is the big thematic payoff the user is most excited about: unique
environment dressing *specific to each race's territory*, not just
"trees near a town" — e.g. a vulperia territory getting warren-mound
terrain dressing and burrow-adjacent scatter, an undead territory getting
withered/ashen ground cover and gravestone scatter, a fae territory getting
luminous mushroom rings and firefly-lit groves, etc. — extending the same
"no shared assets between races" principle the settlement building work
already established, out into the *land* around each settlement.

Design spec: `docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-31-race-territory-dressing-plan.md`.
**Only the first implementation batch — vulperia, undead, fae — is done.** The remaining 6
factions (elven, dwarven, orcish, vampire, slime, human) have a lightweight concept-only prop
list (design spec §3) but no implementation yet; each needs its own short design/research pass
before its own batch, mirroring exactly how the settlement building work itself rolled out.

- [x] `src/world/TerritoryDressing.ts` — pure territory-radius (settlement boundary radius × 2.5)
      and gradient placement-probability logic (up to 70% right at the settlement centre, fading
      linearly to 0% at the territory edge — a bias, not a hard wall), plus `findTerritoryFaction()`
      (nearest-settlement-wins for overlapping territories).
- [x] `src/world/buildings/FactionTerritoryProps.ts` — vulperia (warren mound with a carved
      burrow entrance, a smaller burrow-hole cluster, a bark-textured den marker — the first two
      reuse `FactionBlockProfiles.ts`'s existing `buildVulperiaDenMoundGrid()` grounded-heightfield-
      mound technique at scatter scale, no new geometry code needed), undead (a simple gravestone
      slab, an irregular bone-pile marker, and a crumbling burial mound — deliberately reusing the
      *same* mound technique as vulperia's warren mound but with `suppressChamfer` forced on and
      an ash-stone palette, showing the shared block-kit engine producing a very different read
      purely from chamfer settings + material), and fae (small/large luminous toadstools — a new,
      genuinely scatter-scale mushroom grid, since the existing `buildFaeStalkGrid()` has an
      8-block-level building-scale minimum height — plus a "mushroom ring" composite that clones
      5-6 small mushrooms in a circle, mirroring the Fae Court building's own existing "ring of
      smaller toadstools" pattern). All reuse existing `FactionBlockTextures.ts` textures
      (`earthTexture`/`barkTexture`/`ashStoneTexture`/`toadstoolTexture`) already used by those
      same factions' own buildings, so dressing visually matches the architecture it surrounds.
- [x] `OverworldScene.ts`: `_settlementPositions` gained a `faction` field (populated at both
      existing push sites); a small pool of pre-built prop variants per batch-1 faction is built
      once at construction (`_buildTerritoryPropPool()`) and cloned (never rebuilt) at each
      qualifying scatter point; `_buildChunkScatter()`'s tree/rock loops call a new
      `_tryPlaceTerritoryProp()` helper that substitutes a territory prop instead of the normal
      tree/rock when a point falls within a settlement's territory and the gradient roll hits.
- [x] Tests: 9 `TerritoryDressing.ts` unit tests (probability bounds/monotonicity, nearest-
      settlement-wins, empty-list safety), 14 `FactionTerritoryProps.ts` tests (burrow-gap
      geometry, groundedness, relative sizing, material identity, mushroom-ring composite
      structure/determinism) — all pure `BlockGrid`/mesh-structure inspection, no rendering
      needed. Scene-level regression (chunk-scatter-alignment, chunk-terrain-alignment,
      drawcall-batching, chunk-collider-streaming, settlement-parity) all pass unmodified — no
      settlement-parity snapshot shift this time (territory dressing only changes scatter
      content, not settlement generation itself). Full project suite: the same 12 pre-existing
      baseline failures, zero new failures. `tsc --noEmit` steady at 144.
- [x] **Honest perf note**: placing territory props (even a *modest* amount — the gradient
      probability caps at 70% right at a settlement centre, fading to 0% at the territory edge)
      adds real, measurable per-scene-load cost when many settlements/chunks are involved — one
      pre-existing scene test's observed duration grew from ~5.7s to ~8.5s in a large
      (worldSize=512) scenario, tipping past its previous default timeout; the test's own timeout
      was extended (20s) to give solid margin rather than silently letting it flake. In isolation,
      the added logic itself is cheap (~20ms one-time prop-pool build, ~2ms per 5000 territory
      lookups measured directly) — the real cost is proportional to how many props actually get
      placed across a scene with many settlements/chunks, not a hidden inefficiency in the new
      code paths themselves.

### Phase 7 — Nature asset variety per biome
**Depends on:** Phase 1, independent of most other phases (can run in parallel).

Closes §1.4's "trees/rocks look the same everywhere" finding for the
*generic* (non-faction-territory) case — every biome should have its own
flora silhouette even far from any settlement.

**Tree archetype biome-correctness ✅ DONE (2026-08-30)** — pulled forward
ahead of the rest of Phase 4 at the user's request (bundled with the
ground-texture push). Design spec:
`docs/superpowers/specs/2026-08-30-nature-asset-biome-correctness-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-30-nature-asset-biome-correctness-plan.md`.

- [x] `NatureAssetDNA.ts`'s `pickTreeArchetype()`: added a `biome: BiomeId`
      parameter and a per-biome archetype table (`grassland`:
      deciduous/sparse, `forest`: conifer/deciduous, `taiga`: conifer-only,
      `tundra`/`mountain`/`snow`: sparse-only, `desert`: the new `cactus`
      archetype, `savanna`: the new `acacia` archetype) — each biome only
      ever picks from its own correct set via the existing deterministic
      hash technique, closing the "pine tree next to oak tree regardless
      of biome" mismatch. `pickRockArchetype()` deliberately left
      unchanged — a boulder/slab/cluster doesn't read as "wrong" in any
      biome the way a pine tree does in a desert (see design spec §2).
- [x] 2 new tree archetypes in `OverworldScene.ts`, same simple-primitive
      style as the existing 3: `_buildCactusTree()` (a saguaro-style
      vertical-cylinder trunk with 0-2 shorter cylinder "arms") and
      `_buildAcaciaTree()` (a short gnarled trunk topped by a single wide,
      shallow "umbrella" canopy cone) — closing the roadmap's two
      most-cited gaps (desert, savanna).
- [x] Related bug fixed alongside (discovered during investigation):
      `ScatterRules.ts`'s `isScatterAllowed()` only excluded
      ocean/deep_ocean **biome** tiles from tree/bush/rock placement, never
      checking `waterDepth > 0` — since Phase 3's lakes sit on ordinary
      land biomes (not a special water biome), trees/rocks could spawn
      directly inside a river or lake. Fixed with a generic
      `waterDepth > 0` check, mirroring the same signal already used by
      `WaterDetection.ts`/`TerrainGeometryBuilder.ts`.
- [x] Tests: `NatureAssetDNA.test.ts` updated for the new `(biome, wx, wz)`
      signature — determinism, "only picks from the biome's own allowed
      set" (the key new correctness property), "different biome at the
      same position yields a different archetype where the sets differ".
      New `ScatterRules.test.ts` case for the river/lake exclusion. Full
      project suite: same 12 pre-existing baseline failures on a clean
      targeted run of every directly-affected test file (79/79 passing);
      a full whole-suite run showed 3 additional failures, but all 3 were
      confirmed to be **timeouts** (not assertion failures) on tests that
      don't even touch the changed code (`WorldGenerator.test.ts`,
      `ResourceNodePlacer.test.ts`) — reproducible resource-contention
      artifacts of running the entire 165-file suite in parallel under
      this sandbox's load, not regressions (each passes cleanly with
      margin to spare in isolation). `tsc --noEmit` steady at 144.
- [x] Manual verification attempted via the established Playwright + dev
      server workflow across 5 seeds; the browser session hung
      indefinitely (6+ minutes with no response) under this sandbox's
      documented resource-contention pattern and was abandoned per this
      project's established fallback — shipped on the strength of the
      automated test coverage above, matching the same precedent set by
      Phases 2/3/4a when live verification was unavailable.

**Deferred (documented, not started):** grass clumps (the roadmap's
"2-variant short/tall" note refers to the Studio-only `TileDNA`/
`TileBuilder` system, not wired into the live game today — a larger,
separate effort to wire a new live scatter category); rock archetype
biome-differentiation; bush archetype variety; further snow/tundra/beach
tree tuning beyond reusing the `sparse` archetype (see design spec §2/§5
for the full reasoning on each).

### Phase 8 — Ground texture wiring
**Depends on:** nothing structurally, but sequence *after* Phase 2 if that lands, since sub-tile ramp geometry changes vertex layout/UV needs (texturing a flat single-quad tile vs. a multi-triangle ramp tile calls for slightly different UV emission, similar to how `BlockKit.ts`'s UV work had to account for both flat faces and the beveled `topBevel` collar band in one pass).

Closes §1.5/§1.6's finding: give live terrain real canvas textures using
the exact technique just proven out for buildings this session
(`BlockKit.ts`'s world-space-projected UV + `FactionBlockTextures.ts`'s
per-material canvas swatches, `color * map` tint-preserving multiply).

**Ground-texture wiring ✅ DONE (2026-08-30)** — pulled forward ahead of
Phase 4 at the user's request (bundled with a "make tiles look less
blocky/patchwork" push). Design spec:
`docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-30-ground-tile-texture-variety-plan.md`.

- [x] New `src/world/TerrainTextures.ts` (sibling to
      `FactionBlockTextures.ts`): tileable canvas textures for 10 covered
      variants — `beach`, `desert`, `savanna`, `grassland`, `forest`,
      `taiga`, `tundra`, `snow` (8 newly authored, same lazy-cache +
      `_wrap()` pattern), plus `mountain`/`river_bank` reusing the
      already-shipped `graniteTexture()`/`earthTexture()` as-is (bare rock
      and packed dirt already read correctly at ground scale — no new
      canvas needed). Ocean/deep_ocean/river/lake/river_ford stay on
      today's solid-color treatment (under the water surface plane,
      rarely fully visible) — an explicit, documented deferral, not an
      oversight.
- [x] `TerrainGeometryBuilder.ts`: new `groundGeometry` output (mirrors the
      existing `roadGeometry` per-variant buffer pattern), with a
      world-space-projected `uv` (same technique as `BlockKit.ts`) on all
      3 top-face code paths (flat/all-four-down, edge, ramp). Vertex color
      preserved per-vertex in `groundGeometry` too, so the material can use
      `color * map` (vertex tint × texture) exactly like buildings/roads.
      Walls stay vertex-color-only (explicitly deferred, see below).
- [x] `OverworldScene._loadTerrainChunk()`: one small
      `MeshStandardMaterial({map, vertexColors:true, ...})` mesh per
      ground-texture variant present in a chunk (mirrors the existing
      road-variant mesh loop — typically 1-4 extra draw calls per chunk,
      since biome patches are usually much larger than one 16×16-tile
      chunk). Physics collider merge extended to fold in every
      `groundGeometry` variant's triangles alongside the existing
      road-variant merge, plus full `TerrainChunkData` lifecycle wiring
      (enter/exit visibility toggling, unload disposal) mirroring
      `roadMeshes` exactly.
- [x] Tests: new `TerrainTextures.test.ts` (4, structural-only per the
      established `FactionBlockTextures.test.ts` convention), 7 new tests
      in `TerrainGeometryBuilder.test.ts` (variant routing + UV
      correctness for flat/edge/ramp shapes, uncovered-biome fallback).
      **Important discovery during implementation**: the plan's
      assumption that "every pre-existing test continues to pass
      unchanged" was wrong for tests using a bare `new WorldGrid(...)`
      with no explicit biome — `'grassland'` is the default biome AND one
      of the 10 covered variants, so many pre-existing wall/corner-jitter/
      chunk-sub-rectangle tests that implicitly relied on a flat tile's
      top face landing in the base buffer needed updating (their real
      testing intent — total geometry emitted, wall presence, corner-jitter
      seam matching — was unaffected by *which* buffer a face lands in, so
      these were fixed to sum across the base buffer and
      `groundGeometry.grassland` rather than weakened). One test
      (`OverworldScene.chunk-scatter-alignment.test.ts`) needed the same
      treatment at the scene level — its terrain-mesh bounding-box check
      only looked at `mesh` (the base buffer), missing the new
      `groundMeshes`; fixed to union both. Full project suite: same 12
      pre-existing baseline failures, zero regressions. `tsc --noEmit`
      steady at 144.
- [x] Perf check: chunk-build-time benchmark (64 mixed-biome 16×16 chunks
      at worldSize 512, comparing a temporary pre-Phase-4a `git worktree`)
      showed no measurable regression — both before (~0.53 ms/chunk avg)
      and after (~0.55 ms/chunk avg) fall within normal run-to-run
      measurement noise (~15-20% spread across repeated runs of the *same*
      code), reported honestly rather than rounded to a false "improvement"
      or downplayed as flat.
- [x] Manual verification: live Playwright session against the dev server
      confirmed the overworld loads, runs (`forceTick`), and renders with
      zero console/page errors using the new textured ground meshes; full
      visual screenshot capture repeatedly timed out under this sandbox's
      documented WebGL-compositing resource contention (a recurring
      environment limitation this session, unrelated to the code change)
      even at 90s — reported honestly as an open follow-up rather than
      claimed as done, per this project's established precedent (Phase 2
      shipped the same way).

**Deferred (documented, not started, tracked for a later pass):**
- `roadTexture(biome)` — a per-biome (not just per-faction) road surface
  texture set (worn cobblestone, packed dirt/gravel, forest trampled-earth,
  desert hard sandy track, bog corduroy) was scoped in this section's
  original bullet list but is a separate body of work from ground-texture
  wiring; `RoadTextures.ts` still only varies by faction/generic/bridge.
- Textured walls (vertical elevation-step faces) — stay vertex-color-only.
- Biome-transition blending at borders — tracked under Phase 4 "organic
  biome transitions", a natural follow-on once base ground textures exist.
- Literal geometric sub-tile subdivision for ground (the road-style N×N
  per-tile classification) — considered and explicitly rejected for the
  *initial* ground-texture-wiring pass (see the design spec §2) on
  performance grounds; texture-only variety via world-space UV was judged
  sufficient for the "less blocky" goal at a fraction of the geometry cost.
  **Revisited and shipped as a follow-up pass, see below.**
- The Studio-preview-only `TileBuilder.ts`/`TileDNA.ts` system remains
  unintegrated with the live renderer's new texture system, as originally
  scoped (different problems, not worth force-unifying).

**Ground sub-tile system (bumps + micro-patches) ✅ DONE (2026-09-01)** —
follow-up pass, requested after live feedback that ground still read as
patchwork-blocky at typical camera distance despite Phase 4a's texture
variety. Design spec: `docs/superpowers/specs/2026-09-01-ground-subtile-system-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-01-ground-subtile-system-plan.md`.
Reverses the earlier "texture-only, no subdivision" call above — the user
explicitly chose literal geometric sub-tile subdivision this time,
accepting a real performance cost, after being shown that subdividing an
already-planar quad delivers zero texture benefit by itself (world-space
UV is already GPU-interpolated per-fragment regardless of triangle count)
— real value only comes from genuine per-sub-tile height variation or
discrete per-sub-tile material switching, so this pass adds both.

- [x] `subTileBumpJitter(worldX, worldZ)` — new seamless per-lattice-point
      height bump (±0.06 WU, double the old per-tile `cornerHeightJitter`'s
      ±0.03 WU), keyed by absolute world position (same bit-mixing hash
      technique, scaled/truncated to integers first) so any two sub-tile
      quads sharing a lattice point — adjacent sub-tiles within one tile,
      or adjacent tiles sharing a real corner — always agree, never seaming.
- [x] `_subTileGroundVariant(...)` — per-sub-tile texture variant
      resolution: border dithering (S→N→E→W priority order, ~40% pull
      probability, restricted to the outermost sub-tile row/column facing
      a differing neighbor) then a low-probability (~6%) micro-patch swap
      via a `MICRO_PATCH_VARIANTS` table reusing Phase 4a's existing 10
      textures (grassland→river_bank, forest/taiga→mountain,
      savanna→desert, tundra→snow), else the tile's own variant.
- [x] `emitGroundSubTiles()` wired into the flat/all-four-down and edge
      top-face branches only — a 4×4 sub-tile grid (`GROUND_SUBDIVISIONS`,
      matching roads' existing `N=4` convention) replacing each single
      quad, each sub-tile's height bilinearly interpolated from the tile's
      real (pre-jitter) corner heights plus the new bump. **Explicitly
      scoped out, unchanged**: ramp shapes (single-corner/outer-corner/
      saddle, ~6% of tiles) stay non-subdivided since their 2-triangle
      diagonal-split geometry from Phase 2 is genuinely non-planar (bilinear
      interpolation of 4 corners would only be an approximation there, not
      exact) — confirmed with the user as a deliberate boundary keeping
      this pass 100% additive to already-shipped Phase 2 code. Tiles with
      partial road coverage are also unaffected (already have their own
      dedicated road/ground sub-tile path from an earlier phase).
- [x] Tests: 4 new tests for `subTileBumpJitter` (determinism, bounded
      range, non-constant, cross-lookup seamlessness), 5 new tests for
      `_subTileGroundVariant` (own-variant fallback, outermost-row/column-
      only border pulls, no-pull-toward-same-variant, determinism,
      micro-patch rate bounds), 4 new tests in the wiring task (16×
      sub-tile count for an isolated flat tile, shared-edge seamlessness
      by exact vertex index, border-pull presence across a multi-tile
      boundary, ramp-shape exclusion). **Migration**: every pre-existing
      test whose fixture was a flat/edge covered-biome tile (commonly the
      default `'grassland'` biome) needed its expected face/vertex counts
      multiplied by 16 (`GROUND_SUBDIVISIONS²`) — larger blast radius than
      Phase 4a's own migration but the same underlying technique (sum
      across buffers via `totalPositionsLength()`/`totalIndicesLength()`/
      `allNormals()` where the test's real intent was total geometry, not
      a specific buffer). **A second, more subtle migration issue emerged**:
      several exact per-variant-buffer assertions (not just per-tile-shape
      counts) broke because `'grassland'`'s micro-patch entry
      (`river_bank`) can legitimately redirect a handful of a tile's 16
      sub-tiles to a different buffer even with no differing neighbor —
      this is the *intended* texture variety working, not a bug, so those
      assertions were fixed to sum across every `groundGeometry` variant
      rather than assuming zero patches ever fire. Full project suite:
      same 12 pre-existing baseline failures + the same 2 already-documented
      sandbox-contention timeout flakes (`OverworldScene.chunk-scatter-alignment.test.ts`,
      `ResourceNodePlacer.test.ts` — both re-confirmed passing cleanly in
      isolation), zero real regressions. `tsc --noEmit` steady at 144.
- [x] Perf check: same temporary-`git worktree` methodology as every prior
      phase, benchmarking a realistic mixed-biome 16×16 chunk (8 biomes,
      elevation variety for edge/ramp shapes, a river cutting through).
      **Real, substantial cost as expected and explicitly accepted by the
      user** — chunk-build time went from ~0.49 ms avg (baseline, pre-this-pass)
      to ~1.97-2.0 ms avg (with the sub-tile system), a consistent ~4×
      increase confirmed across repeated runs on both sides. Reported
      honestly per this project's established precedent — not rounded
      favorably or downplayed. Still fast in absolute terms for a
      per-chunk-load (not per-frame) cost; the user was told upfront this
      would be a real, larger cost than Phase 4a's and explicitly said "no
      time constraints, take your time."
- [x] Manual verification: live Playwright session against the dev server
      confirmed the overworld generates, starts, switches to the exterior
      scene, and runs (`forceTick(60)`) with **zero console/page errors**;
      the `goExterior()` screenshot captured successfully and shows
      visible ground texture dithering (small tan/reddish micro-patches in
      the grass) at the starting settlement. A second post-tick screenshot
      attempt repeatedly timed out under this sandbox's documented
      WebGL-compositing resource contention (same recurring environment
      limitation flagged in every prior phase, unrelated to this code
      change) — reported honestly as an open follow-up (fine per-sub-tile
      bump detail at 0.06 WU amplitude was not independently confirmed
      visually beyond the one successful screenshot) rather than claimed
      as fully verified.

### Phase 9 (stretch, reassess after Phases 1-8) — World-package/ambient/reward-ecology follow-through
**Depends on:** most of the above; lowest priority, only pursue if time remains.

Folds in the still-open TODO items that are *adjacent* to this overhaul but
not required for it to ship — listed here so they aren't silently dropped,
per the instruction to check TODO docs for similar planned work:
- `PROC-C-world-generation.md`'s **WG-3 Overworld Ambient Plan** (per-biome
  ambient creature spawn lists — forest deer/rabbits, bog frogs/will-o-wisps,
  mountain eagles/goats) — a natural fit once Phase 1's `mountain` biome and
  Phase 7's per-biome nature variety exist, since it's the same
  "biome → thematic content" pattern applied to fauna instead of flora.
- `PROC-C-world-generation.md`'s **WG-4 material-family-by-biome
  distribution** (botanical/mineral/monster-derived/arcane resource
  ecology) — deferred; this is really a crafting/economy-system concern
  that happens to be keyed by biome, not a terrain-rendering concern, so it
  belongs to whichever future session picks up `06-game-systems/alchemy-
  transmutation-crafting.md` rather than this overhaul.
- `environment-art-system.md`'s **5.6 World Editor Integration** ("paint
  mode: paint tiles/props in code-first mode") — only makes sense after
  Phase 2/8 land (nothing meaningful to paint with otherwise).
- `realm-integration.md`'s **RI-1 LOD** (3 detail levels by camera
  distance) and **RI-4's actual `OverworldScene.ts` chunk-manager wiring**
  (the pure `ChunkManager.ts` class is done, but nothing calls
  `chunkManager.update()` from the live scene tick yet) — worth revisiting
  once Phase 2's sub-tile geometry raises the live per-chunk triangle
  count, since LOD/streaming becomes more valuable exactly when geometry
  gets heavier.

## 4. Test strategy

- Unit-test every pure-data/pure-geometry change first (Phases 1-4, 7-8 are
  all pure-function-testable, matching this project's established TDD norm
  — see `BlockKit.ts`'s UV work this session for the exact template: red
  test → minimal implementation → green → regression sweep of dependent
  suites → `tsc --noEmit` baseline check).
- Phase 2 (TerrainKit) additionally needs a "no cracks between adjacent
  tiles" geometric-integrity test, not just per-tile shape correctness —
  the shared-corner-lattice-coordinate technique already used by
  `cornerHeightJitter()` is the template.
- Every phase that touches rendering needs a live Playwright visual pass
  through the Overworld Lab (once `2026-08-30-overworld-lab.md` ships) —
  that feature exists specifically to make this kind of verification fast,
  since it boots the exact realm being tested without going through character
  creation/tower intro first.
- No unverified completion claims: every phase's "Status: DONE" writeup
  must show real test-run output and describe what was actually visually
  confirmed (screenshots), per this project's established discipline.

## 5. Open calibration notes (not blocking, tune during implementation)

- Exact new elevation level count / `LEVEL_HEIGHT` value (Phase 1) — pick
  via playtested screenshots, not a priori.
- Exact `mountain` biome elevation/temperature thresholds (Phase 1).
- Exact per-faction biome affinity weights (Phase 5) — the suggested list
  above is a starting hypothesis, not a spec.
- Direction of Phase 3's hydrology unification — resolved 2026-08-31: kept
  `HydrologyGenerator`'s grid algorithm (extracted to shared `RiverFlow.ts`)
  and retired Studio's independent probabilistic-spline block; confirmed
  via live Playwright screenshot + canvas pixel sampling, not just unit
  tests.
