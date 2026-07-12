import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { SceneManager } from '@/levels/SceneManager';
import { renderBlueprint, type RenderedRoom } from '@/levels/BlueprintRenderer';
import { cellToWorld } from '@/levels/blueprint';
import type { DoorFacing, StairDirection, FloorType, Rotation } from '@/levels/blueprint';
import { EditorGrid, type PaletteKind } from './EditorGrid';

// ── Visual constants ──────────────────────────────────────────────────────

const KIND_COLOR: Record<PaletteKind, number> = {
  wall:       0x8888bb,
  pillar:     0x6688bb,
  door:       0x44cc88,
  spawn:      0xff4444,
  bookshelf:  0x8b6914,
  lectern:    0xc8a040,
  staircase:  0xff9933,
  erase:      0xff2200,
};

const KIND_LABEL: Record<PaletteKind, string> = {
  wall:      'Wall',
  pillar:    'Pillar',
  door:      'Door',
  spawn:     'Spawn',
  bookshelf: 'Bookshelf',
  lectern:   'Lectern',
  staircase: 'Staircase',
  erase:     'Erase',
};

const HOTKEYS: Partial<Record<string, PaletteKind>> = {
  '1': 'wall', '2': 'pillar', '3': 'door',
  '4': 'spawn', '5': 'bookshelf', '6': 'lectern',
  '7': 'staircase', 'e': 'erase', 'E': 'erase',
};

const FACING_OPTIONS: DoorFacing[] = ['north', 'south', 'east', 'west'];
const FLOOR_TYPE_OPTIONS: FloorType[] = ['stone', 'grass', 'dirt', 'wood'];
const ROTATIONS: Rotation[] = [0, 90, 180, 270];

// ── Style strings ─────────────────────────────────────────────────────────

const S_INPUT = [
  'background:#1a1824;border:1px solid #444;color:#ccc;',
  'padding:2px 4px;border-radius:3px;width:calc(100% - 8px);',
].join('');
const S_NUM = 'background:#1a1824;border:1px solid #444;color:#ccc;padding:2px 4px;border-radius:3px;width:46px;';
const S_SEL = 'background:#1a1824;border:1px solid #444;color:#ccc;padding:2px 4px;border-radius:3px;';
const S_BTN = [
  'background:#2a2838;border:1px solid #555;color:#ccc;',
  'padding:3px 8px;border-radius:3px;cursor:pointer;font:12px monospace;',
].join('');

// ── EditMode ──────────────────────────────────────────────────────────────

/** Level editor toggled by the `~` key.
 *
 *  When active:
 *  - Hides the SceneManager's current room and pauses game simulation.
 *  - Renders a live preview of the blueprint being edited.
 *  - Mouse hover highlights the cell under the cursor.
 *  - Left-click places the selected entity; right-click erases.
 *  - Export button validates then downloads the blueprint as JSON.
 *  - Import button loads an existing JSON file into the editor.
 *
 *  Wire into the game loop:
 *  ```ts
 *  if (!editMode.isActive) { player.update(…); sceneManager.update(…); }
 *  ```
 */
export class EditMode {
  private _active = false;

  private grid = new EditorGrid();
  private preview: RenderedRoom | null = null;
  private readonly hoverGroup = new THREE.Group();
  private readonly hoverGeo: THREE.BoxGeometry;
  private readonly hoverMat: THREE.MeshBasicMaterial;
  private hoverMesh: THREE.Mesh;

  // Palette state
  private selectedKind: PaletteKind = 'wall';
  private currentRotation: Rotation = 0;
  private doorFacing: DoorFacing = 'north';
  private doorTargetId = '';
  private stairFacing: DoorFacing = 'north';
  private stairDirection: StairDirection = 'up';
  private stairTargetId = '';
  private contentText = 'Your text here.';

  // UI elements
  private panel: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private validationEl: HTMLElement | null = null;

  // Raycasting
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();
  private readonly ndcMouse = new THREE.Vector2();

  // Bound event listeners
  private readonly _onKey: (e: KeyboardEvent) => void;
  private readonly _onMouseMove: (e: MouseEvent) => void;
  private readonly _onMouseDown: (e: MouseEvent) => void;
  private readonly _onContextMenu: (e: Event) => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly physics: PhysicsWorld,
    private readonly sceneManager: SceneManager,
  ) {
    // Persistent hover highlight — reused each frame, only geometry position changes
    this.hoverGeo = new THREE.BoxGeometry(1, 0.08, 1); // scaled per cell in _updateHover
    this.hoverMat = new THREE.MeshBasicMaterial({
      color: KIND_COLOR[this.selectedKind],
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.hoverMesh = new THREE.Mesh(this.hoverGeo, this.hoverMat);
    this.hoverMesh.visible = false;
    this.hoverGroup.add(this.hoverMesh);

    this._onKey = this._handleKey.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onContextMenu = (e) => { if (this._active) e.preventDefault(); };

    window.addEventListener('keydown', this._onKey);
    window.addEventListener('contextmenu', this._onContextMenu);
  }

  get isActive(): boolean { return this._active; }

  toggle(): void {
    this._active ? this._deactivate() : this._activate();
  }

  dispose(): void {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('contextmenu', this._onContextMenu);
    if (this._active) this._deactivate();
    this.hoverGeo.dispose();
    this.hoverMat.dispose();
  }

  // ── Activation ────────────────────────────────────────────────────────

  private _activate(): void {
    this._active = true;
    this.sceneManager.setVisible(false);

    this.grid = new EditorGrid();
    this._rebuildPreview();

    this.scene.add(this.hoverGroup);
    this._buildPanel();

    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
  }

  private _deactivate(): void {
    this._active = false;
    this.sceneManager.setVisible(true);

    this.preview?.dispose();
    this.preview = null;

    this.scene.remove(this.hoverGroup);
    this.hoverMesh.visible = false;

    this.panel?.remove();
    this.panel = null;
    this.statusEl = null;
    this.validationEl = null;

    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
  }

  // ── Preview ───────────────────────────────────────────────────────────

  private _rebuildPreview(): void {
    if (this.preview) {
      this.scene.remove(this.preview.group);
      this.preview.dispose();
    }
    this.preview = renderBlueprint(this.grid.toBlueprint(), this.physics, { showEditorMarkers: true });
    this.scene.add(this.preview.group);
    this._updateValidation();
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private _handleKey(e: KeyboardEvent): void {
    if (!this._active) return;
    if (e.key === 'r' || e.key === 'R') {
      this._cycleOrientation();
      return;
    }
    const kind = HOTKEYS[e.key];
    if (kind) {
      this.selectedKind = kind;
      this.hoverMat.color.setHex(KIND_COLOR[kind]);
      this._updatePanel();
    }
  }

  /** Cycle orientation for the current tool:
   *  - door      → cycles doorFacing (north→east→south→west)
   *  - staircase → cycles stairFacing
   *  - others    → cycles numeric rotation (0→90→180→270) */
  private _cycleOrientation(): void {
    if (this.selectedKind === 'door') {
      const idx = FACING_OPTIONS.indexOf(this.doorFacing);
      this.doorFacing = FACING_OPTIONS[(idx + 1) % FACING_OPTIONS.length];
    } else if (this.selectedKind === 'staircase') {
      const idx = FACING_OPTIONS.indexOf(this.stairFacing);
      this.stairFacing = FACING_OPTIONS[(idx + 1) % FACING_OPTIONS.length];
    } else {
      const idx = ROTATIONS.indexOf(this.currentRotation);
      this.currentRotation = ROTATIONS[(idx + 1) % ROTATIONS.length];
    }
    this._renderPanel();
  }

  /** Convert a MouseEvent to grid cell coords, or null if outside the room. */
  private _cellAt(e: MouseEvent): { cx: number; cz: number } | null {
    this.ndcMouse.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndcMouse, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hitPoint)) return null;

    const bp = this.grid.toBlueprint();
    const halfW = (bp.width * bp.cellSize) / 2;
    const halfD = (bp.depth * bp.cellSize) / 2;
    const cx = Math.floor((this.hitPoint.x + halfW) / bp.cellSize);
    const cz = Math.floor((this.hitPoint.z + halfD) / bp.cellSize);
    if (cx < 0 || cx >= bp.width || cz < 0 || cz >= bp.depth) return null;
    return { cx, cz };
  }

  private _handleMouseMove(e: MouseEvent): void {
    const cell = this._cellAt(e);
    if (!cell) {
      this.hoverMesh.visible = false;
      this._setStatus('');
      return;
    }
    const bp = this.grid.toBlueprint();
    const { x: wx, z: wz } = cellToWorld(cell.cx, cell.cz, bp);
    const s = bp.cellSize;
    this.hoverMesh.scale.set(s * 0.96, 1, s * 0.96);
    this.hoverMesh.position.set(wx, 0.05, wz);
    this.hoverMesh.visible = true;
    this._setStatus(`cell [${cell.cx}, ${cell.cz}]  —  ${KIND_LABEL[this.selectedKind]}`);
  }

  private _handleMouseDown(e: MouseEvent): void {
    // Ignore clicks inside the panel
    if (this.panel?.contains(e.target as Node)) return;

    const cell = this._cellAt(e);
    if (!cell) return;

    if (e.button === 2) {
      this.grid.erase(cell.cx, cell.cz);
    } else if (e.button === 0) {
      this.grid.place(cell.cx, cell.cz, this.selectedKind, {
        facing: this.selectedKind === 'door' ? this.doorFacing : this.stairFacing,
        targetId:
          this.selectedKind === 'door'
            ? (this.doorTargetId.trim() || null)
            : this.selectedKind === 'staircase'
              ? (this.stairTargetId.trim() || null)
              : undefined,
        direction: this.stairDirection,
        content: this.contentText,
        rotation: this.currentRotation || undefined,
      });
    }
    this._rebuildPreview();
  }

  // ── HTML Panel ────────────────────────────────────────────────────────

  private _buildPanel(): void {
    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed;top:12px;right:12px;width:230px;',
      'background:rgba(18,16,28,0.94);border:1px solid #44405a;',
      'border-radius:6px;padding:12px;color:#ccc;',
      'font:12px/1.6 monospace;z-index:9000;user-select:none;',
    ].join('');
    this.panel = panel;
    document.body.appendChild(panel);
    this._renderPanel();
  }

  /** Re-render panel HTML. Called on tool change or after a rebuild. */
  private _renderPanel(): void {
    if (!this.panel) return;
    const bp = this.grid.toBlueprint();

    const paletteRows = (Object.keys(KIND_COLOR) as PaletteKind[]).map((k, i) => {
      const hot = i < 7 ? String(i + 1) : 'E';
      const active = k === this.selectedKind;
      const col = '#' + KIND_COLOR[k].toString(16).padStart(6, '0');
      return `<div data-kind="${k}" style="padding:1px 4px;cursor:pointer;border-radius:3px;${active ? 'background:#2e2c44;' : ''}">
        <span style="color:${col};">■</span> ${KIND_LABEL[k]} <span style="color:#555;">[${hot}]</span>
      </div>`;
    }).join('');

    const extraFields = this.selectedKind === 'door' ? `
      <div style="margin-top:6px;border-top:1px solid #333;padding-top:6px;">
        <label style="display:block;margin-bottom:3px;">Facing
          <select id="ed-dfacing" style="${S_SEL}">${FACING_OPTIONS.map(f => `<option${f === this.doorFacing ? ' selected' : ''}>${f}</option>`).join('')}</select>
        </label>
        <label style="display:block;">Target ID <input id="ed-dtarget" value="${this.doorTargetId}" placeholder="(none=exterior)" style="${S_INPUT}"></label>
      </div>` : this.selectedKind === 'staircase' ? `
      <div style="margin-top:6px;border-top:1px solid #333;padding-top:6px;">
        <label style="display:block;margin-bottom:3px;">Facing
          <select id="ed-sfacing" style="${S_SEL}">${FACING_OPTIONS.map(f => `<option${f === this.stairFacing ? ' selected' : ''}>${f}</option>`).join('')}</select>
        </label>
        <label style="display:block;margin-bottom:3px;">Direction
          <select id="ed-sdir" style="${S_SEL}"><option${this.stairDirection === 'up' ? ' selected' : ''}>up</option><option${this.stairDirection === 'down' ? ' selected' : ''}>down</option></select>
        </label>
        <label style="display:block;">Target ID <input id="ed-starget" value="${this.stairTargetId}" placeholder="(none)" style="${S_INPUT}"></label>
      </div>` : ['bookshelf', 'lectern'].includes(this.selectedKind) ? `
      <div style="margin-top:6px;border-top:1px solid #333;padding-top:6px;">
        <label style="display:block;">Content<br>
          <textarea id="ed-content" rows="2" style="${S_INPUT}width:100%;box-sizing:border-box;resize:vertical;">${this.contentText}</textarea>
        </label>
      </div>` : '';

    this.panel.innerHTML = `
      <div style="color:#ff9933;font-weight:bold;margin-bottom:8px;letter-spacing:1px;">⬡ ROOM EDITOR</div>

      <div style="margin-bottom:6px;">
        <label style="display:block;">ID <input id="ed-id" value="${bp.id}" style="${S_INPUT}"></label>
        <label style="display:block;margin-top:3px;">Floor <input id="ed-floor" type="number" value="${bp.floor}" style="${S_NUM}"></label>
        <label style="display:block;margin-top:3px;">Floor type
          <select id="ed-floortype" style="${S_SEL}">${FLOOR_TYPE_OPTIONS.map(f => `<option${f === bp.floorType ? ' selected' : ''}>${f}</option>`).join('')}</select>
        </label>
        <label style="display:block;margin-top:3px;">Size
          <input id="ed-w" type="number" value="${bp.width}" min="3" max="24" style="${S_NUM}">
          × <input id="ed-d" type="number" value="${bp.depth}" min="3" max="24" style="${S_NUM}">
          <button id="ed-resize" style="${S_BTN}margin-left:4px;">Resize</button>
        </label>
      </div>

      <hr style="border:none;border-top:1px solid #333;margin:6px 0;">
      <div style="color:#888;margin-bottom:3px;font-size:11px;">TOOLS</div>
      ${paletteRows}
      <div style="padding:2px 4px;margin-top:2px;display:flex;align-items:center;gap:6px;">
        <span style="color:#888;font-size:11px;">Orientation:</span>
        <strong style="color:#ff9933;">${
          this.selectedKind === 'door' ? this.doorFacing
          : this.selectedKind === 'staircase' ? this.stairFacing
          : `${this.currentRotation}°`
        }</strong>
        <span style="color:#555;font-size:10px;">[R] cycle</span>
      </div>
      ${extraFields}

      <hr style="border:none;border-top:1px solid #333;margin:8px 0 4px;">
      <div id="ed-validation" style="font-size:11px;margin-bottom:6px;"></div>
      <div style="display:flex;gap:6px;">
        <button id="ed-export" style="${S_BTN}flex:1;">↓ Export</button>
        <button id="ed-import" style="${S_BTN}flex:1;">↑ Import</button>
      </div>
      <div id="ed-status" style="color:#555;font-size:10px;margin-top:6px;"></div>
      <div style="color:#444;font-size:10px;margin-top:2px;">~ close  •  right-click erase  •  R rotate</div>
    `;

    // Bind inputs
    this._on('ed-id', 'input', (el) => { this.grid.id = (el as HTMLInputElement).value; });
    this._on('ed-floortype', 'change', (el) => {
      this.grid.floorType = (el as HTMLSelectElement).value as typeof FLOOR_TYPE_OPTIONS[number];
      this._rebuildPreview();
    });
    this._on('ed-floor', 'change', (el) => {
      this.grid.floor = Number((el as HTMLInputElement).value);
      this._rebuildPreview();
    });
    this._on('ed-resize', 'click', () => {
      const w = Number((this.panel!.querySelector('#ed-w') as HTMLInputElement).value);
      const d = Number((this.panel!.querySelector('#ed-d') as HTMLInputElement).value);
      this.grid.resize(w, d);
      this._rebuildPreview();
      this._renderPanel();
    });
    for (const el of this.panel.querySelectorAll('[data-kind]')) {
      el.addEventListener('click', () => {
        this.selectedKind = (el as HTMLElement).dataset['kind'] as PaletteKind;
        this.hoverMat.color.setHex(KIND_COLOR[this.selectedKind]);
        this._renderPanel();
      });
    }
    this._on('ed-dfacing', 'change', (el) => { this.doorFacing = (el as HTMLSelectElement).value as DoorFacing; });
    this._on('ed-dtarget', 'input', (el) => { this.doorTargetId = (el as HTMLInputElement).value; });
    this._on('ed-sfacing', 'change', (el) => { this.stairFacing = (el as HTMLSelectElement).value as DoorFacing; });
    this._on('ed-sdir', 'change', (el) => { this.stairDirection = (el as HTMLSelectElement).value as StairDirection; });
    this._on('ed-starget', 'input', (el) => { this.stairTargetId = (el as HTMLInputElement).value; });
    this._on('ed-content', 'input', (el) => { this.contentText = (el as HTMLTextAreaElement).value; });
    this._on('ed-export', 'click', () => this._exportBlueprint());
    this._on('ed-import', 'click', () => this._importBlueprint());

    this.statusEl = this.panel.querySelector<HTMLElement>('#ed-status');
    this.validationEl = this.panel.querySelector<HTMLElement>('#ed-validation');
    this._updateValidation();
  }

  /** Bind an event to a child element by id. Silently no-ops if element is absent. */
  private _on(id: string, event: string, handler: (el: Element) => void): void {
    const el = this.panel?.querySelector(`#${id}`);
    if (el) el.addEventListener(event, () => handler(el));
  }

  private _setStatus(msg: string): void {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private _updateValidation(): void {
    if (!this.validationEl) return;
    const err = this.grid.validate();
    if (err) {
      this.validationEl.style.color = '#ff5555';
      this.validationEl.textContent = `✗ ${err}`;
    } else {
      this.validationEl.style.color = '#44cc88';
      this.validationEl.textContent = '✓ Valid blueprint';
    }
  }

  // ── Export / Import ───────────────────────────────────────────────────

  private _exportBlueprint(): void {
    const err = this.grid.validate();
    if (err) { alert(`Cannot export — blueprint is invalid:\n\n${err}`); return; }
    const json = this.grid.serialize();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.grid.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _importBlueprint(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          this.grid = EditorGrid.deserialize(reader.result as string);
          this._rebuildPreview();
          this._renderPanel();
        } catch (e) {
          alert(`Import failed:\n\n${(e as Error).message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Expose panel re-render so callers can trigger it if needed
  private _updatePanel(): void {
    this._renderPanel();
  }
}
