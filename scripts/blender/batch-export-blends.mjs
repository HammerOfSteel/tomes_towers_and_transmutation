#!/usr/bin/env node
/**
 * scripts/blender/batch-export-blends.mjs
 *
 * Batch driver for scripts/blender/export_glb.py.
 *
 * Several Quaternius packs (see docs/asset-integration/) ship models
 * authored in old (~2019-2021) Blender files whose materials route through
 * a legacy "Diffuse BSDF" node instead of "Principled BSDF". FBX/OBJ export
 * of these produces correct-but-very-dark colours; Blender's own glTF
 * exporter can't translate a Diffuse BSDF at all and silently falls back to
 * flat white. This is what caused the "shadow-only" rendering bug reported
 * during playtest. export_glb.py fixes the material graph (rewiring the
 * legacy node's colour/texture into a Principled BSDF) before exporting, so
 * this driver is what makes GLB — not FBX/OBJ — the format of record for
 * every one of these packs going forward.
 *
 * For each `.blend` inside a zip's `Blend(s)/` folder (nested at any depth):
 *   1. `unzip -j` it into a scratch temp dir (flat, no subfolders).
 *   2. Run Blender headless (`export_glb.py`) to fix materials + export GLB.
 *   3. Copy the resulting `.glb` into `public/assets/quaternius/<category>/<packId>/`.
 *
 * Usage:
 *   node scripts/blender/batch-export-blends.mjs
 *
 * Requires:
 *   - `unzip` (standard on macOS/Linux)
 *   - Blender at /Applications/Blender.app/Contents/MacOS/Blender (macOS).
 *     NOTE: on this machine the `~/.local/bin/blender` symlink is BROKEN for
 *     headless `--background --python` invocation (fails with
 *     `ModuleNotFoundError: No module named 'encodings'`) — always invoke
 *     the full app-bundle binary path directly, never the symlink.
 */

import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, readdirSync, rmSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT       = join(__dirname, '..', '..');
const SRC_BASE   = join(ROOT, 'assets', 'quaternius');
const OUT_BASE   = join(ROOT, 'public', 'assets', 'quaternius');
const EXPORT_PY  = join(__dirname, 'export_glb.py');

const BLENDER_BIN =
  process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender';

// zipRelPath (relative to assets/quaternius/) -> destination packDir (relative to public/assets/quaternius/)
const JOBS = [
  ['monsters/Animated_Monster_Pack.zip', 'monsters/animated_monster_pack'],
  ['fantasy_props/Ultimate_Food_Pack.zip', 'fantasy_props/ultimate_food_pack'],
  ['medieval_village_pack/Buildings.zip', 'medieval_village_pack/buildings'],
  ['medieval_village_pack/Props.zip', 'medieval_village_pack/props'],
  ['modern_type_buildings/City_Pack.zip', 'modern_type_buildings/city_pack'],
  ['modern_type_buildings/Interior_Pack.zip', 'modern_type_buildings/interior_pack'],
  ['modular_dungeons/Ultimate_Modular_SciFi.zip', 'modular_dungeons/ultimate_modular_scifi'],
  ['nature_props/Blends.zip', 'nature_props/nature_props'],
];

function runOne(zipRel, packRel) {
  const zipAbs = join(SRC_BASE, zipRel);
  const outDir = join(OUT_BASE, packRel);
  if (!existsSync(zipAbs)) {
    console.warn(`  ⚠  missing zip: ${zipRel}`);
    return;
  }

  const scratch = join(os.tmpdir(), `blend-batch-${basename(packRel)}-${Date.now()}`);
  mkdirSync(scratch, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  console.log(`\n📦 ${packRel}`);
  try {
    execFileSync('unzip', ['-o', '-j', zipAbs, '*.blend', '-d', scratch], { stdio: 'inherit' });
  } catch {
    console.warn(`  ⚠  no .blend files matched in ${zipRel}`);
    rmSync(scratch, { recursive: true, force: true });
    return;
  }

  const blends = readdirSync(scratch).filter((f) => f.toLowerCase().endsWith('.blend'));
  console.log(`  ${blends.length} .blend file(s) found`);

  let ok = 0;
  let failed = 0;
  for (const blend of blends) {
    const inPath = join(scratch, blend);
    const glbName = blend.replace(/\.blend$/i, '.glb');
    const outPath = join(outDir, glbName);
    try {
      execFileSync(
        BLENDER_BIN,
        ['--background', '--python', EXPORT_PY, '--', inPath, outPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      ok += 1;
    } catch (err) {
      failed += 1;
      console.warn(`  ⚠  failed: ${blend}`);
      console.warn(String(err.stdout || err.message).split('\n').slice(-5).join('\n'));
    }
  }
  console.log(`  ✅ ${ok} exported${failed ? `, ⚠ ${failed} failed` : ''}`);

  rmSync(scratch, { recursive: true, force: true });
}

console.log('\n🧊  Batch Blender material-fix + GLB export\n');
const filter = process.argv[2]; // optional: substring match on packRel, e.g. "nature_props"
const jobs = filter ? JOBS.filter(([, packRel]) => packRel.includes(filter)) : JOBS;
if (filter && jobs.length === 0) {
  console.warn(`No jobs matched filter "${filter}"`);
}
for (const [zipRel, packRel] of jobs) {
  runOne(zipRel, packRel);
}
console.log('\n✅  Batch export complete.\n');
