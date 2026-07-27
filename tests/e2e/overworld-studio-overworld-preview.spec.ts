import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('studio settlement preview opens game overworld with 3D settlement overlay', async ({ page, context }) => {
  const studioConsole = attachFullConsoleCapture(page);
  await openStudio(page);

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#btn-preview-overworld'),
  ]);

  const popupConsole = attachFullConsoleCapture(popup);
  await popup.waitForURL(/\/index\.html(?:$|\?)/, { timeout: 20_000 });
  await popup.waitForLoadState('domcontentloaded');

  let state: {
    stage: string | null;
    error: string | null;
    booted: boolean;
    loaded: { buildingCount?: number } | null;
    mode: string | null;
    hasGameHook: boolean;
    gameStarted: boolean;
    previewKeyPresent: boolean;
  } | null = null;

  for (let i = 0; i < 30; i++) {
    state = await popup.evaluate(() => ({
      stage: (window as any).__tttOverworldPreviewStage ?? null,
      error: (window as any).__tttOverworldPreviewError ?? null,
      booted: (window as any).__tttOverworldPreviewBooted ?? false,
      loaded: (window as any).__tttOverworldPreviewLoaded ?? null,
      mode: (window as any).__game?.getGameMode?.() ?? null,
      hasGameHook: !!(window as any).__game,
      gameStarted: (window as any).__gameStarted === true,
      previewKeyPresent: !!localStorage.getItem('ttt_overworld_settlement_preview'),
    }));
    if (state.error) break;
    if (state.mode === 'exterior' && state.loaded && (state.loaded.buildingCount ?? 0) > 0) break;
    await popup.waitForTimeout(2000);
  }

  expect(state, 'Popup state was never captured').toBeTruthy();
  expect(state?.error, `OW-E6 popup reported boot error: ${JSON.stringify(state, null, 2)}`).toBeFalsy();
  expect(state?.booted, `OW-E6 popup never marked booted: ${JSON.stringify(state, null, 2)}`).toBe(true);
  expect(state?.mode, `OW-E6 popup never reached exterior: ${JSON.stringify(state, null, 2)}`).toBe('exterior');
  expect(state?.loaded, `OW-E6 popup never loaded preview settlement: ${JSON.stringify(state, null, 2)}`).toBeTruthy();
  expect(state?.loaded?.buildingCount ?? 0, `OW-E6 popup loaded zero preview buildings: ${JSON.stringify(state, null, 2)}`).toBeGreaterThan(0);

  const studioErrors = studioConsole.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(studioErrors, `Unexpected Studio console/page errors:\n${studioConsole.all.join('\n')}`).toHaveLength(0);

  const popupErrors = popupConsole.errors.filter(e => {
    const msg = String(e);
    return !msg.includes('404') && !msg.includes('Failed to load resource');
  });
  expect(popupErrors, `Unexpected game console/page errors:\n${popupConsole.all.join('\n')}`).toHaveLength(0);
});