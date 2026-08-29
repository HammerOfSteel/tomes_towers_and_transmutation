# Settlement Visual Fidelity — roads, spacing, cardinal rotation, race decor

Status: planned, not yet implemented (this doc is the plan; execution happens
on a new branch off `main` per session decision).

## 1. Problem statement

After the building-density fix (`SettlementGenerator.ts`'s `WIDTH_HEIGHT_SCALE_FACTOR`,
landed in PR #38), "Play in 3D" now places the *correct number* of buildings
per settlement, matching Studio's 2D ward map. But visually it now looks
worse in three specific ways the user called out from a screenshot (seed
`445176186`, village/human):

1. **No visible road/street network.** Studio's 2D map shows a clear hub
   with roads branching to each ward, and open space between ward polygons.
   The 3D Lab shows none of that — buildings crowd right up against each
   other with no discernible streets.
2. **Buildings are too close together** — walls touching/overlapping,
   making it hard to tell where the player is, especially bad with the
   fixed isometric camera (no occlusion / see-through-roofs system exists).
3. **Building rotation looks odd.** Buildings are rotated to arbitrary
   continuous angles (whatever `fillWard()`'s edge-following algorithm
   picked in 2D-map/pixel space), which reads as "wrong" in a fixed iso
   view where players expect building faces aligned to camera-relative
   cardinal axes (0°/90°/180°/270°), like classic isometric RPGs
   (Diablo, Baldur's Gate, Divinity: Original Sin, Pillars of Eternity).

### Root cause (confirmed via code reading + repro screenshot)

`fillWard()` (`SettlementModelGenerator.ts`) already computes buildings with
real spacing (`BLDG_GAP`/`STREET`/`ROW_GAP` constants, 3-6px) and real road
clearance in **continuous pixel space** — the underlying algorithm is fine.
The problem is introduced entirely downstream, in `planSettlement()`
(`SettlementGenerator.ts`):

- Every building's continuous pixel position (`rect.x`, `rect.y`) is
  `Math.round()`-ed straight to an **integer WorldGrid tile** (`col`, `row`)
  via `SETTLEMENT_MODEL_SCALE`. Since `WIDTH_HEIGHT_SCALE_FACTOR=3` made the
  working canvas 3x bigger in pixel space while keeping the final tile
  footprint the same size (by design, to avoid inter-settlement overlap),
  each tile now spans ~3x more source pixels than before. Multiple distinct,
  properly-spaced-in-pixel-space buildings now round down to the same or
  adjacent tiles far more often, collapsing `fillWard()`'s real spacing.
- `PlacedBuilding` only stores integer `col`/`row` — the sub-tile fractional
  remainder (i.e. exactly the spacing information `fillWard()` computed) is
  discarded by the rounding and never reaches the renderer.
- Rotation (`rect.angle`) is copied through untouched
  (`SettlementRenderer.ts`: `grp.rotation.y = b.rotation`) — no cardinal
  snapping anywhere in the pipeline.
- Roads are rasterized to **discrete tile quads** (`rasterizeRoads()` +
  `SettlementLabScene._regenerate()`'s flat `PlaneGeometry` per road tile,
  cross-dilated by 1 tile in each direction) instead of being drawn as a
  continuous ribbon from the original Chaikin-smoothed pixel-space points —
  at high building density, these tiny flat tiles are easily crowded out or
  visually lost among densely packed buildings.
- Buildings and roads are computed **independently** from the same
  underlying `model` (buildings via `fillWard()`, roads via `model.roads`)
  and are never cross-checked against each other once mapped to the tile
  grid — nothing stops a building's post-rounding tile from landing on/next
  to a tile a road "wants."

None of this is a `SettlementPlacer.ts`/live-overworld-specific bug — it's
the shared `planSettlement()`/`SettlementRenderer.ts` pipeline, so a fix here
benefits both the Settlement Lab and the live overworld town/village
rendering.

## 2. Goals / non-goals

**Goals:**
- Buildings render at (approximately) the same relative spacing `fillWard()`
  already computed in pixel space — no more touching/overlapping walls.
- A real, visible road/street network renders in 3D, following the same
  hub-and-ward topology visible in Studio's 2D map (main streets wider than
  alleys, as SI-2 already established for the separate `SettlementSpawner`
  pipeline).
- Buildings face one of 4 cardinal directions (0°/90°/180°/270°) relative to
  world axes, consistent with iso-camera genre conventions, while still
  roughly respecting the ward-edge-facing intent (a building that
  `fillWard()` oriented "facing" a street on the ward's south edge should
  end up facing the *nearest cardinal direction* to that original angle,
  not a fixed default).
- A first *organic prop/decoration* pass so settlements read as lived-in per
  race, not just "buildings + empty ground" (full per-race asset library is
  a separately phased, larger content effort — see §6).
- No change to `SettlementPlacer.ts`'s inter-settlement spacing guarantees —
  this is a rendering/local-layout fix, not a footprint-size change.
- Existing collision/walkability/grid bookkeeping (`applySettlementToGrid`,
  NPC spawn positions, building interiors keyed by `col`/`row`) keeps
  working unchanged — sub-tile visual position is purely additive.

**Non-goals (explicitly deferred):**
- Full occlusion/roof-fade system for the iso camera (a `camera-systems`-
  skill-territory feature: e.g. hide/transparent roofs near the player) —
  better spacing removes most of the practical problem; a dedicated
  roof-cutaway pass is listed as a stretch/Phase 4 item, not required for
  this plan to be considered done.
- Rebuilding `SettlementSpawner.ts`'s independent ring/spoke pipeline (SI-1/
  SI-2) — that's a deliberately simpler, unrelated system per its own doc
  comments; out of scope here.
- Redoing `RealmToTerrain.ts`/parity work (`STUDIO-LIVE-PARITY.md`) — this
  plan only touches settlement building/road/prop rendering.

## 3. Design decisions (made autonomously, per session instruction)

### 3.1 Sub-tile continuous offset for buildings (fixes spacing)

Add two new fields to `PlacedBuilding`: `offsetX: number`, `offsetZ: number`
— the **fractional remainder**, in world units, between the true continuous
mapped position and the rounded tile center it snapped to (before any
`snapBuildingTile()` collision-avoidance nudge; the offset is relative to
whatever tile the building's rect *originally* wanted, re-based onto
wherever `snapBuildingTile()` actually placed it, clamped to a fraction of a
tile so it can never visually escape its own tile+neighbor space).

- `planSettlement()` computes `offsetX/offsetZ` from the same
  `(rect.x - centreX) * SETTLEMENT_MODEL_SCALE` value's fractional part
  (i.e. `value - Math.round(value)`, times `TILE_UNIT`), independently in
  each axis.
- `_noOverlap()`/`snapBuildingTile()` continue to operate purely on integer
  `col`/`row` — **zero behavior change** to collision-avoidance, grid
  walkability, or `SettlementPlacer.ts` spacing.
- `SettlementRenderer.ts` adds the offset on top of the tile-quantized world
  position: `wx = (b.col - ghw) * T + b.offsetX`, same for `wz`.
- Net effect: buildings render close to `fillWard()`'s real computed
  layout (which already has correct gaps) instead of being snapped dead-
  center onto a coarse grid — directly fixes "too close together" without
  touching any gameplay-affecting system.
- As an additional safety margin (in case several buildings' fractional
  offsets still place them uncomfortably close after rounding-collapse),
  bump `_noOverlap()`'s `padding` parameter default from `1` to `1.5` tiles
  — cheap, low-risk, gives a bit more guaranteed breathing room on top of
  the offset fix.

### 3.2 Cardinal rotation snapping (fixes odd rotation)

Add a small pure helper, `snapToCardinal(radians: number): number`, in
`SettlementGenerator.ts`:

```ts
function snapToCardinal(radians: number): number {
  const QUARTER = Math.PI / 2;
  return Math.round(radians / QUARTER) * QUARTER;
}
```

Apply it once, at the point `PlacedBuilding.rotation` is set in
`planSettlement()` (`rotation: snapToCardinal(rect.angle)`), not at render
time — so every consumer (`SettlementRenderer.ts`, any future physics
collider alignment, tests) sees the already-snapped value, no
double-snapping or drift.

This preserves "faces roughly toward its ward-edge intent" (round-to-
nearest, not a fixed default) while guaranteeing exactly 4 possible facings,
matching the genre convention the user described.

### 3.3 Roads as a continuous ribbon (fixes invisible roads)

`rasterizeRoads()` stays as-is for the **grid bookkeeping** path
(`RoadSegment[]` feeding `applySettlementToGrid()`'s `feature: 'road'`
tile-marking — walkability/pathing still coarse-tile-based, unaffected).

Add a second, parallel output on `SettlementPlan`: `roadRibbons:
RoadRibbon[]`, each carrying the *original, unrounded* pixel-space point
list for one `model.roads[]` entry (converted to continuous world units via
`SETTLEMENT_MODEL_SCALE`, no `Math.round()`), plus a `width` derived from
whether the road connects to an anchor ward (reusing the existing
`MAIN_ROAD_KINDS`-equivalent judgement already established in SI-2's
`SettlementRoadMesh.ts` — main street 2 WU, alley 1 WU).

`SettlementRenderer.ts` (and `SettlementLabScene.ts`'s cleanup path) builds
one quad-strip ribbon mesh per `RoadRibbon` (same technique as
`RealmRiverMesh.ts` / `SettlementRoadMesh.ts` — perpendicular-offset quad
strip along the point list, textured with the existing
`cobblestoneTexture()`) instead of the current per-tile flat quads. This:
- Is visually continuous (no gaps at tile boundaries, no z-fighting risk
  from overlapping per-tile quads),
- Reads clearly as a "street" even in a crowded scene (a ribbon has real
  width and a distinct paved texture, vs. a small isolated flat quad),
  and
- Naturally motivates ward-based decoration placement rules in §6 (props
  placed relative to a road ribbon's edge, e.g. market stalls lining a
  street).

Road-vs-building precedence: since buildings now use the sub-tile offset
(§3.1) and roads are drawn as continuous ribbons independent of the tile
grid, occasional close approaches between a building wall and a road ribbon
are visually acceptable (real towns have buildings right up against
streets) — no additional exclusion logic needed for this phase.

### 3.4 Building-count-vs-footprint tension (documented, not changed here)

The building density fix intentionally kept the same world-tile footprint
(to preserve `SettlementPlacer.ts`'s `MIN_DIST_*` spacing guarantees) while
tripling building count. §3.1-3.3 make the *existing* footprint look
correct by using the sub-tile space that was already there but discarded —
they do not enlarge settlements. If, after implementing and visually
verifying, city-type settlements *still* feel overcrowded even with correct
sub-tile spacing (most likely for `city`, which had the worst building-drop
rate in PR #38's testing — 9.6% overall, 15.8% worst-seed, i.e. already at
the edge of fitting), the next lever is enlarging `PARAMS_BY_TYPE`'s
`width`/`height` further **and proportionally increasing
`SettlementPlacer.ts`'s `MIN_DIST_CITY`** so footprints grow without
introducing inter-settlement overlap risk. This is called out explicitly
as a fallback, not attempted preemptively, since §3.1's offset fix may
already be sufficient — verify visually first (Phase 1, step 4 below).

## 4. Race-themed settlement decoration — content plan (Phase 2)

### 4.0 Course correction — ward *manifestation*, not just palette (read this first)

**Revised understanding, superseding the "shared shape + palette" framing
below where the two conflict.** The Settlement Studio's own
`FACTION_WARD_NAMES` table (`overworld-studio.ts`) already establishes that
a ward isn't just a differently-colored building per faction — it's a
**different kind of place** per faction, with different geometry, different
nature (built structure vs. natural/organic feature), and different props
entirely. Concretely (from `FACTION_WARD_NAMES`, this is the actual source
of truth — read it before touching anything in this phase):

| Ward     | human (fallback) | elven          | dwarven        | orcish        | vampire          | undead          | vulperia         | slime          | fae               |
|----------|-------------------|----------------|----------------|---------------|------------------|-----------------|------------------|----------------|-------------------|
| `park`   | Village Green     | Sacred Grove   | Mushroom Hall  | Pit Arena     | Moon Courtyard   | Graveyard       | Burrow Commons   | Slime Pool     | Enchanted Glade   |
| `market` | Market            | Moonlit Exch.  | Trade Vault    | Loot Pile     | Blood Market     | Wraith Bazaar   | Night Market     | Goo Stall      | Twilight Market   |
| `patriciate` | Manor Row     | Elder's Hall   | Guild Hall     | Warlord Hall  | Count's Tower    | Lich Tower      | Fox Den          | Elder Blob     | Fae Court         |
| `church` | Chapel            | Ancient Shrine | Stone Temple   | War Shrine    | Blood Chapel     | Bone Shrine     | Den Mother's Hall| Pulse Pool     | Faerie Ring       |
| ...      | (see `WARD_TO_KIND`/`FACTION_WARD_NAMES` for the rest — smithy, inn, merchant, farm, craftsmen, slum, gateward) |

A **Slime Pool** and a **Sacred Grove** must not share geometry, silhouette,
or material — one is a literal pond of goo with bubbling ooze mounds around
its rim, the other is a ring of ancient trees around a standing stone. A
**Wraith Bazaar** (skeletal stalls, bone lanterns, tattered banners) and a
**Night Market** (den-mouth stalls, string lanterns, pelts/trinkets) are both
"market wards" but should look nothing alike. This is the actual bar for
"feels like that race's settlement," and palette-only variation (§4.2-4.3
below, kept for the props that legitimately *are* palette-appropriate, like
crates/barrels/fences) does not clear it on its own for these ward-defining
structures.

**Two manifestation modes per (faction, wardType):**
1. **Building-variant** — still a real building (has walls/roof/interior),
   but faction-specific `BuildingKind`/silhouette, not just a recolored
   generic shape (e.g. Fox Den = earthen dome/burrow structure with a round
   doorway, not a villa with orange paint; Lich Tower = a gaunt, narrow
   stone spire, not a villa with grey paint).
2. **Feature-cluster** — not a building at all: a themed arrangement of
   procedural props with no interior/collider-as-building (a pond mesh +
   goo-mound props for Slime Pool; a tree ring + standing stone + firefly
   motes for Sacred Grove; a tombstone field + small mausoleum for
   Graveyard). This is the new piece — `park` wards currently render
   **nothing** (`WARD_TO_KIND['park']` is `null`, so `planSettlement()`
   skips them entirely today), making `park` the natural, lowest-risk first
   target: there's no existing behavior to preserve, and it's exactly the
   ward the user called out (Slime Pool vs. Sacred Grove).

**Scoping decision for this pass (Phase 2a, executed now):** implement the
**feature-cluster** system end-to-end for the **`park` ward**, covering all
9 factions (`human` fallback included), since `park` is a real, currently-
blank gap with zero regression risk and directly answers the user's
Slime-Pool-vs-Sacred-Grove ask. **Explicitly deferred as Phase 2b/2c**
(separately scoped, larger effort — new `BuildingKind` variants touch the
building/interior/collider pipeline, not just rendering):
- Faction-specific **building-variant** silhouettes for `patriciate`
  (Fox Den, Lich Tower, Count's Tower, Elder Blob, Fae Court, Warlord Hall,
  Guild Hall, Elder's Hall) and `market` (Wraith Bazaar, Night Market, Goo
  Stall, etc.) — these still need real building geometry (walls, doors,
  possibly interiors), which is a `BuildingBuilder.ts`/`BuildingDNA.ts`
  scope, not a `SettlementRenderer.ts` scope.
- The generic prop shape library (§4.2-4.4 below) for market/craftsmen/slum
  clutter — still valid as designed, and composes with Phase 2a (a market
  ward can have both faction-flavored stalls *and* generic crates/barrels).

### 4.0a Phase 2a design — park-ward feature clusters

- New module `src/world/props/WardFeatureClusters.ts`: one procedural
  builder function per faction, `buildParkFeature(faction, seed): THREE.Group`,
  each producing a self-contained, seeded, no-interior/no-collider prop
  cluster (reuses `mulberry32` seeding + `MeshStandardMaterial` primitives,
  matching `BuildingBuilder.ts`'s existing style so it fits visually):
  - **human** (`Village Green`, fallback — `FACTION_WARD_NAMES` has no human
    entry so the Studio shows the generic `WARD_LABELS['park']` label,
    "Park"): a well + a couple of benches + a shade tree — plain, homely.
  - **elven** (`Sacred Grove`): a ring of tall stylized trees around a
    tilted standing stone, with small emissive "firefly" motes.
  - **dwarven** (`Mushroom Hall`): a cluster of oversized stone-toned
    mushrooms + a stone bench ring — underground-cavern flavor, not
    surface-forest.
  - **orcish** (`Pit Arena`): a sunken circular pit ringed by log
    spectator-benches, with a central bone/trophy totem stake.
  - **vampire** (`Moon Courtyard`): a dark ornate fountain/basin centerpiece
    with thin hedge-wall segments framing it.
  - **undead** (`Graveyard`): a scatter of tombstones (varied heights) around
    a small stone mausoleum, with a broken iron fence.
  - **vulperia** (`Burrow Commons`): a cluster of earthen dome burrow-mound
    entrances (dark doorway discs) around a central totem/marker post.
  - **slime** (`Slime Pool`): a circular pool of translucent green-glow
    "goo" (flattened cylinder, emissive material) ringed by a few small
    squashed-blob mounds; a couple of rising bubble spheres for motion read.
  - **fae** (`Enchanted Glade`): a ring of giant glowing mushrooms +
    a faint torus "fae ring" on the ground + tiny lantern motes.
- `SettlementPlan` gains `wardFeatures: WardFeaturePlacement[]`
  (`wardType`, `col`, `row`, `offsetX`, `offsetZ`, `seed`) — populated in
  `planSettlement()` for any ward where `WARD_TO_KIND[ward.type]` is
  falsy (currently only `park`; the field is generic so Phase 2b's future
  faction building-variants for `market`/`patriciate` can reuse the same
  plumbing if they turn out not to need the full building/interior
  pipeline after all).
- `renderSettlementPlan()` gains a `featureGroups: THREE.Group[]` loop
  parallel to the buildings loop, dispatching to
  `buildParkFeature(faction, wardType, seed)`. `SettlementLabScene.ts` /
  `OverworldScene.ts` add + dispose `featureGroups` the same way they
  already do `buildingGroups`.
- Batch through `mergeGroupMeshesByMaterial()` per cluster, same
  draw-call discipline as buildings (each settlement has at most one park
  ward, so this is a small, bounded addition to draw calls).

### 4.1 Best-practice grounding


Procedural settlement "aliveness" in successful genre games (Banished,
Cities: Skylines, Kenshi, Divinity: Original Sin's isometric towns, Dwarf
Fortress) consistently comes from a small number of recurring techniques,
which this plan adopts:
- **Ward-typed prop tables, not per-building randomness** — props are
  chosen by *ward type* (market/craftsmen/inn/slum/patriciate/etc., already
  modeled via `WARD_TO_KIND`), not per-building, so a market ward reliably
  gets stalls/crates/barrels regardless of which specific building anchors
  it.
- **Faction palette + motif, not faction-specific geometry per prop** —
  reuse one shared low-poly prop *shape* library (crate, barrel, market
  stall frame, well, fence post, banner pole, statue plinth, cart) and vary
  *texture/color/motif* per faction (wood tones, banner sigils, stonework
  style) — much cheaper to build and maintain than fully bespoke geometry
  per faction, while still reading as thematically distinct (this mirrors
  how `BuildingBuilder.ts`/`TextureFactory.ts` already handle faction
  variation for buildings themselves).
- **Density scales with ward "liveliness"**: market/inn/craftsmen wards get
  the most props (stalls, crates, barrels, hitching posts); patriciate gets
  fewer but higher-quality props (statues, manicured plants, wrought fences);
  slum gets clutter (broken carts, drying laundry lines, scattered debris)
  — variety in *prop selection*, not just density, is what reads as
  "organic" rather than "randomly scattered."
- **Placement anchored to existing geometry, not free-floating** — props
  cluster near a ward's anchor building or along a road ribbon edge (§3.3),
  echoing how real market stalls line streets and well/statues sit in
  plazas — never placed via pure ward-polygon-uniform-random scatter
  (which reads as messy, not organic).
- **A capped prop-density budget per settlement type** (village/town/city)
  to keep draw-call counts bounded — reuse the existing
  `mergeGroupMeshesByMaterial()` batching (`MeshMergeUtils.ts`) for props
  the same way buildings/scatter already are, so this doesn't reintroduce
  the sub-7fps regression the density fix risks compounding.

### 4.2 Shared prop shape library (new, `src/world/props/SettlementPropFactory.ts`)

A small set of parametric, low-poly prop builders (each returns a
`THREE.Group`, styled by a `PropStyle` param — color/texture only, not
different geometry per style):
- `makeCrate()`, `makeBarrel()` — market/craftsmen/slum clutter.
- `makeMarketStall()` — a frame + cloth-canopy quad + optional produce/goods
  quads on the counter; canopy color/pattern driven by `PropStyle`.
- `makeWell()` — for plaza/market wards without a dedicated well building.
- `makeFencePost()`/`makeFenceSegment()` — patriciate/farm-ward boundary
  fencing; ribbon-style like roads (posts + rail segments along a path).
- `makeBannerPole()` — faction sigil banner (reuses/extends existing
  faction color palette already defined for buildings).
- `makeStatuePlinth()` — patriciate/plaza centerpiece (plinth + a simple
  primitive "statue" silhouette — not a sculpted figure, keep budget low).
- `makeCart()` (whole + "broken"/tipped variant for slum wards).
- `makeHitchingPost()` — inn/tavern ward.
- `makeWashingLine()` — slum/craftsmen ward clutter (a rope + a few flat
  cloth quads).
- `makeRacePlanterOrTotem()` — the one deliberately per-race-distinct prop:
  elven (a small tree/vine trellis), dwarven (a carved stone marker/rune
  post), orcish (a trophy/bone totem), undead/vampire (a wilted-plant urn or
  small gravestone), vulperia/slime/fae (left as an open, documented
  placeholder — these factions don't yet have established visual identities
  in `TextureFactory.ts`/`BuildingTypeMap.ts` beyond a color, so their
  specific totem motif should be decided together with whoever next extends
  faction art direction, not invented in isolation here).

### 4.3 `PropStyle` per faction (extends existing faction color work)

Reuse whatever palette/tone source `BuildingBuilder.ts`/`TextureFactory.ts`
already resolve per `Faction` (confirm exact hookup during implementation —
likely `mapStudioFactionToRuntimeFaction` + an existing faction-color table)
rather than inventing a second, divergent palette system. Add a
`PropStyle` per faction only where art direction doesn't already exist:
- **human**: warm wood/wheat tones, plain cloth banners.
- **elven**: pale wood, green/gold cloth, leaf motifs on canopies.
- **dwarven**: iron/stone tones, angular geometry hints, runic banner
  patterns (reuse a simple procedural rune-glyph texture if one already
  exists in `TextureFactory.ts`; otherwise a flat color + border pattern).
- **orcish**: dark wood, hide/leather canopy color, crude/asymmetric prop
  jitter (slightly more rotation/position noise than other factions —
  "orcish crude construction" read).
- **vampire/undead**: desaturated/grey palette, tattered cloth, replace
  "produce on stall counter" props with plainer/empty counters (no fresh-
  food motif fits undead settlements).
- **vulperia/slime/fae**: start from a neutral/human-adjacent palette with
  a single distinct accent color per faction (already likely established
  for buildings) — flagged in §4.2 as needing a follow-up art-direction
  decision for a truly distinctive totem prop.

### 4.4 Placement algorithm (per settlement, after buildings + roads exist)

1. For each `ward` in the settlement's `model.wards` (already available in
   `planSettlement()`'s scope), look up a **prop table**: `WardType ->
   { propKind, weight, count-by-settlement-type }[]` (a new const map next
   to `WARD_TO_KIND`, e.g. in `buildingToDungeonPlan.ts` or a new
   `WardPropTable.ts`).
2. For each prop entry, sample `count` positions along that ward's fill
   pattern: prefer positions near (a) the ward's anchor building's front
   face (the side facing the nearest road ribbon, using the same cardinal-
   snapped rotation from §3.2 to know which side is "front"), or (b) a
   point along the nearest road ribbon's edge offset by a small fixed
   distance, chosen via the ward's own PRNG stream (seeded from the
   settlement seed + ward id + prop index, matching the existing
   determinism convention used throughout this codebase).
3. Reject any candidate position that overlaps an existing building
   footprint or another already-placed prop (reuse a lightweight variant of
   the existing `_noOverlap()` padding check, scoped to props only).
4. Batch all prop meshes per settlement through
   `mergeGroupMeshesByMaterial()` before adding to the scene (same
   draw-call discipline as buildings/scatter).

### 4.5 New data flow

- `SettlementPlan` gains an optional `props: PlacedProp[]` (`wardType`,
  `propKind`, `col`, `row`, `offsetX`, `offsetZ` — same sub-tile offset
  pattern as §3.1, `rotation`).
- `renderSettlementPlan()` gains a prop-instantiation loop parallel to the
  building loop, returning `propGroups: THREE.Group[]` on
  `SettlementRenderResult`.
- `SettlementLabScene.ts`/`OverworldScene.ts` both add `propGroups` to the
  scene the same way they already do for `buildingGroups`/`lampGroups`.

## 5. Occlusion for the fixed iso camera (Phase 3, stretch)

Not required for this plan's completion, but documented since the user
raised it:
- Simplest, lowest-risk option matching this genre's established
  convention: **partial roof transparency for buildings within a small
  radius of the player**, faded by distance (not a hard cutaway) — a
  per-frame check in `OverworldScene.ts`'s update loop against each nearby
  building's roof mesh material opacity, restored once the player moves
  away. This avoids needing per-building interior-visibility graph logic.
- With §3.1's spacing fix, most "can't see the player" complaints from the
  screenshot should already resolve, since buildings won't be wall-to-wall.
  Recommend revisiting whether a dedicated occlusion system is still needed
  only *after* Phase 1 lands and is visually re-verified — don't build it
  speculatively against the current (soon-to-be-fixed) overcrowded layout.

## 6. Implementation phases & tasks

### Phase 1 — Technical rendering fixes (this session's execution scope) — ✅ DONE
1. `SettlementGenerator.ts`: add `offsetX`/`offsetZ` to `PlacedBuilding`
   (§3.1), `snapToCardinal()` + apply to `rotation` (§3.2), bump
   `_noOverlap()` padding default (§3.1). Unit tests: offset stays within
   ±0.5 tile, rotation is always one of the 4 cardinal values across a seed
   sweep, existing collision/determinism tests still pass unmodified.
   - **Note:** `_noOverlap()`'s padding was investigated but *not* bumped
     from `1` — because `col`/`row`/half-extents are all integers, any
     padding value in `[1, 2)` behaves identically (the comparison is
     integer `<` integer+padding), so a "bump" only has effect right at the
     `padding >= 2` boundary, which crashed city-type worst-case placement
     ratio from 0.842 to 0.554 in measurement. Left at `1`; sub-tile offset
     alone restores the real spacing without touching collision logic.
2. `SettlementGenerator.ts`: add `roadRibbons: RoadRibbon[]` to
   `SettlementPlan`, computed alongside `rasterizeRoads()` from the same
   `model.roads` (§3.3). Unit test: ribbon point count/positions derived
   correctly from a known `model.roads` fixture, width matches anchor-ward
   adjacency.
3. `SettlementRenderer.ts` + `SettlementLabScene.ts`: consume `offsetX/Z`
   when positioning buildings; replace per-tile road quads with ribbon
   meshes built from `roadRibbons` (reuse the quad-strip-ribbon helper —
   check whether `RealmRiverMesh.ts`/`SettlementRoadMesh.ts` already expose
   a reusable ribbon-builder function before writing a new one).
4. Visual re-verification: re-run the seed-`445176186` Playwright
   screenshot repro used to diagnose this plan; confirm by eye that
   buildings have visible gaps, streets are visible, and rotations look
   axis-aligned. If city-type still looks overcrowded, revisit §3.4's
   fallback (do not implement it preemptively).
   - **Verified:** village and city screenshots both show clear building
     gaps, visible cobblestone ribbon streets with lamp posts along them,
     and axis-aligned (cardinal) building rotations. No further work needed
     on §3.4's fallback.
5. Full regression pass: `tests/levels/settlementGenerator.test.ts`,
   `tests/scene/OverworldScene.*`, `tests/world/SettlementRoadMesh.test.ts`
   (unrelated pipeline, just confirm untouched), `tsc --noEmit` baseline
   check, Playwright `overworld-studio-settlement-lab-launch.spec.ts`.
   - **Verified:** full `npx vitest run` passes 2352/2364 (12 pre-existing,
     unrelated failures in talentSystem/WaterMaterial/enemyLoader/
     towerGenerator/main-startup-smoke — confirmed unrelated by file-touch
     diff). `tsc --noEmit` stays at the same ~145 pre-existing error
     baseline (fixed a handful of new-required-field breakages in test
     fixtures and `OverworldScene.ts`'s ruins fallback plan). Playwright
     `overworld-studio-settlement-lab-launch.spec.ts` passes.

### Phase 2a — Park-ward feature clusters ✅ DONE
Executed §4.0a: `WardFeatureClusters.ts` (9 faction builders), `SettlementPlan.
wardFeatures` (two-pass placement with `snapFeatureTile()`/
`_featureNoOverlap()` collision-checking against buildings),
`renderSettlementPlan()`'s `featureGroups`, wiring into
`SettlementLabScene.ts`/`OverworldScene.ts` (reusing `_buildingGroups`'
generic add/dispose handling).

Unit tests: `WardFeatureClusters.test.ts` (non-empty group per faction,
determinism, geometric distinctness, Village Green fallback for unmapped
factions); `settlementGenerator.test.ts` (`wardFeatures` populated for
`park` wards, no overlap with building tiles). `tsc --noEmit`: no new
errors (baseline). `npx vitest run`: full suite passes except pre-existing
baseline failures (`talentSystem`, `WaterMaterial`, `enemyLoader`,
`towerGenerator`, `main.startup.smoke`, `OverworldScene.chunk-scatter-
alignment` — confirmed via `git stash` re-run that all fail identically on
the pre-change baseline, i.e. unrelated to this work).

Visual re-verification (Playwright, Studio "Play in 3D" → Settlement Lab,
seed=1, type=city): screenshotted Slime Pool (glowing green translucent
ooze pool + rising bubble motes), Sacred Grove (elven, cluster of trees),
and Graveyard (undead, jagged fence/tombstone spikes) side by side —
confirmed each reads as a genuinely distinct place, not a palette-swapped
copy of shared geometry. Note: `park` wards only reliably appear for
`type: 'city'` settlements in the current Voronoi ward-type assignment
(town/village produced zero park wards across a 300-seed sweep) — a
pre-existing property of `SettlementModelGenerator.ts`, not something this
pass changed.

### Phase 2b/2c — Faction building-variant silhouettes + generic prop library (follow-up, separately scoped)
Larger, `BuildingBuilder.ts`/`BuildingDNA.ts`-touching effort: faction-
specific `BuildingKind` silhouettes for `market`/`patriciate` wards (Fox
Den, Lich Tower, Wraith Bazaar, Night Market, etc. — see §4.0's table), plus
the generic prop shape library (§4.2-4.4: crates/barrels/stalls/fences/
banners for market/craftsmen/slum clutter). Recommend its own brainstorming/
plan-refinement pass before coding, since faction art direction decisions
benefit from explicit sign-off given they set a visual precedent other
systems may later follow.

### Phase 3 — Iso camera occlusion (stretch, re-evaluate after Phase 1)
Only pursue if Phase 1's spacing fix doesn't sufficiently resolve the
"can't see the player" complaint on visual re-check.

### Phase 4 — Live overworld parity check
Once Phase 1 lands, spot-check the live overworld (not just the Lab) for
the same visual improvement, since `SettlementPlacer.ts` shares this code
path — no code changes expected here, just verification, given the
session's current decision to deprioritize live-overworld polish in favor
of the Lab-first workflow.

## 7. Test strategy

Following this session's established rigor (TDD, no unverified completion
claims):
- Unit tests first for every pure-data change (§Phase 1 step 1-2) in
  `tests/levels/settlementGenerator.test.ts`.
- Keep all existing tests green (density-regression, snap-to-valid-tile,
  parity snapshot, drawcall-batching threshold) — re-verify snapshot/
  threshold values only if a change legitimately shifts them (as happened
  in PR #38), never loosen a test to paper over a real regression.
- One Playwright visual smoke-check (reuse the ad hoc screenshot script
  used to diagnose this plan, promote it to a real spec if it proves
  durable) to catch "renders without throwing + produces the expected
  road-ribbon/prop group counts," since geometry *correctness* (looks
  right) still needs a human screenshot review at the "visual
  re-verification" checkpoint (§Phase 1 step 4) — the automated test can't
  judge subjective spacing/aesthetics, only structural/crash regressions.

## 8. Open questions the user may want to weigh in on later (not blocking)

- Exact `PropStyle` palette values for vulperia/slime/fae (§4.3) — flagged
  as needing dedicated art-direction input when Phase 2 starts.
- Whether Phase 3 (occlusion) turns out to be needed at all after Phase 1's
  spacing fix, or whether the fixed iso camera's current framing is fine
  once streets are visible.
