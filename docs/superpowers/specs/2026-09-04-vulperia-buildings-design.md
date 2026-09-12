# Vulperia Buildings — Design Spec

Vulperia settlements should read as fox-folk warrens: warm, watchful, clever buildings tucked into grassland/savanna earth, with low stone/cob walls, timber detail, many small framed openings, and thick sod/turf roofs that sweep down like sheltering hills without ever becoming smooth green blobs. The current burrow-mound idea remains valuable as lore and ground dressing, but the building kit must move to modular constructed architecture: coursed walls, five-piece openings, raised porches/dormers for legibility, and a rigorous berm/skirt at every terrain contact.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

The Vulperia reference set is the thinnest of the race-building batches: only two files, and one is an HTML page with remote images. That thinness means the single local building sheet carries unusual weight. I treat it as the primary visual source, then cross-check it against in-repo Vulperia lore and prior building/territory work rather than inventing a wholly new look.

### `various_buildings_and_town_assets_reference_art.html`

- Saved page title: **“Free Elf House 3D Low Poly Models - CraftPix.net.”**
- H1: **“Free Elf House 3D Low Poly Models.”**
- Metadata description: a collection of buildings for fairy folk; the set also contains **houses, statues, fountains, awnings, lanterns**, and related low-poly town assets; total listed as **20 objects**.
- `og:image`: `https://img.craftpix.net/2021/01/Free-Elf-House-3D-Low-Poly-Models.jpg` plus additional numbered preview images on the same host.
- Design use: this page is not Vulperia/fox-specific and should not override established fox-folk identity. It does validate the low-poly fantasy town language visible in the local JPG: small houses, awnings, lanterns, single-atlas/simple-material discipline, and modular town props. For Vulperia, this feeds the **Night Market shop awning**, **Wanderer's Den lanterns**, **Tinkerer's Shop clutter**, and **small reusable town-prop vocabulary**, not elven ornament.

### `various_buildings_reference_art.jpg`

The JPG is a multi-building sheet with seven distinct structures. It confirms the user's skim in the important ways — green moss/turf-like roofs, low cosy scale, rounded/burrow-like massing, natural material — but it also adds details the implementation must not miss: exposed wall faces, timber/stone verge trim, raised entrances, chimneys, awnings, and many small openings. The roof surfaces are visibly segmented/constructed, not smooth green domes.

1. **Top-left large multi-mass house / hall**
   - Two-storey or tall 1.5-storey composition with multiple intersecting roof forms, pale stone/cob wall blocks, dark recessed windows, and a central arched/timber door.
   - The green roof is broken into roof planes with visible ridge/hip seams and dark trim at the verge. It is not one continuous blob.
   - Design decisions taken: `villa` and `inn` use multi-mass composition, cross-gables, several small watching windows, and at least one offset wing rather than a single rectangular mass.

2. **Top-centre tiny chimney cottage / shrine**
   - Compact one-room form with a steep green gabled roof, a tall chimney rising through/behind the ridge, a pointed/arched front door, and two small round or porthole-like side windows.
   - Design decisions taken: `house` and `chapel` get a chimney or smoke/lantern vertical as a skyline break; small round windows are allowed only when they satisfy the five-piece opening rule with a real frame, sill/lower lip, mullion/crossbar, and recessed dark glazing.

3. **Top-centre-right narrow gable hut**
   - Small, rounded hut with a tall chimney stack, pronounced gable-end trim, and a steep green roof sweeping low over compact wall massing.
   - Design decisions taken: `terraced` and `house` use low eaves, but front/gable openings must remain visible through raised porch cuts and gable-end placement.

4. **Top-right small gable cottage**
   - Very compact house with one arched timber door, strong pale verge boards, a green roof made of individual planar patches, and a tiny chimney/vent.
   - Design decisions taken: the smallest Vulperia buildings should still have readable construction layers: wall plinth, timber bargeboards, roof turf-stop, visible roof thickness, and a single dominant door rather than decorative clutter.

5. **Bottom-left shop / awning structure**
   - A small building with a green gabled back roof and a projecting tan timber/canvas awning over a counter or work area, held by posts.
   - Design decisions taken: `shop` becomes the **Night Market den-mouth stall**: a roofed back burrow plus a real pole-supported awning/counter. `blacksmith` uses the same “roofed back + open work bay” composition but with a stone apron and chimney hood instead of market cloth.

6. **Bottom-centre long hall**
   - Long, low building with a broad green roof sweeping down across much of the side elevation, a raised central front entrance/porch that cuts upward through the eave, and small wall/gable openings.
   - This is the key precedent for `chapel` and `inn`: low-sweeping eaves are acceptable only if the main doorway is raised/protected and windows move to dormers, gables, or cut-through porch volumes.

7. **Bottom-right compact turf-roof cottage**
   - The clearest “burrow home” image: squat, rounded mass, arched door at the gable end, green roof wrapping down toward the ground, minimal exposed wall, and a cosy scale.
   - Design decisions taken: `house` is the purest version of the Vulperia signature; `terraced` repeats it as narrow attached burrow units. Both must include a local earth/grass skirt so the low roof and berm never leave a visible gap under the building.

**Validation of the initial skim:** the reference does support mossy/turf-like low roofs, burrow-like scale, and natural material. It does **not** support using a smooth mound as the building body. The art consistently shows constructed walls, doors, roof edges, chimneys, and trim. The implementation should therefore rebuild Vulperia as constructed sod-roof architecture, not as a green heightfield blob.

## 2. Race design language

1. **Signature roof: thick sod/turf construction.** Every primary Vulperia roof uses a real layered `TurfRoof`: timber rafters, board deck, visible board ends at the eaves, projecting turf-stop/eaves board, a thick sod layer with exposed dark soil under grass at the verge, and instanced grass tufts/wild plants. The turf edge is the read; never model the roof as a smooth green shell.

2. **Low, sheltering silhouettes.** Houses, terraces, shops, and halls have low eaves and rounded proportions. The roof may sweep close to the ground, but it must not hide gameplay-readable entrances or windows. Openings move to raised porches, gable ends, eyebrow dormers, and roof-punched windows.

3. **Burrow without terrain deformation.** The building includes its own shallow earth/grass skirt, plinth, and entry berm inside the mesh. It sits at normal placement height and needs no new settlement-placement or terrain-cutting machinery.

4. **Warm grassland/savanna palette.** Established palette: warm ochre walls `#d4a060`, roof brown `#8a5020`, trim `#c88030`, dark door `#6a3810`; map colors `#c09060`/`#4a2808`; existing v2 contrast accents use grass green `#3d6b35`, facade dark brown `#4a3520`, and deep green door `#2f5233`. Turf should lean olive/sage/dry grass, not saturated forest green.

5. **Fox-folk watchfulness.** Small windows are numerous but never flat decals. The language from `docs/BUILDINGS.md` — “lots of windows for watching,” narrow passages, hidden rooms, multiple exits — becomes small framed portholes, eyebrow dormers, gable slits, and rear escape doors.

6. **Clever asymmetry.** Doors are off-centre when possible; one dormer or chimney is always displaced; side wings differ in size. Perfect bilateral symmetry is not Vulperia.

7. **Natural material hierarchy.** Base/plinth: stone/packed earth. Main wall: block-course fieldstone or cob panels framed in timber. Openings: timber/stone surrounds. Roof: sod on timber. Props: twig markers, small fences, planters, crates, lanterns, market cloth, and tinker scrap.

8. **Small scale, dense detail.** Vulperia buildings are cosy and low, but readable at isometric distance because of roof-edge thickness, dark recessed openings, sill highlights, chimney silhouettes, and clustered dooryard props.

9. **Settlement continuity.** Existing biome affinity says Vulperia prefer `grassland` and `savanna`. Existing territory dressing uses warren mounds, burrow-hole clusters, den markers, and `earthTexture`; the building kit should make those props feel like the outskirts of the same culture, not a separate art direction.

10. **Current mound work is a support asset, not the new main architecture.** `buildVulperiaDenMoundGrid()` remains useful for territory dressing and local berm/skirt pieces. It should not remain the main building mass for all kinds.

## 3. Real-world & game-dev basis

**Turf/sod roof construction.** Real turf roofs are layered assemblies, not green shapes. A typical vernacular build has rafters or purlins, a board deck, waterproofing layers, then heavy sod/turf cut into slabs. The eave needs a retainer board/log/turf-stop so the sod does not slide off. At the roof edge, the viewer sees thickness: grass on top, dark soil beneath, then timber deck/rafter ends. This is exactly the technical signature Vulperia needs. In-game, the roof should use explicit edge geometry and instanced vegetation detail, not a green material on a smooth plane.

**Earth-sheltered/burrow architecture.** Hobbit-hole and earth-sheltered vernacular architecture solve the fantasy “burrow home” read with a constructed facade: a door and windows set into a built retaining wall, with earth banked around it. For this game, the safe procedural equivalent is a normal placed building mesh that includes a plinth, retaining-wall facade, local berm skirt, and grass/soil apron. No terrain carving is required.

**Openings under low eaves.** Real low cottages put entries in gable ends, dormers, porches, or projecting vestibules. The reference sheet repeatedly uses gable-end doors and raised entrance masses. Therefore, every Vulperia kind must explicitly preserve line-of-sight to its door/window schedule from the isometric camera: low eaves can shelter walls, but never cover all facade reads.

**Procedural building method.** Use the doctrine's kit-of-parts approach: fixed modules, facade split grammar, module swapping, one special bay per facade, seeded jitter, and merge/batch discipline. Walls reuse the praised `buildWallSurfaceBlocks()`/block-course technique or a module of equal quality. Openings use `OpeningParts`/`VoussoirArch`/five-piece construction. Roofs use the new shared `TurfRoof` module over `RoofMassing`/`MassComposer` instead of one-off planes.

**Game readability.** Isometric distance makes silhouettes and shadows matter more than micro-detail. The important Vulperia reads are: thick turf eaves, dark recessed openings, raised porch cuts, small chimneys, fox-tail banners/den markers, and earth skirts. Tiny knobs/bolts are wasted; broad sill, bargeboard, soil-edge, and dormer shadows are not.

## 4. Per-kind blueprint (all 8 kinds: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`)

### Shared dimensional and opening conventions

- **Depth ladder:** all openings and facade elements use the doctrine offsets: buttress/porch posts `+0.30`, chimney breast/pilaster `+0.12`, quoin/string/hood/sill nose `+0.08`, frame/surround `+0.04`, wall face `0.00`, panel recess `-0.06`, reveal `-0.12`, glazing/door face `-0.20`.
- **Wall block depth:** target visible block/reveal depth `0.18` WU, never less than `0.12` WU.
- **Vulperia window types:**
  - `round_watch`: circular/oval porthole, diameter `0.42-0.60`, real timber-stave or voussoir ring at `+0.04`, lower crescent sill at `+0.08`, at least one crossbar/mullion, dark set-back glazing at `-0.20`.
  - `eyebrow_dormer`: roof-punched small dormer, aperture `0.55-0.80w × 0.45-0.65h`, mini turf hood with its own exposed soil edge, frame `+0.04`, sill `+0.08`, glazing `-0.20`.
  - `gable_slit`: narrow watching slit, `0.22-0.32w × 0.75-1.10h`, recessed, framed, with a horizontal bar/transom; used for watchtower and rear exits.
- **Vulperia door types:**
  - `burrow_round_door`: arched/rounded plank door, `0.95-1.25w × 1.45-1.85h`, in a recessed retaining-wall facade; threshold/stone step at `+0.08`, plank gaps, 3-5 strap bands, no sphere doorknob as the readable feature.
  - `porch_cut_door`: arched plank door inside a raised porch that cuts through low eaves; porch posts at `+0.30`, hood/bargeboard at `+0.08`.
- **Ground contact:** every kind gets a stone plinth/string course and an irregular earth/grass skirt extending at least `0.30` WU beyond the wall/roof drip line. Where the roof comes within `0.45` WU of ground, the skirt rises into a berm so no underside gap can be seen.

### `house` — Fox Garden burrow cottage

| Field | Blueprint |
|---|---|
| Footprint | `4 × 3` WU (`small` house), optional dooryard skirt extends to `4.8 × 3.8` WU. |
| Floor count / height | 1 visual floor; wall/eave height `1.45-1.65` WU; ridge `3.0-3.35` WU. |
| Wall system | Low rectangular fieldstone/cob body with rounded corner posts; 3-4 block-course bays per long face; dark retaining-wall facade at front gable. |
| Opening schedule | 1 `burrow_round_door` on front gable, off-centre by `0.20-0.35` WU; 2 `round_watch` windows flanking or one side + one rear; 1 `eyebrow_dormer` only if the eave hides side wall. All use depth ladder above. |
| Roof archetype | `TurfRoof.lowGable`, eave overhang `0.45-0.70` WU, turf thickness `0.22-0.34` WU, exposed cut edge all around; eaves may approach `0.30` WU above skirt but must lift at front porch. |
| Ornament / props | Small chimney offset left/right, twig den marker, planter barrel, low fence, 1-2 crates, fox-tail pennant. |
| Ground treatment | Earth skirt blends wall into grassland/savanna ground; front step sits on a packed-earth apron, not floating over terrain. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Roof sweep | 50% very-low side eaves, 35% standard low gable, 15% asymmetrical one-side sweep |
| Door placement | 60% off-centre left/right, 30% centred under porch, 10% side-gable entry |
| Window set | 45% two round windows, 35% one round + one dormer, 20% three tiny watch windows |
| Chimney | 55% single squat chimney, 25% no chimney but lantern pole, 20% paired vents |
| Dooryard prop | 35% planter, 30% twig marker, 20% crate stack, 15% low fence |

### `terraced` — Poor Burrows row segment

| Field | Blueprint |
|---|---|
| Footprint | `3 × 4` WU per segment; can read as a row when placed near other slum buildings; party-wall sides respect `dna.terrace`. |
| Floor count / height | 2 low floors, second floor partly inside roof; visual storey `2.15` WU; eave `2.25` WU; ridge `3.85` WU. |
| Wall system | Narrow cob/stone front and rear gables; side walls are plain party walls if shared, otherwise get one tiny side slit. Front retaining facade is taller than the house version for stacked occupancy. |
| Opening schedule | 1 `porch_cut_door` or `burrow_round_door` on front; 1 upper `eyebrow_dormer` above door; 1 rear escape door/slit; side windows only on non-party sides. |
| Roof archetype | Continuous `TurfRoof.rowGable`, eave board/dentil edge repeated at fixed module width; optional staggered dormers so row does not look stamped. |
| Ornament / props | Shared gutter/turf-stop board, laundry line, small ladder, cramped crate pile, one den marker per 2-3 segments. |
| Ground treatment | Continuous berm strip along front and back, `0.25-0.45` WU tall; it must cover any visible underside where roof and side wall nearly meet. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Segment roof | 50% continuous row roof, 30% slightly raised individual bay, 20% patched repair bay |
| Party sides | 45% both, 25% left, 25% right, 5% none (standalone edge case) |
| Upper opening | 55% eyebrow dormer, 30% gable porthole, 15% shuttered slit |
| Entry read | 50% raised porch cut, 35% recessed burrow door, 15% side-offset stair |
| Clutter | 35% laundry, 25% crates, 20% lantern, 20% twig screen |

### `villa` — Fox Den / elder burrow hall

| Field | Blueprint |
|---|---|
| Footprint | `7 × 5` WU; main hall `5.8 × 4.2`, one side lobe `2.2-2.8` WU, porch `1.6 × 1.2`; skirt extent about `8 × 6` WU. |
| Floor count / height | Merchant villa: 2 floors; patriciate Fox Den: 3 floors with top floor mostly dormer/loft. Visual storey `2.35` WU; max ridge `5.6-6.4` WU. |
| Wall system | Main hall uses block-course stone/cob base with timber posts at bay divisions; upper wall visible primarily at gables and dormers. Side lobe echoes existing “second smaller den mound” idea but as a constructed wing under its own turf roof. |
| Opening schedule | 1 dominant `porch_cut_door`; 4-6 `round_watch` windows across front/side gables; 2-3 `eyebrow_dormer` windows for upper floors; 1 hidden rear service door. Door face `-0.20`, reveals `-0.12`, frames `+0.04`, sills/hoods `+0.08`. |
| Roof archetype | `TurfRoof.crossGable` over main hall + side wing, visible hip/ridge seams, one roof plane intentionally longer/lower. Turf thickness `0.28-0.38` WU. |
| Ornament / props | Fox-tail banner, den marker cluster, leader's lantern, small garden fence, information-scroll boxes, two chimneys or chimney + vent. |
| Ground treatment | Stone plinth all around plus raised berm at low roof corners; front porch cuts through berm and includes a three-stone threshold. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Massing | 45% side lobe right, 35% side lobe left, 20% rear lobe |
| Upper floor read | 50% 2 dormers, 30% 3 dormers, 20% tall gable portholes |
| Roof silhouette | 40% cross-gable, 30% long hall with porch gable, 20% offset L-plan, 10% twin low gables |
| Chimney/vent | 45% single stone chimney, 30% chimney + smoke vent, 15% twin chimneys, 10% no chimney + lantern mast |
| Civic props | 35% banner, 25% den marker pair, 20% fenced herb patch, 20% crate/message cache |

### `inn` — Wanderer's Den

| Field | Blueprint |
|---|---|
| Footprint | `7 × 5` WU large inn; optional lean-to kitchen wing `2.5 × 2` WU at rear/side. |
| Floor count / height | 2 floors; lower hall `2.4` WU, upper loft under roof; ridge `5.2-5.8` WU. |
| Wall system | Long low hall inspired by JPG bottom-centre; stone/cob base, timber-framed gables, visible porch volume so the entrance survives low eaves. |
| Opening schedule | 1 wide `porch_cut_door` at front; 4 ground-floor `round_watch` windows (two front, one per side); 3 roof dormers/eyebrow windows for loft rooms; 1 rear escape door and 1 kitchen service hatch. |
| Roof archetype | Broad `TurfRoof.longHall`, eave sweep `0.60-0.85` WU, central raised porch gable, optional kitchen lean-to turf roof; exposed rafter tails along long sides. |
| Ornament / props | Hanging sign with fox-tail silhouette, lantern string, benches, barrels, travel packs, chimney near kitchen wing. |
| Ground treatment | Packed-earth forecourt apron, bermed rear service path, plinth visible at front only where porch opens. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Porch | 45% central raised porch, 30% off-centre porch, 25% two-door porch with side exit |
| Loft windows | 45% three dormers, 30% two dormers + gable porthole, 25% four small eyebrow windows |
| Wing | 40% rear kitchen, 30% left kitchen, 20% right stable lean-to, 10% no wing |
| Sign/lantern | 45% hanging sign, 30% lantern string, 15% fox-tail banner, 10% all three scaled down |
| Roof wear | 40% even turf, 30% dry savanna patches, 20% wildflower ridge, 10% repaired board patch |

### `shop` — Night Market den-mouth stall

| Field | Blueprint |
|---|---|
| Footprint | `4 × 3` WU (`shop` small), with front awning/counter extending `0.8-1.1` WU beyond footprint. |
| Floor count / height | 1 floor; rear den wall `1.35-1.55` WU; awning top `1.9-2.2` WU; roof ridge `2.9-3.2` WU. |
| Wall system | Constructed rear/side burrow booth, not a free-standing mound. Back wall has block courses; counter bay is a carved/open framed module, not a dark rectangle. |
| Opening schedule | 1 large counter opening with five-piece frame/sill/crossbar; 1 side `round_watch` window for “watching the street”; 1 small rear escape door; optional tiny cash-slot slit. |
| Roof archetype | Small rear `TurfRoof.halfGable` plus a separate pole-supported cloth/timber awning at front. The awning is real thickness with seams and edge cords; it is not the turf signature roof. |
| Ornament / props | Lanterns, coded sign, hanging pelts/cloth bundles, crates, small scale/table, side screen for a hidden exit. |
| Ground treatment | Packed-earth market mat and low berm behind booth; counter posts penetrate into visible foot blocks/stone pads. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Counter orientation | 60% front, 25% front-left corner, 15% front-right corner |
| Awning | 45% tan cloth, 30% striped cloth, 15% turf-edged lean-to, 10% patched tarp |
| Watch opening | 45% side round window, 30% eyebrow dormer over counter, 25% rear slit only |
| Goods props | 30% crates, 25% hanging cloth, 20% lanterns, 15% herb baskets, 10% tinkered trinkets |
| Exit cue | 45% rear small door, 30% side screen gap, 25% lifted awning flap |

### `blacksmith` — Tinkerer's Shop

| Field | Blueprint |
|---|---|
| Footprint | `5 × 4` WU medium. Forge apron projects `0.8` WU at front or side. |
| Floor count / height | 1 floor plus tall chimney/hood; wall `1.7-2.0` WU; roof ridge `3.4-3.8` WU; chimney top `5.0-5.8` WU. |
| Wall system | Stone lower half, timber/cob upper gables; one open work bay framed by heavy posts. Fire side uses stone/packed clay, not turf touching the forge. |
| Opening schedule | 1 wide work arch/open bay with proud posts at `+0.30` and lintel `+0.08`; 1 plank service door; 1-2 small side/rear `round_watch` windows; no front wall hidden entirely by roof. |
| Roof archetype | `TurfRoof.lowGable` over living/workshop half, interrupted by a stone firebreak collar around chimney. Open forge bay gets a shallower board/cloth lean-to, not low turf over flames. |
| Ornament / props | Anvil, scrap pile, bellows silhouette, stacked firewood, tool rack, smoke wisp, glowing coals. Use broad forms; no tiny bolts. |
| Ground treatment | Stone/scorched-earth apron under forge, earth skirt elsewhere; berm must stop short of fire apron for readability. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Forge bay | 50% front open bay, 30% side open bay, 20% corner bay |
| Chimney | 55% tall stone stack, 25% double vent, 20% squat clay hood + smoke |
| Roof/firebreak | 45% centred firebreak, 35% side-offset firebreak, 20% patched roof around chimney |
| Work props | 30% anvil, 25% scrap, 20% tool rack, 15% bellows, 10% charcoal crate |
| Wall openness | 50% one open side, 30% open front + side hatch, 20% mostly enclosed with large arch |

### `chapel` — Den Mother's Hall

| Field | Blueprint |
|---|---|
| Footprint | `4 × 8` WU fixed chapel footprint; long-hall reference from JPG bottom-centre. Optional tiny side prayer niches remain within skirt footprint and do not require placement changes. |
| Floor count / height | 1 floor; hall wall/eave `2.0-2.25` WU; ridge `4.4-4.9` WU; small bell/lantern mast `5.2` WU max. |
| Wall system | Long low community hall: coursed stone/cob base, timber gable frames, interior implied by dark recessed openings. Sacred end uses a larger round rear window/marker, not gothic stone tracery. |
| Opening schedule | 1 central raised `porch_cut_door` cutting through the front eave; 2 `eyebrow_dormer` windows per long side (4 total) high enough to avoid eave occlusion; 1 rear round “den-mother” oculus; optional tiny side exit. |
| Roof archetype | `TurfRoof.longHall` with a very clear raised porch gable. The low long eaves are allowed only because the doorway and four windows are roof-punched/porch-punched. |
| Ornament / props | Den marker totems, warm lanterns, small herb/offerings table, fox-tail wind vane, low seating stones. |
| Ground treatment | Continuous sacred berm/skirt, stepped front path, rear earth bank; no “see under the chapel” gap at any low eave. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Porch | 55% central raised porch, 25% offset porch, 20% porch plus small side door |
| Sacred rear | 45% round oculus, 30% den-marker pair, 25% lantern niche |
| Dormer layout | 50% 2+2 side dormers, 30% 1+2 asymmetric, 20% 3 small on one side + rear oculus |
| Roof ridge detail | 40% fox-tail vane, 30% lantern mast, 20% wildflower ridge, 10% simple chimneyless ridge |
| Offering props | 35% herb table, 30% seating stones, 20% twig screen, 15% small crates/scrolls |

### `watchtower` — Burrow Gate lookout

| Field | Blueprint |
|---|---|
| Footprint | `2 × 2` WU watchtower base; support/skirt extends to about `3 × 3` WU for stability. |
| Floor count / height | 3 compact stages, visual stage height `1.9-2.2` WU; platform floor `5.2-5.8` WU; turf cap top `6.4-7.0` WU. |
| Wall system | Earth/stone burrow base with a narrow timber-framed lookout shaft above. Shaft can use octagonal or square `buildWallSurfaceBlocks()` with timber/stone inserts; never generic fallback watchtower. |
| Opening schedule | 1 ground `burrow_round_door` or ladder hatch; 4-6 `gable_slit` watch openings around upper stages; 1 tiny roof dormer/lantern slit under the cap. Slits are recessed and framed, not dark strips. |
| Roof archetype | Small `TurfRoof.steepCap` or `lowConicalTurf` over the watch platform, with thick turf edge and board deck visible. It should echo cottage roofs while staying vertically readable. |
| Ornament / props | Fox-tail banner, signal lantern, rope ladder or stair, twig screens, small lookout rail, den-marker base. |
| Ground treatment | Heavy berm and stone pads at tower legs/base so the narrow tower does not appear to spear through the ground. |

Procedural variation axes:

| Axis | Weighted options |
|---|---|
| Base | 45% burrow gate base, 35% stone plinth base, 20% timber-legged base on berm |
| Shaft | 50% narrow square, 30% faceted/octagonal, 20% offset two-stage |
| Watch slits | 40% four cardinal slits, 35% six staggered slits, 25% two slits + open lookout rail |
| Roof cap | 45% steep turf cap, 35% tiny low gable, 20% patched turf umbrella |
| Signal prop | 40% fox-tail banner, 30% lantern, 20% wind vane, 10% paired banners |

## 5. Kit modules consumed

### Existing/shared doctrine modules this race should consume

- `DepthLadder.ts` — required for all offsets and coplanarity assertions.
- `OpeningParts.ts` — required for sills, mullions/transoms, set-back glazing, thresholds, straps, and planked doors.
- `VoussoirArch.ts` / `GothicArch.ts` — used with low/Romanesque-to-rounded arch ratios for burrow doors, gable doors, and some counter arches. Vulperia should avoid vampire/elven lancet excess.
- `StringCourse.ts` — plinth, retaining-wall caps, sill bands, porch thresholds, and wall/berm contact lines.
- `Bevels.ts` — all timber/stone trim, turf-stop boards, and exposed sod/soil edges need bevels/creased normals.
- `FacadeGrammar.ts` — splits each facade into fixed-size door/window/blank bays without stretching modules.
- `MassComposer.ts` — L-plan/cross-gable/porch/side-lobe composition for villa, inn, chapel, and shop.
- `RoofMassing.ts` — base roof-plane generation; `TurfRoof` should sit on top of these planes where possible.
- `BatchedDetail.ts` — settlement-wide grass tufts, wildflowers, roof-edge plants, lanterns, and small repeated details.
- Existing `buildWallSurfaceBlocks()` with `facesOverride`, `rectangleFaces()`, `facePointAt()`, `buildFloorCap()`, `buildQuoins()`, and `mergeGroupMeshesByMaterial()` — used where the constructed low walls are rectangular/faceted.
- Existing `earthTexture()`/`barkTexture()` and prior Vulperia territory props — used for berm/skirt continuity and surrounding settlement dressing.

### New shared module proposed by Vulperia

- `[SHARED KIT] TurfRoof` — a race-agnostic sod/turf roof builder used first by Vulperia and likely reusable by fae and orcish.
  - Inputs: roof planes or simple archetype (`lowGable`, `longHall`, `crossGable`, `rowGable`, `steepCap`), footprint, eave overhang, turf thickness, palette, seed, dormer/porch cut sockets.
  - Output layers: rafter frame, board deck with visible board ends at eaves, turf-stop/eaves board with scalloped/dentil options, thick sod slab with exposed soil edge at all free verges/eaves, top grass surface, instanced tufts/small plants.
  - Required tests: no single smooth green body as the main roof; distinct material/mesh names for rafters/deck/turf-stop/soil-edge/grass; bounding box proves turf thickness; dormer cut keeps openings visible; deterministic output by seed.

### Vulperia-specific modules

- `VulperiaBuildingKit.ts` — top-level public builders for all 8 kinds, shared constants, palette, and per-kind weight tables.
- `VulperiaOpenings.ts` — fox-folk doors/windows/counter openings built from `OpeningParts` and depth-ladder offsets.
- `VulperiaGrounding.ts` or internal helpers — local berm/skirt, packed-earth apron, stone plinth, and no-under-building safeguards.
- `VulperiaProps.ts` — den markers, fox-tail banners, coded signs, lantern strings, planters, market goods, forge props; uses broad readable mesh construction.

## 6. Quality-bar compliance

| Doctrine rule | Vulperia compliance |
|---|---|
| Rule 1 — Depth ladder | Every opening schedule lists the ladder offsets. Tests should assert frame/sill/reveal/glazing/door depths are separated and no surfaces are within `0.005` WU of coplanar where depth-ladder assertions are available. |
| Rule 2 — Five-piece opening minimum | All windows/doors/counter openings require recess, proud surround, sill/threshold, at least one mullion/transom/crossbar, and set-back glazing/door leaf. The current round door/window helpers are insufficient unless rebuilt on these parts. |
| Rule 3 — No banned primitives | No smooth green blob roof, no flat dark box window, no single-plane roof, no visible voxel blob as main mass. BlockKit/heightfield is allowed only for hidden/supporting berm or existing territory props, not the primary visible building body. |
| Rule 4 — Variety via module swapping | Per-kind variation tables use weighted module choices: roof archetype, dormer set, porch/door placement, side wings, props. No scaling one finished mesh to make a “different” building. |
| Rule 5 — Silhouette | Every kind breaks its skyline with at least one chimney, raised porch, dormer, banner, lantern mast, roof patch, or tower cap. Low forms get roof-edge silhouette, not blank boxes. |
| Rule 6 — Ground contact | Strongest emphasis for this race: each kind has plinth + skirt/berm. Low eaves include raised earth/grass skirt coverage so the user never sees under a building or into a missing terrain hole. |
| Rule 7 — Asymmetry | Door offsets, one-sided roof sweeps, staggered dormers, side lobe selection, chimney placement, and prop weighting prevent bilateral sameness. |

Additional Vulperia-specific guardrails:

- The turf roof must show **thickness and exposed cut edge** from the isometric camera.
- The low roof must not hide all wall/opening detail; each kind names the legibility solution.
- Burrow entrances must be mesh-contained and placement-safe.
- Palette contrast must follow the v2 lesson: warm wall/trim/door colors alone collapse into a blob, so dark facade/green door/glass accents remain distinct.

## 7. Current-state delta

### Runtime faction

`mapStudioFactionToRuntimeFaction('vulperia')` returns runtime faction id **`'vulperia'`**. All plan wiring should target `FACTION_BUILDING_VARIANTS.vulperia`.

### Established in repo

- Biome affinity: `vulperia: ['grassland', 'savanna']` in the race/faction biome affinity design and implementation plan.
- Settlement layout preference: Vulperia uses `cluster` layout preference and receives an extra central `inn` assignment in `SettlementModelGenerator.ts`.
- Ward/lore names: **Den Mother's Hall**, **Burrow Commons**, **Night Market**, **Fox Den**, **Tinker's Row**, **Poor Burrows**, **Wanderer's Den**, **Merchant Den**, **Fox Garden**, **Tinkerer's Shop**, **Burrow Gate**.
- Palette: warm ochre/brown building colors in `FACTION_PRESETS` and `overworld-studio.ts`; roads use `earthTexture()` for Vulperia.
- Territory dressing: warren mound, burrow-hole cluster, and woven-twig den marker already exist, built from `buildVulperiaDenMoundGrid()`/`FactionTerritoryProps.ts`.
- Current building variants: `villa`, `chapel`, and `shop` have bespoke Vulperia builders; `house`, `terraced`, `inn`, and `blacksmith` currently reuse `buildVulperiaVilla`; `watchtower` has no Vulperia override and falls back to the generic builder.
- Current mound implementation: `buildVulperiaDenMoundGrid()` is a grounded BlockKit heightfield with carved facade notch, grass/earth/facade materials, round door/window props, chimney, grass tufts, and dooryard clutter. This was already a v2 fix over an earlier deformed-sphere blob.

### What changes

- Rebuild all 8 canonical kinds as distinct or explicitly documented variants in a new Vulperia building kit.
- Replace the current “many kinds silently reuse `buildVulperiaVilla`” state with per-kind massing, roof, opening, and prop schedules.
- Add `watchtower`/`tower`-family Vulperia override for Settlement Lab review and future landmark support.
- Retire old Vulperia inline builders from `FactionBuildingVariants.ts` once new public builders are wired, while preserving `buildVulperiaDenMoundGrid()` and territory props for non-building dressing/berm use.
- Generalise Settlement Lab showcase for Vulperia so all 8 kinds appear together in “Play in 3D,” including `watchtower`, which is still not naturally reachable through `WARD_TO_KIND`.

## 8. Out of scope / deferred

- No source implementation in this spec phase; this document only defines design and acceptance targets.
- No terrain deformation or new placement machinery for burrows. The berm/skirt is part of each building mesh.
- No changes to Vulperia biome affinity, ward assignment, roads, or territory scatter except ensuring visual continuity with existing work.
- No interiors/dungeon-plan rewrite. Interior floor types and hidden-room gameplay are separate systems; exterior doors should imply clever interiors without implementing them here.
- No natural settlement spawn fix for `watchtower`/`tower`. The cross-race landmark/ward decision remains deferred by doctrine Part 5; Settlement Lab showcase must cover reviewability meanwhile.
- No use of CraftPix meshes/textures/assets directly. The reference informs procedural geometry only.
- No fae/orcish adoption of `TurfRoof` in this branch beyond making the module reusable and documenting likely consumers.
