/**
 * editor-smoke.spec.ts — Playwright smoke tests for the Level Editor tabs.
 *
 * Tests run against the model-review page (port 5174).
 * Each test:
 *   1. Opens http://localhost:5174/model-review.html
 *   2. Switches to the ✏️ Editor tab
 *   3. Exercises the appropriate sub-editor
 *   4. Takes a screenshot for visual diff review
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5174/model-review.html';
const TIMEOUT   = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openEditorTab(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => !!(window as any).__modelReview?.ready, { timeout: TIMEOUT });
  // Click the Editor tab
  await page.click('#tab-editor');
  await page.waitForFunction(() => !!(window as any).__editorReview?.coreReady, { timeout: TIMEOUT });
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `tests/e2e/report/editor-${name}.png`,
    fullPage: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Editor Tab — foundation', () => {
  test('Editor tab is present and activates EditorCore', async ({ page }) => {
    await openEditorTab(page);
    const coreReady = await page.evaluate(() => (window as any).__editorReview?.coreReady);
    expect(coreReady).toBe(true);
    await screenshot(page, 'L0-editor-tab');
  });

  test('Mode tabs are all present', async ({ page }) => {
    await openEditorTab(page);
    const tabs = await page.$$eval('.editor-sub', els => els.map(e => (e as HTMLElement).textContent?.trim()));
    expect(tabs.length).toBe(5);
    expect(tabs.some(t => t?.includes('Tower'))).toBe(true);
    expect(tabs.some(t => t?.includes('World'))).toBe(true);
    expect(tabs.some(t => t?.includes('Building'))).toBe(true);
    expect(tabs.some(t => t?.includes('Interior'))).toBe(true);
    expect(tabs.some(t => t?.includes('Dungeon'))).toBe(true);
  });

  test('Asset browser shows assets', async ({ page }) => {
    await openEditorTab(page);
    const assetCount = await page.$$eval('#editor-asset-list li', els => els.length);
    expect(assetCount).toBeGreaterThan(10);
    await screenshot(page, 'L0-asset-browser');
  });

  test('Toolbar buttons are present', async ({ page }) => {
    await openEditorTab(page);
    for (const id of ['ed-tool-select', 'ed-tool-move', 'ed-tool-rotate', 'ed-tool-scale',
                       'ed-snap-toggle', 'ed-undo', 'ed-redo', 'ed-save', 'ed-load']) {
      const btn = await page.$(`#${id}`);
      expect(btn).toBeTruthy();
    }
  });
});

test.describe('Editor Tab — Tower Floor (L1)', () => {
  test('Tower sub-tab shows floor list panel', async ({ page }) => {
    await openEditorTab(page);
    const floorPanel = await page.$('#tfe-floor-list-panel');
    const visible    = await floorPanel?.isVisible();
    expect(visible).toBe(true);
    await screenshot(page, 'L1-tower-default');
  });

  test('Add Floor button creates a new floor entry', async ({ page }) => {
    await openEditorTab(page);
    const before = await page.$$eval('#tfe-floor-list li', els => els.length);
    await page.click('#tfe-add-floor');
    const after  = await page.$$eval('#tfe-floor-list li', els => els.length);
    expect(after).toBe(before + 1);
  });

  test('Floor properties panel shows expected fields', async ({ page }) => {
    await openEditorTab(page);
    for (const id of ['tfe-floor-name', 'tfe-light-preset', 'tfe-quote', 'tfe-boss-room']) {
      const el = await page.$(`#${id}`);
      expect(el).toBeTruthy();
    }
  });

  test('Export buttons are present', async ({ page }) => {
    await openEditorTab(page);
    const jsonBtn = await page.$('#tfe-export-json');
    const tsBtn   = await page.$('#tfe-export-ts');
    expect(jsonBtn).toBeTruthy();
    expect(tsBtn).toBeTruthy();
  });

  test('Spawn + exit placement buttons present', async ({ page }) => {
    await openEditorTab(page);
    for (const id of ['tfe-place-spawn-enemy', 'tfe-place-spawn-npc',
                       'tfe-place-stair-up', 'tfe-place-stair-down', 'tfe-place-exit']) {
      const btn = await page.$(`#${id}`);
      expect(btn).toBeTruthy();
    }
    await screenshot(page, 'L1-tower-props');
  });
});

test.describe('Editor Tab — Building (L3/L4)', () => {
  test('Building sub-tab shows building editor panel', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="building"]');
    await page.waitForTimeout(300);
    const panel   = await page.$('#building-editor-panel');
    const visible = await panel?.isVisible();
    expect(visible).toBe(true);
    await screenshot(page, 'L3-building-exterior');
  });

  test('Exterior/Interior mode buttons present', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="building"]');
    const extBtn = await page.$('[data-mode="exterior"]');
    const intBtn = await page.$('[data-mode="interior"]');
    expect(extBtn).toBeTruthy();
    expect(intBtn).toBeTruthy();
  });

  test('Switching to Interior shows room presets', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="building"]');
    await page.click('[data-mode="interior"]');
    await page.waitForTimeout(200);
    const presetsEl = await page.$('#bld-room-presets');
    const visible   = await presetsEl?.isVisible();
    expect(visible).toBe(true);
    await screenshot(page, 'L4-building-interior');
  });
});

test.describe('Editor Tab — Dungeon (L5)', () => {
  test('Dungeon sub-tab shows dungeon editor panel', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="dungeon"]');
    await page.waitForTimeout(300);
    const panel   = await page.$('#dungeon-editor-panel');
    const visible = await panel?.isVisible();
    expect(visible).toBe(true);
    await screenshot(page, 'L5-dungeon-default');
  });

  test('Room template buttons are present', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="dungeon"]');
    const btns = await page.$$('.dng-add-room');
    expect(btns.length).toBeGreaterThanOrEqual(5);
  });

  test('Adding a room updates the node map canvas', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="dungeon"]');
    await page.click('[data-tpl="entry_chamber"]');
    await page.waitForTimeout(300);
    const roomCount = await page.$$eval('#dng-room-list li', els => els.length);
    expect(roomCount).toBe(1);
    await screenshot(page, 'L5-dungeon-one-room');
  });

  test('Adding multiple rooms shows them all in room list', async ({ page }) => {
    await openEditorTab(page);
    await page.click('[data-etype="dungeon"]');
    await page.click('[data-tpl="entry_chamber"]');
    await page.click('[data-tpl="corridor_narrow"]');
    await page.click('[data-tpl="treasure_vault"]');
    await page.waitForTimeout(300);
    const count = await page.$$eval('#dng-room-list li', els => els.length);
    expect(count).toBe(3);
    await screenshot(page, 'L5-dungeon-three-rooms');
  });
});

test.describe('Editor Tab — Environment + Scale calibration', () => {
  test('Environment tab shows asset list', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => !!(window as any).__modelReview?.ready, { timeout: TIMEOUT });
    await page.click('#tab-env');
    await page.waitForTimeout(400);
    const list = await page.$$eval('#env-list li', els => els.length);
    expect(list).toBeGreaterThan(20);
    await screenshot(page, 'L6-env-tab');
  });

  test('Scale slider updates displayed value', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => !!(window as any).__modelReview?.ready, { timeout: TIMEOUT });
    await page.click('#tab-env');
    await page.waitForTimeout(400);
    // Load first asset
    await page.evaluate(() => (window as any).__envReview?.switchToEnv?.());
    await page.waitForTimeout(300);
    // Move slider to 3.0
    await page.fill('#env-scale-slider', '3');
    await page.dispatchEvent('#env-scale-slider', 'input');
    const val = await page.$eval('#env-scale-val', el => el.textContent);
    expect(val).toBe('3.00');
    await screenshot(page, 'L6-scale-slider');
  });

  test('Copy button is present', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForFunction(() => !!(window as any).__modelReview?.ready, { timeout: TIMEOUT });
    await page.click('#tab-env');
    const copyBtn = await page.$('#env-scale-copy');
    expect(copyBtn).toBeTruthy();
  });
});
