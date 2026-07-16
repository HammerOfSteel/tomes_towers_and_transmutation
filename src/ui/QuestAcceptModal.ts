// ── QuestAcceptModal ──────────────────────────────────────────────────────
//
//  A modal shown when an NPC offers a quest.  The player can Accept or Decline.
//
//  Usage:
//    modal.show(quest, () => questLog.addQuest(quest));

import { injectHudTheme } from './hudTheme';
import type { QuestDef } from '@/world/QuestDef';

const QAM_CSS = `
#quest-accept-modal {
  position: fixed; inset: 0;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.7);
  z-index: 800;
  opacity: 0; transition: opacity .18s ease;
}
#quest-accept-modal.qam--open {
  display: flex;
  opacity: 1;
}

.qam-box {
  width: min(92vw, 400px);
  padding: 0;
  overflow: hidden;
}

.qam-header {
  padding: 12px 18px 10px;
  border-bottom: 1px solid var(--hud-border-warm);
  background: rgba(0,0,0,0.35);
}
.qam-giver {
  font-family: var(--hud-font-mono); font-size: 9px;
  letter-spacing: 2px; color: var(--hud-muted);
  text-transform: uppercase; margin-bottom: 4px;
}
.qam-title { color: var(--hud-gold); }

.qam-body {
  padding: 14px 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.qam-desc {
  font-family: var(--hud-font-body); font-size: 12px;
  color: var(--hud-text); line-height: 1.55;
}
.qam-target {
  font-family: var(--hud-font-body); font-size: 11px;
  color: var(--hud-muted); border-left: 2px solid var(--hud-border);
  padding-left: 10px;
}
.qam-reward {
  font-family: var(--hud-font-mono); font-size: 11px;
  color: var(--hud-gold); letter-spacing: .5px;
}

.qam-footer {
  padding: 10px 18px 14px;
  display: flex; gap: 10px; justify-content: flex-end;
  border-top: 1px solid var(--hud-border);
}
`;

export class QuestAcceptModal {
  private readonly _el: HTMLElement;
  private readonly _giverEl: HTMLElement;
  private readonly _titleEl: HTMLElement;
  private readonly _descEl: HTMLElement;
  private readonly _targetEl: HTMLElement;
  private readonly _rewardEl: HTMLElement;
  private _onAccept: (() => void) | null = null;

  get isOpen(): boolean { return this._el.classList.contains('qam--open'); }

  constructor() {
    injectHudTheme();
    if (!document.getElementById('hud-qam-css')) {
      const s = document.createElement('style');
      s.id = 'hud-qam-css';
      s.textContent = QAM_CSS;
      document.head.appendChild(s);
    }

    this._el = document.createElement('div');
    this._el.id = 'quest-accept-modal';

    const box = document.createElement('div');
    box.className = 'hud-panel hud-panel--warm qam-box';

    // Header
    const header = document.createElement('div');
    header.className = 'qam-header';
    this._giverEl = document.createElement('div');
    this._giverEl.className = 'qam-giver';
    this._titleEl = document.createElement('div');
    this._titleEl.className = 'hud-title-sm qam-title';
    header.append(this._giverEl, this._titleEl);

    // Body
    const body = document.createElement('div');
    body.className = 'qam-body';
    this._descEl   = document.createElement('div'); this._descEl.className   = 'qam-desc';
    this._targetEl = document.createElement('div'); this._targetEl.className = 'qam-target';
    this._rewardEl = document.createElement('div'); this._rewardEl.className = 'qam-reward';
    body.append(this._descEl, this._targetEl, this._rewardEl);

    // Footer buttons
    const footer = document.createElement('div');
    footer.className = 'qam-footer';

    const declineBtn = document.createElement('button');
    declineBtn.className = 'hud-btn';
    declineBtn.textContent = 'Decline';
    declineBtn.addEventListener('click', () => this.close());

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'hud-btn hud-btn-primary';
    acceptBtn.textContent = 'Accept Quest';
    acceptBtn.addEventListener('click', () => {
      this._onAccept?.();
      this.close();
    });
    footer.append(declineBtn, acceptBtn);

    box.append(header, body, footer);
    this._el.appendChild(box);

    // Close on backdrop click
    this._el.addEventListener('click', (e) => { if (e.target === this._el) this.close(); });
    // Close on Esc
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.isOpen) this.close(); });

    document.body.appendChild(this._el);
  }

  show(quest: QuestDef, onAccept: () => void): void {
    this._giverEl.textContent  = quest.giverName;
    this._titleEl.textContent  = quest.title.replace(/^\[Story\] /, '');
    this._descEl.textContent   = quest.description;
    this._targetEl.textContent = `Target: ${quest.target.label}`;
    this._rewardEl.textContent = `Reward: ${quest.reward.gold}g  ·  ${quest.reward.xp} XP`;
    this._onAccept = onAccept;
    this._el.classList.add('qam--open');
  }

  close(): void {
    this._el.classList.remove('qam--open');
    this._onAccept = null;
  }

  dispose(): void {
    this._el.remove();
  }
}
