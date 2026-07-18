/**
 * CreativePlacementSystem.ts  —  Minecraft-style creative placement
 *
 * Right click  = place held asset at ghost position
 * Left click   = destroy object under cursor  (+ shatter particle burst)
 * Shift+drag   = move a placed object across the floor plane
 * Shift+drag+Z = move a placed object up/down (height)
 * R tap        = rotate held/selected 10°
 * Hold R       = smooth continuous rotation
 * Middle click = pick block (put hovered asset into active hotbar slot)
 * Shift+scroll = scroll hotbar slots
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setHotbarSlot, setActiveHotbarSlot, getCreativeState, setActiveTool } from './CreativeModeState';
import { EditorVersioning } from '@/editor/EditorVersioning';
import { ALL_SPAWN_ITEMS, type SpawnItem } from './SpawnPalette';

// ── Constants ─────────────────────────────────────────────────────────────────
const GRID_SIZE    = 2;
const GHOST_ALPHA  = 0.4;
const ROTATE_TAP   = 10 * (Math.PI / 180);   // 10 degrees
const ROTATE_HOLD  = Math.PI * 0.8;           // rad/sec when holding R
const DRAG_THRESH  = 4;                        // px before drag starts

// ── Shatter particle ──────────────────────────────────────────────────────────
interface ShatterParticle {
  mesh:   THREE.Mesh;
  vel:    THREE.Vector3;
  life:   number;   // 0→1, 1=just born
}

function snap(v: number, g: number) { return Math.round(v / g) * g; }

function makeGhost(root: THREE.Object3D): void {
  root.traverse(c => {
    if (!(c instanceof THREE.Mesh)) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    c.material = mats.map(m => {
      const g = (m as THREE.MeshStandardMaterial).clone();
      g.transparent = true; g.opacity = GHOST_ALPHA; g.depthWrite = false;
      return g;
    });
  });
}

function highlightMesh(root: THREE.Object3D, on: boolean): void {
  root.traverse(c => {
    if (!(c instanceof THREE.Mesh)) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    for (const m of mats) {
      (m as THREE.MeshStandardMaterial).emissive?.setHex(on ? 0x88ffcc : 0);
      (m as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.5 : 0;
    }
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CreativePlacedObject {
  id: string; path: string; group: THREE.Group;
  x: number; y: number; z: number; ry: number; scale: number;
}
let _id = 0;

// ── Main class ────────────────────────────────────────────────────────────────
export class CreativePlacementSystem {
  private _loader = new GLTFLoader();

  // Ghost (preview)
  private _ghost: THREE.Group | null = null;
  ghostHeight = 0;
  private _ghostPath: string | null = null;
  private _ghostRotY  = 0;
  private _ghostScale = 1;

  // Floor plane for raycasting
  private _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private _raycaster  = new THREE.Raycaster();
  private _mouseScreen = new THREE.Vector2();
  private _mouseWorld  = new THREE.Vector3();

  // Placed objects
  private _placed: CreativePlacedObject[] = [];

  // Undo / Redo stacks
  private _undoStack: Array<{ type: 'place' | 'destroy'; obj: CreativePlacedObject }> = [];
  private _redoStack: Array<{ type: 'place' | 'destroy'; obj: CreativePlacedObject }> = [];
  private static readonly UNDO_MAX = 50;

  // Grid overlay helper
  private _gridHelper: THREE.GridHelper | null = null;
  private _gridVisible = false;

  // Drag state
  private _dragging: CreativePlacedObject | null = null;
  private _dragStart = new THREE.Vector2();
  private _dragHeightMode = false;
  private _dragStartY    = 0;
  /** Previous mouse Y — used for per-frame height delta (avoids stutter). */
  private _prevDragMouseY = 0;

  // Rotation state
  private _rHeld   = false;
  private _rPressT = 0;    // timestamp of keydown

  // Shatter particles
  private _particles: ShatterParticle[] = [];

  // Hover highlight
  private _hovered: CreativePlacedObject | null = null;
  private _tooltipEl: HTMLElement | null = null;
  /** Multi-select: all currently selected objects */
  private _selected: Set<CreativePlacedObject> = new Set();

  // Event handler refs
  private _handlers: {
    captureDown: (e: MouseEvent) => void;
    captureUp:   (e: MouseEvent) => void;
    move:        (e: MouseEvent) => void;
    contextmenu: (e: MouseEvent) => void;
    auxclick:    (e: MouseEvent) => void;
    wheel:       (e: WheelEvent) => void;
    keydown:     (e: KeyboardEvent) => void;
    keyup:       (e: KeyboardEvent) => void;
  } | null = null;

  constructor(
    private scene:  THREE.Scene,
    private camera: THREE.Camera,
    private canvas: HTMLCanvasElement,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  activate(): void {
    const captureDown = (e: MouseEvent) => this._onCaptureDown(e);
    const captureUp   = (e: MouseEvent) => this._onCaptureUp(e);
    const move        = (e: MouseEvent) => this._onMove(e);
    const contextmenu = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const auxclick    = (e: MouseEvent) => this._onAuxClick(e);
    const wheel       = (e: WheelEvent) => this._onWheel(e);
    const keydown     = (e: KeyboardEvent) => this._onKeyDown(e);
    const keyup       = (e: KeyboardEvent) => this._onKeyUp(e);

    window.addEventListener('mousedown',   captureDown, { capture: true });
    window.addEventListener('mouseup',     captureUp,   { capture: true });
    this.canvas.addEventListener('mousemove',   move);
    this.canvas.addEventListener('contextmenu', contextmenu);
    this.canvas.addEventListener('auxclick',    auxclick);
    this.canvas.addEventListener('wheel',       wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup',   keyup);

    this._handlers = { captureDown, captureUp, move, contextmenu, auxclick, wheel, keydown, keyup };
    this.canvas.style.cursor = 'crosshair';
  }

  deactivate(): void {
    if (!this._handlers) return;
    window.removeEventListener('mousedown',   this._handlers.captureDown, { capture: true });
    window.removeEventListener('mouseup',     this._handlers.captureUp,   { capture: true });
    this.canvas.removeEventListener('mousemove',   this._handlers.move);
    this.canvas.removeEventListener('contextmenu', this._handlers.contextmenu);
    this.canvas.removeEventListener('auxclick',    this._handlers.auxclick);
    this.canvas.removeEventListener('wheel',       this._handlers.wheel);
    window.removeEventListener('keydown', this._handlers.keydown);
    window.removeEventListener('keyup',   this._handlers.keyup);
    this._handlers = null;
    this._clearGhost();
    this._clearHighlight();
    this._clearSelection();
    this.canvas.style.cursor = '';
    if (this._gridHelper) { this.scene.remove(this._gridHelper); this._gridHelper = null; }
    this._gridVisible = false;
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(dt: number): void {
    // Update floor plane for current ghost height
    this._floorPlane.constant = -this.ghostHeight;

    // Move ghost to cursor
    if (this._ghost && !this._dragging) {
      const state = getCreativeState();
      const doSnap = state.gridSnap;
      const gx = doSnap ? snap(this._mouseWorld.x, GRID_SIZE) : this._mouseWorld.x;
      const gz = doSnap ? snap(this._mouseWorld.z, GRID_SIZE) : this._mouseWorld.z;
      this._ghost.position.set(gx, this.ghostHeight, gz);
      this._ghost.rotation.y = this._ghostRotY;
      this._ghost.scale.setScalar(this._ghostScale);
    }

    // Smooth rotation while R held
    if (this._rHeld) {
      this._ghostRotY += ROTATE_HOLD * dt;
      if (this._dragging) {
        this._dragging.ry = this._ghostRotY;
        this._dragging.group.rotation.y = this._ghostRotY;
      }
    }

    // Hover highlight
    this._updateHover();

    // Advance shatter particles
    this._tickParticles(dt);
  }

  // ── Asset holding ───────────────────────────────────────────────────────────

  async holdAsset(path: string | null): Promise<void> {
    this._clearGhost();
    this._ghostPath = path;
    if (!path) return;

    // Spawn palette items use a special `spawn:<itemId>` path
    if (path.startsWith('spawn:')) {
      const itemId = path.slice(6);
      const item   = ALL_SPAWN_ITEMS.find(i => i.id === itemId);
      if (!item) return;
      this._ghost = this._makeSpawnMarkerMesh(item, GHOST_ALPHA);
      this.scene.add(this._ghost);
      setActiveTool('place');
      return;
    }

    try {
      const gltf = await this._loader.loadAsync(path);
      makeGhost(gltf.scene);
      this._ghost = gltf.scene;
      this._ghost.userData['ghost'] = true;
      this.scene.add(this._ghost);
    } catch { /* asset not found — ignore */ }
  }

  private _makeSpawnMarkerMesh(item: SpawnItem, opacity = 1): THREE.Group {
    const col = item.color;
    const group = new THREE.Group();
    group.userData['spawnItem'] = item;

    // Vertical cylinder
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.6, 8),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false }),
    );
    cyl.position.y = 0.8;
    group.add(cyl);

    // Flat ring at base (zone indicator)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.05, 6, 16),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: opacity * 1.3, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    // Floating icon label
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, 28, 24);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = `#${col.toString(16).padStart(6,'0')}`;
    ctx.fillText(item.label.slice(0, 10), 72, 24);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity, depthWrite: false }));
    sprite.scale.set(1.8, 0.9, 1);
    sprite.position.y = 2.2;
    group.add(sprite);

    return group;
  }

  get placedCount(): number { return this._placed.length; }

  exportPlaced() {
    return this._placed.map(o => ({ id: o.id, path: o.path, x: o.x, y: o.y, z: o.z, ry: o.ry, scale: o.scale }));
  }

  // ── Private: mouse ──────────────────────────────────────────────────────────

  private _onCaptureDown(e: MouseEvent): void {
    // Block attack (0) and spell (2) from reaching InputManager
    if (e.button === 0 || e.button === 2) e.stopImmediatePropagation();

    this._updateMouseWorld(e);

    if (e.button === 2) {
      // Right click = PLACE
      this._place();
      return;
    }

    if (e.button === 0) {
      if (e.shiftKey) {
        // Shift+left = start drag on hovered object
        const hit = this._pickAt(this._mouseScreen);
        if (hit) {
          this._dragging = hit;
          this._dragStart.set(e.clientX, e.clientY);
          this._dragHeightMode = false;
          this._dragStartY      = hit.y;
          this._prevDragMouseY  = e.clientY;
          highlightMesh(hit.group, true);
        }
      } else {
        // Left click: spawn markers → inspect, regular assets → destroy (or multi-select with Ctrl)
        const hit = this._pickAt(this._mouseScreen);
        if (hit) {
          const isSpawn = !!hit.group.userData['spawnItem'];
          if (isSpawn) {
            this._openSpawnInspector(hit);
          } else if (e.ctrlKey || e.metaKey) {
            // Ctrl+click = toggle multi-select
            if (this._selected.has(hit)) {
              this._selected.delete(hit);
              highlightMesh(hit.group, false);
            } else {
              this._selected.add(hit);
              highlightMesh(hit.group, true);
            }
            this._showMultiSelectBar();
          } else {
            // Plain click — deselect all then destroy
            this._clearSelection();
            this._destroy(hit);
          }
        } else {
          this._clearSelection();
        }
      }
    }
  }

  private _onCaptureUp(e: MouseEvent): void {
    if (e.button === 0 && this._dragging) {
      highlightMesh(this._dragging.group, false);
      this._dragging = null;
      this._dragHeightMode = false;
    }
  }

  private _onMove(e: MouseEvent): void {
    this._updateMouseWorld(e);

    if (this._dragging) {
      const dx = e.clientX - this._dragStart.x;
      const dy = e.clientY - this._dragStart.y;
      const moved = Math.sqrt(dx * dx + dy * dy) > DRAG_THRESH;

      if (!moved) return;

      if (this._dragHeightMode) {
        // Per-frame delta so there's no stutter or snap-back
        const dy = (this._prevDragMouseY - e.clientY) / 25;
        this._dragging.y += dy;
        this._dragging.group.position.y = this._dragging.y;
        this._prevDragMouseY = e.clientY;
      } else {
        const state  = getCreativeState();
        const doSnap = state.gridSnap;
        const gx = doSnap ? snap(this._mouseWorld.x, GRID_SIZE) : this._mouseWorld.x;
        const gz = doSnap ? snap(this._mouseWorld.z, GRID_SIZE) : this._mouseWorld.z;
        this._dragging.x = gx;
        this._dragging.z = gz;
        this._dragging.group.position.x = gx;
        this._dragging.group.position.z = gz;
      }
    }
  }

  private _onAuxClick(e: MouseEvent): void {
    // Middle click = pick block
    if (e.button !== 1) return;
    e.preventDefault();
    this._updateMouseWorld(e);
    const hit = this._pickAt(this._mouseScreen);
    if (hit) {
      const state = getCreativeState();
      setHotbarSlot(state.activeHotbarSlot, hit.path);
      void this.holdAsset(hit.path);
      this._toast(`📋 ${hit.path.split('/').pop()}`);
    }
  }

  private _onWheel(e: WheelEvent): void {
    if (!e.shiftKey) return;
    e.preventDefault();
    const state = getCreativeState();
    const dir  = e.deltaY > 0 ? 1 : -1;
    const next = ((state.activeHotbarSlot + dir) + 8) % 8;
    setActiveHotbarSlot(next);
    const path = getCreativeState().hotbar[next];
    if (path !== this._ghostPath) void this.holdAsset(path ?? null);
    this._toast(`Slot ${next + 1}${path ? ': ' + (path.split('/').pop() ?? '') : ': Empty'}`);
  }

  // ── Private: keyboard ───────────────────────────────────────────────────────

  private _onKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo, Ctrl+S = save
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
      if (e.key === 's') { e.preventDefault(); void this.saveToGame(); return; }
    }

    if (e.key === 'z' || e.key === 'Z') {
      if (this._dragging) {
        this._dragHeightMode = true;
        this._prevDragMouseY = (window as any)._lastMouseY ?? 0;
      }
      return;
    }

    if (e.key === 'g' || e.key === 'G') { this.toggleGrid(); return; }

    if (e.key === 'r' || e.key === 'R') {
      if (!this._rHeld) { this._rHeld = true; this._rPressT = Date.now(); }
      return;
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= 8) {
      const path = getCreativeState().hotbar[num - 1];
      if (path !== this._ghostPath) void this.holdAsset(path ?? null);
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this._hovered) this._destroy(this._hovered);
    }
  }

  private _onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'z' || e.key === 'Z') { this._dragHeightMode = false; return; }
    if (e.key === 'r' || e.key === 'R') {
      const held = this._rHeld;
      this._rHeld = false;
      // If held < 200ms → tap = snap rotate 10°
      if (held && Date.now() - this._rPressT < 200) {
        this._ghostRotY += ROTATE_TAP;
        if (this._dragging) { this._dragging.ry = this._ghostRotY; this._dragging.group.rotation.y = this._ghostRotY; }
      }
    }
  }

  // ── Place / Destroy ─────────────────────────────────────────────────────────

  private _place(): void {
    if (!this._ghost || !this._ghostPath) {
      this._toast('No asset held — press C to open inventory');
      return;
    }
    const state  = getCreativeState();
    const doSnap = state.gridSnap;
    const gx = doSnap ? snap(this._mouseWorld.x, GRID_SIZE) : this._mouseWorld.x;
    const gz = doSnap ? snap(this._mouseWorld.z, GRID_SIZE) : this._mouseWorld.z;

    // Spawn palette items — create permanent marker (no GLB load needed)
    if (this._ghostPath.startsWith('spawn:')) {
      const itemId = this._ghostPath.slice(6);
      const item   = ALL_SPAWN_ITEMS.find(i => i.id === itemId);
      if (!item) return;
      const root = this._makeSpawnMarkerMesh(item, 1.0);
      root.position.set(gx, this.ghostHeight, gz);
      root.rotation.y = this._ghostRotY;
      root.userData['creativeObject'] = true;
      this.scene.add(root);
      const obj: CreativePlacedObject = { id: `cp_${++_id}`, path: this._ghostPath, group: root, x: gx, y: this.ghostHeight, z: gz, ry: this._ghostRotY, scale: 1 };
      this._placed.push(obj);
      this._pushUndo({ type: 'place', obj });
      return;
    }

    this._loader.loadAsync(this._ghostPath).then(gltf => {
      const root = gltf.scene;
      root.position.set(gx, this.ghostHeight, gz);
      root.rotation.y = this._ghostRotY;
      root.scale.setScalar(this._ghostScale);
      root.userData['creativeObject'] = true;
      this.scene.add(root);
      const obj: CreativePlacedObject = { id: `cp_${++_id}`, path: this._ghostPath!, group: root, x: gx, y: this.ghostHeight, z: gz, ry: this._ghostRotY, scale: this._ghostScale };
      this._placed.push(obj);
      this._pushUndo({ type: 'place', obj });
    }).catch(() => {});
  }

  private _destroy(obj: CreativePlacedObject): void {
    this._pushUndo({ type: 'destroy', obj });
    this._shatter(obj);
    this.scene.remove(obj.group);
    this._placed = this._placed.filter(o => o !== obj);
    if (this._hovered === obj) this._hovered = null;
    if (this._dragging === obj) this._dragging = null;
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

  private _pushUndo(action: { type: 'place' | 'destroy'; obj: CreativePlacedObject }): void {
    this._undoStack.push(action);
    if (this._undoStack.length > CreativePlacementSystem.UNDO_MAX) this._undoStack.shift();
    this._redoStack = []; // clear redo on new action
  }

  undo(): void {
    const action = this._undoStack.pop();
    if (!action) { this._toast('Nothing to undo'); return; }
    this._redoStack.push(action);
    if (action.type === 'place') {
      // Reverse a place: remove the object
      this.scene.remove(action.obj.group);
      this._placed = this._placed.filter(o => o !== action.obj);
    } else {
      // Reverse a destroy: re-add the object
      action.obj.group.position.set(action.obj.x, action.obj.y, action.obj.z);
      action.obj.group.rotation.y = action.obj.ry;
      action.obj.group.scale.setScalar(action.obj.scale);
      this.scene.add(action.obj.group);
      this._placed.push(action.obj);
    }
    this._toast(`Undo: ${action.type} (${this._undoStack.length} left)`);
  }

  redo(): void {
    const action = this._redoStack.pop();
    if (!action) { this._toast('Nothing to redo'); return; }
    this._undoStack.push(action);
    if (action.type === 'place') {
      // Re-apply a place: re-add the object
      this.scene.add(action.obj.group);
      this._placed.push(action.obj);
    } else {
      // Re-apply a destroy: remove the object
      this.scene.remove(action.obj.group);
      this._placed = this._placed.filter(o => o !== action.obj);
    }
    this._toast(`Redo: ${action.type}`);
  }

  // ── Grid overlay ──────────────────────────────────────────────────────────────

  toggleGrid(): void {
    this._gridVisible = !this._gridVisible;
    if (this._gridVisible) {
      if (!this._gridHelper) {
        this._gridHelper = new THREE.GridHelper(64, 32, 0x4a2080, 0x2a1040);
        this._gridHelper.position.y = 0.01;
        this._gridHelper.userData['blueprint'] = true;
        this.scene.add(this._gridHelper);
      } else {
        this._gridHelper.visible = true;
      }
      this._toast('Grid ON');
    } else {
      if (this._gridHelper) this._gridHelper.visible = false;
      this._toast('Grid OFF');
    }
  }

  // ── Save to game ──────────────────────────────────────────────────────────────

  async saveToGame(zoneId = 'creative_default'): Promise<boolean> {
    const objects = this.exportPlaced();
    const doc = {
      schema: 1 as const, type: 'overworld' as const, id: zoneId,
      name: `Creative — ${zoneId}`,
      objects: objects.map(o => ({
        id: o.id, asset: o.path,
        x: o.x, y: o.y, z: o.z, ry: o.ry, scale: o.scale, meta: {},
      })),
      spawns: [] as unknown[], exits: [] as unknown[],
    };
    // Save a version to localStorage
    EditorVersioning.save(doc as Parameters<typeof EditorVersioning.save>[0]);

    try {
      const res = await fetch('/api/save-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'creative', id: zoneId, content: JSON.stringify(doc, null, 2) }),
      });
      this._toast(res.ok ? `✓ Saved (v${EditorVersioning.count('overworld', zoneId)} versions)` : '✗ Save failed');
      return res.ok;
    } catch {
      this._toast(`✓ Versioned locally (${EditorVersioning.count('overworld', zoneId)} versions) — no server`);
      return false;
    }
  }

  /** List saved versions for the current zone. */
  listVersions(zoneId = 'creative_default') {
    return EditorVersioning.listVersions('overworld', zoneId);
  }

  /** Restore a specific version by index (0 = most recent). */
  async restoreVersion(index: number, zoneId = 'creative_default'): Promise<void> {
    const versions = this.listVersions(zoneId);
    const entry = versions[index];
    if (!entry) { this._toast('Version not found'); return; }
    for (const obj of [...this._placed]) { this.scene.remove(obj.group); }
    this._placed = [];
    this._undoStack = [];
    this._redoStack = [];
    for (const raw of entry.doc.objects ?? []) {
      const o = raw as { asset: string; x: number; y: number; z: number; ry: number; scale?: number };
      try {
        const gltf = await this._loader.loadAsync(o.asset);
        const root = gltf.scene;
        root.position.set(o.x, o.y, o.z);
        root.rotation.y = o.ry;
        root.scale.setScalar(o.scale ?? 1);
        root.userData['creativeObject'] = true;
        this.scene.add(root);
        this._placed.push({ id: `cp_${++_id}`, path: o.asset, group: root, x: o.x, y: o.y, z: o.z, ry: o.ry, scale: o.scale ?? 1 });
      } catch { /* skip missing assets */ }
    }
    this._toast(`✓ Restored: ${entry.label}`);
  }

  /**
   * Publish — marks the current state as the canonical game version.
   * Saves to game output AND writes the base template (first-ever save, immutable).
   * Shows a confirmation before overwriting if a canonical version already exists.
   */
  async publish(zoneId = 'creative_default'): Promise<void> {
    const hasBase = !!EditorVersioning.getBase('overworld', zoneId);
    if (hasBase) {
      const existing = this.listVersions(zoneId);
      const confirmed = window.confirm(
        `Publish "${zoneId}" as the canonical game version?\n\n` +
        `${existing.length} saved versions exist.\n` +
        `The base template is always preserved.\n\nPublish now?`
      );
      if (!confirmed) return;
    }
    const ok = await this.saveToGame(zoneId);
    if (ok) this._toast('✅ Published as canonical game version');
  }

  get undoCount(): number { return this._undoStack.length; }
  get redoCount():  number { return this._redoStack.length; }

  // ── Scenario export / import ──────────────────────────────────────────────────

  /** Export everything — placed objects + spawn configs — as a .ttt-scenario.json string. */
  exportScenario(scenarioName = 'My Scenario'): string {
    const spawns = this._placed
      .filter(o => o.path.startsWith('spawn:'))
      .map(o => ({
        id:   o.id,
        path: o.path,
        x: o.x, y: o.y, z: o.z, ry: o.ry,
        config: this._spawnConfigs.get(o.id) ?? {},
      }));
    const assets = this._placed
      .filter(o => !o.path.startsWith('spawn:'))
      .map(o => ({ id: o.id, path: o.path, x: o.x, y: o.y, z: o.z, ry: o.ry, scale: o.scale }));
    const doc = { version: 1, name: scenarioName, assets, spawns, exportedAt: new Date().toISOString() };
    return JSON.stringify(doc, null, 2);
  }

  /** Download the scenario as a .ttt-scenario.json file. */
  downloadScenario(name = 'scenario'): void {
    const json = this.exportScenario(name);
    const blob = new Blob([json], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g,'_')}.ttt-scenario.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this._toast(`✓ Exported: ${a.download}`);
  }

  /** Import a scenario from a JSON string — adds objects/spawns on top of existing. */
  async importScenario(json: string): Promise<void> {
    try {
      const doc = JSON.parse(json) as { assets?: unknown[]; spawns?: unknown[] };

      for (const raw of doc.assets ?? []) {
        const a = raw as { path: string; x: number; y: number; z: number; ry: number; scale?: number };
        try {
          const gltf = await this._loader.loadAsync(a.path);
          const root = gltf.scene;
          root.position.set(a.x, a.y, a.z);
          root.rotation.y = a.ry;
          root.scale.setScalar(a.scale ?? 1);
          root.userData['creativeObject'] = true;
          this.scene.add(root);
          this._placed.push({ id: `cp_${++_id}`, path: a.path, group: root, x: a.x, y: a.y, z: a.z, ry: a.ry, scale: a.scale ?? 1 });
        } catch { /* skip missing */ }
      }

      for (const raw of doc.spawns ?? []) {
        const s = raw as { path: string; x: number; y: number; z: number; ry: number; config?: Record<string, unknown> };
        const itemId = s.path.slice(6);
        const item   = (await import('./SpawnPalette')).ALL_SPAWN_ITEMS.find(i => i.id === itemId);
        if (!item) continue;
        const root = this._makeSpawnMarkerMesh(item, 1.0);
        root.position.set(s.x, s.y ?? 0, s.z);
        root.rotation.y = s.ry;
        root.userData['creativeObject'] = true;
        this.scene.add(root);
        const obj: CreativePlacedObject = { id: `cp_${++_id}`, path: s.path, group: root, x: s.x, y: s.y ?? 0, z: s.z, ry: s.ry, scale: 1 };
        this._placed.push(obj);
        if (s.config) this._spawnConfigs.set(obj.id, s.config);
      }

      this._toast(`✓ Imported ${(doc.assets ?? []).length} assets + ${(doc.spawns ?? []).length} spawns`);
    } catch (e) {
      this._toast(`✗ Import failed: ${e}`);
    }
  }

  // ── Shatter effect ───────────────────────────────────────────────────────────

  private _shatter(obj: CreativePlacedObject): void {
    const box = new THREE.Box3().setFromObject(obj.group);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const avgScale = (size.x + size.y + size.z) / 3;
    const pSize = Math.max(0.1, avgScale * 0.15);

    // Pick a color from the object
    let color = 0x8855cc;
    obj.group.traverse(c => {
      if (c instanceof THREE.Mesh) {
        const mat = Array.isArray(c.material) ? c.material[0] : c.material;
        if (mat && (mat as THREE.MeshStandardMaterial).color) {
          color = (mat as THREE.MeshStandardMaterial).color.getHex();
        }
      }
    });

    const COUNT = 12;
    for (let i = 0; i < COUNT; i++) {
      const geo = new THREE.BoxGeometry(pSize, pSize, pSize);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(centre).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * size.x,
          (Math.random() - 0.5) * size.y,
          (Math.random() - 0.5) * size.z,
        )
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 6,
      );
      this.scene.add(mesh);
      this._particles.push({ mesh, vel, life: 1 });
    }
  }

  private _tickParticles(dt: number): void {
    const gravity = 9.8;
    const dead: ShatterParticle[] = [];
    for (const p of this._particles) {
      p.life -= dt * 2;    // fade in ~0.5s
      p.vel.y -= gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.z += dt * 2;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        dead.push(p);
      }
    }
    this._particles = this._particles.filter(p => !dead.includes(p));
  }

  private _alignSelected(mode: 'min-x'|'max-x'|'center-x'|'min-z'|'max-z'|'center-z'): void {
    const objs = [...this._selected];
    if (objs.length < 2) return;
    const xs = objs.map(o => o.x); const zs = objs.map(o => o.z);
    const target = mode === 'min-x' ? Math.min(...xs) : mode === 'max-x' ? Math.max(...xs)
      : mode === 'center-x' ? (Math.min(...xs)+Math.max(...xs))/2
      : mode === 'min-z' ? Math.min(...zs) : mode === 'max-z' ? Math.max(...zs)
      : (Math.min(...zs)+Math.max(...zs))/2;
    objs.forEach(o => {
      if (mode.endsWith('x')) { o.x = target; o.group.position.x = target; }
      else                    { o.z = target; o.group.position.z = target; }
    });
    this._toast(`Aligned ${objs.length} objects`);
  }

  private _distributeSelected(axis: 'x' | 'z'): void {
    const objs = [...this._selected].sort((a,b) => a[axis] - b[axis]);
    if (objs.length < 3) return;
    const min = objs[0]![axis]; const max = objs[objs.length-1]![axis];
    const step = (max - min) / (objs.length - 1);
    objs.forEach((o, i) => { o[axis] = min + step * i; o.group.position[axis] = o[axis]; });
    this._toast(`Distributed ${objs.length} objects`);
  }

  // ── Spawn configs (editable state per placed spawn) ──────────────────────────
  private _spawnConfigs = new Map<string, Record<string, unknown>>();

  private _openSpawnInspector(obj: CreativePlacedObject): void {
    document.getElementById('spawn-inspector')?.remove();
    const item = obj.group.userData['spawnItem'] as import('./SpawnPalette').SpawnItem;
    if (!item) return;

    // Merge defaults with any saved config
    const cfg = { ...item.defaults, ...this._spawnConfigs.get(obj.id) };

    const panel = document.createElement('div');
    panel.id = 'spawn-inspector';
    panel.style.cssText = `
      position:fixed;top:50%;right:16px;transform:translateY(-50%);
      background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
      border:1px solid rgba(140,80,220,0.4);border-radius:8px;
      padding:14px;width:240px;z-index:9100;pointer-events:auto;
      font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:rgba(220,200,255,0.85);
    `;

    const mkField = (label: string, key: string, type: 'text' | 'number' | 'select', opts?: string[]) => {
      const val = cfg[key] ?? '';
      const row = `<div style="margin:6px 0">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);margin-bottom:3px;letter-spacing:1px">${label.toUpperCase()}</div>
        ${type === 'select' && opts
          ? `<select data-key="${key}" style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:3px 6px;border-radius:3px;font-size:10px;outline:none">
              ${opts.map(o => `<option${o===val?' selected':''}>${o}</option>`).join('')}
             </select>`
          : `<input type="${type}" data-key="${key}" value="${val}" style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:3px 8px;border-radius:3px;font-size:10px;outline:none;box-sizing:border-box"/>`
        }
      </div>`;
      return row;
    };

    let extraButtons = '';
    let fields = '';

    if (item.category === 'enemy') {
      fields = mkField('Enemy Type', 'enemyId', 'text')
             + mkField('Tier', 'tier', 'select', ['1','2','3','boss'])
             + mkField('Count', 'count', 'number')
             + mkField('Pattern', 'pattern', 'select', ['static','patrol','ambush','wave']);
    } else if (item.category === 'npc') {
      fields = mkField('NPC Name', 'npcName', 'text')
             + mkField('NPC Type', 'npcType', 'select', ['merchant','quest_giver','trainer','guard','lorekeeper','custom'])
             + mkField('Dialogue ID', 'dialogueId', 'text');
      extraButtons = `<button id="si-edit-dialogue" style="width:100%;margin-top:4px;padding:6px;background:rgba(60,40,120,0.3);border:1px solid rgba(140,80,220,0.3);border-radius:4px;color:#cc88ff;cursor:pointer;font-size:10px">✏️ Edit Dialogue</button>`;
    } else if (item.category === 'wave') {
      fields = mkField('Wave Count', 'waveCount', 'number')
             + mkField('Enemies/Wave', 'count', 'number')
             + mkField('Enemy Type', 'enemyId', 'text')
             + mkField('Tier', 'tier', 'select', ['1','2','3','boss'])
             + mkField('Trigger', 'pattern', 'select', ['wave','static']);
      extraButtons = `<button id="si-wave-design" style="width:100%;margin-top:4px;padding:6px;background:rgba(30,60,120,0.3);border:1px solid rgba(80,140,220,0.3);border-radius:4px;color:#88aaff;cursor:pointer;font-size:10px">🌊 Configure Waves…</button>`;
    } else if (item.category === 'quest_zone') {
      fields = mkField('Zone Type', 'type', 'select', ['reach','collect','protect','survive'])
             + mkField('Radius (WU)', 'radius', 'number');
    } else if (item.category === 'interactable') {
      fields = mkField('Type', 'type', 'select', ['bookshelf','chest','lectern','stall','cauldron','portal'])
             + mkField('Content / Text', 'content', 'text')
             + mkField('Spell Unlock', 'spellUnlock', 'text');
    }

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h4 style="color:#cc88ff;font-size:10px;letter-spacing:2px">${item.icon} ${item.label.toUpperCase()}</h4>
        <button id="si-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:13px">✕</button>
      </div>
      ${fields}
      ${extraButtons}
      <div style="display:flex;gap:6px;margin-top:10px">
        <button id="si-save" style="flex:1;padding:6px;background:rgba(100,40,180,0.25);border:1px solid rgba(140,80,220,0.3);border-radius:4px;color:#cc88ff;cursor:pointer;font-size:10px">✓ Apply</button>
        <button id="si-delete" style="padding:6px 10px;background:rgba(120,20,20,0.2);border:1px solid rgba(200,40,40,0.3);border-radius:4px;color:#ff8888;cursor:pointer;font-size:10px">🗑</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Live sync
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach(el => {
      el.addEventListener('input', () => { cfg[el.dataset['key']!] = el.type === 'number' ? parseFloat(el.value) : el.value; });
    });

    panel.querySelector('#si-close')?.addEventListener('click', () => panel.remove());
    panel.querySelector('#si-save')?.addEventListener('click', () => {
      this._spawnConfigs.set(obj.id, { ...cfg });
      this._toast(`✓ Spawn config saved`);
      panel.remove();
    });
    panel.querySelector('#si-delete')?.addEventListener('click', () => {
      panel.remove();
      this._destroy(obj);
    });
    panel.querySelector('#si-edit-dialogue')?.addEventListener('click', () => {
      this._openDialogueEditor(cfg['dialogueId'] as string ?? '', cfg['npcName'] as string ?? 'NPC', (id) => {
        cfg['dialogueId'] = id;
        const el = panel.querySelector<HTMLInputElement>('[data-key="dialogueId"]');
        if (el) el.value = id;
        this._spawnConfigs.set(obj.id, { ...cfg });
      });
    });
    panel.querySelector('#si-wave-design')?.addEventListener('click', () => {
      this._openWaveDesigner(cfg, (updated) => {
        Object.assign(cfg, updated);
        this._spawnConfigs.set(obj.id, { ...cfg });
        this._toast('✓ Wave config saved');
      });
    });
  }

  // ── NPC Dialogue Editor ───────────────────────────────────────────────────────

  private _openDialogueEditor(existingId: string, npcName: string, onSave: (id: string) => void): void {
    document.getElementById('dialogue-editor')?.remove();
    const panel = document.createElement('div');
    panel.id = 'dialogue-editor';
    panel.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
      border:1px solid rgba(140,80,220,0.4);border-radius:10px;
      padding:16px;width:440px;max-height:70vh;overflow-y:auto;z-index:9200;
      font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:rgba(220,200,255,0.85);
    `;
    const autoId = existingId || `player_npc_${Date.now()}`;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h3 style="color:#cc88ff;font-size:11px;letter-spacing:2px">✏️ DIALOGUE — ${npcName}</h3>
        <button id="de-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px">✕</button>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);margin-bottom:3px;letter-spacing:1px">DIALOGUE ID</div>
        <input id="de-id" type="text" value="${autoId}" style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:4px 8px;border-radius:3px;font-size:10px;box-sizing:border-box;outline:none"/>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:9px;color:rgba(200,180,230,0.4);margin-bottom:3px;letter-spacing:1px">DIALOGUE LINES (one per line)</div>
        <textarea id="de-lines" rows="8" placeholder="Hello, traveller. I have a quest for you.&#10;Are you interested?&#10;Then speak to me again when you are ready."
          style="width:100%;background:rgba(20,12,36,0.9);border:1px solid rgba(140,80,220,0.25);color:#eee;padding:5px 8px;border-radius:3px;font-size:10px;box-sizing:border-box;outline:none;resize:vertical;font-family:inherit;line-height:1.5"></textarea>
      </div>
      <div style="font-size:8px;color:rgba(255,255,255,0.2);margin-bottom:10px">
        Saved to <code>public/editor-output/dialogue/${autoId}.json</code><br>
        Player-created dialogues only — game NPC dialogues are never modified.
      </div>
      <div style="display:flex;gap:8px">
        <button id="de-save" style="flex:1;padding:7px;background:rgba(100,40,180,0.3);border:1px solid rgba(200,100,255,0.4);border-radius:5px;color:#cc88ff;cursor:pointer;font-size:10px">💾 Save Dialogue</button>
        <button id="de-cancel" style="padding:7px 12px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:5px;color:rgba(255,255,255,0.3);cursor:pointer;font-size:10px">Cancel</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#de-close')?.addEventListener('click', () => panel.remove());
    panel.querySelector('#de-cancel')?.addEventListener('click', () => panel.remove());
    panel.querySelector('#de-save')?.addEventListener('click', async () => {
      const id    = (panel.querySelector<HTMLInputElement>('#de-id')!).value.trim() || autoId;
      const lines = (panel.querySelector<HTMLTextAreaElement>('#de-lines')!).value.split('\n').filter(Boolean);
      const doc   = { id, npc: npcName, lines };
      try {
        await fetch('/api/save-level', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dialogue', id, content: JSON.stringify(doc, null, 2) }),
        });
      } catch { /* no server — ok */ }
      onSave(id);
      this._toast(`✓ Dialogue saved: ${id}`);
      panel.remove();
    });
  }

  // ── Wave Designer ─────────────────────────────────────────────────────────────

  private _openWaveDesigner(cfg: Record<string, unknown>, onSave: (updated: Record<string, unknown>) => void): void {
    document.getElementById('wave-designer')?.remove();
    type WaveDef = { enemyId: string; count: number; tier: string };
    const waves: WaveDef[] = (cfg['waves'] as WaveDef[]) ?? [{ enemyId: 'slime', count: 3, tier: '1' }];

    const panel = document.createElement('div');
    panel.id = 'wave-designer';
    panel.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(8,4,18,0.97);backdrop-filter:blur(8px);
      border:1px solid rgba(80,140,220,0.4);border-radius:10px;
      padding:16px;width:380px;max-height:70vh;overflow-y:auto;z-index:9200;
      font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:rgba(220,200,255,0.85);
    `;
    const renderWaves = () => {
      panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="color:#88aaff;font-size:11px;letter-spacing:2px">🌊 WAVE DESIGNER</h3>
          <button id="wd-close" style="background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:14px">✕</button>
        </div>
        <div style="margin-bottom:8px">
          ${waves.map((w,i) => `
            <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;background:rgba(20,12,36,0.6);padding:5px 8px;border-radius:4px;border:1px solid rgba(80,140,220,0.2)">
              <span style="font-size:9px;color:#88aaff;min-width:28px">W${i+1}</span>
              <input data-wi="${i}" data-wf="enemyId" type="text" value="${w.enemyId}" placeholder="enemy type"
                style="flex:1;background:transparent;border:none;border-bottom:1px solid rgba(140,80,220,0.2);color:#eee;font-size:9px;padding:2px 4px;outline:none"/>
              <select data-wi="${i}" data-wf="tier" style="background:rgba(20,12,36,0.9);border:1px solid rgba(80,140,220,0.2);color:#eee;font-size:9px;padding:1px 3px;border-radius:2px">
                ${['1','2','3','boss'].map(t=>`<option${w.tier===t?' selected':''}>${t}</option>`).join('')}
              </select>
              <input data-wi="${i}" data-wf="count" type="number" value="${w.count}" min="1"
                style="width:38px;background:transparent;border:none;border-bottom:1px solid rgba(140,80,220,0.2);color:#eee;font-size:9px;padding:2px 4px;outline:none"/>
              <button data-wdel="${i}" style="background:transparent;border:none;color:rgba(220,80,80,0.5);cursor:pointer;font-size:11px">✕</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button id="wd-add" style="padding:5px 10px;background:rgba(30,60,120,0.25);border:1px solid rgba(80,140,220,0.3);border-radius:4px;color:#88aaff;cursor:pointer;font-size:9px">+ Add Wave</button>
          <button id="wd-save" style="flex:1;padding:5px;background:rgba(30,60,120,0.35);border:1px solid rgba(80,140,220,0.4);border-radius:4px;color:#88aaff;cursor:pointer;font-size:10px">✓ Apply Waves</button>
        </div>
      `;
      panel.querySelector('#wd-close')?.addEventListener('click', () => panel.remove());
      panel.querySelector('#wd-add')?.addEventListener('click', () => { waves.push({ enemyId: 'slime', count: 3, tier: '1' }); renderWaves(); });
      panel.querySelector('#wd-save')?.addEventListener('click', () => { onSave({ ...cfg, waves, waveCount: waves.length }); this._toast('✓ Wave config applied'); panel.remove(); });
      panel.querySelectorAll<HTMLElement>('[data-wi]').forEach(el => {
        el.addEventListener('input', () => {
          const i = parseInt(el.dataset['wi']!);
          const f = el.dataset['wf'] as keyof WaveDef;
          if (f === 'count') waves[i].count = parseInt((el as HTMLInputElement).value) || 1;
          else (waves[i] as any)[f] = (el as HTMLInputElement | HTMLSelectElement).value;
        });
      });
      panel.querySelectorAll<HTMLElement>('[data-wdel]').forEach(el => {
        el.addEventListener('click', () => { waves.splice(parseInt(el.dataset['wdel']!), 1); renderWaves(); });
      });
    };
    renderWaves();
    document.body.appendChild(panel);
  }

  private _clearSelection(): void {
    this._selected.forEach(o => highlightMesh(o.group, false));
    this._selected.clear();
    document.getElementById('creative-multiselect-bar')?.remove();
  }

  private _showMultiSelectBar(): void {
    document.getElementById('creative-multiselect-bar')?.remove();
    if (!this._selected.size) return;

    const bar = document.createElement('div');
    bar.id = 'creative-multiselect-bar';
    bar.style.cssText = 'position:fixed;top:40px;left:50%;transform:translateX(-50%);background:rgba(8,4,18,0.95);border:1px solid rgba(140,80,220,0.4);border-radius:6px;padding:5px 10px;display:flex;align-items:center;gap:8px;z-index:9100;font-family:sans-serif;font-size:10px;color:rgba(220,200,255,0.8);pointer-events:auto;';
    bar.innerHTML = `
      <span style="color:#cc88ff;font-weight:600">${this._selected.size} selected</span>
      <button id="ms-delete" style="padding:3px 8px;background:rgba(120,20,20,0.3);border:1px solid rgba(200,40,40,0.3);border-radius:3px;color:#ff8888;cursor:pointer;font-size:9px">🗑 Delete all</button>
      <button id="ms-clone" style="padding:3px 8px;background:rgba(60,40,120,0.3);border:1px solid rgba(140,80,220,0.3);border-radius:3px;color:#cc88ff;cursor:pointer;font-size:9px">📋 Clone all</button>
      <button id="ms-clear" style="padding:3px 8px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:rgba(255,255,255,0.3);cursor:pointer;font-size:9px">✕ Deselect</button>
    `;
    document.body.appendChild(bar);

    bar.querySelector('#ms-delete')?.addEventListener('click', () => {
      [...this._selected].forEach(o => this._destroy(o));
      this._clearSelection();
    });
    bar.querySelector('#ms-clone')?.addEventListener('click', () => {
      const toClone = [...this._selected];
      this._clearSelection();
      toClone.forEach(o => {
        this._loader.loadAsync(o.path).then(gltf => {
          const root = gltf.scene;
          root.position.set(o.x + 2, o.y, o.z);
          root.rotation.y = o.ry;
          root.scale.setScalar(o.scale);
          root.userData['creativeObject'] = true;
          this.scene.add(root);
          const obj: CreativePlacedObject = { id: `cp_${++_id}`, path: o.path, group: root, x: o.x+2, y: o.y, z: o.z, ry: o.ry, scale: o.scale };
          this._placed.push(obj);
          this._pushUndo({ type: 'place', obj });
        }).catch(() => {});
      });
      this._toast(`Cloned ${toClone.length} objects`);
    });
    bar.querySelector('#ms-clear')?.addEventListener('click', () => this._clearSelection());

    // Align tools
    const alignBar = document.createElement('div');
    alignBar.style.cssText = 'display:flex;gap:4px;margin-left:8px;border-left:1px solid rgba(255,255,255,0.1);padding-left:8px;';
    for (const [label, action] of [
      ['⬅', () => this._alignSelected('min-x')],
      ['↔', () => this._alignSelected('center-x')],
      ['➡', () => this._alignSelected('max-x')],
      ['⬆', () => this._alignSelected('min-z')],
      ['↕', () => this._alignSelected('center-z')],
      ['⬇', () => this._alignSelected('max-z')],
      ['⇔', () => this._distributeSelected('x')],
    ] as [string, () => void][]) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = label;
      btn.style.cssText = 'padding:3px 6px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:3px;color:rgba(255,255,255,0.4);cursor:pointer;font-size:10px;';
      btn.addEventListener('click', action);
      alignBar.appendChild(btn);
    }
    bar.appendChild(alignBar);
  }

  // ── Hover highlight ──────────────────────────────────────────────────────────

  private _updateHover(): void {
    const hit = this._pickAt(this._mouseScreen);
    if (hit !== this._hovered) {
      if (this._hovered) highlightMesh(this._hovered.group, false);
      this._hovered = hit;
      if (this._hovered && !this._dragging) highlightMesh(this._hovered.group, true);
    }
    // Tooltip
    if (hit) {
      if (!this._tooltipEl) {
        this._tooltipEl = document.createElement('div');
        this._tooltipEl.style.cssText = 'position:fixed;background:rgba(8,4,18,0.92);border:1px solid rgba(140,80,220,0.3);border-radius:4px;padding:4px 10px;font-size:9px;color:rgba(220,200,255,0.8);pointer-events:none;z-index:9100;font-family:monospace;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        document.body.appendChild(this._tooltipEl);
      }
      const name = hit.path.split('/').pop() ?? hit.id;
      this._tooltipEl.textContent = `${name}  ·  (${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}, ${hit.z.toFixed(1)})`;
      const mx = (this._mouseScreen.x + 1) / 2 * this.canvas.offsetWidth;
      const my = (1 - this._mouseScreen.y) / 2 * this.canvas.offsetHeight;
      this._tooltipEl.style.left = `${mx + 14}px`;
      this._tooltipEl.style.top  = `${my - 10}px`;
      this._tooltipEl.style.display = 'block';
    } else {
      if (this._tooltipEl) this._tooltipEl.style.display = 'none';
    }
  }

  private _clearHighlight(): void {
    if (this._hovered) { highlightMesh(this._hovered.group, false); this._hovered = null; }
    if (this._tooltipEl) { this._tooltipEl.remove(); this._tooltipEl = null; }
  }

  // ── Ray helpers ──────────────────────────────────────────────────────────────

  private _updateMouseWorld(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    (window as any)._lastMouseY = e.clientY;
    this._mouseScreen.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(this._mouseScreen, this.camera);
    const t = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._floorPlane, t)) this._mouseWorld.copy(t);
  }

  private _pickAt(screen: THREE.Vector2): CreativePlacedObject | null {
    this._raycaster.setFromCamera(screen, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const obj of this._placed) obj.group.traverse(c => { if (c instanceof THREE.Mesh) meshes.push(c); });
    const hits = this._raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    const h = hits[0]!.object;
    return this._placed.find(o => { let f=false; o.group.traverse(c => { if(c===h) f=true; }); return f; }) ?? null;
  }

  private _clearGhost(): void {
    if (this._ghost) { this.scene.remove(this._ghost); this._ghost = null; }
  }

  private _toast(msg: string): void {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:75px;left:50%;transform:translateX(-50%);background:rgba(12,8,20,0.9);border:1px solid rgba(140,80,220,0.3);border-radius:5px;padding:5px 14px;color:rgba(220,200,255,0.8);font-size:10px;z-index:9200;pointer-events:none;font-family:monospace;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
}
