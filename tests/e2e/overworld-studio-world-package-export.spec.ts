import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('realm world package export downloads deterministic JSON package', async ({ page }) => {
  const console_ = attachFullConsoleCapture(page);
  await openStudio(page);

  await page.click('.studio-tab[data-mode="realm"]');
  await page.waitForFunction(() => {
    const data = (window as any).__owStudioCurrentRealmData;
    return !!data && Array.isArray(data.settlements) && Array.isArray(data.dungeons);
  });

  const before = await page.evaluate(() => (window as any).__owStudioCurrentRealmData);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export-world-package'),
  ]);

  expect(download.suggestedFilename()).toMatch(/^world-package-\d+\.json$/);

  const path = await download.path();
  expect(path, 'Download path should exist for local Playwright runs').toBeTruthy();

  const raw = await readFile(path!, 'utf8');
  const pkg = JSON.parse(raw) as any;

  expect(pkg.version).toBe(1);
  expect(pkg.kind).toBe('ttt_world_package');
  expect(pkg.source).toBe('overworld-studio');

  expect(pkg.seed).toBe(before.seed);
  expect(pkg.realm.seed).toBe(before.seed);
  expect(pkg.realm.W).toBe(before.W);
  expect(pkg.realm.H).toBe(before.H);

  expect(Array.isArray(pkg.realm.cells)).toBe(true);
  expect(Array.isArray(pkg.realm.rivers)).toBe(true);
  expect(Array.isArray(pkg.realm.settlements)).toBe(true);
  expect(Array.isArray(pkg.realm.dungeons)).toBe(true);

  expect(Array.isArray(pkg.settlements)).toBe(true);
  expect(Array.isArray(pkg.dungeons)).toBe(true);
  expect(pkg.settlements.length).toBe(before.settlements.length);
  expect(pkg.dungeons.length).toBe(before.dungeons.length);

  if (pkg.settlements.length > 0) {
    const s = pkg.settlements[0];
    expect(typeof s.x).toBe('number');
    expect(typeof s.y).toBe('number');
    expect(typeof s.name).toBe('string');
    expect(typeof s.size).toBe('string');
    expect(typeof s.faction).toBe('string');
    expect(typeof s.seed).toBe('number');
  }

  if (pkg.dungeons.length > 0) {
    const d = pkg.dungeons[0];
    expect(typeof d.x).toBe('number');
    expect(typeof d.y).toBe('number');
    expect(typeof d.seed).toBe('number');
  }

  const exportedState = await page.evaluate(() => (window as any).__owStudioLastWorldPackage ?? null);
  expect(exportedState).toBeTruthy();
  expect(exportedState.seed).toBe(before.seed);
  expect(exportedState.settlements).toBe(before.settlements.length);
  expect(exportedState.dungeons).toBe(before.dungeons.length);

  const codeErrors = console_.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(codeErrors, `Unexpected console/page errors:\n${console_.all.join('\n')}`).toHaveLength(0);
});