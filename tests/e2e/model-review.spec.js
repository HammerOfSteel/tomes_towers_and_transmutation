/**
 * model-review.spec.ts — Automated model QA test suite.
 *
 * Captures screenshots and structured console output from the model-review tool
 * for every character pack. Tests assert:
 *   - No broken alpha (invisible models)
 *   - Scale within reasonable bounds
 *   - Warnings are captured and attached to test reports
 *   - Animation packs play at least one clip
 *
 * Run:
 *   npm run test:models                              — all packs
 *   npm run test:models -- --grep "easy_animated"   — single pack
 *   npm run test:models -- --grep "Enemy"            — all enemy packs
 */
import { test, expect } from '@playwright/test';
const PACKS_TO_TEST = [
    // ── Fully animated + textured ─────────────────────────────────────────────
    { packId: 'cube_pets', label: 'Kenney Cube Pets', role: 'npc', minClips: 8, hasTextures: true },
    { packId: 'fox', label: 'Fox', role: 'player', minClips: 6, hasTextures: true },
    { packId: 'slime', label: 'Slime', role: 'enemy', minClips: 5, hasTextures: true },
    { packId: 'wizards', label: 'Wizard Characters', role: 'npc', minClips: 4, hasTextures: true },
    { packId: 'meshy_dark_fay', label: 'Dark Fay (Meshy)', role: 'enemy', minClips: 5, hasTextures: true },
    { packId: 'meshy_mutated_pig_man', label: 'Pig-Man Brute (Meshy)', role: 'enemy', minClips: 5, hasTextures: true },
    { packId: 'meshy_vampire_fay', label: 'Vampire Fay (Meshy)', role: 'enemy', minClips: 3, hasTextures: true },
    // ── Animated, solid colour ────────────────────────────────────────────────
    { packId: 'easy_animated', label: 'Easy Animated Creatures', role: 'enemy', minClips: 3, hasTextures: false },
    { packId: 'monster_pack_animated', label: 'Quaternius Monsters', role: 'enemy', minClips: 1, hasTextures: false },
    // ── Textured, KayKit rig animations ──────────────────────────────────────
    { packId: 'kaykit_adventurers', label: 'KayKit Adventurers', role: 'player', minClips: 5, hasTextures: true },
    { packId: 'kaykit_skeletons', label: 'KayKit Skeletons', role: 'enemy', minClips: 5, hasTextures: true },
    // ── Textured, static ─────────────────────────────────────────────────────
    { packId: 'adventure', label: 'Adventurers', role: 'npc', minClips: 0, hasTextures: true },
    { packId: 'villager_npc', label: 'Villager NPCs', role: 'npc', minClips: 0, hasTextures: true },
    { packId: 'army_free', label: 'Army', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'goblin_pack', label: 'Goblin Pack', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'orc_pack', label: 'Orc Pack', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'skeletons_free', label: 'Extra Skeletons', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'golem_free', label: 'Golems', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'bandits_free', label: 'Bandits', role: 'enemy', minClips: 0, hasTextures: false },
    { packId: 'elf', label: 'Elves', role: 'npc', minClips: 0, hasTextures: false },
    { packId: 'fantasy_heroes', label: 'Fantasy Heroes', role: 'npc', minClips: 0, hasTextures: false },
    { packId: 'low_poly_people', label: 'Low Poly People', role: 'npc', minClips: 0, hasTextures: false },
    { packId: 'royal_family', label: 'Royal Family', role: 'npc', minClips: 0, hasTextures: false },
    { packId: 'samurai', label: 'Samurai', role: 'npc', minClips: 0, hasTextures: false },
];
// ── Helpers ───────────────────────────────────────────────────────────────────
async function waitReady(page, ms = 20_000) {
    await page.waitForFunction(() => window.__modelReview?.ready === true, { timeout: ms });
}
async function waitLoaded(page, ms = 30_000) {
    await page.waitForFunction(() => window.__modelReview?.loaded === true, { timeout: ms });
}
async function getStats(page) {
    return page.evaluate(() => window.__modelReview.stats);
}
async function playAnim(page, clipName) {
    await page.evaluate((c) => window.__modelReview.playAnim(c), clipName);
}
async function setAngle(page, angle) {
    await page.evaluate((a) => window.__modelReview.setAngle(a), angle);
}
async function loadModelByPath(page, path, animRig) {
    return page.evaluate(([p, r]) => window.__modelReview.loadModel(p, r), [path, animRig ?? null]);
}
/** Disable the animated-only filter so all models are visible. */
async function showAll(page) {
    await page.evaluate(() => { window.__modelReview.animatedOnly = false; });
}
function parseModelLog(msg) {
    if (!msg.startsWith('[model-review]'))
        return null;
    const id = msg.match(/\] ([^\s|]+)/)?.[1] ?? '';
    const status = (msg.match(/status:(\w+)/)?.[1] ?? 'ok');
    const clips = parseInt(msg.match(/clips:(\d+)/)?.[1] ?? '0', 10);
    const textures = parseInt(msg.match(/textures:(\d+)/)?.[1] ?? '0', 10);
    try {
        const warnings = JSON.parse(msg.match(/warnings:(\[.*?\])(?:\s*\|)/)?.[1] ?? '[]');
        const errors = JSON.parse(msg.match(/errors:(\[.*?\])$/)?.[1] ?? '[]');
        return { modelId: id, status, clips, textures, warnings, errors, raw: msg };
    }
    catch {
        return { modelId: id, status, clips, textures, warnings: [], errors: [], raw: msg };
    }
}
// ── Per-pack test suites ──────────────────────────────────────────────────────
for (const pack of PACKS_TO_TEST) {
    test.describe(`[${pack.role.toUpperCase()}] ${pack.label} (${pack.packId})`, () => {
        let consoleErrors = [];
        let consoleWarnings = [];
        let modelLogs = [];
        let pageErrors = [];
        test.beforeEach(async ({ page }) => {
            consoleErrors = [];
            consoleWarnings = [];
            modelLogs = [];
            pageErrors = [];
            page.on('console', msg => {
                const text = msg.text();
                if (msg.type() === 'error')
                    consoleErrors.push(text);
                if (msg.type() === 'warning')
                    consoleWarnings.push(text);
                const log = parseModelLog(text);
                if (log)
                    modelLogs.push(log);
            });
            page.on('pageerror', err => pageErrors.push(err.message));
        });
        test(`all ${pack.packId} models: visible, scale, no broken alpha`, async ({ page }) => {
            await page.goto(`/model-review.html?role=${pack.role}&pack=${pack.packId}`);
            await waitReady(page);
            // Disable animated-only so static packs also load in the list
            if (pack.minClips === 0)
                await showAll(page);
            const modelList = await page.evaluate(() => window.__modelReview.modelList);
            const packModels = modelList.filter(m => m.id.startsWith(pack.packId + '/'));
            expect(packModels.length, `${pack.packId}: should have at least 1 model`).toBeGreaterThan(0);
            // Reset captures after page init.
            consoleErrors = [];
            consoleWarnings = [];
            modelLogs = [];
            pageErrors = [];
            const issues = [];
            for (const model of packModels) {
                await page.evaluate((path) => window.__modelReview.loadModel(path), model.path);
                await waitLoaded(page, 30_000);
                const stats = await getStats(page);
                if (stats.brokenAlphaMats > 0) {
                    issues.push(`${model.id}: ${stats.brokenAlphaMats} broken alpha materials`);
                }
                if (stats.rawBoundsH > 50) {
                    issues.push(`${model.id}: suspiciously large height ${stats.rawBoundsH.toFixed(1)}WU (exported in cm?)`);
                }
                if (stats.meshCount === 0) {
                    issues.push(`${model.id}: zero meshes loaded`);
                }
                if (pack.hasTextures && stats.textureCount === 0 && !stats.hasVertexColors) {
                    // Soft warn rather than hard fail — some packs use solid base color
                    consoleWarnings.push(`${model.id}: expected textures but none found`);
                }
                stats.errors.forEach(e => issues.push(`${model.id} ERROR: ${e}`));
                const dir = `tests/e2e/test-results/model-review/${pack.packId}`;
                const stem = model.id.replace('/', '__');
                await setAngle(page, 'front');
                await page.waitForTimeout(150);
                await page.screenshot({ path: `${dir}/${stem}__front.png` });
                await setAngle(page, 'iso');
                await page.waitForTimeout(150);
                await page.screenshot({ path: `${dir}/${stem}__iso.png` });
            }
            // Attach collected warnings to the test for visibility in reports.
            const allWarnMsgs = [...consoleWarnings, ...modelLogs.filter(l => l.status === 'warn').map(l => l.raw)];
            if (allWarnMsgs.length > 0) {
                // Use console.log so it appears in test output without failing.
                console.log(`[${pack.packId}] ${allWarnMsgs.length} warnings:\n` + allWarnMsgs.join('\n'));
            }
            expect(issues, `${pack.packId} hard issues:\n${issues.join('\n')}`).toHaveLength(0);
            expect(pageErrors, `${pack.packId} page errors`).toHaveLength(0);
            // Console errors (not warnings) = hard fail.
            const hardErrors = consoleErrors.filter(e => !e.includes('[model-review]'));
            expect(hardErrors, `${pack.packId} unexpected console errors`).toHaveLength(0);
        });
        test(`all ${pack.packId} models: animations play`, async ({ page }) => {
            if (pack.minClips === 0) {
                test.skip(true, 'Static pack — no animations expected');
            }
            await page.goto(`/model-review.html?role=${pack.role}&pack=${pack.packId}`);
            await waitReady(page);
            const modelList = await page.evaluate(() => window.__modelReview.modelList);
            const packModels = modelList.filter(m => m.id.startsWith(pack.packId + '/'));
            consoleErrors = [];
            modelLogs = [];
            pageErrors = [];
            for (const model of packModels) {
                await page.evaluate((path) => window.__modelReview.loadModel(path), model.path);
                await waitLoaded(page, 30_000);
                const stats = await getStats(page);
                expect(stats.clipNames.length, `${model.id}: expected ≥ ${pack.minClips} clips`).toBeGreaterThanOrEqual(pack.minClips);
                const dir = `tests/e2e/test-results/model-review/${pack.packId}`;
                const stem = model.id.replace('/', '__');
                const clipsToTest = stats.clipNames.slice(0, 3);
                for (const clip of clipsToTest) {
                    await playAnim(page, clip);
                    await page.waitForTimeout(300);
                    await page.screenshot({ path: `${dir}/${stem}__anim_${clip.replace(/\W/g, '_').slice(0, 30)}.png` });
                }
                expect(pageErrors, `${model.id} animation page errors`).toHaveLength(0);
            }
        });
    });
}
// ── Deep inspection: 4-angle + animation for key models ──────────────────────
test.describe('Model deep inspection — 4-angle coverage', () => {
    const DEEP = [
        { path: '/assets/characters/easy_animated/frog.glb', name: 'Frog' },
        { path: '/assets/characters/easy_animated/spider.glb', name: 'Spider' },
        { path: '/assets/characters/monster_pack_animated/skeleton.glb', name: 'Quaternius_Skeleton' },
        { path: '/assets/characters/monster_pack_animated/dragon.glb', name: 'Quaternius_Dragon' },
        { path: '/assets/characters/meshy_dark_fay/mesh.glb', name: 'Dark_Fay', animRig: '/assets/characters/meshy_dark_fay/anims.glb' },
        { path: '/assets/characters/meshy_vampire_fay/mesh.glb', name: 'Vampire_Fay', animRig: '/assets/characters/meshy_vampire_fay/anims.glb' },
        { path: '/assets/characters/kaykit_skeletons/Skeleton_Warrior.glb', name: 'KayKit_Skeleton' },
        { path: '/assets/characters/kaykit_adventurers/Knight.glb', name: 'KayKit_Knight' },
        { path: '/assets/characters/cube_pets/animal-cat.glb', name: 'Cube_Cat' },
        { path: '/assets/characters/wizards/toad/mesh.glb', name: 'Toad_Wizard', animRig: '/assets/characters/wizards/toad/anims.glb' },
        { path: '/assets/characters/goblin_pack/Basic_Goblin.glb', name: 'Goblin' },
        { path: '/assets/characters/army_free/Army_Captain_Blue.glb', name: 'Army_Captain' },
        { path: '/assets/characters/bandits_free/Poacher.glb', name: 'Poacher' },
        { path: '/assets/characters/low_poly_people/normal-man-a.glb', name: 'Low_Poly_Man' },
        { path: '/assets/characters/slime/Slime.glb', name: 'Slime' },
    ];
    for (const m of DEEP) {
        test(`${m.name}: renders + all angles captured`, async ({ page }) => {
            let loadError = '';
            page.on('pageerror', err => { loadError = err.message; });
            await page.goto('/model-review.html');
            await waitReady(page);
            await loadModelByPath(page, m.path, m.animRig);
            await waitLoaded(page, 30_000);
            const stats = await getStats(page);
            const dir = `tests/e2e/test-results/model-review/_deep`;
            for (const angle of ['front', 'side', 'iso', 'top']) {
                await setAngle(page, angle);
                await page.waitForTimeout(150);
                await page.screenshot({ path: `${dir}/${m.name}__${angle}.png` });
            }
            if (stats.clipNames.length > 0) {
                const idle = stats.clipNames.find(c => /idle/i.test(c)) ?? stats.clipNames[0];
                await playAnim(page, idle);
                await setAngle(page, 'iso');
                await page.waitForTimeout(400);
                await page.screenshot({ path: `${dir}/${m.name}__anim.png` });
            }
            expect(loadError, `${m.name}: page error`).toBe('');
            expect(stats.brokenAlphaMats, `${m.name}: broken alpha`).toBe(0);
            expect(stats.meshCount, `${m.name}: must have meshes`).toBeGreaterThan(0);
        });
    }
});
// ── Scale regression ──────────────────────────────────────────────────────────
test('Scale: all models normalise to 1.5–2.5 WU height', async ({ page }) => {
    const SCALE_MODELS = [
        '/assets/characters/meshy_dark_fay/mesh.glb',
        '/assets/characters/meshy_mutated_pig_man/mesh.glb',
        '/assets/characters/kaykit_skeletons/Skeleton_Warrior.glb',
        '/assets/characters/monster_pack_animated/dragon.glb',
        '/assets/characters/easy_animated/spider.glb',
        '/assets/characters/cube_pets/animal-elephant.glb',
        '/assets/characters/army_free/Army_Captain_Blue.glb',
    ];
    await page.goto('/model-review.html');
    await waitReady(page);
    const results = [];
    for (const path of SCALE_MODELS) {
        await loadModelByPath(page, path);
        await waitLoaded(page, 25_000);
        const s = await getStats(page);
        const displayH = s.rawBoundsH * s.normScale;
        results.push({ name: path.split('/').pop(), rawH: +(s.rawBoundsH.toFixed(2)), displayH: +(displayH.toFixed(2)) });
        expect(displayH, `${path}: normalised height`).toBeGreaterThan(1.5);
        expect(displayH, `${path}: normalised height`).toBeLessThan(2.5);
    }
    console.table(results);
});
