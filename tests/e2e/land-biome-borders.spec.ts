/**
 * land-biome-borders.spec.ts — manual/visual verification for sub-task 1.1's
 * land-biome dual-grid borders + region-scale texture variety (see
 * docs/superpowers/plans/2026-09-20-land-biome-dual-grid-borders-plan.md,
 * Task 7).
 *
 * Not part of the regular CI regression suite — one-off verification tooling
 * confirming the unit-tested corner-pull/region-variant/UV-rotation logic
 * actually produces visibly curved land-biome borders and non-repeating
 * ground texture in the live OverworldScene, with no console/page errors.
 * Run: npx playwright test tests/e2e/land-biome-borders.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, teleportPlayer, attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(300_000);

const SS = async (page: Page, name: string) => {
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/land-biome-borders-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[land-biome-borders.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Land-biome dual-grid borders + region-scale texture variety (2026-09-20)', () => {
  test('a grassland tile renders with curved land-biome corners and non-uniform texture, with no console errors', async ({ page }) => {
    const { errors, all } = attachFullConsoleCapture(page);

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findFirstBiomeTile('grassland'));
    expect(tile, 'No grassland tile found in generated overworld').toBeTruthy();

    // Fly the camera-following player high above the tile and look straight
    // down at a wide field of view worth of terrain, so the screenshot
    // captures many tiles' worth of borders/texture at once rather than a
    // single close-up tile.
    await teleportPlayer(page, (tile as { x: number; z: number }).x, 40, (tile as { x: number; z: number }).z);
    await page.evaluate(() => (window as any).__game.forceTick(30));
    await page.waitForTimeout(500);
    await SS(page, '01-grassland-overview');

    expect(errors, `Console/page errors: ${all.join('\n')}`).toHaveLength(0);
  });
});
