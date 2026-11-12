# Vampire Buildings — Design Spec

Vampire buildings should read as wealthy, inhabited, private architecture: vertical Gothic-Revival and Second-Empire manor/townhouse forms, immaculate stone or limewashed wall construction, steep roofs, tall shuttered openings, projecting oriels, wrought-iron balconies, ornate chimneys, gated courtyards, and sharp finials. The runtime faction for studio id `vampire` is `vampire` via `mapStudioFactionToRuntimeFaction()`.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

The vampire reference set is thin: three files total, and one is a GIF. I viewed the two JPGs successfully. The `view` tool failed to render `olga-chernik-wiphouse.gif`; local metadata confirms it is a 2421×2516 GIF with 5 frames, but I cannot cite its visual contents. This spec therefore relies on the two visible JPGs plus external architectural research into Gothic Revival, mansard/Second-Empire roofs, oriel windows, louvred shutters, and wrought-iron balcony language.

| File | Viewed? | What it shows | Design decisions taken from it |
|---|---:|---|---|
| `file.jpg` | Yes | Two tall, stylised stacked houses: lime/white wall panels in heavy dark timber frames, steep red shingle gables, many narrow windows, some fully shuttered, some glowing with diamond lattice glazing, projecting upper boxes, crooked segmented flues capped with metal cones, small canopy/porch pieces, and a strong vertical silhouette. | This drives the non-manor residential set: tall narrow proportions for `house` and `terraced`; visible five-piece closed shutters rather than black holes; warm interior glow behind lattice glass; heavy floor-by-floor belts/string courses; red/purple shingle roof courses; crooked-but-maintained metal flues; asymmetrical stacked upper masses and dormers. |
| `shina-asset.jpg` | Yes | A large immaculate isometric haunted manor: grey ashlar walls, steep purple/black hipped/mansard roof planes, tall arched windows with muntins and warm red-orange glow, prominent chimneys with pyramidal caps/finials, a covered porch, iron perimeter fence, a few graves in the yard, leafless trees, bats in the sky. | This is the flagship `villa`/`inn`/`chapel` basis: high-status ashlar manor grammar, steep roof massing with dormers and finialed chimney stacks, tall lancet/round-headed openings, gated forecourts, iron railings, covered entrance porch, and a clean maintained shell. The graves are treated as optional chapel/courtyard storytelling only, not the faction's primary architecture, to avoid collapsing into undead. |
| `olga-chernik-wiphouse.gif` | No; `view` failed | Metadata only: GIF, 2421×2516, 5 frames. Visual inspection was unavailable in this tool session. | Gap explicitly carried forward. No decisions depend on this file. If the parent can view it later and it contradicts the JPGs, revisit roof silhouette, shutter treatment, and facade massing weights before implementation. |

### Reference-derived constraints

- **Do not make vampire merely “undead but purple.”** The images show inhabited, high-status buildings: intact roofs, glowing windows, deliberate fenestration, railings, porches, chimneys, and clean silhouettes. Decay is not the design driver.
- **Vertical and sharp.** Both visible references use steep gables, tall proportions, spires, finials, chimneys, and high rooflines. The silhouette must break upward on every kind.
- **Shuttered, not broken.** `file.jpg` has several closed shutters and louvred leaves. A vampire window can be closed, barred, or screened, but it must still have frame, sill, louvres, hinges, holdbacks, and a set-back glazing/void plane.
- **Opening detail is the identity carrier.** The strongest repeatable motif is a narrow glowing window inside a frame/shutter/lattice assembly. This maps directly to the doctrine's five-piece opening minimum.
- **Use iron as construction, not just decoration.** `shina-asset.jpg` uses fencing and railings; the plan should build railings, balcony posts, cresting, grille bars, hinges, and holdbacks as actual geometry.
- **Roof surfaces must be tiled.** Both visible images make roof courses visible. No smooth cone, no two flat planes: use `ShingleSurface` or a course/band fallback at lower LOD.

## 2. Race design language

### Core rules

1. **Private aristocratic occupancy.** Buildings are townhouses, manors, boarding houses, locked ateliers, and private chapels. They should look owned, staffed, maintained, and closed to outsiders.
2. **Vertical composition.** Prefer 2–4 floors, narrow bays, steep roof slopes, towers, finials, dormers, chimneys, ridge cresting, and iron spikes. Even `shop` and `blacksmith` get roofline breaks.
3. **Immaculate wall construction.** Main walls are real coursed stone or limewashed infill on a structural frame: block-course masonry from `buildWallSurfaceBlocks()`/rectangle faces, not voxel grids on visible walls. Mild soot and rain streaks are allowed; crumbling is not.
4. **Steep roof hierarchy.** Mansard, high gable, hipped manor roof, turret cap, and dormer roofs form the skyline. Roof pitches should be steeper than human/tudor defaults and capped with finials or cresting.
5. **Tall narrow openings.** Default opening is a lancet or tall round-headed sash with `archRatio` around `1.4–1.7`; commercial ground floors use larger display bays but hide them behind iron grilles and shutters.
6. **Closed-window vocabulary.** The signature kit is `[SHARED KIT] Shutter`: two or one louvred leaves, visible hinges, holdbacks, and slat geometry. Closed shutters replace “dark hole” windows.
7. **Projecting status bays.** `OrielBay` and faceted bay windows project from upper floors on corbels, contributing silhouette and making vampire facades read as inhabited rooms rather than crypt walls.
8. **Wrought iron as a secondary structure.** Use real grilles, balconies, railings, cresting, lamp brackets, hinge straps, and gates; avoid tiny bolts/knobs.
9. **Warm interior glow.** Glass is rough, set back, and slightly emissive at night: amber, ember red, or dim gold. It is not transparent and never replaces recess/frame/sill/mullion geometry.
10. **Gated ground contact.** Every kind gets a plinth, base skirt, threshold/steps, and either railings, a hedge, or a paved forecourt. Vampire buildings sit deliberately in controlled private lots.

### How vampire differs from undead

This distinction must be structural and formal, not a palette swap.

- **Undead architecture is communal, funerary, horizontal, and decaying.** Its forms should be mausolea, ossuaries, monuments, retained ruins, graveyards, crypt walls, classical friezes, spolia, and broken but meaningful remnants.
- **Vampire architecture is private, aristocratic, vertical, and maintained.** Its forms are manor houses, tall townhouses, inns for select guests, gated courtyards, occupied upper rooms, carriage arches, iron balconies, mansards, steep gables, dormers, turret roofs, ornate chimneys, finials, and shuttered windows.
- **Undead openings are tomb, arcade, and ruin openings.** Vampire openings are inhabited-house openings: shutters, louvres, sash/mullion divisions, glass glow, oriel rooms, and iron security grilles.
- **Undead damage exposes age.** Vampire control conceals vulnerability: shutters are closed, shutters are boarded in-place, curtains are drawn, iron grilles are locked, and roofs are intact. A vampire building can be ominous without missing walls or collapsed roofs.
- **Undead ground treatment is cemetery/necropolis.** Vampire ground treatment is estate boundary: wrought-iron fence, gate piers, carriage court, stone steps, trimmed dead hedges, paved approach, and controlled service yard. Graves may appear only as a chapel courtyard accent, not as the settlement's default language.

### Material palette and construction

- **Walls:** charcoal-blue/grey ashlar, pale cold limewash, dark timber framing, or blackened brick. Use one shared material per bucket; variation comes from geometry, vertex color, or instance color, never material clones.
- **Roofs:** deep red, plum-black, or near-black slate/ceramic shingles with visible courses. Roof color supports identity but must not be the only identity signal.
- **Trim:** dark iron, blackened oak, pale stone surrounds, copper-green chimney caps, and occasional blood-red glass.
- **Props:** iron gate, hanging lantern, crest sign, locked shutters, balcony, carriage lantern, ornamental chimney pot, awning only if supported by iron rods and brackets.

## 3. Real-world & game-dev basis

### Architectural basis

- **Gothic Revival / Victorian Gothic** provides finials, lancet windows, hood moulds, vertical emphasis, pointed arches, and learned medieval ornament on otherwise modern/inhabited plans. This supports the vampire “aristocratic mansion/townhouse” framing rather than a crypt-only approach.
- **Second Empire / Haussmann / mansard architecture** supports high-status urban rows: tall facades, repeated bays, cornices, iron balconies, dormers, chimneys, and steep double-pitched roof silhouettes. A mansard roof's steep lower slope and dormers are useful because they make the roof read as a habitable upper storey at isometric distance.
- **Oriel and bay windows** are real projecting upper-floor rooms supported by corbels/brackets. They fit vampire privacy and status: occupants can look down while remaining behind glass, grilles, or shutters. They also solve silhouette readability.
- **Louvres and shutters** are real climate/privacy devices, and louvres are strongly associated with controlling light and air while hiding the interior. They are especially useful here because they make a “closed” vampire opening legible with geometry.
- **Wrought-iron balconies and railings** give a sharp, aristocratic silhouette: vertical pickets, spear finials, scroll brackets, cresting, and gates. These must be built at readable scale, not as sub-pixel ornament.

### Procedural approach

- Use **MassComposer** to assemble a main block, cross wing, porch/carriage arch, turret, dormers, chimneys, and oriels. Variety comes from module choice and mass placement, not stretching one mesh.
- Use **FacadeGrammar** for bay subdivision. Each facade is split into fixed-width door, window, filler, or special bays; leftover width goes into floating filler so frames/mullions do not scale.
- Use **OpeningParts** + **GothicArch** + **VoussoirArch** for every door/window. The common five-piece opening is mandatory even for closed shutters.
- Use **ShingleSurface** and **RoofMassing** for mansard/gable/hip/turret roofs. LOD0 uses individual tile courses with a 2–5° kick; lower LOD may use stepped bands/textures but must retain eave thickness and silhouette props.
- Use **StringCourse** for plinth, storey bands, cornice, sill bands, and eaves tables. This is the cheapest way to break tall wall boxes.
- Use **BatchedDetail** for repeated roof tiles, railing pickets, shutter slats, and grille bars if the implementation pools them settlement-wide.
- Do **not** use CSG for openings. Occupancy carve / face omission plus explicit jamb/sill/frame pieces keeps masonry construction visible and avoids smooth boolean cut faces.

### Three.js/codebase basis

- Current `StoneTowerWallSurface.ts` has the user-praised `buildWallSurfaceBlocks()` block-course technique and already accepts `facesOverride`, so rectangular/townhouse facades can reuse it.
- `StoneTowerShape.ts` has `rectangleFaces()` / `facePointAt()` and `buildFloorCap()` / `buildQuoins()` already accept point overrides, so the vampire kit should not rebuild rectangle math.
- Current `StoneTowerOpenings.ts` still lacks the doctrine's full five-piece opening minimum; vampire relies on the shared fix, not a bespoke workaround.
- Current `StoneTowerGableRoof.ts` and `StoneTowerRoofCap.ts` are known roof weak spots. Vampire roofs must consume `ShingleSurface`/`RoofMassing` rather than extend flat planes or smooth cones.

## 4. Per-kind blueprint

All dimensions are in world units (WU). Storey height defaults to `FLOOR_HEIGHT = 3.2 WU`; where a kind says `3.0` or `3.4`, that is the visual wall-band height inside a builder while still respecting the DNA/collision footprint. Depth offsets use the doctrine ladder relative to each wall face: `+0.30` buttress/projection, `+0.12` chimney breast/pilaster, `+0.08` string/hood/sill, `+0.04` frame/surround, `0.00` wall, `-0.12` reveal, `-0.20` glazing/door face.

### `house` — shuttered gabled residence

- **Footprint:** `4 × 3 WU` (`small` gateward/farm house). Main rectangle `3.6 × 2.7 WU` with a 0.2 WU plinth skirt and one optional rear lean-to no deeper than 0.7 WU.
- **Floors/storeys:** 2 floors, visual storey height `3.0 WU`, roof spring at `6.1 WU`, roof peak `7.7–8.2 WU`.
- **Wall system:** limewashed infill or grey ashlar block courses on `rectangleFaces(1.8, 1.35)`, 0.45 WU courses, 4–5 blocks per long face, dark timber/stone corner posts at `+0.08`.
- **Opening schedule:** front has one off-centre planked pointed door (`0.78 × 1.9 WU`, reveal `-0.12`, door face `-0.20`, surround `+0.04`, threshold `+0.08`, strap ironwork `+0.05`); front upper floor has one tall shuttered lancet or cross-mullion (`0.65 × 1.25 WU`) with two `Shutter` leaves (`+0.10` leaves, louvre slats proud another `+0.02` from leaf face); side visible face has 1–2 small shuttered windows; rear may have one boarded-in-place window. Every window has sill `+0.08`, hood mould `+0.08`, reveal `-0.12`, glass/closed dark plane `-0.20`, and at least one mullion/transom behind shutters.
- **Roof archetype:** steep gable, fish-scale/rectangular shingles, 0.35 WU eaves, bargeboards, ridge cresting, one crooked metal-capped flue. No smooth cones.
- **Ornament/props:** one iron lantern bracket, 1–2 finials, small wrought fence return or dead hedge, neat stone step.

| Variation axis | Weights |
|---|---|
| Roof form | steep front gable 55%, side gable 25%, half-mansard 20% |
| Wall finish | pale limewash with dark frame 45%, cold grey ashlar 35%, blackened brick lower + limewash upper 20% |
| Special bay | upper shuttered oriel 30%, boarded-but-intact window 25%, iron balcony rail over door 20%, none 25% |
| Shutter state | both leaves closed 45%, one leaf ajar 25%, half-louvred screen 20%, iron grille only 10% |
| Chimney/flue | single crooked flue 45%, twin slim stacks 30%, rear kitchen stack 15%, none 10% |

### `terraced` — tall narrow townhouse row segment

- **Footprint:** `3 × 4 WU`; one townhouse segment with party walls on one or both sides. The builder may compose 2 facade bays inside the footprint but must avoid side windows on shared walls.
- **Floors/storeys:** 3 floors plus attic dormer; visual storey height `2.9 WU`; cornice line `8.8 WU`; roof peak/dormer finial `10.2–10.8 WU`.
- **Wall system:** narrow block-course front/back faces (`rectangleFaces(1.5, 2.0)`), flat party walls, heavy storey string courses at each floor (`+0.08`), cornice/eaves table `+0.12` with corbels.
- **Opening schedule:** front has one narrow off-centre door (`0.68 × 1.75 WU`) and 4–6 stacked windows in two bays; uppermost dormer has one tiny shuttered sash. All windows are tall and narrow (`0.48–0.6 WU` wide, `1.0–1.25 WU` high), with shutters, sill, mullion/crossbar, reveal, set-back glass. Ground floor may replace one window with a blind locked panel at `-0.06`.
- **Roof archetype:** steep mansard with 1–2 dormers, iron cresting along ridge, party-wall parapet caps that vary in height against adjacent segments.
- **Ornament/props:** shared iron balcony rail at second floor, address plaque/crest, gas lamp, slim chimney stacks between party walls.

| Variation axis | Weights |
|---|---|
| Party-wall state | both sides shared 50%, left shared 20%, right shared 20%, freestanding end unit 10% |
| Cornice height | normal 45%, raised left parapet 20%, raised right parapet 20%, stepped double cornice 15% |
| Ground bay | private door + shuttered window 45%, locked service hatch 25%, tiny atelier window behind grille 20%, blind panel 10% |
| Dormer count | one central 50%, two narrow 35%, none but chimney cresting 15% |
| Balcony | narrow iron Juliet rail 45%, projecting iron balcony on corbels 25%, no balcony 30% |

### `villa` — Count's manor / flagship residence

- **Footprint:** `7 × 5 WU`; main block `5.8 × 4.2 WU`, one cross wing or side tower, optional rear courtyard wall inside or just outside the footprint visual envelope.
- **Floors/storeys:** 3 floors, visual storey height `3.15 WU`; principal cornice `9.6 WU`; roof/turret top `12.0–14.0 WU`.
- **Wall system:** refined ashlar block courses on MassComposer rectangle/L-plan faces; quoins `+0.08`; storey string courses at `3.2` and `6.4 WU`; pilasters at bay divisions `+0.12`; optional buttress-like corner piers are crisp and maintained, not ruined.
- **Opening schedule:** front facade has 7–11 windows: 2 large ground-floor arched sash windows (`0.9 × 1.8 WU`), 3–4 first-floor lancets/cross-mullions (`0.7 × 1.5 WU`), 2–3 attic dormers (`0.45 × 0.85 WU`), plus one central or off-centre arched door under a porch. At least one upper `OrielBay` projects `0.45–0.65 WU` on corbels. Balconies use iron railings at `+0.30` projection. Every opening retains five-piece construction; shutters appear on 40–70% of non-oriel windows.
- **Roof archetype:** dominant mansard/hip hybrid with steep lower pitch, shingled dormers, 3–5 chimneys with pyramidal caps, one turret roof with finial, ridge cresting.
- **Ornament/props:** gated forecourt, carriage lanterns, iron fence, crest plaque, gargoyle-like roof finials built as low-poly carved brackets (not spheres/cones standing in for statues).

| Variation axis | Weights |
|---|---|
| Massing | main block + side turret 40%, L-plan cross wing 30%, front porch + rear service wing 20%, twin small turrets 10% |
| Roof | mansard with dormers 50%, steep hip with dormers 25%, cross-gable manor roof 15%, mansard + turret cap 10% |
| Signature bay | OrielBay 45%, iron balcony 25%, carriage arch 20%, projecting stair tower 10% |
| Window glow | warm amber 45%, red-orange 35%, dim gold 15%, mostly shuttered/dark 5% |
| Forecourt | iron fence and gate 45%, clipped dead hedge 20%, paved carriage court 20%, small private chapel marker 15% |

### `inn` — Nocturne boarding house / flagship social building

- **Footprint:** `7 × 5 WU` (`large` inn). Wider public face than villa, but still private and controlled: inn reads as an exclusive guest house with carriage access, not a rustic tavern.
- **Floors/storeys:** 2 full floors plus tall attic; visual storey height `3.1 WU`; roof peak `10.5–12 WU`.
- **Wall system:** ashlar ground floor with limewashed/timber upper galleries; block-course walls on rectangle + porch mass; continuous plinth and broad cornice; covered entrance porch or porte-cochère supported by real posts/brackets.
- **Opening schedule:** ground floor has one carriage/entry arch (`1.4–1.8 WU` wide, planked double doors set at `-0.20`, strap ironwork, threshold step), 2 large common-room arched windows behind iron grilles (`1.0 × 1.7 WU`), and one hanging sign bracket. Upper floors have 5–8 shuttered guest-room windows (`0.55–0.75 × 1.2 WU`), 1–2 oriels/bays, and attic dormers. Grille bars and shutters must not replace mullions; they layer over a complete opening.
- **Roof archetype:** mansard or long steep gable with dormers and at least two chimney stacks. Optional rear stable/mews lean-to uses smaller shingled roof with visible rafter tails.
- **Ornament/props:** wrought hanging crest sign, carriage lamps, balcony walkway, locked gate, small stable lanterns. No barrels as the primary commerce signal.

| Variation axis | Weights |
|---|---|
| Entry type | carriage arch 45%, raised porch 30%, recessed double door 15%, side-gated court 10% |
| Guest-room facade | regular 3-bay 35%, asymmetric 4-bay 30%, one large oriel + small bays 25%, shutters-dominant 10% |
| Roof | long mansard 45%, steep cross-gable 25%, hip + dormers 20%, mansard + corner turret 10% |
| Sign | iron crest sign 50%, painted hanging shield 25%, lantern-only discreet inn 15%, sign integrated in balcony rail 10% |
| Service yard | rear mews lean-to 35%, gated side alley 25%, coach lamp court 25%, none 15% |

### `shop` — locked atelier / apothecary / jeweller

- **Footprint:** `4 × 3 WU` (`small` market/craftsmen). Narrow commercial ground floor with upper residence.
- **Floors/storeys:** 2 floors; visual storey height `3.0 WU`; roof peak `8.0–9.0 WU`.
- **Wall system:** ashlar plinth and frame, smooth limewashed upper wall; facade grammar splits ground floor into display bay, door bay, filler/pilaster bay. Side/back remain modest but still block-built.
- **Opening schedule:** one ground display window (`1.2–1.5 × 1.35 WU`) built as recessed glass at `-0.20`, stone frame `+0.04`, sill `+0.08`, transom/mullion grid, and iron grille `+0.09`; shutters fold to sides or close over it. One narrow shop door (`0.65 × 1.75 WU`) with louvred spy panel. Upper floor has 1–2 shuttered windows or one small oriel. Optional awning is cloth stretched on iron rods, with visible brackets and fascia; never a flat unsupported slab.
- **Roof archetype:** steep gable or mini-mansard with one dormer and one chimney/flue.
- **Ornament/props:** hanging trade sign (apothecary vial, jeweller crest, tailor scissors) as a shaped plate + bracket, display shelves behind dark glass, iron lantern, no crates/barrels as primary identity.

| Variation axis | Weights |
|---|---|
| Trade type | apothecary 35%, jeweller/reliquary 25%, tailor/mask-maker 20%, legal moneylender/notary 20% |
| Ground bay | large gridded display 45%, shuttered counter hatch 25%, paired small displays 20%, blind locked panel 10% |
| Upper bay | oriel 35%, two shuttered windows 35%, one balcony window 20%, no upper special 10% |
| Awning | iron-supported cloth 35%, rigid slate hood 25%, no awning but cornice 25%, retractable shutter canopy 15% |
| Sign | wrought bracket crest 50%, hanging painted plate 30%, etched glass emblem 10%, lantern-only 10% |

### `blacksmith` — nocturnal ironworks / locksmith forge

- **Footprint:** `5 × 4 WU` (`medium` smithy). Wider and lower than villa, but still refined: a secure ironworks yard and enclosed forge, not an open rustic shed.
- **Floors/storeys:** 1 tall work hall (`3.8 WU`) plus partial loft/dormer; chimney top `7.5–9.0 WU`.
- **Wall system:** dark brick/ashlar lower walls with heavy plinth, iron-framed front opening, one side service wing. Courtyard wall/fence defines the work yard.
- **Opening schedule:** front has a wide arched forge/carriage door (`1.8–2.2 WU` wide, `2.3 WU` high) with double planked doors set back `-0.20`, strap iron, threshold stone, and iron frame; side has 2 louvred ventilation openings (`0.6 × 0.8 WU`) using `Shutter` slats without glass; rear has one barred ember-glow window. Loft has 1 shuttered dormer. Forge opening/glow plane must be behind grille bars, not a sphere/plane floating in front.
- **Roof archetype:** steep shed-gable or hipped forge roof with tile courses, large blackened chimney breast at `+0.12`, cap/finial, roof vent louvres.
- **Ornament/props:** stacked iron bars, horseshoe/lock sign, anvil silhouette only if built as low, readable prop; railing samples along fence; soot gradient near chimney allowed but wall remains intact.

| Variation axis | Weights |
|---|---|
| Trade emphasis | locksmith 35%, blade/rapier smith 25%, carriage ironworks 20%, occult silverwork 20% |
| Main opening | double carriage arch 45%, raised forge door 25%, open grille bay 20%, side-yard gate 10% |
| Chimney | one massive stack 50%, paired slim stacks 25%, wall chimney + roof vent 20%, furnace tower 5% |
| Yard | iron fence display 40%, gated service court 30%, covered coal bay 20%, none 10% |
| Venting | louvred shutters 45%, roof lantern vent 25%, side grille 20%, dormer vent 10% |

### `chapel` — private blood chantry, not a cemetery church

- **Footprint:** `4 × 8 WU` (`medium` chapel fixed long nave). Main nave `3.6 × 6.8 WU`, front porch `0.6 WU`, rear apse/altar bay `0.8–1.0 WU`.
- **Floors/storeys:** 1 very tall nave wall (`4.0–4.4 WU`) plus roof; ridge/turret `8.0–10.0 WU`.
- **Wall system:** maintained ashlar chapel with buttresses at bay divisions (`+0.30` faces, set-offs with weathering blocks), continuous plinth/string/cornice, optional side family gallery/oriel. No collapsed walls.
- **Opening schedule:** front has one pointed double door (`1.0 × 2.3 WU`) with voussoir arch and iron straps; above it a rose/tracery window (`0.9–1.1 WU` dia) built with `Tracery`, set-back red glass `-0.20`, proud stone ring `+0.04`, sill/drip `+0.08`. Long sides have 3 lancets per side (`0.55 × 1.8 WU`) with hood moulds, mullions, and optional exterior shutters/grilles. Rear apse has one small high oculus/lancet.
- **Roof archetype:** steep nave gable with shingle courses, ridge cresting, bellcote/tiny spire, finials, and 0.35 WU eaves. A small turret over the porch is acceptable if it is built as roof massing + shingles, not a cone.
- **Ornament/props:** iron gate, two lanterns, polished altar-glow seen through glass, 0–2 private grave markers only inside a fenced side plot if needed for `shina-asset.jpg`; do not make a public graveyard.

| Variation axis | Weights |
|---|---|
| Plan accent | rear apse 45%, side family gallery 20%, small porch tower 20%, transept-like side bay 15% |
| Front window | rose tracery 50%, tall lancet pair 25%, shuttered high window 15%, blind crest panel 10% |
| Buttress rhythm | 3 bays per side 50%, 2 larger bays 25%, corner buttresses only 15%, porch buttresses 10% |
| Roof | steep gable + bellcote 45%, cross-gable 25%, gable + porch turret 20%, mansard-like chapel roof 10% |
| Courtyard | iron gate only 35%, side fenced markers 20%, paved moon court 25%, dead hedge enclosure 20% |

### `watchtower` — needle watch / roofline sentinel

- **Footprint:** `2 × 2 WU` fixed. Narrow square/octagonal tower within footprint; can use octagon faces with radius `1.0 WU` or a 1.8 WU square core with clipped corners.
- **Floors/storeys:** 4–5 visual floors, ring/storey height `2.6–2.8 WU`; roof/finial top `12–15 WU`.
- **Wall system:** real block-course shaft, slightly tapered upward, storey bands every `2.7 WU`, iron cresting/parapet beneath roof. No voxel spire grid.
- **Opening schedule:** ground has one tiny pointed service door (`0.55 × 1.45 WU`) with threshold/strap iron; upper floors have 3–5 slit-lancet shutter/grille openings (`0.25–0.4 × 0.9 WU`) rotated around faces, each with reveal `-0.12`, set-back dark glass `-0.20`, miniature sill/hood `+0.08`, and at least one crossbar/grille. Top floor may have one projecting lookout oriel/balcony.
- **Roof archetype:** steep turret roof, needle mansard, or conical shingled cap with tile bands and finial. Crenellation only as iron cresting/railing under roof, not a castle ruin parapet.
- **Ornament/props:** bat weathervane, lantern cage, iron ladder/railing, banner/crest, 2–4 roof finials.

| Variation axis | Weights |
|---|---|
| Shaft profile | straight needle 35%, slight taper 30%, waisted middle 20%, offset upper stage 15% |
| Top | shingled turret roof 45%, needle mansard 25%, roof + lookout balcony 20%, iron cresting crown 10% |
| Openings | slit lancets 45%, shuttered narrow windows 25%, iron grille slots 20%, one oriel lookout 10% |
| Silhouette prop | bat vane 35%, triple finial 30%, lantern cage 20%, banner pole 15% |
| Wall finish | black ashlar 45%, limewashed panels 25%, black brick 20%, mixed ashlar/timber 10% |

## 5. Kit modules consumed

### Shared kit modules

| Module | Use in vampire kit | Notes |
|---|---|---|
| `DepthLadder.ts` | Constants and dev assertions for every facade piece. | Mandatory rule enforcement. |
| `Bevels.ts` | Shared bevel/extrude settings for frames, sills, cornices, shutters, and ironwork. | Prevents extruded-cardboard look. |
| `GothicArch.ts` | Lancets, doors, chapel windows, grilles, shop display heads. | Vampire default `archRatio` `1.4–1.7`; not undead's heavier monumental arches. |
| `OpeningParts.ts` | Sill, mullion/transom, set-back glass, planked doors, strap ironwork. | Completes doctrine Rule 2. |
| `VoussoirArch.ts` | Door/window arch heads, chapel front, carriage arches. | Same block vocabulary as walls. |
| `StringCourse.ts` | Plinth, floor belts, sill bands, cornices, eaves tables. | High-value shadows on tall facades. |
| `FacadeGrammar.ts` | Fixed-size bay subdivision across all facades. | Prevents stretched window modules. |
| `ModuleSocket.ts` | Optional module sockets for dormers, oriels, porch pieces, chimneys. | Useful if earlier race built it; not a hard blocker for first vampire pass. |
| `ShingleSurface.ts` | LOD0 roof tile courses, dormers, turret caps, mansards. | Required by the reference art. |
| `RoofMassing.ts` | Gable/hip/mansard/turret roofs, eaves, fascia, dormer cuts. | Mansard support may be an extension if not already present. |
| `MassComposer.ts` | Main block + wing + turret + porch + chimney + oriel composition. | Required for villa/inn differentiation. |
| `BatchedDetail.ts` | Pool roof tiles, shutter slats, grille bars, railing pickets, leaves/hedges. | Important for 30–60 buildings. |
| `Tracery.ts` | Chapel rose, villa/chapel high windows, ornate grilles. | Tier 3, but vampire is one of its primary consumers. |
| `Buttress.ts` | Chapel bay buttresses and a few manor corner piers. | Maintained, crisp buttresses only. |
| `[SHARED KIT] Shutter.ts` | New/required: louvred shutter leaves with hinges, holdbacks, optional closed/ajar states. | Strong shared opportunity; human and vulperia can reuse for domestic buildings. |
| `[SHARED KIT] OrielBay.ts` | New/required: projecting bay/oriel shell on corbels with five-piece windows on its faces. | Shared with human, elven, vulperia, possibly fae shops. |

### Race-specific modules

| Module | Responsibility |
|---|---|
| `VampireMaterials.ts` | Shared vampire material palette: ashlar/limewash/black brick/roof tile/iron/glass/wood, all merge-safe. |
| `VampireFacadeKit.ts` | Race-specific facade module library and weights: lancets, shuttered windows, grille display, doors, carriage arches, crest panels. |
| `VampireRoofKit.ts` | Race roof presets: steep gable, mansard, hip, turret cap, dormer weights, finials/cresting/chimneys. Uses shared roof modules. |
| `VampireBuildings.ts` or `VampireBuildingKit.ts` | Public builders for all canonical 8 kinds, composing the shared modules per Section 4. |

## 6. Quality-bar compliance

| Doctrine rule | Compliance requirement for vampire |
|---|---|
| Rule 1 — Depth ladder | Every facade module declares offsets using `DepthLadder`; tests assert no coplanar facade surfaces within 0.005 WU. Shutter leaves, louvre slats, grilles, mullions, frames, sills, and glass all occupy distinct offsets. |
| Rule 2 — Five-piece opening minimum | All windows/doors use recess, proud surround, sill/threshold, internal division, and set-back glass/door face. Shutters/grilles are additional layers, not substitutes. Doors add threshold, plank boards, and strap ironwork. |
| Rule 3 — No banned primitives | No dark box windows, smooth cone roofs, two-plane roofs, visible voxel wall blobs, icosahedron rubble, or material-clone color variation. Spheres/cones only allowed for tiny readable finials/lamps if not standing in for a building feature. |
| Rule 4 — Variety by module swapping | FacadeGrammar chooses fixed-size bay modules and floating filler; roof/massing/shutter/oriel/chimney modules swap by weight. No uniform scaling of frames/mouldings. |
| Rule 5 — Silhouette | Each kind has vertical skyline breaks: chimneys, finials, dormers, turret roofs, cresting, balconies, oriels, and railings. |
| Rule 6 — Ground contact | Every kind gets plinth course, base skirt, threshold/steps, and a fence/hedge/paved court/yard element where appropriate. |
| Rule 7 — Asymmetry | Off-centre doors, one special bay per facade, asymmetrical wing/turret/porch choices, varied shutters, and non-mirrored chimney placement are required. |

## 7. Current-state delta

### Runtime identity

- Studio id `vampire` maps to runtime faction `vampire` in `src/world/buildings/BuildingTypeMap.ts` via `mapStudioFactionToRuntimeFaction()`.
- `FACTION_PRESETS.vampire` currently uses style `vampiric`, condition `weathered`, colors `walls #2a2030`, `roof #1a1020`, `trim #4a3050`, `door #8a2020`.

### Current implementation summary

- `src/world/buildings/FactionBuildingVariants.ts` currently defines inline vampire builders: `buildVampireVilla`, `buildVampireChapel`, `buildVampireShop`; it maps `house`, `terraced`, `inn`, and `blacksmith` to `buildVampireVilla`.
- There is no vampire `watchtower` override, so vampire watchtowers fall back to the generic shared builder.
- Current vampire massing depends on `buildVampireSpireGrid()` in `FactionBlockProfiles.ts`: a BlockKit occupancy-grid tapering spire with obsidian/iron/facade/bloodglow cells.
- Current villa/house/terraced/inn/blacksmith collapse to the same spire-with-companion-turret silhouette. This violates the canonical roster's requirement that reused builders document meaningful differences per kind.
- Current chapel is a scaled spire with side spirelets, a rose-window accent, and a blood orb; it reads more like a tower shrine than the reference manor/chantry language.
- Current shop is a small iron-framed stall with a box counter, box canopy, and glowing sphere candles. It lacks the high-status shuttered/locked commerce language in the reference notes.
- Existing vampire tests in `tests/world/FactionBuildingVariants.test.ts` guard the old spire grid and old rose/blood orb props; they must be replaced with tests for the new kit, not merely updated to pass.

### Rebuild/retire list

- Rebuild from scratch: all 8 canonical vampire kinds (`house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`).
- Retire as dead code after replacement: inline `addBlockVampireSpire`, `addRoseWindow`, `buildVampireVilla`, `buildVampireChapel`, `buildVampireShop`; exported `buildVampireSpireGrid`, `vampireSpireTopY`, `vampireSpireDeckRadius`, and `VampireSpireOptions` if no remaining references exist.
- Keep/reuse: `obsidianTexture()` if still useful as a material map; generic `StoneTower*` math/wall/floor/quoin helpers; shared kit modules from earlier races.

## 8. Out of scope / deferred

- No source implementation in this planning pass; only `spec.md` and `plan.md` are delivered.
- No interiors, coffins, NPC behavior, sleep/daylight mechanics, or usable doors.
- No animated bats, smoke, or moving shutters. Static silhouette props only for this pass.
- No settlement-level watchtower spawning fix beyond the Settlement Lab showcase. The doctrine's reachability caveat remains cross-race.
- No transparent glass/interior modelling; glass remains dark/rough/slightly emissive.
- No public graveyard/cemetery kit for vampire. Chapel may have a tiny private fenced marker accent, but undead owns funerary communal architecture.
- No gore/blood-prop overuse. “Blood” may appear as restrained glass/emissive accent, not puddles or body-horror props.
- No deletion of broadly shared texture/material helpers unless `rg` proves they are vampire-only and superseded.
