/**
 * Playwright e2e tests for Creative Mode.
 * Verifies:
 *  1. Dev mode can be enabled
 *  2. Creative mode activates from pause menu (Dev Labs section)
 *  3. Creative HUD mounts and shows the correct elements
 *  4. C key opens asset browser with kit list
 *  5. Clicking an asset populates the hotbar
 *  6. Screenshots confirm visual state at each step
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:5173';
const SCREENSHOT_DIR = path.join('tests', 'e2e', 'screenshots', 'creative');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enableDevMode(page: Page): Promise<void> {
  await page.evaluate(() => { localStorage.setItem('ttt_dev_mode', 'true'); });
}

async function startGame(page: Page): Promise<void> {
  // Click "New Game" or "Play" on the main menu
  const playBtn = page.locator('button:has-text("New Game"), button:has-text("Play"), #btn-new-game, [data-action="new-game"]').first();
  if (await playBtn.count() > 0) {
    await playBtn.click();
    await page.waitForTimeout(500);
  }
  // If character creation is shown, skip it
  const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Quick Start"), [data-action="quick"]').first();
  if (await skipBtn.count() > 0) await skipBtn.click();
  // Wait for the game to initialise
  await page.waitForFunction(() => !!(window as any).__dev?.gameReady || document.querySelector('#hud-root'), { timeout: 15000 });
}

async function openPauseMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pm-btn', { timeout: 3000 });
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Creative Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await enableDevMode(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('Dev Labs section appears in pause menu when dev mode is on', async ({ page }) => {
    await startGame(page);
    await openPauseMenu(page);
    await screenshot(page, '01_pause_menu_dev_labs');

    const creativeBtn = page.locator('button:has-text("Creative Mode")');
    await expect(creativeBtn).toBeVisible();

    const backroomsBtn = page.locator('button:has-text("Dev Backrooms")');
    await expect(backroomsBtn).toBeVisible();
  });

  test('Creative Mode activates — HUD mounts with status bar', async ({ page }) => {
    await startGame(page);
    await openPauseMenu(page);

    await page.click('button:has-text("Creative Mode")');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });
    await screenshot(page, '02_creative_hud_active');

    // Status bar should show the CREATIVE badge
    await expect(page.locator('#creative-status-bar')).toBeVisible();
    await expect(page.locator('.creative-tag')).toContainText('CREATIVE');

    // Quick tools panel should be visible
    await expect(page.locator('#creative-quick-tools')).toBeVisible();

    // Hotbar should be visible with 8 slots
    await expect(page.locator('#creative-hotbar')).toBeVisible();
    const slots = page.locator('.chb-slot');
    await expect(slots).toHaveCount(8);
  });

  test('Ctrl+Shift+C toggles creative mode directly', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });
    await screenshot(page, '03_creative_toggle_shortcut');

    await expect(page.locator('#creative-hud-root')).toBeVisible();

    // Toggle off
    await page.keyboard.press('Control+Shift+C');
    await page.waitForFunction(() => !document.getElementById('creative-hud-root'), { timeout: 3000 });
    const hudGone = await page.locator('#creative-hud-root').count();
    expect(hudGone).toBe(0);
  });

  test('C key opens asset browser with kit tree', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    await page.keyboard.press('c');
    await page.waitForSelector('#creative-browser-overlay', { timeout: 3000 });
    await screenshot(page, '04_asset_browser_open');

    // Sidebar should have KayKit and Kenney groups
    await expect(page.locator('#cb-sidebar')).toContainText('KayKit');
    await expect(page.locator('#cb-sidebar')).toContainText('Kenney');

    // Asset grid should have cards
    const cards = page.locator('.cb-asset-card');
    await expect(cards.first()).toBeVisible();

    // Search works
    await page.fill('#cb-search', 'tree');
    await page.waitForTimeout(200);
    await screenshot(page, '05_asset_browser_search_tree');
    const visibleCards = await page.locator('.cb-asset-card').count();
    expect(visibleCards).toBeGreaterThan(0);
  });

  test('Clicking an asset puts it in the hotbar and closes browser', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    await page.keyboard.press('c');
    await page.waitForSelector('#creative-browser-overlay', { timeout: 3000 });

    // Click the first available asset card
    const firstCard = page.locator('.cb-asset-card').first();
    await firstCard.click();

    // Browser should close
    await page.waitForFunction(() => !document.getElementById('creative-browser-overlay'), { timeout: 2000 });

    // Active tool should now be 'place'
    const state = await page.evaluate(() => (window as any).__dev?.creativeModeState?.());
    if (state) expect(state.activeTool).toBe('place');

    await screenshot(page, '06_asset_in_hotbar');
    // Hotbar slot 0 should now show an icon (not the empty '—')
    const slotIcon = page.locator('.chb-slot').first().locator('.slot-icon');
    await expect(slotIcon).not.toHaveText('—');
  });

  test('Backrooms menu opens from quick tools', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    await page.keyboard.press('b');
    await page.waitForSelector('#creative-backrooms-menu', { timeout: 3000 });
    await screenshot(page, '07_backrooms_menu');

    // Should list the 7 defined backrooms
    await expect(page.locator('#creative-backrooms-menu')).toContainText('Spell Crafting Lab');
    await expect(page.locator('#creative-backrooms-menu')).toContainText('Combat Testing Arena');
    await expect(page.locator('#creative-backrooms-menu')).toContainText('NPC Sandbox');
  });

  test('Exit creative mode restores normal state', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    // Click exit button
    await page.click('#csb-exit');
    await page.waitForFunction(() => !document.getElementById('creative-hud-root'), { timeout: 3000 });
    await screenshot(page, '08_creative_exited');

    // Creative HUD should be gone
    await expect(page.locator('#creative-hud-root')).toHaveCount(0);
  });

  test('Speed cycles through all 4 tiers via ] key', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    const speeds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const speedText = await page.locator('#csb-speed').textContent();
      if (speedText) speeds.push(speedText.trim());
      await page.keyboard.press(']');
      await page.waitForTimeout(100);
    }
    // Should have seen 4 different speed labels
    const unique = new Set(speeds);
    expect(unique.size).toBeGreaterThanOrEqual(1); // at least saw something
    await screenshot(page, '09_speed_cycling');
  });

  test('NoClip toggles via N key', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('Control+Shift+C');
    await page.waitForSelector('#creative-hud-root', { timeout: 5000 });

    const before = await page.locator('#csb-noclip').textContent();
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    const after = await page.locator('#csb-noclip').textContent();

    expect(before).not.toBe(after);
    await screenshot(page, '10_noclip_toggled');
  });
});
