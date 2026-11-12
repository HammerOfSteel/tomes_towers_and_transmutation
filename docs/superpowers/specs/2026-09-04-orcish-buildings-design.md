# Orcish Buildings — Design Spec

Orcish buildings should read as portable war-camp architecture made permanent by conquest: lashed timber, stretched hide, red awnings, trophy bones, patched salvage, and crude but purposeful metalwork. The central technical decision is to stop treating orcish walls as masonry or voxel mass and instead apply the praised block-course discipline to a new material system: visible individual logs, ribs, lashings, and hide panels on the same depth ladder as the stone kit.

**Status:** Draft — awaiting user approval before implementation.

## 1. Reference art inventory

**Reference set warning:** this race has a thin reference set: only 3 files, and one of them is an HTML product page rather than a local image. That is much less visual evidence than the richer race folders, so the design below uses the two local images as primary drivers and explicitly supplements them with real-world nomadic/semi-nomadic construction and RTS orc-faction precedent in section 3. The folder is named `orc`, but the studio/runtime faction is `orcish`; `mapStudioFactionToRuntimeFaction('orcish')` returns runtime `Faction` value `'orcish'` in `src/world/buildings/BuildingTypeMap.ts`.

### `3d-print-orc-camp-buildings-194276.html`

- **Recovered metadata:** `<title>` is `3D Printable Orc Camp - Buildings by Makers Anvil`; `<h1>` is `Orc Camp - Buildings`; description says the set builds **two houses, one small and one big, a watchtower, and assets**. The saved page exposes `og:image` as `720X720-mmf-orc-camp-buildings-render.jpg`, but the local deliverable is HTML, not an image.
- **What it contributes:** the race should have a coherent camp-kit vocabulary, not one-off special buildings. The presence of small house, big house, watchtower, and asset pieces validates reusing the same timber/hide/lashing modules across `house`, `villa`, and `watchtower`, with kind-specific silhouettes and props layered on top.
- **Design decisions driven by it:**
  - Canonical residential size ladder: small house = `house`; big house = `villa`/`inn`; watchtower = separate vertical kit.
  - Modular assembly discipline: clips/parts in the product description map cleanly to `ModuleSocket`/`FacadeGrammar` rather than random free scatter.
  - Asset pieces are treated as socketed props (spoils, racks, signs, bedrolls), not primary architecture.

### `Orc-Settlement-3D-Low-Poly-Models2.webp` (1440×960)

- **Observed content:** a broad low-poly settlement kit: squat faceted buildings with tan pyramidal or hipped caps, dark recessed openings, red fabric awnings, banner cloth, pole supports, bone/tusk finials on corners and roof tips, a red-striped tent, a stockade/gate segment, weapon racks, stools/cots, and small shrine/trophy props.
- **What it contributes:** the image proves the style is not “random junk.” It is crude but organized: every awning has posts, every roof has a ridge/cap, every silhouette has tusks/spikes, and red cloth is used deliberately as a faction signal.
- **Design decisions driven by it:**
  - Use **red hide/cloth awnings** as high-value accents on `shop`, `inn`, and `blacksmith`.
  - Use **bone/tusk finials** at roof corners, ridge peaks, and watchtower platform corners.
  - Use **heavy posts with pale spike caps** for porches and tower supports.
  - Treat the stockade/gate as evidence for the settlement-level palette, but defer the perimeter palisade itself (section 8).
  - Keep dark openings recessed and framed; do not use black rectangles.

### `buildings-orc-rts-buildings-low-poly-14_800x.webp` (800×533)

- **Observed content:** a flagship orcish forge/smelter: rough stone slab base, dark arched doorway with pale tusk/stone surround, small tan hide-roof huts behind, a huge riveted metal furnace/chimney mass on the right, open work surfaces/troughs, and blue/black binding bands on protruding stones or logs.
- **What it contributes:** `blacksmith` must be a hero building, not a villa clone. The dominant read is a working forge with a tall metal stack, not a domestic hut.
- **Design decisions driven by it:**
  - `blacksmith` gets the tallest non-watchtower silhouette via a riveted metal chimney/furnace.
  - Use rough stone only where it belongs: plinth, forge pad, hearth arch, and furnace base. Do not turn the whole race into masonry.
  - Use pale tusk/bone arch stones around the forge opening.
  - Add small hide domes/ribbed shelter caps as supporting volumes behind/beside the forge.

## 2. Race design language

1. **Material hierarchy:** primary structure is lashed timber + stretched hide; stone is secondary and local (plinths, hearths, forge pads, thresholds), metal is tertiary but bold (straps, riveted plates, chimney). This directly confronts the fact that orcish least fits the existing masonry block-course kit.
2. **Block-course discipline, different material:** the praised masonry wall works because it is made of discrete, readable units. Orcish walls must do the same with logs: each log is a tapered member, standing proud of neighbours, with end-grain caps, staggered seams, and visible lash bands. No smooth “brown wall” and no BlockKit voxel body for visible facades.
3. **Frame first, skin second:** every hide wall or roof starts with visible ribs/posts at real spacing; the hide panel is stretched over them and sags slightly between ribs. A smooth cone/dome without ribs is a banned blob.
4. **Assembled from salvage and spoils:** captured shields, mismatched boards, repaired hide patches, enemy banners, blade racks, and trophy skulls appear through named socket/module swaps with weights. They are not random scatter.
5. **Squat massing with aggressive skyline:** most buildings are low and broad, but they break silhouette with tusks, spike caps, crooked poles, smoke vents, banners, and chimney masses. `inn`, `blacksmith`, and `watchtower` are the major silhouettes.
6. **Openings are rough but complete:** use squat Romanesque/rough arches (`archRatio ≈ 0.5`) or hide-flap rectangular openings, always with the five-piece minimum: recess, proud surround/lashing frame, sill/threshold, internal division/crossbar, set-back dark door/glazing/hide.
7. **Palette:** earth brown (`#6a5838`), dark roof hide (`#3a2818`), ochre trim (`#8a6840`), dark door (`#2a1810`), bone (`#d8c9a0`), dull iron (`#5a5650`), and reference-art red cloth (`#9b1515`) as the faction accent.
8. **Purposeful roughness:** jitter is small and structural: crooked posts ±1.5°, log length ±3%, hide sag 0.04–0.10 WU, mismatched material patches selected in contiguous grammar runs. Do not deform whole meshes into noise.
9. **Ground contact:** all buildings sit on dirt pads, rubble aprons, rough plinth logs, and trampled grass/ash skirts. No flat-bottom floating huts.
10. **No perfect symmetry:** doors shift off-centre, one side has a lean-to, one roof corner has a trophy pole, one hide panel is patched.

## 3. Real-world & game-dev basis

### Real-world construction basis

- **Yurts/gers:** real yurts are not smooth cones. They have a door frame, lattice wall, roof ribs/rafters, a crown/compression ring, and a tension band that keeps the wall from spreading. The cover is felt/hide over a frame. This maps directly to `HidePanel`/`StretchedSkin`: ribs first, skin second, with a crown ring and visible lash/tension bands.
- **Longhouses:** traditional longhouses are communal timber structures with repeated posts, longitudinal hearths, bark/leaf/hide coverings, and a strong central ridge. This basis supports `inn` as a mead hall/longhouse and `villa` as a warlord hall rather than a “noble manor.”
- **Palisades/stockades:** palisades are close-set vertical trunks/stakes, often sharpened and earth-set, useful for quick defensive enclosures. The reference image includes a gate/stockade piece, but a settlement perimeter is a generation feature, not one building mesh; defer it.
- **Lashings:** real lashing joins poles by wraps and fraps, tightening members without metal joinery. This is the key orcish joint vocabulary: visible rope/hide bands at post-beam intersections, roof-rib bases, log-course seams, and scaffolds.
- **Hide and timber behaviour:** hides sag between ribs and get patched; logs taper and show end grain; smoke exits through vents/crowns. These physical behaviours are the antidote to blobs.

### Game/genre basis

- **Warcraft orcs:** Warcraft III’s Great Hall is a core clan stronghold that processes lumber/gold and explicitly accumulates pilfered raw materials; Burrows are both farm/storage and fortified bunkers. The procedural equivalent is dual-purpose architecture: homes look defensible, stores look looted, halls look like command centers.
- **Warhammer/Total War greenskins:** the genre reads orcs as tribal raiders with crude fortifications, trophies, spikes, shields, and improvised industry. Exaggerated silhouettes matter more than refined ornament.
- **RTS readability:** RTS orc factions use large signals visible from a high camera: red banners, spikes, tusks, huge chimneys, watch platforms, and dark door mouths. Tiny knobs and bolts are wasted; use larger straps, plates, and silhouette pieces.

### Procedural approach evaluation

- **`LashedTimber` as `[SHARED KIT]` — recommended.** This is the right equivalent to `buildWallSurfaceBlocks()`: discrete modelled members in courses/bays, depth ladder offsets, running stagger, material continuity, end-grain caps, and per-member jitter. It preserves the user-praised “built from pieces” quality while changing material language from cut stone to logs.
- **`HidePanel` / `StretchedSkin` as `[SHARED KIT]` — required.** It must require a frame definition before skin emission. Ribs/posts sit proud at `+0.04`/`+0.08`; the hide skin sits at `0.00` or slightly behind, with sag controlled per bay. A smooth cone/dome is explicitly rejected.
- **Human `TimberFrame` reuse — partial and conditional.** I found no `TimberFrame` module or human race plan in the readable repo/session-state at time of drafting. If the earlier human worker lands a `TimberFrame` module before orcish implementation, reuse its bay splitting, post/beam sockets, and planked door pieces. Do not reuse its clean squared-beam aesthetic unchanged: orcish needs tapered logs, lashing wraps, mismatched salvage, and crooked assembly.
- **Existing masonry tower kit — consume selectively.** Use `DepthLadder`, `OpeningParts`, `GothicArch`/`VoussoirArch`, `FacadeGrammar`, `MassComposer`, `mergeGroupMeshesByMaterial`, and shape helpers. Do not make orcish residential walls out of stone block courses.
- **Existing `buildOrcishHutGrid()` — retire for main facades.** It improved over old palisade cylinders/cone roof, but it is still visible BlockKit voxel massing and cannot meet the new doctrine for timber/hide/rib detail.

## 4. Per-kind blueprint

Shared opening depth ladder for all kinds unless overridden: structural post/buttress `+0.12`, sill/hood/tusk nose `+0.08`, lash/frame/surround `+0.04`, wall/log/skin face `0.00`, reveal `-0.12`, door/glazing/hide-flap plane `-0.20`. Door leaves are 5–7 planks or hide sheets with 3–5 strap/crossbar pieces; windows get at least one bar or crossed bone.

### `house` — small ribbed hide hut

- **Footprint / massing:** `4 WU × 3 WU`, one floor. Rounded-rectangle or oval-ish plan made from 8–10 timber wall bays; front may bulge 0.25 WU for a porch.
- **Storey height:** nominal `FLOOR_HEIGHT = 3.2`; wall eave `2.05 WU`, roof crown/peak `3.15–3.35 WU`.
- **Wall system:** `LashedTimber` low wall: 4–5 horizontal log courses at `0.34–0.42 WU` high each, staggered seams, posts every `0.9–1.1 WU`, lashing bands at course joints. Hide infill panels in 20–35% of bays.
- **Opening schedule:** 1 front hide/plank door `0.85 W × 1.55 H`, off-centre by `0.25–0.45 WU`; 1 side smoke/window slot `0.45 W × 0.55 H`; 30% chance of a second rear slot. Door has raised log threshold at `+0.08`, crossed strap at `+0.04`, dark hide plane at `-0.20`.
- **Roof archetype:** ribbed domed yurt cap (10–12 ribs + crown ring) 55%; conical hide cap (8 ribs) 30%; patched lean-to overlay 15%.
- **Ornament / props:** one socketed spoil on front wall, two tusk tips at roof front, dirt skirt and firewood stack built from tapered sticks.

| Variation axis | Weights |
|---|---|
| Plan module | oval hut 45%, wedge-front hut 35%, side-lean hut 20% |
| Roof module | domed hide 55%, conical hide 30%, lean-to patch 15% |
| Wall palette | dark logs 45%, mixed salvage logs 35%, bone-reinforced posts 20% |
| Front spoil socket | none 30%, captured shield 30%, skull pair 25%, torn red banner 15% |

### `terraced` — cramped lashed row hut

- **Footprint / massing:** `3 WU × 4 WU`, usually `2` floors from slum wards. Narrow vertical stack with shared/blank side walls and a jettied upper hide bay projecting `0.25 WU` over the front.
- **Storey height:** `2.55 WU` per rough storey, total wall top `5.1 WU`, roof ridge `6.0–6.25 WU`.
- **Wall system:** `LashedTimber` front/rear only detailed; side party walls use fewer sockets and no side windows. Lower level has 4 log courses; upper level has vertical salvage planks plus hide panels.
- **Opening schedule:** 1 narrow front door `0.75 W × 1.45 H`; 1 upper front barred slot `0.50 W × 0.55 H`; 1 rear smoke slot. Side openings disabled when `dna.terrace` is `left/right/both`.
- **Roof archetype:** shared ragged gabled hide strip with 5 rafters and raised ridge lash; adjacent row variants align ridge height but vary patches.
- **Ornament / props:** laundry/hide strips, one ladder or exterior brace, small bone spike on one corner only.

| Variation axis | Weights |
|---|---|
| Row bay count visual | single narrow bay 50%, split 2-bay front 35%, upper-jettied bay 15% |
| Upper wall module | hide panels 45%, vertical planks 35%, captured shield patch 20% |
| Roof patching | dark hide 50%, two-tone patched 35%, red repaired strip 15% |
| Street prop socket | none 40%, firewood bundle 25%, broken crate built from boards 20%, bone charm 15% |

### `villa` — warlord hall / great hut

- **Footprint / massing:** `7 WU × 5 WU`; merchant wards use 2 storeys, patriciate can visually use 3 stacked tiers. Broad hall with side lean-to and a raised command porch.
- **Storey height:** wall tiers `2.8 WU`; total eave `5.6–7.8 WU` depending on `dna.floors`; roof/crest adds `1.4–1.8 WU`.
- **Wall system:** main `LashedTimber` courses with larger logs (`0.22–0.30 WU` diameter) and 4 heavy corner posts at `+0.12`; stone only as rough plinth blocks and trophy dais.
- **Opening schedule:** double front war door `1.35 W × 2.05 H`; 2 front high smoke slots; 2–4 side slots if not blocked by lean-to; optional rear service flap. Front arch uses rough `VoussoirArch`/tusk blocks with `archRatio 0.5`.
- **Roof archetype:** wide longhouse gable hide roof with 9–11 rafters; 35% adds a smaller command cap/towerlet over the entrance; 20% adds red awning wings.
- **Ornament / props:** oversized skull-and-tusk trophy, captured banner rack, shield sockets in planned bays, dirt/rubble apron.

| Variation axis | Weights |
|---|---|
| Hall plan | straight longhouse 40%, porch-front hall 35%, side-lean-to hall 25% |
| Trophy bay | tusk skull 45%, captured shields 25%, crossed blades 20%, red war banner 10% |
| Roof crest | tusk ridge 40%, banner pole 25%, smoke crown 20%, broken spike row 15% |
| Wall patch grammar | mostly logs 45%, logs+hide 35%, logs+shield salvage 20% |

### `inn` — mead hall / longhouse

- **Footprint / massing:** `7 WU × 5 WU`, `2` floors. This is the strongest non-forge silhouette: long central hall, high roof, open drinking porch on one side.
- **Storey height:** lower hall `3.0 WU`; partial loft `2.2 WU`; roof ridge `6.5–6.9 WU`.
- **Wall system:** repeated timber frames/posts every `1.0 WU`, horizontal log infill below, hide windbreak panels above. Human `TimberFrame` can supply clean bay math if available; all visible beams must be converted to tapered lashed logs.
- **Opening schedule:** front double door `1.25 W × 1.85 H`; 4 shuttered/barred windows (`0.55 W × 0.65 H`) on long sides; 2 roof smoke vents with ribbed surrounds; one wide porch opening `2.0 W × 1.4 H` with counter/bench rail.
- **Roof archetype:** steep longhouse hide/thatch roof with rafter tails every `0.7–0.85 WU`, thick eaves, ridge lash, and optional red cloth strip.
- **Ornament / props:** mead sign as carved shield board, stave-built kegs (not cylinders), bench planks, hanging skins.

| Variation axis | Weights |
|---|---|
| Hall profile | straight high ridge 45%, sagging patched ridge 35%, offset porch wing 20% |
| Porch side | left 35%, right 35%, front 20%, none 10% |
| Sign module | shield sign 40%, tusk sign 25%, red cloth sign 20%, skull sign 15% |
| Smoke/roof detail | two vents 40%, crown vent 25%, banner ridge 20%, broken rafter 15% |

### `shop` — loot stall / trade lean-to

- **Footprint / massing:** `4 WU × 3 WU`, one floor. Open-front stall with short back wall and red awning, not a full hut.
- **Storey height:** back wall `1.45 WU`; awning front edge `2.0 WU`; rear ridge `2.55–2.75 WU`.
- **Wall system:** 2–3 back/side `LashedTimber` bays with hide panels; front is mostly open counter with two heavy posts.
- **Opening schedule:** 1 wide counter aperture `1.8 W × 0.75 H` with sill/counter slab at `+0.08`, frame at `+0.04`, dark storage recess at `-0.20`; optional rear flap door `0.65 W × 1.2 H`; no fake display-window boxes.
- **Roof archetype:** red stretched-hide awning over rib poles, 4–6 panels, each panel thickened at free edges and sagging between ribs.
- **Ornament / props:** loot sockets: shield stack, weapon rack, hide bundle, board-built crates. Props are assembled modules, not bare boxes/cylinders.

| Variation axis | Weights |
|---|---|
| Stall wall layout | back wall only 35%, L-shaped 40%, U-shaped low wall 25% |
| Awning color | red cloth 60%, red/tan stripe 25%, patched dark hide 15% |
| Goods socket | weapon rack 30%, shield pile 25%, hide bundle 20%, salvage crate stack 15%, empty 10% |
| Counter module | plank slab 45%, shield-plank slab 25%, hide-draped slab 20%, bone-edged slab 10% |

### `blacksmith` — forge/smelter flagship

- **Footprint / massing:** `5 WU × 4 WU`, one floor with open forge yard. Asymmetric: low shelter on one side, tall chimney/furnace on the other.
- **Storey height:** work shelter eave `2.2 WU`; roof ridge `3.0 WU`; furnace stack top `4.8–5.5 WU`.
- **Wall system:** rough stone forge pad and back hearth wall (`0.5–0.8 WU` high plinth + arched hearth), `LashedTimber` side shelter, `HidePanel` roof over work bay. Metal chimney is built from stacked octagonal/rectangular plate modules with seams and rivet rows.
- **Opening schedule:** main forge mouth `1.8 W × 1.6 H`, dark `-0.20` interior, tusk/voussoir surround `+0.08`; work-bay front opening `2.2 W × 1.7 H` framed by posts; one side service slot `0.55 W × 0.55 H`.
- **Roof archetype:** half-gable hide shelter or flat-ish but thick ribbed awning; never one plane. Chimney breaks the roofline.
- **Ornament / props:** anvil built from base+horn+face pieces, coal bins from plank modules, weapon racks, orange forge emissive plane set inside the hearth.

| Variation axis | Weights |
|---|---|
| Chimney module | tall riveted stack 50%, squat furnace stack 25%, twin vents 15%, bent pipe stack 10% |
| Work shelter | left lean-to 35%, right lean-to 35%, rear shed 20%, open pad 10% |
| Hearth surround | bone tusk arch 40%, rough stone voussoirs 35%, iron-banded frame 25% |
| Prop socket | weapon rack 30%, anvil focus 25%, coal bins 20%, slag trough 15%, shield trophy 10% |

### `chapel` — war totem shrine

- **Footprint / massing:** `4 WU × 8 WU`, one floor. A processional open shrine, not a church: front gate, ribbed hide canopy, central totem line, rear skull altar.
- **Storey height:** post tops `2.6 WU`; ridge/crown `3.7–4.2 WU`; central totem `4.4–5.0 WU`.
- **Wall system:** mostly open post-and-rib frame with low log rails and hide windbreak panels. Stone is limited to altar plinth and fire ring.
- **Opening schedule:** front ritual portal `1.2 W × 2.2 H` with tusk arch/surround, threshold, hanging hide flap behind; two side slit panels `0.45 W × 0.75 H`; rear altar recess `0.9 W × 1.1 H` behind crossed-bone mullions.
- **Roof archetype:** long ribbed hide canopy, 7–9 ribs, sagging panels, smoke gap above central fire; optional red banner strip down ridge.
- **Ornament / props:** stacked totem poles, skull shelf, weapon offerings, bone finials. Totems use carved multi-piece modules; no sphere skull blobs as primary forms.

| Variation axis | Weights |
|---|---|
| Shrine layout | central totem aisle 45%, rear altar focus 35%, open fire circle 20% |
| Canopy module | continuous hide ridge 45%, broken panel canopy 30%, two separated canopies 25% |
| Totem motif | tusks 35%, skull masks 30%, crossed blades 20%, captured banner 15% |
| Side enclosure | open rails 40%, hide screens 35%, shield screens 25% |

### `watchtower` — lashed lookout platform

- **Footprint / massing:** `2 WU × 2 WU`, no natural ward mapping; showcase/dev-visible. Four splayed legs, two crossed brace tiers, small platform, hide roof.
- **Storey height:** legs/platform top `4.0–4.5 WU`; roof peak `5.3–5.9 WU`; ladder reaches platform.
- **Wall system:** `LashedTimber` vertical supports (tapered logs) and cross braces, all real members. Platform is plank courses with gaps. Low parapet rails at `+0.12` around top.
- **Opening schedule:** no facade windows; one ladder/hatch opening in platform with plank frame/threshold; 3–4 lookout slit gaps in parapet rails with crossbar divisions; all gaps are framed, not absent geometry.
- **Roof archetype:** small ribbed hide cone/hip cap with 4–6 ribs, thick eave, tusk finial, red pennant.
- **Ornament / props:** banner pole, hanging horn, shield on one side, skull/tusk corner spikes.

| Variation axis | Weights |
|---|---|
| Leg stance | straight 30%, splayed 50%, asymmetric repaired leg 20% |
| Platform rail | log rail 40%, shield rail 30%, spike rail 20%, broken rail 10% |
| Roof cap | hide hip 45%, conical rib cap 35%, open platform 20% |
| Signal prop | red pennant 35%, horn 25%, skull spike 25%, none 15% |

## 5. Kit modules consumed

### Existing/shared modules to consume

- `mapStudioFactionToRuntimeFaction()` from `BuildingTypeMap.ts`: studio `orcish` maps to runtime `'orcish'`.
- `getFootprint()`, `FLOOR_HEIGHT`, `BuildingKind`, `Faction`, `factionBuildingDna()` from `BuildingDNA.ts`.
- `rectanglePoints()`, `rectangleFaces()`, `facePointAt()` from `StoneTowerShape.ts` for rectangular/longhouse faces and bay placement.
- `mergeGroupMeshesByMaterial()` for per-building material buckets; material identity must be preserved.
- `mulberry32()` for deterministic weights.
- Existing `hideTexture()`/`barkTexture()` as temporary material maps, but add orc-tuned variants if earlier races have not.
- `StoneTowerGableRoof` math may inform longhouse roof slope, but its flat planes are not enough alone; orc roofs need ribs + hide panels.

### New or likely-new modules

- `[SHARED KIT] DepthLadder.ts`: depth constants and dev assertions from doctrine Part 2 Rule 1.
- `[SHARED KIT] OpeningParts.ts`: five-piece window/door pieces, including sill, mullion/transom/crossbar, set-back dark plane, threshold, straps, and planked leaves.
- `[SHARED KIT] GothicArch.ts` + `[SHARED KIT] VoussoirArch.ts`: rough Romanesque/tusk arch support with `archRatio = 0.5` for orcish doors/hearths.
- `[SHARED KIT] FacadeGrammar.ts` / `ModuleSocket.ts`: bay splitting and socketed variation, used so salvage/spoils are weighted module swaps rather than scatter.
- `[SHARED KIT] LashedTimber.ts`: tapered logs, end-grain caps, lash bands, course staggering, posts, beams, braces, and frame rails. This is the orcish equivalent of block-course walls.
- `[SHARED KIT] HidePanel.ts` or `StretchedSkin.ts`: framed stretched hide panels with ribs first, sagging skin second, thickened/chamfered free edges.
- `[SHARED KIT] RibbedRoof.ts` or `HideRoof.ts`: yurt domes, conical hide caps, longhouse gables, awnings, and smoke crowns built from ribs + panels.
- `[SHARED KIT] SalvageSpoils.ts`: captured shields, tusk/bone finials, banner strips, plank crates, weapon racks, and stave-built kegs as socketable prop modules. Could also serve undead/human bandit ruins later.
- `OrcishBuildingKit.ts` (race-specific): composes the eight kinds from the shared modules and owns the orcish palette/weight tables.

### Human `TimberFrame` note

No readable `TimberFrame` module or human race plan was present in the repo/session staging at drafting time. If it exists by implementation time, reuse its clean bay solver and door/window frame interfaces, but wrap/extend it through `LashedTimber` so orcish keeps tapered logs, lashings, hide patches, and salvage sockets.

## 6. Quality-bar compliance

- **Rule 1 — depth ladder:** all facade pieces use quantised offsets. Lash bands/frame `+0.04`, sill/tusk hood/end caps `+0.08`, posts/chimney breast `+0.12`, trophies `+0.30`, reveal `-0.12`, dark plane `-0.20`.
- **Rule 2 — five-piece opening minimum:** every door/window/counter/hearth mouth has recess, proud surround, sill/threshold, internal division/crossbar/strap, and set-back dark/hide/glow plane. Open porches are structural openings with posts and headers, not holes in nothing.
- **Rule 3 — no banned primitives:** no dark boxes for windows, no smooth cone roofs, no voxel-grid visible surfaces, no flat awning planes without thickness/ribs, no crate/barrel/sign as one primitive. Simple primitives may only be subcomponents inside assembled modules.
- **Rule 4 — variety by module swapping:** all variation tables select fixed modules by weight; widths are resolved by `FacadeGrammar` floating fillers. Salvage and spoils are socketed.
- **Rule 5 — silhouette:** every kind has skyline breakers: tusks, banners, smoke vents, chimney stack, roof ribs, tower rails, trophy poles.
- **Rule 6 — ground contact:** every building has dirt pad, rough plinth/log sill, rubble/ash/skirt, or forge apron.
- **Rule 7 — asymmetry:** all compositions include off-centre doors, one-sided lean-tos, uneven trophies, patched hide, or shifted porch wings.

## 7. Current-state delta

- **Runtime faction:** `mapStudioFactionToRuntimeFaction('orcish')` returns `'orcish'`; `BuildingDNA.FACTION_PRESETS.orcish` uses style `'orcish'`, damaged condition, and palette `walls #6a5838`, `roof #3a2818`, `trim #8a6840`, `door #2a1810`.
- **Current registry:** `FACTION_BUILDING_VARIANTS.orcish` wires `villa`, `chapel`, and `shop`; `house`, `terraced`, `inn`, and `blacksmith` all reuse `buildOrcishVilla`; `watchtower`/`tower` have no orcish override and fall back to generic.
- **Current villa:** `buildOrcishVilla()` calls `addBlockOrcishHut()` / `buildOrcishHutGrid()` and adds skull/tusk trophy primitives. Keep the trophy idea, replace the building body.
- **Current chapel:** `buildOrcishChapel()` is only totem poles, sphere skulls, and a cone bonfire. It is not a building and fails the new chapel-as-totem-shrine requirement.
- **Current shop:** `buildOrcishShop()` is a small BlockKit lean-to plus primitive crates/blade. Keep “loot stall” identity, rebuild with framed counter, ribbed awning, and assembled props.
- **Current grid profile:** `buildOrcishHutGrid()` encodes asymmetric footprint, patch materials, jagged lean-to roof, and carved doorway. Useful as historical intent/test context, but retired for visible main construction because doctrine bans voxel massing on visible surfaces.
- **Existing tests:** `tests/world/FactionBlockProfiles.test.ts` and `tests/world/FactionBuildingVariants.test.ts` currently assert the BlockKit hut behavior. They must be rewritten around `LashedTimber`/`HidePanel` and the eight-kind orcish roster.

## 8. Out of scope / deferred

- **Settlement palisade/stockade perimeter:** strongly supported by the reference collage, but it is a settlement-generation feature, not a per-building builder. Defer to a cross-race/camp-generation pass unless an existing settlement fence system is found during implementation.
- **Natural watchtower reachability:** `watchtower`/`tower` still have no `WARD_TO_KIND` mapping. The showcase must force one or more for review; a real settlement landmark slot should be decided once across races.
- **Full interiors:** this plan covers exterior procedural meshes. Interior room themes can later map to dirt floors, hearths, racks, and shrine props.
- **Siege engines, walls, gates, and large barricades:** not part of the canonical eight building kinds.
- **Physics/gameplay effects:** forge heat, shop loot, inn services, chapel buffs, and watchtower detection are gameplay systems, not visual building kit work.
- **Remote HTML image uncertainty:** the HTML product page references a remote render but only metadata/description is local. Treat it as weaker evidence than the two local images.
