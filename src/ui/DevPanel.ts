// ── DevPanel ────────────────────────────────────────────────────────────────
//
//  Developer cheat panel.  Only accessible when 'ttt_dev_mode' in localStorage
//  is 'true' — toggled via the Dev Mode switch in the main-menu Settings.
//
//  Opened from the PauseMenu "Dev Panel" button.
//  Sections:  ✦ Princess Power (HP + god mode)
//             ✦ Spells        (grant all)
//             ✦ Combat        (kill all in room)
//             ✦ Teleport      (jump to any room)

export const LS_DEV = 'ttt_dev_mode';

/** Whether dev mode is currently enabled. */
export function devModeEnabled(): boolean {
  return localStorage.getItem(LS_DEV) === 'true';
}

// ── Options ───────────────────────────────────────────────────────────────

export interface DevPanelOptions {
  /** Enable / disable god mode on the player. */
  onGodMode: (enabled: boolean) => void;
  /** Return current god-mode state. */
  getGodMode: () => boolean;
  /** Unlock and equip all known spells. */
  onAllSpells: () => void;
  /** Restore player HP to full. */
  onFillHp: () => void;
  /** Set player HP to a precise value. */
  onSetHp: (value: number) => void;
  /** Return { hp, maxHp } for rendering the HP slider. */
  getHpInfo: () => { hp: number; maxHp: number };
  /** Instantly kill all living enemies in the current room. */
  onKillAll: () => void;
  /** Force all living enemies in the current scene to flee (for taming tests). */
  onForceFlee: () => void;
  /** Teleport to a room by its blueprint ID. Closes the panel. */
  onTeleport: (roomId: string) => void;
}

// ── Room list ─────────────────────────────────────────────────────────────

const ROOMS: [id: string, label: string][] = [
  ['cell_start',    'Cell · Start'],
  ['library_small', 'Library · Small'],
  ['library_large', 'Library · Large'],
  ['corridor_ew',   'Corridor E–W'],
  ['corridor_ns',   'Corridor N–S'],
];

// ── CSS ───────────────────────────────────────────────────────────────────

const DP_CSS = `
.dp-overlay {
  display: none; align-items: center; justify-content: center;
  position: fixed; inset: 0; z-index: 9300;
  background: rgba(0,0,0,.7);
  backdrop-filter: blur(4px);
  opacity: 0; transition: opacity .18s ease;
}
.dp-overlay.dp-open { opacity: 1; }

.dp-card {
  background: #0d0b12;
  border: 1px solid #5a3a22;
  border-radius: 4px;
  padding: 22px 26px 22px;
  width: min(92vw, 540px);
  max-height: 84vh; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #3a2210 transparent;
  display: flex; flex-direction: column; gap: 20px;
  box-shadow: 0 14px 56px rgba(0,0,0,.82), 0 0 0 1px #180e06 inset;
}

/* ── Header ── */
.dp-header {
  display: flex; align-items: flex-start; justify-content: space-between;
}
.dp-title {
  font-family: 'Cinzel', serif; font-size: 16px;
  letter-spacing: 3px; text-transform: uppercase;
  color: #cc8844;
}
.dp-warning {
  font-family: monospace; font-size: 8px; color: #3a2010;
  letter-spacing: 1.5px; margin-top: 3px;
}
.dp-close {
  background: none; border: 1px solid #3a2210;
  color: #6a4a22; font-size: 12px; cursor: pointer;
  border-radius: 2px; padding: 4px 10px; font-family: monospace;
  transition: color .12s, border-color .12s; flex-shrink: 0;
}
.dp-close:hover { color: #e2d9c8; border-color: #cc8844; }

/* ── Sections ── */
.dp-section { display: flex; flex-direction: column; gap: 10px; }
.dp-section-label {
  font-family: 'Cinzel', serif; font-size: 8px;
  letter-spacing: 3px; text-transform: uppercase;
  color: #3a2210; border-bottom: 1px solid #160c04;
  padding-bottom: 5px;
}

/* ── Action buttons ── */
.dp-row { display: flex; gap: 8px; flex-wrap: wrap; }

.dp-btn {
  padding: 7px 15px;
  background: rgba(0,0,0,.35); border: 1px solid #3a2210;
  border-radius: 3px; color: #9a6a38;
  font-family: 'Cinzel', serif; font-size: 11px;
  letter-spacing: 1px; text-transform: uppercase; cursor: pointer;
  transition: color .1s, border-color .1s, background .1s;
}
.dp-btn:hover { background: rgba(204,136,68,.14); border-color: #cc8844; color: #e2d9c8; }
.dp-btn--danger { border-color: #3a1010; color: #7a3030; }
.dp-btn--danger:hover { background: rgba(180,50,50,.14); border-color: #cc4444; color: #ffaaaa; }

/* ── Toggle row ── */
.dp-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px;
  background: rgba(0,0,0,.25); border: 1px solid #1a0e04;
  border-radius: 3px;
}
.dp-toggle-info { display: flex; flex-direction: column; gap: 2px; }
.dp-toggle-name {
  font-family: 'Cinzel', serif; font-size: 12px; color: #7a5a30;
  transition: color .12s;
}
.dp-toggle-sub { font-family: monospace; font-size: 9px; color: #3a2210; }
.dp-toggle-row.dp-on .dp-toggle-name { color: #cc8844; }
.dp-toggle-cb { accent-color: #cc8844; width: 16px; height: 16px; cursor: pointer; }

/* ── Slider row ── */
.dp-slider-row {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px;
  background: rgba(0,0,0,.25); border: 1px solid #1a0e04;
  border-radius: 3px;
}
.dp-slider-lbl { font-family: monospace; font-size: 10px; color: #5a3a18; min-width: 50px; }
.dp-slider {
  flex: 1; accent-color: #cc8844; cursor: pointer;
  -webkit-appearance: none; height: 4px; border-radius: 2px;
  background: #1a0e04; outline: none;
}
.dp-slider-val { font-family: monospace; font-size: 10px; color: #9a6a38; min-width: 28px; text-align: right; }

/* ── Teleport room buttons ── */
.dp-rooms { display: flex; gap: 6px; flex-wrap: wrap; }
.dp-room-btn {
  padding: 5px 13px;
  background: rgba(0,0,0,.35); border: 1px solid #1a1a2e;
  border-radius: 3px; color: #4a4a8a;
  font-family: monospace; font-size: 10px; cursor: pointer;
  transition: color .1s, border-color .1s, background .1s;
}
.dp-room-btn:hover { background: rgba(90,80,180,.14); border-color: #7a7acc; color: #c0c0ff; }
`;

// ── DevPanel class ────────────────────────────────────────────────────────

export class DevPanel {
  private readonly _overlay: HTMLElement;
  private _isOpen = false;
  private readonly _opts: DevPanelOptions;

  constructor(opts: DevPanelOptions) {
    this._opts = opts;
    this._ensureStyles();
    this._overlay = document.createElement('div');
    this._overlay.className = 'dp-overlay';
    document.body.appendChild(this._overlay);
  }

  get isOpen(): boolean { return this._isOpen; }

  open(): void {
    this._isOpen = true;
    this._render();
    this._overlay.style.display = 'flex';
    requestAnimationFrame(() => this._overlay.classList.add('dp-open'));
  }

  close(): void {
    this._isOpen = false;
    this._overlay.classList.remove('dp-open');
    setTimeout(() => {
      if (!this._isOpen) this._overlay.style.display = 'none';
    }, 200);
  }

  dispose(): void { this._overlay.remove(); }

  // ── DOM build ─────────────────────────────────────────────────────────

  private _render(): void {
    this._overlay.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'dp-card';
    // Clicks inside card don't close overlay
    card.addEventListener('click', e => e.stopPropagation());

    // Close on backdrop click
    this._overlay.addEventListener('click', () => this.close());

    card.append(
      this._buildHeader(),
      this._buildPrincessPower(),
      this._buildSpells(),
      this._buildCombat(),
      this._buildTeleport(),
    );

    this._overlay.appendChild(card);
  }

  private _buildHeader(): HTMLElement {
    const h = document.createElement('div');
    h.className = 'dp-header';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'dp-title';
    title.textContent = '⚙  Dev Panel';
    const warn = document.createElement('div');
    warn.className = 'dp-warning';
    warn.textContent = '⚠  CHEAT MODE — NOT FOR RELEASE';
    left.append(title, warn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dp-close';
    closeBtn.textContent = 'Esc  ✕';
    closeBtn.onclick = () => this.close();

    h.append(left, closeBtn);
    return h;
  }

  private _buildPrincessPower(): HTMLElement {
    const sec = this._section('✦  Princess Power');

    // God mode toggle
    const godRow = document.createElement('div');
    const godOn  = this._opts.getGodMode();
    godRow.className = 'dp-toggle-row' + (godOn ? ' dp-on' : '');

    const info = document.createElement('div');
    info.className = 'dp-toggle-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'dp-toggle-name';
    nameEl.textContent = 'God Mode';
    const subEl = document.createElement('div');
    subEl.className = 'dp-toggle-sub';
    subEl.textContent = 'Player takes no damage';
    info.append(nameEl, subEl);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'dp-toggle-cb';
    cb.checked = godOn;
    cb.onchange = () => {
      godRow.classList.toggle('dp-on', cb.checked);
      this._opts.onGodMode(cb.checked);
    };
    godRow.append(info, cb);
    sec.appendChild(godRow);

    // HP slider
    const { hp, maxHp } = this._opts.getHpInfo();
    const hpRow = document.createElement('div');
    hpRow.className = 'dp-slider-row';
    const hpLbl = document.createElement('span');
    hpLbl.className = 'dp-slider-lbl';
    hpLbl.textContent = 'Set HP';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'dp-slider';
    slider.min = '1';
    slider.max = String(maxHp);
    slider.value = String(Math.max(1, hp));
    const hpVal = document.createElement('span');
    hpVal.className = 'dp-slider-val';
    hpVal.textContent = slider.value;
    slider.oninput = () => {
      hpVal.textContent = slider.value;
      this._opts.onSetHp(parseInt(slider.value));
    };
    hpRow.append(hpLbl, slider, hpVal);
    sec.appendChild(hpRow);

    // Fill HP button
    const btnRow = document.createElement('div');
    btnRow.className = 'dp-row';
    btnRow.appendChild(this._btn('❤  Fill HP', false, () => {
      this._opts.onFillHp();
      const info2 = this._opts.getHpInfo();
      slider.value = String(info2.maxHp);
      hpVal.textContent = String(info2.maxHp);
    }));
    sec.appendChild(btnRow);

    return sec;
  }

  private _buildSpells(): HTMLElement {
    const sec = this._section('✦  Spells');
    const row = document.createElement('div');
    row.className = 'dp-row';
    row.appendChild(this._btn('✨  All Spells', false, () => this._opts.onAllSpells()));
    sec.appendChild(row);
    return sec;
  }

  private _buildCombat(): HTMLElement {
    const sec = this._section('✦  Combat');
    const row = document.createElement('div');
    row.className = 'dp-row';
    row.appendChild(this._btn('☠  Kill All Enemies', true, () => this._opts.onKillAll()));
    row.appendChild(this._btn('💛  Force Flee All', false, () => this._opts.onForceFlee()));
    sec.appendChild(row);
    return sec;
  }

  private _buildTeleport(): HTMLElement {
    const sec = this._section('✦  Teleport');
    const rooms = document.createElement('div');
    rooms.className = 'dp-rooms';
    for (const [id, label] of ROOMS) {
      const b = document.createElement('button');
      b.className = 'dp-room-btn';
      b.textContent = label;
      b.onclick = () => { this._opts.onTeleport(id); this.close(); };
      rooms.appendChild(b);
    }
    sec.appendChild(rooms);
    return sec;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _section(label: string): HTMLElement {
    const s = document.createElement('div');
    s.className = 'dp-section';
    const l = document.createElement('div');
    l.className = 'dp-section-label';
    l.textContent = label;
    s.appendChild(l);
    return s;
  }

  private _btn(label: string, danger: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button') as HTMLButtonElement;
    b.className = 'dp-btn' + (danger ? ' dp-btn--danger' : '');
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  private _ensureStyles(): void {
    if (document.getElementById('devpanel-css')) return;
    const s = document.createElement('style');
    s.id = 'devpanel-css';
    s.textContent = DP_CSS;
    document.head.appendChild(s);
  }
}
