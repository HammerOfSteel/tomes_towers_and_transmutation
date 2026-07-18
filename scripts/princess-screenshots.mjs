#!/usr/bin/env node
// Quick visual QA: screenshots the Princess Atelier for all four archetypes.
// Usage: npx vite --port 5199 &  then  node scripts/princess-screenshots.mjs [outDir]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '/tmp';
const base = process.env.PC_URL ?? 'http://localhost:5199/princess-creator.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 400)));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (const arch of ['human', 'fox', 'slime', 'skeleton']) {
  await page.click(`.arch-card[data-arch="${arch}"]`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/shot_${arch}.png` });
  console.log('shot', arch);
}
await browser.close();
