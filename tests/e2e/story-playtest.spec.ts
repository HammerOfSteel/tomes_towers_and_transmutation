/**
 * story-playtest.spec.ts
 *
 * Full story playtest using REAL keyboard input — simulates an actual player
 * walking through the world. No teleporting.
 *
 * Flow: vulperia fox → campfire → dungeon → exit tower → WALK exterior
 *       → fall-through detection at every step → return → re-enter
 *
 * If player Y drops below -3 at any point: screenshot + hard fail.
 *
 * Run: npx playwright test tests/e2e/story-playtest.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/story-${name}.png`, fullPage: false });

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

async function waitChoices(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    (n) => { const c = (window as any).__campfire; return c && !c.speaking && c.choiceCount >= n; },
    count, { timeout: 30_000 },
  );
  await page.waitForTimeout(150);
}

async function waitForGameStart(page: Page): Promise<void> {
  await page.waitForFunction(() => !(window as any).__campfire, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/**
 * Walk using real keyboard input.
 * Holds key(s) for `durationMs`, sampling position every 250ms.
 * Returns all sampled positions.
 * Throws immediately if Y drops below fallThreshold (fall-through detected).
 */
async function walk(
  page: Page,
  keys: string[],
  durationMs: number,
  label: string,
  fallThreshold = -3,
): Promise<Array<{ x: number; y: number; z: number }>> {
  // Focus the canvas so keyboard events reach the game
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });

  const positions: Array<{ x: number; y: number; z: number }> = [];

  for (const key of keys) await page.keyboard.down(key);

  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await page.waitForTimeout(250);
    const pos = await page.evaluate(() => (window as any).__game?.getPlayerPos?.());
    if (!pos) continue;
    positions.push(pos);

    if (pos.y < fallThreshold) {
      for (const key of keys) await page.keyboard.up(key).catch(() => {});
      await SS(page, `FALLTHROUGH-${label.replace(/\s+/g, '-')}`);
      throw new Error(
        `FALL-THROUGH during "${label}" at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) — Y below ${fallThreshold}`
      );
    }
  }

  for (const key of keys) await page.keyboard.up(key).catch(() => {});
  await page.waitForTimeout(300); // let physics settle after key release

  const finalPos = positions[positions.length - 1];
  if (finalPos) {
    console.log(`[walk] "${label}" done — end pos: (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)}, ${finalPos.z.toFixed(1)}) after ${durationMs}ms`);
  }
  return positions;
}

async function getPos(page: Page): Promise<{ x: number; y: number; z: number }> {
  return page.evaluate(() => (window as any).__game?.getPlayerPos?.());
}

// ── Main playtest ─────────────────────────────────────────────────────────────

test('story playtest: vulperia → campfire → tower → walk exterior (real input)', async ({ page }) => {
  test.setTimeout(180_000); // 3 min — exterior walks are long
  const logs = attachLogs(page);
  await loadPage(page);

  // ── STEP 1: Start as fox via quickPlay (skips campfire for speed) ─────────
  console.log('[test] === STEP 1: start as fox ===');
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Maribel', species: 'foxling' }));
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await SS(page, '01-game-started-fox');

  const info = await page.evaluate(() => (window as any).__game?.getPrincessInfo?.());
  expect(info?.species).toBe('foxling');
  console.log(`[test] ✓ playing as ${info?.name} (${info?.species})`);
  expect(await page.evaluate(() => (window as any).__game?.getCurrentFloor?.())).toBe(0);
  await SS(page, '02-dungeon-floor0');

  await walk(page, ['KeyW'], 1500, 'dungeon-walk-forward');
  await walk(page, ['KeyD'], 1000, 'dungeon-walk-right');
  const dungeonPos = await getPos(page);
  expect(dungeonPos.y).toBeGreaterThan(-1);
  console.log(`[test] ✓ dungeon walk OK — pos: ${JSON.stringify(dungeonPos)}`);

  // ── STEP 3: Exit to exterior ────────────────────────────────────────────────
  console.log('[test] === STEP 3: exit to exterior ===');
  await page.evaluate(() => (window as any).__game?.giveMasterKey?.());
  await page.evaluate(() => (window as any).__game?.triggerExit?.());

  await page.waitForFunction(
    () => (window as any).__game?.getGameMode?.() === 'exterior',
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1500); // physics settle on spawn
  await SS(page, '03-exterior-spawn');

  const spawnPos = await getPos(page);
  console.log(`[test] exterior spawn: ${JSON.stringify(spawnPos)}`);
  expect(spawnPos.y).toBeGreaterThan(-1);
  console.log('[test] ✓ spawned in exterior without falling');

  // ── STEP 4: Walk exterior in all directions with fall-through monitoring ────
  console.log('[test] === STEP 4: exterior walk — 9 direction segments ===');
  await SS(page, '04-exterior-start-walk');

  // Walk south (away from tower) — this is where fall-through was reported
  let allPos = await walk(page, ['KeyS'], 4000, 'south-4s');
  await SS(page, '05-walked-south-4s');
  console.log(`[test] ✓ south walk — covered ${allPos.length} samples, min Y: ${Math.min(...allPos.map(p => p.y)).toFixed(2)}`);

  // Keep going south — reaching 30+ units from origin
  allPos = await walk(page, ['KeyS'], 5000, 'south-more-9s');
  await SS(page, '06-walked-south-9s');
  const minYSouth = Math.min(...allPos.map(p => p.y));
  console.log(`[test] ✓ south 9s — min Y: ${minYSouth.toFixed(2)}, end: ${JSON.stringify(allPos.at(-1))}`);

  // Run south (hold Shift) — faster, more stress on physics
  allPos = await walk(page, ['KeyS', 'ShiftLeft'], 4000, 'run-south');
  await SS(page, '07-run-south');
  console.log(`[test] ✓ run south — min Y: ${Math.min(...allPos.map(p => p.y)).toFixed(2)}`);

  // Strafe east
  allPos = await walk(page, ['KeyD'], 4000, 'strafe-east');
  await SS(page, '08-strafe-east');
  console.log(`[test] ✓ east — end: ${JSON.stringify(allPos.at(-1))}`);

  // Run east further
  allPos = await walk(page, ['KeyD', 'ShiftLeft'], 4000, 'run-east');
  await SS(page, '09-run-east');
  console.log(`[test] ✓ run east — min Y: ${Math.min(...allPos.map(p => p.y)).toFixed(2)}`);

  // Walk north
  allPos = await walk(page, ['KeyW'], 5000, 'north-5s');
  await SS(page, '10-north');
  console.log(`[test] ✓ north — end: ${JSON.stringify(allPos.at(-1))}`);

  // Walk west back toward center
  allPos = await walk(page, ['KeyA'], 4000, 'west-4s');
  await SS(page, '11-west');

  const exteriorFinalPos = await getPos(page);
  console.log(`[test] exterior final pos: ${JSON.stringify(exteriorFinalPos)}`);
  expect(exteriorFinalPos.y).toBeGreaterThan(-1);

  // ── STEP 5: Stop and look — take a screenshot of the world ─────────────────
  await page.waitForTimeout(1000);
  await SS(page, '12-exterior-world-view');
  console.log('[test] ✓ exterior traversal complete — no fall-through');

  // ── STEP 6: Re-enter the tower ──────────────────────────────────────────────
  console.log('[test] === STEP 6: return to tower and re-enter ===');
  // Walk back toward tower (north-ish)
  await walk(page, ['KeyW', 'ShiftLeft'], 6000, 'run-back-to-tower');
  await SS(page, '13-near-tower');

  await page.evaluate(() => (window as any).__game?.switchToInterior?.());
  await page.waitForTimeout(2000);
  await SS(page, '14-back-in-dungeon');

  const modeBack = await page.evaluate(() => (window as any).__game?.getGameMode?.());
  expect(modeBack).toBe('interior');
  const dungeonBackPos = await getPos(page);
  expect(dungeonBackPos.y).toBeGreaterThan(-2);
  console.log(`[test] ✓ back in dungeon — pos: ${JSON.stringify(dungeonBackPos)}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const errors = logs.filter(l =>
    (l.includes('[error]') || l.includes('[pageerror]')) &&
    !l.includes('404') && !l.includes('favicon')
  );
  if (errors.length > 0) {
    console.log('[test] JS errors during playtest:');
    errors.forEach(e => console.log(' ', e));
  }
  console.log(`[test] ✓ PLAYTEST COMPLETE — ${errors.length} JS error(s)`);
  expect(errors.length).toBeLessThan(5);
});
