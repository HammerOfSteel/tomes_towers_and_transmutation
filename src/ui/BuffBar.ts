// ── BuffBar ────────────────────────────────────────────────────────────────
//
//  Horizontal strip of active-buff pills shown just above the bottom action
//  bar (bottom-centre).  Call update() each frame — it handles expiry.

import { injectHudTheme } from './hudTheme';
import type { ActiveBuff } from '@/core/ConsumableInventory';

const BUFF_CSS = `
#hud-buffbar {
  position: fixed; bottom: 82px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; flex-wrap: nowrap;
  z-index: 101; user-select: none; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
#hud-buffbar.hud-bb--visible { opacity: 1; }

.hud-bb-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 9px 3px 7px;
  background: rgba(0,0,0,.65);
  border-radius: var(--hud-radius-sm);
  border: 1px solid var(--hud-border);
  font-family: var(--hud-font-body); font-size: 11px;
  color: var(--hud-text);
  animation: hudFadeIn .18s ease;
}
.hud-bb-dot {
  width: 7px; height: 7px; border-radius: 50%;
  flex-shrink: 0;
}
.hud-bb-label { white-space: nowrap; }
.hud-bb-timer {
  font-family: var(--hud-font-mono); font-size: 9px;
  color: var(--hud-muted); margin-left: 2px;
}
`;

export class BuffBar {
  private readonly _root: HTMLElement;
  private _pills = new Map<string, { el: HTMLElement; timerEl: HTMLElement }>();

  constructor() {
    injectHudTheme();
    if (!document.getElementById('hud-buffbar-css')) {
      const s = document.createElement('style');
      s.id = 'hud-buffbar-css';
      s.textContent = BUFF_CSS;
      document.head.appendChild(s);
    }
    this._root = document.createElement('div');
    this._root.id = 'hud-buffbar';
    document.body.appendChild(this._root);
  }

  /** Call once per frame with the current active-buff list from ConsumableInventory. */
  update(buffs: readonly ActiveBuff[]): void {
    const now = Date.now();

    // Remove expired pills
    for (const [id, { el }] of this._pills) {
      if (!buffs.find(b => b.id === id)) {
        el.remove();
        this._pills.delete(id);
      }
    }

    // Add new pills / update timers
    for (const buff of buffs) {
      let entry = this._pills.get(buff.id);
      if (!entry) {
        const pill = document.createElement('div');
        pill.className = 'hud-bb-pill';
        const dot = document.createElement('span');
        dot.className = 'hud-bb-dot';
        dot.style.background = buff.color;
        const label = document.createElement('span');
        label.className = 'hud-bb-label';
        label.textContent = buff.label;
        const timer = document.createElement('span');
        timer.className = 'hud-bb-timer';
        pill.append(dot, label, timer);
        this._root.appendChild(pill);
        entry = { el: pill, timerEl: timer };
        this._pills.set(buff.id, entry);
      }
      // Update countdown
      const remaining = Math.max(0, (buff.expiresAt - now) / 1000);
      entry.timerEl.textContent = remaining > 0 ? `${remaining.toFixed(0)}s` : '';
    }

    // Show/hide
    if (buffs.length > 0) {
      this._root.classList.add('hud-bb--visible');
    } else {
      this._root.classList.remove('hud-bb--visible');
    }
  }

  dispose(): void {
    this._root.remove();
  }
}
