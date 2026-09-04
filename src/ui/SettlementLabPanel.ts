// ── CSS ───────────────────────────────────────────────────────────────────────
// SettlementLabPanel previously had NO styling at all — it rendered as a
// plain in-flow <div> appended after the fullscreen #game-canvas (which is
// `width:100vw;height:100vh` with `body{overflow:hidden}` — see index.html),
// so it was pushed completely below the fold and invisible, even though its
// controls existed in the DOM (a real, pre-existing bug: a user testing via
// the actual "Play in 3D" button saw no panel at all, only the normal game
// HUD/DevSandbox). Every other real dev/HUD panel in this codebase
// (DevSandbox.ts's `.ds-panel`, HUD.ts's stat blocks) uses `position: fixed`
// with an injected <style> singleton — this mirrors that exact convention.
const SL_CSS = `
.settlement-lab-panel {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 7600;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  max-width: calc(100vw - 32px);
  padding: 8px 12px;
  background: rgba(6,4,14,.94); backdrop-filter: blur(8px);
  border: 1px solid #2a1e4a; border-radius: 6px;
  font-family: 'Crimson Text','Georgia',serif; font-size: .8rem;
  color: #d4c0f0;
  box-shadow: 0 12px 48px rgba(0,0,0,.8);
}
.settlement-lab-panel input,
.settlement-lab-panel select,
.settlement-lab-panel button {
  font: inherit; color: inherit;
  background: rgba(255,255,255,.06);
  border: 1px solid #3a2c5a; border-radius: 4px;
  padding: 4px 6px;
}
.settlement-lab-panel button { cursor: pointer; }
.settlement-lab-panel button:hover { background: rgba(255,255,255,.14); }
.settlement-lab-panel [data-role="seed-input"] { width: 90px; }
.settlement-lab-panel [data-role="readout"] {
  flex-basis: 100%; opacity: .85; font-size: .74rem;
}
`;

export interface SettlementLabPanelOptions {
  initialSeed: number;
  settlementTypes: string[];
  factions: string[];
  layouts: string[];
  /** Preselected dropdown values, e.g. when launched from the Overworld
   * Studio Settlement tab's "Play in 3D" button carrying over the
   * currently-configured settlement. Falls back to the first entry in the
   * corresponding list (createSelect()'s default `<select>` behaviour) when
   * omitted or not present in that list. */
  initialType?: string;
  initialFaction?: string;
  initialLayout?: string;
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
  private readonly initialSeed: number;

  constructor(options: SettlementLabPanelOptions) {
    this.initialSeed = options.initialSeed;
    this._ensureStyles();
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

    // Preselect from initialType/initialFaction/initialLayout when given and
    // present in the corresponding option list; otherwise the <select>
    // already defaults to its first <option> (set by createSelect() above).
    if (options.initialType !== undefined && options.settlementTypes.includes(options.initialType)) {
      this.typeSelect.value = options.initialType;
    }
    if (options.initialFaction !== undefined && options.factions.includes(options.initialFaction)) {
      this.factionSelect.value = options.initialFaction;
    }
    if (options.initialLayout !== undefined && options.layouts.includes(options.initialLayout)) {
      this.layoutSelect.value = options.initialLayout;
    }

    this.regenerateButton = document.createElement('button');
    this.regenerateButton.textContent = 'Regenerate';
    this.regenerateButton.setAttribute('data-action', 'regenerate');

    this.readoutEl = document.createElement('div');
    this.readoutEl.setAttribute('data-role', 'readout');

    this.randomizeClickHandler = () => {
      this.seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    };

    this.regenerateClickHandler = () => {
      // valueAsNumber is NaN for an empty/invalid <input type="number">;
      // fall back to the initial seed rather than silently regenerating with 0.
      const parsedSeed = this.seedInput.valueAsNumber;
      const seed = Number.isNaN(parsedSeed) ? this.initialSeed : parsedSeed;
      options.onRegenerate({
        seed,
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

  private _ensureStyles(): void {
    if (document.getElementById('settlement-lab-panel-css')) return;
    const s = document.createElement('style');
    s.id = 'settlement-lab-panel-css';
    s.textContent = SL_CSS;
    document.head.appendChild(s);
  }
}
