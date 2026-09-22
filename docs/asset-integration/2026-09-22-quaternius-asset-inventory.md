# Quaternius Asset Inventory

*Source: `/Users/terrygoleman/Downloads/game_assets/buildings/quaternius/` (local
filesystem, outside this repo — not committed, not LFS-tracked). Surveyed via
`unzip -l` listings and JSON-sniffing sampled `.gltf` files (checked for
`animations`/`skins` keys) without extracting the full packs. 8 subfolders,
15 zip archives, ~570 MB total.*

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
| `monsters/` Bestiary Dungeon Monsters | 2 | FBX, GLB | Monolithic | **Unconfirmed — likely static**, no gltf sniffable; 16 PNGs suggest baked/unwrapped textures, not rig data | 16 PNG textures | Monster spawn placement (static use, e.g. dungeon set-dressing) |
| `monsters/` Cute Animated Monsters | 21 | GLTF+bin, FBX, OBJ, .blend | Monolithic | ✅ 10 anim clips, 1 skin (Yeti sample) | 21 PNG (per-model) | Monster spawn placement |
| `fantasy_props/` Fantasy Props MegaKit | 94 | GLTF+bin, FBX, OBJ, .blend | Monolithic per prop (kit-of-many, not modular geometry) | ❌ static | Full PBR set (BaseColor/Normal/ORM) per material, 43 PNG | Building interiors, settlement dressing, dungeon set-dressing |
| `fantasy_props/` Ultimate Food Pack | 103 | FBX, OBJ, .blend | Monolithic per item | ❌ static | 1 PNG only (likely a shared atlas — needs confirming) | Food/kitchen dressing (interiors, markets) |
| `medieval_village_pack/` Buildings | 10 | FBX, OBJ, .blend | **Monolithic** — one mesh per whole building | ❌ static | none listed separately (baked into FBX likely) | Human settlement buildings (direct building swap, not kit-of-parts) |
| `medieval_village_pack/` Props | 34 | FBX, OBJ, .blend | Monolithic per prop | ❌ static | none listed separately | Settlement/street dressing |
| `modern_type_buildings/` Buildings Pack (2019) | 9 | FBX, OBJ, .blend | Monolithic | ❌ static | 1 PNG | ⚠️ tonal mismatch — see Open Questions |
| `modern_type_buildings/` Ultimate Textured Building Pack | 102 | FBX, OBJ, .blend | Monolithic (with `_Base`/`_Mat` split variants) | ❌ static | 13 PNG | ⚠️ tonal mismatch — see Open Questions |
| `modular_dungeons/` OBJ (Bestiary-style dungeon kit) | 92 | OBJ+MTL | ✅ **true kit-of-parts** (walls, arches, floors, columns, props) | ❌ static (one `Character_Animated.obj` outlier — likely a rig demo, not a placeable) | separate `Textures/` zip, only 2 files — looks incomplete, see Open Questions | **Best fit for `DungeonGenerator.ts`/`BlueprintRenderer.ts` wall/floor dressing** |
| `modular_dungeons/` Ultimate Modular Sci-Fi | 91 | FBX, OBJ, .blend | ✅ true kit-of-parts | ❌ static | 1 jpg | ⚠️ tonal mismatch — see Open Questions |
| `modular_fantasy_village/` Medieval Village MegaKit | 176 | GLTF+bin, FBX, OBJ, .blend | ✅ **true kit-of-parts** (walls/corners/doors/floors/roofs/stairs by material variant) | ❌ static | 54 PNG (full PBR set) | **Best fit for `BuildingGenerator.ts` + per-faction `*Kit.ts` wall/roof/corner module patterns** |
| `nature_props/` Blends | 63 | **`.blend` only** — no exported FBX/OBJ/GLTF/textures | Unknown (not inspectable without opening in Blender) | Unknown | none exported | ⚠️ **Gap — needs conversion pass**, see Open Questions |

## Import scope — every one of the 15 zips, explicitly

**Revision note (2026-09-22, post-step-2 review):** the table above and the
per-pack sections below have always covered all 15 zips across all 8 source
subfolders — nothing was silently dropped from *this document*. What was
missing was a single explicit "is this actually in the game's import
pipeline yet?" answer per pack, which is why the step-2 Asset Lab dev view
(only showing the 10 imported packs) read as if the inventory itself had
holes. This table is that missing answer, once, in one place:

| # | Source folder | Zip | Imported in step 2? | Manifest pack id | Reason if excluded |
|---|---|---|---|---|---|
| 1 | `animals/` | Ultimate Animated Animals | ✅ Yes | `animals/ultimate_animated_animals` | — |
| 2 | `fantasy_props/` | Fantasy Props MegaKit | ✅ Yes | `fantasy_props/fantasy_props_megakit` | — |
| 3 | `fantasy_props/` | Ultimate Food Pack | ✅ Yes | `fantasy_props/ultimate_food_pack` | — |
| 4 | `medieval_village_pack/` | Buildings | ✅ Yes | `medieval_village_pack/buildings` | — |
| 5 | `medieval_village_pack/` | Props | ✅ Yes | `medieval_village_pack/props` | — |
| 6 | `modern_type_buildings/` | Buildings Pack (Jan 2019) | ❌ No | — | Modern/contemporary architecture, no fantasy-faction fit (flagged open question #4) |
| 7 | `modern_type_buildings/` | Ultimate Textured Building Pack (Dec 2019) | ❌ No | — | Same as #6 |
| 8 | `modular_dungeons/` | OBJ (fantasy dungeon kit-of-parts) | ✅ Yes | `modular_dungeons/obj_kit` | — |
| 9 | `modular_dungeons/` | Textures.zip | ❌ No | — | Orphaned — only 2 loose texture files, confirmed unrelated to the 92-piece OBJ kit's flat-vertex-colour `.mtl` files (zero `map_*` directives across all 92) |
| 10 | `modular_dungeons/` | Ultimate Modular Sci-Fi | ❌ No (pending a user decision — see Open Questions #4) | — | Sci-fi/tech themed, tonal mismatch with the fantasy dungeon kit already imported; **not deleted, just not yet imported** |
| 11 | `modular_fantasy_village/` | Medieval Village MegaKit | ✅ Yes | `modular_fantasy_village/medieval_village_megakit` | — |
| 12 | `monsters/` | Animated Monster Pack | ✅ Yes | `monsters/animated_monster_pack` | — |
| 13 | `monsters/` | Bestiary - Dungeon Monsters Kit | ✅ Yes | `monsters/bestiary_dungeon_monsters` | — |
| 14 | `monsters/` | Cute Animated Monsters | ✅ Yes | `monsters/cute_animated_monsters` | — |
| 15 | `nature_props/` | Blends.zip | ❌ No | — | `.blend`-only, no exported mesh/texture format — blocked on a Blender export pass (see Open Questions #2, Blender MCP note) |

**10 of 15 zips are imported today (548 models).** The other 5 are not
missing from this survey — they're documented above and in the per-pack
detail below — they're just not yet in the game's asset pipeline, each for
an explicit, named reason, not an oversight.

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

**Faction fit** (first pass, using `Faction` from `BuildingDNA.ts`: human_rural,
human_town, human_noble, elven, dwarven, vampire, undead_common, draconic,
celestial, vulperia, slime, fae, orcish): this whole pack reads as generic
Western-medieval and fits `human_rural`/`human_town` territories best; it
does not obviously suit elven/dwarven/orcish/vampire/undead/slime/fae style
territories without re-texturing or re-dressing, which is out of scope for
"drop-in real assets" and should be flagged to the user rather than assumed.

### `modern_type_buildings/` — 2 packs, ⚠️ tonal mismatch
- **Buildings Pack (Jan 2019)**: 9 buildings (`Building1-4` variants,
  `House1/2`) — contemporary/modern architecture.
- **Ultimate Textured Building Pack (Dec 2019)**: 102 pieces — `1Story`
  through `4Story` variants with `_Base`/`_Mat`/roof-style suffixes
  (`GableRoof`, `RoundRoof`, `Balcony`, `Columns`, `Sidehouse`, `Stairs`,
  etc.) — modern/suburban style, not fantasy.

Both packs are **monolithic modern-architecture buildings** with no obvious
faction fit in this game's fantasy setting (human/elven/dwarven/vampire/
undead/draconic/celestial/vulperia/slime/fae/orcish). Flagged as likely
**out of scope** — see Open Questions.

### `modular_dungeons/` — 2 kits + 1 orphaned texture zip
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
- **Textures.zip**: only 2 files (1 jpg, 1 png) — this looks incomplete or an
  orphaned/partial export relative to 92 OBJ pieces each needing an MTL
  material; needs checking whether the MTL files reference these 2 textures
  as a shared atlas or whether more textures are simply missing from this
  particular export. Flagged in Open Questions.
- **Ultimate Modular Sci-Fi (Feb 2021)**: 91 pieces, sci-fi/space-station
  themed (`Details_Pipes_*`, `Props_Computer`, `Door*_Wall_Side*`,
  `FloorTile_*`) — **tonal mismatch**, flagged as likely out of scope.

**Plug-in point**: `src/levels/DungeonGenerator.ts` / `src/levels/blueprint.ts`
(grid-cell Blueprint JSON, no meshes) + `src/levels/BlueprintRenderer.ts`
(the file that turns Blueprint room data into actual geometry today,
procedurally) + `src/levels/TowerGenerator.ts` (same Blueprint-consuming
pattern for the 11-floor tower). The 92-piece OBJ kit is the clear fit: the
existing grid/door/staircase logic in `DungeonGenerator.ts` would keep
deciding room layout, while `BlueprintRenderer.ts` would gain a real-asset
code path that places these wall/floor/arch/column pieces instead of (or
blended with) procedural geometry per cell.

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

### `nature_props/` — ⚠️ Blends only, conversion gap
**Only** a `Blends.zip` with 63 raw `.blend` files — **no exported FBX, OBJ,
GLTF, or texture files at all** in this pack (confirmed via zip listing:
100% `.blend` extension). This is the one pack that cannot go through any
import pipeline as-is; someone (or an automated Blender step) needs to open
each `.blend` and export it to a usable format first. See Open Questions
below — a Blender MCP connection just became available mid-session and is
noted there as a possible way to do this programmatically in step 2/3,
without deciding on it now.

**Plug-in point** (once converted): `src/world/NaturePropField.ts` +
`src/world/NatureAssetBuilder.ts`/`NatureAssetDNA.ts`/`NatureAssetRecipes.ts`
(current fully-procedural tree/rock/flower/bush generation) and
`src/world/NatureScatterPoints.ts` (placement point generation, which would
be reused unchanged — only the mesh-per-point selection would gain a
real-asset path).

## Codebase plug-in map (summary)

| Category | Existing system (decides *where*/*how many*, unchanged) | What a real asset would replace |
|---|---|---|
| Nature props (trees/rocks/flowers/bushes) | `NatureScatterPoints.ts` (placement) + `NatureAssetBuilder.ts`/`NatureAssetRecipes.ts` (procedural mesh) | The procedural mesh build, per scattered point — blocked on `nature_props/` conversion gap |
| Dungeons (walls/floors/arches/columns) | `DungeonGenerator.ts`/`blueprint.ts` (grid+door/staircase logic) + `BlueprintRenderer.ts` (mesh build) | The mesh build per Blueprint cell — `modular_dungeons/OBJ` kit is the fit |
| Tower/indoor generation | `TowerGenerator.ts` (same Blueprint pattern) + `InteriorGenerator.ts` (interior props) | Interior prop meshes — `fantasy_props/` MegaKit fit; wall/floor pieces same as dungeons |
| Settlement/village buildings | `BuildingGenerator.ts` + per-faction `*Kit.ts` files (wall/corner/roof module assembly) | The per-module mesh, keyed by faction/style — `modular_fantasy_village/` fits human factions best; `medieval_village_pack/Buildings` as whole-building swaps |
| Monster spawn placement | No dedicated spawn table yet; `enemy-creator/builder.ts` builds procedural `EnemyDNA` rigs on demand | A new asset-monster selection path parallel to `buildEnemy()` — `Cute Animated Monsters` most reliably rigged |
| Animal spawn placement | `AmbientWildlife.ts` (2 procedural species today) | A new asset-animal selection path — `animals/Ultimate Animated Animals` (12 species, confirmed rigged) |

## Open questions (flagging, not deciding)

1. **Where do imported/converted assets live in-repo?** The existing
   character pipeline's convention is `public/assets/characters/<packId>/`
   with a codegen'd manifest (`scripts/gen-char-manifest.mjs` →
   `charManifest.ts`). Proposal to consider in step 2: mirror this as
   `public/assets/quaternius/<category>/<packId>/` — but this needs a
   real conversion step first, since only 4 of the 15 zips ship ready-to-use
   GLTF (`animals`, `monsters/Cute Animated Monsters`,
   `fantasy_props/Fantasy Props MegaKit`, `modular_fantasy_village`); the
   rest are FBX/OBJ-only or (for `nature_props`) `.blend`-only. Not decided
   here — needs a user call in step 2's spec.
2. **`nature_props/` conversion gap.** All 63 assets are raw `.blend` files
   with no exported mesh/texture data. **Mid-session update: a Blender MCP
   server is now available** (the user started Blender and activated its MCP
   server during this session) — this could let step 2/3 inspect and export
   these `.blend` files programmatically instead of requiring manual
   Blender work per file. Recording this as an available capability for
   later use; **not acted on this turn**, which stays scoped to inventory
   only.
3. **`modular_dungeons/Textures.zip` looks incomplete** — only 2 texture
   files for 92 OBJ pieces each with their own MTL. Needs checking in step 2
   whether the MTLs reference just these 2 as a shared atlas, or whether
   this export is missing textures.
4. **Tonal mismatch packs**: `modern_type_buildings/` (both sub-packs) and
   `modular_dungeons/Ultimate Modular Sci-Fi` don't fit this game's fantasy
   setting on their face. Recommend deprioritizing for the wiring spec
   (step 3) rather than deleting — flagging for explicit user confirmation
   rather than silently dropping them.
5. **Faction/style fit for buildings is approximate, not verified.** The
   faction-fit notes above (`medieval_village_pack` and
   `modular_fantasy_village` → mostly human factions) are first-pass reading
   of material/style names, not a rendered-side-by-side comparison against
   `FACTION_PRESETS` colors/styles in `BuildingDNA.ts`. Elven, dwarven,
   vampire, undead, draconic, celestial, vulperia, slime, fae, and orcish
   territories have no obvious asset match yet in this survey — worth
   flagging to the user as a likely gap for those factions specifically.
6. **Rig/animation claims for FBX-only packs are unconfirmed.** Only packs
   with a `.gltf` file could be sniffed for `animations`/`skins` via plain
   JSON parsing in this pass (`animals`, `monsters/Cute Animated Monsters`).
   `monsters/Animated Monster Pack` and `monsters/Bestiary - Dungeon
   Monsters` claim or imply animation via naming/format but need an actual
   FBX/GLB load (step 2, real import tooling) to confirm.
