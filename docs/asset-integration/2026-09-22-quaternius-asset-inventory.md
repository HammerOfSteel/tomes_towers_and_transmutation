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
