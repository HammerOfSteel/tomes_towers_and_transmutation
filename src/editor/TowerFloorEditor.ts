/**
 * TowerFloorEditor.ts — Phase L1 Tower Floor Editor.
 *
 * Extends the EditorCore with tower-floor-specific UI and logic:
 *   - Floor list sidebar (add/remove/reorder floors)
 *   - Structural shortcuts (wall rows, floor fill)
 *   - Staircase / exit marker placement with colour-coded discs
 *   - Enemy spawn placement with encounter group editor
 *   - Floor Properties panel (name, light preset, Solmor quote, etc.)
 *   - Export to Blueprint TypeScript const + TowerFloorDoc JSON
 *
 * The editor reads existing TowerFloorDef defaults for names and ordering.
 */

import * as THREE from 'three';
import type { EditorCore } from './EditorCore';
import type { EditorSerializer } from './EditorSerializer';
import type {
  TowerFloorDoc, PlacedObject, SpawnMarker, ExitMarker,
} from './EditorSchema';
import { EDITOR_SCHEMA_VERSION } from './EditorSchema';

// ── Default floor templates matching existing TowerFloorDef names ─────────────

export const TOWER_FLOOR_DEFAULTS: Array<{ floorIndex: number; name: string; lightPreset: string; quote: string }> = [
  { floorIndex: -1, name: 'The Lower Laboratory',    lightPreset: 'lab',        quote: '"The primary distillation rig hisses with quiet confidence."' },
  { floorIndex:  0, name: 'The Grand Entrance Hall',  lightPreset: 'dungeon',    quote: '"The first thing you notice is that the tower is taller on the inside."' },
  { floorIndex:  1, name: 'The Archive',              lightPreset: 'library',    quote: '"Centuries of collected knowledge. You feel unusually at home."' },
  { floorIndex:  2, name: 'The Distillation Hall',    lightPreset: 'lab',        quote: '"Something is still fermenting on this level."' },
  { floorIndex:  3, name: 'The Wizard\'s Sanctum',    lightPreset: 'dungeon',    quote: '"Everything placed with intention. You feel like you are not supposed to be here."' },
  { floorIndex:  4, name: 'The Conservatory',         lightPreset: 'dungeon',    quote: '"Glass walls. Something large grows in the centre."' },
  { floorIndex:  5, name: 'The Trophy Hall',           lightPreset: 'dungeon',    quote: '"The plaques are all blank. That is more unsettling than names would be."' },
  { floorIndex:  6, name: 'The Machine Hall',          lightPreset: 'dungeon',    quote: '"The machines have no visible purpose. They continue anyway."' },
  { floorIndex:  7, name: 'The Sealed Chambers',      lightPreset: 'dungeon',    quote: '"The wards here are recent. Whatever they contain, he still checks."' },
  { floorIndex:  8, name: 'The Upper Archive',         lightPreset: 'library',    quote: '"The books up here are not catalogued. That is intentional."' },
  { floorIndex:  9, name: 'The Observatory',           lightPreset: 'observatory',quote: '"The sky through the dome looks wrong. The stars are not where they should be."' },
];

// ── TowerFloor state ──────────────────────────────────────────────────────────

export interface FloorState {
  floorIndex: number;
  name:       string;
  size:       { w: number; d: number };
  gridSize:   number;
  lightPreset: string;
  quote:      string;
  encounterPool?: string;
  keyFixture?: string;
  bossRoom:   boolean;
  objects:    PlacedObject[];
  spawns:     SpawnMarker[];
  exits:      ExitMarker[];
}

// ── TowerFloorEditor ──────────────────────────────────────────────────────────

export class TowerFloorEditor {
  private _floors:      FloorState[]   = [];
  private _activeIdx    = 0;
  private _floorListEl: HTMLElement;
  private _propsPanel:  HTMLElement;

  constructor(
    private readonly core:   EditorCore,
    _serial: EditorSerializer,
    container: HTMLElement,
  ) {
    this._floorListEl = this._buildFloorListPanel(container);
    this._propsPanel  = this._buildFloorPropsPanel(container);

    // Start with one default floor (Ground Floor)
    this._addFloor(TOWER_FLOOR_DEFAULTS[1]!);
    this._switchToFloor(0);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** The floorIndex of the currently active floor. */
  get activeFloorIndex(): number {
    return this._floors[this._activeIdx]?.floorIndex ?? 0;
  }

  /**
   * Callback invoked whenever the active floor changes.
   * Use this to refresh the BlueprintLayer.
   */
  onFloorChange?: (floorIndex: number) => void;

  /** Load from a TowerFloorDoc array (multi-floor export). */
  async loadDocs(docs: TowerFloorDoc[]): Promise<void> {
    this._floors = [];
    for (const doc of docs) {
      const state: FloorState = {
        floorIndex:  doc.floorIndex,
        name:        doc.name,
        size:        doc.size,
        gridSize:    doc.gridSize,
        lightPreset: doc.properties.lightPreset ?? 'dungeon',
        quote:       doc.properties.ambientQuote ?? '',
        encounterPool: doc.properties.encounterPool,
        keyFixture:  doc.properties.keyFixture,
        bossRoom:    doc.properties.bossRoom ?? false,
        objects:     doc.objects,
        spawns:      doc.spawns,
        exits:       doc.exits,
      };
      this._floors.push(state);
    }
    this._renderFloorList();
    if (this._floors.length > 0) await this._switchToFloor(0);
  }
  exportAll(): string {
    // Save current floor state first
    this._saveCurrentFloor();
    const docs: TowerFloorDoc[] = this._floors.map(f => ({
      schema:     EDITOR_SCHEMA_VERSION,
      type:       'tower_floor',
      id:         `floor_${f.floorIndex < 0 ? 'b' + Math.abs(f.floorIndex) : f.floorIndex}`,
      name:       f.name,
      floorIndex: f.floorIndex,
      gridSize:   f.gridSize,
      size:       f.size,
      objects:    f.objects,
      spawns:     f.spawns,
      exits:      f.exits,
      properties: {
        lightPreset:   f.lightPreset,
        ambientQuote:  f.quote,
        encounterPool: f.encounterPool,
        keyFixture:    f.keyFixture,
        bossRoom:      f.bossRoom,
      },
    }));
    return JSON.stringify(docs, null, 2);
  }

  /** Export current floor as Blueprint-compatible TypeScript const. */
  exportCurrentToTS(): string {
    this._saveCurrentFloor();
    const f = this._floors[this._activeIdx]!;
    const id = `floor_${f.floorIndex < 0 ? 'b' + Math.abs(f.floorIndex) : f.floorIndex}`;
    return `/** ${f.name} — exported from Tower Floor Editor */\nexport const ${id}Raw = ${JSON.stringify({
      id,
      floor: f.floorIndex,
      width: Math.round(f.size.w / f.gridSize),
      depth: Math.round(f.size.d / f.gridSize),
      cellSize: f.gridSize,
      // spawns are placed by the encounter system; pass them as interactables
      interactables: f.objects
        .filter(o => o.meta && 'type' in o.meta)
        .map(o => ({
          id: o.id, type: (o.meta as { type: string }).type,
          x: Math.round(o.x / f.gridSize), z: Math.round(o.z / f.gridSize),
        })),
      staircases: f.exits.filter(e => e.type === 'stair_up' || e.type === 'stair_down').map(e => ({
        facing: 'north', direction: e.type === 'stair_up' ? 'up' : 'down',
        targetId: e.targetSceneId ?? null,
        col: Math.round(e.x / f.gridSize + Math.round(f.size.w / f.gridSize) / 2),
        row: Math.round(e.z / f.gridSize + Math.round(f.size.d / f.gridSize) / 2),
      })),
      doors: [],
      spawns: [],
    }, null, 2)} as const;\n`;
  }

  // ── Floor management ────────────────────────────────────────────────────────

  private _addFloor(defaults?: typeof TOWER_FLOOR_DEFAULTS[0]): void {
    const idx = defaults?.floorIndex ?? (this._floors.length > 0
      ? Math.max(...this._floors.map(f => f.floorIndex)) + 1
      : 0);
    const def = TOWER_FLOOR_DEFAULTS.find(d => d.floorIndex === idx) ?? TOWER_FLOOR_DEFAULTS[0]!;
    this._floors.push({
      floorIndex: defaults?.floorIndex ?? idx,
      name:       defaults?.name ?? def.name,
      size:       { w: 12, d: 12 },
      gridSize:   2,
      lightPreset: defaults?.lightPreset ?? def.lightPreset,
      quote:      defaults?.quote ?? def.quote,
      bossRoom:   false,
      objects:    [],
      spawns:     [],
      exits:      [],
    });
    this._renderFloorList();
  }

  private _saveCurrentFloor(): void {
    const f = this._floors[this._activeIdx];
    if (!f) return;
    f.objects = this.core.getObjects();
    f.spawns  = this.core.getSpawns();
    f.exits   = this.core.getExits();
    this._syncPropsFromFloor(f);
  }

  private async _switchToFloor(idx: number): Promise<void> {
    if (idx < 0 || idx >= this._floors.length) return;
    // Save current before switching
    if (this._floors[this._activeIdx]) this._saveCurrentFloor();
    this._activeIdx = idx;
    const f = this._floors[idx]!;

    // Update core
    this.core.clearAll();
    this.core.setGridSize(f.gridSize);
    await this.core.loadObjects(f.objects);

    // Draw floor boundary
    this._updateFloorBoundary(f);

    // Update props panel
    this._syncPropsToUI(f);
    this._renderFloorList();

    // Notify blueprint layer of floor change
    this.onFloorChange?.(f.floorIndex);
  }

  private _syncPropsFromFloor(f: FloorState): void {
    f.name        = (document.getElementById('tfe-floor-name')  as HTMLInputElement)?.value ?? f.name;
    f.lightPreset = (document.getElementById('tfe-light-preset') as HTMLSelectElement)?.value ?? f.lightPreset;
    f.quote       = (document.getElementById('tfe-quote')        as HTMLTextAreaElement)?.value ?? f.quote;
    f.bossRoom    = (document.getElementById('tfe-boss-room')    as HTMLInputElement)?.checked ?? f.bossRoom;
  }

  private _syncPropsToUI(f: FloorState): void {
    const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
    const nameEl = byId<HTMLInputElement>('tfe-floor-name');
    const lightEl = byId<HTMLSelectElement>('tfe-light-preset');
    const quoteEl = byId<HTMLTextAreaElement>('tfe-quote');
    const bossEl  = byId<HTMLInputElement>('tfe-boss-room');
    const idxEl   = byId<HTMLSpanElement>('tfe-floor-index');
    if (nameEl)  nameEl.value    = f.name;
    if (lightEl) lightEl.value   = f.lightPreset;
    if (quoteEl) quoteEl.value   = f.quote;
    if (bossEl)  bossEl.checked  = f.bossRoom;
    if (idxEl)   idxEl.textContent = `Index: ${f.floorIndex}`;
  }

  // ── Floor boundary grid ─────────────────────────────────────────────────────

  private _boundaryMesh: THREE.LineSegments | null = null;

  private _updateFloorBoundary(f: FloorState): void {
    if (this._boundaryMesh) {
      (this._boundaryMesh as unknown as THREE.Object3D & { parent: THREE.Scene | null }).parent?.remove(this._boundaryMesh);
    }
    const hw = f.size.w / 2;
    const hd = f.size.d / 2;
    const pts = [
      -hw, 0.01, -hd,   hw, 0.01, -hd,
       hw, 0.01, -hd,   hw, 0.01,  hd,
       hw, 0.01,  hd,  -hw, 0.01,  hd,
      -hw, 0.01,  hd,  -hw, 0.01, -hd,
    ];
    const geo  = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this._boundaryMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffcc44, linewidth: 2 }));
    // Scene is accessed via the core's public method
    (this.core as unknown as { scene: THREE.Scene }).scene?.add(this._boundaryMesh);
  }

  // ── DOM: floor list panel ───────────────────────────────────────────────────

  private _buildFloorListPanel(container: HTMLElement): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'tfe-floor-list-panel';
    panel.style.cssText = 'border-bottom:1px solid #2a1e40;padding:6px;flex-shrink:0;';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:10px;color:#665588;letter-spacing:1px">FLOORS</span>
        <button id="tfe-add-floor" style="font-size:10px;padding:1px 6px;background:#2a1a00;border:1px solid #aa8800;color:#ffcc44;border-radius:2px;cursor:pointer">+ Add</button>
      </div>
      <ul id="tfe-floor-list" style="list-style:none;padding:0;margin:0;max-height:100px;overflow-y:auto"></ul>
    `;
    container.prepend(panel);
    panel.querySelector('#tfe-add-floor')?.addEventListener('click', () => {
      this._addFloor();
      this._switchToFloor(this._floors.length - 1);
    });
    return panel;
  }

  private _renderFloorList(): void {
    const listEl = document.getElementById('tfe-floor-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    this._floors
      .slice()
      .sort((a, b) => a.floorIndex - b.floorIndex)
      .forEach((f, sortedIdx) => {
        const realIdx = this._floors.indexOf(f);
        const li = document.createElement('li');
        li.style.cssText = `
          display:flex;align-items:center;gap:4px;padding:3px 6px;
          font-size:11px;cursor:pointer;border-radius:2px;
          background:${realIdx === this._activeIdx ? '#2a1645' : 'transparent'};
          color:${realIdx === this._activeIdx ? '#ffcc44' : '#998ab8'};
        `;
        const label = f.floorIndex < 0 ? `B${Math.abs(f.floorIndex)}` : `F${f.floorIndex}`;
        li.textContent = `${label} — ${f.name}`;
        li.onclick = () => this._switchToFloor(realIdx);
        // Delete button (not for last floor)
        if (this._floors.length > 1) {
          const del = document.createElement('button');
          del.textContent = '✕';
          del.style.cssText = 'margin-left:auto;background:none;border:none;color:#440000;cursor:pointer;font-size:10px;';
          del.onclick = (e) => {
            e.stopPropagation();
            this._floors.splice(realIdx, 1);
            if (this._activeIdx >= this._floors.length) this._activeIdx = this._floors.length - 1;
            this._renderFloorList();
            this._switchToFloor(this._activeIdx);
          };
          li.append(del);
        }
        listEl.appendChild(li);
        void sortedIdx;
      });
  }

  // ── DOM: floor properties panel ─────────────────────────────────────────────

  private _buildFloorPropsPanel(container: HTMLElement): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'tfe-props-panel';
    panel.style.cssText = 'border-top:1px solid #2a1e40;padding:6px 8px;font-size:11px;flex-shrink:0;';
    panel.innerHTML = `
      <div style="font-size:10px;color:#665588;letter-spacing:1px;margin-bottom:5px">FLOOR PROPERTIES</div>
      <div style="display:flex;align-items:center;gap:6px;margin:3px 0">
        <label style="color:#554466;min-width:50px">Name</label>
        <input id="tfe-floor-name" style="flex:1;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px" />
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin:3px 0">
        <label style="color:#554466;min-width:50px">Light</label>
        <select id="tfe-light-preset" style="flex:1;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:11px;border-radius:2px">
          <option value="dungeon">Dungeon</option>
          <option value="library">Library</option>
          <option value="lab">Lab</option>
          <option value="observatory">Observatory</option>
        </select>
      </div>
      <div style="margin:3px 0">
        <label style="color:#554466;font-size:10px">Solmor Quote</label>
        <textarea id="tfe-quote" rows="2" style="width:100%;background:#1a1626;border:1px solid #2a1e40;color:#eee;padding:2px 4px;font-size:10px;border-radius:2px;box-sizing:border-box;resize:vertical;margin-top:2px"></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin:3px 0">
        <input type="checkbox" id="tfe-boss-room" />
        <label for="tfe-boss-room" style="color:#554466;font-size:10px">Boss Room</label>
        <span id="tfe-floor-index" style="margin-left:auto;color:#332244;font-size:10px"></span>
      </div>
      <div style="display:flex;gap:4px;margin-top:6px">
        <button id="tfe-export-json" style="flex:1;font-size:10px;padding:3px;background:#2a1a00;border:1px solid #aa8800;color:#ffcc44;border-radius:2px;cursor:pointer">💾 Export JSON</button>
        <button id="tfe-export-ts"   style="flex:1;font-size:10px;padding:3px;background:#1a1626;border:1px solid #2a1e40;color:#998ab8;border-radius:2px;cursor:pointer">📋 Export TS</button>
      </div>
      <div style="display:flex;gap:4px;margin-top:3px">
        <button id="tfe-place-spawn-enemy" style="flex:1;font-size:10px;padding:3px;background:#2a0808;border:1px solid #880000;color:#ff6666;border-radius:2px;cursor:pointer">⚔ Enemy Spawn</button>
        <button id="tfe-place-spawn-npc"   style="flex:1;font-size:10px;padding:3px;background:#08082a;border:1px solid #000888;color:#6688ff;border-radius:2px;cursor:pointer">👤 NPC Spawn</button>
      </div>
      <div style="display:flex;gap:4px;margin-top:3px">
        <button id="tfe-place-stair-up"   style="flex:1;font-size:9px;padding:2px;background:#082028;border:1px solid #004466;color:#44aaff;border-radius:2px;cursor:pointer">↑ Stair Up</button>
        <button id="tfe-place-stair-down" style="flex:1;font-size:9px;padding:2px;background:#201208;border:1px solid #442200;color:#ff8844;border-radius:2px;cursor:pointer">↓ Stair Down</button>
        <button id="tfe-place-exit"       style="flex:1;font-size:9px;padding:2px;background:#082008;border:1px solid #004400;color:#44ff88;border-radius:2px;cursor:pointer">➤ Exit</button>
      </div>
    `;
    container.appendChild(panel);
    this._bindPropsPanelEvents(panel);
    return panel;
  }

  private _bindPropsPanelEvents(panel: HTMLElement): void {
    // Export buttons
    panel.querySelector('#tfe-export-json')?.addEventListener('click', () => {
      this._saveCurrentFloor();
      const json = this.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      const f = this._floors[this._activeIdx]!;
      a.href = URL.createObjectURL(blob);
      a.download = `tower_floors.ttt-level.json`;
      a.click();
    });
    panel.querySelector('#tfe-export-ts')?.addEventListener('click', () => {
      const ts = this.exportCurrentToTS();
      navigator.clipboard?.writeText(ts).catch(() => {});
      const btn = panel.querySelector('#tfe-export-ts') as HTMLButtonElement;
      btn.textContent = '✓ Copied!';
      setTimeout(() => { btn.textContent = '📋 Export TS'; }, 1500);
    });
    // Spawn placements — click once then click on canvas to place
    panel.querySelector('#tfe-place-spawn-enemy')?.addEventListener('click', () => {
      this._pendingSpawnType = 'enemy';
      this._pendingExitType  = null;
    });
    panel.querySelector('#tfe-place-spawn-npc')?.addEventListener('click', () => {
      this._pendingSpawnType = 'npc';
      this._pendingExitType  = null;
    });
    panel.querySelector('#tfe-place-stair-up')?.addEventListener('click', () => {
      this._pendingExitType  = 'stair_up';
      this._pendingSpawnType = null;
    });
    panel.querySelector('#tfe-place-stair-down')?.addEventListener('click', () => {
      this._pendingExitType  = 'stair_down';
      this._pendingSpawnType = null;
    });
    panel.querySelector('#tfe-place-exit')?.addEventListener('click', () => {
      this._pendingExitType  = 'tower_exit';
      this._pendingSpawnType = null;
    });
  }

  // Pending placement types set by the button clicks; EditorCore fires these
  private _pendingSpawnType: SpawnMarker['type'] | null = null;
  private _pendingExitType:  ExitMarker['type']  | null = null;

  /** Called by the canvas click handler when a floor position is clicked. */
  onCanvasClick(worldPos: THREE.Vector3): void {
    if (this._pendingSpawnType) {
      this.core.placeSpawn(this._pendingSpawnType, worldPos);
      this._pendingSpawnType = null;
    } else if (this._pendingExitType) {
      this.core.placeExit(this._pendingExitType, worldPos);
      this._pendingExitType = null;
    }
  }

  dispose(): void {
    this._floorListEl.remove();
    this._propsPanel.remove();
    if (this._boundaryMesh) {
      (this._boundaryMesh as unknown as { parent?: { remove(o: THREE.Object3D): void } }).parent?.remove(this._boundaryMesh);
    }
  }
}
