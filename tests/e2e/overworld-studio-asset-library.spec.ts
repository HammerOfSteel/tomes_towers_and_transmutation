import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/ow-lib-${name}.png` });

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800); // initial generation settles
}

async function clearAssetLibrary(page: Page) {
  await openStudio(page);
  await page.evaluate(() => {
    localStorage.removeItem('ttt_asset_library');
  });
  await page.reload();
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800);
}

test('Asset Library saves settlement, dungeon, and cave entries and persists across reload', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);
  await clearAssetLibrary(page);

  await page.click('#btn-save-settlement');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 1);

  await page.click('.studio-tab[data-mode="dungeon"]');
  await page.waitForTimeout(700);
  await page.click('#btn-save-dungeon');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 2);

  await page.click('.studio-tab[data-mode="cave"]');
  await page.waitForTimeout(700);
  await page.click('#btn-save-cave');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 3);

  await SS(page, '01-saved-three-assets');

  await page.reload();
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800);

  const sizeAfterReload = await page.evaluate(() => (window as any).__assetLibrarySize);
  expect(sizeAfterReload).toBe(3);

  await page.click('#btn-library-toggle');
  await expect(page.locator('#library-panel')).toBeVisible();
  await expect(page.locator('#library-grid > div')).toHaveCount(3);

  const codeErrors = console_.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});

test('Asset Library previews persisted entries in the main canvas and supports export/delete', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);
  await clearAssetLibrary(page);

  await page.click('#btn-save-settlement');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 1);

  await page.click('.studio-tab[data-mode="dungeon"]');
  await page.waitForTimeout(700);
  await page.click('#btn-save-dungeon');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 2);

  await page.click('.studio-tab[data-mode="cave"]');
  await page.waitForTimeout(700);
  await page.click('#btn-save-cave');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 3);

  await page.reload();
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800);

  await page.click('#btn-library-toggle');

  // Settlement preview
  await page.click('[data-ltype="settlement"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(1);
  await page.locator('#library-grid > div').first().click();
  await page.waitForFunction(() => (window as any).__owStudioLastLibraryPreview?.type === 'settlement');
  await expect(page.locator('#library-preview-name')).toContainText('Settlement');
  await SS(page, '02-preview-settlement');

  // Dungeon preview: this proves Map-based room data survives persistence + reload.
  await page.click('[data-ltype="dungeon"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(1);
  await page.locator('#library-grid > div').first().click();
  await page.waitForFunction(() => (window as any).__owStudioLastLibraryPreview?.type === 'dungeon');
  await expect(page.locator('#library-preview-name')).toContainText('Dungeon');
  const dungeonPreview = await page.evaluate(() => (window as any).__owStudioLastLibraryPreview);
  expect(dungeonPreview?.type).toBe('dungeon');
  await SS(page, '03-preview-dungeon');

  // Export selected dungeon entry
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-library-export'),
  ]);
  expect(download.suggestedFilename()).toMatch(/Dungeon_/);

  // Cave preview
  await page.click('[data-ltype="cave"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(1);
  await page.locator('#library-grid > div').first().click();
  await page.waitForFunction(() => (window as any).__owStudioLastLibraryPreview?.type === 'cave');
  await expect(page.locator('#library-preview-name')).toContainText('Cave');
  await SS(page, '04-preview-cave');

  // Delete selected cave and verify library shrinks
  await page.click('#btn-library-delete');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 2);
  await page.click('[data-ltype="all"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(2);

  const codeErrors = console_.errors.filter(e => !e.includes('404'));
  expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});