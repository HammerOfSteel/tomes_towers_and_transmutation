#!/usr/bin/env node
// Quick visual QA: screenshots the Princess Atelier for every species.
// Usage: npx vite --port 5199 &  then  node scripts/princess-screenshots.mjs [outDir] [species...]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const out = args[0] ?? '/tmp';
const only = args.slice(1);
const base = process.env.PC_URL ?? 'http://localhost:5199/princess-creator.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 400)));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const species = only.length > 0 ? only : await page.evaluate(() =>
  [...document.querySelectorAll('.arch-card')].map((c) => c.dataset.species),
);
for (const s of species) {
  await page.evaluate((id) => {
    document.querySelector(`.arch-card[data-species="${id}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, s);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/species_${s}.png` });
  console.log('shot', s);
}
await browser.close();
