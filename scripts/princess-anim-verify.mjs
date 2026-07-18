#!/usr/bin/env node
// Animation QA: drives clips via the dev handle, screenshots key poses,
// and sanity-checks the export payload in-page.
// Usage: npx vite --port 5199 &  then  node scripts/princess-anim-verify.mjs [outDir]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? '/tmp';
const base = process.env.PC_URL ?? 'http://localhost:5199/princess-creator.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', String(e).slice(0, 400)));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const setSpecies = async (id) => {
  await page.evaluate((s) => {
    document.querySelector(`.arch-card[data-species="${s}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, id);
  await page.waitForTimeout(1400);
};
const anim = (fn, arg) => page.evaluate(([f, a]) => window.__atelier.animator[f](a), [fn, arg]);
// Rebind with slow-mo tweaks so screenshots land mid-pose despite capture latency.
const slowBind = (tweaks) => page.evaluate((tw) => {
  const a = window.__atelier;
  a.animator.bind(a.result, a.store.dna, tw);
}, tweaks);
const shot = async (name) => {
  await page.screenshot({ path: `${out}/anim_${name}.png` });
  console.log('shot', name);
};

// ── Panel sanity ──
const panel = await page.evaluate(() => ({
  states: document.querySelectorAll('#anim-states .chip').length,
  actions: document.querySelectorAll('#anim-actions .emote-btn').length,
  options: document.querySelectorAll('.anim-select option').length,
  groups: [...document.querySelectorAll('.anim-group-label')].map((g) => g.textContent),
}));
console.log('panel:', JSON.stringify(panel));

// ── Export sanity ──
const exp = await page.evaluate(() => {
  const data = window.__atelier.buildAnimationExport();
  return {
    format: data.format,
    v: data.v,
    speciesCount: Object.keys(data.species).length,
    clipCount: Object.keys(data.species.human.clips).length,
    lamiaWalk: data.species.lamia.clips.walk.label,
    bytes: JSON.stringify(data).length,
  };
});
console.log('export:', JSON.stringify(exp));

// ── Pose screenshots ──
await setSpecies('human');
// Headless compositing lags the rig under rAF throttling, so mid-clip poses
// need a freeze: slow the clip 10×, ride rAF to the target phase, no-op the
// animator so the pose holds, let the compositor catch up, then shoot.
const playFrozen = async (clipId, phase, name) => {
  await slowBind({ [clipId]: { speed: 0.1 } });
  await page.evaluate(([id, u]) => new Promise((resolve) => {
    const a = window.__atelier;
    const target = a.animator.clips[id].duration * u;
    const t0 = performance.now();
    a.animator.play(id);
    const tick = () => {
      if ((performance.now() - t0) / 1000 >= target) {
        a.animator.update = () => {};
        resolve();
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [clipId, phase]);
  await page.waitForTimeout(900);
  await shot(name);
  await page.evaluate(() => { delete window.__atelier.animator.update; });
  await slowBind({});
};

await playFrozen('attack_1', 0.5, 'human_attack1_mid');

await anim('play', 'die_1');
await page.waitForTimeout(2400);
await shot('human_die1_held');

await anim('setState', 'block_1');
await page.waitForTimeout(700);
await shot('human_block1');

await anim('setState', 'run');
await page.waitForTimeout(450);
await shot('human_run');

await setSpecies('lamia');
await anim('setState', 'walk');
await page.waitForTimeout(800);
await shot('lamia_slither');

await setSpecies('slime');
await anim('play', 'die_1');
await page.waitForTimeout(2400);
await shot('slime_melt_held');

await setSpecies('skeleton');
await anim('play', 'die_2');
await page.waitForTimeout(2000);
await shot('skeleton_collapse_held');

await setSpecies('fae');
await playFrozen('cast_spell_2', 0.55, 'fae_cast2_mid');

// Panel close-up on the last species
await page.screenshot({ path: `${out}/anim_panel.png`, clip: { x: 1330, y: 480, width: 270, height: 470 } });
console.log('shot panel');

await browser.close();
