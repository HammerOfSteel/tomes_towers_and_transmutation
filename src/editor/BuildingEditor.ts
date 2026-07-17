/**
 * BuildingEditor.ts — Phase L3/L4 Building Exterior + Interior Editor.
 *
 * L3 — Building Exterior:
 *   Modular wall/window/door/roof pieces from Kenney town + building kits.
 *   Supports 1-3 floors, footprint W×D, style (stone/wood/mixed).
 *   Export as BuildingDoc JSON.
 *
 * L4 — Building Interior:
 *   Furniture, shelving, NPC spawns, and interactables per floor.
 *   Linked to a BuildingDoc by ID.
 *   Export as InteriorDoc JSON.
 */

import * as THREE from 'three';
import type { EditorCore } from './EditorCore';
import type { BuildingDoc, InteriorDoc } from './EditorSchema';
import { EDITOR_SCHEMA_VERSION } from './EditorSchema';

// ── Kenney asset paths for wall/roof/floor pieces ─────────────────────────────

const WALL_SETS = {
  stone: {
    plain:   '/assets/town/wall.glb',
    window:  '/assets/town/wall-window-glass.glb',
    door:    '/assets/town/wall-door.glb',
    corner:  '/assets/town/wall-corner.glb',
    half:    '/assets/town/wall-half.glb',
  },
  wood: {
    plain:   '/assets/town/wall-wood.glb',
    window:  '/assets/town/wall-wood-window-glass.glb',
    door:    '/assets/town/wall-wood-door.glb',
    corner:  '/assets/town/wall-wood-corner.glb',
    half:    '/assets/town/wall-wood-half.glb',
  },
};

const ROOF_STYLES = {
  flat:    { flat: '/assets/town/roof-flat.glb', corner: '/assets/town/roof-corner.glb' },
  gabled:  { top: '/assets/town/roof-gable-top.glb', end: '/assets/town/roof-gable-end.glb', side: '/assets/town/roof-gable.glb' },
  high:    { top: '/assets/town/roof-high.glb', corner: '/assets/town/roof-high-corner.glb', point: '/assets/town/roof-high-point.glb' },
};

const ROOM_PRESETS: Record<string, Array<{ path: string; x: number; z: number; ry: number; scale: number }>> = {
  tavern_common_room: [
    { path: '/assets/furniture/table.glb',  x:  0, z:  0, ry: 0,    scale: 1.8 },
    { path: '/assets/furniture/chair.glb',  x:  1, z:  0, ry: 0,    scale: 1.8 },
    { path: '/assets/furniture/chair.glb',  x: -1, z:  0, ry: Math.PI, scale: 1.8 },
    { path: '/assets/furniture/bench.glb',  x:  0, z:  2, ry: 0,    scale: 1.8 },
  ],
  bedroom: [
    { path: '/assets/furniture/bedSingle.glb',    x:  0, z:  1, ry: 0, scale: 1.8 },
    { path: '/assets/furniture/bookcaseClosed.glb', x: -2, z:  0, ry: Math.PI / 2, scale: 1.8 },
  ],
  library: [
    { path: '/assets/furniture/bookcaseClosed.glb', x: -2, z:  0, ry: Math.PI / 2, scale: 1.8 },
    { path: '/assets/furniture/bookcaseClosed.glb', x:  2, z:  0, ry: -Math.PI / 2, scale: 1.8 },
    { path: '/assets/furniture/table.glb',           x:  0, z:  0, ry: 0, scale: 1.8 },
  ],
  storage: [
    { path: '/assets/kaykit_dungeon/barrel_large.gltf',  x:  1, z:  1, ry: 0, scale: 0.8 },
    { path: '/assets/kaykit_dungeon/barrel_small.gltf',  x: -1, z:  1, ry: 0, scale: 0.8 },
    { path: '/assets/kaykit_dungeon/crates_stacked.gltf',x:  0, z: -1, ry: 0, scale: 0.8 },
  ],
};

// ── BuildingEditor ────────────────────────────────────────────────────────────

export class BuildingEditor {
  private _mode:      'exterior' | 'interior' = 'exterior';
  private _floors     = 2;
  private _activeFloor = 0;
  private _footprint  = { w: 4, d: 4 }; // in 2WU tiles
  private _style:     'stone' | 'wood' | 'mixed' = 'mixed';
  private _roofStyle: 'flat' | 'gabled' | 'high' = 'gabled';
  private _buildingId = 'building_new';
  private _name       = 'New Building';
  private _interiorId = '';
  private _panel:     HTMLElement;

  constructor(
    private readonly core: EditorCore,
    container: HTMLElement,
  ) {
    this._panel = this._buildPanel(container);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  exportExterior(): BuildingDoc {
    return {
      schema:    EDITOR_SCHEMA_VERSION,
      type:      'building',
      id:        this._buildingId,
      name:      this._name,
      floors:    this._floors,
      footprint: { w: this._footprint.w * 2, d: this._footprint.d * 2 },
      style:     this._style,
      interiorId: this._interiorId || undefined,
      objects:   this.core.getObjects(),
      spawns:    this.core.getSpawns(),
      exits:     this.core.getExits(),
    };
  }

  exportInterior(floorIdx: number): InteriorDoc {
    return {
      schema:    EDITOR_SCHEMA_VERSION,
      type:      'interior',
      id:        `${this._buildingId}_int_f${floorIdx}`,
      name:      `${this._name} — Floor ${floorIdx + 1}`,
      buildingId: this._buildingId,
      floorIndex: floorIdx,
      footprint: { w: this._footprint.w * 2, d: this._footprint.d * 2 },
      objects:   this.core.getObjects(),
      spawns:    this.core.getSpawns(),
      exits:     this.core.getExits(),
    };
  }

  // ── Auto-generate roof ───────────────────────────────────────────────────────

  async autoGenerateRoof(): Promise<void> {
    const S = 2.0; // tile size
    const hw = (this._footprint.w * S) / 2;
    const hd = (this._footprint.d * S) / 2;
    const topY = this._floors * S * 1.01;
    const roofPaths = ROOF_STYLES[this._roofStyle];

    // Simple flat roof coverage
    for (let xi = 0; xi < this._footprint.w; xi++) {
      for (let zi = 0; zi < this._footprint.d; zi++) {
        const x = -hw + xi * S + S / 2;
        const z = -hd + zi * S + S / 2;
        const isCorner = (xi === 0 || xi === this._footprint.w - 1) &&
                         (zi === 0 || zi === this._footprint.d - 1);
        const path = 'corner' in roofPaths && isCorner ? roofPaths.corner : (roofPaths as { flat?: string }).flat ?? Object.values(roofPaths)[0]!;
        const ry = xi === this._footprint.w - 1 && zi === 0 ? Math.PI / 2
                 : xi === this._footprint.w - 1 && zi === this._footprint.d - 1 ? Math.PI
                 : xi === 0 && zi === this._footprint.d - 1 ? -Math.PI / 2 : 0;
        await this.core.placeObject(path, new THREE.Vector3(x, topY, z));
      }
    }
  }

  // ── Room preset fill ─────────────────────────────────────────────────────────

  async fillRoomPreset(presetName: keyof typeof ROOM_PRESETS): Promise<void> {
    const preset = ROOM_PRESETS[presetName];
    if (!preset) return;
    for (const item of preset) {
      const pos = new THREE.Vector3(item.x, this._activeFloor * 2 * 1.01, item.z);
      await this.core.placeObject(item.path, pos);
    }
  }

  // ── Panel ───────────────────────────────────────────────────────────────────

  private _buildPanel(container: HTMLElement): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'building-editor-panel';
    panel.style.cssText = 'border-top:1px solid #2a1e40;padding:6px 8px;font-size:11px;flex-shrink:0;';
    panel.innerHTML = `
      <div style="font-size:10px;color:#665588;letter-spacing:1px;margin-bottom:4px">BUILDING EDITOR</div>
      <div style="display:flex;gap:3px;margin-bottom:5px">
        <button class="bld-mode active" data-mode="exterior" style="flex:1;font-size:10px;padding:2px;background:#2a1645;border:1px solid #6633aa;color:#c090ff;border-radius:2px;cursor:pointer">🏠 Exterior</button>
        <button class="bld-mode"        data-mode="interior" style="flex:1;font-size:10px;padding:2px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">🪑 Interior</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <div style="display:flex;align-items:center;gap:6px">
          <label style="color:#554466;min-width:50px;font-size:10px">Name</label>
          <input id="bld-name" value="New Building" style="flex:1;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px" />
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="color:#554466;min-width:50px;font-size:10px">Floors</label>
          <input id="bld-floors" type="number" min="1" max="3" value="2" style="width:40px;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px" />
          <label style="color:#554466;font-size:10px">Active:</label>
          <input id="bld-active-floor" type="number" min="0" max="2" value="0" style="width:30px;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px" />
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <label style="color:#554466;min-width:50px;font-size:10px">Style</label>
          <select id="bld-style" style="flex:1;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px">
            <option value="mixed">Mixed</option>
            <option value="stone">Stone</option>
            <option value="wood">Wood</option>
          </select>
          <select id="bld-roof-style" style="flex:1;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px">
            <option value="gabled">Gabled roof</option>
            <option value="flat">Flat roof</option>
            <option value="high">High-gabled</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:3px;margin-top:5px">
        <button id="bld-auto-roof" style="flex:1;font-size:10px;padding:3px;background:#1a1626;border:1px solid #2a1e40;color:#998ab8;border-radius:2px;cursor:pointer">🏠 Auto Roof</button>
      </div>
      <div id="bld-room-presets" style="margin-top:5px;display:none">
        <div style="font-size:10px;color:#554466;margin-bottom:3px">Room Presets</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px">
          <button class="bld-preset" data-preset="tavern_common_room" style="font-size:9px;padding:2px 4px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">Tavern</button>
          <button class="bld-preset" data-preset="bedroom"    style="font-size:9px;padding:2px 4px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">Bedroom</button>
          <button class="bld-preset" data-preset="library"    style="font-size:9px;padding:2px 4px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">Library</button>
          <button class="bld-preset" data-preset="storage"    style="font-size:9px;padding:2px 4px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">Storage</button>
        </div>
      </div>
      <div style="display:flex;gap:3px;margin-top:5px">
        <button id="bld-export" style="flex:1;font-size:10px;padding:3px;background:#2a1a00;border:1px solid #aa8800;color:#ffcc44;border-radius:2px;cursor:pointer">💾 Export</button>
      </div>
    `;
    container.appendChild(panel);
    this._bindPanelEvents(panel);
    return panel;
  }

  private _bindPanelEvents(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>('.bld-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.bld-mode').forEach(b => {
          (b as HTMLElement).style.background = '#1a1626';
          (b as HTMLElement).style.color = '#665588';
        });
        btn.style.background = '#2a1645';
        btn.style.color = '#c090ff';
        this._mode = btn.dataset['mode'] as 'exterior' | 'interior';
        const presetsEl = panel.querySelector('#bld-room-presets') as HTMLElement;
        if (presetsEl) presetsEl.style.display = this._mode === 'interior' ? '' : 'none';
      });
    });

    (panel.querySelector('#bld-name') as HTMLInputElement)?.addEventListener('change', e =>
      { this._name = (e.target as HTMLInputElement).value; });
    (panel.querySelector('#bld-floors') as HTMLInputElement)?.addEventListener('change', e =>
      { this._floors = Math.max(1, Math.min(3, parseInt((e.target as HTMLInputElement).value))); });
    (panel.querySelector('#bld-active-floor') as HTMLInputElement)?.addEventListener('change', e =>
      { this._activeFloor = parseInt((e.target as HTMLInputElement).value); });
    (panel.querySelector('#bld-style') as HTMLSelectElement)?.addEventListener('change', e =>
      { this._style = (e.target as HTMLSelectElement).value as 'stone' | 'wood' | 'mixed'; });
    (panel.querySelector('#bld-roof-style') as HTMLSelectElement)?.addEventListener('change', e =>
      { this._roofStyle = (e.target as HTMLSelectElement).value as 'flat' | 'gabled' | 'high'; });

    panel.querySelector('#bld-auto-roof')?.addEventListener('click', () => this.autoGenerateRoof());

    panel.querySelectorAll<HTMLButtonElement>('.bld-preset').forEach(btn => {
      btn.addEventListener('click', () =>
        this.fillRoomPreset(btn.dataset['preset'] as keyof typeof ROOM_PRESETS));
    });

    panel.querySelector('#bld-export')?.addEventListener('click', () => {
      const doc  = this._mode === 'exterior' ? this.exportExterior() : this.exportInterior(this._activeFloor);
      const json = JSON.stringify(doc, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `${doc.id}.ttt-level.json`;
      a.click();
    });
  }

  dispose(): void { this._panel.remove(); }
}
