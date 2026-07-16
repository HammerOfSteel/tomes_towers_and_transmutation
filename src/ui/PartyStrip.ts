// ── PartyStrip ────────────────────────────────────────────────────────────
//
//  A compact row of follower HP chips shown in the top-right corner.
//  Appears only when the player has at least one active follower.

import { injectHudTheme } from './hudTheme';

const PARTY_CSS = `
#hud-party {
  position: fixed; top: 16px; right: 16px;
  display: flex; flex-direction: column; gap: 5px;
  z-index: 100; user-select: none; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
#hud-party.hud-party--visible { opacity: 1; }

.hud-party-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 9px;
  background: rgba(0,0,0,.62);
  border: 1px solid var(--hud-border);
  border-radius: var(--hud-radius-sm);
  animation: hudFadeIn .18s ease;
  min-width: 120px;
}
.hud-party-icon  { font-size: 13px; line-height: 1; }
.hud-party-bar-wrap {
  flex: 1; display: flex; flex-direction: column; gap: 2px;
}
.hud-party-name {
  font-family: var(--hud-font-body); font-size: 9px;
  color: var(--hud-muted); letter-spacing: .5px;
  text-transform: uppercase;
}
.hud-party-track {
  height: 5px; border-radius: 3px;
  background: rgba(255,255,255,.08);
  overflow: hidden;
}
.hud-party-fill {
  height: 100%; border-radius: 3px;
  background: var(--hud-success);
  transition: width .15s ease, background .25s;
}
.hud-party-fill--mid  { background: var(--hud-gold); }
.hud-party-fill--low  { background: var(--hud-danger); }
.hud-party-hp {
  font-family: var(--hud-font-mono); font-size: 9px;
  color: var(--hud-muted); white-space: nowrap;
}
`;

interface MemberData {
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
}

interface ChipElements {
  chip: HTMLElement;
  fill: HTMLElement;
  hpText: HTMLElement;
}

export class PartyStrip {
  private readonly _root: HTMLElement;
  private _chips: ChipElements[] = [];

  constructor() {
    injectHudTheme();
    if (!document.getElementById('hud-party-css')) {
      const s = document.createElement('style');
      s.id = 'hud-party-css';
      s.textContent = PARTY_CSS;
      document.head.appendChild(s);
    }
    this._root = document.createElement('div');
    this._root.id = 'hud-party';
    document.body.appendChild(this._root);
  }

  /** Call with current follower data.  Pass empty array to hide the strip. */
  setMembers(members: MemberData[]): void {
    // Grow chip pool
    while (this._chips.length < members.length) {
      const chip = document.createElement('div');
      chip.className = 'hud-party-chip';

      const iconEl = document.createElement('span');
      iconEl.className = 'hud-party-icon';

      const barWrap = document.createElement('div');
      barWrap.className = 'hud-party-bar-wrap';

      const nameEl = document.createElement('div');
      nameEl.className = 'hud-party-name';

      const track = document.createElement('div');
      track.className = 'hud-party-track';

      const fill = document.createElement('div');
      fill.className = 'hud-party-fill';
      track.appendChild(fill);

      barWrap.append(nameEl, track);

      const hpText = document.createElement('span');
      hpText.className = 'hud-party-hp';

      chip.append(iconEl, barWrap, hpText);
      this._root.appendChild(chip);
      this._chips.push({ chip, fill, hpText });
    }

    // Update each chip
    const iconEls = this._root.querySelectorAll<HTMLElement>('.hud-party-icon');
    const nameEls = this._root.querySelectorAll<HTMLElement>('.hud-party-name');

    for (let i = 0; i < this._chips.length; i++) {
      const { chip, fill, hpText } = this._chips[i]!;
      if (i < members.length) {
        const m = members[i]!;
        chip.style.display = '';
        if (iconEls[i]) iconEls[i].textContent = m.icon;
        if (nameEls[i]) nameEls[i].textContent = m.name;
        const pct = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;
        fill.style.width = `${pct.toFixed(1)}%`;
        fill.classList.toggle('hud-party-fill--mid', pct < 50 && pct >= 25);
        fill.classList.toggle('hud-party-fill--low', pct < 25);
        fill.classList.remove(...(pct >= 50 ? ['hud-party-fill--mid', 'hud-party-fill--low'] : []));
        hpText.textContent = `${Math.ceil(m.hp)}`;
      } else {
        chip.style.display = 'none';
      }
    }

    if (members.length > 0) {
      this._root.classList.add('hud-party--visible');
    } else {
      this._root.classList.remove('hud-party--visible');
    }
  }

  dispose(): void {
    this._root.remove();
  }
}
