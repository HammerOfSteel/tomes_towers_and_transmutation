import { afterEach, describe, expect, it, vi } from 'vitest';
import { FACTION_PRESETS } from '@/world/buildings/BuildingDNA';
import { SettlementLabPanel } from '../../src/ui/SettlementLabPanel';

const REAL_FACTIONS = Object.keys(FACTION_PRESETS);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SettlementLabPanel', () => {
  it('calls onRegenerate with current seed/type/faction/layout when the regenerate button is clicked', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 123,
      settlementTypes: ['village', 'town'],
      factions: [REAL_FACTIONS[0], REAL_FACTIONS[1]],
      layouts: ['auto', 'grid'],
      onRegenerate,
    });
    document.body.appendChild(panel.rootEl);

    const button = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;
    button.click();

    expect(onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 123, type: 'village', faction: REAL_FACTIONS[0], layout: 'auto' }),
    );

    panel.dispose();
  });

  it('setReadout updates the visible readout text', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });

    panel.setReadout('5 buildings, 20 road tiles, 2 lamps');

    const readoutEl = panel.rootEl.querySelector('[data-role="readout"]') as HTMLElement;
    expect(readoutEl.textContent).toContain('5 buildings');

    panel.dispose();
  });

  it('dispose removes rootEl from the DOM', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });

    document.body.appendChild(panel.rootEl);
    panel.dispose();

    expect(document.body.contains(panel.rootEl)).toBe(false);
  });

  it('populates dropdown options from settlementTypes, factions, and layouts', () => {
    const settlementTypes = ['hamlet', 'city'];
    const factions = [REAL_FACTIONS[2], REAL_FACTIONS[3], REAL_FACTIONS[4]];
    const layouts = ['radial', 'organic', 'grid'];
    const panel = new SettlementLabPanel({
      initialSeed: 42,
      settlementTypes,
      factions,
      layouts,
      onRegenerate: vi.fn(),
    });

    const typeSelect = panel.rootEl.querySelector('[data-role="type-select"]') as HTMLSelectElement;
    const factionSelect = panel.rootEl.querySelector('[data-role="faction-select"]') as HTMLSelectElement;
    const layoutSelect = panel.rootEl.querySelector('[data-role="layout-select"]') as HTMLSelectElement;

    expect(Array.from(typeSelect.options).map((o) => o.value)).toEqual(settlementTypes);
    expect(Array.from(factionSelect.options).map((o) => o.value)).toEqual(factions);
    expect(Array.from(layoutSelect.options).map((o) => o.value)).toEqual(layouts);
  });

  it('randomize seed button changes the seed input value', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const panel = new SettlementLabPanel({
      initialSeed: 999,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });

    const seedInput = panel.rootEl.querySelector('[data-role="seed-input"]') as HTMLInputElement;
    const randomizeButton = panel.rootEl.querySelector('button[data-action="randomize"]') as HTMLButtonElement;

    randomizeButton.click();

    expect(seedInput.value).toBe(String(Math.floor(0.123456 * 1_000_000)));
    randomSpy.mockRestore();
  });

  it('falls back to the initial seed instead of 0 when the seed input is cleared', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 42,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate,
    });

    const seedInput = panel.rootEl.querySelector('[data-role="seed-input"]') as HTMLInputElement;
    seedInput.value = '';
    const regenerateButton = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;

    regenerateButton.click();

    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ seed: 42 }));
  });

  it('dispose does not throw when root element was never attached to the DOM', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 7,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });

    expect(() => panel.dispose()).not.toThrow();
  });
});
