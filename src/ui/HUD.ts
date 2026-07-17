// ── HUD ─────────────────────────────────────────────────────────────────────
//
//  In-game HTML overlay.  Injected once; call update() every frame.
//
//  Sections:
//   • HP bar with colour-coded fill                      (top-left)
//   • Status row: dodge-cooldown pips [F] + sprint [⇧]  (top-left)
//   • Info row: foe count + floor label                  (top-left)
//   • Action bar: 4 spell slots, 1–4 select active       (bottom-centre)
//   • Potion quick-slots [Z]/[X]                         (bottom-right)

import { injectHudTheme } from './hudTheme';

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
  transition: width .25s ease-out, background .2s ease;
}
/* Trailing ghost fill — delayed tick-down visual */
.hud-hp-trail {
  position: absolute; top: 0; left: 0; height: 100%;
  background: rgba(255,100,60,.45); border-radius: 2px;
  transition: width .9s ease-out;
  pointer-events: none;
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

/* ── Ability bar (above spell bar) ── */
#hud-abilities {
  position: fixed; bottom: 116px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  z-index: 100; user-select: none;
}
.hud-mana-track {
  width: 100%; height: 4px;
  background: rgba(0,0,0,.55); border-radius: 2px; overflow: hidden;
  min-width: 218px;
}
.hud-mana-fill {
  height: 100%;
  background: linear-gradient(90deg, #0066aa, #44ddff);
  border-radius: 2px;
  transition: width 0.12s linear;
}
.hud-ab-slots { display: flex; gap: 5px; }
.hud-ab-slot {
  position: relative;
  width: 50px; height: 50px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1px; overflow: hidden;
  background: rgba(0,0,0,.58);
  border: 1px solid #2a1e3a;
  border-radius: 5px;
  pointer-events: auto;
  transition: border-color .12s, box-shadow .12s;
}
.hud-ab-slot--ready  { border-color: #5a4072; }
.hud-ab-slot--active { border-color: #aa60ff; box-shadow: 0 0 10px rgba(170,96,255,.35); }
.hud-ab-slot--empty  { opacity: 0.35; }
.hud-ab-slot-key {
  font-family: var(--hud-font-mono); font-size: 8px; letter-spacing: 1px;
  color: #4a3060; line-height: 1;
}
.hud-ab-slot-icon { font-size: 19px; line-height: 1; }
.hud-ab-slot--empty .hud-ab-slot-icon { opacity: 0.25; }
.hud-ab-slot-cd-num {
  font-family: var(--hud-font-mono); font-size: 9px; color: #aa88cc;
  min-height: 11px;
}
/* Cooldown sweep — same conic-gradient technique as spell slots */
.hud-ab-cd {
  position: absolute; inset: 0; border-radius: 4px; pointer-events: none;
  background: conic-gradient(from -90deg, rgba(0,0,0,.6) 0% var(--cd, 0%), transparent var(--cd, 0%) 100%);
}
.hud-ab-slot--no-mana { filter: saturate(0.4); opacity: 0.65; }

/* ── Potion quick-slot bar ── */
#hud-potions {
  position: fixed; bottom: 70px; right: 16px;
  display: flex; gap: 8px;
  z-index: 100; user-select: none; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
#hud-potions.hud-pot--visible { opacity: 1; }
.hud-pot-slot {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  width: 52px; padding: 6px 4px 5px;
  background: rgba(0,0,0,.55);
  border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm);
}
.hud-pot-icon  { font-size: 18px; line-height: 1; }
.hud-pot-key   { font-family: var(--hud-font-mono); font-size: 9px; color: var(--hud-muted); letter-spacing: 1px; }
.hud-pot-count {
  font-family: var(--hud-font-mono); font-size: 10px; color: var(--hud-info);
  min-width: 16px; text-align: center;
}
.hud-pot-slot--empty .hud-pot-icon  { opacity: 0.2; }
.hud-pot-slot--empty .hud-pot-count { color: var(--hud-muted); }

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
  font-family: var(--hud-font-mono); font-size: 11px; color: var(--hud-info);
  min-width: 28px;
}

.hud-slot {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 14px 5px;
  background: rgba(0,0,0,.52); border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm); min-width: 88px;
  transition: border-color .12s, box-shadow .12s;
  pointer-events: auto;
}
.hud-slot--active {
  border-color: var(--hud-info);
  box-shadow: 0 0 14px rgba(68,221,255,.3), 0 0 0 1px rgba(68,221,255,.15) inset;
}

.hud-slot-num {
  font-family: var(--hud-font-mono); font-size: 9px; color: var(--hud-muted-cool); letter-spacing: 1px;
  transition: color .12s;
}
.hud-slot--active .hud-slot-num { color: var(--hud-info); }

.hud-slot-glyph {
  font-size: 16px; line-height: 1; opacity: 0.85;
  transition: opacity .12s;
}
.hud-slot--empty .hud-slot-glyph { opacity: 0.15; }

.hud-slot-name {
  font-family: var(--hud-font-body);
  font-size: 11px; color: var(--hud-muted-cool); white-space: nowrap;
  transition: color .12s;
}
.hud-slot--active .hud-slot-name { color: var(--hud-info); }
.hud-slot--empty  .hud-slot-name { font-style: italic; color: var(--hud-muted-cool); opacity: 0.4; }

/* ── Cooldown sweep overlay ── */
.hud-slot-cd {
  position: absolute; inset: 0; border-radius: 3px;
  background: conic-gradient(from -90deg, rgba(0,0,0,.55) 0% var(--cd, 0%), transparent var(--cd, 0%) 100%);
  pointer-events: none;
  transition: none;
}
/* Cooldown countdown number */
.hud-slot-cd-num {
  position: absolute; bottom: 3px; right: 4px;
  font-family: monospace; font-size: 9px; font-weight: 700;
  color: rgba(255,230,150,.9);
  text-shadow: 0 1px 3px rgba(0,0,0,.9);
  pointer-events: none; line-height: 1;
}
/* ── Screen hit flash ── */
#hud-hit-flash {
  position: fixed; inset: 0; z-index: 9500;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(255,40,20,.45) 100%);
  opacity: 0;
  transition: opacity .08s ease-out;
}
#hud-hit-flash.hud-hit-flash--active { opacity: 1; }
/* ── Low HP border pulse ── */
@keyframes hud-low-hp-pulse {
  0%, 100% { box-shadow: inset 0 0 0 3px rgba(255,40,20,0); }
  50%       { box-shadow: inset 0 0 0 3px rgba(255,40,20,.65); }
}
#hud-low-hp-overlay {
  position: fixed; inset: 0; z-index: 9400;
  pointer-events: none; border-radius: 0;
  opacity: 0; transition: opacity .4s ease;
}
#hud-low-hp-overlay.hud-low-hp--active {
  opacity: 1;
  animation: hud-low-hp-pulse 1.2s ease-in-out infinite;
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

// ── Spell display names + glyphs ─────────────────────────────────────────
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
  /** HP animated trail */
  private readonly _hpTrailFill: HTMLElement;
  private _hpTrailTimer: ReturnType<typeof setTimeout> | null = null;
  /** Screen hit flash + low HP overlay */
  private readonly _hitFlashEl: HTMLElement;
  private readonly _lowHpOverlayEl: HTMLElement;
  private _hitFlashTimer: ReturnType<typeof setTimeout> | null = null;
  /** Spell slot CD countdown spans */
  private readonly _slotCdNums: HTMLElement[] = [];
  /** Resource strip */
  private readonly _resRoot: HTMLElement;
  private readonly _resCounts: Record<string, HTMLElement> = {};
  /** Ability bar */
  private readonly _abRoot: HTMLElement;
  private readonly _manaFill: HTMLElement;
  private readonly _abSlots: Array<{ slot: HTMLElement; iconEl: HTMLElement; cdNumEl: HTMLElement; cdOverlay: HTMLElement }>;
  /** Potion quick-slots */
  private readonly _potRoot: HTMLElement;
  private readonly _potCounts: [HTMLElement, HTMLElement] = [document.createElement('span'), document.createElement('span')];
  private readonly _potSlots:  [HTMLElement, HTMLElement] = [document.createElement('div'), document.createElement('div')];
  /** Slot glyph elements, updated with the spell icon */
  private readonly _slotGlyphs: HTMLElement[] = [];

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
    hpTrack.style.position = 'relative';
    this._hpTrailFill = document.createElement('div');
    this._hpTrailFill.className = 'hud-hp-trail';
    this._hpTrailFill.style.width = '100%';
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'hud-hp-fill';
    hpTrack.append(this._hpTrailFill, this.hpFill);
    this.hpText = document.createElement('span');
    this.hpText.className = 'hud-val';
    hpRow.append(hpLabel, hpTrack, this.hpText);

    // ── Hit flash + low HP overlay ───────────────────────────────
    this._hitFlashEl = document.createElement('div');
    this._hitFlashEl.id = 'hud-hit-flash';
    document.body.appendChild(this._hitFlashEl);
    this._lowHpOverlayEl = document.createElement('div');
    this._lowHpOverlayEl.id = 'hud-low-hp-overlay';
    document.body.appendChild(this._lowHpOverlayEl);

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

      // Cooldown countdown number
      const cdNum = document.createElement('span');
      cdNum.className = 'hud-slot-cd-num';
      this._slotCdNums.push(cdNum);
      slot.appendChild(cdNum);

      const num = document.createElement('span');
      num.className = 'hud-slot-num';
      num.textContent = String(i + 1);

      const glyph = document.createElement('span');
      glyph.className = 'hud-slot-glyph';
      glyph.textContent = '✦';
      this._slotGlyphs.push(glyph);

      const name = document.createElement('span');
      name.className = 'hud-slot-name';
      name.textContent = '— empty —';

      slot.append(num, glyph, name);
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

    // ── Ability bar (Q R Z X with mana) ─────────────────────────────────
    this._abRoot = document.createElement('div');
    this._abRoot.id = 'hud-abilities';

    const manaTrack = document.createElement('div');
    manaTrack.className = 'hud-mana-track';
    this._manaFill = document.createElement('div');
    this._manaFill.className = 'hud-mana-fill';
    this._manaFill.style.width = '100%';
    manaTrack.appendChild(this._manaFill);

    const abSlotRow = document.createElement('div');
    abSlotRow.className = 'hud-ab-slots';

    const AB_KEYS = ['Q', 'R', 'Z', 'X'];
    this._abSlots = AB_KEYS.map((key, i) => {
      const slot = document.createElement('div');
      slot.className = 'hud-ab-slot hud-ab-slot--empty';

      const keyEl = document.createElement('div');
      keyEl.className = 'hud-ab-slot-key';
      keyEl.textContent = key;

      const iconEl = document.createElement('div');
      iconEl.className = 'hud-ab-slot-icon';
      iconEl.textContent = '○';

      const cdNumEl = document.createElement('div');
      cdNumEl.className = 'hud-ab-slot-cd-num';

      const cdOverlay = document.createElement('div');
      cdOverlay.className = 'hud-ab-cd';

      slot.append(keyEl, iconEl, cdNumEl, cdOverlay);
      slot.title = `Ability slot ${i + 1} (${key})`;
      abSlotRow.appendChild(slot);

      return { slot, iconEl, cdNumEl, cdOverlay };
    });

    this._abRoot.append(abSlotRow, manaTrack);
    document.body.appendChild(this._abRoot);

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

    // ── Potion quick-slot bar ────────────────────────────────────────────
    this._potRoot = document.createElement('div');
    this._potRoot.id = 'hud-potions';
    const POT_DEFS = [
      { key: '[Z]', icon: '🧪', label: 'Minor Heal', slotIdx: 0 },
      { key: '[X]', icon: '⚗️',  label: 'Major Heal', slotIdx: 1 },
    ] as const;
    for (const { key, icon, label, slotIdx } of POT_DEFS) {
      const s = this._potSlots[slotIdx];
      s.className = 'hud-pot-slot hud-pot-slot--empty';
      const iconEl  = document.createElement('span'); iconEl.className = 'hud-pot-icon'; iconEl.textContent = icon;
      const keyEl   = document.createElement('span'); keyEl.className  = 'hud-pot-key';  keyEl.textContent  = key;
      const countEl = this._potCounts[slotIdx];
      countEl.className = 'hud-pot-count'; countEl.textContent = '0';
      const ttTitle = `${icon} ${label}`;
      this._addTooltip(s, () => ttTitle, () => `Quick-use with ${key}`);
      s.append(iconEl, keyEl, countEl);
      this._potRoot.appendChild(s);
    }
    document.body.appendChild(this._potRoot);
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
    // HP bar + animated trail
    const pct = Math.max(0, hp / maxHp) * 100;
    this.hpFill.style.width      = `${pct}%`;
    this.hpFill.style.background = pct > 50 ? '#44ddff' : pct > 25 ? '#ffcc44' : '#ff4444';

    // Trail: stays at old value, then snaps down after 350ms delay
    const trailPct = parseFloat(this._hpTrailFill.style.width) || 100;
    if (pct < trailPct - 0.5) {
      // HP dropped — let trail linger then animate down
      if (this._hpTrailTimer) clearTimeout(this._hpTrailTimer);
      this._hpTrailTimer = setTimeout(() => {
        this._hpTrailFill.style.width = `${pct}%`;
        this._hpTrailTimer = null;
      }, 350);
    } else if (pct > trailPct + 0.5) {
      // HP gained — snap trail up immediately
      this._hpTrailFill.style.width = `${pct}%`;
    }

    // Low HP pulse border (< 25%)
    this._lowHpOverlayEl.classList.toggle('hud-low-hp--active', pct < 25);
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
        if (this._slotGlyphs[i]) {
          this._slotGlyphs[i].textContent = id ? (SPELL_GLYPH[id] ?? '✦') : '✦';
        }
        slotEl.classList.toggle('hud-slot--empty', id === null);
      });
    }
    // Re-highlight active slot whenever it changes
    if (activeSlot !== this._lastActiveSlot) {
      this._lastActiveSlot = activeSlot;
      this.barSlots.forEach((el, i) => el.classList.toggle('hud-slot--active', i === activeSlot));
    }
  }

  /**
   * Update the in-game clock widget (shown only in exterior mode).
   * Pass null to hide it.
   */
  setTime(formatted: string | null): void {
    if (!this._clockEl) {
      // Lazy-create the clock widget
      const el = document.createElement('div');
      el.style.cssText = [
        'position:fixed;top:10px;right:16px;',
        'background:rgba(8,6,18,0.82);border:1px solid #2a1a4a;',
        'border-radius:4px;padding:3px 10px;',
        'color:#c0a0e0;font:12px monospace;letter-spacing:.08em;',
        'pointer-events:none;z-index:500;',
        'opacity:0;transition:opacity 0.3s;',
      ].join('');
      document.body.appendChild(el);
      this._clockEl = el;
    }
    if (!formatted) {
      this._clockEl.style.opacity = '0';
    } else {
      const h = Math.floor(parseFloat(formatted));
      const icon = h >= 5 && h < 7 ? '🌅'
                 : h >= 7 && h < 18 ? '☀️'
                 : h >= 18 && h < 21 ? '🌇'
                 : '🌙';
      this._clockEl.textContent = `${icon} ${formatted}`;
      this._clockEl.style.opacity = '1';
    }
  }
  private _clockEl: HTMLDivElement | null = null;

  dispose(): void {
    this._clockEl?.remove();
    this.root.remove();
    this.barRoot.remove();
    this._resRoot.remove();
    this._potRoot.remove();
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

  /** Update potion quick-slot counts.
   *  Pass null to hide the bar entirely. */
  setConsumables(data: { minorHealCount: number; majorHealCount: number } | null): void {
    if (!data) {
      this._potRoot.classList.remove('hud-pot--visible');
      return;
    }
    this._potRoot.classList.add('hud-pot--visible');
    const counts = [data.minorHealCount, data.majorHealCount];
    for (let i = 0; i < 2; i++) {
      const n = counts[i];
      this._potCounts[i].textContent = String(n);
      if (n > 0) {
        this._potSlots[i].classList.remove('hud-pot-slot--empty');
      } else {
        this._potSlots[i].classList.add('hud-pot-slot--empty');
      }
    }
  }

  /**
   * Update the ability bar (Q R Z X slots + mana bar).
   * @param slotInfos  Array of 4 AbilitySlotInfo objects (from AbilitySystem.getAllSlotInfos())
   * @param manaFrac   Current mana as 0–1 fraction
   */
  setAbilities(
    slotInfos: Array<{ id: string | null; name: string; icon: string; cdRemaining: number; cdTotal: number; manaCost: number; canCast: boolean }>,
    manaFrac: number,
  ): void {
    // Mana bar
    this._manaFill.style.width = `${Math.round(Math.max(0, Math.min(1, manaFrac)) * 100)}%`;

    // Slots
    for (let i = 0; i < 4; i++) {
      const info  = slotInfos[i];
      const { slot, iconEl, cdNumEl, cdOverlay } = this._abSlots[i];
      if (!info || !info.id) {
        slot.className = 'hud-ab-slot hud-ab-slot--empty';
        iconEl.textContent = '○';
        cdNumEl.textContent = '';
        cdOverlay.style.setProperty('--cd', '0%');
        continue;
      }

      const isOnCD = info.cdRemaining > 0.05;
      const cdPct  = isOnCD ? `${Math.round((info.cdRemaining / info.cdTotal) * 100)}%` : '0%';

      slot.className = 'hud-ab-slot' +
        (isOnCD   ? '' : info.canCast ? ' hud-ab-slot--ready' : ' hud-ab-slot--no-mana') +
        (isOnCD && info.cdRemaining < 0.4 ? ' hud-ab-slot--active' : '');

      iconEl.textContent = info.icon || '○';
      cdOverlay.style.setProperty('--cd', cdPct);

      if (isOnCD) {
        cdNumEl.textContent = info.cdRemaining >= 10
          ? String(Math.ceil(info.cdRemaining))
          : info.cdRemaining.toFixed(1);
      } else {
        cdNumEl.textContent = '';
      }
    }
  }

  /** Set weather icon in the clock widget.  Provide a state key. */
  setWeather(state: 'clear' | 'cloudy' | 'rain' | 'storm' | null): void {
    this._pendingWeather = state;
    // Actually applied in setTime() when the clock element exists
    if (this._clockEl && state !== null) {
      const icons: Record<string, string> = { clear: '☀️', cloudy: '🌥️', rain: '🌧️', storm: '⛈️' };
      this._weatherIcon = icons[state] ?? '';
    }
  }
  private _pendingWeather: string | null = null;
  private _weatherIcon = '';

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
   *  @param fractions  Array of 4 values where 0 = ready, 1 = just cast.
   *  @param remaining  Optional array of remaining seconds (shows countdown number). */
  setCooldowns(fractions: (number | null)[], remaining?: (number | null)[]): void {
    for (let i = 0; i < 4; i++) {
      const slot = this.barSlots[i];
      const cdEl = slot.querySelector<HTMLElement>('.hud-slot-cd');
      if (!cdEl) continue;
      const frac = fractions[i] ?? 0;
      cdEl.style.setProperty('--cd', `${Math.round(frac * 100)}%`);

      const rem = remaining?.[i] ?? 0;
      const numEl = this._slotCdNums[i];
      if (numEl) {
        if (rem > 0.05) {
          numEl.textContent = rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1);
        } else {
          numEl.textContent = '';
        }
      }
    }
  }

  /** Flash the screen-edge vignette (player took damage). */
  flashHit(): void {
    if (this._hitFlashTimer) {
      clearTimeout(this._hitFlashTimer);
      this._hitFlashTimer = null;
    }
    this._hitFlashEl.classList.add('hud-hit-flash--active');
    this._hitFlashTimer = setTimeout(() => {
      this._hitFlashEl.classList.remove('hud-hit-flash--active');
      this._hitFlashTimer = null;
    }, 220);
  }

  private _ensureStyles(): void {
    if (document.getElementById('hud-css')) return;
    const s = document.createElement('style');
    s.id = 'hud-css';
    s.textContent = HUD_CSS;
    document.head.appendChild(s);
  }
}

