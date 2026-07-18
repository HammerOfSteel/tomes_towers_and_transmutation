/**
 * quest-journal.spec.ts — F3: QuestJournal DOM structure, tab switching,
 * quest log integration.
 *
 * Run: npx playwright test tests/e2e/quest-journal.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage, startGame } from './helpers';

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/quest-journal-${name}.png` });

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Quest Journal', () => {

  test('J key opens quest journal panel', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('j');
    await page.waitForTimeout(400);
    await SS(page, '01-journal-open');

    const journalVisible = await page.evaluate(() => {
      const el = document.getElementById('qj-root');
      return el ? el.style.display !== 'none' : false;
    });
    expect(journalVisible).toBe(true);
  });

  test('journal has two tab buttons', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('j');
    await page.waitForTimeout(400);

    const tabCount = await page.locator('.qj-tab').count();
    expect(tabCount).toBe(2);
  });

  test('Escape closes the journal', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('j');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await SS(page, '02-journal-closed');

    const journalHidden = await page.evaluate(() => {
      const el = document.getElementById('qj-root');
      return !el || el.style.display === 'none';
    });
    expect(journalHidden).toBe(true);
  });

  test('clicking World Quests tab switches tab content', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('j');
    await page.waitForTimeout(400);

    // Click the second tab (World Quests)
    const tabs = page.locator('.qj-tab');
    await tabs.nth(1).click();
    await page.waitForTimeout(300);
    await SS(page, '03-world-quests-tab');

    // Second tab should now be active
    const secondTabActive = await page.evaluate(() => {
      const tabs = document.querySelectorAll('.qj-tab');
      return tabs[1]?.classList.contains('qj-tab--active') ?? false;
    });
    expect(secondTabActive).toBe(true);
  });

  test('quest journal close button works', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('j');
    await page.waitForTimeout(400);

    // Click the close (✕) button
    await page.locator('#qj-close').click();
    await page.waitForTimeout(300);

    const journalHidden = await page.evaluate(() => {
      const el = document.getElementById('qj-root');
      return !el || el.style.display === 'none';
    });
    expect(journalHidden).toBe(true);
  });

  test('quest log (Q key) still works alongside journal', async ({ page }) => {
    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    await page.keyboard.press('q');
    await page.waitForTimeout(400);
    await SS(page, '04-quest-log-q-key');

    // Any quest-log panel element visible
    const panelExists = await page.evaluate(() =>
      !!document.querySelector('[id*="ql"], [class*="quest-log"], [id*="quest"]')
    );
    expect(panelExists).toBe(true);

    await page.keyboard.press('q');  // close
    await page.waitForTimeout(300);
  });

  test('no errors when opening and closing journal repeatedly', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadPage(page);
    await startGame(page);
    await page.waitForTimeout(600);

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('j');
      await page.waitForTimeout(300);
      await page.keyboard.press('j');
      await page.waitForTimeout(200);
    }
    await SS(page, '05-stress');
    expect(errors, `Errors during journal toggle: ${errors.join(', ')}`).toHaveLength(0);
  });
});
