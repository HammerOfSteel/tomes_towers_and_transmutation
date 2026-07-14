// ── DevSandbox ───────────────────────────────────────────────────────────────
//
//  Floating overlay rendered on top of the sandbox arena game mode.
//  Accessible from the main menu Dev button when dev mode is on.
//
//  Tabs:
//    Spell Lab   — grant/select any spell; cast in isolation.
//    Enemy Lab   — spawn slimes, adjust HP/count, kill all.
//    Proc-Gen    — run tower/overworld generators, view stats.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DevSandboxOptions {
  /** Grant (unlock + equip) the given spell via ProgressionSystem. */
  onGrantSpell: (spellId: string) => void;
  /** Set slot-1 to the given spell so it fires on left-click. */
  onSetActiveSpell: (spellId: string) => void;
  /** Spawn N slimes near the player. */
  onSpawnEnemies: (n: number) => void;
  /** Remove all active sandbox enemies. */
  onKillAllEnemies: () => void;
  /** Grant all 8 spells at once. */
  onGrantAllSpells: () => void;
  /** Run the tower generator with the given seed and return a text summary. */
  getProcGenStats: (type: 'tower' | 'overworld' | 'dungeon', seed: number) => string;
  /** Return to the main menu. */
  onClose: () => void;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const ALL_SPELLS: Array<{ id: string; label: string; type: string }> = [
  { id: 'magic_bolt',   label: 'Magic Bolt',   type: 'projectile' },
  { id: 'flame_dart',   label: 'Flame Dart',   type: 'projectile' },
  { id: 'chain_arc',    label: 'Chain Arc',    type: 'chain' },
  { id: 'nova_burst',   label: 'Nova Burst',   type: 'aoe' },
  { id: 'intimidate',   label: 'Intimidate',   type: 'aoe' },
  { id: 'void_rift',    label: 'Void Rift',    type: 'zone' },
  { id: 'battle_hymn',  label: 'Battle Hymn',  type: 'buff' },
  { id: 'mass_animate', label: 'Mass Animate', type: 'aoe' },
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const DS_CSS = `
.ds-panel {
  position: fixed; top: 72px; right: 16px; z-index: 7600;
  width: 310px; max-height: calc(100vh - 96px);
  background: rgba(6,4,14,.94); backdrop-filter: blur(8px);
  border: 1px solid #2a1e4a; border-radius: 6px;
  display: flex; flex-direction: column;
  font-family: 'Crimson Text','Georgia',serif;
  color: #d4c0f0; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,.8);
}
.ds-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #1e1530;
  background: rgba(112,60,220,.12);
}
.ds-title {
  font-size: 1rem; color: #e0c8ff; letter-spacing: .06em;
  text-transform: uppercase;
}
.ds-badge {
  font-size: .68rem; background: #7020c0; color: #fff;
  padding: 2px 7px; border-radius: 3px; letter-spacing: .1em;
}
.ds-close {
  background: none; border: 1px solid #2a1e4a; color: #7060a0;
  border-radius: 3px; cursor: pointer; font-size: .85rem; padding: 3px 9px;
  transition: all .1s;
}
.ds-close:hover { background: rgba(180,40,40,.2); border-color: #a03030; color: #ff8080; }

/* Tabs */
.ds-tabs { display: flex; border-bottom: 1px solid #1e1530; }
.ds-tab {
  flex: 1; padding: 8px 4px; text-align: center; font-size: .8rem;
  color: #5a4880; cursor: pointer; border: none; background: none;
  letter-spacing: .04em; transition: color .1s, background .1s;
}
.ds-tab:hover { color: #a080e0; background: rgba(255,255,255,.03); }
.ds-tab.ds-tab--active { color: #c0a0ff; border-bottom: 2px solid #7050cc; margin-bottom: -1px; }

/* Body */
.ds-body { flex: 1; overflow-y: auto; padding: 14px; scrollbar-width: thin; scrollbar-color: #2a1850 transparent; }

/* Section */
.ds-section { margin-bottom: 16px; }
.ds-section-title {
  font-size: .72rem; color: #5a4880; letter-spacing: .1em;
  text-transform: uppercase; margin-bottom: 8px;
  padding-bottom: 4px; border-bottom: 1px solid #1a1228;
}

/* Row */
.ds-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }

/* Controls */
.ds-btn {
  background: #1a1228; border: 1px solid #2e1f50; color: #c0a0f0;
  border-radius: 3px; cursor: pointer; font-family: inherit; font-size: .82rem;
  padding: 5px 12px; transition: background .1s, border-color .1s;
  white-space: nowrap;
}
.ds-btn:hover { background: #2a1a48; border-color: #4a3070; }
.ds-btn--accent {
  background: linear-gradient(135deg,#4020a0,#6040c8);
  border-color: #5030b0; color: #f0e8ff;
}
.ds-btn--accent:hover { background: linear-gradient(135deg,#5030b8,#7050d8); }
.ds-btn--danger { border-color: #601818; color: #ff8080; }
.ds-btn--danger:hover { background: rgba(180,40,40,.2); }

.ds-select {
  background: #100c1e; border: 1px solid #2a1e4a; color: #c0a0f0;
  border-radius: 3px; font-family: inherit; font-size: .82rem;
  padding: 5px 8px; flex: 1; min-width: 0; outline: none;
}
.ds-select:focus { border-color: #6040c0; }

.ds-input {
  background: #100c1e; border: 1px solid #2a1e4a; color: #c0a0f0;
  border-radius: 3px; font-family: inherit; font-size: .82rem;
  padding: 5px 8px; width: 70px; outline: none;
}
.ds-input:focus { border-color: #6040c0; }
.ds-input--wide { width: 120px; }

.ds-label { font-size: .8rem; color: #7060a0; white-space: nowrap; }

/* Output */
.ds-output {
  background: #07060f; border: 1px solid #1a1228; border-radius: 3px;
  padding: 10px; font-size: .75rem; color: #8070a0; line-height: 1.7;
  font-family: 'Courier New', monospace; white-space: pre-wrap;
  min-height: 80px; max-height: 240px; overflow-y: auto;
}

/* Spell chips */
.ds-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ds-chip {
  font-size: .72rem; background: #14102a; border: 1px solid #2a1e4a;
  border-radius: 12px; padding: 3px 10px; color: #9080c0; cursor: pointer;
  transition: all .1s;
}
.ds-chip:hover { background: #2a1a48; border-color: #5030a0; color: #d0b8ff; }
.ds-chip.ds-chip--active { background: #4030a0; border-color: #7050cc; color: #f0e8ff; }
.ds-chip--proj { border-color: #1a4060; color: #80c0e0; }
.ds-chip--proj.ds-chip--active { background: #103050; border-color: #4090c0; }
.ds-chip--chain { border-color: #204060; color: #60d0ff; }
.ds-chip--chain.ds-chip--active { background: #102840; border-color: #3080c0; }
.ds-chip--aoe { border-color: #402010; color: #e08060; }
.ds-chip--aoe.ds-chip--active { background: #401808; border-color: #c05030; }
.ds-chip--zone { border-color: #301050; color: #c060e0; }
.ds-chip--zone.ds-chip--active { background: #280840; border-color: #9030c0; }
.ds-chip--buff { border-color: #404010; color: #e0c040; }
.ds-chip--buff.ds-chip--active { background: #383008; border-color: #b09020; }

.ds-divider { border-top: 1px solid #1a1228; margin: 10px 0; }

.ds-hint { font-size: .72rem; color: #3a2850; line-height: 1.5; margin-top: 6px; }
`;

// ── DevSandbox class ──────────────────────────────────────────────────────────

type TabId = 'spells' | 'enemies' | 'procgen';

export class DevSandbox {
  private readonly _panel: HTMLElement;
  private _bodyEl: HTMLElement | null = null;
  private _activeTab: TabId = 'spells';
  private _selectedSpell = 'magic_bolt';
  private _spawnCount = 3;
  private _procType: 'tower' | 'overworld' | 'dungeon' = 'tower';
  private _procSeed = 42;
  private _outputEl: HTMLElement | null = null;

  constructor(private readonly _opts: DevSandboxOptions) {
    this._ensureStyles();
    this._panel = this._build();
    this._renderTab();          // called AFTER this._panel is assigned
    document.body.appendChild(this._panel);
  }

  show(): void { this._panel.style.display = 'flex'; }
  hide(): void { this._panel.style.display = 'none'; }
  dispose(): void { this._panel.remove(); }

  // ── DOM ───────────────────────────────────────────────────────────────────

  private _build(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'ds-panel';

    // ── Header ───────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'ds-header';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;align-items:center;gap:8px';
    const title = document.createElement('span');
    title.className = 'ds-title';
    title.textContent = 'Dev Sandbox';
    const badge = document.createElement('span');
    badge.className = 'ds-badge';
    badge.textContent = 'DEV';
    left.append(title, badge);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ds-close';
    closeBtn.textContent = '✕ Exit';
    closeBtn.title = 'Return to main menu';
    closeBtn.onclick = () => this._opts.onClose();

    header.append(left, closeBtn);

    // ── Tabs ─────────────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'ds-tabs';
    const tabs: Array<{ id: TabId; label: string }> = [
      { id: 'spells',  label: '✦ Spells' },
      { id: 'enemies', label: '⚔ Enemies' },
      { id: 'procgen', label: '⚙ Proc-Gen' },
    ];
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.className = 'ds-tab' + (t.id === this._activeTab ? ' ds-tab--active' : '');
      btn.dataset.tab = t.id;
      btn.textContent = t.label;
      btn.onclick = () => this._switchTab(t.id);
      tabBar.appendChild(btn);
    }

    // ── Body (rendered per-tab) ───────────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'ds-body';
    body.id = 'ds-body';
    this._bodyEl = body;

    panel.append(header, tabBar, body);
    // _renderTab() is NOT called here — it's called after this._panel is set
    return panel;
  }

  private _switchTab(id: TabId): void {
    this._activeTab = id;
    // Update tab highlight
    this._panel.querySelectorAll<HTMLElement>('.ds-tab').forEach(el => {
      el.classList.toggle('ds-tab--active', el.dataset.tab === id);
    });
    this._renderTab();
  }

  private _renderTab(): void {
    const body = this._bodyEl ?? this._panel?.querySelector<HTMLElement>('#ds-body');
    if (!body) return;
    body.innerHTML = '';

    if (this._activeTab === 'spells')  body.appendChild(this._buildSpellsTab());
    if (this._activeTab === 'enemies') body.appendChild(this._buildEnemiesTab());
    if (this._activeTab === 'procgen') body.appendChild(this._buildProcGenTab());
  }

  // ── Spells tab ────────────────────────────────────────────────────────────

  private _buildSpellsTab(): HTMLElement {
    const wrap = document.createElement('div');

    // Section: spell chips
    const selSec = document.createElement('div');
    selSec.className = 'ds-section';
    const selTitle = document.createElement('div');
    selTitle.className = 'ds-section-title';
    selTitle.textContent = 'Select active spell (slot 1)';
    const chips = document.createElement('div');
    chips.className = 'ds-chips';
    chips.id = 'ds-spell-chips';

    for (const sp of ALL_SPELLS) {
      const chip = document.createElement('span');
      chip.className = `ds-chip ds-chip--${sp.type}` + (sp.id === this._selectedSpell ? ' ds-chip--active' : '');
      chip.textContent = sp.label;
      chip.dataset.spellId = sp.id;
      chip.title = `Type: ${sp.type}`;
      chip.onclick = () => this._selectSpell(sp.id);
      chips.appendChild(chip);
    }

    selSec.append(selTitle, chips);

    // Section: actions
    const actSec = document.createElement('div');
    actSec.className = 'ds-section';
    const actTitle = document.createElement('div');
    actTitle.className = 'ds-section-title';
    actTitle.textContent = 'Actions';

    const grantRow = document.createElement('div');
    grantRow.className = 'ds-row';
    const grantActiveBtn = document.createElement('button');
    grantActiveBtn.className = 'ds-btn ds-btn--accent';
    grantActiveBtn.textContent = 'Grant Selected';
    grantActiveBtn.title = 'Unlock & equip the selected spell into slot 1';
    grantActiveBtn.onclick = () => {
      this._opts.onGrantSpell(this._selectedSpell);
      this._opts.onSetActiveSpell(this._selectedSpell);
    };

    const grantAllBtn = document.createElement('button');
    grantAllBtn.className = 'ds-btn';
    grantAllBtn.textContent = 'Grant All';
    grantAllBtn.title = 'Unlock all 8 spells at once';
    grantAllBtn.onclick = () => this._opts.onGrantAllSpells();

    grantRow.append(grantActiveBtn, grantAllBtn);
    actSec.append(actTitle, grantRow);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.innerHTML =
      'Use <b style="color:#a080e0">Left-click</b> to cast the selected spell.<br>' +
      'Spawn enemies from the Enemy tab as targets.<br>' +
      'Press <b style="color:#a080e0">[F1]</b> in-game to toggle the standard Dev Panel.';

    wrap.append(selSec, actSec, hint);
    return wrap;
  }

  private _selectSpell(id: string): void {
    this._selectedSpell = id;
    this._panel.querySelectorAll<HTMLElement>('.ds-chip').forEach(c => {
      c.classList.toggle('ds-chip--active', c.dataset.spellId === id);
    });
  }

  // ── Enemies tab ───────────────────────────────────────────────────────────

  private _buildEnemiesTab(): HTMLElement {
    const wrap = document.createElement('div');

    // Spawn section
    const spawnSec = document.createElement('div');
    spawnSec.className = 'ds-section';
    const spawnTitle = document.createElement('div');
    spawnTitle.className = 'ds-section-title';
    spawnTitle.textContent = 'Spawn slimes';

    const countRow = document.createElement('div');
    countRow.className = 'ds-row';
    const countLbl = document.createElement('span');
    countLbl.className = 'ds-label';
    countLbl.textContent = 'Count:';
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.className = 'ds-input';
    countInput.min = '1';
    countInput.max = '20';
    countInput.value = String(this._spawnCount);
    countInput.onchange = () => {
      this._spawnCount = Math.min(20, Math.max(1, parseInt(countInput.value) || 1));
      countInput.value = String(this._spawnCount);
    };
    const spawnBtn = document.createElement('button');
    spawnBtn.className = 'ds-btn ds-btn--accent';
    spawnBtn.textContent = 'Spawn';
    spawnBtn.onclick = () => this._opts.onSpawnEnemies(this._spawnCount);

    countRow.append(countLbl, countInput, spawnBtn);

    const killRow = document.createElement('div');
    killRow.className = 'ds-row';
    const killBtn = document.createElement('button');
    killBtn.className = 'ds-btn ds-btn--danger';
    killBtn.textContent = '✕ Kill All';
    killBtn.onclick = () => this._opts.onKillAllEnemies();

    spawnSec.append(spawnTitle, countRow, killRow);

    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.textContent = 'Enemies spawn in a ring around the player. Max 20 per spawn. Use spells from the Spell tab to test interactions.';

    wrap.append(spawnSec, hint);
    return wrap;
  }

  // ── Proc-Gen tab ──────────────────────────────────────────────────────────

  private _buildProcGenTab(): HTMLElement {
    const wrap = document.createElement('div');

    const genSec = document.createElement('div');
    genSec.className = 'ds-section';
    const genTitle = document.createElement('div');
    genTitle.className = 'ds-section-title';
    genTitle.textContent = 'Generator settings';

    const typeRow = document.createElement('div');
    typeRow.className = 'ds-row';
    const typeLbl = document.createElement('span');
    typeLbl.className = 'ds-label';
    typeLbl.textContent = 'Type:';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'ds-select';
    const typeOpts: Array<{ v: string; l: string }> = [
      { v: 'tower',    l: 'Tower (full 11 floors)' },
      { v: 'dungeon',  l: 'Dungeon (random walk)' },
      { v: 'overworld',l: 'Overworld (biome map)' },
    ];
    for (const o of typeOpts) {
      const opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.l;
      opt.selected = o.v === this._procType;
      typeSelect.appendChild(opt);
    }
    typeSelect.onchange = () => {
      this._procType = typeSelect.value as typeof this._procType;
    };
    typeRow.append(typeLbl, typeSelect);

    const seedRow = document.createElement('div');
    seedRow.className = 'ds-row';
    const seedLbl = document.createElement('span');
    seedLbl.className = 'ds-label';
    seedLbl.textContent = 'Seed:';
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.className = 'ds-input ds-input--wide';
    seedInput.value = String(this._procSeed);
    seedInput.onchange = () => {
      this._procSeed = parseInt(seedInput.value) || 0;
    };
    const randomSeedBtn = document.createElement('button');
    randomSeedBtn.className = 'ds-btn';
    randomSeedBtn.textContent = '⚄ Random';
    randomSeedBtn.onclick = () => {
      this._procSeed = (Math.random() * 0xFFFF_FFFF) >>> 0;
      seedInput.value = String(this._procSeed);
    };
    seedRow.append(seedLbl, seedInput, randomSeedBtn);

    const runBtn = document.createElement('button');
    runBtn.className = 'ds-btn ds-btn--accent';
    runBtn.textContent = '▶ Run Generator';
    runBtn.style.marginTop = '4px';
    runBtn.onclick = () => {
      runBtn.disabled = true;
      runBtn.textContent = '…running';
      // Defer one frame so the UI can update before the (possibly slow) generation
      setTimeout(() => {
        const result = this._opts.getProcGenStats(this._procType, this._procSeed);
        if (this._outputEl) this._outputEl.textContent = result;
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Generator';
      }, 0);
    };

    genSec.append(genTitle, typeRow, seedRow, runBtn);

    // Output area
    const outSec = document.createElement('div');
    outSec.className = 'ds-section';
    const outTitle = document.createElement('div');
    outTitle.className = 'ds-section-title';
    outTitle.textContent = 'Output';
    const output = document.createElement('pre');
    output.className = 'ds-output';
    output.textContent = '← Press "Run Generator" to see stats';
    this._outputEl = output;

    outSec.append(outTitle, output);

    wrap.append(genSec, outSec);
    return wrap;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  private _ensureStyles(): void {
    if (document.getElementById('dev-sandbox-css')) return;
    const s = document.createElement('style');
    s.id = 'dev-sandbox-css';
    s.textContent = DS_CSS;
    document.head.appendChild(s);
  }
}
