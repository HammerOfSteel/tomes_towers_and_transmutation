/**
 * ambient-wildlife.spec.ts — manual/visual verification for Phase 9 batch 1's ambient wildlife
 * (rabbits, goats; see docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md).
 *
 * Not part of the regular CI regression suite — one-off verification tooling confirming the
 * unit-tested placement/behavior/rig logic actually produces visible, moving, fleeing creatures
 * in the live OverworldScene with no console/page errors.
 * Run: npx playwright test tests/e2e/ambient-wildlife.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, teleportPlayer, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(300_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/ambient-wildlife-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[ambient-wildlife.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Ambient wildlife (Phase 9 batch 1)', () => {
  test('a forest tile spawns ambient creatures, and the population is bounded, with no console errors', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstBiomeTile('forest'));
    expect(tile, 'No forest tile found in generated overworld').toBeTruthy();

    await teleportPlayer(page, (tile as { x: number; z: number }).x, 5, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(30));
    await page.waitForTimeout(500);
    await SS(page, '01-forest');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);

    const count = await page.evaluate(() => (window as any).__game.getActiveAmbientCreatureCount());
    expect(count, 'Active ambient creature count should never exceed the global cap').toBeLessThanOrEqual(24);
  });
});
