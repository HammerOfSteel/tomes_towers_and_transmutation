// ── ObjectiveTracker ──────────────────────────────────────────────────────
//
//  A compact persistent widget in the bottom-right corner showing the player's
//  current active story beat (or most-recent world quest).
//
//  Call setObjective(title, desc) to update it.
//  Call setProgress(current, total, label) to show a progress line.
//  Call clear() to hide it.
//  Press J (or click the header) to collapse/expand.

import { injectHudTheme } from './hudTheme';

const OT_CSS = `
#hud-objective {
  position: fixed; bottom: 170px; right: 16px;
  max-width: 240px;
  background: rgba(0,0,0,.72);
  border: 1px solid var(--hud-border);
  border-left: 3px solid var(--hud-gold);
  border-radius: var(--hud-radius-sm);
  padding: 6px 10px;
  z-index: 100; user-select: none;
  opacity: 0; transition: opacity 0.4s;
}
#hud-objective.hud-ot--visible { opacity: 1; }
#hud-objective.hud-ot--story  { border-left-color: var(--hud-gold-bright); }
#hud-objective.hud-ot--collapsed .hud-ot-body { display: none; }

.hud-ot-header {
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; gap: 6px;
}
.hud-ot-label {
  font-family: var(--hud-font-mono); font-size: 8px;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--hud-muted);
}
.hud-ot-toggle {
  font-size: 8px; color: var(--hud-muted);
  flex-shrink: 0; line-height: 1;
  background: none; border: none; cursor: pointer; padding: 0;
}
.hud-ot-body { margin-top: 3px; }
.hud-ot-title {
  font-family: var(--hud-font-body); font-size: 11px;
  color: var(--hud-text); margin-bottom: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hud-ot-desc {
  font-family: var(--hud-font-body); font-size: 10px;
  color: var(--hud-muted); font-style: italic;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.hud-ot-progress {
  margin-top: 4px;
  font-family: var(--hud-font-mono); font-size: 9px;
  color: var(--hud-gold);
}
.hud-ot-progress-track {
  height: 2px; background: rgba(255,255,255,.08); border-radius: 1px;
  margin-top: 3px; overflow: hidden;
}
.hud-ot-progress-fill {
  height: 100%; background: var(--hud-gold);
  border-radius: 1px; transition: width .3s ease;
}
`;

export class ObjectiveTracker {
  private readonly _el: HTMLElement;
  private readonly _labelEl: HTMLElement;
  private readonly _titleEl: HTMLElement;
  private readonly _descEl: HTMLElement;
  private readonly _progressEl: HTMLElement;
  private readonly _progressFill: HTMLElement;
  private readonly _toggleBtn: HTMLElement;
  private _collapsed = false;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

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

    // Header row (always visible)
    const header = document.createElement('div');
    header.className = 'hud-ot-header';

    this._labelEl = document.createElement('div');
    this._labelEl.className = 'hud-ot-label';
    this._labelEl.textContent = 'Objective';

    this._toggleBtn = document.createElement('button');
    this._toggleBtn.className = 'hud-ot-toggle';
    this._toggleBtn.textContent = '▾';
    this._toggleBtn.title = 'Collapse (J)';
    this._toggleBtn.addEventListener('click', () => this._toggleCollapse());

    header.append(this._labelEl, this._toggleBtn);

    // Body (collapsible)
    const body = document.createElement('div');
    body.className = 'hud-ot-body';

    this._titleEl = document.createElement('div');
    this._titleEl.className = 'hud-ot-title';

    this._descEl = document.createElement('div');
    this._descEl.className = 'hud-ot-desc';

    const progressWrap = document.createElement('div');
    this._progressEl = document.createElement('div');
    this._progressEl.className = 'hud-ot-progress';
    this._progressEl.style.display = 'none';
    const track = document.createElement('div');
    track.className = 'hud-ot-progress-track';
    this._progressFill = document.createElement('div');
    this._progressFill.className = 'hud-ot-progress-fill';
    this._progressFill.style.width = '0%';
    track.appendChild(this._progressFill);
    progressWrap.append(this._progressEl, track);

    body.append(this._titleEl, this._descEl, progressWrap);
    this._el.append(header, body);
    document.body.appendChild(this._el);

    // J key toggles collapse
    this._keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'KeyJ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        this._toggleCollapse();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  private _toggleCollapse(): void {
    this._collapsed = !this._collapsed;
    this._el.classList.toggle('hud-ot--collapsed', this._collapsed);
    this._toggleBtn.textContent = this._collapsed ? '▸' : '▾';
  }

  /** Show/update a story beat objective. */
  setObjective(title: string, desc: string, isStory = false): void {
    this._titleEl.textContent = title;
    this._descEl.textContent  = desc;
    this._labelEl.textContent = isStory ? 'Story Objective' : 'Objective';
    this._el.classList.toggle('hud-ot--story', isStory);
    this._el.classList.add('hud-ot--visible');
    if (this._collapsed) this._toggleCollapse(); // auto-expand on new objective
  }

  /** Update a numeric progress sub-line (e.g. "3 / 8 enemies"). */
  setProgress(current: number, total: number, label = 'done'): void {
    if (total <= 0) {
      this._progressEl.style.display = 'none';
      this._progressFill.style.width = '0%';
      return;
    }
    this._progressEl.style.display = '';
    this._progressEl.textContent = `${current} / ${total} ${label}`;
    this._progressFill.style.width = `${Math.round((current / total) * 100)}%`;
  }

  /** Hide the tracker. */
  clear(): void {
    this._el.classList.remove('hud-ot--visible');
    this._progressEl.style.display = 'none';
  }

  dispose(): void {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    this._el.remove();
  }
}
