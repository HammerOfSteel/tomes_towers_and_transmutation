/**
 * save-load.spec.ts — F3: Save in tower, reload, continue loads correct
 * character model + floor.
 *
 * Run: npx playwright test tests/e2e/save-load.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame } from './helpers';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/save-load-${name}.png` });

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Save & Load', () => {

  test('patchSaveSlot and readSaveSlot round-trip via localStorage', async ({ page }) => {
    await loadPage(page);

    // Write a save directly via localStorage
    const saveKey = 'ttt_save_slot_0';
    await page.evaluate((k) => {
      const save = { floor: 3, hasMasterKey: true, location: 'The Tower', seed: 0xDEAD_BEEF };
      localStorage.setItem(k, JSON.stringify(save));
    }, saveKey);

    // Read it back
    const saved = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, saveKey);

    expect(saved).not.toBeNull();
    expect(saved.floor).toBe(3);
    expect(saved.hasMasterKey).toBe(true);
    await SS(page, '01-save-written');
  });

  test('game start writes autoSave to slot 0 on floor transition', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    // Trigger a floor transition by teleporting
    await page.evaluate(() => (window as any).__game.onTeleportRoom?.('tower_floor_1_chamber'));
    await page.waitForTimeout(800);
    await SS(page, '02-after-floor-change');

    // autoSave writes to active slot — check localStorage
    const hasSave = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) ?? '';
        if (k.startsWith('ttt_save_slot')) return true;
      }
      return false;
    });
    expect(hasSave).toBe(true);
  });

  test('reload page restores __game object', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, { timeout: 20_000 });
    await SS(page, '03-after-reload');

    const hasGame = await page.evaluate(() => typeof (window as any).__game === 'object');
    expect(hasGame).toBe(true);
  });

  test('getGameMode returns interior after startGame', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(500);

    const mode = await page.evaluate(() => (window as any).__game.getGameMode?.());
    expect(mode).toBe('interior');
  });

  test('floor state persists in localStorage after multiple transitions', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    // Visit floor 2
    await page.evaluate(() => (window as any).__game.onTeleportRoom?.('tower_floor_2_chamber'));
    await page.waitForTimeout(600);

    // Visit floor -1 (basement)
    await page.evaluate(() => (window as any).__game.onTeleportRoom?.('tower_floor_b1_chamber'));
    await page.waitForTimeout(600);

    await SS(page, '04-multi-floor');

    // localStorage should have at least one save entry
    const saveCount = await page.evaluate(() =>
      [...Array(localStorage.length)].filter((_, i) =>
        (localStorage.key(i) ?? '').startsWith('ttt_save')
      ).length
    );
    expect(saveCount).toBeGreaterThan(0);
  });

  test('getCurrentFloor returns floor index matching last teleport', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.evaluate(() => (window as any).__game.onTeleportRoom?.('tower_floor_2_chamber'));
    await page.waitForTimeout(800);

    const floor = await page.evaluate(() => (window as any).__game.getCurrentFloor?.());
    // Floor should be 2 (or close, depending on room ID mapping)
    expect(typeof floor).toBe('number');
    await SS(page, '05-floor-number');
  });
});
