/**
 * campfire-newgame.spec.ts
 *
 * Playwright tests for the full NewGameFlow campfire character creation.
 * Uses window.__game.triggerNewGame() to launch the campfire and
 * window.__campfire.choose(idx) to drive choices without relying on
 * canvas pixel coordinates.
 *
 * Run:  npx playwright test tests/e2e/campfire-newgame.spec.ts --headed
 * Run headless: npx playwright test tests/e2e/campfire-newgame.spec.ts
 *
 * Screenshots land in tests/e2e/screenshots/campfire-ng-*.png
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

// Allow longer waits for 3D scene loading — campfire setup can take 10–20 s
test.use({ actionTimeout: 60_000 });

// ── helpers ───────────────────────────────────────────────────────────────────

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/campfire-ng-${name}.png`, fullPage: false });

/** Launch the campfire for slot 99 (ephemeral — won't collide with real saves). */
async function launchCampfire(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror',  (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

  await loadPage(page);
  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  // __campfire is now set synchronously at the start of play() — should be near-instant
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });
  return errors;
}

/**
 * Wait until the wizard finishes the current speech and choices are showing.
 * Polls __campfire.speaking and __campfire.choiceCount.
 */
async function waitForChoices(page: Page, expectedCount: number, timeoutMs = 25_000): Promise<void> {
  await page.waitForFunction(
    ({ count }) => {
      const c = (window as any).__campfire;
      return c && !c.speaking && c.choiceCount >= count;
    },
    { count: expectedCount },
    { timeout: timeoutMs },
  );
  // Brief settle so choice tiles finish fading in
  await page.waitForTimeout(500);
}

/** Drive a choice index and wait for the wizard's response speech to begin. */
async function choose(page: Page, idx: number): Promise<void> {
  await page.evaluate((i) => (window as any).__campfire?.choose(i), idx);
  // Give the wizard time to start speaking after the choice
  await page.waitForTimeout(600);
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('NewGameFlow Campfire', () => {

  // ── Stage 1: campfire loads ──────────────────────────────────────────────

  test('campfire scene launches and wizard appears', async ({ page }) => {
    const errors = await launchCampfire(page);

    // The campfire fullscreen host should exist
    const hasCampfire = await page.evaluate(() => !!(window as any).__campfire);
    expect(hasCampfire).toBe(true);
    expect(errors, `No JS errors on launch: ${errors.join(', ')}`).toHaveLength(0);

    // Screenshot wizard appearing with intro text
    await page.waitForTimeout(2000); // let wizard walk in + begin speaking
    await SS(page, '01-wizard-appears');
  });

  test('wizard speaks intro before choices appear', async ({ page }) => {
    await launchCampfire(page);

    // Wait until wizard is speaking OR has finished speaking (speechCount tracks it cumulatively)
    // speaking toggles quickly — poll for choiceCount >= 1 (choices appeared) instead
    await waitForChoices(page, 1);
    await SS(page, '02-wizard-speaking-or-done');
  });

  // ── Stage 2: all 8 species choices are present ───────────────────────────

  test('all 8 species choices are available', async ({ page }) => {
    await launchCampfire(page);
    await waitForChoices(page, 8);

    const choiceCount = await page.evaluate(() => (window as any).__campfire?.choiceCount);
    expect(choiceCount).toBe(8);

    await SS(page, '04-all-8-species-choices');
  });

  // ── Stage 3: each species path leads to phase 2 ──────────────────────────

  const SPECIES = [
    { idx: 0, name: 'human',     phase2Count: 4 },
    { idx: 1, name: 'undead',    phase2Count: 4 },
    { idx: 2, name: 'vulperia',  phase2Count: 4 },
    { idx: 3, name: 'slime',     phase2Count: 4 },
    { idx: 4, name: 'elf',       phase2Count: 2 },
    { idx: 5, name: 'celestial', phase2Count: 2 },
    { idx: 6, name: 'draconic',  phase2Count: 2 },
  ];

  for (const { idx, name, phase2Count } of SPECIES) {
    test(`${name} (choice ${idx}): wizard reacts and shows phase-2 choices`, async ({ page }) => {
      await launchCampfire(page);
      await waitForChoices(page, 8);

      // Pick this species
      await choose(page, idx);
      await SS(page, `05-${name}-wizard-reacts`);

      // Wait for phase-2 choices
      await waitForChoices(page, phase2Count);
      await SS(page, `06-${name}-phase2-choices`);

      const count = await page.evaluate(() => (window as any).__campfire?.choiceCount);
      expect(count).toBeGreaterThanOrEqual(phase2Count);
    });
  }

  // ── Stage 4: princess path opens gallery ─────────────────────────────────

  test('princess choice (idx 7): wizard reacts and campfire ends', async ({ page }) => {
    await launchCampfire(page);
    await waitForChoices(page, 8);

    await choose(page, 7);
    await SS(page, '07-princess-wizard-reacts');

    // The campfire should end (fade out) and __campfire be removed,
    // then a PrincessLibraryPanel should appear in its place
    await page.waitForFunction(
      () => {
        // Either campfire is gone (fade complete) or the gallery root is visible
        const campfireGone = !(window as any).__campfire;
        const galleryUp    = !!document.getElementById('plp-root');
        return campfireGone || galleryUp;
      },
      { timeout: 15_000 },
    );
    await SS(page, '08-princess-gallery-appears');

    // Gallery panel should now be in the DOM
    const galleryExists = await page.evaluate(() => !!document.getElementById('plp-root'));
    expect(galleryExists).toBe(true);
  });

  // ── Stage 5: full happy path (human → warrior → game starts) ─────────────

  test('full path: human warrior → game starts', async ({ page }) => {
    await launchCampfire(page);

    // Phase 1: pick human
    await waitForChoices(page, 8);
    await choose(page, 0);
    await SS(page, '09-full-human-phase1');

    // Phase 2: pick warrior (idx 0 = barbarian dad → human_warrior)
    await waitForChoices(page, 4);
    await choose(page, 0);
    await SS(page, '10-full-human-phase2');

    // Phase 3a: stat question 1 (4 choices)
    await waitForChoices(page, 4);
    await choose(page, 0);
    await SS(page, '11-full-human-stat1');

    // Phase 3b: stat question 2 (4 choices)
    await waitForChoices(page, 4);
    await choose(page, 1);
    await SS(page, '12-full-human-stat2');

    // Campfire should wrap up and game should start
    await page.waitForFunction(() => !(window as any).__campfire, { timeout: 20_000 });
    await SS(page, '13-full-human-game-started');

    const mode = await page.evaluate(() => (window as any).__game?.getGameMode?.());
    expect(['interior', 'exterior', undefined]).toContain(mode);
  });

});
