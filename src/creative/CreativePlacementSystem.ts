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
import { setHotbarSlot, setActiveHotbarSlot, getCreativeState } from './CreativeModeState';

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

  // Drag state
  private _dragging: CreativePlacedObject | null = null;
  private _dragStart = new THREE.Vector2();
  private _dragHeightMode = false;   // Z held = height drag
  private _dragStartY = 0;
  private _dragStartMouseY = 0;

  // Rotation state
  private _rHeld   = false;
  private _rPressT = 0;    // timestamp of keydown

  // Shatter particles
  private _particles: ShatterParticle[] = [];

  // Hover highlight
  private _hovered: CreativePlacedObject | null = null;

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
    this.canvas.style.cursor = '';
  }

  // ── Per-frame update ────────────────────────────────────────────────────────

  update(dt: number): void {
    // Update floor plane for current ghost height
    this._floorPlane.constant = -this.ghostHeight;

    // Move ghost to cursor
    if (this._ghost && !this._dragging) {
      const state = getCreativeState();
      const gx = state.noClip ? this._mouseWorld.x : snap(this._mouseWorld.x, GRID_SIZE);
      const gz = state.noClip ? this._mouseWorld.z : snap(this._mouseWorld.z, GRID_SIZE);
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
    try {
      const gltf = await this._loader.loadAsync(path);
      makeGhost(gltf.scene);
      this._ghost = gltf.scene;
      this._ghost.userData['ghost'] = true;
      this.scene.add(this._ghost);
    } catch { /* asset not found — ignore */ }
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
          this._dragStartY = hit.y;
          this._dragStartMouseY = e.clientY;
          highlightMesh(hit.group, true);
        }
      } else {
        // Left click = DESTROY
        const hit = this._pickAt(this._mouseScreen);
        if (hit) this._destroy(hit);
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
        // Z held: vertical movement based on mouse Y delta
        const deltaY = (this._dragStartMouseY - e.clientY) / 40;
        this._dragging.y = this._dragStartY + deltaY;
        this._dragging.group.position.y = this._dragging.y;
      } else {
        const state = getCreativeState();
        const gx = state.noClip ? this._mouseWorld.x : snap(this._mouseWorld.x, GRID_SIZE);
        const gz = state.noClip ? this._mouseWorld.z : snap(this._mouseWorld.z, GRID_SIZE);
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

    if (e.key === 'z' || e.key === 'Z') {
      if (this._dragging) { this._dragHeightMode = true; this._dragStartMouseY = (window as any)._lastMouseY ?? 0; }
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      if (!this._rHeld) {
        this._rHeld = true;
        this._rPressT = Date.now();
      }
      return;
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= 8) {
      const path = getCreativeState().hotbar[num - 1];
      if (path !== this._ghostPath) void this.holdAsset(path ?? null);
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Delete hovered
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
    const state = getCreativeState();
    const gx = state.noClip ? this._mouseWorld.x : snap(this._mouseWorld.x, GRID_SIZE);
    const gz = state.noClip ? this._mouseWorld.z : snap(this._mouseWorld.z, GRID_SIZE);

    this._loader.loadAsync(this._ghostPath).then(gltf => {
      const root = gltf.scene;
      root.position.set(gx, this.ghostHeight, gz);
      root.rotation.y = this._ghostRotY;
      root.scale.setScalar(this._ghostScale);
      root.userData['creativeObject'] = true;
      this.scene.add(root);
      this._placed.push({ id: `cp_${++_id}`, path: this._ghostPath!, group: root, x: gx, y: this.ghostHeight, z: gz, ry: this._ghostRotY, scale: this._ghostScale });
    }).catch(() => {});
  }

  private _destroy(obj: CreativePlacedObject): void {
    this._shatter(obj);
    this.scene.remove(obj.group);
    this._placed = this._placed.filter(o => o !== obj);
    if (this._hovered === obj) this._hovered = null;
    if (this._dragging === obj) this._dragging = null;
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

  // ── Hover highlight ──────────────────────────────────────────────────────────

  private _updateHover(): void {
    const hit = this._pickAt(this._mouseScreen);
    if (hit !== this._hovered) {
      if (this._hovered) highlightMesh(this._hovered.group, false);
      this._hovered = hit;
      if (this._hovered && !this._dragging) highlightMesh(this._hovered.group, true);
    }
  }

  private _clearHighlight(): void {
    if (this._hovered) { highlightMesh(this._hovered.group, false); this._hovered = null; }
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
