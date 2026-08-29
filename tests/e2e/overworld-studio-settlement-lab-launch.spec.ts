import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('Settlement tab "Play in 3D" button boots the game into the Settlement Lab with the configured settlement', async ({ page, context }) => {
  const studioConsole = attachFullConsoleCapture(page);
  await openStudio(page);

  // Configure a distinctive seed on the Settlement tab before launching, to
  // prove the Lab actually receives this settlement's params rather than
  // its own hardcoded defaults.
  const seedInput = page.locator('#seed-input');
  await seedInput.fill('918273645');
  await page.click('#btn-gen');
  await page.waitForTimeout(500);

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#btn-play-in-3d-lab'),
  ]);

  const popupConsole = attachFullConsoleCapture(popup);
  await popup.waitForURL(/\/index\.html(?:$|\?)/, { timeout: 20_000 });
  await popup.waitForLoadState('domcontentloaded');

  let state: {
    stage: string | null;
    error: string | null;
    booted: boolean;
    mode: string | null;
    hasGameHook: boolean;
    seedInputValue: string | null;
  } | null = null;

  for (let i = 0; i < 30; i++) {
    state = await popup.evaluate(() => ({
      stage: (window as any).__tttDevRoomStage ?? null,
      error: (window as any).__tttDevRoomError ?? null,
      booted: (window as any).__tttDevRoomBooted ?? false,
      mode: (window as any).__game?.getGameMode?.() ?? null,
      hasGameHook: !!(window as any).__game,
      seedInputValue: (document.querySelector('[data-role="seed-input"]') as HTMLInputElement | null)?.value ?? null,
    }));
    if (state.error) break;
    if (state.mode === 'settlementlab' && state.seedInputValue) break;
    await popup.waitForTimeout(2000);
  }

  expect(state, 'Popup state was never captured').toBeTruthy();
  expect(state?.error, `Dev room popup reported boot error: ${JSON.stringify(state, null, 2)}`).toBeFalsy();
  expect(state?.booted, `Dev room popup never marked booted: ${JSON.stringify(state, null, 2)}`).toBe(true);
  expect(state?.mode, `Dev room popup never reached settlementlab: ${JSON.stringify(state, null, 2)}`).toBe('settlementlab');
  expect(state?.seedInputValue, `Lab panel did not carry over the configured seed: ${JSON.stringify(state, null, 2)}`).toBe('918273645');

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
