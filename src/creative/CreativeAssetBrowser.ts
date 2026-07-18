/**
 * CreativeAssetBrowser.ts
 *
 * Full-screen inventory overlay (press C) showing all ENV_KITS and their
 * assets grouped by kit. Click any asset to pick it up into the active
 * hotbar slot and enter "place" mode.
 *
 * Layout mirrors Minecraft's creative inventory:
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  🎨 Creative Inventory                              [✕]     │
 *  │  [Search…]                                                   │
 *  ├─── Kit groups ─────────┬─── Asset grid ───────────────────  │
 *  │  ▸ KayKit              │  [thumb] [thumb] [thumb] [thumb]   │
 *  │    KayKit Dungeon Pack  │  [thumb] [thumb] [thumb] [thumb]   │
 *  │    KayKit Nature Pack  │  …                                  │
 *  │  ▸ Kenney              │                                     │
 *  │    Fantasy Town Kit    │                                     │
 *  │  ▸ Kenney Modular      │  [Hotbar]                           │
 *  └────────────────────────┴──────────────────────────────────  ┘
 */

import { ENV_KITS, ENV_ASSETS, type EnvAssetDef } from '@/assets/envManifest';
import { setHotbarSlot, setActiveHotbarSlot, setActiveTool, getCreativeState } from './CreativeModeState';

export interface AssetBrowserCallbacks {
  /** Called when an asset is picked and should be loaded as the ghost. */
  onPickAsset: (assetPath: string) => void;
}

const CSS = `
#creative-browser-overlay {
  position: fixed; inset: 0; z-index: 9500;
  background: rgba(4,2,12,0.94); backdrop-filter: blur(6px);
  display: flex; flex-direction: column;
  font-family: 'Segoe UI', system-ui, sans-serif;
  color: rgba(220,200,255,0.85);
}
#cb-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 18px; border-bottom: 1px solid rgba(140,80,220,0.25);
  flex-shrink: 0;
}
#cb-header h2 { font-size: 13px; letter-spacing: 3px; color: #cc88ff; flex: 1; }
#cb-search {
  background: rgba(20,12,36,0.9); border: 1px solid rgba(140,80,220,0.3);
  color: #eee; padding: 5px 10px; border-radius: 4px; font-size: 12px;
  width: 220px; outline: none;
}
#cb-search:focus { border-color: rgba(200,140,255,0.6); }
#cb-close {
  background: transparent; border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4); cursor: pointer; padding: 4px 10px;
  border-radius: 4px; font-size: 11px;
}
#cb-close:hover { color: #ff6666; border-color: #ff6666; }

#cb-body { display: flex; flex: 1; overflow: hidden; }

/* Sidebar */
#cb-sidebar {
  width: 200px; flex-shrink: 0; overflow-y: auto;
  border-right: 1px solid rgba(140,80,220,0.2);
  padding: 8px 0;
}
.cb-group-hdr {
  padding: 6px 14px; font-size: 10px; font-weight: 700;
  letter-spacing: 2px; color: rgba(200,140,255,0.5);
  text-transform: uppercase; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
}
.cb-group-hdr:hover { color: #cc88ff; }
.cb-kit-btn {
  display: block; width: 100%; text-align: left; padding: 5px 12px 5px 22px;
  background: transparent; border: none; font-size: 10px;
  color: rgba(200,180,230,0.55); cursor: pointer; transition: all 0.1s;
}
.cb-kit-btn:hover, .cb-kit-btn.active { color: #cc88ff; background: rgba(100,40,180,0.2); }
.cb-kit-btn.unextracted { opacity: 0.5; }
.cb-kit-btn.unextracted::after { content: ' ⬜'; font-size: 7px; opacity: 0.5; }

/* Asset grid */
#cb-grid-wrap { flex: 1; overflow-y: auto; padding: 12px; }
#cb-grid-title { font-size: 10px; letter-spacing: 2px; color: rgba(200,140,255,0.4); margin-bottom: 10px; text-transform: uppercase; }
#cb-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;
}
.cb-asset-card {
  background: rgba(20,12,36,0.7); border: 1px solid rgba(100,60,180,0.3);
  border-radius: 6px; padding: 8px 6px 6px; cursor: pointer;
  text-align: center; transition: all 0.1s; position: relative;
}
.cb-asset-card:hover { border-color: rgba(200,100,255,0.6); background: rgba(40,20,70,0.8); }
.cb-asset-card.active { border-color: #cc88ff; background: rgba(80,40,140,0.5); }
.cb-asset-card .icon { font-size: 24px; display: block; margin-bottom: 4px; }
.cb-asset-card .name { font-size: 8px; color: rgba(200,180,230,0.6); line-height: 1.3; word-break: break-word; }
.cb-asset-card .scale { position: absolute; top: 3px; right: 4px; font-size: 7px; font-family: monospace; color: rgba(255,255,255,0.2); }
.cb-asset-card .kit-tag { font-size: 7px; color: rgba(160,120,200,0.4); margin-top: 2px; }

/* Hotbar at bottom */
#cb-hotbar-row {
  display: flex; align-items: center; gap: 8px; padding: 10px 18px;
  border-top: 1px solid rgba(140,80,220,0.2); flex-shrink: 0;
  background: rgba(8,4,18,0.8);
}
#cb-hotbar-row .hotbar-label { font-size: 9px; color: rgba(255,255,255,0.25); letter-spacing: 1px; margin-right: 4px; }
.cb-slot {
  width: 40px; height: 40px; background: rgba(20,12,36,0.8);
  border: 1.5px solid rgba(100,60,180,0.4); border-radius: 5px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 8px; color: rgba(200,180,230,0.4); cursor: pointer; position: relative;
  transition: all 0.1s;
}
.cb-slot:hover { border-color: rgba(200,100,255,0.6); }
.cb-slot.active { border-color: #cc88ff; background: rgba(80,40,140,0.5); }
.cb-slot .snum { position: absolute; top: 2px; left: 3px; font-size: 7px; color: rgba(255,255,255,0.2); }
.cb-slot .sicon { font-size: 16px; }
.cb-slot .sname { font-size: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 36px; }
`;

function injectCSS(): void {
  if (document.getElementById('creative-browser-css')) return;
  const el = document.createElement('style');
  el.id = 'creative-browser-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

type KitGroup = 'kaykit' | 'kenney' | 'kenney_modular';
const GROUP_LABELS: Record<KitGroup, string> = {
  kaykit:          'KayKit',
  kenney:          'Kenney',
  kenney_modular:  'Kenney Modular',
};

export class CreativeAssetBrowser {
  private _el:      HTMLElement | null = null;
  private _visible  = false;
  private _activeKit: string = 'all';
  private _searchText = '';

  constructor(private readonly cb: AssetBrowserCallbacks) {}

  get visible(): boolean { return this._visible; }

  toggle(): void {
    if (this._visible) this.hide();
    else               this.show();
  }

  show(): void {
    if (this._visible) return;
    injectCSS();
    this._build();
    this._visible = true;
  }

  hide(): void {
    if (!this._visible) return;
    this._el?.remove();
    this._el = null;
    this._visible = false;
  }

  // ── Build ────────────────────────────────────────────────────────────────

  private _build(): void {
    const root = document.createElement('div');
    root.id = 'creative-browser-overlay';

    // Header
    root.innerHTML = `
      <div id="cb-header">
        <h2>🎨 Creative Inventory</h2>
        <input id="cb-search" type="text" placeholder="Search assets…" />
        <button id="cb-close">✕ Close [C]</button>
      </div>
      <div id="cb-body">
        <div id="cb-sidebar"></div>
        <div id="cb-grid-wrap">
          <div id="cb-grid-title">ALL ASSETS</div>
          <div id="cb-grid"></div>
        </div>
      </div>
      <div id="cb-hotbar-row">
        <span class="hotbar-label">HOTBAR</span>
      </div>
    `;

    this._el = root;
    document.body.appendChild(root);

    this._buildSidebar();
    this._buildGrid('all');
    this._buildHotbar();

    root.querySelector('#cb-close')?.addEventListener('click', () => this.hide());
    root.querySelector('#cb-search')?.addEventListener('input', (e) => {
      this._searchText = (e.target as HTMLInputElement).value.toLowerCase();
      this._buildGrid(this._activeKit);
    });

    // Click outside the card area closes
    root.addEventListener('click', (e) => {
      if (e.target === root) this.hide();
    });
  }

  private _buildSidebar(): void {
    const sidebar = this._el?.querySelector('#cb-sidebar');
    if (!sidebar) return;

    // All button
    const allBtn = document.createElement('button');
    allBtn.className = 'cb-kit-btn' + (this._activeKit === 'all' ? ' active' : '');
    allBtn.dataset['kitId'] = 'all';
    allBtn.textContent = '🌍  All Assets';
    allBtn.addEventListener('click', () => this._selectKit('all'));
    sidebar.appendChild(allBtn);

    const groups: KitGroup[] = ['kaykit', 'kenney', 'kenney_modular'];
    for (const group of groups) {
      const hdr = document.createElement('div');
      hdr.className = 'cb-group-hdr';
      hdr.innerHTML = `<span>▸</span><span>${GROUP_LABELS[group]}</span>`;
      sidebar.appendChild(hdr);

      const kits = ENV_KITS.filter(k => k.group === group);
      for (const kit of kits) {
        const btn = document.createElement('button');
        btn.className = 'cb-kit-btn' +
          (this._activeKit === kit.id ? ' active' : '') +
          (kit.extracted ? '' : ' unextracted');
        btn.dataset['kitId'] = kit.id;
        btn.textContent = `${kit.icon} ${kit.label}`;
        btn.title = kit.extracted ? kit.archive : `${kit.archive}\n\nNot yet extracted — click to see info`;
        btn.addEventListener('click', () => this._selectKit(kit.id));
        sidebar.appendChild(btn);
      }
    }
  }

  private _selectKit(kitId: string): void {
    this._activeKit = kitId;
    // Update active state using data-kit-id for reliable matching
    this._el?.querySelectorAll<HTMLElement>('.cb-kit-btn').forEach(btn => {
      const bid = btn.dataset['kitId'];
      const isAll = !bid && btn.textContent?.includes('All Assets');
      btn.classList.toggle('active',
        kitId === 'all' ? !!isAll : bid === kitId
      );
    });
    const titleEl = this._el?.querySelector('#cb-grid-title');
    if (titleEl) {
      const kit = ENV_KITS.find(k => k.id === kitId);
      titleEl.textContent = kitId === 'all' ? 'ALL ASSETS'
        : kit ? `${kit.icon}  ${kit.label.toUpperCase()}${kit.extracted ? '' : '  ⬜ NOT EXTRACTED'}`
        : kitId.toUpperCase();
    }
    this._buildGrid(kitId);
  }

  private _buildGrid(kitId: string): void {
    const grid = this._el?.querySelector('#cb-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const isGroup = (id: string) => ['kaykit', 'kenney', 'kenney_modular'].includes(id);
    const assets = ENV_ASSETS.filter(a => {
      const kitOk = kitId === 'all' ? true
        : isGroup(kitId) ? (ENV_KITS.find(k => k.id === a.kitId)?.group === kitId)
        : a.kitId === kitId;
      const textOk = !this._searchText || a.name.toLowerCase().includes(this._searchText) || a.kitId.toLowerCase().includes(this._searchText);
      return kitOk && textOk;
    });

    const state = getCreativeState();

    for (const asset of assets) {
      const kit  = ENV_KITS.find(k => k.id === asset.kitId);
      const card = document.createElement('div');
      card.className = 'cb-asset-card';
      if (state.hotbar[state.activeHotbarSlot] === asset.path) card.classList.add('active');
      card.innerHTML = `
        <span class="icon">${kit?.icon ?? '📦'}</span>
        <span class="scale">×${asset.gameScale}</span>
        <div class="name">${asset.name}</div>
        <div class="kit-tag">${kit?.label ?? asset.kitId}</div>
      `;
      card.addEventListener('click', () => this._pickAsset(asset));
      grid.appendChild(card);
    }

    if (!assets.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;padding:24px;text-align:center;';
      // Show helpful info for unextracted kits
      const kit = ENV_KITS.find(k => k.id === kitId);
      if (kit && !kit.extracted && !this._searchText) {
        empty.innerHTML = `
          <div style="font-size:32px;margin-bottom:12px">${kit.icon}</div>
          <div style="color:rgba(255,255,255,0.5);font-size:12px;font-weight:600;margin-bottom:8px">${kit.label}</div>
          <div style="color:rgba(255,255,255,0.3);font-size:10px;line-height:1.6">
            ${kit.models} models — <code style="font-size:9px">${kit.archive}</code>
          </div>
        `;
      } else {
        empty.style.color = 'rgba(255,255,255,0.2)';
        empty.style.fontSize = '11px';
        empty.textContent = this._searchText ? 'No assets match your search.' : 'No extracted assets in this kit yet.';
      }
      grid.appendChild(empty);
    }
  }

  private _pickAsset(asset: EnvAssetDef): void {
    const state = getCreativeState();
    setHotbarSlot(state.activeHotbarSlot, asset.path);
    setActiveTool('place');
    this.cb.onPickAsset(asset.path);
    this._updateHotbar();
    this._buildGrid(this._activeKit); // refresh active state
    this.hide();
  }

  private _buildHotbar(): void {
    const row = this._el?.querySelector('#cb-hotbar-row');
    if (!row) return;
    const state = getCreativeState();
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'cb-slot' + (i === state.activeHotbarSlot ? ' active' : '');
      slot.dataset['slot'] = String(i);
      const path = state.hotbar[i];
      slot.innerHTML = `
        <span class="snum">${i + 1}</span>
        <span class="sicon">${path ? '📦' : '—'}</span>
        <span class="sname">${path ? (path.split('/').pop()?.replace(/\.(gltf|glb)$/,'') ?? '') : 'Empty'}</span>
      `;
      slot.addEventListener('click', () => {
        setActiveHotbarSlot(i);
        this._updateHotbar();
      });
      row.appendChild(slot);
    }
  }

  private _updateHotbar(): void {
    const row = this._el?.querySelector('#cb-hotbar-row');
    if (!row) return;
    const state = getCreativeState();
    row.querySelectorAll<HTMLElement>('.cb-slot').forEach((el, i) => {
      el.classList.toggle('active', i === state.activeHotbarSlot);
      const path = state.hotbar[i];
      const sicon = el.querySelector('.sicon');
      const sname = el.querySelector('.sname');
      if (sicon) sicon.textContent = path ? '📦' : '—';
      if (sname) sname.textContent = path ? (path.split('/').pop()?.replace(/\.(gltf|glb)$/,'') ?? '') : 'Empty';
    });
  }
}
