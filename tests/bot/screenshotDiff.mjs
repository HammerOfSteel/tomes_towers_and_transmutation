#!/usr/bin/env node
/**
 * screenshotDiff.mjs — Compare current bot screenshots against stored baselines.
 *
 * Usage:
 *   node tests/bot/screenshotDiff.mjs [--update-baseline] [--threshold 0.05]
 *
 * Flags:
 *   --update-baseline   Copy current screenshots to baseline/ (run after intentional changes)
 *   --threshold <0–1>   Max allowed fraction of changed pixels before flagging (default 0.05)
 *
 * Output:
 *   tests/bot/diff/<name>-diff.png   — visual diff overlay for each changed file
 *   tests/bot/diff/report.json       — machine-readable summary
 *   Exit 0 if all within threshold, exit 1 if any file exceeds it
 */

import fs   from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

const ROOT       = path.resolve('tests/bot');
const SS_DIR     = path.join(ROOT, 'screenshots');
const BASE_DIR   = path.join(ROOT, 'baseline');
const DIFF_DIR   = path.join(ROOT, 'diff');

const args      = process.argv.slice(2);
const UPDATE    = args.includes('--update-baseline');
const threshArg = args[args.indexOf('--threshold') + 1];
const THRESHOLD = threshArg ? parseFloat(threshArg) : 0.05;

fs.mkdirSync(BASE_DIR, { recursive: true });
fs.mkdirSync(DIFF_DIR, { recursive: true });

/** Recursively collect .png files under a directory. */
function findPngs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? findPngs(path.join(dir, e.name))
    : e.name.endsWith('.png') ? [path.join(dir, e.name)] : []
  );
}

/**
 * Pixel-level diff between two same-size ImageData buffers.
 * Returns { diffFraction, diffCanvas }.
 */
function diffImages(imgA, imgB, w, h) {
  const canvas = createCanvas(w, h);
  const ctx    = canvas.getContext('2d');
  const outData = ctx.createImageData(w, h);
  const aData   = imgA.data;
  const bData   = imgB.data;
  const out     = outData.data;

  let diffPx = 0;
  for (let i = 0; i < aData.length; i += 4) {
    const dr = Math.abs(aData[i]   - bData[i]);
    const dg = Math.abs(aData[i+1] - bData[i+1]);
    const db = Math.abs(aData[i+2] - bData[i+2]);
    const diff = (dr + dg + db) / 3;
    if (diff > 10) {
      diffPx++;
      // Highlight changed pixels in red
      out[i]   = 255; out[i+1] = 0; out[i+2] = 0; out[i+3] = 255;
    } else {
      // Dim unchanged pixels
      out[i]   = aData[i]   >> 1;
      out[i+1] = aData[i+1] >> 1;
      out[i+2] = aData[i+2] >> 1;
      out[i+3] = 255;
    }
  }

  ctx.putImageData(outData, 0, 0);
  return { diffFraction: diffPx / (w * h), diffCanvas: canvas };
}

async function main() {
  // Find the most recent screenshots run directory
  const runs = fs.existsSync(SS_DIR)
    ? fs.readdirSync(SS_DIR).filter(d => fs.statSync(path.join(SS_DIR, d)).isDirectory()).sort()
    : [];

  if (runs.length === 0) {
    console.log('No screenshot runs found — nothing to diff.');
    process.exit(0);
  }

  const latestRun = path.join(SS_DIR, runs[runs.length - 1]);
  const currentPngs = findPngs(latestRun);

  if (UPDATE) {
    console.log('Updating baseline screenshots…');
    for (const p of currentPngs) {
      const rel  = path.relative(latestRun, p);
      const dest = path.join(BASE_DIR, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p, dest);
    }
    console.log(`  Copied ${currentPngs.length} screenshots to ${BASE_DIR}`);
    process.exit(0);
  }

  const basePngs = findPngs(BASE_DIR);
  if (basePngs.length === 0) {
    console.log('No baseline screenshots found. Run with --update-baseline first.');
    process.exit(0);
  }

  const results = [];
  let anyExceeded = false;

  for (const curPath of currentPngs) {
    const name    = path.basename(curPath);
    const basPath = basePngs.find(b => path.basename(b) === name);

    if (!basPath) {
      console.log(`  ⚡ NEW   ${name} (no baseline)`);
      results.push({ name, status: 'new' });
      continue;
    }

    let imgA, imgB;
    try {
      imgA = await loadImage(basPath);
      imgB = await loadImage(curPath);
    } catch {
      console.log(`  ⚠️  SKIP  ${name} (load error)`);
      results.push({ name, status: 'skip' });
      continue;
    }

    // Draw both onto canvases to extract pixel data
    const w = Math.min(imgA.width,  imgB.width);
    const h = Math.min(imgA.height, imgB.height);
    const canA = createCanvas(w, h); const ctxA = canA.getContext('2d');
    const canB = createCanvas(w, h); const ctxB = canB.getContext('2d');
    ctxA.drawImage(imgA, 0, 0, w, h);
    ctxB.drawImage(imgB, 0, 0, w, h);

    const { diffFraction, diffCanvas } = diffImages(
      ctxA.getImageData(0, 0, w, h),
      ctxB.getImageData(0, 0, w, h),
      w, h
    );

    const pct = (diffFraction * 100).toFixed(2);
    const exceeded = diffFraction > THRESHOLD;
    if (exceeded) anyExceeded = true;

    const icon = exceeded ? '✗ DIFF ' : '✓ OK   ';
    console.log(`  ${icon} ${name}  ${pct}% changed`);
    results.push({ name, diffFraction, exceeded });

    if (exceeded) {
      const diffPath = path.join(DIFF_DIR, name.replace('.png', '-diff.png'));
      const buf = diffCanvas.toBuffer('image/png');
      fs.writeFileSync(diffPath, buf);
      console.log(`         → diff saved: ${diffPath}`);
    }
  }

  // Write JSON report
  const reportPath = path.join(DIFF_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ threshold: THRESHOLD, results, ts: new Date().toISOString() }, null, 2));
  console.log(`\nDiff report: ${reportPath}`);

  const pass = results.filter(r => !r.exceeded).length;
  const fail = results.filter(r =>  r.exceeded).length;
  console.log(`\n${pass} OK  ${fail} exceeded threshold (${(THRESHOLD*100).toFixed(0)}%)`);

  process.exit(anyExceeded ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
