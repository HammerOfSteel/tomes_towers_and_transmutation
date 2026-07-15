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

import { readdirSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, relative, extname, basename }                           from 'path';
import { fileURLToPath }                                               from 'url';

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
    desc:        'Bear, Bunny, Cat, Dog — FBX format, needs FBXLoader',
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
};

// ── filesystem scanner ────────────────────────────────────────────────────────

/** Recursively collect .glb and .fbx files, skipping 'animations' and 'textures' dirs. */
function walkModels(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip animation rig dirs and texture dirs
      if (entry === 'animations' || entry === 'textures') continue;
      walkModels(full, results);
    } else {
      const ext = extname(entry).toLowerCase();
      if (ext === '.glb' || ext === '.fbx') {
        results.push(full);
      }
    }
  }
  return results;
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
    modelCount:  models.length,
  });

  for (const absPath of models) {
    const relPath = '/' + relative(join(ROOT, 'public'), absPath).replace(/\\/g, '/');
    const stem    = basename(absPath, extname(absPath));
    const fmt     = extname(absPath).toLowerCase() === '.glb' ? 'glb' : 'fbx';

    const def = {
      id:     `${packId}/${stem}`,
      packId,
      name:   toDisplayName(stem),
      path:   relPath,
      format: fmt,
      roles:  meta.roles,
      tags:   meta.tags,
    };

    if (meta.animRig)  def.animRig  = meta.animRig;
    if (meta.animRigB) def.animRigB = meta.animRigB;

    modelDefs.push(def);
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
