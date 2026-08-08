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
import { buildEnemy, type EnemyBuildResult } from '@/enemy-creator/builder';
import type { EnemyDNA, EnemyTierLevel } from '@/enemy-creator/types';
import {
  ENEMY_CREATOR_MOVEMENTS,
  ENEMY_CREATOR_ROLES,
  ENEMY_CREATOR_SPECIES,
  ENEMY_CREATOR_TIERS,
  createInitialEnemyState,
  setAggroRange,
  setAttackRange,
  setBaseDmg,
  setBaseHp,
  setColor as setEnemyColor,
  setCombatRole,
  setIsBoss,
  setMovement,
  setName as setEnemyName,
  setSpecies as setEnemySpecies,
  setTier,
} from '@/enemy-creator/creatorState';
import { buildNpc, type NpcInstance } from '@/npc-creator/builder';
import type { NpcDNA, NpcPersonality } from '@/npc-creator/types';
import {
  NPC_CREATOR_ROLES,
  NPC_CREATOR_SPECIES,
  createInitialState as createInitialNpcState,
  setBodyPreset,
  setColor as setNpcColor,
  setName as setNpcName,
  setPersonality,
  setRole,
  setSpecies as setNpcSpecies,
} from '@/npc-creator/creatorState';
import { CHAR_MODELS, CHAR_PACKS } from '@/characters/charManifest';

export interface DevSandboxOptions {
  onGrantSpell: (spellId: string) => void;
  onSetActiveSpell: (spellId: string) => void;
  onSpawnEnemies: (n: number) => void;
  onKillAllEnemies: () => void;
  onGrantAllSpells: () => void;
  /** Grant all species abilities (Blink, Levitate, Fly Burst, + species Q/R). */
  onGrantAllAbilities?: () => void;
  /** Run generator, return text stats AND the room IDs it contains. */
  getProcGenStats: (type: 'tower' | 'overworld' | 'dungeon', seed: number) => { text: string; roomIds: string[] };
  /** Teleport into a generated room by ID. */
  onEnterRoom: (roomId: string) => void;
  /** Return to the open sandbox arena. */
  onReturnToArena: () => void;
  /** Teleport into a live overworld scene with the given seed. */
  onEnterOverworld: (seed: number) => void;
  /** Teleport into the Water Lab scene. */
  onEnterWaterLab: () => void;
  /** Switch the Water Lab's water-surface visual ('reflective' = Water.js
   *  planar reflection, 'flow-refractive' = Water2.js flow-map refraction). */
  onSetWaterVariant: (kind: 'reflective' | 'flow-refractive') => void;
  /** Spawn an enemy (built from EnemyDNA) in the arena. */
  onSpawnCreature: (dna: EnemyDNA) => void;
  onClose: () => void;

  // ── Cheats tab (mirrors DevPanel) ─────────────────────────────────────────
  getGodMode?: () => boolean;
  onGodMode?: (v: boolean) => void;
  getInstantCooldowns?: () => boolean;
  onInstantCooldowns?: (v: boolean) => void;
  getHpInfo?: () => { hp: number; maxHp: number };
  onFillHp?: () => void;
  onSetHp?: (v: number) => void;
  onKillAllInRoom?: () => void;
  onForceFlee?: () => void;
  onTeleportRoom?: (roomId: string) => void;
  getFlyMode?: () => boolean;
  onFlyMode?: (v: boolean) => void;
  getSettlements?: () => Array<{ name: string; worldPos: { x: number; y: number; z: number } }>;
  onFastTravel?: (pos: { x: number; y: number; z: number }) => void;

  // ── NPC Generator tab ─────────────────────────────────────────────────────
  /** Spawn a hostile sandbox stand-in whose visual is driven by NpcDNA. hp/damage override defaults. */
  onSpawnNPC?: (dna: NpcDNA, hp: number, damage: number, count: number) => void;

  // ── Wave Spawner tab ──────────────────────────────────────────────────────
  /** Run a wave: spawn `count` slime enemies over `intervalSec` seconds. */
  onRunWave?: (count: number, intervalSec: number, hp: number, damage: number) => void;

  // ── Asset Browser tab ─────────────────────────────────────────────────────
  /** Swap the player's visible model to the GLB at `path`. */
  onSwapPlayerModel?: (path: string) => void;
  /**
   * Load a character model for inspection in the dev viewport.
   * Resolves with the list of animation clip names found on the model.
   * Returns an empty array if no clips are available.
   * The model is placed at a fixed inspection position in the sandbox scene;
   * call again with a different model to swap the inspected model.
   */
  onPreviewModel?: (model: import('@/characters/charManifest').CharModelDef) => Promise<string[]>;
  /** Play a named animation clip on the currently previewed model. Empty string = stop. */
  onPlayPreviewAnim?: (clipName: string) => void;
}

/** A saved NPC preset (stored in DevSandbox instance memory). */
export interface NPCPreset {
  dna: NpcDNA;
  hp: number;
  damage: number;
}

const NPC_PERSONALITIES: readonly NpcPersonality[] = ['friendly', 'wary', 'eccentric', 'formal', 'cheerful'];

function cloneEnemyDna(dna: EnemyDNA): EnemyDNA {
  return {
    ...dna,
    colors: { ...dna.colors },
  };
}

function cloneNpcDna(dna: NpcDNA): NpcDNA {
  return {
    ...dna,
    colors: { ...dna.colors },
  };
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

type TabId = 'spells' | 'enemies' | 'procgen' | 'creature' | 'npcgen' | 'wave' | 'assets' | 'cheats';

export class DevSandbox {
  private readonly _panel: HTMLElement;
  private _bodyEl: HTMLElement | null = null;
  private _locationBarEl: HTMLElement | null = null;
  private _activeTab: TabId = 'spells';
  private _npcPresets: NPCPreset[] = [];
  private _npcDna: NpcDNA = {
    ...createInitialNpcState('human', 'merchant', Date.now() >>> 0).dna,
    name: 'Test NPC',
  };
  private _npcHp = 40;
  private _npcDamage = 8;
  private _npcCount = 1;
  private _npcLabRenderer: THREE.WebGLRenderer | null = null;
  private _npcLabRig: NpcInstance | null = null;
  private _npcLabScene: THREE.Scene | null = null;
  private _npcLabCamera: THREE.PerspectiveCamera | null = null;
  private _npcLabRafId: number | null = null;
  private _npcLabRotY = 0;
  private _npcLabLastTick = 0;
  private _npcLabBuildToken = 0;
  private _npcPresetListEl: HTMLElement | null = null;
  // Wave spawner
  private _waveCount = 10;
  private _waveInterval = 0.5;
  private _waveHp = 30;
  private _waveDamage = 6;
  private _waveRunning = false;
  private _waveTimerId: ReturnType<typeof setInterval> | null = null;
  private _waveSpawned = 0;
  // Asset browser
  private _assetFilter  = '';
  private _assetRoleTab: 'all' | 'enemy' | 'npc' | 'player' = 'all';
  private _previewModelId: string | null = null;
  private _previewAnimBtns: HTMLElement[] = [];
  private _previewStatusEl: HTMLElement | null = null;
  private _previewClipListEl: HTMLElement | null = null;
  private _selectedSpell = 'magic_bolt';
  private _spawnCount = 3;
  private _procType: 'tower' | 'overworld' | 'dungeon' = 'tower';
  private _procSeed = 42;
  private _outputEl: HTMLElement | null = null;
  private _roomListEl: HTMLElement | null = null;
  private _lastProcResult: { text: string; roomIds: string[] } | null = null;
  // Creature Lab
  private _creatureDna: EnemyDNA = createInitialEnemyState('human', 'melee', 1, Date.now() >>> 0).dna;
  private _labRenderer: THREE.WebGLRenderer | null = null;
  private _labRig: EnemyBuildResult | null = null;
  private _labScene: THREE.Scene | null = null;
  private _labCamera: THREE.PerspectiveCamera | null = null;
  private _labRafId: number | null = null;
  private _labRotY = 0;
  private _labLastTick = 0;
  private _labBuildToken = 0;

  constructor(private readonly _opts: DevSandboxOptions) {
    this._ensureStyles();
    this._panel = this._build();
    this._renderTab();          // called AFTER this._panel is assigned
    document.body.appendChild(this._panel);
  }

  show(): void { this._panel.style.display = 'flex'; }
  hide(): void { this._panel.style.display = 'none'; }
  dispose(): void {
    this._stopWave();
    this._stopLabLoop();
    this._stopNpcLabLoop();
    this._labBuildToken++;
    this._npcLabBuildToken++;
    this._labRenderer?.dispose();
    this._labRenderer = null;
    this._labRig?.dispose();
    this._labRig = null;
    this._labScene = null;
    this._labCamera = null;
    this._npcLabRenderer?.dispose();
    this._npcLabRenderer = null;
    this._npcLabRig?.dispose();
    this._npcLabRig = null;
    this._npcLabScene = null;
    this._npcLabCamera = null;
    this._panel.remove();
  }

  /** Update the location strip in the header. Pass 'arena', a room ID, or 'lab'. */
  setLocation(loc: string): void {
    const bar = this._locationBarEl;
    if (!bar) return;
    if (loc === 'arena') {
      bar.innerHTML = '<span style="color:#5a4880">📍 Sandbox Arena</span>';
    } else if (loc === 'lab') {
      bar.innerHTML =
        '<span style="color:#3a7090">📍 Water Lab</span>' +
        '<button class="ds-btn ds-loc-back">↩ Arena</button>';
      bar.querySelector<HTMLButtonElement>('.ds-loc-back')!.onclick =
        () => this._opts.onReturnToArena();
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
      { id: 'npcgen',   label: '👾 NPC Gen' },
      { id: 'wave',     label: '🌊 Waves'   },
      { id: 'assets',   label: '📦 Assets'  },
      { id: 'cheats',   label: '⚙ Cheats'  },
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
    if (this._activeTab === 'creature' && id !== 'creature') this._stopLabLoop();
    if (this._activeTab === 'npcgen' && id !== 'npcgen') this._stopNpcLabLoop();
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
    if (this._activeTab === 'npcgen')   body.appendChild(this._buildNPCGenTab());
    if (this._activeTab === 'wave')     body.appendChild(this._buildWaveTab());
    if (this._activeTab === 'assets')   body.appendChild(this._buildAssetsTab());
    if (this._activeTab === 'cheats')   body.appendChild(this._buildCheatsTab());
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
    grantAllBtn.title = 'Unlock all 8 spells + all abilities (Q R Z X) at once';
    grantAllBtn.onclick = () => this._opts.onGrantAllSpells();

    const grantAbilitiesBtn = document.createElement('button');
    grantAbilitiesBtn.className = 'ds-btn';
    grantAbilitiesBtn.textContent = '🪄 Grant Abilities';
    grantAbilitiesBtn.title = 'Grant all species abilities: Blink (Z), Levitate (X), Fly Burst, and species Q/R slots';
    grantAbilitiesBtn.onclick = () => this._opts.onGrantAllAbilities?.();

    grantRow.append(grantActiveBtn, grantAllBtn, grantAbilitiesBtn);
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

    // "Water Lab" button — always visible, independent of the proc-gen type
    // selector, since it's a fixed hand-built room (not a generated dungeon).
    const waterLabBtn = document.createElement('button');
    waterLabBtn.className = 'ds-btn ds-btn--accent';
    waterLabBtn.textContent = '🌊 Water Lab';
    waterLabBtn.style.marginTop = '4px';
    waterLabBtn.onclick = () => this._opts.onEnterWaterLab();

    // Water Lab visual A/B toggle — 'reflective' (Water.js) starts active,
    // matching WaterLabScene's default _waterVariant.
    const waterVariantReflectiveBtn = document.createElement('button');
    waterVariantReflectiveBtn.className = 'ds-btn ds-btn--accent';
    waterVariantReflectiveBtn.textContent = '🪞 Reflective';
    waterVariantReflectiveBtn.style.marginTop = '4px';

    const waterVariantFlowBtn = document.createElement('button');
    waterVariantFlowBtn.className = 'ds-btn';
    waterVariantFlowBtn.textContent = '🌊 Flow';
    waterVariantFlowBtn.style.marginTop = '4px';

    const setActiveWaterVariantBtn = (kind: 'reflective' | 'flow-refractive') => {
      waterVariantReflectiveBtn.classList.toggle('ds-btn--accent', kind === 'reflective');
      waterVariantFlowBtn.classList.toggle('ds-btn--accent', kind === 'flow-refractive');
    };
    waterVariantReflectiveBtn.onclick = () => {
      this._opts.onSetWaterVariant('reflective');
      setActiveWaterVariantBtn('reflective');
    };
    waterVariantFlowBtn.onclick = () => {
      this._opts.onSetWaterVariant('flow-refractive');
      setActiveWaterVariantBtn('flow-refractive');
    };

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

    genSec.append(genTitle, typeRow, seedRow, runBtn, overworldBtn, waterLabBtn, waterVariantReflectiveBtn, waterVariantFlowBtn);

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
    const prevSec = document.createElement('div');
    prevSec.className = 'ds-section';
    const cv = document.createElement('canvas');
    cv.width = 280; cv.height = 220;
    cv.style.cssText = 'display:block;width:280px;height:220px;border:1px solid #2a1850;border-radius:3px;background:#0d0b18;cursor:grab;';
    prevSec.appendChild(cv);

    // Init renderer once canvas is in DOM
    requestAnimationFrame(() => {
      if (this._activeTab !== 'creature' || !cv.isConnected) return;
      this._initLabRenderer(cv);
      void this._rebuildLabRig();
      this._startLabLoop();
    });

    const profileSec = document.createElement('div');
    profileSec.className = 'ds-section';
    const profileTitle = document.createElement('div');
    profileTitle.className = 'ds-section-title';
    profileTitle.textContent = 'Enemy Profile';
    profileSec.appendChild(profileTitle);

    const mkSelectRow = (
      label: string,
      value: string,
      values: readonly (string | number)[],
      dataField: string,
      onChange: (next: string) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = `${label}:`;
      lbl.style.minWidth = '70px';
      const select = document.createElement('select');
      select.className = 'ds-select';
      select.dataset.dsField = dataField;
      for (const entry of values) {
        const opt = document.createElement('option');
        opt.value = String(entry);
        opt.textContent = String(entry).replace(/_/g, ' ');
        select.appendChild(opt);
      }
      select.value = value;
      select.onchange = () => onChange(select.value);
      row.append(lbl, select);
      return row;
    };

    const mkNumberRow = (
      label: string,
      value: number,
      min: number,
      max: number,
      dataField: string,
      onChange: (next: number) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = `${label}:`;
      lbl.style.minWidth = '70px';
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'ds-input';
      input.dataset.dsField = dataField;
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.onchange = () => {
        const next = Math.min(max, Math.max(min, +input.value || min));
        input.value = String(next);
        onChange(next);
      };
      row.append(lbl, input);
      return row;
    };

    const nameRow = document.createElement('div');
    nameRow.className = 'ds-row';
    const nameLbl = document.createElement('span');
    nameLbl.className = 'ds-label';
    nameLbl.textContent = 'Name:';
    nameLbl.style.minWidth = '70px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ds-input ds-input--wide';
    nameInput.value = this._creatureDna.name;
    nameInput.oninput = () => {
      this._creatureDna = setEnemyName({ dna: this._creatureDna }, nameInput.value || this._creatureDna.name).dna;
    };
    nameRow.append(nameLbl, nameInput);

    profileSec.append(
      nameRow,
      mkSelectRow('Species', this._creatureDna.species, ENEMY_CREATOR_SPECIES, 'enemy-species', (next) => {
        this._creatureDna = setEnemySpecies({ dna: this._creatureDna }, next as EnemyDNA['species']).dna;
        refreshCreatureFields();
        void this._rebuildLabRig();
      }),
      mkSelectRow('Role', this._creatureDna.combatRole, ENEMY_CREATOR_ROLES, 'enemy-role', (next) => {
        this._creatureDna = setCombatRole({ dna: this._creatureDna }, next as EnemyDNA['combatRole']).dna;
        refreshCreatureFields();
        void this._rebuildLabRig();
      }),
      mkSelectRow('Tier', String(this._creatureDna.tier), ENEMY_CREATOR_TIERS, 'enemy-tier', (next) => {
        this._creatureDna = setTier({ dna: this._creatureDna }, Number(next) as EnemyTierLevel).dna;
        refreshCreatureFields();
        void this._rebuildLabRig();
      }),
      mkSelectRow('Move', this._creatureDna.movement, ENEMY_CREATOR_MOVEMENTS, 'enemy-movement', (next) => {
        this._creatureDna = setMovement({ dna: this._creatureDna }, next as EnemyDNA['movement']).dna;
      }),
      mkSelectRow('Form', this._creatureDna.isBoss ? 'boss' : 'normal', ['normal', 'boss'], 'enemy-form', (next) => {
        this._creatureDna = setIsBoss({ dna: this._creatureDna }, next === 'boss').dna;
        refreshCreatureFields();
        void this._rebuildLabRig();
      }),
    );

    const combatSec = document.createElement('div');
    combatSec.className = 'ds-section';
    const combatTitle = document.createElement('div');
    combatTitle.className = 'ds-section-title';
    combatTitle.textContent = 'Combat';
    combatSec.append(
      combatTitle,
      mkNumberRow('HP', this._creatureDna.baseHp, 1, 999, 'enemy-hp', (next) => {
        this._creatureDna = setBaseHp({ dna: this._creatureDna }, next).dna;
      }),
      mkNumberRow('Damage', this._creatureDna.baseDmg, 1, 250, 'enemy-damage', (next) => {
        this._creatureDna = setBaseDmg({ dna: this._creatureDna }, next).dna;
      }),
      mkNumberRow('Atk rng', this._creatureDna.attackRange, 1, 30, 'enemy-attack-range', (next) => {
        this._creatureDna = setAttackRange({ dna: this._creatureDna }, next).dna;
      }),
      mkNumberRow('Aggro', this._creatureDna.aggroRange, 1, 40, 'enemy-aggro-range', (next) => {
        this._creatureDna = setAggroRange({ dna: this._creatureDna }, next).dna;
      }),
    );

    const colorsSec = document.createElement('div');
    colorsSec.className = 'ds-section';
    const colorsTitle = document.createElement('div');
    colorsTitle.className = 'ds-section-title';
    colorsTitle.textContent = 'Colors';
    const mkColorRow = (label: string, slot: keyof EnemyDNA['colors'], value: string, dataField: string) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = `${label}:`;
      lbl.style.minWidth = '70px';
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'ds-input';
      input.dataset.dsField = dataField;
      input.value = value;
      input.oninput = () => {
        this._creatureDna = setEnemyColor({ dna: this._creatureDna }, slot, input.value).dna;
        void this._rebuildLabRig();
      };
      row.append(lbl, input);
      return row;
    };
    colorsSec.append(
      colorsTitle,
      mkColorRow('Body', 'body', this._creatureDna.colors.body, 'enemy-color-body'),
      mkColorRow('Accent', 'accent', this._creatureDna.colors.accent, 'enemy-color-accent'),
      mkColorRow('Outline', 'outline', this._creatureDna.colors.outline, 'enemy-color-outline'),
    );

    // ── Actions ────────────────────────────────────────────────────────────
    const actSec = document.createElement('div');
    actSec.className = 'ds-section';
    const actRow = document.createElement('div');
    actRow.className = 'ds-row';

    const spawnBtn = document.createElement('button');
    spawnBtn.className = 'ds-btn ds-btn--accent';
    spawnBtn.textContent = '⚔ Spawn Enemy';
    spawnBtn.dataset.dsAction = 'spawn-creature';
    spawnBtn.onclick = () => this._opts.onSpawnCreature(cloneEnemyDna(this._creatureDna));

    const copyBtn = document.createElement('button');
    copyBtn.className = 'ds-btn';
    copyBtn.textContent = '📋 Copy DNA';
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(JSON.stringify(this._creatureDna, null, 2)).catch(() => {});
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy DNA'; }, 1500);
    };

    actRow.append(spawnBtn, copyBtn);
    actSec.appendChild(actRow);

    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.textContent = 'Creature Lab now previews and spawns the same EnemyDNA rigs used by the real enemy creator and runtime enemy loader.';

    const refreshCreatureFields = () => {
      const setValue = (field: string, value: string) => {
        const input = wrap.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-ds-field="${field}"]`);
        if (input) input.value = value;
      };
      setValue('enemy-species', this._creatureDna.species);
      setValue('enemy-role', this._creatureDna.combatRole);
      setValue('enemy-tier', String(this._creatureDna.tier));
      setValue('enemy-movement', this._creatureDna.movement);
      setValue('enemy-form', this._creatureDna.isBoss ? 'boss' : 'normal');
      setValue('enemy-hp', String(this._creatureDna.baseHp));
      setValue('enemy-damage', String(this._creatureDna.baseDmg));
      setValue('enemy-attack-range', String(this._creatureDna.attackRange));
      setValue('enemy-aggro-range', String(this._creatureDna.aggroRange));
      setValue('enemy-color-body', this._creatureDna.colors.body);
      setValue('enemy-color-accent', this._creatureDna.colors.accent);
      setValue('enemy-color-outline', this._creatureDna.colors.outline);
      nameInput.value = this._creatureDna.name;
    };

    wrap.append(prevSec, profileSec, combatSec, colorsSec, actSec, hint);
    return wrap;
  }

  private _initLabRenderer(cv: HTMLCanvasElement): void {
    if (this._labRenderer?.domElement === cv) return;
    this._labRenderer?.dispose();
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

  private async _rebuildLabRig(): Promise<void> {
    if (!this._labScene) return;
    const token = ++this._labBuildToken;
    try {
      const inst = await buildEnemy(cloneEnemyDna(this._creatureDna));
      if (token !== this._labBuildToken) {
        inst.dispose();
        return;
      }
      if (this._labRig) {
        this._labScene.remove(this._labRig.rig.group);
        this._labRig.dispose();
      }
      this._labRig = inst;
      this._labRig.rig.clips.idle?.play();
      this._labScene.add(this._labRig.rig.group);
    } catch (err) {
      console.warn('[DevSandbox] enemy lab preview rebuild failed:', err);
    }
  }

  private _startLabLoop(): void {
    if (this._labRafId !== null) return;
    const tick = () => {
      this._labRafId = requestAnimationFrame(tick);
      const now = performance.now() * 0.001;
      const dt = this._labLastTick > 0 ? Math.min(0.1, now - this._labLastTick) : 1 / 60;
      this._labLastTick = now;
      this._labRotY += 0.008;
      if (this._labRig) {
        this._labRig.rig.group.rotation.y = this._labRotY;
        this._labRig.rig.group.position.y = Math.sin(now * 1.2) * 0.016;
        this._labRig.update(now, dt);
      }
      if (this._labRenderer && this._labScene && this._labCamera) {
        this._labRenderer.render(this._labScene, this._labCamera);
      }
    };
    tick();
  }

  private _stopLabLoop(): void {
    if (this._labRafId !== null) { cancelAnimationFrame(this._labRafId); this._labRafId = null; }
    this._labLastTick = 0;
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  // ── NPC Generator tab ─────────────────────────────────────────────────────

  private _buildNPCGenTab(): HTMLElement {
    const wrap = document.createElement('div');
    const previewSec = document.createElement('div');
    previewSec.className = 'ds-section';
    const cv = document.createElement('canvas');
    cv.width = 280; cv.height = 160;
    cv.style.cssText = 'display:block;width:280px;height:160px;border:1px solid #2a1850;border-radius:3px;background:#0d0b18;margin-bottom:6px;';
    previewSec.appendChild(cv);
    requestAnimationFrame(() => {
      if (this._activeTab !== 'npcgen' || !cv.isConnected) return;
      this._initNpcLabRenderer(cv);
      void this._rebuildNpcLabRig();
      this._startNpcLabLoop();
    });
    wrap.appendChild(previewSec);

    const mkSelectRow = (
      label: string,
      value: string,
      values: readonly (string | number)[],
      dataField: string,
      onChange: (next: string) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = label + ':';
      lbl.style.minWidth = '60px';
      const select = document.createElement('select');
      select.className = 'ds-select';
      select.dataset.dsField = dataField;
      for (const entry of values) {
        const opt = document.createElement('option');
        opt.value = String(entry);
        opt.textContent = String(entry).replace(/_/g, ' ');
        select.appendChild(opt);
      }
      select.value = value;
      select.onchange = () => onChange(select.value);
      row.append(lbl, select);
      return row;
    };

    const mkNumberRow = (label: string, val: number, min: number, max: number, dataField: string, onChange: (v: number) => void) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = label + ':';
      lbl.style.minWidth = '60px';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ds-input';
      inp.dataset.dsField = dataField;
      inp.min = String(min);
      inp.max = String(max);
      inp.value = String(val);
      inp.onchange = () => {
        const next = Math.min(max, Math.max(min, +inp.value || min));
        inp.value = String(next);
        onChange(next);
      };
      row.append(lbl, inp);
      return row;
    };

    const identitySec = document.createElement('div');
    identitySec.className = 'ds-section';
    const identityTitle = document.createElement('div');
    identityTitle.className = 'ds-section-title';
    identityTitle.textContent = 'Identity';

    const nameRow = document.createElement('div');
    nameRow.className = 'ds-row';
    const nameLbl = document.createElement('span');
    nameLbl.className = 'ds-label';
    nameLbl.textContent = 'Name:';
    nameLbl.style.minWidth = '60px';
    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.className = 'ds-input ds-input--wide';
    nameInp.dataset.dsField = 'npc-name';
    nameInp.value = this._npcDna.name;
    nameInp.oninput = () => { this._npcDna = setNpcName({ dna: this._npcDna }, nameInp.value || 'Test NPC').dna; };
    nameRow.append(nameLbl, nameInp);

    identitySec.append(
      identityTitle,
      nameRow,
      mkSelectRow('Species', this._npcDna.species, NPC_CREATOR_SPECIES, 'npc-species', (next) => {
        this._npcDna = setNpcSpecies({ dna: this._npcDna }, next as NpcDNA['species']).dna;
        refreshNpcFields();
        void this._rebuildNpcLabRig();
      }),
      mkSelectRow('Role', this._npcDna.role, NPC_CREATOR_ROLES, 'npc-role', (next) => {
        this._npcDna = setRole({ dna: this._npcDna }, next as NpcDNA['role']).dna;
        refreshNpcFields();
        void this._rebuildNpcLabRig();
      }),
      mkSelectRow('Mood', this._npcDna.personality, NPC_PERSONALITIES, 'npc-personality', (next) => {
        this._npcDna = setPersonality({ dna: this._npcDna }, next as NpcPersonality).dna;
        void this._rebuildNpcLabRig();
      }),
      mkSelectRow('Build', String(this._npcDna.bodyPreset), ['0', '1', '2'], 'npc-body-preset', (next) => {
        this._npcDna = setBodyPreset({ dna: this._npcDna }, Number(next) as 0 | 1 | 2).dna;
        void this._rebuildNpcLabRig();
      }),
    );
    wrap.appendChild(identitySec);

    const colorsSec = document.createElement('div');
    colorsSec.className = 'ds-section';
    const colorsTitle = document.createElement('div');
    colorsTitle.className = 'ds-section-title';
    colorsTitle.textContent = 'Colors';
    const mkColorRow = (label: string, slot: keyof NpcDNA['colors'], value: string, dataField: string) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = `${label}:`;
      lbl.style.minWidth = '60px';
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'ds-input';
      input.dataset.dsField = dataField;
      input.value = value;
      input.oninput = () => {
        this._npcDna = setNpcColor({ dna: this._npcDna }, slot, input.value).dna;
        void this._rebuildNpcLabRig();
      };
      row.append(lbl, input);
      return row;
    };
    colorsSec.append(
      colorsTitle,
      mkColorRow('Primary', 'primary', this._npcDna.colors.primary, 'npc-color-primary'),
      mkColorRow('Accent', 'secondary', this._npcDna.colors.secondary, 'npc-color-secondary'),
      mkColorRow('Skin', 'skin', this._npcDna.colors.skin, 'npc-color-skin'),
      mkColorRow('Hair', 'hair', this._npcDna.colors.hair, 'npc-color-hair'),
      mkColorRow('Eyes', 'eyes', this._npcDna.colors.eyes, 'npc-color-eyes'),
    );
    wrap.appendChild(colorsSec);

    const statSec = document.createElement('div');
    statSec.className = 'ds-section';
    const statTitle = document.createElement('div');
    statTitle.className = 'ds-section-title';
    statTitle.textContent = 'Sandbox Combat';
    statSec.append(
      statTitle,
      mkNumberRow('HP', this._npcHp, 1, 500, 'npc-hp', v => { this._npcHp = v; }),
      mkNumberRow('Damage', this._npcDamage, 1, 100, 'npc-damage', v => { this._npcDamage = v; }),
      mkNumberRow('Count', this._npcCount, 1, 20, 'npc-count', v => { this._npcCount = v; }),
    );
    wrap.appendChild(statSec);

    // ── Actions ──────────────────────────────────────────────────────────
    const actSec = document.createElement('div');
    actSec.className = 'ds-section';
    const actRow = document.createElement('div');
    actRow.className = 'ds-row';

    const spawnBtn = document.createElement('button');
    spawnBtn.className = 'ds-btn ds-btn--accent';
    spawnBtn.textContent = '⚔ Spawn NPC Stand-In';
    spawnBtn.dataset.dsAction = 'spawn-npc';
    spawnBtn.onclick = () => {
      if (this._opts.onSpawnNPC) {
        this._opts.onSpawnNPC(cloneNpcDna(this._npcDna), this._npcHp, this._npcDamage, this._npcCount);
      }
    };

    const saveBtn = document.createElement('button');
    saveBtn.className = 'ds-btn';
    saveBtn.textContent = '💾 Save Preset';
    saveBtn.onclick = () => {
      const preset: NPCPreset = { dna: cloneNpcDna(this._npcDna), hp: this._npcHp, damage: this._npcDamage };
      const idx = this._npcPresets.findIndex(p => p.dna.name === preset.dna.name);
      if (idx >= 0) this._npcPresets[idx] = preset;
      else this._npcPresets.push(preset);
      this._renderNpcPresetList();
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => { saveBtn.textContent = '💾 Save Preset'; }, 1200);
    };

    actRow.append(spawnBtn, saveBtn);
    actSec.appendChild(actRow);
    wrap.appendChild(actSec);

    // ── Saved Presets ────────────────────────────────────────────────────
    const presetSec = document.createElement('div');
    presetSec.className = 'ds-section';
    const presetTitle = document.createElement('div');
    presetTitle.className = 'ds-section-title';
    presetTitle.textContent = 'Saved Presets';
    const presetList = document.createElement('div');
    presetList.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:140px;overflow-y:auto;';
    this._npcPresetListEl = presetList;
    presetSec.append(presetTitle, presetList);
    wrap.appendChild(presetSec);
    this._renderNpcPresetList();

    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.textContent = 'Sandbox NPCs use the real NpcDNA visual builder, then ride the existing SlimeEnemy combat wrapper so HP / damage / count controls still work in the arena.';
    wrap.appendChild(hint);

    const refreshNpcFields = () => {
      const setValue = (field: string, value: string) => {
        const input = wrap.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-ds-field="${field}"]`);
        if (input) input.value = value;
      };
      setValue('npc-name', this._npcDna.name);
      setValue('npc-species', this._npcDna.species);
      setValue('npc-role', this._npcDna.role);
      setValue('npc-personality', this._npcDna.personality);
      setValue('npc-body-preset', String(this._npcDna.bodyPreset));
      setValue('npc-color-primary', this._npcDna.colors.primary);
      setValue('npc-color-secondary', this._npcDna.colors.secondary);
      setValue('npc-color-skin', this._npcDna.colors.skin);
      setValue('npc-color-hair', this._npcDna.colors.hair);
      setValue('npc-color-eyes', this._npcDna.colors.eyes);
    };

    return wrap;
  }

  private _renderNpcPresetList(): void {
    const list = this._npcPresetListEl;
    if (!list) return;
    list.innerHTML = '';
    if (this._npcPresets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ds-hint';
      empty.textContent = 'No presets saved yet.';
      list.appendChild(empty);
      return;
    }
    for (const preset of this._npcPresets) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const loadBtn = document.createElement('button');
      loadBtn.className = 'ds-btn';
      loadBtn.style.fontSize = '.72rem';
      loadBtn.textContent = '↳ Load';
      loadBtn.onclick = () => {
        this._npcDna = cloneNpcDna(preset.dna);
        this._npcHp = preset.hp;
        this._npcDamage = preset.damage;
        void this._rebuildNpcLabRig();
        // Re-render tab to sync inputs
        this._switchTab('npcgen');
      };
      const spawnBtn = document.createElement('button');
      spawnBtn.className = 'ds-btn ds-btn--accent';
      spawnBtn.style.fontSize = '.72rem';
      spawnBtn.textContent = '⚔';
      spawnBtn.title = 'Spawn this preset';
      spawnBtn.onclick = () => {
        if (this._opts.onSpawnNPC) {
          this._opts.onSpawnNPC(cloneNpcDna(preset.dna), preset.hp, preset.damage, this._npcCount);
        }
      };
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:.74rem;color:#c0a0f0;flex:1;';
      lbl.textContent = `${preset.dna.name || 'Unnamed'}  HP:${preset.hp}  DMG:${preset.damage}`;
      row.append(loadBtn, spawnBtn, lbl);
      list.appendChild(row);
    }
  }

  private _initNpcLabRenderer(cv: HTMLCanvasElement): void {
    if (this._npcLabRenderer?.domElement === cv) return;
    this._npcLabRenderer?.dispose();
    this._npcLabRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    this._npcLabRenderer.setSize(280, 160);
    this._npcLabRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this._npcLabRenderer.setClearColor(0x0d0b18);
    this._npcLabScene  = new THREE.Scene();
    this._npcLabCamera = new THREE.PerspectiveCamera(42, 280 / 160, 0.1, 50);
    this._npcLabCamera.position.set(0.4, 1.4, 3.0);
    this._npcLabCamera.lookAt(0, 1.0, 0);
    this._npcLabScene.add(new THREE.AmbientLight(0xffe8d0, 0.6));
    const key = new THREE.DirectionalLight(0xff8060, 1.1); key.position.set(3, 5, 3);
    this._npcLabScene.add(key);
    const rim = new THREE.DirectionalLight(0xff3030, 0.4); rim.position.set(-3, 2, -2);
    this._npcLabScene.add(rim);
  }

  private async _rebuildNpcLabRig(): Promise<void> {
    if (!this._npcLabScene) return;
    const token = ++this._npcLabBuildToken;
    try {
      const inst = await buildNpc(cloneNpcDna(this._npcDna));
      if (token !== this._npcLabBuildToken) {
        inst.dispose();
        return;
      }
      if (this._npcLabRig) {
        this._npcLabScene.remove(this._npcLabRig.root);
        this._npcLabRig.dispose();
      }
      this._npcLabRig = inst;
      this._npcLabRig.setAnimState('idle');
      this._npcLabScene.add(this._npcLabRig.root);
    } catch (err) {
      console.warn('[DevSandbox] npc lab preview rebuild failed:', err);
    }
  }

  private _startNpcLabLoop(): void {
    if (this._npcLabRafId !== null) return;
    const tick = () => {
      this._npcLabRafId = requestAnimationFrame(tick);
      const now = performance.now() * 0.001;
      const dt = this._npcLabLastTick > 0 ? Math.min(0.1, now - this._npcLabLastTick) : 1 / 60;
      this._npcLabLastTick = now;
      this._npcLabRotY += 0.012;
      if (this._npcLabRig) {
        this._npcLabRig.root.rotation.y = this._npcLabRotY;
        this._npcLabRig.update(now, dt);
      }
      if (this._npcLabRenderer && this._npcLabScene && this._npcLabCamera) {
        this._npcLabRenderer.render(this._npcLabScene, this._npcLabCamera);
      }
    };
    tick();
  }

  private _stopNpcLabLoop(): void {
    if (this._npcLabRafId !== null) { cancelAnimationFrame(this._npcLabRafId); this._npcLabRafId = null; }
    this._npcLabLastTick = 0;
  }

  // ── Wave Spawner tab ──────────────────────────────────────────────────────

  private _buildWaveTab(): HTMLElement {
    const wrap = document.createElement('div');

    const cfgSec = document.createElement('div');
    cfgSec.className = 'ds-section';
    const cfgTitle = document.createElement('div');
    cfgTitle.className = 'ds-section-title';
    cfgTitle.textContent = 'Wave Configuration';

    const mkRow = (label: string, val: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
      const row = document.createElement('div');
      row.className = 'ds-row';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = label + ':';
      lbl.style.minWidth = '80px';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ds-input';
      inp.min = String(min); inp.max = String(max); inp.step = String(step);
      inp.value = String(val);
      inp.onchange = () => { const v = Math.min(max, Math.max(min, +inp.value || min)); onChange(v); inp.value = String(v); };
      row.append(lbl, inp);
      return row;
    };

    cfgSec.append(cfgTitle,
      mkRow('Count',    this._waveCount,    1, 50,   1,   v => { this._waveCount = v; }),
      mkRow('Interval', this._waveInterval, 0.1, 5, 0.1, v => { this._waveInterval = v; }),
      mkRow('HP',       this._waveHp,       1, 500,  1,   v => { this._waveHp = v; }),
      mkRow('Damage',   this._waveDamage,   1, 100,  1,   v => { this._waveDamage = v; }),
    );
    wrap.appendChild(cfgSec);

    // Status + controls
    const ctrlSec = document.createElement('div');
    ctrlSec.className = 'ds-section';
    const ctrlRow = document.createElement('div');
    ctrlRow.className = 'ds-row';

    const runBtn = document.createElement('button');
    runBtn.className = 'ds-btn ds-btn--accent';
    runBtn.textContent = '▶ Start Wave';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'ds-btn ds-btn--danger';
    stopBtn.textContent = '■ Stop';
    stopBtn.style.display = 'none';

    const statusEl = document.createElement('div');
    statusEl.className = 'ds-hint';
    statusEl.style.marginTop = '6px';
    statusEl.textContent = 'Ready';

    runBtn.onclick = () => {
      if (this._waveRunning) return;
      this._waveRunning = true;
      this._waveSpawned = 0;
      runBtn.style.display = 'none';
      stopBtn.style.display = '';
      statusEl.textContent = `Spawning 0 / ${this._waveCount}…`;
      this._waveTimerId = setInterval(() => {
        if (this._waveSpawned >= this._waveCount) {
          this._stopWave();
          runBtn.style.display = '';
          stopBtn.style.display = 'none';
          statusEl.textContent = `Wave complete — ${this._waveCount} enemies spawned.`;
          return;
        }
        this._waveSpawned++;
        this._opts.onRunWave?.(1, 0, this._waveHp, this._waveDamage);
        statusEl.textContent = `Spawning ${this._waveSpawned} / ${this._waveCount}…`;
      }, this._waveInterval * 1000);
    };

    stopBtn.onclick = () => {
      this._stopWave();
      runBtn.style.display = '';
      stopBtn.style.display = 'none';
      statusEl.textContent = `Stopped at ${this._waveSpawned} / ${this._waveCount}.`;
    };

    ctrlRow.append(runBtn, stopBtn);
    ctrlSec.append(ctrlRow, statusEl);
    wrap.appendChild(ctrlSec);

    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.textContent = 'Enemies spawn one at a time at the configured interval. Use Kill All in the Enemies tab to clear the arena between runs.';
    wrap.appendChild(hint);

    return wrap;
  }

  private _stopWave(): void {
    if (this._waveTimerId !== null) { clearInterval(this._waveTimerId); this._waveTimerId = null; }
    this._waveRunning = false;
  }

  // ── Asset Browser tab ─────────────────────────────────────────────────────

  private _buildAssetsTab(): HTMLElement {
    const wrap = document.createElement('div');

    // ── Role filter tabs ───────────────────────────────────────────────────
    const roleSec = document.createElement('div');
    roleSec.className = 'ds-section';
    const roleRow = document.createElement('div');
    roleRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    const roles: Array<{ id: 'all' | 'enemy' | 'npc' | 'player'; label: string }> = [
      { id: 'all',    label: 'All' },
      { id: 'enemy',  label: '⚔ Enemies' },
      { id: 'npc',    label: '👥 NPCs' },
      { id: 'player', label: '🧙 Player' },
    ];
    const roleBtns: HTMLButtonElement[] = [];
    roles.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'ds-btn';
      btn.textContent = r.label;
      btn.style.cssText = 'font-size:.7rem;padding:2px 8px;';
      btn.onclick = () => {
        this._assetRoleTab = r.id;
        roleBtns.forEach((b, i) => {
          b.style.background = i === roles.findIndex(x => x.id === r.id) ? '#7040cc' : '';
        });
        renderList();
      };
      if (r.id === this._assetRoleTab) btn.style.background = '#7040cc';
      roleBtns.push(btn);
      roleRow.appendChild(btn);
    });
    roleSec.appendChild(roleRow);
    wrap.appendChild(roleSec);

    // ── Filter bar ─────────────────────────────────────────────────────────
    const filterSec = document.createElement('div');
    filterSec.className = 'ds-section';
    const filterRow = document.createElement('div');
    filterRow.className = 'ds-row';
    const filterLbl = document.createElement('span');
    filterLbl.className = 'ds-label';
    filterLbl.textContent = 'Filter:';
    const filterInp = document.createElement('input');
    filterInp.type = 'text';
    filterInp.className = 'ds-input ds-input--wide';
    filterInp.placeholder = 'e.g. skeleton, goblin, fay…';
    filterInp.value = this._assetFilter;
    filterInp.oninput = () => { this._assetFilter = filterInp.value.toLowerCase(); renderList(); };
    filterRow.append(filterLbl, filterInp);
    filterSec.appendChild(filterRow);
    wrap.appendChild(filterSec);

    // ── Model list ─────────────────────────────────────────────────────────
    const listSec = document.createElement('div');
    listSec.className = 'ds-section';
    const listTitle = document.createElement('div');
    listTitle.className = 'ds-section-title';
    listTitle.textContent = `${CHAR_MODELS.length} models in manifest`;
    const listEl = document.createElement('div');
    listEl.style.cssText = 'display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;';
    listSec.append(listTitle, listEl);
    wrap.appendChild(listSec);

    const renderList = () => {
      listEl.innerHTML = '';
      const filter   = this._assetFilter;
      const roleTab  = this._assetRoleTab;

      let shown = CHAR_MODELS as import('@/characters/charManifest').CharModelDef[];
      if (roleTab !== 'all') shown = shown.filter(m => (m.roles as string[]).includes(roleTab));
      if (filter) shown = shown.filter(m =>
        m.name.toLowerCase().includes(filter) ||
        m.packId.toLowerCase().includes(filter) ||
        (m.tags as string[]).some(t => t.includes(filter)),
      );

      listTitle.textContent = `${shown.length} / ${CHAR_MODELS.length} models`;

      for (const model of shown) {
        const pack    = CHAR_PACKS.find(p => p.id === model.packId);
        const isPreviewed = model.id === this._previewModelId;

        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:4px;padding:2px 3px;border-radius:3px;${isPreviewed ? 'background:rgba(112,64,204,.25);outline:1px solid #7040cc55;' : ''}`;

        const icon = document.createElement('span');
        icon.textContent = pack?.icon ?? '📦';
        icon.style.cssText = 'font-size:.85rem;min-width:16px;';

        const nameWrap = document.createElement('div');
        nameWrap.style.cssText = 'flex:1;min-width:0;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:.74rem;color:#c0a0f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = model.name;
        nameEl.title = model.path;
        const packLabel = document.createElement('div');
        packLabel.style.cssText = 'font-size:.62rem;color:#4a3860;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        packLabel.textContent = pack?.name ?? model.packId;
        nameWrap.append(nameEl, packLabel);

        // Badge for animation availability
        const hasSelfAnims  = !!model.animRig || !!model.animRigB;
        const animBadge = document.createElement('span');
        animBadge.style.cssText = 'font-size:.6rem;padding:1px 4px;border-radius:2px;flex-shrink:0;';
        if (hasSelfAnims) {
          animBadge.textContent = '🎬';
          animBadge.title = `Has animation rig: ${model.animRig ?? model.animRigB}`;
          animBadge.style.background = 'rgba(0,160,80,.2)';
          animBadge.style.color = '#40e080';
        } else {
          animBadge.textContent = 'static';
          animBadge.title = 'No animation rig — may have embedded clips';
          animBadge.style.background = 'rgba(80,80,80,.2)';
          animBadge.style.color = '#606060';
        }

        // Preview button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'ds-btn';
        prevBtn.style.cssText = 'font-size:.65rem;padding:1px 5px;flex-shrink:0;';
        prevBtn.textContent = isPreviewed ? '▶ On' : '▶ View';
        prevBtn.title = `Spawn ${model.name} as inspection model`;
        prevBtn.onclick = async () => {
          prevBtn.textContent = '…';
          prevBtn.disabled = true;
          this._previewModelId = model.id;
          this._updatePreviewInspector(model, []);
          if (this._previewStatusEl) this._previewStatusEl.textContent = `Loading ${model.name}…`;

          const clips = await this._opts.onPreviewModel?.(model) ?? [];
          this._updatePreviewInspector(model, clips);
          renderList(); // refresh highlight
        };

        // Equip button
        const swapBtn = document.createElement('button');
        swapBtn.className = 'ds-btn';
        swapBtn.style.cssText = 'font-size:.65rem;padding:1px 5px;flex-shrink:0;';
        swapBtn.textContent = '⇄';
        swapBtn.title = `Equip ${model.name} on player`;
        swapBtn.onclick = () => {
          this._opts.onSwapPlayerModel?.(model.path);
          swapBtn.textContent = '✓';
          setTimeout(() => { swapBtn.textContent = '⇄'; }, 1000);
        };

        row.append(icon, nameWrap, animBadge, prevBtn, swapBtn);
        listEl.appendChild(row);
      }
    };

    renderList();

    // ── Animation Inspector ────────────────────────────────────────────────
    const animSec = document.createElement('div');
    animSec.className = 'ds-section';
    const animTitle = document.createElement('div');
    animTitle.className = 'ds-section-title';
    animTitle.textContent = 'Animation Inspector';

    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:.72rem;color:#786090;padding:4px 0;font-style:italic;';
    statusEl.textContent = '← Click ▶ View on any model to inspect it';
    this._previewStatusEl = statusEl;

    const clipListEl = document.createElement('div');
    clipListEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;';
    this._previewClipListEl = clipListEl;

    const stopBtn = document.createElement('button');
    stopBtn.className = 'ds-btn';
    stopBtn.style.cssText = 'font-size:.68rem;margin-top:5px;';
    stopBtn.textContent = '■ Stop';
    stopBtn.onclick = () => {
      this._opts.onPlayPreviewAnim?.('');
      this._previewAnimBtns.forEach(b => { (b as HTMLButtonElement).style.background = ''; });
    };

    animSec.append(animTitle, statusEl, clipListEl, stopBtn);
    wrap.appendChild(animSec);

    // ── Hint ───────────────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.className = 'ds-hint';
    hint.textContent = '▶ View spawns an isolated preview at origin. ⇄ Equips on the player. 🎬 = has animation rig.';
    wrap.appendChild(hint);

    return wrap;
  }

  /** Update the animation inspector section after a model is previewed. */
  private _updatePreviewInspector(model: import('@/characters/charManifest').CharModelDef, clips: string[]): void {
    if (!this._previewStatusEl || !this._previewClipListEl) return;

    if (clips.length === 0) {
      this._previewStatusEl.textContent = `${model.name} — no animation clips found`;
      this._previewStatusEl.style.color = '#9070a0';
    } else {
      this._previewStatusEl.textContent = `${model.name} — ${clips.length} clip${clips.length > 1 ? 's' : ''} available`;
      this._previewStatusEl.style.color = '#40e080';
    }

    this._previewClipListEl.innerHTML = '';
    this._previewAnimBtns = [];

    for (const clipName of clips) {
      const btn = document.createElement('button');
      btn.className = 'ds-btn';
      btn.style.cssText = 'font-size:.65rem;padding:2px 7px;';
      btn.textContent = clipName;
      btn.title = `Play animation: ${clipName}`;
      btn.onclick = () => {
        this._opts.onPlayPreviewAnim?.(clipName);
        this._previewAnimBtns.forEach(b => { (b as HTMLButtonElement).style.background = ''; });
        btn.style.background = '#7040cc';
      };
      this._previewClipListEl.appendChild(btn);
      this._previewAnimBtns.push(btn);
    }
  }

  // ── Cheats tab ────────────────────────────────────────────────────────────

  private _buildCheatsTab(): HTMLElement {
    const wrap = document.createElement('div');
    const o = this._opts;

    const mk = (title: string): HTMLElement => {
      const sec = document.createElement('div');
      sec.className = 'ds-section';
      const t = document.createElement('div');
      t.className = 'ds-section-title';
      t.textContent = title;
      sec.appendChild(t);
      return sec;
    };

    const mkToggle = (label: string, sub: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:rgba(0,0,0,.25);border:1px solid #1a1228;border-radius:3px;margin-bottom:5px;';
      const info = document.createElement('div');
      const nm = document.createElement('div');
      nm.style.cssText = 'font-size:.82rem;color:#c0a0f0;';
      nm.textContent = label;
      const sb = document.createElement('div');
      sb.style.cssText = 'font-size:.7rem;color:#4a3860;margin-top:2px;';
      sb.textContent = sub;
      info.append(nm, sb);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = get();
      cb.style.cssText = 'accent-color:#7040cc;width:15px;height:15px;cursor:pointer;';
      cb.onchange = () => { set(cb.checked); nm.style.color = cb.checked ? '#e0b8ff' : '#c0a0f0'; };
      if (cb.checked) nm.style.color = '#e0b8ff';
      row.append(info, cb);
      return row;
    };

    // ── Princess Power ────────────────────────────────────────────────────
    const powerSec = mk('Princess Power');
    if (o.getGodMode && o.onGodMode) {
      powerSec.appendChild(mkToggle('God Mode', 'Player takes no damage', o.getGodMode, o.onGodMode));
    }
    if (o.getHpInfo && o.onSetHp && o.onFillHp) {
      const { hp, maxHp } = o.getHpInfo();
      const sliderRow = document.createElement('div');
      sliderRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px;';
      const lbl = document.createElement('span');
      lbl.className = 'ds-label';
      lbl.textContent = 'HP:';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '1';
      slider.max = String(maxHp);
      slider.value = String(Math.max(1, hp));
      slider.style.cssText = 'flex:1;accent-color:#7040cc;';
      const val = document.createElement('span');
      val.className = 'ds-label';
      val.textContent = slider.value;
      slider.oninput = () => { val.textContent = slider.value; o.onSetHp!(+slider.value); };
      sliderRow.append(lbl, slider, val);
      powerSec.appendChild(sliderRow);

      const fillBtn = document.createElement('button');
      fillBtn.className = 'ds-btn ds-btn--accent';
      fillBtn.textContent = '❤ Fill HP';
      fillBtn.onclick = () => { o.onFillHp!(); const i = o.getHpInfo!(); slider.value = String(i.maxHp); val.textContent = String(i.maxHp); };
      powerSec.appendChild(fillBtn);
    }
    wrap.appendChild(powerSec);

    // ── Spells ────────────────────────────────────────────────────────────
    const spellSec = mk('Spells');
    if (o.getInstantCooldowns && o.onInstantCooldowns) {
      spellSec.appendChild(mkToggle('Instant Cooldowns', 'Cast every spell without waiting', o.getInstantCooldowns, o.onInstantCooldowns));
    }
    const allSpellsBtn = document.createElement('button');
    allSpellsBtn.className = 'ds-btn';
    allSpellsBtn.textContent = '✨ Grant All Spells + Abilities';
    allSpellsBtn.title = 'Unlock all 8 spells + all species abilities (Q R Z X)';
    allSpellsBtn.onclick = () => o.onGrantAllSpells();
    spellSec.appendChild(allSpellsBtn);

    if (o.onGrantAllAbilities) {
      const allAbilitiesBtn = document.createElement('button');
      allAbilitiesBtn.className = 'ds-btn';
      allAbilitiesBtn.textContent = '🪄 Grant All Abilities';
      allAbilitiesBtn.title = 'Grant species Q/R abilities + Blink (Z) + Levitate (X)';
      allAbilitiesBtn.onclick = () => o.onGrantAllAbilities!();
      spellSec.appendChild(allAbilitiesBtn);
    }
    wrap.appendChild(spellSec);

    // ── Combat ────────────────────────────────────────────────────────────
    const combatSec = mk('Combat');
    const combatRow = document.createElement('div');
    combatRow.className = 'ds-row';
    if (o.onKillAllInRoom) {
      const kb = document.createElement('button');
      kb.className = 'ds-btn ds-btn--danger';
      kb.textContent = '☠ Kill All';
      kb.onclick = () => o.onKillAllInRoom!();
      combatRow.appendChild(kb);
    }
    if (o.onForceFlee) {
      const fb = document.createElement('button');
      fb.className = 'ds-btn';
      fb.textContent = '💛 Force Flee';
      fb.onclick = () => o.onForceFlee!();
      combatRow.appendChild(fb);
    }
    combatSec.appendChild(combatRow);
    wrap.appendChild(combatSec);

    // ── Teleport ──────────────────────────────────────────────────────────
    if (o.onTeleportRoom) {
      const tpSec = mk('Teleport (interior)');
      const rooms: [string, string][] = [
        ['cell_start', 'Cell·Start'], ['library_small', 'Library·S'],
        ['library_large', 'Library·L'], ['corridor_ew', 'Corridor E–W'],
        ['corridor_ns', 'Corridor N–S'],
      ];
      const tpRow = document.createElement('div');
      tpRow.className = 'ds-row';
      for (const [id, label] of rooms) {
        const b = document.createElement('button');
        b.className = 'ds-btn';
        b.style.fontSize = '.72rem';
        b.textContent = label;
        b.onclick = () => o.onTeleportRoom!(id);
        tpRow.appendChild(b);
      }
      tpSec.appendChild(tpRow);
      wrap.appendChild(tpSec);
    }

    // ── Overworld ─────────────────────────────────────────────────────────
    if (o.getFlyMode && o.onFlyMode) {
      const owSec = mk('Overworld');
      owSec.appendChild(mkToggle('Fly Mode', 'Space=up  F=down  2.5× speed', o.getFlyMode, o.onFlyMode));
      if (o.getSettlements && o.onFastTravel) {
        const ftLbl = document.createElement('div');
        ftLbl.className = 'ds-section-title';
        ftLbl.textContent = 'Fast Travel';
        owSec.appendChild(ftLbl);
        const ftRow = document.createElement('div');
        ftRow.className = 'ds-row';
        for (const s of o.getSettlements()) {
          const b = document.createElement('button');
          b.className = 'ds-btn';
          b.style.fontSize = '.72rem';
          b.textContent = s.name;
          b.onclick = () => o.onFastTravel!(s.worldPos);
          ftRow.appendChild(b);
        }
        owSec.appendChild(ftRow);
      }
      wrap.appendChild(owSec);
    }

    return wrap;
  }

  private _ensureStyles(): void {
    if (document.getElementById('dev-sandbox-css')) return;
    const s = document.createElement('style');
    s.id = 'dev-sandbox-css';
    s.textContent = DS_CSS;
    document.head.appendChild(s);
  }
}
