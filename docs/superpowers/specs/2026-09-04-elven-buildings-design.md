# Elven Buildings — Design Spec

Elven buildings use refined ashlar and warm living timber in one modular language: steep diamond-shingled roofs, lancet and rose-window tracery, interlaced bargeboards, stepped plinths, and controlled ivy/vine growth. This race is first in the rollout, so the design both preserves the approved stone tower and living-tree residential work and defines the shared Tier 1/2 kit needed to rebuild the rejected chapel as a brick-built old church ruin and the rejected market stall as a real market pavilion/gazebo.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

Reference art is binding for silhouette, module choice, and procedural variation. The current runtime faction for studio id `elven` is `elven` via `mapStudioFactionToRuntimeFaction()`.

| File | What it shows | Design decisions taken from it |
|---|---|---|
| `elven_smithy_1.html` | Saved QP3D Wargames collection page titled **Elven Scenery**. Metadata describes “elegance and mystique of elven culture,” “ethereal beauty,” “intricate designs,” “majestic towers,” “woodland shrines,” “halls and palaces,” and includes products such as The House of Law, Hall of Hunters, The Elven Pool, The Elven Cage, Stone Medieval Bridge, and Elven Watchtower. It is not a clean smithy product page despite the local filename. | Use as a tone source for blacksmith/shop: elven utility buildings still read elegant and ceremonial, not crude. Forge and market props should be integrated into refined stone/wood assemblies, with glowing moonstone/cyan accents and carved structural frames rather than rough boxes. The “Elven Watchtower” product mention supports keeping the shipped tower as the faction’s benchmark. |
| `house_stye_3.jpeg` | Two colored tabletop buildings with teal fish-scale/diamond shingled steep gables, heavy carved bargeboards, warm timber on one building, stone on the other, tall lit lancets, arched porch, curved entry steps, moss patches, and tall chimney towers. | Primary residential reference. Drives the house/villa/inn roof vocabulary: teal diamond shingles, high gables, chimney stacks, carved verge boards, lit lancet windows, arched porches, and moss/vine weathering. Also validates that elven is not “only tree trunks”; the approved living-tree language must be fused with built timber/stone modules. |
| `house_style_1.jpg` | A simple stylized A-frame cottage: cream walls, steep roof with large triangular glowing gable window, small planked door, roof ridge loops, eave curl, lantern bracket, and stone-paved/plinth base. | Drives low-status/tiny house simplification and terraced unit proportions: compact footprint, very steep roof, bracket lantern, planked door, and a large gable light. The triangular window is not copied as a flat triangle; it becomes a framed, divided, set-back gable glazing module satisfying the five-piece opening rule. |
| `house_style_2.jpeg` | Compact house/workshop with tall steep roof, red-brown tiles, cream plaster/timber frame, round cross-mullioned gable window, boxed timber frames, planked door, and raised stepped stone plinth over paving. | Drives town-house module proportions: raised 2-3 step plinth, strong timber frame, cross-mullion oculus/round window option, warm plaster infill, and practical door/side-window placement. This is the fallback for less-ornate houses and terraced rows. |
| `market_gazebo.webp` | Elven gazebo/pavilion: circular raised deck, stairs, root-like supports, green diamond roof surfaces, scalloped/swept eaves, a tiered central lantern/roof cap, hanging crystal lights, and vine/leaf growth around the base. | This is the core market replacement. The shop is no longer a stall/counter box; it becomes a circular/polygonal market pavilion with stepped plinth, clustered/lathe columns, latticed or shingled canopy, hanging goods, and optional ruined supports. |
| `travel_circle_teleport.jpg` | Circular stone teleport pad in forest: octagonal/round plinth, radial slab paving, six standing square pillars, inlaid central circle, carved arch/threshold remnant, surrounding upright stones, and vines through cracks. | Out of scope as a building kind, but important kit vocabulary: stepped circular plinths, radial paving, standing-stone modules, inlaid circle floors, pillar caps, and vine-in-crack decals feed gazebo floors, chapel ruin floor inlays, villa courtyards, and future landmarks. |
| `workshop_1.webp` | Tabletop Terrain “Elven Home” render: white/grey stone or plaster hall, extremely crisp diamond shingles, raised roof ridge with repeated half-round cap tiles, heavy carved bargeboards, open front arcade, engaged columns, lancet/leaf tracery panels, and raised floor tiles. | Strongest high-detail architecture reference. Drives shared `ShingleSurface`, `Tracery`, `Interlace`, `LatheColumn`, and arcade modules. Blacksmith/shop should use open-front arcades and columned work/display bays rather than enclosed houses. |
| `workshop_2.webp` | Same Noldareth style in grey-green lighting: gabled hall with side apse/dome-like vine lattice, glowing green interior, open porch arcade, diamond shingles, interlaced gable trim, curved paver floor, and thick vertical piers. | Drives villa/inn/shop/blacksmith “public building” treatment: open arcades, glowing interiors, leaf-lattice dome/canopy side module, carved floor inlays, and thick piers. The dome form informs the market pavilion canopy and not the chapel apse, because the new chapel must be a roofless ruin. |
| `workshop_2b.webp` | Exploded/ruined Noldareth building: roof lifted above a damaged lower shell, broken walls with ragged tops, surviving columns, arched wall panels, green glow, floor inlay, and freestanding broken posts. | Primary local ruin reference, along with the user-supplied gothic ruin screenshots. Drives chapel ruination: roofless lower shell, surviving gable/arches/columns, broken posts at varied heights, course-following wall breaks, and floor inlay surviving inside the ruin. |
| `workshop_2c.html` | Saved product page titled **Elven Home - Kingdom of Noldareth**. Metadata: one-story building with detailed wood and stonework, open interior for minis, ancient beautiful forest kingdom, tall towers and pristine craftsmanship. Product recommendations include **Elven Forge**, Stargazer Observatory, Council Gazebo, Great Library, Hall of Lords. | Confirms Noldareth vocabulary: one-story open interiors, detailed wood/stonework, forest setting, tall towers, pristine craftsmanship, and a named Elven Forge reference. Use for blacksmith: it is a forge/workshop in the same high-elven civic kit, not a dirty generic smithy. |

Prompt-only chapel ruin references: the user supplied two tabletop gothic church-ruin screenshots showing a roofless nave, surviving gable end, tall pointed lancets with tracery gone, ragged stepped course-following wall breaks, rubble piles, ivy, a surviving rose/wheel window, and buttresses that remain where wall between them has fallen. These are binding for `chapel` and override the prior rectangular nave + apse + bellcote attempt.

## 2. Race design language

1. **Runtime identity:** Studio `elven` maps to runtime faction `elven`; all dispatch, tests, and showcase wiring use that exact key.
2. **Primary masses:** slender, vertical, and pointed. Even small homes use steep gables or lifted tree/pavilion silhouettes; civic structures add cross-gables, arcades, towerlets, or domes.
3. **Wall material:** refined cool ashlar/brick courses for public stone and ruins; warm carved timber or bark-textured block courses for residential/living-tree elements. Visible masonry is always individual courses, never smooth CSG cuts or voxel blobs.
4. **Roof language:** teal/green diamond or fish-scale shingles with kicked courses, thick eaves, ridge caps, and carved bargeboards. A roof must be a surface made of tile courses or a real rib/lattice shell; never one or two flat planes.
5. **Opening language:** elven arch ratio `1.6`-`1.8` lancets. Every opening uses recess, proud surround, sill/threshold, mullion/tracery/strap division, and set-back opaque glazing/door face.
6. **Ornament motifs:** leaf-vein tracery, Celtic/interlace bargeboards, moonstone finials, rose/wheel windows, diamond lattice canopies, carved floor inlays, and sparse vines.
7. **Ground contact:** every building sits on a stepped stone plinth or root-skirt. Market and teleport motifs use circular/radial paving; ruins use rubble aprons and weeds at wall bases.
8. **Asymmetry:** one off-centre chimney, broken shutter, variant bay, side porch, or damage profile per facade. Even formal villas avoid perfect mirror symmetry.
9. **Procedural variety:** variety comes from fixed modules, split grammar, weighted roof/opening/prop selection, and small seeded jitter. It never comes from simply scaling one ornate mesh.
10. **Approved continuity:** keep the user-approved stone tower and living-tree residential “brick foundation” quality; generalise their good block-course method into shared modules, but do not replace approved silhouettes unless needed for the two rejected rebuilds.

## 3. Real-world & game-dev basis

**Masonry and ruins.** Real brick/ashlar church ruins fail course by course: corners, buttresses, and arches remain longer than unbuttressed wall spans; wall tops break in stair-stepped courses; fallen material piles at the wall base. The correct procedural method is seeded occupancy erosion over block courses, not a Boolean plane cut. A `Ruinate` pass can preserve load-bearing tags (`corner`, `buttress`, `arch_jamb`) while removing mid-span blocks and deriving rubble from lost blocks.

**Gothic openings.** Lancets, rose windows, hood moulds, mullions, impost blocks, and voussoirs are modular pieces. The current triangular `buildArchShape()` is only a stylised point; the shared kit must implement a true two-centred arch so elven/fantasy factions get tall lancets while other factions can reuse the same function at different ratios.

**Pavilions and gazebos.** Market pavilions are radial assemblies: plinth, columns, capitals, ribs, canopy, hanging goods, and surrounding floor. The references show both intact and ruined variants; broken columns at different heights are first-class state, not damage painted on afterward. Lattice domes use paired helical rib families for diamond cells, with vines/leaves as a separate low-density dressing layer.

**Residential and civic buildings.** The Noldareth references are tabletop terrain: readable from a distance, exaggerated gables, big shingles, heavy trim, open interiors, and crisp modular walls. That matches this game’s isometric view. House/terraced/villa/inn share modules, but each must differ in footprint, massing, roof composition, opening schedule, and props.

**Three.js implementation.** Static building shells should still merge by material identity. Repeated heterogeneous details (roof tiles, rubble, leaves) should migrate toward settlement-wide `BatchedMesh` pools where practical. The shared kit should expose geometry factories with deterministic seeds and unit tests for finite vertices, module counts, depth-ladder offsets, and output stability.

## 4. Per-kind blueprint

### `house` — Elderwood cottage

| Attribute | Blueprint |
|---|---|
| Footprint | Primary anchor `4×3 WU` (`house` + small ward); non-anchor variant `3×3 WU`. |
| Floors / storey | 1 floor, `3.2 WU` wall height; optional loft gable rises another `2.2-2.7 WU`. |
| Massing | One compact rectangular or softened-octagonal body on `0.28 WU` plinth; 30% side porch; 20% small root-wrapped base using approved living-tree vocabulary. |
| Wall system | 0.28-0.32 WU high block courses, running bond. Material weights: 45% warm timber/bark block-course, 35% pale plaster infill with timber ribs, 20% light ashlar lower half + timber upper half. |
| Opening schedule | Front: 1 planked lancet door (`0.75×1.75 WU`) at reveal `-0.20`, threshold `+0.08`, surround `+0.04`, hood `+0.08`. Windows: 2 side/front lancets (`0.45×1.15 WU`) with sill `+0.08`, reveal `-0.12`, glazing `-0.20`; 45% gable divided light (`0.9×1.1 WU`) inspired by `house_style_1.jpg`. |
| Roof | Steep gable, pitch 62-70°, eave overhang `0.35 WU`, diamond shingles (`0.22×0.28 WU`, 2-4° kick), ridge caps and carved/interlace bargeboards. |
| Ornament / props | Lantern bracket, small moss patch, one chimney or roof finial, planter/root clumps, curved stone step. |

Variation axes:

| Axis | Weights |
|---|---|
| Body module | 45% timber block cottage, 35% plaster/timber A-frame, 20% ashlar-base cottage |
| Roof module | 65% steep gable, 20% crossed mini-gable, 15% living-canopy cap grafted from approved treehouse language |
| Gable feature | 45% triangular divided light, 30% small lancet pair, 15% oculus, 10% blind carved panel |
| Porch | 50% none, 30% arched stoop, 20% side porch |
| Vegetation | 45% light moss, 35% root skirt, 15% vine up one corner, 5% flower planters |

### `terraced` — narrow elven row house

| Attribute | Blueprint |
|---|---|
| Footprint | `3×4 WU` fixed `terraced` footprint. |
| Floors / storey | 2 floors from slum ward; `3.2 WU` each, total eave at `6.4 WU`. |
| Massing | Narrow vertical bay with party-wall sides; 0.2-0.35 WU jetty/upper projection allowed only on street face; shared-row roof aligner so adjacent units do not look like isolated huts. |
| Wall system | Front/rear block-course timber/plaster facade. Side walls suppress readable openings when `terrace` is `left/right/both` or when row adjacency is inferred in the showcase. |
| Opening schedule | Front ground: 1 off-centre door (`0.65×1.7 WU`) + 1 shop-like/living window (`0.45×0.9`). Upper: 2 narrow lancets or one oriel (`0.85×1.0`) with sill at `+0.08`; rear: 1-2 smaller windows. No side windows on party walls. |
| Roof | Continuous steep gable or sawtooth row roof; diamond shingles in 8-10 courses, shared ridge cap, one chimney every 2-3 units. |
| Ornament / props | Shared hanging laundry/herb line, small sign/lantern, asymmetric chimney, bracketed jetty. |

Variation axes:

| Axis | Weights |
|---|---|
| Street facade | 45% door-left/window-right, 35% door-right/window-left, 20% central door + two tiny windows |
| Upper feature | 40% two lancets, 30% oriel, 20% gable light, 10% blind tracery panel |
| Roof row style | 60% continuous ridge, 25% alternating mini-gables, 15% living-vine ridge |
| Party-wall state | 40% both, 25% left, 25% right, 10% freestanding end unit |
| Street clutter | 35% herb rack, 25% lantern, 20% planter, 20% none |

### `villa` — Noldareth manor / elder hall

| Attribute | Blueprint |
|---|---|
| Footprint | `7×5 WU` fixed `villa`; optional porch/apse projections may extend `0.6 WU` but collision remains base footprint unless collision is updated. |
| Floors / storey | Merchant variant 2 floors; patriciate variant 3 floors; `3.2 WU` storeys. |
| Massing | Main hall + cross-gable wing (`MassComposer` L/T), 35% small towerlet, 45% front arcade/porch, asymmetrical chimney. |
| Wall system | Lower `0.8 WU` ashlar plinth, upper stone/timber block-course with carved piers at bay splits. Facade grammar bay width `1.2-1.6 WU`. |
| Opening schedule | Ground: 1 grand arched door (`1.0×2.2 WU`) with threshold and strap/plank leaf; 2-4 side lancets. Upper: 4-8 paired lancets; 30% rose/oculus in main gable; all windows have sill `+0.08`, frame `+0.04`, reveal `-0.12`, glazing `-0.20`. |
| Roof | Multi-gable diamond shingles, 10-14 tile courses per slope, bargeboard interlace, ridge caps, 1-2 chimney stacks. |
| Ornament / props | Moonstone finials, balcony/arcade, carved floor/paving apron, light vines. |

Variation axes:

| Axis | Weights |
|---|---|
| Plan | 40% front cross-gable, 25% L-wing, 20% towerlet, 15% courtyard porch |
| Wall palette | 45% pale ashlar, 35% timber over ashlar, 20% white plaster with stone piers |
| Roof composition | 50% double gable, 25% gable + towerlet cap, 15% hipped side wing, 10% living canopy accent |
| Grand feature | 35% rose window, 30% balcony, 20% front arcade, 15% moonstone crest |
| Vegetation | 50% light ivy, 30% moss patches, 15% root buttress, 5% flowering vine |

### `inn` — moonlit lodge

| Attribute | Blueprint |
|---|---|
| Footprint | Large default `7×5 WU`. |
| Floors / storey | 2 floors (`6.4 WU` eave), optional attic gable. |
| Massing | Long common-room hall with off-centre entrance, open porch/gallery along 40-60% of front, rear kitchen chimney, 25% stable/lean-to mass. |
| Wall system | Same residential/public wall modules as villa but warmer timber ratio. Ground-floor facade uses deeper recesses for public door and windows. |
| Opening schedule | Front: 1 double planked door (`1.15×2.0`) under pointed arch; 3-4 ground windows; 4-6 upper windows. Side: 1 service door + 2 windows. Hanging sign projects at `+0.12` on bracket; no flat sign board alone. |
| Roof | Long steep gable with 20% cross-gable dormer, 30% roofed gallery, diamond shingles with visible eave tile butts. |
| Ornament / props | Carved moon/leaf inn sign, benches, barrels/crates built as planked/hooped modules, warm glow, chimney smoke wisp. |

Variation axes:

| Axis | Weights |
|---|---|
| Front gallery | 45% open arcade, 30% covered porch, 15% balcony over door, 10% none |
| Service wing | 50% none, 25% left lean-to, 25% right lean-to |
| Sign motif | 35% moon bowl, 30% leaf harp, 20% stag antler, 15% book/scroll |
| Window rhythm | 45% paired lancets, 30% mixed lancet/oculus, 25% cross-mullion panels |
| Roof accent | 45% chimney, 25% dormer, 20% finial pair, 10% vine ridge |

### `shop` — elven market pavilion / gazebo

| Attribute | Blueprint |
|---|---|
| Footprint | Small `4×3 WU` shop footprint; visible plinth is octagonal/circular radius `1.8-2.15 WU`, with stairs projecting toward the street by `0.4 WU`. |
| Floors / storey | Open single market level; plinth height `0.35 WU`; column spring line `2.2 WU`; canopy apex `4.0-4.7 WU`. |
| Massing | Real assembly: 2-3 stepped stone plinth rings, 6 or 8 slender columns, capitals/impost blocks, radial counter/display tables, hanging goods, ribbed/lattice canopy. Ruined variant keeps plinth and some columns while canopy is partial. |
| Wall system | No enclosed wall. Structural read comes from plinth courses, columns, arch/rib bays, and canopy ribs. Column bases project `+0.30` relative to bay plane; trim/string courses `+0.08`. |
| Opening schedule | Open bays replace windows. Each bay has a pointed or ogee arcade rib with voussoir/impost blocks; 30% bays carry hanging cloth or goods, 20% carry lattice screen panels set back `-0.06`, never solid boxes. |
| Roof/canopy | 45% shingled pavilion roof like `market_gazebo.webp`, 35% helical lattice dome/vine canopy, 20% partial ruined canopy. All use real ribs or `ShingleSurface`, not flat awning planes. |
| Ornament / props | Goods strings, cloth banners, small lantern crystals, display rugs, herb/book/weapon tables, vines up columns. |

Variation axes:

| Axis | Weights |
|---|---|
| Column count | 55% 8 columns, 35% 6 columns, 10% 8 with 2 broken columns |
| Canopy | 45% diamond-shingle pavilion, 35% lattice dome, 20% partial ruined canopy |
| Market goods | 30% herbs/potions, 25% cloth, 20% books/scrolls, 15% crafted jewelry, 10% weapons/tools |
| Plinth shape | 55% octagonal stepped, 30% circular/radial pavers, 15% broken teleport-circle motif |
| Ruin state | 65% intact, 25% lightly ruined, 10% heavily ruined market remnant |
| Vegetation | 40% column vines, 30% plinth moss, 20% hanging tendrils, 10% clean/pristine |

### `blacksmith` — Noldareth forge workshop

| Attribute | Blueprint |
|---|---|
| Footprint | Fixed `5×4 WU` blacksmith footprint. |
| Floors / storey | 1 tall forge floor, `3.8 WU` wall/eave height; roof apex `6.0-6.6 WU`; chimney up to `7.0 WU`. |
| Massing | Open-front workshop bay from `workshop_1.webp`/`workshop_2.webp`, heavy rear/side stone walls, one glowing forge alcove, one tall chimney, 30% side storage lean-to. |
| Wall system | Heat-facing rear wall in block-course ashlar/brick; side walls half-height at front to keep the forge visible. Timber roof trusses and lathe/cluster columns support the open bay. |
| Opening schedule | Front: one wide pointed forge arch (`2.2×2.4 WU`) with voussoirs, no door leaf. Rear/side: 2 high ventilation oculi with mullions/glow set back `-0.20`; service door `0.75×1.7`; chimney breast projects `+0.12`. |
| Roof | High vented gable with diamond shingles, ridge smoke vent, thick eaves, fire-resistant stone cap around chimney. |
| Ornament / props | Anvil, bellows, quench trough, tool rack, weapon blanks, charcoal bin, glowing coals. Each prop is a module (planks/straps/hoops), not primitive stand-ins. |

Variation axes:

| Axis | Weights |
|---|---|
| Forge layout | 50% rear forge, 30% left-side forge, 20% central island forge |
| Front support | 45% two clustered columns, 35% pointed arcade, 20% broken/old pier pair |
| Chimney | 45% rear tall, 30% side corbelled, 15% twin vents, 10% low smoke hood |
| Prop set | 35% weapons, 30% tools, 20% armor plates, 15% horseshoe/utility |
| Wall finish | 45% pale ashlar, 35% soot-darkened brick, 20% timber/stone mix |
| Roof accent | 45% smoke vent, 25% dormer, 20% hanging lantern, 10% moonstone finial |

### `chapel` — brick-built old church ruin

| Attribute | Blueprint |
|---|---|
| Footprint | Fixed `4×8 WU` chapel footprint, preserved as long nave. Wall thickness `0.35-0.45 WU`; rubble apron may extend `0.6 WU`. |
| Floors / storey | No roof; one nave level. Surviving wall heights vary by course: low wall `1.0-1.8 WU`, side spans `2.2-3.8 WU`, front gable peak `5.2-5.8 WU`. |
| Massing | Roofless nave with front or rear gable surviving, optional small apse foundation only. Buttresses at bay divisions survive even where adjacent wall erodes. Floor is radial/leaf inlaid stone slabs. |
| Wall system | Brick/ashlar block courses from `buildWallSurfaceBlocks()` generalised to rectangular wall leaves. `Ruinate` runs before mesh emission: seeded per-course occupancy, structural damage field, no CSG planes. Two wall leaves have decorrelated break heights. |
| Opening schedule | 4-6 tall lancets (`0.55×2.4 WU`, archRatio `1.75`) with tracery mostly gone: jambs, pointed arch, sill, maybe one mullion stump. 1 surviving rose/wheel window (`1.0-1.3 WU diameter`) in gable, 55% intact ring / 30% broken ring / 15% gone. Door arch at front (`1.2×2.4`) with threshold step and absent/broken planked leaf. All reveals use `-0.12`; interior darkness/glow only when the pane survives at `-0.20`. |
| Roof | None. 40% exposed rafter remnants on one side; 20% fallen ridge beam on floor; never a flat gable roof. |
| Ornament / props | Same-material rubble derived from removed blocks, ivy/vines, weeds in floor cracks, fallen tracery fragments, altar stone, broken pew/bench planks. |

Variation axes:

| Axis | Weights |
|---|---|
| Survival profile | 35% front gable high, 25% rear gable high, 25% one long wall high, 15% mostly low foundation with arch/buttress remnants |
| Damage severity | 25% light ruin, 45% medium ruin, 25% heavy ruin, 5% near-foundation |
| Rose window state | 55% surviving ring, 30% broken ring, 15% absent |
| Lancet state | 40% open arch only, 30% one mullion stump, 20% partial tracery, 10% blocked/rubble-filled |
| Buttress survival | 60% all buttresses, 25% one broken, 15% several broken tops |
| Vegetation | 35% light ivy, 35% medium vines, 20% moss/weeds, 10% overgrown |
| Rubble distribution | 40% along collapsed side, 25% gable base, 20% interior piles, 15% scattered path |

### `watchtower` — approved elven stone tower

| Attribute | Blueprint |
|---|---|
| Footprint | `watchtower` fixed `2×2 WU`; `tower` variant may reuse builder at default size footprints. |
| Floors / storey | 3-6 tower rings, `2.88 WU` ring height (`FLOOR_HEIGHT * 0.9`), plus plinth and roof. |
| Massing | Approved octagonal ring stack with battered plinth, silhouette profiles (tapering/tiered/leaning/waisted), optional balcony, and roof variety. Keep as quality benchmark. |
| Wall system | Current block-course masonry from `StoneTowerWallSurface.ts`; generalise as shared wall emitter without changing visual output. Quoins/string courses become formal modules. |
| Opening schedule | Base entrance (`0.65-0.85 WU` wide), upper windows 0-1 per ring, mostly lancets/oculi/cross-mullions. Future shared opening parts add sills/mullions/glazing while preserving placement. |
| Roof | Keep approved classic/pagoda/living silhouette weights, but replace any LOD0 smooth/flat roof faces with `ShingleSurface` tile courses where needed. Living caps stay only where already user-approved; do not reuse as chapel/gazebo shortcut. |
| Ornament / props | Moonstone accents, vines, banners, moss patches, balcony, root-wrapped plinth. |

Variation axes:

| Axis | Weights |
|---|---|
| Silhouette profile | 30% tapering, 25% tiered, 25% leaning, 20% waisted |
| Roof archetype | 40% classic, 35% pagoda/tiered, 25% living cap (approved tower variant only) |
| Window style | 45% lancet, 30% oculus, 25% cross-mullion |
| Ring prop | 35% none, 35% vine, 15% moss patch, 15% banner |
| Balcony | 60% none, 40% open gallery |
| Masonry weather | 45% pristine, 35% mossed, 15% chipped blocks, 5% ivy-heavy |

## 5. Kit modules consumed

| Module | Tier | Elven use | Notes |
|---|---:|---|---|
| `DepthLadder.ts` | 1 | All facades/openings | Defines constants and dev assertion for `+0.30` buttress through `-0.20` glazing. Required before opening/trim work. |
| `Bevels.ts` | 1 | Trim, sill, tracery, plinth, coping | Shared bevel/extrude settings and creased-normal bake; fixes cardboard-like arrises. |
| `GothicArch.ts` | 1 | Lancets, door arches, arcades, ruin openings | True two-centred arch; elven default `archRatio = 1.6-1.8`. Replaces current two-line point. |
| `OpeningParts.ts` | 1 | Every window/door | Sill, mullion/transom, set-back opaque glazing, threshold, planked/strapped door leaves. Completes five-piece minimum. |
| `VoussoirArch.ts` | 1 | Chapel ruin, blacksmith arch, pavilion bays, door/window heads | Wedge/block arch stones with keystone; can stop emission early for broken arches. |
| `StringCourse.ts` | 1 | Plinth, floor bands, cornices, ruin coping | Horizontal shadow lines and ground contact for all kinds. |
| `FacadeGrammar.ts` | 2 | House/terraced/villa/inn/blacksmith facades | Split/repeat/floating filler so bay modules are never stretched. |
| `ModuleSocket.ts` | 2 | Later cross-race kit library | Useful for shared wall/roof/pier modules; elven plan can create minimal connector IDs for bay modules. |
| `ShingleSurface.ts` | 2 | All non-ruined roofs | Diamond/fish-scale elven shingles with tile kick, ridge/hip/verge/eave trim. |
| `RoofMassing.ts` | 2 | House/villa/inn/blacksmith roofs | Gable/hip/cross-gable massing with eave outset; replaces flat-plane gable primitive. |
| `Ruinate.ts` | 2 | Chapel and ruined market variant | Seeded structural damage field, per-course erosion, rubble, rafters, cracks, vegetation hooks. |
| `MassComposer.ts` | 2 | Villa/inn/blacksmith | Main block + wing/porch/chimney/dormer composition. |
| `BatchedDetail.ts` | 2 | Roof tiles, rubble, leaves | Settlement-wide pooling for high-count heterogeneous details. |
| `Tracery.ts` | 3 | Lancets, rose windows, pavilion screens | Trefoil/quatrefoil/rose shapes via `Shape.holes`; also creates broken tracery fragments. |
| `Interlace.ts` | 3 | Bargeboards, gable trim, floor inlays | Raised cord relief with over/under leaf knots; not flat texture. |
| `LatticeDome.ts` | 3 | Market pavilion canopy, optional villa arcade canopy | Helical double-family ribs with over/under offset and tapered tube radius. |
| `LatheColumn.ts` | 3 | Pavilion columns, blacksmith/inn arcades | Entasis and fluted/clustered shafts with base/capital/impost blocks. |
| `Buttress.ts` | 3 | Chapel ruin, villa/blacksmith accents | Stepped piers with weathered set-offs and gablet/pinnacle caps. |

## 6. Quality-bar compliance

1. **Depth ladder:** every blueprint specifies surfaces at ladder depths. Tests should assert no two facade layers are within `0.005 WU` unless intentionally merged.
2. **Five-piece openings:** `OpeningParts` makes recess, surround, sill/threshold, internal division, and set-back glazing/door face mandatory. Doors also get threshold, planks, and straps.
3. **No banned primitives:** no bare box/sphere/cylinder reads as a window, door, sign, crate, barrel, lamp, roof, or rubble. Primitive geometries may be subparts only when assembled into readable modules (lathe columns, straps, shingles, planked barrels).
4. **Module swapping, not scaling:** facade grammar selects fixed bay modules and absorbs width in filler; procedural axes are weighted module choices plus jitter.
5. **Silhouette:** every kind has roof breaks, chimneys, finials, broken walls, columns, galleries, or canopy ribs.
6. **Ground contact:** all kinds have plinths/skirt/rubble/root base. Ruins and pavilions use stepped radial paving.
7. **Asymmetry:** each building has an off-centre feature, varied damage, porch/wing choice, chimney offset, broken column, or one special bay.

## 7. Current-state delta

This is the critical section for elven because it is the only race with shipped buildings and explicit user rejections.

### Current elven wiring today

`FACTION_BUILDING_VARIANTS.elven` currently routes:

| Kind | Current builder | Status | Required delta |
|---|---|---|---|
| `watchtower` / `tower` | `buildElvenStoneTower` in `StoneTowerKit.ts` | **User-approved.** | Keep visual output; generalise block-course, quoins, floor caps, roof/shingle/opening pieces into shared kit. Add regression tests protecting approved silhouette. |
| `house` | `buildElvenTreehouseHome` | **User-approved living-tree residential.** | Keep; refine/variant through new residential facade/roof modules only where reference-driven. Do not delete. |
| `terraced` | `buildElvenTreehouseHome` | Approved technique, but currently collapses to same family as house/villa/inn/blacksmith. | Keep core, add terraced-specific narrow row facade, party-wall window suppression, and row roof behavior. |
| `villa` | `buildElvenTreehouseHome` | Approved technique, insufficient distinctness for villa reference. | Keep core, add Noldareth manor massing, multi-gables, arcades, rose/oculus, and richer props. |
| `inn` | `buildElvenTreehouseHome` | Approved technique, currently not inn-specific. | Add moonlit lodge assembly: gallery, sign, common-room window rhythm, chimney/service wing. |
| `blacksmith` | `buildElvenTreehouseHome` | Not rejected explicitly, but wrong for smithy/workshop references. | Replace with distinct `ElvenBlacksmithKit.ts` forge/workshop using open bay, chimney, forge props, and soot-darkened masonry. |
| `shop` | `buildElvenMarketStall` in `ElvenMarketStallKit.ts` | **REJECTED.** | Rebuild from scratch as `ElvenMarketPavilionKit.ts` gazebo/pavilion. Do not salvage the old stall silhouette/counter-first design. Delete old builder after wiring. |
| `chapel` | `buildElvenChapelShrine` in `ElvenChapelKit.ts` | **REJECTED.** | Rebuild from scratch as brick-built old church ruin, using `Ruinate` per-course occupancy erosion. Delete old rectangular nave + apse + bellcote builder after wiring. |

### Keep and generalise

- `StoneTowerWallSurface.ts` and its `buildWallSurfaceBlocks()` are the approved quality benchmark. Its `facesOverride` already supports non-octagonal faces, so use it as the base for rectangular walls and ruination.
- `StoneTowerShape.ts`, `buildFloorCap()`, `buildQuoins()`, `buildTowerKitCore()`, `StoneTowerSilhouette.ts`, and approved tower variation should survive. Generalise them into `src/world/buildings/kit/` only if tests prove byte-for-byte or visually equivalent output for the approved tower.
- `ElvenTreehouseKit.ts` remains the approved living-tree residential source. The new residential tasks should wrap/extend it, not remove its identity.

### Rebuild outright

- **Market stall:** `ElvenMarketStallKit.ts` currently builds a partial wall, counter, posts, flat awning panels, sapling canopy, sign, goods, and glow motes. The user’s new direction is an elven gazebo/pavilion with plinth, columns, canopy/lattice, hanging goods, and a ruined variant. Treat the old file as superseded after the new builder is wired.
- **Chapel:** `ElvenChapelKit.ts` and the prior chapel docs attempted a complete chapel with gabled roof, apse, bellcote, and forecourt. The user rejected the result and specifically requested a brick-built old church ruin. The new chapel must not contain the old flat gable roof, voxel apse cap, bellcote, or intact nave silhouette.

### Shared weak points to fix before race code

- `StoneTowerOpenings.ts::buildArchShape()` is a two-straight-line pointed top; replace with true `GothicArch` while keeping compatibility wrappers as needed.
- `buildRecessedArchOpening()` provides recess + surround but lacks sill, mullion/tracery, and set-back opaque glazing; replace with `OpeningParts` composites.
- `StoneTowerGableRoof.ts` is a flat-plane roof primitive tied to the rejected chapel; retire once old chapel is removed.
- `StoneTowerRoofCap.ts::buildLivingRoofCap()` is a BlockKit voxel cap. Keep only for currently approved tower/treehouse uses unless/until separately redesigned; do not use it for the new chapel or market pavilion.
- `BuildingBuilder.buildRuin()` rubble and legacy `ModularSet` opening panels remain anti-patterns; plan should route new ruins/openings through the shared kit and delete superseded live references when safe.

### Showcase delta

`SettlementLabScene.ts` currently forces only the first elven building to `watchtower`, then falls through to normal ward kinds. That does not guarantee all 8 canonical elven kinds are visible together. The plan must generalise the showcase override to cycle or place `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` together in one “Play in 3D” Settlement Lab run.

## 8. Out of scope / deferred

- `travel_circle_teleport.jpg` is not one of the 8 building kinds. Defer as a future landmark/prop, but reuse its standing stones, inlaid circle, radial paving, pillar caps, and arch-ring motifs as kit ornament modules now.
- Natural settlement spawning for `watchtower`/`tower` remains a cross-race reachability gap because no ward maps to it. The lab showcase should force it for review; a real landmark ward/slot should be decided once across all races.
- Full interiors, collision resizing for protruding porches/rubble, NPC job behavior, and economy interactions are out of this visual-kit plan unless a test exposes a blocker.
- Do not fetch or depend on remote assets from the `.html` pages. Use their recovered metadata/descriptions only.
- Do not adopt CSG for openings or ruin cuts. Occupancy-carve and block-course erosion are the chosen look and should remain deterministic.
