# Slime Buildings — Design Spec

Slime is the ninth and most reuse-heavy race, and it is the race with no reference art in this checkout. That absence is resolved by the user's own creative direction rather than by inventing art: slime culture is a **mimic culture** — a Pokémon-Ditto-style people who observe and reproduce the settlements of every other race they encounter, but always rendered in their own translucent, rounded, neon-hued gel medium (green, blue, pink, purple, cyan, and more) instead of the host race's real materials. The construction system is **inhabited-ruin / occupied-shell reuse** (Alternative A below), now reframed as active mimicry rather than passive ruin-squatting, plus two new mandatory treatments layered on top: a **full neon palette rotation** (not a single green hue) and a **rounded/softened "gel-mimic" silhouette** (filleted corners, sagging ridgelines, dripping eaves) that visibly distinguishes a slime copy from the real building it imitates.

**Status:** **Approved (2026-09-04)** — user selected the mimic-culture direction; see §2.4 for the finalised design signature. Ready to move to implementation planning/execution.

> [!NOTE]
> **Reference-art gap resolved by design decision, not by art.** `concept_art/reference/buildings/slime/` still does not exist and none is expected. §1 below is retained as evidence of what informed the recommendation, but the direction itself is now settled: slime buildings mimic the shell/massing/facade output of whichever other race's kit they copy, then apply the mimic-culture material and rounding treatment in §2.4. This makes slime's implementation *more* grounded than a from-scratch art direction would have been, because it inherits the already-specified shell kits of the other eight races.

## 1. Reference art inventory — NONE AVAILABLE

### What was expected

The shared brief says `concept_art/reference/buildings/` should contain per-race building reference folders for `dwarf`, `elven`, `fae`, `human`, `orc`, `undead`, `vampire`, and `vulperia`, with no `slime` folder. In this checkout, the verification result is even stricter:

- `ls concept_art/reference/buildings` → **`No such file or directory`**.
- `ls concept_art/reference` lists only generic / character-facing files: `cover_art.png`, `default_1.png` … `default_6.png`, `exterior_environment_1_tiles.png`, `princess_1_front_reference.png`, `princess_1_reference.png`, `princess_2_reference.png`, `tower_interior_1_tiles.png`.
- No local `concept_art/reference/buildings/slime/` directory exists.
- No local `.html` reference pages for slime buildings exist.

### What is missing

There are **zero slime building reference images** showing any of the required 8 kinds:

`house` · `terraced` · `villa` · `inn` · `shop` · `blacksmith` · `chapel` · `watchtower`

Specifically missing:

1. Architectural silhouette thumbnails for slime settlements.
2. Material reference for whether slime architecture is liquid gel, hardened secretion, shell / ruin occupation, glass containment, fungal growth, crystal, coral, or some hybrid.
3. Door / window language for an amorphous species that may not need ordinary humanoid openings.
4. Civic / sacred identity for named slime wards: `Elder Blob`, `Pulse Pool`, `Goo Stall`, `Slime Forge`, `Sludge Tavern`, `Ooze Workshop`, `Puddle Quarter`, `Ooze Gate`.
5. Any indication of whether slime structures should be cute, eerie, biological, alchemical, fungal, ruinous, crystalline, or industrial.

### What was substituted

Because no slime building art exists, this spec is anchored to **repo-established slime evidence** instead:

| Evidence | Finding used in this spec |
|---|---|
| `src/world/buildings/BuildingTypeMap.ts` | Studio id `slime` maps to runtime faction **`'slime'`** via `mapStudioFactionToRuntimeFaction()`. |
| `src/world/buildings/BuildingDNA.ts` | Runtime slime preset: style `nomadic`, condition `pristine`, colors `walls #aaffcc`, `roof #66ffaa`, `trim #22ff88`, `door #00cc66`. |
| `src/overworld-studio.ts` | Slime ward names: `Pulse Pool`, `Slime Pool`, `Goo Stall`, `Elder Blob`, `Ooze Workshop`, `Puddle Quarter`, `Sludge Tavern`, `Trade Blob`, `Spore Garden`, `Slime Forge`, `Ooze Gate`; layout preference `cluster`; central extra `park`. Canvas palette: building `#70cc88`, dark `#186030`, background `#c4e8ce`, road `#80b890`, field `#aad8b8`. |
| `src/world/buildings/FactionBuildingVariants.ts` | Current slime buildings are explicitly “translucent gelatinous blob architecture”: `buildSlimeVilla`, `buildSlimeChapel`, `buildSlimeShop`, with house / terraced / inn / blacksmith reusing `buildSlimeVilla`. These are the strongest evidence for colour/material, but they directly violate the new doctrine’s “no blobs” rule. |
| `src/world/props/WardFeatureClusters.ts` | Slime park feature is `Slime Pool`: translucent green pool, blob mounds, bubbles. Good colour / glow reference; not acceptable as building massing. |
| `docs/BUILDINGS.md` | Slimes “don’t build in the traditional sense — they occupy and adapt”; possible forms include cave mouths, crystalline growths, hollowed trees, and hardened slime domes. This supports the occupied-shell and hardened-secretion alternatives. |
| `docs/superpowers/specs/2026-08-31-race-biome-affinity-design.md` | Slime settlement biome affinity: `grassland` and `forest`; overlaps human / fae / elven soft-green biomes. |
| `docs/superpowers/specs/2026-08-31-race-territory-dressing-design.md` | Future slime territory props: ooze puddle patch, stacked-goo mound, glistening slime-trail rocks. Use as ground-contact dressing only. |
| `src/world/SettlementModelGenerator.ts` | Slime layout preference is `cluster`; central park forced. Settlements should feel like a clustered colony around a pool / hive node, not a gridded town. |
| `src/world/RoadTextures.ts` | Slime roads currently fall back to generic cobblestone; a slime plan may add gel-stained road overlays but should not assume a slime road texture exists. |
| `src/world/SettlementPopulator.ts` | Slime settlements map to actual `slime` NPC species, so doors and interiors must plausibly support amorphous occupants. |
| `docs/3D_MODEL_PROMPTS.md` and `concept_art/gameplay/slime_dungeon_start_1.png` | Slime creatures are translucent green/teal, glossy, wobbly, puddled at the base, with inner bubbles/cores and occasional crystalline / coral motifs. Use only as creature/material evidence, not building art. |

### Consequence for this document

The alternatives in §2.1–§2.3 below were presented for approval and remain in the document as the design trail. §2.4 records the user's decision and is the settled direction: Alternative A's occupied-shell reuse system, reframed as active mimicry, with a full neon palette and rounded silhouette treatment layered on top. Implementation should follow §2.4, not treat §2.1–§2.3 as still open.

## 2. Race design language

### The hard design problem

A naive “slime building” is a blob. That is exactly what the doctrine forbids: no blobs, no smooth featureless surfaces, no primitive geometry standing in for readable building features. The design question is therefore:

> **What discrete, modular, high-depth construction system produces a building that reads as slime?**

The answer cannot be “large translucent hemisphere.” The slime read must come from **additive, modular, depth-laddered pieces**: membrane sheets stretched between hard supports, faceted hardened-gel plates, tendril anchors, layered puddle skirts, clogged openings, luminous gel lenses, and slime-stained rubble.

### 2.1 Alternative A — Inhabited-ruin / occupied-shell (**recommended, and the basis of the approved direction in §2.4**)

**Premise:** Slimes do not primarily build. They colonise. A slime building starts as a legible abandoned structure from the shared kit, then `Ruinate` damages it and a slime accretion layer occupies it.

**Construction system:**

- Host shell: reuse prior race / shared-kit massing and facade modules.
- Damage: `Ruinate` creates jagged wall breaks, lost roof areas, exposed rafters, partial vaults, and same-material rubble.
- Slime layer: discrete add-on modules snap to openings, wall breaks, eaves, ground edges, and interior voids:
  - `gel_lip_course`: stacked faceted crescent / wedge plates along ledges.
  - `membrane_sheet`: a thin but thick-edged, slightly sagging patch stretched between two hard sockets; never free-floating.
  - `tendril_bridge`: tapered rib / tube segments with visible anchor pads.
  - `faceted_drip_run`: chains of angular teardrop prisms under eaves and arch heads.
  - `gel_lens_infill`: set-back glowing gel panes in existing five-piece openings.
  - `puddle_skirt_tiles`: overlapping ground-hugging rim plates around the plinth, not one flat disc.

**Why it reads as slime:** slime visibly engulfs, occupies, oozes through, and repairs other architecture. The colony becomes a living occupation layer.

**Doctrine fit:** strongest. The building remains real architecture with walls, roofs, openings, and discrete modules. Slime is additive ornament and damage infill, so it cannot collapse into a featureless blob.

**Reuse:** highest. By the time slime is implemented ninth, all race shell kits and Part 4 shared modules should exist. Slime becomes mostly shell selection + ruin + overlay.

**Risks:** if the overlay is too sparse, the building reads as generic ruined human/elven/dwarven architecture with green stains. Mitigation: every kind gets a named slime occupancy motif and at least three slime module classes visible from isometric distance.

**Recommendation:** choose this as the primary direction. It is the safest route through the no-blob constraint and best honours the missing-art uncertainty.

### 2.2 Alternative B — Crystallised / hardened secretion

**Premise:** Slime secretes material that hardens into faceted plates, coral-like branches, dripstone ribs, and crystalline shells.

**Construction system:**

- Buildings are assembled from hard-edged secretion modules: hex / pentagonal plates, mineral ribs, stalagmite buttresses, coral lattices, and layered dripstone courses.
- Surfaces use faceted `ExtrudeGeometry` / low-sided prism modules with bevels and creased normals.
- Openings are framed by hardened-gel voussoirs and divided by crystal mullions.
- Roofs are not roofs in the human sense; they are scale courses / coral shelves with visible overlapping rows.

**Why it reads as slime:** the material plausibly originates as ooze but becomes hard enough to hold form. It echoes the `slime_arcane` prompt’s “crystalline blob” and the Elder Slime’s fossilised coral crown.

**Doctrine fit:** good if aggressively faceted. Bad if implemented as smooth translucent domes.

**Reuse:** medium. Uses shared openings, string courses, shingles, and facade grammar, but needs many new race-specific faceted secretion modules.

**Risks:** can drift into generic crystal / fae / cave architecture and lose slime personality unless green gel, internal bubbles, puddle skirts, and wet ledges stay present.

**Best use if Alternative A is chosen:** use hardened secretion as the slime overlay material, not as the whole massing system.

### 2.3 Alternative C — Vessel / containment architecture

**Premise:** Slime bodies are fluid; their buildings are rigid vessels and channels built to contain, move, or display them.

**Construction system:**

- Conventional stone/timber/glass structures with tanks, cisterns, sluice gates, aqueduct troughs, pipes, vats, and reinforced viewing windows.
- Slime appears only as contained volumes: behind gel lenses, in troughs, in cauldrons, and under grates.
- `shop`, `inn`, and `blacksmith` become strongly readable because counters, vats, hearths, and channels have clear function.

**Why it reads as slime:** the architecture is shaped around fluid inhabitants and circulation.

**Doctrine fit:** good for hard architecture, but weak if tanks are just transparent cylinders / boxes. Every tank still needs frames, straps, bases, lips, and interior depth.

**Reuse:** high for human/dwarven shells plus props; medium for custom sluice/tank modules.

**Risks:** can read like “humans built aquariums for slimes,” not slime culture. It is functional but less characterful than Alternative A.

**Best use if Alternative A is chosen:** use vessel modules as props for `shop`, `inn`, and `blacksmith`, not as the whole settlement language.

### Recommended conditional design signature (superseded — see §2.4 for the approved version)

If the user approves Alternative A, slime buildings should follow these rules:

1. **Colonised shell first:** every building begins as a recognisable, high-quality host structure; never a pure gel mound.
2. **Ruin damage is structural:** missing walls, broken roofs, exposed rafters, and rubble are generated by `Ruinate`, not by deleting arbitrary geometry.
3. **Slime is an additive kit layer:** green translucent material appears as lips, membranes, tendrils, infill, ground skirts, and contained pools.
4. **No smooth massing:** gel modules use faceted edges, seams, ribbing, overlapping courses, anchor pads, and internal speck / bubble detail; no single large `SphereGeometry` / dome stands in for a building.
5. **Depth ladder is visible:** slime sits at known offsets from the host wall — +0.16 ribs, +0.12 anchor pads, +0.08 lips, +0.04 membrane rims, -0.20 gel lens planes.
6. **Openings stay architectural:** slime may fill an opening, but the opening still has recess, proud surround, sill/threshold, mullion/transom, and set-back pane/door.
7. **Palette:** base host material is weathered stone/timber from existing kits; slime overlay uses `#aaffcc`, `#66ffaa`, `#22ff88`, `#00cc66`, with darker `#186030` recesses and soft emissive cores.
8. **Biome tone:** grassland/forest affinity means moss, grass, roots, and damp stones are appropriate; avoid desert lava or frozen necropolis reads.
9. **Settlement composition:** cluster layout around central Slime Pool / Pulse Pool; alleys should feel linked by slime trails and membrane bridges.
10. **Asymmetry:** slime growth chooses one dominant side / breach per building; perfect bilateral layouts are banned.

This list is retained for the design trail. Rules 1, 2, 4, 5, 6, 8, 9, and 10 are carried forward unchanged into §2.4. Rules 3 and 7 (single green palette) are superseded — the approved direction uses a full neon hue rotation, not one fixed green — and a new rounding/mimicry rule is added.

### 2.4 Approved direction (2026-09-04 user decision): mimic-culture architecture

The user's framing: slime culture works like a Pokémon Ditto — a species that observes and reproduces the settlements of every other culture it encounters and absorbs, but the copy is always visibly made of slime: rounded, glossy, and rendered across a spread of neon hues (green, blue, pink, purple, and more), not a single tint. This is adopted as the settled slime direction. It is mechanically Alternative A (§2.1) — same host-shell reuse, same `Ruinate` damage pass, same accretion-module vocabulary — with two mandatory additions that make the "mimicry" read distinct from "ruin colonised by moss":

**A. Mimicry framing replaces ruin framing as the narrative frame (mechanically similar, narratively different).** A slime building is not primarily a *decayed* building that slime happened to move into; it is an *impression* the slime colony formed of a building it observed, then reproduced in its own body. Practically this changes only emphasis, not code shape:
- `Ruinate` damage should be **lighter and more selective** than a true abandoned ruin (roughly half the damage intensity used for the undead/vampire funerary ruin work) — just enough asymmetric imperfection to show the copy is imperfect and organic, not enough to look condemned.
- The host-shell selection (Task 6 in the plan) should be described as "the source culture being mimicked," and a settlement can plausibly mimic more than one neighbouring race's shell library, giving intra-settlement variety.
- Every kind's blueprint keeps its structural blueprint (§4) unchanged; only the "why" in prose changes from "colonised by slimes after abandonment" to "an impression of that shell formed by the local slime colony."

**B. Two new mandatory treatments layered on the existing accretion kit:**

1. **Neon palette rotation.** Replace the single fixed green palette with a per-building hue roll across a defined neon set. Each building (not each settlement) rolls one dominant hue family, so a mimic settlement shows genuine colour variety rather than a monochrome green district:
   - `mint_green` `#aaffcc` / `#66ffaa` (original palette, kept as one option, weight `0.30`)
   - `azure_blue` `#7ec8ff` / `#3d9dff` (weight `0.20`)
   - `bubblegum_pink` `#ff9ee8` / `#ff5cc8` (weight `0.20`)
   - `violet_purple` `#c79bff` / `#9a5bff` (weight `0.15`)
   - `cyan_teal` `#7ffff0` / `#2be8d4` (weight `0.15`)
   - Dark recess/shadow tint scales with the dominant hue (roughly 35% luminance of the light tone) rather than reusing the fixed `#186030` for every hue.
   - Elder/civic buildings (`villa`, `chapel`, `watchtower`) may blend two adjacent hue families (e.g. violet + azure) to read as a more "senior" or magically-saturated colony, still from the same set — never a hue outside the defined palette, to keep a coherent slime-colony read across a settlement.
2. **Rounded gel-mimic silhouette.** Because the copy is made of slime, not stone or timber, every mimicked hard edge gets a **fillet/round pass** distinct from the host race's real sharp-edged version:
   - Wall corners, window/door frame corners, coping, and roof ridge caps use a rounded bevel radius of `0.06–0.10 WU` (vs. the host kit's typical `0.02–0.03 WU` chamfer), applied via the existing Tier 1 `Bevels` module with a larger radius parameter rather than a new geometry system.
   - Roofline gets a slight asymmetric **sag**: one ridge or eave edge droops `0.05–0.12 WU` lower than its mirrored counterpart, suggesting the copy is still slightly soft/settling. This is a deterministic per-building seed offset, not physics.
   - Eaves and sills get 1–3 **drip points** (reusing `faceted_drip_run`) even on undamaged copies, since dripping is now a material signature of the mimicry itself, not only ruin decay.
   - These roundings apply only to the *slime accretion layer and mimicked silhouette*, never by scaling or smoothing the underlying host shell's block-course wall geometry itself — the wall blocks stay sharp and legible; the rounding reads on the outer profile, copings, and openings frames, per the depth ladder.

**Revised design signature (supersedes the §2.3 list above):** rules 1, 2, 4, 5, 6, 8, 9, 10 from the superseded list are unchanged. Rules 3 and 7 become:
- **3′. Slime is an additive kit layer in a rotating neon hue,** not fixed green: lips, membranes, tendrils, infill, ground skirts, and contained pools all use that building's rolled hue family from the five defined above.
- **7′. Palette is the five-family neon set** in bullet **B.1** above, weighted per building; dark recesses/emissive cores scale from the rolled hue rather than reusing one fixed dark green.
- **11 (new). Rounded gel-mimic silhouette is mandatory** per bullet **B.2** above: fillet radius `0.06–0.10 WU` on mimicked hard edges, asymmetric ridge/eave sag `0.05–0.12 WU`, and 1–3 drip points per building regardless of ruin-damage state.
- **12 (new). Mimicry source is named per building** in generated metadata/comments (e.g. "mimics the elven small-shell library") so the accretion composer and tests can assert the source shell family, not just "some shell."



## 3. Real-world & game-dev basis

### Reusing architectural shells is historically and visually plausible

Real settlements constantly reuse existing structures. Ruins become shelters, chapels become barns, fortifications become homes, and industrial buildings become markets. For slime, this is stronger than normal: an amorphous population can inhabit cracks, basements, pools, and blocked openings that would be unusable for humanoids. This supports the occupied-shell direction without needing new humanoid planning logic.

### Biological / organic faction precedent

Games with amorphous or biological factions usually avoid literal liquid buildings by giving the faction a **support system**:

- Zerg-style colonies use creep as a living ground layer and structures as organs rooted in it. The useful lesson is not the specific alien style; it is the separation between **ground connective tissue** and **discrete readable structures**.
- Tyranid / chitin / hive aesthetics read through ribs, carapace plates, vents, claws, and repeated hard modules, not through smooth blobs.
- Nurgle / corruption aesthetics often work by overtaking existing structures with growth, rot, tentacles, and encrustation. The lesson is “occupation layer over architecture.”
- Mushroom / fungal settlements use stalks, caps, mycelial mats, and spore structures. The lesson is hierarchical biology: fine tendrils, medium stalks, large caps — all distinct modules.
- Coral / reef growth is colony architecture: repeated hard exoskeleton units accrete into a larger form. Wikipedia’s coral reef summary describes reefs as colonies of polyps held together by calcium carbonate skeletons; this is a strong basis for hardened secretion modules.
- Dripstone / stalactite formation grows by deposition rings and repeated drips; that maps well to layered lip courses and faceted drip runs rather than smooth flowing surfaces.
- Mycelium-based construction is grown in molds and can form rigid panels; this validates “slime secretion hardens in forms” if Alternative B is chosen.

### Procedural method fit

The recommended method is a three-pass procedural pipeline:

1. **Host shell selection:** pick an existing shell blueprint for the kind, biased by slime biome (`grassland` / `forest`) and by settlement function.
2. **Ruin post-pass:** apply shared `Ruinate` with kind-specific damage intensity and protected structural tags.
3. **Slime occupation pass:** attach discrete slime modules to sockets exposed by the shell and ruin passes.

This aligns with the modular-building research report:

- Facade grammar handles variable-width shell fronts without scaling details.
- Module sockets attach reusable pieces deterministically.
- `BatchedMesh` / merge buckets keep many details performant.
- Occupancy-carve / five-piece openings avoid CSG and flat dark rectangles.
- `Ruinate` supplies convincing decay without icosahedron rubble.

## 4. Per-kind blueprint (mimic-culture direction, per §2.4)

All kind blueprints below use the §2.1 (Alternative A) host-shell/`Ruinate`/accretion structure, with the §2.4 neon-hue rotation and rounded gel-mimic silhouette applied as the final overlay pass on every kind. Where a row below still says "slime overlay uses green," read that as shorthand for "the building's rolled hue family from §2.4-B.1," and every roofline/coping/frame edge gets the §2.4-B.2 rounding and drip treatment regardless of ruin-damage state.

Shared numeric constants for this section:

- Storey height: `FLOOR_HEIGHT = 3.2 WU` unless stated otherwise.
- Wall block course: `0.40–0.55 WU` high; visible blocks use the existing block-course wall technique or host race equivalent.
- Host wall thickness/read depth: ≥ `0.18 WU` visible block depth.
- Opening depth ladder: frame `+0.04`, sill/hood `+0.08`, reveal `-0.12`, gel/glazing/door face `-0.20`.
- Major slime ribs / tendrils: `+0.12` to `+0.16`; heavy anchor pads `+0.12`; ground puddle skirt tiles sit `0.02–0.05 WU` above terrain and overlap the plinth.
- No slime overlay module may exceed 45% of the facade area without a hard frame / rib subdivision.

### 4.1 `house` — Colonised cottage shell

**Function/read:** ordinary slime dwelling; a small abandoned cottage made habitable by membrane patches and puddle-skirt access.

| Attribute | Blueprint |
|---|---|
| Footprint | `4.0 × 3.0 WU` (`small` house footprint). Host shell may overhang by `0.25 WU`; slime skirt extends another `0.35 WU` irregularly. |
| Floor count | 1 primary storey; 25% chance of a half-loft dormer remnant. Height `3.2 WU` wall + `1.4 WU` roof. |
| Wall system | Reused human rural / elven cottage / simple stone shell, then `Ruinate` at `0.25–0.40` damage. Wall faces keep block courses; front door side protected from total collapse. |
| Opening schedule | Front: 1 off-centre door (`0.8 × 1.75 WU`) with reveal `-0.12`, door/membrane plane `-0.20`, threshold `+0.08`, two tendril anchors `+0.12`. Front: 1 small window (`0.55 × 0.85 WU`) with gel lens set back `-0.20`, mullion retained. Side: 1 optional clogged slit window on the less-damaged side. |
| Roof archetype | Broken gable or hipped roof from host kit; 20–35% tile loss on one rear corner; membrane sheet stretched under exposed rafters. Eaves retain fascia/rafter tails. |
| Ornament | Gel lip course along sill and roof break; 2–4 faceted drip runs under eave; one puddle-skirt path from door to ground. |
| Props | Small faceted ooze pebbles, reclaimed crate shelf, one contained core lantern. No round blob props larger than `0.25 WU`. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host shell | human rural cottage `0.45`, elven small shell `0.25`, generic stone cottage `0.20`, prior-race leftover shell `0.10` |
| Dominant growth side | front-left `0.25`, front-right `0.25`, rear-left `0.25`, rear-right `0.25` |
| Damage state | light roof loss `0.45`, broken side wall `0.25`, blocked side window `0.20`, exposed rafters `0.10` |
| Slime module emphasis | membrane patches `0.35`, tendril anchors `0.25`, hardened lip plates `0.25`, contained gel lens `0.15` |
| Palette shift | mint green `0.45`, lime `0.25`, teal `0.20`, blue-green elder tint `0.10` |

### 4.2 `terraced` — Puddle Quarter row house

**Function/read:** dense row dwelling; slimes occupy party-wall houses connected by alley slime trails.

| Attribute | Blueprint |
|---|---|
| Footprint | One unit `3.0 × 4.0 WU`; composer may generate a visible row of 2–3 units by instancing adjacent facades, but collider footprint remains the active building lot unless settlement placement supports grouped rows. |
| Floor count | 2 storeys, each `3.0 WU` plus `0.2 WU` floor cap/string course. Total wall height `6.2–6.5 WU`; shallow broken roof `1.0–1.3 WU`. |
| Wall system | Narrow human/timber/stone row shell with party walls left/right. Front and rear are detailed; side walls mostly blank except edge quoins. `Ruinate` lower than house (`0.15–0.30`) so row remains legible. |
| Opening schedule | Front ground: 1 door (`0.75 × 1.65 WU`), off-centre. Front upper: 2 narrow windows (`0.45 × 0.75 WU`) with retained mullions; one may be gel-lens filled. Rear: 1 service slit. All openings obey five-piece minimum; slime may occlude at most 35% of any opening. |
| Roof archetype | Shared broken shed/gable strip with individual tile rows; no one-piece plane. Party-wall parapet blocks at both ends. |
| Ornament | Continuous gel gutter along row base; vertical tendril downspout on one bay; membrane sheet between two neighbouring upper windows on 35% of rows. |
| Props | Stacked reclaimed door planks, clay jars with framed gel lids, small hanging address plaques. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Row length visual | single lot only `0.45`, 2-bay illusion `0.35`, 3-bay illusion `0.20` |
| Host material | timber row `0.40`, stone row `0.35`, mixed timber/stone `0.25` |
| Party-wall condition | both intact `0.50`, left cracked `0.20`, right cracked `0.20`, roof gap between units `0.10` |
| Slime circulation | base gutter `0.40`, vertical downspout `0.25`, window-to-window membrane `0.20`, alley puddle bridge `0.15` |
| Special bay | blocked upper window `0.30`, bulging gel lens behind shopfront-like opening `0.25`, exposed stair remnant `0.20`, small sign bracket `0.25` |

### 4.3 `villa` — Elder Blob occupied manor

**Function/read:** civic / patriciate equivalent, not literal blob: a large manor or hall hollowed around an elder slime chamber.

| Attribute | Blueprint |
|---|---|
| Footprint | `7.0 × 5.0 WU`; optional L-wing or porch from `MassComposer` extends up to `1.5 WU` beyond main mass. |
| Floor count | 3 storeys for patriciate, each `3.2 WU`; total shell height `9.6 WU` plus roof/parapet `1.8–2.4 WU`. |
| Wall system | Grand abandoned human/elven/dwarven shell, chosen by host-shell weights. Ground floor retains heavy plinth and 5-bay facade; upper floors partially ruined. `Ruinate` damage `0.30–0.50`, but central entrance bay and one upper balcony remain intact. |
| Opening schedule | Front: central double arch door (`1.4 × 2.3 WU`) with threshold + side plinth; 4 ground windows; 5 upper windows; 1 balcony/oriel option. Side walls: 2–3 windows each. Gel lenses fill 30–60% of windows but do not replace frames/sills/mullions. |
| Roof archetype | Broken hipped or cross-gabled roof, with exposed rafter field over the elder chamber. Optional hardened-gel skylight lattice: faceted ribs `+0.16` over a set-back membrane `-0.20`, subdivided into 6–10 cells. |
| Ornament | Concentric elder-ring motif: 2–3 faceted gel lip courses around the main door and balcony, echoing Elder Slime ring eyes; small fossil-coral crown finials on roof peaks (hard, faceted, not blobs). |
| Props | Raised dais visible through broken central bay, contained core lanterns, old banners stuck under gel, cracked fountain converted to pool. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host shell | human manor `0.35`, elven elder hall `0.25`, dwarven hall `0.20`, vampire/undead ruined hall `0.10`, mixed reclaimed shell `0.10` |
| Massing | rectangular manor `0.40`, L-wing `0.30`, porch + balcony `0.20`, broken side annex `0.10` |
| Elder-chamber exposure | roof skylight `0.35`, broken front bay `0.25`, side-wall breach `0.20`, courtyard pool `0.20` |
| Gel motif | ring lip courses `0.35`, coral-crown finials `0.25`, membrane skylight `0.25`, tendril buttresses `0.15` |
| Damage intensity | dignified weathering `0.35`, asymmetrical roof collapse `0.30`, upper-floor breach `0.20`, heavy rear ruin `0.15` |

### 4.4 `inn` — Sludge Tavern shell

**Function/read:** social building with slime-friendly channels and vats inside an old tavern shell.

| Attribute | Blueprint |
|---|---|
| Footprint | `7.0 × 5.0 WU` large inn footprint; front porch/counter may project `0.8 WU`. |
| Floor count | 2 storeys, `3.2 WU` each; attic roof `1.6 WU`. |
| Wall system | Wide timber/stone tavern shell with strong ground-floor frontage. Damage `0.20–0.35`; less ruined than villa so social function reads. |
| Opening schedule | Front: 1 broad recessed entry (`1.2 × 2.0 WU`), 2 large ground windows (`0.9 × 1.0 WU`) with 2 mullions each, 3 upper windows. Side: stable/service arch on one side (`1.0 × 1.5 WU`) converted to slime trough entry. Gel planes set back at `-0.20`; frames remain `+0.04`, sills `+0.08`. |
| Roof archetype | Sagging but tiled gable/hip roof with 1 chimney or vent stack retained; slime membrane patch only covers missing roof cells, bounded by rafters. |
| Ornament | Hanging sign is a real bracket + carved plaque reading as slime tavern symbol; not a flat decal. Gel drip chain under sign. Slime channel lip along porch edge. |
| Props | Barrel racks replaced by framed vats, bench planks, lanterns, trough channels; contained volumes have rims/straps/bases. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host tavern shell | human timber inn `0.45`, stone roadside inn `0.25`, elven wayhouse `0.15`, reclaimed mixed shell `0.15` |
| Front special | hanging sign `0.35`, porch trough `0.25`, broken balcony `0.20`, side stable arch `0.20` |
| Slime social feature | interior vat visible `0.30`, floor channel visible through entry `0.25`, membrane awning patch `0.20`, glowing window lenses `0.25` |
| Damage | light `0.50`, roof corner missing `0.25`, side wall breach `0.15`, upper balcony collapse `0.10` |
| Chimney/vent | retained chimney `0.45`, capped vent pipe cluster `0.25`, broken chimney with gel seam `0.20`, none `0.10` |

### 4.5 `shop` — Goo Stall / Trade Blob occupied market shell

**Function/read:** commercial front; slimes sell through a framed counter and membrane awning, not from a pure blob mound.

| Attribute | Blueprint |
|---|---|
| Footprint | `4.0 × 3.0 WU`; shallow shop front projects `0.45 WU`; counter height `0.85 WU`. |
| Floor count | 1 storey, `3.0 WU` wall + `1.0–1.4 WU` roof/canopy. |
| Wall system | Reclaimed market stall or small shop shell. Front bay is mostly open but framed by posts/lintel/counter. Side/back walls use block courses or timber panels; damage `0.15–0.30`. |
| Opening schedule | Front: 1 open counter bay (`2.0 × 1.2 WU`) with sill/counter `+0.08`, side posts `+0.12`, lintel `+0.12`, set-back membrane backdrop `-0.20`, at least one vertical division. Rear: 1 service door. Side: 1 small gel-lens window. |
| Roof archetype | Reused shingled/shed roof or taut framed awning; awning is not a flat plane — it has front rod, side rods, thickness, seams, and sagging membrane cells. |
| Ornament | Display shelves with framed gel jars; drip guard under counter; slime trail path to street. |
| Props | 3–5 goods modules: faceted bottles, strapped jars, book/scroll crates reclaimed from other kits, small sign plaque. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Shell | old human shop `0.35`, market stall frame `0.30`, elven exchange shell `0.15`, dwarven trade-vault kiosk `0.10`, mixed salvage `0.10` |
| Counter bay | full-width counter `0.45`, split counter + side door `0.25`, corner counter `0.20`, blocked/repaired bay `0.10` |
| Canopy | broken shingle roof `0.35`, membrane awning `0.35`, mixed rafter + membrane `0.20`, no canopy but heavy sign `0.10` |
| Goods | jars `0.30`, books/scrolls `0.20`, alchemy vials `0.20`, food/mushrooms `0.15`, mystery salvage `0.15` |
| Slime emphasis | counter drip lip `0.30`, gel-lens display `0.25`, tendril shelf supports `0.20`, puddle-skirt threshold `0.25` |

### 4.6 `blacksmith` — Slime Forge / secretion hardening yard

**Function/read:** not a normal fire forge; a hardening/secretion workshop where slime gels, acids, and minerals create tools or hardened plates.

| Attribute | Blueprint |
|---|---|
| Footprint | `5.0 × 4.0 WU`; open work apron projects `0.8 WU`; rear chimney/vent may project `0.35 WU`. |
| Floor count | 1 tall storey, wall height `3.6 WU`; vent/chimney top `5.5–6.2 WU`. |
| Wall system | Heavy stone/brick forge shell, partially open front. Keep masonry because heat/acid function needs hard containment. Damage `0.10–0.25`; more functional than ruined. |
| Opening schedule | Front: broad work arch (`2.2 × 2.1 WU`) with voussoirs, threshold slab, side piers. Side: 1 vent slit per side (`0.35 × 0.8 WU`). Rear: service door or tank hatch. All openings keep frames/sills; side vents have grilles/mullions. |
| Roof archetype | Low, broken tile or metal-plate roof with smoke/steam vent. No smooth conical stacks; vent cap uses stacked rings, straps, and louvres. |
| Ornament | Hardened secretion plates stacked on racks; acid channel with raised lips; crystallised slag stalagmites around apron. |
| Props | Framed vats, strapped tanks, cooling troughs, anvil-equivalent hardening table, tool racks. Containment architecture is allowed here as secondary vocabulary. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host forge shell | human stone forge `0.40`, dwarven great forge remnant `0.35`, orcish armory salvage `0.15`, mixed ruin `0.10` |
| Heat/process source | glowing acid vat `0.35`, mineral hardening crucible `0.30`, steam vent furnace `0.20`, fungal/spore kiln `0.15` |
| Front composition | central arch `0.45`, offset arch + tank `0.25`, double pier opening `0.20`, half-collapsed front `0.10` |
| Slime modules | channel lips `0.30`, crystallised plates `0.30`, tendril braces `0.20`, membrane heat shield `0.20` |
| Vent silhouette | tall chimney `0.35`, louvred vent box `0.30`, pipe cluster `0.20`, broken chimney with gel repair `0.15` |

### 4.7 `chapel` — Pulse Pool occupied chapel ruin

**Function/read:** sacred slime place; a church/chapel ruin transformed into a pulsing communal pool. Must not be a dome.

| Attribute | Blueprint |
|---|---|
| Footprint | `4.0 × 8.0 WU` long nave; apse/pool may project `1.2 WU` at rear within placement clearance. |
| Floor count | 1 tall storey: nave walls `3.8–4.2 WU`, broken roof/rafters to `5.2 WU`; small bellcote/marker if host shell supports it. |
| Wall system | Reuse rectangular chapel kit and `Ruinate` heavily (`0.45–0.65`) but preserve long nave axis, front entrance, and at least two side-wall bays. |
| Opening schedule | Front: recessed pointed door (`1.0 × 2.1 WU`) with threshold and strap/frame remnants. Long sides: 2 lancet windows per side (`0.55 × 1.35 WU`) with mullion/tracery, 40–70% filled by glowing gel lenses. Apse/rear: one oculus or broken rose frame, gel plane `-0.20`, tracery/ring `+0.04/+0.08`. |
| Roof archetype | Mostly collapsed gable roof: rafter ribs remain; membrane sheets span 2–3 missing bays; roof tiles/rubble on ground from `Ruinate`. |
| Ornament | Pulse-ring motif around apse/pool; hanging faceted droplets from rafter ribs; two tendril “choir screen” arcs, with hard anchor blocks. |
| Props | Central raised pool rim built from wedge stones + gel lip; candle equivalents are glow cores in framed cups; no free-floating orb as sole sacred object. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host sacred shell | elven chapel ruin `0.30`, human stone chapel `0.30`, undead crypt chapel `0.20`, old standing-stone shrine enclosed by slime `0.10`, mixed ruin `0.10` |
| Roof condition | open nave `0.35`, half-roof membrane `0.30`, exposed rafters `0.20`, apse canopy remains `0.15` |
| Sacred focal | central pool `0.40`, rear apse pulse pool `0.30`, broken rose-window lens `0.20`, ring-stone choir screen `0.10` |
| Gel behaviour | quiet luminous lens `0.30`, pulsing rings `0.30`, drip chains `0.20`, tendril arches `0.20` |
| Damage asymmetry | left wall breached `0.25`, right wall breached `0.25`, roof-only damage `0.25`, rear apse breach `0.25` |

### 4.8 `watchtower` — Ooze Gate / colonised lookout stump

**Function/read:** landmark / defensive vertical read. Since `watchtower` has no natural ward mapping, it must be forced into Settlement Lab showcase and eventually needs a cross-race landmark-spawn decision.

| Attribute | Blueprint |
|---|---|
| Footprint | `2.0 × 2.0 WU` canonical watchtower; plinth may flare to `2.5 × 2.5 WU`; ground skirt up to `3.0 WU` irregular diameter but made of tiles/plates. |
| Floor count | 4 narrow levels, `3.0 WU` each, total wall height `12.0 WU`; top parapet/roof `1.0–1.6 WU`. |
| Wall system | Abandoned stone watchtower / gate tower shell, octagonal or square depending host kit. `Ruinate` `0.35–0.55`; protect enough vertical edge continuity to read as tower. |
| Opening schedule | Door at base (`0.65 × 1.55 WU`), 1 arrow slit per visible level on alternating faces (`0.22 × 0.70 WU`) with recessed reveal and raised hood, top lookout opening/breach. Gel lenses fill some slits but never remove the slit frame. |
| Roof archetype | Broken crenellated parapet or partial conical roof. If conical, use real shingle/plate courses with missing segments; if parapet, merlons need copings. |
| Ornament | Spiral tendril path up one side, anchored at every floor string course; hard gel plates repair one large breach; small beacon core in top lookout behind frame. |
| Props | Fallen ladder/rafters, same-material rubble, slime-stained stones, gate marker plaque if used as Ooze Gate. |

Procedural variation axes:

| Axis | Options / weights |
|---|---|
| Host tower | human stone watchtower `0.35`, elven stone tower `0.25`, dwarven squat tower `0.20`, undead/vampire ruined tower `0.10`, mixed gate stump `0.10` |
| Top | broken parapet `0.35`, partial conical roof `0.25`, open beacon frame `0.25`, collapsed cap with membrane `0.15` |
| Growth path | spiral tendril `0.40`, vertical drip seam `0.25`, breach repair plate field `0.20`, ground-only puddle skirt `0.15` |
| Slit treatment | clear dark slits `0.35`, gel lenses in alternate slits `0.35`, blocked slits `0.20`, one widened lookout breach `0.10` |
| Damage | base intact / top ruined `0.40`, mid-level breach `0.25`, roof collapsed `0.20`, mostly intact sentinel `0.15` |

## 5. Kit modules consumed

### Part 4 shared primitive modules expected to be consumed

| Module | Slime use |
|---|---|
| `DepthLadder.ts` | Enforce offsets for host facade + slime overlay; special attention to membrane sheets and gel lenses. |
| `OpeningParts.ts` | Required for every door/window/arch before slime infill is applied. |
| `GothicArch.ts` | Needed for chapel lancets, ruin arches, and optional host shells; slime itself does not define arch ratio. |
| `VoussoirArch.ts` | Host shell arches and ruined arch fragments; slime gel may occupy gaps but not replace voussoirs. |
| `StringCourse.ts` | Floor lines, plinths, and attachment rails for tendrils/gel lips. |
| `Bevels.ts` | Hardened secretion plates, membrane rims, sill lips, tank frames, and all trim. |
| `FacadeGrammar.ts` | Host facade bay splitting and shop/inn front composition. Prevents stretching details. |
| `ModuleSocket.ts` | Sockets for slime overlay: `opening-edge`, `eave`, `plinth`, `breach-edge`, `rafter`, `parapet`, `counter`, `tank-frame`. |
| `ShingleSurface.ts` | Broken host roofs; membrane patches only fill missing shingle zones and must sit below/among rafters. |
| `RoofMassing.ts` | Reused host roofs; no slime-specific roof massing if Alternative A is chosen. |
| `Ruinate.ts` | Central to recommended direction: creates occupied shells, exposed supports, rubble, protected structural elements. |
| `MassComposer.ts` | Villa/inn multi-mass shells, chapel nave+apse, shop porch. |
| `BatchedDetail.ts` | Settlement-wide batching for drips, small plates, rubble, gel lenses, and puddle-skirt pieces. |
| `Buttress.ts` | Host chapel/villa/watchtower supports; slime tendrils may wrap but not replace buttress structure. |
| `Tracery.ts` | Chapel rose/oculus and high-status villa windows, then gel-lens infill behind it. |
| `LatheColumn.ts` | Optional villa/chapel porch/arcade columns; not a slime signature. |

### Slime-specific modules (approved 2026-09-04, mimic-culture direction)

These are race-specific unless the parent decides they should become generic contamination/infestation tools:

1. `SlimeMaterials.ts`
   - Shared material instances for translucent gel, darker recess gel, emissive pulse core, hardened secretion, wet stain, and contained gel.
   - Must use material identity carefully; only clone when opacity/emissive state genuinely differs and the mesh will not merge with wall buckets.

2. `SlimeAccretionKit.ts`
   - `buildGelLipCourse()`: overlapping faceted plates along a ledge/string-course socket.
   - `buildMembraneSheet()`: sagging membrane with raised rim and rib divisions between explicit sockets.
   - `buildTendrilBridge()`: tapered rib/strand with hard anchor pads; never constant-radius pipe.
   - `buildFacetedDripRun()`: angular teardrop/prism chain, each small and attached under an eave/arch.
   - `buildGelLensInfill()`: set-back gel pane behind a complete opening assembly.
   - `buildPuddleSkirtTiles()`: irregular overlapping ground-contact plates around plinths.
   - `buildContainedGelVat()`: framed, strapped container for shop/inn/blacksmith props.

3. `SlimeOccupiedShells.ts`
   - `pickSlimeHostShell(kind, seed, biomeHint?)` and per-kind shell weights.
   - Host shell output must include socket metadata and protected regions for `Ruinate`.

4. `SlimeBuildingKit.ts`
   - Public builders for all 8 canonical kinds: `buildSlimeHouse`, `buildSlimeTerraced`, `buildSlimeVilla`, `buildSlimeInn`, `buildSlimeShop`, `buildSlimeBlacksmith`, `buildSlimeChapel`, `buildSlimeWatchtower`.
   - Replaces current blob builders in `FactionBuildingVariants.ts`.

## 6. Quality-bar compliance

### Rule 1 — The depth ladder

Compliant if implemented as specified:

- Host wall face: `0.00`.
- Host frames/surrounds: `+0.04`.
- Host sills/hood moulds/string courses/lintel lips: `+0.08`.
- Slime anchor pads and tendril bases: `+0.12`.
- Major hardened gel ribs / breach repair plates: `+0.16`.
- Buttresses / heavy shell piers: `+0.30`.
- Recess reveals: `-0.12`.
- Gel lens / membrane backdrop / door plane: `-0.20`.

Implementation must add tests that sample named generated pieces and assert they sit on these offsets within tolerance.

### Rule 2 — The five-piece opening minimum

Every opening remains a real architectural opening. Slime can modify only after the host opening exists.

Minimum for windows:

1. Recess depth ≥ `0.12 WU`.
2. Proud surround at `+0.04`.
3. Sill nose at `+0.08`, projecting beyond frame by `0.03–0.06 WU`.
4. At least one mullion/transom/tracery division.
5. Set-back dark glass / gel lens at `-0.20`, never transparent-to-empty interior.

Minimum for doors:

- Threshold step at `+0.08`.
- Planked / ribbed / segmented door or membrane gate face at `-0.20`.
- Strap/rib divisions large enough to read at isometric distance.

### Rule 3 — No banned primitives

The current slime builder violates this rule because it uses large `SphereGeometry` domes and bubble blobs as architecture. The replacement must ban:

- Large domes / spheres as building mass.
- Smooth translucent hemispheres as roofs/walls.
- Flat planes for membranes unless framed, thickened, ribbed, and set on the depth ladder.
- Cylinders/boxes as tanks, signs, windows, doors, or jars without rims/straps/frames/lids.
- Any slime “blob” larger than a small ornamental droplet; even droplets should be faceted and attached to a ledge.

### Rule 4 — Variety from module swapping, not parametric scaling

Variation is achieved by:

- Host-shell weighted selection per kind.
- `FacadeGrammar` bay splitting.
- `Ruinate` damage masks.
- Slime overlay module weights.
- Socket-based placement and seeded jitter.
- One special bay per facade.

Scaling a single slime dome up/down is explicitly retired.

### Rule 5 — Silhouette readability

Each kind gets a different silhouette source:

- `house`: broken cottage roof + off-centre puddle path.
- `terraced`: narrow row/parapet rhythm + slime gutter.
- `villa`: large ruined manor + exposed elder chamber / skylight lattice.
- `inn`: broad tavern frontage + chimney/vent/sign.
- `shop`: open counter + awning/roof frame.
- `blacksmith`: tall vent/chimney + open forge arch.
- `chapel`: long nave ruin + rafter/membrane roof gaps.
- `watchtower`: vertical tower + spiral tendril / broken top.

### Rule 6 — Ground contact

All buildings have a real host plinth plus slime-specific ground dressing:

- Plinth course from host kit or `StringCourse`.
- Same-material rubble/stones where ruined.
- `puddle_skirt_tiles`: layered, overlapping, faceted ground-contact pieces extending beyond the plinth.
- No single flat circular slime puddle as building base.

### Rule 7 — Asymmetry

Asymmetry is mandatory:

- One dominant growth side per building.
- Ruin damage never mirrored.
- Openings may be clogged or gel-filled on one side only.
- Roof loss and membrane repair choose one corner/bay.
- Watchtower tendril spiral never perfectly centred on all faces.

## 7. Current-state delta

### Runtime identity

- Studio id: `slime`.
- Runtime faction: **`'slime'`**, confirmed by `mapStudioFactionToRuntimeFaction()`.
- Existing faction preset: style `nomadic`, condition `pristine`, green gel palette (`#aaffcc`, `#66ffaa`, `#22ff88`, `#00cc66`).
- Settlement layout preference: `cluster` with central `park` / `Slime Pool`.
- Biome affinity: `grassland`, `forest`.

### Existing slime building implementation

Current `FACTION_BUILDING_VARIANTS.slime` covers:

- `villa` → `buildSlimeVilla`
- `chapel` → `buildSlimeChapel`
- `shop` → `buildSlimeShop`
- `house`, `terraced`, `inn`, `blacksmith` → `buildSlimeVilla` reused
- `watchtower` → no override; falls back to generic shared builder

Current slime builders are all variations of glossy translucent domes / blobs:

- `buildSlimeBlobBase()` uses a main `SphereGeometry` dome, a glowing inner core, and satellite ooze bubbles.
- `buildSlimeChapel()` adds drip cylinders to the blob base.
- `buildSlimeShop()` adds blob mound and bulging counter lump with jar cylinders.
- `FactionBlockTextures.ts` explicitly excludes slime because slime was expected to remain a smooth glassy blob.

### What must be rebuilt from scratch

- All current slime building massing must be retired for the Part 6 programme because it violates the doctrine’s central constraints.
- `buildSlimeVilla`, `buildSlimeChapel`, `buildSlimeShop`, and `buildSlimeBlobBase` should not survive as building builders.
- House/terraced/inn/blacksmith must stop collapsing to one identical villa blob builder.
- `watchtower` needs its first slime-specific builder.
- Slime material language should survive as palette/glow/accretion, not as smooth massing.

### What should be preserved

- Runtime faction id and palette.
- Ward names and colony semantics.
- Central Slime Pool as settlement identity, but not as building architecture.
- Cluster layout preference.
- Slime creature read: translucent, glossy, green/teal, inner bubbles/cores, wobble, puddle contact.
- Existing “occupy and adapt” line from `docs/BUILDINGS.md`.

## 8. Out of scope / deferred

### Resolved by the 2026-09-04 user decision (previously listed here as blocked)

1. ~~Final choice among Alternative A, B, C, or a hybrid.~~ **Resolved: Alternative A, reframed as mimic culture, per §2.4.**
2. ~~Whether slime host shells should primarily look human, elven, dwarven, random previous-race salvage, or a new neutral ruin kit.~~ **Resolved: any/all — a settlement may mimic more than one neighbouring race's shell library; the mimicked source is named per building (§2.4 rule 12).**
3. ~~Whether the tone should be cute/friendly, eerie/hive, alchemical, fungal, crystalline, or comedic.~~ **Resolved: playful mimicry (Ditto-like), not eerie/hive — bright neon, rounded, glossy.**
4. Whether ordinary doors/windows are needed for slime inhabitants, or should be interpreted as access sluices/viewing frames — **still open**, defaulted to ordinary five-piece openings with a gel-lens pane per §4, since the mimic reproduces the host building's opening layout.
5. Whether "Pulse Pool" and "Elder Blob" should feel religious, communal, biological, magical, or civic — **still open**, defaulted to communal/civic per the cluster-layout evidence; not a blocker for implementation.

### Remaining open items (non-blocking)

- Exact per-settlement rule for how many distinct mimicked source races may appear in one slime settlement (single dominant neighbour vs. free mix) is left to implementation judgement in Task 6 of the plan; either is compliant with §2.4.
- Whether a rare "elder" hue blend (two adjacent neon families) should be settlement-wide or per-building is left to implementation judgement; per-building is the default reading of §2.4-B.1.

### Deferred cross-race/system decisions

- Natural `watchtower` reachability remains a cross-race gap: `watchtower` is not produced by `WARD_TO_KIND` and needs either a landmark slot or a ward mapping decision (doctrine §9.1's gateward-anchor proposal).
- Slime road texture is currently generic cobblestone; a slime road/gutter system should be considered in a later terrain/road pass.
- Territory dressing props (`ooze puddle patch`, `stacked-goo mound`, `glistening slime-trail rocks`) remain outside this building spec unless parent scope expands to settlement environment dressing.
- Interiors are not designed here beyond exterior implications; slime-specific rooms/pools should get their own pass later.
