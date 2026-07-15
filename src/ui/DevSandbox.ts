// ── DevSandbox ───────────────────────────────────────────────────────────────
//
//  Floating overlay rendered on top of the sandbox arena game mode.
//  Accessible from the main menu Dev button when dev mode is on.
//
//  Tabs:
//    Spell Lab     — grant/select any spell; cast in isolation.
//    Enemy Lab     — spawn slimes, adjust HP/count, kill all.
//    Proc-Gen      — run tower/overworld generators, view stats.
//    Creature Lab  — build a creature from DNA and spawn it.

import * as THREE from 'three';
import { Pane } from 'tweakpane';
import type { CreatureDNA, Archetype, FaceType, MouthType } from '@/creatures/CreatureDNA';
import { dnaForArchetype, cloneDNA, numToHex, hexToNum, dnaToBase64, DOG_DNA, CAT_DNA } from '@/creatures/CreatureDNA';
import { buildCreature, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';

export interface DevSandboxOptions {
  onGrantSpell: (spellId: string) => void;
  onSetActiveSpell: (spellId: string) => void;
  onSpawnEnemies: (n: number) => void;
  onKillAllEnemies: () => void;
  onGrantAllSpells: () => void;
  /** Run generator, return text stats AND the room IDs it contains. */
  getProcGenStats: (type: 'tower' | 'overworld' | 'dungeon', seed: number) => { text: string; roomIds: string[] };
  /** Teleport into a generated room by ID. */
  onEnterRoom: (roomId: string) => void;
  /** Return to the open sandbox arena. */
  onReturnToArena: () => void;
  /** Teleport into a live overworld scene with the given seed. */
  onEnterOverworld: (seed: number) => void;
  /** Spawn a creature (built from DNA) in the arena. */
  onSpawnCreature: (dna: CreatureDNA) => void;
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

type TabId = 'spells' | 'enemies' | 'procgen' | 'creature';

export class DevSandbox {
  private readonly _panel: HTMLElement;
  private _bodyEl: HTMLElement | null = null;
  private _locationBarEl: HTMLElement | null = null;
  private _activeTab: TabId = 'spells';
  private _selectedSpell = 'magic_bolt';
  private _spawnCount = 3;
  private _procType: 'tower' | 'overworld' | 'dungeon' = 'tower';
  private _procSeed = 42;
  private _outputEl: HTMLElement | null = null;
  private _roomListEl: HTMLElement | null = null;
  private _lastProcResult: { text: string; roomIds: string[] } | null = null;
  // Creature Lab
  private _creatureDna: CreatureDNA = dnaForArchetype('biped');
  private _labRenderer: THREE.WebGLRenderer | null = null;
  private _labRig: CreatureRig | null = null;
  private _labScene: THREE.Scene | null = null;
  private _labCamera: THREE.PerspectiveCamera | null = null;
  private _labRafId: number | null = null;
  private _labRotY = 0;
  private _labPane: Pane | null = null;

  constructor(private readonly _opts: DevSandboxOptions) {
    this._ensureStyles();
    this._panel = this._build();
    this._renderTab();          // called AFTER this._panel is assigned
    document.body.appendChild(this._panel);
  }

  show(): void { this._panel.style.display = 'flex'; }
  hide(): void { this._panel.style.display = 'none'; }
  dispose(): void {
    this._stopLabLoop();
    this._labPane?.dispose();
    this._labRenderer?.dispose();
    this._labRig?.dispose();
    this._panel.remove();
  }

  /** Update the location strip in the header. Pass 'arena' or a room ID. */
  setLocation(loc: string): void {
    const bar = this._locationBarEl;
    if (!bar) return;
    if (loc === 'arena') {
      bar.innerHTML = '<span style="color:#5a4880">📍 Sandbox Arena</span>';
    } else {
      bar.innerHTML =
        '<span style="color:#8070a0">📍 ' + loc + '</span>' +
        '<button class="ds-btn ds-loc-back">↩ Arena</button>';
      bar.querySelector<HTMLButtonElement>('.ds-loc-back')!.onclick =
        () => this._opts.onReturnToArena();
    }
  }

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

    // ── Location bar ──────────────────────────────────────────────────────
    const locBar = document.createElement('div');
    locBar.style.cssText =
      'padding:5px 14px 4px;font-size:.73rem;border-bottom:1px solid #1e1530;' +
      'display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.2);min-height:26px;';
    this._locationBarEl = locBar;
    this.setLocation('arena'); // set initial content

    // ── Tabs ─────────────────────────────────────────────────────────────
    const tabBar = document.createElement('div');
    tabBar.className = 'ds-tabs';
    const tabs: Array<{ id: TabId; label: string }> = [
      { id: 'spells',   label: '✦ Spells'  },
      { id: 'enemies',  label: '⚔ Enemies' },
      { id: 'procgen',  label: '⚙ Proc-Gen'},
      { id: 'creature', label: '🧬 Creature'},
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

    panel.append(header, locBar, tabBar, body);
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

    if (this._activeTab === 'spells')   body.appendChild(this._buildSpellsTab());
    if (this._activeTab === 'enemies')  body.appendChild(this._buildEnemiesTab());
    if (this._activeTab === 'procgen')  body.appendChild(this._buildProcGenTab());
    if (this._activeTab === 'creature') body.appendChild(this._buildCreatureLabTab());
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
    hint.innerHTML =
      'Enemies spawn in a ring around the player. Max 20 per spawn.<br>' +
      'Use spells from the <b>Spell</b> tab to test interactions.<br>' +
      'To spawn <b>quadrupeds, avians, serpents</b> etc. — switch to the <b>🧬 Creature</b> tab, pick an archetype, then click <b>⚡ Spawn in Arena</b>.';

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
    // onchange wired below after overworldBtn is created
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

    // "Enter Overworld" button (only shown when type === overworld)
    const overworldBtn = document.createElement('button');
    overworldBtn.className = 'ds-btn ds-btn--accent';
    overworldBtn.textContent = '🌍 Enter Overworld';
    overworldBtn.style.cssText = 'margin-top:4px;display:none;';
    overworldBtn.onclick = () => this._opts.onEnterOverworld(this._procSeed);

    typeSelect.onchange = () => {
      this._procType = typeSelect.value as typeof this._procType;
      runBtn.style.display = this._procType === 'overworld' ? 'none' : '';
      overworldBtn.style.display = this._procType === 'overworld' ? '' : 'none';
    };

    runBtn.onclick = () => {
      runBtn.disabled = true;
      runBtn.textContent = '…running';
      setTimeout(() => {
        const result = this._opts.getProcGenStats(this._procType, this._procSeed);
        this._lastProcResult = result;
        if (this._outputEl) this._outputEl.textContent = result.text;
        this._renderRoomList(result.roomIds);
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Generator';
      }, 0);
    };

    genSec.append(genTitle, typeRow, seedRow, runBtn, overworldBtn);

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

    // Room list section (populated after generation)
    const roomSec = document.createElement('div');
    roomSec.className = 'ds-section';
    roomSec.style.display = 'none';
    const roomTitle = document.createElement('div');
    roomTitle.className = 'ds-section-title';
    roomTitle.textContent = 'Teleport to room';
    const roomList = document.createElement('div');
    roomList.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto;';
    this._roomListEl = roomList;
    roomSec.append(roomTitle, roomList);

    // Restore last result if switching back to tab
    if (this._lastProcResult) {
      output.textContent = this._lastProcResult.text;
      roomSec.style.display = '';
      this._renderRoomList(this._lastProcResult.roomIds);
    }

    outSec.append(outTitle, output);
    wrap.append(genSec, outSec, roomSec);
    return wrap;
  }

  private _renderRoomList(roomIds: string[]): void {
    const list = this._roomListEl;
    if (!list) return;
    list.innerHTML = '';
    // Show parent roomSec
    const sec = list.parentElement;
    if (sec) sec.style.display = '';

    if (roomIds.length === 0) {
      const info = document.createElement('div');
      info.className = 'ds-hint';
      info.textContent = 'No rooms available (overworld has no teleportable rooms).';
      list.appendChild(info);
      return;
    }

    for (const id of roomIds) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const btn = document.createElement('button');
      btn.className = 'ds-btn';
      btn.style.cssText = 'font-size:.72rem;padding:3px 8px;flex-shrink:0;';
      btn.textContent = '↳ Enter';
      btn.onclick = () => this._opts.onEnterRoom(id);
      const label = document.createElement('span');
      label.style.cssText = 'font-size:.74rem;color:#8070a0;word-break:break-all;';
      label.textContent = id;
      row.append(btn, label);
      list.appendChild(row);
    }
  }

  // ── Creature Lab tab ──────────────────────────────────────────────────────

  private _buildCreatureLabTab(): HTMLElement {
    const wrap = document.createElement('div');

    // ── Archetype chips ────────────────────────────────────────────────────
    const archSec = document.createElement('div');
    archSec.className = 'ds-section';
    const archTitle = document.createElement('div');
    archTitle.className = 'ds-section-title';
    archTitle.textContent = 'Archetype';
    const archRow = document.createElement('div');
    archRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;';

    const archetypes: Array<{ id: Archetype; icon: string }> = [
      { id: 'biped',     icon: '🧙' },
      { id: 'quadruped', icon: '🐺' },
      { id: 'amoeba',    icon: '🫧' },
      { id: 'avian',     icon: '🦅' },
      { id: 'serpent',   icon: '🐍' },
    ];
    for (const a of archetypes) {
      const btn = document.createElement('button');
      btn.className = 'ds-btn' + (this._creatureDna.archetype === a.id ? ' ds-btn--accent' : '');
      btn.textContent = a.icon + ' ' + a.id;
      btn.dataset.archId = a.id;
      btn.onclick = () => {
        this._creatureDna = dnaForArchetype(a.id);
        archRow.querySelectorAll<HTMLButtonElement>('.ds-btn').forEach(b => {
          b.classList.toggle('ds-btn--accent', b.dataset.archId === a.id);
        });
        this._rebuildLabRig();
        this._syncLabPane();
      };
      archRow.appendChild(btn);
    }
    archSec.append(archTitle, archRow);

    // ── Quick presets ──────────────────────────────────────────────────────
    const presetSec = document.createElement('div');
    presetSec.className = 'ds-section';
    const presetTitle = document.createElement('div');
    presetTitle.className = 'ds-section-title';
    presetTitle.textContent = 'Quick Presets';
    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;';

    const presets: Array<{ label: string; dna: () => typeof DOG_DNA }> = [
      { label: '🐕 Dog', dna: () => cloneDNA(DOG_DNA) },
      { label: '🐈 Cat', dna: () => cloneDNA(CAT_DNA) },
    ];
    for (const p of presets) {
      const btn = document.createElement('button');
      btn.className = 'ds-btn';
      btn.textContent = p.label;
      btn.onclick = () => {
        this._creatureDna = p.dna();
        // Sync archetype highlight
        archRow.querySelectorAll<HTMLButtonElement>('.ds-btn').forEach(b => {
          b.classList.toggle('ds-btn--accent', b.dataset.archId === this._creatureDna.archetype);
        });
        this._rebuildLabRig();
        this._syncLabPane();
      };
      presetRow.appendChild(btn);
    }
    presetSec.append(presetTitle, presetRow);
    const prevSec = document.createElement('div');
    prevSec.className = 'ds-section';
    const cv = document.createElement('canvas');
    cv.width = 280; cv.height = 220;
    cv.style.cssText = 'display:block;width:280px;height:220px;border:1px solid #2a1850;border-radius:3px;background:#0d0b18;cursor:grab;';
    prevSec.appendChild(cv);

    // Init renderer once canvas is in DOM
    requestAnimationFrame(() => {
      this._initLabRenderer(cv);
      this._rebuildLabRig();
      this._startLabLoop();
    });

    // ── Tweakpane controls ─────────────────────────────────────────────────
    const paneSec = document.createElement('div');
    paneSec.className = 'ds-section';
    const paneContainer = document.createElement('div');
    paneContainer.style.cssText = 'max-height:200px;overflow-y:auto;';
    paneSec.appendChild(paneContainer);

    // Build pane after element is mounted
    requestAnimationFrame(() => {
      this._labPane?.dispose();
      const params = this._dnaToParams(this._creatureDna);
      const pane = new Pane({ container: paneContainer, title: 'DNA Editor' });
      this._labPane = pane;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = pane;

      const colFolder = p.addFolder({ title: 'Colors', expanded: true });
      colFolder.addBinding(params, 'primary',   { view: 'color', label: 'Body' });
      colFolder.addBinding(params, 'secondary', { view: 'color', label: 'Accent' });
      colFolder.addBinding(params, 'emissive',  { view: 'color', label: 'Glow' });
      colFolder.addBinding(params, 'emissiveIntensity', { min: 0, max: 0.5, step: 0.01, label: 'Glow amt' });

      const propFolder = p.addFolder({ title: 'Proportions', expanded: false });
      propFolder.addBinding(params, 'global',     { min: 0.5, max: 2,   step: 0.05, label: 'Scale' });
      propFolder.addBinding(params, 'headSize',   { min: 0.4, max: 2,   step: 0.05, label: 'Head' });
      propFolder.addBinding(params, 'limbLength', { min: 0.3, max: 2,   step: 0.05, label: 'Limb L' });
      propFolder.addBinding(params, 'limbWidth',  { min: 0.3, max: 1.8, step: 0.05, label: 'Limb W' });

      const faceFolder = p.addFolder({ title: 'Face', expanded: false });
      faceFolder.addBinding(params, 'faceType',  { options: { cute: 'cute', angry: 'angry', cyclops: 'cyclops', skull: 'skull', compound: 'compound', blank: 'blank' }, label: 'Type' });
      faceFolder.addBinding(params, 'mouthType', { options: { smile: 'smile', frown: 'frown', beak: 'beak', fangs: 'fangs', none: 'none' }, label: 'Mouth' });
      faceFolder.addBinding(params, 'eyeColor', { view: 'color', label: 'Eye' });

      p.on('change', () => {
        this._paramsToCreatureDna(params, this._creatureDna);
        this._rebuildLabRig();
      });
    });

    // ── Actions ────────────────────────────────────────────────────────────
    const actSec = document.createElement('div');
    actSec.className = 'ds-section';
    const actRow = document.createElement('div');
    actRow.className = 'ds-row';

    const spawnBtn = document.createElement('button');
    spawnBtn.className = 'ds-btn ds-btn--accent';
    spawnBtn.textContent = '⚡ Spawn in Arena';
    spawnBtn.onclick = () => this._opts.onSpawnCreature(cloneDNA(this._creatureDna));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ds-btn';
    copyBtn.textContent = '📋 Copy DNA';
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(dnaToBase64(this._creatureDna)).catch(() => {});
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy DNA'; }, 1500);
    };

    actRow.append(spawnBtn, copyBtn);
    actSec.appendChild(actRow);

    wrap.append(archSec, presetSec, prevSec, paneSec, actSec);
    return wrap;
  }

  private _initLabRenderer(cv: HTMLCanvasElement): void {
    if (this._labRenderer) return;
    this._labRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    this._labRenderer.setSize(280, 220);
    this._labRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this._labRenderer.setClearColor(0x0d0b18);

    this._labScene  = new THREE.Scene();
    this._labCamera = new THREE.PerspectiveCamera(42, 280 / 220, 0.1, 50);
    this._labCamera.position.set(0.4, 1.4, 3.0);
    this._labCamera.lookAt(0, 1.0, 0);

    this._labScene.add(new THREE.AmbientLight(0xffe8d0, 0.6));
    const key = new THREE.DirectionalLight(0xfff0e0, 1.1); key.position.set(3, 5, 3);
    this._labScene.add(key);
    const rim = new THREE.DirectionalLight(0x8060ff, 0.35); rim.position.set(-3, 2, -2);
    this._labScene.add(rim);
  }

  private _rebuildLabRig(): void {
    if (!this._labScene) return;
    if (this._labRig) { this._labScene.remove(this._labRig.root); this._labRig.dispose(); }
    this._labRig = buildCreature(this._creatureDna);
    this._labScene.add(this._labRig.root);
  }

  private _startLabLoop(): void {
    if (this._labRafId !== null) return;
    const tick = () => {
      this._labRafId = requestAnimationFrame(tick);
      this._labRotY += 0.008;
      if (this._labRig) {
        this._labRig.root.rotation.y = this._labRotY;
        const t = performance.now() * 0.001;
        this._labRig.root.position.y = Math.sin(t * 1.2) * 0.016;
        animateCreature(this._labRig, { state: 'idle', time: t });
      }
      if (this._labRenderer && this._labScene && this._labCamera) {
        this._labRenderer.render(this._labScene, this._labCamera);
      }
    };
    tick();
  }

  private _stopLabLoop(): void {
    if (this._labRafId !== null) { cancelAnimationFrame(this._labRafId); this._labRafId = null; }
  }

  // ── Tweakpane param conversion ─────────────────────────────────────────────

  private _dnaToParams(dna: CreatureDNA): Record<string, unknown> {
    return {
      primary:   numToHex(dna.colors.primary),
      secondary: numToHex(dna.colors.secondary),
      emissive:  numToHex(dna.colors.emissive),
      emissiveIntensity: dna.colors.emissiveIntensity,
      global:     dna.proportions.global,
      headSize:   dna.proportions.headSize,
      limbLength: dna.proportions.limbLength,
      limbWidth:  dna.proportions.limbWidth,
      faceType:   dna.face.type as string,
      mouthType:  dna.face.mouthType as string,
      eyeColor:   numToHex(dna.face.eyeColor),
    };
  }

  private _paramsToCreatureDna(p: Record<string, unknown>, dna: CreatureDNA): void {
    dna.colors.primary           = hexToNum(p.primary   as string);
    dna.colors.secondary         = hexToNum(p.secondary as string);
    dna.colors.emissive          = hexToNum(p.emissive  as string);
    dna.colors.emissiveIntensity = p.emissiveIntensity as number;
    dna.proportions.global       = p.global     as number;
    dna.proportions.headSize     = p.headSize   as number;
    dna.proportions.limbLength   = p.limbLength as number;
    dna.proportions.limbWidth    = p.limbWidth  as number;
    dna.face.type                = p.faceType   as FaceType;
    dna.face.mouthType           = p.mouthType  as MouthType;
    dna.face.eyeColor            = hexToNum(p.eyeColor as string);
  }

  private _syncLabPane(): void {
    // Rebuild pane when archetype changes (easier than updating individual bindings)
    if (this._labPane) { this._labPane.dispose(); this._labPane = null; }
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
