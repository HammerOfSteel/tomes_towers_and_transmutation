#!/usr/bin/env node
/**
 * scripts/extract-wizards.mjs
 *
 * Extracts the three old-wizard GLB packs from assets/characters/*.zip
 * into public/assets/characters/wizards/<id>/ as mesh.glb + anims.glb.
 *
 * Usage:  node scripts/extract-wizards.mjs
 * Idempotent — skips extraction if both files already exist.
 */

import { execSync }                  from 'child_process';
import { mkdirSync, existsSync }      from 'fs';
import { join }                       from 'path';
import { fileURLToPath }              from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');
const SRC_DIR   = join(ROOT, 'assets', 'characters');
const DEST_BASE = join(ROOT, 'public', 'assets', 'characters', 'wizards');

const WIZARDS = [
  {
    id:       'toad',
    zip:      'old_toad_wizard.zip',
    folder:   'Meshy_AI_Dungeon_Toad_Mage_biped',
    meshStem: 'Meshy_AI_Dungeon_Toad_Mage_biped_Character_output',
    animStem: 'Meshy_AI_Dungeon_Toad_Mage_biped_Meshy_AI_Meshy_Merged_Animations',
  },
  {
    id:       'elf',
    zip:      'old_wizard_elf.zip',
    folder:   'Meshy_AI_Elder_Wanderer_Mage_biped',
    meshStem: 'Meshy_AI_Elder_Wanderer_Mage_biped_Character_output',
    animStem: 'Meshy_AI_Elder_Wanderer_Mage_biped_Meshy_AI_Meshy_Merged_Animations',
  },
  {
    id:       'lizard',
    zip:      'old_wizard_lizard.zip',
    folder:   'Meshy_AI_Lizard_Sorcerer_biped',
    meshStem: 'Meshy_AI_Lizard_Sorcerer_biped_Character_output',
    animStem: 'Meshy_AI_Lizard_Sorcerer_biped_Meshy_AI_Meshy_Merged_Animations',
  },
];

console.log('\n🧙  Extracting wizard assets…\n');

for (const w of WIZARDS) {
  const dest     = join(DEST_BASE, w.id);
  const meshOut  = join(dest, 'mesh.glb');
  const animOut  = join(dest, 'anims.glb');
  const zipPath  = join(SRC_DIR, w.zip);

  if (!existsSync(zipPath)) {
    console.warn(`  ⚠  zip not found: assets/characters/${w.zip}`);
    continue;
  }

  mkdirSync(dest, { recursive: true });

  if (existsSync(meshOut) && existsSync(animOut)) {
    console.log(`  ✓  ${w.id} already extracted`);
    continue;
  }

  console.log(`  📦  ${w.id} (${w.zip})`);

  // Extract mesh.glb
  if (!existsSync(meshOut)) {
    execSync(
      `unzip -o -j "${zipPath}" "${w.folder}/${w.meshStem}.glb" -d "${dest}"`,
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    // Rename to mesh.glb
    const extracted = join(dest, `${w.meshStem}.glb`);
    if (existsSync(extracted)) {
      execSync(`mv "${extracted}" "${meshOut}"`);
    }
  }

  // Extract anims.glb
  if (!existsSync(animOut)) {
    execSync(
      `unzip -o -j "${zipPath}" "${w.folder}/${w.animStem}.glb" -d "${dest}"`,
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    const extracted = join(dest, `${w.animStem}.glb`);
    if (existsSync(extracted)) {
      execSync(`mv "${extracted}" "${animOut}"`);
    }
  }

  console.log(`     → public/assets/characters/wizards/${w.id}/mesh.glb + anims.glb`);
}

console.log('\n✅  Wizard extraction complete.\n');
