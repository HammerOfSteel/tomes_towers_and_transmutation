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
