/**
 * QuestLog — [Q] key overlay listing active quests.
 *
 * Parchment-style panel reusing the BookReader aesthetic.
 * Each quest shows: title, giver, description, target location tag.
 * Completed quests are struck through and greyed.
 */

import type { QuestDef } from '@/world/QuestDef';
import { injectHudTheme } from './hudTheme';

// ── Styles ────────────────────────────────────────────────────────────────────

const CSS = `
#quest-log {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 480px; max-width: 92vw; max-height: 70vh;
  display: flex; flex-direction: column;
  background: linear-gradient(160deg, #2a1e0f 0%, #1a1208 100%);
  border: 1px solid var(--hud-border-warm); border-radius: var(--hud-radius);
  box-shadow: var(--hud-shadow);
  font-family: var(--hud-font-body); color: var(--hud-text);
  z-index: 300; overflow: hidden;
  animation: hudFadeIn .18s ease;
}
#quest-log-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 10px;
  border-bottom: 1px solid rgba(90,60,26,0.5);
}
#quest-log-title {
  font-family: var(--hud-font-serif); font-size: 14px; letter-spacing: 3px;
  text-transform: uppercase; color: var(--hud-gold);
}
#quest-log-close {
  font-family: var(--hud-font-mono); font-size: 11px; color: var(--hud-muted);
  background: none; border: none; cursor: default;
}
#quest-log-body {
  overflow-y: auto; padding: 12px 20px 16px;
  flex: 1;
}
#quest-log-body::-webkit-scrollbar { width: 4px; }
#quest-log-body::-webkit-scrollbar-track { background: transparent; }
#quest-log-body::-webkit-scrollbar-thumb { background: var(--hud-border-warm); border-radius: 2px; }

.ql-section-header {
  display: flex; align-items: center; gap: 10px;
  margin: 12px 0 8px;
  color: var(--hud-gold);
  font-family: var(--hud-font-serif); font-size: 10px; letter-spacing: 2px;
  text-transform: uppercase;
}
.ql-section-header::before, .ql-section-header::after {
  content: ''; flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, var(--hud-border-warm), transparent);
}

.ql-quest {
  margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid rgba(90,60,26,0.3);
}
.ql-quest:last-child { border-bottom: none; margin-bottom: 0; }

.ql-quest--story {
  background: rgba(90,60,10,0.15);
  border-radius: var(--hud-radius-sm);
  padding: 8px 10px 8px;
  margin-bottom: 12px;
}
.ql-quest--story .ql-title { color: var(--hud-gold-bright); }

.ql-act-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 8px;
  background: rgba(90,60,10,0.5);
  border: 1px solid var(--hud-border-warm);
  font-family: var(--hud-font-mono); font-size: 9px; letter-spacing: 1px;
  color: var(--hud-gold); margin-left: 6px;
  vertical-align: middle;
}

.ql-species-icon { margin-right: 4px; font-size: 14px; }

.ql-title {
  font-family: var(--hud-font-serif); font-size: 13px; letter-spacing: 1px;
  color: var(--hud-text); margin-bottom: 3px;
}
.ql-quest--done .ql-title { text-decoration: line-through; color: var(--hud-muted); }

.ql-meta {
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  color: var(--hud-muted); margin-bottom: 5px;
}

.ql-desc { font-size: 12px; color: var(--hud-text); line-height: 1.5; margin-bottom: 5px; }
.ql-quest--done .ql-desc { color: var(--hud-muted); }

.ql-target { font-size: 11px; color: #7a8a6a; font-style: italic; margin-bottom: 3px; }
.ql-reward { font-size: 11px; color: var(--hud-gold); }

.ql-completed-toggle {
  font-family: var(--hud-font-mono); font-size: 11px; color: var(--hud-muted);
  background: none; border: none; cursor: pointer; width: 100%;
  text-align: left; padding: 4px 0; margin-top: 6px;
}
.ql-completed-toggle:hover { color: var(--hud-text); }

.ql-empty {
  font-size: 13px; color: var(--hud-muted); font-style: italic; text-align: center;
  padding: 20px 0;
}
`;

// ── QuestLog ──────────────────────────────────────────────────────────────────

export class QuestLog {
  private _panel:   HTMLDivElement | null = null;
  private _visible: boolean = false;
  private _onKey:   (e: KeyboardEvent) => void;
  private _quests:  QuestDef[] = [];

  constructor() {
    // Inject shared theme + local CSS once
    injectHudTheme();
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

    // Split into story and world quests
    const isStory = (q: QuestDef) => q.title.startsWith('[Story] ');
    const active = this._quests.filter(q => !q.completed);
    const done   = this._quests.filter(q => q.completed);
    const storyActive  = active.filter(isStory);
    const worldActive  = active.filter(q => !isStory(q));
    const storyDone    = done.filter(isStory);
    const worldDone    = done.filter(q => !isStory(q));

    const renderSection = (label: string, quests: QuestDef[], isStorySection: boolean) => {
      if (quests.length === 0) return;
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'ql-section-header';
      sectionHeader.textContent = `◆ ${label}`;
      body.appendChild(sectionHeader);

      for (const q of quests) {
        const displayTitle = isStory ? q.title.replace(/^\[Story\] /, '') : q.title;
        const div = document.createElement('div');
        div.className = 'ql-quest'
          + (q.completed ? ' ql-quest--done' : '')
          + (isStorySection && !q.completed ? ' ql-quest--story' : '');

        const titleEl = document.createElement('div');
        titleEl.className = 'ql-title';
        titleEl.textContent = q.completed ? `✓ ${displayTitle}` : displayTitle;
        div.appendChild(titleEl);

        const meta = document.createElement('div');
        meta.className = 'ql-meta';
        meta.textContent = isStorySection
          ? q.giverName  // e.g. "The Warden · Act I"
          : `${q.type.replace(/_/g, ' ')} · ${q.giverName}`;
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
    };

    renderSection('YOUR STORY', storyActive, true);
    renderSection('WORLD QUESTS', worldActive, false);
    if (storyDone.length + worldDone.length > 0) {
      renderSection('COMPLETED', [...storyDone, ...worldDone], false);
    }
  }
}
