/**
 * creativehud-dom.test.ts
 *
 * Fast vitest/jsdom tests for CreativeHUD DOM structure.
 * These run in ~100ms — no browser launch, no network.
 * They prove the buttons exist and callbacks fire correctly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── jsdom shim for CreativeHUD ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dom: any;
let savedDoc: Document;
let savedWin: Window & typeof globalThis;

beforeEach(async () => {
  const { JSDOM } = await import('jsdom');
  dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
  savedDoc = global.document;
  savedWin = global.window as Window & typeof globalThis;
  (global as any).document = dom.window.document;
  (global as any).window   = dom.window;
});

afterEach(() => {
  (global as any).document = savedDoc;
  (global as any).window   = savedWin;
});

type HUDCallbacks = import('@/creative/CreativeHUD').CreativeHUDCallbacks;

async function mountHUD(overrides: Partial<HUDCallbacks> = {}) {
  const { CreativeHUD } = await import('@/creative/CreativeHUD');
  const { setCreativeActive } = await import('@/creative/CreativeModeState');
  setCreativeActive(true);
  const defaults: HUDCallbacks = {
    onTeleport: () => {}, onOpenBackrooms: () => {}, onOpenSkinPicker: () => {},
    onPlaceAsset: () => {}, onExit: () => {},
    onCloneSelected: () => {}, onAdjustHeight: () => {}, onResetHeight: () => {},
  };
  const hud = new CreativeHUD({ ...defaults, ...overrides });
  hud.mount();
  return hud;
}

describe('CreativeHUD — quick tools panel', () => {
  it('renders Inventory button', async () => {
    await mountHUD();
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    expect(qt).toBeTruthy();
    expect(qt.textContent).toContain('Inventory');
  });

  it('renders Teleport button', async () => {
    await mountHUD();
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    expect(qt.textContent).toContain('Teleport');
  });

  it('renders Backrooms button', async () => {
    await mountHUD();
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    expect(qt.textContent).toContain('Backrooms');
  });

  it('renders Skin button', async () => {
    await mountHUD();
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    expect(qt.textContent).toContain('Skin');
  });

  it('Backrooms button fires onOpenBackrooms callback', async () => {
    const onOpenBackrooms = vi.fn();
    await mountHUD({ onOpenBackrooms });
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    const btn = [...qt.querySelectorAll<HTMLButtonElement>('.cqt-btn')]
      .find(b => b.textContent?.includes('Backrooms'));
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onOpenBackrooms).toHaveBeenCalledTimes(1);
  });

  it('Skin button fires onOpenSkinPicker callback', async () => {
    const onOpenSkinPicker = vi.fn();
    await mountHUD({ onOpenSkinPicker });
    const qt = dom.window.document.getElementById('creative-quick-tools')!;
    const btn = [...qt.querySelectorAll<HTMLButtonElement>('.cqt-btn')]
      .find(b => b.textContent?.includes('Skin'));
    expect(btn).toBeTruthy();
    btn!.click();
    expect(onOpenSkinPicker).toHaveBeenCalledTimes(1);
  });
});

describe('CreativeHUD — status bar', () => {
  it('renders the CREATIVE badge', async () => {
    await mountHUD();
    const badge = dom.window.document.querySelector('.creative-tag');
    expect(badge?.textContent).toContain('CREATIVE');
  });

  it('renders tool indicator badge', async () => {
    await mountHUD();
    const toolEl = dom.window.document.getElementById('csb-tool');
    expect(toolEl).toBeTruthy();
    // Now shows held asset or browse prompt — not a tool name
    expect(toolEl!.textContent).toBeTruthy();
  });

  it('tool badge shows held asset name when hotbar has an asset', async () => {
    const { setHotbarSlot, setActiveHotbarSlot } = await import('@/creative/CreativeModeState');
    setActiveHotbarSlot(0);
    setHotbarSlot(0, '/assets/castle/wall.glb');
    const hud = await mountHUD();
    hud.refresh();
    const toolEl = dom.window.document.getElementById('csb-tool');
    expect(toolEl!.textContent).toContain('wall');
  });

  it('tool badge shows browse prompt when hotbar slot is empty', async () => {
    const { setHotbarSlot, setActiveHotbarSlot } = await import('@/creative/CreativeModeState');
    setActiveHotbarSlot(0);
    setHotbarSlot(0, null);
    const hud = await mountHUD();
    hud.refresh();
    const toolEl = dom.window.document.getElementById('csb-tool');
    expect(toolEl!.textContent).toContain('Browse');
  });

  it('speed badge cycles on click', async () => {
    await mountHUD();
    const speedEl = dom.window.document.getElementById('csb-speed')!;
    const before = speedEl.textContent;
    speedEl.click();
    const after = speedEl.textContent;
    expect(before).not.toBe(after);
  });

  it('noclip badge toggles on click', async () => {
    await mountHUD();
    const noclipEl = dom.window.document.getElementById('csb-noclip')!;
    const before = noclipEl.textContent;
    noclipEl.click();
    const after = noclipEl.textContent;
    expect(before).not.toBe(after);
  });
});

describe('CreativeHUD — hotbar', () => {
  it('renders 8 hotbar slots', async () => {
    await mountHUD();
    const slots = dom.window.document.querySelectorAll('.chb-slot');
    expect(slots.length).toBe(8);
  });

  it('slot 1 is active by default', async () => {
    await mountHUD();
    const slots = dom.window.document.querySelectorAll('.chb-slot');
    expect(slots[0]?.classList.contains('active')).toBe(true);
  });
});
