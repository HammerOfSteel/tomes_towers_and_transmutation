# Fae Buildings — Design Spec

Fae settlements should read as tiny inhabited fairy architecture: stump and fungal cottages, petal-roof shops, curled shingle towers, root-flare foundations, oversized glowing doors/windows, and dense handmade props. The organic silhouettes are allowed only because they are assembled from legible parts — ribs, bark strips, shingles, gills, mullions, plinths, vines, lantern frames — and then optionally deformed as a bounded assembly; no smooth blobs, no voxel caps, no flat circles, no dark boxes for openings.

**Status:** Draft — awaiting user approval before implementation.

---

## 1. Reference art inventory

### Repository and faction inputs

- Studio race id: `fae`.
- Runtime faction id: `fae`, via `mapStudioFactionToRuntimeFaction()` in `src/world/buildings/BuildingTypeMap.ts`.
- Reference folder inspected: `/Users/terrygoleman/Documents/GitHub/HammerOfSteel/tomes_towers_and_transmutation/concept_art/reference/buildings/fae/`.
- Current code state inspected: `FactionBuildingVariants.ts`, `FactionBlockProfiles.ts`, `FactionTerritoryProps.ts`, `StoneTower*` kit files, `LatticeDeform.ts`, `SettlementLabScene.ts`, `buildingToDungeonPlan.ts`, `BuildingDNA.ts`, and the existing Fae test block in `tests/world/FactionBuildingVariants.test.ts`.

### `house_2.jpeg`

What it shows:
- A tall storybook tower-house with an exaggerated curling conical roof.
- The roof dominates the building and is visibly made of layered, overlapping courses/scales/shingles rather than one smooth cone.
- Secondary smaller tower/mass breaks symmetry.
- Warm glowing arched openings are oversized relative to the wall body.
- Wall massing leans and bulges slightly, but readable trim, openings, and roof courses keep it architectural.

Design decisions taken from it:
- Fae roofs may curl dramatically, but the curl must be a `ShingleSurface`/tile-course construction on a curved directrix, with visible tile butts and eave thickness.
- Watchtowers and villas should use one main vertical mass plus an off-centre secondary turret or dormer.
- Windows and doors should be tall, warm, and over-scaled: roughly 30-45% of the facade width for the principal door/window group.
- Silhouette signatures: curled finials, crescent/petal roof caps, asymmetric side towers, and one lantern high on the mass.

### `house_3.webp`

What it shows:
- A small mushroom/stump hut, squat compared with `house_2`, with a broad cap roof.
- Cap surface reads as blue-green shingles/scales, not a bare mushroom dome.
- A tiny balcony/railing and hanging strings/banners give the miniature lived-in read.
- Oversized blue door and round/arched openings are playful and high-contrast.
- The base reads like a stump/fungal stem integrated with ground clutter.

Design decisions taken from it:
- Houses and inns should use broad mushroom-cap roofs, but cap geometry must be ribbed/shingled/gilled.
- Tiny balconies, railings, bunting/washing lines, bead strings, and hanging planters are not optional decoration; they carry the scale read.
- Door modules should be wider and shorter than human doors, but still fully constructed: planked leaf, arched/petal surround, threshold, straps, set-back glow.
- Blue/teal accent variants belong in the weight tables, even though the default code palette is pink/purple.

### `house_4.avif`

What it shows / inspection caveat:
- The file decodes as a 570×570 AVIF image. The available renderer/preview was less legible than the other local images, but the decoded image and metadata confirmed it is a dense saturated fairy-building reference, sourced from an Etsy image URL (`il_570xN.7174983099_hzp5.jpg`).
- The visible colour/edge passes suggest a compact fairytale building/scene with multiple saturated roof/wall colour zones and heavy foreground clutter rather than a plain single-volume object.

Design decisions taken from it:
- Use this as corroboration, not sole authority, for dense lower-edge ornament and saturated storybook colour variation.
- Do not derive unique structural forms from this file unless a future visual pass confirms them more clearly.
- Its ambiguity reinforces that the implementation must be validated in Settlement Lab screenshots, not trusted to unit tests alone.

### `house_5.jpeg`

What it shows:
- A vivid flower/petal fantasy house with pink/yellow palette, a lantern tower, crescent/ornamental finial, hanging lights, and wood braces.
- The roof/wall language is floral as much as fungal.
- Ornament is made of repeated readable pieces: petals, braces, rails, hanging lights, and trim.

Design decisions taken from it:
- Fae is not just “mushroom houses.” Floral/petal architecture is a second primary sub-archetype.
- Shops should prefer petal awnings, flower-box counters, and lantern strings.
- Chapels can use a petal/lattice canopy rather than only a toadstool ring.
- Crescent finials, hanging lanterns, and warm suspended lights belong in the shared prop module catalogue.

### `house_6.webp`

What it shows:
- A stump/root house with bark walls, root flare into the ground, moss/stone steps, tiny mushrooms, round glowing windows, and a small balcony.
- Ground contact is a major part of the design: the house grows from the terrain rather than intersecting it as a hard cylinder.
- The wall surface is bark-strip/ribbed, not smooth.

Design decisions taken from it:
- Fae ground contact must include root/moss flare: root toes, moss skirt, embedded stones, and tiny fungi clusters.
- Stump-wall modules need vertical bark strips/flutes with raised ridges and cracks, not one cylinder/lathe surface.
- Round windows are allowed if they satisfy the five-piece minimum: recessed circular reveal, proud petal/ring surround, sill/ledge, mullion/crossbar, set-back glow.
- Spiral stairs and balconies are appropriate for taller variants.

### `mushroom-fairy-house.html`

Recovered metadata:
- Sketchfab title: “Mushroom Fairy House.”
- Description/tags indicate a stylized mushroom fairy house/game prop with forest, mushroom, fairytale, glowing, stylized, and magic tags.
- The saved metadata includes a prop-scale budget around 16,165 polygons / 15,380 vertices.

Design decisions taken from it:
- A 10-16k triangle LOD0 budget is plausible for a hero fairy building, but common settlement buildings should stay closer to the doctrine’s 8-15k LOD0 building budget and rely on shared/batched details.
- “Game prop” scale supports the dense-prop approach: lanterns, vines, mushrooms, shutters, rails, and glowing openings should be geometry modules, not texture-only dressing.

### Validation/correction of the initial skim

The initial skim was mostly correct: the references do emphasize swooping tall roofs, curling conical silhouettes, storybook leaning/bulging massing, mushroom/toadstool forms, stump/root construction, tiny scale, oversized openings, and warm glow. The correction is that Fae architecture is **not only mushroom caps and stump cylinders**: `house_5.jpeg` makes floral/petal forms a first-class motif, and `house_3.webp`/`house_5.jpeg` show that props and suspended ornament are as important as the base mass. Also, every successful organic roof/cap in the references has surface articulation — shingles, scales, ribs, gills, braces, petals, rails — so smooth domes and featureless surfaces are explicitly disallowed by the art itself, not just by the doctrine.

---

## 2. Race design language

### 2.1 Core read

A Fae building should read as a tiny magical dwelling grown into a forest object and lovingly modified by hand. The silhouette can be impossible and whimsical, but the construction must be legible: if the form curls, the shingles curl with it; if the wall bulges, the bark strips and string courses follow; if the cap mushrooms outward, ribs/gills/shingles explain how it is built.

### 2.2 Design rules

1. **Tiny bodies, oversized apertures.** Wall bodies are small and compressed; principal doors/windows are intentionally large relative to mass. Doors commonly occupy 30-45% of a facade bay, matching `house_3.webp` and `house_6.webp`.
2. **Organic silhouette from assembled parts.** Leaning, swelling, and curling are applied after modules exist: block courses, bark strips, trims, openings, ribs, shingles, rails, props.
3. **Curled roofs are tile fields, not cones.** Tall conical or swept roofs use a curved `ShingleSurface` with discrete overlapping fish-scale/diamond tiles, eave thickness, verge trim, ridge/finial pieces, and 2-5° tile kick.
4. **Mushroom caps are ribbed structures, not sphere segments.** A cap is a radial frame: gill ribs below, radial cap ribs above, shingle/scales/petal courses between ribs, thick scalloped rim, spots as raised inlaid caps/spore plaques — never a bare `SphereGeometry`/lathe blob.
5. **Stumps use bark-strip construction.** Stump walls are made from vertical bark ribs, carved panels, cambium seams, knot-plates, root buttresses, and moss skirts. A smooth cylinder with bark texture is not enough.
6. **Five-piece openings always.** Every door/window uses a recess, proud surround, sill/ledge, internal division, and set-back dark/emissive glazing/door leaf. Doors add threshold, planks, and straps.
7. **Warm glow is behind structure.** Emissive materials appear on set-back glass panes, lantern panes, firefly motes, or spore insets; never as a flat glowing box standing in for a lantern/window.
8. **Ground contact is grown.** Every building has a root/moss flare, soil skirt, embedded stones, and tiny mushrooms/flowers hiding the transition into terrain.
9. **Prop density is structural.** Lanterns, vines, flower boxes, toadstool clusters, balconies, spiral stairs, laundry/bunting lines, and signs must be real modules with placement rules.
10. **Asymmetry is mandatory.** Off-centre doors, one larger window, one different roof curl, one side balcony, one tilted lantern, or one secondary turret on every building.

### 2.3 The central problem: whimsy without blobs

The hard Fae problem is that the reference art wants curving organic forms, but the doctrine bans blobs, smooth featureless surfaces, and visible voxel-grid organic masses. The solution is not to avoid organic silhouettes; it is to make the *construction logic* visible at every scale.

#### Rejected methods

- **Bare sphere/lathe mushroom caps:** even with a nice texture, a smooth dome is a blob. It has no visible gill structure, tile courses, rim thickness, or material assembly.
- **Voxel/block mushroom caps:** the current `buildFaeStalkGrid()` was an improvement over a cylinder + deformed half-sphere, but it is still an occupancy-grid blob for the visible cap/stalk mass. Under the new doctrine, that belongs to prototypes/LOD experiments, not final Fae building surfaces.
- **Primitive cone roof with texture:** `house_2.jpeg` has a curled cone silhouette, but the read comes from shingles/scales. A cone plus texture repeats the rejected roof failure.
- **Deforming a primitive first:** bending a cylinder or sphere makes a smoother blob. It does not create construction detail.

#### Accepted pipeline

1. **Build a correct modular building first.** Start with a footprint and mass grammar: wall rings/faces, floor bands, plinth/root skirt, opening sockets, roof support ribs, shingles, trim, props.
2. **Attach all depth-ladder features before deformation.** Windows, doors, frames, sills, mullions, string courses, bark strips, rails, lantern brackets, and cap ribs are present as separate parts at their intended offsets.
3. **Apply bounded assembly deformation.** A lattice/cage deformation may lean, bulge, or sweep the assembled structure, but only within limits that preserve recognisable parts: max lateral lean 0.18-0.35× footprint width, max wall bulge ±0.10 WU on houses/shops and ±0.18 WU on villas/inns, roof curl offset up to 0.55× roof radius. Deformation affects transforms/vertices of parts together so offsets remain consistent.
4. **Keep surfaces segmented.** If the silhouette curves, the shingles/courses/ribs follow the curve. The eye should see “many small fairy-made parts forming a curve,” not “a smoothed mesh.”
5. **Use directrix-based shingles for curled roofs.** A `CurvedShingleSurface` places shingle courses along a curved centreline/directrix; course normal/binormal frames orient each tile and preserve overlap. The roof can curl like `house_2.jpeg`, but the material stays legible.
6. **Use radial rib-and-gill caps for mushrooms.** A cap has 12-20 radial ribs, 3-7 circular/spiral shingle bands, underside gills, a thick scalloped rim, and optional raised spots/spore plaques. The cap volume is implied by the ribbed shell.

#### Reusing existing lattice work

Existing `src/world/LatticeDeform.ts` is a pure 2D bilinear utility: `bilinearDeform()` and `deformModule()` map AABB-fraction vertices into an irregular quad. Its design docs explicitly scoped it to standalone infrastructure with no live prop integration and flagged 3D/trilinear whole-module deformation as future work. For Fae, reuse the concept and conventions but extend it as a new shared building-kit primitive, e.g. `[SHARED KIT] AssemblyLatticeDeform`:

- Input: an assembled `THREE.Group`, a local bounding box, and a deformation profile (`lean`, `belly`, `curl`, `twist`, `rootSpread`).
- Operation: walk meshes after modules are assembled; for each vertex, compute normalised `(fx, fy, fz)` and apply bounded displacement. For instanced/detail parts, transform sockets/control points before final placement rather than deforming each tile after batching.
- Preservation rules: maintain named depth ladder offsets, do not collapse apertures below minimum sizes, keep floor/string-course ordering monotonic, recompute normals/UVs, and keep all output finite.
- Tests: identity profile is byte-equivalent; finite output; displacement clamps; five-piece opening offsets survive deformation; deformed shingles remain ordered by course.

This should be marked `[SHARED KIT]` because elven treehouses, orcish huts, undead ruins, and slime/fungal forms may all need “assembled first, then relaxed” deformation without creating blobs.

---

## 3. Real-world & game-dev basis

### 3.1 Real-world basis

- **Wood shingles and fish-scale tiles:** Curved/fanciful roofs in storybook cottages still read as roofs because they are tiled. Use overlapping shingle courses with visible butts, not a smooth surface.
- **Mushroom anatomy:** A real cap is not visually featureless. The underside has radiating gills; the cap edge has a rim; the top can have patches/scales. These map directly to low-poly ribs, gill fins, scalloped rim pieces, and shingle/scale fields.
- **Stump/root construction:** Trees meet ground with root buttresses, flares, moss, stones, and bark ridges. `house_6.webp` makes this a core silhouette, so every stump variant needs root flare and bark strips.
- **Willow/branch lattice:** Fae chapel canopies and balconies should use woven/helical branch ribs, matching the research report’s lattice/vine dome approach.
- **Small-cottage ornament:** Flower boxes, shutters, washing lines, lantern hooks, tiny stairs, rails, and hanging signs establish inhabitance and scale; they are not surface decals.

### 3.2 Procedural/generative basis

- Use the doctrine’s shared kit rather than bespoke per-race primitives: `DepthLadder`, `OpeningParts`, `GothicArch`, `VoussoirArch`, `StringCourse`, `FacadeGrammar`, `ShingleSurface`, `MassComposer`, and `BatchedDetail`.
- Use split grammar for facades so bay modules retain fixed dimensions on 3 WU, 4 WU, 5 WU, 7 WU, and 8 WU footprints. Leftover space goes into filler wall panels, not scaled windows.
- Use module swapping with weights: cap roof vs petal roof vs curled cone, stump wall vs plaster/fungal stalk, balcony vs no balcony, lantern cluster vs vine curtain.
- Use `BatchedMesh` or shared instancing for repeated small details: shingles, petals, leaves, tiny mushrooms, lantern panes, rails, balusters.
- Avoid CSG for openings; use occupancy/socket planning and assembled reveals. CSG cuts would produce smooth planar cuts through a wall, exactly the rejected look.

### 3.3 Scale and performance target

- Common LOD0 buildings: 8-12k triangles, 2-4 material buckets.
- Hero/large variants (`villa`, `chapel`, `watchtower`): up to 15k triangles at LOD0.
- Roof shingles/prop foliage should be settlement-wide batched where practical; otherwise merge per material per building.
- Small firefly/spore motes may use simple low-segment spheres as magical particles/ornaments, but never as building features, windows, doors, roof masses, or lantern bodies.

---

## 4. Per-kind blueprint

Shared constants used below:
- `FAE_STOREY_HEIGHT`: 2.35 WU for most houses/shops/terraces, 2.55 WU for inns/villas, 2.15 WU for watchtower stacked mini-storeys.
- Door leaf plane: depth-ladder `-0.20 WU`; reveal `-0.12 WU`; wall face `0.00`; frame/surround `+0.04`; sill/hood/string course `+0.08`; root/buttress face `+0.12` to `+0.30` depending on size.
- Principal window glazing: dark green/amber/purple, rough, slightly emissive, never transparent.
- Default arch character: fae lancet/petal arch, `archRatio` about `1.45-1.75`; round oculi permitted with cross/twig muntins.

### 4.1 `house` — “Glowcap Cottage”

| Field | Blueprint |
|---|---|
| Footprint | `4 × 3 WU` (`getFootprint('house','small')`). |
| Floors / height | 1 floor, `2.35 WU` wall body; roof/cap adds `1.4-2.2 WU`; total visual height `3.8-4.8 WU`. |
| Massing | One small stump/fungal body, 5-8° seeded lean, one off-centre porch nub (`0.7 × 0.6 WU`) or tiny side alcove. |
| Wall system | `FaeWallSurface`: bark-strip or fungal-plaster panels over a low block/plinth course. 8-12 vertical bark ribs, each `0.04-0.09 WU` proud, jittered. |
| Opening schedule | Front: 1 oversized petal-lancet door (`1.05 × 1.55 WU`) at `-0.20` leaf, `-0.12` reveal, `+0.04` petal surround, `+0.08` threshold/sill lip. Front: 1 round or petal window (`0.55-0.70 WU`) with twig crossbar. Side: 0-1 tiny oculus, never on both sides symmetrically. |
| Roof archetype | Broad ribbed mushroom cap, radius overhang `0.45-0.65 WU`, 12-16 gill ribs below, 4-5 fish-scale shingle bands above, thick scalloped rim. |
| Ornament | 1 lantern hook near door; 1 flower box under the front window; 2-5 tiny mushrooms in the ground skirt; optional curled chimney sprout. |
| Ground contact | Root flare skirt with 4-7 root toes, moss pads, embedded stones; skirt extends `0.25-0.45 WU` beyond footprint. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Wall material | 45% bark-stump, 35% fungal plaster, 20% root-ball woven wall. |
| Roof type | 60% mushroom cap, 25% curled shingle cone, 15% petal cup. |
| Door placement | 70% off-centre left/right, 20% centred with asymmetric porch, 10% side-facing. |
| Window type | 45% petal lancet, 35% round oculus, 20% split twig square. |
| Prop emphasis | 35% lantern, 25% vines, 20% flower boxes, 20% toadstool cluster. |
| Deformation profile | 45% gentle lean, 30% belly bulge, 15% curled roof only, 10% almost straight. |

### 4.2 `terraced` — “Pixie Row House”

| Field | Blueprint |
|---|---|
| Footprint | `3 × 4 WU` (`KIND_FOOTPRINT.terraced`). |
| Floors / height | 2 mini-storeys, `2.2 WU` each; second storey may jetty `0.18-0.28 WU`; total with roof `5.2-6.2 WU`. |
| Massing | Narrow row segment with party walls left/right. Front leans individually; roof curl alternates by seed so a terrace row forms a wavy skyline. |
| Wall system | Front/back built from vertical bark boards or tiny plaster panels; side walls are simpler shared walls with no windows. String course at floor split. |
| Opening schedule | Ground front: 1 narrow arched/planked door (`0.80 × 1.45 WU`), threshold `+0.08`, straps on leaf. Upper front: 1 oversized window (`0.75 × 0.85 WU`) with sill `+0.08`, twig mullion. Back: optional tiny oculus if not party edge. |
| Roof archetype | Tall narrow swept shingle roof on curved directrix; ridge curls forward or sideways, with 5-7 courses and visible eave butts. |
| Ornament | Hanging washing line/bunting across front, one bracket lantern, tiny balcony rail on 35% of seeds. |
| Ground contact | Continuous moss/plinth strip along front; root toes do not invade party-wall sides. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Front module | 40% door-left/window-right, 40% door-right/window-left, 20% stacked central door/window. |
| Roof curl | 35% curl-left, 35% curl-right, 20% forward hook, 10% low cap. |
| Wall finish | 50% bark boards, 30% pastel plaster, 20% woven twig lattice. |
| Upper feature | 35% balcony rail, 25% flower box, 20% shutter pair, 20% hanging sign/cloth. |
| Deformation | 50% slight lean, 25% waist pinch, 15% roof-only curl, 10% straight. |

### 4.3 `villa` — “Fae Court House”

| Field | Blueprint |
|---|---|
| Footprint | `7 × 5 WU` (`KIND_FOOTPRINT.villa`). |
| Floors / height | 2 floors at `2.55 WU`; roof/caps add `2.4-3.5 WU`; total `7.5-9.2 WU`. |
| Massing | Main stump/fungal hall plus 1-2 smaller attached turret/cap volumes. L/T composition from `MassComposer`; never a single centered mushroom. |
| Wall system | Lower stump/root plinth with bark-strip panels; upper fairy plaster or lighter fungal rind; floor string course and proud corner/root buttresses. |
| Opening schedule | Main front: 1 grand arched door (`1.25 × 1.85 WU`) with petal/voussoir surround, threshold, plank straps. Ground: 2-3 windows, at least one different type. Upper: 2-4 smaller glowing windows and 1 balcony door/window. All windows have sills, mullions/crossbars, set-back glow. |
| Roof archetype | 55% broad main mushroom cap with shingled/ribbed surface; 30% curled conical tower roof on side turret; 15% petal crown roof. Multiple roofs must have distinct heights. |
| Ornament | Balcony with 5-9 balusters, lantern strings, flower boxes, vines draped from cap rim, tiny stairs/stepping stones, 3-6 small toadstools. |
| Ground contact | Large root flare `0.4-0.7 WU`, moss ring, stones and small retaining roots wrapping secondary masses. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Plan composition | 45% main hall + side turret, 30% L-plan with porch, 15% twin cap cottages bridged, 10% central court stump. |
| Primary roof | 50% mushroom cap, 25% curled cone, 15% petal crown, 10% mixed cap/cone. |
| Wall finish | 40% bark lower + plaster upper, 30% fungal rind, 20% carved stump, 10% woven branch gallery. |
| Landmark prop | 30% balcony, 25% lantern crown, 20% spiral stair, 15% vine curtain, 10% crescent finial. |
| Deformation | 35% leaning stack, 30% belly bulge, 20% swept roof, 15% root-spread asymmetry. |

### 4.4 `inn` — “Firefly Inn”

| Field | Blueprint |
|---|---|
| Footprint | `7 × 5 WU` for large inn (`SIZE_FOOTPRINT.large`). |
| Floors / height | 2 floors at `2.55 WU`; roof/cap adds `2.0-3.0 WU`; total `7.0-8.3 WU`. |
| Massing | Wide welcoming mushroom/stump lodge with protruding porch and one off-centre stair/balcony. Wider than house, less formal than villa. |
| Wall system | Bark-strip lower wall, plaster/fungal upper panels, heavy string course between floors, porch posts with root-like flare. |
| Opening schedule | Front: 1 double fairy door (`1.45 × 1.70 WU`) with two leaves, straps, threshold. Ground: 2 warm windows flanking porch. Upper: 3-4 small windows, one balcony/window combo. Side: kitchen/service oculus. |
| Roof archetype | Wide low mushroom cap with underside gills visible at eaves, or split cap plus curled dormer. Eave overhang `0.55-0.75 WU`. |
| Ornament | Hanging sign built as bracket + carved board + trim, lantern pair, rail/balcony, smoke curl chimney, flower boxes, 4-8 firefly motes around sign/porch. |
| Ground contact | Large moss/stone step apron; root toes frame the entry path. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Entrance | 45% central double door, 35% off-centre porch, 20% corner porch. |
| Roof | 55% wide cap, 25% split cap+dormer, 15% curled shingle cone, 5% petal canopy. |
| Sign style | 40% hanging leaf board, 30% carved mushroom plank, 20% lantern sign, 10% banner line. |
| Upper facade | 35% balcony, 30% three-window row, 20% mixed oculus/lancet, 15% shuttered asymmetric. |
| Deformation | 40% low belly, 25% leaning porch, 20% roof sweep, 15% straight/sturdy. |

### 4.5 `shop` — “Petal Market Stall”

| Field | Blueprint |
|---|---|
| Footprint | `4 × 3 WU` small shop. |
| Floors / height | 1 floor, `2.25 WU` wall/body; awning/cap total `3.4-4.2 WU`. |
| Massing | Compact storefront with open counter bay, petal awning/cap, side storage stump, no flat fabric plane. |
| Wall system | Low stump/plaster wall with front counter, bark braces, and tiny shelf modules. |
| Opening schedule | Front: 1 service window/counter bay (`1.3-1.8 WU` wide) with recessed dark interior plane, proud frame, sill/counter slab `+0.08`, mullion/shelf divider. Door may be side/back (`0.75 × 1.35 WU`). 1 small upper oculus or sign niche. |
| Roof archetype | Petal awning: 5-9 overlapping thick petal plates with ribs, or shallow shingled mushroom cap; never `CircleGeometry` petals. |
| Ornament | Display shelves, hanging lanterns, herb bundles, tiny crates/baskets built from slats, flower boxes, bunting string. |
| Ground contact | Moss apron and stepping stones for customer path. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Storefront type | 45% open counter, 25% half-door counter, 20% side-door stall, 10% closed kiosk. |
| Roof/awning | 50% petal awning, 30% small mushroom cap, 15% curled leaf roof, 5% mixed petals+shingles. |
| Merchandise prop | 30% herbs, 25% glowing bottles, 20% flowers, 15% scrolls/books, 10% fruit/mushrooms. |
| Sign | 40% hanging leaf board, 25% carved cap plaque, 20% lantern cluster, 15% banner. |
| Deformation | 45% counter lean, 25% roof curl, 20% asym side storage, 10% straight. |

### 4.6 `blacksmith` — “Glowforge Hollow”

| Field | Blueprint |
|---|---|
| Footprint | `5 × 4 WU` (`KIND_FOOTPRINT.blacksmith`). |
| Floors / height | 1 tall workspace, `2.75 WU` clear height; chimney/forge cap to `5.5-6.5 WU`. |
| Massing | Open-front stump/root forge with petal/leaf shed roof and one heavy chimney stump. More rugged than other Fae buildings but still whimsical. |
| Wall system | Half-height bark/stone plinth, root posts, timber braces, soot-darkened fungal plaster panels near forge. |
| Opening schedule | Front mostly open but framed by two root posts at `+0.30`, counter/anvil bay with lintel. Side service door (`0.9 × 1.45 WU`) five-piece. 1-2 round glowing ventilation oculi with twig crossbars. Forge mouth is an opening module: recess, proud stone/fired-clay surround, hearth sill, grate bars, set-back ember plane. |
| Roof archetype | Asymmetric leaf/petal shed roof with overlapping thick leaves/shingles; 0.5 WU eave on work side; curled smoke vent cap. |
| Ornament | Anvil/block table, bellows, tool rack, ember lanterns, horseshoe/leaf charms, water bucket built from staves/bands. |
| Ground contact | Fired-stone/moss apron, charcoal/ash patches as low geometry, root posts dug into plinth stones. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Forge placement | 45% rear-center, 30% rear-left, 25% rear-right. |
| Roof | 50% leaf shed, 25% mushroom half-cap, 15% petal canopy, 10% curled cone vent. |
| Chimney | 40% hollow stump, 30% braided root flue, 20% clay mushroom stack, 10% stone mini-stack. |
| Props | 30% tools, 25% bellows, 20% lanterns, 15% water/ash, 10% charms. |
| Deformation | 35% roof sag, 25% chimney lean, 20% root-spread, 20% sturdy/straight. |

### 4.7 `chapel` — “Faerie Ring Chapel”

| Field | Blueprint |
|---|---|
| Footprint | `4 × 8 WU` (`KIND_FOOTPRINT.chapel`). |
| Floors / height | 1 high sacred space, `2.8 WU` wall/column height; canopy/lantern spire to `6.5-7.5 WU`. |
| Massing | Long oval/ring nave made from 8-12 stump/toadstool columns with woven branch/lattice canopy; altar/root glow off-centre at rear. Should read as a chapel, not just a decorative torus. |
| Wall system | Low moss/stone plinth ring, short carved wall panels between columns, root buttresses, branch lattice ribs overhead. |
| Opening schedule | Front: ritual arch/door (`1.1 × 1.75 WU`) in a root frame. Side: 4-6 lancet/petal windows or open tracery panels between columns; each has sill/ledge, twig mullion/tracery, set-back glow or negative opening with frame. Rear: round rose/petal oculus above altar. |
| Roof archetype | `[SHARED KIT] LatticeDome`/branch canopy with 2 helical rib families, petal/shingle infill patches, flower/crescent finial. Alternative: elongated mushroom cap over nave with radial/longitudinal ribs. |
| Ornament | Hanging lanterns, firefly ring, flower garlands, tiny benches/stumps, altar stone/root, vines. The current glowing torus is replaced by a ring of stones/moss/lanterns. |
| Ground contact | Sacred fairy-ring skirt: moss ring, stones, roots, small mushrooms placed around but not forming the whole building. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Sacred form | 45% lattice canopy nave, 30% elongated mushroom chapel, 15% petal bower, 10% stump shrine with side aisle. |
| Column count | 35% 8, 35% 10, 20% 12, 10% irregular 9/11. |
| Main opening | 45% petal lancet door, 25% branch arch, 20% round portal with crossbar, 10% open framed entry. |
| Finial | 35% flower bud, 25% crescent, 20% lantern crown, 20% curled leaf. |
| Deformation | 35% canopy sway, 25% oval skew, 20% column height jitter, 20% straight ceremonial. |

### 4.8 `watchtower` — “Moonmoth Lookout”

| Field | Blueprint |
|---|---|
| Footprint | `2 × 2 WU` (`KIND_FOOTPRINT.watchtower`). |
| Floors / height | 3 mini-storeys at `2.15 WU`; lookout/balcony/roof to `7.5-8.8 WU`. |
| Massing | Tall narrow leaning stalk/stump tower with curled shingle cone or lantern cap, one spiral stair/balcony wrapping 120-220° around it. |
| Wall system | Octagonal or rounded-square bark-strip shaft using shared wall/face math, with ring string courses every storey and tiny root buttresses at base. |
| Opening schedule | Ground: tiny arched door (`0.65 × 1.25 WU`). Storeys: 2-3 narrow glowing slit/lancet windows, rotated around shaft; each with reveal/surround/sill/mullion/glow. Top: lookout balcony opening with rail. |
| Roof archetype | Tall curled conical `CurvedShingleSurface`, 7-10 courses, fish-scale tiles, crescent/flower finial, optional hanging lantern under curl. |
| Ornament | Spiral stair treads/bracket posts, balcony rail, banner/flag, moth-wing shutter pair, lantern cage. |
| Ground contact | Strong root flare because narrow footprint needs visual anchoring; 5-8 roots extend `0.4-0.8 WU`. |

Procedural variation axes:

| Axis | Weights |
|---|---|
| Shaft profile | 40% leaning stalk, 30% waisted tower, 20% tiered cap rings, 10% straight needle. |
| Roof curl | 35% forward, 25% left, 25% right, 15% double curl. |
| Lookout | 40% wrap balcony, 30% tiny crow's nest, 20% lantern room, 10% banner-only. |
| Wall finish | 50% bark strips, 25% fungal rind, 15% woven twig, 10% moonstone inlays. |
| Deformation | 45% lean, 25% twist, 20% belly/waist, 10% straight. |

---

## 5. Kit modules consumed

### Doctrine Tier 1 / Tier 2 consumed

- `DepthLadder.ts`: required for every opening, roof edge, prop bracket, plinth, and ground-contact piece.
- `OpeningParts.ts`: mandatory; Fae uses petal surrounds and twig mullions, but still consumes the shared five-piece model.
- `GothicArch.ts` / `VoussoirArch.ts`: petal/lancet doors and windows use high `archRatio`; root/stone chapels use block/voussoir frames.
- `StringCourse.ts`: floor bands, plinths, cap rim bands, and moss/soil skirts.
- `Bevels.ts`: all frames, petals, shingles, signs, rails, and lantern frames need bevel/creased normal treatment.
- `FacadeGrammar.ts`: needed for fixed-size doors/windows on footprints from 2 WU to 8 WU without scaling mouldings.
- `MassComposer.ts`: needed for villa/inn multi-mass L/T/asymmetric layouts.
- `ShingleSurface.ts`: required for curled cone roofs, petal awnings, and mushroom cap scale fields.
- `BatchedDetail.ts`: useful for shingles, tiny mushrooms, leaves, petals, fireflies, lantern panes, and vines.

### Fae-driven shared-kit additions

Mark these `[SHARED KIT]` in implementation planning:

1. **`AssemblyLatticeDeform`** — extend the existing lattice-deform idea from 2D point deformation to bounded 3D assembly deformation. Build first, deform second. Race-agnostic; Fae is the first strong consumer.
2. **`CurvedShingleSurface`** — shingle courses along a curved/swept directrix. Needed for Fae curled roofs and reusable for elven/vampire/orcish variants.
3. **`RadialMushroomCap`** — cap ribs, underside gills, scalloped rim, scale/shingle infill, raised spots/spore plaques. Needed by Fae and likely slime/fungal variants.
4. **`RootFlareSkirt`** — root toes + moss skirt + embedded stones around arbitrary footprint curves. Needed by Fae, elven, orcish, undead ruins.
5. **`DetailPropParts`** — real lantern, flower box, vine/tendril, toadstool cluster, washing/bunting line, balcony/rail pieces; parameterised and socketed.

### Race-specific modules

- `FaeBuildingPalette.ts`: wall/roof/trim/emissive material recipes without cloned-per-tile variation.
- `FaeOpeningStyles.ts`: petal lancet, round oculus, moonmoth slit, shop counter bay, forge mouth; all wrappers around shared opening parts.
- `FaeWallSurface.ts`: bark strip, fungal plaster/rind, woven twig panels using shared wall/face placement.
- `FaeRoofs.ts`: adapters selecting mushroom cap, petal canopy, curled shingle cone, leaf shed, lattice chapel canopy.
- `FaePropPlacer.ts`: deterministic socket/weight rules for dense ornaments.
- `FaeBuildingKit.ts`: kind dispatch builders for the canonical 8 roster.

---

## 6. Quality-bar compliance

| Doctrine rule | Fae compliance |
|---|---|
| Rule 1 — depth ladder | All facade/prop offsets use named ladder constants. Petal frames `+0.04`, sills/hoods/string courses `+0.08`, root/buttress faces `+0.12/+0.30`, reveals `-0.12`, glass/door leaves `-0.20`. Add tests for no near-coplanar opening parts. |
| Rule 2 — five-piece openings | Every door/window/counter/forge mouth has recess, proud surround, sill/ledge/threshold, at least one mullion/transom/bar, and set-back dark/emissive plane. Doors add planks and straps. |
| Rule 3 — no banned primitives | No bare `BoxGeometry`/`SphereGeometry`/`CylinderGeometry` as a readable feature. Boxes may only be internal low-level pieces after bevel/trim/context, named as part of a composite module. No voxel-grid caps/stalks for final visible buildings. |
| Rule 4 — variety by module swapping | Every kind has weighted module choices. Windows/doors are fixed-size modules fitted by `FacadeGrammar`; leftover goes to filler panels/string courses, not scaled openings. |
| Rule 5 — silhouette | Every kind has roof curl/cap/gills, finial/lantern/chimney/balcony/stair/banner variation. Clean rectangular skylines are forbidden. |
| Rule 6 — ground contact | Every kind gets root/moss flare, plinth/skirt, stones, or step apron. Stump/root buildings never intersect terrain as hard cylinders. |
| Rule 7 — asymmetry | Off-centre openings, side turrets, one different window, uneven roof curls, unilateral balconies/lanterns, or asymmetric prop clusters are mandatory. |

Additional Fae-specific checks:
- Curves must preserve visible segmentation. Deformation with no ribs/shingles/trims is a failure.
- Prop density must not mask missing architecture: a building must still pass the opening/roof/wall rules with props hidden.
- Emissive surfaces must be set back inside panes or lanterns; glow cannot be the geometry explanation.

---

## 7. Current-state delta

### What exists today

- `FACTION_BUILDING_VARIANTS.fae` currently provides bespoke `villa`, `chapel`, and `shop` builders.
- `house`, `terraced`, `inn`, and `blacksmith` currently alias `buildFaeVilla`, so five generated ward kinds collapse to one visual family.
- No Fae `watchtower`/`tower` override exists; watchtower falls back to generic/shared shape unless Settlement Lab is later forced differently.
- `buildFaeStalkGrid()` in `FactionBlockProfiles.ts` creates a block-grid toadstool/stalk with flared cap and carved circular portal.
- `buildFaeVilla()` adds block-built satellite toadstools, gill boxes, and sphere fireflies.
- `buildFaeChapel()` is a ring of small block-built toadstools plus a glowing torus.
- `buildFaeShop()` is a small block-built mushroom plus flat circle petal decorations and sphere fireflies.
- Existing tests explicitly praise this as better than “cylinder + deformed sphere,” and check gill boxes, CircleGeometry petals, and SphereGeometry fireflies.

### What must change

- The block-grid toadstool implementation is no longer sufficient for final building surfaces. It replaced one bad primitive with a voxel organic mass, but the new doctrine bans visible voxel-grid blobs for caps/canopies. Retire it for building-scale architecture.
- The circular portal gap is not a five-piece opening. Replace with built petal/lancet/round openings with recess, frame, sill, mullion/crossbar, set-back glow, threshold/planks/straps for doors.
- The chapel’s glowing torus must be replaced by a constructed fairy-ring: stones/moss/root ring, columns, lanterns, lattice canopy, altar pieces.
- Shop petals currently made from flat `CircleGeometry` must become thickened/bevelled petal plates with ribs and returns.
- Firefly/spore motes may remain as magical particles, but they cannot stand in for lantern/window/architectural features.
- The Fae registry must cover all 8 canonical kinds with distinct documented assemblies or variants, not aliases.
- Settlement Lab must show all 8 Fae kinds together in “Play in 3D,” including `watchtower`, matching the acceptance gate.

### What can be retained conceptually

- Mushroom/fairy-house theme.
- Gill ribs, firefly/spore accents, petal motifs, satellite tiny mushrooms, and warm glow — rebuilt as compliant modules.
- Deterministic `mulberry32` seed style and dynamic use of `getFootprint(dna.buildingKind, dna.size)`.
- Existing material palette direction (`fae` pink/purple trim) plus added teal/yellow/warm variants from references.

---

## 8. Out of scope / deferred

- Natural settlement spawning for `watchtower`/`tower`. The doctrine notes this is a cross-race reachability gap; this plan only uses Settlement Lab showcase override.
- Full interiors, interactable shops/inns/chapels, NPC navigation, and collision refinement beyond current exterior building collider conventions.
- Rebuilding `FactionTerritoryProps.ts` fae mushroom scatter props. They are visible and should eventually be upgraded to `RadialMushroomCap`, but this race-building scope prioritises settlement buildings.
- New texture painting or authored external models. This spec assumes procedural three.js geometry and existing material/texture helpers.
- Advanced LOD streaming/BatchedMesh pooling if a prior shared-kit race has not implemented it yet; per-building merging is acceptable for first implementation if budgets pass.
- Animation of vines, lantern sway, smoke, and fireflies. Static geometry/glow is enough for acceptance.
