/**
 * NewGameScene — first-person campfire scene for the narrative character creation.
 *
 * Aesthetic: cozy toy/diorama style ported from the POC HTML.
 * MeshPhysicalMaterial with clearcoat gives everything that glossy miniature look.
 * Moonlit forest clearing with procedural trees, drifting clouds, twinkling stars.
 * Campfire has a ring of stones, logs, and scale-shrink flame particles.
 *
 * Camera sits at the fire (+Z) looking across toward the wizard who enters
 * from the deep forest (-Z direction).
 */

import * as THREE            from 'three';
import type { WizardDef }    from '@/characters/wizardManifest';
import { loadWizard }        from '@/characters/WizardLoader';
import type { LoadedWizard } from '@/characters/WizardLoader';

// ── constants ─────────────────────────────────────────────────────────────────

// Camera: seated beside the fire at +Z, looking across toward -Z (forest)
const CAM_POS     = new THREE.Vector3(0, 1.5, 4.5);
// Default Three.js camera faces -Z — no explicit lookAt needed.

// Wizard: approaches from deep forest (-Z), stops to the right of the fire
const WIZ_IDLE    = new THREE.Vector3(1.0, 0, -2.0);  // right of fire, across from camera
const WIZ_START   = new THREE.Vector3(1.0, 0, -11);   // deep in the dark forest

const SCENE_COLOR = 0x05071a;  // deep night blue (matches POC)
const FIRE_COLOR  = 0xff7700;

// ── main class ────────────────────────────────────────────────────────────────

export class NewGameScene {
  private _renderer:  THREE.WebGLRenderer;
  private _scene:     THREE.Scene;
  private _camera:    THREE.PerspectiveCamera;
  private _canvas:    HTMLCanvasElement;

  // Campfire — POC style: Mesh-based scale-shrink flames
  private _fireParticles: THREE.Mesh[] = [];
  private _fireLight:     THREE.PointLight | null = null;
  private _emberMeshes:   Array<{
    mesh: THREE.Mesh; vy: number; vx: number; vz: number; life: number;
  }> = [];

  // Stars — 3 twinkling layers
  private _starSystems: Array<{
    mesh: THREE.Points; mat: THREE.PointsMaterial; phase: number;
  }> = [];

  // Drifting clouds
  private _clouds: Array<{ group: THREE.Group; speed: number }> = [];

  // Wizard
  private _wizard: LoadedWizard | null = null;

  // Camera breathe + nod
  private _breatheT  = 0;
  private _nodOffset = 0;
  private _nodVel    = 0;

  // Mouse drag look-around (POC style — direct camera.rotation manipulation)
  private _lookTgtX   = 0;
  private _lookTgtY   = 0;
  private _isDragging = false;
  private _prevMX     = 0;
  private _prevMY     = 0;
  private readonly _onMouseDown = (e: MouseEvent) => {
    this._isDragging = true;
    this._prevMX = e.clientX;
    this._prevMY = e.clientY;
  };
  private readonly _onMouseUp = () => { this._isDragging = false; };
  private readonly _onMouseMove = (e: MouseEvent) => {
    if (!this._isDragging) return;
    const dx = e.clientX - this._prevMX;
    const dy = e.clientY - this._prevMY;
    this._lookTgtY = Math.max(-1.0, Math.min(1.0,  this._lookTgtY - dx * 0.003));
    this._lookTgtX = Math.max(-0.4, Math.min(0.4,  this._lookTgtX - dy * 0.003));
    this._prevMX = e.clientX;
    this._prevMY = e.clientY;
  };

  // Clock
  private _clock            = new THREE.Clock(false);
  private _rafId:   number | null = null;
  private _container: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  // Public callback — called every frame with dt (seconds)
  onFrame?: (dt: number) => void;

  constructor() {
    // ── renderer ──────────────────────────────────────────────────────────────
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.shadowMap.enabled    = true;
    this._renderer.shadowMap.type       = THREE.PCFSoftShadowMap;
    this._renderer.outputColorSpace     = THREE.SRGBColorSpace;
    this._renderer.toneMapping          = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure  = 1.6;
    this._canvas = this._renderer.domElement;

    // ── scene ─────────────────────────────────────────────────────────────────
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(SCENE_COLOR);
    this._scene.fog = new THREE.FogExp2(SCENE_COLOR, 0.04);

    // ── camera ────────────────────────────────────────────────────────────────
    // Default facing is -Z which looks straight across the fire — perfect.
    this._camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this._camera.position.copy(CAM_POS);

    // ── synchronous scene elements ────────────────────────────────────────────
    this._buildLighting();
    this._buildStars();
    this._buildCampfire();
  }

  // ── environment (fully procedural — matches POC aesthetic) ──────────────────

  /** Builds the full POC-style world: ground, trees, grass, clouds. */
  async initEnvironment(): Promise<void> {
    this._buildGround();
    this._buildTrees();
    this._buildGrass();
    this._buildClouds();
  }

  // ── scene builders ─────────────────────────────────────────────────────────

  private _buildLighting(): void {
    // Ambient moonlight (cool blue-grey) — boosted slightly for r170 colour space
    this._scene.add(new THREE.AmbientLight(0x2a3045, 0.6));

    // Directional moonlight — soft blue, casts shadows
    const moon = new THREE.DirectionalLight(0x4a5b82, 0.6);
    moon.position.set(-10, 15, -10);
    moon.castShadow = true;
    moon.shadow.mapSize.width  = 1024;
    moon.shadow.mapSize.height = 1024;
    moon.shadow.camera.near   = 0.5;
    moon.shadow.camera.far    = 50;
    moon.shadow.camera.left   = -15;
    moon.shadow.camera.right  = 15;
    moon.shadow.camera.top    = 15;
    moon.shadow.camera.bottom = -15;
    this._scene.add(moon);
  }

  private _buildStars(): void {
    // 3 independent twinkling layers (450 stars total)
    for (let j = 0; j < 3; j++) {
      const count = 150;
      const pos   = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        pos[i]     = (Math.random() - 0.5) * 150;
        pos[i + 1] = Math.random() * 50 + 20;       // high up, above clouds
        pos[i + 2] = (Math.random() - 0.5) * 100 - 20;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.15 + Math.random() * 0.1,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Points(geo, mat);
      this._scene.add(mesh);
      this._starSystems.push({ mesh, mat, phase: Math.random() * Math.PI * 2 });
    }
  }

  private _buildCampfire(): void {
    const campfireGroup = new THREE.Group();
    this._scene.add(campfireGroup);

    // MeshPhysicalMaterial helper — the "toy/clay" clearcoat aesthetic
    const toyMat = (
      color: number, roughness = 0.5, clearcoat = 0.2,
      emissive: number = 0, flatShading = false,
    ) => new THREE.MeshPhysicalMaterial({
      color, emissive, roughness, metalness: 0.05,
      clearcoat, clearcoatRoughness: 0.3, flatShading,
    });

    // Stone ring
    const stoneGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const stoneMat = toyMat(0x5a5c60, 0.7, 0.1, 0, true);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(Math.cos(angle) * 0.9, 0.1, Math.sin(angle) * 0.9);
      stone.scale.set(1, 0.7 + Math.random() * 0.3, 1 + Math.random() * 0.2);
      stone.rotation.set(0, Math.random() * Math.PI, Math.random() * 0.5);
      stone.castShadow = stone.receiveShadow = true;
      campfireGroup.add(stone);
    }

    // Logs
    const logGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 8);
    const logMat = toyMat(0x3d2314, 0.8, 0.1, 0, false);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const log   = new THREE.Mesh(logGeo, logMat);
      log.position.set(Math.cos(angle) * 0.3, 0.2, Math.sin(angle) * 0.3);
      log.rotation.x = Math.PI / 2 - 0.3;
      log.rotation.z = angle;
      log.castShadow = log.receiveShadow = true;
      campfireGroup.add(log);
    }

    // Fire particles — scale-shrink style (same as POC)
    const flameGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const matBase  = toyMat(0xff5500, 0.2, 0.5, 0xff2200);
    const matTip   = toyMat(0xffaa00, 0.2, 0.5, 0xff8800);
    for (let i = 0; i < 15; i++) {
      const flame = new THREE.Mesh(flameGeo, Math.random() > 0.5 ? matBase : matTip);
      flame.position.set(
        (Math.random() - 0.5) * 0.6,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 0.6,
      );
      flame.userData = {
        speed:       0.02 + Math.random() * 0.03,
        wobbleSpeed: 2    + Math.random() * 3,
        wobbleOff:   Math.random() * Math.PI * 2,
        maxLife:     1.5  + Math.random(),
      };
      campfireGroup.add(flame);
      this._fireParticles.push(flame);
    }

    // Embers — small box meshes that drift upward
    const emberGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(emberGeo, emberMat);
      mesh.position.set(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 1.5,
      );
      this._scene.add(mesh);
      this._emberMeshes.push({
        mesh,
        vy: 0.01 + Math.random() * 0.03,
        vx: (Math.random() - 0.5) * 0.02,
        vz: (Math.random() - 0.5) * 0.02,
        life: Math.random() * 100,
      });
    }

    // Fire point light — stronger than POC base to compensate for r170 colour space
    const pl = new THREE.PointLight(FIRE_COLOR, 4.5, 20);
    pl.position.set(0, 1, 0);
    pl.castShadow = true;
    pl.shadow.mapSize.set(512, 512);
    this._scene.add(pl);
    this._fireLight = pl;

    // Warm fill from camera side — simulates fire glow on the player/wizard side
    const fill = new THREE.PointLight(0xff6600, 1.5, 22);
    fill.position.set(0, 2, 5);
    this._scene.add(fill);
  }

  private _buildGround(): void {
    const groundBump = this._makeGroundTexture();
    const groundMat  = new THREE.MeshPhysicalMaterial({
      color: 0x1a2e1d, roughness: 0.8, metalness: 0.05,
      bumpMap: groundBump, bumpScale: 0.05,
    });
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 2, 32), groundMat);
    ground.position.y = -1;
    ground.receiveShadow = true;
    this._scene.add(ground);

    // Uneven mounds
    for (let i = 0; i < 15; i++) {
      const mound = new THREE.Mesh(
        new THREE.SphereGeometry(Math.random() * 2 + 1, 16, 16),
        groundMat,
      );
      mound.position.set(
        (Math.random() - 0.5) * 30,
        -0.5 - Math.random() * 1.5,
        (Math.random() - 0.5) * 30,
      );
      mound.scale.y = 0.3;
      mound.receiveShadow = true;
      this._scene.add(mound);
    }
  }

  private _buildTrees(): void {
    const woodBump    = this._makeWoodTexture();
    const leafGeo     = new THREE.DodecahedronGeometry(1.2, 0);
    const trunkGeo    = new THREE.CylinderGeometry(0.2, 0.4, 2.5, 6);
    const woodMat     = new THREE.MeshPhysicalMaterial({
      color: 0x3d2314, roughness: 0.8, metalness: 0.05,
      bumpMap: woodBump, bumpScale: 0.03, clearcoat: 0.1, clearcoatRoughness: 0.3,
    });
    const leafBaseMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f301d, roughness: 0.6, metalness: 0.05,
      clearcoat: 0.2, clearcoatRoughness: 0.3, flatShading: true,
    });

    for (let i = 0; i < 120; i++) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 5 + Math.random() * 35;
      if (radius < 10) continue;
      if (radius < 22 && angle > -1.5 && angle < 1.5) continue;

      const scale = 0.6 + Math.random() * 0.8;
      const tree  = new THREE.Group();

      const trunk = new THREE.Mesh(trunkGeo, woodMat);
      trunk.position.y = 1.25;
      trunk.castShadow = trunk.receiveShadow = true;
      tree.add(trunk);

      // Canopy made of 4 overlapping dodecahedra (chunky toy-tree look)
      const leafMat = leafBaseMat.clone();
      const hv = (Math.random() - 0.5) * 0.08;
      leafMat.color.offsetHSL(hv, 0, hv * 0.5);

      const canopy = new THREE.Group();
      canopy.position.y = 2.8;
      const offsets: Array<[number, number, number, number]> = [
        [0, 0, 0, 1], [0.7, -0.6, 0.6, 0.8], [-0.7, -0.4, -0.3, 0.9], [0, 1.1, 0, 0.7],
      ];
      for (const [cx, cy, cz, cs] of offsets) {
        const c = new THREE.Mesh(leafGeo, leafMat);
        c.position.set(cx, cy, cz);
        c.scale.setScalar(cs);
        c.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        c.castShadow = c.receiveShadow = true;
        canopy.add(c);
      }
      tree.add(canopy);
      tree.position.set(Math.sin(angle) * radius, -0.2, Math.cos(angle) * radius - 4);
      tree.scale.setScalar(scale);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this._scene.add(tree);
    }
  }

  private _buildGrass(): void {
    const grassGeo = new THREE.ConeGeometry(0.06, 0.4, 4);
    grassGeo.translate(0, 0.2, 0);
    const grassMat = new THREE.MeshPhysicalMaterial({
      color: 0x274a27, roughness: 0.7, clearcoat: 0.1,
      clearcoatRoughness: 0.3, flatShading: true,
    });
    for (let i = 0; i < 60; i++) {
      const tuft   = new THREE.Group();
      const blades = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < blades; b++) {
        const blade = new THREE.Mesh(grassGeo, grassMat);
        blade.rotation.z = (Math.random() - 0.5) * 0.5;
        blade.rotation.x = (Math.random() - 0.5) * 0.5;
        blade.rotation.y = Math.random() * Math.PI;
        blade.scale.setScalar(0.5 + Math.random() * 0.8);
        tuft.add(blade);
      }
      const angle  = Math.random() * Math.PI * 2;
      const radius = 2 + Math.random() * 12;
      tuft.position.set(Math.sin(angle) * radius, -0.1, Math.cos(angle) * radius);
      this._scene.add(tuft);
    }
  }

  private _buildClouds(): void {
    const cloudGeo = new THREE.DodecahedronGeometry(3, 0);
    const cloudMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a354a, roughness: 1.0, flatShading: true,
      emissive: 0x080c14,
    });
    for (let i = 0; i < 12; i++) {
      const group  = new THREE.Group();
      const clumps = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < clumps; j++) {
        const clump = new THREE.Mesh(cloudGeo, cloudMat);
        clump.position.set(
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 4,
        );
        clump.scale.setScalar(0.5 + Math.random() * 0.8);
        clump.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(clump);
      }
      group.scale.set(1, 0.4, 1);
      group.position.set(
        (Math.random() - 0.5) * 120,
        25 + Math.random() * 10,
        (Math.random() - 0.5) * 80 - 10,
      );
      this._scene.add(group);
      this._clouds.push({ group, speed: 0.003 + Math.random() * 0.007 });
    }
  }

  // ── procedural textures ────────────────────────────────────────────────────

  private _makeWoodTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 300; i++) {
      ctx.globalAlpha = Math.random() * 0.4;
      ctx.fillRect(Math.random() * 256, 0, Math.random() * 4, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private _makeGroundTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#444';
      ctx.globalAlpha = Math.random() * 0.3;
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ── public API ─────────────────────────────────────────────────────────────

  mount(container: HTMLElement): void {
    this._container = container;
    this._canvas.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      display: block; z-index: 0;
    `;
    container.appendChild(this._canvas);

    this._canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup',   this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    this._clock.start();
    this._startRAF();
  }

  unmount(): void {
    this._stopRAF();
    this._clock.stop();
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup',   this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    this._isDragging = false;
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._canvas.remove();
    // Do NOT call renderer.dispose() — scene is fully self-contained
    // Caller should call dispose() explicitly when done.
    this._container = null;
  }

  dispose(): void {
    this._stopRAF();
    this._renderer.dispose();
  }

  async loadWizard(def: WizardDef): Promise<void> {
    const w = await loadWizard(def);
    this._wizard = w;
    w.group.position.copy(WIZ_START);
    // Meshy.ai models have +Z as visual forward. Camera is at +Z side so
    // rotation.y = 0 makes the wizard face the camera. This also means
    // walking from WIZ_START to WIZ_IDLE (movement in +Z) is forward. ✓
    w.group.rotation.y = 0;
    this._scene.add(w.group);
  }

  /**
   * Walk the wizard from start position to idle position.
   * Plays Walk clip during movement, crossfades to Idle on arrival.
   * Resolves when the wizard is fully in idle.
   */
  runEnterSequence(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this._wizard) { resolve(); return; }
      const { mixer, walkClip, idleClip } = this._wizard;

      const walkAction = mixer.clipAction(walkClip);
      walkAction.setLoop(THREE.LoopRepeat, Infinity);
      walkAction.play();

      const WALK_DURATION = 4.2;  // seconds to cross the distance

      const onDone = () => {
        // Crossfade walk → idle
        const idleAction = mixer.clipAction(idleClip);
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.play();
        walkAction.crossFadeTo(idleAction, 0.4, true);

        this._wizard!.group.position.copy(WIZ_IDLE);

        setTimeout(() => resolve(), 500);
      };

      // Drive the walk progress via _tick
      let elapsed = 0;
      const origOnFrame = this.onFrame;
      this.onFrame = (dt) => {
        elapsed += dt;
        origOnFrame?.(dt);
        const t = Math.min(elapsed / WALK_DURATION, 1);
        this._wizard!.group.position.lerpVectors(WIZ_START, WIZ_IDLE, _easeInOut(t));
        if (t >= 1) {
          this.onFrame = origOnFrame;
          onDone();
        }
      };
    });
  }

  /**
   * Walk the wizard back into the darkness.
   * Resolves when fully gone.
   */
  runExitSequence(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this._wizard) { resolve(); return; }
      const { mixer, walkClip } = this._wizard;

      // Stop idle, start walk
      mixer.stopAllAction();
      const walkAction = mixer.clipAction(walkClip);
      walkAction.setLoop(THREE.LoopRepeat, Infinity);
      walkAction.play();

      // Face away from camera into darkness (-Z direction)
      this._wizard.group.rotation.y = Math.PI;

      const EXIT_POS = WIZ_START.clone();
      const START_POS = WIZ_IDLE.clone();
      const EXIT_DURATION = 3.5;
      let elapsed = 0;

      const origOnFrame = this.onFrame;
      this.onFrame = (dt) => {
        elapsed += dt;
        origOnFrame?.(dt);
        const t = Math.min(elapsed / EXIT_DURATION, 1);
        this._wizard!.group.position.lerpVectors(START_POS, EXIT_POS, _easeInOut(t));
        if (t >= 1) {
          this.onFrame = origOnFrame;
          resolve();
        }
      };
    });
  }

  /** Brief camera nod — simulates nodding in acknowledgement of a choice. */
  triggerNod(): void {
    this._nodOffset = -0.018;
    this._nodVel    = 0;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private _resize(): void {
    if (!this._container) return;
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    if (w === 0 || h === 0) return;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  private _startRAF(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      const dt = Math.min(this._clock.getDelta(), 0.05);
      this._tick(dt);
    };
    tick();
  }

  private _stopRAF(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _tick(dt: number): void {
    const t = this._clock.elapsedTime;

    // ── fire light flicker (POC style) ────────────────────────────────────────
    if (this._fireLight) {
      this._fireLight.intensity  = 1.8 + Math.sin(t * 15) * 0.2 + Math.random() * 0.2;
      this._fireLight.position.x = Math.sin(t * 5) * 0.05;
      this._fireLight.position.z = Math.cos(t * 6) * 0.05;
    }

    // ── fire particle animation — scale-shrink (POC style) ────────────────────
    for (const flame of this._fireParticles) {
      const d = flame.userData as {
        speed: number; wobbleSpeed: number; wobbleOff: number; maxLife: number;
      };
      flame.position.y += d.speed;
      flame.position.x  = Math.sin(t * d.wobbleSpeed + d.wobbleOff) * 0.2
                          * (flame.position.y / d.maxLife);
      flame.position.z  = Math.cos(t * d.wobbleSpeed + d.wobbleOff) * 0.2
                          * (flame.position.y / d.maxLife);
      const scale = Math.max(0, 1 - flame.position.y / d.maxLife);
      flame.scale.set(scale, scale * 1.5, scale);
      if (flame.position.y > d.maxLife) {
        flame.position.y = 0.2;
        flame.position.x = (Math.random() - 0.5) * 0.4;
        flame.position.z = (Math.random() - 0.5) * 0.4;
      }
    }

    // ── embers — box meshes drifting upward ───────────────────────────────────
    for (const e of this._emberMeshes) {
      e.mesh.position.y += e.vy;
      e.mesh.position.x += e.vx + Math.sin(t + e.life) * 0.005;
      e.mesh.position.z += e.vz;
      e.life++;
      if (e.mesh.position.y > 4) {
        e.mesh.position.set(
          (Math.random() - 0.5) * 0.5,
          0.5,
          (Math.random() - 0.5) * 0.5,
        );
      }
    }

    // ── star twinkling ────────────────────────────────────────────────────────
    for (const s of this._starSystems) {
      s.mat.opacity = 0.3 + (Math.sin(t * 1.5 + s.phase) * 0.5 + 0.5) * 0.7;
    }

    // ── cloud drifting ────────────────────────────────────────────────────────
    for (const c of this._clouds) {
      c.group.position.x += c.speed;
      if (c.group.position.x > 70) {
        c.group.position.x = -70;
        c.group.position.z = (Math.random() - 0.5) * 80 - 10;
      }
    }

    // ── wizard mixer ──────────────────────────────────────────────────────────
    this._wizard?.mixer.update(dt);

    // ── camera breathe (subtle vertical sine) ────────────────────────────────
    this._breatheT += dt;
    const breatheY = Math.sin(this._breatheT * 0.23 * Math.PI * 2) * 0.006;

    // ── camera nod (spring) ───────────────────────────────────────────────────
    const stiffness = 180, damping = 14;
    this._nodVel    += (-stiffness * this._nodOffset - damping * this._nodVel) * dt;
    this._nodOffset += this._nodVel * dt;
    if (Math.abs(this._nodOffset) < 0.0002 && Math.abs(this._nodVel) < 0.001) {
      this._nodOffset = 0; this._nodVel = 0;
    }

    // ── camera position ───────────────────────────────────────────────────────
    this._camera.position.y = CAM_POS.y + breatheY + this._nodOffset;

    // ── mouse look — direct rotation (POC style) ──────────────────────────────
    this._camera.rotation.y += (this._lookTgtY - this._camera.rotation.y) * 0.05;
    this._camera.rotation.x += (
      (this._lookTgtX + breatheY * 0.5 + this._nodOffset) - this._camera.rotation.x
    ) * 0.05;

    // ── user frame callback ───────────────────────────────────────────────────
    this.onFrame?.(dt);

    // ── render ────────────────────────────────────────────────────────────────
    this._renderer.render(this._scene, this._camera);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function _easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
