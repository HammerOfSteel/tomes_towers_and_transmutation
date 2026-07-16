// ── ControlsOverlay ──────────────────────────────────────────────────────────
//
//  Press [H] to toggle an in-game cheat-sheet.
//  Covers movement, panels, world interactions, and combat.

import { injectHudTheme } from './hudTheme';

const CSS = `
#controls-overlay {
  position: fixed; inset: 0;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.78);
  z-index: 700;
  opacity: 0; transition: opacity .18s;
}
#controls-overlay.co--open { display: flex; opacity: 1; }

.co-card {
  width: min(96vw, 680px);
  max-height: 88vh;
  overflow-y: auto;
  padding: 0;
}

.co-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--hud-border-warm);
}
.co-close {
  font-size: 11px; letter-spacing: 1px; color: var(--hud-muted);
  cursor: pointer;
}
.co-close:hover { color: var(--hud-text); }

.co-body {
  padding: 16px 20px 20px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
}
@media (max-width: 500px) { .co-body { grid-template-columns: 1fr; } }

.co-section-title {
  font-family: var(--hud-font-mono); font-size: 9px;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--hud-gold); margin-bottom: 8px;
  border-bottom: 1px solid var(--hud-border);
  padding-bottom: 4px;
}

.co-row {
  display: flex; gap: 10px; align-items: baseline;
  margin-bottom: 5px;
}
.co-key {
  font-family: var(--hud-font-mono); font-size: 11px;
  background: rgba(255,255,255,.08);
  border: 1px solid var(--hud-border);
  border-radius: 3px;
  padding: 1px 6px; white-space: nowrap;
  color: var(--hud-text); flex-shrink: 0; min-width: 60px; text-align: center;
}
.co-action {
  font-family: var(--hud-font-body); font-size: 12px;
  color: var(--hud-muted);
}
.co-action strong { color: var(--hud-text); font-weight: 600; }
`;

type KeyRow = [string, string]; // [key label, description]

const SECTIONS: Array<{ title: string; rows: KeyRow[] }> = [
  {
    title: 'Movement',
    rows: [
      ['W A S D',      'Move'],
      ['Shift',        'Run'],
      ['Space',        'Jump'],
      ['F',            'Dodge roll'],
    ],
  },
  {
    title: 'Combat',
    rows: [
      ['Left Click',   'Melee attack'],
      ['Right Click',  'Cast active spell'],
      ['1 2 3 4',      'Switch spell slot'],
      ['Z',            '<strong>Use</strong> Minor Heal potion'],
      ['X',            '<strong>Use</strong> Major Heal potion'],
    ],
  },
  {
    title: 'Panels & HUDs',
    rows: [
      ['Q',            'Quest log (story + world)'],
      ['K',            'Spellbook / Grimoire'],
      ['P',            'Character stats'],
      ['T',            'Talent tree'],
      ['Esc',          'Pause menu / close panel'],
      ['H',            'This help screen'],
    ],
  },
  {
    title: 'World Interactions',
    rows: [
      ['E',            'Talk to NPC / Read / Interact'],
      ['E (near board)','Open quest board'],
      ['E (near forge)','Open crafting station'],
      ['E (near shop)', 'Open merchant'],
      ['B',            'Build mode (exterior only)'],
    ],
  },
  {
    title: 'Gameplay Loop',
    rows: [
      ['Explore',      'Walk the overworld, find settlements'],
      ['NPCs',         'Press E near people to talk & get quests'],
      ['Quest board',  'Find the notice board in any town'],
      ['Dungeons',     'Walk into a dungeon entrance to go inside'],
      ['Craft',        'Use a forge or cauldron to craft gear & potions'],
      ['Level up',     'Kill enemies, complete quests for XP → talents'],
    ],
  },
  {
    title: 'HUD Legend',
    rows: [
      ['Top-left',     'HP / XP bars + resource counts'],
      ['Bottom-centre','Spell slots + cooldown arcs'],
      ['Bottom-right', 'Potion quick-slots (Z / X)'],
      ['Bottom-right', 'Story objective tracker'],
      ['Top-right',    'Party member HP chips'],
      ['Centre-bottom','Active buff pills (timed effects)'],
    ],
  },
];

export class ControlsOverlay {
  private readonly _el: HTMLElement;
  private _open = false;

  constructor() {
    injectHudTheme();
    if (!document.getElementById('co-css')) {
      const s = document.createElement('style');
      s.id = 'co-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    this._el = document.createElement('div');
    this._el.id = 'controls-overlay';

    const card = document.createElement('div');
    card.className = 'hud-panel hud-panel--warm co-card';

    // Header
    const header = document.createElement('div');
    header.className = 'co-header';
    const title = document.createElement('div');
    title.className = 'hud-title';
    title.textContent = 'Controls & How to Play';
    const closeEl = document.createElement('div');
    closeEl.className = 'co-close';
    closeEl.textContent = '[H] or [Esc] to close';
    closeEl.addEventListener('click', () => this.hide());
    header.append(title, closeEl);

    // Body grid
    const body = document.createElement('div');
    body.className = 'co-body';

    for (const sec of SECTIONS) {
      const col = document.createElement('div');
      const secTitle = document.createElement('div');
      secTitle.className = 'co-section-title';
      secTitle.textContent = sec.title;
      col.appendChild(secTitle);
      for (const [key, desc] of sec.rows) {
        const row = document.createElement('div');
        row.className = 'co-row';
        const keyEl = document.createElement('div');
        keyEl.className = 'co-key';
        keyEl.textContent = key;
        const actionEl = document.createElement('div');
        actionEl.className = 'co-action';
        actionEl.innerHTML = desc;
        row.append(keyEl, actionEl);
        col.appendChild(row);
      }
      body.appendChild(col);
    }

    card.append(header, body);
    this._el.appendChild(card);

    // Close on backdrop
    this._el.addEventListener('click', (e) => { if (e.target === this._el) this.hide(); });

    document.body.appendChild(this._el);
  }

  get isOpen(): boolean { return this._open; }

  show(): void {
    this._open = true;
    this._el.classList.add('co--open');
  }
  hide(): void {
    this._open = false;
    this._el.classList.remove('co--open');
  }
  toggle(): void { this._open ? this.hide() : this.show(); }

  dispose(): void { this._el.remove(); }
}
