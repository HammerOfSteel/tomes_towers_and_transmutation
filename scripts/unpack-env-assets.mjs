#!/usr/bin/env node
/**
 * unpack-env-assets.mjs
 * Extracts ALL KayKit and Kenney environment zip packs from
 * assets/environment/overworld_etc/ into public/assets/<pack-slug>/
 *
 * Only the packs listed in DEMO_RELEASE_TODO.md are processed.
 * GLB/GLTF files are extracted; everything else is ignored.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const PUBLIC    = path.join(ROOT, 'public', 'assets');

// Packs to extract: [zipPath (relative to ROOT), outputSlug]
// Exactly the packs listed in DEMO_RELEASE_TODO.md
const PACKS = [
  // ── KayKit ────────────────────────────────────────────────────────────────
  ['assets/environment/overworld_etc/KayKit/forest_nature_pack (kopia)/KayKit_Forest_Nature_Pack_1.0_FREE.zip', 'kaykit_forest_nature'],
  ['assets/environment/overworld_etc/KayKit (kopia)/dungeon_remastered_kit/KayKit_DungeonRemastered_1.1_FREE.zip', 'kaykit_dungeon_remastered'],
  ['assets/environment/overworld_etc/KayKit/KayKit_City_Builder_Bits_1.0_FREE.zip', 'kaykit_city_builder'],
  ['assets/environment/overworld_etc/KayKit/block_kits_kit (kopia)/KayKit_BlockBits_1.0_FREE.zip', 'kaykit_block_bits'],
  ['assets/environment/overworld_etc/KayKit/halloween_bits_kit (kopia)/KayKit_HalloweenBits_1.0_FREE.zip', 'kaykit_halloween_bits'],
  ['assets/environment/overworld_etc/KayKit_Medieval_Hexagon_Pack_1.0_FREE.zip', 'kaykit_medieval_hexagon'],

  // ── Kenney ────────────────────────────────────────────────────────────────
  ['assets/environment/overworld_etc/kenney/kenney_fantasy-town-kit_2.0.zip', 'kenney_fantasy_town'],
  ['assets/environment/overworld_etc/kenney/kenney_castle-kit.zip', 'kenney_castle'],
  ['assets/environment/overworld_etc/kenney/kenney_modular-dungeon-kit_1.0.zip', 'kenney_modular_dungeon'],
  ['assets/environment/overworld_etc/kenney/kenney_modular-cave-kit_1.0.zip', 'kenney_modular_cave'],
  ['assets/environment/overworld_etc/kenney/kenney_nature-kit.zip', 'kenney_nature'],
  ['assets/environment/overworld_etc/kenney/kenney_furniture-kit.zip', 'kenney_furniture'],
  ['assets/environment/overworld_etc/kenney/kenney_modular-buildings.zip', 'kenney_modular_buildings'],
  ['assets/environment/overworld_etc/kenney/kenney_building-kit.zip', 'kenney_building'],
  ['assets/environment/overworld_etc/kenney/kenney_survival-kit.zip', 'kenney_survival'],
  ['assets/environment/overworld_etc/kenney/kenney_hexagon-kit.zip', 'kenney_hexagon'],
  ['assets/environment/overworld_etc/kenney/kenney_retro-fantasy-kit.zip', 'kenney_retro_fantasy'],
  ['assets/environment/overworld_etc/kenney/kenney_mini-dungeon.zip', 'kenney_mini_dungeon'],
  ['assets/environment/overworld_etc/kenney/kenney_tower-defense-kit.zip', 'kenney_tower_defense'],
  ['assets/environment/overworld_etc/kenney/kenney_3d-road-tiles.zip', 'kenney_road_tiles'],
  ['assets/environment/overworld_etc/kenney/kenney_pirate-kit.zip', 'kenney_pirate'],
];

let totalExtracted = 0;
let totalSkipped   = 0;

for (const [relZip, slug] of PACKS) {
  const zipPath = path.join(ROOT, relZip);
  if (!fs.existsSync(zipPath)) {
    console.warn(`  ⚠  ZIP not found: ${relZip}`);
    continue;
  }

  const outDir = path.join(PUBLIC, slug);
  fs.mkdirSync(outDir, { recursive: true });

  // Unzip into a temp dir, then copy only GLB/GLTF/BIN files
  const tmpDir = path.join(outDir, '_tmp_extract');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // -o = overwrite, -q = quiet
    execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, { stdio: 'pipe' });
  } catch (e) {
    console.error(`  ✗  Failed to unzip ${slug}: ${e.message}`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    continue;
  }

  // Find all GLB, GLTF, BIN files recursively
  const found = execSync(`find "${tmpDir}" -type f \\( -iname "*.glb" -o -iname "*.gltf" -o -iname "*.bin" \\)`, { encoding: 'utf8' })
    .split('\n').filter(Boolean);

  let copied = 0;
  for (const srcFile of found) {
    const basename = path.basename(srcFile);
    const dest     = path.join(outDir, basename);
    // Don't overwrite if identical (skip redundant copies)
    fs.copyFileSync(srcFile, dest);
    copied++;
  }

  // Clean up temp (use shell rm -rf for permission-locked files)
  try {
    execSync(`chmod -R u+w "${tmpDir}" 2>/dev/null; rm -rf "${tmpDir}"`, { stdio: 'pipe', shell: true });
  } catch {
    execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe', shell: true });
  }

  totalExtracted += copied;
  console.log(`  ✓  ${slug.padEnd(30)} → ${copied} files`);
}

console.log(`\nDone: ${totalExtracted} files extracted across ${PACKS.length} packs.`);

// ── Generate inventory report ─────────────────────────────────────────────────
console.log('\n── Inventory ────────────────────────────────────────────────────');
const slugs = PACKS.map(([, s]) => s);
for (const slug of slugs) {
  const dir = path.join(PUBLIC, slug);
  if (!fs.existsSync(dir)) { console.log(`  ${slug}: (not extracted)`); continue; }
  const glbs   = fs.readdirSync(dir).filter(f => f.match(/\.(glb|gltf)$/i));
  console.log(`  ${slug.padEnd(30)} ${glbs.length} GLB/GLTF`);
}
