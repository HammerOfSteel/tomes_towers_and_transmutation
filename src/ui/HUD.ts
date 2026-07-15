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

/* ── XP bar ── */
.hud-xp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 1px; }
.hud-xp-fill {
  height: 3px; width: 0%;
  background: linear-gradient(90deg, #6644aa, #ffd43c);
  border-radius: 1px; transition: width .4s ease;
}
.hud-xp-level {
  font-family: monospace; font-size: 10px; letter-spacing: 1px;
  color: #ffd43c; min-width: 48px;
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

/* ── Resource strip (bottom-left, below spell bar) ── */
#hud-resources {
  position: fixed; bottom: 20px; left: 16px;
  display: flex; flex-direction: column; gap: 3px;
  z-index: 100; user-select: none; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
#hud-resources.hud-res--visible { opacity: 1; }
.hud-res-row {
  display: flex; align-items: center; gap: 5px;
}
.hud-res-icon {
  font-size: 13px; line-height: 1;
}
.hud-res-count {
  font-family: monospace; font-size: 11px; color: #8bbfcc;
  min-width: 28px;
}

.hud-slot {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 7px 16px 6px;
  background: rgba(0,0,0,.52); border: 1px solid #1a1428;
  border-radius: 3px; min-width: 96px;
  transition: border-color .12s, box-shadow .12s;
  pointer-events: auto;
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

/* ── Cooldown sweep overlay ── */
.hud-slot-cd {
  position: absolute; inset: 0; border-radius: 3px;
  background: conic-gradient(from -90deg, rgba(0,0,0,.55) 0% var(--cd, 0%), transparent var(--cd, 0%) 100%);
  pointer-events: none;
  transition: none;
}

/* ── Tooltip ── */
#hud-tooltip {
  position: fixed; z-index: 9999; pointer-events: none;
  background: rgba(12,10,18,.97);
  border: 1px solid #4a4158; border-radius: 3px;
  padding: 8px 13px; max-width: 220px;
  opacity: 0; visibility: hidden;
  transition: opacity .14s ease;
  box-shadow: 0 6px 24px rgba(0,0,0,.65);
}
#hud-tooltip.hud-tt--on { opacity: 1; visibility: visible; }
.hud-tt-title {
  font-family: 'Cinzel', serif; font-size: 11px;
  letter-spacing: 1px; color: #c9b8e8; margin-bottom: 5px;
}
.hud-tt-body {
  font-family: 'IM Fell English', Georgia, serif;
  font-size: 11px; color: #5a4e70;
  line-height: 1.55; white-space: pre-wrap;
}
`;

// ── Spell display names ───────────────────────────────────────────────────
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
  magic_bolt:   'A focused bolt of arcane energy.\nRight-click to cast.',
  flame_dart:   'A dart of conjured fire — burns brighter.\nRight-click to cast.',
  intimidate:   'An AOE cry that sends nearby creatures fleeing.\n10u radius. 8s cooldown.',
  nova_burst:   'Player-centred radial explosion.\n12u radius · 8 dmg · 15s cooldown.\nExpanding torus VFX.',
  chain_arc:    'Lightning bolt that bounces to 3 nearby enemies.\nEach bounce deals −15%. 5s cooldown.',
  void_rift:    'Stationary DoT zone at cursor point.\n3 dmg/s for 8s · 2u radius. 12s cooldown.',
  battle_hymn:  'Aura buff: minions deal +50% damage for 12s.\nGold ring follows you. 20s cooldown.',
  mass_animate: 'Raises dead enemy corpses as temporary minions.\n[Gated: Conductor tier 2] 30s cooldown.',
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
  private readonly xpFill: HTMLElement;
  private readonly xpLevelEl: HTMLElement;
  /** Bottom action-bar container */
  private readonly barRoot: HTMLElement;
  private readonly barSlots: HTMLElement[];
  private _lastSlotKey = '';
  private _lastActiveSlot = -1;
  /** Tooltip element (shared, body-level) */
  private readonly _tooltip: HTMLElement;
  private _tooltipTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current spell IDs in each slot — read by tooltip closures */
  private _slotSpells: (string | null)[] = [null, null, null, null];
  /** Resource strip (Phase 7e) */
  private readonly _resRoot: HTMLElement;
  private readonly _resCounts: Record<string, HTMLElement> = {};

  constructor() {
    this._ensureStyles();

    this.root = document.createElement('div');
    this.root.id = 'hud';

    // ── XP bar ─────────────────────────────────────────────────────────
    const xpRow = document.createElement('div');
    xpRow.className = 'hud-xp-row';
    this.xpLevelEl = document.createElement('span');
    this.xpLevelEl.className = 'hud-xp-level';
    this.xpLevelEl.textContent = 'Lv 1';
    const xpTrack = document.createElement('div');
    xpTrack.className = 'hud-track';
    xpTrack.style.width = '80px'; xpTrack.style.height = '3px';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'hud-xp-fill';
    xpTrack.appendChild(this.xpFill);
    xpRow.append(this.xpLevelEl, xpTrack);

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

    this.root.append(xpRow, hpRow, statusRow, infoEl);
    document.body.appendChild(this.root);

    // Tooltips for top-left HUD elements
    this._tooltip = document.createElement('div');
    this._tooltip.id = 'hud-tooltip';
    this._tooltip.innerHTML = '<div class="hud-tt-title"></div><div class="hud-tt-body"></div>';
    document.body.appendChild(this._tooltip);

    this._addTooltip(
      hpRow,
      () => 'Hit Points',
      () => 'Drains when you take damage.\nZero ends the ritual.',
    );
    this._addTooltip(
      dodgeEl,
      () => 'Dodge Roll  [F]',
      () => 'Dash in your movement direction with i-frames.\nPips show cooldown — 3 lit means ready.',
    );
    this._addTooltip(
      this.runEl,
      () => 'Sprint  [⇧]',
      () => 'Hold Shift to move faster.\nNo stamina cost.',
    );

    // ── Action bar ──────────────────────────────────────────────────────
    this.barRoot = document.createElement('div');
    this.barRoot.id = 'hud-bar';
    this.barSlots = Array.from({ length: 4 }, (_, i) => {
      const slot = document.createElement('div');
      slot.className = 'hud-slot hud-slot--empty';
      slot.style.position = 'relative';

      // Cooldown sweep overlay (conic-gradient from 12 o'clock)
      const cdOverlay = document.createElement('div');
      cdOverlay.className = 'hud-slot-cd';
      slot.appendChild(cdOverlay);

      const num = document.createElement('span');
      num.className = 'hud-slot-num';
      num.textContent = String(i + 1);

      const name = document.createElement('span');
      name.className = 'hud-slot-name';
      name.textContent = '— empty —';

      slot.append(num, name);
      this.barRoot.appendChild(slot);
      // Dynamic tooltip — reads _slotSpells at the time of hover
      this._addTooltip(
        slot,
        () => {
          const id = this._slotSpells[i];
          return id ? (SPELL_LABEL[id] ?? id) : `Slot ${i + 1}  —  Empty`;
        },
        () => {
          const id = this._slotSpells[i];
          return id
            ? (SPELL_DESC[id] ?? '')
            : 'No spell equipped.\nPress K to open the Grimoire.';
        },
      );
      return slot;
    });
    document.body.appendChild(this.barRoot);

    // ── Resource strip ──────────────────────────────────────────────────
    this._resRoot = document.createElement('div');
    this._resRoot.id = 'hud-resources';
    const RES_DEFS: Array<{ type: string; icon: string }> = [
      { type: 'gold',    icon: '🪙' },
      { type: 'ore',     icon: '⛏️' },
      { type: 'timber',  icon: '🪵' },
      { type: 'essence', icon: '✨' },
    ];
    for (const { type, icon } of RES_DEFS) {
      const row   = document.createElement('div');
      row.className = 'hud-res-row';
      const iconEl  = document.createElement('span');
      iconEl.className = 'hud-res-icon';
      iconEl.textContent = icon;
      const countEl = document.createElement('span');
      countEl.className = 'hud-res-count';
      countEl.textContent = '0';
      this._resCounts[type] = countEl;
      row.append(iconEl, countEl);
      this._resRoot.appendChild(row);
    }
    document.body.appendChild(this._resRoot);
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
    floorName?: string,
    level = 1,
    xpProgress = 0,
  ): void {
    // XP bar
    this.xpLevelEl.textContent = `Lv ${level}`;
    this.xpFill.style.width = `${Math.round(xpProgress * 100)}%`;
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
    const fl = floorName ?? (floor === 0 ? 'Ground' : floor > 0 ? `Floor ${floor}` : `B${Math.abs(floor)}`);
    this.floorText.textContent = `▲ ${fl}`;

    // Action bar — rebuild slot labels only when equipped spells change
    const slotKey = equippedSlots.join(',');
    if (slotKey !== this._lastSlotKey) {
      this._lastSlotKey = slotKey;
      this._lastActiveSlot = -1; // force re-highlight pass
      this._slotSpells = equippedSlots.slice(0, 4);
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
    this._resRoot.remove();
    this._tooltip.remove();
    if (this._tooltipTimer) clearTimeout(this._tooltipTimer);
  }

  /** Update resource counts shown in the bottom-left strip.
   *  Call this whenever inventory changes (via Inventory.onChange).
   *  Pass null to hide the strip entirely (e.g. when interior). */
  setResources(data: { gold: number; ore: number; timber: number; essence: number } | null): void {
    if (!data) {
      this._resRoot.classList.remove('hud-res--visible');
      return;
    }
    this._resRoot.classList.add('hud-res--visible');
    (Object.keys(data) as Array<keyof typeof data>).forEach(key => {
      const el = this._resCounts[key];
      if (el) el.textContent = String(data[key]);
    });
  }

  // ── Tooltip helpers ───────────────────────────────────────────────────

  private _addTooltip(
    el: HTMLElement,
    getTitle: () => string,
    getBody: () => string,
  ): void {
    el.style.pointerEvents = 'auto';
    el.addEventListener('mouseenter', (e) => {
      this._tooltipTimer = setTimeout(() => {
        this._showTooltip(getTitle(), getBody(), (e as MouseEvent).clientX, (e as MouseEvent).clientY);
      }, 360);
    });
    el.addEventListener('mousemove', (e) => {
      if (this._tooltip.classList.contains('hud-tt--on')) {
        this._positionTooltip((e as MouseEvent).clientX, (e as MouseEvent).clientY);
      }
    });
    el.addEventListener('mouseleave', () => {
      if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }
      this._tooltip.classList.remove('hud-tt--on');
    });
  }

  private _showTooltip(title: string, body: string, cx: number, cy: number): void {
    const titleEl = this._tooltip.querySelector('.hud-tt-title') as HTMLElement;
    const bodyEl  = this._tooltip.querySelector('.hud-tt-body')  as HTMLElement;
    titleEl.textContent = title;
    bodyEl.textContent  = body;
    this._positionTooltip(cx, cy);
    this._tooltip.classList.add('hud-tt--on');
  }

  private _positionTooltip(cx: number, cy: number): void {
    const tt = this._tooltip;
    const W = window.innerWidth;
    const tw = tt.offsetWidth || 220, th = tt.offsetHeight || 60;
    const ox = 14, oy = 14;
    let x = cx + ox, y = cy - th - oy;
    if (x + tw > W - 8) x = cx - tw - ox;
    if (y < 8)          y = cy + oy;
    tt.style.left = `${x}px`;
    tt.style.top  = `${y}px`;
  }

  /** Update the cooldown sweep overlays on the 4 action slots.
   *  @param fractions Array of 4 values where 0 = ready, 1 = just cast. */
  setCooldowns(fractions: (number | null)[]): void {
    for (let i = 0; i < 4; i++) {
      const slot = this.barSlots[i];
      const cdEl = slot.querySelector<HTMLElement>('.hud-slot-cd');
      if (!cdEl) continue;
      const frac = fractions[i] ?? 0;
      cdEl.style.setProperty('--cd', `${Math.round(frac * 100)}%`);
    }
  }

  private _ensureStyles(): void {
    if (document.getElementById('hud-css')) return;
    const s = document.createElement('style');
    s.id = 'hud-css';
    s.textContent = HUD_CSS;
    document.head.appendChild(s);
  }
}

