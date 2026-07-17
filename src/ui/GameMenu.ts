// ── GameMenu ──────────────────────────────────────────────────────────────────
//
//  WoW-style in-game hub opened by ESC.
//  Left sidebar: icon tabs (Journal, Grimoire, Character, Talents, Crafting,
//                            Inventory, System, Dev).
//  Right panel: content for the active tab (embeds existing panels or renders
//               its own content for System/Dev stubs).
//
//  For panels that are standalone overlays (QuestLog, SpellBook, etc.) each
//  tab button is a launcher — it closes the GameMenu and opens the panel.
//  System tab is rendered inline.

import { injectHudTheme } from './hudTheme';

const CSS = `
#game-menu-overlay {
  position: fixed; inset: 0;
  display: none; align-items: center; justify-content: center;
  background: rgba(0,0,0,.78);
  z-index: 600;
}
#game-menu-overlay.gm--open { display: flex; }

.gm-shell {
  width: min(92vw, 780px);
  max-height: 88vh;
  display: flex;
  overflow: hidden;
  border-radius: 6px;
}

/* ── Sidebar ── */
.gm-sidebar {
  width: 80px; flex-shrink: 0;
  background: rgba(0,0,0,.65);
  border-right: 1px solid var(--hud-border);
  display: flex; flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 4px;
}
.gm-tab {
  width: 56px; height: 56px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: background .12s, border-color .12s;
}
.gm-tab:hover { background: rgba(255,255,255,.07); border-color: var(--hud-border); }
.gm-tab.gm-tab--active {
  background: rgba(200,150,60,.12);
  border-color: var(--hud-gold);
}
.gm-tab-icon { font-size: 22px; line-height: 1; }
.gm-tab-label {
  font-family: var(--hud-font-mono); font-size: 7px;
  letter-spacing: 1px; text-transform: uppercase;
  color: var(--hud-muted); text-align: center;
}
.gm-tab--active .gm-tab-label { color: var(--hud-gold); }
.gm-tab--dev { margin-top: auto; }

/* ── Content pane ── */
.gm-content {
  flex: 1; min-width: 0;
  background: var(--hud-bg);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.gm-pane-header {
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--hud-border);
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}
.gm-pane-close {
  font-size: 10px; letter-spacing: 1px; color: var(--hud-muted);
  cursor: pointer; font-family: var(--hud-font-mono);
}
.gm-pane-close:hover { color: var(--hud-text); }

.gm-pane-body {
  flex: 1; overflow-y: auto;
  padding: 18px 22px;
  display: flex; flex-direction: column; gap: 12px;
}

/* ── Launcher tiles (for panels that open as overlays) ── */
.gm-launchers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
.gm-launcher {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px;
  padding: 18px 10px;
  border: 1px solid var(--hud-border);
  border-radius: 4px;
  cursor: pointer;
  background: var(--hud-surface);
  transition: border-color .12s, background .12s;
  user-select: none;
}
.gm-launcher:hover {
  border-color: var(--hud-gold);
  background: rgba(200,150,60,.08);
}
.gm-launcher-icon { font-size: 28px; }
.gm-launcher-name {
  font-family: var(--hud-font-body); font-size: 12px; color: var(--hud-text);
}
.gm-launcher-key {
  font-family: var(--hud-font-mono); font-size: 9px; color: var(--hud-muted);
  letter-spacing: 1px;
}

/* ── System tab ── */
.gm-sys-section { display: flex; flex-direction: column; gap: 8px; }
.gm-sys-btn {
  display: block; width: 100%; max-width: 260px;
  padding: 10px 18px; text-align: left;
  font-family: var(--hud-font-body); font-size: 13px;
  cursor: pointer;
}
.gm-sys-btn:hover { border-color: var(--hud-gold) !important; }
.gm-sys-btn--danger { color: var(--hud-danger) !important; }
.gm-sys-btn--danger:hover { border-color: var(--hud-danger) !important; }

.gm-sys-info {
  font-family: var(--hud-font-mono); font-size: 10px; color: var(--hud-muted);
  letter-spacing: 1px; margin-top: 16px;
  border-top: 1px solid var(--hud-border); padding-top: 12px;
}
`;

type TabId = 'journal' | 'grimoire' | 'character' | 'talents' | 'crafting' | 'inventory' | 'system' | 'dev';

interface TabDef {
  id:     TabId;
  icon:   string;
  label:  string;
  devOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: 'journal',    icon: '📜', label: 'Journal'   },
  { id: 'grimoire',   icon: '🔮', label: 'Grimoire'  },
  { id: 'character',  icon: '⚔️', label: 'Character' },
  { id: 'talents',    icon: '✨', label: 'Talents'   },
  { id: 'crafting',   icon: '🔨', label: 'Crafting'  },
  { id: 'inventory',  icon: '🎒', label: 'Inventory' },
  { id: 'system',     icon: '⚙️', label: 'System'    },
  { id: 'dev',        icon: '🛠️', label: 'Dev',  devOnly: true },
];

export interface GameMenuActions {
  openQuestLog:    () => void;
  openSpellBook:   () => void;
  openStatPanel:   () => void;
  openTalentTree:  () => void;
  openCrafting:    () => void;
  openDevPanel:    () => void;
  onSave:          () => void;
  onQuit:          () => void;
  isDevMode:       () => boolean;
  // Inventory is not yet a standalone panel — placeholder that opens quest log for now
  openInventory?:  () => void;
}

export class GameMenu {
  private readonly _el: HTMLElement;
  private readonly _sidebar: HTMLElement;
  private readonly _contentTitle: HTMLElement;
  private readonly _contentBody: HTMLElement;
  private _open    = false;
  private _activeTab: TabId = 'journal';

  constructor(private readonly actions: GameMenuActions) {
    injectHudTheme();
    if (!document.getElementById('gm-css')) {
      const s = document.createElement('style');
      s.id = 'gm-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    this._el = document.createElement('div');
    this._el.id = 'game-menu-overlay';

    const shell = document.createElement('div');
    shell.className = 'hud-panel gm-shell';

    // Sidebar
    this._sidebar = document.createElement('div');
    this._sidebar.className = 'gm-sidebar';
    this._buildSidebar();

    // Content
    const content = document.createElement('div');
    content.className = 'gm-content';

    const header = document.createElement('div');
    header.className = 'gm-pane-header';
    this._contentTitle = document.createElement('div');
    this._contentTitle.className = 'hud-title';
    const closeBtn = document.createElement('div');
    closeBtn.className = 'gm-pane-close';
    closeBtn.textContent = '[Esc] Close';
    closeBtn.addEventListener('click', () => this.close());
    header.append(this._contentTitle, closeBtn);

    this._contentBody = document.createElement('div');
    this._contentBody.className = 'gm-pane-body';

    content.append(header, this._contentBody);
    shell.append(this._sidebar, content);
    this._el.appendChild(shell);

    this._el.addEventListener('click', (e) => { if (e.target === this._el) this.close(); });

    document.body.appendChild(this._el);
  }

  get isOpen(): boolean { return this._open; }

  open(tab?: TabId): void {
    this._open = true;
    this._el.classList.add('gm--open');
    this._selectTab(tab ?? this._activeTab);
  }

  close(): void {
    this._open = false;
    this._el.classList.remove('gm--open');
  }

  toggle(tab?: TabId): void { this._open ? this.close() : this.open(tab); }

  dispose(): void { this._el.remove(); }

  // ── Private ──────────────────────────────────────────────────────────────

  private _buildSidebar(): void {
    this._sidebar.innerHTML = '';
    const devMode = this.actions.isDevMode();
    for (const tab of TABS) {
      if (tab.devOnly && !devMode) continue;
      const btn = document.createElement('div');
      btn.className = 'gm-tab' + (tab.devOnly ? ' gm-tab--dev' : '');
      btn.dataset['tabId'] = tab.id;
      btn.innerHTML = `<span class="gm-tab-icon">${tab.icon}</span><span class="gm-tab-label">${tab.label}</span>`;
      btn.addEventListener('click', () => this._selectTab(tab.id as TabId));
      this._sidebar.appendChild(btn);
    }
  }

  private _selectTab(id: TabId): void {
    this._activeTab = id;
    // Update active class on sidebar buttons
    for (const btn of this._sidebar.querySelectorAll<HTMLElement>('.gm-tab')) {
      btn.classList.toggle('gm-tab--active', btn.dataset['tabId'] === id);
    }
    const def = TABS.find(t => t.id === id);
    this._contentTitle.textContent = def?.label ?? '';
    this._renderContent(id);
  }

  private _renderContent(tab: TabId): void {
    this._contentBody.innerHTML = '';

    switch (tab) {
      case 'journal':   return this._renderLauncher('📜', 'Quest Journal', 'Q', 'View your active story and world quests.', () => { this.close(); this.actions.openQuestLog(); });
      case 'grimoire':  return this._renderLauncher('🔮', 'Grimoire', 'K', 'Manage and assign your spells to action slots.', () => { this.close(); this.actions.openSpellBook(); });
      case 'character': return this._renderLauncher('⚔️', 'Character Sheet', 'P', 'View your stats, level, and equipped items.', () => { this.close(); this.actions.openStatPanel(); });
      case 'talents':   return this._renderLauncher('✨', 'Talent Tree', 'T', 'Spend talent points to improve your abilities.', () => { this.close(); this.actions.openTalentTree(); });
      case 'crafting':  return this._renderLauncher('🔨', 'Crafting', 'E near forge', 'Walk up to a crafting station and press E.', () => { this.close(); this.actions.openCrafting(); });
      case 'inventory': return this._renderInventory();
      case 'system':    return this._renderSystem();
      case 'dev':       return this._renderDevLauncher();
    }
  }

  private _renderLauncher(icon: string, name: string, key: string, desc: string, onOpen: () => void): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px 0;';

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'font-size:48px;';
    iconEl.textContent = icon;

    const nameEl = document.createElement('div');
    nameEl.className = 'hud-title';
    nameEl.textContent = name;

    const descEl = document.createElement('div');
    descEl.style.cssText = 'font-family:var(--hud-font-body);font-size:12px;color:var(--hud-muted);text-align:center;max-width:260px;';
    descEl.textContent = desc;

    const btn = document.createElement('button');
    btn.className = 'hud-btn hud-btn-primary';
    btn.textContent = `Open  [${key}]`;
    btn.style.marginTop = '8px';
    btn.addEventListener('click', onOpen);

    wrap.append(iconEl, nameEl, descEl, btn);
    this._contentBody.appendChild(wrap);
  }

  private _renderInventory(): void {
    const note = document.createElement('div');
    note.style.cssText = 'color:var(--hud-muted);font-family:var(--hud-font-body);font-size:13px;line-height:1.6;';
    note.innerHTML = `
      <div style="font-size:36px;margin-bottom:12px;">🎒</div>
      <div style="color:var(--hud-text);font-family:var(--hud-font-serif);font-size:15px;margin-bottom:8px;">Inventory</div>
      <p>Your resources and crafted items are shown in the top-left HUD bar.</p>
      <p style="margin-top:8px;">Potions are managed in the quick-slot bar (bottom-right).<br>
      Use <kbd style="background:rgba(255,255,255,.08);border:1px solid var(--hud-border);padding:1px 6px;border-radius:3px;font-size:10px;">[Z]</kbd> Minor Heal &nbsp;
      <kbd style="background:rgba(255,255,255,.08);border:1px solid var(--hud-border);padding:1px 6px;border-radius:3px;font-size:10px;">[X]</kbd> Major Heal</p>
      <p style="margin-top:8px;color:var(--hud-muted);font-size:11px;font-family:var(--hud-font-mono);">Full inventory panel coming in a future update.</p>
    `;
    note.style.textAlign = 'center';
    this._contentBody.appendChild(note);
  }

  private _renderSystem(): void {
    const btns: Array<{ label: string; danger?: boolean; action: () => void }> = [
      { label: '▶  Resume',                action: () => this.close() },
      { label: '💾  Save Game',             action: () => { this.actions.onSave(); this.close(); } },
      { label: '📋  Controls & Help  [H]',  action: () => { this.close(); /* H key handles it */ document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', code: 'KeyH', bubbles: true })); } },
      { label: '🔖  Return to Main Menu',   action: () => { this.actions.onQuit(); this.close(); }, danger: true },
    ];
    const section = document.createElement('div');
    section.className = 'gm-sys-section';
    for (const b of btns) {
      const btn = document.createElement('button');
      btn.className = 'hud-btn gm-sys-btn' + (b.danger ? ' gm-sys-btn--danger hud-btn-danger' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.action);
      section.appendChild(btn);
    }

    const info = document.createElement('div');
    info.className = 'gm-sys-info';
    info.textContent = `Tomes, Towers & Transmutation  ·  v0.1.0-dev`;
    section.appendChild(info);
    this._contentBody.appendChild(section);
  }

  private _renderDevLauncher(): void {
    return this._renderLauncher('🛠️', 'Backrooms', '`', 'World Editor · Dev Panel · Debug tools.', () => { this.close(); this.actions.openDevPanel(); });
  }
}
