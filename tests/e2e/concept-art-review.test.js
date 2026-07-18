/**
 * concept-art-review.test.ts
 *
 * Generates a visual comparison report between:
 *   • Concept art / reference images (concept_art/, princess_*.png)
 *   • Current in-game creature / character screenshots
 *
 * Output:  tests/e2e/screenshots/concept-review/report.html
 *
 * Run with:   npx playwright test tests/e2e/concept-art-review.test.ts
 * Then open:  tests/e2e/screenshots/concept-review/report.html
 *
 * Purpose:
 *   The report is used by the developer or AI agent to compare the current
 *   3-D geometry against the intended art direction.  Add observations in
 *   the NOTES sections to guide future improvement iterations.
 *
 *   The HTML embeds images as base64 so the file is fully self-contained.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
// ── Config ────────────────────────────────────────────────────────────────────
const SHOTS_DIR = 'tests/e2e/screenshots/concept-review';
const LAB_URL = '/creature-lab.html';
const CONCEPT_DIR = 'concept_art';
const ROOT_DIR = '.';
// ── Helpers ───────────────────────────────────────────────────────────────────
async function openLab(page) {
    await page.goto(LAB_URL);
    await page.locator('#lab-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => !!window.__lab, { timeout: 20_000 });
    await page.waitForTimeout(600);
}
async function snap(page, name) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.locator('#lab-canvas').screenshot({
        path: path.join(SHOTS_DIR, `${name}.png`),
    });
}
function imgToBase64(filePath) {
    try {
        const abs = path.resolve(filePath);
        if (!fs.existsSync(abs))
            return '';
        const buf = fs.readFileSync(abs);
        const ext = path.extname(abs).slice(1).toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
    }
    catch {
        return '';
    }
}
// ── Creature capture tests ────────────────────────────────────────────────────
test.describe('Capture creature reference shots', () => {
    test('biped — front, iso, side (no outfit + full outfit)', async ({ page }) => {
        await openLab(page);
        // Default biped
        await page.evaluate(() => window.__lab.showCreature('biped'));
        await page.evaluate(() => window.__lab.setAnimState('idle'));
        await page.evaluate(() => window.__lab.freezeAt(0));
        for (const [deg, label] of [[0, 'front'], [45, 'iso'], [90, 'side']]) {
            await page.evaluate((d) => window.__lab.setAngle(d), deg);
            await page.waitForTimeout(80);
            await snap(page, `biped-bare-${label}`);
        }
        // Biped with skirt
        await page.evaluate(() => {
            const d = {
                archetype: 'biped', subRace: 'human',
                colors: { primary: 0xdd8844, secondary: 0x4455cc, emissive: 0, emissiveIntensity: 0 },
                proportions: { global: 1, torso: [1, 1, 1], headSize: 1, limbLength: 1, limbWidth: 1,
                    neckLength: 1, tailLength: 0, wingSpan: 1, segmentCount: 6,
                    shoulderWidth: 1, hipWidth: 1, bellySize: 0, neckThickness: 1 },
                face: { type: 'cute', eyeColor: 0x44ff88, mouthType: 'smile', expression: 'neutral' },
                material: { roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.5 },
                props: [],
                outfit: { top: 'tunic', legs: 'skirt', over: 'none' },
            };
            window.__lab.showFromJson(d, 'biped+skirt+tunic');
        });
        await page.evaluate(() => window.__lab.freezeAt(0));
        for (const [deg, label] of [[0, 'front'], [45, 'iso'], [90, 'side']]) {
            await page.evaluate((d) => window.__lab.setAngle(d), deg);
            await page.waitForTimeout(80);
            await snap(page, `biped-skirt-${label}`);
        }
        // Biped with robes
        await page.evaluate(() => {
            const d = {
                archetype: 'biped', subRace: 'human',
                colors: { primary: 0x334488, secondary: 0x885522, emissive: 0x223366, emissiveIntensity: 0.06 },
                proportions: { global: 1, torso: [1, 1, 1], headSize: 1, limbLength: 1, limbWidth: 1,
                    neckLength: 1, tailLength: 0, wingSpan: 1, segmentCount: 6,
                    shoulderWidth: 1, hipWidth: 1, bellySize: 0, neckThickness: 1 },
                face: { type: 'cute', eyeColor: 0x88aaff, mouthType: 'smile', expression: 'neutral' },
                material: { roughness: 0.5, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.8 },
                props: ['hat_cone'],
                outfit: { top: 'robe_top', legs: 'robe_skirt', over: 'none' },
            };
            window.__lab.showFromJson(d, 'biped+robe+hat');
        });
        await page.evaluate(() => window.__lab.freezeAt(0));
        for (const [deg, label] of [[0, 'front'], [45, 'iso'], [90, 'side']]) {
            await page.evaluate((d) => window.__lab.setAngle(d), deg);
            await page.waitForTimeout(80);
            await snap(page, `biped-robe-${label}`);
        }
        // Walk cycle
        await page.evaluate(() => window.__lab.showCreature('biped'));
        await page.evaluate(() => window.__lab.setAnimState('walk'));
        await page.evaluate(() => window.__lab.setAngle(45));
        for (let f = 0; f < 6; f++) {
            await page.evaluate((t) => window.__lab.freezeAt(t), f * 0.33);
            await page.waitForTimeout(80);
            await snap(page, `biped-walk-f${f}`);
        }
        await page.evaluate(() => window.__lab.thawTime());
        expect(true).toBe(true);
    });
    test('all archetypes — front + iso + walk strip', async ({ page }) => {
        await openLab(page);
        for (const arch of ['biped', 'quadruped', 'avian', 'serpent', 'amoeba']) {
            await page.evaluate((a) => window.__lab.showCreature(a), arch);
            await page.evaluate(() => window.__lab.setAnimState('idle'));
            await page.evaluate(() => window.__lab.freezeAt(0.5));
            for (const [deg, label] of [[0, 'front'], [45, 'iso']]) {
                await page.evaluate((d) => window.__lab.setAngle(d), deg);
                await page.waitForTimeout(80);
                await snap(page, `arch-${arch}-${label}`);
            }
            // 4-frame walk strip at iso
            await page.evaluate(() => window.__lab.setAnimState('walk'));
            await page.evaluate(() => window.__lab.setAngle(45));
            for (let f = 0; f < 4; f++) {
                await page.evaluate((t) => window.__lab.freezeAt(t), f * 0.5);
                await page.waitForTimeout(80);
                await snap(page, `arch-${arch}-walk-f${f}`);
            }
        }
        await page.evaluate(() => window.__lab.thawTime());
        expect(true).toBe(true);
    });
});
// ── Generate HTML comparison report ──────────────────────────────────────────
test.afterAll(async () => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    // Collect concept art images (embed as base64 so report is portable)
    const conceptImages = [];
    const addImg = (filePath, label) => {
        const src = imgToBase64(filePath);
        if (src)
            conceptImages.push({ name: label, src, file: path.basename(filePath) });
    };
    // Princess references
    addImg(path.join(ROOT_DIR, 'princess_1_reference.png'), 'Princess reference 1');
    addImg(path.join(ROOT_DIR, 'princess_2_reference.png'), 'Princess reference 2');
    // All concept art
    const conceptFiles = fs.readdirSync(CONCEPT_DIR)
        .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
        .sort();
    for (const f of conceptFiles) {
        const label = f.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        addImg(path.join(CONCEPT_DIR, f), label);
    }
    // Collect creature screenshots
    const creatureShots = fs.readdirSync(SHOTS_DIR)
        .filter(f => f.endsWith('.png'))
        .sort();
    function shotCard(filename, title) {
        const filepath = path.join(SHOTS_DIR, filename);
        const src = imgToBase64(filepath);
        if (!src)
            return `<div class="card missing">${title}<br/>(missing)</div>`;
        return `<div class="card"><img src="${src}"/><div class="caption">${title}</div></div>`;
    }
    // Build creature section
    const archetypes = ['biped', 'quadruped', 'avian', 'serpent', 'amoeba'];
    const archSections = archetypes.map(arch => {
        const shots = creatureShots.filter(f => f.startsWith(`arch-${arch}`));
        const cards = shots.map(f => shotCard(f, f.replace(/\.png$/, '').replace(`arch-${arch}-`, ''))).join('');
        return `<section>
      <h2>${arch}</h2>
      <div class="row">${cards}</div>
    </section>`;
    }).join('');
    // Biped outfit section
    const bipedShots = creatureShots.filter(f => f.startsWith('biped-'));
    const bipedSection = `<section>
    <h2>Biped outfits</h2>
    <div class="row">${bipedShots.map(f => shotCard(f, f.replace(/\.png$/, '').replace('biped-', ''))).join('')}</div>
  </section>`;
    // Concept art section
    const conceptSection = conceptImages.map(img => `
    <section class="concept-section">
      <h2>Concept: ${img.name}</h2>
      <div class="row">
        <div class="card concept"><img src="${img.src}"/><div class="caption">${img.file}</div></div>
        <div class="card notes">
          <div class="notes-title">Art direction notes</div>
          <ul>
            <li>Overall style: soft, rounded, toy-figure proportions</li>
            <li>Palette: warm earthy tones with magical highlights</li>
            <li>Characters feel cozy, not threatening</li>
            <li>Clothing flows naturally, skirts have volume</li>
            <li>Creatures are friendly companions, not monsters</li>
          </ul>
          <div class="notes-title">Compare against game:</div>
          <p>Check head-to-body ratio, clothing silhouette, material sheen.</p>
        </div>
      </div>
    </section>`).join('');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Concept Art Review — Tomes, Towers &amp; Transmutation</title>
<style>
  * { box-sizing: border-box; }
  body  { background:#0e0e12; color:#ddd; font-family:system-ui,sans-serif; padding:20px; margin:0; }
  h1    { color:#9cf; border-bottom:2px solid #334; padding-bottom:8px; }
  h2    { color:#c9f; font-size:15px; margin:20px 0 8px; }
  section { margin:0 0 32px; }
  .concept-section { border:1px solid #334; border-radius:6px; padding:12px 16px; margin-bottom:24px; }
  .row  { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-start; }
  .card { background:#1a1a22; border:1px solid #334; border-radius:4px; overflow:hidden;
          max-width:220px; flex-shrink:0; }
  .card img { display:block; width:100%; height:auto; }
  .card.concept img { max-height:280px; object-fit:contain; background:#111; }
  .caption { font-size:11px; color:#9a9; padding:4px 6px; text-align:center; }
  .card.missing { background:#220; border-color:#554; color:#a88; padding:12px;
                  font-size:11px; text-align:center; min-width:100px; min-height:60px; }
  .card.notes { background:#121820; border-color:#2a3a4a; padding:12px; max-width:340px; }
  .notes-title { color:#7af; font-size:12px; font-weight:bold; margin:8px 0 4px; }
  .card.notes ul { margin:0 0 8px 16px; padding:0; font-size:12px; color:#9ab; line-height:1.6; }
  .card.notes p  { font-size:12px; color:#889; margin:4px 0 0; }
  .hint { background:#121c12; border:1px solid #2a4a2a; padding:10px 16px; margin:16px 0;
          border-radius:4px; font-size:12px; color:#8c8; line-height:1.5; }
  .toc  { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 24px; }
  .toc a{ background:#1a2030; border:1px solid #344; border-radius:3px; padding:4px 10px;
          color:#9af; font-size:12px; text-decoration:none; }
  .toc a:hover { background:#253040; }
</style>
</head>
<body>
<h1>Concept Art Review</h1>
<div class="hint">
  <strong>How to use this report:</strong>
  Compare the concept art sketches (left) with the current in-game 3-D creatures (right).
  Look for: proportions, silhouette, colour palette, clothing shapes, personality.
  Use observations here to guide geometry and material improvements.
</div>

<div class="toc">
  <a href="#sec-archetypes">Archetypes</a>
  <a href="#sec-outfits">Outfits</a>
  <a href="#sec-concept">Concept Art</a>
</div>

<div id="sec-archetypes">
<h2 style="color:#7af;font-size:18px;border-bottom:1px solid #334;padding-bottom:6px">
  ▸ Current Archetypes</h2>
${archSections}
</div>

<div id="sec-outfits">
<h2 style="color:#7af;font-size:18px;border-bottom:1px solid #334;padding-bottom:6px">
  ▸ Biped Outfits</h2>
${bipedSection}
</div>

<div id="sec-concept">
<h2 style="color:#7af;font-size:18px;border-bottom:1px solid #334;padding-bottom:6px">
  ▸ Concept Art Reference</h2>
${conceptSection}
</div>

</body>
</html>`;
    fs.writeFileSync(path.join(SHOTS_DIR, 'report.html'), html);
});
