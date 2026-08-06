import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5174';
const STUDIO_TABS = ['settlement', 'dungeon', 'cave', 'realm', 'solar'] as const;

test('sidebar never needs horizontal scrolling in any studio tab', async ({ page }) => {
  await page.goto(`${BASE}/overworld-studio.html`);
  await page.locator('#map-canvas').waitFor({ state: 'visible', timeout: 20_000 });

  for (const mode of STUDIO_TABS) {
    await page.click(`.studio-tab[data-mode="${mode}"]`);
    await page.waitForTimeout(200);
    const overflow = await page
      .locator('.sidebar')
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(
      overflow,
      `sidebar overflows horizontally in "${mode}" tab by ${overflow}px`,
    ).toBeLessThanOrEqual(1);
  }
});
