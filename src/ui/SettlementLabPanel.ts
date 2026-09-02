export interface SettlementLabPanelOptions {
  initialSeed: number;
  settlementTypes: string[];
  factions: string[];
  layouts: string[];
  /** Options for the "kind override" dropdown, e.g. BUILDING_CREATOR_KINDS
   *  from buildingCreatorState.ts. Always prefixed with a sentinel
   *  KIND_OVERRIDE_ALL option so the default is "no override" (use each
   *  ward's normal WARD_TO_KIND-driven mix). Optional/defaults to []
   *  (only the sentinel is offered) so existing callers/tests that don't
   *  care about this feature don't need to pass it. */
  buildingKinds?: string[];
  /** Preselected dropdown values, e.g. when launched from the Overworld
   * Studio Settlement tab's "Play in 3D" button carrying over the
   * currently-configured settlement. Falls back to the first entry in the
   * corresponding list (createSelect()'s default `<select>` behaviour) when
   * omitted or not present in that list. */
  initialType?: string;
  initialFaction?: string;
  initialLayout?: string;
  /** Preselected kind-override value. Falls back to KIND_OVERRIDE_ALL (the
   *  sentinel "no override" option) when omitted or not one of
   *  KIND_OVERRIDE_ALL / buildingKinds. */
  initialKindOverride?: string;
  onRegenerate: (params: { seed: number; type: string; faction: string; layout: string; kindOverride: string }) => void;
}

/** Sentinel "kind override" dropdown value meaning "no override — use each
 *  ward's normal WARD_TO_KIND-driven BuildingKind mix". Exported so callers
 *  (SettlementLabScene) can compare against it without duplicating the
 *  literal string. */
export const KIND_OVERRIDE_ALL = 'all';

export class SettlementLabPanel {
  readonly rootEl: HTMLElement;

  private readonly seedInput: HTMLInputElement;
  private readonly typeSelect: HTMLSelectElement;
  private readonly factionSelect: HTMLSelectElement;
  private readonly layoutSelect: HTMLSelectElement;
  private readonly kindSelect: HTMLSelectElement;
  private readonly readoutEl: HTMLElement;
  private readonly randomizeButton: HTMLButtonElement;
  private readonly regenerateButton: HTMLButtonElement;
  private readonly randomizeClickHandler: () => void;
  private readonly regenerateClickHandler: () => void;
  private readonly initialSeed: number;

  constructor(options: SettlementLabPanelOptions) {
    this.initialSeed = options.initialSeed;
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
    this.kindSelect = this.createSelect(
      'kind-select',
      [KIND_OVERRIDE_ALL, ...(options.buildingKinds ?? [])],
      { [KIND_OVERRIDE_ALL]: '(all — use ward defaults)' },
    );

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
    if (options.initialKindOverride !== undefined
        && (options.buildingKinds ?? []).includes(options.initialKindOverride)) {
      this.kindSelect.value = options.initialKindOverride;
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
        kindOverride: this.kindSelect.value,
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
      this.kindSelect,
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

  private createSelect(role: string, values: string[], labels?: Record<string, string>): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('data-role', role);

    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labels?.[value] ?? value;
      select.append(option);
    }

    return select;
  }
}
