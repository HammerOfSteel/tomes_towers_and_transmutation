/**
 * NewGameScene — first-person campfire scene for the narrative character creation.
 *
 * Aesthetic: near-total darkness broken only by warm campfire light.
 * A few cold stars overhead. Dense forest silhouettes. The player sits
 * on a log; the wizard stands across the fire.
 *
 * Camera is at seated eye-height (1.1 m), looking across the fire at
 * approximately face height. A gentle sine-wave "breathe" prevents
 * the scene from feeling static.
 *
 * Campfire is the ONLY significant light source. No sky, no HDR,
 * no ambient fill to speak of — just the fire.
 */

import * as THREE                from 'three';
import { GLTFLoader }            from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }           from 'three/addons/loaders/DRACOLoader.js';
import type { GLTF }             from 'three/addons/loaders/GLTFLoader.js';
import type { WizardDef }        from '@/characters/wizardManifest';
import { loadWizard }            from '@/characters/WizardLoader';
import type { LoadedWizard }     from '@/characters/WizardLoader';

// ── constants ─────────────────────────────────────────────────────────────────

// The Blender campfire env was exported with the campfire sticks centred near
// (1.87, 0.03, 1.54) in GLTF/Three.js space.  We translate the loaded group
// by ENV_OFFSET so the fire sits at the scene origin (0,0,0).
const ENV_OFFSET  = new THREE.Vector3(-1.87, -0.03, -1.54);

// Camera: sitting behind the fire (+Z = deeper into the scene).
// Looking from Z≈-2.74 across the fire (Z=0) toward the wizard side (Z≈2.6).
const CAM_POS   = new THREE.Vector3(0, 0.82, -2.74);
const CAM_LOOK  = new THREE.Vector3(0, 0.62,  1.26);

// Wizard positions (Z=+ is deeper into scene, away from camera)
const WIZ_IDLE  = new THREE.Vector3(0, 0, 2.6);   // resting pos across fire
const WIZ_START = new THREE.Vector3(0, 0, 11);    // enters from the dark beyond

const FIRE_COLOR  = 0xff7018;
const FIRE_POS    = new THREE.Vector3(0, 0.1, 0);

// ── fire ShaderMaterial ───────────────────────────────────────────────────────

const _fireVert = /* glsl */`
  uniform float uTime;
  varying vec2  vUv;

  // Hash-based pseudo-noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Waver strongest at tip (high uv.y), none at base
    float sway = noise(vec2(uv.y * 3.0 + uTime * 2.5, uTime * 1.3)) - 0.5;
    pos.x += sway * 0.08 * uv.y;
    pos.z += sway * 0.06 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const _fireFrag = /* glsl */`
  uniform float uTime;
  varying vec2  vUv;

  void main() {
    // Base colour: deep red at bottom → bright yellow-white at tip
    vec3 bot = vec3(0.95, 0.15, 0.02);   // deep orange-red
    vec3 mid = vec3(1.0,  0.55, 0.05);   // vivid orange
    vec3 tip = vec3(1.0,  0.95, 0.5);    // pale yellow
    vec3 col = mix(bot, mid, smoothstep(0.0, 0.5, vUv.y));
    col = mix(col, tip, smoothstep(0.4, 1.0, vUv.y));

    // Alpha: full at base, fade to nothing at tip; also vignette the sides
    float sideAlpha = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0);
    float alpha = sideAlpha * (1.0 - smoothstep(0.6, 1.0, vUv.y));

    gl_FragColor = vec4(col, alpha);
  }
`;

// ── main class ────────────────────────────────────────────────────────────────

export class NewGameScene {
  private _renderer:  THREE.WebGLRenderer;
  private _scene:     THREE.Scene;
  private _camera:    THREE.PerspectiveCamera;
  private _canvas:    HTMLCanvasElement;

  // Campfire
  private _fireMeshes: THREE.Mesh[]   = [];
  private _fireLight:  THREE.PointLight;
  private _embers:     THREE.Points;

  // Wizard
  private _wizard:         LoadedWizard | null = null;

  // Camera breathe + nod
  private _breatheT        = 0;
  private _nodOffset        = 0;
  private _nodVel           = 0;

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
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this._canvas = this._renderer.domElement;

    // ── scene ─────────────────────────────────────────────────────────────────
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x020408);  // near-black, slight blue

    // ── camera ────────────────────────────────────────────────────────────────
    this._camera = new THREE.PerspectiveCamera(65, 1, 0.1, 80);
    this._camera.position.copy(CAM_POS);
    this._camera.lookAt(CAM_LOOK);

    // ── synchronous scene elements ────────────────────────────────────────────
    // (GLB environment loaded async via initEnvironment())
    this._buildStars();
    this._buildCampfire();

    // Cache references set in _buildCampfire
    this._fireLight = this._scene.children.find(
      c => c instanceof THREE.PointLight,
    ) as THREE.PointLight;

    this._embers = this._scene.children.find(
      c => c instanceof THREE.Points,
    ) as THREE.Points;
  }

  // ── async environment loader ───────────────────────────────────────────────

  /**
   * Loads the Blender-exported campfire environment GLB.
   * Call this before mount() for best results, or it streams in after mount.
   */
  async initEnvironment(): Promise<void> {
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.load('/assets/intro/campfire_env.glb', resolve, undefined, reject);
    });
    draco.dispose();

    const env = gltf.scene;
    // Re-centre so the campfire sticks sit at scene origin (0,0,0)
    env.position.copy(ENV_OFFSET);

    env.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
      }
    });

    this._scene.add(env);

    // Load the forest backdrop (forest_2 GLTF) — ring it around the fire
    await this._loadForestBackdrop(loader);
  }

  private async _loadForestBackdrop(loader: GLTFLoader): Promise<void> {
    let gltf: GLTF;
    try {
      gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.load('/assets/intro/forest_2/scene.gltf', resolve, undefined, reject);
      });
    } catch {
      // Forest is optional — fall back to procedural silhouettes
      this._buildForest();
      return;
    }

    const src = gltf.scene;
    // Place 6 rotated copies around the fire at radius ~9
    const radius = 9;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const clone = src.clone(true);
      clone.scale.setScalar(0.35);
      clone.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
      clone.rotation.y = -angle;
      this._scene.add(clone);
    }
  }

  private _buildStars(): void {
    // Sparse, cold — just a hint of the sky. Only visible above tree canopy.
    const count = 500;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Hemisphere distribution
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI * 0.5;  // upper hemisphere only
      const r     = 35;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb0c0ff,
      size:  0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
    });
    this._scene.add(new THREE.Points(geo, mat));
  }

  private _buildCampfire(): void {
    const fireMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader:   _fireVert,
      fragmentShader: _fireFrag,
      transparent:  true,
      depthWrite:   false,
      side:         THREE.DoubleSide,
    });

    // Three flame layers — different sizes/phases, staggered azimuth
    const layers = [
      { rTop: 0.01, rBot: 0.22, h: 0.55, y: 0.08 },   // outer base
      { rTop: 0.01, rBot: 0.15, h: 0.80, y: 0.05 },   // mid
      { rTop: 0.01, rBot: 0.08, h: 1.05, y: 0.03 },   // inner tall
    ];
    for (const l of layers) {
      const geo  = new THREE.ConeGeometry(l.rBot, l.h, 8, 6, true);
      // Flip so wide end is at bottom (ConeGeometry tip points +Y by default)
      geo.rotateX(Math.PI);
      // Re-center so base (wide end) sits at y=0 of the mesh
      geo.translate(0, l.h / 2, 0);
      const mesh = new THREE.Mesh(geo, fireMat.clone());
      mesh.position.set(FIRE_POS.x, FIRE_POS.y + l.y, FIRE_POS.z);
      this._scene.add(mesh);
      this._fireMeshes.push(mesh);
    }

    // Base ember glow disc
    const discGeo = new THREE.CircleGeometry(0.28, 12);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true, opacity: 0.7,
    });
    this._scene.add(new THREE.Mesh(discGeo, discMat));

    // PointLight — the only real illumination
    const pl = new THREE.PointLight(FIRE_COLOR, 3.2, 14, 2);
    pl.position.set(FIRE_POS.x, FIRE_POS.y + 0.45, FIRE_POS.z);
    pl.castShadow = true;
    pl.shadow.mapSize.set(512, 512);
    pl.shadow.camera.near = 0.2;
    pl.shadow.camera.far  = 14;
    this._scene.add(pl);

    // Ascending embers
    const eCount = 35;
    const ePos   = new Float32Array(eCount * 3);
    for (let i = 0; i < eCount; i++) {
      ePos[i * 3]     = (Math.random() - 0.5) * 0.4;
      ePos[i * 3 + 1] = Math.random() * 1.2;
      ePos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const eMat = new THREE.PointsMaterial({
      color: 0xffaa33, size: 0.035, sizeAttenuation: true,
      transparent: true, opacity: 0.8,
    });
    this._scene.add(new THREE.Points(eGeo, eMat));

    // Very faint warm ambient so the ground doesn't go pure black
    const ambient = new THREE.AmbientLight(0x100806, 0.06);
    this._scene.add(ambient);
  }

  /** Fallback forest — dark silhouettes used only if forest_2 GLTF fails to load. */
  private _buildForest(): void {
    const trunkMat  = new THREE.MeshBasicMaterial({ color: 0x030203 });
    const canopyMat = new THREE.MeshBasicMaterial({ color: 0x030403 });

    const rings = [
      { count: 10, radius: 7.5, heightRange: [3.0, 5.0] as [number, number] },
      { count: 14, radius: 11,  heightRange: [4.0, 7.0] as [number, number] },
    ];

    const rand = (min: number, max: number, seed: number) =>
      min + ((Math.sin(seed * 127.31 + 54.3) * 0.5 + 0.5) * (max - min));

    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        const angle  = (i / ring.count) * Math.PI * 2 + ring.radius * 0.07;
        const h      = rand(...ring.heightRange, i + ring.radius);
        const xOff   = rand(-0.6, 0.6, i * 3.7);
        const zOff   = rand(-0.6, 0.6, i * 2.1);
        const x      = Math.cos(angle) * ring.radius + xOff;
        const z      = Math.sin(angle) * ring.radius + zOff;

        const trunkH = h * 0.45;
        const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, trunkH, 5), trunkMat);
        trunk.position.set(x, trunkH / 2, z);

        const canopyH = h * 0.65;
        const canopy  = new THREE.Mesh(new THREE.ConeGeometry(rand(0.9, 1.6, i * 5.3), canopyH, 6), canopyMat);
        canopy.position.set(x, trunkH + canopyH * 0.42, z);

        this._scene.add(trunk, canopy);
      }
    }
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

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(container);
    this._resize();

    this._clock.start();
    this._startRAF();
  }

  unmount(): void {
    this._stopRAF();
    this._clock.stop();
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
    // Camera is at -Z; wizard approaches from +Z, so face toward camera (-Z)
    // Most Meshy.ai models default to facing -Z; if the wizard appears backwards,
    // flip this to Math.PI.
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

      // Face away from camera (back toward +Z / darkness)
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

    // ── fire flicker ──────────────────────────────────────────────────────────
    if (this._fireLight) {
      const flicker = 2.4 + Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.7) * 0.3
                        + Math.sin(t * 17.1) * 0.15;
      this._fireLight.intensity = flicker;
    }

    // Update fire shader uniforms
    for (const mesh of this._fireMeshes) {
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms['uTime'].value = t;
    }

    // ── embers ────────────────────────────────────────────────────────────────
    if (this._embers) {
      const pos = (this._embers.geometry as THREE.BufferGeometry)
        .getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const EMBER_SPEED = 0.22;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3 + 1] += EMBER_SPEED * dt;
        if (arr[i * 3 + 1] > 1.4) {
          arr[i * 3 + 1] = 0;
          arr[i * 3]     = (Math.random() - 0.5) * 0.3;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
      }
      pos.needsUpdate = true;
    }

    // ── wizard mixer ──────────────────────────────────────────────────────────
    this._wizard?.mixer.update(dt);

    // ── camera breathe ────────────────────────────────────────────────────────
    this._breatheT += dt;
    const breatheY = Math.sin(this._breatheT * 0.23 * Math.PI * 2) * 0.006;
    const breatheX = Math.sin(this._breatheT * 0.173 * Math.PI * 2) * 0.003;

    // ── camera nod (spring) ───────────────────────────────────────────────────
    const stiffness = 180, damping = 14;
    const acc = -stiffness * this._nodOffset - damping * this._nodVel;
    this._nodVel    += acc * dt;
    this._nodOffset += this._nodVel * dt;
    if (Math.abs(this._nodOffset) < 0.0002 && Math.abs(this._nodVel) < 0.001) {
      this._nodOffset = 0; this._nodVel = 0;
    }

    const finalY = CAM_POS.y + breatheY + this._nodOffset;
    const finalX = CAM_POS.x + breatheX;
    this._camera.position.set(finalX, finalY, CAM_POS.z);
    this._camera.lookAt(
      CAM_LOOK.x + breatheX * 0.3,
      CAM_LOOK.y + breatheY * 0.2,
      CAM_LOOK.z,
    );

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
