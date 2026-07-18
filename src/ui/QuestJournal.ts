/**
 * QuestJournal.ts — C1: Tabbed quest journal extending QuestLog.
 *
 * Shows two tabs:
 *   📖 Species Quests  — quests whose IDs start with 'story_' (from StoryRunner)
 *   🗺 World Quests    — all other quests (procedural world quests, general quests)
 *
 * The [Q] key opens/closes. Escape closes.
 * setSpeciesTitle(name) sets the tab label (e.g. "Human – Raiders on the Rise").
 */

import { QuestLog }     from '@/ui/QuestLog';
import type { QuestDef } from '@/world/QuestDef';
import { injectHudTheme } from '@/ui/hudTheme';

const JOURNAL_CSS = `
#qj-root {
  display: none;
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: min(680px, 90vw);
  max-height: 72vh;
  background: rgba(4,2,14,0.97);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(180,140,255,0.25);
  border-radius: 10px;
  flex-direction: column;
  overflow: hidden;
  z-index: 700;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 11px;
  color: rgba(220,200,255,0.85);
}
#qj-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 0;
}
#qj-title { font-size: 11px; letter-spacing: 2px; color: rgba(180,140,255,0.6); }
#qj-close {
  background: transparent; border: none;
  color: rgba(255,255,255,0.3); cursor: pointer; font-size: 16px;
}
#qj-tabs {
  display: flex;
  gap: 0;
  padding: 8px 16px 0;
  border-bottom: 1px solid rgba(180,140,255,0.12);
}
.qj-tab {
  padding: 6px 14px;
  font-size: 10px; letter-spacing: 0.5px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: rgba(180,140,255,0.4);
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.qj-tab--active {
  color: rgba(200,170,255,0.9);
  border-bottom-color: rgba(180,140,255,0.7);
}
#qj-body {
  overflow-y: auto;
  flex: 1;
  padding: 12px 16px;
}
.qj-quest {
  padding: 8px 10px;
  border-radius: 5px;
  margin-bottom: 6px;
  border: 1px solid rgba(180,140,255,0.1);
  background: rgba(10,6,28,0.6);
  cursor: default;
}
.qj-quest--completed {
  opacity: 0.4;
  background: rgba(6,4,14,0.5);
}
.qj-quest-title {
  font-size: 11px; font-weight: 600;
  color: rgba(220,200,255,0.9);
  margin-bottom: 3px;
}
.qj-quest--completed .qj-quest-title {
  text-decoration: line-through;
  color: rgba(160,140,200,0.5);
}
.qj-quest-desc {
  font-size: 9.5px;
  color: rgba(180,160,220,0.5);
  line-height: 1.4;
}
.qj-empty {
  padding: 24px;
  text-align: center;
  color: rgba(180,140,255,0.3);
  font-size: 10px;
  font-style: italic;
}
`;

export class QuestJournal extends QuestLog {
  private _journalPanel: HTMLDivElement | null = null;
  private _journalVisible = false;
  private _activeTab: 'species' | 'world' = 'species';
  private _speciesTabLabel = '📖 Species Quests';
  private _onKeyJournal: (e: KeyboardEvent) => void;

  constructor() {
    super();
    injectHudTheme();
    if (!document.getElementById('qj-style')) {
      const style = document.createElement('style');
      style.id = 'qj-style';
      style.textContent = JOURNAL_CSS;
      document.head.appendChild(style);
    }

    this._onKeyJournal = (e: KeyboardEvent) => {
      if (e.code === 'KeyJ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        this.toggleJournal();
      }
      if (e.code === 'Escape' && this._journalVisible) {
        this.hideJournal();
      }
    };
    window.addEventListener('keydown', this._onKeyJournal);
  }

  /** Update the species tab label. Call when the story arc title is known. */
  setSpeciesTitle(title: string): void {
    this._speciesTabLabel = `📖 ${title}`;
    if (this._journalVisible) this._renderJournal();
  }

  toggleJournal(): void {
    this._journalVisible ? this.hideJournal() : this.showJournal();
  }

  showJournal(): void {
    this._journalVisible = true;
    this._ensureJournalPanel();
    this._renderJournal();
    this._journalPanel!.style.display = 'flex';
  }

  hideJournal(): void {
    this._journalVisible = false;
    if (this._journalPanel) this._journalPanel.style.display = 'none';
  }

  private _ensureJournalPanel(): void {
    if (this._journalPanel) return;
    this._journalPanel = document.createElement('div');
    this._journalPanel.id = 'qj-root';
    document.body.appendChild(this._journalPanel);
  }

  private _renderJournal(): void {
    const panel = this._journalPanel;
    if (!panel) return;
    const all    = this.getAll();
    const species = all.filter(q => q.id.startsWith('story_'));
    const world   = all.filter(q => !q.id.startsWith('story_'));

    panel.innerHTML = `
      <div id="qj-header">
        <span id="qj-title">QUEST JOURNAL</span>
        <button id="qj-close">✕</button>
      </div>
      <div id="qj-tabs">
        <button class="qj-tab${this._activeTab === 'species' ? ' qj-tab--active' : ''}" data-tab="species">${this._speciesTabLabel}</button>
        <button class="qj-tab${this._activeTab === 'world'   ? ' qj-tab--active' : ''}" data-tab="world">🗺 World Quests</button>
      </div>
      <div id="qj-body">
        ${this._renderQuestList(this._activeTab === 'species' ? species : world)}
      </div>
    `;

    panel.querySelector('#qj-close')?.addEventListener('click', () => this.hideJournal());
    panel.querySelectorAll('.qj-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = (btn as HTMLElement).dataset['tab'] as 'species' | 'world';
        this._renderJournal();
      });
    });
  }

  private _renderQuestList(quests: QuestDef[]): string {
    if (quests.length === 0) {
      return '<div class="qj-empty">No quests in this category yet.</div>';
    }
    return quests.map(q => `
      <div class="qj-quest${q.completed ? ' qj-quest--completed' : ''}">
        <div class="qj-quest-title">${q.completed ? '✓ ' : ''}${q.title}</div>
        <div class="qj-quest-desc">${q.description}</div>
      </div>
    `).join('');
  }

  override addQuest(quest: QuestDef): void {
    super.addQuest(quest);
    if (this._journalVisible) this._renderJournal();
  }

  override markCompleted(questId: string): void {
    super.markCompleted(questId);
    if (this._journalVisible) this._renderJournal();
  }
}
