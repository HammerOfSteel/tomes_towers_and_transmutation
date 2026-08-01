/**
 * npc-visual-migration.spec.ts
 *
 * Verifies overworld settlement NPCs render with the new princess-rig-based
 * visual system (not the old creature system) and that interacting with one
 * still opens the dialogue panel — i.e. the visual migration didn't break
 * existing NPC gameplay.
 *
 * Run: npx playwright test tests/e2e/npc-visual-migration.spec.ts --reporter=list
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

function attachLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return logs;
}

async function startGameQuick(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.quickPlayPrincess({ name: 'Tester', species: 'foxling' }));
  await page.waitForFunction(() => (window as any).__gameStarted === true, { timeout: 60_000 });
  await page.waitForTimeout(1000);
}

test('settlement NPCs render with new npc-creator visuals and remain interactable', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startGameQuick(page);

  // Enter the overworld (spawns settlements + NPCs via _spawnSettlementNPCs)
  await page.evaluate(() => (window as any).__game.switchToExterior());
  await page.waitForFunction(() => (window as any).__game.getGameMode() === 'exterior', { timeout: 20_000 });

  // Wait for at least one NPC to exist and its async new-system visual to resolve
  const sample = await page.waitForFunction(() => {
    const s = (window as any).__game.getNpcSample?.();
    return s && s.hasNewVisual ? s : null;
  }, { timeout: 20_000 }).then(h => h.jsonValue()) as {
    role: string; name: string; position: { x: number; y: number; z: number }; hasNewVisual: boolean;
  };

  console.log(`[test] NPC sample: ${JSON.stringify(sample)}`);
  expect(sample).toBeTruthy();
  expect(sample.hasNewVisual).toBe(true);
  expect(typeof sample.name).toBe('string');
  expect(sample.name.length).toBeGreaterThan(0);

  // Teleport player next to the sampled NPC and interact
  await page.evaluate((pos) => {
    (window as any).__game.teleportPlayer(pos.x + 1, pos.y + 1.5, pos.z);
  }, sample.position);
  await page.waitForTimeout(500);

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);

  const dialogueVisible = await page.locator('#npc-dialogue').isVisible().catch(() => false);
  console.log(`[test] dialogue panel visible after [E]: ${dialogueVisible}`);

  const errorLogs = logs.filter(l => l.includes('pageerror') || l.toLowerCase().includes('error'));
  if (errorLogs.length > 0) {
    console.log('[test] console errors during NPC interaction:');
    errorLogs.forEach(l => console.log(' ', l));
  }
  expect(errorLogs.length).toBe(0);
  expect(dialogueVisible).toBe(true);
});
