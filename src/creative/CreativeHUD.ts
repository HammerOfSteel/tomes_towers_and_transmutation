/**
 * CreativeHUD.ts
 *
 * The creative-mode overlay — replaces the regular game HUD with a
 * Minecraft-style creative interface:
 *
 *  ┌─ Status bar (top) ──────────────────────────────────────────────┐
 *  │ 🎨 CREATIVE  │  Zone  │  🚀 3×  │  NoClip OFF  │  Ctrl+Shift+C │
 *  └─────────────────────────────────────────────────────────────────┘
 *                                        ┌── Quick Tools (right) ───┐
 *                                        │ 🖊 Place     [P]         │
 *                                        │ 🗑 Delete    [Del]       │
 *                                        │ 📋 Clone     [D]         │
 *                                        │ 🔍 Inspect   [I]         │
 *                                        │ 🌐 Teleport  [T]         │
 *                                        │ 🧪 Backrooms [B]         │
 *                                        │ 👤 Skin      [K]         │
 *                                        └─────────────────────────-┘
 *  ┌─ Asset hotbar (bottom) ─────────────────────────────────────────┐
 *  │   [1]    [2]    [3]    [4]    [5]    [6]    [7]    [8]         │
 *  └─────────────────────────────────────────────────────────────────┘
 */

import {
  getCreativeState, isCreativeActive,
  getSpeedMultiplier, SPEED_MULTIPLIERS,
  setActiveTool, setActiveHotbarSlot, setNoClip, setHotbarSlot,
  cycleSpeedUp, cycleSpeedDown,
  type CreativeTool,
} from './CreativeModeState';

export interface CreativeHUDCallbacks {
  onTeleport:         () => void;
  onOpenBackrooms:    () => void;
  onOpenSkinPicker:   () => void;
  onPlaceAsset:       (assetPath: string, slot: number) => void;
  onExit:             () => void;
}

// ── CSS injected once ─────────────────────────────────────────────────────────

const CSS = `
#creative-hud-root {
  position: fixed; inset: 0; pointer-events: none; z-index: 9000;
  font-family: 'Segoe UI', system-ui, sans-serif;
  user-select: none;
}

/* ── Status bar ── */
#creative-status-bar {
  position: absolute; top: 0; left: 0; right: 0;
  height: 32px; display: flex; align-items: center; gap: 0;
  background: rgba(12,8,20,0.82); backdrop-filter: blur(4px);
  border-bottom: 1px solid rgba(120,80,200,0.35);
  pointer-events: auto;
}
.csb-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 0 12px; height: 100%; font-size: 11px;
  border-right: 1px solid rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.csb-badge.creative-tag {
  color: #cc88ff; font-weight: 700; letter-spacing: 1.5px; font-size: 10px;
  background: rgba(100,40,180,0.25);
}
.csb-badge.speed { color: #44ffcc; cursor: pointer; pointer-events: auto; }
.csb-badge.noclip { cursor: pointer; pointer-events: auto; }
.csb-badge.noclip.on { color: #ff8844; }
.csb-badge.exit { margin-left: auto; color: #ff6666; cursor: pointer; pointer-events: auto; border-right: none; border-left: 1px solid rgba(255,255,255,0.07); }
.csb-badge.exit:hover { color: #ff4444; background: rgba(80,0,0,0.3); }

/* ── Quick tools ── */
#creative-quick-tools {
  position: absolute; top: 44px; right: 12px;
  background: rgba(12,8,20,0.88); backdrop-filter: blur(4px);
  border: 1px solid rgba(120,80,200,0.35); border-radius: 6px;
  overflow: hidden; pointer-events: auto;
  transition: opacity 0.15s, transform 0.15s;
}
#creative-quick-tools.hidden { opacity: 0; pointer-events: none; transform: translateX(8px); }
.cqt-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; width: 100%; font-size: 11px;
  color: rgba(200,180,230,0.7); cursor: pointer; background: transparent;
  border: none; border-bottom: 1px solid rgba(255,255,255,0.05);
  text-align: left; transition: background 0.1s, color 0.1s;
}
.cqt-btn:last-child { border-bottom: none; }
.cqt-btn:hover, .cqt-btn.active { background: rgba(100,40,180,0.25); color: #cc88ff; }
.cqt-btn .kbd { margin-left: auto; font-size: 9px; color: rgba(255,255,255,0.25); font-family: monospace; }

/* ── Hotbar ── */
#creative-hotbar {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px; align-items: center;
  background: rgba(12,8,20,0.82); backdrop-filter: blur(4px);
  border: 1px solid rgba(120,80,200,0.35); border-radius: 8px;
  padding: 5px 8px; pointer-events: auto;
}
.chb-slot {
  width: 44px; height: 44px; border: 1.5px solid rgba(120,80,200,0.4);
  border-radius: 5px; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: rgba(20,14,36,0.8); cursor: pointer;
  font-size: 9px; color: rgba(200,180,230,0.4); gap: 2px;
  transition: border-color 0.1s, background 0.1s;
  position: relative;
}
.chb-slot:hover { border-color: rgba(180,100,255,0.6); background: rgba(40,20,70,0.8); }
.chb-slot.active { border-color: #cc88ff; background: rgba(80,40,140,0.5); }
.chb-slot .slot-num { position: absolute; top: 2px; left: 4px; font-size: 8px; color: rgba(255,255,255,0.3); }
.chb-slot .slot-icon { font-size: 18px; line-height: 1; }
.chb-slot .slot-name { font-size: 7px; color: rgba(200,180,230,0.5); text-overflow: ellipsis; overflow: hidden; max-width: 38px; white-space: nowrap; }

/* ── Teleport panel ── */
#creative-teleport-panel {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  background: rgba(12,8,20,0.95); backdrop-filter: blur(6px);
  border: 1px solid rgba(120,80,200,0.5); border-radius: 10px;
  padding: 16px; min-width: 280px; pointer-events: auto;
  display: none;
}
#creative-teleport-panel h3 { color: #cc88ff; font-size: 12px; letter-spacing: 2px; margin-bottom: 10px; }
.ctp-floor-btn {
  display: block; width: 100%; text-align: left; padding: 6px 10px;
  background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.05);
  color: rgba(200,180,230,0.7); font-size: 11px; cursor: pointer;
}
.ctp-floor-btn:hover { background: rgba(100,40,180,0.25); color: #cc88ff; }
`;

function injectCSS(): void {
  if (document.getElementById('creative-hud-css')) return;
  const el = document.createElement('style');
  el.id = 'creative-hud-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

// ── Creative HUD class ────────────────────────────────────────────────────────

export class CreativeHUD {
  private _root:        HTMLElement | null = null;
  private _statusBar:   HTMLElement | null = null;
  private _zoneEl:      HTMLElement | null = null;
  private _toolEl:      HTMLElement | null = null;
  private _speedEl:     HTMLElement | null = null;
  private _noclipEl:    HTMLElement | null = null;
  private _quickTools:  HTMLElement | null = null;
  private _hotbar:      HTMLElement | null = null;
  private _teleportPanel: HTMLElement | null = null;
  private _toolsVisible = true;
  private _kbHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly cb: CreativeHUDCallbacks) {}

  mount(): void {
    if (this._root) return;
    injectCSS();

    const root = document.createElement('div');
    root.id = 'creative-hud-root';

    // Status bar
    const sb = document.createElement('div');
    sb.id = 'creative-status-bar';
    sb.innerHTML = `
      <div class="csb-badge creative-tag">🎨 CREATIVE</div>
      <div class="csb-badge" id="csb-zone">—</div>      <div class="csb-badge" id="csb-tool" title="Active tool (P=place, I=inspect, Del=delete, or click Quick Tools)">&#x270E; SELECT</div>      <div class="csb-badge speed" id="csb-speed" title="Click to cycle speed (or use [ ])">🚀 3×</div>
      <div class="csb-badge noclip" id="csb-noclip" title="Click to toggle no-clip (N)">📌 CLIP ON</div>
      <div class="csb-badge exit" id="csb-exit" title="Exit creative mode">✕ Exit Creative</div>
    `;
    root.appendChild(sb);

    // Quick tools
    const qt = document.createElement('div');
    qt.id = 'creative-quick-tools';
    const tools: Array<{ icon: string; label: string; key: string; action: () => void }> = [
      { icon: '🎨', label: 'Inventory',  key: 'C',  action: () => {} },  // handled by CreativeMode keys
      { icon: '🌍', label: 'Teleport',  key: 'T',  action: () => this._toggleTeleport() },
      { icon: '🧪', label: 'Backrooms', key: 'B',  action: () => this.cb.onOpenBackrooms() },
      { icon: '👤', label: 'Skin',      key: 'K',  action: () => this.cb.onOpenSkinPicker() },
    ];
    for (const t of tools) {
      const btn = document.createElement('button');
      btn.className = 'cqt-btn';
      btn.innerHTML = `<span>${t.icon}</span><span>${t.label}</span><span class="kbd">[${t.key}]</span>`;
      btn.addEventListener('click', () => { t.action(); });
      qt.appendChild(btn);
    }
    root.appendChild(qt);

    // Asset hotbar
    const hb = document.createElement('div');
    hb.id = 'creative-hotbar';
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'chb-slot' + (i === 0 ? ' active' : '');
      slot.dataset['slot'] = String(i);
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-icon">—</span><span class="slot-name">Empty</span>`;
      slot.addEventListener('click', () => {
        setActiveHotbarSlot(i);
        this._updateHotbarActive(i);
      });
      hb.appendChild(slot);
    }
    root.appendChild(hb);

    // Teleport panel
    const tp = document.createElement('div');
    tp.id = 'creative-teleport-panel';
    tp.innerHTML = `<h3>⬡ TELEPORT</h3><div id="ctp-floor-list"></div>`;
    root.appendChild(tp);

    document.body.appendChild(root);
    this._root       = root;
    this._statusBar  = sb;
    this._zoneEl     = sb.querySelector('#csb-zone');
    this._toolEl     = sb.querySelector('#csb-tool');
    this._speedEl    = sb.querySelector('#csb-speed');
    this._noclipEl   = sb.querySelector('#csb-noclip');
    this._quickTools = qt;
    this._hotbar     = hb;
    this._teleportPanel = tp;

    // Status bar event listeners
    sb.querySelector('#csb-speed')?.addEventListener('click', () => {
      cycleSpeedUp();
      this.refresh();
    });
    sb.querySelector('#csb-noclip')?.addEventListener('click', () => {
      const s = getCreativeState();
      setNoClip(!s.noClip);
      this.refresh();
    });
    sb.querySelector('#csb-exit')?.addEventListener('click', () => this.cb.onExit());

    // Keyboard shortcuts
    this._kbHandler = (e: KeyboardEvent) => this._onKey(e);
    window.addEventListener('keydown', this._kbHandler);

    this.refresh();
  }

  unmount(): void {
    if (!this._root) return;
    this._root.remove();
    this._root = null;
    if (this._kbHandler) {
      window.removeEventListener('keydown', this._kbHandler);
      this._kbHandler = null;
    }
  }

  /** Update all displayed values from current state. */
  refresh(): void {
    if (!this._root) return;
    const s = getCreativeState();
    if (this._zoneEl)   this._zoneEl.textContent  = s.currentZone;
    if (this._speedEl)  this._speedEl.textContent  = `🚀 ${getSpeedMultiplier()}×`;
    if (this._noclipEl) {
      this._noclipEl.textContent = s.noClip ? '🌫 NOCLIP' : '📌 GRID';
      this._noclipEl.classList.toggle('on', s.noClip);
    }
    if (this._toolEl) {
      const slot = s.hotbar[s.activeHotbarSlot];
      const name = slot ? (slot.split('/').pop()?.replace(/\.(gltf|glb)$/, '') ?? '') : null;
      this._toolEl.textContent = name ? `🖊 ${name}` : '👀 Browse [C]';
      this._toolEl.style.color = name ? '#88ffaa' : 'rgba(200,180,230,0.4)';
    }
    this._updateHotbarSlots();
  }

  /** Call each frame to keep zone label current. */
  setZone(zone: string): void {
    if (this._zoneEl) this._zoneEl.textContent = zone;
  }

  /** Populate the hotbar slot list from an array of floor/room names for teleport. */
  setTeleportFloors(floors: Array<{ id: string; name: string; onTeleport: () => void }>): void {
    const list = this._teleportPanel?.querySelector('#ctp-floor-list');
    if (!list) return;
    list.innerHTML = '';
    for (const f of floors) {
      const btn = document.createElement('button');
      btn.className = 'ctp-floor-btn';
      btn.textContent = f.name;
      btn.addEventListener('click', () => {
        f.onTeleport();
        this._closeTeleport();
      });
      list.appendChild(btn);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _onKey(e: KeyboardEvent): void {
    if (!isCreativeActive()) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (e.key) {
      case 'e': case 'E': this._toolsVisible = !this._toolsVisible; this._quickTools?.classList.toggle('hidden', !this._toolsVisible); break;
      case 'p': case 'P': setActiveTool('place');   this.refresh(); break;
      case 'i': case 'I': setActiveTool('inspect'); this.refresh(); break;
      case 'n': case 'N': { const s = getCreativeState(); setNoClip(!s.noClip); this.refresh(); break; }
      case 't': case 'T': this._toggleTeleport(); break;
      case 'b': case 'B': this.cb.onOpenBackrooms(); break;
      case 'k': case 'K': this.cb.onOpenSkinPicker(); break;
      case '[': cycleSpeedDown(); this.refresh(); break;
      case ']': cycleSpeedUp();   this.refresh(); break;
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
        setActiveHotbarSlot(parseInt(e.key) - 1);
        this._updateHotbarActive(parseInt(e.key) - 1);
        this.refresh();
        break;
    }
  }

  private _toggleTeleport(): void {
    if (!this._teleportPanel) return;
    const open = this._teleportPanel.style.display !== 'block';
    this._teleportPanel.style.display = open ? 'block' : 'none';
    if (open) this.cb.onTeleport();
  }

  private _closeTeleport(): void {
    if (this._teleportPanel) this._teleportPanel.style.display = 'none';
  }

  private _updateHotbarActive(slot: number): void {
    if (!this._hotbar) return;
    this._hotbar.querySelectorAll<HTMLElement>('.chb-slot').forEach((el, i) => {
      el.classList.toggle('active', i === slot);
    });
  }

  private _updateHotbarSlots(): void {
    if (!this._hotbar) return;
    const s = getCreativeState();
    this._hotbar.querySelectorAll<HTMLElement>('.chb-slot').forEach((el, i) => {
      const path  = s.hotbar[i];
      const icon  = el.querySelector<HTMLElement>('.slot-icon');
      const name  = el.querySelector<HTMLElement>('.slot-name');
      if (icon) icon.textContent = path ? '📦' : '—';
      if (name) name.textContent = path ? (path.split('/').pop()?.replace(/\.(gltf|glb)$/,'') ?? '') : 'Empty';
      el.classList.toggle('active', i === s.activeHotbarSlot);
      el.title = path ? `Slot ${i+1}: ${path}\nDrag an asset here or press ${i+1} to select` : `Slot ${i+1}: Empty`;
    });
  }
}
