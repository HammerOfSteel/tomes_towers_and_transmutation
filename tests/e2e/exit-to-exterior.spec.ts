/**
 * exit-to-exterior.spec.ts
 *
 * Reproduces the freeze when exiting to the overworld after picking up the
 * basement master key.  Runs headed so you can watch every step.
 *
 * Run: npx playwright test tests/e2e/exit-to-exterior.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/exit-${name}.png`, fullPage: false });

function attachLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    logs.push(line);
    if (m.type() !== 'debug') process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    logs.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  return logs;
}

async function startGameQuick(page: Page): Promise<void> {
  // quickPlayPrincess bypasses campfire — fast path to game
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Tester', species: 'foxling' }));
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(1000);
}

// ── Test 1: floor 0 → exit trigger blocked (no key) ─────────────────────────

test('exit blocked without master key', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGameQuick(page);
  await SS(page, '01-game-start');

  const floor = await page.evaluate(() => (window as any).__game.getCurrentFloor?.());
  expect(floor).toBe(0);

  // Try exit — should be blocked, NOT freeze
  await page.evaluate(() => (window as any).__game.triggerExit?.());
  await page.waitForTimeout(1000);
  await SS(page, '02-exit-blocked');

  const mode = await page.evaluate(() => (window as any).__game.getGameMode?.());
  console.log(`[test] mode after blocked exit: ${mode}`);
  expect(mode).toBe('interior');   // still inside — exit was blocked

  const hasKey = await page.evaluate(() => (window as any).__game.hasMasterKey?.());
  expect(hasKey).toBe(false);

  const blocked = logs.find(l => l.includes('blocked'));
  console.log(`[test] ✓ exit blocked correctly: ${blocked}`);
});

// ── Test 2: give master key → trigger exit → exterior loads (the freeze bug) ─

test('exit with master key → overworld loads without freeze', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGameQuick(page);
  await SS(page, '10-game-start');

  // Give master key programmatically
  await page.evaluate(() => (window as any).__game.giveMasterKey?.());
  const hasKey = await page.evaluate(() => (window as any).__game.hasMasterKey?.());
  expect(hasKey).toBe(true);
  console.log(`[test] master key granted: ${hasKey}`);
  await SS(page, '11-key-obtained');

  // Trigger exit — this is where the freeze was reported
  console.log('[test] triggering exit...');
  await page.evaluate(() => (window as any).__game.triggerExit?.());

  // Wait for exterior mode — if it freezes this will timeout
  const modeChanged = await page.waitForFunction(
    () => (window as any).__game?.getGameMode?.() === 'exterior',
    { timeout: 30_000 },
  ).then(() => true).catch(() => false);

  await SS(page, '12-after-exit');

  // Print all logs around the transition
  const exitLogs = logs.filter(l =>
    l.includes('switchToExterior') || l.includes('onExitTrigger') ||
    l.includes('overworld') || l.includes('Error') || l.includes('error')
  );
  console.log('[test] transition logs:');
  exitLogs.forEach(l => console.log(' ', l));

  if (!modeChanged) {
    console.log('[test] ❌ FREEZE DETECTED — mode never changed to exterior');
    console.log('[test] Last 20 page logs:');
    logs.slice(-20).forEach(l => console.log(' ', l));
    throw new Error('Game froze during exterior transition — see PAGE LOGS above');
  }

  const mode = await page.evaluate(() => (window as any).__game?.getGameMode?.());
  console.log(`[test] ✓ exterior mode reached: ${mode}`);
  expect(mode).toBe('exterior');

  // Confirm player is in the overworld (not underground)
  await page.waitForTimeout(2000);
  await SS(page, '13-exterior-loaded');

  const pos = await page.evaluate(() => (window as any).__game?.getPlayerPos?.());
  console.log(`[test] player pos: ${JSON.stringify(pos)}`);
  expect(pos).toBeTruthy();
});

// ── Test 3: go to basement, come back up, THEN exit ──────────────────────────

test('basement → floor 0 → exit to exterior', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGameQuick(page);

  await SS(page, '20-floor0');
  console.log('[test] going to basement...');
  await page.evaluate(() => (window as any).__game.switchToInterior?.('floor_-1'));
  await page.waitForTimeout(2000);
  await SS(page, '21-basement');

  const basementFloor = await page.evaluate(() => (window as any).__game.getCurrentFloor?.());
  console.log(`[test] basement floor: ${basementFloor}`);

  // Give key while in basement (simulating picking it up there)
  await page.evaluate(() => (window as any).__game.giveMasterKey?.());
  console.log('[test] key given in basement');

  // Go back to floor 0
  await page.evaluate(() => (window as any).__game.switchToInterior?.());
  await page.waitForTimeout(2000);
  await SS(page, '22-back-floor0');

  const floor0 = await page.evaluate(() => (window as any).__game.getCurrentFloor?.());
  console.log(`[test] back on floor: ${floor0}`);

  // Now trigger exit
  console.log('[test] triggering exit from floor 0 after basement visit...');
  await page.evaluate(() => (window as any).__game.triggerExit?.());

  const modeChanged = await page.waitForFunction(
    () => (window as any).__game?.getGameMode?.() === 'exterior',
    { timeout: 30_000 },
  ).then(() => true).catch(() => false);

  await SS(page, '23-after-exit');

  const exitLogs = logs.filter(l =>
    l.includes('switchToExterior') || l.includes('onExitTrigger') ||
    l.includes('COMPLETE') || l.includes('error') || l.includes('Error')
  );
  console.log('[test] transition logs:');
  exitLogs.forEach(l => console.log(' ', l));

  if (!modeChanged) {
    console.log('[test] ❌ FREEZE after basement visit');
    logs.slice(-20).forEach(l => console.log(' ', l));
    throw new Error('Freeze after basement visit → exit — see PAGE LOGS above');
  }

  const mode = await page.evaluate(() => (window as any).__game?.getGameMode?.());
  expect(mode).toBe('exterior');
  console.log(`[test] ✓ exterior reached after basement visit: ${mode}`);
  await page.waitForTimeout(1500);
  await SS(page, '24-exterior-confirmed');
});
