/**
 * lantern-spell.spec.ts — manual/visual verification for the lantern spell
 * (docs/superpowers/specs/2026-08-31-lantern-spell-design.md).
 *
 * Not part of the regular CI regression suite — one-off verification
 * tooling confirming the unit-tested SpellSystem/PlayerController/
 * ProgressionSystem toggle logic actually produces correct real-time
 * behavior end-to-end (real DOM keyboard/mouse events -> InputManager ->
 * main.ts cast handler -> SpellSystem.cast -> onLanternToggle ->
 * PlayerController).
 * Run: npx playwright test tests/e2e/lantern-spell.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000, navigationTimeout: 60_000 });
test.setTimeout(120_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/lantern-spell-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[lantern-spell.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Lantern spell toggle', () => {
  test('slot-1 default equip + right-click casts toggle the lantern on/off with no errors', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);

    // Lantern is a default starting spell, auto-equipped in slot 1 (Digit2).
    expect(await page.evaluate(() => (window as any).__game.isLanternOn())).toBe(false);

    await page.keyboard.press('Digit2'); // select slot 1 (lantern)
    await page.mouse.move(400, 300);
    await page.mouse.down({ button: 'right' }); // cast on rising edge
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(150);
    await SS(page, '01-lantern-on');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);
    expect(await page.evaluate(() => (window as any).__game.isLanternOn())).toBe(true);

    // Cast again to toggle off.
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(150);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(150);
    await SS(page, '02-lantern-off');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);
    expect(await page.evaluate(() => (window as any).__game.isLanternOn())).toBe(false);
  });
});
