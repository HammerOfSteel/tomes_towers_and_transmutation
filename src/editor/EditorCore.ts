/**
 * EditorCore.ts — shared 3D placement/selection/transform engine used by all
 * level editor modes (tower floor, overworld, building, interior, dungeon).
 *
 * Designed to operate in the model-review canvas alongside OrbitControls.
 * Takes over the canvas when the Editor tab is active; yields it back on deactivate.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader }        from 'three/addons/loaders/GLTFLoader.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EditorHistory }     from './EditorHistory';
import { ENV_ASSETS }        from '@/assets/envManifest';
import type { PlacedObject, SpawnMarker, ExitMarker } from './EditorSchema';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SIZE         = 2;       // world units per tile
const SELECTION_COLOR   = 0xffcc44;
const HOVER_COLOR       = 0x8844ff;
const SPAWN_ENEMY_COLOR = 0xff3333;
const SPAWN_NPC_COLOR   = 0x44aaff;
const EXIT_UP_COLOR     = 0x4488ff;
const EXIT_DOWN_COLOR   = 0xff8844;
const EXIT_TOWER_COLOR  = 0x44ff88;

export type ToolMode = 'select' | 'move' | 'rotate' | 'scale';

export interface EditorCoreOptions {
  canvas:       HTMLCanvasElement;
  scene:        THREE.Scene;
  camera:       THREE.PerspectiveCamera;
  renderer:     THREE.WebGLRenderer;
  orbit:        OrbitControls;
  onSelectionChange?: (selected: PlacedObject[]) => void;
  onStatusChange?:    (msg: string) => void;
}

interface SceneObject {
  def:   PlacedObject;
  group: THREE.Group;
}

// ── EditorCore ────────────────────────────────────────────────────────────────

export class EditorCore {
  private readonly scene:    THREE.Scene;
  private readonly camera:   THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas:   HTMLCanvasElement;
  private readonly orbit:    OrbitControls;
  private readonly loader    = new GLTFLoader();
  readonly history           = new EditorHistory();

  private _objects:    Map<string, SceneObject> = new Map();
  private _spawns:     Map<string, { def: SpawnMarker; mesh: THREE.Mesh }> = new Map();
  private _exits:      Map<string, { def: ExitMarker;  mesh: THREE.Mesh }> = new Map();
  private _selected:   Set<string>    = new Set();
  private _tool:       ToolMode       = 'select';
  private _snapOn      = true;
  private _gridSize    = GRID_SIZE;
  private _active      = false;
  private _placingAsset: string | null = null;
  private _ghostMesh:    THREE.Group | null = null;
  private _idCounter     = 0;

  private readonly _transformCtrl: TransformControls;
  private readonly _gridHelper:    THREE.GridHelper;
  private readonly _raycaster      = new THREE.Raycaster();
  private readonly _mouse          = new THREE.Vector2();
  private readonly _groundPlane    = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  );

  private readonly _opts: EditorCoreOptions;

  constructor(opts: EditorCoreOptions) {
    this._opts     = opts;
    this.scene     = opts.scene;
    this.camera    = opts.camera;
    this.renderer  = opts.renderer;
    this.canvas    = opts.canvas;
    this.orbit     = opts.orbit;

    // Ground plane for raycasting
    this._groundPlane.rotation.x = -Math.PI / 2;
    this._groundPlane.position.y = 0;

    // Grid
    this._gridHelper = new THREE.GridHelper(200, 100, 0x2a1e40, 0x1a1030);
    this._gridHelper.position.y = 0.002;

    // TransformControls
    this._transformCtrl = new TransformControls(opts.camera, opts.canvas);
    this._transformCtrl.addEventListener('dragging-changed', (e: any) => {
      opts.orbit.enabled = !e.value;
    });
    this._transformCtrl.addEventListener('objectChange', () => {
      this._applySnapAfterTransform();
    });

    this._bindEvents();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  activate(): void {
    this._active = true;
    this.scene.add(this._groundPlane);
    this.scene.add(this._gridHelper);
    // TransformControls — add its helper mesh to the scene separately
    (this._transformCtrl as unknown as THREE.Object3D).visible = false; // hide until active
    this.scene.add(this._transformCtrl.getHelper?.() ?? (this._transformCtrl as unknown as THREE.Object3D));
    // Restore all objects
    for (const { group } of this._objects.values()) this.scene.add(group);
    for (const { mesh }  of this._spawns.values())  this.scene.add(mesh);
    for (const { mesh }  of this._exits.values())   this.scene.add(mesh);
  }

  deactivate(): void {
    this._active = false;
    this.scene.remove(this._groundPlane);
    this.scene.remove(this._gridHelper);
    this.scene.remove(this._transformCtrl.getHelper?.() ?? (this._transformCtrl as unknown as THREE.Object3D));
    if (this._ghostMesh) { this.scene.remove(this._ghostMesh); this._ghostMesh = null; }
    for (const { group } of this._objects.values()) this.scene.remove(group);
    for (const { mesh }  of this._spawns.values())  this.scene.remove(mesh);
    for (const { mesh }  of this._exits.values())   this.scene.remove(mesh);
    this._placingAsset = null;
  }

  dispose(): void {
    this.deactivate();
    this._transformCtrl.dispose();
    this._unbindEvents();
  }

  // ── Tool mode ──────────────────────────────────────────────────────────────

  setTool(mode: ToolMode): void {
    this._tool = mode;
    if (mode === 'select') {
      this._transformCtrl.detach();
    } else {
      this._transformCtrl.setMode(mode === 'move' ? 'translate' : mode);
      const sel = [...this._selected];
      if (sel.length === 1) {
        const obj = this._objects.get(sel[0]!);
        if (obj) this._transformCtrl.attach(obj.group);
      }
    }
  }

  setSnap(on: boolean): void {
    this._snapOn = on;
    const s = on ? this._gridSize : null;
    this._transformCtrl.setTranslationSnap(s);
    this._transformCtrl.setRotationSnap(on ? Math.PI / 4 : null);
    this._transformCtrl.setScaleSnap(on ? 0.25 : null);
  }

  setGridSize(size: number): void {
    this._gridSize = size;
    this.setSnap(this._snapOn);
  }

  // ── Placement mode ─────────────────────────────────────────────────────────

  beginPlacing(assetPath: string): void {
    this._placingAsset = assetPath;
    this.orbit.enabled = false;
    // Load ghost
    this.loader.loadAsync(assetPath).then(gltf => {
      if (!this._placingAsset) return;
      if (this._ghostMesh) { this.scene.remove(this._ghostMesh); }
      const scale = ENV_ASSETS.find(a => a.path === assetPath)?.gameScale ?? 1;
      gltf.scene.scale.setScalar(scale);
      gltf.scene.traverse(o => {
        if (o instanceof THREE.Mesh) {
          const m = (o.material as THREE.MeshStandardMaterial).clone();
          m.transparent = true;
          m.opacity = 0.55;
          o.material = m;
        }
      });
      this._ghostMesh = gltf.scene;
      this.scene.add(this._ghostMesh);
    }).catch(() => {});
  }

  cancelPlacing(): void {
    this._placingAsset = null;
    this.orbit.enabled = true;
    if (this._ghostMesh) { this.scene.remove(this._ghostMesh); this._ghostMesh = null; }
  }

  // ── Object placement ───────────────────────────────────────────────────────

  async placeObject(assetPath: string, position: THREE.Vector3): Promise<PlacedObject> {
    const id    = `obj_${String(++this._idCounter).padStart(4, '0')}`;
    const scale = ENV_ASSETS.find(a => a.path === assetPath)?.gameScale ?? 1;
    const snapped = this._snap(position);

    const def: PlacedObject = {
      id, asset: assetPath,
      x: snapped.x, y: snapped.y, z: snapped.z,
      ry: 0, scale, meta: {},
    };

    const gltf = await this.loader.loadAsync(assetPath);
    const group = new THREE.Group();
    group.add(gltf.scene);
    group.scale.setScalar(scale);
    group.position.set(def.x, def.y, def.z);
    group.userData['edId'] = id;
    group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });

    this._objects.set(id, { def, group });
    if (this._active) this.scene.add(group);

    this.history.push({
      type: 'place',
      undo: () => { this._objects.delete(id); this.scene.remove(group); this._notify(); },
      redo: () => { this._objects.set(id, { def, group }); if (this._active) this.scene.add(group); this._notify(); },
    });
    this._notify();
    return def;
  }

  // ── Spawn / exit markers ───────────────────────────────────────────────────

  placeSpawn(type: SpawnMarker['type'], position: THREE.Vector3): SpawnMarker {
    const id    = `spawn_${String(++this._idCounter).padStart(4, '0')}`;
    const snapped = this._snap(position);
    const def: SpawnMarker = { id, type, x: snapped.x, y: snapped.y, z: snapped.z };

    const color = type === 'enemy' ? SPAWN_ENEMY_COLOR : type === 'npc' ? SPAWN_NPC_COLOR : 0x44ff44;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(def.x, def.y + 0.4, def.z);
    mesh.userData['edId'] = id;

    // Label
    this._spawns.set(id, { def, mesh });
    if (this._active) this.scene.add(mesh);
    this._notify();
    return def;
  }

  placeExit(type: ExitMarker['type'], position: THREE.Vector3): ExitMarker {
    const id    = `exit_${String(++this._idCounter).padStart(4, '0')}`;
    const snapped = this._snap(position);
    const def: ExitMarker = { id, type, x: snapped.x, y: snapped.y, z: snapped.z };

    const color = type === 'stair_up' ? EXIT_UP_COLOR : type === 'stair_down' ? EXIT_DOWN_COLOR : EXIT_TOWER_COLOR;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.15, 8),
      new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.7 }),
    );
    mesh.position.set(def.x, def.y + 0.08, def.z);
    mesh.userData['edId'] = id;

    this._exits.set(id, { def, mesh });
    if (this._active) this.scene.add(mesh);
    this._notify();
    return def;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  selectObject(id: string, additive = false): void {
    if (!additive) this._selected.clear();
    this._selected.add(id);
    this._updateOutlines();
    if (this._tool !== 'select' && this._selected.size === 1) {
      const obj = this._objects.get(id);
      if (obj) this._transformCtrl.attach(obj.group);
    }
    this._opts.onSelectionChange?.(this._getSelectedDefs());
  }

  clearSelection(): void {
    this._selected.clear();
    this._transformCtrl.detach();
    this._updateOutlines();
    this._opts.onSelectionChange?.([]);
  }

  deleteSelected(): void {
    for (const id of [...this._selected]) {
      const obj = this._objects.get(id);
      if (obj) {
        this.scene.remove(obj.group);
        this._objects.delete(id);
      }
      const sp = this._spawns.get(id);
      if (sp) { this.scene.remove(sp.mesh); this._spawns.delete(id); }
      const ex = this._exits.get(id);
      if (ex) { this.scene.remove(ex.mesh); this._exits.delete(id); }
    }
    this._selected.clear();
    this._transformCtrl.detach();
    this._notify();
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  getObjects():  PlacedObject[] { return [...this._objects.values()].map(o => ({ ...o.def })); }
  getSpawns():   SpawnMarker[]  { return [...this._spawns.values()].map(s => ({ ...s.def })); }
  getExits():    ExitMarker[]   { return [...this._exits.values()].map(e => ({ ...e.def })); }

  async loadObjects(objects: PlacedObject[]): Promise<void> {
    for (const def of objects) {
      const gltf = await this.loader.loadAsync(def.asset).catch(() => null);
      if (!gltf) continue;
      const group = new THREE.Group();
      group.add(gltf.scene);
      group.scale.setScalar(def.scale);
      group.position.set(def.x, def.y, def.z);
      group.rotation.y = def.ry;
      group.userData['edId'] = def.id;
      group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      this._objects.set(def.id, { def: { ...def }, group });
      if (this._active) this.scene.add(group);
    }
    // Sync ID counter
    for (const def of objects) {
      const n = parseInt(def.id.replace(/\D/g, ''), 10);
      if (n > this._idCounter) this._idCounter = n;
    }
  }

  clearAll(): void {
    for (const { group } of this._objects.values()) this.scene.remove(group);
    for (const { mesh }  of this._spawns.values())  this.scene.remove(mesh);
    for (const { mesh }  of this._exits.values())   this.scene.remove(mesh);
    this._objects.clear();
    this._spawns.clear();
    this._exits.clear();
    this._selected.clear();
    this._transformCtrl.detach();
    this._idCounter = 0;
    this._notify();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _snap(v: THREE.Vector3): THREE.Vector3 {
    if (!this._snapOn) return v;
    const s = this._gridSize;
    return new THREE.Vector3(
      Math.round(v.x / s) * s,
      Math.round(v.y / s) * s,
      Math.round(v.z / s) * s,
    );
  }

  private _applySnapAfterTransform(): void {
    if (!this._snapOn) return;
    for (const id of this._selected) {
      const obj = this._objects.get(id);
      if (!obj) continue;
      const p = obj.group.position;
      const snapped = this._snap(p);
      obj.group.position.copy(snapped);
      obj.def.x = snapped.x;
      obj.def.y = snapped.y;
      obj.def.z = snapped.z;
      obj.def.ry = obj.group.rotation.y;
      obj.def.scale = obj.group.scale.x;
    }
  }

  private _updateOutlines(): void {
    for (const [id, { group }] of this._objects) {
      const isSelected = this._selected.has(id);
      group.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshStandardMaterial;
        if (isSelected) {
          mat.emissive?.setHex(SELECTION_COLOR);
          mat.emissiveIntensity = 0.3;
        } else {
          mat.emissive?.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      });
    }
  }

  private _getSelectedDefs(): PlacedObject[] {
    return [...this._selected].map(id => this._objects.get(id)?.def).filter(Boolean) as PlacedObject[];
  }

  private _notify(): void {
    const sel = this._getSelectedDefs();
    this._opts.onSelectionChange?.(sel);
    this._opts.onStatusChange?.(
      `${this._objects.size} objects | ${this._selected.size} selected | undo: ${this.history.undoCount}`
    );
  }

  // ── Mouse events ──────────────────────────────────────────────────────────

  private _onMouseMove = (e: MouseEvent): void => {
    if (!this._active) return;
    const rect = this.canvas.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
    this._mouse.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;

    // Move ghost during placement
    if (this._placingAsset && this._ghostMesh) {
      this._raycaster.setFromCamera(this._mouse, this.camera);
      const hits = this._raycaster.intersectObject(this._groundPlane);
      if (hits.length > 0) {
        const p = this._snap(hits[0]!.point);
        this._ghostMesh.position.set(p.x, p.y, p.z);
      }
    }
  };

  private _onMouseDown = (e: MouseEvent): void => {
    if (!this._active || e.button !== 0) return;

    if (this._placingAsset) {
      // Place the asset at ghost position
      const pos = this._ghostMesh?.position.clone() ?? new THREE.Vector3();
      this.placeObject(this._placingAsset, pos).then(() => {
        if (!e.shiftKey) this.cancelPlacing();
      });
      return;
    }

    // Selection click
    if (this._tool === 'select') {
      this._raycaster.setFromCamera(this._mouse, this.camera);
      const meshes = [...this._objects.values()].map(o => o.group);
      const hits   = this._raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0]!.object;
        while (obj && !obj.userData['edId']) obj = obj.parent;
        if (obj?.userData['edId']) {
          this.selectObject(obj.userData['edId'] as string, e.shiftKey);
          return;
        }
      }
      if (!e.shiftKey) this.clearSelection();
    }
  };

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._active) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    switch (e.code) {
      case 'KeyV':  this.setTool('select');  break;
      case 'KeyW':  this.setTool('move');    break;
      case 'KeyE':  this.setTool('rotate');  break;
      case 'KeyR':  this.setTool('scale');   break;
      case 'KeyS':  this.setSnap(!this._snapOn); break;
      case 'Delete': case 'Backspace': this.deleteSelected(); break;
      case 'Escape': this.cancelPlacing(); this.clearSelection(); break;
      case 'KeyZ':
        if (e.ctrlKey || e.metaKey) { e.shiftKey ? this.history.redo() : this.history.undo(); }
        break;
      case 'KeyY':
        if (e.ctrlKey || e.metaKey) this.history.redo();
        break;
    }
  };

  private _bindEvents(): void {
    this.canvas.addEventListener('mousemove',  this._onMouseMove);
    this.canvas.addEventListener('mousedown',  this._onMouseDown);
    window.addEventListener('keydown', this._onKeyDown);
  }
  private _unbindEvents(): void {
    this.canvas.removeEventListener('mousemove',  this._onMouseMove);
    this.canvas.removeEventListener('mousedown',  this._onMouseDown);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
