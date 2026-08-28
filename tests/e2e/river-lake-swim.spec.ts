/**
 * river-lake-swim.spec.ts — manual/visual verification for RI-3's live
 * overworld swim collision (TODO/02-game-world-integration/realm-integration.md).
 *
 * Not part of the regular CI regression suite — one-off verification
 * tooling confirming the unit-tested carving/depth/ford logic actually
 * produces correct real-time swim behavior in the live overworld scene.
 * Run: npx playwright test tests/e2e/river-lake-swim.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame, goExterior, getPlayerPos } from './helpers';

// actionTimeout bumped from the original 60s — this shared/sandboxed dev
// environment's headless Chromium screenshot capture (used by helpers.ts's
// goExterior()) can take well over 60s under load; this is purely an
// environment-tolerance adjustment, not a change to test behavior/assertions.
// actionTimeout/navigationTimeout/per-test timeout bumped from the
// original 60s/default/180s — this shared/sandboxed dev environment's
// headless Chromium page load, physics settling, and screenshot capture
// (used by helpers.ts's loadPage()/goExterior() and this spec's own SS())
// can take several minutes under heavy host load; this is purely an
// environment-tolerance adjustment, not a change to test behavior/assertions.
test.use({ actionTimeout: 150_000, navigationTimeout: 60_000 });
test.setTimeout(600_000);

const SS = async (page: Page, name: string) => {
  // Best-effort only — screenshots are a visual aid for manual review, not
  // a correctness assertion, and this sandboxed/shared environment can be
  // slow enough under load to occasionally time out a screenshot capture.
  try {
    await page.screenshot({ path: `tests/e2e/screenshots/river-lake-swim-${name}.png`, timeout: 10_000 });
  } catch (e) {
    console.warn(`[river-lake-swim.spec] screenshot '${name}' skipped: ${(e as Error).message}`);
  }
};

test.describe('Live overworld river/lake swim collision (RI-3)', () => {
  test('walking into a river/water tile triggers real swim mode', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const tile = await page.evaluate(() => (window as any).__game.findWaterTile());
    expect(tile, 'No water tile found in generated overworld').toBeTruthy();

    const cell = await page.evaluate(
      (t) => (window as any).__game.debugCellAt(t.x, t.z),
      tile as { x: number; z: number },
    );
    expect(cell.waterDepth, `Water tile at ${JSON.stringify(tile)} unexpectedly has waterDepth 0`).toBeGreaterThan(0);

    // Drop the player well below the water surface (deep enough to clear
    // SWIM_ENTER_DEPTH_THRESHOLD) — surfaceY ≈ elevation*0.55 + 0.05.
    const surfaceY = cell.elevation * 0.55 + 0.05;
    await page.evaluate(
      ({ t, y }) => (window as any).__game.teleportPlayer(t.x, y, t.z),
      { t: tile, y: surfaceY - 1.2 },
    );
    await page.evaluate(() => (window as any).__game.forceTick(10));
    await page.waitForTimeout(300);
    await SS(page, '01-in-river');

    const swimming = await page.evaluate(() => (window as any).__game.isPlayerSwimming());
    expect(errors, `Console/page errors: ${errors.join(' | ')}`).toHaveLength(0);
    expect(swimming, 'Player did not enter swim mode standing in deep river/water').toBe(true);

    // Confirm buoyancy holds the player up rather than sinking to the carved floor.
    const posA = await getPlayerPos(page);
    await page.evaluate(() => (window as any).__game.forceTick(30));
    await page.waitForTimeout(500);
    const posB = await getPlayerPos(page);
    await SS(page, '02-buoyant');
    expect(Math.abs(posB.y - posA.y)).toBeLessThan(0.6);
  });

  test('walking onto a river_ford tile stays dry (no swim trigger)', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await goExterior(page);

    const ford = await page.evaluate(() => (window as any).__game.findFordTile());
    test.skip(!ford, 'Generated overworld has no road-crossing ford this run — road/river layout is seed-dependent');
    if (!ford) return;

    const cell = await page.evaluate(
      (t) => (window as any).__game.debugCellAt(t.x, t.z),
      ford as { x: number; z: number },
    );
    expect(cell.feature).toBe('river_ford');
    expect(cell.waterDepth).toBe(0);

    const surfaceY = cell.elevation * 0.55 + 0.05;
    await page.evaluate(
      ({ t, y }) => (window as any).__game.teleportPlayer(t.x, y, t.z),
      { t: ford, y: surfaceY + 1.0 },
    );
    await page.evaluate(() => (window as any).__game.forceTick(20));
    await page.waitForTimeout(300);
    await SS(page, '03-on-ford');

    const swimming = await page.evaluate(() => (window as any).__game.isPlayerSwimming());
    expect(swimming, 'Player entered swim mode while standing on a walkable ford crossing').toBe(false);
  });
});
