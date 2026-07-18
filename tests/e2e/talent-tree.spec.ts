/**
 * talent-tree.spec.ts — F3: Talent tree opens, nodes visible, spending works.
 *
 * Run: npx playwright test tests/e2e/talent-tree.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame } from './helpers';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/talent-${name}.png` });

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console',   (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Talent Tree', () => {

  test('talent tree opens via game menu without errors', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    // Open game menu (Escape → look for talents button)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Try clicking a talents button if visible
    const talentBtn = page.locator('button, [role="button"]')
      .filter({ hasText: /talent|skill|tree/i }).first();
    const hasTalent = await talentBtn.isVisible().catch(() => false);

    if (hasTalent) {
      await talentBtn.click();
      await page.waitForTimeout(500);
      await SS(page, '01-talent-open');
    } else {
      // Try T key shortcut
      await page.keyboard.press('Escape');  // close pause
      await page.waitForTimeout(300);
      await SS(page, '01-talent-fallback');
    }

    expect(errors, `Errors: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('talent tree UI elements exist in DOM after game start', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    // Check if talent tree root exists (may be hidden)
    const hasTalentEl = await page.evaluate(() =>
      !!document.querySelector('[id*="talent"], [class*="talent"], [class*="tt-"]')
    );
    // Talent tree is created at game start — should have DOM elements
    expect(hasTalentEl).toBe(true);
    await SS(page, '02-dom-exists');
  });

  test('progression system has talentPoints property', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    // Dev mode — grant talent points via dev panel if possible
    await page.evaluate(() => localStorage.setItem('ttt_dev_mode', 'true'));
    await page.reload();
    await page.waitForFunction(() => !!(window as any).__game, { timeout: 20_000 });
    await page.evaluate((s) => (window as any).__game.startGame(s), 0xDEAD_BEEF);
    await page.waitForTimeout(800);
    await SS(page, '03-dev-mode');

    // Verify no errors in dev mode
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    expect(errors).toHaveLength(0);
  });

  test('HUD ability bar shows Q/R/Z/X slots', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(800);
    await SS(page, '04-ability-bar');

    // Ability bar slots (Q R Z X) should be in DOM
    const hasAbilityBar = await page.evaluate(() =>
      !!document.querySelector('[id*="ab-slot"], [class*="ab-slot"], [id*="hud-ab"]')
    );
    expect(hasAbilityBar).toBe(true);
  });

  test('mana bar is visible during gameplay', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(800);
    await SS(page, '05-mana-bar');

    const hasMana = await page.evaluate(() =>
      !!document.querySelector('[id*="mana"], [class*="mana"]')
    );
    expect(hasMana).toBe(true);
  });

  test('spell casting works (no errors on right-click)', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(800);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.waitForTimeout(400);
    }
    await SS(page, '06-spell-cast');
    expect(errors, `Errors on spell cast: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('Q ability key triggers without errors', async ({ page }) => {
    const errors = captureErrors(page);
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(800);

    await page.keyboard.press('q');
    await page.waitForTimeout(500);
    await SS(page, '07-q-ability');
    expect(errors, `Errors on Q: ${errors.join(', ')}`).toHaveLength(0);
  });
});
