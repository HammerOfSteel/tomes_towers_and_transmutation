/**
 * QuestLog — [Q] key overlay listing active quests.
 *
 * Parchment-style panel reusing the BookReader aesthetic.
 * Each quest shows: title, giver, description, target location tag.
 * Completed quests are struck through and greyed.
 */

import type { QuestDef } from '@/world/QuestDef';

// ── Styles ────────────────────────────────────────────────────────────────────

const CSS = `
#quest-log {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 480px; max-width: 92vw; max-height: 70vh;
  display: flex; flex-direction: column;
  background: linear-gradient(160deg, #2a1e0f 0%, #1a1208 100%);
  border: 1px solid #5a3a1a; border-radius: 4px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.92);
  font-family: Georgia, serif; color: #e8d4a0;
  z-index: 300; overflow: hidden;
}
#quest-log-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 10px;
  border-bottom: 1px solid rgba(90,60,26,0.5);
}
#quest-log-title {
  font-family: 'Cinzel', serif; font-size: 14px; letter-spacing: 3px;
  text-transform: uppercase; color: #c8963c;
}
#quest-log-close {
  font-family: monospace; font-size: 11px; color: #6a5a3a;
  background: none; border: none; cursor: default;
}
#quest-log-body {
  overflow-y: auto; padding: 12px 20px 16px;
  flex: 1;
}
#quest-log-body::-webkit-scrollbar { width: 4px; }
#quest-log-body::-webkit-scrollbar-track { background: transparent; }
#quest-log-body::-webkit-scrollbar-thumb { background: #5a3a1a; border-radius: 2px; }

.ql-quest {
  margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid rgba(90,60,26,0.3);
}
.ql-quest:last-child { border-bottom: none; margin-bottom: 0; }

.ql-quest--done { opacity: 0.45; }
.ql-quest--done .ql-title { text-decoration: line-through; }

.ql-title {
  font-family: 'Cinzel', serif; font-size: 13px; color: #ddb86a;
  margin-bottom: 4px;
}
.ql-meta {
  font-family: monospace; font-size: 10px; color: #6a5a3a;
  margin-bottom: 6px;
}
.ql-desc {
  font-size: 13px; line-height: 1.55; color: #cbbf9a;
}
.ql-target {
  margin-top: 6px; font-family: monospace; font-size: 10px;
  color: #8888aa;
}
.ql-reward {
  margin-top: 6px; font-family: monospace; font-size: 10px; color: #80aa60;
}
.ql-empty {
  font-size: 13px; color: #5a4a2a; font-style: italic; text-align: center;
  margin-top: 20px;
}
`;

// ── QuestLog ──────────────────────────────────────────────────────────────────

export class QuestLog {
  private _panel:   HTMLDivElement | null = null;
  private _visible: boolean = false;
  private _onKey:   (e: KeyboardEvent) => void;
  private _quests:  QuestDef[] = [];

  constructor() {
    // Inject CSS once
    if (!document.getElementById('ql-style')) {
      const style = document.createElement('style');
      style.id = 'ql-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this._onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        this.toggle();
      }
      if ((e.code === 'Escape' || e.code === 'KeyQ') && this._visible) {
        this.hide();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  addQuest(quest: QuestDef): void {
    if (!this._quests.find(q => q.id === quest.id)) {
      this._quests.push(quest);
      if (this._visible) this._render();
    }
  }

  markCompleted(questId: string): void {
    const q = this._quests.find(q => q.id === questId);
    if (q) { q.completed = true; if (this._visible) this._render(); }
  }

  markFulfilled(questId: string): void {
    const q = this._quests.find(q => q.id === questId);
    if (q) { q.fulfilled = true; if (this._visible) this._render(); }
  }

  getActive(): QuestDef[] { return this._quests.filter(q => !q.completed); }
  getAll():    QuestDef[] { return this._quests; }

  show(): void {
    this._visible = true;
    this._ensurePanel();
    this._render();
    this._panel!.style.display = 'flex';
  }

  hide(): void {
    this._visible = false;
    if (this._panel) this._panel.style.display = 'none';
  }

  toggle(): void { if (this._visible) this.hide(); else this.show(); }

  isVisible(): boolean { return this._visible; }

  dispose(): void {
    window.removeEventListener('keydown', this._onKey);
    this._panel?.remove();
    this._panel = null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _ensurePanel(): void {
    if (this._panel) return;

    this._panel = document.createElement('div');
    this._panel.id = 'quest-log';
    this._panel.style.display = 'none';

    const header = document.createElement('div');
    header.id = 'quest-log-header';

    const title = document.createElement('div');
    title.id = 'quest-log-title';
    title.textContent = 'Quest Log';

    const hint = document.createElement('div');
    hint.id = 'quest-log-close';
    hint.textContent = '[Q] / [Esc] to close';

    header.appendChild(title);
    header.appendChild(hint);

    const body = document.createElement('div');
    body.id = 'quest-log-body';

    this._panel.appendChild(header);
    this._panel.appendChild(body);
    document.body.appendChild(this._panel);
  }

  private _render(): void {
    const body = document.getElementById('quest-log-body');
    if (!body) return;

    body.innerHTML = '';

    if (this._quests.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ql-empty';
      empty.textContent = 'No quests yet. Talk to people.';
      body.appendChild(empty);
      return;
    }

    // Active first, then completed
    const sorted = [
      ...this._quests.filter(q => !q.completed),
      ...this._quests.filter(q => q.completed),
    ];

    for (const q of sorted) {
      const div = document.createElement('div');
      div.className = 'ql-quest' + (q.completed ? ' ql-quest--done' : '');

      const titleEl = document.createElement('div');
      titleEl.className = 'ql-title';
      titleEl.textContent = q.completed ? `✓ ${q.title}` : q.title;
      div.appendChild(titleEl);

      const meta = document.createElement('div');
      meta.className = 'ql-meta';
      meta.textContent = `${q.type.replace(/_/g, ' ')} · given by ${q.giverName}`;
      div.appendChild(meta);

      const desc = document.createElement('div');
      desc.className = 'ql-desc';
      desc.textContent = q.description;
      div.appendChild(desc);

      const target = document.createElement('div');
      target.className = 'ql-target';
      target.textContent = `Target: ${q.target.label}`;
      div.appendChild(target);

      if (!q.completed) {
        const rew = document.createElement('div');
        rew.className = 'ql-reward';
        rew.textContent = `Reward: ${q.reward.gold} gold · ${q.reward.xp} XP`;
        div.appendChild(rew);
      }

      body.appendChild(div);
    }
  }
}
