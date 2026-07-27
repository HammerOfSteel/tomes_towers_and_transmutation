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

test('Asset Library previews persisted entries and supports export/import/duplicate/delete', async ({ page }) => {
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

  // Import an external dungeon JSON snapshot and verify it appears + previews
  await page.setInputFiles('#library-import-file', {
    name: 'imported-dungeon.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      id: 'external_dungeon',
      type: 'dungeon',
      name: 'Imported Dungeon',
      seed: 999,
      createdAt: 1,
      tags: ['dtype:generic'],
      isCustom: true,
      thumbnail: null,
      data: {
        rooms: {
          __tttType: 'Map',
          entries: [[
            'room_0',
            {
              id: 'room_0',
              version: 1,
              width: 7,
              depth: 7,
              cellSize: 2,
              wallHeight: 3,
              tiles: [],
              doors: [],
              staircases: [],
              spawns: [],
              interactables: [],
              floor: 0,
              floorType: 'stone',
            },
          ]],
        },
        startRoomId: 'room_0',
        seed: 999,
      },
    })),
  });
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 4);
  await page.click('[data-ltype="dungeon"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(2);
  await page.locator('#library-grid > div').first().click();
  await page.waitForFunction(() => (window as any).__owStudioLastLibraryPreview?.name === 'Imported Dungeon');
  await expect(page.locator('#library-preview-name')).toContainText('Imported Dungeon');

  // Cave preview
  await page.click('[data-ltype="cave"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(1);
  await page.locator('#library-grid > div').first().click();
  await page.waitForFunction(() => (window as any).__owStudioLastLibraryPreview?.type === 'cave');
  await expect(page.locator('#library-preview-name')).toContainText('Cave');
  await SS(page, '04-preview-cave');

  // Duplicate selected cave and verify library grows
  await page.click('#btn-library-duplicate');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 5);
  await expect(page.locator('#library-preview-name')).toContainText('Copy');
  await page.click('[data-ltype="all"]');
  await expect(page.locator('#library-grid > div')).toHaveCount(5);

  // Delete selected duplicated cave and verify library shrinks
  await page.click('#btn-library-delete');
  await page.waitForFunction(() => (window as any).__assetLibrarySize === 4);
  await expect(page.locator('#library-grid > div')).toHaveCount(4);

  const codeErrors = console_.errors.filter(e => !e.includes('404'));
  expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});