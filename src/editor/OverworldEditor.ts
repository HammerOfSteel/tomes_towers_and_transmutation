/**
 * OverworldEditor — in-game toolbar for placing overworld entities.
 *
 * Activated by pressing `\` (Backslash) while the overworld is active.
 * Requires dev mode (the editor is only shown when `devMode === true`).
 *
 * Tools:
 *   1 – Enemy Camp
 *   2 – Building Entrance
 *   3 – Resource Node: Ore
 *   4 – Resource Node: Timber
 *   5 – Resource Node: Essence
 *   E – Erase nearest placed item (within 4 WU)
 *
 * Left-click  → place current tool at ground-plane intersection
 * Right-click → erase nearest item
 * Export      → downloads layout JSON
 * Import      → loads a layout JSON (merges over current items)
 *
 * Wire-up in main.ts:
 *   const owEditor = new OverworldEditor(scene, camera, renderer.domElement);
 *   // exterior render loop:
 *   owEditor.onPointerMove(mouseMoveEvent);
 *   if (owEditor.isActive) owEditor.render(); // updates hover marker
 *   // key handler:
 *   owEditor.handleKey(event.key);
 */

import * as THREE from 'three';

// ── Public data types (consumed by OverworldScene.applyEditorLayout) ──────────

export type OWToolKind =
  | 'enemy_camp'
  | 'building_entrance'
  | 'resource_ore'
  | 'resource_timber'
  | 'resource_essence'
  | 'erase';

export interface OWEnemyCamp {
  kind: 'enemy_camp';
  wx: number;
  wz: number;
  /** Number of enemies to spawn (default 5). */
  count: number;
}

export interface OWBuildingEntrance {
  kind: 'building_entrance';
  wx: number;
  wz: number;
  label: string;
}

export interface OWResourceNode {
  kind: 'resource_node';
  wx: number;
  wz: number;
  type: 'ore' | 'timber' | 'essence';
}

export type OWLayoutItem = OWEnemyCamp | OWBuildingEntrance | OWResourceNode;

export interface OWLayout {
  version: 1;
  items: OWLayoutItem[];
}

// ── Visual constants ───────────────────────────────────────────────────────────

const TOOL_COLOR: Record<OWToolKind, number> = {
  enemy_camp:         0xff3333,
  building_entrance:  0x33ddff,
  resource_ore:       0xffaa22,
  resource_timber:    0x44bb44,
  resource_essence:   0xcc66ff,
  erase:              0xff2200,
};

const TOOL_LABEL: Record<OWToolKind, string> = {
  enemy_camp:         'Enemy Camp',
  building_entrance:  'Building Entrance',
  resource_ore:       'Resource: Ore',
  resource_timber:    'Resource: Timber',
  resource_essence:   'Resource: Essence',
  erase:              'Erase',
};

const HOTKEYS: Partial<Record<string, OWToolKind>> = {
  '1': 'enemy_camp',
  '2': 'building_entrance',
  '3': 'resource_ore',
  '4': 'resource_timber',
  '5': 'resource_essence',
  'e': 'erase',
  'E': 'erase',
};

const MARKER_RADIUS = 1.2;
const ERASE_RADIUS  = 4.0;

// ── Styles ────────────────────────────────────────────────────────────────────

const S_BTN = [
  'background:#2a2838;border:1px solid #555;color:#ccc;',
  'padding:3px 8px;border-radius:3px;cursor:pointer;font:12px monospace;',
].join('');

const S_BTN_ACTIVE = [
  'background:#4a3060;border:1px solid #aa66ff;color:#fff;',
  'padding:3px 8px;border-radius:3px;cursor:pointer;font:12px monospace;',
].join('');

// ── OverworldEditor ───────────────────────────────────────────────────────────

export class OverworldEditor {
  private _active   = false;
  private _tool: OWToolKind = 'enemy_camp';

  // Layout state
  private readonly _items: OWLayoutItem[] = [];

  // 3-D markers for placed items
  private readonly _markers = new Map<OWLayoutItem, THREE.Mesh>();

  // Hover preview disc
  private readonly _hoverMesh: THREE.Mesh;

  // Ground plane for raycasting (Y = 0, large)
  private readonly _groundPlane: THREE.Mesh;

  // Raycaster
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2(-9999, -9999);

  // UI
  private readonly _panel: HTMLDivElement;
  private readonly _toolBtns = new Map<OWToolKind, HTMLButtonElement>();
  private readonly _statusEl: HTMLSpanElement;

  constructor(
    private readonly _scene:    THREE.Scene,
    private readonly _camera:   THREE.Camera,
    private readonly _canvas:   HTMLCanvasElement,
  ) {
    // Invisible ground plane for click raycasting
    const planeGeo = new THREE.PlaneGeometry(2000, 2000);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    this._groundPlane = new THREE.Mesh(planeGeo, planeMat);
    this._groundPlane.visible = false;

    // Hover disc
    const hoverGeo = new THREE.CylinderGeometry(MARKER_RADIUS, MARKER_RADIUS, 0.08, 16);
    const hoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    this._hoverMesh = new THREE.Mesh(hoverGeo, hoverMat);
    this._hoverMesh.visible = false;

    // Build the UI panel
    this._panel    = this._buildPanel();
    this._statusEl = this._panel.querySelector<HTMLSpanElement>('#ow-ed-status')!;

    // Canvas event listeners (only active when editor is open)
    this._canvas.addEventListener('click',       this._onClick);
    this._canvas.addEventListener('contextmenu', this._onRightClick);
    this._canvas.addEventListener('mousemove',   this._onMouseMove);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isActive(): boolean { return this._active; }

  /** Toggle the editor on / off. */
  toggle(): void {
    this._active ? this._close() : this._open();
  }

  /** Handle keyboard shortcuts (call from the game's keydown handler). */
  handleKey(key: string): void {
    if (key === '\\') { this.toggle(); return; }
    if (!this._active) return;
    const tool = HOTKEYS[key];
    if (tool) this._selectTool(tool);
  }

  /** Update hover disc position — call each frame while editor is active. */
  update(): void {
    if (!this._active) return;
    const hit = this._raycast();
    if (hit) {
      this._hoverMesh.position.set(hit.x, 0.05, hit.z);
      (this._hoverMesh.material as THREE.MeshBasicMaterial).color.setHex(
        TOOL_COLOR[this._tool],
      );
      this._hoverMesh.visible = true;
    } else {
      this._hoverMesh.visible = false;
    }
  }

  /**
   * Return a copy of the current layout for export or for applying to the scene.
   */
  getLayout(): OWLayout {
    return { version: 1, items: this._items.map(i => ({ ...i })) };
  }

  /**
   * Merge an imported layout into the editor (does not clear existing items).
   */
  loadLayout(layout: OWLayout): void {
    for (const item of layout.items) {
      this._addItem({ ...item });
    }
    this._refreshStatus();
  }

  /** Remove all placed items and their markers. */
  clearAll(): void {
    for (const [, mesh] of this._markers) {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this._markers.clear();
    this._items.length = 0;
    this._refreshStatus();
  }

  /** Full teardown — call when the overworld scene is disposed. */
  dispose(): void {
    this._close();
    this._canvas.removeEventListener('click',       this._onClick);
    this._canvas.removeEventListener('contextmenu', this._onRightClick);
    this._canvas.removeEventListener('mousemove',   this._onMouseMove);
    this._panel.remove();
    this._hoverMesh.geometry.dispose();
    (this._hoverMesh.material as THREE.Material).dispose();
    this._groundPlane.geometry.dispose();
    (this._groundPlane.material as THREE.Material).dispose();
    this.clearAll();
  }

  // ── Private — open / close ─────────────────────────────────────────────────

  private _open(): void {
    this._active = true;
    this._panel.style.display = 'flex';
    this._scene.add(this._groundPlane, this._hoverMesh);
    this._selectTool(this._tool);
    this._refreshStatus();
  }

  private _close(): void {
    this._active = false;
    this._panel.style.display = 'none';
    this._scene.remove(this._groundPlane, this._hoverMesh);
    this._hoverMesh.visible = false;
  }

  // ── Private — tool selection ───────────────────────────────────────────────

  private _selectTool(tool: OWToolKind): void {
    this._tool = tool;
    for (const [t, btn] of this._toolBtns) {
      btn.style.cssText = t === tool ? S_BTN_ACTIVE : S_BTN;
    }
  }

  // ── Private — raycasting ───────────────────────────────────────────────────

  private _raycast(): THREE.Vector3 | null {
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster.intersectObject(this._groundPlane);
    return hits.length > 0 ? hits[0]!.point.clone() : null;
  }

  // ── Private — event handlers ───────────────────────────────────────────────

  private readonly _onMouseMove = (e: MouseEvent): void => {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
  };

  private readonly _onClick = (_e: MouseEvent): void => {
    if (!this._active) return;
    const hit = this._raycast();
    if (!hit) return;

    if (this._tool === 'erase') {
      this._eraseNearest(hit);
      return;
    }
    this._placeItem(hit.x, hit.z);
  };

  private readonly _onRightClick = (e: MouseEvent): void => {
    if (!this._active) return;
    e.preventDefault();
    const hit = this._raycast();
    if (hit) this._eraseNearest(hit);
  };

  // ── Private — place / erase ────────────────────────────────────────────────

  private _placeItem(wx: number, wz: number): void {
    let item: OWLayoutItem;

    switch (this._tool) {
      case 'enemy_camp':
        item = { kind: 'enemy_camp', wx, wz, count: 5 };
        break;
      case 'building_entrance':
        item = { kind: 'building_entrance', wx, wz, label: 'Building' };
        break;
      case 'resource_ore':
        item = { kind: 'resource_node', wx, wz, type: 'ore' };
        break;
      case 'resource_timber':
        item = { kind: 'resource_node', wx, wz, type: 'timber' };
        break;
      case 'resource_essence':
        item = { kind: 'resource_node', wx, wz, type: 'essence' };
        break;
      default:
        return;
    }

    this._addItem(item);
    this._refreshStatus();
  }

  private _addItem(item: OWLayoutItem): void {
    this._items.push(item);

    // Build a coloured disc marker
    const color = this._markerColor(item);
    const geo   = new THREE.CylinderGeometry(MARKER_RADIUS * 0.9, MARKER_RADIUS * 0.9, 0.15, 16);
    const mat   = new THREE.MeshBasicMaterial({ color });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.set(item.wx, 0.08, item.wz);
    this._scene.add(mesh);
    this._markers.set(item, mesh);
  }

  private _markerColor(item: OWLayoutItem): number {
    if (item.kind === 'enemy_camp')        return TOOL_COLOR.enemy_camp;
    if (item.kind === 'building_entrance') return TOOL_COLOR.building_entrance;
    if (item.kind === 'resource_node') {
      if (item.type === 'ore')     return TOOL_COLOR.resource_ore;
      if (item.type === 'timber')  return TOOL_COLOR.resource_timber;
      return TOOL_COLOR.resource_essence;
    }
    return 0xffffff;
  }

  private _eraseNearest(pos: THREE.Vector3): void {
    let nearest: OWLayoutItem | null = null;
    let bestDist2 = ERASE_RADIUS * ERASE_RADIUS;

    for (const item of this._items) {
      const dx = item.wx - pos.x;
      const dz = item.wz - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) { bestDist2 = d2; nearest = item; }
    }

    if (!nearest) return;

    // Remove marker
    const mesh = this._markers.get(nearest);
    if (mesh) {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this._markers.delete(nearest);
    }

    this._items.splice(this._items.indexOf(nearest), 1);
    this._refreshStatus();
  }

  // ── Private — export / import ──────────────────────────────────────────────

  private _export(): void {
    const layout = this.getLayout();
    const json   = JSON.stringify(layout, null, 2);
    const blob   = new Blob([json], { type: 'application/json' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = 'overworld_layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private _import(): void {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const layout = JSON.parse(reader.result as string) as OWLayout;
          if (layout.version !== 1 || !Array.isArray(layout.items)) {
            alert('Invalid overworld layout file.');
            return;
          }
          this.loadLayout(layout);
        } catch {
          alert('Failed to parse layout JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ── Private — UI ───────────────────────────────────────────────────────────

  private _refreshStatus(): void {
    const camps     = this._items.filter(i => i.kind === 'enemy_camp').length;
    const buildings = this._items.filter(i => i.kind === 'building_entrance').length;
    const nodes     = this._items.filter(i => i.kind === 'resource_node').length;
    this._statusEl.textContent =
      `Camps: ${camps}  Entrances: ${buildings}  Nodes: ${nodes}`;
  }

  private _buildPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'ow-editor-panel';
    panel.style.cssText = [
      'display:none;flex-direction:column;gap:6px;',
      'position:fixed;top:60px;left:10px;z-index:9000;',
      'background:rgba(14,12,22,0.92);border:1px solid #554;',
      'border-radius:6px;padding:10px;font:12px monospace;color:#ccc;',
      'min-width:210px;',
    ].join('');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'font-weight:bold;font-size:13px;color:#ffdd88;margin-bottom:4px;';
    header.textContent = '🗺 Overworld Editor';
    panel.appendChild(header);

    // Tool buttons
    const tools: OWToolKind[] = [
      'enemy_camp', 'building_entrance',
      'resource_ore', 'resource_timber', 'resource_essence',
      'erase',
    ];
    const hotkeys = ['1', '2', '3', '4', '5', 'E'];

    const toolRow = document.createElement('div');
    toolRow.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    tools.forEach((tool, i) => {
      const btn = document.createElement('button');
      btn.style.cssText = S_BTN;
      const color = '#' + TOOL_COLOR[tool].toString(16).padStart(6, '0');
      btn.innerHTML =
        `<span style="color:${color};margin-right:4px;">■</span>` +
        `[${hotkeys[i]}] ${TOOL_LABEL[tool]}`;
      btn.addEventListener('click', () => this._selectTool(tool));
      this._toolBtns.set(tool, btn);
      toolRow.appendChild(btn);
    });
    panel.appendChild(toolRow);

    // Divider
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px solid #444;margin:4px 0;';
    panel.appendChild(hr);

    // Status line
    const statusEl = document.createElement('span');
    statusEl.id = 'ow-ed-status';
    statusEl.style.cssText = 'color:#aaa;font-size:11px;';
    statusEl.textContent = 'Camps: 0  Entrances: 0  Nodes: 0';
    panel.appendChild(statusEl);

    // Action buttons row
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;';

    const makeBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.style.cssText = S_BTN;
      b.textContent = label;
      b.addEventListener('click', fn);
      actionRow.appendChild(b);
    };

    makeBtn('Export JSON', () => this._export());
    makeBtn('Import JSON', () => this._import());
    makeBtn('Clear All',   () => { if (confirm('Clear all placed items?')) this.clearAll(); });

    panel.appendChild(actionRow);

    // Help text
    const help = document.createElement('div');
    help.style.cssText = 'color:#666;font-size:10px;margin-top:4px;line-height:1.4;';
    help.innerHTML =
      'Left-click: place &nbsp; Right-click: erase<br>' +
      'Press <b style="color:#aaa">\\</b> to close editor';
    panel.appendChild(help);

    document.body.appendChild(panel);
    return panel;
  }
}