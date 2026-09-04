# Undead Buildings — Design Spec

Undead settlements should read as a lived-in necropolis: mausoleums, crypt rows, columbaria, iron gates, lantern cages, table tombs, obelisks, and deliberately maintained ruins built from reused masonry. The race signature is funerary-classical and modular, not generic gothic horror: form, ornament, depth, and silhouettes carry the read, while glow/fog/skulls are only minor accents.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

### `ByaUav.png`

This is the strongest architectural reference. It shows a miniature cemetery kit with three small mausoleum/crypt buildings, iron gates, freestanding rail sections, lamp posts, sarcophagi, grave markers, crosses, and stone-paver path pieces.

What the image validates:

- **Mausoleum massing is the primary building language.** The main forms are compact stone rooms with heavy plinths, classical front frames, shallow gabled or barrel-like roof caps, and a clear tomb/chapel read. This supports making `chapel`, `house`, and `villa` mausoleum/crypt descendants rather than human houses recolored grey.
- **Classical funerary ornament beats gothic horror.** The buildings use pediments, pilasters, cornice bands, round tympanum medallions, frieze-like trim, and iron grilles. There are no floating skulls, no fog shapes, and no jagged fantasy spikes as the primary read.
- **Openings are real assemblies.** Doors sit inside arched or rectangular stone surrounds with grilles/gates set behind them. This directly drives the five-piece opening schedule: recessed reveal, proud surround, sill/threshold, mullion or grille bars, and set-back dark door/glazing.
- **Ironwork is a race-signature module.** The gates and railings have vertical pickets, top spear/finial rhythm, posts, cross-bars, and depth. They should be modelled as rail assemblies, not alpha planes.
- **The cemetery kit is modular.** The image is almost a parts library: mausoleum fronts, rail sections, sarcophagi, slabs, crosses, upright markers, pavers, lamp posts. This supports a shared `MonumentKit`, `Railing`, `Frieze`, and `Pediment` rather than one-off undead geometry.

Design decisions taken from it:

- `chapel` becomes a necropolis chapel / ceremonial mausoleum with a pedimented front, side pilasters, rail gate, and tomb forecourt.
- `villa` becomes a larger patrician mausoleum / columbarium, not a domestic manor.
- `terraced` becomes a row of crypt fronts sharing party walls.
- Every kind gets at least one of: obelisk/finial, iron rail, sarcophagus/table tomb, stone-paver skirt, or lamp cage.

### `CEM0035.webp`

This image is a stylized cemetery prop sheet: chunky headstones, broken crosses, gabled tomb markers, arched slabs, greek-key bands, cracked stone faces, engraved plaques, several gridded lanterns, a shovel, and a wooden coffin/crate.

What the image validates:

- **The headstone/monument kit is diverse.** The silhouette vocabulary includes arched slabs, gable-topped slabs, cross markers, celtic-cross-like pierced markers, broken markers, and low block plinths. A single tombstone mesh scaled randomly would be wrong.
- **Greek-key / classical frieze bands are real reference input.** Several slabs have geometric frieze bands near the top. This justifies a `[SHARED KIT] Frieze` module with greek-key, dentil, and plain band variants.
- **Chunky stylization is acceptable if it is constructed.** The props are simplified, but still layered: plinth, body slab, raised plaque, bevels, cracks, cap mouldings. This supports low-poly geometry but not bare boxes.
- **Lanterns must have cages.** The lanterns are square bodies with metal frames, gridded panes, roof caps, handles/rings, and a separate base. The pane glow is secondary; the grille silhouette carries the read.
- **Cracks and breakage should be carved/relief details, not random dark lines only.** The cracked slabs show raised/indented fracture paths that can be modelled as shallow recessed strips or split blocks.

Design decisions taken from it:

- `MonumentKit` supplies slab, cross, obelisk, urn, sarcophagus, table-tomb, and broken-marker variants with weighted selection.
- `shop` uses reliquary display plaques and gridded lanterns instead of human shop windows.
- `blacksmith` uses iron-grille and coffin-hardware props, with a shovel/tool silhouette allowed as a secondary prop.
- Bone/skull ornament is optional and small; the reference itself relies more on grave forms than skulls.

### `ac05c125b3c1a58e506a8b6e538ec060.jpg`

This is a low-poly cemetery scene with simple chapel/mausoleum blocks, gabled roofs, crosses, coffin/sarcophagus slabs, fences/gates, bare dead trees, and candles. It is less detailed than the target quality bar, but it is useful for silhouette and kit taxonomy.

What the image validates:

- **Gabled chapel silhouettes and cross finials are in-bounds.** The tall chapel-like building with a cross on the ridge supports using a chapel/bellcote/finial silhouette rather than a pure tower for the flagship.
- **Rows of graves and coffins belong around buildings.** The props are not decoration pasted to walls; they define the ground read of a necropolis.
- **Rail sections and low cemetery walls define boundaries.** The building lots should have partial enclosure: rail gates, posts, low walls, and broken sections.
- **Crypt rows are a natural interpretation of repeated small buildings.** The clustered small gabled mausoleums make the `terraced` = row of crypts reading defensible.
- **Dead trees/growth are environmental accents, not architectural substitutes.** They can appear as lot dressing, but the building read must come from stone/iron geometry.

Design decisions taken from it:

- `terraced` is implemented as repeated crypt doors with shared side walls and a continuous cornice.
- `chapel` and `inn` may use candles/lantern posts, but light is never the main differentiator.
- `watchtower` can be an obelisk/bell-tower cemetery sentinel with a cross/finial skyline.

### `file.jpg`

This is a close-up of cemetery lanterns hanging from timber gallows/brackets, with stone bases, metal collars, rings, hooks, and gridded lantern bodies. It also shows a shovel and a stone cross at the edge.

What the image validates:

- **Lantern supports are constructed objects.** Upright timber post, angled brace, horizontal arm, iron collar bands, hanging ring, hook, lantern cage, roof cap, and gridded panes all need separate geometry.
- **Timber shoring belongs in the undead kit.** The bracket frames visually match the user's note that undead ruins should be maintained in decay with propped, patched, salvaged construction. Use this language for shoring broken walls and awnings.
- **Warm/green glow is an accent only.** The lantern panes are bright, but the object reads because of its cage and bracket silhouette. This is the model for all undead lighting: geometry first, emission second.
- **Stone bases under timber posts matter.** Every post/rail/lantern needs a plinth or foot block so props do not float.

Design decisions taken from it:

- Add `[SHARED KIT] LanternKit` if not already present: cage variants, gridded panes, metal cap, hook/ring, timber or iron bracket, stone base.
- Add timber braces to `Ruinate`'s undead mode: posts and diagonal shoring hold broken walls upright, instead of ruins simply collapsing.

### Validation of the user's initial skim

The initial skim is mostly confirmed, with one correction. The images strongly support mausoleum/crypt forms, a headstone/monument kit, greek-key/classical friezes, pediments, pilasters, real grilles/lanterns, iron railings, and a funerary-classical vocabulary. The correction is that the reference art does **not** make skulls, exposed bones, fog, or necromantic glow central. Those may remain small accents, but the authoritative read is cemetery architecture and funerary stonework.

## 2. Race design language

1. **Necropolis first, haunted mansion never.** Each building is a mausoleum, crypt, ossuary, reliquary arcade, grave-forge, or cemetery sentinel. Avoid human domestic tropes with grey paint.
2. **Funerary-classical vocabulary.** Use plinths, pilasters, pediments, cornices, greek-key/dentil friezes, tympanum medallions, obelisks, urns, table tombs, and ironwork. Pointed gothic can appear, but it is not the core identity.
3. **Masonry is built, reused, and repaired.** Walls are block-course ashlar from `buildWallSurfaceBlocks()` or equal-quality direct-emitted masonry. Mix stone sizes and tones as spolia: older pale blocks, darker replacement blocks, cracked capstones, salvaged lintels, and mismatched plaques.
4. **Ruination is deliberately maintained decay.** Elven ruin reads as a once-beautiful living/stone building reclaimed by time. Undead ruin reads as decay curated as infrastructure: propped with timber shoring, patched with mismatched stone, surrounded by railings, and left useful to the dead. The ruin is not accidental; it is a building style.
5. **Silhouette kit:** obelisks, cross finials, urns, broken pediments, uneven parapets, lantern brackets, rail spearheads, and raised sarcophagus lids. Every roofline needs at least one skyline breaker.
6. **Openings are barred, gridded, or lanterned.** Use equilateral/round arches (`archRatio` around 1.0), deep reveals, voussoirs, grilles, mullions, transoms, and set-back dark panes/doors. A black rectangle or blank hole is prohibited.
7. **Iron and timber are structural accents.** Iron railings/gates and lantern cages come from the references. Timber appears as shoring, gallows lantern brackets, and repair braces, not as cozy half-timbering.
8. **Palette:** cold ash-grey, blue-grey, lichen green, bone ivory, dark iron, weathered brown timber, and muted oxidized bronze. Purple/green/orange emission may appear in lantern panes or tiny rune insets, but never carries the race read.
9. **Bone/skull ornament is optional and subordinate.** A carved skull boss on a keystone, a bone-shaped finial, or ossuary-color corner block is allowed. If every skull were deleted, the building must still read as undead from mausoleum form, cemetery modules, railings, and ruin grammar.
10. **Ground contact is cemetery ground.** Use stepped plinths, paver paths, rubble skirts, graves, low rail boundaries, urns, overgrowth, and sunk slabs. A flat building bottom on bare terrain is not acceptable.

## 3. Real-world & game-dev basis

Real cemeteries and necropoleis are built from repeatable architectural units: family mausoleums, crypt rows, columbaria, boundary railings, memorial obelisks, sarcophagi, slab markers, urns, and chapel-front porticoes. These forms are ideal for procedural generation because they are already modular. A facade can be split into bays; each bay receives a door, niche, plaque, window, or blind arch; a cornice/frieze binds the bays together; monuments and rail sections dress the lot.

Real masonry ruins fail in block-sized pieces, not in smooth noise. Broken wall tops retain coursing, exposed thickness, partial arches, fallen capstones, and rubble made from the same material as the parent wall. Undead should use the shared `Ruinate` pass, but with different parameters and meaning from elven: low structural damage at deliberate supports, visible repair blocks, timber shores, braced pediments, and reused stone from other monuments. The result should look inhabited and serviced by undead caretakers, not abandoned.

Game-dev precedent for this style is a kit-of-parts cemetery set: reusable slabs, railings, lanterns, pediments, and crypt fronts combined by a split grammar. The rendering approach should follow the doctrine: deterministic seeded choices, fixed-size modules selected by weights, no cloned materials for color variation, no CSG carving for openings, and static merged material buckets for finished buildings. Dense repeated details such as rail pickets, roof tiles, lantern cages, rubble, and grave markers should use instancing or `BatchedMesh` when settlement-wide pooling exists.

The hard building kinds are solved by redefining their social function for the dead. `inn` is an ossuary hall / rest hall for travelers and caretakers, with rows of bier niches and lanterned arcades. `shop` is a reliquary market where grave goods, plaques, urns, and iron fittings are traded under a crypt arcade. `blacksmith` is a grave-forge producing cemetery railings, coffin hardware, and ritual ironwork. These are not ordinary human buildings with a darker material.

## 4. Per-kind blueprint (all 8 kinds: `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, `watchtower`)

### Shared dimensional and procedural rules

- Runtime faction: `mapStudioFactionToRuntimeFaction('undead')` maps to `undead_common`; all builders wire under `FACTION_BUILDING_VARIANTS.undead_common`.
- Use `getFootprint(dna.buildingKind, dna.size)` as the lot contract. The footprints below match the current canonical defaults for the reachable wards: `house` 4×3, `terraced` 3×4, `villa` 7×5, `inn` 7×5, `shop` 4×3, `blacksmith` 5×4, `chapel` 4×8, `watchtower` 2×2.
- Storey height: 3.0 WU for occupiable floors. Low mausoleum cells may use 2.4-2.8 WU walls plus a roof cap; tall towers stack 2.4-2.7 WU rings.
- Wall coursing: 0.35-0.50 WU courses, 0.18-0.25 WU block depth, 3-7 blocks per facade bay depending on bay width. Corners and pilasters stay crisp; wall body receives small seeded protrusion and value jitter.
- Depth ladder offsets: buttress/pier face +0.30; pilaster/chimney/shoring +0.12; quoin/string course/hood/sill nose +0.08; frame/surround +0.04; wall face 0.00; blind recess -0.06; reveal -0.12; door/glazing/grille back plane -0.20.
- Variation tables below use independent weighted axes; options in each axis sum to 100. A builder may select one option per axis using only seeded RNG derived from `dna.seed`.

### `house` — family crypt dwelling / grave-keeper tomb

**Footprint and massing:** 4 WU × 3 WU lot; one occupiable floor; wall height 2.7 WU; roof peak 3.8-4.2 WU. Main mass is a compact rectangular mausoleum cell set 0.2 WU back from the lot front, with an off-centre entrance and one small side annex or repair buttress to break symmetry.

**Wall system:** rectangular `buildWallSurfaceBlocks()` shell using ashlar/spolia courses. Add a 0.35 WU two-course plinth, four corner pilasters at +0.12, and one mismatched replacement-stone patch on a side wall. Base skirt uses same-material rubble and cemetery pavers, not random rocks.

**Opening schedule:**

- Front: one off-centre equilateral-arch door, 0.85 WU wide × 1.65 WU straight height plus 0.35 WU arch, frame at +0.04, threshold and sill nose +0.08, recessed planked/iron-grille door at -0.20, reveal -0.12.
- Side walls: one narrow lantern window on one side only, 0.45 WU wide × 0.85 WU high, with one vertical mullion or grille bars. If the annex occupies that side, replace it with a blind plaque niche at -0.06.
- Rear: 30% chance of a sealed slab niche, no open window.

**Roof archetype:** shallow stone-slab gable or raised table-tomb lid with visible cap courses, fascia, ridge cap, and one urn/cross finial. No flat one-piece plane: the cap has separate slab rows, thickened eaves, and bevels.

**Ornament and props:** one small headstone cluster, one urn or broken marker, partial iron rail on a front corner, and a lantern bracket only 40% of the time. Skull/bone only as a 15% keystone boss.

| Axis | Weighted options |
|---|---|
| Main silhouette | 55 mausoleum gable, 30 table-tomb lid, 15 broken-pediment front |
| Door assembly | 45 iron-grille arch, 35 sealed slab door, 20 planked repair door with straps |
| Side feature | 45 lantern window, 30 blind plaque, 25 shored crack/patch |
| Roof finial | 40 urn, 30 small cross, 20 obelisk nub, 10 missing/broken finial |
| Lot dressing | 40 two grave markers, 25 rail corner, 20 paver strip, 15 low sarcophagus |

### `terraced` — row of crypts sharing party walls

**Footprint and massing:** 3 WU × 4 WU lot; one floor; wall height 2.6 WU; roof/pediment top 3.4-3.9 WU. The lot represents a row-house analogue: a two- or three-bay crypt frontage compressed into a narrow parcel. Side walls are treated as party walls with no side windows.

**Wall system:** long face split into crypt bays by pilaster strips. Shared side walls are plain block-course masonry with only string courses and repair patches; front has repeated but non-identical crypt doors. A continuous plinth and frieze tie the row together.

**Opening schedule:**

- Front: 2-3 narrow crypt doors, each 0.55-0.70 WU wide × 1.45 WU high, all recessed to -0.12 with door/grille back plane -0.20, frames +0.04, individual thresholds +0.08.
- Above each bay: a plaque, oculus, or blind arch at -0.06; at least one bay differs from the others.
- Side/rear: no side openings; rear may have one tiny barred vent only if not a party wall in the placement context.

**Roof archetype:** segmented table-tomb lids per bay or a continuous shallow gabled cap interrupted by broken pediment teeth. Party-wall caps project slightly above roofline at bay ends.

**Ornament and props:** greek-key frieze band, plaques, small obelisks at row ends, rail/gate fragment in front. This is the most important kind for making the undead roster look socially specific.

| Axis | Weighted options |
|---|---|
| Bay count | 35 two wide crypts, 50 three standard crypts, 15 four narrow niches |
| Bay cap | 40 individual gabled pediments, 35 continuous table-tomb lid, 25 broken alternating pediments |
| Repetition break | 35 one sealed bay, 25 one lantern bay, 25 one broken/shored bay, 15 one urn niche |
| Frieze | 45 greek-key, 30 dentil, 15 plain double string, 10 cracked/missing segment |
| Forecourt | 40 paver strip, 25 rail posts, 20 shared sarcophagus, 15 leaning markers |

### `villa` — patrician mausoleum / columbarium hall

**Footprint and massing:** 7 WU × 5 WU lot; 2-3 floors depending on DNA/ward, 3.0 WU storeys; total cornice height 6.0-8.7 WU with roof/finials to 7.2-10.0 WU. Use a central mausoleum block with one lower side wing or portico, not a generic manor. The front has a ceremonial axis but one side wing or ruin patch breaks bilateral symmetry.

**Wall system:** block-course ashlar with larger dressed plinth blocks and pale spolia quoins. Add two-storey pilasters at bay divisions, columbarium niche bands on side walls, and a mismatched stone patch using `Ruinate`'s undead repair mode. Cornices at every floor line prevent a single tall box read.

**Opening schedule:**

- Front ground floor: one grand arch door, 1.2 WU wide × 2.1 WU tall with voussoirs and keystone boss; door plane -0.20, grille bars crossing at -0.16, frame +0.04, hood +0.08.
- Front upper floors: 3 or 5 columbarium/lantern bays, each 0.45-0.60 WU wide. At least two are blind niches at -0.06; at least one is gridded dark pane at -0.20.
- Side walls: 2-4 smaller plaque niches per visible side; avoid side windows if an attached wing covers that side.

**Roof archetype:** low hipped stone-slab roof, table-tomb lid roof, or central pediment with broken corner obelisks. If a dome/lantern appears, it must be a small masonry lantern with ribs and grilles, not a glowing orb.

**Ornament and props:** obelisks, urns, sarcophagus benches, boundary rail, plaque rows, optional skull keystone. This building is the elite version of the cemetery vocabulary.

| Axis | Weighted options |
|---|---|
| Plan composition | 45 central block + portico, 30 L-wing mausoleum, 15 courtyard wall return, 10 stepped columbarium towerlet |
| Front bay count | 45 three broad bays, 40 five narrow bays, 15 asymmetrical 3+1 repair bay |
| Roof | 40 hipped slab, 30 table-tomb lid, 20 pedimented hall, 10 small gridded roof lantern |
| Ruin/repair | 30 patched right wall, 25 shored broken cornice, 25 mismatched plinth blocks, 20 light cracks only |
| Elite props | 30 paired obelisks, 25 sarcophagus pair, 20 rail gate, 15 urn row, 10 carved skull boss |

### `inn` — ossuary rest hall / bier hostel

**Footprint and massing:** 7 WU × 5 WU lot; 2 floors; storey height 3.0 WU; roof peak 7.0-7.8 WU. It reads as a long public ossuary hall where the dead rest in wall niches and travelers enter under a lanterned arcade. The footprint may stretch visually with a front arcade and side bier annex.

**Wall system:** rectangular hall with a three-bay front arcade, heavy plinth, continuous second-floor niche band, and one timber-shored repair bay. The front is more open than the villa but still stone/iron, not a tavern facade.

**Opening schedule:**

- Front ground floor: 3 arcade bays. Middle bay is the main entry, 1.1 WU wide; flanking bays are recessed bier/display niches. All have voussoirs, grille/transom bars, and thresholds at +0.08.
- Upper front: 4-6 small barred lantern windows or columbarium niches aligned to the arcade rhythm, set back -0.20 or blind -0.06.
- Side walls: 2 small high vents per side with real frame/sill/grille, not black slots.
- Rear: one service arch for bier carts, offset from centre.

**Roof archetype:** long stone-slate gable with ridge cresting, raised clerestory lantern boxes, or a repaired half-collapsed roof exposing some rafters via undead `Ruinate` mode.

**Ornament and props:** hanging lantern brackets, a carved stone plaque sign, bier/sarcophagus benches, urn racks, paver apron. If there is a sign, it is a carved relief plaque or lantern color pattern, not text.

| Axis | Weighted options |
|---|---|
| Public front | 50 three-bay arcade, 30 two-bay arcade + side door, 20 broken arcade with timber prop |
| Upper rhythm | 35 barred lantern windows, 35 columbarium niches, 20 blind plaques, 10 mixed repaired bays |
| Roof | 45 long slab gable, 25 clerestory lantern ridge, 20 partial rafter exposure, 10 table-tomb cap |
| Lodging props | 35 bier benches, 25 sarcophagus pair, 20 urn racks, 20 lantern posts |
| Asymmetry | 40 shored left bay, 25 off-centre rear arch, 20 missing cornice chunk, 15 mismatched wing |

### `shop` — reliquary market under a crypt arcade

**Footprint and massing:** 4 WU × 3 WU lot; one floor; wall height 2.4 WU; arcade/pediment top 3.2-3.8 WU. This is not a shop window in a house. It is a reliquary stall built into a cemetery wall fragment, trading urns, plaques, lanterns, grave goods, and iron fittings.

**Wall system:** shallow U-shaped partial masonry wall: rear wall plus two short side returns. Front stays open through one or two arch bays, with a sarcophagus/table-tomb counter at waist height. Wall courses are block-built; back wall includes one display niche and one repaired crack.

**Opening schedule:**

- Front: one wide counter arch (1.7-2.2 WU) or two narrow arcade arches. Counter slab projects +0.12 from wall line; arch frames +0.04; reveal -0.12; display/grille plane -0.20.
- Rear wall: one reliquary display niche, 0.65 WU wide × 0.8 WU high, with gridded bars and plaque sill.
- Side returns: optional 0.35 WU lantern niche; never plain dark rectangles.

**Roof archetype:** stone arcade canopy with visible slab courses, repaired timber gallows brackets, or a small pediment over the rear wall. If cloth is used at all, it is secondary tattered shade under a hard stone/wood frame, not the roof read.

**Ornament and props:** urns, small tablets, coffin crate, lantern cages, rail fragments, a shovel/tool silhouette. Props must be modelled kit pieces and placed on shelves/counter/plinths.

| Axis | Weighted options |
|---|---|
| Front arrangement | 50 single wide arcade, 30 double narrow arcade, 20 broken arch with shoring |
| Counter | 45 sarcophagus slab, 25 table tomb, 20 plank over stone blocks, 10 iron-grille display case |
| Goods | 35 urns/tablets, 25 lanterns, 20 grave markers, 15 iron fittings, 5 skull boss relic |
| Canopy | 45 stone slab canopy, 30 timber-braced lintel, 15 small pediment, 10 tattered shade under frame |
| Back-wall feature | 40 reliquary niche, 30 plaque grid, 20 sealed door, 10 cracked repair patch |

### `blacksmith` — grave-forge / cemetery ironworks

**Footprint and massing:** 5 WU × 4 WU lot; one floor; wall height 3.0 WU; forge chimney/stack 5.5-6.5 WU. The social function is funerary ironwork: railings, gate hinges, coffin nails, bells, lantern cages, and grave hardware. The silhouette is a low masonry forge with a tall crematory-like stack and racks of iron rails.

**Wall system:** L-shaped masonry shell with an open work front, one heavy side stack, timber shoring around a broken roof corner, and iron racks along the yard edge. Use block-course stone; no large flat forge box. The forge mouth itself is a voussoir arch assembly.

**Opening schedule:**

- Front: one broad forge/work arch, 1.5 WU wide × 1.8 WU high, frame +0.04, voussoir keystone +0.08, forge recess -0.12, coal/fire plane -0.20. Emission can tint the coal plane but the arch and stack carry the read.
- Side: one barred vent window 0.5 WU wide high on the opposite wall, with sill +0.08 and grille bars.
- Stack: 2-3 small vent slits built with framed recesses, not boxes; cap has dentil/stone courses.

**Roof archetype:** half-gabled stone/slate lean-to with visible rafters and a missing/repaired corner, or a low slab roof behind the tall stack. Use `Ruinate` exposed rafter deletion sparingly but legibly.

**Ornament and props:** iron rail batches, gate panel leaning on wall, coffin hardware rack, anvil/block as a constructed assembly, water/ash trough built from stone slabs, lantern bracket.

| Axis | Weighted options |
|---|---|
| Forge front | 50 broad open arch, 25 twin small work arches, 25 broken arch with shoring |
| Stack | 45 square crematory stack, 30 tapered chimney, 15 twin vents, 10 broken/repaired cap |
| Roof damage | 35 exposed rafters, 30 patched slate corner, 20 intact lean-to, 15 missing rear strip |
| Iron goods | 40 railing bundles, 25 gate panel, 20 lantern cages, 15 coffin hardware rack |
| Yard boundary | 35 rail section, 25 low stone wall, 25 sarcophagus workbench, 15 no boundary but pavers |

### `chapel` — flagship necropolis chapel / ceremonial mausoleum

**Footprint and massing:** 4 WU × 8 WU fixed chapel footprint; one main floor; nave wall height 3.3 WU; roof ridge 5.0-5.6 WU; pediment/finials up to 5.9 WU. A long mausoleum chapel with front portico/gate, side buttresses, rear apse or crypt annex, and graveyard forecourt. This is the hero kind for undead.

**Wall system:** rectangular nave using `rectangleFaces` + `buildWallSurfaceBlocks`, heavy plinth, floor-line string course, side pilasters/buttresses at bay breaks, greek-key or dentil frieze under the cornice, and `Ruinate` maintained-decay patches. Unlike elven chapel ruin, damage is repaired and curated: propped pediment, mismatched spolia blocks, railings still maintained, ivy/moss controlled around the base.

**Opening schedule:**

- Front: grand equilateral-arch iron gate/door, 1.1 WU wide × 2.2 WU high plus 0.45 WU arch, with voussoirs, keystone boss, gridded door leaf at -0.20, transom grille, threshold steps, and proud hood mould.
- Side walls: three bays per long side. Each bay gets either a tall mullioned lantern window, a blind memorial niche, or a repaired sealed arch. Window apertures 0.45-0.6 WU wide × 1.3-1.6 WU high; every aperture has sill, grille/mullion, and set-back dark pane.
- Rear: apse oculus or rose-like funerary medallion using `Tracery`/`Pediment` if available; otherwise a blind plaque and two urn niches.
- Gate/rail: front lot boundary has a real iron gate with pickets and spear finials, not texture.

**Roof archetype:** steep stone-slate gable with individual courses, thick eaves, ridge cresting, broken front pediment, and a small bellcote/obelisk finial. 35% of seeds show a partially collapsed side roof with exposed rafters but still braced; never a missing roof with no structure.

**Ornament and props:** rail forecourt, obelisks, sarcophagi, rows of markers, lantern posts, carved plaques, urns, limited skull keystone. This building should remain readable if every glow and skull is disabled.

| Axis | Weighted options |
|---|---|
| Chapel plan | 45 long nave + rear apse, 25 long nave + side crypt annex, 20 portico-front mausoleum, 10 broken transept stub |
| Side bay module | 40 mullioned lantern window, 30 blind memorial niche, 20 sealed/shored arch, 10 small tracery oculus |
| Front identity | 40 iron gate arch, 30 slab door + grille transom, 20 portico with columns, 10 broken pediment + shoring |
| Roof condition | 40 intact stone-slate gable, 25 braced partial collapse, 20 table-tomb ridge cap, 15 bellcote/obelisk emphasis |
| Forecourt | 35 rail gate + pavers, 25 tomb rows, 20 paired obelisks, 10 sarcophagus altar, 10 lantern avenue |

### `watchtower` — cemetery sentinel obelisk / bell-watch monument

**Footprint and massing:** 2 WU × 2 WU lot; 3-4 stacked rings, each 2.4-2.7 WU high; total stone height 7.2-10.8 WU plus cap. It should read as a cemetery watch monument or belfry-obelisk, not a military tower copied from another race.

**Wall system:** square or octagonal tapered shaft built from block courses, with quoin/pilaster ribs on corners and banded floors. Use `Ruinate` only on crown/parapet and one mid-height repair scar; maintain structural corners.

**Opening schedule:**

- Ground: narrow arched service door, 0.55 WU wide × 1.45 WU high, with threshold and iron strap/grille.
- Mid levels: 1-2 arrow-slit or lantern-slit openings per visible face, but each is a five-piece framed slit: reveal -0.12, back plane -0.20, small sill +0.08, bars/mullion, hood +0.04/+0.08.
- Top: optional bell/lantern opening inside a small belfry cage with railing.

**Roof archetype:** obelisk cap, broken pedimented belfry, or low rail platform with urn/finial. No floating orb. If a light appears at the top, it sits inside a gridded lantern cage with a cap and handle.

**Ornament and props:** rail balcony, spear finials, chain/hanging lantern, urn cap, plaque band. A tiny skull boss on the top keystone is acceptable but not required.

| Axis | Weighted options |
|---|---|
| Shaft plan | 50 square obelisk, 30 octagonal monument tower, 20 square base + octagonal upper belfry |
| Crown | 35 obelisk cap, 30 rail platform, 20 broken belfry pediment, 15 urn/cross finial cluster |
| Mid openings | 45 barred slits, 30 blind plaque bands, 15 lantern slit, 10 sealed repair patch |
| Ruin scar | 35 broken crown, 25 shored side crack, 25 mismatched repair course, 15 mostly intact |
| Top accent | 35 urn, 25 lantern cage, 20 iron weathervane/crest, 10 small bell, 10 missing finial |

## 5. Kit modules consumed

### Existing modules to consume directly

- `StoneTowerWallSurface.buildWallSurfaceBlocks()` — primary visible wall technique. Use `facesOverride` for rectangles, partial walls, arcades, and crypt rows; do not use visible voxel blobs.
- `StoneTowerShape.rectanglePoints/rectangleFaces/facePointAt()` — rectangular nave/mausoleum placement math.
- `StoneTowerQuoins.buildQuoins()` and `StoneTowerFloorCap.buildFloorCap()` — plinth/cap geometry, extended through points overrides where needed.
- `StoneTowerGableRoof.buildGableRoofCap()` — only as a stopgap base for rectangular roof massing; undead roofs still need slab courses, eaves, ridge cresting, and pediment modules layered on top.
- `mergeGroupMeshesByMaterial()` — merge material buckets; never clone materials for random color variation.
- `BlockKit` — allowed for data-grid internals or non-visible helper occupancy, but not for visible facade blobs. Existing undead BlockKit builders are not the target quality bar.

### Shared kit modules required or consumed

- `[SHARED KIT] DepthLadder` — constants and dev assertions for the quantised facade offsets.
- `[SHARED KIT] GothicArch` — true two-centred arch with `archRatio ≈ 1.0` for undead equilateral/rounder cemetery arches.
- `[SHARED KIT] OpeningParts` — sill, mullions/grilles, set-back dark panes, threshold steps, strap ironwork, and planked/slab/grilled doors.
- `[SHARED KIT] VoussoirArch` — wedge-block arches and keystones matching block-course masonry.
- `[SHARED KIT] StringCourse` — plinths, floor bands, cornices, hood moulds, and cemetery wall caps.
- `[SHARED KIT] FacadeGrammar` — split/repeat/floating filler, one special bay per facade, no stretched mouldings.
- `[SHARED KIT] RoofMassing` and `[SHARED KIT] ShingleSurface` — stone-slate slab courses, thick eaves, ridge/hip/verge trim, exposed rafters for ruined roofs.
- `[SHARED KIT] Ruinate` — undead uses the maintained-decay mode: spolia patches, shoring, braced broken pediments, controlled overgrowth, same-material rubble.
- `[SHARED KIT] BatchedDetail` — settlement-wide pooling for rail pickets, grave markers, roof tiles, rubble, lantern cages, and urns when available.
- `[SHARED KIT] Frieze` — greek-key, dentil, plain double-string, cracked/missing segment variants.
- `[SHARED KIT] Pediment` — triangular, segmental, broken, and gabled tomb-front pediments with tympanum medallions.
- `[SHARED KIT] Railing` — iron rail sections, gates, posts, spear finials, crossbars, and broken rail variants.
- `[SHARED KIT] MonumentKit` — slabs, arched markers, crosses, obelisks, urns, sarcophagi, table tombs, plaques.
- `[SHARED KIT] LanternKit` — gridded lantern cages, caps, hooks/rings, timber/iron gallows brackets, stone bases.
- `[SHARED KIT] Tracery` and `[SHARED KIT] Buttress` — used primarily by `chapel`, `villa`, and `watchtower` if already built by earlier races.

### Race-specific modules to add

- `UndeadNecropolisKit.ts` — public builders for the eight undead kinds and shared placement helpers.
- `UndeadNecropolisPalette.ts` or local palette factory — material references for ashstone, spolia, bone ivory, dark iron, oxidized bronze, old timber, dark panes, and lichen.
- `UndeadFacadeModules.ts` — weighted undead bay modules: crypt door, barred lantern window, plaque niche, reliquary niche, sealed slab, shored crack, columbarium band.
- `UndeadLotDressing.ts` — deterministic placement wrappers for monuments, rails, pavers, lantern posts, sarcophagus counters, and repair debris.

## 6. Quality-bar compliance

- **Rule 1 — depth ladder:** all facade modules use named offsets; no arbitrary near-coplanar offsets. Tests should assert min separation > 0.005 WU for registered facade surfaces.
- **Rule 2 — five-piece opening minimum:** every door/window/niche with an aperture has recess, proud surround, sill/threshold, grille/mullion/transom, and set-back door/pane. Even slits and shop display niches follow this rule.
- **Rule 3 — no banned primitives:** no BoxGeometry/SphereGeometry/CylinderGeometry standing alone as a readable window, door, lamp, skull, sign, barrel, or roof. Primitive geometry can be a sub-piece only inside a constructed module with frame, cap, base, bevel, and context.
- **Rule 4 — variety by module swapping:** facade widths are solved by `FacadeGrammar`; variety comes from bay modules, roof archetypes, monument selections, ruin modes, and seeded jitter, not scaling a whole mausoleum mesh.
- **Rule 5 — silhouette:** each kind has skyline breakers: pediments, obelisks, urns, cross finials, broken parapets, rail spearheads, lantern brackets, belfries, chimneys/stacks, or exposed rafters.
- **Rule 6 — ground contact:** every building has plinth + cemetery skirt: pavers, rubble, rail posts, grave markers, sarcophagi, low walls, or overgrowth.
- **Rule 7 — asymmetry:** one off-centre door, one repaired bay, one missing/broken pediment segment, one side annex, one shoring frame, or one different prop cluster is mandatory per building.

Additional undead-specific compliance:

- **Geometry carries the read.** Do not lean on transparency, emissive glow, or fog. Lantern panes and rune insets are tiny accents; the undead identity must remain visible in an unlit clay render through silhouette, mausoleum massing, funerary ornament, grilles, railings, and the depth ladder.
- **Ruination differs from elven.** Elven ruin = beauty decayed/reclaimed. Undead ruin = decay maintained as civic infrastructure. Use spolia, patching, timber shores, controlled growth, repaired railings, and deliberately preserved broken pediments.
- **Skulls/bones are not load-bearing identity.** Use carved skull bosses or bone-ivory trim sparingly; if removed, the building still reads as necropolis architecture.

## 7. Current-state delta

- Runtime faction is confirmed: `mapStudioFactionToRuntimeFaction('undead')` returns `undead_common` in `src/world/buildings/BuildingTypeMap.ts`.
- Current dispatch in `FACTION_BUILDING_VARIANTS.undead_common` has only three distinct builders: `buildUndeadVilla`, `buildUndeadChapel`, and `buildUndeadShop`. `house`, `terraced`, `inn`, and `blacksmith` all reuse `buildUndeadVilla`; `watchtower` has no undead override and falls back to generic/default behavior.
- Current builders live inline in `FactionBuildingVariants.ts` and are not modular race-kit files. The new implementation should move undead into focused kit files and keep the dispatch table thin.
- Current undead walls use `buildUndeadTierGrid()` in `FactionBlockProfiles.ts`, a BlockKit occupancy-grid spire with pockmark decay, jagged crown, and runeglow. This was an improvement over older smooth cylinder tiers, but it still conflicts with the new doctrine for visible building surfaces: it is voxel-grid massing and collapses too many kinds to the same tower silhouette.
- Current villa includes a floating emissive `IcosahedronGeometry` orb and bare `BoxGeometry` slit windows. These are exactly the kinds of readable primitive stand-ins the doctrine forbids.
- Current chapel has headstones/fence concepts worth preserving, but its headstones are boxes, rib arches are simple cylinders, candles are spheres, and the building is a small spire behind props rather than a flagship mausoleum/necropolis chapel.
- Current shop has a useful idea — bazaar against a ruined wall stub — but uses bone-strut cylinders, a flat transparent cloth canopy, sphere lanterns, and a simple box counter. Rebuild it as a reliquary arcade with a sarcophagus/table-tomb counter and real lantern cages.
- Retain concept intent only: ashstone palette, cemetery props, decay, and a market wall-stub idea. Retire the live geometry approach for this race's final kit.
- `buildUndeadTierGrid`, `undeadRoofTopY`, and existing undead helper exports may remain only if other tests or territory props still use them; otherwise remove them during the dead-code task after new builders are wired.

## 8. Out of scope / deferred

- Natural spawning of `watchtower`: doctrine notes this is a cross-race settlement-generation gap. For this race, ensure Settlement Lab showcase includes watchtower; do not invent a one-off ward mapping.
- Full interior gameplay: the spec defines exterior forms and social meaning. Interior layouts for ossuary niches, crypt beds, or forge workstations can be future work.
- Fog, particle swarms, volumetric mist, ghost shaders, and heavy emissive VFX: explicitly out of scope because they would mask weak architecture.
- A full cemetery biome/terrain pass: use pavers, rails, graves, and lot skirts around buildings, but do not redesign roads, wards, terrain vegetation, or dead-tree placement here.
- Advanced skull/bone procedural sculpture: allowed only as small carved ornaments for this pass.
- New third-party procedural architecture libraries or CSG carving: doctrine rejects this path; use existing/shared kit modules.
- Settlement-wide `BatchedMesh` optimization can be consumed if built by earlier races. If not, it may be implemented as a shared-kit task, but undead visual correctness should not wait on global batching beyond keeping material merging sane.
