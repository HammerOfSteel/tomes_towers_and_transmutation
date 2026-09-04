# Human Buildings — Design Spec

Human buildings are the baseline settlement kit: familiar medieval-European vernacular that makes every other faction read as exotic by contrast. The kit deliberately favours internal variety — timber frames, plaster infill, stone ground floors, jetties, clay tile, slate, and thatch — so a human street looks built by many hands over centuries rather than by one parametric generator.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

This is the thinnest reference set of the nine races: only three files, one of them an HTML product page rather than a local image. That thin set is still usable because medieval European vernacular is exhaustively documented; section 3 fills the evidence gap with real construction vocabulary, while the reference files drive silhouette, palette, and readable stylisation.

| File | What it shows | Design decisions taken |
|---|---|---|
| `multi_story_house.jpeg` | A compact 3-storey fantasy townhouse with cream plaster walls, terracotta tile roofs, stacked balconies, a front porch, arched windows, visible chimney, side lean-to/wing, and small foundation vents. It is ordinary but richly layered. | Human town/villa/inn language: warm plaster over stone plinth, clay-tile pitched roofs, off-centre secondary rooflets, chimney stacks, balconies/oriel bays, porch posts, exterior stairs, and asymmetrical side additions. The arched upper windows motivate human `archRatio≈0.9-1.0` rather than elven lancets. |
| `simple_cottage.webp` | A toy-like rural cottage on a raised timber deck, with plank walls, round window, round attic oculus, thick blue curved roof, external steps, railings, lantern post, shrubs, and a very simple friendly silhouette. | Rural house/terraced fallback: small cottages may use raised timber platforms, visible porch stairs, chunky railings, round/oculus loft windows, and thick readable roof edges. The blue roof is not copied literally for all humans, but its thick verge/eave informs thatch: rolled eaves, ridge cap, visible roof depth at the gable verge. |
| `varous_house_designs.html` | Saved Superhive/Blender Market page. Grep recovered `<title>` and `og:title`: “Stylized Fantasy House Pack Low Poly 3D Medieval Desert Houses Low-Poly 3D Model”; `og:image` points to a remote product image; `og:description` is generic (“A Unique Market for Creators that love Blender”); no useful `<h1>` was present. | The useful signal is “pack”: humans should have many related house designs, not one canonical shape. “Stylized fantasy low-poly medieval houses” validates readable modular exaggeration: oversized roofs, clear props, chunky framing, varied gables, and colour-value variation. “Desert” is not adopted as the core human theme; at most it permits warmer plaster and clay-tile palettes for town houses. |

Reference-driven constraints:

- Humans must look ordinary first: cream plaster, brown timber, stone bases, clay/slate/thatch roofs, iron straps, lanterns, barrels, shutters, flower boxes.
- Variety must be grammatical, not noisy. The HTML pack implies a set of compatible modules; the street should shuffle roof, wall, porch, window, and jetty modules without stretching mouldings.
- The flagship silhouette from `multi_story_house.jpeg` is stacked occupancy: porch, upper floor, dormer/chimney, side wing. The flagship silhouette from `simple_cottage.webp` is thick low roof + raised deck.

## 2. Race design language

1. **Baseline race, not bland race.** Human buildings are the control group: familiar medieval vernacular that lets elven living towers, dwarven halls, fae mushrooms, and undead crypts read as departures. Their exoticness comes from human ordinariness.
2. **Internal variation is the identity.** Human settlements should look as if owners rebuilt, extended, and repaired them over centuries. The implementation should use split grammar + module swapping + seeded jitter: one row of houses may mix plaster infill, brick nogging, stone bases, jetties, dormers, roof pitches, and chimney positions.
3. **TimberFrame is the flagship `[SHARED KIT]` contribution.** A half-timbered wall is not a texture. It is a proud structural frame of posts, rails, braces, and studs at `+0.08 WU`, with recessed infill panels at `0.00` or `-0.04 WU`. The frame is the facade split grid. Fae, vulperia, and orcish can reuse it with different materials.
4. **Jetty is the signature human silhouette move.** Upper floors may project `0.28-0.45 WU` past the lower wall, carried by a bressummer beam at the floor line, exposed joist ends at `0.28-0.40 WU` spacing, and corbels/knee braces below. It must not be a single enlarged upper box.
5. **Roofs are pitched and constructed.** Thatch and tile are both required. Thatch uses stacked fibrous bands, thick rolled eaves, pegged ridge cap, and visible verge depth. Tile/slate uses `ShingleSurface` courses with running-bond stagger, 2-5° kick, ridge/hip/verge/eave trim, and rafter tails. No smooth swept roof surfaces.
6. **Massing stays readable at Animal-Crossing scale.** Buildings keep compact codebase footprints, but each kind gets a distinct mass: cottage block, row-house bay, L/T manor, broad inn, open forge, long chapel, square watchtower.
7. **Openings are built objects.** Doors and windows use the doctrine five-piece minimum: recess `-0.12`, surround `+0.04`, sill nose `+0.08`, mullion/transom, glazing/door face `-0.20`. Doors add planks, threshold, and strap iron. Round windows are ring + spokes + set-back glazing, not discs.
8. **Palette is warm, mixed, and lived-in.** Main values: plaster `#d8c8a0`/`#e8e0c8`, oak timber `#4a2818`, weathered stone `#7b7468`, clay tile `#a84f2a`, slate `#34383d`, thatch `#8b7040`, iron `#2a2520`.
9. **Asymmetry is mandatory.** Human buildings may be orderly but not mirrored: off-centre door, one repaired panel, one different shutter, one chimney, one dormer, or one blocked-up window per facade.
10. **Ground contact is humble.** Every building uses rubble plinth/string course plus soil/grass skirt, with steps, drainage stones, crates, barrels, benches, or chopped wood at the base.

## 3. Real-world & game-dev basis

Human buildings draw from late-medieval and early-modern European vernacular because that is the most recognizable baseline fantasy village language.

- **Timber framing.** Real half-timbering is post-and-beam construction: vertical posts at bay boundaries, rails at sill/mid/floor/eaves levels, studs between posts, diagonal braces resisting racking, and infill panels of wattle-and-daub, lime plaster, brick nogging, or rubble. This maps directly to `FacadeGrammar`: the split grid creates bays; `TimberFrame` populates bay edges and diagonals.
- **Depth ladder fit.** Timber is proud (`+0.08`), surrounds and door frames sit at `+0.04`, plaster sits at `0.00`, repaired or weathered infill can recess to `-0.04`, window reveals go to `-0.12`, and glazing/door leaves sit at `-0.20`.
- **Jetty construction.** A jettied upper storey projects because floor joists pass over the lower wall and are tied by a heavy front bressummer beam. Visible joist ends, carved corbels, and knee braces are the important readable parts. The wall plane above should start forward, while the lower wall remains flush.
- **Stone ground floor with timber above.** Common in towns and inns: damp-resistant stone/rubble at ground level, lighter timber/plaster above. This gives humans a natural vertical material split and lets row houses differ from cottages.
- **Roof materials.** Rural cottages use thatch: thick straw bundles, rolled eaves, dressed ridge, uneven fibrous silhouette. Town houses use clay tile or slate: individual courses, visible butts, ridge tiles, verge boards, rafter tails. Tile should be common on inns/shops/villas; thatch on houses and some terraced rows.
- **Urban party walls.** Terraced houses share side walls, are narrow-fronted, and vary by bay decorations, shutters, signs, dormers, and roof repairs. They should line up in rows but not clone exactly.
- **Chimneys and dormers.** Chimney stacks are a core human skyline feature; a settlement without chimneys reads uninhabited. Dormers and attic oculi provide silhouette breaks and small-scale variety.
- **Game-dev procedural approach.** Use a small fixed module library selected by weights: wall bay modules, opening modules, roof modules, porch/deck modules, props. `FacadeGrammar` handles leftover widths with filler panels. `MassComposer` creates L/T/porch/dormer add-ons. This is cheaper and more believable than scaling one mesh.

Concrete `TimberFrame` rules:

- Base module width: nominal `2.0 WU`; accepted bay widths `1.6-2.4 WU`; filler panels absorb leftover at facade ends and must be visually marked as narrow repair bays.
- Storey height: `3.2 WU`; rails at `0.18`, `1.05`, `2.15`, and `3.12 WU` within each storey. Floor/bressummer beam: `0.18-0.24 WU` high, `0.16-0.22 WU` deep.
- Posts: `0.16-0.22 WU` wide, full storey height, at bay boundaries and outer corners. Corner posts can project to `+0.10 WU`.
- Studs: `0.08-0.12 WU`, placed when a bay exceeds `1.3 WU`; maximum open infill span `0.75 WU`.
- Braces: `0.10-0.14 WU`, angle `35-55°`, endpoint notches land on posts/rails, not floating in the infill. Avoid crossing window apertures unless the window is intentionally framed as an oriel.
- Patterns by weight: simple tension brace `35%`, St Andrew's cross `25%`, herringbone/nested chevrons `15%`, quatrefoil panel `10%`, brick-nogging grid `10%`, blank plaster repair panel `5%`.

## 4. Per-kind blueprint

### 4.1 `house`

| Attribute | Blueprint |
|---|---|
| Footprint | `4 × 3 WU` small house (`getFootprint('house','small')`), optional porch/deck adds up to `0.8 WU` front projection. |
| Floors/storeys | `1` main floor plus loft; `2` floors in town seeds `30%`. Storey height `3.2 WU`; loft knee wall `0.8-1.1 WU`. |
| Massing | Simple rectangle with one optional lean-to (`35%`) on a side or rear; rural variants may use raised deck from `simple_cottage.webp`. |
| Wall system | `55%` timber frame + plaster infill, `25%` rubble/stone ground half with timber above, `20%` plank cottage wall. Plinth `0.35 WU` rubble, skirt stones around base. |
| Opening schedule | Front: one off-centre plank door `0.9×2.0 WU`, one window `0.72×0.95`; side/rear: 1-2 small windows. Loft: round oculus `0.45-0.55 WU` or tiny dormer `35%`. All openings: surround `+0.04`, sill `+0.08`, reveal `-0.12`, glazing/door `-0.20`. |
| Roof archetype | `55%` thatch steep gable, pitch `48-55°`, eave roll `0.18 WU`; `30%` clay tile gable, pitch `38-45°`; `15%` slate half-hip. Eaves `0.35-0.5 WU`; ridge cap always present. |
| Ornament/props | Shutters, flower box, chopping block, barrel, bench, lantern hook, patched infill panel, single chimney. |

Variation axes:

| Axis | Weight |
|---|---:|
| Thatched cottage with raised deck/steps | 30% |
| Timber-frame plaster cottage | 30% |
| Stone-base town cottage | 20% |
| Side lean-to or shed extension | 15% |
| Tiny round-window whimsy from `simple_cottage.webp` | 5% |

### 4.2 `terraced`

| Attribute | Blueprint |
|---|---|
| Footprint | `3 × 4 WU` narrow row house. Treat as one unit that can visually imply neighbours with party-wall sides. |
| Floors/storeys | `2` floors baseline; `3` floors `25%`. Storey height `3.2 WU`. |
| Massing | Tall narrow rectangle; front facade split into 1-2 bays. Upper storey jetty `70%`, projection `0.3-0.4 WU`. Party walls plain, no side windows. |
| Wall system | Ground floor `60%` stone/brick, `40%` timber/plaster. Upper floors almost always `TimberFrame`. Infill may alternate plaster and brick-nogging panels. |
| Opening schedule | Door off-centre at ground (`0.8×2.0`), shop-like front window optional `25%`; upper: 1-2 windows/floor, one special bay (oriel `20%`, blocked/repaired `10%`). Depth ladder as above; window sill projects beyond frame by `0.04 WU`. |
| Roof archetype | Street-facing gable `45%`, side-gable shared row roof `35%`, mansard/attic dormer `20%`. Clay tile `65%`, slate `25%`, thatch only `10%`. |
| Jetty details | Bressummer beam at first-floor line, exposed joist ends every `0.32 WU`, corbels under every other joist, underside shadow board. |
| Ornament/props | Hanging sign hook, laundry pole, shutters, drain spout, shared party-wall chimney, small stoop. |

Variation axes:

| Axis | Weight |
|---|---:|
| Jettied upper floor with St Andrew's cross panels | 30% |
| Plain timber frame with brick-nogging infill | 25% |
| Stone ground floor + plaster upper | 20% |
| Oriel/bay-window special bay | 15% |
| Repaired/blocked-up opening | 10% |

### 4.3 `villa`

| Attribute | Blueprint |
|---|---|
| Footprint | `7 × 5 WU` manor/villa. Add wings within `±1.5 WU` using `MassComposer`, but bounds stay readable. |
| Floors/storeys | `2` floors baseline; attic/dormer level visual only; storey height `3.2 WU`, plinth `0.55 WU`. |
| Massing | L-plan `35%`, T-plan `25%`, central block + side wing `25%`, compact manor `15%`. Asymmetry required: one wing, one porch, or offset chimney. |
| Wall system | Stone ground floor `70%`; timber/plaster or Tudor upper `65%`; high-status all-stone with timber gables `20%`; all-plaster townhouse `15%`. |
| Opening schedule | Front: 4-5 bays, but one bay altered. Door `1.1×2.2` with canopy/porch; 2-4 ground windows, 3-5 upper windows, 1-3 dormers. Windows may be arched (`35%`) or rectangular with cross mullions. Depth ladder enforced. |
| Roof archetype | Clay tile hip/gable compound `55%`; slate steep gables `30%`; mixed tile + thatch service wing `15%`. Ridge crest or finials `25%`; 2 chimneys minimum. |
| Ornament/props | Balcony or porch from `multi_story_house.jpeg`, carved bargeboards, lanterns, garden pots, cellar vents, rain barrels. |

Variation axes:

| Axis | Weight |
|---|---:|
| L-plan manor with tile roof | 35% |
| T-plan with cross wing and dormers | 25% |
| Stone ground floor + jettied timber upper | 20% |
| Plaster townhouse with balconies | 12% |
| High-status slate-roof variant | 8% |

### 4.4 `inn`

| Attribute | Blueprint |
|---|---|
| Footprint | `7 × 5 WU` large inn/tavern. Porch/gallery may project `0.8-1.2 WU`; rear kitchen bump-out `40%`. |
| Floors/storeys | `2` floors baseline, `3` floors `20%`; storey height `3.2 WU`; ground storey slightly taller (`3.4 WU`) when using public hall. |
| Massing | Broad frontage, visible public entrance, side stable/lean-to `30%`, upper gallery/balcony `45%`. |
| Wall system | Stone or brick ground floor (`65%`) for public hall, timber frame upper (`80%`), plaster/brick infill mixed by bay. |
| Opening schedule | Front: double plank door `1.4×2.2`, 2 large mullioned ground windows, 3-5 upper windows, sign bay, optional balcony doors. Sides: 1-2 windows. Kitchen rear gets small service door. All windows five-piece; doors planked with straps. |
| Roof archetype | Clay tile broad gable/hip `60%`, slate `25%`, thatch rural inn `15%`; 2-3 chimneys; 1-2 dormers; eaves `0.45 WU`. |
| Ornament/props | Hanging inn sign, barrels, benches, wagon wheel, lantern pair, stacked crates, balcony rails, visible cellar hatch. |

Variation axes:

| Axis | Weight |
|---|---:|
| Broad tile-roof inn with porch | 30% |
| Jettied upper gallery | 25% |
| L-plan inn with rear kitchen | 20% |
| Rural thatched coaching inn | 15% |
| Slate-roof town inn with many dormers | 10% |

### 4.5 `shop`

| Attribute | Blueprint |
|---|---|
| Footprint | `4 × 3 WU` small shop (`market/craftsmen`). Front awning/counter projects `0.45-0.7 WU`. |
| Floors/storeys | `1` floor plus loft `60%`, `2` floors `40%`. |
| Massing | Compact facade-first building with clear shopfront; upper living space may jetty `35%`. |
| Wall system | Timber frame with larger ground-floor opening; stone sill course and plinth; infill varies by trade. |
| Opening schedule | Front: shop door `0.85×2.0`, display/counter opening `1.3-1.7×1.0` with sill/counter slab at `+0.08`, mullions/dividers, set-back dark shop interior at `-0.20`; upper 1-2 windows. Side/rear 0-1 windows. |
| Roof archetype | Clay tile gable `50%`, slate gable `25%`, thatch rural market `15%`, pent awning roof `10%` layered over main roof. |
| Ornament/props | Hanging sign selected from trade icons, crates, fabric awning with ribs, shutters, baskets, lantern, small chimney. |

Variation axes:

| Axis | Weight |
|---|---:|
| Open counter market shop | 30% |
| Timber-frame shop with signboard | 25% |
| Jettied upper living floor | 20% |
| Awning-heavy stall-shop hybrid | 15% |
| Rural thatched craft shop | 10% |

### 4.6 `blacksmith`

| Attribute | Blueprint |
|---|---|
| Footprint | `5 × 4 WU`. Open work bay faces street; forge mass at rear/side. |
| Floors/storeys | `1` tall work floor, wall height `3.2 WU`; storage loft visual `30%`. |
| Massing | Three-sided workshop with heavy posts and open front, lean-to coal/wood shed `45%`, chimney stack dominant. |
| Wall system | Rubble/stone lower walls, timber posts, soot-darkened plank or plaster infill. Open front uses lintel + braces, not missing wall. |
| Opening schedule | Front: wide work opening `2.4-3.0 WU` with two posts, lintel, diagonal braces. Personnel door side/rear `0.85×2.0`; 1-2 small high windows with shutters/iron bars. Forge aperture reads as constructed hearth, not glowing box. |
| Roof archetype | Tile or slate low gable `55%`, half-hip `20%`, thatch only on side shed `25%`; roof has sparks/soot darkening near chimney and visible rafter tails. |
| Ornament/props | Masonry forge, bellows, anvil block, quench barrel, tool rack, horseshoe sign, coal pile, massive corbelled chimney at `+0.12` breast. |

Variation axes:

| Axis | Weight |
|---|---:|
| Open-front forge with tile roof | 35% |
| Side lean-to coal shed | 25% |
| Massive corner chimney | 20% |
| Timber-framed loft over forge | 12% |
| Rural thatched shed roof accent | 8% |

### 4.7 `chapel`

| Attribute | Blueprint |
|---|---|
| Footprint | `4 × 8 WU` long nave. Optional porch `0.6 WU`; tiny apse `1.0-1.4 WU` projection if bounds allow. |
| Floors/storeys | One tall sacred volume, wall height `5.0-5.8 WU` (`~1.6-1.8` storeys), no inhabited second floor. |
| Massing | Plain rectangular parish chapel, humble baseline, with bellcote or small timber bell frame instead of grand tower. |
| Wall system | Weathered stone block-course lower walls using `buildWallSurfaceBlocks()`/`VoussoirArch`; plaster/timber porch possible. Buttresses modest: `+0.30` at long-wall intervals. |
| Opening schedule | Long sides: 2-3 arched windows per side (`0.7×1.8`), equilateral/soft Gothic `archRatio 0.9-1.1`; west/front door `1.0×2.2`; small round or arched gable window. All with voussoirs, sill, mullion/tracery, set-back dark/stained glazing. |
| Roof archetype | Slate or clay tile steep gable `75%`; thatch for rural chapel `15%`; wood-shingle bellcote roof `10%`. Ridge cross/finial; bargeboards. |
| Ornament/props | Bellcote slab with tiny bell, simple buttresses, grave markers/flower pots, stone path, small lantern, optional rose/quatrefoil gable panel. |

Variation axes:

| Axis | Weight |
|---|---:|
| Stone parish chapel with slate roof | 35% |
| Clay-tile chapel with timber porch | 25% |
| Bellcote with one visible bell | 20% |
| Rural thatched chapel | 10% |
| Quatrefoil/rose gable accent | 10% |

### 4.8 `watchtower`

| Attribute | Blueprint |
|---|---|
| Footprint | `2 × 2 WU` narrow tower; allow battlement/roof overhang to `2.8 WU`. |
| Floors/storeys | Minimum 4 floors (`12.8 WU` wall height), with visual floor/string courses every `3.2 WU`. |
| Massing | Square or octagonal town watchtower with taper `0.03-0.05 WU` per floor, stair turret `25%`, timber hoarding/lookout `35%`. |
| Wall system | Coursed stone using `buildWallSurfaceBlocks()` on rectangle/octagon faces; quoins and string courses. Human timber hoarding can reuse `TimberFrame` rail/post language at top. |
| Opening schedule | Ground door `0.8×2.0` with voussoir arch. Arrow loops one per exposed face per upper floor: recess `-0.12`, proud stone surround `+0.04`, sill/hood `+0.08`, dark slit plane `-0.20`, optional crossbar. Top lookout has shuttered openings. |
| Roof archetype | Crenellated parapet `45%`, slate pyramidal roof `35%`, tile hipped cap `20%`; always with coping, not raw merlon boxes. |
| Ornament/props | Banner pole, lantern cage, hoarding corbels, ladder/stair door, murder-hole shadow, chipped stones. |

Variation axes:

| Axis | Weight |
|---|---:|
| Stone tower with crenellated parapet | 35% |
| Slate-roof town belfry/watchtower | 25% |
| Timber hoarding on corbels | 20% |
| Stair turret or side stair | 12% |
| Banner/lantern silhouette accent | 8% |

## 5. Kit modules consumed

Shared kit expected to exist by the time human runs third (after elven and dwarven):

- `DepthLadder.ts` — binding constants and dev assertion.
- `OpeningParts.ts` — five-piece windows/doors, plank doors, strap iron, glazing.
- `GothicArch.ts` / `VoussoirArch.ts` — human soft pointed/round arches and block-built chapel/watchtower openings.
- `StringCourse.ts` — plinth, floor bands, sill courses, weathered wall breaks.
- `Bevels.ts` — chamfered/extruded edges, no cardboard planes.
- `FacadeGrammar.ts` — split grid for bays, jetties, filler panels, and shopfronts.
- `ModuleSocket.ts` — fixed module dimensions, symmetry flags, socket validation.
- `ShingleSurface.ts` — clay tile/slate courses, ridge/hip/verge/eave trim and rafter tails.
- `RoofMassing.ts` — gable/hip/compound roofs on rectangular and L/T footprints.
- `MassComposer.ts` — main block + wing + porch + dormer + chimney composition.
- `BatchedDetail.ts` — batched roof tiles, straw wisps, props, and rubble where appropriate.
- `LatheColumn.ts`, `Buttress.ts`, `Tracery.ts` — limited chapel/porch use.
- Existing `buildWallSurfaceBlocks()` and `facesOverride` — stone plinths, chapel, watchtower, chimneys, and rubble courses; keep material identity shared for merge bucketing.

Genuinely new modules human should contribute:

- `[SHARED KIT] TimberFrame.ts` — proud posts/rails/studs/braces over recessed infill, driven by `FacadeGrammar` bays. Reusable by fae/vulperia/orcish with different material presets.
- `[SHARED KIT] ThatchRoofSurface` profile or `ShingleSurface` thatch mode if not already built by elven/dwarven — stacked scalloped bands, straw wisps, thick eave roll, woven/pegged ridge cap, and verge depth.
- Race-specific `HumanBuildingsKit.ts` / `HumanBuildingModules.ts` — composition weights, human material palette, props, kind dispatch, and seeded variation tables.
- Race-specific `HumanJetty.ts` — bressummer/joist/corbel/brace assembly. Keep it parameterised, but do not mark as shared unless another race explicitly consumes it.

## 6. Quality-bar compliance

| Doctrine rule | Human compliance |
|---|---|
| Rule 1 — depth ladder | `TimberFrame` makes the ladder visible: frame `+0.08`, surrounds `+0.04`, wall `0.00`, recessed infill `-0.04`, reveals `-0.12`, glass/doors `-0.20`, buttresses/chimney breasts `+0.12/+0.30`. Dev assertion required in tests. |
| Rule 2 — five-piece openings | Every window/door schedule specifies recess, proud surround, sill/threshold, mullion/transom/strap divisions, and set-back glass/door plane. Round/oculus windows use ring + spokes + glazing. |
| Rule 3 — no banned primitives | No bare boxes/spheres/cylinders as readable features. Props use composed meshes: barrels with staves/hoops, crates with slats, signs with frame/bracket, lanterns with cage panes. Roofs are courses/bands, not planes. |
| Rule 4 — module swapping | Human variety is from fixed-size wall/roof/porch/jetty modules selected by weights, facade split grammar, and one special bay per facade. Mouldings are not scaled with the footprint. |
| Rule 5 — silhouette | Chimneys, jetties, dormers, porches, balconies, bellcotes, hoardings, ridge caps, and asymmetrical wings break the skyline on every kind. |
| Rule 6 — ground contact | Every kind has rubble/stone plinth, base skirt, steps, drainage stones, or prop clutter touching ground. No flat-bottom floating boxes. |
| Rule 7 — asymmetry | Every kind has a required asymmetry source: off-centre door, wing, chimney, jetty, repaired panel, special bay, side shed, or tower hoarding. |

## 7. Current-state delta

- `mapStudioFactionToRuntimeFaction('human')` maps studio id `human` to runtime faction `human_town`; unknown studio factions also fall back to `human_town`.
- `BuildingDNA.ts` already contains three human presets: `human_rural` (`thatched`), `human_town` (`timber`), and `human_noble` (`tudor`). The user's race target is specifically runtime `human_town`.
- `FACTION_BUILDING_VARIANTS` currently has no `human_town`, `human_rural`, or `human_noble` entry. Human therefore falls through to `BuildingBuilder.ts` generic kind builders with timber palette overlays.
- The generic builders have some useful seeds to keep: compact footprints, plinths, chimneys, terraced jetty intent, villa portico intent, blacksmith open forge intent, chapel long nave, and watchtower slit/battlement intent.
- The current implementation does not meet the doctrine bar: many visible walls are large boxes/textured panels; doors/windows include box/sphere stand-ins; roofs use coarse primitives; timber framing exists only as a few box strips rather than a structural split grid; jetty is an enlarged upper box with one beam; watchtower/chapel openings and merlons need rebuilt detailing.
- Human should be rebuilt as a new faction-specific kit, not by patching the generic builder case-by-case. Keep only safe generic helpers where they already meet the bar (e.g. the coursed chimney idea can be upgraded to shared materials/merge-safe geometry).
- `watchtower` has no `WARD_TO_KIND` entry today. Do not solve reachability inside the human kit; reference doctrine §9.1's cross-race proposal to map the anchor building of the `gateward` ward to `watchtower` and keep human wiring ready for that decision.

## 8. Out of scope / deferred

- Natural settlement reachability for `watchtower` beyond the doctrine §9.1 gateward-anchor proposal. The human plan should showcase it but not choose the cross-race spawning policy.
- Full interior layouts. Door/window placement should be compatible with interiors, but interiors are not part of this visual kit pass.
- New material/texture pipeline. Use existing `MeshStandardMaterial`, shared materials, instance colors, and existing texture helpers unless the implementation phase already has a shared material upgrade.
- Complex cloth simulation for awnings or hanging laundry. Use fixed ribbed geometry with seeded sag poses.
- True CSG carving. Occupancy-carve/block-course/voussoir construction remains the doctrine-preferred method.
- Perfect historical period purity. The target is readable fantasy baseline, not a museum reconstruction.
