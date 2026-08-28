export interface SettlementLabPanelOptions {
  initialSeed: number;
  settlementTypes: string[];
  factions: string[];
  layouts: string[];
  onRegenerate: (params: { seed: number; type: string; faction: string; layout: string }) => void;
}

export class SettlementLabPanel {
  readonly rootEl: HTMLElement;

  private readonly seedInput: HTMLInputElement;
  private readonly typeSelect: HTMLSelectElement;
  private readonly factionSelect: HTMLSelectElement;
  private readonly layoutSelect: HTMLSelectElement;
  private readonly readoutEl: HTMLElement;
  private readonly randomizeButton: HTMLButtonElement;
  private readonly regenerateButton: HTMLButtonElement;
  private readonly randomizeClickHandler: () => void;
  private readonly regenerateClickHandler: () => void;

  constructor(options: SettlementLabPanelOptions) {
    this.rootEl = document.createElement('div');
    this.rootEl.className = 'settlement-lab-panel';

    this.seedInput = document.createElement('input');
    this.seedInput.type = 'number';
    this.seedInput.value = String(options.initialSeed);
    this.seedInput.setAttribute('data-role', 'seed-input');

    this.randomizeButton = document.createElement('button');
    this.randomizeButton.textContent = 'Randomize Seed';
    this.randomizeButton.setAttribute('data-action', 'randomize');

    this.typeSelect = this.createSelect('type-select', options.settlementTypes);
    this.factionSelect = this.createSelect('faction-select', options.factions);
    this.layoutSelect = this.createSelect('layout-select', options.layouts);

    this.regenerateButton = document.createElement('button');
    this.regenerateButton.textContent = 'Regenerate';
    this.regenerateButton.setAttribute('data-action', 'regenerate');

    this.readoutEl = document.createElement('div');
    this.readoutEl.setAttribute('data-role', 'readout');

    this.randomizeClickHandler = () => {
      this.seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    };

    this.regenerateClickHandler = () => {
      options.onRegenerate({
        seed: Number(this.seedInput.value),
        type: this.typeSelect.value,
        faction: this.factionSelect.value,
        layout: this.layoutSelect.value,
      });
    };

    this.randomizeButton.addEventListener('click', this.randomizeClickHandler);
    this.regenerateButton.addEventListener('click', this.regenerateClickHandler);

    this.rootEl.append(
      this.seedInput,
      this.randomizeButton,
      this.typeSelect,
      this.factionSelect,
      this.layoutSelect,
      this.regenerateButton,
      this.readoutEl,
    );
  }

  setReadout(text: string): void {
    this.readoutEl.textContent = text;
  }

  dispose(): void {
    this.randomizeButton.removeEventListener('click', this.randomizeClickHandler);
    this.regenerateButton.removeEventListener('click', this.regenerateClickHandler);
    this.rootEl.remove();
  }

  private createSelect(role: string, values: string[]): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('data-role', role);

    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    }

    return select;
  }
}
