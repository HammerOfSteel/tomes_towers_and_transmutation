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

  it('preselects type/faction/layout dropdowns from initialType/initialFaction/initialLayout options', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 5,
      settlementTypes: ['village', 'town', 'city'],
      factions: [REAL_FACTIONS[0], REAL_FACTIONS[1], REAL_FACTIONS[2]],
      layouts: ['auto', 'grid', 'radial'],
      initialType: 'city',
      initialFaction: REAL_FACTIONS[2],
      initialLayout: 'radial',
      onRegenerate,
    });
    document.body.appendChild(panel.rootEl);

    const typeSelect = panel.rootEl.querySelector('[data-role="type-select"]') as HTMLSelectElement;
    const factionSelect = panel.rootEl.querySelector('[data-role="faction-select"]') as HTMLSelectElement;
    const layoutSelect = panel.rootEl.querySelector('[data-role="layout-select"]') as HTMLSelectElement;

    expect(typeSelect.value).toBe('city');
    expect(factionSelect.value).toBe(REAL_FACTIONS[2]);
    expect(layoutSelect.value).toBe('radial');

    // Clicking regenerate right away (no manual selection) must reflect the
    // preselected values, not the first-option defaults.
    const button = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;
    button.click();
    expect(onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 5, type: 'city', faction: REAL_FACTIONS[2], layout: 'radial' }),
    );

    panel.dispose();
  });

  it('falls back to the first option when initialType/initialFaction/initialLayout is not in the provided list', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village', 'town'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      initialType: 'not-a-real-type',
      onRegenerate: vi.fn(),
    });
    document.body.appendChild(panel.rootEl);

    const typeSelect = panel.rootEl.querySelector('[data-role="type-select"]') as HTMLSelectElement;
    expect(typeSelect.value).toBe('village'); // first option, unaffected by the invalid override

    panel.dispose();
  });

  it('kind-select defaults to the "all" sentinel when buildingKinds is omitted', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      onRegenerate: vi.fn(),
    });

    const kindSelect = panel.rootEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(Array.from(kindSelect.options).map((o) => o.value)).toEqual(['all']);
    expect(kindSelect.value).toBe('all');

    panel.dispose();
  });

  it('kind-select offers the "all" sentinel plus every provided buildingKinds option', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      buildingKinds: ['house', 'tower', 'watchtower'],
      onRegenerate: vi.fn(),
    });

    const kindSelect = panel.rootEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(Array.from(kindSelect.options).map((o) => o.value)).toEqual(['all', 'house', 'tower', 'watchtower']);

    panel.dispose();
  });

  it('preselects kind-select from initialKindOverride when present in buildingKinds', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      buildingKinds: ['house', 'tower', 'watchtower'],
      initialKindOverride: 'watchtower',
      onRegenerate,
    });

    const kindSelect = panel.rootEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(kindSelect.value).toBe('watchtower');

    const button = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;
    button.click();
    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ kindOverride: 'watchtower' }));

    panel.dispose();
  });

  it('falls back to the "all" sentinel when initialKindOverride is not in buildingKinds', () => {
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      buildingKinds: ['house', 'tower'],
      initialKindOverride: 'not-a-real-kind',
      onRegenerate: vi.fn(),
    });

    const kindSelect = panel.rootEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(kindSelect.value).toBe('all');

    panel.dispose();
  });

  it('calls onRegenerate with kindOverride reflecting the selected dropdown value', () => {
    const onRegenerate = vi.fn();
    const panel = new SettlementLabPanel({
      initialSeed: 1,
      settlementTypes: ['village'],
      factions: [REAL_FACTIONS[0]],
      layouts: ['auto'],
      buildingKinds: ['house', 'tower'],
      onRegenerate,
    });
    document.body.appendChild(panel.rootEl);

    const kindSelect = panel.rootEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    kindSelect.value = 'tower';
    const button = panel.rootEl.querySelector('button[data-action="regenerate"]') as HTMLButtonElement;
    button.click();

    expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ kindOverride: 'tower' }));

    panel.dispose();
  });
});
