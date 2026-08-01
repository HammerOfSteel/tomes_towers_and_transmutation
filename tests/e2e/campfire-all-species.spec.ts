/**
 * campfire-all-species.spec.ts
 *
 * Drives all 8 campfire species choices end-to-end in headed mode.
 * Verifies each path:
 *   - completes without "campfire FAILED"
 *   - applies the correct princess blueprint (right species)
 *   - game loop starts and floor 0 is reached
 *
 * Run: npx playwright test tests/e2e/campfire-all-species.spec.ts --reporter=list
 * Run one: npx playwright test tests/e2e/campfire-all-species.spec.ts -g "elf" --reporter=list
 *
 * Screenshots: tests/e2e/screenshots/species-*.png
 */

import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './helpers';

test.use({ actionTimeout: 60_000 });

const SS = (page: Page, name: string) =>
  page.screenshot({ path: `tests/e2e/screenshots/species-${name}.png`, fullPage: false });

// ── Page log capture ──────────────────────────────────────────────────────────

function attachLogs(page: Page) {
  const logs: string[] = [];
  page.on('console', (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    logs.push(line);
    if (m.type() !== 'debug') process.stdout.write(`  PAGE » ${line}\n`);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${e.message}`;
    logs.push(line);
    process.stdout.write(`  PAGE » ${line}\n`);
  });
  return logs;
}

// ── Campfire helpers ──────────────────────────────────────────────────────────

async function startCampfire(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.triggerNewGame(99));
  await page.waitForFunction(() => !!(window as any).__campfire, { timeout: 60_000 });
}

async function waitChoices(page: Page, count: number, label: string): Promise<void> {
  await page.waitForFunction(
    (n) => { const c = (window as any).__campfire; return c && !c.speaking && c.choiceCount >= n; },
    count, { timeout: 30_000 },
  ).catch(() => {
    throw new Error(`Timed out waiting for ${count} choices at "${label}" — campfire may have crashed`);
  });
  await page.waitForTimeout(150);
}

async function choose(page: Page, idx: number): Promise<void> {
  await page.evaluate((i) => (window as any).__campfire?.choose(i), idx);
}

async function waitForGameStart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !(window as any).__campfire && !document.getElementById('plp-root'),
    { timeout: 60_000 },
  );
  await page.waitForFunction(
    () => (window as any).__gameStarted === true,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(800);
}

// ── Species test table ────────────────────────────────────────────────────────

/**
 * idx1      = species choice index (0–7)
 * phase2    = number of choices in phase 2 (2 or 4)
 * p2choice  = which phase-2 option to pick
 * expectDna = species field the applied PrincessDNA should have
 * expectChar= substring the char id should contain
 */
const SPECIES_PATHS = [
  { name: 'human-warrior',    idx1: 0, phase2: 4, p2choice: 0, expectDna: 'human',     expectChar: 'human_warrior'  },
  { name: 'human-paladin',    idx1: 0, phase2: 4, p2choice: 1, expectDna: 'human',     expectChar: 'human_paladin'  },
  { name: 'undead-skeleton',  idx1: 1, phase2: 4, p2choice: 0, expectDna: 'skeleton',  expectChar: 'skeleton_rogue' },  // "Skeleton. The structural minimalist variety."
  { name: 'undead-zombie',    idx1: 1, phase2: 4, p2choice: 1, expectDna: 'skeleton',  expectChar: 'zombie'         },  // "Zombie. But I'm extremely articulate about it."
  { name: 'undead-ghost',     idx1: 1, phase2: 4, p2choice: 2, expectDna: 'skeleton',  expectChar: 'ghost'          },  // "Ghost. I'm technically haunting you right now."
  { name: 'vulperia-rogue',   idx1: 2, phase2: 4, p2choice: 0, expectDna: 'foxling',   expectChar: 'fox_rogue'      },
  { name: 'vulperia-ranger',  idx1: 2, phase2: 4, p2choice: 1, expectDna: 'foxling',   expectChar: 'fox_ranger'     },
  { name: 'slime',            idx1: 3, phase2: 4, p2choice: 0, expectDna: 'slime',     expectChar: 'slime'          },
  { name: 'elf-scholar',      idx1: 4, phase2: 2, p2choice: 0, expectDna: 'elf',       expectChar: 'elf_scholar'    },
  { name: 'elf-wanderer',     idx1: 4, phase2: 2, p2choice: 1, expectDna: 'elf',       expectChar: 'elf_wanderer'   },
  { name: 'celestial-dawn',   idx1: 5, phase2: 2, p2choice: 0, expectDna: 'celestial', expectChar: 'celestial_dawn' },
  { name: 'celestial-dusk',   idx1: 5, phase2: 2, p2choice: 1, expectDna: 'celestial', expectChar: 'celestial_dusk' },
  { name: 'draconic-fire',    idx1: 6, phase2: 2, p2choice: 0, expectDna: 'draconic',  expectChar: 'draconic_fire'  },
  { name: 'draconic-scale',   idx1: 6, phase2: 2, p2choice: 1, expectDna: 'draconic',  expectChar: 'draconic_scale' },
] as const;

// ── Tests ─────────────────────────────────────────────────────────────────────

for (const sp of SPECIES_PATHS) {
  test(`campfire → ${sp.name}: completes + correct blueprint`, async ({ page }) => {
    const logs = attachLogs(page);
    await loadPage(page);
    await startCampfire(page);

    // Phase 1: pick species
    await waitChoices(page, 8, `phase1 for ${sp.name}`);
    await SS(page, `${sp.name}-01-phase1`);
    await choose(page, sp.idx1);

    // Phase 2: pick sub-class / subspecies
    await waitChoices(page, sp.phase2, `phase2 for ${sp.name}`);
    await SS(page, `${sp.name}-02-phase2`);
    await choose(page, sp.p2choice);

    // Phase 3a: Q1 (4 choices — locked chest / obstacle scenario)
    await waitChoices(page, 4, `Q1 for ${sp.name}`);
    await SS(page, `${sp.name}-03-q1`);
    await choose(page, 0);

    // Phase 3b: Q2 (4 choices — gruel / adversity scenario)
    await waitChoices(page, 4, `Q2 for ${sp.name}`);
    await SS(page, `${sp.name}-04-q2`);
    await choose(page, 0);

    // Campfire should complete, game should start
    await waitForGameStart(page);
    await SS(page, `${sp.name}-05-game`);

    // Check for campfire crash in logs
    const crashed = logs.find(l => l.includes('campfire FAILED'));
    if (crashed) throw new Error(`Campfire crashed for ${sp.name}: ${crashed}`);

    // Check correct character was resolved
    const charLog = logs.find(l => l.includes('[startGame]'));
    console.log(`[test] ${sp.name} → ${charLog}`);
    expect(charLog, `startGame log missing for ${sp.name}`).toBeTruthy();
    expect(charLog).toContain(sp.expectChar);

    // Check princess rig was applied with correct species DNA
    const info = await page.evaluate(() => (window as any).__game?.getPrincessInfo?.());
    console.log(`[test] ${sp.name} → princess: ${JSON.stringify(info)}`);
    expect(info, `No princess rig applied for ${sp.name}`).not.toBeNull();
    expect(info?.species, `Wrong species for ${sp.name}: got ${info?.species}`).toBe(sp.expectDna);

    const floor = await page.evaluate(() => (window as any).__game?.getCurrentFloor?.());
    expect(floor).toBe(0);

    console.log(`[test] ✓ ${sp.name} — char=${sp.expectChar} dna.species=${info?.species} floor=${floor}`);
  });
}

// ── Princess path (idx 7) — just verify gallery opens ────────────────────────

test('campfire → princess (idx 7): gallery opens, no crash', async ({ page }) => {
  const logs = attachLogs(page);
  await loadPage(page);
  await startCampfire(page);

  await waitChoices(page, 8, 'phase1-princess');
  await SS(page, 'princess-01-phase1');
  await choose(page, 7);

  // Wizard reacts, then gallery appears after fade
  await page.waitForFunction(
    () => !!(window as any).__campfire?.speaking || !!(window as any).__campfire,
    { timeout: 10_000 },
  ).catch(() => {}); // wizard may finish speaking fast
  await page.waitForTimeout(2000);
  await SS(page, 'princess-02-wizard-reacts');

  await page.waitForFunction(
    () => !!(window as any).__campfire === false || !!document.getElementById('plp-root'),
    { timeout: 20_000 },
  );
  await SS(page, 'princess-03-gallery-or-fade');

  const crashed = logs.find(l => l.includes('campfire FAILED'));
  expect(crashed, `Campfire crashed on princess path: ${crashed}`).toBeUndefined();

  // Either gallery is open or campfire cleanly ended
  const galleryOpen = await page.evaluate(() => !!document.getElementById('plp-root'));
  const campfireGone = await page.evaluate(() => !(window as any).__campfire);
  expect(galleryOpen || campfireGone, 'Neither gallery opened nor campfire ended cleanly').toBe(true);

  console.log(`[test] ✓ princess path — galleryOpen=${galleryOpen} campfireGone=${campfireGone}`);
});
