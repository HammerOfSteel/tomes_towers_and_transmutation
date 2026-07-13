// ── HUD ─────────────────────────────────────────────────────────────────────
//
//  In-game HTML overlay.  Injected once; call update() every frame.
//
//  Sections:
//   • HP bar with colour-coded fill                      (top-left)
//   • Status row: dodge-cooldown pips [F] + sprint [⇧]  (top-left)
//   • Info row: foe count + floor label                  (top-left)
//   • Action bar: 4 spell slots, 1–4 select active       (bottom-centre)

const HUD_CSS = `
#hud {
  position: fixed; top: 16px; left: 16px; z-index: 100;
  display: flex; flex-direction: column; gap: 8px;
  user-select: none; pointer-events: none;
}

/* ── HP ── */
.hud-hp-row { display: flex; align-items: center; gap: 8px; }

.hud-label {
  font-family: 'Cinzel', serif;
  font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
  color: #4a6677; min-width: 20px;
}

.hud-track {
  width: 118px; height: 7px;
  background: rgba(0,0,0,.55);
  border: 1px solid #243444;
  border-radius: 2px; overflow: hidden;
}

.hud-hp-fill {
  height: 100%; width: 100%;
  background: #44ddff; border-radius: 2px;
  transition: width .1s ease, background .2s ease;
}

.hud-val { font-family: monospace; font-size: 10px; color: #4a6677; }

/* ── Status row ── */
.hud-status-row { display: flex; align-items: center; gap: 12px; }

.hud-key {
  font-family: monospace; font-size: 10px; color: #3a4d5e;
  background: rgba(0,0,0,.45);
  border: 1px solid #1e2e3e;
  border-radius: 2px; padding: 1px 4px; line-height: 1.5;
}

/* Dodge pips */
.hud-dodge { display: flex; align-items: center; gap: 5px; }
.hud-pips  { display: flex; align-items: center; gap: 3px; }
.hud-pip {
  width: 7px; height: 7px; border-radius: 50%;
  background: #141e28; border: 1px solid #1e2e3e;
  transition: background .14s, border-color .14s, box-shadow .14s;
}
.hud-pip--on {
  background: #44ddff; border-color: #66eeff;
  box-shadow: 0 0 5px rgba(68,221,255,.55);
}

/* Sprint indicator */
.hud-run { display: flex; align-items: center; gap: 5px; }
.hud-run-label {
  font-family: monospace; font-size: 10px; letter-spacing: 1px;
  color: #1e2e3e;
  transition: color .14s, text-shadow .14s;
}
.hud-run--active .hud-key        { color: #88ccff; border-color: #345566; }
.hud-run--active .hud-run-label  {
  color: #88ccff;
  text-shadow: 0 0 7px rgba(100,180,255,.4);
}

/* ── Info ── */
.hud-info { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.hud-info-text { font-family: monospace; font-size: 10px; color: #2e3e4e; }

/* ── Action bar (bottom-centre) ── */
#hud-bar {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px;
  z-index: 100; user-select: none; pointer-events: none;
}

.hud-slot {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 7px 16px 6px;
  background: rgba(0,0,0,.52); border: 1px solid #1a1428;
  border-radius: 3px; min-width: 96px;
  transition: border-color .12s, box-shadow .12s;
}
.hud-slot--active {
  border-color: #9d7cce;
  box-shadow: 0 0 12px rgba(157,124,206,.28);
}

.hud-slot-num {
  font-family: monospace; font-size: 9px; color: #2e2240; letter-spacing: 1px;
  transition: color .12s;
}
.hud-slot--active .hud-slot-num { color: #9d7cce; }

.hud-slot-name {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 12px; color: #2e2440; white-space: nowrap;
  transition: color .12s;
}
.hud-slot--active .hud-slot-name { color: #c9b8e8; }
.hud-slot--empty  .hud-slot-name { font-style: italic; color: #1e1830; }
`;

// ── Spell display names ───────────────────────────────────────────────────
const SPELL_LABEL: Record<string, string> = {
  magic_bolt: 'Magic Bolt',
  flame_dart: 'Flame Dart',
};

// ── HUD class ─────────────────────────────────────────────────────────────

export class HUD {
  private readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly killText: HTMLElement;
  private readonly floorText: HTMLElement;
  private readonly dodgePips: HTMLElement[];
  private readonly runEl: HTMLElement;
  /** Bottom action-bar container */
  private readonly barRoot: HTMLElement;
  private readonly barSlots: HTMLElement[];
  private _lastSlotKey = '';
  private _lastActiveSlot = -1;

  constructor() {
    this._ensureStyles();

    this.root = document.createElement('div');
    this.root.id = 'hud';

    // ── HP row ─────────────────────────────────────────────────────────
    const hpRow = document.createElement('div');
    hpRow.className = 'hud-hp-row';
    const hpLabel = document.createElement('span');
    hpLabel.className = 'hud-label';
    hpLabel.textContent = 'HP';
    const hpTrack = document.createElement('div');
    hpTrack.className = 'hud-track';
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'hud-hp-fill';
    hpTrack.appendChild(this.hpFill);
    this.hpText = document.createElement('span');
    this.hpText.className = 'hud-val';
    hpRow.append(hpLabel, hpTrack, this.hpText);

    // ── Status row ──────────────────────────────────────────────────────
    const statusRow = document.createElement('div');
    statusRow.className = 'hud-status-row';

    // Dodge pips
    const dodgeEl = document.createElement('div');
    dodgeEl.className = 'hud-dodge';
    const dodgeKey = document.createElement('span');
    dodgeKey.className = 'hud-key';
    dodgeKey.textContent = 'F';
    const pipsWrap = document.createElement('div');
    pipsWrap.className = 'hud-pips';
    this.dodgePips = Array.from({ length: 3 }, () => {
      const pip = document.createElement('span');
      pip.className = 'hud-pip hud-pip--on';
      pipsWrap.appendChild(pip);
      return pip;
    });
    dodgeEl.append(dodgeKey, pipsWrap);

    // Sprint indicator
    this.runEl = document.createElement('div');
    this.runEl.className = 'hud-run';
    const runKey = document.createElement('span');
    runKey.className = 'hud-key';
    runKey.textContent = '⇧';
    const runLabel = document.createElement('span');
    runLabel.className = 'hud-run-label';
    runLabel.textContent = 'SPRINT';
    this.runEl.append(runKey, runLabel);

    statusRow.append(dodgeEl, this.runEl);

    // ── Info row ────────────────────────────────────────────────────────
    const infoEl = document.createElement('div');
    infoEl.className = 'hud-info';
    this.killText = document.createElement('span');
    this.killText.className = 'hud-info-text';
    this.floorText = document.createElement('span');
    this.floorText.className = 'hud-info-text';
    infoEl.append(this.killText, this.floorText);

    this.root.append(hpRow, statusRow, infoEl);
    document.body.appendChild(this.root);

    // ── Action bar ──────────────────────────────────────────────────────
    this.barRoot = document.createElement('div');
    this.barRoot.id = 'hud-bar';
    this.barSlots = Array.from({ length: 4 }, (_, i) => {
      const slot = document.createElement('div');
      slot.className = 'hud-slot hud-slot--empty';

      const num = document.createElement('span');
      num.className = 'hud-slot-num';
      num.textContent = String(i + 1);

      const name = document.createElement('span');
      name.className = 'hud-slot-name';
      name.textContent = '— empty —';

      slot.append(num, name);
      this.barRoot.appendChild(slot);
      return slot;
    });
    document.body.appendChild(this.barRoot);
  }

  update(
    hp: number,
    maxHp: number,
    kills: number,
    total: number,
    floor = 0,
    equippedSlots: (string | null)[] = [],
    activeSlot = 0,
    dodgeReady = 1,
    isRunning = false,
  ): void {
    // HP bar
    const pct = Math.max(0, hp / maxHp) * 100;
    this.hpFill.style.width      = `${pct}%`;
    this.hpFill.style.background = pct > 50 ? '#44ddff' : pct > 25 ? '#ffcc44' : '#ff4444';
    this.hpText.textContent      = `${hp} / ${maxHp}`;

    // Dodge pips — 0 lit when just used, 3 lit when fully ready
    const lit = Math.round(dodgeReady * 3);
    this.dodgePips.forEach((pip, i) => pip.classList.toggle('hud-pip--on', i < lit));

    // Sprint indicator
    this.runEl.classList.toggle('hud-run--active', isRunning);

    // Info
    this.killText.textContent  = `${kills} / ${total} foes`;
    const fl = floor === 0 ? 'Ground' : floor > 0 ? `Floor ${floor}` : `B${Math.abs(floor)}`;
    this.floorText.textContent = `▲ ${fl}`;

    // Action bar — rebuild slot labels only when equipped spells change
    const slotKey = equippedSlots.join(',');
    if (slotKey !== this._lastSlotKey) {
      this._lastSlotKey = slotKey;
      this._lastActiveSlot = -1; // force re-highlight pass
      this.barSlots.forEach((slotEl, i) => {
        const id    = equippedSlots[i] ?? null;
        const nameEl = slotEl.querySelector('.hud-slot-name') as HTMLElement;
        nameEl.textContent = id ? (SPELL_LABEL[id] ?? id) : '— empty —';
        slotEl.classList.toggle('hud-slot--empty', id === null);
      });
    }
    // Re-highlight active slot whenever it changes
    if (activeSlot !== this._lastActiveSlot) {
      this._lastActiveSlot = activeSlot;
      this.barSlots.forEach((el, i) => el.classList.toggle('hud-slot--active', i === activeSlot));
    }
  }

  dispose(): void {
    this.root.remove();
    this.barRoot.remove();
  }

  private _ensureStyles(): void {
    if (document.getElementById('hud-css')) return;
    const s = document.createElement('style');
    s.id = 'hud-css';
    s.textContent = HUD_CSS;
    document.head.appendChild(s);
  }
}

