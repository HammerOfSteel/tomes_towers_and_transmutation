/**
 * animation-quality.test.ts
 *
 * Captures 8-frame animation strips for every archetype × state combination.
 * Each "strip" is a row of screenshots taken at equally-spaced points in a 2-second
 * animation cycle, giving a visual filmstrip of the full motion.
 *
 * Screenshots are saved to  tests/e2e/screenshots/animation/
 *   - {arch}-{state}-frame{0-7}.png  — individual frames
 *   - An HTML strip report at  tests/e2e/screenshots/animation/report.html
 *
 * Run with:   npx playwright test tests/e2e/animation-quality.test.ts
 *
 * How to use the output:
 *   Open tests/e2e/screenshots/animation/report.html in a browser.
 *   Each row shows one full motion cycle.
 *   Look for: stiff/jerky motion, wrong body parts moving, clipping, floating limbs.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
// ── Config ────────────────────────────────────────────────────────────────────
const SHOTS_DIR = 'tests/e2e/screenshots/animation';
const LAB_URL = '/creature-lab.html';
const ARCHETYPES = ['biped', 'quadruped', 'avian', 'serpent', 'amoeba'];
const STATES = ['idle', 'walk', 'run'];
// 8 frames spread over a 2s cycle (0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75 s)
const FRAME_TIMES = Array.from({ length: 8 }, (_, i) => i * 0.25);
// ── Helpers ───────────────────────────────────────────────────────────────────
async function openLab(page) {
    await page.goto(LAB_URL);
    await page.locator('#lab-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => !!window.__lab, { timeout: 20_000 });
    await page.waitForTimeout(500);
}
async function snap(page, name) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const p = path.join(SHOTS_DIR, `${name}.png`);
    await page.locator('#lab-canvas').screenshot({ path: p });
    return p;
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Animation frame strips — all archetypes × states', () => {
    for (const arch of ARCHETYPES) {
        for (const state of STATES) {
            test(`${arch} — ${state}`, async ({ page }) => {
                await openLab(page);
                // Show the archetype at a consistent iso angle
                await page.evaluate((a) => window.__lab.showCreature(a), arch);
                await page.evaluate(() => window.__lab.setAngle(45));
                await page.evaluate((s) => window.__lab.setAnimState(s), state);
                await page.waitForTimeout(200);
                const framePaths = [];
                for (let f = 0; f < FRAME_TIMES.length; f++) {
                    const t = FRAME_TIMES[f];
                    // Freeze animation at this exact time for a consistent, reproducible frame
                    await page.evaluate((time) => window.__lab.freezeAt(time), t);
                    await page.waitForTimeout(80); // let WebGL complete the render
                    const p = await snap(page, `${arch}-${state}-frame${f}`);
                    framePaths.push(p);
                }
                // Restore live animation
                await page.evaluate(() => window.__lab.thawTime());
                // Every frame path must exist (sanity assertion)
                for (const p of framePaths) {
                    expect(fs.existsSync(p)).toBe(true);
                }
            });
        }
    }
});
// ── Serpent: dedicated 12-angle orbit to catch the whole body shape ────────────
test.describe('Serpent — full orbit at walk', () => {
    test('12 angles, walk state', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showCreature('serpent'));
        await page.evaluate(() => window.__lab.setAnimState('walk'));
        await page.evaluate(() => window.__lab.freezeAt(0.5)); // mid-stride
        for (let deg = 0; deg < 360; deg += 30) {
            await page.evaluate((d) => window.__lab.setAngle(d), deg);
            await page.waitForTimeout(60);
            await snap(page, `serpent-orbit-${deg}deg`);
        }
        await page.evaluate(() => window.__lab.thawTime());
    });
});
// ── All-archetype side-by-side at mid-walk ────────────────────────────────────
test.describe('All archetypes — mid-stride comparison', () => {
    for (const state of STATES) {
        test(`all — ${state} mid-cycle (iso)`, async ({ page }) => {
            await openLab(page);
            await page.evaluate(() => window.__lab.showAll());
            await page.evaluate((s) => window.__lab.setAnimState(s), state);
            await page.evaluate(() => window.__lab.setAngle(45));
            await page.evaluate(() => window.__lab.freezeAt(0.4));
            await page.waitForTimeout(120);
            await snap(page, `all-${state}-midstride`);
            await page.evaluate(() => window.__lab.thawTime());
        });
    }
});
// ── Generate HTML report after all tests ──────────────────────────────────────
test.afterAll(async () => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const rows = [];
    for (const arch of ARCHETYPES) {
        for (const state of STATES) {
            const frames = FRAME_TIMES.map((_, f) => {
                const name = `${arch}-${state}-frame${f}.png`;
                const exists = fs.existsSync(path.join(SHOTS_DIR, name));
                return exists
                    ? `<img src="${name}" title="t=${(f * 0.25).toFixed(2)}s" />`
                    : `<div class="missing">missing</div>`;
            }).join('');
            rows.push(`
        <tr>
          <td class="label">${arch}<br/><em>${state}</em></td>
          <td class="frames">${frames}</td>
        </tr>`);
        }
    }
    // Add orbit row for serpent
    const orbitFrames = Array.from({ length: 12 }, (_, i) => i * 30).map(deg => {
        const name = `serpent-orbit-${deg}deg.png`;
        const exists = fs.existsSync(path.join(SHOTS_DIR, name));
        return exists
            ? `<img src="${name}" title="${deg}°" />`
            : `<div class="missing">missing</div>`;
    }).join('');
    rows.push(`
    <tr>
      <td class="label">serpent<br/><em>orbit</em></td>
      <td class="frames">${orbitFrames}</td>
    </tr>`);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Animation Quality Report — Tomes, Towers & Transmutation</title>
<style>
  body  { background: #111; color: #ddd; font-family: monospace; padding: 16px; }
  h1    { color: #7af; }
  p     { color: #aaa; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  tr    { border-bottom: 1px solid #333; }
  td.label  { width: 90px; vertical-align: top; padding: 8px 12px 8px 0; font-size: 12px; color: #9cf; }
  td.label em { color: #f9c; }
  td.frames { padding: 4px 0; }
  td.frames img   { height: 100px; margin: 2px; border: 1px solid #444; border-radius: 3px; }
  .missing { display:inline-block; width:60px; height:100px; background:#333; border:1px solid #555;
             font-size:10px; color:#888; text-align:center; line-height:100px; }
  .hint { background:#1a2a1a; border:1px solid #3a5a3a; padding:10px 16px; margin:16px 0;
          border-radius:4px; font-size:12px; color:#8c8; }
</style>
</head>
<body>
<h1>Animation Quality Report</h1>
<p>Each row shows 8 evenly-spaced frames across a 2-second cycle (0.00 s → 1.75 s).
   Hover over a frame to see its timestamp.</p>
<div class="hint">
  <strong>What to look for:</strong>
  Jerky/stiff motion · wrong limbs moving · floating/clipping parts ·
  serpent tail disconnected from body · amoeba blobs flying away ·
  avian wings clipping through body · biped legs going underground visibly.
</div>
<table>
  <thead><tr><th>Creature</th><th>Frames →</th></tr></thead>
  <tbody>
  ${rows.join('\n')}
  </tbody>
</table>
</body>
</html>`;
    fs.writeFileSync(path.join(SHOTS_DIR, 'report.html'), html);
});
