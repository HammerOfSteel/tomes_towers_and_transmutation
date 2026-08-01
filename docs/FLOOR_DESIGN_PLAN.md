# Floor Visual Design Plan — Tomes, Towers & Transmutation
> Last updated: 2026-07-16

This document tracks the floor-by-floor visual design pass for the tower interior.
Update status column as each floor is implemented. Cross-reference with TODO.md.

---

## Global Systems (do first — all floors benefit)

| Task | Status | Notes |
|---|---|---|
| Circular border ring in `BlueprintRenderer` | ⬜ | Flat `RingGeometry` at y=0.01 in wall material colour — traces chamberRadius footprint |
| UV tiling fix on `wood_plank` material | ⬜ | Scale UVs ×4 so grain runs as planks, not room-scale rings |
| New `makeFloorPlanksTexture` | ⬜ | Parallel plank lines with subtle knot marks — replaces ring pattern on wood floors |
| Torch fire mesh replacement | ⬜ | Replace `addTorchFire` (Point sprites) with 3-quad billboard flame geometry + emissive wobble — matches toy 3D style |
| Bookshelf rotation fix | ⬜ | TowerGenerator must set `rotation` per bookshelf based on which wall arc segment it sits on so books face inward |

---

## New Textures Needed

| Key | Function | Where used |
|---|---|---|
| `alchemy_stone_floor` | `makeAlchemyStoneTexture` — amber-tinted stone, faint etched circles, warm patina | Floor -1 |
| `herald_stone_floor` | `makeHeraldStoneTexture` — large flag-stone tiles, heraldic inlay marks | Floor 0 |
| `floor_planks` | `makeFloorPlanksTexture` — parallel oak planks, N-S grain direction | Floors 1, 3, 6 |
| `damp_stone_floor` | `makeDampStoneTexture` — stone with moisture stain gradient from centre, greenish cracks | Floor 2 |
| `scorched_stone_floor` | `makeScorchedStoneTexture` — dark stone, orange-glow crack lines radiating from centre | Floor 4 |
| `grass_floor` | `makeGrassTexture` — patchy green/brown, dirt paths, moss variation — replaces flat #4a7c3f | Floor 7 |
| `sealed_stone_floor` | `makeSealedStoneTexture` — very dark stone, warding rune glow circles | Floor 8 |
| `celestial_stone_floor` | `makeCelestialStoneTexture` — pale stone, star-constellation inlay | Floor 9 |

---

## New Props Needed

| Builder | Description | Floors |
|---|---|---|
| `buildPotionRack` | Wall-mounted rack of 6–8 bottle shapes, varied heights, coloured glass material | -1 |
| `buildDistillationCoil` | Table-top prop: copper pipe coil + bulb flask, ~0.8 WU tall | -1, 2 |
| `buildReadingTable` | Wide flat table with open-book mesh on top | 1 |
| `buildGlobe` | Sphere on stand, latitude lines engraved | 1 |
| `buildFermentingVat` | Oversized barrel variant with glass-top dome, bubbling glow inside | 2 |
| `buildHerbBundle` | Hanging ceiling prop: bound twigs cluster | 2 |
| `buildAnvil` | Classic anvil silhouette (box body + horn) | 4 |
| `buildCoolingTrough` | Long low box, water-surface material inside | 4 |
| `buildBunk` | Two-tier bed (slime-scaled, functional barracks feel) | 5 |
| `buildMessTable` | Long communal table + 4 stools | 5 |
| `buildMapTable` | Wide flat table with canvas map texture, rolled-scroll corner props | 6 |
| `buildWeaponStand` | A-frame rack holding 2 displayed weapons | 6 |
| `buildPlantPot` | Terracotta pot with foliage cluster on top, varied heights | 7 |
| `buildRaisedPlanter` | Long box planter, soil top, small plant row | 7 |
| `buildAstrolabe` | Nested rotating ring assembly on a pedestal | 9 |

---

## Floor-by-Floor Plan

### Floor −1 — The Lower Laboratory (Alchemy)
**Theme:** Underground alchemical workspace, amber-lit, slightly sinister

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `alchemy_stone_floor` texture |
| Floor texture | Generic grey voronoi stone | Amber-tinted stone, faint etched circles + rune lines |
| Wall texture | Generic stone wall | Keep stone_wall + add `makeRuneEmissiveMap` emissive layer on select wall panels |
| Main props | Cauldron, lectern, workbench_key | + Potion rack (wall), distillation coil, reagent shelf, chalk-circle rug at centre |
| Side rooms | Barrels/crates | Workbench + notes lectern + ingredient barrels + bookshelf (alchemy texts) |
| Rug | None | Dark red/amber with alchemical sigil pattern (style 3 geometric) |
| Interactable text | Already written | Solmor's notes reference specific potions by name |
| Status | ⬜ | — |

---

### Floor 0 — The Grand Entrance Hall
**Theme:** Prestigious welcome space, tall ceilings, institutional stone

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `herald_stone_floor` texture |
| Floor texture | Generic grey stone | Large flag-stone tiles with heraldic inlay (alternating dark/light blocks) |
| Wall texture | Stone wall | Keep + pair of wall banner props (N + S walls) |
| Main props | Pillars, candelabras, quest_board | + Grand entrance rug (dark red + gold border), pair of wall banners, welcome side table |
| Side rooms | Empty | Guard rooms: crate + barrel + maybe duty-board lectern |
| Rug | None | Large ornate 3.0×2.0 rug, dark red + gold — pattern 4 (ornate) |
| Interactable text | Already written | Quest board "Tower Rules" notice |
| Status | ⬜ | — |

---

### Floor 1 — The Reading Galleries
**Theme:** Warm scholar library, wood floors, books everywhere

| Category | Current | Target |
|---|---|---|
| `floorType` | `wood` | `wood` — new `floor_planks` texture (fix UV rings) |
| Floor texture | Ring-pattern wood (looks wrong) | Parallel N-S oak planks, subtle knot marks |
| Wall texture | `wood_dark` | Keep, add wall-shelf strips between bookshelf props |
| Main props | Bookshelves, lectern, telescope, candelabras, pillars | + 2× reading table with open-book, 2× reading chair, ink stand, globe |
| Side rooms | Empty | Private alcoves: 1 bookshelf + lectern + chair + candle (no enemies) |
| Rug | None | Warm deep red + gold border, 2.0×1.4 — per reading table |
| Bookshelf fix | All face same direction | Rotation set per wall-arc segment → books face inward |
| Interactable text | Minimal | Each bookshelf gets 2–3 title strings (seeded from position hash) |
| Status | ⬜ | — |

---

### Floor 2 — The Fermentation Level
**Theme:** Active brewing lab, moisture, copper, strange smells

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `damp_stone_floor` texture |
| Floor texture | Generic stone | Dark stone, moisture stain gradient from cauldron centre outward |
| Wall texture | Stone wall | Keep + stain marks on lower 1/3 of walls (decal material strip) |
| Main props | Cauldron, candelabras | + Fermenting vat (×2), distillation coil, hanging herb bundles, copper coil tubes, sample rack |
| Side rooms | Barrel/crate/bookshelf | Sealed vat side rooms + brew-log lectern |
| Rug | None | Stained floor decal (not a rug) — dark moisture ring geometry |
| Interactable text | Minimal | Vat labels, brew-log lectern text with experiment notes |
| Status | ⬜ | — |

---

### Floor 3 — The Wizard's Chambers
**Theme:** Personal luxury, magical artifacts, lived-in

| Category | Current | Target |
|---|---|---|
| `floorType` | `wood` | `wood` — new `floor_planks` texture, warmer tint `0xc89050` |
| Floor texture | Ring-pattern wood | Warm polished planks |
| Wall texture | `wood_dark` | Keep + tapestry/rug on N wall |
| Main props | Bookshelves, lectern | + Bed + wardrobe (bedroom side), writing desk + quill, star-map rug, display pedestals for artifacts |
| Side rooms | Empty | Bedroom: bed + wardrobe + small bookshelf. Personal study: desk + lectern (no enemies) |
| Rug | None | Ornate purple/gold star-map pattern, circular, 2.2 diameter |
| Interactable text | Diary on lectern | Add personal-item text on pedestals |
| Status | ⬜ | — |

---

### Floor 4 — The Runic Forge
**Theme:** Smithing + enchanting, heat, industrial magic

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `scorched_stone_floor` texture |
| Floor texture | Generic stone | Dark stone, orange crack glow lines radiating from forge position |
| Wall texture | Stone wall | Keep + soot marks near forge (procedural spot decals) |
| Main props | Forge, pillars, bookshelves | + Anvil (near forge), metal rack with enchanted items, cooling trough, bellows |
| Side rooms | Empty | Material storage: crates + wall weapon rack |
| Rug | None | Heat-scar floor circle at forge position (emissive `RingGeometry`) |
| Interactable text | Already written | Metal rack labels (enchanted item names) |
| Status | ⬜ | — |

---

### Floor 5 — The Minion Barracks
**Theme:** Communal military quarters, utilitarian, messy

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — keep, add scratch-mark graffiti via seeded noise spots on walls |
| Floor texture | Generic stone | Keep stone, add worn path lines (lighter stone strip) along main traffic path |
| Wall texture | Stone wall | Keep + small scratch/graffiti marks (minimal texture variant) |
| Main props | Quest_board | + Bunk bed rows (×3), mess table + stools, duty-board lectern, personal-shelf scraps |
| Side rooms | Empty | Sleeping quarters: 2 bunks + small crate. Mess room: mess table + barrel |
| Rug | None | Worn mat near entrance (plain `buildRug` style 0, muted brown) |
| Interactable text | Duty rota | Add bunk graffiti labels, mess menu text |
| Status | ⬜ | — |

---

### Floor 6 — The War Room
**Theme:** Military command, campaign maps, trophy hunting

| Category | Current | Target |
|---|---|---|
| `floorType` | `wood` | `wood` — new `floor_planks` texture, darker tint `0x7a5030` |
| Floor texture | Ring-pattern wood | Dark battle-worn planks, scuff marks baked in |
| Wall texture | `wood_dark` | Keep + mounted trophy items on walls (banner pair + weapon stand) |
| Main props | Quest_board, pillars, lectern | + Campaign map table, weapon stand pair, trophy shelf |
| Side rooms | Empty | Briefing rooms: lectern + wall-map scroll |
| Rug | None | Campaign table has canvas map texture — no separate rug |
| Interactable text | Already written | Add weapon stand "this belonged to…" text |
| Status | ⬜ | — |

---

### Floor 7 — The Botanical Laboratory
**Theme:** Living garden, naturalistic, growing things

| Category | Current | Target |
|---|---|---|
| `floorType` | `grass` | `grass` — new `grass_floor` texture (replaces flat #4a7c3f colour) |
| Floor texture | Flat green colour | Patchy green/brown, dirt paths, moss variation |
| Wall texture | Stone wall | Keep stone + vine-wrap overlay on pillars (green cylinder sleeve) |
| Main props | Greenhouse_orb | + Plant pots (varied, ×6), raised planter boxes (×2), vine-covered pillar wraps, water basin |
| Side rooms | Empty | Specimen side rooms: different plant clusters, soil textures |
| Rug | None | Soft moss mat near orb (style 0, green tones) |
| Interactable text | Greenhouse orb | Add plant specimen labels |
| Status | ⬜ | — |

---

### Floor 8 — The Forbidden Archive
**Theme:** Dark, sealed, dangerous knowledge, heavily warded

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `sealed_stone_floor` texture |
| Floor texture | Generic stone | Very dark stone, large warding rune glow circles on floor |
| Wall texture | Stone wall | Keep + emissive rune panels on every 3rd wall tile |
| Main props | Lectern, bookshelves | + Containment circle floor decal (large emissive ring), chained bookcases, sealed cabinet props, warning lecterns |
| Side rooms | Empty | Sealed alcoves: chained door geometry, no traversal props, heavy atmosphere |
| Rug | None | Containment circle replaces rug concept — emissive `RingGeometry`, deep blue/gold |
| Interactable text | Minimal | Each chained bookcase gets a seal/restricted notice text |
| Status | ⬜ | — |

---

### Floor 9 — The Celestial Observatory
**Theme:** Open sky feel, precision instruments, astronomy

| Category | Current | Target |
|---|---|---|
| `floorType` | `stone` | `stone` — new `celestial_stone_floor` texture |
| Floor texture | Generic stone | Pale stone, constellation star-map inlaid on floor (emissive dots + lines) |
| Wall texture | Stone wall (low parapet, wallHeight=1.2) | Keep low parapet feel + brass telescope ring mount on parapet edge |
| Main props | Telescope | + Astrolabe (rotating ring assembly on pedestal), star-chart rug (circular, dark blue/gold), brass compass ring on floor, viewing bench |
| Side rooms | None (open observatory) | No side rooms — keep open plan |
| Rug | None | Star-chart circle (canvas texture, dark blue), 2.0 diameter, at floor centre |
| Interactable text | Telescope text good | Add astrolabe + compass ring text |
| Status | ⬜ | — |

---

## Implementation Order

1. ⬜ **Global: UV tiling fix + `makeFloorPlanksTexture`** — fixes wood floors 1, 3, 6 immediately
2. ⬜ **Global: Circular border ring** — single `BlueprintRenderer` change, all floors benefit
3. ⬜ **Global: Torch fire mesh replacement** — affects all torch positions
4. ⬜ **Global: Bookshelf rotation fix** — affects floors 1, 3, 8
5. ⬜ **Floor -1 (Alchemy)** — new texture + potion rack + distillation coil
6. ⬜ **Floor 0 (Foyer)** — herald tile + grand rug + banners
7. ⬜ **Floor 1 (Library)** — plank fix + reading table + globe
8. ⬜ **Floor 2 (Brewing)** — damp stone + fermenting vat + herb bundles
9. ⬜ **Floor 3 (Chambers)** — plank warm tint + bed/wardrobe + star rug
10. ⬜ **Floor 4 (Forge)** — scorched stone + anvil + cooling trough
11. ⬜ **Floor 5 (Barracks)** — scratch graffiti + bunks + mess table
12. ⬜ **Floor 6 (War Room)** — dark planks + map table + weapon stands
13. ⬜ **Floor 7 (Garden)** — grass texture + plant pots + vine pillars
14. ⬜ **Floor 8 (Archive)** — sealed stone + containment circle + chained bookcases
15. ⬜ **Floor 9 (Observatory)** — celestial stone + astrolabe + star-chart rug
