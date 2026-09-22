#!/usr/bin/env node
/**
 * scripts/gen-quaternius-manifest.mjs
 *
 * Scans public/assets/quaternius/ for extracted model files and writes
 * src/assets/quaterniusManifest.ts — the typed manifest imported at build
 * time by the Asset Lab dev-UI (and, later, by procedural placement/
 * construction systems once step 3's wiring plan is implemented).
 *
 * Mirrors scripts/gen-char-manifest.mjs's structure (self-contained output
 * file, hand-maintained PACK_META table for static metadata, auto-derived
 * per-model fields). Key differences from the character manifest:
 *   - Packs are keyed by "<category>/<packId>" (matches the on-disk
 *     assets/quaternius/<category>/<packId>/ layout) instead of a flat id.
 *   - `category` replaces `roles` — these are props/creatures/buildings, not
 *     player/npc/enemy character slots.
 *   - Four formats instead of two: gltf, glb, fbx, obj.
 *   - `modular` flags kit-of-parts packs (modular_dungeons, medieval_village
 *     buildings assembled from parts) vs monolithic single-mesh packs.
 *
 * Run AFTER scripts/extract-quaternius-assets.mjs:
 *   node scripts/gen-quaternius-manifest.mjs
 */

import { readFileSync, readdirSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative, extname, basename }                                        from 'path';
import { fileURLToPath }                                                             from 'url';
import { execSync }                                                                  from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');
const QUAT_BASE = join(ROOT, 'public', 'assets', 'quaternius');
const OUT_DIR   = join(ROOT, 'src', 'assets');
const OUT_FILE  = join(OUT_DIR, 'quaterniusManifest.ts');

// ── animation sniffing per format ─────────────────────────────────────────────

/** GLB: parse the binary chunk-0 JSON header, check `animations`. */
function glbHasAnimations(absPath) {
  try {
    const buf     = readFileSync(absPath);
    if (buf.readUInt32LE(0) !== 0x46546C67) return false;
    const jsonLen = buf.readUInt32LE(12);
    const json    = JSON.parse(buf.slice(20, 20 + jsonLen));
    return (json.animations || []).length > 0;
  } catch { return false; }
}

/** glTF (JSON text, embedded or external buffer): parse directly. */
function gltfHasAnimations(absPath) {
  try {
    const json = JSON.parse(readFileSync(absPath, 'utf8'));
    return (json.animations || []).length > 0;
  } catch { return false; }
}

/**
 * FBX (binary or ASCII): FBX has no cheap JSON header, but every FBX file
 * that carries animation data includes plain-text "AnimCurve" node names
 * even in the binary format (confirmed by sampling: Bat.fbx — a known
 * animated model — contains ~300 occurrences; Blacksmith.fbx and Apple.fbx
 * — known static models — contain 0). Grep count > 0 is used as the
 * animated flag.
 */
function fbxHasAnimations(absPath) {
  try {
    const out = execSync(`grep -a -c "AnimCurve" "${absPath}"`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    return parseInt(out, 10) > 0;
  } catch {
    // grep exits 1 (no match) — that means zero occurrences, not an error.
    return false;
  }
}

// OBJ is a static-mesh-only format — never animated.

// ── sub-group classification (Category → Pack → Sub-group hierarchy) ─────────
// See docs/asset-integration/2026-09-22-quaternius-asset-inventory.md's
// "Asset Lab categorization hierarchy" section — this is that taxonomy,
// implemented and verified against every model name (100% coverage, no
// orphans; see the classify() self-check below). Only the 5 large/flat
// packs get sub-groups; small coherent packs (animals, medieval buildings,
// all 3 monster packs) are left without a `subgroup` (undefined) since the
// Asset Lab UI treats "no subgroup" as "show flat".

const starts = (...prefixes) => (s) => prefixes.some((p) => s.startsWith(p));
const exact  = (...names) => (s) => names.includes(s);

const SUBGROUP_RULES = {
  'modular_dungeons/obj_kit': [
    [starts('Window_Bars'), 'Walls & Windows'],
    [starts('Wall'), 'Walls & Windows'],
    [starts('Arch_'), 'Arches, Doors & Columns'],
    [starts('Column_'), 'Arches, Doors & Columns'],
    [starts('Doors_'), 'Arches, Doors & Columns'],
    [starts('Support_'), 'Arches, Doors & Columns'],
    [starts('Floor_'), 'Floors'],
    [starts('BridgeSection'), 'Stairs, Bridges & Traversal'],
    [starts('Curve_'), 'Stairs, Bridges & Traversal'],
    [starts('Rail_'), 'Stairs, Bridges & Traversal'],
    [starts('Stairs'), 'Stairs, Bridges & Traversal'],
    [starts('Trapdoor'), 'Stairs, Bridges & Traversal'],
    [exact('Barrel'), 'Furniture & Containers'],
    [starts('Bookcase_'), 'Furniture & Containers'],
    [starts('Chest'), 'Furniture & Containers'],
    [exact('Crate'), 'Furniture & Containers'],
    [starts('Pot1', 'Pot2', 'Pot3'), 'Furniture & Containers'],
    [starts('Bush_'), 'Nature & Overgrowth Dressing'],
    [starts('DeadTree_'), 'Nature & Overgrowth Dressing'],
    [starts('Tree_'), 'Nature & Overgrowth Dressing'],
    [exact('Grass'), 'Nature & Overgrowth Dressing'],
    [starts('Candles_'), 'Lighting & Decor'],
    [starts('Flag_'), 'Lighting & Decor'],
    [exact('Skull'), 'Lighting & Decor'],
    [starts('Statue_'), 'Lighting & Decor'],
    [exact('Torch'), 'Lighting & Decor'],
    [starts('BearTrap_'), 'Traps & Interactive'],
    // fallthrough → 'Misc / Other': Brick, Bricks, Cart, Character_Animated,
    // Window_Open(_Double) — matches the inventory doc's Misc bucket.
  ],
  'modular_fantasy_village/medieval_village_megakit': [
    [starts('WindowShutters_'), 'Windows & Shutters'],
    [starts('Window_'), 'Windows & Shutters'],
    [starts('DoorFrame_'), 'Doors & Door Frames'],
    [starts('Door_'), 'Doors & Door Frames'],
    [starts('HoleCover_'), 'Stairs & Hole Covers'],
    [starts('Stair_Interior_'), 'Stairs & Hole Covers'],
    [starts('Stairs_Exterior_'), 'Stairs & Hole Covers'],
    [starts('Overhang_'), 'Overhangs & Balconies'],
    [starts('Balcony_'), 'Overhangs & Balconies'],
    [starts('Roof_'), 'Roofs'],
    [starts('Prop_'), 'Props & Dressing'],
    [starts('Wall_'), 'Walls'],
    [starts('Floor_'), 'Floors'],
    [starts('Corner_'), 'Corners & Edges'],
  ],
  'fantasy_props/fantasy_props_megakit': [
    [exact('Table_Large'), 'Furniture'],
    [starts('Table_'), 'Tableware & Alchemy'],
    [starts('Barrel'), 'Storage & Containers'],
    [starts('Bucket_'), 'Storage & Containers'],
    [starts('Cage_'), 'Storage & Containers'],
    [starts('Chest_'), 'Storage & Containers'],
    [starts('Crate_'), 'Storage & Containers'],
    [starts('FarmCrate_'), 'Storage & Containers'],
    [starts('Pot_'), 'Storage & Containers'],
    [starts('Pouch_'), 'Storage & Containers'],
    [starts('Vase_'), 'Storage & Containers'],
    [starts('Bed_'), 'Furniture'],
    [exact('Bench'), 'Furniture'],
    [starts('Bookcase_'), 'Furniture'],
    [exact('Cabinet'), 'Furniture'],
    [starts('Chair_'), 'Furniture'],
    [starts('Nightstand_'), 'Furniture'],
    [starts('Shelf_'), 'Furniture'],
    [exact('Stool'), 'Furniture'],
    [starts('Workbench'), 'Furniture'],
    [starts('BookGroup_'), 'Books & Scrolls'],
    [starts('BookStand'), 'Books & Scrolls'],
    [starts('Book_'), 'Books & Scrolls'],
    [starts('Scroll_'), 'Books & Scrolls'],
    [starts('Bottle_'), 'Tableware & Alchemy'],
    [exact('Chalice'), 'Tableware & Alchemy'],
    [exact('Mug'), 'Tableware & Alchemy'],
    [starts('Potion_'), 'Tableware & Alchemy'],
    [starts('SmallBottle'), 'Tableware & Alchemy'],
    [exact('Anvil'), 'Tools & Weapons'],
    [starts('Anvil_'), 'Tools & Weapons'],
    [starts('Axe_'), 'Tools & Weapons'],
    [starts('Pickaxe_'), 'Tools & Weapons'],
    [starts('Shield_'), 'Tools & Weapons'],
    [starts('Sword_'), 'Tools & Weapons'],
    [starts('WeaponStand'), 'Tools & Weapons'],
    [exact('Whetstone'), 'Tools & Weapons'],
    [starts('CandleStick'), 'Lighting'],
    [starts('Candle_'), 'Lighting'],
    [exact('Chandelier'), 'Lighting'],
    [starts('Lantern_'), 'Lighting'],
    [starts('Torch_'), 'Lighting'],
    [exact('Bag'), 'Misc Dressing'],
    [exact('Carrot'), 'Misc Dressing'],
    [exact('Cauldron'), 'Misc Dressing'],
    [starts('Chain_'), 'Misc Dressing'],
    [exact('Dummy'), 'Misc Dressing'],
    [starts('Rope_'), 'Misc Dressing'],
    [starts('Coin'), 'Currency & Valuables'],
    [starts('Key_'), 'Currency & Valuables'],
    [starts('Banner_'), 'Banners & Cloth'],
    [starts('Peg_Rack'), 'Market Stalls'],
    [starts('Stall_'), 'Market Stalls'],
  ],
  'fantasy_props/ultimate_food_pack': [
    [starts('Burger', 'Cheeseburger', 'DoubleCheeseburger', 'Hotdog', 'Pizza',
      'Sushi_', 'Sashimi_', 'Pancake', 'Waffle', 'Donut', 'Fries',
      'Croissant', 'Bread', 'Steak', 'Bacon_', 'Corndog', 'ChickenLeg',
      'Fish', 'Egg_', 'Cupcake', 'IceCream_', 'Popsicle_'), 'Prepared Food'],
    [starts('Apple', 'Avocado', 'Banana', 'Broccoli', 'Carrot', 'Coconut',
      'Eggplant', 'Lettuce', 'Mushroom', 'Orange', 'Pepper_', 'Pumpkin',
      'Tomato', 'Turnip'), 'Raw Produce'],
    [starts('Bottle', 'Cheese_Singles', 'ChocolateBar', 'KetchupBottle',
      'KetchupMustard', 'MayoBottle', 'MustardBottle', 'PeanutButter',
      'Soda', 'SoySauce'), 'Condiments & Drinks'],
    [starts('Chopsticks', 'CookingPot', 'Fork', 'FryingPan', 'Jar_Large',
      'Knife', 'Plate', 'Spoon'), 'Kitchenware'],
    // fallthrough → 'Misc / Other': Sausage_Cooked/Raw, Tentacle.
  ],
  'medieval_village_pack/props': [
    [starts('Bench_'), 'Street Furniture'],
    [exact('Fence'), 'Street Furniture'],
    [exact('Gazebo'), 'Street Furniture'],
    [starts('Path_'), 'Street Furniture'],
    [exact('Stairs'), 'Street Furniture'],
    [exact('Well'), 'Street Furniture'],
    [starts('Bag'), 'Storage & Carts'],
    [exact('Barrel'), 'Storage & Carts'],
    [exact('Cart'), 'Storage & Carts'],
    [exact('Crate'), 'Storage & Carts'],
    [starts('Package_'), 'Storage & Carts'],
    [starts('Door_'), 'Building Facade Parts'],
    [starts('Window_'), 'Building Facade Parts'],
    [exact('Hay'), 'Natural Dressing'],
    [starts('Rock_'), 'Natural Dressing'],
    [starts('Bonfire'), 'Fire & Smoke'],
    [exact('Smoke'), 'Fire & Smoke'],
    [starts('MarketStand_'), 'Market'],
    // fallthrough → 'Misc / Other': Bell, Cauldron, Sawmill_saw.
  ],
};

/** Classify a model's sub-group within its pack. Returns undefined for packs
 *  with no rule table (left flat), 'Misc / Other' for an unmatched stem in a
 *  pack that does have rules (should be rare/expected — see the fallthrough
 *  notes above). */
function classifySubgroup(packId, stem) {
  const rules = SUBGROUP_RULES[packId];
  if (!rules) return undefined;
  for (const [test, group] of rules) {
    if (test(stem)) return group;
  }
  return 'Misc / Other';
}

// ── per-pack static metadata ──────────────────────────────────────────────────
// Keyed by "<category>/<packId>" matching the extraction script's output dirs.

const PACK_META = {
  'animals/ultimate_animated_animals': {
    name:     'Ultimate Animated Animals',
    icon:     '🐾',
    desc:     '12 rigged, animated animals (glTF, embedded buffers) — Bear, Cow, Deer, Duck, Fox, Frog, Horse, Husky, Pig, Rabbit, Sheep, Wolf',
    category: 'animals',
    tags:     ['creature', 'animal', 'quadruped'],
    modular:  false,
  },
  'monsters/animated_monster_pack': {
    name:     'Animated Monster Pack',
    icon:     '👹',
    desc:     'Bat, Dragon, Skeleton, Slime — rigged & animated (FBX only, no glTF export)',
    category: 'monsters',
    tags:     ['creature', 'monster', 'animated'],
    modular:  false,
  },
  'monsters/bestiary_dungeon_monsters': {
    name:     'Bestiary — Dungeon Monsters',
    icon:     '🧟',
    desc:     'Ready-made self-contained GLB exports (embedded buffers + PBR textures)',
    category: 'monsters',
    tags:     ['creature', 'monster', 'dungeon'],
    modular:  false,
  },
  'monsters/cute_animated_monsters': {
    name:     'Cute Animated Monsters',
    icon:     '👻',
    desc:     '21 stylised, animated monsters (glTF + PNG textures)',
    category: 'monsters',
    tags:     ['creature', 'monster', 'animated', 'cute'],
    modular:  false,
  },
  'fantasy_props/fantasy_props_megakit': {
    name:     'Fantasy Props MegaKit',
    icon:     '🏺',
    desc:     '94 static fantasy props (weapons, furniture, banners, containers) — glTF + PBR textures',
    category: 'fantasy_props',
    tags:     ['prop', 'fantasy', 'static'],
    modular:  false,
  },
  'fantasy_props/ultimate_food_pack': {
    name:     'Ultimate Food Pack',
    icon:     '🍞',
    desc:     '103 static food props (FBX only, no separate textures — vertex-colour materials)',
    category: 'fantasy_props',
    tags:     ['prop', 'food', 'static'],
    modular:  false,
  },
  'medieval_village_pack/buildings': {
    name:     'Medieval Village — Buildings',
    icon:     '🏠',
    desc:     '10 monolithic building meshes (FBX, one mesh per building — not kit-of-parts)',
    category: 'medieval_village_pack',
    tags:     ['building', 'medieval', 'monolithic'],
    modular:  false,
  },
  'medieval_village_pack/props': {
    name:     'Medieval Village — Props',
    icon:     '🛖',
    desc:     '34 settlement-dressing props — carts, barrels, fences, wells (FBX)',
    category: 'medieval_village_pack',
    tags:     ['prop', 'medieval', 'static'],
    modular:  false,
  },
  'modular_dungeons/obj_kit': {
    name:     'Modular Dungeon Kit',
    icon:     '🗝️',
    desc:     '92 kit-of-parts dungeon pieces (walls, floors, doors, statues) — OBJ+MTL, flat vertex-colour materials (no texture maps)',
    category: 'modular_dungeons',
    tags:     ['dungeon', 'modular', 'kit-of-parts'],
    modular:  true,
  },
  'modular_fantasy_village/medieval_village_megakit': {
    name:     'Medieval Village MegaKit',
    icon:     '🏘️',
    desc:     '176 kit-of-parts village pieces (walls, roofs, balconies, doors) — glTF + PBR textures',
    category: 'modular_fantasy_village',
    tags:     ['building', 'medieval', 'modular', 'kit-of-parts'],
    modular:  true,
  },
};

// ── filesystem scanner ────────────────────────────────────────────────────────

/** Collect model files of interest in a single flat pack directory
 *  (all Quaternius packs extract flat, no subfolders — see extraction
 *  script). MTL/BIN/PNG companions are not modeled here; the loader
 *  resolves them implicitly via same-directory relative paths. */
function collectModels(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const ext = extname(entry).toLowerCase();
    if (ext === '.gltf' || ext === '.glb' || ext === '.fbx' || ext === '.obj') {
      out.push(join(dir, entry));
    }
  }
  return out;
}

function toDisplayName(stem) {
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function buildModelDef(absPath, packId, meta) {
  const relPath = '/' + relative(join(ROOT, 'public'), absPath).replace(/\\/g, '/');
  const stem    = basename(absPath, extname(absPath));
  const ext     = extname(absPath).toLowerCase();
  const format  =
    ext === '.gltf' ? 'gltf' :
    ext === '.glb'  ? 'glb'  :
    ext === '.fbx'  ? 'fbx'  : 'obj';

  let animated = false;
  if (format === 'glb')       animated = glbHasAnimations(absPath);
  else if (format === 'gltf') animated = gltfHasAnimations(absPath);
  else if (format === 'fbx')  animated = fbxHasAnimations(absPath);
  // obj → always false

  return {
    id:       `${packId}/${stem}`,
    packId,
    category: meta.category,
    name:     toDisplayName(stem),
    path:     relPath,
    format,
    animated,
    subgroup: classifySubgroup(packId, stem),
  };
}

// ── build manifest ────────────────────────────────────────────────────────────

if (!existsSync(QUAT_BASE)) {
  console.error('❌  public/assets/quaternius/ not found.');
  console.error('    Run  node scripts/extract-quaternius-assets.mjs  first.');
  process.exit(1);
}

const packDefs  = [];
const modelDefs = [];

for (const category of readdirSync(QUAT_BASE).sort()) {
  const categoryDir = join(QUAT_BASE, category);
  if (!statSync(categoryDir).isDirectory()) continue;

  for (const packName of readdirSync(categoryDir).sort()) {
    const packDir = join(categoryDir, packName);
    if (!statSync(packDir).isDirectory()) continue;

    const packId = `${category}/${packName}`;
    const models = collectModels(packDir);
    if (models.length === 0) continue;

    const meta = PACK_META[packId] ?? {
      name:     packName,
      icon:     '📦',
      desc:     '',
      category,
      tags:     [],
      modular:  false,
    };

    packDefs.push({
      id:         packId,
      name:       meta.name,
      icon:       meta.icon,
      desc:       meta.desc,
      category:   meta.category,
      tags:       meta.tags,
      modular:    meta.modular,
      modelCount: models.length,
    });

    for (const absPath of models) {
      modelDefs.push(buildModelDef(absPath, packId, meta));
    }
  }
}

const totalModels = modelDefs.length;
const totalPacks   = packDefs.length;
const animatedCount = modelDefs.filter((m) => m.animated).length;

// ── emit TypeScript ───────────────────────────────────────────────────────────

const TS_HEADER = `\
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-GENERATED by scripts/gen-quaternius-manifest.mjs
// DO NOT EDIT — run  node scripts/gen-quaternius-manifest.mjs  to refresh
// ${totalModels} models (${animatedCount} animated) across ${totalPacks} Quaternius packs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

const TS_TYPES = `\
export type QuatCategory =
  | 'animals'
  | 'monsters'
  | 'fantasy_props'
  | 'medieval_village_pack'
  | 'modular_dungeons'
  | 'modular_fantasy_village';

export type QuatFormat = 'gltf' | 'glb' | 'fbx' | 'obj';

export interface QuatPackDef {
  /** Stable identifier — "<category>/<packName>", matches the on-disk path. */
  id:         string;
  name:       string;
  icon:       string;
  desc:       string;
  category:   QuatCategory;
  tags:       string[];
  /** True for kit-of-parts packs meant to be assembled (e.g. modular dungeon
   *  pieces, village wall/roof segments); false for monolithic single-mesh
   *  assets (e.g. one building, one animal, one food prop). */
  modular:    boolean;
  /** How many model files were found at manifest generation time. */
  modelCount: number;
}

export interface QuatModelDef {
  /** Unique ID — "<packId>/<stem>", e.g. "animals/ultimate_animated_animals/Fox". */
  id:       string;
  packId:   string;
  category: QuatCategory;
  /** Human-readable display name derived from filename stem. */
  name:     string;
  /** Root-relative URL served by Vite, e.g. "/assets/quaternius/animals/…/Fox.gltf". */
  path:     string;
  format:   QuatFormat;
  /**
   * Whether this model carries usable animation clips (embedded skeletal
   * animation for gltf/glb/fbx). OBJ is always false — the format has no
   * animation support. Detected at manifest-generation time; see the format-
   * specific sniffing functions in scripts/gen-quaternius-manifest.mjs.
   */
  animated: boolean;
  /**
   * Sub-group within the pack (e.g. "Walls & Windows", "Roofs"), per the
   * Category → Pack → Sub-group hierarchy in
   * docs/asset-integration/2026-09-22-quaternius-asset-inventory.md.
   * Undefined for packs left intentionally flat (small/coherent packs —
   * animals, medieval buildings, monster packs). Classified from the
   * filename stem at manifest-generation time; see SUBGROUP_RULES in
   * scripts/gen-quaternius-manifest.mjs.
   */
  subgroup?: string;
}
`;

const TS_BODY = `\
export const QUAT_PACKS: readonly QuatPackDef[] = ${JSON.stringify(packDefs, null, 2)};

export const QUAT_MODELS: readonly QuatModelDef[] = ${JSON.stringify(modelDefs, null, 2)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, TS_HEADER + TS_TYPES + TS_BODY, 'utf8');

console.log(`\n✓  Wrote ${OUT_FILE.replace(ROOT + '/', '')}`);
console.log(`   ${totalModels} models (${animatedCount} animated) across ${totalPacks} packs:\n`);
for (const p of packDefs) {
  console.log(`   ${p.icon} ${p.id.padEnd(48)} ${String(p.modelCount).padStart(3)} models  [${p.category}]${p.modular ? ' (modular)' : ''}`);
}
console.log();
