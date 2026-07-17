#!/usr/bin/env node
/**
 * scripts/fix-glb-materials.mjs
 *
 * Patches GLB files exported from FBX via Blender to fix two common issues:
 *
 *   1. alpha = 0 in baseColorFactor + alphaMode MASK → completely invisible.
 *      Quaternius FBX materials are fully opaque solid-colour; Blender exports
 *      the alpha as 0 when the FBX has no opacity channel set.
 *      Fix: set baseColorFactor[3] = 1.0, alphaMode = "OPAQUE".
 *
 *   2. alphaMode MASK with alphaCutoff on solid-colour materials (no texture).
 *      Fix: demote to OPAQUE — the cutoff serves no purpose without a texture.
 *
 * Runs in-place: reads, patches, writes back to same path.
 * Safe to re-run; idempotent.
 *
 * Usage:
 *   node scripts/fix-glb-materials.mjs                  # patches all known packs
 *   node scripts/fix-glb-materials.mjs path/to/file.glb # patches one file
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename, extname }                              from 'path';
import { fileURLToPath }                                                  from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');

// Packs produced by FBX→GLB conversion that may need fixing.
const FBX_CONVERTED_PACKS = [
  'easy_animated',
  'monster_pack_animated',
];

// ── GLB patch helpers ─────────────────────────────────────────────────────────

/**
 * Read a GLB file, patch its JSON chunk, and write it back.
 * Returns a summary of changes made.
 */
function patchGLB(filePath) {
  const buf      = readFileSync(filePath);
  const magic    = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    return { skipped: true, reason: 'not a GLB' };
  }

  const version   = buf.readUInt32LE(4);
  const chunkLen  = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4E4F534A) {
    return { skipped: true, reason: 'first chunk is not JSON' };
  }

  const jsonStr  = buf.slice(20, 20 + chunkLen).toString('utf8').replace(/\0+$/, '');
  const json     = JSON.parse(jsonStr);

  let patchCount = 0;
  const patches  = [];

  for (const mat of (json.materials || [])) {
    const pbr  = mat.pbrMetallicRoughness ?? {};
    const hasTex = !!(pbr.baseColorTexture);
    const color  = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const alpha  = color[3] ?? 1;

    // Patch 1: alpha = 0 with MASK and no texture → invisible solid-colour mesh.
    if (!hasTex && mat.alphaMode === 'MASK' && alpha < 0.01) {
      color[3] = 1.0;
      pbr.baseColorFactor = color;
      mat.pbrMetallicRoughness = pbr;
      mat.alphaMode = 'OPAQUE';
      delete mat.alphaCutoff;
      patchCount++;
      patches.push(`  mat "${mat.name}": alpha 0→1, MASK→OPAQUE`);
    }

    // Patch 2: MASK with no texture (alpha > 0) → demote to OPAQUE.
    // The alphaCutoff has no effect without an alpha texture.
    if (!hasTex && mat.alphaMode === 'MASK' && alpha >= 0.01) {
      mat.alphaMode = 'OPAQUE';
      delete mat.alphaCutoff;
      patchCount++;
      patches.push(`  mat "${mat.name}": MASK→OPAQUE (no texture, alpha ${alpha.toFixed(2)})`);
    }
  }

  if (patchCount === 0) {
    return { skipped: false, patched: 0, patches: [] };
  }

  // Re-encode JSON chunk (must be 4-byte aligned, padded with spaces).
  const newJsonStr = JSON.stringify(json);
  const jsonBytes  = Buffer.from(newJsonStr, 'utf8');
  const padLen     = (4 - (jsonBytes.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(padLen, 0x20)]);

  // Reconstruct GLB: header + JSON chunk header + patched JSON + rest of chunks
  const restOffset = 20 + chunkLen;  // start of bin chunk (if any)
  const rest       = buf.slice(restOffset);

  const newHeader  = Buffer.alloc(12);
  newHeader.writeUInt32LE(0x46546C67, 0);                        // magic
  newHeader.writeUInt32LE(version, 4);                           // version
  newHeader.writeUInt32LE(12 + 8 + paddedJson.length + rest.length, 8); // total length

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // JSON

  const out = Buffer.concat([newHeader, jsonChunkHeader, paddedJson, rest]);
  writeFileSync(filePath, out);

  return { skipped: false, patched: patchCount, patches };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const targets = process.argv.slice(2);

let filePaths = [];
if (targets.length > 0) {
  filePaths = targets.filter(p => p.endsWith('.glb'));
} else {
  // Default: fix all files in the FBX-converted packs
  const charBase = join(ROOT, 'public', 'assets', 'characters');
  for (const pack of FBX_CONVERTED_PACKS) {
    const dir = join(charBase, pack);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.glb')) filePaths.push(join(dir, f));
    }
  }
}

let totalPatched = 0;
let totalFiles   = 0;

for (const fp of filePaths) {
  const rel    = relative(ROOT, fp);
  const result = patchGLB(fp);
  if (result.skipped) {
    console.log(`⏭  ${rel} — ${result.reason}`);
  } else if (result.patched === 0) {
    console.log(`✓  ${rel} — no patches needed`);
  } else {
    console.log(`🔧  ${rel} — ${result.patched} material(s) patched`);
    result.patches.forEach(p => console.log(p));
    totalPatched += result.patched;
    totalFiles++;
  }
}

console.log(`\nDone. ${totalPatched} materials patched across ${totalFiles} files.`);
