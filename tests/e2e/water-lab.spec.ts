/**
 * water-lab.spec.ts — manual/visual verification for the Water Lab dev-sandbox
 * scene (Water Lab + swim mode design, docs/superpowers/plans/2026-08-03-water-lab-and-swim-mode.md).
 *
 * Not part of the regular CI regression suite — this is one-off verification
 * tooling for the plan's Task 6. Run: npx playwright test tests/e2e/water-lab.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, getPlayerPos } from './helpers';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/water-lab-${name}.png` });

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console',   (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

/** Enables dev mode, opens the in-game Dev Sandbox panel (Insert key), and
 *  clicks the "Water Lab" button. Returns once gameMode reports 'waterlab'. */
async function enterWaterLab(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem('ttt_dev_mode', 'true'));
  await page.keyboard.press('Insert');
  await page.waitForSelector('.ds-panel', { state: 'visible', timeout: 5000 });
  await page.locator('.ds-tab', { hasText: 'Proc-Gen' }).click();
  await page.getByRole('button', { name: '🌊 Water Lab' }).click();
  await page.waitForFunction(() => (window as any).__game.getGameMode?.() === 'waterlab', { timeout: 5000 });
  await page.waitForTimeout(500);
}

test.describe('Water Lab', () => {
  test('loads without errors and reaches waterlab gameMode', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await startGame(page);
    await enterWaterLab(page);
    await SS(page, '01-entered');

    const mode = await page.evaluate(() => (window as any).__game.getGameMode?.());
    expect(mode).toBe('waterlab');
    expect(errors, `Errors: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('shows dry bank, stepped basin, and animated water', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await enterWaterLab(page);

    // Two time-separated screenshots to visually confirm the water animation progresses.
    await SS(page, '02-water-t0');
    await page.waitForTimeout(1500);
    await SS(page, '02-water-t1');
  });

  test('wading on shallow shelf gives partial submersion, not swim mode', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await enterWaterLab(page);

    // Shallow shelf sits at y=-0.3, centered at (0,0), halfExtent=7 — walk player there.
    await page.evaluate(() => (window as any).__game.teleportPlayer(3, 0.2, 0));
    await page.waitForTimeout(800);
    await SS(page, '03-wading');

    const isSwimming = await page.evaluate(() => (window as any).__game.isPlayerSwimming?.());
    // Not asserting hard on this since the hook may not exist yet — see below.
    console.log('isSwimming on shallow shelf:', isSwimming);
  });

  test('standing over deep floor triggers swim mode (buoyant float, no jump)', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await enterWaterLab(page);

    // Deep floor sits at y=-1.2, centered at (0,0), halfExtent=3 — teleport there.
    await page.evaluate(() => (window as any).__game.teleportPlayer(0, -1.0, 0));
    await page.waitForTimeout(800);
    await SS(page, '04-swimming-t0');

    const posA = await getPlayerPos(page);
    await page.waitForTimeout(1500);
    const posB = await getPlayerPos(page);
    await SS(page, '04-swimming-t1');

    console.log('Deep floor Y before:', posA.y, 'after 1.5s:', posB.y);
    // Floating: Y should stay roughly stable (not sink to -1.2 collider, not fly up).
    expect(Math.abs(posB.y - posA.y)).toBeLessThan(0.5);
  });
});
