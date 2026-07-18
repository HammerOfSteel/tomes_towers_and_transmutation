/**
 * startup.spec.ts — F3: Main menu presence, settings toggles, new game button.
 *
 * Run: npx playwright test tests/e2e/startup.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/startup-${name}.png` });

// ── Console/error capture helpers ────────────────────────────────────────────

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console',   (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Startup & Main Menu', () => {

  test('page loads without JS errors', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await SS(page, '01-loaded');
    expect(errors, `No console errors on load: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('canvas is visible after load', async ({ page }) => {
    await loadPage(page);
    await expect(page.locator('#game-canvas, canvas').first()).toBeVisible();
  });

  test('__game debug object is present', async ({ page }) => {
    await loadPage(page);
    const hasGame = await page.evaluate(() => typeof (window as any).__game === 'object');
    expect(hasGame).toBe(true);
  });

  test('startGame API works and game enters playing state', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await page.evaluate((s) => (window as any).__game.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(800);
    await SS(page, '02-game-started');

    // Game mode should be 'interior' (tower)
    const mode = await page.evaluate(() => (window as any).__game.getGameMode?.() ?? 'unknown');
    expect(['interior', 'exterior']).toContain(mode);
    expect(errors).toHaveLength(0);
  });

  test('getPlayerPos returns a valid position', async ({ page }) => {
    await loadPage(page);
    await page.evaluate((s) => (window as any).__game.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(600);

    const pos = await page.evaluate(() => (window as any).__game.getPlayerPos?.());
    expect(pos).toBeTruthy();
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.z).toBe('number');
  });

  test('getGameMode returns a string', async ({ page }) => {
    await loadPage(page);
    await page.evaluate((s) => (window as any).__game.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(500);

    const mode = await page.evaluate(() => (window as any).__game.getGameMode?.());
    expect(typeof mode).toBe('string');
    expect(mode.length).toBeGreaterThan(0);
  });

  test('enterCreativeMode and exitCreativeMode APIs exist', async ({ page }) => {
    await loadPage(page);
    await page.evaluate((s) => (window as any).__game.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(600);

    // Set dev mode first
    await page.evaluate(() => localStorage.setItem('ttt_dev_mode', 'true'));
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, { timeout: 20_000 });

    const hasCreative = await page.evaluate(() =>
      typeof (window as any).__game.enterCreativeMode === 'function' &&
      typeof (window as any).__game.exitCreativeMode  === 'function'
    );
    expect(hasCreative).toBe(true);
  });

  test('setGameSpeed API exists (timeScale)', async ({ page }) => {
    await loadPage(page);
    const hasSpeed = await page.evaluate(() => typeof (window as any).__game?.setGameSpeed === 'function');
    expect(hasSpeed).toBe(true);
  });
});
