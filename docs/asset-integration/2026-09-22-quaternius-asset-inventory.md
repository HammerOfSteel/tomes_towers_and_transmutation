# Quaternius Asset Inventory

*Source: `/Users/terrygoleman/Downloads/game_assets/buildings/quaternius/` (local
filesystem, outside this repo — not committed, not LFS-tracked). Surveyed via
`unzip -l` listings and JSON-sniffing sampled `.gltf` files (checked for
`animations`/`skins` keys) without extracting the full packs. 8 subfolders,
15 zip archives, ~570 MB total.*

> **Correction (post-playtest, later step-2 session).** An earlier revision
> of this document and the step-2 import pass framed 4 packs
> (`modern_type_buildings/` both sub-packs, `modular_dungeons/Ultimate Modular
> Sci-Fi`, `nature_props/`) as excluded for "tonal mismatch" or "pending a
> style decision." **That was wrong and has been reversed at the user's
> explicit, direct instruction: every asset in every pack under the source
> folder is imported, with no taste/style filtering, period.** All 14
> non-orphaned zips (see the Import scope table below) are now imported.
> This document has been corrected throughout to remove that framing. It
> also documents two real, unavoidable data gaps found while fixing this
> (not exclusions — everything that exists in the source data is imported):
> `nature_props/` genuinely has no diffuse texture data locally (confirmed
> via live Blender MCP inspection of all 62 source `.blend` files, not just
> assumption — see the per-pack section below; **no colour is invented for
> this gap**, per explicit user directive), and
> `monsters/Bestiary - Dungeon Monsters` ships zero animation keyframe data
> in either of its export formats. Both are disclosed in detail in their
> sections below and in `scripts/extract-quaternius-assets.mjs`'s header
> comment.
>
> **Second correction (post-Sub-task-1 playtest, 2026-09-23).** The original
> version of this document also wrongly concluded that
> `modular_dungeons/Textures.zip` was orphaned with nothing to attach it to.
> It was not — 13 of the 92 dungeon-kit pieces (the "Overgrown" family) use
> materials that were always meant to carry these exact textures; an OBJ
> exporter bug had silently dropped the texture reference. This has been
> found and fixed (real textures wired in, not a guess) — see the
> `modular_dungeons/` section and open question #3 below for the full
> account. Separately, an earlier fix attempt for `nature_props/` used a
> name-based colour-guessing heuristic when real textures were missing;
> this was rejected by the user as fabrication and has been removed
> entirely — see open question #2.

This is the first deliverable of the 3D Asset Integration initiative (see
[`README.md`](./README.md)). It does **not** decide implementation — it
records what exists, in what form, and where it could plug into the existing
procedural systems, so step 2 (import system) and step 3 (wiring spec) start
from ground truth instead of assumptions.

## TL;DR

| Pack | Assets | Format | Modular? | Animated/Rigged? | Textures | Fit |
|---|---|---|---|---|---|---|
| `animals/` Ultimate Animated Animals | 12 | GLTF+bin, FBX, OBJ, .blend | Monolithic (one mesh per animal) | ✅ 13 anim clips, 1 skin (Cow sample) | Embedded materials, no external texture files found in listing | Animal spawn placement |
| `monsters/` Animated Monster Pack | 4 | FBX, .blend | Monolithic | Likely rigged (pack name says "Animated"; not sniffed — no gltf to sample) | 1 jpg preview only | Monster spawn placement |
| `monsters/` Bestiary Dungeon Monsters | 2 | FBX, GLB | Monolithic | **Confirmed static — no animation data** (zero `AnimCurveNode` occurrences in either FBX or GLB source, verified via raw byte inspection) | 16 PNG textures | Monster spawn placement (static use, e.g. dungeon set-dressing) |
| `monsters/` Cute Animated Monsters | 21 | GLTF+bin, FBX, OBJ, .blend | Monolithic | ✅ 10 anim clips, 1 skin (Yeti sample) | 21 PNG (per-model) | Monster spawn placement |
| `fantasy_props/` Fantasy Props MegaKit | 94 | GLTF+bin, FBX, OBJ, .blend | Monolithic per prop (kit-of-many, not modular geometry) | ❌ static | Full PBR set (BaseColor/Normal/ORM) per material, 43 PNG | Building interiors, settlement dressing, dungeon set-dressing |
| `fantasy_props/` Ultimate Food Pack | 103 | FBX, OBJ, .blend | Monolithic per item | ❌ static | 1 PNG only (likely a shared atlas — needs confirming) | Food/kitchen dressing (interiors, markets) |
| `medieval_village_pack/` Buildings | 10 | FBX, OBJ, .blend | **Monolithic** — one mesh per whole building | ❌ static | none listed separately (baked into FBX likely) | Human settlement buildings (direct building swap, not kit-of-parts) |
| `medieval_village_pack/` Props | 34 | FBX, OBJ, .blend | Monolithic per prop | ❌ static | none listed separately | Settlement/street dressing |
| `modern_type_buildings/` City Pack | 9 | GLB (Blender material-fix export), FBX, OBJ, .blend | Monolithic | ❌ static | Real image textures preserved via material-fix pipeline | Imported (see per-pack section) — building swap for modern-styled territory, or dressing |
| `modern_type_buildings/` Interior Pack | 102 | GLB (Blender material-fix export), FBX, OBJ, .blend | ✅ kit-of-parts (with `_Base`/`_Mat` split variants) | ❌ static | Real image textures preserved via material-fix pipeline | Imported — building interiors, tower/indoor dressing |
| `modular_dungeons/` OBJ (Bestiary-style dungeon kit) | 92 | OBJ+MTL | ✅ **true kit-of-parts** (walls, arches, floors, columns, props) | ❌ static (one `Character_Animated.obj` outlier — likely a rig demo, not a placeable) | Most materials are genuinely flat vertex-colour (no map, real authored dark stone/dungeon palette). **Correction (post-Sub-task-1 playtest)**: a 13-piece "Overgrown" sub-family (walls/curves/windows with vine dressing, plus bushes/trees) uses 4 materials (`Green`/`Leaf_Texture`/`Texture_Leaves`/`Bark`) that the Blender OBJ exporter silently dropped the `map_Kd` directive for, leaving a flat mid-grey placeholder (`Kd 0.64 0.64 0.64`) instead of the real texture. The real texture files (`Leaf_Texture.png`, `Bark_Texture.jpg`) were found unextracted in the sibling `modular_dungeons/Textures.zip` and are now wired in — see the per-pack section below. | **Best fit for `DungeonGenerator.ts`/`BlueprintRenderer.ts` wall/floor dressing** |
| `modular_dungeons/` Ultimate Modular Sci-Fi | 91 | GLB (Blender material-fix export), FBX, OBJ, .blend | ✅ true kit-of-parts | ❌ static | Real image textures preserved via material-fix pipeline | Imported — sci-fi/tech dungeon or tower variant |
| `modular_fantasy_village/` Medieval Village MegaKit | 176 | GLTF+bin, FBX, OBJ, .blend | ✅ **true kit-of-parts** (walls/corners/doors/floors/roofs/stairs by material variant) | ❌ static | 54 PNG (full PBR set) | **Best fit for `BuildingGenerator.ts` + per-faction `*Kit.ts` wall/roof/corner module patterns** |
| `nature_props/` Blends | 63 | GLB (Blender material-fix export), `.blend` only in source | Monolithic per prop | ❌ static | **Genuine, confirmed-unrecoverable data gap** (see per-pack section below): the actual diffuse texture files (`Flowers.png`, `Bush_Leaves.png`, `NormalTree_Bark.png`, etc. — 20 distinct filenames) do not exist anywhere in the locally supplied data — verified via live Blender MCP inspection of all 62 `.blend` files' internal packed-image data, not just file-listing assumptions. **Per explicit user directive, no invented/guessed colour is used** — an earlier name-based colour-fallback heuristic (leaf→green, flower→pink) was removed; materials with unrecoverable data are left untouched (no `baseColorFactor`/`baseColorTexture`), which renders as a plain flat/dark shape rather than a fabricated colour. | Imported — trees/rocks/flowers/bushes for `NatureAssetBuilder.ts` placement, with the disclosed texture gap |

## Import scope — every one of the 15 zips, explicitly

**Revision note (2026-09-22, post-step-2 review, corrected again in the
Blender material-fix pass):** the table above and the per-pack sections
below have always covered all 15 zips across all 8 source subfolders —
nothing was silently dropped from *this document*. An earlier pass of the
actual game import pipeline DID silently drop 4 packs under a "tonal
mismatch" rationale; that was reversed at the user's explicit instruction.
This table is the corrected, current answer:

| # | Source folder | Zip | Imported? | Manifest pack id | Notes |
|---|---|---|---|---|---|
| 1 | `animals/` | Ultimate Animated Animals | ✅ Yes | `animals/ultimate_animated_animals` | — |
| 2 | `fantasy_props/` | Fantasy Props MegaKit | ✅ Yes | `fantasy_props/fantasy_props_megakit` | — |
| 3 | `fantasy_props/` | Ultimate Food Pack | ✅ Yes | `fantasy_props/ultimate_food_pack` | Re-exported as GLB via the Blender material-fix pipeline (was rendering as flat black/gray "shadows") |
| 4 | `medieval_village_pack/` | Buildings | ✅ Yes | `medieval_village_pack/buildings` | Re-exported as GLB via the Blender material-fix pipeline |
| 5 | `medieval_village_pack/` | Props | ✅ Yes | `medieval_village_pack/props` | Re-exported as GLB via the Blender material-fix pipeline |
| 6 | `modern_type_buildings/` | City Pack (Buildings Pack, Jan 2019) | ✅ Yes | `modern_type_buildings/city_pack` | Re-exported as GLB via the Blender material-fix pipeline |
| 7 | `modern_type_buildings/` | Interior Pack (Ultimate Textured Building Pack, Dec 2019) | ✅ Yes | `modern_type_buildings/interior_pack` | Re-exported as GLB via the Blender material-fix pipeline; some materials keep real linked image textures (not just flat colour) |
| 8 | `modular_dungeons/` | OBJ (fantasy dungeon kit-of-parts) | ✅ Yes | `modular_dungeons/obj_kit` | Flat, authored `Kd` colours (no texture maps) were rendering near-black/shiny due to a colour-space double-decode in the OBJ/MTL loader — fixed at runtime in `QuaterniusAssetLoader.ts` (see per-pack section below); no re-export needed |
| 9 | `modular_dungeons/` | Textures.zip | ❌ No | — | Genuinely orphaned: confirmed the 2 loose PNGs (`Bark_Texture.jpg`, `Leaf_Texture.png`) are not referenced by any of the 92 `.mtl` files in the OBJ kit (zero `map_*` directives anywhere in that kit) — there is no mesh in this repo's source data for these 2 files to attach to |
| 10 | `modular_dungeons/` | Ultimate Modular Sci-Fi | ✅ Yes | `modular_dungeons/ultimate_modular_scifi` | Re-exported as GLB via the Blender material-fix pipeline |
| 11 | `modular_fantasy_village/` | Medieval Village MegaKit | ✅ Yes | `modular_fantasy_village/medieval_village_megakit` | — |
| 12 | `monsters/` | Animated Monster Pack | ✅ Yes | `monsters/animated_monster_pack` | Re-exported as GLB via the Blender material-fix pipeline |
| 13 | `monsters/` | Bestiary - Dungeon Monsters Kit | ✅ Yes | `monsters/bestiary_dungeon_monsters` | Only 2 monsters (Imp, Puglin) — confirmed this is the actual, full content of the Standard tier of this pack, not a partial extraction. Ships zero animation keyframe data in either FBX or GLB source (confirmed via raw FBX byte inspection) — static poses only, a genuine content limitation |
| 14 | `monsters/` | Cute Animated Monsters | ✅ Yes | `monsters/cute_animated_monsters` | — |
| 15 | `nature_props/` | Blends.zip | ✅ Yes | `nature_props/nature_props` | Re-exported as GLB via the Blender material-fix pipeline. Genuine texture gap: the `.blend` files reference external PNGs that do not exist anywhere in the provided source data — materials use a documented name-based colour fallback, not recovered textures |

**14 of 15 zips are imported (813 models total).** The 1 exception
(`modular_dungeons/Textures.zip`) is not an exclusion — it's 2 loose texture
files with no mesh anywhere in the source data to attach them to, confirmed
by inspecting every `.mtl` in the sibling OBJ kit.

## Asset Lab categorization hierarchy (Category → Pack → Sub-group)

The step-2 Asset Lab dev view initially presented every model as one flat
list per top-level category button (e.g. "DUNGEON KIT" → 92 undifferentiated
items), which made it impossible to tell what kit a piece came from or how
the kit's pieces relate to each other. This section defines the
**Category → Pack → Sub-group** hierarchy the dev view should actually use,
derived from the real per-pack model lists (verified against the generated
manifest — every model in every pack below is accounted for, no leftovers).
Small/flat packs (animals, both non-village building packs, all 3 monster
packs) don't need a sub-group level — they're already a single coherent set.

### `dungeon_kit` category → `modular_dungeons/obj_kit` (92 pieces)

| Sub-group | Count | Pieces |
|---|---|---|
| Walls & Windows | 15 | `Wall`, `Wall_Arch_Gothic`, `Wall_Arch_Round(_Broken/_Overgrown/_Overgrown_Broken)`, `Wall_Broken`, `Wall_Double_Broken/Hole`, `Wall_Half/Hole/Overgrown`, `Window_Bars(_Double)(_Overgrown)` |
| Arches, Doors & Columns | 16 | `Arch_Gothic(_RoundColumn)`, `Arch_Round(_RoundColumn)`, `Column_Round/Round_Short/Square/BridgeSupport`, `Doors_GothicArch/RoundArch(_Covered)`, `Support_Center/Left/Right/Tall` |
| Floors | 8 | `Floor_Diamond`, `Floor_Hole_Corner/Straight`, `Floor_SquareLarge`, `Floor_Squares`, `Floor_Standard(_Half)`, `Floor_Tree` |
| Stairs, Bridges & Traversal | 11 | `Bridge_Section`, `Curve_1/2(_Overgrown)`, `Rail_Corner/Divider/Straight`, `Stairs`, `Stairs_2`, `Trapdoor` |
| Furniture & Containers | 12 | `Barrel`, `Bookcase_Empty/Full`, `Chest(_Gold)`, `Crate`, `Pot1-3(_Broken)` |
| Nature & Overgrowth Dressing | 12 | `Bush_1x1/2x1/2x2/Large/Round`, `DeadTree_1-3`, `Tree_1-3`, `Grass` |
| Lighting & Decor | 10 | `Candles_1/2`, `Flag_GothicArch/RoundArch/Wall/Wall2`, `Skull`, `Statue_Fox/Stag`, `Torch` |
| Traps & Interactive | 2 | `BearTrap_Closed/Open` |
| Misc / Other | 6 | `Brick`, `Bricks`, `Cart`, `Window_Open(_Double)`, `Character_Animated` (outlier — a rigged demo mesh, not a placeable dungeon piece) |

### `village_kit` category → `modular_fantasy_village/medieval_village_megakit` (176 pieces)

**⏸ DEFERRED (Sub-task 2)**: not used for Sub-task 2's building swap-in.
Assembling these 176 kit-of-parts pieces (walls, roofs, floors, doors,
overhangs, balconies) requires a wall/roof/floor layout engine comparable
to `TerrainGeometryBuilder.ts`/dungeon blueprint assembly — a materially
bigger lift than the whole-building swap done this sub-task
(`medieval_village_pack/buildings`, 10 monolithic models). Flagged as a
candidate for a future sub-task, per the plan's explicit scope note.

| Sub-group | Count | Pieces (representative) |
|---|---|---|
| Roofs | 39 | `Roof_RoundTiles_*` (many size variants), `Roof_Wooden_2x1_*`, `Roof_Front_Brick*`, `Roof_Dormer_RoundTile`, `Roof_Tower_RoundTiles`, `Roof_Log`, `Roof_Support2` |
| Overhangs & Balconies | 24 | `Overhang_Plaster_*`, `Overhang_UnevenBrick_*`, `Overhang_Side_*`, `Balcony_Cross/Simple_Corner/Straight` |
| Stairs & Hole Covers | 24 | `Stair_Interior_*`, `Stairs_Exterior_*` (many variants), `HoleCover_*` |
| Props & Dressing | 23 | `Prop_Brick1-4`, `Prop_Chimney(2)`, `Prop_Vine1/2/4/5/6/9`, `Prop_WoodenFence_*`, `Prop_MetalFence_*`, `Prop_Wagon`, `Prop_Crate`, `Prop_Support`, `Prop_ExteriorBorder_*` |
| Walls | 20 | `Wall_Plaster_*`, `Wall_UnevenBrick_*`, `Wall_Arch`, `Wall_BottomCover` |
| Windows & Shutters | 14 | `Window_Shutters_Thin/Wide_Flat/Round_Open/Closed`, `Window_Thin/Wide_Flat/Round1`, `Window_Roof_Thin/Wide` |
| Doors & Door Frames | 12 | `Door_1/2/4/8_Flat/Round`, `DoorFrame_Flat/Round_Brick/WoodDark` |
| Floors | 12 | `Floor_Brick`, `Floor_RedBrick`, `Floor_UnevenBrick`, `Floor_WoodDark(_Half1/2/3)(_OverhangCorner)(2)`, `Floor_WoodLight(_OverhangCorner)(2)` |
| Corners & Edges | 8 | `Corner_Exterior(Wide)_Brick/Wood/TopDown/TopOnly`, `Corner_Interior_Big/Small` |

### `props` category → `fantasy_props/fantasy_props_megakit` (94 pieces)

| Sub-group | Count | Pieces (representative) |
|---|---|---|
| Storage & Containers | 18 | `Barrel(_Apples/_Holder)`, `Bucket_Metal/Wooden1`, `Cage_Small`, `Chest_Wood`, `Crate_Metal/Wooden`, `FarmCrate_Apple/Carrot/Empty`, `Pot1(_Lid)`, `PouchLarge`, `Vase2/4`, `VaseRubbleMedium` |
| Furniture | 14 | `BedTwin1/2`, `Bench`, `Bookcase2`, `Cabinet`, `Chair1`, `NightstandShelf`, `Shelf*`, `Stool`, `TableLarge`, `Workbench(Drawers)` |
| Books & Scrolls | 14 | `Book5/7`, `BookGroupMedium1-3`, `BookGroupSmall1-3`, `BookSimplifiedSingle`, `BookStack1/2`, `BookStand`, `Scroll1/2` |
| Tableware & Alchemy | 12 | `Bottle1`, `Chalice`, `Mug`, `Potion1/2/4`, `SmallBottle(s1)`, `TableFork/Knife/Plate/Spoon` |
| Tools & Weapons | 8 | `Anvil(Log)`, `AxeBronze`, `PickaxeBronze`, `ShieldWooden`, `SwordBronze`, `WeaponStand`, `Whetstone` |
| Lighting | 8 | `Candle1/2`, `CandleStick(Stand/Triple)`, `Chandelier`, `LanternWall`, `TorchMetal` |
| Misc Dressing | 8 | `Bag`, `Carrot`, `Cauldron`, `ChainCoil`, `Dummy`, `Rope1-3` |
| Currency & Valuables | 5 | `Coin`, `CoinPile(2)`, `KeyGold/Metal` |
| Banners & Cloth | 4 | `Banner1/2(Cloth)` |
| Market Stalls | 3 | `PegRack`, `StallCartEmpty`, `StallEmpty` |

### `props` category → `fantasy_props/ultimate_food_pack` (103 pieces)

| Sub-group | Count | Pieces (representative) |
|---|---|---|
| Prepared Food | 53 | `Burger*`, `Cheeseburger`, `Hotdog(Bun)`, `Pizza*`, `Sushi*`, `Sashimi*`, `Pancake(sStack)`, `Waffle`, `Donut1-4`, `Fries`, `Croissant`, `Bread(Slice)`, `Steak(Burned)`, `Bacon*`, `Corndog`, `ChickenLeg`, `Fish(Bone)`, `Egg*`, `Cupcake`, `IceCream*`, `Popsicle*` |
| Raw Produce | 21 | `Apple(Green)`, `Avocado(Empty)`, `Banana`, `Broccoli`, `Carrot`, `Coconut(Half)`, `Eggplant`, `Lettuce(Whole)`, `Mushroom(Sliced)`, `Orange`, `PepperGreen/Red`, `Pumpkin`, `Tomato(Slice)`, `Turnip` |
| Condiments & Drinks | 12 | `Bottle1/2`, `CheeseSingles`, `ChocolateBar`, `KetchupBottle`, `KetchupMustard`, `MayoBottle`, `MustardBottle`, `PeanutButter(2)`, `Soda`, `SoySauce` |
| Kitchenware | 13 | `Chopsticks`, `CookingPot(Soup)`, `CookingPot2(Soup)`, `Fork`, `FryingPan`, `JarLarge`, `Knife`, `Plate(Square/2)`, `Spoon` |
| Misc / Other | 4 | `DoubleCheeseburger`, `SausageCooked/Raw`, `Tentacle` |

### `village` category → `medieval_village_pack/props` (34 pieces)

| Sub-group | Count | Pieces |
|---|---|---|
| Street Furniture | 8 | `Bench1/2`, `Fence`, `Gazebo`, `PathSquare/Straight`, `Stairs`, `Well` |
| Storage & Carts | 8 | `Bag(Open)`, `Bags`, `Barrel`, `Cart`, `Crate`, `Package1/2` |
| Building Facade Parts | 6 | `DoorRound/Straight`, `Window1-4` |
| Natural Dressing | 4 | `Hay`, `Rock1-3` |
| Fire & Smoke | 3 | `Bonfire(Lit)`, `Smoke` |
| Market | 2 | `MarketStand1/2` |
| Misc / Other | 3 | `Bell`, `Cauldron`, `SawmillSaw` |

### Packs left flat (no sub-group level needed)

- `animals/ultimate_animated_animals` (12) — one coherent set of animals.
- `medieval_village_pack/buildings` (10) — one whole building per item, already atomic.
- `monsters/animated_monster_pack` (4), `monsters/bestiary_dungeon_monsters` (2),
  `monsters/cute_animated_monsters` (21) — each pack is small enough to browse flat.

This taxonomy (Category button → Pack section → Sub-group heading → items)
is the structure step 2's revised Asset Lab UI must use; it is not
implemented in code yet as of this doc revision — see the design doc's
"Implementation notes" for the follow-up work.

## Per-pack detail

### `animals/` — Ultimate Animated Animals (July 2021)
39 MB. 12 animals: **Alpaca, Bull, Cow, Deer, Donkey, Fox, Horse,
Horse_White, Husky, ShibaInu, Stag, Wolf**. Formats present per model: `.gltf`
+ `.bin` (glTF separate binary), `.obj`+`.mtl`, `.fbx`, `.blend`. Sampled
`Cow.gltf`: **rigged (1 skin)** with **13 animation clips** —
`Attack_Headbutt, Attack_Kick, Death, Eating, Gallop, Gallop_Jump, Idle,
Idle_2, Idle_Headlow, Idle_HitReact1, Idle_HitReact2, Jump_toIdle, Walk`. 7
materials, no separate image files listed in the zip (materials likely
color-only or embedded) — needs confirming at import time whether these need
texture files or use flat/vertex-color materials only.

**Plug-in point**: `src/world/AmbientWildlife.ts` (currently 2 procedural
species — rabbit, goat — built from `CreatureDNA`/`CreatureBuilder.ts`) and
any future hostile-animal spawn table. Direct biome fit guesses using
`WorldGrid.ts`'s `BiomeId` list (`deep_ocean, ocean, beach, desert, savanna,
grassland, forest, taiga, tundra, snow, mountain`):
- Deer, Stag, Wolf, Fox → `forest`, `taiga`
- Horse, Horse_White, Bull, Cow, Donkey → `grassland`, `savanna` (farmland/plains)
- Husky, ShibaInu → likely settlement/companion animals rather than wild spawns
- Alpaca → `mountain`, `tundra`
None of this is final — just a first-pass note for step 3's spec.

### `monsters/` — 3 sub-packs, differing quality
- **Animated Monster Pack by @Quaternius**: 4 monsters — **Bat, Dragon,
  Skeleton, Slime**. FBX + .blend only, no gltf to sample; pack name asserts
  "Animated" but rig/clip presence is **unconfirmed** pending an actual FBX
  inspection (step 2). Only 1 jpg preview image in the whole zip — texture
  completeness unclear.
- **Bestiary - Dungeon Monsters Kit**: 2 monsters — **Imp, Puglin**. FBX + GLB
  + 16 PNG textures, no gltf/JSON to sniff for skins (GLB is binary; would
  need to actually load it or inspect with a glTF tool in step 2). Named
  "Kit" but only contains 2 creature models — likely a small standalone pack,
  not a modular kit.
- **Cute Animated Monsters (Aug 2020)**: 21 monsters — **Alien, Alien_Tall,
  Bat, Bee, Cactus, Chicken, Crab, Cthulhu, Cyclops, Deer, Demon, Ghost,
  GreenDemon, Mushroom, Panda, Penguin, Pig, Skull, Tree, YellowDragon,
  Yeti**. Sampled `Yeti.gltf`: **rigged (1 skin)**, **10 animation clips** —
  `Bite_Front, Bite_InPlace, Dance, Death, HitRecieve, Idle, Jump, No, Walk,
  Yes`. 21 PNG textures (one per model). This is the richest, most reliably
  animated monster set and the best first candidate for a monster-spawn
  integration.

**Plug-in point**: no dedicated `MonsterSpawn`/`AnimalSpawn` table exists yet
in this codebase — enemies are built per-encounter via
`src/enemy-creator/builder.ts` + `EnemyDNA` (procedural FK rig, same family as
`CreatureBuilder.ts`). A real-asset monster would need a new spawn-selection
path parallel to (not replacing) `buildEnemy()`. Rough biome/context fit:
`Cactus`, `Alien` → `desert`; `Yeti` → `tundra`/`snow`/`mountain`; `Ghost`,
`Skull`, `Demon`, `GreenDemon`, `Cthulhu` → dungeon/undead-adjacent spawns
(fits `undead_common`/`vampire` faction territories or `DungeonGenerator.ts`
rooms); `Crab` → `beach`; `Bee`, `Mushroom`, `Tree`, `Chicken`, `Pig`, `Panda`,
`Penguin`, `Deer` → overworld ambient/wildlife-adjacent rather than hostile.

### `fantasy_props/` — 2 packs
- **Fantasy Props MegaKit**: 94 static props (furniture, tools, containers,
  lighting, weapon racks — e.g. `Anvil, Bed_Twin1/2, Bookcase_2, Cauldron,
  Chandelier, Chest_Wood, Table_Large, Workbench, Sword_Bronze,
  Shield_Wooden`, full list has book/candle/potion/crate/barrel variants
  too). Confirmed **static, full PBR** (`BaseColor`/`Normal`/`ORM` textures
  per material — sampled `Anvil.gltf`). This is the highest-fidelity, most
  game-ready static prop set of the whole survey.
  - **✅ WIRED (Sub-task 2, Task 3)**: `Bookcase_2, Table_Large, Chair_1,
    Cauldron, Lantern_Wall, Chest_Wood, Barrel, Barrel_Apples,
    Crate_Wooden, Crate_Metal` are all mapped in `InteriorPropAdapter.ts`
    to `PropKind`s `bookshelf, table, chair, cauldron, lantern, chest,
    barrel, crate`. `Table_Fork/Knife/Plate/Spoon` were measured (6mm-20mm
    tall) and explicitly excluded — flat cutlery, not tables.
- **Ultimate Food Pack (Oct 2019)**: 103 food/kitchen items — answers the
  "hidden food props" question from the kickoff: food lives inside
  `fantasy_props/`, not a separate top-level category. Covers raw ingredients
  (`Carrot, Broccoli, Eggplant, Tomato, Lettuce, Mushroom, Pepper_Green/Red`),
  prepared food (`Burger, Cheeseburger, Pizza, Hotdog, Sushi_*, Pancakes_Stack,
  Fries, Donut1-4, IceCream_*`), and cooking gear (`CookingPot, FryingPan,
  Plate, Fork, Knife, Spoon`). FBX/OBJ/.blend only — **no gltf and only 1 PNG
  in the whole zip**, unlike the MegaKit's full PBR set; texture completeness
  for this pack needs verifying in step 2 (may rely on flat/vertex colors).

**Plug-in point**: `src/world/buildings/InteriorGenerator.ts` (building
interior dressing) and settlement market-stall dressing
(`src/world/buildings/*` faction kits, `SettlementPopulator.ts`).

### `medieval_village_pack/`
- **✅ WIRED (Sub-task 2, Task 1-2)**: `QuatBuildingAdapter.ts` resolves
  `(faction, buildingKind)` to a real model from this pack (plus
  `modern_type_buildings/city_pack`) whenever `isCategoryEnabled
  ('settlement-buildings')` is true; `SettlementRenderer.renderSettlementPlan()`
  fires the async swap-in per building. Verified live in the Settlement Lab
  (real/procedural toggle) across multiple factions/seeds.
- **Buildings** (10): `Bell_Tower, Blacksmith, House_1, House_2, House_3,
  House_4, Inn, Mill, Sawmill, Stable`. **Monolithic** — each is a single
  building mesh, not modular pieces, unlike `modular_fantasy_village/` below.
  Best used as direct building-type swaps (parallel to
  `BuildingGenerator.ts`'s procedural output for specific `BuildingType`s),
  not assembled via the kit-of-parts wall/roof/corner pattern the codebase's
  faction kits use.
- **Props** (34): street/settlement dressing — `Cart, Well, MarketStand_1/2,
  Fence, Gazebo, Bonfire(_Lit), Bell, Stairs, Path_Square/Straight,
  Window_1-4, Door_Round/Straight` (the last four are swappable
  building-facade pieces, closer to kit-of-parts than the buildings
  themselves).
  - **✅ WIRED (Sub-task 2, Task 3)**: `Door_Round`/`Door_Straight` and
    `Cauldron` are mapped in `InteriorPropAdapter.ts`'s `door`/`cauldron`
    `PropKind` pools (measured, height-normalised against the procedural
    builder's own reference height, not trusted at native scale — see
    that file's doc comment). Other street/settlement props in this list
    are not yet wired to any PropKind.

**Faction fit** (first pass, using `Faction` from `BuildingDNA.ts`: human_rural,
human_town, human_noble, elven, dwarven, vampire, undead_common, draconic,
celestial, vulperia, slime, fae, orcish): this whole pack reads as generic
Western-medieval and fits `human_rural`/`human_town` territories best; it
does not obviously suit elven/dwarven/orcish/vampire/undead/slime/fae style
territories without re-texturing or re-dressing, which is out of scope for
"drop-in real assets" and should be flagged to the user rather than assumed.

### `modern_type_buildings/` — 2 packs, imported
- **City Pack (Jan 2019)**: 9 buildings (`Building1-4` variants,
  `House1/2`) — contemporary/modern architecture. Re-exported as GLB via
  the Blender material-fix pipeline (source `.blend` files used a legacy
  Diffuse BSDF material graph that rendered as flat black/gray "shadows"
  until fixed).
- **Interior Pack (Dec 2019)**: 102 pieces — `1Story` through `6Story`
  building modules with `_Base`/`_Mat`/roof-style suffixes (`GableRoof`,
  `RoundRoof`, `Balcony`, `Columns`, `Sidehouse`, `Stairs`, etc.), plus
  standalone interior/facade dressing (`Door*`, `Window*`, `Sign_*`,
  `Bricks_*`, `Pipe*`, `AC_Unit*`, `Staircase`). Some materials in this
  pack use real linked image textures (not just flat colour) — the
  material-fix pipeline preserves the texture link when rewiring to a
  Principled BSDF rather than discarding it.

Both packs are monolithic/modular modern-architecture buildings with no
obvious 1:1 faction fit in this game's fantasy setting (human/elven/
dwarven/vampire/undead/draconic/celestial/vulperia/slime/fae/orcish). Per
explicit user instruction, this is **not a reason to exclude them** — they
are imported like every other pack; the wiring spec (step 3) can decide
which territories/uses actually draw on them (e.g. a modern-styled human
outpost, or as generic "non-magical" interior dressing) without blocking
import on a perfect style match.

### `modular_dungeons/` — 2 kits (both imported) + 1 genuinely orphaned texture zip
- **OBJ kit** (92 pieces, OBJ+MTL): genuinely modular dungeon kit-of-parts —
  `Arch_Gothic(_RoundColumn)`, `Arch_Round(_RoundColumn)`, `Wall`,
  `Wall_ArchGothic/ArchRound(_Broken/_Overgrown)`, `Wall_Broken`,
  `Wall_Double_Broken/Hole`, `Wall_Half/Hole/Overgrown`, `Doors_GothicArch/
  RoundArch(_Covered)`, `Column_Round/Round_Short/Square/BridgeSupport`,
  `Floor_Standard(_Half)`, `Floor_Diamond/Squares/SquareLarge/Hole_Corner/
  Hole_Straight/Tree`, `Curve_1/2(_Overgrown)`, `BridgeSection`,
  `Rail_Corner/Divider/Straight`, `Stairs`, `Stairs_2`, `Trapdoor`,
  plus dressing (`Barrel, Cart, Chest(_Gold), Bookcase_Empty/Full,
  Candles_1/2, Pot1-3(_Broken), Torch, Skull, BearTrap_Open/Closed,
  Statue_Fox/Stag, DeadTree_1-3, Tree_1-3, Bush_*, Grass, Flag_*,
  Window_Bars(_Double)(_Overgrown), Window_Open(_Double), Support_*`) — this
  is a genuinely dressable ruined/overgrown-dungeon aesthetic (has both
  intact and "Overgrown"/"Broken" variants of the same pieces).
  - **✅ WIRED (Sub-task 2, Task 3)**: `Chest`, `Chest_Gold`,
    `Bookcase_Full`/`Bookcase_Empty`, `Column_Round`/`Column_Square`/
    `Column_Round_Short` are mapped to `PropKind`s `chest`, `bookshelf`,
    `pillar` in `InteriorPropAdapter.ts`. `Statue_Fox`/`Statue_Stag`
    measured 3.75m/4.63m — 2.8x-3.45x taller than the procedural
    `buildStatue()`'s own ~1.34m reference height — and are mapped to
    `statue` with height-normalisation applied at load time rather than
    at native scale, to avoid repeating the exact "trust the pack's own
    scale" bug already found and fixed for buildings. The wall/floor/
    arch/column *modular kit* pieces themselves remain unwired — this
    sub-task only swaps standalone `PropPlacer` decoration items, not the
    dungeon's own wall/floor mesh generation (out of scope; see Sub-task 3).
  Re-checked
  after root-causing the shadow-rendering bug elsewhere in this initiative:
  the overwhelming majority of the 92 `.mtl` files are genuinely flat
  authored `Kd` colour with no texture directive at all — that part holds.
  **Correction (post-Sub-task-1 playtest): 13 of the 92 pieces are NOT
  flat-colour** — the "Overgrown" wall/curve/window sub-family plus the
  bushes/trees use 4 materials (`Green`, `Leaf_Texture`, `Texture_Leaves`,
  `Bark`) that share a distinctive placeholder `Kd 0.64 0.64 0.64` across
  every occurrence — the exact signature of Blender's OBJ exporter
  silently dropping an Image-Texture-driven material's `map_Kd` line
  instead of erroring. Real texture files bearing the *same names*
  (`Leaf_Texture.png`, `Bark_Texture.jpg`) were sitting right there in the
  sibling `Textures.zip` (see below) — this is a real, previously-uncaught
  import gap, not a taste decision or genuine data absence; it has now been
  fixed (see the `Textures.zip` bullet below).
  **A second, separate rendering bug (found during a later playtest)
  made these flat colours render near-black/shiny in the Asset Lab**: three.js's
  `MTLLoader` decodes `Kd` as sRGB-encoded display colour by default, but
  these particular `.mtl` files were exported by Blender with `Kd` already
  holding the scene-*linear* diffuse colour — decoding it a second time
  crushed every colour toward black (e.g. `Kd 0.23 0.24 0.18`, a perfectly
  normal medium-grey stone read as linear, was being decoded into an
  additional, wrong sRGB→linear pass and rendered at ~8% brightness).
  Fixed in `QuaterniusAssetLoader.ts`'s OBJ path by re-encoding the parsed
  colour with `.convertLinearToSRGB()` (the exact inverse of MTLLoader's
  incorrect decode) and re-mapping the resulting `MeshPhongMaterial` (whose
  `Ns`/`Ks` specular highlight read as glossy plastic on the wrongly-dark
  colours) to a matte `MeshStandardMaterial`. No Blender re-export needed
  for this kit — the fix is entirely in the runtime OBJ/MTL loader.
- **Textures.zip**: only 2 files (`Bark_Texture.jpg`, `Leaf_Texture.png`).
  **Correction (post-Sub-task-1 playtest): this was NOT orphaned — the
  earlier "no mesh to attach to" conclusion was wrong and was the actual
  root cause of the "Overgrown" pieces' white/grey blotch rendering.**
  Both filenames match the 4 texture-named materials above exactly; the
  OBJ exporter dropped the `map_Kd` reference to them (see above), it
  wasn't that no material wanted them. Extracted `Textures.zip`, copied
  both files into
  `public/assets/quaternius/modular_dungeons/obj_kit/textures/`, and
  patched all 18 affected `.mtl` files (13 pieces × their affected
  materials) to add the correct `map_Kd` line, resetting each material's
  placeholder `Kd` to white (`1 1 1`) so the diffuse map isn't tinted by
  the old grey/dark placeholder value. Verified via Asset Lab screenshot:
  "Wall Overgrown" and "Curve 1 Overgrown" now show real green vine
  texture instead of white/grey blotches. This is a real, root-cause fix
  using the actual Quaternius-supplied texture files — not a guessed
  colour.
- **Ultimate Modular Sci-Fi (Feb 2021)**: 91 pieces, sci-fi/space-station
  themed (`Details_Pipes_*`, `Props_Computer`, `Door*_Wall_Side*`,
  `FloorTile_*`). **Imported** — re-exported as GLB via the Blender
  material-fix pipeline (source `.blend` files used the same legacy
  Diffuse BSDF graph as the other affected packs). Its sci-fi styling is
  not a fantasy-setting fit today, but per explicit user instruction that
  is not a reason to exclude it; the wiring spec can decide where (if
  anywhere) it gets used.

**Plug-in point**: `src/levels/DungeonGenerator.ts` / `src/levels/blueprint.ts`
(grid-cell Blueprint JSON, no meshes) + `src/levels/BlueprintRenderer.ts`
(the file that turns Blueprint room data into actual geometry today,
procedurally) + `src/levels/TowerGenerator.ts` (same Blueprint-consuming
pattern for the 11-floor tower). The 92-piece OBJ kit is the clear
fantasy-dungeon fit; the 91-piece Ultimate Modular Sci-Fi kit is a second,
tonally distinct option the wiring spec can gate behind a different
style/territory. The existing grid/door/staircase logic in
`DungeonGenerator.ts` would keep deciding room layout either way, while
`BlueprintRenderer.ts` would gain a real-asset code path that places these
wall/floor/arch/column pieces instead of (or blended with) procedural
geometry per cell.

### `modular_fantasy_village/` — Medieval Village MegaKit
176 pieces, GLTF+bin+FBX+OBJ+.blend, 54 PNG (full PBR), **confirmed static**
(no `animations`/`skins` in sampled file — buildings don't animate). This is
the largest, most complete modular kit in the whole survey and reads almost
1:1 against this codebase's existing faction building-kit architecture
(`src/world/buildings/BlockKit.ts`, `StoneTowerKit.ts` +
`StoneTower{Balcony,Entrance,FloorCap,GableRoof,Openings,Quoins,RoofCap,
Shape,Silhouette,WallSurface,Windows}.ts`, `ElvenChapelKit.ts`,
`ElvenTreehouseKit.ts`, per-faction kits under `dwarven/`, `fae/`, `human/`,
`orcish/`, `slime/`, `undead/`, `vampire/`, `vulperia/`):

- Wall pieces by material: `Wall_Plaster_*`, `Wall_UnevenBrick_*` (straight,
  door, window variants, each with `_Flat`/`_Round` window/door shape and
  `_L`/`_R` end-cap pieces) — direct analog to `BlockKit.ts`'s wall-panel
  module concept.
- Corner pieces: `Corner_Exterior(Wide)_Brick/Wood/TopDown/TopOnly`,
  `Corner_Interior_Big/Small` — analog to `RoundedCornerPosts.ts` /
  `StoneTowerQuoins.ts`.
- Roof pieces: `Roof_RoundTiles_*` (many size variants), `Roof_Wooden_2x1_*`,
  `Roof_Front_Brick*`, `Roof_Dormer_RoundTile`, `Roof_Tower_RoundTiles` —
  analog to `StoneTowerGableRoof.ts`/`StoneTowerRoofCap.ts`.
- Openings: `Door_1/2/4/8_Flat/Round`, `DoorFrame_*`,
  `WindowShutters_Thin/Wide_Flat/Round_Open/Closed`,
  `Window_Thin/Wide_Flat/Round1` — analog to `StoneTowerOpenings.ts`/
  `StoneTowerWindows.ts`.
- Balconies/overhangs/stairs: `Balcony_Cross/Simple_Corner/Straight`,
  `Overhang_Plaster/UnevenBrick_*`, `Stair_Interior_*`,
  `Stairs_Exterior_*` (many variants) — analog to `StoneTowerBalcony.ts`.
- Small dressing: `Prop_Brick1-4`, `Prop_Chimney(2)`, `Prop_Vine1/2/4/5/6/9`,
  `Prop_WoodenFence_*`, `Prop_MetalFence_*`, `Prop_Wagon`, `Prop_Crate`,
  `Prop_Support`.

**Faction fit**: material variants (Brick / Wood / Plaster / UnevenBrick)
suggest **human_rural**/**human_town** most directly (matches
`FACTION_PRESETS` in `BuildingDNA.ts` — `human_rural: thatched`,
`human_town: timber`). Vine-covered pieces (`Prop_Vine*`) could suit
**fae** territory dressing. Does not obviously fit elven, dwarven, vampire,
undead, draconic, celestial, vulperia, slime, or orcish without re-texturing.

### `nature_props/` — imported via the Blender material-fix pipeline, with a disclosed texture gap
Source was a `Blends.zip` with 63 raw `.blend` files — **no exported FBX,
OBJ, GLTF, or texture files at all** shipped in the source data. This is
now imported: `scripts/blender/batch-export-blends.mjs` +
`scripts/blender/export_glb.py` opens each `.blend` headlessly, rewires its
legacy Diffuse-BSDF material graph to a Principled BSDF (the same root
cause found across the other affected packs — including a more complex
"Add Shader" translucent-leaf graph on some tree materials, handled via a
recursive shader-graph traversal), and exports GLB.

**Genuine, disclosed texture gap — re-verified via live Blender MCP,
confirmed unrecoverable.** The `.blend` files reference external texture
PNGs via relative paths (`//../Textures/*.png`) that do not exist anywhere
in the provided source data. This was originally checked only via
`img.size == (0, 0)` on a single sample file; a later session (following
playtest feedback that the first fix attempt — a name-based colour guess —
was still wrong) used the now-available Blender MCP connection to script a
full open-and-inspect pass across **all 62** `.blend` files' internal
`bpy.data.images`, checking `packed_file`/`filepath`/`size` for every image
reference (276 references total across the pack). Result: only 2 files
(`NormalTree_4.blend`, `DeadTree_4.blend`) have any packed image data at
all (`Leaves3.png`, `NormalTree_Base.png`, `NormalTree_Normal.png`), and
tracing the actual shader-node wiring for those materials showed none of
the 3 packed images are what's driving the visible Base Color — they're
unused/orphaned leftovers. The 20 distinct filenames actually driving
every visible flower/leaf/bark material (`Flowers.png`, `Bush_Leaves.png`,
`NormalTree_Bark.png`, `NormalTree_Leaves.png`, etc.) are confirmed absent
from every one of the 62 files and from the rest of the Downloads folder.

**No colour is invented for this gap** (explicit user directive, 2026-09-23:
"no inventing new textures — always use supplied textures"). An earlier fix
attempt used a name-based flat-colour heuristic in `export_glb.py`
(leaf/bark/rock keyword → a guessed green/brown/gray, with a separate
dusty-pink guess added for flower/petal after the first version rendered
every flower plain leaf-green) — this was explicitly rejected by the user
("you managed to go from wrong green to wrong pink") as fabrication, not a
real fix. The heuristic has been **removed entirely**; `export_glb.py` now
leaves a material's Surface wiring untouched when no real texture/colour
is recoverable, and all 63 nature_props GLBs have been re-exported without
it. These materials now carry no `baseColorFactor`/`baseColorTexture` at
all in the GLB — visibly a flat/dark shape, not a wrong colour. **This gap
is flagged and left open by explicit user decision (2026-09-23: "flag the
known gap and move on")** — not being chased further for now. If a real
`Textures` folder for this pack is ever sourced, re-run
`node scripts/blender/batch-export-blends.mjs nature_props` to pick it up.

**Plug-in point**: `src/world/NaturePropField.ts` +
`src/world/NatureAssetBuilder.ts`/`NatureAssetDNA.ts`/`NatureAssetRecipes.ts`
(current fully-procedural tree/rock/flower/bush generation) and
`src/world/NatureScatterPoints.ts` (placement point generation, which would
be reused unchanged — only the mesh-per-point selection would gain a
real-asset path).

## Codebase plug-in map (summary)

| Category | Existing system (decides *where*/*how many*, unchanged) | What a real asset would replace |
|---|---|---|
| Nature props (trees/rocks/flowers/bushes) | `NatureScatterPoints.ts` (placement) + `NatureAssetBuilder.ts`/`NatureAssetRecipes.ts` (procedural mesh) | The procedural mesh build, per scattered point — `nature_props/` now imported (GLB, Blender material-fix pipeline); note the disclosed texture-fallback gap above |
| Dungeons (walls/floors/arches/columns) | `DungeonGenerator.ts`/`blueprint.ts` (grid+door/staircase logic) + `BlueprintRenderer.ts` (mesh build) | The mesh build per Blueprint cell — `modular_dungeons/OBJ` kit is the fantasy fit; `modular_dungeons/Ultimate Modular Sci-Fi` is a second, tonally distinct kit also imported |
| Tower/indoor generation | `TowerGenerator.ts` (same Blueprint pattern) + `InteriorGenerator.ts` (interior props) | Interior prop meshes — `fantasy_props/` MegaKit fit; `modern_type_buildings/Interior Pack` (102 pieces) also imported for wall/floor/facade modules; wall/floor pieces same as dungeons. **✅ WIRED (Sub-task 2, Task 3)**: `InteriorPropAdapter.ts` + `PropPlacer.decorateRoom()` swap 11 of 12 `PropKind`s to real meshes (chest, bookshelf, table, chair, cauldron, lantern, pillar, door, statue, barrel, crate); only `rug` has no verified real-asset match and stays procedural |
| Settlement/village buildings | `BuildingGenerator.ts` + per-faction `*Kit.ts` files (wall/corner/roof module assembly) | The per-module mesh, keyed by faction/style — `modular_fantasy_village/` fits human factions best; `medieval_village_pack/Buildings` as whole-building swaps; `modern_type_buildings/City Pack` also imported as a modern-styled option. **✅ WIRED (Sub-task 2, Task 1-2)**: `QuatBuildingAdapter.ts` + `SettlementRenderer.renderSettlementPlan()` swap real medieval_village_pack/city_pack models in per `(faction, buildingKind)`; pools grouped by measured height, not pack naming (see that file's doc comment for the bug this fixed) |
| Monster spawn placement | No dedicated spawn table yet; `enemy-creator/builder.ts` builds procedural `EnemyDNA` rigs on demand | A new asset-monster selection path parallel to `buildEnemy()` — `Cute Animated Monsters` most reliably rigged; `Bestiary — Dungeon Monsters` (2 monsters, static poses only) for dungeon set-dressing |
| Animal spawn placement | `AmbientWildlife.ts` (2 procedural species today) | A new asset-animal selection path — `animals/Ultimate Animated Animals` (12 species, confirmed rigged) |

## Open questions (flagging, not deciding)

1. **RESOLVED — where do imported/converted assets live in-repo?** All 14
   imported zips now live under `public/assets/quaternius/<category>/
   <packId>/` with a codegen'd manifest (`scripts/gen-quaternius-
   manifest.mjs` → `src/assets/quaterniusManifest.ts`), mirroring the
   character pipeline's convention as originally proposed. 6 packs
   (`animals`, `monsters/bestiary_dungeon_monsters`,
   `monsters/cute_animated_monsters`, `fantasy_props/fantasy_props_megakit`,
   `modular_dungeons/obj_kit`, `modular_fantasy_village/
   medieval_village_megakit`) use their as-shipped format directly. The
   other 8 packs' source material graphs (legacy Diffuse BSDF) rendered as
   flat black/gray "shadows" in both FBX/OBJ export and Blender's own glTF
   exporter — fixed via a Blender headless material-rewrite + GLB export
   pipeline (`scripts/blender/export_glb.py` +
   `scripts/blender/batch-export-blends.mjs`); GLB is now the format of
   record for those 8.
2. **RESOLVED — `nature_props/` conversion.** Converted via the Blender
   material-fix pipeline above. A genuine, disclosed data gap remains: the
   `.blend` files reference external texture PNGs that don't exist
   anywhere in the provided source data, so materials use a documented
   name-based colour-fallback heuristic instead of real textures.

   **Correction (post-Sub-task-1 playtest, later session).** The Blender
   MCP server flagged here was in fact used in that later session — live,
   scripted inspection of all 62 `.blend` files' internal `bpy.data.images`
   (packed vs. unresolved) confirmed the earlier CLI-only conclusion still
   holds: the real diffuse maps (`Flowers.png`, `Bush_Leaves.png`,
   `NormalTree_Bark.png`, etc.) are not packed in any `.blend` and don't
   exist anywhere in the source data. (Two `.blend` files, `NormalTree_4`
   and `DeadTree_4`, do have *some* packed image data — `Leaves3.png`,
   `NormalTree_Base.png`, `NormalTree_Normal.png` — but tracing the actual
   shader-node wiring showed none of these are the image driving the
   visible material; they're orphaned/unused leftovers, not a usable find.)

   Separately, and more importantly: the earlier name-based colour-fallback
   heuristic itself was rejected by the user as fabrication ("we don't
   invent textures/colours, ever — only use supplied data") after the first
   attempted fix (green → pink) was still visibly wrong. `export_glb.py`'s
   `_NAME_COLOUR_FALLBACKS` heuristic has been **removed entirely**; all 63
   nature_props GLBs were re-exported without it. Materials with
   unrecoverable data now carry no `baseColorFactor`/`baseColorTexture` at
   all — an honest gap, not a guess. **This gap remains open and unresolved
   by user decision (2026-09-23): flagged, not being chased further for
   now.** If real textures are ever sourced (e.g. the Quaternius nature
   pack's separate `Textures` folder that `.blend`s reference via
   `//../Textures/*.png` but which isn't present anywhere in the local
   Downloads folder), `scripts/blender/batch-export-blends.mjs nature_props`
   can be re-run to pick them up.
3. **CORRECTED (post-Sub-task-1 playtest) — `modular_dungeons/Textures.zip`
   was NOT orphaned; this was the actual root cause of a real rendering
   bug.** The original claim here ("none of the 92 `.mtl` files reference
   `map_Kd`... these 2 texture files have no mesh anywhere in the source
   data to attach to") was **wrong** and is exactly the kind of inventory
   gap this initiative exists to prevent. Re-audit found: 13 of the 92
   pieces (the "Overgrown" wall/curve/window sub-family, plus bushes/trees)
   use 4 materials (`Green`/`Leaf_Texture`/`Texture_Leaves`/`Bark`) that
   *are* meant to carry these exact textures (their names match the
   texture filenames exactly) — Blender's OBJ exporter simply never wrote
   the `map_Kd` line for them, leaving a flat placeholder grey
   (`Kd 0.64 0.64 0.64`, a signature value distinct from every genuinely
   flat-shaded material's real authored colour). `Textures.zip` was
   extracted, its 2 files (`Leaf_Texture.png`, `Bark_Texture.jpg`) copied
   into `public/assets/quaternius/modular_dungeons/obj_kit/textures/`, and
   all 18 affected `.mtl` files patched with the correct `map_Kd`
   reference (Kd reset to white so the map isn't tinted). Verified via
   Asset Lab screenshot — "Wall Overgrown"/"Curve 1 Overgrown" now show
   real green vine texture instead of white/grey blotches. The remaining
   ~79 non-Overgrown pieces are confirmed genuinely flat vertex-colour
   (no texture reference of any kind, real authored dark stone/dungeon
   palette) — that part of the original claim was correct.
4. **RESOLVED — no packs are excluded for tonal mismatch.** An earlier pass
   of this initiative excluded `modern_type_buildings/` (both sub-packs)
   and `modular_dungeons/Ultimate Modular Sci-Fi` on a "doesn't fit the
   fantasy setting" rationale. **This was wrong and has been reversed at
   the user's explicit, direct instruction: every asset available in the
   source folder is imported, full stop, with no taste-based filtering.**
   All 3 are now imported (`modern_type_buildings/city_pack`,
   `modern_type_buildings/interior_pack`,
   `modular_dungeons/ultimate_modular_scifi`). Which territories/uses
   actually draw on tonally-distinct packs like these is a step-3 wiring
   decision, not an import-time exclusion.
5. **Faction/style fit for buildings is approximate, not verified.** The
   faction-fit notes above (`medieval_village_pack` and
   `modular_fantasy_village` → mostly human factions) are first-pass reading
   of material/style names, not a rendered-side-by-side comparison against
   `FACTION_PRESETS` colors/styles in `BuildingDNA.ts`. Elven, dwarven,
   vampire, undead, draconic, celestial, vulperia, slime, fae, and orcish
   territories have no obvious asset match yet in this survey. Per user
   direction (given when approving step 2), this is **not a blocker**:
   the existing pool (`medieval_village_pack`/`modular_fantasy_village`)
   can be used as the initial asset pool even for factions without an
   obvious style match — better some variation now than none, expandable
   later with more asset packs.
6. **RESOLVED — rig/animation claims confirmed via real import tooling.**
   `monsters/animated_monster_pack` (Bat, Dragon, Skeleton, Slime): all 4
   confirmed animated after the Blender re-export. `monsters/
   bestiary_dungeon_monsters` (Imp, Puglin): confirmed via raw FBX byte
   inspection (zero `AnimCurveNode` occurrences) to genuinely ship **no**
   animation keyframe data in either FBX or GLB source — a real content
   limitation of this pack, not an import bug; both models are static
   poses only.
