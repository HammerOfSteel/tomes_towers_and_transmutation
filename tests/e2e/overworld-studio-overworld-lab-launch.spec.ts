import { test, expect, type Page } from '@playwright/test';
import { attachFullConsoleCapture } from './helpers';

test.use({ actionTimeout: 60_000 });

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';

async function openStudio(page: Page) {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1000);
}

test('Realm tab "Play in 3D" button boots the game into the live exterior overworld with the configured realm', async ({ page, context }) => {
  const studioConsole = attachFullConsoleCapture(page);
  await openStudio(page);

  // Switch to the Realm tab (auto-generates a realm on first visit).
  await page.click('.studio-tab[data-mode="realm"]');
  await page.waitForTimeout(500);

  // Configure a distinctive seed + non-default shape/climate before
  // launching, to prove the Lab actually receives this realm's exact
  // params rather than the live game's own independently-seeded default.
  const seedInput = page.locator('#seed-input');
  await seedInput.fill('314159265');
  await page.click('[data-shape="archipelago"]');
  await page.click('[data-climate="arctic"]');
  await page.click('#btn-gen');
  await page.waitForTimeout(500);

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.click('#btn-play-in-3d-realm'),
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
  } | null = null;

  for (let i = 0; i < 30; i++) {
    state = await popup.evaluate(() => ({
      stage: (window as any).__tttDevRoomStage ?? null,
      error: (window as any).__tttDevRoomError ?? null,
      booted: (window as any).__tttDevRoomBooted ?? false,
      mode: (window as any).__game?.getGameMode?.() ?? null,
      hasGameHook: !!(window as any).__game,
    }));
    if (state.error) break;
    if (state.mode === 'exterior') break;
    await popup.waitForTimeout(2000);
  }

  expect(state, 'Popup state was never captured').toBeTruthy();
  expect(state?.error, `Dev room popup reported boot error: ${JSON.stringify(state, null, 2)}`).toBeFalsy();
  expect(state?.booted, `Dev room popup never marked booted: ${JSON.stringify(state, null, 2)}`).toBe(true);
  expect(state?.mode, `Dev room popup never reached exterior: ${JSON.stringify(state, null, 2)}`).toBe('exterior');

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
