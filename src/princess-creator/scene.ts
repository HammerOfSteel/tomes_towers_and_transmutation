// ── Stage: renderer, atelier set, lights, sparkles, snapshots ────────────────

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Archetype } from './types';

const BG = '#161126';

const RIM_TINT: Record<Archetype, string> = {
  human: '#ffd9a8',
  fox: '#ffb383',
  slime: '#8affe0',
  skeleton: '#8a9bff',
};

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  private rimLight: THREE.DirectionalLight;
  private sparkles: THREE.Points;
  private sparkleSeeds: Float32Array;
  private bursts: Burst[] = [];
  private setDressing: THREE.Object3D[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 34, 90);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.camera.position.set(3, 9.5, 27);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 5.4, 0);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.04;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 45;

    // PBR environment (needed for the slime's transmission to look juicy)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    pmrem.dispose();

    // ── Lights ──
    const hemi = new THREE.HemisphereLight('#4a3f66', '#191322', 0.75);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#ffeedd', 2.4);
    key.position.set(10, 18, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    const bound = 14;
    key.shadow.camera.left = -bound;
    key.shadow.camera.right = bound;
    key.shadow.camera.top = bound;
    key.shadow.camera.bottom = -bound;
    key.shadow.bias = -0.0008;
    this.scene.add(key);

    this.rimLight = new THREE.DirectionalLight(RIM_TINT.human, 1.35);
    this.rimLight.position.set(-11, 11, -11);
    this.scene.add(this.rimLight);

    // ── Set dressing ──
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1d1730', roughness: 0.95 }),
    );
    floor.position.y = -1.2;
    floor.receiveShadow = true;

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(7.4, 8.2, 1.2, 36),
      new THREE.MeshStandardMaterial({ color: '#2a2140', roughness: 0.85, flatShading: true }),
    );
    pedestal.position.y = -0.6;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.35, 0.14, 10, 64).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#e8b64c', roughness: 0.35, metalness: 0.85 }),
    );
    ring.position.y = 0.02;

    const runes = new THREE.Mesh(
      new THREE.RingGeometry(5.6, 6.1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#5e4a9e', transparent: true, opacity: 0.35 }),
    );
    runes.position.y = 0.015;

    this.setDressing = [floor, pedestal, ring, runes];
    this.scene.add(floor, pedestal, ring, runes);

    // ── Dust sparkles ──
    const N = 70;
    const positions = new Float32Array(N * 3);
    this.sparkleSeeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 12;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.5 + Math.random() * 13;
      positions[i * 3 + 2] = Math.sin(a) * r;
      this.sparkleSeeds[i] = Math.random() * Math.PI * 2;
    }
    const sparkleGeo = new THREE.BufferGeometry();
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparkles = new THREE.Points(sparkleGeo, new THREE.PointsMaterial({
      color: '#ffe9b0', size: 0.14, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.sparkles);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setArchetypeMood(archetype: Archetype): void {
    this.rimLight.color.set(RIM_TINT[archetype]);
  }

  /** Re-frame the camera on archetype swaps (keeps user orbit otherwise). */
  frame(): void {
    this.controls.target.set(0, 5.4, 0);
    this.camera.position.set(3, 9.5, 27);
  }

  focusFace(): void {
    this.controls.target.set(0, 8.6, 0);
    this.camera.position.set(0, 9.2, 13);
  }

  /** Firework of gold sparkles for the 'cast' emote. */
  castBurst(): void {
    const N = 26;
    const positions = new Float32Array(N * 3);
    const velocities = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 6.5;
      positions[i * 3 + 2] = 2.5;
      const a = Math.random() * Math.PI * 2;
      const up = 2 + Math.random() * 5;
      velocities[i * 3] = Math.cos(a) * (1.5 + Math.random() * 3);
      velocities[i * 3 + 1] = up;
      velocities[i * 3 + 2] = Math.sin(a) * (1.5 + Math.random() * 3) + 1.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#ffe08a', size: 0.28, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(points);
    this.bursts.push({ points, velocities, age: 0 });
  }

  update(t: number, dt: number): void {
    this.controls.update();
    this.sparkles.rotation.y = t * 0.03;
    const pos = this.sparkles.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(t * 0.8 + this.sparkleSeeds[i]) * 0.004);
    }
    pos.needsUpdate = true;

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const bp = b.points.geometry.attributes.position;
      for (let j = 0; j < bp.count; j++) {
        bp.setXYZ(
          j,
          bp.getX(j) + b.velocities[j * 3] * dt,
          bp.getY(j) + (b.velocities[j * 3 + 1] - b.age * 9) * dt,
          bp.getZ(j) + b.velocities[j * 3 + 2] * dt,
        );
      }
      bp.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / 0.9);
      if (b.age > 0.9) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Offscreen-ish snapshot using the live renderer (preserveDrawingBuffer on).
   * `portrait` hides set dressing + background for a transparent hero shot.
   */
  snapshot(size: number, portrait: boolean): string {
    const canvas = this.renderer.domElement;
    const prevW = canvas.width;
    const prevH = canvas.height;
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevAspect = this.camera.aspect;
    const prevPos = this.camera.position.clone();
    const prevTarget = this.controls.target.clone();

    if (portrait) {
      this.scene.background = null;
      this.scene.fog = null;
      for (const o of this.setDressing) o.visible = false;
      this.sparkles.visible = false;
      this.camera.position.set(2.2, 8.8, 22);
      this.controls.target.set(0, 5.6, 0);
      this.camera.lookAt(0, 5.6, 0);
    }

    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    if (portrait) this.camera.lookAt(0, 5.6, 0);
    this.renderer.render(this.scene, this.camera);
    const url = canvas.toDataURL('image/png');

    // restore
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    for (const o of this.setDressing) o.visible = true;
    this.sparkles.visible = true;
    this.camera.position.copy(prevPos);
    this.controls.target.copy(prevTarget);
    this.renderer.setSize(prevW, prevH, false);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    return url;
  }
}
