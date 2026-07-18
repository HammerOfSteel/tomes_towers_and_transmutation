/**
 * creature-visual.test.ts
 *
 * Visual snapshot tests for creature geometry, clothing placement, and animation.
 * Visits /creature-lab.html (served by Vite dev server at http://localhost:5173).
 *
 * Run with:   npx playwright test tests/e2e/creature-visual.test.ts
 * Screenshots go to:  tests/e2e/screenshots/creatures/
 *
 * These tests do NOT make pixel assertions — they capture screenshots so the
 * developer (or AI agent) can visually inspect geometry placement and spot issues.
 * The only hard assertion is that the lab page loads and __lab is present.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
// ── Config ────────────────────────────────────────────────────────────────────
const SHOTS_DIR = 'tests/e2e/screenshots/creatures';
const LAB_URL = '/creature-lab.html';
// Angles to capture per archetype (degrees, label)
const ANGLES = [
    [0, 'front'],
    [45, 'iso'],
    [90, 'side'],
    [180, 'back'],
];
// ── Helpers ───────────────────────────────────────────────────────────────────
async function openLab(page) {
    await page.goto(LAB_URL);
    await page.locator('#lab-canvas').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => !!window.__lab, { timeout: 20_000 });
    // Let the first animation frame complete
    await page.waitForTimeout(600);
}
/**
 * Capture the #lab-canvas element (not full page) so we get only the WebGL
 * output without browser chrome.
 */
async function snap(page, name) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    // Short settle — one more render frame
    await page.waitForTimeout(150);
    await page.locator('#lab-canvas').screenshot({
        path: path.join(SHOTS_DIR, `${name}.png`),
    });
}
// ── Tests ─────────────────────────────────────────────────────────────────────
test.describe('Creature Lab — all archetypes overview', () => {
    test('all archetypes front + iso + side', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showAll());
        await page.waitForTimeout(300);
        for (const [deg, label] of ANGLES) {
            await page.evaluate((d) => window.__lab.setAngle(d), deg);
            await snap(page, `all-${label}`);
        }
        // Verify all 5 rigs are present
        const info = await page.evaluate(() => window.__lab.getRigInfo());
        expect(info).toHaveLength(5);
    });
});
test.describe('Individual archetypes — 4 angles each', () => {
    for (const arch of ['biped', 'quadruped', 'avian', 'serpent', 'amoeba']) {
        test(arch, async ({ page }) => {
            await openLab(page);
            await page.evaluate((a) => window.__lab.showCreature(a), arch);
            await page.waitForTimeout(300);
            for (const [deg, label] of ANGLES) {
                await page.evaluate((d) => window.__lab.setAngle(d), deg);
                await snap(page, `arch-${arch}-${label}`);
            }
            // Also capture walk animation
            await page.evaluate(() => window.__lab.setAnimState('walk'));
            await page.evaluate(() => window.__lab.setAngle(45));
            await page.waitForTimeout(400); // let walk animation settle
            await snap(page, `arch-${arch}-walk-iso`);
            await page.evaluate(() => window.__lab.setAnimState('idle'));
        });
    }
});
test.describe('Biped: leg clothing placement', () => {
    test('all leg options — front + side', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showLegOutfits());
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lab.setAngle(0));
        await snap(page, 'legs-all-front');
        await page.evaluate(() => window.__lab.setAngle(90));
        await snap(page, 'legs-all-side');
    });
    // Individual leg option — close-up for each
    for (const leg of ['none', 'trousers', 'skirt', 'shorts', 'loincloth', 'robe_skirt']) {
        test(`legs: ${leg} — close-up`, async ({ page }) => {
            await openLab(page);
            // Use dnaForArchetype result as base, override outfit.legs
            const dnaJson = await page.evaluate((legOpt) => {
                const lab = window.__lab;
                // Access the imported function — but we need it via __lab.showFromJson
                // Build via the lab's own helper using imported defaults
                const d = {
                    archetype: 'biped', subRace: 'human',
                    colors: { primary: 0xdd5533, secondary: 0x3355dd, emissive: 0, emissiveIntensity: 0 },
                    proportions: { global: 1, torso: [1, 1, 1], headSize: 1, limbLength: 1, limbWidth: 1,
                        neckLength: 1, tailLength: 0, wingSpan: 1, segmentCount: 6,
                        shoulderWidth: 1, hipWidth: 1, bellySize: 0, neckThickness: 1 },
                    face: { type: 'cute', eyeColor: 0x44ff88, mouthType: 'smile', expression: 'neutral' },
                    material: { roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.5 },
                    props: [],
                    outfit: { top: 'none', legs: legOpt, over: 'none' },
                };
                lab.showFromJson(d, `legs: ${legOpt}`);
                lab.setCamera(0, 1.6, 4.5, 1.0);
                return d;
            }, leg);
            void dnaJson;
            await page.waitForTimeout(300);
            await page.evaluate(() => window.__lab.setAngle(0));
            await snap(page, `leg-${leg}-front`);
            await page.evaluate(() => window.__lab.setAngle(90));
            await snap(page, `leg-${leg}-side`);
        });
    }
});
test.describe('Biped: top clothing', () => {
    test('all top options — front', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showTopOutfits());
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lab.setAngle(0));
        await snap(page, 'tops-all-front');
        await page.evaluate(() => window.__lab.setAngle(90));
        await snap(page, 'tops-all-side');
    });
});
test.describe('Biped: over-clothing (capes, robes)', () => {
    test('all over options — iso view', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showOverOutfits());
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lab.setAngle(45));
        await snap(page, 'over-all-iso');
        await page.evaluate(() => window.__lab.setAngle(0));
        await snap(page, 'over-all-front');
    });
});
test.describe('Biped: body proportion morphs', () => {
    test('morph extremes — front', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => window.__lab.showMorphs());
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lab.setAngle(0));
        await snap(page, 'morphs-front');
        await page.evaluate(() => window.__lab.setAngle(90));
        await snap(page, 'morphs-side');
    });
});
test.describe('Biped: props placement', () => {
    test('wings — front + back', async ({ page }) => {
        await openLab(page);
        await page.evaluate(() => {
            const lab = window.__lab;
            lab.showCreature({
                archetype: 'biped', subRace: 'none',
                colors: { primary: 0x8844cc, secondary: 0x221133, emissive: 0x4422aa, emissiveIntensity: 0.08 },
                proportions: { global: 1, torso: [1, 1, 1], headSize: 1, limbLength: 1, limbWidth: 1,
                    neckLength: 1, tailLength: 1, wingSpan: 1, segmentCount: 8,
                    shoulderWidth: 1, hipWidth: 1, bellySize: 0, neckThickness: 1 },
                face: { type: 'cute', eyeColor: 0xffdd44, mouthType: 'smile', expression: 'neutral' },
                material: { roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 },
                props: ['wings_bat'],
                outfit: { top: 'none', legs: 'none', over: 'none' },
            }, 'wings_test');
        });
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lab.setAngle(0));
        await snap(page, 'props-wings-front');
        await page.evaluate(() => window.__lab.setAngle(180));
        await snap(page, 'props-wings-back');
    });
});
test.describe('Animation states — all archetypes', () => {
    for (const state of ['idle', 'walk', 'run']) {
        test(`all archetypes — ${state}`, async ({ page }) => {
            await openLab(page);
            await page.evaluate(() => window.__lab.showAll());
            await page.evaluate((s) => window.__lab.setAnimState(s), state);
            await page.evaluate(() => window.__lab.setAngle(45));
            await page.waitForTimeout(500); // let animation settle visually
            await snap(page, `anim-${state}-iso`);
        });
    }
});
