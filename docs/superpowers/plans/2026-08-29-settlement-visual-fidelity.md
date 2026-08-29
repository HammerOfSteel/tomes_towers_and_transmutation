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

### Phase 2b/2c — Faction building-variant silhouettes + generic prop library

**Phase 2b increment 1 — DONE (this session, in direct response to user
feedback that Phase 2a alone wasn't enough: "the building still look way
way way too similar between races... vulperia's church type buildings are
not churches").** `src/world/buildings/FactionBuildingVariants.ts` (new):
a `(faction, BuildingKind) -> builder` override registry, checked first by
`buildBuilding()` (`BuildingBuilder.ts`) before the shared-shape + style-
overlay fallback. Added `BuildingDNA.faction?: Faction` (optional, so the
several call sites that construct `BuildingDNA` literals directly without
`factionBuildingDna()` keep compiling unchanged).

Covers the three highest-visibility "signature" ward kinds — patriciate
(`villa`), church (`chapel`), market (`shop`) — for the three most
geometrically-extreme factions: **vulperia** (Fox Den/Den Mother's Hall/
Night Market: earthen burrow mounds, round doorways, timber props, fox-
tail banners, pelts, no flat walls), **slime** (Elder Blob/Pulse Pool/Goo
Stall: translucent gelatinous domes with a glowing inner core, satellite
ooze bubbles, drip strands, no walls at all), **undead** (Lich Tower/Bone
Shrine/Wraith Bazaar: gaunt tapered stone spires with jagged crenellation
and a floating dark orb, rib-cage bone arches, skull-lantern bazaar
stalls). Unit tests: `FactionBuildingVariants.test.ts` (16 tests — each
covered (faction, kind) builds a non-empty group, dispatch precedence in
`buildBuilding()`, fallback to shared-shape for uncovered pairs and for
`faction: undefined`, determinism, geometric distinctness). Visually
verified via Playwright (Studio "Play in 3D", seed=1, type city): Fox
Den's burrow mound + market's whole burrow-stall district, Elder Blob's
glowing translucent dome, Lich Tower's spire silhouette + Wraith Bazaar's
ghostly cloth-canopy stalls — confirmed each reads as its own architecture
family, not a recolored villa/chapel/shop.

**Phase 2b increment 2 — DONE (this session, same "no need to ask"
authorization, continuing the increment-1 pattern to the remaining
geometrically-extreme factions).** Extended
`FactionBuildingVariants.ts` with 5 more bespoke architecture families
(villa/chapel/shop each) for patriciate/church/market: **elven**
(Elder's Hall/Ancient Shrine/Moonlit Exchange: living-tree trunk+leaf-
canopy architecture, standing-stone rings, raised-platform stalls under
small trees — no flat walls, no square silhouettes), **dwarven** (Guild
Hall/Stone Temple/Trade Vault: carved-stone mountain-block architecture,
flanking columns + braziers, iron vault doors + anvils), **orcish**
(Warlord Hall/War Shrine/Loot Pile: crude wood/bone/hide tribal huts,
skull/tusk trophies, bonfire pits ringed by bone totems, tarp-covered
loot heaps), **vampire** (Count's Tower/Blood Chapel/Blood Market:
gothic castle spires, bat gargoyles, hovering blood orbs, iron-framed
market stalls with red canopies), **fae** (Fae Court/Faerie Ring/
Twilight Market: whimsical giant-mushroom-cap architecture, literal
toadstool rings, firefly-lit petal-strewn stalls). All 5 built with the
same shared-per-faction-helper pattern as increment 1 (`elvenTrunk()`,
`dwarvenBlock()`, `orcishHut()`, `gothicBase()`, `faeMushroom()`).
Registry now covers **8 of 9 settlement factions** (all but human) for
their 3 signature ward kinds. Unit tests: `FactionBuildingVariants.test.ts`
expanded from 16 to 31 tests (all 8 factions × 3 kinds = 24 covered-pair
assertions, uncovered-pair fallback re-verified against `human_town/villa`
since `elven/villa` — the prior uncovered example — is now covered,
geometric-distinctness assertions extended to all 8 factions). Visually
verified via Playwright (Settlement Lab, teleporting directly to each
faction's patriciate/church/market anchor to avoid the camera-framing
pitfall where a neighboring building can dominate an offset shot):
confirmed elven trunk+canopy, dwarven stone-block+columns+brazier,
orcish hut+tusks, vampire gothic-spire+gargoyles+rose-window, and fae
mushroom-cap-cluster architecture all render as intended and are
genuinely distinct from each other and from increment 1's three
factions — not palette swaps.

**Still deferred (follow-up, separately scoped):**
- Extend bespoke building variants to the one remaining faction,
  **human** (rural/town/noble sub-factions), for patriciate/church/
  market — human already has acceptable rural/town/noble geometric
  variety from the pre-existing shared-shape system, so this is lower
  priority than the other 8 factions were.
- Extend variant coverage to the remaining ward kinds beyond patriciate/
  church/market (smithy, inn, craftsmen, merchant, slum, gateward, farm) —
  currently share the generic kind builder for every faction including
  all 8 covered here.
- The generic prop shape library (§4.2-4.4) for market/craftsmen/slum
  clutter — still valid as designed, composes with both Phase 2a and 2b.

### Phase 2d — Deep per-race building geometry pass (visual quality, not just distinctness)

**Problem statement (direct user feedback after increment 2 shipped):**
increment 1/2 achieved *silhouette distinctness* between factions, but on a
closer look most of the individual buildings don't actually read as real
buildings — they're "basic slabs of geometry," not "vulperia dens." The
explicit example given: the vulperia Fox Den "does not look like a den at
all, just some blobs with a roof thing" — the ask is for it to actually
evoke a fox den / hobbit-hole (a recognizable, richly-detailed dwelling),
not merely "a squashed sphere that is earth-coloured." Per the user's
direction, this is being worked **one faction at a time**, each faction
brought to real quality (not just a quick geometric tweak) before moving to
the next, since "this will give us time to make each building unique to
each race also and really put effort into it."

**Root cause of the "basic slab" feel**: increment 1/2's builders mostly
composed 2-4 raw primitives (a sphere, a cone, a couple of boxes) with a
faction colour palette — enough to look *distinct* from a neighbour, but
not enough parts/detail to look *designed*. The existing human/generic
`buildHouseOrShop()` (BuildingBuilder.ts) sets the real quality bar: doors
are frame+panel+handle+step (4 parts), windows are frame+glass+glazing-bar
(3 parts), chimneys are shaft+corbel+pot (3 parts) — real layered assemblies,
not one primitive standing in for a whole feature.

**Vulperia — DONE (this session).** Reworked `vulperiaMound()` and its
prop kit in `FactionBuildingVariants.ts`:
- `addOrganicMound()`: the main bank is now a hemisphere with **angular
  simplex-noise-perturbed silhouette** (`createNoise2D` from
  `src/core/SimplexNoise.ts`), fading to zero at the grounded base and at
  the crown so it stays flush with the ground and smoothly rounded on top,
  with genuine lumpy irregularity in between — reads as a hand-dug earthen
  bank, not a perfect sphere. Non-uniformly scaled to fit a `w x d`
  footprint (previously the plain-sphere version silently used a single
  uniform radius for both axes, ignoring non-square footprints).
- `addRoundDoor()` / `addRoundWindow()`: a genuine Bag-End-style round
  door — recessed shadow disc, a **ring of small chunky timber-stave
  blocks** standing in for the frame (`addTimberRingSegments()`), a door
  panel with vertical plank strips, a brass handle, and a stone step/apron.
  **Important technique note** (found via visual verification, not
  assumed): the first attempt used a flat `TorusGeometry` frame, and later
  a thicker `ExtrudeGeometry` annulus/collar — both still degenerate into a
  confusing hollow "hook/loop" artifact when a building's cardinal
  rotation (0/90/180/270, from Phase 1) turns it edge-on to the fixed
  isometric camera, because *any* ring-shaped mesh (however thick) shows
  its front and back rim as two connected arcs from a steep enough angle.
  The fix that actually holds up under rotation: build the "ring" out of
  individually-solid small `BoxGeometry` blocks arranged in a circle —
  no single block can ever present a hollow-loop silhouette, so worst case
  (dead edge-on) it just reads as a cluster of timber stakes, which still
  looks intentional rather than broken. **Any future round/circular prop
  (windows, portholes, medallions) for any faction should use this
  timber-stave-ring technique, not `TorusGeometry`/flat rings.**
- Also added: a stubby chimney stack with a smoke wisp, a scattered
  grass-tuft + wildflower crown over the mound, a garden fence + planter
  barrel (villa only), and the mound itself now uses correct non-uniform
  w/d scaling. The Fox Den's second "extension" mound and the Den Mother's
  Hall's flanking "pup" mounds now use the same organic-mound builder
  (previously plain spheres).
- Tests: `FactionBuildingVariants.test.ts` gained a new "Vulperia — organic
  mound geometry" describe block (3 tests): all mesh vertices remain finite
  after noise displacement (regression guard against NaN/degenerate
  geometry), the main mound's vertex radii are no longer uniform (proves
  real displacement happened, not a passthrough sphere), and the mound
  shape is deterministic per seed but varies across seeds. 34 tests total
  (up from 31), all passing.
- Visually verified via Playwright (Settlement Lab, teleporting to the
  villa/chapel/shop anchors of a seed=1 city): confirmed an organic
  egg/mound silhouette (not a smooth dome), a recognisable round timber
  door and port-hole windows from face-on and 3/4 angles, and — critically
  — re-verified from the angles where the door faces sideways to camera
  (roughly half of buildings, since rotation is cardinal) that the
  timber-stave ring degrades gracefully to a scattered block cluster
  instead of the hook/loop artifact seen with the two earlier (torus and
  extruded-collar) attempts.

**Vulperia v2 — real fix, after direct user feedback that v1 was NOT
good enough.** The user sent real gameplay screenshots (not close crops)
showing the "done" v1 mound still reading as exactly what the original
complaint described: a uniform-brown egg-shaped blob with a small dark
hole poked in it. The verification above was real but insufficient — it
checked that individual *techniques* worked (noise displacement is
real, the timber-ring door doesn't degenerate) without stepping back to
honestly ask "does this actually look like a den/house at normal
gameplay distance," which it did not. Root cause, diagnosed from the
screenshots: **noise-jittering a smooth curved primitive and bolting
small props onto its surface does not change the fundamental perceptual
read** — smooth curved geometry reads as "natural formation" no matter
how much fine jitter or how many small appendages are added, because the
appendages are too small relative to the dominant curved mass to
register. A genuine "built into the hill" read needs a **flat, built-
looking anchor surface**, real **colour contrast** (the vulperia palette
— walls `#d4a060`, trim `#c88030`, door `#6a3810` — is one uniform warm-
brown hue family with almost no value/hue separation, so nothing on the
mound actually contrasted against anything else), and the door/props
sized to be *prominent*, not token details. Concretely:
- `addOrganicMound()` extended with an optional `topColor`: a genuine
  two-tone **vertex-colour gradient** (earth-brown below, blending to a
  hardcoded saturated grass-green `#3d6b35` above ~45% height), applied
  directly on the mound's own noise-perturbed surface. A hill needs to
  visibly show two materials (turf over soil) to read as a hill with
  grass, not a uniform-coloured lump — and a vertex-colour gradient on
  the exact same mesh guarantees a perfect seam, unlike trying to align
  a second overlapping "cap" mesh against this mesh's own independently-
  noised silhouette (considered and rejected for exactly that reason).
  Applied to every vulperia mound (main bank, the Fox Den's side mound,
  the Den Mother's Hall's pup mounds, the Night Market stall base) for
  consistency across the whole faction, not just the flagship villa.
- A real **flat facade wall** (`BoxGeometry`, ~62% of the mound's width,
  ~62% of its height) set into the mound's front, with timber corner
  posts framing its edges — the door, windows, and lintel now mount onto
  this flat, visibly-built panel instead of the curved mound surface
  directly. This is the single highest-impact change: it gives the
  props an actual architectural surface to read against.
- `addRoundDoor()`/`addRoundWindow()` refactored to take explicit
  `frameColor`/`doorColor` strings instead of the whole `BuildingDNA`,
  so a genuinely contrasting **hardcoded forest-green door** (`#2f5233`)
  could be used instead of the palette's own near-match brown — verified
  numerically in the new test below (a same-hue near-match like the old
  door/wall pair sits ~0.5 apart in RGB-distance; the new pairing is
  comfortably past 0.6). Door radius also increased (from `0.24×` to
  `0.4×` the facade height) so it's a dominant, obviously-primary feature
  rather than a token detail lost against the hill.
- Mound noise jitter increased from `0.16` to `0.24` for a visibly
  lumpier, less egg-like silhouette.
- Tests: three new assertions added to the existing "Vulperia — organic
  mound geometry" describe block: a real wide-but-thin facade `BoxGeometry`
  exists (not just curved mound surface), the mound's vertex-colour
  attribute shows a genuine green-biased gradient from base to crown (not
  a flat colour), and the door's material colour is verified to be
  meaningfully distant (RGB-space) from the wall colour, not a same-hue
  near-match. 62 tests total (up from 59), all passing. `tsc --noEmit`
  still at the 145-error baseline.
- Visually re-verified via Playwright at a **realistic, non-flattering
  camera distance matching the user's own screenshots** (not a close
  crop): confirmed the mound now clearly reads as a two-tone grassy hill
  with a legible flat-fronted dwelling entrance, both face-on and from a
  rotated angle, and confirmed consistency across the whole settlement
  (every vulperia mound in frame shows the same green-cap treatment, not
  just the one tested building).
- **Explicitly not yet re-applied to the other 6 reworked factions.**
  The same root-cause lesson (flat anchor surface + real colour contrast
  + prominent not-token feature sizing, verified at realistic non-cropped
  camera distance) likely applies to some of them too (the elven canopy
  in particular was reported as reading as a muddy/brown blob rather than
  foliage in the same feedback round — the `elven.roof` palette colour
  `#8a9870` is a desaturated sage-green that likely reads brown under
  this game's warm torchlit night lighting). Given the trust cost of
  re-doing this across all 7 factions again without checking in first,
  this was intentionally paused after vulperia to get explicit
  confirmation that this v2 direction is actually right before repeating
  it six more times.

**Orcish — DONE (this session).** Reworked `orcishHut()` (used by the
Warlord Hall villa) in `FactionBuildingVariants.ts`: the previous version
was a single tapered `CylinderGeometry` (a "tent") standing in for the
whole hut. Now genuinely two separate construction layers:
- `addPalisadeWall()`: a ring of 16 individual upright log "stakes"
  (`CylinderGeometry`), each with its own per-log height/radius/thickness
  jitter, reusing the vulperia timber-stave-ring principle (many small
  solid pieces, never one smooth primitive) — reads as a real log
  palisade wall from any angle, including edge-on (individual logs stay
  individually visible, no ring-collapse artifact).
- `addRoughConeRoof()`: a steep hide/thatch roof cone whose base rim is
  perturbed by angular simplex noise (ragged, unevenly-drooping hide-flap
  edges), fading to a tidy point at the apex — a genuinely separate,
  distinct-looking layer from the wall beneath it, not the same primitive.
- Added: crude log door posts + a lintel beam flanking the doorway (the
  previous version only had a flat doorway disc with no structural
  framing), matching the same "layered assembly, not one primitive"
  principle used for vulperia's door.
- Tests: `FactionBuildingVariants.test.ts` gained a new "Orcish — palisade
  wall + rough hide roof" describe block (4 tests): finite vertices after
  roof-noise displacement, the villa assembles from 16 log pieces plus
  roof/poles/door/totems (not one primitive), the roof cone's radii are
  no longer uniform (proves real displacement, not a passthrough cone),
  and roof shape is deterministic per seed but seed-varied. 38 tests total
  (up from 34), all passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city), checked
  from both a face-on-ish angle and a rotated angle where the log wall is
  seen edge-on: confirmed the Warlord Hall now reads as a genuine tribal
  roundhouse (visible log wall, distinct ragged hide roof, crossed poles
  through the apex, mounted skull/tusk trophy above the door) from both
  angles, with no degenerate artifacts.

**Undead — DONE (this session).** Reworked `buildUndeadVilla()`'s Lich
Tower in `FactionBuildingVariants.ts`: the previous version was a single
tapered `CylinderGeometry` body (one primitive) topped with crenellation
boxes. Now:
- `addWeatheredTier()`: the spire is built from **three genuinely
  distinct, shrinking-radius stone tiers**, each with its own
  noise-crumbled surface (angular simplex noise, ancient weathered
  masonry rather than a smooth taper) — reads as a real tiered tower of
  stone courses, not one smooth cone.
- `addStoneArchDoorway()`: a proper carved gothic archway built from 7
  small voussoir-like stone blocks (never a flat torus/ring — this is a
  half-circle arch, and even so uses the same "many small solid pieces"
  principle as vulperia/orcish for robustness from any angle), plus
  straight door jambs and a dark recessed doorway panel — a genuine
  carved crypt entrance instead of a flat doorway disc, flanked by bone
  rib struts (reusing the visual language already established by the
  Bone Shrine chapel).
- Added fallen rubble blocks scattered at the base for decay storytelling.
- The crenellation crown, floating orb, and arrow-slit windows were kept
  (already reasonable layered details) but repositioned to the new
  3-tier height budget.
- The chapel (Bone Shrine: paired rib-arch struts + altar + skull posts +
  candles) and shop (Wraith Bazaar: bone-strut stall + cloth canopy +
  skull lanterns + counter) were left unchanged — both already read as
  genuine multi-part assemblies (4-5 distinct feature types each), not
  the "one primitive" problem the villa had.
- Tests: `FactionBuildingVariants.test.ts` gained a new "Undead — tiered
  weathered spire + stone arch doorway" describe block (4 tests). **Found
  and fixed a real test-helper bug during this work**: the shared
  `findBiggestMesh()` helper (used by both the vulperia and orcish
  describe blocks) picked undead's floating orb — an `IcosahedronGeometry`,
  which is non-indexed and so has a far larger raw vertex-array length
  (240) than any indexed cylinder/cone tier (86) — instead of an actual
  spire tier. Since the orb's shape and position don't depend on `seed`,
  the "different silhouette per seed" test was passing for the wrong
  reason (comparing the same static orb to itself) rather than actually
  testing the tier's noise displacement. Fixed by adding a
  `findBiggestCylinderMesh()` helper restricted to `CylinderGeometry`
  meshes, used for all of undead's tier-focused assertions. **Any future
  test using a "biggest mesh" heuristic should be aware that
  non-indexed geometries (Icosahedron, and any `BufferGeometry` built via
  `mergeVertices`-free construction) can have vertex-array lengths that
  don't correspond to visual complexity or seed-sensitivity.** 42 tests
  total (up from 38), all passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city), checked
  from both a face-on-ish angle and a rotated angle: confirmed the Lich
  Tower now reads as a genuine weathered crypt tower with a real carved
  gothic archway entrance (clearly visible, robust from both angles since
  it's built from solid blocks, not a flat ring), holding up well from
  multiple viewing angles and positions across the settlement.

**Dwarven — DONE (this session).** Reworked `dwarvenBlock()` (used by the
Guild Hall villa and Stone Temple chapel) plus `buildDwarvenShop()`'s
Trade Vault front wall in `FactionBuildingVariants.ts`: the previous
version was a single smooth full-height `BoxGeometry` with **no roofline
at all** (an abrupt flat top) — about as literal an example of "a basic
slab of geometry" as the user's complaint described. Now:
- `addStoneCourses()`: the wall is built from **4 stacked horizontal
  stone courses**, each very slightly narrower than the one below (a
  subtle ziggurat-like taper) with a visible seam between every course,
  finished with a heavy overhanging corniced cap slab — a real roofline
  instead of an abrupt flat top. Reused for both `dwarvenBlock()` and the
  Trade Vault shop's front wall (previously two separate single-box
  implementations).
- `addVaultWheel()`: a bank-vault-style door wheel mechanism — a hub
  cylinder plus 6 spoke boxes crossing through it (never a flat torus/
  ring; spokes are boxes, so the shape stays legible from any camera
  angle instead of degenerating to a hairline edge-on, the same principle
  established for vulperia/orcish/undead's round props). Added to both
  the Guild Hall's door and the Trade Vault's existing circular door
  plate, tying the whole faction's signature "vault" identity together.
- Corner pillars now have base/capital rings (previously bare shafts).
- Tests: `FactionBuildingVariants.test.ts` gained a new "Dwarven —
  coursed stone masonry + vault-wheel door" describe block (4 tests): no
  single `BoxGeometry` mesh spans more than 60% of the building's total
  height (regression guard against reverting to one full-height box —
  verified empirically at 39% for the tallest individual course/door box
  in the current tuning), the villa assembles from at least 29 parts (31
  verified in practice), determinism for the same seed, and finite
  vertices across villa/chapel/shop. 46 tests total (up from 42), all
  passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city), checked
  from both a face-on-ish angle and a rotated angle: confirmed the vault
  wheel's spoke pattern stays cleanly legible (no hollow-ring artifact)
  from both angles, the coursed-masonry seams are visible on the walls,
  and the corniced cap gives the building an actual roofline silhouette
  instead of reading as a plain box.

**Elven — DONE (this session).** Reworked `elvenTrunk()` (used by the
Elder's Hall villa) plus `buildElvenShop()`'s canopy in
`FactionBuildingVariants.ts`: the previous version was a perfectly smooth
tapered `CylinderGeometry` trunk topped with a single smooth half-`Sphere`
dome standing in for the entire leaf canopy. Now:
- The trunk reuses `addWeatheredTier()` (the same noise-crumbled-surface
  technique built for undead's stone tiers) to give the bark a genuinely
  gnarled, irregular silhouette instead of a perfectly smooth taper.
- `addLeafCanopyCluster()`: the canopy is now a **cluster of 6 overlapping
  foliage blobs around a larger central crown blob** — real individual
  leaf clusters, not one smooth dome. Reused (at a smaller scale) for the
  Moonlit Exchange shop's canopy, which previously used a single
  `ConeGeometry` "leaf roof."
- Added a natural root archway over the doorway (5 curved root-like
  tapered-cylinder segments arcing overhead, echoing undead's stone-
  voussoir archway technique but organic rather than blocky) and hanging
  vine tendrils drooping from the canopy — addressing the "woven-vine
  walls" identity from the section's own header comment, which wasn't
  actually present in the code before this pass.
- The existing woven wooden platform ring (a flat horizontal `Torus`) and
  the Ancient Shrine chapel (ring of standing tree-stones + glowing
  crystal) were left unchanged. **Note on why the platform's flat torus
  is fine, unlike the round-door rings fixed in earlier factions**: a
  ring lying flat in the horizontal (ground) plane is rotationally
  symmetric around the vertical (Y) axis, so a building's cardinal
  Y-axis rotation has *zero* effect on how it's framed by a
  fixed-downward-angle isometric camera — the "hook/loop" artifact only
  ever affected *vertical* rings (doors, windows) whose facing direction
  actually changes as the building rotates.
- Tests: `FactionBuildingVariants.test.ts` gained a new "Elven — gnarled
  bark trunk + leaf-cluster canopy" describe block (4 tests): finite
  vertices after trunk-noise displacement, the trunk's radii are no
  longer uniform (proves real displacement, not a passthrough cylinder),
  the canopy assembles from at least 8 sphere meshes (10 verified in
  practice: 7 canopy blobs + 3 glow motes, vs. the old version's 4: 1
  dome + 3 motes), and trunk shape is deterministic per seed but
  seed-varied. 50 tests total (up from 46), all passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city), checked
  from both a face-on-ish angle and a rotated angle: confirmed the
  gnarled bark trunk and the leaf-cluster canopy read as a genuine living
  tree from both angles (the woven platform ring, as expected, was
  unaffected by rotation), a clear improvement over the previous smooth
  cylinder-and-dome silhouette.

**Vampire — DONE (this session).** Reworked `gothicBase()` (used by the
Count's Tower villa and Blood Chapel) in `FactionBuildingVariants.ts`:
the previous version had flanking buttresses that were literal flat thin
`BoxGeometry` slabs (no protruding silhouette at all) and a "rose window"
that was just a flat coloured `CircleGeometry` disc with no tracery.
Now:
- `addGothicButtress()`: each buttress pier is **3 stacked, progressively
  narrower stepped blocks** capped with a tapered pinnacle — a real
  stepped silhouette (the hallmark of actual Gothic flying-buttress
  piers), not a flat slab.
- `addRoseWindow()`: a genuine rose window — 8 radial stone spoke blocks
  plus an outer ring of 10 chunky stone tracery segments (reusing
  vulperia's `addTimberRingSegments()` — the same "many small solid
  pieces, never a flat torus" principle, since this ring, like the
  earlier door rings, *is* a vertical ring whose facing direction
  changes with the building's cardinal rotation) framing a dark
  stained-glass disc — a genuine cathedral-style tracery wheel instead of
  a flat coloured circle.
- The existing spire, bat gargoyles, balcony (villa), twin flanking
  spirelets + hovering blood orb (chapel), and iron-framed market stall
  (shop) were left unchanged — already reasonable layered details.
- Tests: `FactionBuildingVariants.test.ts` gained a new "Vampire —
  stepped buttresses + rose-window tracery" describe block (4 tests):
  the villa assembles from at least 30 parts (33 verified in practice,
  vs. the old version's much smaller primitive count), buttresses/
  tracery produce more than 4 distinct box widths (vs. 2 in the old flat-
  slab version — a direct silhouette-variety regression guard),
  determinism for the same seed, and finite vertices across villa/
  chapel/shop.  54 tests total (up from 50), all passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city), checked
  from both a face-on-ish angle and a rotated angle: confirmed the rose
  window reads as a vivid red spoked tracery wheel (not a flat disc) and
  the buttresses show a clear stepped, tapering silhouette from both
  angles.

**Fae — DONE (this session).** Reworked `faeMushroom()` (used by the Fae
Court villa) plus `buildFaeShop()`'s cap in `FactionBuildingVariants.ts`:
the previous version was a perfectly smooth tapered `CylinderGeometry`
stem topped with a perfectly smooth half-`Sphere` dome cap, with flat
`CircleGeometry` decals standing in for "glowing spots." Now:
- The stalk reuses `addWeatheredTier()` (the noise-crumbled-surface
  technique from undead/elven) for a genuinely twisted, gnarled toadstool
  base instead of a perfectly smooth taper.
- `addScallopedCap()`: the cap's rim is now perturbed by angular simplex
  noise (strongest at the rim, fading to a smooth crown) for a real wavy,
  irregular toadstool-cap edge, visible from the game's fixed downward
  isometric camera — this was chosen over gills as the primary "make the
  cap read as organic" fix specifically *because* it's camera-visible, see
  below.
- `addMushroomGills()`: real underside gill ribs (14 thin radiating fins)
  added for geometric correctness — the classic toadstool detail. **Note
  on a visual-verification finding that shaped the final approach**: gills
  are only visible from directly underneath a cap, which the game's fixed
  downward-angle isometric camera never sees. They were kept (harmless,
  geometrically correct, low triangle cost, and could matter if a future
  camera angle ever changes) but the scalloped-rim noise perturbation
  above was added as the change that actually reads in normal gameplay.
- `addMushroomWarts()`: raised glowing bump protrusions (real 3D
  hemispheres) replacing the flat circular "glowing spot" decals.
- Tests: `FactionBuildingVariants.test.ts` gained a new "Fae — twisted
  stalk + scalloped cap + gills/warts" describe block (5 tests): finite
  vertices after stalk/cap-noise displacement, the stalk's radii are no
  longer uniform (proves real displacement), the cap's radii (in the
  horizontal XZ plane) are no longer uniform either (proves the rim is
  scalloped, not a perfect circle), the villa assembles from at least 25
  parts, and stalk/cap shape is deterministic per seed but seed-varied.
  **Found and fixed a real TypeScript control-flow-narrowing quirk while
  writing these tests**: a `let cap: THREE.Mesh | null = null` variable
  reassigned inside a `.traverse()` callback, when later narrowed via
  `if (cap === null) throw`, was incorrectly inferred by the compiler as
  narrowing to `never` (as if the declared type were exactly `null`, not
  `THREE.Mesh | null`) — TypeScript's control-flow analysis does not
  reliably track reassignments of an outer `let` from inside a nested
  callback for narrowing purposes at the call site. Fixed by collecting
  candidates into an array first (`sphereMeshes: THREE.Mesh[]`) and
  picking the biggest in a plain `for` loop afterward, avoiding the
  reassign-inside-a-closure pattern entirely. 59 tests total (up from
  54), all passing.
- Visually verified via Playwright (Settlement Lab, seed=1 city),
  including a closer teleport-to-anchor check specifically to inspect the
  cap silhouette: confirmed the scalloped, faceted cap-rim edge is clearly
  visible on multiple buildings from the game's normal iso-camera angle
  (a genuinely wavy toadstool silhouette, not a smooth circle), and the
  twisted stalk reads as an irregular, gnarled base.

**Still to do, in order (same "one faction at a time, do it properly"
approach — do not batch these into one shallow pass):**
1. **Slime** — explicitly reported as already reading fine ("mostly the
   slime buildings are ok") — lowest priority, only revisit if a specific
   issue is raised.
2. **Human** — still deferred from increment 2 scoping (already has
   decent rural/town/noble variety from the shared-shape system).

Each entry above should be verified with the same rigor as vulperia:
unit tests (no-NaN/geometry-sanity + determinism) plus Playwright
screenshots checked from *both* a face-on-ish angle and a
rotated/edge-on-ish angle (given the cardinal-rotation + fixed-iso-camera
interaction discovered above), before being marked done.

### Phase 2e — Modular sub-tile block-kit architecture (paradigm shift, supersedes 2b/2d primitive approach)

**Why this phase exists.** After Phase 2d shipped (7 factions reworked with
noise-perturbed primitives) and a "v2" vulperia fix (flat facade + two-tone
gradient bolted onto the same mound primitive), direct user review of
realistic-distance screenshots still read every non-slime faction's
buildings as **"blob type structures"** — geometry sculpted by deforming one
large smooth primitive (sphere/cylinder/cone) with noise, however much
surface detail or colour contrast is layered on top, does not stop reading
as "a blob," because the *underlying construction technique* never matches
the game's own visual language. The user has explicitly rejected this
technique for every faction except slime (whose gelatinous-blob nature makes
a deformed-primitive read *correct*, not wrong) and specified the fix
technique directly: build shapes out of **many small, chunky, grid-aligned
blocks** — "like Lego" — sized to relate to the overworld's own tile grid,
with organic softness added by **rounding/texturing the small blocks
themselves** (not by deforming one big shape). This is a from-scratch
architectural technique change, not a per-faction tweak, so it gets its own
phase with a shared engine (§2e.1) built once and then applied faction by
faction (§2e.2–§2e.10), each faction still getting the "one at a time, do it
properly, verify at realistic distance before moving on" treatment that
Phase 2d established.

#### 2e.0 Research grounding (what this design is built on, not guessed)

Real technique research (not just "it'll probably look fine") was done
before design, per explicit user request:

- **Marching-squares corner/edge selection (blob tilesets / auto-tiling)** —
  a decades-old, well-documented technique (used for terrain auto-tiling in
  RTS/RPG games, contour generation, and directly credited by Oskar
  Stålberg as the core mechanism behind *Townscaper*'s buildings): classify
  each grid cell by which of its immediate neighbours are "filled" vs
  "empty," and pick a specific edge/corner geometry variant from a small
  fixed table based on that classification, instead of deforming a
  continuous surface. Applied to *Townscaper* at the level of wall corners
  between filled/empty voxel columns — the discrete occupancy grid never
  changes, only which small pre-built corner/edge piece renders at each
  position, and the result reads as smoothly organic despite being 100%
  grid-based. **This is the direct technical precedent for "round the edges
  of the small blocks, don't deform a blob."**
- **Modular kit-bashing / trim-sheet architecture** (standard technique
  behind asset packs like Kenney.nl's building kits and Synty Studios'
  POLYGON series, and the subject of many GDC-style "modular environment
  art" talks): buildings are assembled from a small fixed vocabulary of
  grid-unit pieces (wall segment, corner, doorway, window, roof cap,
  decoration/greeble) that all share one snap-grid, so any combination
  tiles seamlessly and the *pieces themselves* carry the material identity
  (stone-block texture baked onto the wall-segment piece, not painted after
  the fact).
- **Greebling** — adding small non-functional surface-detail clusters at a
  finer sub-grid scale than the main structure to break up flat/blank
  surfaces and read as "built, lived-in, and detailed" rather than smooth —
  directly answers the user's "not just slabs of geometry" complaint from
  Phase 2d, generalized to the new block system.
- **Heightfield/voxel-column stacking** (the technique behind Minecraft-like
  or *Voxatron*-style organic mounds/hills): an organic silhouette (a mound,
  a hill, a dune) is built as a 2D heightfield of column heights over a
  grid, not a single deformed sphere — each column is a stack of unit
  blocks, and the *silhouette* comes from varying stack height per column
  plus corner/edge rounding at the boundary, never from bending a
  continuous mesh. This directly replaces `addOrganicMound()`'s
  sphere-plus-noise approach for vulperia's den mounds while keeping the
  same "grounded earthen hill" read the user liked structurally (just not
  as a smooth blob).
- **Existing in-repo precedent already found by accident and validated**:
  Phase 2d's vulperia round-door fix (§ above, "Important technique note")
  independently discovered exactly this principle — a ring built from
  individually-solid small `BoxGeometry` blocks arranged in a circle reads
  correctly from every camera angle, where a continuous ring/torus geometry
  does not. That fix is the proof-of-concept for the whole phase and is
  reused/generalized here, not thrown away.

#### 2e.1 Core engine — `src/world/buildings/BlockKit.ts` (new, shared by all factions)

**Grid unit.** `BLOCK_UNIT = 0.5` world units — exactly 1/8 of
`TERRAIN_TILE_SIZE` (4 WU, `RealmToTerrain.ts`), so block geometry is always
an integer subdivision of the terrain's own tile grid (the literal
"blend into the terrain tile system" the user asked for). A `medium`
footprint (5×4 WU) is a 10×8 block grid — chunky enough to read as discrete
"Lego" pieces at gameplay camera distance, fine enough to carve
recognisable doors/windows/roof shapes.

**Data model.** A building's shape is a sparse 3D occupancy grid:
`type BlockGrid = Map<string, BlockCell>` keyed by `"bx,by,bz"` integer block
coordinates (`by` = vertical level, one block = one `BLOCK_UNIT` tall). Each
occupied cell carries a `BlockCell { materialKey: string }` — an index into
that faction's `BlockPalette` (see §2e.1.3), so a single grid can mix e.g.
"earth" blocks low down and "grass-cap" blocks on top, or "stone" blocks
with occasional "rune-glow accent" blocks for undead.

Per-faction **shape-profile functions** (one per faction, e.g.
`vulperiaDenProfile(w, d, h, seed, opts)`) populate a `BlockGrid` from a
footprint (`getFootprint()`, already exists) + seed + faction-specific
options (chimney/garden/tiers/etc., mirroring the existing
`vulperiaMound()` opts shape) — this is the piece that actually varies per
faction/building and is where each race's silhouette personality lives
(heightfield mound for vulperia, stepped ziggurat for dwarven, tapering
trunk-then-canopy for elven, etc. — full per-faction detail in §2e.2+).

**Meshing — the corner-rounding algorithm (the actual "organic from
blocks" technique).** For every occupied cell:
1. Skip any of its 6 faces whose neighbour cell is also occupied (standard
   voxel face-culling — keeps triangle counts sane even at fine
   subdivision).
2. For each of the 4 *vertical* edges of the block (NE/NW/SE/SW, running
   along Y), chamfer that edge (cut it at 45° to a configurable radius,
   default `0.16 * BLOCK_UNIT`) **if and only if both of the two
   orthogonal neighbour cells that meet at that edge are empty** — e.g. the
   NE edge is chamfered only if both the North neighbour and the East
   neighbour of this cell are unoccupied at the same level. This is a
   direct 3D generalisation of the marching-squares "is this an exterior
   corner" test: a cell buried in a flat wall run has all 4 edges sharp
   (reads as solid, deliberately-built masonry where it should); a cell at
   the tip of a silhouette (isolated column, or the outer corner of a
   stepped tier) gets some/all edges chamfered, softening exactly the
   boundary where "blockiness" would otherwise read as harsh, without
   touching a single vertex of the interior structure. A fully isolated
   single-block column (all 4 neighbours empty) gets all 4 edges chamfered
   — an octagonal-cross-section "soft post," matching e.g. a single
   chimney-cap block or an isolated roof finial.
3. The top face of any cell whose upward neighbour is empty (i.e. a
   "roofline" cell) additionally gets its 4 *horizontal* top edges
   bevelled by the same rule using the horizontal neighbours, softening
   silhouette skylines (this is what turns a stepped block tower into a
   worn/rounded stepped tower rather than a staircase of razor-sharp
   cubes).

This is implemented as one shared, fully unit-tested function
(`meshBlockGrid(grid, palette, opts) -> THREE.Group`), **not** copy-pasted
per faction — the only per-faction inputs are the occupancy grid (from that
faction's shape-profile function) and the palette (materials/colors).
Tests assert (via geometry inspection, following the existing
"no-NaN + determinism + structural sanity" pattern from
`FactionBuildingVariants.test.ts`): an isolated single block produces an
octagonal (8-sided) horizontal cross-section; a block buried in a 3×3×3
solid cube of neighbours produces a plain unchamfered box (0 extra
vertices beyond a standard cube); a block at the outer corner of an L-shape
produces exactly one chamfered vertical edge; face-culling removes shared
internal faces (buried cell contributes 0 visible triangles); output is
deterministic per seed.

**Texture strategy.** Extend `TextureFactory.ts` (already has
canvas-generated `stoneTexture`/`brickTexture`/`thatchTexture`/etc. — same
pattern, not a new pipeline) with one new procedural canvas texture per
faction's primary block material (earth-and-root for vulperia, coarse
granite-with-mortar for dwarven, living-bark for elven, lashed-hide/bone
for orcish, weathered ash-stone for undead, black obsidian-with-veins for
vampire, mottled toadstool-skin for fae) — applied per-block via UV so
individual blocks show grain/variation rather than reading as flat plastic
Lego, plus a small per-block colour jitter (a cached low-amplitude
value-noise sampled by block coordinate, baked as a vertex-colour
multiplier) so no two blocks of the same material are perfectly identical
— cheap, and exactly the "texture tricks" the user asked for to keep small
blocks from looking uniform/toylike.

**Reused, not rebuilt**: the vulperia round-door timber-stave-ring
technique (§Phase 2d) is generalised into a shared
`blockRingDoor()`/`blockRingWindow()` helper in `BlockKit.ts` usable by any
faction that wants a round opening — it already *is* small-block
construction, it just needs to read from a faction's palette instead of a
hardcoded colour.

#### 2e.2 Per-faction sub-phases — shared checklist

Every faction sub-phase below follows the same task list (mirroring Phase
2d's proven "one faction at a time" discipline) — none may be marked done
without all of these:
1. Define the faction's `BlockPalette` (2-4 block material keys + 1-2
   accent/glow material keys, deliberately colour-contrasted per the
   Phase 2d "vulperia palette was one hue family" lesson).
2. Write/extend the faction's canvas texture in `TextureFactory.ts`.
3. Write the faction's shape-profile function(s) (patriciate/church/market,
   matching Phase 2b/2d's existing coverage) producing a `BlockGrid` via
   the shared heightfield/tier/tower helpers in `BlockKit.ts`.
4. Write the faction's prop/decoration/environment kit — small standalone
   block-built assets placed around the ward (reusing/extending the
   existing `SettlementPropFactory.ts` placement plumbing from §4.2-4.4),
   thematically grounded in that faction's actual ward vocabulary (see each
   sub-phase below — sourced directly from `FACTION_WARD_NAMES` in
   `overworld-studio.ts`, which the user pointed to explicitly as the
   canonical statement of what each race's spaces actually *are*).
5. Unit tests first (TDD): geometric sanity + determinism for the new
   shape-profile + palette, following the existing test file's pattern.
6. Playwright visual verification **at realistic camera distance matching
   the user's own screenshots** (the hard-won lesson from vulperia v1→v2 —
   never judge from a flattering close crop), from both a face-on and a
   rotated/edge-on angle, before the faction is marked done.
7. Update this plan doc + TODO + SQL todos honestly with what was verified,
   including screenshots description/findings — no completion claims
   without step 6 having actually been run.

#### 2e.3 Vulperia — proof-of-concept faction (do first; reuses praised facade+door)

Theme grounding: *Fox Den* (patriciate), *Den Mother's Hall* (church),
*Night Market* (market), *Burrow Commons* (park), *Tinker's Row*
(craftsmen) — a warm, earthy, semi-wild "clever fox-folk living in
burrows and hollows" identity, explicitly **not** rejected by the user (the
big villa's facade + round door was called out as "pretty lovely,
especially... looking like a hobbit hole"). Scope: replace the mound's
*body* (currently a deformed sphere) with a block-built heightfield mound;
keep and adapt the facade-wall + round-door composition, now carved
directly into the block grid (a literal rectangular notch of missing
blocks framed by kept "post" blocks) rather than a separate bolted-on
`BoxGeometry`.
- **Palette**: packed-earth blocks (warm brown, new canvas texture with
  root/pebble fleck detail), turf/grass-cap blocks (saturated green,
  reusing the vulperia v2 two-tone-gradient insight but as a literal
  separate top-layer block material instead of a vertex gradient), timber
  accent blocks (door posts/lintel, dark brown), and a small "toadstool/
  burrow-flower" accent block for garden clutter.
- **Shape profile**: a heightfield mound — column height falls off from
  centre to footprint edge (grounded, not floating), grass-cap blocks
  occupy the top 1-2 levels of each column, earth blocks below; a
  rectangular block-notch at the front carves the facade recess, framed by
  kept timber-post blocks; corner-chamfering (§2e.1) automatically softens
  the mound's silhouette into a rounded hill shape from the sharp
  heightfield steps.
- **Props/decor**: fox-tail grass tufts, small toadstool clusters, a
  packed-dirt path of flat paver blocks leading to the door, a burrow-vent
  chimney stack (small block cluster, not the old smooth-box chimney).
- Tasks: 2e.3.1 palette + texture, 2e.3.2 heightfield mound profile +
  facade notch, 2e.3.3 door/window reuse via `blockRingDoor()`,
  2e.3.4 props, 2e.3.5 tests, 2e.3.6 Playwright verification (villa +
  chapel pup-mounds + market stall, face-on and rotated), 2e.3.7 docs/todo
  update.

**Status: DONE, verified** (`buildVulperiaDenMoundGrid()` in
`src/world/buildings/FactionBlockProfiles.ts`, wired into
`FactionBuildingVariants.ts`'s `vulperiaMound()`/villa/chapel/shop). 90/90
targeted unit tests pass (`BlockKit.test.ts`, `FactionBlockProfiles.test.ts`,
`FactionBuildingVariants.test.ts`), `tsc --noEmit` shows zero new errors.
Playwright visual verification against the *live* Settlement Lab (not a
synthetic test harness) confirmed via a teleport-to-building-position +
scene-graph inspection (temporary debug hook, added and fully reverted —
`git diff --stat` on `SettlementLabScene.ts` shows zero net change) that the
villa's block mound at world position genuinely renders as a discrete,
chamfered, grid-built dome with the expected earth/grass/facade material
split, matching `buildVulperiaDenMoundGrid()`'s design — **not** a
regression back to blob geometry.

Two real, non-blocking issues found during this verification and carried
forward rather than silently accepted:
1. **Window emissive bloom is over-tuned at this scale.** `glassLikeMat()`'s
   lit-window material (`emissiveIntensity: 0.7`) blooms into a large,
   indistinct yellow flare at typical camera distance, obscuring the
   door/facade detail it's supposed to accent. This is a *shared* helper
   used by every faction's windows (not vulperia-specific), so fixing it
   is a cross-cutting lighting/bloom-tuning task, not a per-faction one —
   tracked as a new backlog item (`p2e-bloom-tuning`, §8) to address in a
   dedicated pass once more factions are block-built and comparable side by
   side, rather than over-fitting the tuning to one screenshot.
2. **Confirms the pre-existing "only villa/chapel/shop are faction-specific"
   architecture gap** (see §8 "open questions") — in a real generated
   settlement, the block-mound anchor buildings are visually sparse (1-2
   per settlement) relative to the many generic non-faction "house"/`inn`/
   `blacksmith`/`terraced` buildings that dominate the view, so a
   real settlement's silhouette doesn't yet read as "vulperia" at a glance
   even with a fully-verified villa. This is unchanged/pre-existing scope,
   not something this session's work regressed, but it caps how much visual
   impact any single faction's Phase 2e rebuild can have until it's
   addressed — flagged to the user, not assumed away.

#### 2e.4 Dwarven — contrast case (angular, precise; proves the system generalises beyond "mound")

Theme grounding: *Guild Hall* (patriciate), *Stone Temple* (church),
*Trade Vault* (market), *Mushroom Hall*/*Mushroom Farm* (park/farm — an
underground-fungiculture detail worth honouring in props), *Great Forge*
(smithy) — precise, blocky, geometric masonry; the *opposite* silhouette
personality from vulperia's organic mound, good proof the block system
isn't secretly just "mounds with a different palette."
- **Palette**: coursed granite blocks (grey-blue, new canvas texture with
  visible mortar coursing — reuse `_buildStoneCanvas()`'s coursing
  technique as a base, adapted colours), dark iron-banding accent blocks,
  a warm glowing "forge-light" accent block for smithy/hall windows.
- **Shape profile**: a stepped tiered block tower/hall — rectangular tiers
  each slightly inset from the one below (a real stepped ziggurat, not a
  cone), heavy corner "buttress" block columns at the tier edges left
  deliberately un-chamfered (dwarven architecture should read as
  *intentionally* hard-edged and monumental, so §2e.1's chamfer rule gets a
  faction-level override flag to suppress edge-softening on designated
  "monumental" cells while still softening roofline/silhouette cells) —
  this is an important test that the shared engine supports "this faction
  wants some blocks to stay sharp on purpose," not just uniform organic
  softening everywhere.
- **Props/decor**: rune-carved standing-stone marker blocks, a
  fungus/mushroom-farm prop cluster (small pale block-built mushroom caps,
  distinct from fae's — grounding the *Mushroom Hall*/*Mushroom Farm*
  naming with an actual prop, not just a name nobody sees), anvil + tool
  rack props near smithy.
- Tasks mirror §2e.3's structure (7 subtasks), substituting dwarven's
  profile/palette/props.

**Status: DONE, verified** (`buildDwarvenHallGrid()` in
`src/world/buildings/FactionBlockProfiles.ts`, wired into
`FactionBuildingVariants.ts`'s `buildDwarvenVilla()`/`buildDwarvenChapel()`/
`buildDwarvenShop()` via `addBlockDwarvenHall()`). 101/101 targeted unit
tests pass (`BlockKit.test.ts`, `FactionBlockProfiles.test.ts`,
`FactionBuildingVariants.test.ts`), `tsc --noEmit` shows zero new errors.

Verification method: this faction surfaced real geometry bugs that pure
unit tests (which only assert block counts/materials, not proportions) did
not catch — found via a three-tier methodology: (1) an ASCII occupancy-grid
dump of the block array per Y-level to see the actual shape without relying
on screenshots, (2) an isolated Playwright preview harness with front/side/
iso *and* true-orthographic camera modes (the orthographic mode was added
specifically to disambiguate real geometry bugs from perspective/proximity
illusions — see below), and (3) live in-game Settlement Lab screenshots via
a temporary teleport-to-building-position debug hook (added and fully
reverted — `git diff --stat` on `SettlementLabScene.ts` shows zero net
change).

Real bugs found and fixed this pass (not false alarms):
1. **Tier-inset proportionality bug**: `buildDwarvenHallGrid()`'s per-tier
   inward inset was a fixed block count applied identically to both
   footprint axes. On a wide-but-shallow footprint (e.g. the villa,
   7x5 blocks-per-unit wide/deep), this shrank the *shorter* axis far more
   aggressively as a percentage each tier, collapsing the top tier to a
   near-zero-depth slab — exactly matching the user's "buttress corners
   look like thin flat cards" complaint. Root-caused via the ASCII dump
   (showed the top tier at 6 wide x 2 deep, should be ~6x6). Fixed by
   scaling `insetStepX`/`insetStepZ` proportionally to each axis's share of
   `Math.max(bw, bd)` so every tier preserves the base footprint's aspect
   ratio.
2. **Roof-height quantization bug**: banner/chimney props were positioned
   using `dwarvenBlocksTall(h) * BLOCK_UNIT`, which ignored `BlockKit.ts`'s
   block-centring convention (each block extends +/-`BLOCK_UNIT/2`, so the
   true roof top is `(bh-1)*BLOCK_UNIT + BLOCK_UNIT/2`, half a block lower
   than the naive formula) — this produced the reported "banner/chimney
   floating above the roofline" gap. Fixed by adding an exported
   `dwarvenRoofTopY(h)` helper used consistently for prop placement.
3. **Top-tier-extents prop-placement bug**: even after the height fix, the
   chimney's X/Z position was still derived from the *base* footprint, which
   is much wider than the real (inset) top tier once bug #1 was fixed — so
   the chimney had no solid block beneath it at that height. Fixed by adding
   `dwarvenTopTierExtents()` (backed by a new shared internal
   `planDwarvenTiers()` helper so the fill logic and the extents query can't
   silently diverge) and clamping prop X/Z within it.
4. **Chapel column oversizing**: flanking columns used `h * 1.1` for height
   — literally taller than the tower itself. An initial perspective-view
   screenshot after the first fix attempt (`dwarvenRoofTopY(h) * 0.7`) still
   *looked* wrong (columns appeared to tower over the roof), but a true
   orthographic-camera cross-check confirmed the fix was actually correct —
   the alarming appearance was a perspective/proximity illusion from a
   wide-FOV camera close to the columns, not a real bug. This is a reusable
   lesson: cross-check any ambiguous perspective screenshot with an
   orthographic view before concluding there's a geometry bug.
5. **Shop door/depth inconsistency**: prop Z-positions (door, vault-wheel,
   anvil, crates) mixed the nominal footprint depth `fp.d` with the shop's
   actual (intentionally shallower, "squat strongroom front") built depth
   `fp.d * 0.6`, and the door/wheel radius (`fp.w * 0.22`, nearly half the
   wall width) was oversized. Fixed by using the real built depth
   consistently for all props and reducing the door radius to match the
   villa's own door-width proportion.

Live in-game screenshots (Settlement Lab, actual gameplay lighting/camera,
not the isolated harness) confirmed villa, chapel, and shop all read as
solid, proportioned, coherent buildings with no floating props and no
thin-slab artifacts.

#### 2e.5 Elven — tapering living-wood tower + canopy

Theme grounding: *Elder's Hall* (patriciate), *Ancient Shrine* (church),
*Moonlit Exchange* (market), *Sacred Grove* (park), *Moon Garden* (farm) —
living trees grown/shaped into dwellings, canopy-topped. Root-cause note
from Phase 2d: the previous canopy read as "a muddy brown blob with
dangling root tendrils," and the roof colour `#8a9870` (desaturated sage)
was independently flagged as reading brown under the game's warm
torchlight — this rebuild must deliberately pick a more saturated,
contrast-checked leaf-green accent block colour (same lesson as vulperia's
hardcoded door green), not rely on the shared muted faction palette.
- **Palette**: living-bark trunk blocks (new canvas texture, vertical bark
  grain), saturated leaf-canopy blocks (a hardcoded richer green, contrast-
  checked against the trunk colour the same way vulperia's door was),
  pale "moonstone" accent blocks for shrine trim, small glowing
  firefly/spore accent blocks for night ambience.
- **Shape profile**: a tapering trunk (columns narrow with height — the
  heightfield technique run "inside-out," each level's occupied radius
  shrinking) flaring back out into a wider canopy tier at the top (radius
  increases again for the top 2-3 levels) — corner-chamfering at every
  level keeps the taper reading as a smooth living trunk rather than a
  stepped pyramid; canopy-tier cells get extra top-edge bevel for a soft,
  leafy silhouette instead of a flat mushroom-cap disc.
- **Props/decor**: root-arch entrance (block-built, replacing the old
  "dangling tendrils"), lantern-hung branches, moss/flower ground clutter,
  a distinct grove-of-small-trees prop cluster for the park ward honouring
  *Sacred Grove*.
- Tasks mirror §2e.3.

#### 2e.6 Orcish — crude, lashed, scrap-built

Theme grounding: *Warlord Hall* (patriciate), *War Shrine* (church),
*Loot Pile* (market — literally a pile of scavenged junk, a fun concrete
prop target), *Pit Arena* (park), *Armory*/*Weapon Works* — deliberately
crude, asymmetric, patched-together construction; a good faction to prove
the block system can look *intentionally* rough (irregular, non-uniform
block placement, mismatched palette blocks bolted on) rather than always
clean.
- **Palette**: rough lashed-hide/hewn-log blocks (brown-green, coarse
  texture), scavenged mismatched "patch" blocks (a few off-palette colours
  deliberately mixed in — planks, rusted metal, bone), bone/skull accent
  blocks for totems.
- **Shape profile**: an irregular low hut silhouette with a deliberately
  jagged, uneven roofline (heightfield with higher per-column randomness
  than vulperia's smooth mound, plus a chance for a column to use a
  mismatched "patch" material) — asymmetry is the intended read here, not
  a flaw to smooth away.
- **Props/decor**: the *Loot Pile* market prop (a genuine small pile of
  block-built scavenged junk — crates, weapon fragments, coin heaps), bone/
  skull totem poles, a rough palisade-fence prop kit for ward boundaries.
- Tasks mirror §2e.3.

#### 2e.7 Undead — crumbling, decayed, bone-and-ash

Theme grounding: *Lich Tower* (patriciate), *Bone Shrine* (church),
*Wraith Bazaar* (market), *Graveyard* (park), *Death Forge* (smithy),
*Crypt Gate* (gateward) — ruined, weathered stone with an eerie
necromantic-glow accent.
- **Palette**: ashen weathered-stone blocks (grey-purple, new canvas
  texture with cracking/staining detail), bone-white accent blocks
  (ossuary details), glowing sickly-green "rune"/"phylactery-light" accent
  blocks used sparingly for windows/sigils.
- **Shape profile**: a stepped/tiered tower like dwarven's but
  *deliberately decayed* — the shape-profile function randomly omits a
  sparse scatter of blocks near the upper tiers (holes/collapse, not
  present in dwarven's pristine version) and lets chamfering read as
  crumbled/worn edges rather than clean rounding — reusing the same
  chamfer math but leaning into it as "erosion" rather than "polish" is a
  nice demonstration that one engine serves very different aesthetic
  intents via parameters alone.
- **Props/decor**: cracked headstone/tombstone cluster for *Graveyard*,
  wrought-iron/bone fence, a bazaar prop kit of shrouded stalls for
  *Wraith Bazaar*.
- Tasks mirror §2e.3.

#### 2e.8 Vampire — gothic, elegant, dark stone spire

Theme grounding: *Count's Tower* (patriciate), *Blood Chapel* (church),
*Blood Market* (market), *Moon Courtyard* (park), *Torture Chamber*
(smithy) — tall, narrow, elegant gothic spires; the tallest/most vertical
silhouette of any faction, a good test of the tapering-tower shape-profile
technique from elven applied with a totally different (angular, not
organic) palette.
- **Palette**: near-black obsidian-stone blocks (dark canvas texture with
  subtle veining), deep-red/purple trim accent blocks, wrought-iron accent
  blocks for railings/finials.
- **Shape profile**: a tall narrow tower, tapering slightly with height
  (reusing elven's taper helper with different proportions — much
  narrower, much taller), a flared crenellated top tier (a distinct
  battlement-notch pattern in the top level's occupancy, deliberately
  jagged rather than chamfered-smooth — another proof that the same engine
  supports both "smooth organic" and "sharp gothic" outcomes via the
  occupancy pattern alone).
- **Props/decor**: wrought-iron lantern posts, thorned-vine block clusters
  climbing the tower, a moon-courtyard fountain prop for the park ward.
- Tasks mirror §2e.3.

#### 2e.9 Fae — whimsical mushroom-cap, bioluminescent

Theme grounding: *Fae Court* (patriciate), *Faerie Ring* (church),
*Twilight Market* (market), *Enchanted Glade* (park), *Glamour Forge*
(smithy) — whimsical, magical, pastel-and-glow; the existing Phase 2d
"twisted stalk + scalloped cap" silhouette was the best-received of the
original primitive-based passes, so this sub-phase's job is specifically
translating that already-good *silhouette idea* into block construction
(not inventing a new shape), proving the new technique doesn't have to
throw away good prior design decisions, just rebuild them the right way.
- **Palette**: pastel toadstool-skin blocks (cream/blush, mottled canvas
  texture, distinct from dwarven's pale mushroom-farm prop colour), a
  saturated bioluminescent blue-green accent block for gills/glow-spots,
  petal-pink accent blocks for the *Faerie Ring* church.
- **Shape profile**: narrow stalk tier (tapering, like elven/vampire's
  helper but proportioned shorter/stubbier) flaring dramatically into a
  wide overhanging cap tier (radius increases sharply for the top 2
  levels, overhanging past the stalk's footprint) — cap-tier top edges get
  extra bevel/scallop treatment (a per-cell radial offset pattern on the
  cap's outer ring, echoing the old scalloped-rim silhouette but achieved
  via which corner cells are chamfered vs left proud, not via mesh
  deformation).
- **Props/decor**: small glowing spore-pod clusters, flower-ring ground
  decoration for *Faerie Ring*, twilight-lantern posts for the market.
- Tasks mirror §2e.3.

#### 2e.10 Human — lower priority, block-ify for consistency only

Human (rural/town/noble) already reads fine via the existing shared
`ModularSet.ts` wall-panel/roof system (never part of the "blob" complaint
— it uses `BoxGeometry` wall panels, not deformed primitives, so it never
had this problem). Per the user's "all races" instruction this still gets
a pass, but scoped down: add block-scale **greebling only** (small
`BlockKit`-built decorative clusters — window-box planters, roof-tile
texture via the new per-block canvas-texture technique, a chimney rebuilt
as a small block stack instead of a single smooth box) layered onto the
existing wall-panel skeleton, not a full rebuild of a system that was
never broken. Lowest priority; do after all 7 non-human, non-slime
factions above are verified.

**Slime**: explicitly and permanently exempt from this phase — the user
confirmed slime's gelatinous-blob geometry is *correct* for that faction's
nature and should not be converted to blocks.

#### 2e.11 Rollout order & checkpoints

Sequential, each gated on the shared checklist (§2e.2) passing before the
next starts — no batching multiple factions into one shallow pass (the
exact mistake Phase 2d's first attempt made):
1. **`BlockKit.ts` core engine** (§2e.1) — built and unit-tested once,
   with no faction-specific code, before any faction sub-phase starts.
2. **Vulperia** (§2e.3) — proof of concept; reuses the already-praised
   facade/door; first real end-to-end validation of the whole pipeline
   (profile → mesh → texture → props) before trusting it on the rest.
3. **Dwarven** (§2e.4) — contrast case (angular/monumental, proves the
   engine isn't secretly mound-only, proves the "suppress chamfer on
   monumental cells" override).
4. **Elven** (§2e.5) — taper/canopy shape-profile, direct fix for the
   Phase 2d canopy complaint.
5. **Vampire** (§2e.8) — reuses elven's taper helper at different
   proportions with a totally different palette/mood; validates the
   helper is genuinely shared, not elf-specific.
6. **Fae** (§2e.9) — reuses the taper+flare pattern again, translating the
   already-liked Phase 2d silhouette idea into blocks.
7. **Orcish** (§2e.6) — irregular/asymmetric case, proves the engine
   supports deliberate roughness, not just clean organic softening.
8. **Undead** (§2e.7) — decay/erosion case, reuses dwarven's tiered-tower
   profile with a "sparse omission" decay parameter.
9. **Human** (§2e.10) — greebling-only pass, lowest priority.

At each of steps 2-9, report back with real Playwright screenshots at
realistic camera distance (not close flattering crops) before proceeding
to the next faction — this phase does not get marked done as a whole until
every non-exempt faction has passed its own individual checkpoint.

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
- **`p2e-bloom-tuning`** (new, found during vulperia's §2e.3 Playwright
  verification): `glassLikeMat()`'s lit-window emissive
  (`emissiveIntensity: 0.7`) blooms into an oversized, indistinct flare at
  realistic camera distance once buildings are built from many small
  blocks rather than one large primitive (more, smaller emissive surfaces
  bunched close together compounds the bloom pass). Needs a dedicated
  tuning pass (lower intensity and/or a bloom-threshold/radius adjustment
  in the postprocessing pipeline) once 2-3 more factions are block-built,
  so the fix is judged against multiple factions' windows side by side
  rather than over-fit to one screenshot.
- **Faction-specific coverage gap** (found during vulperia's §2e.3
  verification, pre-existing/not caused by Phase 2e): `FACTION_BUILDING_VARIANTS`
  only overrides `villa`/`chapel`/`shop` (`patriciate`/`merchant`, `church`,
  `market`/`craftsmen` wards). All other ward kinds (`gateward`/`farm` →
  `house`, `slum` → `terraced`, `inn` → `inn`, `smithy` → `blacksmith`) fall
  back to the shared generic builder regardless of faction, and those are
  the *numerically dominant* buildings in any generated settlement — so a
  settlement doesn't read as "faction X" at a glance even once every
  villa/chapel/shop anchor is fully block-built and verified. Worth raising
  with the user as a possible follow-on scope extension (extending
  faction-specific variants to `house`/`inn`/`blacksmith`/`terraced`) once
  the anchor-building rollout (§2e.4-2e.10) is complete, not assumed
  in-scope silently.
