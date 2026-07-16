// ── SpellBook ────────────────────────────────────────────────────────────────
//
//  WoW-style grimoire overlay.  Press K to open/close.
//  Shows all known spells and lets the player assign them to 4 action slots.
//  Slots 1–4 map to the action bar at the bottom of the HUD.

import { injectHudTheme } from './hudTheme';
import type { ProgressionSystem } from '@/progression/ProgressionSystem';

// ── Spell metadata ────────────────────────────────────────────────────────

const SPELL_GLYPH: Record<string, string> = {
  magic_bolt:   '🔵',
  flame_dart:   '🔥',
  intimidate:   '💢',
  nova_burst:   '💥',
  chain_arc:    '⚡',
  void_rift:    '🌀',
  battle_hymn:  '🎵',
  mass_animate: '💀',
};

const SPELL_LABEL: Record<string, string> = {
  magic_bolt:   'Magic Bolt',
  flame_dart:   'Flame Dart',
  intimidate:   'Intimidate',
  nova_burst:   'Nova Burst',
  chain_arc:    'Chain Arc',
  void_rift:    'Void Rift',
  battle_hymn:  'Battle Hymn',
  mass_animate: 'Mass Animate',
};
const SPELL_DESC: Record<string, string> = {
  magic_bolt:   'A focused bolt of arcane energy.',
  flame_dart:   'A conjured dart of living fire.',
  intimidate:   'AOE cry that sends nearby creatures fleeing. (Dev spell)',
  nova_burst:   'Player-centred radial explosion. 12u radius · 8 dmg · 15s cooldown.',
  chain_arc:    'Lightning bolt that bounces up to 3 times. Each bounce −15% damage. 5s cooldown.',
  void_rift:    'Stationary DoT zone at cursor. 3 dmg/s for 8 seconds. 12s cooldown.',
  battle_hymn:  'Aura buff: recruited minions deal +50% damage for 12s. 20s cooldown.',
  mass_animate: 'Raises dead enemy corpses as temporary skeletal minions. [Conductor tier 2] 30s cooldown.',
};

// ── CSS ───────────────────────────────────────────────────────────────────

const SB_CSS = `
.sb-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 9200;
  background: rgba(0,0,0,.62);
  backdrop-filter: blur(4px);
  opacity: 0; transition: opacity .18s ease;
}
.sb-overlay.sb-open { opacity: 1; }

.sb-card {
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius);
  padding: 24px 28px 20px;
  width: min(92vw, 500px);
  display: flex; flex-direction: column; gap: 20px;
  box-shadow: var(--hud-shadow);
}

/* ── Header ── */
.sb-header {
  display: flex; align-items: center; justify-content: space-between;
}
.sb-title {
  font-family: var(--hud-font-serif);
  font-size: 17px; letter-spacing: 3px; text-transform: uppercase;
  color: var(--hud-text);
}
.sb-close {
  background: none; border: 1px solid var(--hud-border);
  color: var(--hud-muted); font-size: 13px; cursor: pointer;
  border-radius: var(--hud-radius-sm); padding: 4px 9px;
  font-family: var(--hud-font-mono);
  transition: color .12s, border-color .12s;
}
.sb-close:hover { color: var(--hud-text); border-color: var(--hud-info); }

/* ── Sections ── */
.sb-section { display: flex; flex-direction: column; gap: 10px; }
.sb-section-label {
  font-family: var(--hud-font-serif); font-size: 8px;
  letter-spacing: 3px; text-transform: uppercase;
  color: var(--hud-muted); border-bottom: 1px solid var(--hud-border);
  padding-bottom: 5px;
}

/* ── Equipped slots row ── */
.sb-slots-row { display: flex; gap: 8px; }

.sb-slot {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 9px 6px 7px;
  background: rgba(0,0,0,.35); border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm); cursor: pointer; position: relative;
  transition: border-color .12s, box-shadow .12s;
  min-width: 0;
}
.sb-slot:hover { border-color: var(--hud-border); }
.sb-slot--active {
  border-color: var(--hud-info);
  box-shadow: 0 0 10px rgba(68,221,255,.22);
}

.sb-slot-num {
  font-family: var(--hud-font-serif); font-size: 11px; font-weight: bold;
  color: var(--hud-muted); line-height: 1;
  transition: color .12s;
}
.sb-slot--active .sb-slot-num { color: var(--hud-info); }

.sb-slot-name {
  font-family: var(--hud-font-body);
  font-size: 11px; color: var(--hud-muted);
  text-align: center; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 90px;
  transition: color .12s;
}
.sb-slot--active .sb-slot-name { color: var(--hud-text); }
.sb-slot--empty .sb-slot-name  { font-style: italic; }

.sb-slot-clear {
  position: absolute; top: 2px; right: 4px;
  background: none; border: none; color: #2a1e38;
  font-size: 9px; cursor: pointer; line-height: 1; padding: 0;
  transition: color .1s;
}
.sb-slot-clear:hover { color: #9d7cce; }

/* ── Known spells list ── */
.sb-spell-list { display: flex; flex-direction: column; gap: 8px; }

.sb-spell-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 12px; background: rgba(0,0,0,.25);
  border: 1px solid var(--hud-border); border-radius: var(--hud-radius-sm);
  transition: border-color .12s;
}
.sb-spell-row:hover { border-color: var(--hud-info); }
.sb-spell-glyph { font-size: 18px; flex-shrink: 0; }
.sb-spell-info { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.sb-spell-name {
  font-family: var(--hud-font-serif); font-size: 13px; color: var(--hud-text);
}
.sb-spell-desc {
  font-family: var(--hud-font-body);
  font-size: 11px; color: var(--hud-muted); font-style: italic;
}

/* Assign-to-slot buttons [1][2][3][4] */
.sb-assign-row { display: flex; gap: 5px; flex-shrink: 0; }
.sb-assign-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.4); border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm); color: var(--hud-muted);
  font-family: var(--hud-font-mono); font-size: 11px;
  cursor: pointer; transition: color .1s, border-color .1s, background .1s;
}
.sb-assign-btn:hover   { background: rgba(68,221,255,.1); border-color: var(--hud-info); color: var(--hud-text); }
.sb-assign-btn--active { background: rgba(68,221,255,.15); border-color: var(--hud-info); color: var(--hud-info); }

/* ── Footer hint ── */
.sb-hint {
  font-family: monospace; font-size: 9px; color: #2a1e38;
  text-align: center; letter-spacing: 0.5px; margin-top: -6px;
}
`;

// ── SpellBook class ───────────────────────────────────────────────────────

export class SpellBook {
  private readonly _overlay: HTMLElement;
  private _isOpen = false;
  private readonly _prog: ProgressionSystem;

  constructor(prog: ProgressionSystem) {
    this._prog = prog;
    injectHudTheme();
    this._ensureStyles();

    this._overlay = document.createElement('div');
    this._overlay.className = 'sb-overlay';
    document.body.appendChild(this._overlay);
  }

  get isOpen(): boolean { return this._isOpen; }

  open(): void {
    this._isOpen = true;
    this._render();
    this._overlay.style.display = 'flex';
    // allow display:flex to take effect before opacity transition fires
    requestAnimationFrame(() => this._overlay.classList.add('sb-open'));
  }

  close(): void {
    this._isOpen = false;
    this._overlay.classList.remove('sb-open');
    setTimeout(() => {
      if (!this._isOpen) this._overlay.style.display = 'none';
    }, 200);
  }

  toggle(): void {
    this._isOpen ? this.close() : this.open();
  }

  dispose(): void {
    this._overlay.remove();
  }

  // ── Private ────────────────────────────────────────────────────────────

  private _render(): void {
    this._overlay.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'sb-card';

    // ── Header ────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'sb-header';

    const title = document.createElement('span');
    title.className = 'sb-title';
    title.textContent = '✦  Grimoire';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sb-close';
    closeBtn.textContent = 'K  ✕';
    closeBtn.onclick = () => this.close();

    header.append(title, closeBtn);

    // ── Equipped slots ─────────────────────────────────────────────────
    const eqSection = document.createElement('div');
    eqSection.className = 'sb-section';

    const eqLabel = document.createElement('div');
    eqLabel.className = 'sb-section-label';
    eqLabel.textContent = 'Equipped  —  press 1 – 4 to select active slot';

    const slotsRow = document.createElement('div');
    slotsRow.className = 'sb-slots-row';

    const equipped = this._prog.getEquippedSlots();
    for (let i = 0; i < 4; i++) {
      const spellId = equipped[i];
      const slotEl  = document.createElement('div');
      slotEl.className = 'sb-slot' + (spellId ? '' : ' sb-slot--empty');

      const numEl = document.createElement('span');
      numEl.className = 'sb-slot-num';
      numEl.textContent = String(i + 1);

      const nameEl = document.createElement('span');
      nameEl.className = 'sb-slot-name';
      nameEl.textContent = spellId ? (SPELL_LABEL[spellId] ?? spellId) : '— empty —';

      const clearBtn = document.createElement('button');
      clearBtn.className = 'sb-slot-clear';
      clearBtn.textContent = '✕';
      clearBtn.title = 'Unequip';
      clearBtn.onclick = (ev) => {
        ev.stopPropagation();
        this._prog.unequipSlot(i);
        this._render();
      };

      slotEl.append(numEl, nameEl, clearBtn);
      slotsRow.appendChild(slotEl);
    }
    eqSection.append(eqLabel, slotsRow);

    // ── Known spells ───────────────────────────────────────────────────
    const knownSection = document.createElement('div');
    knownSection.className = 'sb-section';

    const knownLabel = document.createElement('div');
    knownLabel.className = 'sb-section-label';
    knownLabel.textContent = 'Known Spells';

    const spellList = document.createElement('div');
    spellList.className = 'sb-spell-list';

    // magic_bolt is the starter spell (always available)
    const unlocked = this._prog.getUnlockedSpells();
    const known = unlocked.includes('magic_bolt') ? unlocked : ['magic_bolt', ...unlocked];

    for (const id of known) {
      const row = document.createElement('div');
      row.className = 'sb-spell-row';

      // Spell glyph icon
      const glyphEl = document.createElement('span');
      glyphEl.className = 'sb-spell-glyph';
      glyphEl.textContent = SPELL_GLYPH[id] ?? '✦';

      const info = document.createElement('div');
      info.className = 'sb-spell-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'sb-spell-name';
      nameEl.textContent = SPELL_LABEL[id] ?? id;

      const descEl = document.createElement('span');
      descEl.className = 'sb-spell-desc';
      descEl.textContent = SPELL_DESC[id] ?? '';

      info.append(nameEl, descEl);

      // [1][2][3][4] assign buttons
      const assignRow = document.createElement('div');
      assignRow.className = 'sb-assign-row';

      const currentSlots = this._prog.getEquippedSlots();
      for (let i = 0; i < 4; i++) {
        const btn = document.createElement('button');
        const isAssigned = currentSlots[i] === id;
        btn.className = 'sb-assign-btn' + (isAssigned ? ' sb-assign-btn--active' : '');
        btn.textContent = String(i + 1);
        btn.title = isAssigned ? `Remove from slot ${i + 1}` : `Equip to slot ${i + 1}`;
        btn.onclick = () => {
          if (isAssigned) {
            this._prog.unequipSlot(i);
          } else {
            this._prog.equipSpell(id, i);
          }
          this._render();
        };
        assignRow.appendChild(btn);
      }

      row.append(glyphEl, info, assignRow);
      spellList.appendChild(row);
    }
    knownSection.append(knownLabel, spellList);

    // ── Hint ──────────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.className = 'sb-hint';
    hint.textContent = 'Right-click to cast active spell  ·  K or Esc to close';

    card.append(header, eqSection, knownSection, hint);
    this._overlay.appendChild(card);
  }

  private _ensureStyles(): void {
    if (document.getElementById('spellbook-css')) return;
    const s = document.createElement('style');
    s.id = 'spellbook-css';
    s.textContent = SB_CSS;
    document.head.appendChild(s);
  }
}
