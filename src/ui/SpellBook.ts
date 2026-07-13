// ── SpellBook ────────────────────────────────────────────────────────────────
//
//  WoW-style grimoire overlay.  Press K to open/close.
//  Shows all known spells and lets the player assign them to 4 action slots.
//  Slots 1–4 map to the action bar at the bottom of the HUD.

import type { ProgressionSystem } from '@/progression/ProgressionSystem';

// ── Spell metadata ────────────────────────────────────────────────────────

const SPELL_LABEL: Record<string, string> = {
  magic_bolt: 'Magic Bolt',
  flame_dart: 'Flame Dart',
  intimidate:  'Intimidate',
};
const SPELL_DESC: Record<string, string> = {
  magic_bolt: 'A focused bolt of arcane energy.',
  flame_dart: 'A conjured dart of living fire.',
  intimidate:  'AOE cry that sends nearby creatures fleeing. (Dev spell)',
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
  background: #0d0b13;
  border: 1px solid #4a4158;
  border-radius: 4px;
  padding: 24px 28px 20px;
  width: min(92vw, 500px);
  display: flex; flex-direction: column; gap: 20px;
  box-shadow: 0 12px 50px rgba(0,0,0,.8), 0 0 0 1px #1a1428 inset;
}

/* ── Header ── */
.sb-header {
  display: flex; align-items: center; justify-content: space-between;
}
.sb-title {
  font-family: 'Cinzel', serif;
  font-size: 17px; letter-spacing: 3px; text-transform: uppercase;
  color: #c9b8e8;
}
.sb-close {
  background: none; border: 1px solid #3a3048;
  color: #6a5888; font-size: 13px; cursor: pointer;
  border-radius: 2px; padding: 4px 9px;
  font-family: monospace;
  transition: color .12s, border-color .12s;
}
.sb-close:hover { color: #e2d9c8; border-color: #9d7cce; }

/* ── Sections ── */
.sb-section { display: flex; flex-direction: column; gap: 10px; }
.sb-section-label {
  font-family: 'Cinzel', serif; font-size: 8px;
  letter-spacing: 3px; text-transform: uppercase;
  color: #3a2e50; border-bottom: 1px solid #1a1428;
  padding-bottom: 5px;
}

/* ── Equipped slots row ── */
.sb-slots-row { display: flex; gap: 8px; }

.sb-slot {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 9px 6px 7px;
  background: rgba(0,0,0,.35); border: 1px solid #1e1828;
  border-radius: 3px; cursor: pointer; position: relative;
  transition: border-color .12s, box-shadow .12s;
  min-width: 0;
}
.sb-slot:hover { border-color: #4a4158; }
.sb-slot--active {
  border-color: #9d7cce;
  box-shadow: 0 0 10px rgba(157,124,206,.22);
}

.sb-slot-num {
  font-family: 'Cinzel', serif; font-size: 11px; font-weight: bold;
  color: #4a3a68; line-height: 1;
  transition: color .12s;
}
.sb-slot--active .sb-slot-num { color: #9d7cce; }

.sb-slot-name {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 11px; color: #5a4e70;
  text-align: center; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 90px;
  transition: color .12s;
}
.sb-slot--active .sb-slot-name { color: #c9b8e8; }
.sb-slot--empty .sb-slot-name  { font-style: italic; color: #2e2440; }

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
  border: 1px solid #1a1428; border-radius: 3px;
}
.sb-spell-info { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.sb-spell-name {
  font-family: 'Cinzel', serif; font-size: 13px; color: #c9b8e8;
}
.sb-spell-desc {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 11px; color: #4a3e60; font-style: italic;
}

/* Assign-to-slot buttons [1][2][3][4] */
.sb-assign-row { display: flex; gap: 5px; flex-shrink: 0; }
.sb-assign-btn {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.4); border: 1px solid #221938;
  border-radius: 2px; color: #3a2e52;
  font-family: monospace; font-size: 11px;
  cursor: pointer; transition: color .1s, border-color .1s, background .1s;
}
.sb-assign-btn:hover   { background: rgba(157,124,206,.15); border-color: #9d7cce; color: #c9b8e8; }
.sb-assign-btn--active { background: rgba(157,124,206,.2); border-color: #9d7cce; color: #9d7cce; }

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

      row.append(info, assignRow);
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
