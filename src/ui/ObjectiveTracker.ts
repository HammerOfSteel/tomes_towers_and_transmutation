// ── ObjectiveTracker ──────────────────────────────────────────────────────
//
//  A compact persistent widget in the bottom-right corner showing the player's
//  current active story beat (or most-recent world quest).
//
//  Call setObjective(title, desc) to update it.
//  Call clear() to hide it.

import { injectHudTheme } from './hudTheme';

const OT_CSS = `
#hud-objective {
  position: fixed; bottom: 16px; right: 16px;
  max-width: 260px;
  background: rgba(0,0,0,.7);
  border: 1px solid var(--hud-border);
  border-left: 3px solid var(--hud-gold);
  border-radius: var(--hud-radius-sm);
  padding: 8px 12px;
  z-index: 100; user-select: none; pointer-events: none;
  opacity: 0; transition: opacity 0.4s;
  animation: hudSlideUp .22s ease both;
}
#hud-objective.hud-ot--visible { opacity: 1; }
#hud-objective.hud-ot--story  { border-left-color: var(--hud-gold-bright); }

.hud-ot-label {
  font-family: var(--hud-font-mono); font-size: 8px;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--hud-muted); margin-bottom: 3px;
}
.hud-ot-title {
  font-family: var(--hud-font-body); font-size: 12px;
  color: var(--hud-text); margin-bottom: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hud-ot-desc {
  font-family: var(--hud-font-body); font-size: 10px;
  color: var(--hud-muted); font-style: italic;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
`;

export class ObjectiveTracker {
  private readonly _el: HTMLElement;
  private readonly _labelEl: HTMLElement;
  private readonly _titleEl: HTMLElement;
  private readonly _descEl: HTMLElement;

  constructor() {
    injectHudTheme();
    if (!document.getElementById('hud-ot-css')) {
      const s = document.createElement('style');
      s.id = 'hud-ot-css';
      s.textContent = OT_CSS;
      document.head.appendChild(s);
    }

    this._el = document.createElement('div');
    this._el.id = 'hud-objective';

    this._labelEl = document.createElement('div');
    this._labelEl.className = 'hud-ot-label';
    this._labelEl.textContent = 'Objective';

    this._titleEl = document.createElement('div');
    this._titleEl.className = 'hud-ot-title';

    this._descEl = document.createElement('div');
    this._descEl.className = 'hud-ot-desc';

    this._el.append(this._labelEl, this._titleEl, this._descEl);
    document.body.appendChild(this._el);
  }

  /** Show/update a story beat objective. */
  setObjective(title: string, desc: string, isStory = false): void {
    this._titleEl.textContent = title;
    this._descEl.textContent  = desc;
    this._labelEl.textContent = isStory ? 'Story Objective' : 'Objective';
    this._el.classList.toggle('hud-ot--story', isStory);
    this._el.classList.add('hud-ot--visible');
  }

  /** Hide the tracker. */
  clear(): void {
    this._el.classList.remove('hud-ot--visible');
  }

  dispose(): void {
    this._el.remove();
  }
}
