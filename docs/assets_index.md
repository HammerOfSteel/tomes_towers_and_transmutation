# Asset Pack Inventory
*Generated 2026-07-15 — source dirs scanned: `~/Documents/dev/games/assets/modular/` and `~/Documents/dev/games/possible_assets/`*

---

## TL;DR — What to Use First

| Priority | Pack | Format | Use For |
|---|---|---|---|
| ★★★ | `kenney_modular-dungeon-kit_1.0` | GLB ✅ | Dungeon corridors & rooms |
| ★★★ | `kenney_nature-kit` | GLB ✅ | Overworld trees, rocks, rivers, cliffs |
| ★★★ | `kenney_retro-fantasy-kit` | GLB ✅ | Tower, buildings, walls, roofs |
| ★★★ | `kenney_fantasy-town-kit_2.0` | GLB ✅ | Villages, towns, market stalls, roads |
| ★★★ | `kenney_castle-kit` | GLB ✅ | Castle towers, gates, battlements |
| ★★ | `kenney_modular-cave-kit_1.0` | GLB ✅ | Cave-type dungeon floors |
| ★★ | `kenney_mini-dungeon` | GLB ✅ | Simple dungeon props (chests, traps) |
| ★★ | `Ultimate Modular Ruins Pack` | FBX ⚠️ | Ruins, broken walls, overgrown props |
| ★★ | `kenney_building-kit` | GLB ✅ | Generic modular building sections |
| ★ | `Animated Monster Pack @Quaternius` | FBX ⚠️ | Slime, Skeleton, Bat, Dragon (animated) — **Phase 2** |
| ★ | `Ultimate Animated Character Pack` | FBX/glTF ⚠️ | NPC human characters (animated) — **Phase 2** |

**GLB ✅** = ready for three.js `GLTFLoader`, no conversion needed.  
**FBX ⚠️** = needs Blender/FBX2GLTF conversion → export as GLB first.

---

## Source Directories

```
~/Documents/dev/games/assets/modular/
  Ultimate Modular Ruins Pack - Aug 2021/         ← extracted (FBX + OBJ)
  1778140409565-...-retro_dungeons_modular_house_interiors_v1.0.zip  (FBX)
  1778173028353-...-retro_dungeons_the_forest_v1.2.unitypackage       (Unity — skip)
  Lands.zip                                        (unknown / empty)

~/Documents/dev/games/possible_assets/
  outdoors/    ← 40+ Kenney zips + Quaternius packs
  characters/  ← 10 character/monster packs
```

---

## OUTDOORS / WORLD PACKS

### ★★★ `kenney_nature-kit` (GLB)
~200 models. **Best pack for the overworld.**

**Trees** (12 base shapes × 3 seasons: default, dark, fall):
`tree_default`, `tree_oak`, `tree_tall`, `tree_thin`, `tree_fat`, `tree_simple`, `tree_small`, `tree_blocks`, `tree_plateau`, `tree_cone` + 14 pine variants + 4 palm variants.

**Rocks & Stones**: 10 large, 16 small/flat/top variants each in `rock_` and `stone_` flavors.
**Cliffs**: Full modular cliff system (block, diagonal, half, corner, slope, cave, waterfall, steps) in rock + stone variants.
**Vegetation**: Mushrooms (red/tan, tall/group), flowers (purple/red/yellow, A/B/C), grass, plants (bush varieties), lily pads, hanging moss, stumps.
**Rivers/Paths**: `ground_river*` and `ground_path*` tiles — straight, bend, corner, cross, end, side, rocks, open variants. Also `path_stone*` and `path_wood*`.
**Bridges**: 18 bridge pieces (stone/wood × round/narrow combinations).
**Props**: Campfires (4 variants), tents (4 variants), canoe, logs (4), crops (carrot, melon, pumpkin, turnip + growth stages), fences (7 types), signs, statues (obelisk, ring, head, column), pots.

---

### ★★★ `kenney_retro-fantasy-kit` (GLB)
~110 models. **Best pack for the Tower + settlement buildings.**

**Walls**: stone wall + window/door/gate variants; painted variants; wood-pane variants; fortified variants.
**Towers**: `tower.glb`, `tower-base`, `tower-edge`, `tower-top`, painted variants.
**Roofs**: full roof kit — flat, corner, edge, side, high variants, with gable + round corners.
**Floors**: standard + stairs (3 types), wood floors (half/quarter/railing).
**Structure**: poles, wall-cross, scaffolding.
**Detail props**: barrels (3), crates (4), pulley system, ladder, dock pieces, overhang + railing, fence.
**Water tile**: `water.glb`.

---

### ★★★ `kenney_fantasy-town-kit_2.0` (GLB)
~155 models. **Best pack for villages/towns/cities.**

**Walls**: stone + wood variants — straight, corner, arch, window (glass/shutters/round/stone), door, broken, half, diagonal, curved, slope.
**Roofs**: full kit — flat, gable, high-gable, point, corner (inner/round), window, with distinct left/right halves.
**Streets/Paths**: `road.glb`, road-bend/corner/curb/slope/edge.
**Market stalls**: `stall.glb` + bench/stool + 2 colour variants.
**Town props**: fountains (round + square, 3 corner types), hedges (simple + large + gate), lantern, banners (red/green), chimney (3 parts), balcony, overhang, fence (5 types), pillar (stone + wood), cart (2 sizes), watermill, windmill, wheel, blade.
**Stairs**: stone/wood × wide/handrail/corner/round variants (10 types).
**Trees**: crooked, round, high + 3 variations.

---

### ★★★ `kenney_castle-kit` (GLB)
43 models.

**Tower system**: square (base/mid/door/arch/roof/border/color variants) + hexagon (base/mid/top/roof) tower.
**Walls/Gates**: `gate.glb`, `metal-gate.glb`, `door.glb`, bridges (drawbridge + straight + pillar).
**Flags**: 5 variants (pennant, wide, banner long/short, standard).
**Terrain**: `ground.glb`, `ground-hills.glb`.
**Rocks**: large + small sets.
**Stairs**: stone-square + stone.
**Siege weapons**: ballista, catapult, ram, siege-tower, trebuchet (each with demolished variant) — good for enemy camps.

---

### ★★ `kenney_building-kit` (GLB)
Modular generic building kit. Doors (rotate variants A–D for square + round), floors, borders, columns (thin/wide), barricades, walls. More sci-fi/generic than fantasy but floor/column pieces are reusable.

---

### ★★ `kenney_survival-kit` (GLB)
Barrels, bedrolls, tools — useful for camp decorations and dungeon props.

---

### ◆ `kenney_hexagon-kit` (GLB)
Hexagonal floor tiles — not directly useful for our square-grid world but could be used for UI or special areas.

---

### ◆ `kenney_mini-dungeon` (GLB) — 26 models
Simple, clean low-poly dungeon: floor, wall, wall-half, wall-narrow, wall-opening, stairs, gate, column, barrel, chest, banner, rocks, stones, coin, trap, wood-support/structure, weapons. Minimal but usable for quick dungeon decoration pass.

---

### ◆ `Ultimate Fantasy RTS - Aug 2022` (FBX ⚠️)
Full buildings (Houses/Market/Storage/Archery/Barracks/Port) with age progression (1st/2nd age, level 1–3). Rich architecture but FBX only, needs conversion. Lower priority.

---

### ◆ `Medieval Village Pack / MegaKit` (Quaternius, FBX ⚠️)
Medieval village buildings FBX. Useful after conversion.

---

### ◆ `Stylized Nature MegaKit` / `Simple Nature Pack` (Quaternius, FBX ⚠️)
Extra nature variety. Lower priority given Kenney nature kit covers most needs.

---

## DUNGEON PACKS

### ★★★ `kenney_modular-dungeon-kit_1.0` (GLB)
38 models — **exact match for our dungeon system.**

**Room pieces**: `room-small`, `room-small-variation`, `room-wide`, `room-wide-variation`, `room-large`, `room-large-variation`, `room-corner`.
**Corridors**: `corridor`, `corridor-corner`, `corridor-end`, `corridor-intersection`, `corridor-junction`, `corridor-transition`, `corridor-wide-*` variants.
**Stairs**: `stairs.glb`, `stairs-wide.glb`.
**Doors/Gates**: `gate.glb`, `gate-door.glb`, `gate-door-window.glb`, `gate-metal-bars.glb`.
**Templates** (modular wall/floor surfaces): `template-floor`, `template-floor-big`, `template-floor-detail`, `template-floor-layer`, `template-floor-layer-hole`, `template-floor-layer-raised`, `template-wall`, `template-wall-corner`, `template-wall-detail-a`, `template-wall-half`, `template-wall-stairs`, `template-wall-top`, `template-corner`, `template-detail`.

---

### ★★ `kenney_modular-cave-kit_1.0` (GLB)
Same room/corridor structure as dungeon kit but cave-themed. Adds `gate-overhang.glb`, `gate-rock.glb`, `ladder.glb`.

---

### ◆ `Updated Modular Dungeon - May 2019` (Quaternius, FBX ⚠️)
FBX dungeon pieces — similar coverage to Kenney dungeon kit but needs conversion.

---

### ◆ `Modular Dungeon Pack - Jan 2018` (Quaternius, FBX ⚠️)
Older FBX dungeon pack. Lower priority.

---

## MODULAR RUINS (already extracted)

### ★★ `Ultimate Modular Ruins Pack - Aug 2021` (FBX + OBJ)
Path: `~/Documents/dev/games/assets/modular/Ultimate Modular Ruins Pack - Aug 2021/FBX/`
92 FBX models. **Needs FBX → GLB conversion.**

Key pieces for the overworld ruins POIs:
- **Walls**: `Wall.fbx`, `Wall_Broken.fbx`, `Wall_Double_Broken.fbx`, `Wall_Double_Hole.fbx`, `Wall_Half.fbx`, `Wall_Hole.fbx`, `Wall_Overgrown.fbx` + arch/gothic/round variants
- **Arches**: `Arch_Gothic.fbx`, `Arch_Round.fbx` + round-column variants
- **Columns**: `Column_Round.fbx`, `Column_Round_Short.fbx`, `Column_Square.fbx`
- **Floors**: `Floor_Diamond.fbx`, `Floor_SquareLarge.fbx`, `Floor_Squares.fbx`, `Floor_Standard.fbx`, `Floor_Half.fbx`, `Floor_Tree.fbx` (floor with tree growing through)
- **Doors**: `Doors_GothicArch.fbx`, `Doors_RoundArch.fbx` + covered variants
- **Windows**: `Window_Bars.fbx`, `Window_Open.fbx`, `Window_Open_Double.fbx` + overgrown variants
- **Props**: Barrels, Chests (x2), Crates, Candles (x2), Cart, Torch, Trapdoor, Skull, Bear Traps (open/closed), Bookcase (empty/full), Pot variants (x3 + broken), Rails (corner/divider/straight), Stairs (x2)
- **Vegetation**: Bushes (5), Trees (3), Dead Trees (3), Grass, Curves (overgrown variants)
- **Structure supports**: `Support_Center/Left/Right/Tall.fbx`
- **Flags**: `Flag_GothicArch/RoundArch/Wall/Wall2.fbx`
- **Bridge**: `BridgeSection.fbx`, `Column_BridgeSupport.fbx`
- **Statues**: `Statue_Fox.fbx`, `Statue_Stag.fbx`

---

### ◆ `Retro Dungeons Modular House Interiors v1.0` (FBX ⚠️)
Interior room pieces with material variants (stone/tile/woodA/woodB/woodC) and 3 sub-variants (varA/B/C). Useful for building interiors. FBX only.

---

## CHARACTER & CREATURE PACKS (Phase 2)

### ★★★ `Animated Monster Pack @Quaternius` (FBX ⚠️)
**Convert and use for enemy characters.** Includes: `Slime.fbx`, `Skeleton.fbx`, `Bat.fbx`, `Dragon.fbx` — all animated. **Direct match for our existing SlimeEnemy + future enemies.**

### ★★ `Ultimate Animated Character Pack - Nov 2019` (FBX + glTF ⚠️)
Animated human characters: Wizard, BlueSoldier_Male, Ninja_Male/Female, Zombie_Male/Female, Chef_Hat, Doctor_Female, Casual_Male/Female, Worker_Male/Female, Suit_Male, Cow. Some glTF versions available. Good for NPC visual upgrades.

### ★★ `Ultimate Modular Women - April 2022` (FBX ⚠️)
Skeletal modular characters — separate body parts (body/legs/feet) for: Medieval, Casual, Formal, Worker, Soldier, Witch, SciFi. With pre-built combined FBX per outfit. Has sword prop.

### ★ `kenney_blocky-characters_20` (GLB ✅)
9 blocky animated characters (a–i). Quick-drop NPCs without conversion. Low visual quality but work day-one.

### ★ `kenney_mini-characters` (GLB ✅)
Tiny characters — various professions. Static poses, useful as decor NPCs.

### ◆ `Modular Character Outfits - Fantasy` (FBX ⚠️)
Fantasy outfit pieces for modular character rigs.

### ◆ `Posed Background Characters @Quaternius` (FBX ⚠️)
Static posed characters for background crowds.

### ◆ `Cute Fish Pack` (format TBD)
Presumably GLB fish — could be wildlife in rivers/lakes.

### ◆ `kenney_cube-pets_1.0` (GLB ✅)
Cube-style pet animals — could be used as wildlife.

---

## FORMAT NOTES

| Format | Loader | Status |
|---|---|---|
| `.glb` / `.gltf` | `THREE.GLTFLoader` | ✅ Ready to use |
| `.fbx` | `THREE.FBXLoader` (heavy) or convert | ⚠️ Prefer converting to GLB via Blender |
| `.obj` + `.mtl` | `THREE.OBJLoader` | ⚠️ Works but no PBR, no animation |
| `.unitypackage` | Not usable in three.js | ❌ Skip unless extractable |

**FBX → GLB conversion**: Use Blender (import FBX → export GLB) or the `fbx2gltf` CLI tool. Batch conversion script recommended before Phase 2 work begins.

---

## TEXTURE NOTES

Most Kenney packs use a single **atlas colormap** (`colormap.png`) shared across all models in the pack. This is ideal for batching:
- All models in a pack share one texture → single `MeshStandardMaterial` with `map`
- Enables `InstancedMesh` use for repeated tiles

Quaternius packs have individual textures per asset, less batch-friendly but higher quality.

---

## LICENSING

- **Kenney packs**: CC0 (public domain) — no attribution required, fully free for commercial use.
- **Quaternius packs**: CC0 (public domain) — same as Kenney.
- **Retro Dungeons (Zerinlabs)**: check `License.txt` in the pack folder — typically CC-BY or custom. `opengameasset.net.txt` present in zip.
- **Ultimate Modular Ruins**: check `License.txt` in extracted folder.
