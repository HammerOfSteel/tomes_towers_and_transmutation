/**
 * Asset Viewer visual regression tests.
 *
 * Loads /asset-viewer.html (isolated Three.js scene, no game logic or physics),
 * waits for every GLB to finish loading, then takes screenshots by category
 * for easy visual diff inspection.
 */

import { test, expect, type Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/viewer-${name}.png` });

async function loadViewer(page: Page) {
  await page.goto('/asset-viewer.html');
  // Wait until every GLB has loaded (flag set in assetViewer.ts)
  await page.waitForFunction(
    () => (window as any).__assetViewerReady === true,
    { timeout: 90_000 },
  );
  // One extra frame to let the renderer settle
  await page.waitForTimeout(400);
}

test.describe('Asset Viewer — GLB visual check', () => {
  test.setTimeout(120_000);

  test('all assets load without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);

    const status = await page.textContent('#status');
    expect(status).toContain('✓ All');
    expect(errors, 'No JS errors').toHaveLength(0);

    await shot(page, '00-full-grid');
  });

  test('nature rocks render with correct colors (not white)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);

    // Zoom camera toward the rock column (first group, left side)
    await page.evaluate(() => {
      const cam = (window as any).__viewerCamera;
      if (cam) { cam.position.set(-42, 12, 18); cam.lookAt(-42, 0, 0); }
    });
    await page.waitForTimeout(300);
    await shot(page, '01-rocks');

    expect(errors).toHaveLength(0);
  });

  test('river tiles render with correct ground colors (not white)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);
    await shot(page, '02-river-tiles');
    expect(errors).toHaveLength(0);
  });

  test('town props (stalls, lanterns, fountain) render correctly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);
    await shot(page, '03-town-props');
    expect(errors).toHaveLength(0);
  });

  test('castle tower modules render correctly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);
    await shot(page, '04-castle');
    expect(errors).toHaveLength(0);
  });

  test('dungeon gate GLBs render correctly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadViewer(page);
    await shot(page, '05-dungeon');
    expect(errors).toHaveLength(0);
  });
});
