# Dwarven Buildings — Design Spec

Dwarven settlements should read as compressed, weighty stonecraft: low masses on rock plinths, stepped/battered walls, small deep-set openings, heavy lintels, corbelled chimneys, angular chevron ornament, metal banding, and visible industry. The reference art confirms the prompt's industrial/tiered summary for workshops and alchemist towers, but corrects it in two important ways: ordinary dwarven homes are often rectangular gabled halls with slate/stone tile roofs, and the strongest ground-contact cue is not a flat slab but a rock plinth, steps, or terrain-cut base.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

Reference folder: `/Users/terrygoleman/Documents/GitHub/HammerOfSteel/tomes_towers_and_transmutation/concept_art/reference/buildings/dwarf/`.

### `720X720-5675 - Dwarf House 2.jpg`

- **What it shows:** A compact grey-stone gabled hall with a very large tapered square chimney on one rear corner, a steep paneled metal/slate roof, triangular timber/metal bracing in the gables, small deep side openings, triangular gable framing, roof straps/bolts, a raised stone base, and a small attached plank utility bay.
- **Design decisions taken from it:**
  - Rectangular gabled halls are canonical for dwarves, not just octagonal towers.
  - Chimneys must be oversized readable masonry/metal assemblies with bases, tapering courses, caps, and flue mouths; never bare cylinders.
  - Gable triangles get structural bracing and lattice panels, not blank triangular infill.
  - Dwarven asymmetry can be practical: one big chimney, one utility annex, one side yard.

### `dwarf-settlement-workshop.jpg`

- **What it shows:** A compact grey workshop/hall with a steep gabled roof, heavy arched entrance porch, repeated side window bays under thick lintels, block-course wall relief, diagonal gable braces, warm lantern recesses, and paired square rear chimneys with capped tops.
- **Design decisions taken from it:**
  - Rectangular workshop halls are part of the dwarf language alongside towers: use a strong front portal, side-bay rhythm, and stout roofline equipment.
  - Door surrounds need layered arch pieces, impost blocks, and a recessed dark interior; a doorway is not a flat dark rectangle.
  - Side bays should repeat as modular wall panels with deep reveals and proud mullions rather than texture stripes.
  - Paired chimneys/vents can identify craft buildings if each has block courses, cap stones, and flue mouths.

### `images (1).jpeg`

- **What it shows:** A tall stone-and-timber workshop/inn mass on a cobbled base, with a lower gabled hall, dark post-supported porch, slate roof courses with moss, a square stone shaft rising through the roof, and a smaller planked upper room perched on that shaft with its own steep roof and round gable medallion.
- **Design decisions taken from it:**
  - Workshops and inns can mix stone lower courses with timber/board upper panels while still feeling dwarven if the lower storey is heavy.
  - Overhangs and perched rooms must be physically supported by posts, piers, or central masonry shafts.
  - Roof tiles need course-by-course relief and occasional moss, not a texture-only plane.
  - A sign/clock medallion works for shops/inns if it is framed and mounted, not a flat decal.

### `images (2).jpeg`

- **What it shows:** A rock-plinth structure where an arched entry and stairs are cut into a rugged stone mound, with a narrow faceted chimney/tower stack rising from the top and almost no freestanding domestic wall mass.
- **Design decisions taken from it:**
  - Ground contact is a race signature: dwarven buildings should sit in, on, or behind rock, with steps and rubble skirts hiding any terrain gap.
  - Rock-cut or semi-subterranean cues are appropriate, but the building must still respect `getFootprint()` unless the settlement placement system gains explicit cliff/slope slots.
  - Chapel/watchtower variants can look partly excavated by adding a self-contained rock plinth and rear rock cheek, without inventing new terrain placement.

### `images (3).jpeg`

- **What it shows:** A stylised round/conical dwarf house with broad stone steps, thick wall blocks, layered conical tile courses, twin square chimneys with caps, small round and arched openings, scroll/metal details, and boulders merging the walls into the ground.
- **Design decisions taken from it:**
  - Conical/hipped roofs must be layered from individual courses or stepped bands, with thick eaves and visible tile butts.
  - Dwarven silhouette is squat but busy at the roofline: chimney stacks, caps, spikes, and side wings.
  - Small openings should be visually expensive: oculus grilles, arched surrounds, thick sills, and deep reveals.

### `images.jpeg`

- **What it shows:** A tabletop “Dwarf House 2” with a flat/parapeted central block, arched porch, block-course walls, deep side arcades, two short roofline caps, and a small gabled side bay.
- **Design decisions taken from it:**
  - Not every dwarven roof is steep; flat/parapeted roof terraces are part of the reference set.
  - Flat roofs still need parapet coping, drainage scuppers, and perimeter bands so they do not read as plain boxes.
  - Side arcades and deep porch recesses are appropriate for shops/villas/terraced rows.

### `makers-anvil-dwarf-settler-house.avif`

- **What it shows:** A detailed grey miniature house with a steep paneled roof, prominent rectangular chimney/forge stack, bolt heads, metal roof bands, triangular gable framing, diamond lattice under the eaves, stone foundation courses, and a plank utility shed.
- **Design decisions taken from it:**
  - Metal banding and bolt plates should be larger than sub-pixel decoration: roof straps, hinge straps, hoop bands, and chimney collars.
  - Diamond/X lattice and chevron panels are the key ornament family.
  - Wood is secondary and utilitarian: planked sheds, braces, bellows housings, and doors against a stone body.

### `tabletop-terrain-building-dwarf-house-1-1231720386.webp`

- **What it shows:** A small rectangular stone house with thick block walls, two square block chimneys, a deeply framed arched door, arched windows, an all-around chevron/frieze belt, tiled roof courses, and a stepped stair/porch.
- **Design decisions taken from it:**
  - The ordinary house blueprint should be a simple rectangular masonry hall, not a tower miniature.
  - Belt courses, chevron friezes, and block chimneys are mandatory readability features.
  - Door stairs and a raised threshold are part of the building, not optional prop clutter.

### `tabletop-terrain-building-dwarven-alchemist-workshop-1228016019.webp`

- **What it shows:** A tall stacked octagonal/hexagonal alchemist workshop with two main tiers, heavy panel bands, X-lattice vertical strips, chevron plaques, two square chimneys, vent caps, external boilers/tanks, curved pipe runs, a small arched door, and industrial side machinery.
- **Design decisions taken from it:**
  - The prompt's “tiered octagonal/hexagonal masses stepping inward” is strongly valid for industrial/civic buildings, especially shop/blacksmith/watchtower variants.
  - Pipework, tanks, vents, and metal banding are race-signature modules, but must be built as assemblies with elbows, collars, brackets, and caps.
  - The blacksmith flagship should borrow this density of equipment: exterior machinery, chimney stacks, hoppers, troughs, and working-yard treatment.

### Validated correction to the initial skim

The initial skim was mostly right for the alchemist/workshop side of the reference set: tiered octagonal masses, chevrons, vents, chimneys, metal bands, and compression are all confirmed. The images disagree with a single all-octagon reading, though. Four references (`720X720-5675 - Dwarf House 2.jpg`, `dwarf-settlement-workshop.jpg`, `images (1).jpeg`, and `tabletop-terrain-building-dwarf-house-1-1231720386.webp`) are rectangular gabled or parapeted buildings. The final language should therefore be **heavy modular stonecraft** with two mass families: rectangular gabled halls for ordinary buildings, and octagonal/tiered industrial or civic stacks for landmarks.

## 2. Race design language

1. **Compressed massing.** Dwarven buildings are wider than they are elegant. Use low eaves, thick walls, squat storeys, broad bases, and stepped inward tiers. Even the watchtower should feel like a load-bearing stack, not elven verticality.
2. **Two canonical mass families.** Use rectangular/gabled halls for `house`, `terraced`, `inn`, and parts of `blacksmith`; use octagonal/hexagonal/tiered masses for `villa`, `chapel`, `shop` upper machinery, and `watchtower`. Mix a side wing or annex on 40-60% of larger buildings.
3. **Stone first, wood second, metal third.** Main walls are dark warm granite or dressed basalt-grey stone. Wood appears as planked sheds, doors, hoardings, and bellows housings. Metal appears as straps, bands, grilles, vents, and forge hardware.
4. **Battered and stepped walls.** Lower courses project beyond upper courses. Tier transitions get string courses and corbel rows. Corners are reinforced with heavy quoins or buttress piers.
5. **Low Romanesque/shouldered openings.** Dwarven arch character uses `archRatio ≈ 0.50-0.65`: rounded, low, or shouldered rather than lancet. Every window and door satisfies the five-piece opening minimum: recess, proud surround, sill/threshold, mullion/transom or grille, and set-back dark glass/door face.
6. **Industrial silhouette.** At least one readable skyline feature per building: square chimneys, corbelled flue caps, vents, hoists, roof straps, parapet posts, or gear signs. The flagship `blacksmith` always gets a forge stack and yard equipment.
7. **Angular ornament.** Motifs are chevrons, zig-zags, stepped diamonds, X-lattice, shield plaques, and blocky corbels. Avoid elven curls, vampire spikes, or human Tudor curves.
8. **Roof surfaces are built, not skinned.** Roofs use tile courses, hex metal/stone plates, thick eaves, fascia, verge blocks, ridge caps, and visible tile butts. Flat/parapet roofs need coping, scuppers, and parapet blocks.
9. **Ground contact is visible.** Every building sits on a plinth, rock skirt, stair, and rubble/soil blend. Several kinds include a rear “cut-rock cheek” or self-contained mound, inspired by `images (2).jpeg`, but true cliff/subterranean placement is deferred.
10. **Practical asymmetry.** Break symmetry with a utility annex, one dominant chimney, uneven windows, a coal store, exterior stairs, an off-centre sign, or a working yard.

## 3. Real-world & game-dev basis

### Architectural basis

- **Rock-cut and mountain architecture:** `images (2).jpeg` evokes entrances cut into slopes. The implementable version is a self-contained rock plinth/skirt within the building footprint, with stairs and rear rock cheek geometry. True cliff integration needs settlement placement support and is deferred.
- **Romanesque masonry:** Dwarven arches should be thick, low, and compression-heavy. Use voussoirs, keystones, impost blocks, and squat piers. This fits the art better than elven lancets.
- **Ashlar and rubble foundations:** Wall faces use coursed rectangular blocks. Lower plinths can use larger rough stones; upper surfaces use smaller dressed courses.
- **Corbelling and chimneys:** Chimney stacks step out/in course by course, with caps and flue mouths. This is visible in `tabletop-terrain-building-dwarf-house-1-1231720386.webp`, `makers-anvil-dwarf-settler-house.avif`, and the alchemist workshop.
- **Industrial workshops:** Forge, alchemist, and settlement-workshop references justify exterior tanks, pipe elbows, vents, hoppers, and chimney groups. These should be structural modules with brackets/collars, not decorative cylinders.

### Procedural/game-dev basis

- Build from the existing tower-kit family where possible: `buildWallSurfaceBlocks()` and `facesOverride` give real coursed blocks on octagonal or rectangular faces; `rectangleFaces()`/`rectanglePoints()` already let rectangular halls consume the same technique.
- Use the doctrine's split grammar: fixed-size bay modules, floating filler panels, and one special bay per facade. No variety by uniformly scaling one ornate mesh.
- Keep settlement placement stable: each builder derives from `getFootprint(dna.buildingKind, dna.size)` and keeps visible props within that footprint plus a tiny allowed skirt (≤0.25 WU) unless the collision/placement code is deliberately changed later.
- Merge/batch static geometry by material identity. Use shared material references and geometry jitter/vertex color for variation; do not clone materials per block.
- Every visible element uses the depth ladder. The design budget goes into silhouettes, openings, plinths, roof courses, and industrial modules rather than tiny bolts.

### Runtime faction

Studio faction `dwarven` maps through `mapStudioFactionToRuntimeFaction()` to runtime faction **`dwarven`** (`BuildingTypeMap.ts`). The plan must wire `FACTION_BUILDING_VARIANTS.dwarven` for all eight canonical kinds.

## 4. Per-kind blueprint (all 8 kinds: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`)

### Shared blueprint constants

- **Depth ladder:** buttress/chimney face `+0.30`, chimney breast/pilaster `+0.12`, quoin/string/hood/sill `+0.08`, frame/surround `+0.04`, wall `0.00`, panel recess `-0.06`, reveal `-0.12`, glass/door face/flue dark `-0.20`.
- **Wall block scale:** 0.32-0.45 WU course height; 0.55-0.85 WU block length; 0.16-0.22 WU block depth; 3-5% per-block height/width/protrusion jitter.
- **Dwarven storey height:** 2.65-2.90 WU for houses/shops; 3.00 WU for public rooms; blacksmith forge hall 3.20 WU clear near chimney; watchtower tiers 2.40-2.65 WU.
- **Opening style:** low round/shouldered arch (`archRatio 0.50-0.65`) or oculus. Door leaf is planked boards + metal straps; no flat single panel. Windows use mullion, crossbar, or iron grille.
- **Ground system:** 0.25-0.45 WU plinth course, 0.10-0.18 WU rubble/soil skirt, front steps aligned to door, and optional rear rock cheek.

### `house`

- **Footprint / floors:** `getFootprint('house', size)`; primary settlement house is small `4 × 3 WU`, non-anchor tiny variants `3 × 3 WU`; 1 floor, 2.65 WU storey height.
- **Massing:** Rectangular stone hall, gabled roof, one asymmetric chimney. Built mass stays within footprint; rock skirt may extend 0.18 WU.
- **Wall system:** Four `rectangleFaces(halfW, halfD)` walls using `buildWallSurfaceBlocks()`; lower two courses use larger plinth blocks; front corners have proud quoins `+0.08` and shallow buttress pads `+0.30` at door sides.
- **Opening schedule:**
  - Front: 1 arched door, 0.95 W × 1.75 H, reveal `-0.14`, door face `-0.22`, surround `+0.04`, hood mould `+0.08`, threshold `+0.08`.
  - Side walls: 1 small arched window per visible side, 0.45 W × 0.70 H, reveal `-0.12`, set-back dark glass `-0.20`, one iron mullion, sill nose `+0.08`.
  - Rear: 0-1 square vent slit, 0.35 W × 0.50 H, grille bars at `+0.04`.
- **Roof archetype:** 65% steep gable with stone/slate courses; 20% low parapeted/flat roof based on `images.jpeg`; 15% small octagonal/conical cottage based on `images (2).jpeg`/`images (3).jpeg` if footprint is near-square.
- **Ornament:** One chevron belt course below eaves; X-lattice gable insert on 55%; shield plaque over door on 35%.
- **Props:** Front steps, one woodpile or coal basket, small stone bench. No barrels unless built from stave + hoops.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Roof family | gabled stone-tile 0.65 · parapet terrace 0.20 · compact conical 0.15 |
| Chimney placement | rear-left 0.35 · rear-right 0.35 · side-wall 0.20 · none/vent only 0.10 |
| Front ornament | chevron lintel 0.45 · shield plaque 0.25 · X-lattice gable 0.20 · plain corbel row 0.10 |
| Ground treatment | rock skirt 0.50 · two-step stoop 0.30 · rear rock cheek 0.20 |

### `terraced`

- **Footprint / floors:** `getFootprint('terraced', size)` = `3 × 4 WU`; 2 low floors, 2.55 WU each, compressed row-house proportions.
- **Massing:** Narrow rectangular bay with party-wall sides. Adjacent terraced houses must not require shared placement, but the model should imply a row: blank side walls, strong front/back detail, parapet coping.
- **Wall system:** Front/back block-course walls; party sides are plainer coursed stone with no windows. Vertical quoin strips only at exposed left/right edges depending `dna.terrace`; if `both`, use end pilasters only on front face.
- **Opening schedule:**
  - Front ground: 1 off-centre arched door, 0.75 W × 1.60 H, threshold and strap door.
  - Front upper: 1 small cross-mullion window, 0.55 W × 0.65 H, reveal `-0.12`, sill `+0.08`.
  - Back: 1 small service hatch or vent on 60%; no side windows on shared walls.
- **Roof archetype:** 50% shared gabled ridge, 30% flat/parapeted roof terrace, 20% sawtooth service roof. All have coping and drainage scuppers.
- **Ornament:** Continuous front chevron belt; small numbered/crest block; iron balcony rail only on 15% and only if it projects with brackets.
- **Props:** Doorstep, drain/scupper, small coal bin tucked at side/front.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Party-wall state | left 0.25 · right 0.25 · both 0.35 · none/end-unit 0.15 |
| Roof family | gabled ridge 0.50 · parapet terrace 0.30 · sawtooth service roof 0.20 |
| Door position | left-third 0.45 · right-third 0.45 · centred 0.10 |
| Upper detail | mullion window 0.55 · oculus 0.20 · blind chevron panel 0.25 |

### `villa`

- **Footprint / floors:** `getFootprint('villa', size)` = `7 × 5 WU`; 2 floors, 2.90 WU storey height; landmark residential/guild hall.
- **Massing:** L- or T-composed stone hall with a central octagonal/parapeted core and one lower rectangular wing. Wide base and stepped top terrace inspired by `images.jpeg` and `images (2).jpeg`.
- **Wall system:** `MassComposer` main rectangle plus octagonal/hexagonal upper tier. Block-course surfaces with a 0.40 WU plinth, 0.18 WU batter on first storey, and proud corner buttresses. String courses at floor and roofline.
- **Opening schedule:**
  - Front: 1 monumental low arch door, 1.20 W × 2.05 H, voussoir ring, keystone, strap-planked door.
  - Front upper: 2 small arched windows or oculi, 0.55 W, set under heavy hood moulds.
  - Side wings: 1 window per long side per floor; optional blind arcade panels on blank wall.
  - Roof terrace/parapet: 2-4 slit vents with grilles, no glass boxes.
- **Roof archetype:** 40% parapeted roof terrace with coped merlons; 35% hipped/gabled wing plus flat core; 25% circular/conical central cap.
- **Ornament:** Chevron frieze below parapet, X-lattice panels between floors, shield/hammer crest over main door.
- **Props:** Exterior stair/stoop, guarded coal niche, two lantern sconces with bracket arms.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Mass composition | L-plan wing 0.40 · T-plan front hall 0.25 · octagonal upper core 0.25 · parapet block only 0.10 |
| Roof/crown | coped terrace 0.40 · mixed gable+flat 0.35 · conical central cap 0.25 |
| Facade special bay | crest door 0.40 · blind arcade 0.25 · oculus pair 0.20 · side stair 0.15 |
| Ground | full rock plinth 0.45 · front stair plinth 0.30 · rear cut-rock cheek 0.25 |

### `inn`

- **Footprint / floors:** `getFootprint('inn', 'large')` = `7 × 5 WU`; 2 floors, 2.85 WU storey height.
- **Massing:** Long rectangular public hall with stone lower floor, timber/board upper panels, gabled roof, porch arcade, and one oversized chimney. The `dwarf-settlement-workshop.jpg` overhanging room is the main precedent.
- **Wall system:** Stone block lower storey; upper panels are framed planks sitting inside stone posts, not flat texture. Porch posts rest on block plinths.
- **Opening schedule:**
  - Front ground: 1 double arched entry, 1.40 W × 1.95 H, recessed, with planked double doors and strap iron.
  - Front ground: 2 small lit windows flanking entry, each with sill/grille/glass.
  - Upper: 3 small windows or 1 gable medallion + 2 windows.
  - Sides: 1 service door on kitchen side, 2 vents near chimney.
- **Roof archetype:** 70% broad gabled tile roof, 20% broken gable with raised dormer/sign bay, 10% parapeted stone roof.
- **Ornament:** Hanging sign on a real bracket with framed round medallion; chevron belt between storeys; roof straps on 50%.
- **Props:** Benches, stone trough, keg only if stave+hoop module exists, exterior lantern brackets, kitchen smoke stack.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Upper material | planked hoarding 0.45 · stone upper 0.35 · mixed gable bay 0.20 |
| Sign type | round medallion 0.45 · hammer shield 0.25 · hanging plank sign with frame 0.20 · no sign 0.10 |
| Chimney | rear kitchen stack 0.50 · twin side stacks 0.25 · corner stack 0.25 |
| Porch | two-post porch 0.45 · arcade recess 0.35 · no porch/deep door only 0.20 |

### `shop`

- **Footprint / floors:** `getFootprint('shop', 'small')` = `4 × 3 WU`; 1-2 floors, lower shop height 2.80 WU, optional upper machine loft 2.40 WU.
- **Massing:** Trade vault/alchemist storefront: squat lower stone box with one raised hex/octagonal equipment bay or sign stack on 35%, inspired by the alchemist workshop.
- **Wall system:** Front facade split into door bay + display/service bay + special ornament bay. Display is not a glass box: use recessed counter/window with sill, grille, side posts, and set-back dark glass/display void.
- **Opening schedule:**
  - Front: 1 arched customer door, 0.80 W × 1.70 H.
  - Front: 1 service/display opening, 1.10 W × 0.85 H, counter sill `+0.08`, recessed back `-0.20`, grille or shutters.
  - Side: 1 small high oculus/vent on 70%.
  - Upper loft if present: 1 small round window with cross mullion.
- **Roof archetype:** 35% parapet terrace, 35% shallow gable, 20% hex equipment cap, 10% lean-to awning with metal plates.
- **Ornament:** Framed sign medallion, chevron belt, metal band around equipment bay.
- **Props:** Stacked crates must be planked boxes with bevels and strap bands; scales/anvil sign; small pipe/vent if alchemist variant.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Trade sub-type | general vault shop 0.40 · alchemist/vent shop 0.25 · toolmaker 0.25 · jeweller/crest shop 0.10 |
| Upper feature | none 0.45 · sign stack 0.25 · hex equipment bay 0.20 · dormer 0.10 |
| Display bay | recessed counter 0.45 · shuttered hatch 0.30 · barred display window 0.25 |
| Exterior prop cluster | strapped crates 0.35 · ore trays 0.25 · sign bracket 0.25 · pipe vent 0.15 |

### `blacksmith`

- **Footprint / floors:** `getFootprint('blacksmith', size)` = `5 × 4 WU`; 1 tall forge hall plus partial loft; clear forge volume 3.20 WU, loft/eave line 2.65 WU.
- **Massing:** Flagship working building. Rear-left enclosed forge house, front/right open working yard, side coal/ore lean-to, and one dominant forge chimney. Keep all props inside the collision footprint except a ≤0.20 WU ground skirt.
- **Wall system:** Fireproof lower masonry on all enclosed sides, open front bay under a heavy lintel and side piers. The yard floor is stone pavers with heat-stained dark plates near forge. Wall courses are darker basalt around furnace and warmer granite elsewhere.
- **Opening schedule:**
  - Front working bay: 1 large shouldered forge opening, 1.55 W × 1.85 H, with side piers `+0.30`, iron lintel `+0.12`, dark forge throat `-0.20`, and visible grate bars.
  - Personnel door: 0.70 W × 1.55 H on side or front, planked with 4 straps and threshold.
  - Side wall: 2 high vent slits, 0.28 W × 0.55 H, louvred/grilled, reveal `-0.12`.
  - Rear: coal hatch, 0.55 W × 0.55 H, shutter or iron plate.
- **Roof archetype:** 55% low gabled metal/stone plate roof with open front eave; 25% sawtooth vent roof; 20% parapeted forge block with side lean-to. All roofs use hex metal plate or slate courses and thick eaves.
- **Forge chimney:** Corbelled block-course stack, rectangular plan 0.70 × 0.85 WU, height 3.80-4.60 WU from yard, with stepped base, 5-7 block courses, two collar bands, capstone, rain hood, and visible flue mouth (`-0.20`) oriented away from roof. Optional secondary short vent on 35%.
- **Bellows housing:** Wood-and-leather assembly in the yard: planked rectangular backboard, two wedge/leaf bellows plates, hinge axle, metal straps, and nozzle into forge; no inflated sphere/cylinder placeholder.
- **Quench trough:** Stone trough 0.90 × 0.35 × 0.35 WU with thick rim, set-back dark water plane inside, drain slot, and adjacent tongs rack.
- **Ore/coal store:** Low bin with individual stone/coal chunks made from wall-block fragments; planked crate only with bevels and metal straps.
- **Working-yard treatment:** Paver grid, low side wall, anvil block built from horn + waist + base parts, tool rack, hoist arm or sign bracket. The yard should read functional even from isometric distance.
- **Ornament:** Hammer/anvil crest, chevron heat shield, metal banding on lintel and chimney.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Yard layout | front-right open yard 0.45 · front-left open yard 0.25 · side yard 0.20 · covered yard 0.10 |
| Chimney stack | single massive stack 0.55 · stack + short vent 0.30 · twin narrow stacks 0.15 |
| Roof family | gabled plate roof 0.55 · sawtooth vent roof 0.25 · parapet forge block 0.20 |
| Forge prop focus | bellows 0.30 · quench trough 0.25 · ore/coal hoist 0.20 · tool/anvil cluster 0.25 |
| Heat state | cool/pristine 0.20 · glowing forge throat 0.45 · soot-heavy 0.35 |

### `chapel`

- **Footprint / floors:** `getFootprint('chapel', size)` = `4 × 8 WU`; 1 nave, 3.00 WU internal height, optional 1.20 WU altar/apse cap.
- **Massing:** Long low stone nave partly embedded in a rear rock mound, with a squat octagonal altar/ancestor core at the back. Inspired by `images (1).jpeg` for rock-cut entry and `images (2).jpeg` for round/oculus forms. No full cathedral tower.
- **Wall system:** Rectangular nave using `rectangleFaces()`, heavy side buttresses, a rear octagonal apse/core with three exposed faces. Plinth is extra high: 0.45 WU plus rock cheek on rear third.
- **Opening schedule:**
  - Front: 1 low ancestor-door arch, 1.05 W × 1.85 H, with 9-11 voussoirs, keystone crest, threshold steps.
  - Side nave: 2 slit/oculus windows per long side, alternating oculus and low arch; all with grilles and set-back glow/dark glass.
  - Apse/core: 1 round oculus, 0.65 diameter, cross mullion, recessed behind ring frame.
  - Rear rock face: no windows; optional blind chevron panel.
- **Roof archetype:** 45% heavy gable with stone tiles; 35% low vault/parapet; 20% octagonal conical cap over rear core. Roofline gets ridge stones and two short capped vents.
- **Ornament:** Ancestor runes/chevrons as raised block plaques, not flat text; hammer/forge-light brazier on plinth.
- **Props:** Stone steps, two braziers built as bowl + legs + ember plane, low monument stones. No freestanding cylinders for columns; use lathe columns with bases/caps.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Rear core | octagonal apse 0.50 · rock-cut altar wall 0.30 · low parapet sanctuary 0.20 |
| Roof family | gabled stone 0.45 · low vault/parapet 0.35 · octagonal cap 0.20 |
| Window rhythm | 4 slit arches 0.40 · 2 oculi + 2 slits 0.35 · mostly blind panels 0.25 |
| Sacred exterior | twin braziers 0.35 · ancestor plaques 0.35 · bell/vent cap 0.15 · plinth monuments 0.15 |

### `watchtower`

- **Footprint / floors:** `getFootprint('watchtower', size)` = `2 × 2 WU`; 3-4 compressed tiers, each 2.40-2.60 WU. Because the collision footprint is tiny, the visible rock skirt must stay tight (≤0.20 WU) unless placement code changes.
- **Massing:** Octagonal or square-with-chamfer tower rising from a rock plinth. It should feel like a mine head or signal stack, not a thin fairy spire.
- **Wall system:** Octagonal `buildWallSurfaceBlocks()` rings with strong taper: base radius from footprint, upper tiers step inward 8-12% per tier. Each tier gets a string course and corbel row. Four vertical corner/buttress strips at cardinal faces.
- **Opening schedule:**
  - Ground: 1 narrow low arch door, 0.55 W × 1.35 H, or no door + hatch if too small.
  - Upper tiers: 1 slit window per tier on alternating faces, 0.22 W × 0.55 H, grille, reveal `-0.12`, set-back dark `-0.20`.
  - Top: 2-4 lookout slots under parapet coping.
- **Roof/crown:** 45% crenellated/coped parapet, 30% capped signal chimney/vent, 25% small conical stone cap. Merlons need coping, not teeth on a box.
- **Ornament:** Warning horn/lantern bracket, chevron belt at top, metal band under parapet.
- **Props:** Rock base, two step blocks, small signal brazier/lantern. Do not add unsupported balconies.
- **Procedural variation axes:**

| Axis | Options / weights |
|---|---|
| Plan | octagonal 0.60 · square chamfered 0.25 · hexagonal 0.15 |
| Crown | coped parapet 0.45 · signal vent cap 0.30 · small conical cap 0.25 |
| Openings | alternating slits 0.55 · oculus top only 0.15 · mostly blind 0.30 |
| Ground | tight rock plinth 0.50 · stair-wrapped base 0.30 · rear rock cheek 0.20 |

## 5. Kit modules consumed

### Already in the codebase or likely delivered by the preceding elven plan

- `StoneTowerShape.ts`: `octagonFaces`, `rectangleFaces`, `facePointAt` — consume for octagonal towers and rectangular halls.
- `StoneTowerWallSurface.ts`: `buildWallSurfaceBlocks()` with `facesOverride` — consume for rectangular and octagonal coursed walls.
- `StoneTowerFloorCap.ts` / `StoneTowerQuoins.ts`: point overrides — consume for non-octagonal footprints.
- `StoneTowerKit.ts`: `buildTowerKitCore()` and material/palette conventions — consume where useful but do not inherit elven vines/foliage.
- `StoneTowerGableRoof.ts`: useful as a starting point, but dwarven roofs still need the doctrine's real tile-course upgrade.
- `[SHARED KIT] GothicArch.ts`, `OpeningParts.ts`, `VoussoirArch.ts`, `StringCourse.ts`, `DepthLadder.ts`, `Bevels.ts` — Tier 1 doctrine modules. Because dwarven is scheduled second after elven, assume these may already exist; if not, implement them first in the dwarven branch as shared-kit tasks.
- `[SHARED KIT] FacadeGrammar.ts`, `ShingleSurface.ts`, `RoofMassing.ts`, `MassComposer.ts` — likely partly present after elven. Dwarven should consume and extend, not fork them.

### `[SHARED KIT]` modules genuinely new or likely not built by elven

- **`RockPlinthSkirt.ts` — likely new.** Builds rock plinths, rubble skirts, stair pads, and rear cut-rock cheeks within `getFootprint()` limits. Essential for dwarven ground contact; useful later for orcish/undead/vampire ruins.
- **`SteppedBatterProfile.ts` — likely new.** Produces outward-battered lower face lists and inward-stepping tier outlines without using visible BlockKit voxel surfaces.
- **`CorbelledChimneyStack.ts` — likely new.** Rectangular/square block-course chimneys with stepped courses, capstones, collars, and dark flue mouths.
- **`AngularOrnament.ts` — likely new.** Chevron, zig-zag, stepped diamond, X-lattice, shield plaque, and block-corbel runs as real relief geometry.
- **`MetalBanding.ts` — likely new.** Roof straps, door straps, chimney collars, hoop bands, bolt plates large enough to read at isometric distance.
- **`PipeworkVent.ts` — likely new.** Elbows, vertical pipes, louvred vents, tanks, collars, brackets, and flanged joints; no bare cylinder pipes.
- **`HexPlateSurface.ts` or `ShingleSurface` dwarven profile — likely new extension.** Hex metal/stone plates for blacksmith and workshop roofs.
- **`LatheColumn.ts` dwarven profile — likely new Tier 3.** Squat engaged half-columns with entasis and lobed/fluted cross-section for chapel/villa.

### Race-specific modules

- `DwarvenBuildingKit.ts`: top-level composition helpers, palette, massing tables, and per-kind dispatch.
- `DwarvenOpenings.ts`: low-arch and oculus presets over the shared opening primitives; does not duplicate opening geometry.
- `DwarvenWorkshopProps.ts`: forge, bellows, quench trough, anvil, ore/coal bin, tool rack, hoist, and shop machinery, each as readable multi-part assemblies.
- `DwarvenMaterials.ts`: shared stone, dark basalt, iron, soot, emissive forge, dark glass, and planked wood materials with no per-block material cloning.

## 6. Quality-bar compliance

| Doctrine rule | Dwarven compliance |
|---|---|
| Rule 1 — depth ladder | All facades use the specified quantised offsets. Tests should assert no opening part is coplanar within 0.005 WU. |
| Rule 2 — five-piece opening minimum | Every door/window has recess, proud surround, sill/threshold, division/grille/straps, and set-back glass/door face. Dwarven doors add planks + 3-5 straps. |
| Rule 3 — no banned primitives | No bare boxes/cylinders/spheres as readable features. Chimneys are corbelled stacks; barrels, if used, are stave+hoop; windows are assembled openings; roofs are course-built. |
| Rule 4 — variety from modules | Per-kind variation tables swap modules and bay grammars. No uniformly scaling a decorated mesh. |
| Rule 5 — silhouette readability | Every kind has skyline breaks: chimneys, vents, parapets, signal caps, roof straps, hoists, or signs. |
| Rule 6 — ground contact | Every kind has plinth + rock/rubble/soil skirt + stairs/threshold. Dwarven ground contact is a signature, not an afterthought. |
| Rule 7 — asymmetry | Every blueprint specifies one off-centre element: door, chimney, annex, yard, sign, or window variant. |

Additional dwarven checks:

- Blacksmith yard must show at least forge stack, bellows or quench trough, ore/coal store, and paver/heat treatment.
- `watchtower` must be visible in Settlement Lab despite not being naturally reachable by `WARD_TO_KIND`.
- All eight kinds must be visible together in the Settlement Lab showcase for `faction=dwarven`.

## 7. Current-state delta

### What exists today

- Runtime faction id is `dwarven`.
- `FACTION_BUILDING_VARIANTS.dwarven` currently wires:
  - `villa` → `buildDwarvenVilla`
  - `chapel` → `buildDwarvenChapel`
  - `shop` → `buildDwarvenShop`
  - `house`, `terraced`, `inn`, `blacksmith` → `buildDwarvenVilla`
  - no `watchtower`/`tower` entry.
- The current builders live in `FactionBuildingVariants.ts` and use `dwarvenBlock()` / `addBlockDwarvenHall()` over `buildDwarvenHallGrid()` from `FactionBlockProfiles.ts`.
- `buildDwarvenHallGrid()` is a stepped BlockKit occupancy grid with hard-edged buttress cells, facade notch carving, and weathering chips. It was an improvement over smooth boxes, but under the new doctrine it is not sufficient for visible finished surfaces because visible voxel-grid massing is banned.
- Current props include placeholder-like pieces the new spec must supersede: BoxGeometry vault door slabs, CylinderGeometry chimney/column/brazier/hub forms, basic BoxGeometry crates/anvil, and repeated reuse of the villa for blacksmith/inn/house/terraced.

### What changes

- Build a new dwarven kit from shared coursed-wall, opening, roof, string-course, plinth, ornament, chimney, metal-banding, and pipe modules.
- Give all eight canonical kinds distinct assemblies or explicitly documented variants. `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` must no longer collapse to `buildDwarvenVilla`.
- Make `blacksmith` the flagship with dedicated forge/yard modules.
- Wire Settlement Lab's dwarven showcase so all eight kinds appear together; do not force the entire settlement to one kind.
- Retire the old dwarven live builders once the new dispatch table is wired. Keep only pure math helpers if still used by tests or new modules; otherwise delete as dead code.

## 8. Out of scope / deferred

- **True subterranean/cliff placement.** The reference art supports rock-cut buildings, but `SettlementGenerator`/`getFootprint()` currently place ordinary rectangular lots, not cliff faces or slope sockets. This spec uses self-contained rock plinths and rear rock cheeks. A cross-race placement feature for cliff/subterranean landmarks is deferred.
- **Natural spawning of `watchtower`.** Doctrine Part 5 notes `watchtower`/`tower` has no ward mapping. This race plan will showcase it in Settlement Lab, but a real settlement-level landmark slot or ward mapping is a cross-race decision.
- **Interior gameplay.** Doorways and working yards imply use, but this spec does not add enterable interiors or blacksmith crafting logic.
- **New asset dependencies.** Everything is procedural Three.js geometry/materials; no external model imports.
- **Full terrain blending beyond the lot.** Rock skirts may extend slightly for ground contact, but broad terrain deformation/path carving remains outside this building-kit pass.
