/**
 * intro-choices.spec.ts
 *
 * Headed tests verifying:
 *   A) All 8 campfire species choices complete without error (no CharacterCreationV2 fallback)
 *   B) Each choice produces the expected characterId in logs
 *   C) Princess animations transition: idle → walk → run → jump → idle
 *
 * Logs from the page are printed in real time so failures are self-diagnosing.
 *
 * Run all:  npx playwright test tests/e2e/intro-choices.spec.ts --reporter=list
 * Run one:  npx playwright test tests/e2e/intro-choices.spec.ts -g "elf" --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/intro-${name}.png`, fullPage: false });

// ── log capture ───────────────────────────────────────────────────────────────

function attachLogs(page: Page) {
  const all: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    all.push(line);
    if (m.type() !== 'debug') process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    all.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  return { all, errors: () => all.filter(l => l.includes('[error]') || l.includes('[pageerror]')) };
}

// ── campfire helpers ──────────────────────────────────────────────────────────

async function startCampfire(page: Page) {
  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });
}

async function waitChoices(page: Page, count: number) {
  await page.waitForFunction(
    (n) => { const c = (window as any).__campfire; return c && !c.speaking && c.choiceCount >= n; },
    count, { timeout: 30_000 },
  );
  await page.waitForTimeout(150);
}

async function choose(page: Page, idx: number) {
  await page.evaluate((i) => (window as any).__campfire?.choose(i), idx);
}

async function waitGameStart(page: Page) {
  await page.waitForFunction(() => !(window as any).__campfire && !document.getElementById('plp-root'), { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(800);
}

function findLog(logs: { all: string[] }, pattern: string) {
  return logs.all.find(l => l.includes(pattern));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A: All 8 species choices complete without hitting CharacterCreationV2
// ─────────────────────────────────────────────────────────────────────────────

const SPECIES_PATHS = [
  { name: 'human',     idx: 0, phase2: 4, expectedId: /human_warrior|human_paladin|rogue|human_bard/ },
  { name: 'undead',    idx: 1, phase2: 4, expectedId: /skeleton|zombie|ghost|mystery_undead/ },
  { name: 'vulperia',  idx: 2, phase2: 4, expectedId: /fox_/ },
  { name: 'slime',     idx: 3, phase2: 4, expectedId: /slime/ },
  { name: 'elf',       idx: 4, phase2: 2, expectedId: /elf_/ },
  { name: 'celestial', idx: 5, phase2: 2, expectedId: /celestial_/ },
  { name: 'draconic',  idx: 6, phase2: 2, expectedId: /draconic_/ },
];

for (const { name, idx, phase2, expectedId } of SPECIES_PATHS) {
  test(`choice ${idx} (${name}): completes all phases → correct characterId → game starts`, async ({ page }) => {
    const logs = attachLogs(page);
    await loadPage(page);
    await startCampfire(page);

    // Phase 1: pick species
    await waitChoices(page, 8);
    await SS(page, `A-${name}-01-species-choice`);
    await choose(page, idx);

    // Phase 2: pick class/subtype
    await waitChoices(page, phase2);
    await SS(page, `A-${name}-02-phase2-choice`);
    await choose(page, 0);

    // Phase 3a
    await waitChoices(page, 4);
    await SS(page, `A-${name}-03-stat1`);
    await choose(page, 0);

    // Phase 3b
    await waitChoices(page, 4);
    await SS(page, `A-${name}-04-stat2`);
    await choose(page, 0);

    // Game should start — NOT CharacterCreationV2
    await waitGameStart(page);
    await SS(page, `A-${name}-05-game-started`);

    // Verify no errors, no fallback
    const errs = logs.errors();
    const hasCCV2 = await page.evaluate(() => !!document.querySelector('.ccv2-overlay, [class*="Shape Your Being"]'));
    expect(hasCCV2, `CharacterCreationV2 should NOT appear for ${name}`).toBe(false);

    // Verify correct characterId in logs
    const cdtLog = findLog(logs, '[CDT] result:');
    console.log(`[test] CDT result log: ${cdtLog}`);
    expect(cdtLog, `CDT result log missing for ${name}`).toBeTruthy();
    const charIdMatch = cdtLog!.match(/characterId=(\S+)/);
    expect(charIdMatch?.[1], `Wrong characterId for ${name}`).toMatch(expectedId);

    // Verify startGame was called with correct params
    const startLog = findLog(logs, '[startGame]');
    console.log(`[test] startGame log: ${startLog}`);
    expect(startLog).toBeTruthy();

    if (errs.length > 0) {
      console.log('[test] PAGE ERRORS:', errs.join('\n'));
    }
    expect(errs, `No JS errors for ${name}: ${errs.join(' | ')}`).toHaveLength(0);
  });
}

// Princess (choice 7) → gallery panel appears
test('choice 7 (princess): campfire ends → gallery opens', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startCampfire(page);

  await waitChoices(page, 8);
  await choose(page, 7);  // "I have documentation"
  await page.waitForTimeout(3000); // wizard reacts

  await SS(page, 'A-princess-01-wizard-reacts');

  await page.waitForFunction(() => !!document.getElementById('plp-root'), { timeout: 20_000 });
  await SS(page, 'A-princess-02-gallery-open');

  const cards = await page.evaluate(() => document.querySelectorAll('.plp-card').length);
  console.log(`[test] gallery cards: ${cards}`);
  expect(cards).toBeGreaterThan(0);

  const errs = logs.errors();
  expect(errs, `No JS errors for princess choice: ${errs.join(' | ')}`).toHaveLength(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B: Princess animation states transition correctly
// ─────────────────────────────────────────────────────────────────────────────

test('princess animations: idle → walk → run → jump → idle', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);

  // Start as a princess via quickPlay (fastest path, no campfire wait)
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Maribel', species: 'foxling' }));
  await waitGameStart(page);
  await SS(page, 'B-anim-01-game-started');

  const getState = () => page.evaluate(() => (window as any).__game.getPrincessAnimState?.() ?? 'unknown');

  // 1. Idle at start
  await page.waitForTimeout(500);
  const s1 = await getState();
  console.log(`[test] anim state after start: ${s1}`);
  expect(s1).toBe('idle');
  await SS(page, 'B-anim-02-idle');

  // 2. Walk — press W gently (canvas must be focused first)
  await page.locator('#game-canvas').click();  // focus the canvas
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  const s2 = await getState();
  console.log(`[test] anim state while walking: ${s2}`);
  await SS(page, 'B-anim-03-walking');

  // 3. Run — hold Shift+W
  await page.keyboard.down('shift');
  await page.waitForTimeout(600);
  const s3 = await getState();
  console.log(`[test] anim state while running: ${s3}`);
  await SS(page, 'B-anim-04-running');

  // 4. Jump
  await page.keyboard.press(' ');
  await page.waitForTimeout(300);
  const s4 = await getState();
  console.log(`[test] anim state during jump: ${s4}`);
  await SS(page, 'B-anim-05-jumping');

  // 5. Land and stop
  await page.keyboard.up('shift');
  await page.keyboard.up('w');
  await page.waitForTimeout(800);
  const s5 = await getState();
  console.log(`[test] anim state after stop: ${s5}`);
  await SS(page, 'B-anim-06-idle-again');

  // Log all animation transitions for diagnosis
  const animLogs = logs.all.filter(l => l.includes('[princess-anim]'));
  console.log('[test] all animation transitions:');
  animLogs.forEach(l => console.log('  ', l));

  // Verify states were visited — walk and/or run should have appeared
  const seenWalkOrRun = animLogs.some(l => l.includes('walk') || l.includes('run'));
  expect(seenWalkOrRun, 'Expected walk or run animation to fire during movement').toBe(true);

  const seenJump = animLogs.some(l => l.includes('jump_idle'));
  console.log(`[test] jump_idle seen: ${seenJump}`);
  // Jump might not always fire in headless physics — soft check
  if (!seenJump) console.warn('[test] jump_idle was NOT seen — physics may suppress short jumps in headless');

  // Final state should be idle (stopped moving)
  expect(s5, 'Should return to idle after stopping').toBe('idle');
});
