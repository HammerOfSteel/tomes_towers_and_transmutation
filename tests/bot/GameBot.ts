/**
 * GameBot.ts — core bot class wrapping a Playwright Page.
 *
 * Usage:
 *   const bot = new GameBot({ headed: true, slowMo: 400, port: 5174 });
 *   await bot.launch();
 *   await bot.enableDevMode();
 *   await bot.startNewGame();
 *   await bot.screenshot('game-started');
 *   await bot.close();
 */

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

export interface BotConfig {
  headed?:   boolean;   // show browser window (default true)
  slowMo?:   number;    // ms between actions (default 200, 0 for CI)
  port?:     number;    // game dev-server port (default 5174)
  record?:   boolean;   // save video of the run
}

export interface GameBotStep {
  name:    string;
  status:  'pass' | 'fail' | 'skip';
  error?:  string;
  screenshot?: string;
  durationMs:  number;
}

export class GameBot {
  private _browser:  Browser | null  = null;
  private _ctx:      BrowserContext | null = null;
  page:              Page | null     = null;
  private _steps:    GameBotStep[]   = [];
  private _ssDir:    string;

  constructor(private cfg: BotConfig = {}) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this._ssDir = path.join('tests', 'bot', 'screenshots', ts);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    fs.mkdirSync(this._ssDir, { recursive: true });
    this._browser = await chromium.launch({
      headless: !(this.cfg.headed ?? true),
      slowMo:   this.cfg.slowMo ?? 200,
      args: ['--no-sandbox'],
    });
    const ctxOpts: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1280, height: 720 },
    };
    if (this.cfg.record) {
      ctxOpts.recordVideo = {
        dir:  path.join('tests', 'bot', 'videos'),
        size: { width: 1280, height: 720 },
      };
    }
    this._ctx  = await this._browser.newContext(ctxOpts);
    this.page  = await this._ctx.newPage();
  }

  async close(): Promise<void> {
    if (this.cfg.record) await this._ctx?.close();   // flushes video
    await this._browser?.close();
    this._browser = null;
    this._ctx     = null;
    this.page     = null;
  }

  // ── Step runner ───────────────────────────────────────────────────────────

  /**
   * Run a named step with automatic screenshot on pass and error capture on fail.
   * Returns true if the step passed.
   */
  async step(name: string, fn: () => Promise<void>): Promise<boolean> {
    const start = Date.now();
    try {
      await fn();
      const ss = await this.screenshot(name.replace(/\s+/g, '-').toLowerCase());
      this._steps.push({ name, status: 'pass', screenshot: ss, durationMs: Date.now() - start });
      console.log(`  ✓  ${name}`);
      return true;
    } catch (err) {
      const ss = await this.screenshot(`FAIL-${name.replace(/\s+/g, '-').toLowerCase()}`).catch(() => undefined);
      this._steps.push({ name, status: 'fail', error: String(err), screenshot: ss, durationMs: Date.now() - start });
      console.error(`  ✗  ${name}: ${err}`);
      return false;
    }
  }

  /** Print a summary and return exit code (0=all pass, 1=any fail). */
  summary(): number {
    const pass = this._steps.filter(s => s.status === 'pass').length;
    const fail = this._steps.filter(s => s.status === 'fail').length;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${pass} passed  ${fail} failed  (${this._steps.length} total)`);
    if (fail > 0) {
      console.log('\nFailed steps:');
      this._steps.filter(s => s.status === 'fail').forEach(s => {
        console.log(`  ✗ ${s.name}: ${s.error}`);
      });
    }
    return fail > 0 ? 1 : 0;
  }

  get steps(): GameBotStep[] { return [...this._steps]; }

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Open the game and wait until `window.__game` is available. */
  async waitForGame(): Promise<void> {
    const port = this.cfg.port ?? 5174;
    await this.page!.goto(`http://localhost:${port}/`);
    await this.page!.locator('#game-canvas, canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
    await this.page!.waitForFunction(() => !!(window as any).__game, { timeout: 30_000 });
    console.log('  → game ready');
  }

  /** Enable dev mode (sets localStorage flag and reloads). */
  async enableDevMode(): Promise<void> {
    await this.page!.evaluate(() => {
      localStorage.setItem('ttt_dev_mode', 'true');
    });
    await this.page!.reload();
    await this.page!.waitForFunction(() => !!(window as any).__game, { timeout: 30_000 });
  }

  /**
   * Start a new game with a deterministic seed.
   * Bypasses character creation for speed; use startWithCharCreation() for full flow.
   */
  async startNewGame(seed = 0xDEAD_BEEF): Promise<void> {
    await this.page!.evaluate((s) => (window as any).__game.startGame(s), seed);
    // Wait for HUD root to appear (means game loop is running)
    await this.page!.locator('#hud-root, .hud-root, [id*="hud"]').first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => {});  // non-fatal — some builds have no hud-root
    await this.page!.waitForTimeout(800);
  }

  // ── Creative mode ─────────────────────────────────────────────────────────

  /** Enter creative mode via the __game API. */
  async enterCreative(): Promise<void> {
    await this.page!.evaluate(() => (window as any).__game.enterCreativeMode());
    await this.page!.locator('#creative-hud-root').waitFor({ state: 'attached', timeout: 8_000 });
  }

  /** Exit creative mode. */
  async exitCreative(): Promise<void> {
    await this.page!.evaluate(() => (window as any).__game.exitCreativeMode());
    await this.page!.locator('#creative-hud-root').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
  }

  /** Press C to toggle the creative inventory. */
  async toggleInventory(): Promise<void> {
    await this.page!.keyboard.press('c');
  }

  /** Open inventory and wait for it to appear. */
  async openInventory(): Promise<void> {
    await this.page!.keyboard.press('c');
    await this.page!.locator('#cab-root').waitFor({ state: 'visible', timeout: 5_000 });
  }

  /** Close inventory. */
  async closeInventory(): Promise<void> {
    await this.page!.keyboard.press('c');
    await this.page!.locator('#cab-root').waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  // ── Gameplay ──────────────────────────────────────────────────────────────

  /** Teleport player to a world-space position. */
  async teleport(x: number, y: number, z: number): Promise<void> {
    await this.page!.evaluate(([px, py, pz]) => (window as any).__game.teleportPlayer(px, py, pz), [x, y, z]);
    await this.page!.waitForTimeout(200);
  }

  /** Teleport to a room by ID. */
  async teleportToRoom(roomId: string): Promise<void> {
    await this.page!.evaluate((id) => (window as any).__game.onTeleportRoom?.(id), roomId);
    await this.page!.waitForTimeout(400);
  }

  /** Hold a key for a duration (movement). */
  async holdKey(key: string, ms: number): Promise<void> {
    await this.page!.keyboard.down(key);
    await this.page!.waitForTimeout(ms);
    await this.page!.keyboard.up(key);
  }

  /** Press Escape to open/close the pause menu. */
  async pressEscape(): Promise<void> {
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForTimeout(300);
  }

  // ── Screenshot ────────────────────────────────────────────────────────────

  /** Take a screenshot and return the file path. */
  async screenshot(name: string): Promise<string> {
    const filePath = path.join(this._ssDir, `${name}.png`);
    await this.page!.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  async assertVisible(selector: string, timeout = 5000): Promise<void> {
    await this.page!.locator(selector).waitFor({ state: 'visible', timeout });
  }

  async assertText(selector: string, text: string): Promise<void> {
    const actual = await this.page!.locator(selector).first().textContent();
    if (!actual?.includes(text)) throw new Error(`Expected "${text}" in "${actual}"`);
  }

  async assertCount(selector: string, min: number): Promise<void> {
    const n = await this.page!.locator(selector).count();
    if (n < min) throw new Error(`Expected ≥${min} "${selector}", got ${n}`);
  }

  async evaluate<T>(fn: (w: Window & { __game: any }) => T): Promise<T> {
    return this.page!.evaluate(fn as any);
  }

  // ── Natural language instruction interface (B9) ───────────────────────────

  /**
   * Parse and execute a natural-language instruction.
   *
   * Phase 1 vocabulary (pattern-matched):
   *   "go to floor <n>"          → teleport to tower floor n
   *   "go to <room-id>"          → onTeleportRoom(id)
   *   "go to overworld"          → switchToExterior
   *   "place <asset> [at <x> <z>]" → open inventory, pick asset, place
   *   "enter creative"           → enterCreativeMode
   *   "exit creative"            → exitCreativeMode
   *   "find <npc-name>"          → PathfindingActions.findNPC
   *   "open inventory"           → press C
   *   "close inventory"          → press C
   *   "save"                     → Ctrl+S
   *   "screenshot [<label>]"     → take screenshot
   *
   * @returns description of what was executed
   */
  async instruct(text: string): Promise<string> {
    const t = text.trim().toLowerCase();
    const p = this.page!;

    // go to floor <n>
    const floorMatch = t.match(/^go\s+to\s+floor\s+(-?\d+)/);
    if (floorMatch) {
      const n = parseInt(floorMatch[1]!, 10);
      const roomId = n < 0 ? `tower_floor_b${Math.abs(n)}_chamber` : `tower_floor_${n}_chamber`;
      await p.evaluate((id: string) => (window as any).__game.onTeleportRoom?.(id), roomId);
      await p.waitForTimeout(600);
      return `teleported to floor ${n}`;
    }

    // go to overworld / exterior
    if (/go\s+to\s+(overworld|exterior)/.test(t)) {
      await p.evaluate(function() { (window as any).__game.switchToExterior?.(); });
      await p.waitForTimeout(1_000);
      return 'switched to overworld';
    }

    // go to <room-id>
    const roomMatch = t.match(/^go\s+to\s+([\w_-]+)/);
    if (roomMatch) {
      await p.evaluate((id: string) => (window as any).__game.onTeleportRoom?.(id), roomMatch[1]);
      await p.waitForTimeout(600);
      return `teleported to room: ${roomMatch[1]}`;
    }

    // enter creative
    if (/enter\s+creative/.test(t)) {
      await p.evaluate(function() { (window as any).__game.enterCreativeMode(); });
      await p.locator('#creative-hud-root').waitFor({ state: 'attached', timeout: 8_000 });
      return 'entered creative mode';
    }

    // exit creative
    if (/exit\s+creative/.test(t)) {
      await p.evaluate(function() { (window as any).__game.exitCreativeMode(); });
      await p.locator('#creative-hud-root').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
      return 'exited creative mode';
    }

    // open inventory
    if (/open\s+inventory/.test(t)) {
      await p.keyboard.press('c');
      await p.locator('#cab-root').waitFor({ state: 'visible', timeout: 5_000 });
      return 'opened inventory';
    }

    // close inventory
    if (/close\s+inventory/.test(t)) {
      await p.keyboard.press('c');
      return 'closed inventory';
    }

    // save
    if (/^save$/.test(t)) {
      await p.keyboard.press('Control+s');
      await p.waitForTimeout(600);
      return 'saved';
    }

    // screenshot [<label>]
    const ssMatch = t.match(/^screenshot(?:\s+(.+))?/);
    if (ssMatch) {
      const label = ssMatch[1]?.replace(/\s+/g, '-') ?? 'instruct';
      const fp = await this.screenshot(label);
      return `screenshot saved: ${fp}`;
    }

    // place <asset> [at <x> <z>]
    const placeMatch = t.match(/^place\s+(\S+)(?:\s+at\s+(-?[\d.]+)\s+(-?[\d.]+))?/);
    if (placeMatch) {
      const assetName  = placeMatch[1]!;
      const x = placeMatch[2] ? parseFloat(placeMatch[2]) : undefined;
      const z = placeMatch[3] ? parseFloat(placeMatch[3]) : undefined;

      if (x !== undefined && z !== undefined) {
        const pos = await p.evaluate(function() {
          return (window as any).__game.getPlayerPos?.() ?? { x:0, y:0, z:0 };
        }) as { x: number; y: number; z: number };
        await p.evaluate(
          ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px, py, pz),
          [x, pos.y, z]
        );
        await p.waitForTimeout(200);
      }

      // Open inventory, pick asset, close, place
      await p.keyboard.press('c');
      await p.locator('#cab-root').waitFor({ state: 'visible', timeout: 5_000 });
      // Try to find a matching card
      const card = p.locator('.cab-card').filter({ hasText: new RegExp(assetName, 'i') }).first();
      const cardVisible = await card.isVisible().catch(() => false);
      if (cardVisible) await card.click();
      await p.keyboard.press('c');
      await p.waitForTimeout(300);
      // Place
      const canvas = p.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
      }
      await p.waitForTimeout(400);
      return `placed ${assetName}${x !== undefined ? ` at (${x}, ${z})` : ''}`;
    }

    // find <name> (NPC / object)
    const findMatch = t.match(/^find\s+(.+)/);
    if (findMatch) {
      const name = findMatch[1]!.trim();
      const pos: { x: number; y: number; z: number } | null = await p.evaluate((n: string) => {
        const g = (window as any).__game;
        return g?.findNPC?.(n) ?? g?.findNearestObject?.(n) ?? null;
      }, name);
      if (pos) {
        await p.evaluate(
          ([px, py, pz]: number[]) => (window as any).__game.teleportPlayer?.(px-1, py, pz-1),
          [pos.x, pos.y, pos.z]
        );
        await p.waitForTimeout(400);
        return `moved near ${name}`;
      }
      return `could not find "${name}" via __game API`;
    }

    return `[instruct] unrecognised instruction: "${text}"`;
  }
}
