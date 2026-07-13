// ── HUD ─────────────────────────────────────────────────────────────────────
//
//  In-game HTML overlay.  Injected once; call update() every frame.
//
//  Sections:
//   • HP bar with colour-coded fill
//   • Status row: dodge-cooldown pips [F] + sprint indicator [⇧]
//   • Spell slots — always shows Magic Bolt; unlocked spells added below
//   • Info row: foe count + floor label

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

/* ── Spell slots ── */
.hud-spells { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.hud-spell-slot {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 10px 3px 6px;
  background: rgba(0,0,0,.4);
  border: 1px solid #1a1428;
  border-left: 2px solid #6a4c9c;
  border-radius: 2px;
}
.hud-spell-name {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 12px; color: #a880d8;
}

/* ── Info ── */
.hud-info { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.hud-info-text { font-family: monospace; font-size: 10px; color: #2e3e4e; }
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
  private readonly spellsEl: HTMLElement;
  private _lastSpellKey = '';

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

    // ── Spell slots ─────────────────────────────────────────────────────
    this.spellsEl = document.createElement('div');
    this.spellsEl.className = 'hud-spells';

    // ── Info row ────────────────────────────────────────────────────────
    const infoEl = document.createElement('div');
    infoEl.className = 'hud-info';
    this.killText = document.createElement('span');
    this.killText.className = 'hud-info-text';
    this.floorText = document.createElement('span');
    this.floorText.className = 'hud-info-text';
    infoEl.append(this.killText, this.floorText);

    this.root.append(hpRow, statusRow, this.spellsEl, infoEl);
    document.body.appendChild(this.root);
  }

  update(
    hp: number,
    maxHp: number,
    kills: number,
    total: number,
    floor = 0,
    spells: string[] = [],
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

    // Spell slots — rebuild DOM only when the list changes
    const allSpells = spells.includes('magic_bolt') ? spells : ['magic_bolt', ...spells];
    const spellKey  = allSpells.join(',');
    if (spellKey !== this._lastSpellKey) {
      this._lastSpellKey = spellKey;
      this.spellsEl.innerHTML = '';
      for (const id of allSpells) {
        const slot = document.createElement('div');
        slot.className = 'hud-spell-slot';
        const k = document.createElement('span');
        k.className = 'hud-key';
        k.textContent = 'E';
        const n = document.createElement('span');
        n.className = 'hud-spell-name';
        n.textContent = SPELL_LABEL[id] ?? id;
        slot.append(k, n);
        this.spellsEl.appendChild(slot);
      }
    }

    // Info
    this.killText.textContent  = `${kills} / ${total} foes`;
    const fl = floor === 0 ? 'Ground' : floor > 0 ? `Floor ${floor}` : `B${Math.abs(floor)}`;
    this.floorText.textContent = `▲ ${fl}`;
  }

  dispose(): void {
    this.root.remove();
  }

  private _ensureStyles(): void {
    if (document.getElementById('hud-css')) return;
    const s = document.createElement('style');
    s.id = 'hud-css';
    s.textContent = HUD_CSS;
    document.head.appendChild(s);
  }
}
