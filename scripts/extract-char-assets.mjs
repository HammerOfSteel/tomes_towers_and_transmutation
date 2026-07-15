#!/usr/bin/env node
/**
 * scripts/extract-char-assets.mjs
 *
 * Extracts character model files (GLB + FBX) from the source asset zips in
 * assets/ into public/assets/characters/<packId>/ so Vite can serve them.
 *
 * KayKit shared animation rigs go to:
 *   public/assets/characters/animations/rig_medium/
 *
 * LittleKnight baked-animation FBXs go to:
 *   public/assets/characters/little_knight/animations/
 *
 * Usage:
 *   node scripts/extract-char-assets.mjs
 *
 * Requires: unzip (standard on macOS/Linux)
 * No additional npm dependencies needed.
 */

import { execSync }             from 'child_process';
import { mkdirSync, existsSync, renameSync } from 'fs';
import { join, basename }       from 'path';
import { fileURLToPath }        from 'url';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const ROOT       = join(__dirname, '..');
const CHAR_BASE  = join(ROOT, 'public', 'assets', 'characters');
const ANIM_RIGS  = join(CHAR_BASE, 'animations', 'rig_medium');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run `unzip -o [-j] <zip> "<pattern>" -d <dest>`.
 * junk=true flattens the in-zip directory tree into dest.
 */
function extract(zipPath, pattern, dest, { junk = true } = {}) {
  const absZip = join(ROOT, zipPath);
  if (!existsSync(absZip)) {
    console.warn(`  ⚠  not found: ${zipPath}`);
    return false;
  }
  mkdirSync(dest, { recursive: true });
  const j = junk ? '-j' : '';
  try {
    execSync(`unzip -o ${j} "${absZip}" "${pattern}" -d "${dest}"`, {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return true;
  } catch {
    // unzip exits non-zero when no files matched the pattern — treat as a warning
    console.warn(`  ⚠  no matches for "${pattern}" in ${zipPath}`);
    return false;
  }
}

/** Rename a file inside destDir if oldName exists there (always overwrites). */
function mv(destDir, oldName, newName) {
  const src = join(destDir, oldName);
  const dst = join(destDir, newName);
  if (existsSync(src)) renameSync(src, dst);
}

function packDir(id) { return join(CHAR_BASE, id); }

// ── pack extraction table ────────────────────────────────────────────────────

console.log('\n🎭  Extracting character assets…\n');

// ── KayKit Adventurers 2.0 (GLB — character creation priority) ───────────────
{
  const zip = 'assets/soft_characters/KayKit_Adventurers_2.0_FREE.zip';
  console.log('📦 kaykit_adventurers');
  extract(zip, '*/Characters/gltf/*.glb',  packDir('kaykit_adventurers'));
  extract(zip, '*/Animations/gltf/*/*.glb', ANIM_RIGS);
}

// ── KayKit Skeletons 1.1 (GLB — character creation + enemy) ──────────────────
// Note: uses lowercase 'characters/' unlike Adventurers which uses 'Characters/'
{
  const zip = 'assets/soft_characters/KayKit_Skeletons_1.1_FREE.zip';
  console.log('📦 kaykit_skeletons');
  extract(zip, '*/characters/gltf/*.glb',  packDir('kaykit_skeletons'));
  // Same rig files — overwrite is fine since they're identical
  extract(zip, '*/Animations/gltf/*/*.glb', ANIM_RIGS);
}

// ── Fox (GLB — character creation priority) ───────────────────────────────────
{
  const zip = 'assets/amazing_fit_characters/fox.zip';
  console.log('📦 fox');
  extract(zip, 'fox.glb', packDir('fox'), { junk: false });
}

// ── Slime (GLB — character creation + enemy) ──────────────────────────────────
{
  const zip  = 'assets/amazing_fit_characters/Slime.zip';
  const dest = packDir('slime');
  console.log('📦 slime');
  extract(zip, '*/Slime_glb.glb', dest);
  mv(dest, 'Slime_glb.glb', 'Slime.glb');   // normalise to Slime.glb
  extract(zip, '*/Textures/*.png', join(dest, 'textures'));
}

// ── Animal Plushies (FBX — character creation priority, needs FBXLoader) ──────
{
  const zip = 'assets/amazing_fit_characters/Animal Plushies.zip';
  console.log('📦 animal_plushies');
  extract(zip, '*/FBX/*.fbx', packDir('animal_plushies'));
}

// ── Adventure (FBX — NPC) ─────────────────────────────────────────────────────
{
  console.log('📦 adventure');
  extract('assets/characters/Adventure_Free.zip', '*/FBX/Characters/*.fbx', packDir('adventure'));
}

// ── Fantasy Heroes (FBX — NPC / player) ─────────────────────────────────────
{
  console.log('📦 fantasy_heroes');
  extract('assets/characters/Fantasy_Heroes_Free.zip', '*/FBX/Characters/*.fbx', packDir('fantasy_heroes'));
}

// ── Royal Family (FBX — NPC) ─────────────────────────────────────────────────
{
  console.log('📦 royal_family');
  extract('assets/characters/Royal_Family_Free.zip', '*/FBX/Characters/*.fbx', packDir('royal_family'));
}

// ── Elf (FBX — NPC / enemy) ──────────────────────────────────────────────────
{
  console.log('📦 elf');
  extract('assets/characters/Elf_Free.zip', '*/FBX/Characters/*.fbx', packDir('elf'));
}

// ── Samurai (FBX — NPC / player) ─────────────────────────────────────────────
{
  console.log('📦 samurai');
  extract('assets/characters/Samurai_Free.zip', '*/FBX/Characters/*.fbx', packDir('samurai'));
}

// ── Villager NPC (FBX — NPC) ─────────────────────────────────────────────────
{
  const dest = packDir('villager_npc');
  console.log('📦 villager_npc');
  extract('assets/characters/Villager NPC Free.zip', '*/FBX/Characters/*.fbx', dest);
  extract('assets/characters/Villager NPC Free.zip', '*/Texture/*.png', join(dest, 'textures'));
}

// ── Goblin Pack (FBX — enemy) ─────────────────────────────────────────────────
{
  console.log('📦 goblin_pack');
  extract('assets/characters/GoblinPack_Free.zip', '*/FBX/Characters/*.fbx', packDir('goblin_pack'));
}

// ── Orc Pack (FBX — enemy) ────────────────────────────────────────────────────
// Note: typo in zip path — "Chatacters" not "Characters"
{
  console.log('📦 orc_pack');
  extract('assets/characters/Orc_Free.zip', '*/FBX/Chatacters/*.fbx', packDir('orc_pack'));
}

// ── Bandits (FBX — enemy) ─────────────────────────────────────────────────────
{
  console.log('📦 bandits_free');
  extract('assets/characters/Bandits_Free.zip', '*/FBX/Characters/*.fbx', packDir('bandits_free'));
}

// ── Golem (FBX — enemy / boss) ───────────────────────────────────────────────
{
  console.log('📦 golem_free');
  extract('assets/characters/Golem_Free.zip', '*/FBX/Characters/*.fbx', packDir('golem_free'));
}

// ── Skeletons Free (FBX — enemy alt style) ───────────────────────────────────
{
  console.log('📦 skeletons_free');
  extract('assets/characters/Skeletons_Free.zip', '*/FBX/Characters/*.fbx', packDir('skeletons_free'));
}

// ── Army Free (FBX — enemy / NPC guard) ──────────────────────────────────────
{
  console.log('📦 army_free');
  extract('assets/characters/Army_Free.zip', '*/FBX/Characters/*.fbx', packDir('army_free'));
}

// ── Little Knight (FBX — has embedded animations!) ────────────────────────────
// Chr_Knight.fbx = base mesh.  Anim_Knight_*.fbx = baked mesh+anim per clip.
{
  const dest     = packDir('little_knight');
  const animDest = join(dest, 'animations');
  console.log('📦 little_knight');
  extract('assets/characters/LittleKnightCharacterPack.zip',
          '*/_Exports/CombinedWithSword/Chr_Knight.fbx', dest);
  extract('assets/characters/LittleKnightCharacterPack.zip',
          '*/_Exports/CombinedWithSword/Anim_Knight_*.fbx', animDest);
}

// ── Low Poly People (FBX — generic NPC populace) ──────────────────────────────
{
  console.log('📦 low_poly_people');
  extract('assets/characters/low-poly-people.zip', 'assets/fbx/*.fbx', packDir('low_poly_people'));
}

console.log('\n✅  Extraction complete.\n');
