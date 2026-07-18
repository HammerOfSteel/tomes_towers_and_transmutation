/**
 * princess-play.spec.ts — full princess documentation flow tests
 * All console output from the page is captured and printed in real time.
 *
 * Run one:  npx playwright test tests/e2e/princess-play.spec.ts -g "TEST NAME" --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/princess-${name}.png`, fullPage: false });

function attachLogs(page: Page): { all: string[] } {
  const all: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    all.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    all.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  return { all };
}

async function waitChoices(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (n) => { const c = (window as any).__campfire; return c && !c.speaking && c.choiceCount >= n; },
    count, { timeout: 30_000 },
  );
  await page.waitForTimeout(200);
}

async function waitForGameStart(page: Page, logs: { all: string[] }): Promise<void> {
  await page.waitForFunction(
    () => !(window as any).__campfire && !document.getElementById('plp-root'),
    { timeout: 60_000 },
  );
  const started = await page.waitForFunction(
    () => (window as any).__gameStarted === true,
    { timeout: 60_000 },
  ).catch(() => null);

  if (!started) {
    console.log('\n=== PAGE LOGS AT FAILURE ===');
    logs.all.slice(-30).forEach(l => console.log(' ', l));
    throw new Error('Game never started — see PAGE LOGS above');
  }
  await page.waitForTimeout(1500);
}

// ── Test 1: documentation → pick from gallery → game ────────────────────────

test('doc path 1: documentation → pick princess → game starts', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);

  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });
  await SS(page, '01-campfire');

  await waitChoices(page, 8);
  await SS(page, '02-eight-choices');

  // "I have documentation" = choice 7
  await page.evaluate(() => (window as any).__campfire?.choose(7));
  await page.waitForTimeout(2000);
  await SS(page, '03-wizard-reacts');

  await page.waitForFunction(() => !!document.getElementById('plp-root'), { timeout: 20_000 });
  await page.waitForTimeout(600);
  await SS(page, '04-gallery');

  const cards = await page.evaluate(() => document.querySelectorAll('.plp-card').length);
  console.log(`[test] gallery cards: ${cards}`);
  expect(cards, 'Gallery must have at least one princess — create one in the Atelier first').toBeGreaterThan(0);

  await page.locator('.plp-btn-play').first().click();
  await SS(page, '05-play-clicked');

  await waitForGameStart(page, logs);
  await SS(page, '06-game-started');

  const floor = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
  expect(floor).toBe(0);
  console.log(`[test] ✓ on floor ${floor}`);
  await SS(page, '07-floor0');
});

// ── Test 2: quickPlayPrincess (fast path, no campfire) ───────────────────────

test('doc path 2: quickPlayPrincess → game starts → floor 0', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);

  await page.evaluate(() => {
    console.log('[test-eval] calling quickPlayPrincess...');
    (window as any).__game.quickPlayPrincess({ name: 'Isamilia', species: 'foxling' });
  });
  await SS(page, '20-quickplay');

  await waitForGameStart(page, logs);
  await SS(page, '21-game-started');

  const floor = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
  expect(floor).toBe(0);

  const room = await page.evaluate(() => (window as any).__game?.getCurrentRoom?.());
  console.log(`[test] floor=${floor} room=${room}`);
  // room may be string or undefined depending on load timing — just verify game is on floor 0
  expect(floor).toBe(0);
  await SS(page, '22-floor0');
});

// ── Test 3: full campfire human → game starts → floor 0 ─────────────────────

test('campfire human → game starts → floor 0', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);

  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });

  await waitChoices(page, 8);
  await page.evaluate(() => (window as any).__campfire?.choose(0));  // human
  await waitChoices(page, 4);
  await page.evaluate(() => (window as any).__campfire?.choose(0));  // warrior
  await waitChoices(page, 4);
  await page.evaluate(() => (window as any).__campfire?.choose(0));  // stat 1
  await waitChoices(page, 4);
  await page.evaluate(() => (window as any).__campfire?.choose(0));  // stat 2

  await SS(page, '30-all-choices-done');
  await waitForGameStart(page, logs);
  await SS(page, '31-game-started');

  const floor = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
  expect(floor).toBe(0);
  console.log(`[test] ✓ human warrior on floor ${floor}`);
  await SS(page, '32-floor0');
});

// ── Test 4: FULL VISUAL — documentation → gallery pick → game → basement ─────
// This is the one to watch: runs headed, goes all the way to the basement floor.

test('FULL: documentation → pick princess → game starts → go to basement', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);

  // ── Campfire ──────────────────────────────────────────────────────────────
  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });
  await SS(page, '40-campfire-open');

  await waitChoices(page, 8);
  await SS(page, '41-all-8-choices');

  // Pick "I have documentation"
  await page.evaluate(() => (window as any).__campfire?.choose(7));
  await page.waitForTimeout(2500); // watch wizard react
  await SS(page, '42-wizard-reaction');

  // ── Gallery ───────────────────────────────────────────────────────────────
  await page.waitForFunction(() => !!document.getElementById('plp-root'), { timeout: 20_000 });
  await page.waitForTimeout(800);
  await SS(page, '43-gallery-open');

  const cards = await page.evaluate(() => document.querySelectorAll('.plp-card').length);
  console.log(`[test] gallery has ${cards} princess(es)`);
  expect(cards, 'Need at least one princess in gallery — open the Atelier and save one first').toBeGreaterThan(0);

  // ── Pick first princess and play ──────────────────────────────────────────
  const princessName = await page.evaluate(() =>
    document.querySelector('.plp-card-name')?.textContent ?? 'unknown'
  );
  console.log(`[test] playing as: ${princessName}`);

  await page.locator('.plp-btn-play').first().click();
  await page.waitForTimeout(500);
  await SS(page, '44-play-clicked');

  // ── Game starts ───────────────────────────────────────────────────────────
  await waitForGameStart(page, logs);
  await SS(page, '45-game-started-as-princess');

  const floor0 = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
  expect(floor0).toBe(0);
  console.log(`[test] ✓ started on floor ${floor0}`);
  await page.waitForTimeout(1000); // let scene finish loading visually
  await SS(page, '46-tower-ground-floor');

  // ── Navigate to basement ──────────────────────────────────────────────────
  console.log('[test] navigating to basement...');
  await page.evaluate(() => (window as any).__game.goToFloor(-1));
  await page.waitForTimeout(3000); // let basement load + transition
  await SS(page, '47-basement-loading');

  const basement = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
  console.log(`[test] now on floor ${basement} (expected -1)`);
  await SS(page, '48-basement-floor');

  // Basement is floor -1 (The Lower Laboratory / Alchemical Workshop)
  expect(basement).toBe(-1);
  console.log(`[test] ✓ confirmed in basement (floor ${basement})`);
  await page.waitForTimeout(1000);
  await SS(page, '49-basement-confirmed');
});

