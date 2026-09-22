#!/usr/bin/env node
/**
 * scripts/extract-quaternius-assets.mjs
 *
 * Extracts model files from the Quaternius asset pack zips in
 * assets/quaternius/ into public/assets/quaternius/<category>/<packId>/ so
 * Vite can serve them. Mirrors scripts/extract-char-assets.mjs's pattern
 * (shell out to `unzip`, no npm zip dependency).
 *
 * Per-pack format choice (see docs/asset-integration/2026-09-22-quaternius-
 * asset-inventory.md for the full survey):
 *   - Prefer glTF (embedded or separate .bin) where shipped — richest
 *     material/PBR fidelity, confirmed to embed animations/skins.
 *   - Fall back to FBX where no glTF was exported — three.js's FBXLoader
 *     already handles rigged/animated FBX in this codebase
 *     (src/characters/CharacterLoader.ts), so no external conversion step
 *     is needed.
 *   - modular_dungeons/OBJ is OBJ+MTL-only (kit-of-parts, flat vertex-color
 *     materials, no texture maps — confirmed by inspecting all 92 .mtl
 *     files, none reference `map_*`) so the sibling Textures.zip (2 loose
 *     files) is intentionally NOT extracted — it doesn't belong to this
 *     export at all.
 *   - monsters/Bestiary Dungeon Monsters ships ready GLB (self-contained,
 *     embeds buffers+images) — simplest possible case.
 *
 * Where a pack's glTF/FBX exports embed textures as bare filenames (GLTF
 * `images[].uri` / OBJ `map_Kd` with no path prefix), the referenced PNGs
 * are extracted flat into the SAME destination folder as the model file
 * (matches how the source zip lays out `Exports/glTF/<Name>.gltf` +
 * `Exports/glTF/<Name>.bin` + `Exports/glTF/T_*.png` side by side, or
 * requires flattening a separate top-level `Textures/` folder next to a
 * `glTF/` folder that has no textures of its own).
 *
 * nature_props/ is intentionally NOT covered here — it ships only raw
 * .blend files with no exported format; see the inventory doc's open
 * questions. modern_type_buildings/ and modular_dungeons/Ultimate Modular
 * Sci-Fi are intentionally excluded as tonally out of scope.
 *
 * Usage:
 *   node scripts/extract-quaternius-assets.mjs
 *
 * Requires: unzip (standard on macOS/Linux). No additional npm deps.
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');
const SRC_BASE  = join(ROOT, 'assets', 'quaternius');
const OUT_BASE  = join(ROOT, 'public', 'assets', 'quaternius');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run `unzip -o -j <zip> "<pattern>" -d <dest>` — junk paths (flatten) so
 * every matched file lands directly in dest regardless of its folder depth
 * inside the zip. This is what lets glTF + its sibling .bin + loose PNG
 * textures from different zip folders end up side by side.
 */
function extract(zipRelPath, pattern, dest) {
  const absZip = join(SRC_BASE, zipRelPath);
  if (!existsSync(absZip)) {
    console.warn(`  ⚠  not found: ${zipRelPath}`);
    return false;
  }
  mkdirSync(dest, { recursive: true });
  try {
    execSync(`unzip -o -j "${absZip}" "${pattern}" -d "${dest}"`, {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return true;
  } catch {
    console.warn(`  ⚠  no matches for "${pattern}" in ${zipRelPath}`);
    return false;
  }
}

function packDir(category, id) { return join(OUT_BASE, category, id); }

// ── pack extraction table ────────────────────────────────────────────────────

console.log('\n🗿  Extracting Quaternius assets…\n');

// ── animals — Ultimate Animated Animals (glTF, embedded buffers, no textures) ─
{
  const zip = 'animals/Ultimate_Animated_Animals.zip';
  const dest = packDir('animals', 'ultimate_animated_animals');
  console.log('📦 animals/ultimate_animated_animals');
  extract(zip, '*/glTF/*.gltf', dest);
}

// ── monsters — Animated Monster Pack (FBX only, no external textures) ────────
{
  const zip = 'monsters/Animated_Monster_Pack.zip';
  const dest = packDir('monsters', 'animated_monster_pack');
  console.log('📦 monsters/animated_monster_pack');
  extract(zip, '*/FBX/*.fbx', dest);
}

// ── monsters — Bestiary Dungeon Monsters (ready-made self-contained GLB) ─────
{
  const zip = 'monsters/Bestiary_Dungeon_Monsters.zip';
  const dest = packDir('monsters', 'bestiary_dungeon_monsters');
  console.log('📦 monsters/bestiary_dungeon_monsters');
  extract(zip, '*/GLB*/*.glb', dest);
}

// ── monsters — Cute Animated Monsters (glTF + bin + per-model Textures/) ─────
{
  const zip = 'monsters/Cute_Animated_Monsters.zip';
  const dest = packDir('monsters', 'cute_animated_monsters');
  console.log('📦 monsters/cute_animated_monsters');
  extract(zip, '*/glTF/*.gltf', dest);
  extract(zip, '*/glTF/*.bin',  dest);
  extract(zip, '*/Textures/*.png', dest);
}

// ── fantasy_props — Fantasy Props MegaKit (glTF+bin+PNG already co-located) ──
{
  const zip = 'fantasy_props/Fantasy_Props_MegaKit.zip';
  const dest = packDir('fantasy_props', 'fantasy_props_megakit');
  console.log('📦 fantasy_props/fantasy_props_megakit');
  extract(zip, 'Exports/glTF/*.gltf', dest);
  extract(zip, 'Exports/glTF/*.bin',  dest);
  extract(zip, 'Exports/glTF/*.png',  dest);
}

// ── fantasy_props — Ultimate Food Pack (FBX only, no external textures) ──────
{
  const zip = 'fantasy_props/Ultimate_Food_Pack.zip';
  const dest = packDir('fantasy_props', 'ultimate_food_pack');
  console.log('📦 fantasy_props/ultimate_food_pack');
  extract(zip, '*/FBX/*.fbx', dest);
}

// ── medieval_village_pack — Buildings (FBX, monolithic per building) ────────
{
  const zip = 'medieval_village_pack/Buildings.zip';
  const dest = packDir('medieval_village_pack', 'buildings');
  console.log('📦 medieval_village_pack/buildings');
  extract(zip, '*/FBX/*.fbx', dest);
}

// ── medieval_village_pack — Props (FBX, street/settlement dressing) ────────
{
  const zip = 'medieval_village_pack/Props.zip';
  const dest = packDir('medieval_village_pack', 'props');
  console.log('📦 medieval_village_pack/props');
  extract(zip, '*/FBX/*.fbx', dest);
}

// ── modular_dungeons — OBJ kit (OBJ+MTL, flat vertex-color materials — ──────
// confirmed no .mtl references any map_* texture, so Textures.zip (2 loose
// files: Bark_Texture.jpg, Leaf_Texture.png) is NOT extracted; it does not
// belong to this export.
{
  const zip = 'modular_dungeons/OBJ.zip';
  const dest = packDir('modular_dungeons', 'obj_kit');
  console.log('📦 modular_dungeons/obj_kit');
  extract(zip, 'OBJ/*.obj', dest);
  extract(zip, 'OBJ/*.mtl', dest);
}

// ── modular_fantasy_village — Medieval Village MegaKit (glTF+bin, textures ──
// live in a separate top-level Textures/ folder referenced by bare filename
// — flatten both into the same destination folder).
{
  const zip = 'modular_fantasy_village/Medieval_Village_MegaKit.zip';
  const dest = packDir('modular_fantasy_village', 'medieval_village_megakit');
  console.log('📦 modular_fantasy_village/medieval_village_megakit');
  extract(zip, '*/glTF/*.gltf', dest);
  extract(zip, '*/glTF/*.bin',  dest);
  extract(zip, '*/Textures/*.png', dest);
}

console.log('\n✅  Extraction complete.\n');
