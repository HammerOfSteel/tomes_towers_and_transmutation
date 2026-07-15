/**
 * FloatingDialogue3D — wizard speech + player choices as 3D canvas-texture
 * planes floating in the scene, matching the effect from POC v6.
 *
 * Usage (same async interface as DialogueOverlay):
 *   const d = new FloatingDialogue3D({ scene, camera, renderer });
 *   d.mount(host);
 *   await d.fadeIn();
 *   await d.speak("Hello traveller.");
 *   const idx = await d.choose(["Option A", "Option B"]);
 *   await d.fadeOut();
 *   d.unmount();
 *
 * Tick integration:
 *   Call d.tick(elapsedSeconds) every frame from the scene's animation loop.
 */

import * as THREE from 'three';

// ── internal record per floating plane ────────────────────────────────────────

interface _Rec {
  mesh:          THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  group:         THREE.Group;
  baseY:         number;
  phase:         number;
  targetOpacity: number;
  isChoice:      boolean;
  choiceIdx:     number;
}

// ── shatter particle ────────────────────────────────────────────────────────────

interface _Particle {
  mesh:  THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  vx:    number;
  vy:    number;
  age:   number;
  ttl:   number;
}

// ── class ─────────────────────────────────────────────────────────────────────

export class FloatingDialogue3D {
  private readonly _scene:    THREE.Scene;
  private readonly _camera:   THREE.Camera;
  private readonly _renderer: THREE.WebGLRenderer;

  // Speech floats near the wizard's head; choices hang close in front of the player
  private readonly _speechGroup = new THREE.Group();
  private readonly _choiceGroup = new THREE.Group();
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _mouse     = new THREE.Vector2();

  private _meshes:        _Rec[]   = [];
  private _hoveredMesh:   THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private _resolveChoice: ((idx: number) => void) | null = null;
  private _isDragging  = false;
  private _dragStartX  = 0;
  private _dragStartY  = 0;

  // Shatter particles (spawned on choice click)
  private _particles: _Particle[] = [];
  private _prevTime   = -1;

  // DOM blackout div for scene fade transitions
  private readonly _root:     HTMLElement;
  private readonly _blackout: HTMLElement;

  constructor(opts: {
    scene:    THREE.Scene;
    camera:   THREE.Camera;
    renderer: THREE.WebGLRenderer;
  }) {
    this._scene    = opts.scene;
    this._camera   = opts.camera;
    this._renderer = opts.renderer;

    // Speech appears above/beside the wizard (wizard at x=1,y=0,z=-2; head ~y=2)
    this._speechGroup.position.set(0.7, 2.4, 0.0);
    // Choices hang very close to the camera — feel within arm's reach
    this._choiceGroup.position.set(0, 1.4, 3.8);

    this._root = document.createElement('div');
    this._root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100;';
    this._blackout = document.createElement('div');
    this._blackout.style.cssText =
      'position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1.2s linear;';
    this._root.appendChild(this._blackout);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    container.style.position = container.style.position || 'relative';
    container.appendChild(this._root);
    this._scene.add(this._speechGroup);
    this._scene.add(this._choiceGroup);
    const c = this._renderer.domElement;
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('click',     this._onClick);
  }

  unmount(): void {
    this._root.remove();
    this._scene.remove(this._speechGroup);
    this._scene.remove(this._choiceGroup);
    this._disposeAll();
    const c = this._renderer.domElement;
    c.removeEventListener('mousedown', this._onMouseDown);
    c.removeEventListener('mousemove', this._onMouseMove);
    c.removeEventListener('click',     this._onClick);
  }

  // ── fade transitions ──────────────────────────────────────────────────────

  fadeIn(ms = 1200): Promise<void> {
    return new Promise<void>((resolve) => {
      this._blackout.style.transition = 'none';
      this._blackout.style.opacity    = '1';
      requestAnimationFrame(() => {
        this._blackout.style.transition = `opacity ${ms}ms linear`;
        this._blackout.style.opacity    = '0';
        setTimeout(resolve, ms + 50);
      });
    });
  }

  fadeOut(ms = 2000): Promise<void> {
    return new Promise<void>((resolve) => {
      this._blackout.style.transition = `opacity ${ms}ms linear`;
      this._blackout.style.opacity    = '1';
      setTimeout(resolve, ms + 50);
    });
  }

  // ── speech ────────────────────────────────────────────────────────────────

  speak(text: string, speaker = '— The Wizard'): Promise<void> {
    return new Promise<void>((resolve) => {
      // Fade out existing speech plane
      this._meshes.filter(r => !r.isChoice).forEach(r => { r.targetOpacity = 0; });

      setTimeout(() => {
        this._purge();
        this._addSpeech(text, speaker.replace(/^[—–\-]\s*/, ''));
        // 1.5 s fade-in + 3 s reading time
        setTimeout(resolve, 4500);
      }, 700);
    });
  }

  hideSpeech(): void {
    this._meshes.filter(r => !r.isChoice).forEach(r => { r.targetOpacity = 0; });
  }

  // ── choices ───────────────────────────────────────────────────────────────

  choose(choices: string[]): Promise<number> {
    return new Promise<number>((resolve) => {
      // Fade out speech and any stale choices immediately
      this._meshes.forEach(r => { r.targetOpacity = 0; });
      this._resolveChoice = resolve;

      setTimeout(() => {
        this._purge();
        this._addChoices(choices);
      }, 700);
    });
  }

  // stubs kept for API compatibility with NewGameFlow
  showStatGain(_label: string): void { /* future: floating +stat billboard */ }

  clear(): void {
    this._meshes.forEach(r => { r.targetOpacity = 0; });
    this._resolveChoice = null;
  }

  // ── tick (call every frame) ───────────────────────────────────────────────

  tick(time: number): void {
    // Delta time (capped so a tab-switch can't explode physics)
    const dt = this._prevTime < 0 ? 0.016 : Math.min(time - this._prevTime, 0.1);
    this._prevTime = time;

    // Billboard each group independently toward the camera
    this._speechGroup.lookAt(this._camera.position);
    this._choiceGroup.lookAt(this._camera.position);

    // Gentle independent sways
    this._speechGroup.position.x = 0.7 + Math.sin(time * 0.35) * 0.03;
    this._choiceGroup.position.x =       Math.sin(time * 0.45) * 0.02;

    for (const r of this._meshes) {
      // Opacity lerp
      r.mesh.material.opacity += (r.targetOpacity - r.mesh.material.opacity) * 0.06;
      // Gentle vertical float
      r.mesh.position.y = r.baseY + Math.sin(time * 1.5 + r.phase) * 0.025;
    }

    // Shatter particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.age += dt;
      const t = p.age / p.ttl;
      p.mesh.material.opacity = 0.85 * (1 - t * t);  // ease-out
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.vy -= 0.35 * dt;  // gentle gravity
      if (p.age >= p.ttl) {
        this._choiceGroup.remove(p.mesh);
        p.mesh.material.dispose();
        p.mesh.geometry.dispose();
        this._particles.splice(i, 1);
      }
    }

    this._updateHover();
  }

  // ── private: add planes ───────────────────────────────────────────────────

  private _addSpeech(text: string, speaker: string): void {
    const tex  = this._makeSpeechTex(text, speaker);
    // Speech plane: bigger since it sits far out near the wizard
    const h    = 0.90;
    const w    = h * (1024 / 256);   // 3.6 units wide
    const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.renderOrder = 999;
    const baseY = 0.0;
    mesh.position.set(0, baseY, 0);
    this._speechGroup.add(mesh);
    this._meshes.push({
      mesh, group: this._speechGroup, baseY, isChoice: false, choiceIdx: -1,
      targetOpacity: 1, phase: Math.random() * Math.PI * 2,
    });
  }

  private _addChoices(choices: string[]): void {
    // Choice planes: small and close — feel within arm's reach
    const cellW  = 0.40;
    const cellH  = 0.13;
    const gapX   = 0.08;
    const gapY   = 0.08;
    const cols   = 2;
    const totalW = cols * cellW + (cols - 1) * gapX;

    choices.forEach((text, idx) => {
      const col   = idx % cols;
      const row   = Math.floor(idx / cols);
      const x     = -totalW / 2 + col * (cellW + gapX) + cellW / 2;
      const baseY = -(row * (cellH + gapY)) - 0.04;

      const tex  = this._makeChoiceTex(text);
      const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cellW, cellH), mat);
      mesh.renderOrder = 999;
      mesh.position.set(x, baseY, 0);
      this._choiceGroup.add(mesh);
      this._meshes.push({
        mesh, group: this._choiceGroup, baseY, isChoice: true, choiceIdx: idx,
        targetOpacity: 1, phase: Math.random() * Math.PI * 2,
      });
    });
  }

  // ── private: canvas texture factories ────────────────────────────────────

  private _makeSpeechTex(text: string, speaker: string): THREE.CanvasTexture {
    const W = 1024, H = 256;
    const cv  = document.createElement('canvas');
    cv.width  = W; cv.height = H;
    const ctx = cv.getContext('2d')!;

    ctx.textAlign    = 'center';
    ctx.shadowColor  = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur   = 12;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

    // Speaker name
    ctx.font        = 'bold 22px "Segoe UI",sans-serif';
    ctx.fillStyle   = '#ffaa00';
    ctx.textBaseline = 'top';
    ctx.fillText(speaker.toUpperCase(), W / 2, 14);

    // Word-wrapped italic dialogue text
    ctx.font        = 'italic 37px "Georgia",serif';
    ctx.fillStyle   = 'rgba(255,255,255,0.95)';
    ctx.textBaseline = 'top';
    const lines = this._wrap(ctx, text, 940);
    lines.forEach((line, i) => ctx.fillText(line, W / 2, 62 + i * 54));

    return this._tex(cv);
  }

  private _makeChoiceTex(text: string): THREE.CanvasTexture {
    const W = 512, H = 160;
    const cv  = document.createElement('canvas');
    cv.width  = W; cv.height = H;
    const ctx = cv.getContext('2d')!;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 8;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    ctx.font         = '27px "Segoe UI",sans-serif';
    ctx.fillStyle    = 'rgba(205,205,205,0.92)';

    const lines  = this._wrap(ctx, text, 480);
    const startY = H / 2 - ((lines.length - 1) * 33) / 2;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * 33));

    return this._tex(cv);
  }

  private _tex(cv: HTMLCanvasElement): THREE.CanvasTexture {
    const t    = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  private _wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── private: cleanup ─────────────────────────────────────────────────────

  private _purge(): void {
    for (let i = this._meshes.length - 1; i >= 0; i--) {
      const r = this._meshes[i];
      if (r.targetOpacity === 0 && r.mesh.material.opacity < 0.08) {
        r.group.remove(r.mesh);
        r.mesh.material.map?.dispose();
        r.mesh.material.dispose();
        r.mesh.geometry.dispose();
        this._meshes.splice(i, 1);
      }
    }
  }

  private _disposeAll(): void {
    for (const r of this._meshes) {
      r.group.remove(r.mesh);
      r.mesh.material.map?.dispose();
      r.mesh.material.dispose();
      r.mesh.geometry.dispose();
    }
    for (const p of this._particles) {
      this._choiceGroup.remove(p.mesh);
      p.mesh.material.dispose();
      p.mesh.geometry.dispose();
    }
    this._meshes        = [];
    this._particles     = [];
    this._resolveChoice = null;
    this._hoveredMesh   = null;
  }

  // ── private: pointer events ───────────────────────────────────────────────

  private _updateHover(): void {
    if (this._isDragging) {
      if (this._hoveredMesh) {
        this._hoveredMesh.material.color.setHex(0xffffff);
        this._hoveredMesh = null;
        this._renderer.domElement.style.cursor = 'default';
      }
      return;
    }
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const targets = this._meshes
      .filter(r => r.isChoice && r.mesh.material.opacity > 0.4)
      .map(r => r.mesh);
    const hits = this._raycaster.intersectObjects(targets);

    const next = hits.length
      ? hits[0].object as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
      : null;

    if (next !== this._hoveredMesh) {
      if (this._hoveredMesh) this._hoveredMesh.material.color.setHex(0xffffff);
      if (next)              next.material.color.setHex(0xffaa00);
      this._renderer.domElement.style.cursor = next ? 'pointer' : 'default';
      this._hoveredMesh = next;
    }
  }

  private _onMouseDown = (e: MouseEvent): void => {
    this._isDragging = false;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
  };

  private _onMouseMove = (e: MouseEvent): void => {
    if (Math.hypot(e.clientX - this._dragStartX, e.clientY - this._dragStartY) > 4) {
      this._isDragging = true;
    }
    const c = this._renderer.domElement;
    this._mouse.set(
       (e.clientX / c.clientWidth)  * 2 - 1,
      -(e.clientY / c.clientHeight) * 2 + 1,
    );
  };

  private _onClick = (): void => {
    if (this._isDragging) { this._isDragging = false; return; }
    this._isDragging = false;
    if (!this._hoveredMesh || !this._resolveChoice) return;
    const rec = this._meshes.find(r => r.mesh === this._hoveredMesh);
    if (!rec?.isChoice) return;

    const idx       = rec.choiceIdx;
    const resolve   = this._resolveChoice;
    const clickedMesh = rec.mesh;
    this._resolveChoice = null;
    this._hoveredMesh   = null;
    this._renderer.domElement.style.cursor = 'default';

    this._spawnShatter(clickedMesh);
    this._meshes.filter(r => r.isChoice).forEach(r => { r.targetOpacity = 0; });
    setTimeout(() => { this._purge(); resolve(idx); }, 380);
  };

  private _spawnShatter(clicked: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>): void {
    const COUNT = 14;
    const w  = clicked.geometry.parameters.width;
    const h  = clicked.geometry.parameters.height;
    const cx = clicked.position.x;
    const cy = clicked.position.y;

    for (let i = 0; i < COUNT; i++) {
      const size   = 0.010 + Math.random() * 0.018;
      const aspect = 0.3 + Math.random() * 1.5;
      const mat    = new THREE.MeshBasicMaterial({
        color:       Math.random() < 0.35 ? 0xffbb44 : 0xffffff,
        transparent: true, opacity: 0.85,
        depthWrite:  false, depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * aspect), mat);
      mesh.renderOrder = 1000;
      // Start scattered within the card's face
      mesh.position.set(
        cx + (Math.random() - 0.5) * w * 0.7,
        cy + (Math.random() - 0.5) * h * 0.7,
        0.005,
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.15 + Math.random() * 0.45;
      const ttl   = 0.45 + Math.random() * 0.25;
      this._choiceGroup.add(mesh);
      this._particles.push({
        mesh,
        vx:  Math.cos(angle) * speed,
        vy:  Math.sin(angle) * speed * 0.7 + 0.08,
        age: 0,
        ttl,
      });
    }
  }
}
