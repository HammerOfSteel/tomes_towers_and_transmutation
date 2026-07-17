#!/usr/bin/env node
/**
 * scripts/gen-char-manifest.mjs
 *
 * Scans public/assets/characters/ for extracted GLB and FBX model files and
 * writes src/characters/charManifest.ts — the typed manifest imported at
 * build time by the character selection system.
 *
 * Run AFTER scripts/extract-char-assets.mjs:
 *   node scripts/gen-char-manifest.mjs
 *
 * The output file includes all TypeScript type declarations so it is
 * self-contained and requires no hand-written companion types file.
 */

import { readFileSync, readdirSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative, extname, basename, dirname }                  from 'path';
import { fileURLToPath }                                               from 'url';
// ── Check if a GLB has embedded animation clips ───────────────────────────────
function glbHasAnimations(absPath) {
  try {
    const buf     = readFileSync(absPath);
    if (buf.readUInt32LE(0) !== 0x46546C67) return false;
    const jsonLen = buf.readUInt32LE(12);
    const json    = JSON.parse(buf.slice(20, 20 + jsonLen));
    return (json.animations || []).length > 0;
  } catch { return false; }
}
const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const ROOT       = join(__dirname, '..');
const CHAR_BASE  = join(ROOT, 'public', 'assets', 'characters');
const ANIM_RIG   = '/assets/characters/animations/rig_medium/Rig_Medium_General.glb';
const ANIM_MOVE  = '/assets/characters/animations/rig_medium/Rig_Medium_MovementBasic.glb';
const OUT_DIR    = join(ROOT, 'src', 'characters');
const OUT_FILE   = join(OUT_DIR, 'charManifest.ts');

// ── Per-pack static metadata ──────────────────────────────────────────────────
// This table drives roles, tags, animation-rig references, display info.
// Update when new packs are added.

const PACK_META = {
  kaykit_adventurers: {
    name:        'KayKit Adventurers 2.0',
    icon:        '⚔️',
    desc:        'Barbarian, Knight, Mage, Ranger, Rogue — skinned with shared KayKit animation rig',
    roles:       ['player', 'npc'],
    tags:        ['humanoid', 'kaykit'],
    animRig:     ANIM_RIG,
    animRigB:    ANIM_MOVE,
    recommended: true,
  },
  kaykit_skeletons: {
    name:        'KayKit Skeletons 1.1',
    icon:        '💀',
    desc:        'Skeleton Mage, Minion, Rogue, Warrior — skinned with shared KayKit animation rig',
    roles:       ['player', 'enemy'],
    tags:        ['skeleton', 'undead', 'kaykit'],
    animRig:     ANIM_RIG,
    animRigB:    ANIM_MOVE,
    recommended: true,
  },
  fox: {
    name:        'Fox',
    icon:        '🦊',
    desc:        'Fully rigged fox with PBR textures (embedded in GLB)',
    roles:       ['player'],
    tags:        ['creature', 'animal', 'quadruped'],
    recommended: true,
  },
  slime: {
    name:        'Slime',
    icon:        '🟢',
    desc:        'Slime with colour texture variants (Green, Blue, Orange, White, Detailed Green)',
    roles:       ['player', 'enemy'],
    tags:        ['creature', 'blob', 'magic'],
    recommended: true,
  },
  animal_plushies: {
    name:        'Animal Plushies',
    icon:        '🧸',
    desc:        'Bear, Bunny, Cat, Dog — static mesh, no animations',
    roles:       ['player'],
    tags:        ['creature', 'animal', 'cute', 'quadruped'],
    recommended: false,
  },
  adventure: {
    name:        'Adventurers',
    icon:        '🗺️',
    desc:        'Adventurer, Healer, Monk',
    roles:       ['npc', 'player'],
    tags:        ['humanoid', 'adventurer'],
    recommended: false,
  },
  fantasy_heroes: {
    name:        'Fantasy Heroes',
    icon:        '🧙',
    desc:        'Dwarf Warrior, Elf Archer, Hero, Knight, Necromancer, Paladin, Wizard',
    roles:       ['npc', 'player'],
    tags:        ['humanoid', 'hero', 'fantasy'],
    recommended: false,
  },
  royal_family: {
    name:        'Royal Family',
    icon:        '👑',
    desc:        'King, Prince, Queen',
    roles:       ['npc'],
    tags:        ['humanoid', 'noble', 'royal'],
    recommended: false,
  },
  elf: {
    name:        'Elves',
    icon:        '🌿',
    desc:        'Elf, Fire Elf, Ice Elf',
    roles:       ['npc', 'enemy'],
    tags:        ['humanoid', 'elf', 'magic'],
    recommended: false,
  },
  samurai: {
    name:        'Samurai',
    icon:        '🥷',
    desc:        'Female Samurai, Samurai',
    roles:       ['npc', 'player'],
    tags:        ['humanoid', 'warrior', 'eastern'],
    recommended: false,
  },
  villager_npc: {
    name:        'Villager NPCs',
    icon:        '👨‍🌾',
    desc:        'Blacksmith, Child, Hunter — shares a single atlas texture',
    roles:       ['npc'],
    tags:        ['humanoid', 'villager', 'civilian'],
    recommended: true,
  },
  goblin_pack: {
    name:        'Goblin Pack',
    icon:        '👺',
    desc:        'Basic Goblin, Goblin Archer, Goblin Warrior',
    roles:       ['enemy'],
    tags:        ['goblinoid', 'goblin'],
    recommended: true,
  },
  orc_pack: {
    name:        'Orc Pack',
    icon:        '🪓',
    desc:        'Ash Walker, Bone Whittler, Ironbound Marauder',
    roles:       ['enemy'],
    tags:        ['goblinoid', 'orc'],
    recommended: false,
  },
  bandits_free: {
    name:        'Bandits',
    icon:        '🗡️',
    desc:        'Poacher, Scavenger, Thug',
    roles:       ['enemy'],
    tags:        ['humanoid', 'bandit', 'rogue'],
    recommended: false,
  },
  golem_free: {
    name:        'Golems',
    icon:        '🪨',
    desc:        'Earth Golem, Iron Golem, Rock Golem',
    roles:       ['enemy'],
    tags:        ['construct', 'golem', 'boss'],
    recommended: false,
  },
  skeletons_free: {
    name:        'Extra Skeletons',
    icon:        '☠️',
    desc:        'Skeleton, Skeleton Archer (alternative art style)',
    roles:       ['enemy'],
    tags:        ['skeleton', 'undead'],
    recommended: false,
  },
  army_free: {
    name:        'Army',
    icon:        '🛡️',
    desc:        'Captains, Footmen, Knights in blue/red variants',
    roles:       ['enemy', 'npc'],
    tags:        ['humanoid', 'soldier', 'guard'],
    recommended: false,
  },
  little_knight: {
    name:        'Little Knight',
    icon:        '🗡️',
    desc:        'Little Knight with embedded animation FBXs (idle, run, attack, death)',
    roles:       ['player', 'enemy'],
    tags:        ['humanoid', 'knight', 'animated'],
    recommended: false,
  },
  low_poly_people: {
    name:        'Low Poly People',
    icon:        '👥',
    desc:        'Generic populace — fat/normal men and women in variants',
    roles:       ['npc'],
    tags:        ['humanoid', 'generic', 'civilian'],
    recommended: false,
  },

  // ── Enemy packs extracted / converted in Phase A/B1 ──────────────────────

  monster_pack_animated: {
    name:        'Quaternius Monsters',
    icon:        '🐉',
    desc:        'Bat, Dragon, Skeleton, Slime — Quaternius low-poly with embedded animations',
    roles:       ['enemy'],
    tags:        ['creature', 'monster', 'animated', 'quaternius'],
    recommended: true,
  },
  easy_animated: {
    name:        'Easy Animated Creatures',
    icon:        '🕷️',
    desc:        'Frog, Rat, Snake, Spider, Wasp — overworld creatures with embedded animations',
    roles:       ['enemy'],
    tags:        ['creature', 'animal', 'overworld', 'animated', 'quaternius'],
    recommended: true,
  },
  cube_pets: {
    name:        'Kenney Cube Pets',
    icon:        '🐾',
    desc:        '24 cube-style animal models — summons, familiars, minions',
    roles:       ['npc'],
    tags:        ['creature', 'animal', 'kenney', 'summon', 'familiar'],
    recommended: true,
  },

  // ── Custom Meshy AI models (split mesh.glb + anims.glb) ──────────────────
  // animRig is set to the sibling anims.glb — handled specially in the scanner.

  meshy_dark_fay: {
    name:        'Dark Fay',
    icon:        '🧝',
    desc:        'Custom Meshy AI — dark fairy, boss-tier enemy. Separate anims.glb.',
    roles:       ['enemy'],
    tags:        ['fae', 'humanoid', 'boss', 'meshy', 'animated'],
    recommended: true,
  },
  meshy_mutated_pig_man: {
    name:        'Pig-Man Brute',
    icon:        '🐷',
    desc:        'Custom Meshy AI — mutated pig humanoid, dungeon elite. Separate anims.glb.',
    roles:       ['enemy'],
    tags:        ['beast', 'humanoid', 'elite', 'meshy', 'animated'],
    recommended: true,
  },
  meshy_vampire_fay: {
    name:        'Vampire Fay',
    icon:        '🧛',
    desc:        'Custom Meshy AI — vampire fairy, boss-tier enemy. Separate anims.glb.',
    roles:       ['enemy'],
    tags:        ['fae', 'undead', 'boss', 'meshy', 'animated'],
    recommended: true,
  },

  // ── Wizard characters (nested subdirs, each with mesh.glb + anims.glb) ───

  wizards: {
    name:        'Wizard Characters',
    icon:        '🧙',
    desc:        'Elf, Lizard, Toad wizard variants — Meshy AI models with separate animation GLBs',
    roles:       ['npc'],
    tags:        ['humanoid', 'mage', 'wizard', 'meshy', 'animated'],
    recommended: true,
  },
};

// ── filesystem scanner ────────────────────────────────────────────────────────

/** Recursively collect .glb and .fbx model files.
 *
 *  Special handling:
 *    • 'animations' and 'textures' directories are skipped (shared rigs).
 *    • 'anims.glb' files are skipped — they are companion animation files
 *      referenced via animRig on the sibling mesh.glb (see buildModelDef).
 *    • 'Textures' subdirectory inside cube_pets etc. is skipped.
 */
function walkModels(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const lc = entry.toLowerCase();
      if (lc === 'animations' || lc === 'textures') continue;
      walkModels(full, results);
    } else {
      // Skip companion animation files and raw texture images.
      if (entry === 'anims.glb') continue;
      const ext = extname(entry).toLowerCase();
      if (ext === '.glb') {
        results.push(full);
      } else if (ext === '.fbx') {
        // Skip FBX if a GLB with the same stem already exists in this directory.
        // We prefer the GLB (converted) over the original FBX.
        const glbPeer = full.replace(/\.fbx$/i, '.glb');
        if (!existsSync(glbPeer)) results.push(full);
      }
    }
  }
  return results;
}

/**
 * Build a model def object from an absolute path.
 *
 * If the filename stem is 'mesh', use the containing directory name as the
 * human-readable stem and look for a sibling 'anims.glb' as the animRig.
 * This handles the Meshy AI and wizard split-model convention.
 */
function buildModelDef(absPath, packId, meta) {
  const relPath  = '/' + relative(join(ROOT, 'public'), absPath).replace(/\\/g, '/');
  const rawStem  = basename(absPath, extname(absPath));
  const fmt      = extname(absPath).toLowerCase() === '.glb' ? 'glb' : 'fbx';

  // For 'mesh.glb', use the parent directory name as the display stem.
  const isMeshFile = rawStem.toLowerCase() === 'mesh';
  const stem       = isMeshFile ? basename(dirname(absPath)) : rawStem;

  const def = {
    id:     `${packId}/${stem}`,
    packId,
    name:   toDisplayName(stem),
    path:   relPath,
    format: fmt,
    roles:  meta.roles,
    tags:   meta.tags,
  };

  // Prefer pack-level animRig metadata, but for mesh.glb files auto-detect
  // a sibling anims.glb in the same directory.
  if (meta.animRig) {
    def.animRig = meta.animRig;
  } else if (isMeshFile) {
    const siblingAnims = join(dirname(absPath), 'anims.glb');
    if (existsSync(siblingAnims)) {
      def.animRig = '/' + relative(join(ROOT, 'public'), siblingAnims).replace(/\\/g, '/');
    }
  }

  if (meta.animRigB) def.animRigB = meta.animRigB;

  // Determine if this model is animated:
  //   true  → has embedded clips, OR has an animRig that supplies clips.
  //   false → static mesh only (T-pose, needs external animation pipeline).
  const hasEmbeddedAnims = fmt === 'glb' && glbHasAnimations(absPath);
  def.animated = hasEmbeddedAnims || !!(def.animRig);

  return def;
}

/** Convert a filename stem to a human-readable display name.
 *  e.g. "Skeleton_Warrior" → "Skeleton Warrior"
 *       "fat-man-a"        → "Fat Man A"
 *       "Slime"            → "Slime"
 */
function toDisplayName(stem) {
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── build manifest ────────────────────────────────────────────────────────────

if (!existsSync(CHAR_BASE)) {
  console.error('❌  public/assets/characters/ not found.');
  console.error('    Run  node scripts/extract-char-assets.mjs  first.');
  process.exit(1);
}

const packDefs   = [];
const modelDefs  = [];
const packsFound = [];

for (const packId of readdirSync(CHAR_BASE).sort()) {
  if (packId === 'animations') continue;   // shared rig dir, not a pack
  const packDir = join(CHAR_BASE, packId);
  if (!statSync(packDir).isDirectory()) continue;

  const models = walkModels(packDir);
  if (models.length === 0) continue;

  const meta = PACK_META[packId] ?? {
    name:        packId,
    icon:        '📦',
    desc:        '',
    roles:       ['npc'],
    tags:        [],
    recommended: false,
  };

  packsFound.push(packId);

  packDefs.push({
    id:          packId,
    name:        meta.name,
    icon:        meta.icon,
    desc:        meta.desc,
    roles:       meta.roles,
    tags:        meta.tags,
    recommended: meta.recommended,
    modelCount:  models.length,  // anims.glb already excluded by walker
  });

  for (const absPath of models) {
    modelDefs.push(buildModelDef(absPath, packId, meta));
  }
}

const totalModels = modelDefs.length;
const totalPacks  = packDefs.length;

// ── emit TypeScript ───────────────────────────────────────────────────────────

const TS_HEADER = `\
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-GENERATED by scripts/gen-char-manifest.mjs
// DO NOT EDIT — run  node scripts/gen-char-manifest.mjs  to refresh
// ${totalModels} models across ${totalPacks} character packs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

const TS_TYPES = `\
export type CharRole = 'player' | 'npc' | 'enemy';
export type CharFmt  = 'glb' | 'fbx';

export interface CharPackDef {
  /** Stable identifier — used as a folder name and settings key. */
  id:          string;
  name:        string;
  icon:        string;
  desc:        string;
  /** Which game roles models in this pack can fill. */
  roles:       CharRole[];
  /** Semantic tags for filtering (e.g. 'humanoid', 'skeleton', 'creature'). */
  tags:        string[];
  recommended: boolean;
  /** How many model files were found at manifest generation time. */
  modelCount:  number;
}

export interface CharModelDef {
  /** Unique ID — "<packId>/<stem>", e.g. "kaykit_adventurers/Knight". */
  id:       string;
  packId:   string;
  /** Human-readable display name derived from filename stem. */
  name:     string;
  /** Root-relative URL served by Vite, e.g. "/assets/characters/…/Knight.glb". */
  path:     string;
  format:   CharFmt;
  roles:    CharRole[];
  tags:     string[];
  /**
   * KayKit Rig_Medium_General.glb path — load this alongside the character
   * GLB and pass both to AnimationRetargeter to get Idle/Attack/Die/etc. clips.
   */
  animRig?:  string;
  /**
   * KayKit Rig_Medium_MovementBasic.glb path — provides Walk/Run clips.
   */
  animRigB?: string;
  /**
   * Whether this model has usable animations — either embedded clips in the
   * GLB or a companion animRig that supplies retargetable clips.
   * Static T-pose meshes have animated=false.
   */
  animated: boolean;
}
`;

const TS_BODY = `\
export const CHAR_PACKS: readonly CharPackDef[] = ${JSON.stringify(packDefs, null, 2)};

export const CHAR_MODELS: readonly CharModelDef[] = ${JSON.stringify(modelDefs, null, 2)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, TS_HEADER + TS_TYPES + TS_BODY, 'utf8');

console.log(`\n✓  Wrote ${OUT_FILE.replace(ROOT + '/', '')}`);
console.log(`   ${totalModels} models across ${totalPacks} packs:\n`);
for (const p of packDefs) {
  console.log(`   ${p.icon} ${p.id.padEnd(20)} ${String(p.modelCount).padStart(2)} models  [${p.roles.join(', ')}]`);
}
console.log();
