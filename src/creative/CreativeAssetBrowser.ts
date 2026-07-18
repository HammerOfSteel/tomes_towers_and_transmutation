/**
 * CreativeAssetBrowser.ts
 *
 * Compact floating asset picker — like WoW bags or Minecraft creative inventory.
 * Opens with C key. Sits bottom-right of the screen, never covers the full viewport.
 *
 * Layout:
 *   ┌─ Kit picker (left column) ────────┐
 *   │  KayKit ▸                         │
 *   │    Dungeon Pack  Forest  Weapons   │  ← scrollable kit grid
 *   │  Kenney ▸                         │
 *   │    Town  Castle  Furniture  ...   │
 *   ├─ Asset grid (right, main area) ───┤
 *   │  [🧱][🧱][🧱][🧱][🧱][🧱][🧱]  │  ← asset icon tiles
 *   │  [🧱][🧱][🧱][🧱][🧱][🧱][🧱]  │
 *   ├─ Action bar (bottom, 8 slots) ────┤
 *   │  [1][2][3][4][5][6][7][8]        │  ← drag/drop hotbar
 *   └───────────────────────────────────┘
 *
 * Drag an asset card onto a hotbar slot to assign it.
 * Click an asset card to immediately put it in the active slot.
 */

import { ENV_KITS, type EnvAssetDef } from '@/assets/envManifest';
import {
  setHotbarSlot, setActiveHotbarSlot, setActiveTool,
  getCreativeState,
} from './CreativeModeState';
import { SPAWN_CATEGORIES, ALL_SPAWN_ITEMS, type SpawnItem } from './SpawnPalette';export interface AssetBrowserCallbacks {
  onPickAsset: (assetPath: string) => void;
  onPickSpawn: (item: SpawnItem) => void;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
#cab-root {
  position: fixed;
  bottom: 68px;
  right: 16px;
  width: 520px;
  max-height: 70vh;
  background: rgba(8,5,18,0.97);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(140,80,220,0.35);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 9400;
  font-family: 'Segoe UI', system-ui, sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
  overflow: hidden;
  user-select: none;
}

/* Header */
#cab-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px 6px;
  border-bottom: 1px solid rgba(140,80,220,0.2);
  flex-shrink: 0;
}
#cab-title { color: #cc88ff; font-size: 11px; letter-spacing: 2px; font-weight:700; flex:1; }
#cab-search {
  background: rgba(20,12,36,0.9); border: 1px solid rgba(140,80,220,0.25);
  color: #eee; padding: 3px 8px; border-radius: 4px; font-size: 11px;
  outline: none; width: 130px;
}
#cab-search:focus { border-color: rgba(200,140,255,0.5); }
#cab-close {
  background: transparent; border: none; color: rgba(255,255,255,0.3);
  cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1;
}
#cab-close:hover { color: #ff6666; }

/* Body: kit strip + asset grid */
#cab-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }

/* Kit strip (top horizontal row of kit buttons) */
#cab-kits {
  width: 120px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid rgba(140,80,220,0.15);
  padding: 4px 0;
}
.cab-group-label {
  padding: 5px 8px 2px;
  font-size: 8px; font-weight: 700;
  letter-spacing: 2px; color: rgba(200,140,255,0.4);
  text-transform: uppercase;
}
.cab-kit-btn {
  display: block; width: 100%;
  text-align: left; padding: 4px 8px;
  background: transparent; border: none;
  font-size: 9px; color: rgba(200,180,230,0.5);
  cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  transition: all 0.1s;
}
.cab-kit-btn:hover { background: rgba(100,40,180,0.2); color: #cc88ff; }
.cab-kit-btn.active { background: rgba(100,40,180,0.3); color: #cc88ff; font-weight: 600; }
.cab-kit-btn .cab-dot {
  display: inline-block; width: 5px; height: 5px;
  border-radius: 50%; background: rgba(255,255,255,0.15);
  margin-right: 4px; vertical-align: middle;
}
.cab-kit-btn.has-assets .cab-dot { background: #44ffaa; }

/* Asset grid */
#cab-grid-wrap { flex:1; overflow-y: auto; padding: 6px; }
#cab-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 4px;
}
.cab-card {
  background: rgba(20,12,36,0.8);
  border: 1px solid rgba(100,60,180,0.25);
  border-radius: 5px; padding: 5px 3px 4px;
  cursor: grab; text-align: center;
  transition: border-color 0.1s, background 0.1s;
  position: relative;
}
.cab-card:hover { border-color: rgba(200,100,255,0.5); background: rgba(40,20,70,0.9); }
.cab-card.active { border-color: #cc88ff; background: rgba(80,40,140,0.5); }
.cab-card:active { cursor: grabbing; }
.cab-card .ci { font-size: 20px; display: block; line-height: 1.2; }
.cab-card .cn { font-size: 7px; color: rgba(200,180,230,0.5); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cab-card.drag-over { border-color: #ffcc44; background: rgba(80,60,0,0.4); }

/* Empty state */
.cab-empty {
  padding: 20px; text-align: center;
  color: rgba(255,255,255,0.2); font-size: 10px; line-height: 1.8;
  grid-column: 1 / -1;
}

/* Hotbar */
#cab-hotbar {
  display: flex; gap: 3px; align-items: center;
  padding: 6px 8px;
  border-top: 1px solid rgba(140,80,220,0.2);
  background: rgba(5,3,12,0.6);
  flex-shrink: 0;
}
.cab-slot {
  width: 42px; height: 42px;
  background: rgba(15,10,28,0.9);
  border: 1.5px solid rgba(100,60,180,0.35);
  border-radius: 4px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  cursor: pointer; position: relative;
  transition: border-color 0.1s;
  flex-shrink: 0;
}
.cab-slot:hover { border-color: rgba(200,100,255,0.6); }
.cab-slot.active { border-color: #cc88ff; background: rgba(60,30,110,0.5); }
.cab-slot.drag-over { border-color: #ffcc44; background: rgba(60,50,0,0.5); }
.cab-slot .sn { position:absolute; top:2px; left:3px; font-size:7px; color:rgba(255,255,255,0.25); }
.cab-slot .si { font-size:16px; }
.cab-slot .sl { font-size:6px; color:rgba(200,180,230,0.4); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:38px; }
`;

function injectCSS(): void {
  if (document.getElementById('cab-css')) return;
  const s = document.createElement('style');
  s.id = 'cab-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── Lazy asset cache ──────────────────────────────────────────────────────────
// Assets are stored in /assets-index/<kitId>.json (generated at build time).
// Cache maps kitId → asset array so each kit JSON is only fetched once.

const _assetCache = new Map<string, EnvAssetDef[]>();
let _cacheLoading = new Set<string>();

async function loadKitAssets(kitId: string): Promise<EnvAssetDef[]> {
  if (_assetCache.has(kitId)) return _assetCache.get(kitId)!;
  try {
    const r = await fetch(`/assets-index/${kitId}.json`);
    if (!r.ok) { _assetCache.set(kitId, []); return []; }
    const raw = await r.json() as Array<{ path: string; name: string; category: string; gameScale: number }>;
    const assets: EnvAssetDef[] = raw.map(a => ({ ...a, category: a.category as EnvAssetDef['category'], kitId }));
    _assetCache.set(kitId, assets);
    return assets;
  } catch {
    _assetCache.set(kitId, []);
    return [];
  }
}

// ── Browser class ─────────────────────────────────────────────────────────────

export class CreativeAssetBrowser {
  private _el:        HTMLElement | null = null;
  private _visible    = false;
  private _activeKit  = 'all';
  private _search     = '';
  private _dragging:  string | null = null;
  private _tab:       'models' | 'code' = 'models';

  constructor(private readonly cb: AssetBrowserCallbacks) {}

  get visible(): boolean { return this._visible; }

  toggle(): void { if (this._visible) this.hide(); else this.show(); }

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

  // ── Build ─────────────────────────────────────────────────────────────────

  private _build(): void {
    const root = document.createElement('div');
    root.id = 'cab-root';
    root.innerHTML = `
      <div id="cab-header">
        <span id="cab-title">🎨 ASSETS</span>
        <div id="cab-tabs" style="display:flex;gap:2px;margin:0 6px;"></div>
        <input id="cab-search" type="text" placeholder="search…" />
        <button id="cab-close">✕</button>
      </div>
      <div id="cab-body">
        <div id="cab-kits"></div>
        <div id="cab-grid-wrap"><div id="cab-grid"></div></div>
      </div>
      <div id="cab-hotbar"></div>
    `;
    this._el = root;
    document.body.appendChild(root);

    root.querySelector('#cab-close')?.addEventListener('click', () => this.hide());
    root.querySelector('#cab-search')?.addEventListener('input', e => {
      this._search = (e.target as HTMLInputElement).value.toLowerCase();
      void this._renderGrid();
    });

    this._renderTabs();
    this._renderKits();
    void this._renderGrid();
    this._renderHotbar();
  }

  private _renderTabs(): void {
    const bar = this._el?.querySelector('#cab-tabs');
    if (!bar) return;
    bar.innerHTML = '';
    const tabStyle = (active: boolean) =>
      `font-size:9px;padding:2px 8px;background:${active ? 'rgba(100,40,180,0.4)' : 'transparent'};` +
      `border:1px solid ${active ? 'rgba(200,100,255,0.5)' : 'rgba(100,60,180,0.25)'};` +
      `color:${active ? '#cc88ff' : 'rgba(200,180,230,0.4)'};border-radius:3px;cursor:pointer;`;
    const mkTab = (label: string, tab: 'models' | 'code') => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = tabStyle(this._tab === tab);
      btn.addEventListener('click', () => { this._tab = tab; this._renderTabs(); this._renderKits(); void this._renderGrid(); });
      bar.appendChild(btn);
    };
    mkTab('📦 Models', 'models');
    if (getCreativeState().codeFirstAssets) mkTab('⚙ Code', 'code');
  }

  private _renderKits(): void {
    const panel = this._el?.querySelector('#cab-kits');
    if (!panel) return;
    panel.innerHTML = '';

    if (this._tab === 'code') {
      // Code-first categories
      const allBtn = document.createElement('button');
      allBtn.className = 'cab-kit-btn has-assets' + (this._activeKit === 'all' ? ' active' : '');
      allBtn.dataset['kitId'] = 'all';
      allBtn.innerHTML = `<span class="cab-dot"></span>All Spawns`;
      allBtn.addEventListener('click', () => this._select('all'));
      panel.appendChild(allBtn);

      for (const cat of SPAWN_CATEGORIES) {
        const btn = document.createElement('button');
        btn.className = 'cab-kit-btn has-assets' + (this._activeKit === cat.id ? ' active' : '');
        btn.dataset['kitId'] = cat.id;
        btn.innerHTML = `<span class="cab-dot"></span>${cat.icon} ${cat.label}`;
        btn.addEventListener('click', () => this._select(cat.id));
        panel.appendChild(btn);
      }
      return;
    }

    // All button
    const allBtn = document.createElement('button');
    allBtn.className = 'cab-kit-btn has-assets' + (this._activeKit === 'all' ? ' active' : '');
    allBtn.innerHTML = `<span class="cab-dot"></span>All`;
    allBtn.addEventListener('click', () => this._select('all'));
    panel.appendChild(allBtn);

    const groups: Array<{ group: string; label: string }> = [
      { group: 'kaykit',         label: 'KayKit' },
      { group: 'kenney',         label: 'Kenney' },
      { group: 'kenney_modular', label: 'Modular' },
    ];

    for (const { group, label } of groups) {
      const hdr = document.createElement('div');
      hdr.className = 'cab-group-label';
      hdr.textContent = label;
      panel.appendChild(hdr);

      for (const kit of ENV_KITS.filter(k => k.group === group)) {
        const btn = document.createElement('button');
        btn.className = 'cab-kit-btn has-assets' +
          (this._activeKit === kit.id ? ' active' : '');
        btn.dataset['kitId'] = kit.id;
        btn.title = kit.label;
        btn.innerHTML = `<span class="cab-dot"></span>${kit.icon} ${kit.label.replace(/^(KayKit |Kenney )/, '')}`;
        btn.addEventListener('click', () => this._select(kit.id));
        panel.appendChild(btn);
      }
    }
  }

  private _select(kitId: string): void {
    this._activeKit = kitId;
    this._el?.querySelectorAll<HTMLElement>('.cab-kit-btn').forEach(b => {
      b.classList.toggle('active', b.dataset['kitId'] === kitId || (kitId === 'all' && b.textContent?.includes('All')));
    });
    void this._renderGrid();
  }

  private async _renderGrid(): Promise<void> {
    const grid = this._el?.querySelector('#cab-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="cab-empty">Loading…</div>';

    // Code-first tab — show procedural asset categories
    if (this._tab === 'code') {
      grid.innerHTML = '';

      const cat = SPAWN_CATEGORIES.find(c => c.id === this._activeKit);
      const items = this._activeKit === 'all'
        ? ALL_SPAWN_ITEMS.filter(i => !this._search || i.label.toLowerCase().includes(this._search))
        : (cat?.items ?? []).filter(i => !this._search || i.label.toLowerCase().includes(this._search));

      if (!items.length) {
        grid.innerHTML = '<div class="cab-empty">No spawn items match.</div>';
        return;
      }

      for (const item of items) {
        const card = document.createElement('div');
        card.className = 'cab-card';
        card.title = `${item.label}\nCategory: ${item.category}\nClick to hold for placement`;
        card.innerHTML = `<span class="ci">${item.icon}</span><span class="cn">${item.label}</span>`;
        card.style.borderColor = `#${item.color.toString(16).padStart(6,'0')}44`;
        card.addEventListener('click', () => this._pickSpawnItem(item));
        grid.appendChild(card);
      }
      return;
    }

    // Build the asset list — fetch from JSON files lazily
    let assets: EnvAssetDef[] = [];

    if (this._activeKit === 'all') {
      // Load all 48 kits (cached after first load)
      const promises = ENV_KITS.map(k => loadKitAssets(k.id));
      const results  = await Promise.all(promises);
      assets = results.flat();
    } else if (['kaykit', 'kenney', 'kenney_modular'].includes(this._activeKit)) {
      const groupKits = ENV_KITS.filter(k => k.group === this._activeKit);
      const results   = await Promise.all(groupKits.map(k => loadKitAssets(k.id)));
      assets = results.flat();
    } else {
      assets = await loadKitAssets(this._activeKit);
    }

    // Apply search filter
    if (this._search) {
      assets = assets.filter(a =>
        a.name.toLowerCase().includes(this._search) ||
        a.kitId.includes(this._search)
      );
    }

    grid.innerHTML = '';
    const state = getCreativeState();

    if (!assets.length) {
      const empty = document.createElement('div');
      empty.className = 'cab-empty';
      empty.textContent = this._search ? 'No assets match.' : 'No assets in this kit.';
      grid.appendChild(empty);
      return;
    }

    for (const asset of assets) {
      const kit  = ENV_KITS.find(k => k.id === asset.kitId);
      const card = document.createElement('div');
      card.className = 'cab-card' + (state.hotbar[state.activeHotbarSlot] === asset.path ? ' active' : '');
      card.draggable = true;
      card.title = `${asset.name}\n${asset.path}`;
      card.innerHTML = `<span class="ci">${kit?.icon ?? '📦'}</span><span class="cn">${asset.name}</span>`;
      card.addEventListener('click', () => this._pick(asset));
      card.addEventListener('dragstart', e => {
        this._dragging = asset.path;
        e.dataTransfer!.effectAllowed = 'copy';
        e.dataTransfer!.setData('text/plain', asset.path);
      });
      card.addEventListener('dragend', () => { this._dragging = null; });
      grid.appendChild(card);
    }
  }

  private _pickSpawnItem(item: SpawnItem): void {
    this.cb.onPickSpawn(item);
    this.hide();
  }

  private _pick(asset: EnvAssetDef): void {
    const state = getCreativeState();
    setHotbarSlot(state.activeHotbarSlot, asset.path);
    setActiveTool('place');
    this.cb.onPickAsset(asset.path);
    this._renderHotbar();
    this._renderGrid();
    this.hide();
  }

  private _renderHotbar(): void {
    const bar = this._el?.querySelector('#cab-hotbar');
    if (!bar) return;
    bar.innerHTML = '';
    const state = getCreativeState();

    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'cab-slot' + (i === state.activeHotbarSlot ? ' active' : '');
      slot.dataset['slot'] = String(i);

      const path = state.hotbar[i];
      const name = path ? (path.split('/').pop()?.replace(/\.(gltf|glb)$/, '') ?? '') : '';
      const kit  = path ? ENV_KITS.find(k => path.startsWith(k.path ?? '__')) : null;

      slot.innerHTML = `
        <span class="sn">${i + 1}</span>
        <span class="si">${kit?.icon ?? (path ? '📦' : '—')}</span>
        <span class="sl">${name || 'empty'}</span>
      `;

      slot.addEventListener('click', () => {
        setActiveHotbarSlot(i);
        this._renderHotbar();
        this._renderGrid();
      });

      // Drop target
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const dropped = e.dataTransfer?.getData('text/plain') ?? this._dragging;
        if (dropped) {
          setHotbarSlot(i, dropped);
          setActiveHotbarSlot(i);
          this.cb.onPickAsset(dropped);
          this._renderHotbar();
          this._renderGrid();
        }
      });

      bar.appendChild(slot);
    }
  }
}
