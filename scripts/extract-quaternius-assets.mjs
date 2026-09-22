#!/usr/bin/env node
/**
 * scripts/extract-quaternius-assets.mjs
 *
 * Extracts model files from the Quaternius asset pack zips in
 * assets/quaternius/ into public/assets/quaternius/<category>/<packId>/ so
 * Vite can serve them. Mirrors scripts/extract-char-assets.mjs's pattern
 * (shell out to `unzip`, no npm zip dependency).
 *
 * IMPORTANT — every pack under assets/quaternius/ is imported. There is no
 * taste/tonal filtering in this pipeline; a prior pass silently excluded
 * modern_type_buildings, modular_dungeons/Ultimate Modular Sci-Fi, and
 * nature_props as "tonal mismatch" — that was wrong and has been reversed.
 * If a pack is genuinely not extracted here, it's because it has no meshes
 * to extract at all (see "genuinely orphaned" below), never because of a
 * style judgment call.
 *
 * Two extraction paths, depending on what the source zip ships:
 *
 *  1. THIS SCRIPT — packs whose source zip already ships a directly usable
 *     glTF/FBX/GLB/OBJ export (no material-graph fix needed):
 *       animals/ultimate_animated_animals, monsters/bestiary_dungeon_monsters,
 *       monsters/cute_animated_monsters, fantasy_props/fantasy_props_megakit,
 *       modular_dungeons/obj_kit, modular_fantasy_village/medieval_village_megakit.
 *
 *  2. scripts/blender/batch-export-blends.mjs — packs whose source zip ships
 *     ONLY raw .blend files, or whose FBX/OBJ export came from a legacy
 *     Blender "Diffuse BSDF" material graph that both FBX/OBJ export (very
 *     dark, desaturated colours) and Blender's own glTF exporter (silent
 *     fallback to flat white — the "shadow only" rendering bug reported
 *     during playtest) get wrong. These packs need Blender to rewire the
 *     material graph before export, so GLB — produced by that script, not
 *     this one — is the format of record for them:
 *       monsters/animated_monster_pack, fantasy_props/ultimate_food_pack,
 *       medieval_village_pack/buildings, medieval_village_pack/props,
 *       modern_type_buildings/city_pack, modern_type_buildings/interior_pack,
 *       modular_dungeons/ultimate_modular_scifi, nature_props/nature_props.
 *     Run `node scripts/blender/batch-export-blends.mjs` (requires a local
 *     Blender install) to (re)produce these after this script runs.
 *
 * Known, disclosed data-completeness gaps (not exclusions — every mesh that
 * exists in the source packs is imported):
 *   - nature_props/*: the .blend files reference external texture PNGs
 *     (`//../Textures/*.png`) that do not exist anywhere in the provided
 *     source data (Blends.zip contains only .blend files). export_glb.py
 *     falls back to a name-based flat-colour heuristic
 *     (`_name_based_fallback_colour`) for these materials — a documented
 *     placeholder, not real recovered texture data. A Blender MCP session
 *     could later be used to hunt for the missing texture folder.
 *   - monsters/bestiary_dungeon_monsters ships zero animation keyframe data
 *     in either its FBX or GLB source (confirmed via raw FBX byte
 *     inspection — 0 AnimCurveNode chunks) — a genuine content limitation
 *     of this specific pack, not an import bug. Its static poses are
 *     imported and displayed as static models.
 *   - modular_dungeons/Textures.zip (2 loose PNGs: Bark_Texture.jpg,
 *     Leaf_Texture.png) is genuinely orphaned data — confirmed none of the
 *     92 .mtl files in modular_dungeons/OBJ.zip reference any `map_*`
 *     texture at all (the whole kit is flat vertex-color materials), so
 *     there is no mesh in this repo's source data that these 2 textures
 *     belong to. Not extracted because there is nothing to attach them to,
 *     not a style decision.
 *
 * Usage:
 *   node scripts/extract-quaternius-assets.mjs
 *   node scripts/blender/batch-export-blends.mjs   (for the 8 Blender-fixed packs)
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
// Only packs that do NOT need the Blender material-graph fix. See the
// header comment for the other 8 packs (produced by
// scripts/blender/batch-export-blends.mjs instead).

console.log('\n🗿  Extracting Quaternius assets (non-Blender-fixed packs)…\n');

// ── animals — Ultimate Animated Animals (glTF, embedded buffers, no textures) ─
{
  const zip = 'animals/Ultimate_Animated_Animals.zip';
  const dest = packDir('animals', 'ultimate_animated_animals');
  console.log('📦 animals/ultimate_animated_animals');
  extract(zip, '*/glTF/*.gltf', dest);
}

// ── monsters — Bestiary Dungeon Monsters (ready-made self-contained GLB) ─────
// NOTE: this pack has zero animation keyframe data in its source (confirmed
// via raw FBX byte inspection) — a genuine content gap, not an import bug.
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

// ── modular_dungeons — OBJ kit (OBJ+MTL, flat vertex-color materials — ──────
// confirmed no .mtl references any map_* texture, so Textures.zip (2 loose
// files: Bark_Texture.jpg, Leaf_Texture.png) is genuinely orphaned data —
// nothing in this kit's source references either file. See header comment.
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

console.log('\n✅  Extraction complete (non-Blender-fixed packs).');
console.log('    Run `node scripts/blender/batch-export-blends.mjs` for the');
console.log('    remaining 8 packs that need the material-graph fix.\n');
